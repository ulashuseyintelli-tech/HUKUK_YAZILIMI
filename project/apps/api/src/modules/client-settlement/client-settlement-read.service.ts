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
  /** TM3 Faz C C-1 — net ClientOffset (APPLY−REVERSAL) payable bacağı (payableCaseId). payableNet'e ZATEN yansıdı (bilgi). */
  offsetPayableApplied: string;
  /** TM3 Faz C C-1 — net ClientOffset (APPLY−REVERSAL) masraf bacağı (expenseCaseId). expense unpaid'i düşürür. */
  offsetExpenseApplied: string;
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
    expenseUnpaid: string; // requested − paid − net ClientOffset (masraf bacağı)
    /** TM3 Faz C C-1 — Σ net ClientOffset (APPLY−REVERSAL). Payable+expense bacaklarını AYNI tutarda düşürür → netPosition DEĞİŞMEZ. */
    offsetApplied: string;
    offsettableNetPosition: string; // payableNet − expenseUnpaid — BİLGİ; defter kaydı DEĞİL (offset'ten BAĞIMSIZ invariant)
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

/** TM3 Faz A-MOV — birleşik hareket projection kaynak tipleri. */
export type MovementSourceType =
  | 'COLLECTION'
  | 'COLLECTION_DISPOSITION'
  | 'CLIENT_PAYOUT'
  | 'EXPENSE_REQUEST'
  | 'EXPENSE_PAYMENT'
  | 'CASE_BALANCE';

/** A grubu (müvekkile özgü) vs B grubu (dosya geneli / paylaşılan bağlam). */
export type MovementScopeGroup = 'CLIENT_SPECIFIC' | 'CASE_CONTEXT';

/**
 * Hareketin müvekkilin carisine yönü — yalnız ETİKET/BİLGİ. Defter kaydı veya mahsup DEĞİL.
 * CASE_CONTEXT hareketleri her zaman NO_DIRECT_CLIENT_EFFECT (dosya geneli, müvekkile atfedilmez).
 */
export type MovementClientEffect =
  | 'INCREASE_CLIENT_PAYABLE'
  | 'DECREASE_CLIENT_PAYABLE'
  | 'INCREASE_CLIENT_EXPENSE_DEBT'
  | 'DECREASE_CLIENT_EXPENSE_DEBT'
  | 'NO_DIRECT_CLIENT_EFFECT';

/**
 * Tek bir birleşik hareket satırı (read-only projection). Hiçbir kayıt yaratmaz/değiştirmez.
 * `amount` her zaman pozitif tutar string'i; yön `clientEffect` ile taşınır (running balance YOK — v1).
 */
export interface ClientAccountingMovement {
  id: string; // projection-stable: `${prefix}:${sourceId}`
  sourceType: MovementSourceType;
  sourceId: string;
  scopeGroup: MovementScopeGroup;
  occurredAt: string; // ISO
  caseId: string;
  caseNo: string;
  caseClientId: string | null;
  label: string;
  description: string | null;
  amount: string; // Decimal string (pozitif)
  currency: string;
  clientEffect: MovementClientEffect;
  status: string;
  needsReview?: boolean;
}

export interface ClientMovementsResult {
  items: ClientAccountingMovement[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ClientMovementsOptions {
  scope?: 'client' | 'case';
  caseId?: string;
  group?: MovementScopeGroup;
  currency?: string;
  page?: number;
  pageSize?: number;
  from?: string; // ISO/parse-edilebilir tarih (alt sınır, dahil)
  to?: string; // ISO/parse-edilebilir tarih (üst sınır, dahil)
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
   * CONFIRMED) − Σ RECORDED ClientPayout − Σ APPLY ClientOffset(payable leg) + Σ REVERSAL ClientOffset.
   * Scope tenant+case+caseClientId+currency. manualReversalRequiredAt dolu POSTED disposition dahil değil.
   * HELD/CONTRACTUAL_FEE/FIRM_REIMB/CollectionDispositionLine-tipi-OFFSET/OTHER ve BalanceLedger DAHİL DEĞİL.
   * (ClientOffset ≠ CollectionDispositionLine.type 'OFFSET'; ClientOffset Faz C C-1 read-time uygulanır, MUTATE etmez.)
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

    // TM3 Faz C C-1 — ClientOffset (payable leg) read-time subtraction. Kayıt MUTATE edilmez; APPLY uygulanan
    // mahsubu düşer, REVERSAL geri ekler (net etki = aktif APPLY − reverse). Offset yokken sonuç birebir aynı.
    const offApply = await db.clientOffset.aggregate({
      _sum: { amount: true },
      where: { tenantId, currency, kind: 'APPLY', payableCaseId: caseId, payableCaseClientId: caseClientId },
    });
    const offReversal = await db.clientOffset.aggregate({
      _sum: { amount: true },
      where: { tenantId, currency, kind: 'REVERSAL', payableCaseId: caseId, payableCaseClientId: caseClientId },
    });

    return payable
      .minus(paidAgg._sum.amount ?? ZERO)
      .minus(offApply._sum.amount ?? ZERO)
      .plus(offReversal._sum.amount ?? ZERO);
  }

  /**
   * S8-B FAZ-1b — ExpenseRequest kalan ödenmemiş (TEK KAYNAK · drift yok). ClientOffsetService'teki private
   * computeExpenseRequestUnpaid'i REPLACE eder + reimbursement application terimlerini ekler. Tüketiciler:
   * offset eligibility/availability, dağıtım öneri motoru, UYAP gate, summary, expense detail, distribution preview.
   *
   * remaining = totalAmount − paidTotal
   *   − Σ ClientOffset(APPLY) + Σ ClientOffset(REVERSAL)
   *   − Σ ExpenseApplication(APPLY) + Σ ExpenseApplication(REVERSAL)
   *
   * RAW döner (clamp YOK); negatif = over-application sinyali (caller display'de clamp eder, summary needsReview gibi).
   * ⚠️ paidTotal ASLA mutate edilmez (projection-first); reimbursement kapanışı yalnız application satırlarından türer.
   *
   * @param db PrismaService (read) veya tx (post() advisory-lock altında re-validate).
   */
  async computeExpenseRemaining(
    db: Prisma.TransactionClient,
    tenantId: string,
    expenseRequestId: string,
    totalAmount: Prisma.Decimal,
    paidTotal: Prisma.Decimal,
  ): Promise<Prisma.Decimal> {
    const offApply = await db.clientOffset.aggregate({ _sum: { amount: true }, where: { tenantId, expenseRequestId, kind: 'APPLY' } });
    const offReversal = await db.clientOffset.aggregate({ _sum: { amount: true }, where: { tenantId, expenseRequestId, kind: 'REVERSAL' } });
    const reimbApply = await db.collectionDispositionExpenseApplication.aggregate({ _sum: { amount: true }, where: { tenantId, expenseRequestId, kind: 'APPLY' } });
    const reimbReversal = await db.collectionDispositionExpenseApplication.aggregate({ _sum: { amount: true }, where: { tenantId, expenseRequestId, kind: 'REVERSAL' } });
    return totalAmount
      .minus(paidTotal)
      .minus(offApply._sum.amount ?? ZERO)
      .plus(offReversal._sum.amount ?? ZERO)
      .minus(reimbApply._sum.amount ?? ZERO)
      .plus(reimbReversal._sum.amount ?? ZERO);
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
      select: { id: true, caseId: true, totalAmount: true, paidTotal: true },
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

    // TM3 Faz C C-1 — net ClientOffset (APPLY−REVERSAL). Payable bacağı ZATEN computeOutstanding üzerinden
    // payableNet'e yansıdı; burada (a) masraf unpaid'i düş (b) breakdown için iki bacağı caseId bazında ayır.
    // offsetNet payable+expense'i AYNI tutarda düşürdüğü için offsettableNetPosition DEĞİŞMEZ (locked invariant).
    const offRows = await this.prisma.clientOffset.findMany({
      where: { tenantId, clientId, currency },
      select: { amount: true, kind: true, payableCaseId: true, expenseCaseId: true },
    });
    let offsetNet = ZERO; // Σ APPLY − Σ REVERSAL
    const offPayableByCase = new Map<string, Prisma.Decimal>();
    const offExpenseByCase = new Map<string, Prisma.Decimal>();
    for (const o of offRows) {
      const signed = o.kind === 'APPLY' ? o.amount : o.amount.negated();
      offsetNet = offsetNet.plus(signed);
      offPayableByCase.set(o.payableCaseId, (offPayableByCase.get(o.payableCaseId) ?? ZERO).plus(signed));
      offExpenseByCase.set(o.expenseCaseId, (offExpenseByCase.get(o.expenseCaseId) ?? ZERO).plus(signed));
    }
    // S8-B FAZ-1b — expenseUnpaid TEK KAYNAK = Σ per-request computeExpenseRemaining (offset + reimbursement
    // application terimleri dahil). offsetNet/byCase YALNIZ offsetApplied breakdown display için korunur (client-level toplam DEĞİL).
    let expUnpaid = ZERO;
    for (const e of expRows) {
      expUnpaid = expUnpaid.plus(await this.computeExpenseRemaining(this.prisma, tenantId, e.id, e.totalAmount, e.paidTotal));
    }

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
        offsetPayableApplied: (offPayableByCase.get(caseId) ?? ZERO).toString(),
        offsetExpenseApplied: (offExpenseByCase.get(caseId) ?? ZERO).toString(),
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
        offsetApplied: offsetNet.toString(),
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

  /**
   * Faz A-MOV — Müvekkil Genel Cari için BİRLEŞİK HAREKET projection (read-only). YENİ defter/
   * entity/migration/mutation YOK; mevcut kayıtlardan event listesi türetir. Running balance YOK (v1).
   *
   * Summary'deki A/B ayrımı AYNEN korunur:
   *  - A grubu (CLIENT_SPECIFIC, müvekkile özgü): POSTED CLIENT_PAYABLE disposition satırları (caseClientId,
   *    computeOutstanding ile birebir scope) · RECORDED ClientPayout · ExpenseRequest (clientId+gerçek caseId) ·
   *    ExpensePayment (expenseRequest.clientId). clientEffect borç yönünü ETİKETLER (defter/mahsup DEĞİL).
   *  - B grubu (CASE_CONTEXT, dosya geneli — müvekkile ATFEDİLMEZ): Collection (CONFIRMED/CANCELLED/REFUNDED) ·
   *    BalanceLedger (caseBalance.caseId DISTINCT). Hepsi NO_DIRECT_CLIENT_EFFECT.
   *
   * Sıralama deterministik: occurredAt desc, eşitlikte sourceType → sourceId (stabil sayfalama).
   * scope=case yalnız tek dosyaya daraltır (client'ın eligible dosyası değilse doğal olarak boş).
   * Çağrıldığı yer: ClientAccountingController.movements() → GET /clients/:clientId/accounting/movements
   */
  async getClientAccountingMovements(
    tenantId: string,
    clientId: string,
    opts: ClientMovementsOptions = {},
  ): Promise<ClientMovementsResult> {
    const currency = opts.currency || 'TRY';
    const page = Math.max(Number(opts.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(opts.pageSize) || 50, 1), 200);
    const scope: 'client' | 'case' = opts.scope === 'case' && opts.caseId ? 'case' : 'client';
    const from = opts.from ? new Date(opts.from) : null;
    const to = opts.to ? new Date(opts.to) : null;
    const inDate = (d: Date | null | undefined): boolean =>
      !!d && (!from || d.getTime() >= from.getTime()) && (!to || d.getTime() <= to.getTime());

    // Müvekkilin eligible CaseClient bağları (A grubu scope) + DISTINCT caseId (B grubu, çift sayma yok).
    const ccRows = await this.prisma.caseClient.findMany({
      where: { clientId, role: { in: ELIGIBLE_ROLES }, client: { tenantId } },
      select: { id: true, caseId: true, case: { select: { fileNumber: true } } },
    });
    let clientCaseClientIds = ccRows.map((r) => r.id);
    let distinctCaseIds = [...new Set(ccRows.map((r) => r.caseId))];
    if (scope === 'case') {
      clientCaseClientIds = ccRows.filter((r) => r.caseId === opts.caseId).map((r) => r.id);
      distinctCaseIds = distinctCaseIds.filter((c) => c === opts.caseId);
    }
    const caseNo = new Map<string, string>();
    for (const r of ccRows) if (!caseNo.has(r.caseId)) caseNo.set(r.caseId, r.case?.fileNumber ?? '');

    const movements: ClientAccountingMovement[] = [];

    // ---- A grubu: CLIENT_SPECIFIC ----
    if (clientCaseClientIds.length > 0) {
      // 1) POSTED CLIENT_PAYABLE disposition satırları — borç DOĞDU. caseClientId line-level
      //    (computeOutstanding ile birebir scope). disposition POSTED + tenant + currency + manual reversal marker yok.
      const lines = await this.prisma.collectionDispositionLine.findMany({
        where: {
          type: 'CLIENT_PAYABLE',
          caseClientId: { in: clientCaseClientIds },
          disposition: { tenantId, currency, status: 'POSTED', manualReversalRequiredAt: null },
        },
        select: {
          id: true,
          amount: true,
          caseClientId: true,
          note: true,
          disposition: { select: { caseId: true, postedAt: true } },
        },
      });
      for (const l of lines) {
        const occ = l.disposition.postedAt;
        if (!inDate(occ)) continue;
        movements.push({
          id: `disp-line:${l.id}`,
          sourceType: 'COLLECTION_DISPOSITION',
          sourceId: l.id,
          scopeGroup: 'CLIENT_SPECIFIC',
          occurredAt: occ!.toISOString(),
          caseId: l.disposition.caseId,
          caseNo: caseNo.get(l.disposition.caseId) ?? '',
          caseClientId: l.caseClientId ?? null,
          label: 'Müvekkile borç doğdu (dağıtım)',
          description: l.note ?? null,
          amount: l.amount.toString(),
          currency,
          clientEffect: 'INCREASE_CLIENT_PAYABLE',
          status: 'POSTED',
        });
      }

      // 2) RECORDED ClientPayout — müvekkile ödeme yapıldı (borç azalır).
      const payouts = await this.prisma.clientPayout.findMany({
        where: { tenantId, caseClientId: { in: clientCaseClientIds }, currency, status: 'RECORDED' },
        select: { id: true, amount: true, paidAt: true, caseId: true, caseClientId: true, note: true },
      });
      for (const p of payouts) {
        if (!inDate(p.paidAt)) continue;
        movements.push({
          id: `payout:${p.id}`,
          sourceType: 'CLIENT_PAYOUT',
          sourceId: p.id,
          scopeGroup: 'CLIENT_SPECIFIC',
          occurredAt: p.paidAt.toISOString(),
          caseId: p.caseId,
          caseNo: caseNo.get(p.caseId) ?? '',
          caseClientId: p.caseClientId,
          label: 'Müvekkile ödeme yapıldı',
          description: p.note ?? null,
          amount: p.amount.toString(),
          currency,
          clientEffect: 'DECREASE_CLIENT_PAYABLE',
          status: 'RECORDED',
        });
      }
    }

    // 3) ExpenseRequest — clientId scope (gerçek caseId). currency summary ile parite için filtrelenmez.
    const erWhere: Prisma.ExpenseRequestWhereInput = { tenantId, clientId, status: { not: 'CANCELLED' } };
    if (scope === 'case') erWhere.caseId = opts.caseId;
    const ers = await this.prisma.expenseRequest.findMany({
      where: erWhere,
      select: { id: true, caseId: true, totalAmount: true, currency: true, status: true, createdAt: true, case: { select: { fileNumber: true } } },
    });
    for (const e of ers) {
      if (!inDate(e.createdAt)) continue;
      movements.push({
        id: `er:${e.id}`,
        sourceType: 'EXPENSE_REQUEST',
        sourceId: e.id,
        scopeGroup: 'CLIENT_SPECIFIC',
        occurredAt: e.createdAt.toISOString(),
        caseId: e.caseId,
        caseNo: e.case?.fileNumber ?? caseNo.get(e.caseId) ?? '',
        caseClientId: null,
        label: 'Müvekkilden masraf talep edildi',
        description: null,
        amount: e.totalAmount.toString(),
        currency: e.currency ?? currency,
        clientEffect: 'INCREASE_CLIENT_EXPENSE_DEBT',
        status: e.status,
      });
    }

    // 4) ExpensePayment — expenseRequest.clientId üstünden (masraf tahsil edildi → borç azalır).
    const epWhere: Prisma.ExpensePaymentWhereInput = { expenseRequest: { tenantId, clientId } };
    if (scope === 'case') epWhere.expenseRequest = { tenantId, clientId, caseId: opts.caseId };
    const eps = await this.prisma.expensePayment.findMany({
      where: epWhere,
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        reference: true,
        expenseRequest: { select: { caseId: true, currency: true, case: { select: { fileNumber: true } } } },
      },
    });
    for (const p of eps) {
      if (!inDate(p.paymentDate)) continue;
      const cid = p.expenseRequest.caseId;
      movements.push({
        id: `ep:${p.id}`,
        sourceType: 'EXPENSE_PAYMENT',
        sourceId: p.id,
        scopeGroup: 'CLIENT_SPECIFIC',
        occurredAt: p.paymentDate.toISOString(),
        caseId: cid,
        caseNo: p.expenseRequest.case?.fileNumber ?? caseNo.get(cid) ?? '',
        caseClientId: null,
        label: 'Müvekkilden masraf tahsil edildi',
        description: p.reference ?? null,
        amount: p.amount.toString(),
        currency: p.expenseRequest.currency ?? currency,
        clientEffect: 'DECREASE_CLIENT_EXPENSE_DEBT',
        status: 'PAID',
      });
    }

    // ---- B grubu: CASE_CONTEXT (dosya geneli — müvekkile atfedilmez; DISTINCT caseId, çift sayma yok) ----
    if (distinctCaseIds.length > 0) {
      // 5) Collection — borçludan tahsilat (CONFIRMED) + iptal/iade. Müvekkil carisine DOĞRUDAN etki yok.
      const colls = await this.prisma.collection.findMany({
        where: { tenantId, caseId: { in: distinctCaseIds }, currency, status: { in: ['CONFIRMED', 'CANCELLED', 'REFUNDED'] } },
        select: { id: true, amount: true, date: true, caseId: true, status: true, description: true },
      });
      for (const c of colls) {
        if (!inDate(c.date)) continue;
        const label =
          c.status === 'CONFIRMED' ? 'Borçlu tahsilatı (dosya geneli)' : c.status === 'REFUNDED' ? 'Tahsilat iadesi (dosya geneli)' : 'Tahsilat iptali (dosya geneli)';
        movements.push({
          id: `coll:${c.id}`,
          sourceType: 'COLLECTION',
          sourceId: c.id,
          scopeGroup: 'CASE_CONTEXT',
          occurredAt: c.date.toISOString(),
          caseId: c.caseId,
          caseNo: caseNo.get(c.caseId) ?? '',
          caseClientId: null,
          label,
          description: c.description ?? null,
          amount: c.amount.toString(),
          currency,
          clientEffect: 'NO_DIRECT_CLIENT_EFFECT',
          status: c.status,
        });
      }

      // 6) BalanceLedger — dosya masraf/avans hareketi (CaseBalance.caseId üstünden). Müvekkile atfedilmez.
      const ledger = await this.prisma.balanceLedger.findMany({
        where: { tenantId, currency, caseBalance: { caseId: { in: distinctCaseIds } } },
        select: { id: true, amount: true, type: true, createdAt: true, description: true, caseBalance: { select: { caseId: true } } },
      });
      for (const g of ledger) {
        if (!inDate(g.createdAt)) continue;
        const cid = g.caseBalance.caseId;
        movements.push({
          id: `bl:${g.id}`,
          sourceType: 'CASE_BALANCE',
          sourceId: g.id,
          scopeGroup: 'CASE_CONTEXT',
          occurredAt: g.createdAt.toISOString(),
          caseId: cid,
          caseNo: caseNo.get(cid) ?? '',
          caseClientId: null,
          label: 'Masraf/avans hareketi (dosya geneli)',
          description: g.description ?? null,
          amount: g.amount.toString(),
          currency,
          clientEffect: 'NO_DIRECT_CLIENT_EFFECT',
          status: g.type,
        });
      }
    }

    // group filtresi (opsiyonel) — A veya B'yi izole et.
    let filtered = movements;
    if (opts.group === 'CLIENT_SPECIFIC' || opts.group === 'CASE_CONTEXT') {
      filtered = movements.filter((m) => m.scopeGroup === opts.group);
    }

    // Deterministik sıralama: occurredAt desc, eşitlikte sourceType → sourceId.
    filtered.sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) ||
        a.sourceType.localeCompare(b.sourceType) ||
        a.sourceId.localeCompare(b.sourceId),
    );

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), page, pageSize, total };
  }
}
