# P3 — UYAP Geçici Arıza (Temporary Outage) Soft-Warning Policy — PLAN

> Durum: PLAN (kod yazılmadı). Onay sonrası gate-by-gate uygulanacak.
> Tarih: 2026-06-13 · Branch hedefi: yeni `feat/policy-uyap-temporary-outage`

## 1. Onaylı ürün kararları (girdi)

| # | Karar | Değer |
|---|-------|-------|
| Q1 | Outage kaynağı | **Ops feature-flag / config toggle** (env var). Gerçek health-check (uyap.service.ts:781 TODO) AYRI/sonraki iş. |
| Q2 | Fact adı | **`system.uyap_available`** (global). `case.uyap_enabled` legacy/yanlış model sayıldı; scenario 7 bu fact'e taşınır. |
| Q3 | Davranış | `UYAP_QUERY` → **allow + warning** · `UYAP_SEND` → **block** |
| Q4 | Uyarı | severity **WARNING** + metin birebir **"UYAP sistemi geçici olarak devre dışı"** |

Karıştırma yasağı: `case.allow_uyap_actions` (per-case KALICI HARD blok, UYAP_DISABLED gate) ile outage ALAKASIZ. Ayrı fact, ayrı gate.

## 2. Multitenant analizi (CLAUDE.md gereği)

- UYAP ulusal bir sistemdir; geçici arıza **tüm tenant/büroları aynı anda** etkiler.
- Dolayısıyla `system.uyap_available` **GLOBAL/sistem seviyesi** bir sinyaldir — per-tenant veya per-case DEĞİL. "DB ayakta mı" gibi altyapı sinyali. Env flag (process-wide) doğru kapsam.
- Multitenant akışı BOZMAZ: tenant verisine dokunmaz, sadece cross-cutting bir computed fact ekler.
- Operasyonel uyarı: env flag her API instance'ında set edilmeli (çok-instance dağıtımda). MVP için kabul; ileride shared config/Redis veya gerçek health-check'e taşınabilir (temiz seam aşağıda).

## 3. Mevcut mimari (kanıtlı seam'ler)

- Akış: `CPE.canPerformAction` → `factStore.getFacts` → **`computedFactRegistry.computeAll`** (case-policy-engine.service.ts:128) → `gateChecker.checkGates`.
- Computed fact deseni: `ComputedFactProvider` (P2 precedent: `CaseObjectionPeriodDaysProvider`, computed-fact-registry.ts:252).
- Feature-flag deseni: `SimulationFeatureFlagService` (env var, default-enabled `value !== 'false'`, interface + token + Mock).
- SOFT→warning: gate-checker softWarnings (gate-checker.service.ts:46,83-87, severity hardcode `WARNING`) → CPE buildDecision `warnings: gateResult.softWarnings` (case-policy-engine.service.ts:186).
- gates.compiled.ts: başlık "@generated / compile:rules" diyor ama **compile:rules script'i ve YAML pipeline'ı YOK** → dosya doğrudan elle düzenlenir. RULE_VERSION elle bump.

## 4. KRİTİK tasarım riski ve çözümü (test ezme)

`computeAll` her provider için `facts.set(factKey, value)` yapar → provider env'den `true` dönerse, testin DB-mock ile verdiği `system.uyap_available:false`'u **EZER**. Sonuç: scenario 7'yi generic loop'ta düz fact ile yeşil yapmak mümkün değil.

**Çözüm:** Provider'ı `UyapAvailabilityService` (DI + Mock) ile besle. Outage senaryosunu generic `ALL_SCENARIOS` loop'undan çıkar, **mock'u outage'a çeken adanmış bir test bloğuna** taşı. Generic loop'taki tüm senaryolar "UYAP available" (default) varsayar; outage explicit test edilir. (Q2 "scenario 7 yeni fact'e taşınsın" kararıyla uyumlu — taşıma mekanizması budur.)

## 5. Gate listesi (gates.compiled.ts)

İki gate, AYNI koşul `facts.get('system.uyap_available') === false` (undefined → tetiklenmez = fail-safe available):

| gateCode | severity | actionCodes | priority | reason |
|----------|----------|-------------|----------|--------|
| `UYAP_TEMPORARILY_UNAVAILABLE` | SOFT | `[UYAP_QUERY]` | 105 | `UYAP sistemi geçici olarak devre dışı` |
| `UYAP_TEMPORARILY_UNAVAILABLE_SEND` | HARD | `[UYAP_SEND]` | 12 | `UYAP sistemi geçici olarak devre dışı. Gönderim yapılamaz.` |

- SOFT reason metni testin beklediği string'le **birebir** (warning mesajı = gate.reason).
- HARD priority 12: UYAP_DISABLED(11) hemen sonrası; mevcut HARD sıralamasını bozmaz.
- Kapsam sınırı (bilinçli): yalnız `UYAP_SEND` bloklanır. `SEND_NOTIFICATION` / `SEND_PAYMENT_ORDER` da UYAP'a gidiyorsa ileride eklenebilir — Q3 net olarak yalnız UYAP_SEND dedi, scope büyütülmüyor.
- RULE_VERSION: `gates-v1.0.0-compiled-2026-01-13` → `gates-v1.1.0-compiled-2026-06-13` + COMPILED_AT güncelle. (İsteğe bağlı: @generated başlık notu "pipeline yok, elle bakılır" şeklinde düzeltilebilir — ana işi büyütmemek için opsiyonel.)

## 6. Değişecek dosyalar (impact scope)

1. **YENİ** `fact-store/uyap-availability.service.ts` — `SimulationFeatureFlagService` aynası: env `UYAP_AVAILABLE` (default true, `!== 'false'`), interface `IUyapAvailabilityService.isUyapAvailable()`, DI token, `MockUyapAvailabilityService`.
2. `fact-store/computed-fact-registry.ts` — yeni `SystemUyapAvailableProvider` (factKey `system.uyap_available`, dependsOn `[]`, compute → `svc.isUyapAvailable()`). `ComputedFactRegistry`'ye `UyapAvailabilityService` DI; `registerBuiltInProviders` içinde `new SystemUyapAvailableProvider(this.uyapAvailability)`.
3. `fact-store/index.ts` — yeni export'lar.
4. `policy-engine.module.ts` — `UyapAvailabilityService` provider kaydı (gerekirse export).
5. `gate-checker/compiled/gates.compiled.ts` — 2 gate + RULE_VERSION/COMPILED_AT bump.
6. `__tests__/case-policy-engine.spec.ts` — scenario 7 → `system.uyap_available:false`; test modülüne `UyapAvailabilityService` mock; outage senaryosunu adanmış describe'a taşı.

## 7. Etkilenen çağıranlar (CLAUDE.md "kim çağırıyor")

`CPE.canPerformAction` UYAP aksiyonları için çağıran adaylar (kod fazında her biri "blocked decision'ı zaten ele alıyor mu" diye TEK TEK doğrulanacak):
- `uyap/uyap.controller.ts`, `uyap/uyap.service.ts`
- `automation/workflow-engine.service.ts`
- `stage-trigger/stage-trigger.service.ts`
- `icrabot/v28-engine/v28-engine.controller.ts`

Davranış değişikliği: outage'da `UYAP_SEND` → blocked decision döner (çağıranlar zaten blocked decision pattern'ini işliyor). `UYAP_QUERY` → allow + `decision.warnings`. Diğer aksiyonlar ETKİLENMEZ. `allow_uyap_actions` HARD akışına DOKUNULMAZ.

## 8. Test planı

Birim (adanmış describe, mock outage):
- `system.uyap_available=false` + `UYAP_QUERY` → `blocked:false` + softWarning, mesaj = "UYAP sistemi geçici olarak devre dışı".
- `system.uyap_available=false` + `UYAP_SEND` → `blocked:true` (HARD).
- `system.uyap_available=true` → uyarı yok; QUERY allow, SEND (diğer gate'ler geçerse) allow.
- İzolasyon: `allow_uyap_actions=false` (UYAP_DISABLED HARD) ile outage flag birbirini ETKİLEMEZ (her iki yönde).

Entegrasyon: scenario 7 yeşili (Tur1/Tur2) + registry-aktif fixture ile uçtan uca.

## 9. Uygulama sırası (gate-by-gate, her adım onaylı)

1. `uyap-availability.service.ts` + Mock → modül kaydı (derleme yeşili).
2. `SystemUyapAvailableProvider` + registry DI + index export → mevcut testler hâlâ yeşil (default available, davranış değişmez).
3. gates.compiled.ts 2 gate + RULE_VERSION bump.
4. Birim testleri (adanmış describe).
5. scenario 7 taşıma + spec mock → entegrasyon yeşili.
6. Çağıran doğrulaması (Bölüm 7) + tam suite.

## 10. Açık not / sonraki iş (bu PR DIŞI)

- Gerçek UYAP health-check (uyap.service.ts:781) ileride `UyapAvailabilityService.isUyapAvailable()` arkasına delege edilebilir — env flag'i otomatik sinyalle değiştirir, gate/fact aynı kalır (temiz seam).
- Çok-instance'ta env flag senkronu (shared config) gerekebilir.
