import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  Prisma,
  BalanceLedgerType,
  ClientStatementStatus,
  ClientStatementLineType,
  CollectionDispositionLineType,
} from '@prisma/client';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import {
  CreateClientStatementDto,
  SupersedeClientStatementDto,
} from './dto/client-statement.dto';

const ZERO = new Prisma.Decimal(0);

/** Hesaplanmış tek satır (DB'ye yazılmadan önce). */
interface LineDraft {
  lineDate: Date;
  lineType: ClientStatementLineType;
  refType: string;
  refId: string;
  caseClientId: string | null; // M2: proceeds satırının alacaklı atfı (BalanceLedger/ExpenseRequest'te null)
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  runningBalance: Prisma.Decimal;
  note: string | null;
}

/**
 * Müvekkil Ekstresi servisi (PR-3).
 *
 * Ekstre = IMMUTABLE finansal belge snapshot'ı. Üretildiği anki durumu DONDURUR;
 * eski ekstre ASLA değişmez. Düzeltme = yeni statement + supersededById.
 *
 * İLKELER:
 * - runningBalance TEK kanonik kaynak = BalanceLedger (işaretli amount: CREDIT +, DEBIT -).
 *   ExpenseRequest yalnız BİLGİ satırı (EXPENSE_REQUESTED, debit=credit=0) — bakiyeyi oynatmaz.
 *   Çift-sayım yok (müvekkil ödemesi zaten BalanceLedger CREDIT'e düşüyor).
 * - Collection/TBK100 DAHİL DEĞİL. Tutar Decimal(15,2) (finans hattıyla aynı).
 * - Satır/başlık içeriği update edilmez; servis update/delete + PATCH/PUT/DELETE route SUNMAZ.
 * - Multitenant: tüm okuma/yazma tenantId ile filtrelenir; kaynaklar yalnız aynı tenant+case.
 */
@Injectable()
export class ClientStatementService {
  private readonly logger = new Logger(ClientStatementService.name);

  constructor(
    private prisma: PrismaService,
    private dispatcher: NotificationDispatcherService,
    private office: OfficeService,
  ) {}

  /**
   * Yeni ekstre üret (ACTIVE snapshot).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientStatementController.create() → POST /client-statements/case/:caseId
   * </remarks>
   */
  async create(tenantId: string, caseId: string, userId: string, dto: CreateClientStatementDto) {
    const { periodStart, periodEnd } = this.parsePeriod(dto.periodStart, dto.periodEnd);
    await this.assertCaseAndClient(tenantId, caseId, dto.clientId);

    const caseClientId = await this.resolveCaseClientId(tenantId, caseId, dto.clientId);
    const snap = await this.collect(tenantId, caseId, periodStart, periodEnd, dto.includeRequests ?? true, caseClientId);

    const created = await this.prisma.$transaction((tx) =>
      this.persist(tx, {
        tenantId,
        caseId,
        clientId: dto.clientId,
        periodStart,
        periodEnd,
        opening: snap.opening,
        closing: snap.closing,
        note: dto.note ?? null,
        userId,
      }, snap.lines),
    );

    const result = await this.findOne(tenantId, created.id);
    // State commit edildi → "ekstre hazır" maili BEST-EFFORT (yalnız create — m34-1; supersede/void mail YOK)
    await this.notifyStatementReady(tenantId, userId, result);
    return result;
  }

  /**
   * Eskisini SUPERSEDED yap, aynı case+client için yeni ACTIVE ekstre üret (tek transaction).
   * Eski ekstrenin içeriği DEĞİŞMEZ — yalnız status/supersededById/supersededAt damgalanır.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientStatementController.supersede() → POST /client-statements/:id/supersede
   * </remarks>
   */
  async supersede(tenantId: string, id: string, userId: string, dto: SupersedeClientStatementDto) {
    const old = await this.findOwned(tenantId, id);
    if (old.status !== ClientStatementStatus.ACTIVE) {
      throw new BadRequestException(`Yalnız ACTIVE ekstre supersede edilebilir (durum: ${old.status})`);
    }
    const { periodStart, periodEnd } = this.parsePeriod(dto.periodStart, dto.periodEnd);
    const caseClientId = await this.resolveCaseClientId(tenantId, old.caseId, old.clientId);
    const snap = await this.collect(tenantId, old.caseId, periodStart, periodEnd, dto.includeRequests ?? true, caseClientId);

    const created = await this.prisma.$transaction(async (tx) => {
      const fresh = await this.persist(tx, {
        tenantId,
        caseId: old.caseId,
        clientId: old.clientId,
        periodStart,
        periodEnd,
        opening: snap.opening,
        closing: snap.closing,
        note: dto.note ?? null,
        userId,
      }, snap.lines);

      await tx.clientStatement.update({
        where: { id: old.id },
        data: {
          status: ClientStatementStatus.SUPERSEDED,
          supersededById: fresh.id,
          supersededAt: new Date(),
        },
      });
      return fresh;
    });

    return this.findOne(tenantId, created.id);
  }

  /**
   * Geçersiz işaretle (ACTIVE → VOID). İçerik değişmez; yalnız lifecycle damgası.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientStatementController.void() → POST /client-statements/:id/void
   * </remarks>
   */
  async void(tenantId: string, id: string, userId: string, note?: string) {
    const existing = await this.findOwned(tenantId, id);
    if (existing.status !== ClientStatementStatus.ACTIVE) {
      throw new BadRequestException(`Yalnız ACTIVE ekstre void edilebilir (durum: ${existing.status})`);
    }
    await this.prisma.clientStatement.update({
      where: { id },
      data: {
        status: ClientStatementStatus.VOID,
        voidedAt: new Date(),
        voidedById: userId,
        voidNote: note ?? null,
      },
    });
    return this.findOne(tenantId, id);
  }

  /**
   * Dosya bazlı liste (default: ACTIVE).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientStatementController.listByCase() → GET /client-statements/case/:caseId?status=
   * </remarks>
   */
  async listByCase(tenantId: string, caseId: string, status?: ClientStatementStatus) {
    return this.prisma.clientStatement.findMany({
      where: { tenantId, caseId, status: status ?? ClientStatementStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Tek ekstre + satırlar.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientStatementController.findOne() → GET /client-statements/:id
   * - ClientStatementService.create/supersede/void() → üretim sonrası dönüş
   * </remarks>
   */
  async findOne(tenantId: string, id: string) {
    const record = await this.prisma.clientStatement.findFirst({
      where: { id, tenantId },
      include: { lines: { orderBy: [{ lineDate: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!record) throw new NotFoundException('Ekstre bulunamadı');
    return record;
  }

  // ==================== mail tetiği (Faz 3.4) ====================

  /**
   * "Ekstre hazır" maili — BEST-EFFORT. Token derleme + dispatch tamamen try/catch içinde:
   * mail (veya token okuması) başarısız olsa bile commit'li ekstre DEĞİŞMEZ, throw etmez.
   * Yalnız create()'te çağrılır (m34-1: supersede/void mail tetiklemez).
   */
  private async notifyStatementReady(
    tenantId: string,
    userId: string,
    st: { id: string; clientId: string; caseId: string; periodStart: Date; periodEnd: Date; closingBalance: Prisma.Decimal },
  ): Promise<void> {
    try {
      const [client, kase, office] = await Promise.all([
        this.prisma.client.findFirst({
          where: { id: st.clientId, tenantId },
          select: { displayName: true, name: true, firstName: true, lastName: true },
        }),
        this.prisma.case.findFirst({
          where: { id: st.caseId, tenantId },
          select: { fileNumber: true, executionFileNumber: true },
        }),
        this.office.getOrCreate(tenantId),
      ]);

      const tokens: Record<string, string> = {
        clientName: client?.displayName || client?.name || [client?.firstName, client?.lastName].filter(Boolean).join(' ') || 'Müvekkil',
        caseFileNumber: kase?.fileNumber ?? '',
        executionFileNumber: kase?.executionFileNumber ?? '',
        periodStart: st.periodStart.toISOString().slice(0, 10),
        periodEnd: st.periodEnd.toISOString().slice(0, 10),
        closingBalance: st.closingBalance.toString(),
        officeName: office?.name ?? '',
      };

      await this.dispatcher.dispatch(tenantId, userId, {
        clientId: st.clientId,
        caseId: st.caseId,
        templateCode: 'STATEMENT_READY',
        type: 'STATEMENT_READY',
        tokens,
        refType: 'ClientStatement',
        refId: st.id,
      });
    } catch (e: any) {
      this.logger.warn(`Ekstre maili tetiklenemedi (${st.id}): ${e.message}`);
    }
  }

  // ==================== iç yardımcılar ====================

  private parsePeriod(startStr: string, endStr: string) {
    const periodStart = new Date(startStr);
    const periodEnd = new Date(endStr);
    if (periodStart.getTime() > periodEnd.getTime()) {
      throw new BadRequestException('periodStart, periodEnd’ten sonra olamaz');
    }
    return { periodStart, periodEnd };
  }

  private async assertCaseAndClient(tenantId: string, caseId: string, clientId: string) {
    const caseItem = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!caseItem) throw new NotFoundException('Takip bulunamadı');
    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true } });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');
  }

  /**
   * Snapshot verisini topla: opening (dönem öncesi BalanceLedger toplamı),
   * dönem-içi para hareketleri (BalanceLedger) + bilgi satırları (ExpenseRequest),
   * tarihe göre sıralı runningBalance. Para hareketi işaretli amount ile yürür;
   * bilgi satırı bakiyeyi oynatmaz.
   */
  private async collect(
    tenantId: string,
    caseId: string,
    periodStart: Date,
    periodEnd: Date,
    includeRequests: boolean,
    statementCaseClientId: string | null,
  ): Promise<{ opening: Prisma.Decimal; closing: Prisma.Decimal; lines: LineDraft[] }> {
    let opening = ZERO;
    let ledgerRows: { id: string; amount: Prisma.Decimal; type: BalanceLedgerType; description: string | null; createdAt: Date }[] = [];

    const balance = await this.prisma.caseBalance.findFirst({
      where: { caseId, tenantId },
      select: { id: true },
    });
    if (balance) {
      const agg = await this.prisma.balanceLedger.aggregate({
        _sum: { amount: true },
        where: { caseBalanceId: balance.id, createdAt: { lt: periodStart } },
      });
      opening = agg._sum.amount ?? ZERO;
      ledgerRows = await this.prisma.balanceLedger.findMany({
        where: { caseBalanceId: balance.id, createdAt: { gte: periodStart, lte: periodEnd } },
        select: { id: true, amount: true, type: true, description: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    let requestRows: { id: string; totalAmount: Prisma.Decimal; currency: string; status: string; createdAt: Date }[] = [];
    if (includeRequests) {
      requestRows = await this.prisma.expenseRequest.findMany({
        where: { tenantId, caseId, createdAt: { gte: periodStart, lte: periodEnd } },
        select: { id: true, totalAmount: true, currency: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    // M2 (model A): POSTED CollectionDisposition proceeds satırları — YALNIZ bu ekstrenin
    // alacaklısına (caseClientId) ait satırlar. Office-share (fee/firm) BİLGİ(0);
    // OFFSET_CLIENT_ADVANCE BİLGİ(0) → bakiye etkisi korelasyonlu BalanceLedger'dan (çift-sayım yok).
    let dispositionRows: {
      id: string; type: CollectionDispositionLineType; amount: Prisma.Decimal; caseClientId: string | null; postedAt: Date;
    }[] = [];
    if (statementCaseClientId) {
      const posted = await this.prisma.collectionDisposition.findMany({
        where: { tenantId, caseId, status: 'POSTED', postedAt: { gte: periodStart, lte: periodEnd } },
        select: { postedAt: true, lines: { select: { id: true, type: true, amount: true, caseClientId: true } } },
      });
      for (const d of posted) {
        if (!d.postedAt) continue;
        for (const ln of d.lines) {
          if (ln.caseClientId === statementCaseClientId) {
            dispositionRows.push({ id: ln.id, type: ln.type, amount: ln.amount, caseClientId: ln.caseClientId, postedAt: d.postedAt });
          }
        }
      }
    }

    // M3: müvekkile ödemeler (ClientPayout RECORDED) — CLIENT_PAYOUT_SENT (debit −). YALNIZ bu alacaklı.
    let payoutRows: { id: string; amount: Prisma.Decimal; paidAt: Date }[] = [];
    if (statementCaseClientId) {
      const payouts = await this.prisma.clientPayout.findMany({
        where: { tenantId, caseId, caseClientId: statementCaseClientId, status: 'RECORDED', paidAt: { gte: periodStart, lte: periodEnd } },
        select: { id: true, amount: true, paidAt: true },
      });
      payoutRows = payouts.map((p) => ({ id: p.id, amount: p.amount, paidAt: p.paidAt }));
    }

    const items = [
      ...ledgerRows.map((l) => ({ kind: 'money' as const, date: l.createdAt, l })),
      ...requestRows.map((r) => ({ kind: 'info' as const, date: r.createdAt, r })),
      ...dispositionRows.map((d) => ({ kind: 'proceeds' as const, date: d.postedAt, d })),
      ...payoutRows.map((p) => ({ kind: 'payout' as const, date: p.paidAt, p })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = opening;
    const lines: LineDraft[] = [];
    for (const it of items) {
      if (it.kind === 'money') {
        const amt = it.l.amount; // işaretli
        running = running.plus(amt);
        lines.push({
          lineDate: it.l.createdAt,
          lineType: this.mapLedgerType(it.l.type),
          refType: 'BalanceLedger',
          refId: it.l.id,
          caseClientId: null, // BalanceLedger case-level (avans defteri)
          debit: amt.lt(ZERO) ? amt.abs() : ZERO,
          credit: amt.gt(ZERO) ? amt : ZERO,
          runningBalance: running,
          note: it.l.description ?? null,
        });
      } else if (it.kind === 'info') {
        lines.push({
          lineDate: it.r.createdAt,
          lineType: ClientStatementLineType.EXPENSE_REQUESTED,
          refType: 'ExpenseRequest',
          refId: it.r.id,
          caseClientId: null,
          debit: ZERO,
          credit: ZERO,
          runningBalance: running, // BİLGİ satırı — bakiyeyi oynatmaz
          note: `Talep: ${it.r.totalAmount} ${it.r.currency} (${it.r.status})`,
        });
      } else if (it.kind === 'proceeds') {
        // proceeds — POSTED CollectionDispositionLine (model A). Sign convention mapDispositionLine'da.
        const m = this.mapDispositionLine(it.d.type, it.d.amount);
        running = running.plus(m.credit); // payable/clientReimb → +amount; ofis-payı/OFFSET → 0
        lines.push({
          lineDate: it.d.postedAt,
          lineType: m.lineType,
          refType: 'CollectionDispositionLine',
          refId: it.d.id,
          caseClientId: it.d.caseClientId,
          debit: ZERO,
          credit: m.credit,
          runningBalance: running,
          note: m.note,
        });
      } else {
        // M3 payout — ClientPayout RECORDED → CLIENT_PAYOUT_SENT (debit −). BalanceLedger DEĞİL (D1).
        running = running.minus(it.p.amount);
        lines.push({
          lineDate: it.p.paidAt,
          lineType: ClientStatementLineType.CLIENT_PAYOUT_SENT,
          refType: 'ClientPayout',
          refId: it.p.id,
          caseClientId: statementCaseClientId,
          debit: it.p.amount,
          credit: ZERO,
          runningBalance: running,
          note: 'Müvekkile ödeme',
        });
      }
    }

    return { opening, closing: running, lines };
  }

  private mapLedgerType(t: BalanceLedgerType): ClientStatementLineType {
    switch (t) {
      case BalanceLedgerType.CREDIT:
        return ClientStatementLineType.ADVANCE_CREDIT;
      case BalanceLedgerType.DEBIT:
        return ClientStatementLineType.EXPENSE_ACTUAL;
      case BalanceLedgerType.REFUND:
        return ClientStatementLineType.REFUND;
      case BalanceLedgerType.ADJUST:
      default:
        return ClientStatementLineType.ADJUST;
    }
  }

  /**
   * M2 proceeds satırı → ClientStatementLineType + bakiye etkisi (credit). Sign convention (KİLİTLİ):
   * CLIENT_PAYABLE/CLIENT_EXPENSE_REIMBURSEMENT → credit + (müvekkil lehine);
   * CONTRACTUAL_FEE_WITHHELD/FIRM_EXPENSE_REIMBURSEMENT/OTHER → BİLGİ (0, ofis payı/diğer);
   * OFFSET_CLIENT_ADVANCE → BİLGİ (0): bakiye etkisi YALNIZ korelasyonlu BalanceLedger'dan (çift-sayım yok).
   */
  private mapDispositionLine(
    t: CollectionDispositionLineType,
    amount: Prisma.Decimal,
  ): { lineType: ClientStatementLineType; credit: Prisma.Decimal; note: string | null } {
    switch (t) {
      case CollectionDispositionLineType.CLIENT_PAYABLE:
        return { lineType: ClientStatementLineType.CASE_COLLECTION_PAYABLE, credit: amount, note: 'Tahsilattan müvekkile ayrılan' };
      case CollectionDispositionLineType.CLIENT_EXPENSE_REIMBURSEMENT:
        return { lineType: ClientStatementLineType.CLIENT_EXPENSE_REIMBURSEMENT, credit: amount, note: 'Müvekkile masraf iadesi' };
      case CollectionDispositionLineType.CONTRACTUAL_FEE_WITHHELD:
        return { lineType: ClientStatementLineType.CONTRACTUAL_FEE_WITHHELD, credit: ZERO, note: 'Avukatlık/ücret kesintisi (ofis payı)' };
      case CollectionDispositionLineType.FIRM_EXPENSE_REIMBURSEMENT:
        return { lineType: ClientStatementLineType.FIRM_EXPENSE_REIMBURSEMENT, credit: ZERO, note: 'Ofis masraf iadesi' };
      case CollectionDispositionLineType.OFFSET_CLIENT_ADVANCE:
        return { lineType: ClientStatementLineType.COLLECTION_OFFSET_ADVANCE, credit: ZERO, note: 'Avans mahsubu (bakiye avans defterinden)' };
      case CollectionDispositionLineType.OTHER:
      default:
        return { lineType: ClientStatementLineType.ADJUST, credit: ZERO, note: 'Tahsilat dağıtımı (diğer)' };
    }
  }

  /** Statement'ın alacaklısı (CaseClient.id) — proceeds filtre + atıf için (yoksa null = aggregate/yok). */
  private async resolveCaseClientId(tenantId: string, caseId: string, clientId: string): Promise<string | null> {
    const cc = await this.prisma.caseClient.findFirst({
      where: { caseId, clientId, client: { tenantId } },
      select: { id: true },
    });
    return cc?.id ?? null;
  }

  private async persist(
    tx: Prisma.TransactionClient,
    header: {
      tenantId: string;
      caseId: string;
      clientId: string;
      periodStart: Date;
      periodEnd: Date;
      opening: Prisma.Decimal;
      closing: Prisma.Decimal;
      note: string | null;
      userId: string;
    },
    lines: LineDraft[],
  ) {
    const statement = await tx.clientStatement.create({
      data: {
        tenantId: header.tenantId,
        caseId: header.caseId,
        clientId: header.clientId,
        periodStart: header.periodStart,
        periodEnd: header.periodEnd,
        openingBalance: header.opening,
        closingBalance: header.closing,
        status: ClientStatementStatus.ACTIVE,
        note: header.note,
        generatedById: header.userId,
      },
    });

    if (lines.length) {
      await tx.clientStatementLine.createMany({
        data: lines.map((l) => ({ statementId: statement.id, ...l })),
      });
    }

    return statement;
  }

  private async findOwned(tenantId: string, id: string) {
    const record = await this.prisma.clientStatement.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, caseId: true, clientId: true },
    });
    if (!record) throw new NotFoundException('Ekstre bulunamadı');
    return record;
  }
}
