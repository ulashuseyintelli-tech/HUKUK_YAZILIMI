/**
 * ADR-014 Wave 0.2 — Hybrid Scenario Materializer (test/disposable DB adapter).
 *
 * Owner arbitration (baseline v1.2, 2026-07-10, bağlayıcı):
 * - Akış: Scenario Definition → Materializer → DB. ASLA tersi — bu dosya
 *   `ScenarioDefinition` contract'ını TÜKETİR, sahiplenmez/rekabet etmez.
 * - İskele (Tenant/Client/Debtor/Case/CaseDebtor) materializer içinde
 *   Prisma-direct kurulur (v1.2 owner kararı; repo DB-gated emsal deseni).
 * - ClaimItem üç-tutar (originalAmount+demandedAmount+amount) her zaman set (G2).
 * - REVERSAL = Conditional Option B: direct-write, YALNIZ test/disposable DB;
 *   `reversesLedgerEntryId` zorunlu (G1); timeline/journal/outbox/audit
 *   TAKLİT EDİLMEZ — bu yüzden sonuç `writePathNote` ile
 *   WRITE_PATH_NOT_EXERCISED olarak işaretlenir (serbest-metin metadata).
 * - GUARDRAIL: Materializer PASS ≠ CollectionService.cancel() PASS.
 *   Production cancel write-path'i ayrı DB-gated integration testidir (PR-1B).
 *
 * Wave 0 Acceptance Criteria (adr-014-wave0-acceptance-criteria.md) sınırları:
 * - Hukuki semantik yorumlamaz, faiz/mahsup/TBK100/reversal ALGORİTMASI içermez;
 *   yalnız senaryonun gerektirdiği deterministik satırları yazar (§11).
 * - `@prisma/client` yalnız bu test-adapter sınırında izinlidir (§13).
 * - Production runtime'dan ERİŞİLEMEZ — statik guard:
 *   __tests__/scenario-materializer.static.spec.ts (G4).
 *
 * Çağrıldığı yerler:
 * - Test-support: __tests__/scenario-materializer.db-gated.integration.spec.ts
 * - Runtime çağıranı YOK — bilinçli ve statik-guard'lı (production wiring yasak).
 * - Gelecek tüketici (ayrı PR): W0.3 diagnostic synthetic mode.
 */
import type { PrismaClient } from '@prisma/client';
import type { ScenarioDefinition } from '../scenario-support/scenario-definition';

/** Conditional Option B — REVERSAL kurulum niyeti (contract DEĞİL; DB-setup detayı). */
export interface MaterializeReversalIntent {
  /** ScenarioDefinition.domainInput.payments[].id — orijinal PAYMENT ledger satırı. */
  ofPaymentId: string;
  /** Verilmezse orijinal tutarın negatifi yazılır (production cancel deseniyle aynı işaret). */
  amount?: number;
}

export interface MaterializeOptions {
  /** Deterministik ama benzersiz dosya no üretimi için önek (test izolasyonu). */
  fileNumberPrefix?: string;
  /** Conditional Option B direct-write REVERSAL kurulumları. */
  reversals?: MaterializeReversalIntent[];
}

/**
 * Baseline v1'de owner-approved taslağı verilen dönüş tipi
 * (`MaterializedRefs { caseId, tenantId, claimItemIds[], collectionIds[], ledgerEntryIds[] }`)
 * + v1.2/Conditional-B'nin serbest-metin `writePathNote` alanı.
 */
export interface MaterializedScenarioRefs {
  scenarioId: string;
  tenantId: string;
  /** TWO_TENANT_ISOLATION kurulumunda ikinci (boş) tenant — izolasyon assert'leri için. */
  secondaryTenantId?: string;
  clientId: string;
  debtorId: string;
  caseId: string;
  caseDebtorId: string;
  claimItemIds: string[];
  collectionIds: string[];
  paymentLedgerEntryIds: string[];
  reversalLedgerEntryIds: string[];
  /**
   * Conditional Option B kanıt işareti (serbest-metin metadata — yeni enum DEĞİL):
   * timeline/outbox/journal/audit yazılmadı; production cancel write-path'i
   * BU KURULUMLA doğrulanmış SAYILMAZ.
   */
  writePathNote: string;
}

/**
 * Domain `InterestTypeCode` → Prisma `InterestType` ters-köprüsü (fail-fast).
 * Yalnız interest-type-bridge'in İLERİ yönde desteklediği çiftler; W0.2 senaryoları
 * bugün LEGAL_3095/COMMERCIAL kullanır. Bilinmeyen kod = sessiz yanlış satır yerine hata
 * (materializer hukuki semantik YORUMLAMAZ — yalnız bilinen etiketi geri yazar).
 */
const DOMAIN_TO_PRISMA_INTEREST: Record<string, 'YASAL' | 'TICARI'> = {
  LEGAL_3095: 'YASAL',
  COMMERCIAL_AVANS_3095_2_2: 'TICARI',
};

function toPrismaInterestType(code: string): 'YASAL' | 'TICARI' {
  const mapped = DOMAIN_TO_PRISMA_INTEREST[code];
  if (!mapped) {
    throw new Error(
      `materializeScenario: interestType '${code}' için Prisma ters-köprüsü tanımlı değil — senaryo bu tipi henüz taşıyamaz (fail-fast).`,
    );
  }
  return mapped;
}

const WRITE_PATH_NOTE =
  'WRITE_PATH_NOT_EXERCISED: materializer direct-write kurulumudur; ' +
  'timeline/outbox/journal/audit üretilmedi ve CollectionService.cancel() ' +
  'production write-path bu kurulumla doğrulanmış sayılmaz (PR-1B ayrı gate).';

let seq = 0;
/** Deterministik-benzersiz yerel kimlik (Date.now/Math.random YOK — test determinizmi). */
function localId(prefix: string): string {
  seq += 1;
  return `${prefix}-${process.pid}-${seq.toString(36)}`;
}

/**
 * ScenarioDefinition → test/disposable DB satırları.
 *
 * G1: tenantId tek kaynaktan damgalanır; tüm FK ilişkileri (Case→Client,
 *     CaseDebtor→Case/Debtor, Collection→Case, LedgerEntry→Case+Collection,
 *     REVERSAL→reversesLedgerEntryId) burada kurulur ve doğrulanır.
 * G2: ClaimItem üç-tutar her zaman set.
 *
 * NOT: `prisma` çağıranın SORUMLULUĞUNDA fail-safe test DB'sine bağlıdır
 * (resolveTestDatabaseUrl / hukuk_*_gate — G6). Bu modül URL çözmez,
 * ortam değişkeni okumaz.
 */
export async function materializeScenario(
  prisma: PrismaClient,
  def: ScenarioDefinition,
  opts: MaterializeOptions = {},
): Promise<MaterializedScenarioRefs> {
  const prefix = opts.fileNumberPrefix ?? 'W02';

  // ── İskele (v1.2: Prisma-direct) ────────────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: { name: `W0.2 Scenario Tenant (${def.id})`, slug: localId('w02-tenant') },
  });

  let secondaryTenantId: string | undefined;
  if (def.persistenceIntent.tenantSetup === 'TWO_TENANT_ISOLATION') {
    const second = await prisma.tenant.create({
      data: { name: `W0.2 Isolation Tenant (${def.id})`, slug: localId('w02-tenant-b') },
    });
    secondaryTenantId = second.id;
  }

  const client = await prisma.client.create({
    data: { tenantId: tenant.id, type: 'INDIVIDUAL', displayName: `W0.2 Müvekkil ${def.id}` },
  });

  const debtor = await prisma.debtor.create({
    data: { tenantId: tenant.id, type: 'INDIVIDUAL', name: `W0.2 Borçlu ${def.id}` },
  });

  const caseRow = await prisma.case.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      fileNumber: `${prefix}-${localId('F')}`,
      type: 'GENERAL_EXECUTION',
      caseStatus: 'DERDEST',
      status: 'ACTIVE',
      currency: def.persistenceIntent.currency,
    },
  });

  const caseDebtor = await prisma.caseDebtor.create({
    data: { caseId: caseRow.id, debtorId: debtor.id, role: 'ASIL_BORCLU' },
  });

  // ── ClaimItem (dedicated direct-write; G2 üç-tutar) ─────────────────────────
  const claimItemIds: string[] = [];
  for (const bucket of def.domainInput.claimBuckets) {
    const item = await prisma.claimItem.create({
      data: {
        tenantId: tenant.id,
        caseId: caseRow.id,
        itemType: 'PRINCIPAL',
        originalAmount: bucket.amount,
        demandedAmount: bucket.amount,
        amount: bucket.amount,
        currency: bucket.currency,
        // Ters-köprü: domain kodu → Prisma enum ('YASAL'/'TICARI'); ileri yön
        // (assembler içinde) interest-type-bridge ile aynı koda geri döner.
        interestType: toPrismaInterestType(bucket.interestType),
        interestStartDate: new Date(bucket.startDate),
        interestAccrualStatus: 'ACCRUES',
      },
    });
    claimItemIds.push(item.id);
  }

  // ── Payments: Collection (CONFIRMED) + PAYMENT LedgerEntry ──────────────────
  const collectionIds: string[] = [];
  const paymentLedgerEntryIds: string[] = [];
  for (const p of def.domainInput.payments) {
    const collection = await prisma.collection.create({
      data: {
        tenantId: tenant.id,
        caseId: caseRow.id,
        caseDebtorId: caseDebtor.id,
        amount: p.amount,
        currency: p.currency,
        type: 'BANK_TRANSFER',
        date: new Date(p.date),
        idempotencyKey: localId('w02-idem'),
      },
    });
    collectionIds.push(collection.id);

    const ledger = await prisma.ledgerEntry.create({
      data: {
        // Ledger id = domain Payment.id → in-memory ↔ DB eşlemesi birebir izlenebilir.
        id: p.id,
        tenantId: tenant.id,
        caseId: caseRow.id,
        collectionId: collection.id,
        entryType: 'PAYMENT',
        amount: p.amount,
        currency: p.currency,
        entryDate: new Date(p.date),
      },
    });
    paymentLedgerEntryIds.push(ledger.id);
  }

  // ── REVERSAL (Conditional Option B — direct-write, G1 zorunlu ilişki) ───────
  const reversalLedgerEntryIds: string[] = [];
  for (const rev of opts.reversals ?? []) {
    const original = await prisma.ledgerEntry.findFirst({
      where: { id: rev.ofPaymentId, tenantId: tenant.id, caseId: caseRow.id, entryType: 'PAYMENT' },
    });
    if (!original) {
      throw new Error(
        `materializeScenario: REVERSAL için orijinal PAYMENT bulunamadı (ofPaymentId=${rev.ofPaymentId}) — G1 ilişki zorunlu.`,
      );
    }
    const reversal = await prisma.ledgerEntry.create({
      data: {
        tenantId: tenant.id,
        caseId: caseRow.id,
        collectionId: original.collectionId,
        entryType: 'REVERSAL',
        amount: rev.amount ?? -Number(original.amount),
        currency: original.currency,
        entryDate: original.entryDate,
        reversesLedgerEntryId: original.id,
      },
    });
    reversalLedgerEntryIds.push(reversal.id);
  }

  return {
    scenarioId: def.id,
    tenantId: tenant.id,
    ...(secondaryTenantId ? { secondaryTenantId } : {}),
    clientId: client.id,
    debtorId: debtor.id,
    caseId: caseRow.id,
    caseDebtorId: caseDebtor.id,
    claimItemIds,
    collectionIds,
    paymentLedgerEntryIds,
    reversalLedgerEntryIds,
    writePathNote: WRITE_PATH_NOTE,
  };
}

/**
 * Materialize edilmiş senaryonun satırlarını FK-güvenli sırada siler
 * (yalnız test/disposable DB temizliği; REVERSAL self-FK Restrict olduğu için önce).
 */
export async function cleanupMaterializedScenario(
  prisma: PrismaClient,
  refs: MaterializedScenarioRefs,
): Promise<void> {
  await prisma.ledgerEntry.deleteMany({
    where: { tenantId: refs.tenantId, entryType: 'REVERSAL' },
  });
  await prisma.ledgerEntry.deleteMany({ where: { tenantId: refs.tenantId } });
  await prisma.collection.deleteMany({ where: { tenantId: refs.tenantId } });
  await prisma.claimItem.deleteMany({ where: { tenantId: refs.tenantId } });
  await prisma.caseDebtor.deleteMany({ where: { case: { tenantId: refs.tenantId } } });
  await prisma.case.deleteMany({ where: { tenantId: refs.tenantId } });
  await prisma.debtor.deleteMany({ where: { tenantId: refs.tenantId } });
  await prisma.client.deleteMany({ where: { tenantId: refs.tenantId } });
  await prisma.rateSchedule.deleteMany({ where: { tenantId: refs.tenantId } });
  const tenantIds = [refs.tenantId, ...(refs.secondaryTenantId ? [refs.secondaryTenantId] : [])];
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}
