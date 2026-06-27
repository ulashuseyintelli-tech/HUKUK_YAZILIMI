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

/** Faz A — Genel Cari dosya kırılımı. A=müvekkile özgü, B=dosya geneli (Decimal string). */
export interface ClientCaseBreakdownItem {
  caseId: string;
  caseNumber: string;
  executionFileNumber: string | null;
  role: string;
  // A — müvekkile özgü (caseClientId / clientId scope)
  payableNet: string;
  paidToClient: string;
  expenseRequested: string;
  expensePaid: string;
  // B — dosya geneli / paylaşılan bağlam (caseId scope — müvekkile atfedilmez)
  debtorCollection: string;
  pendingDistribution: string;
  advanceBalance: string;
  /** pendingDistribution < 0 → veri tutarsızlığı (sessiz sıfırlama YOK; kontrol gerekli). */
  needsReview: boolean;
}

/**
 * Faz A — Müvekkil Genel Cari (client-level read-only projection). YENİ defter/entity YOK;
 * mevcut computeOutstanding/ClientPayout/Collection/CollectionDisposition/CaseBalance/ExpenseRequest
 * kaynaklarından client-level toplama. A grubu (müvekkile özgü) caseClientId/clientId scope;
 * B grubu (dosya geneli) DISTINCT caseId scope (çift sayma yok). Mahsup YOK (netPosition bilgi-amaçlı).
 */
export interface ClientAccountingSummary {
  clientId: string;
  currency: string;
  /** A grubu — müvekkile ÖZGÜ (temiz toplanır). */
  clientScoped: {
    payableNet: string; // Σ outstanding (caseClientId)
    paidToClient: string; // Σ ClientPayout RECORDED (caseClientId)
    expenseRequested: string; // Σ ExpenseRequest.totalAmount (clientId)
    expensePaid: string; // Σ ExpenseRequest.paidTotal (clientId)
    expenseUnpaid: string; // requested − paid
    offsettableNetPosition: string; // payableNet − expenseUnpaid — BİLGİ; defter kaydı DEĞİL
  };
  /** B grubu — DOSYA GENELİ / paylaşılan bağlam (müvekkile atfedilmez), distinct caseId toplamı. */
  caseScopedContext: {
    debtorCollection: string; // Σ CONFIRMED Collection (distinct caseId)
    pendingDistribution: string; // Σ (CONFIRMED Collection − POSTED disposition)
    advanceBalance: string; // Σ CaseBalance.balance
  };
  /** Herhangi bir dosyada pendingDistribution negatif → kontrol gerekli. */
  needsReview: boolean;
  caseBreakdown: ClientCaseBreakdownItem[];
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
   * manualReversalRequiredAt dolu POSTED disposition payout/outstanding uygunluguna dahil degil.
   * HELD/CONTRACTUAL_FEE/FIRM_REIMB/OFFSET/OTHER ve BalanceLedger DAHİL DEĞİL.
   *
   * @param db PrismaService (read) veya tx (ClientPayoutService transaction içi).
   * Çağrıldığı yerler:
   *  - ClientPayoutService.create() (db=tx, advisory-lock altında)
   *  - ClientSettlementReadService.getOutstanding() (db=this.prisma)
   *  - ClientSettlementReadService.getClientAccountingSummary() (payableNet hesaplamasi)
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
        disposition: { tenantId, caseId, currency, status: 'POSTED', manualReversalRequiredAt: null },
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

  /**
   * Faz A — Müvekkil Genel Cari (client-level read-only projection). Yeni defter YOK.
   * A grubu (müvekkile özgü): her CaseClient için computeOutstanding + ClientPayout; ExpenseRequest clientId.
   * B grubu (dosya geneli): DISTINCT caseId için Σ CONFIRMED Collection − Σ POSTED disposition + CaseBalance.
   * Çağrıldığı yerler:
   *  - ClientAccountingController.summary() → GET /clients/:clientId/accounting/summary
   */
  async getClientAccountingSummary(
    tenantId: string,
    clientId: string,
    currency = 'TRY',
  ): Promise<ClientAccountingSummary> {
    const ccRows = await this.prisma.caseClient.findMany({
      where: { clientId, role: { in: ELIGIBLE_ROLES }, client: { tenantId } },
      select: {
        id: true,
        caseId: true,
        role: true,
        case: { select: { fileNumber: true, executionFileNumber: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });

    // DISTINCT caseId → B grubu çift sayma yok (aynı dosyada birden çok CaseClient bağı olabilir).
    const distinctCaseIds = [...new Set(ccRows.map((r) => r.caseId))];

    // A grubu — caseClientId scope (her CaseClient için)
    const aByCase = new Map<string, { payableNet: Prisma.Decimal; paid: Prisma.Decimal }>();
    let totalPayableNet = ZERO;
    let totalPaid = ZERO;
    for (const cc of ccRows) {
      const payableNet = await this.computeOutstanding(this.prisma, tenantId, cc.caseId, cc.id, currency);
      const paidAgg = await this.prisma.clientPayout.aggregate({
        _sum: { amount: true },
        where: { tenantId, caseId: cc.caseId, caseClientId: cc.id, currency, status: 'RECORDED' },
      });
      const paid = paidAgg._sum.amount ?? ZERO;
      totalPayableNet = totalPayableNet.plus(payableNet);
      totalPaid = totalPaid.plus(paid);
      const prev = aByCase.get(cc.caseId) ?? { payableNet: ZERO, paid: ZERO };
      aByCase.set(cc.caseId, { payableNet: prev.payableNet.plus(payableNet), paid: prev.paid.plus(paid) });
    }

    // B grubu — DISTINCT caseId scope (dosya geneli; müvekkile atfedilmez)
    const bByCase = new Map<string, { debtorCollection: Prisma.Decimal; pendingDist: Prisma.Decimal; advance: Prisma.Decimal; needsReview: boolean }>();
    let totalDebtorCollection = ZERO;
    let totalPendingDist = ZERO;
    let totalAdvance = ZERO;
    let anyNeedsReview = false;
    for (const caseId of distinctCaseIds) {
      const collAgg = await this.prisma.collection.aggregate({
        _sum: { amount: true },
        where: { tenantId, caseId, currency, status: 'CONFIRMED' },
      });
      const debtorCollection = collAgg._sum.amount ?? ZERO;
      const dispAgg = await this.prisma.collectionDisposition.aggregate({
        _sum: { totalAmount: true },
        where: { tenantId, caseId, currency, status: 'POSTED' },
      });
      const postedDisp = dispAgg._sum.totalAmount ?? ZERO;
      const pendingDist = debtorCollection.minus(postedDisp);
      const needsReview = pendingDist.lt(ZERO); // negatif → tutarsızlık; sessiz sıfırlama YOK
      if (needsReview) anyNeedsReview = true;
      const bal = await this.prisma.caseBalance.findFirst({ where: { tenantId, caseId }, select: { balance: true } });
      const advance = bal?.balance ?? ZERO;
      bByCase.set(caseId, { debtorCollection, pendingDist, advance, needsReview });
      totalDebtorCollection = totalDebtorCollection.plus(debtorCollection);
      totalPendingDist = totalPendingDist.plus(pendingDist);
      totalAdvance = totalAdvance.plus(advance);
    }

    // Masraf — clientId scope (ExpenseRequest hem clientId hem caseId taşır → breakdown gerçek caseId).
    const expRows = await this.prisma.expenseRequest.findMany({
      where: { tenantId, clientId, status: { not: 'CANCELLED' } },
      select: { caseId: true, totalAmount: true, paidTotal: true },
    });
    let expRequested = ZERO;
    let expPaid = ZERO;
    const expByCase = new Map<string, { requested: Prisma.Decimal; paid: Prisma.Decimal }>();
    for (const e of expRows) {
      expRequested = expRequested.plus(e.totalAmount);
      expPaid = expPaid.plus(e.paidTotal);
      const prev = expByCase.get(e.caseId) ?? { requested: ZERO, paid: ZERO };
      expByCase.set(e.caseId, { requested: prev.requested.plus(e.totalAmount), paid: prev.paid.plus(e.paidTotal) });
    }
    const expUnpaid = expRequested.minus(expPaid);

    // caseBreakdown — distinct caseId (ccRows sırası korunur)
    const caseMeta = new Map<string, { caseNumber: string; executionFileNumber: string | null; role: string }>();
    for (const cc of ccRows) {
      if (!caseMeta.has(cc.caseId)) {
        caseMeta.set(cc.caseId, {
          caseNumber: cc.case?.fileNumber ?? '',
          executionFileNumber: cc.case?.executionFileNumber ?? null,
          role: cc.role,
        });
      }
    }
    const caseBreakdown: ClientCaseBreakdownItem[] = distinctCaseIds.map((caseId) => {
      const a = aByCase.get(caseId) ?? { payableNet: ZERO, paid: ZERO };
      const b = bByCase.get(caseId) ?? { debtorCollection: ZERO, pendingDist: ZERO, advance: ZERO, needsReview: false };
      const e = expByCase.get(caseId) ?? { requested: ZERO, paid: ZERO };
      const m = caseMeta.get(caseId) ?? { caseNumber: '', executionFileNumber: null, role: '' };
      return {
        caseId,
        caseNumber: m.caseNumber,
        executionFileNumber: m.executionFileNumber,
        role: m.role,
        payableNet: a.payableNet.toString(),
        paidToClient: a.paid.toString(),
        expenseRequested: e.requested.toString(),
        expensePaid: e.paid.toString(),
        debtorCollection: b.debtorCollection.toString(),
        pendingDistribution: b.pendingDist.toString(),
        advanceBalance: b.advance.toString(),
        needsReview: b.needsReview,
      };
    });

    return {
      clientId,
      currency,
      clientScoped: {
        payableNet: totalPayableNet.toString(),
        paidToClient: totalPaid.toString(),
        expenseRequested: expRequested.toString(),
        expensePaid: expPaid.toString(),
        expenseUnpaid: expUnpaid.toString(),
        offsettableNetPosition: totalPayableNet.minus(expUnpaid).toString(),
      },
      caseScopedContext: {
        debtorCollection: totalDebtorCollection.toString(),
        pendingDistribution: totalPendingDist.toString(),
        advanceBalance: totalAdvance.toString(),
      },
      needsReview: anyNeedsReview,
      caseBreakdown,
    };
  }
}
