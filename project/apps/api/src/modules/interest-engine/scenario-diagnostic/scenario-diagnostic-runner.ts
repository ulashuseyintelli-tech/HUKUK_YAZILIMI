/**
 * ADR-014 Wave 0.3 — Diagnostic Dual-Mode Runner (test/disposable DB adapter).
 *
 * Frozen owner kararı (d) — Diagnostic Dual Mode:
 * - ORGANIC_READINESS: mevcut organik-readiness davranışının semantiği
 *   DEĞİŞMEDEN tracked yüzeye taşınır — verili tenant'ın GERÇEK case'leri
 *   taranır, her biri için üretim yolu (computeCaseBalance →
 *   toCaseBalanceDisplay) gözlemlenir. QA-seed dışlama ilkesi YALNIZ bu modda
 *   ve parametrik (`excludeCaseIds`) yaşar — ortam değişkeni OKUNMAZ.
 * - SYNTHETIC_SCENARIO: yeni mod — W0.1 `ScenarioDefinition` W0.2 materializer
 *   ile disposable DB'ye kurulur, AYNI üretim yolu gözlemlenir ve W0.3
 *   evidence modeliyle expected-vs-actual karşılaştırılır.
 *
 * PrismaClient SEAM ARKASINDADIR: bu modül URL çözmez, ortam değişkeni okumaz;
 * `prisma` çağıranın SORUMLULUĞUNDA fail-safe test DB'sine bağlıdır
 * (resolveTestDatabaseUrl / hukuk_*_gate — W0.2 G6 emsali). Organik mod da
 * dahil hiçbir koşum production/shared DB'ye bu modül üzerinden BAĞLANMAZ.
 *
 * Acceptance Criteria sınırları:
 * - §7/§16: runtime authority ÜRETMEZ; production wiring YOK (statik guard).
 * - §11/§12: hukuki semantik yorumlamaz, HESAPLAMAZ — gözlemler ve karşılaştırır.
 * - §13: '@prisma/client' yalnız bu test-adapter sınırında; Nest registration YOK.
 * - GUARDRAIL: buradaki hiçbir PASS, CollectionService.cancel() production
 *   write-path'inin doğrulandığı anlamına GELMEZ (PR-1B ayrı gate).
 *
 * Çağrıldığı yerler:
 * - Test-support: __tests__/scenario-diagnostic.db-gated.integration.spec.ts
 * - Runtime çağıranı YOK — bilinçli ve statik-guard'lı (production wiring yasak).
 */
import type { PrismaClient } from '@prisma/client';
import type { ScenarioDefinition } from '../scenario-support/scenario-definition';
import {
  materializeScenario,
  MaterializedScenarioRefs,
} from '../scenario-materializer/scenario-materializer';
import {
  compareScenarioEvidence,
  extractBlockerCodes,
  ScenarioEvidenceRecord,
} from './scenario-evidence';
import { CaseBalanceService } from '../orchestration/case-balance.service';
import { toCaseBalanceDisplay } from '../orchestration/case-balance-display';
import { RateProviderService } from '../rates/rate-provider.service';
import { InterestEngineService } from '../interest-engine.service';
import { PolicyGateV2Service } from '../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../segments/segment-builder.service';
import { VersionPinningService } from '../version/version-pinning.service';
import { TBK100AllocatorService } from '../allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../allocation/claim-priority.service';
import { AllocationEngineService } from '../allocation/allocation-engine.service';

/**
 * Gerçek engine + gerçek CaseBalanceService kurulumu (repo DB-gated emsal
 * deseni; report/audit bağımlılıkları computeBalance yolunda kullanılmaz).
 */
function buildCaseBalanceService(prisma: PrismaClient): CaseBalanceService {
  const engine = new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    {} as never, // reportRenderer — computeBalance() yolunda kullanılmaz
    {} as never, // auditWriter — yalnız calculate() orkestratöründe
    new VersionPinningService(),
    undefined,
  );
  return new CaseBalanceService(
    prisma as never,
    new RateProviderService(prisma as never),
    engine,
  );
}

export interface SyntheticDiagnosticOptions {
  /** Yıllık oran (LEGAL_3095 seed'i; default 0.24). Hukuki yorum DEĞİL — kurulum verisi. */
  annualRate?: number;
}

export interface SyntheticDiagnosticRun {
  evidence: ScenarioEvidenceRecord;
  /** Cleanup ÇAĞIRANIN sorumluluğunda: cleanupMaterializedScenario(prisma, refs). */
  refs: MaterializedScenarioRefs;
}

/**
 * Minimal prerequisite kurulumu (§15): senaryonun koşabilmesi için gereken
 * RateSchedule satırı + Office köprüsü. Şema gerçeği: `RateSchedule.tenantId`
 * FK'sı `Office.id`'ye bağlıdır; runtime sorgusu (RateProviderService) ise
 * computeCaseBalance'ın Tenant.id'siyle filtreler — ikisi ancak
 * `Office.id == Tenant.id` iken buluşur (`Office.tenantId @unique`).
 * W0.2 DB-gated spec'inin doğruladığı köprü kurulumuyla birebir aynıdır.
 */
async function seedLegalRate(
  prisma: PrismaClient,
  tenantId: string,
  annualRate: number,
): Promise<void> {
  await prisma.office.create({
    data: { id: tenantId, tenantId, name: `W0.3 Diagnostic Office (${tenantId})` },
  });
  await prisma.rateSchedule.create({
    data: {
      tenantId,
      interestType: 'LEGAL_3095',
      validFrom: new Date('2020-01-01'),
      validTo: null,
      annualRate,
      source: 'MANUAL',
      versionHash: 'w03-diagnostic-seed',
    },
  });
}

/**
 * SYNTHETIC_SCENARIO modu: ScenarioDefinition → materialize → gerçek üretim
 * yolu gözlemi → expected-vs-actual karşılaştırma → evidence kaydı.
 */
export async function runSyntheticScenarioDiagnostic(
  prisma: PrismaClient,
  def: ScenarioDefinition,
  opts: SyntheticDiagnosticOptions = {},
): Promise<SyntheticDiagnosticRun> {
  const refs = await materializeScenario(prisma, def);
  await seedLegalRate(prisma, refs.tenantId, opts.annualRate ?? 0.24);

  const service = buildCaseBalanceService(prisma);
  const balance = await service.computeCaseBalance(
    refs.tenantId,
    refs.caseId,
    def.domainInput.asOfDate,
  );
  const display = toCaseBalanceDisplay({
    tenantId: refs.tenantId,
    caseId: refs.caseId,
    balance,
  });

  const comparison = compareScenarioEvidence(def.expected, display);
  const evidence: ScenarioEvidenceRecord = {
    scenarioId: def.id,
    mode: 'SYNTHETIC_SCENARIO',
    classifications: [
      'Deterministic Setup',
      'Expected Evidence',
      'Actual Runtime Observation',
      'Diagnostic Output',
    ],
    observedAuthority: display.authority,
    observedStatus: display.status,
    observedBlockerCodes: extractBlockerCodes(display),
    expected: def.expected,
    comparison,
  };
  return { evidence, refs };
}

export interface OrganicDiagnosticOptions {
  tenantId: string;
  /** Deterministik gözlem tarihi (ISO YYYY-MM-DD) — zorunlu, "bugün" okunmaz. */
  asOfDate: string;
  /**
   * QA-seed dışlama ilkesinin parametrik hali — YALNIZ organik modda vardır
   * (frozen d). Synthetic mod dışlama taşımaz.
   */
  excludeCaseIds?: string[];
  /** Taranacak en fazla case sayısı (default 50; deterministik createdAt sırası). */
  limit?: number;
}

/**
 * ORGANIC_READINESS modu: verili tenant'ın gerçek case'lerini tarar ve her
 * biri için üretim yolunun gözlemini evidence olarak döndürür. Beklenti
 * sözleşmesi YOKTUR (expected/comparison alanları bilinçli boş) — organik
 * koşum readiness GÖZLEMİDİR, senaryo doğrulaması değil.
 */
export async function runOrganicReadinessDiagnostic(
  prisma: PrismaClient,
  opts: OrganicDiagnosticOptions,
): Promise<ScenarioEvidenceRecord[]> {
  const excluded = opts.excludeCaseIds ?? [];
  const cases = await prisma.case.findMany({
    where: {
      tenantId: opts.tenantId,
      ...(excluded.length > 0 ? { id: { notIn: excluded } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: opts.limit ?? 50,
    select: { id: true },
  });

  const service = buildCaseBalanceService(prisma);
  const records: ScenarioEvidenceRecord[] = [];
  for (const row of cases) {
    const balance = await service.computeCaseBalance(opts.tenantId, row.id, opts.asOfDate);
    const display = toCaseBalanceDisplay({
      tenantId: opts.tenantId,
      caseId: row.id,
      balance,
    });
    records.push({
      scenarioId: `organic:${row.id}`,
      mode: 'ORGANIC_READINESS',
      classifications: ['Actual Runtime Observation', 'Diagnostic Output'],
      observedAuthority: display.authority,
      observedStatus: display.status,
      observedBlockerCodes: extractBlockerCodes(display),
    });
  }
  return records;
}
