import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ZERO = new Prisma.Decimal(0);
const ELIGIBLE_ROLES = ['ALACAKLI', 'ORTAK_ALACAKLI'];

export interface ClientAccountingCaseItem {
  caseId: string;
  caseClientId: string;
  role: string;
  caseNumber: string;
  executionFileNumber: string | null;
  currency: string;
  /** Takip başlangıç tarihi (case.caseDate) ISO — Faz7-E ekstre default period fallback'i için. */
  caseOpenedAt: string | null;
}

export interface ClientPayoutListItem {
  id: string;
  caseId: string;
  caseClientId: string;
  amount: string;
  currency: string;
  status: string;
  paidAt: Date;
  paidById: string;
  note: string | null;
}

/**
 * TM3 Faz 7 read addendum — müvekkil muhasebesi READ contract'ı (mutation YOK).
 *
 * Outstanding hesabı TEK kaynak: hem POST /client-payouts (ClientPayoutService) hem
 * GET outstanding bu `computeOutstanding`'i kullanır → frontend/backend drift yok.
 * Scope her zaman tenant+case+caseClientId(+currency). clientId disposition scope DEĞİL;
 * finansal bağ caseClientId. UI bu hesabı kalıcı yapmaz (otorite backend).
 */
@Injectable()
export class ClientSettlementReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * caseClientId BU case'in eligible alacaklısı (ALACAKLI/ORTAK_ALACAKLI) + aynı tenant mı?
   * Değilse BadRequestException (foreign/wrong-role/tenant mismatch). clientId ile authz YOK.
   *
   * Çağrıldığı yerler:
   *  - ClientPayoutService.create()
   *  - ClientSettlementReadService.getOutstanding() / listPayouts()
   */
  async assertEligibleCaseClient(tenantId: string, caseId: string, caseClientId: string): Promise<void> {
    const cc = await this.prisma.caseClient.findFirst({
      where: { id: caseClientId, caseId, role: { in: ELIGIBLE_ROLES }, client: { tenantId } },
      select: { id: true },
    });
    if (!cc) {
      throw new BadRequestException('caseClientId geçersiz/yabancı veya uygun rolde değil (ALACAKLI/ORTAK_ALACAKLI)');
    }
  }

  /**
   * Outstanding payable (TEK KAYNAK, drift yok): Σ POSTED CLIENT_PAYABLE (underlying Collection
   * CONFIRMED) − Σ RECORDED ClientPayout. Scope tenant+case+caseClientId+currency.
   * HELD/CONTRACTUAL_FEE/FIRM_REIMB/OFFSET/OTHER ve BalanceLedger DAHİL DEĞİL.
   *
   * @param db PrismaService (read) veya tx (ClientPayoutService transaction içi).
   * Çağrıldığı yerler:
   *  - ClientPayoutService.create() (db=tx, advisory-lock altında)
   *  - ClientSettlementReadService.getOutstanding() (db=this.prisma)
   */
  async computeOutstanding(
    db: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    caseClientId: string,
    currency: string,
  ): Promise<Prisma.Decimal> {
    const payableLines = await db.collectionDispositionLine.findMany({
      where: {
        type: 'CLIENT_PAYABLE',
        caseClientId,
        disposition: { tenantId, caseId, currency, status: 'POSTED' },
      },
      select: { amount: true, disposition: { select: { collectionId: true } } },
    });

    const collectionIds = [...new Set(payableLines.map((l) => l.disposition.collectionId))];
    let confirmed = new Set<string>();
    if (collectionIds.length > 0) {
      const rows = await db.collection.findMany({
        where: { id: { in: collectionIds }, tenantId, caseId, status: 'CONFIRMED' },
        select: { id: true },
      });
      confirmed = new Set(rows.map((r) => r.id));
    }
    let payable = ZERO;
    for (const l of payableLines) {
      if (confirmed.has(l.disposition.collectionId)) payable = payable.plus(l.amount);
    }

    const paidAgg = await db.clientPayout.aggregate({
      _sum: { amount: true },
      where: { tenantId, caseId, caseClientId, currency, status: 'RECORDED' },
    });
    return payable.minus(paidAgg._sum.amount ?? ZERO);
  }

  /**
   * GET outstanding — caseClientId doğrula + hesapla (read).
   * Çağrıldığı yerler:
   *  - DispositionController.outstanding() → GET /collection-dispositions/case/:caseId/outstanding
   */
  async getOutstanding(
    tenantId: string,
    caseId: string,
    caseClientId: string,
    currency: string,
  ): Promise<{ caseId: string; caseClientId: string; currency: string; outstanding: string }> {
    if (!caseClientId) throw new BadRequestException('caseClientId zorunlu');
    await this.assertEligibleCaseClient(tenantId, caseId, caseClientId);
    const outstanding = await this.computeOutstanding(this.prisma, tenantId, caseId, caseClientId, currency || 'TRY');
    return { caseId, caseClientId, currency: currency || 'TRY', outstanding: outstanding.toString() };
  }

  /**
   * Müvekkilin (clientId) dosyaları + caseClientId resolve. clientId yalnız giriş bağlamı;
   * finansal scope için caseClientId döner. Yalnız tenant içi + ALACAKLI/ORTAK_ALACAKLI.
   * Çağrıldığı yerler:
   *  - ClientAccountingController.cases() → GET /clients/:clientId/accounting/cases
   */
  async listClientCases(tenantId: string, clientId: string): Promise<{ items: ClientAccountingCaseItem[] }> {
    const rows = await this.prisma.caseClient.findMany({
      where: { clientId, role: { in: ELIGIBLE_ROLES }, client: { tenantId } },
      select: {
        id: true,
        caseId: true,
        role: true,
        case: { select: { fileNumber: true, executionFileNumber: true, caseDate: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
    return {
      items: rows.map((r) => ({
        caseId: r.caseId,
        caseClientId: r.id,
        role: r.role,
        caseNumber: r.case?.fileNumber ?? '',
        executionFileNumber: r.case?.executionFileNumber ?? null,
        currency: 'TRY',
        caseOpenedAt: r.case?.caseDate ? r.case.caseDate.toISOString() : null,
      })),
    };
  }

  /**
   * ClientPayout listesi (paginated). Cross-tenant/caseClient sızıntısı yok (where her zaman tenantId).
   * Çağrıldığı yerler:
   *  - ClientPayoutController.list() → GET /client-payouts
   */
  async listPayouts(
    tenantId: string,
    filters: { caseId?: string; caseClientId?: string; currency?: string; from?: string; to?: string; page?: number; limit?: number },
  ): Promise<{ items: ClientPayoutListItem[]; page: number; limit: number; total: number }> {
    if (filters.caseId && filters.caseClientId) {
      await this.assertEligibleCaseClient(tenantId, filters.caseId, filters.caseClientId);
    }
    const where: Prisma.ClientPayoutWhereInput = { tenantId, status: 'RECORDED' };
    if (filters.caseId) where.caseId = filters.caseId;
    if (filters.caseClientId) where.caseClientId = filters.caseClientId;
    if (filters.currency) where.currency = filters.currency;
    if (filters.from || filters.to) {
      where.paidAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    const take = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const page = Math.max(Number(filters.page) || 1, 1);
    const [rows, total] = await Promise.all([
      this.prisma.clientPayout.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * take,
        take,
        select: { id: true, caseId: true, caseClientId: true, amount: true, currency: true, status: true, paidAt: true, paidById: true, note: true },
      }),
      this.prisma.clientPayout.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({ ...r, amount: r.amount.toString() })),
      page,
      limit: take,
      total,
    };
  }
}
