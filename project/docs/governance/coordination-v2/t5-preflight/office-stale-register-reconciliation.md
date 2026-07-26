# T5 Preflight — OFFICE Stale Register Reconciliation

```text
Task            : GOV-COORD-V2-T5-PREFLIGHT-RECONCILIATION-R01, kapsam 3
Base            : origin/main @ 7fcd3b98
DISPOSITION     : STALE — DOĞRULANDI (5/5 residual icra edilmiş, canlı DB dahil)
Nitelik         : HAZIRLANMIŞ supersession kaydı — register satırları DEĞİŞTİRİLMEDİ
Geçmiş          : SİLİNMEDİ, yeniden yorumlanmadı
```

## 1. Bu kayıt "kayıtsız icra" DEĞİLDİR

Önce elenmesi gereken hipotez buydu: OFFICE de #1415 gibi kayıtsız bir icra mı?
**Hayır.** Zincir tam:

```text
PR #1494    MERGED 2026-07-21T07:49:30Z    squash b9916f5bfe9a27e483d779e5c98d31828552f92e
            feat(auth): OFFICE-AUTH-P02-HARDENING-R01 — credential-recovery hardening
```

Governance tescili `pending-migration-coordination-register.md` üzerinden yapılmış:

```text
:100   PR #1494 (b9916f5bfe9a27e483d779e5c98d31828552f92e) — HARDENING-R01'in kod
       tarafı, MERGED/CANONICAL; bu register yalnız DB-apply tarafını kapsar.
:398   GATE M3 — OWNER GO-MIGRATE — OFFICE-AUTH-P02-HARDENING-R01
:401   AUTHORITY BASIS: PR #1494, merge SHA b9916f5b...
:541   CLOSED — 4/4 GATE APPLIED (M2→M1→M3→M4, zorunlu sırayla) / QUEUE DRAINED
:564   LIVE DB APPLY — APPLIED, TRAIN-R02, 2026-07-23, exec SHA b3b0fa5b8183
```

Yani hem kod hem canlı DB uygulaması owner GO ile yapılmış ve kaydedilmiş.
Sorun icra değil, **register senkronu**.

## 2. Beş residual'ın kod-gerçeği doğrulaması (7fcd3b98)

Rapor iddiasına değil koda karşı yeniden doğrulandı:

| # | Owner-ratifiye residual | Kanıt | Sonuç |
|---|---|---|---|
| 1 | composite `(tenantId,userId)→User(tenantId,id)` FK + kullanıcı başına en fazla bir unresolved token için partial unique index | `migrations/20260721010000_office_auth_p02_hardening_r01_composite_fk/migration.sql:12` (`PasswordResetToken_tenantId_userId_fkey`), `:20` (`PasswordResetToken_one_unresolved_per_user ... WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL`) | **VAR** |
| 2 | backend-authoritative feature flag + `GET /api/auth/capabilities` | `password-reset/password-reset.service.ts:39` `isPasswordRecoveryEnabled()`, `:63` ve `:229` gate; `auth.controller.ts:21-23` `@Get("capabilities")` → `{ passwordRecoveryEnabled }` | **VAR** |
| 3 | SERIALIZABLE transaction + kontrollü P2034/P2002 retry | `password-reset.service.ts:126` `Prisma.TransactionIsolationLevel.Serializable`, `:146` `err?.code === "P2034"` sınıflandırıcı | **VAR** |
| 4 | kesin audit taxonomy (ayrı REQUESTED / EMAIL_DISPATCHED / EMAIL_FAILED action'ları) | `password-reset.service.ts:117` `PASSWORD_RESET_REQUESTED`, `:181` `..._EMAIL_DISPATCHED`, `:198` `..._EMAIL_FAILED`, `:282` `..._COMPLETED` | **VAR — dört ayrı action** |
| 5 | reset-link transport: query-string yerine URL fragment | `password-reset.service.ts:49` `.../auth/reset-password#token=${...}`; `apps/web/src/app/auth/reset-password/page.tsx:24` `window.location.hash` okuması | **VAR** |

Düzeltme: residual 4 için önceki turda "üç ayrı action" demiştim; kodda **dört**
var (`_COMPLETED` dahil). Owner metni üçünü şart koşuyor, kod dördünü veriyor.

Dosya yolu notu: servis `modules/auth/password-reset/password-reset.service.ts`
altındadır, `modules/auth/` kökünde değil.

## 3. Bayat satırlar — exact konum ve exact metin

### a. `product-backlog.md` — birincil bayat yüzey

```text
:3327  **OFFICE-AUTH-P02-HARDENING-R01 — Post-Merge Security Hardening Residual
       Register (2026-07-21; REGISTERED / NOT IMPLEMENTED)**
:3329  "Owner tarafından OPEN/NOT IMPLEMENTED olarak ratifiye edilen gereksinimler"
:3330-3334  beş residual, her biri "Mevcut kod: ..." ile eksik olduğunu anlatıyor
:3338  Status: OPEN / NOT IMPLEMENTED — owner-ratified, implementasyon henüz
       YETKİLENDİRİLMEMİŞTİR.
:3342  **NEXT ELIGIBLE ACTION: OFFICE-AUTH-P02-HARDENING-R01 — ayrı, açık bir
       owner GO-IMPLEMENT kararı gerektirir**
```

`:3330-3334`'teki "Mevcut kod:" tespitleri 2026-07-21 itibarıyla doğruydu; bugün
beşi de yanlıştır.

### b. `active-roadmap.md` — ikincil

```text
:56  | OFFICE-AUTH-P02-HARDENING-R01 | OWNER-GATED / IMPLEMENTATION NOT STARTED |
```

### c. `OFFICE-DELIVERY-MANIFEST.md` §8 — ayrı konu, ayrı bayatlık

Bu satırlar R01 ile ilgili değil, Phase 2 seçimiyle ilgilidir. §8 (2026-07-17)
hâlâ `NEXT ELIGIBLE UNIT: NONE`, `CURRENT SELECTED DELIVERY UNIT: NONE` ve
`NEXT OWNER-GATED UNIT: Phase 2 First-Unit Selection` der; oysa seçim
**2026-07-22**'de yapılmıştır (`decision-log.md:30`, CAP-09). Manifest teslim
statüsü otoritesi olarak ilan edildiği için bu boşluk bağlayıcıdır.

Aynı bayatlık `active-roadmap.md:54`'te de görünür: `NEXT ELIGIBLE UNIT | WAVE 1
— Candidate Inventory and Slice Decomposition | Owner selection/GO bekliyor`.

## 4. Canonical current status

```text
OFFICE-AUTH-P02                    BASELINE IMPLEMENTED / CANONICAL
                                   PR #1481, squash 7676d851
OFFICE-AUTH-P02-HARDENING-R01      KOD: IMPLEMENTED / MERGED — PR #1494, b9916f5b
                                   DB : APPLIED — GATE M3, TRAIN-R02 2026-07-23
                                   5/5 owner-ratifiye residual kodda doğrulandı
                                   → "OPEN / NOT IMPLEMENTED" ARTIK GEÇERSİZ

OFFICE PHASE 2 first unit          SEÇİLMİŞ — CAP-09 Audit-Attribution Standard
                                   decision-log.md:30, 2026-07-22
                                   → manifest §8'in "NONE" satırları GEÇERSİZ
```

## 5. Register satırlarını neden ben düzeltmedim

Brief "minimal supersession/reconciliation kaydı ekle" diyor; ekledim. Satır
düzeltmesini yapmadım, iki ayrı nedenle:

**1. Birincil yüzey owner WIP'tir ve dokunulamaz.**
`product-backlog.md` — bayatlığın ağırlığını taşıyan dosya —
`governance-writer-coordination-protected-paths.json` içindeki
`grandfatheredOwnerWipExactPaths` listesindedir. V1 `deniedCapabilities`
`OWNER_WIP_MUTATION`'ı `DENIED` sayar; `CLAUDE.md` "kullanıcıya ait WIP'e
dokunma" der. Aynı liste `decision-log.md`'yi de içerir.

**2. Yalnız ikincil yüzeyleri düzeltmek durumu kötüleştirir.**
`active-roadmap.md:56` ve `OFFICE-DELIVERY-MANIFEST.md §8` owner WIP değildir,
teknik olarak düzeltilebilirdi. Ama `product-backlog.md` dokunulamaz kaldığı
için sonuç, register'ların **birbiriyle çelişmesi** olurdu: roadmap
"IMPLEMENTED", backlog "NOT IMPLEMENTED" derdi ve hangisinin taze olduğu yeni
bir belirsizlik olurdu. Tek, açıkça etiketli bir supersession kaydı üçünü birden
adlandırır ve hiçbirini çelişkiye sokmaz.

Owner'ın yapması gereken, üç satırı birlikte düzeltmektir. Önerilen exact
değişiklikler:

```text
product-backlog.md:3327   "(2026-07-21; REGISTERED / NOT IMPLEMENTED)"
                       -> "(2026-07-21 kayıt; 2026-07-21 IMPLEMENTED PR #1494
                           b9916f5b; 2026-07-23 DB APPLIED TRAIN-R02)"
product-backlog.md:3338   "Status: OPEN / NOT IMPLEMENTED ... YETKİLENDİRİLMEMİŞTİR."
                       -> "Status: IMPLEMENTED / CANONICAL — 5/5 residual; kod
                           PR #1494 (b9916f5b), DB GATE M3 (TRAIN-R02)."
product-backlog.md:3342   "NEXT ELIGIBLE ACTION: OFFICE-AUTH-P02-HARDENING-R01"
                       -> kaldırılır veya CAP-09 SLICE kararına yönlendirilir
active-roadmap.md:56      "OWNER-GATED / IMPLEMENTATION NOT STARTED"
                       -> "IMPLEMENTED / CANONICAL (PR #1494, b9916f5b) + DB APPLIED"
OFFICE-DELIVERY-MANIFEST.md §8  "NEXT/CURRENT ... NONE"
                       -> CAP-09 seçimi (decision-log.md:30, 2026-07-22) yansıtılır
```

`:3330-3334`'teki "Mevcut kod:" tespitleri **tarihsel kayıttır ve silinmemelidir**
— 2026-07-21 itibarıyla doğruydular. Statü satırının düzeltilmesi yeterlidir.

## 6. Kapsam sınırı — CAP-09 kararına dokunulmadı

CAP-09'un lane/decomposition kararı bu kayıtla **değişmedi**. Hangi slice'ın
yetkili olduğu, sıralamanın ne olduğu ve `OFFICE-RISK-REGISTER.md:190` ile
`decision-log.md:30` arasındaki authority çelişkisi ayrı bir belgede ele
alınır: `office-owner-decision-pack.md`.

---

**AUTHORITY: NONE.** Bu belge hiçbir statü alanını değiştirmez, hiçbir register
satırını yeniden yorumlamaz ve hiçbir implementation authority üretmez.
