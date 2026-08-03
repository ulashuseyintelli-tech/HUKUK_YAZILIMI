# CODEX-CLIENT-X2 — Financial Disclosure

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CODEX-CLIENT-X2
LANE OWNER:               CODEX
PREDECESSOR:              CODEX-CLIENT-X1 — ENGINEERING_COMPLETE / MERGED / CANONICAL
                          ✅ KARŞILANDI (owner amendment 2026-08-03; CHARTER §48 CONTROLS
                          + CLIENT-X1-GOV-RECON-R02-SA01). X1 REMAINING PRODUCT WORK: NONE.
                          Kanıt: #2126/5f4202a8 + #2140/cbe49683 (engineering),
                          #2165/cdd24aaa (terminal kanonik yayın). #2154 yalnız
                          control-plane bootstrap'tır, engineering kanıtı DEĞİLDİR.
                          ⚠ FD projection shape bağı (§0-C) KALICI bir
                          BACKWARD-COMPATIBILITY kuralıdır — X1 kapandıktan SONRA DA
                          geçerlidir; kapı gerekçesi DEĞİL, güvenlik kuralıdır.
SUCCESSOR:                CODEX-CLIENT-X3
                          (X3 ← X2 kapısı KALDIRILDI — sıfır import; X3 bağımsız yürür)

ALLOWED PATHS:
  project/apps/api/src/modules/client-financial-disclosure/
  project/apps/api/src/modules/client-settlement/   → YALNIZ exact dosyalar:
      client-financial-disclosure-command.service.ts
      ve bunun __tests__ karşılıkları
  project/apps/api/ci-manifests/pure/

FORBIDDEN PATHS:
  project/apps/api/src/modules/client/              (CLAUDE lane)
  project/apps/api/src/modules/seed/                (CLAUDE C1)
  project/apps/api/prisma/                          (CLAUDE LANE migration owner)
  project/apps/api/src/modules/client-notification/ (CODEX X1)
  project/apps/api/src/modules/client-intake-*/     (CODEX X3)
  project/apps/api/src/modules/client-settlement/   → payout / offset / journal /
      manual-reversal / accounting dosyaları (COLLECTION-ACCOUNTING OWNED — DOKUNMA)
  project/apps/api/src/modules/collection/ · accounting-journal/
  .github/ · ci.yml

SHARED CONTRACTS:
  CollectionDisposition (POSTED)     → READ-ONLY TÜKETİM. COLLECTION-owned; X2 yalnız
                                       okur, mutasyon etmez, özellik EKLEMEZ.
  office-approval eligibility        → READ-ONLY. NOT: disclosure eligibility PARTNER/MANAGER
                                       kabul eder; generic office approval MANAGER'ı HARİÇ
                                       tutar. Bu SAPMA KASITLIDIR — "birleştirme" YASAK.
  client-mutation-policy.ts          → READ-ONLY (CLAUDE C2 tek writer)
  posting.isPrepareEligible          → READ-ONLY

MIGRATION WRITER:         HAYIR — Codex migration YAZAMAZ.
                          #1629 migration'ı zaten main'dedir; X2 yalnız LIVE-APPLY
                          KANITINI üretir. Yeni şema ihtiyacı doğarsa master plana bildirir.

SHARED CONTRACT FREEZE:   C2'nin dondurduğu authority primitive'leri değiştirilmez.
                          Disclosure kendi eligibility'sini KORUR (kasıtlı sapma).

GRANT STATUS:             GRANT İÇİ — client-financial-disclosure/ ve client-settlement/
                          allowedPathRoots kapsamındadır.
                          ANCAK client-settlement/ COLLECTION ile PAYLAŞIMLIDIR →
                          yazım exact FD-command dosyalarına PİNLENMİŞTİR.

PRODUCTION GATE:          EVET — flag activation, canary ve runtime doğrulama bu sayfada
                          TAMAMLANMAZ; WAVE 4'e (owner deployment penceresi) ertelenir.
                          Bu sayfa ENGINEERING tarafını kapatır.

TASK ORDER:
  Master planda yazılı sıra değiştirilemez.

CONTEXT RULE:
  Konuşma hafızası canonical kaynak değildir.
  Current main, master plan ve ratifiye kararlar canonical kaynaktır.

CROSS-LANE RULE:
  Diğer lane'in dosyasına, PR'ına, branch'ine, worktree'sine veya görevine dokunma.

CROSS-MODULE RULE:
  CLIENT dışındaki bulguları dependency olarak kaydet; implementation başlatma.
  COLLECTION/ACCOUNTING'e ÖZELLİK EKLEME — yalnız mevcut CLIENT bağımlılığını tüket.

NEW FINDING RULE:
  Yeni bulgu mevcut göreve gizlice eklenmez. Master plana disposition için gönderilir.

BLOCK RULE:
  Normal CI, owner tarafından zaten verilmiş karar, başka lane'in bağımsız çalışması
  ve governance biçim eksikliği tek başına blocker değildir.

GO-COMPLETE:
  Acceptance + tests + CI + mergeability sağlanırsa aynı görev içinde squash-merge,
  main sync ve kendi branch/worktree cleanup işlemlerini tamamla.

PROGRAM LOCK:             CLIENT ONLY
```

---

## 0-A. OWNER AUTHORIZATION (tek seferlik — blok başına onay YOK)

```text
OWNER AUTHORIZATION:
GO-COMPLETE — CODEX-CLIENT-X2 TAM SAYFA
(owner bu sayfayı AYRI bir sayfada açtığında VE §0-C kapısı açıldığında yürürlüğe girer)

AUTHORIZED WITHOUT FURTHER OWNER APPROVAL:
- X2-B01..X2-B07 sıralı engineering execution
- İzole worktree ve branch
- Test ve bounded production-code değişikliği
- Commit, push, PR · CI polling
- Required checks PASS + MERGEABLE ise normal squash-merge · main sync
- Kendi branch/worktree cleanup
- Fresh main ile sıradaki X2 bloğuna OTOMATİK geçiş
- MASTER-PLAN §17 register'da KENDİ satırının güncellenmesi

NO PER-BLOCK OWNER APPROVAL:
Listelenen X2 görevleri için tekrar owner GO İSTENMEYECEK.

OWNER RETURN ONLY IF:
- X2-B05'te approval/publication route ERİŞİLEBİLİRLİK kararı gerekiyorsa (§0-D)
- Allowed-path dışına çıkmak teknik olarak kaçınılmazsa (şema/migration bu sınıfa girer;
  Codex migration YAZAMAZ)
- Production/flag/canary mutasyonu gerekiyorsa (→ X2-PROD-ACTIVATION, §0-E)
- Acceptance kriterleri arasında GERÇEK çelişki varsa
```

## 0-B. BLOK YAPISI VE DEĞİŞTİRİLEMEZ SIRA

Bloklar, ratifiye edilmiş sıralı alt görevlerin (v1.0, madde 1–8) **birebir karşılığıdır**;
madde 7 (canary + runtime/production doğrulama) ratifiye metinde zaten *"bu sayfada
tamamlanmaz"* dediği için **activation bloğu** olarak taşınır. Yeni iş eklenmemiş, sıra
değiştirilmemiştir.

```text
X2 BLOCK COUNT:
7 ENGINEERING BLOCKS
+ 1 DEFERRED PRODUCTION ACTIVATION BLOCK

EXECUTION ORDER:
X2-B01 → X2-B02 → X2-B03 → X2-B04 → X2-B05 → X2-B06 → X2-B07
→ X2-PROD-ACTIVATION (WAVE 4)

ORDER MUTATION:
FORBIDDEN
```

| Blok | İş | Not |
|---|---|---|
| **X2-B01** | Fresh doğrulama — P-FD kod ve migration durumu current main'de | rapor iddiası KANIT DEĞİL |
| **X2-B02** | `#1629` migration **LIVE-APPLY kanıtı** | durum bugün **UNKNOWN**; §0-F kısıtı |
| **X2-B03** | Write flag zinciri — `isDisclosureWriteEnabled()`, fail-closed reddi | varlık sızdırmadan |
| **X2-B04** | Publication flag + provider allowlist `['smtp','sendgrid','ses']` | mock provider ASLA yetkilendiremez |
| **X2-B05** | Approval/publication yolları — bugün **route-erişilemez** | erişilebilirlik kararı → §0-D |
| **X2-B06** | Fail-closed davranış doğrulaması | HELD_PENDING_DISTRIBUTION · POSTED-only · UNSUPPORTED_SCOPE |
| **X2-B07** | Financial Disclosure sertifikasyonu — db-gated specler | bugün `TEST_DATABASE_URL` yoksa SKIP |
| **X2-PROD-ACTIVATION** | Canary + runtime/production doğrulama | **WAVE 4**, §0-E koşullu yetki |

### Her blok sonunda ZORUNLU çıktı

```text
CURRENT PAGE:                 CODEX-CLIENT-X2
COMPLETED BLOCK:              <exact ID>
BLOCK RESULT:                 ENGINEERING_COMPLETE / RUNTIME_VERIFIED /
                              ANALYSIS_DELIVERED / ACTIVATION_PENDING / FAILED_EXACT
MERGED PR / SHA:              <PR ve merge SHA>
X2 BLOCKS TOTAL:              7
X2 BLOCKS COMPLETED:          <n>
X2 BLOCKS REMAINING:          <n>
REMAINING BLOCKS:             <exact sıralı liste>
FD RUNTIME STATE:             <flag durumları — DEFAULT-OFF mu, değişti mi>
PRE-FLIGHT:                   X1 aktif blok=<...> · çakışma=<YOK|VAR> · karar=<...>
ACTIVATION DEBT:              <liste veya NONE>
NEXT ELIGIBLE:                <yalnız sıradaki exact blok>
OWNER AUTHORIZATION REQUIRED: NO / yalnız §0-D veya §0-E
PROGRAM LOCK:                 CLIENT ONLY
```

## 0-C. GİRİŞ KAPISI — X2 ← X1 · **AÇIK** (predecessor satisfied)

```text
DURUM (owner amendment 2026-08-03): KAPI AÇIK — (a) dalı KARŞILANDI.
X1 = ENGINEERING_COMPLETE / MERGED / CANONICAL · REMAINING PRODUCT WORK: NONE
```

**Kalıcı teknik bağ (kapı gerekçesi DEĞİL, backward-compatibility kuralı):** X1'in
sahip olduğu `portal/` kodu X2-owned yüzeye **altı noktadan** bağlıdır ve bu bağ X1
kapandıktan **sonra da** yaşar:

```text
portal/client-financial-disclosure-portal.service.ts:8
  → ClientFinancialDisclosureProjectionService              (X2-owned)
portal/portal.controller.ts:22                              (DI wire)
portal/portal.module.ts:5                                   (DI wire)
portal/__tests__/client-financial-disclosure-portal.db-gated.integration.spec.ts:3
  → CLIENT_DISCLOSURE_ALLOWED_FIELDS                        (X2-owned contract)
```

X2 bu shape'i değiştirirse **X1'in portal kodu `tsc --noEmit`'te kırılır**; kırılma
jest'te GÖRÜNMEZ (`diagnostics:false`) ve yalnız **required OLMAYAN** "Test Suite"
içindeki Type check yakalar → kırık kod main'e **inebilir**.

**X1'in kalan işi tam bu yüzeydedir:** program başlangıcından (`6b6225c8`) beri
`portal/` dizinine **hiç program işi inmemiştir**; X1 yalnız notification yarısını
(#2126 CN-2/CN-3, #2140 CN-1 wiring) teslim etmiştir. Ratifiye kalan kalemler 5–8
(P2 U01/U02 doğrulaması · U03 field-visibility · object-scope/BOLA · token/session +
workspace URL) **portal tarafındadır**.

```text
AÇILMA KOŞULU (a) — KARŞILANDI:
 X1 ENGINEERING_COMPLETE / MERGED / CANONICAL (owner amendment 2026-08-03,
 CHARTER §48 CONTROLS + CLIENT-X1-GOV-RECON-R02-SA01). Kapı AÇIKTIR.
 Sayfa açılışında ancak REPOSITORY KANITIYLA yeniden teyit edilir
 (SA01 belgesi main'de ve authorizedSemantics.x1Engineering okunur).
```

### ✅ §0-C GATE OPEN — (a) DALI KARŞILANDI (owner amendment 2026-08-03)

**Kapı (a) dalı üzerinden AÇIKTIR: X1 `ENGINEERING_COMPLETE / MERGED / CANONICAL`.**
Predecessor **KARŞILANMIŞTIR**.

```text
KANONİK OTORİTE:
  CLIENT-GOVERNANCE-CHARTER.md §48 CONTROLS
  CLIENT-X1-GOV-RECON-R02-SA01 (task-bound semantic authority, main'de)
    x1Engineering            : ENGINEERING_COMPLETE / MERGED / CANONICAL
    x1RemainingProductWork   : NONE
    u03TrackB                : CLOSED / CANONICAL / PASS
    productionVerification   : CLOSED / CANONICAL / VERIFIED ONCE
    currentFlags             : DEFAULT OFF
    persistentFlagActivation : OWNER-GATED / NOT PERFORMED

X1 KANIT ZİNCİRİ (üç ayrı katman — karıştırılmaz):
  #2126 / 5f4202a8  ENGINEERING — notification remediation (DTO validation, provider
                    error sanitization) + portal / U01 / U02 / U03 / object-scope /
                    token / workspace-URL DOĞRULAMASI ve ÖLÇÜLMÜŞ DELTA
                    (CN-1 characterization spec'i dahil)
  #2140 / cbe49683  ENGINEERING — CN-1 kanonik authority wiring
  #2165 / cdd24aaa  TERMİNAL KANONİK YAYIN — owner-ratified semantic authority

  #2154            YALNIZ control-plane BOOTSTRAP'tır. Engineering kanıtı DEĞİLDİR
                   ve engineering kanıtı olarak ATIF EDİLEMEZ. X1'in engineering
                   kanıtı #2126 + #2140, terminal kanonik yayını #2165'tir.

SUPERSEDED YORUM (PR #2166'da yer almıştı — REJECTED):
  "X1 portal yarısını başlatmadı; kalan işi portal madde 5-8'dir; X1
   ENGINEERING_COMPLETE değildir."
  Madde 5-8'in X1 kapsamındaki görevi DOĞRULAMA ve DELTA ÖLÇÜMÜ idi; portal
  remediation veya zorunlu portal production-code diff'i DEĞİLDİ. Bu nedenle
  "portal/ dizinine commit inmemiş" gözleminden "iş yapılmamış" SONUCU ÇIKARILAMAZ.
  Ölçülen BOLA / POL-J delta'sı YENİ ve GİZLİ X1 işi olarak TÜRETİLEMEZ.
```

**SHAPE-FROZEN ve block-level pre-flight KORUNUR — fakat gerekçesi değişmiştir:**

```text
Bunlar X1 EKSİKLİĞİ nedeniyle DEĞİL, BACKWARD-COMPATIBILITY GÜVENLİK KURALI olarak
yürürlüktedir:

FD projection service/contract public shape
(client-financial-disclosure-projection.service.ts ve
 client-financial-disclosure-projection.contract.ts):
  - SHAPE-FROZEN
  - DARALTMA, SİLME ve YENİDEN ADLANDIRMA YASAK
  - GENİŞLETME yalnız BACKWARD-COMPATIBLE ise SERBEST
  - Herhangi bir lane'in exact write manifest'iyle KESİŞEN blok
    WAITING_FOR_OTHER_SESSION olur; SIRA ATLANMAZ

GEREKÇE: X1'in portal kodu bu shape'i altı noktadan tüketir (§0-C). Kırılma jest'te
GÖRÜNMEZ (diagnostics:false) ve required OLMAYAN "Test Suite" içindeki Type check'te
göründüğü için main'e inebilir. Bu risk X1 kapandıktan SONRA DA geçerlidir —
kural kalıcıdır.
```

```text
X2-B01: NEXT ELIGIBLE / NOT STARTED
Bu docs PR'ı X2'yi BAŞLATMAZ.
```

## 0-D. BİLİNEN OWNER KARARI — X2-B05 ROUTE ERİŞİLEBİLİRLİĞİ

```text
Approval ve publication runtime'ları BUGÜN ROUTE-ERİŞİLEMEZ (hiçbir controller
çağırmıyor). Bunları HTTP'ye açmak bir ÜRÜN/GÜVENLİK kararıdır — X2 kendiliğinden
KARAR VEREMEZ.
KURAL: B05'te önce mevcut durum characterization ile kanıtlanır. Wiring gerekiyorsa
karar master plana taşınır; blok WAITING_FOR_OWNER_DECISION ile bekler, SIRA ATLANMAZ.
İçsel gate'ler zaten güçlüdür ve KORUNUR: four-eyes (requester ≠ office-approver ≠
content-approver) · stale-snapshot re-verify · conditional updateMany count===1.
```

## 0-E. X2-PROD-ACTIVATION — KOŞULLU YETKİ DURUMU

```text
CONDITIONAL PRODUCTION AUTHORIZATION FOR X2-PROD-ACTIVATION:
NOT YET GRANTED — OWNER DECISION REQUIRED
```

Owner koşullu production yetkisini açıkça **`C1-PROD-ACTIVATION` için** vermiştir.
FD flag activation + canary + runtime doğrulama **ayrı bir production mutation
sınıfıdır** ve kendi owner kararını bekler. Bu sayfa kendine production yetkisi
ÜRETEMEZ (`noSelfAuthorizationChange`).

**Değişmeyen kanonik gerçek:** `CODE MERGED ≠ PRODUCTION ACTIVATED` ·
`ACTIVATION READY ≠ PRODUCTION VERIFIED` · `CODE BOUND ≠ FLAG ON`. İki bayrak
(`CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED` ve `..._PUBLICATION_ENABLED`) **varsayılan
KAPALI**dır ve bu sayfa onları **açmaz**.

## 0-F. X2-B02 KISITI — LIVE-APPLY KANITI

```text
#1629 migration'ın LIVE-APPLY durumu bugün UNKNOWN'dır.
X2 bunu KANITLAMAKLA yükümlüdür, fakat:
 - .env veya secret OKUNMAZ; credential talep EDİLMEZ,
 - production verisine DOKUNULMAZ,
 - Docker `hukuk_db` DEVELOPMENT/INTEGRATION sınıfıdır ve production kanıtı olarak
   ATIF EDİLEMEZ (ARC-07 D07 ile aynı ilke),
 - kanıt üretilemiyorsa sonuç UNKNOWN olarak DÜRÜSTÇE raporlanır; "uygulandı"
   VARSAYILMAZ.

⚠ OWNER DÜZELTMESİ 2026-08-03 — UNKNOWN GEÇERLİ TERMİNAL SONUÇTUR:
X2-B02'de production LIVE-APPLY kanıtı ÜRETİLEMEZSE, `UNKNOWN` bloğun GEÇERLİ ve
TERMİNAL sonucudur. Bu durum:
  - bloğu TAMAMLANMAMIŞ SAYMAZ,
  - X2-B03'e geçişi ENGELLEMEZ,
  - BLOCKED_EXACT DEĞİLDİR.
Blok çıktısında `BLOCK RESULT: ANALYSIS_DELIVERED` + `LIVE-APPLY: UNKNOWN (kanıt
üretilemedi — gerekçe: <exact>)` olarak raporlanır ve sıra normal akışında devam eder.
"Uygulandı" veya "uygulanmadı" VARSAYIMI YAPILMAZ.
```

## 0-G. BLOCK-LEVEL PRE-FLIGHT (her blok öncesi — ZORUNLU)

```text
1. Aktif diğer-lane bloklarının EXACT WRITE MANIFEST'i alınır — repository-truth:
   `gh pr view <n> --json files` + `git diff --name-only`. KONUŞMA İDDİASI KANIT DEĞİL.
   ÖZELLİKLE: X1'in aktif bloğu portal/ içinde mi ve FD projection tüketen dosyalara
   (client-financial-disclosure-portal.service.ts · portal.controller.ts ·
   portal.module.ts · ilgili db-gated spec) dokunuyor mu?
2. Bu X2 bloğunun exact write manifest'i yazılır (`__tests__/*` wildcard YETERSİZ).
3. SHARED-CONTRACT karşılaştırması — dosya adı YETMEZ:
   FD projection service/contract public shape'i değişiyor mu? (değişmemeli)
4. Çakışma YOK → blok yürür. VAR → YALNIZ o blok WAITING_FOR_OTHER_SESSION;
   sıra ATLANMAZ, diğer lane'e DOKUNULMAZ.
5. Çıktıya PRE-FLIGHT satırı eklenir.
```

## 0-H. ÜÇ DURUM AYRIMI + BLOCKER DISCIPLINE

```text
CODE_PRESENT != ENGINEERING_COMPLETE != PRODUCTION_ACTIVE
MERGED != ENGINEERING_COMPLETE
B07 bittiğinde sayfa SUSPENDED_FOR_ACTIVATION olur (TERMINAL CLOSED DEĞİL);
activation borcu WAVE 4'te AYNI SAYFA tarafından kapatılır.

Codex bu sayfada:
- Governance/orchestra/control-plane onarımı BAŞLATMAZ · yeni SA/EG/grant/binding ÜRETMEZ ·
  gh-guard -Repair ÇALIŞTIRMAZ · branch protection/ruleset DEĞİŞTİRMEZ · admin/bypass
  KULLANMAZ · başka PR'ın CI/merge sorununu SAHİPLENMEZ · normal CI beklemesini BLOCKED
  SAYMAZ · exact path kanıtı olmadan competing writer İLAN ETMEZ · CLAUDE lane
  dosyalarına DOKUNMAZ · COLLECTION/ACCOUNTING'e ÖZELLİK EKLEMEZ.

STATUS SINIFLARI:
WAITING_FOR_CI · WAITING_FOR_PREDECESSOR · WAITING_FOR_OTHER_SESSION ·
WAITING_FOR_CONTROL_PLANE · WAITING_FOR_OWNER_DECISION · ACTIVATION_PENDING_WAVE_4 ·
BLOCKED_EXACT
BLOCKED_EXACT yalnız DÖRDÜ BİRDEN sağlanırsa.
⚠ X1'i beklemek BLOCKED_EXACT DEĞİL → WAITING_FOR_PREDECESSOR.
⚠ Flag/canary'yi beklemek BLOCKED_EXACT DEĞİL → ACTIVATION_PENDING_WAVE_4.
```

**CI MANIFEST RULE (owner düzeltmesi 2026-08-03):** `ci-manifests/pure/` **ORTAK,
APPEND-ONLY** bir yüzeydir ve **tek bir lane'e ATANMAZ**. X2 **yalnız kendi** spec
satırlarını ekler; **mevcut satırları DEĞİŞTİRMEZ/SİLMEZ**, başka lane'in satırlarına
**DOKUNMAZ**. Çakışırsa **sonra gelen lane REBASE EDER** — blocker DEĞİL, serialize
edilmesi GEREKMEZ. `__tests__/*` wildcard **exact write manifest sayılmaz**.

**NO SIDE QUEST:** Yeni bulgu gizlice eklenmez ve **blok sayacını değiştirmez**;
master plana disposition için gönderilir.

**ÇÖZÜM DAYATMASI YASAK:** B05'te approval/publication'ın nasıl erişilebilir kılınacağı
(ayrı controller / mevcut disposition controller'ına ek route / komut servisi) ve B07'de
db-gated specleri çalıştırılabilir kılma yolu **peşinen belirlenmemiştir**; mevcut
altyapı **kanıtlanarak** seçilir.

---

## AMAÇ

Financial Disclosure hattını **DORMANT** durumdan çıkarıp ENGINEERING tarafını kapatmak;
aktivasyonu WAVE 4 için hazır hale getirmek.

## MEVCUT DURUM (reconstruction R01 — fresh main'de yeniden doğrulanacak)

```text
KOD:      main'de TAM ve wired (Track B I01-I05 + ACT-R01 I02-I06)
RUNTIME:  DORMANT — İKİ AKTİVASYON BAYRAĞI DA VARSAYILAN KAPALI
          CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED       (default OFF)
          CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED (default OFF)
          Strict literal: value === 'true' ('TRUE'/'1'/' true ' FAIL-CLOSED)
SEVİYE:   LEVEL_0 (write flag off) → endpoint 403, hiçbir şey yaratılmaz
          LEVEL_1 (write on) → DRAFT üretimi erişilebilir, DIŞ ETKİ YOK
          LEVEL_2 (client email) → HTTP'den ERİŞİLEMEZ (approval/publication DORMANT)
MIGRATION: #1629 main'de; LIVE-APPLY durumu UNKNOWN
"PRODUCTION VERIFIED" (#1861): BİR KEREYE MAHSUS owner doğrulaması — KALICI AKTİVASYON DEĞİL
```

`CODE MERGED ≠ PRODUCTION ACTIVATED` · `ACTIVATION READY ≠ PRODUCTION VERIFIED` ·
`CODE BOUND ≠ FLAG ON`.

## SIRALI ALT GÖREVLER

1. **Fresh doğrulama** — P-FD kod ve migration durumunu current main'de yeniden kanıtla
   (konuşma/rapor iddiası değil, repository-truth).
2. **`#1629` migration LIVE-APPLY kanıtı** — şu an UNKNOWN. Gerçek DB'de uygulanmış mı,
   kanıtla. (DB topolojisi: tek `hukuk_db`; production sınıfı ayrı doğrulanır.)
3. **Write flag zinciri** — `isDisclosureWriteEnabled()` davranışı, fail-closed reddi
   (`DISCLOSURE_WRITE_NOT_ENABLED`, varlık sızdırmadan).
4. **Publication flag + provider allowlist** — `['smtp','sendgrid','ses']`;
   onaysız provider → `UnconfiguredDisclosureNotificationDispatcher`.
   **Mock provider production yayınlamayı ASLA yetkilendiremez.**
5. **Approval / publication yolları** — şu an **route-erişilemez** (hiçbir controller
   çağırmıyor). Erişilebilirlik kararı + wiring (owner gate'i gerekirse master plana taşı).
   İçsel gate'ler güçlü: four-eyes (requester≠office-approver≠content-approver),
   stale-snapshot re-verify, conditional `updateMany count===1`.
6. **Fail-closed davranış doğrulaması** — `HELD_PENDING_DISTRIBUTION` asla client-görünür
   değil; yalnız POSTED disposition disclosure üretir; `CASE_CREDITOR_CLUSTER` →
   `UNSUPPORTED_SCOPE` (sessizce atlanamaz).
7. **Canary + runtime/production doğrulaması → WAVE 4** (bu sayfada tamamlanmaz).
8. **Financial Disclosure sertifikasyonu** — db-gated integration specleri gerçek DB ile
   çalıştırılabilir hale getir (şu an `TEST_DATABASE_URL` yoksa **SKIP**).

## EXACT WRITE MANIFEST (başlangıç)

```text
project/apps/api/src/modules/client-financial-disclosure/**
project/apps/api/src/modules/client-settlement/client-financial-disclosure-command.service.ts
project/apps/api/src/modules/client-settlement/__tests__/client-financial-disclosure-command.*
project/apps/api/ci-manifests/pure/*.txt
```

**PİN:** `client-settlement/` içinde yukarıdaki exact dosyalar DIŞINDA hiçbir dosyaya
dokunulmaz (payout/offset/journal/manual-reversal = COLLECTION/ACCOUNTING owned).

## SHARED CONTRACT MANIFEST

```text
OKUNUR (yazılmaz): CollectionDisposition (POSTED) · posting.isPrepareEligible ·
                   office-approval eligibility · client-mutation-policy.ts
YAZILIR:           FD servisleri, FD command service, FD testleri
ÇAKIŞMA RİSKİ:     client-settlement/ paylaşımlı dizin → dosya-bazlı pin ZORUNLU
                   Claude C2 client/ içinde → ayrık (PARALLEL_SAFE, manifest ile teyit)
```

## MERGE ORDER

```text
1. X1 canonical kapalı + merge edilmiş
2. Şema/contract freeze doğrulandı (Claude C1 migration'ı main'de mi, teyit)
3. fresh main
4. X2 alt görev 1..6, 8   — Claude C2 ile PARALEL (Wave 2)
5. Alt görev 7 (canary/aktivasyon) → WAVE 4, owner deployment penceresi
6. X2 canonical kapanış → X3 başlar
```

## ACCEPTANCE KRİTERLERİ

- [ ] `#1629` live-apply durumu **kanıtlandı** (UNKNOWN kalmadı)
- [ ] İki flag'in fail-closed davranışı test ile doğrulandı (strict literal dahil)
- [ ] Publication allowlist + unconfigured-dispatcher fallback doğrulandı
- [ ] Approval/publication erişilebilirlik kararı verildi (wire edildi veya owner'a taşındı)
- [ ] db-gated integration specleri gerçek DB ile **çalıştırıldı** (SKIP değil)
- [ ] `client/`, `seed/`, `prisma/`, COLLECTION payout/journal'a **sıfır dokunuş**
- [ ] CI required checks yeşil · mergeability CLEAN
- [ ] **PRODUCTION_COMPLETE İDDİA EDİLMEDİ** — flag'ler hâlâ OFF, aktivasyon WAVE 4'te

## EXIT CRITERIA

FD ENGINEERING tarafı kapalı ve aktivasyona hazır; migration live-apply kanıtı mevcut;
fail-closed davranış test edilmiş. **Flag-on + canary + runtime doğrulama WAVE 4'tedir.**
Sonra **X3** başlar.
