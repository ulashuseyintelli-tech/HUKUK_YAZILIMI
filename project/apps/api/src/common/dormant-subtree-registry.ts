/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F06-DORMANT-ASYNC-SUBTREE-DISPOSITION-R01.
 *
 * Fresh (2026-08-02) repository-wide taramayla türetilmiş, her dormant/config-gated
 * async alt ağacın CANONICAL kaderini kaydeden makine-okunur envanter.
 *
 * KAPSAM SINIRI: Bu dosya hiçbir şeyi AKTİVE ETMEZ. `bindingExpectation: 'UNBOUND'`
 * olan girdiler AppModule import kapanışına ASLA bağlanmamalıdır (bkz.
 * `w3-async-runtime-binding.static-guard.spec.ts` — "W3-F06" describe bloğu, bu
 * registry'yi okuyup ihlali derleme-zamanında değil ama CI'da kırmızı yapar).
 * `bindingExpectation: 'BOUND_FLAG_GATED'` olan TEK girdi (CALC-PREVIEW-TRACE-RETENTION)
 * DI'a bağlıdır (test edilebilir/çağrılabilir) ama runtime davranışı (cleanup timer)
 * default-OFF bir env flag'e bağlıdır — production davranışı bu PR ile DEĞİŞMEZ.
 * `bindingExpectation: 'REMOVED'` olan tek girdi (CALC-PREVIEW-DIAGNOSTICS-SIMULATION-SCHEDULER)
 * dosyaları fiziksel olarak repo'dan kaldırılmıştır.
 *
 * Tarihsel (ESKİ) W3-D03 bulgusu "icrabot, manifest-retry, playbook, evidence-bundle,
 * trace-retention, simulation-scheduler" olarak 6 alt ağaç listeliyordu — bu envanter
 * o listeyi ground-truth KABUL ETMEDEN fresh olarak yeniden türetmiştir; 5 isim
 * `calc-preview/diagnostics/` altında iç içe bulunmuştur (üst-düzey modül DEĞİL),
 * "icrabot" etiketi kısmen yanlıştır (v28-engine ve domain-event-ingest ALREADY
 * ACTIVE + certified — bu registry'de YOK, çünkü zaten dormant değiller).
 *
 * Zaten aktif/sertifikalı olup YANLIŞLIKLA dormant sanılmaması gereken alt ağaçlar
 * (registry'de YOK, kapsam dışı): ICRABOT-V28-ENGINE, ICRABOT-DOMAIN-EVENT-INGEST,
 * SIMULATION-API+TRUTH-LAYER, LEGAL-DEADLINE (LEGAL_TIME_CUTOVER flag'i ile normal
 * feature-gate, W3 async/queue/scheduler kapsamı DIŞINDA), CASE-DEBTOR-LIFECYCLE-GUARD.
 */

export type DormantSubtreeDisposition =
  | 'KEEP_DORMANT_CONFIG_GATED'
  | 'BLOCKED_BY_MISSING_POLICY'
  | 'BLOCKED_BY_MISSING_RUNTIME_DEPENDENCY'
  | 'ACTIVATE_FLAG_GATED'
  | 'REMOVE_DEAD_CODE';

/**
 * UNBOUND: rootPath altındaki hiçbir dosya, AppModule import-kapanışındaki HERHANGİ
 *   bir modülün providers/controllers listesinde GÖRÜNMEMELİDİR.
 * BOUND_FLAG_GATED: rootPath'in kök servisi ARTIK DI'a bağlıdır (guard bunu da
 *   doğrular — "artık bağlı" beklentisi tersine döner), ama runtime yan etkisi
 *   activationFlag ile default-OFF gate'lidir.
 * REMOVED: rootPath'teki dosyalar fiziksel olarak silinmiştir; guard hem dosyaların
 *   yokluğunu hem de kaldırılan sembol adlarının başka hiçbir dosyada YENİDEN
 *   belirmediğini doğrular.
 */
export type BindingExpectation = 'UNBOUND' | 'BOUND_FLAG_GATED' | 'REMOVED';

export type DormantSubtreeRecord = {
  subtreeId: string;
  /** apps/api/src köküne göre dizin öneki (REMOVED için: kaldırılan tam dosya yolu). */
  rootPath: string;
  disposition: DormantSubtreeDisposition;
  bindingExpectation: BindingExpectation;
  /** BOUND_FLAG_GATED disposition'ında runtime davranışını kapatan env flag adı. */
  activationFlag: string | null;
  /** Aynı canonical yeteneği sağlayan, ZATEN AKTİF alternatif yol (varsa). */
  canonicalReplacement: string | null;
  /** Owner kararının kaynağı (proje hafızası / governance kaydı / null = henüz yok). */
  ownerDecisionRef: string | null;
  primaryCause: string;
  secondaryCause: string | null;
  notes: string;
  /**
   * rootPath altında yaşayan ama ZATEN AKTİF olan (bu disposition'ın KAPSAMI
   * DIŞINDA kalan) dosyalar — yalnız UNBOUND beklentisinde "hiçbir dosya bound
   * değil" kontrolünden istisna tutulur. Çoğu girdi için boş.
   */
  knownActiveFilesWithinRootPath?: readonly string[];
};

export const DORMANT_SUBTREE_REGISTRY: readonly DormantSubtreeRecord[] = [
  {
    subtreeId: 'ICRABOT-LEGACY-CORE',
    rootPath: 'modules/icrabot',
    disposition: 'KEEP_DORMANT_CONFIG_GATED',
    bindingExpectation: 'UNBOUND',
    activationFlag: null,
    canonicalReplacement: null,
    ownerDecisionRef: 'UYAP master talimat reconciliation — KARARLAR 1-11 accepted, icrabot dormant',
    primaryCause: 'MODULE_UNBOUND',
    secondaryCause: 'OWNER_POLICY_PENDING',
    notes:
      '~150 dosya, 27 kendine-özgü Prisma tablosu, 82 icra/haciz/tahsilat/tebligat recipe\'si. ' +
      'Otomatik hukuki işlem yeteneği barındırdığı için (section 8 executor-yasağı) bu task ' +
      'kapsamında AKTİVE EDİLMEDİ. app.module.ts:108-109,249 mevcut yorum-satırı gating\'i ' +
      '(resmi bir feature-flag DEĞİL) faydalanılabilir ama W3-F06 kapsamında DEĞİŞTİRİLMEDİ ' +
      '— sadece mevcut durum kayıt altına alındı. v28-engine (outbox) ve domain-event-ingest ' +
      'alt-parçaları AYRI ve ZATEN AKTİF/sertifikalı — modules/icrabot/ altında fiziksel olarak ' +
      'yaşarlar ama bu registry girdisinin KAPSAMI DIŞINDADIR (bkz. knownActiveFilesWithinRootPath).',
    knownActiveFilesWithinRootPath: [
      'modules/icrabot/v28-engine',
      'modules/icrabot/domain-event-ingest',
    ],
  },
  {
    subtreeId: 'OBJECT-STORE-EVIDENCE-BUNDLE-S3',
    rootPath: 'modules/calc-preview/diagnostics/object-store',
    disposition: 'BLOCKED_BY_MISSING_POLICY',
    bindingExpectation: 'UNBOUND',
    activationFlag: 'EVIDENCE_BUNDLE_S3_ENABLED',
    canonicalReplacement: 'simulation-api/simulation TruthLayerModule (Postgres SNAPSHOT_STORE) — ZATEN AKTİF',
    ownerDecisionRef: null,
    primaryCause: 'MODULE_UNBOUND',
    secondaryCause: 'CONFIG_GATED_OFF',
    notes:
      'EvidenceBundleModule.forRoot() hiçbir production modülünde çağrılmaz (yalnız kendi testi). ' +
      'Flag default false, ama flag true olsa dahi hiçbir tetikleyici yok. Aynı isimdeki AKTİF ' +
      '`EvidenceBundleController`/`EvidenceBundleService` (simulation-api altında) FARKLI bir ' +
      'sistemdir — bu ikisini KARIŞTIRMA. S3 mimarisinin hâlâ istenip istenmediği owner kararı ' +
      'gerektirir (bkz. OBJECT-STORE-BUNDLE-MANIFEST, OBJECT-STORE-BUNDLE-SEAL — aynı aile). ' +
      'rootPath ayrıca manifest-retry/ alt dizinini de kapsar (nested) — o AYRI bir registry ' +
      'girdisidir (bkz. knownActiveFilesWithinRootPath, aynı 2 guard istisnası orada da geçerli).',
    knownActiveFilesWithinRootPath: [
      'modules/calc-preview/diagnostics/object-store/manifest-retry/guards/manifest-admin-auth.guard.ts',
      'modules/calc-preview/diagnostics/object-store/manifest-retry/guards/manifest-admin-rate-limiter.service.ts',
    ],
  },
  {
    subtreeId: 'OBJECT-STORE-BUNDLE-MANIFEST',
    rootPath: 'modules/calc-preview/diagnostics/object-store/bundle-manifest',
    disposition: 'BLOCKED_BY_MISSING_POLICY',
    bindingExpectation: 'UNBOUND',
    activationFlag: null,
    canonicalReplacement: null,
    ownerDecisionRef: null,
    primaryCause: 'MODULE_UNBOUND',
    secondaryCause: null,
    notes: 'OBJECT-STORE-EVIDENCE-BUNDLE-S3 ile aynı owner kararına bağlı (Phase 9C S3 mimarisi ailesi).',
  },
  {
    subtreeId: 'OBJECT-STORE-BUNDLE-SEAL',
    rootPath: 'modules/calc-preview/diagnostics/object-store/bundle-seal',
    disposition: 'BLOCKED_BY_MISSING_POLICY',
    bindingExpectation: 'UNBOUND',
    activationFlag: null,
    canonicalReplacement: null,
    ownerDecisionRef: null,
    primaryCause: 'MODULE_UNBOUND',
    secondaryCause: null,
    notes: 'OBJECT-STORE-EVIDENCE-BUNDLE-S3 ile aynı owner kararına bağlı (Phase 9C S3 mimarisi ailesi).',
  },
  {
    subtreeId: 'OBJECT-STORE-MANIFEST-RETRY',
    rootPath: 'modules/calc-preview/diagnostics/object-store/manifest-retry',
    disposition: 'BLOCKED_BY_MISSING_RUNTIME_DEPENDENCY',
    bindingExpectation: 'UNBOUND',
    activationFlag: null,
    canonicalReplacement: null,
    ownerDecisionRef: null,
    primaryCause: 'MODULE_UNBOUND',
    secondaryCause: 'SCHEMA_ABSENT',
    notes:
      '17 test dosyasıyla en olgun dormant alt ağaç (ManifestAdminController, DLQ/redrive akışı). ' +
      'CalcPreviewModule yalnız 3 guard sınıfından 2\'sini (ManifestAdminAuthGuard, ' +
      'ManifestAdminRateLimiter — ManifestAdminRateLimitGuard AYNI dosyada 2. export) hedefsiz ' +
      'olarak provider listesine alır (korunacak route yok — bilinçli ama anlamsız bağlı istisna, ' +
      'bkz. knownActiveFilesWithinRootPath). KRİTİK BOŞLUK: `manifest_retry_queue` tablosu ham SQL ' +
      'ile kullanılıyor ama schema.prisma\'da karşılık gelen bir `model` bloğu YOK (bağımsız ' +
      'doğrulandı) — ACTIVATE öncesi şema boşluğu ayrı bir task\'ta kapatılmalı.',
    knownActiveFilesWithinRootPath: [
      'modules/calc-preview/diagnostics/object-store/manifest-retry/guards/manifest-admin-auth.guard.ts',
      'modules/calc-preview/diagnostics/object-store/manifest-retry/guards/manifest-admin-rate-limiter.service.ts',
    ],
  },
  {
    subtreeId: 'OBJECT-STORE-MANIFEST-RETRY-IDEMPOTENCY',
    rootPath: 'modules/calc-preview/diagnostics/object-store/manifest-retry/idempotency',
    disposition: 'BLOCKED_BY_MISSING_RUNTIME_DEPENDENCY',
    bindingExpectation: 'UNBOUND',
    activationFlag: null,
    canonicalReplacement: null,
    ownerDecisionRef: null,
    primaryCause: 'MODULE_UNBOUND',
    secondaryCause: null,
    notes: 'OBJECT-STORE-MANIFEST-RETRY ile aynı owner kararına bağlı (aynı şema boşluğu).',
  },
  {
    subtreeId: 'CALC-PREVIEW-CHAOS',
    rootPath: 'modules/calc-preview/chaos',
    disposition: 'KEEP_DORMANT_CONFIG_GATED',
    bindingExpectation: 'UNBOUND',
    activationFlag: 'ENABLE_CHAOS_ENDPOINTS',
    canonicalReplacement: null,
    ownerDecisionRef: 'eslint-architecture.rules.js — "Chaos module cannot be imported in production code"',
    primaryCause: 'CONFIG_GATED_OFF',
    secondaryCause: 'TEST_ONLY',
    notes:
      'Bilinçli prod-safety tasarımı: NODE_ENV==="production" hard-disable + ' +
      'ENABLE_CHAOS_ENDPOINTS default-off + mevcut ESLint mimari kuralı production import\'unu ' +
      'zaten engelliyor. Bu task kapsamında off-state (sıfır route/registration) kanıtlayan bir ' +
      'test eklendi (önceden hiç test yoktu) — kodun kendisi değiştirilmedi.',
  },
  {
    subtreeId: 'CALC-PREVIEW-BREAK-GLASS-TENANT-CONTEXT',
    rootPath: 'modules/calc-preview/break-glass',
    disposition: 'BLOCKED_BY_MISSING_POLICY',
    bindingExpectation: 'UNBOUND',
    activationFlag: null,
    canonicalReplacement: null,
    ownerDecisionRef: null,
    primaryCause: 'MODULE_UNBOUND',
    secondaryCause: 'SCHEMA_ABSENT',
    notes:
      'Cross-tenant break-glass erişimi — güvenlik/uyumluluk politikası owner kararı gerektirir ' +
      '(section 8 executor-yasağı: yeni irreversible side effect). Ayrıca TÜM repository\'ler ' +
      '(audit/grant/post-mortem/circuit-breaker) In-Memory — Prisma\'ya hiç bağlanmamış, kalıcılık ' +
      'yok. TenantContextModule (@Global) yalnız BreakGlassModule üzerinden import edildiği için ' +
      'o da aynı şekilde asılı kalır.',
  },
  {
    subtreeId: 'CALC-PREVIEW-PLAYBOOK-ACTION-SIDE',
    rootPath: 'modules/calc-preview/diagnostics/playbook',
    disposition: 'BLOCKED_BY_MISSING_POLICY',
    bindingExpectation: 'UNBOUND',
    activationFlag: null,
    canonicalReplacement: null,
    ownerDecisionRef: null,
    primaryCause: 'MODULE_UNBOUND',
    secondaryCause: null,
    notes:
      'PlaybookModule (ActionPolicyGuard/ActionLeaseManager/ActionExecutor/PlaybookAuditService/' +
      'NotificationService/EscalationService/HysteresisEscalationService/PlaybookService + 3 ' +
      'controller) hiçbir yerden import edilmez. ActionExecutor otomatik aksiyon yürütme yeteneği ' +
      'taşıdığı için (section 8 executor-yasağı) owner kararı gerekir. DİKKAT: aynı dizindeki ' +
      '`PlaybookYAMLValidator`/`PlaybookRegistry`/`PlaybookMatcher` (diagnostics.module.ts tarafından ' +
      'PlaybookModule BYPASS edilerek doğrudan import edilir) ve `EscalationStateRepository` ' +
      '(simulation-api.module.ts tarafından import edilir) ZATEN AKTİF — bu registry rootPath\'i ' +
      'yalnız guard\'ın generic "hiçbir dosya bound değil" kontrolü için kullanılmaz; guard bu ' +
      'girdi için özel olarak yalnız dormant sınıf adlarını kontrol eder (bkz. static guard).',
    knownActiveFilesWithinRootPath: [
      'modules/calc-preview/diagnostics/playbook/playbook-yaml-validator.service.ts',
      'modules/calc-preview/diagnostics/playbook/playbook-registry.service.ts',
      'modules/calc-preview/diagnostics/playbook/playbook-matcher.service.ts',
      'modules/calc-preview/diagnostics/playbook/escalation-state.repository.ts',
    ],
  },
  {
    subtreeId: 'CALC-PREVIEW-TRACE-RETENTION',
    rootPath: 'modules/calc-preview/trace/trace-retention.service.ts',
    disposition: 'ACTIVATE_FLAG_GATED',
    bindingExpectation: 'BOUND_FLAG_GATED',
    activationFlag: 'TRACE_RETENTION_ENABLED',
    canonicalReplacement: null,
    ownerDecisionRef: null,
    primaryCause: 'CONSUMER_ABSENT',
    secondaryCause: 'MODULE_UNBOUND',
    notes:
      'Kazara eksik provider (bug, kasıtlı dormancy DEĞİL): TraceRetentionService yapıcısında ' +
      'kendi kendine başlayan bir setInterval cleanup-timer var ama servis CalcPreviewModule ' +
      'providers listesinde hiç yoktu — bu yüzden AKTİF olan TraceStorageService\'in ürettiği ' +
      'trace verisi için HİÇBİR otomatik temizleme çalışmıyordu. Bu task kapsamında provider ' +
      'olarak eklendi (artık DI ile test edilebilir/çağrılabilir) ama gerçek cleanup-timer ' +
      'başlatma davranışı yeni TRACE_RETENTION_ENABLED flag\'i (default false) ile gate\'lendi — ' +
      'production davranışı bu PR ile DEĞİŞMEDİ, yalnız artık AÇILABİLİR hale geldi.',
  },
  {
    subtreeId: 'CALC-PREVIEW-DIAGNOSTICS-SIMULATION-SCHEDULER',
    rootPath: 'modules/calc-preview/diagnostics/simulation/simulation-scheduler.service.ts',
    disposition: 'REMOVE_DEAD_CODE',
    bindingExpectation: 'REMOVED',
    activationFlag: null,
    canonicalReplacement: null,
    ownerDecisionRef: null,
    primaryCause: 'LEGACY_DEAD_CODE',
    secondaryCause: 'MODULE_UNBOUND',
    notes:
      'RealSimulationScheduler/ManualSimulationScheduler/ISimulationScheduler/SimulationContext ' +
      'zinciri repo genelinde (testler DAHİL) sıfır referans taşıyordu — bağımsız doğrulandı. ' +
      'Dosya + simulation.types.ts\'teki iki ölü interface + simulation/index.ts barrel export ' +
      'satırı kaldırıldı.',
  },
] as const;
