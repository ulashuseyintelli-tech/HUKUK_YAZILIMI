# UYAP_SEND Hard-Gate Preflight R02 v1.0

```text
Task              : UYAP-SEND-HARD-GATE-PREFLIGHT-R02
Tür               : SECURITY / POLICY-ENGINE FAIL-CLOSED HARDENING
Durum             : IMPLEMENTED — bounded patch (owner §17 yetkisi)
Tarih             : 2026-07-28
Kanıt tabanı      : canonical main `7ba5c279`
Yetki             : Owner `GO-COMPLETE — UYAP-SEND-HARD-GATE-PREFLIGHT-R02`
                    §17 BOUNDED IMPLEMENTATION (ayrı owner izni beklenmeden düzeltme)
Öncüller (MERGED) : `dde01ca2` (I01) · `e20b36ff` (I02) · `d778d3bb` (I03) ·
                    `8b0fc020` (I04) · `19a88b20` (I04B)
REAL TRANSPORT    : NOT AUTHORIZED
PRODUCTION CUTOVER: HARD HOLD
```

Bu belge **kayıttır**; yeni hukuk veya ürün semantiği üretmez. Owner'ın
§4 GLOBAL FAIL-CLOSED kuralının repository'deki karşılığını ölçer ve kapatılan
boşlukları kanıtla listeler.

---

## 1. Owner kuralı ve ölçüm

> §4 — Aşağıdakiler izin üretemez: `undefined`, `null`, provider exception,
> missing case, missing tenant, missing actor, missing fact, default assumption,
> legacy/manual flag, client-provided authority data.

Ölçüm yöntemi: `UYAP_SEND` için uygulanan HER gate'in `condition`'ı okundu ve
"fact YOKSA ne olur?" sorusu tek tek yanıtlandı.

| Sınıf (owner §17) | Ölçüm | Disposition |
|---|---|---|
| missing fact → fail-open | `CASE_CLOSED`/`CASE_ARCHIVED` yalnız `=== true`; `UYAP_DISABLED` yalnız `=== false`; `EXPENSE_BLOCKING` yalnız `=== true` | **AÇIK → bu PR ile KAPANDI** |
| undefined availability → true default | `UyapAvailabilityService.isUyapAvailable()` env tanımsızken `true` döner | **AÇIK → bu PR ile KAPANDI** |
| provider exception → fail-open | `ComputedFactRegistry.computeAll` provider hatasını yutar → fact YAZILMAZ | **AÇIK (dolaylı) → bu PR ile KAPANDI** |
| gate condition exception | `GateCheckerService.checkGates` catch → HARD gate'te blocked | ZATEN KAPALI |
| missing case | `CasePolicyEngine.evaluateDecision` → `CASE_NOT_FOUND` (deny) | ZATEN KAPALI |
| missing tenant | `assertCaseBelongsToTenant` → `ForbiddenException` / `NotFoundException` | ZATEN KAPALI (DEBTOR-IDOR-02) |
| missing actor | `POWER_OF_ATTORNEY_MISSING` → `actor.is_canonical_lawyer !== true` | ZATEN KAPALI (I04) |
| sistem hatası → izin | `getFailMode(UYAP_SEND) = 'CLOSED'` + `RiskLevel.HIGH` → `SYSTEM_ERROR_BLOCKED` | ZATEN KAPALI |
| legacy/manual flag | Granular authority + expense + availability fact'lerinin tamamı computed provider tarafından ÜZERİNE YAZILIR | ZATEN KAPALI (I04/I04B) — regresyon testi eklendi |
| client-provided authority data | `context.actingLawyerId` server-side yeniden çözülür; uyuşmazlık `denyAll` | ZATEN KAPALI (I03/I04) |

---

## 2. Uygulanan bounded patch

### 2.1 Yeni HARD gate — `UYAP_SEND_PRECONDITIONS_UNPROVEN`

`gates.compiled.ts`, priority **13**, `actionCodes: [UYAP_SEND]`.

```ts
condition: (facts) =>
  facts.get('case.is_closed') !== false ||
  facts.get('case.is_archived') !== false ||
  facts.get('case.allow_uyap_actions') !== true ||
  facts.get('case.has_unpaid_blocking_expense') !== false ||
  facts.get('system.uyap_available') !== true ||
  facts.get('system.uyap_availability_explicit') !== true,
```

**Neden yeni gate, neden mevcut gate'lerin düzeltilmesi değil:** `CASE_CLOSED`,
`CASE_ARCHIVED` ve `UYAP_DISABLED` wildcard/çok-action gate'leridir. Koşullarını
`!== false` / `!== true` yönüne çevirmek **bütün action'ları** etkilerdi ve bu
görevin kapsamı dışında bir davranış değişikliği olurdu. Bunun yerine mevcut
gate'lerin semantiği **aynen korundu**; boşluk yalnız `UYAP_SEND` için kapatıldı.

**Mesaj kalitesi korunur:** yeni gate priority 13'tedir; pozitif bir kötü-durum
sinyali varsa (dosya kapalı, arşivde, UYAP kapalı, masraf engeli, geçici arıza)
daha düşük priority'li spesifik gate önce döner ve kullanıcı jenerik değil
**doğru** gerekçeyi görür. Yeni gate yalnız "kanıt yok" halinde konuşur.

### 2.2 Operasyonel sinyal — "yapılandırılmamış" ≠ "available"

`UyapAvailabilityService.isAvailabilityExplicitlyConfigured()` eklendi:
`UYAP_AVAILABLE` env'i tanımsız veya boş ise `false`. `isUyapAvailable()`
davranışı **değişmedi** (regresyon testiyle kilitlendi) — diğer action'lardaki
outage semantiği aynı kaldı.

`SystemUyapAvailableProvider` artık ikinci bir fact yazar:
`system.uyap_availability_explicit`. Provider bir exception atarsa **her iki**
fact de fail-closed yazılır.

**Operasyonel sonuç (bilinçli):** `UYAP_AVAILABLE` runtime env'de açıkça
ayarlanmadıkça `UYAP_SEND` bloklanır. Owner kuralı gereği "missing configuration
→ block". `apps/api/.env.example` bu zorunluluğu belgeler.

### 2.3 Kanıt kaydı

`GateCheckerService.collectUsedFacts` listesine `system.uyap_available` ve
`system.uyap_availability_explicit` eklendi → `CpeDecisionLog.factsUsed`
alanında operasyonel sinyal de görünür.

---

## 3. UYAP_SEND gate envanteri (behaviour-lock)

| # | Gate | Priority | Severity | Tetikleme | Fact yoksa (ÖNCE) | Fact yoksa (SONRA) |
|---|---|---|---|---|---|---|
| 1 | `CASE_CLOSED` | 1 | HARD | `case.is_closed === true` | GEÇER (fail-open) | **BLOK** (#6 ile) |
| 2 | `CASE_ARCHIVED` | 2 | HARD | `case.is_archived === true` | GEÇER (fail-open) | **BLOK** (#6 ile) |
| 3 | `EXPENSE_BLOCKING` | 10 | HARD | `case.has_unpaid_blocking_expense === true` | GEÇER (fail-open) | **BLOK** (#6 ile) |
| 4 | `UYAP_DISABLED` | 11 | HARD | `case.allow_uyap_actions === false` | GEÇER (fail-open) | **BLOK** (#6 ile) |
| 5 | `UYAP_TEMPORARILY_UNAVAILABLE_SEND` | 12 | HARD | `system.uyap_available === false` | GEÇER (fail-open) | **BLOK** (#6 ile) |
| 6 | `UYAP_SEND_PRECONDITIONS_UNPROVEN` | 13 | HARD | 6 fact'in POZİTİF kanıtı yoksa | — (yoktu) | **BLOK** |
| 7 | `POWER_OF_ATTORNEY_MISSING` | 25 | HARD | 5 granular authority fact `!== true` | BLOK (I04'ten beri) | BLOK |

`UYAP_SEND` için uygulanan **tüm** gate'ler HARD'dır; SOFT gate yoktur.
Bu envanter `uyap-send-hard-gate-preflight.spec.ts` içinde test ile kilitlenmiştir:
yeni bir gate eklenirse test kırmızıya döner ve envanter bilinçli güncellenir.

---

## 4. Test kanıtı

`src/modules/policy-engine/gate-checker/__tests__/uyap-send-hard-gate-preflight.spec.ts`
— **49 test / 49 PASS**:

- Gate envanteri + severity + scope + priority sıralaması (4)
- Pozitif ispat matrisi: baseline allow, boş fact map blok, 6 fact × {eksik,
  `undefined`, `null`, string tip kayması} = 24 blok senaryosu (26)
- Önceki gate'lerin mesaj kalitesi korunur: 5 spesifik gate kodu (5)
- Kapsam izolasyonu: 5 diğer action preflight gate ile bloklanmaz + eski gate
  tanımlarının fail-open semantiğinin DEĞİŞMEDİĞİ davranış kilidi (6)
- `UyapAvailabilityService` açık-yapılandırma ayrımı, `isUyapAvailable()`
  geriye dönük davranış kilidi (4)
- `ComputedFactRegistry` fact üretimi, provider exception fail-closed,
  manuel/legacy DB flag'inin computed provider tarafından EZİLMESİ (4)

### 4.1 Fixture düzeltmeleri (test'i bozuk çıktıya uydurma YOK)

| Dosya | Değişiklik | Gerekçe |
|---|---|---|
| `uyap-temporary-outage.spec.ts` | allow-path fixture'ına eksik 5 kanıt fact'i eklendi | Test'in konusu (outage bloğu yok) değişmedi; yeni önkoşullar karşılandı |
| `case-policy-engine.spec.ts` | `buildCaseRow` → `isArchived`/`allowUyapActions` eklendi | Mock, gerçek Prisma select'inden EKSİKTİ; fact'ler `undefined` kalıyordu |
| `case-policy-engine.spec.ts` | `await module.init()` eklendi | `.compile()` lifecycle hook çalıştırmaz → `ComputedFactRegistry.onModuleInit()` hiç koşmuyordu, built-in provider'ların HİÇBİRİ kayıtlı değildi. Pozitif-ispat gate'i bu boşluğu görünür kıldı; suite gerçek runtime'a hizalandı |
| `integration.spec.ts` | `isArchived: false`, `case.has_unpaid_blocking_expense: false`, `UYAP_AVAILABLE=true` | Aynı sınıf: mock eksikliği + ops sinyalinin açık yapılandırılması |

**Not (bulgu):** `case-policy-engine.spec.ts`'in `module.init()` çağırmaması,
bu suite'te computed fact'lerin **hiç** üretilmediği anlamına geliyordu — yani
golden senaryolar bugüne kadar computed fact katmanını kanıtlamıyordu. Bu, bu
PR'ın yan ürünü olarak kapatılmıştır.

### 4.2 Regresyon

| Kapsam | Sonuç |
|---|---|
| `src/modules/policy-engine` | 331 PASS / 1 skipped / **0 FAIL** (2 db-gated suite `DATABASE_URL` yokluğundan lokalde çalışmaz — CI'da kendi DB service'iyle koşar) |
| `src/modules/uyap` | 598 PASS / 3 skipped / **0 FAIL** (4 db-gated suite aynı sebep) |
| `src/modules/expense*` | 127 PASS / **0 FAIL** |
| `tsc -p tsconfig.prod.json --noEmit` | **EXIT 0** |
| `pnpm build` (nest build) | **EXIT 0** |

### 4.3 CI bağlama

`ci-manifests/pure/platform-scripts-shared.txt` içine üç spec eklendi
(yeni ci.yml step'i AÇILMADI):

- `policy-engine/gate-checker/__tests__/uyap-send-hard-gate-preflight.spec.ts` (yeni)
- `policy-engine/__tests__/case-policy-engine.spec.ts` (mevcut, **CI'da hiç koşmuyordu**)
- `policy-engine/__tests__/integration.spec.ts` (mevcut, **CI'da hiç koşmuyordu**)

Son ikisi GH-04 sınıfı "unwired spec" boşluğuydu; bu PR onların davranışını
değiştirdiği için blocking kapsama alındı. İkisi de DB-free, birlikte ~7s.

---

## 5. Kapsam sınırı — bu PR'ın YAPMADIKLARI

- Mevcut gate'lerin (`CASE_CLOSED`, `CASE_ARCHIVED`, `UYAP_DISABLED`,
  `EXPENSE_BLOCKING`, `UYAP_TEMPORARILY_UNAVAILABLE_SEND`) koşulları
  **değiştirilmedi** → `UYAP_SEND` dışındaki action'larda davranış değişikliği yok.
- Yeni hukuk/ürün semantiği üretilmedi; yeni fact **kaynağı** icat edilmedi
  (`system.uyap_availability_explicit` mevcut env sinyalinin türevidir).
- Schema/migration yok. Feature flag açma yok. Transport yok. Canary yok.
- `evaluatedAt` tazelik/TOCTOU sertleştirmesi **I05'in konusudur**, burada YOK.
- Legacy `case.has_power_of_attorney` alias'ının kaldırılması **I06'nın
  konusudur**, burada YOK.

---

## 6. Artık risk

| # | Risk | Durum |
|---|---|---|
| R-1 | `UYAP_AVAILABLE` env'i deployment'ta ayarlanmazsa UYAP_SEND tamamen bloklanır | **BİLİNÇLİ** — owner "missing configuration → block". `.env.example` belgeler; canary öncesi ops adımıdır |
| R-2 | `UyapModule` yüklenmezse expense/authority provider'ları kayıtlı olmaz → fact yok | **KAPALI** — fact yokluğu artık bloklar (eskiden geçerdi) |
| R-3 | Diğer action'lar (`UYAP_QUERY`, `SEND_NOTIFICATION`, `SEND_PAYMENT_ORDER`, `TRIGGER_HACIZ`, `REQUEST_SALE`) hâlâ fact-yokluğunda fail-open | **AÇIK / KAPSAM DIŞI** — bu görev yalnız `UYAP_SEND` içindir. Ayrı owner kararı gerektirir |
| R-4 | `getNextActions` öneriyi ELEMİYOR, yalnız `gatePreCheck.blocked` ile işaretliyor | **TASARIM GEREĞİ / DOĞRULANDI** — `RuleEngineService` `checkHardGates` sonucunu öneriye iliştirir (`rule-engine.service.ts:87-97`). Yeni gate HARD olduğu için bu işarete dahildir. Öneri ≠ izin; izin yalnız `canPerformAction` üzerinden verilir ve o yol fail-closed'dır |
