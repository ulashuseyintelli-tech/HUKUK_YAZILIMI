# CLAUDE-CLIENT-C2 — Mutation Authority Completion + Address Lifecycle

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CLAUDE-CLIENT-C2
LANE OWNER:               CLAUDE
PREDECESSOR:              GLOBAL C1→C2 PREDECESSOR: **REMOVED** (owner kararı, 2026-08-02)
                          BLOCK-LEVEL PREDECESSOR: **MANDATORY** — her C2 bloğu
                          başlamadan önce §2-A pre-flight protokolü çalıştırılır.
                          C2, C1 DEVAM EDERKEN açılabilir; C1'in tamamının bitmesi
                          BEKLENMEZ. C2 sırası DEĞİŞTİRİLMEZ.
SUCCESSOR:                CLAUDE-CLIENT-C3
                          Cross-lane teslimat borçları:
                            C2-B03 çıktısı → CODEX-CLIENT-X3'ün predecessor'ı
                            C2-B06 çıktısı → CODEX-CLIENT-X1 CN-1 wiring'in predecessor'ı

ALLOWED PATHS:
  project/apps/api/src/modules/client/          (core + address alt-sistemi)
  project/apps/api/src/modules/client/client-mutation-policy.ts   (TEK WRITER)
  project/apps/web/src/components/client/       (capability projeksiyonu gerekirse)
  project/apps/api/ci-manifests/pure/client-portal.txt   (§4 CI MANIFEST RULE ile)

FORBIDDEN PATHS:
  project/apps/api/src/modules/client/client.service.ts (C1 LANE-OWNED — owner kararı
                                                         2026-08-02; C2 KOŞULSUZ YAZMAZ)
  <AKTİF C1 BLOĞUNUN EXACT DOSYALARI>                   (§2-A pre-flight ile tespit edilir)
  project/apps/api/src/modules/seed/                    (C1 lane-owned)
  project/apps/api/prisma/                              (C2 migration YAZMAZ — §MIGRATION)
  project/apps/api/src/app.module.ts                    (C1 serialize etti)
  project/apps/api/src/modules/portal/                  (CODEX X1)
  project/apps/api/src/modules/client-notification/     (CODEX X1)
  project/apps/api/src/modules/client-financial-disclosure/  (CODEX X2)
  project/apps/api/src/modules/client-intake-*/         (CODEX X3)
  .github/ · ci.yml
  project/docs/governance/coordination-v2/activation/ · .../schemas/
  project/scripts/orchestration-v2/

SHARED CONTRACTS:
  client-mutation-policy.ts          → BU SAYFA TEK WRITER'DIR. Diğer tüm lane/sayfalar
                                       read-only tüketir. Çıkışta DONDURULUR.
  office-approval.isApproverEligible → READ-ONLY. UYARI: eligibility ÜÇ yerde FARKLI
                                       (office: PARTNER, MANAGER HARİÇ · disclosure:
                                       PARTNER/MANAGER · payout: MANAGER dahil).
                                       "Birleştirme/normalizasyon" refactor'ü YASAK —
                                       sessizce bir yolu genişletir. Değişiklik gerekirse
                                       owner kararı + koordineli TEK değişiklik.
  ClientService mutation API         → C1'den devralınır; C1'in dondurduğu davranış
                                       gerekçesiz değiştirilmez.
  ci-manifests/pure/client-portal.txt→ PAYLAŞIMLI (X1 ile) — §4

MIGRATION WRITER:         HAYIR — bu sayfa migration YAZMAZ.
                          Program kuralı: MIGRATION OWNER = CLAUDE LANE; aynı anda TEK
                          aktif migration görevi. Şema ihtiyacı doğarsa master plana
                          BİLDİRİLİR (NEW FINDING RULE); C2 kendi migration'ını açmaz.

SHARED CONTRACT FREEZE:   Bu sayfa client-mutation-policy.ts'i ve ürettiği authority
                          primitive'lerini DONDURUR. Çıkışta primitive'ler canonical ilan
                          edilir; X1 (CN-1 wiring) ve X3 (intake authority) ancak bundan
                          sonra tüketir.

GRANT STATUS:             GRANT İÇİ — `modules/client/` hem STANDING-GRANT-CLIENT-LIVE-R01
                          hem STANDING-GRANT-CLIENT-TERMINAL-COMPLETION-R01 kapsamındadır.
                          EK GRANT GEREKMEZ. (Web capability projeksiyonu gerekirse
                          `apps/web/` kapsamı ayrıca teyit edilir.)

PRODUCTION GATE:          EVET — C2-PROD-ACTIVATION (ARC-07 I05 dry-run → I06 apply → I08)
                          WAVE 4'tedir. C2 sayfası bu blok tamamlanmadan TERMINAL CLOSED
                          ilan EDİLEMEZ.
                          UYARI: KOŞULLU PRODUCTION YETKİSİ BU SAYFA İÇİN HENÜZ VERİLMEDİ —
                          owner ratifikasyonu C1-PROD-ACTIVATION için verilmiştir (§5).

TASK ORDER:
  Master planda yazılı sıra değiştirilemez.

CONTEXT RULE:
  Konuşma hafızası canonical kaynak değildir.
  Current main, master plan ve ratifiye kararlar canonical kaynaktır.

CROSS-LANE RULE:
  Diğer lane'in dosyasına, PR'ına, branch'ine, worktree'sine veya görevine dokunma.

CROSS-MODULE RULE:
  CLIENT dışındaki bulguları dependency olarak kaydet; implementation başlatma.

NEW FINDING RULE:
  Yeni bulgu mevcut göreve gizlice eklenmez ve BLOK SAYACINI DEĞİŞTİRMEZ.
  Master plana disposition için gönderilir.

PROGRAM LOCK:             CLIENT ONLY
```

---

## 0. OWNER AUTHORIZATION (tek seferlik — blok başına onay YOK)

```text
OWNER AUTHORIZATION:
GO-COMPLETE — CLAUDE-CLIENT-C2 TAM SAYFA
(C1 ENGINEERING_COMPLETE olduğunda ve owner bu sayfayı AYRI bir sayfada açtığında
yürürlüğe girer)

AUTHORIZED WITHOUT FURTHER OWNER APPROVAL:
- C2-B01..C2-B08 sıralı engineering execution
- İzole worktree ve branch
- Test ve bounded production-code değişikliği
- Commit, push, PR
- CI polling
- Required checks PASS + MERGEABLE ise normal squash-merge
- main sync
- Kendi branch/worktree cleanup
- Fresh main ile sıradaki C2 bloğuna OTOMATİK geçiş
- Master status/count güncellemesi
- Cross-lane teslimat borçlarının (B03, B06) canonical ilan edilmesi

NO PER-BLOCK OWNER APPROVAL:
Listelenen C2 görevleri için tekrar owner GO İSTENMEYECEK.

OWNER RETURN ONLY IF:
- Ratifiye edilmemiş hukuki/ürün kararı zorunluysa
  (→ bu sayfada BİLİNEN İKİ TANE VAR: §2)
- Allowed-path dışına çıkmak teknik olarak kaçınılmazsa
  (→ şema/migration ihtiyacı bu sınıfa girer; C2 migration yazamaz)
- Destructive production data operation koşullu yetkinin dışındaysa
  (→ C2-PROD-ACTIVATION için koşullu yetki HENÜZ VERİLMEDİ, §5)
- Acceptance kriterleri arasında GERÇEK çelişki varsa
```

---

## 1. BLOK YAPISI VE DEĞİŞTİRİLEMEZ SIRA

Bloklar, ratifiye edilmiş sıralı alt görevlerin (v1.0, madde 1–8) **birebir karşılığıdır**;
yeni iş eklenmemiş, sıra değiştirilmemiştir.

```text
C2 BLOCK COUNT:
8 ENGINEERING BLOCKS
+ 1 DEFERRED PRODUCTION ACTIVATION BLOCK

EXECUTION ORDER:
C2-B01 → C2-B02 → C2-B03 → C2-B04 → C2-B05 → C2-B06 → C2-B07 → C2-B08
→ C2-PROD-ACTIVATION (WAVE 4)

ORDER MUTATION:
FORBIDDEN
```

Her blok **ayrı branch/worktree/PR** ile tamamlanabilir; fakat **aynı sayfa** bütün C2
programını sonuna kadar yönetir. Yeni bulgu blok sayacını değiştiremez.

### Her blok sonunda ZORUNLU çıktı

```text
CURRENT PAGE:                 CLAUDE-CLIENT-C2
COMPLETED BLOCK:              <exact ID>
BLOCK RESULT:                 ENGINEERING_COMPLETE / RUNTIME_VERIFIED /
                              ACTIVATION_PENDING / FAILED_EXACT
MERGED PR / SHA:              <PR ve merge SHA>
C2 BLOCKS TOTAL:              8
C2 BLOCKS COMPLETED:          <n>
C2 BLOCKS REMAINING:          <n>
REMAINING BLOCKS:             <exact sıralı liste>
CROSS-LANE DELIVERABLES:      <B03 / B06 canonical mı — X3 / X1 serbest mi>
ACTIVATION DEBT:              <liste veya NONE>
NEXT ELIGIBLE:                <yalnız sıradaki exact blok>
OWNER AUTHORIZATION REQUIRED: NO / yalnız gerçek istisna
PROGRAM LOCK:                 CLIENT ONLY
```

---

## 2-A. BLOCK-LEVEL PREDECESSOR PROTOKOLÜ (her C2 bloğundan ÖNCE — ZORUNLU)

Owner kararı (2026-08-02): **GLOBAL C1→C2 PREDECESSOR: REMOVED · BLOCK-LEVEL
PREDECESSOR: MANDATORY.** C2, C1 devam ederken açılır; C1'in tamamının bitmesi
**beklenmez**. C2 sırası **değiştirilmez**.

**Her C2 bloğu başlamadan önce, istisnasız:**

```text
1. Aktif C1 bloğunun EXACT WRITE MANIFEST'i alınır.
   Kaynak (repository-truth): C1 sayfasının son blok çıktısı + C1'in AÇIK PR'ının
   `gh pr view <n> --json files` çıktısı + C1 branch'inin `git diff --name-only`si.
   Konuşma iddiası kanıt DEĞİLDİR.
2. Bu C2 bloğunun EXACT WRITE MANIFEST'i (gerçek dosya adları) yazılır.
3. SHARED-CONTRACT MANIFEST karşılaştırılır (yalnız dosya adı değil: aynı sözleşmeyi
   —policy semantiği, eligibility, ClientService mutation API— yazan iki iş de çakışmadır).
4. KARAR:
   - EXACT ÇAKIŞMA YOK  → C2 bloğu YÜRÜR.
   - ÇAKIŞMA VAR        → YALNIZ O C2 BLOĞU `WAITING_FOR_OTHER_SESSION` olur.
                          Sıra ATLANMAZ, sonraki C2 bloğuna GEÇİLMEZ, C1'e DOKUNULMAZ.
                          C1'in ilgili bloğu merge olunca fresh main alınıp yeniden denenir.
5. Her blok çıktısına şu satır eklenir:
   PRE-FLIGHT: C1 aktif blok=<ID/PR> · çakışma=<YOK|VAR:dosya listesi> · karar=<YÜRÜDÜ|BEKLEDİ>
```

**LANE DOSYA SAHİPLİĞİ (owner kararı):**

| Sahip | Dosya/dizin | Diğer lane |
|---|---|---|
| **C1 (CLAUDE lane)** | `client.service.ts` · `seed/` · `prisma/` · `app.module.ts` | C2 **YAZAMAZ** |
| **C2 (CLAUDE lane)** | `client-mutation-policy.ts` · aktif address/authority dosyaları | C1 **YAZAMAZ** |
| Dinamik | Aktif C1 bloğunun exact dosyaları | C2 o blok süresince yazamaz |

**BİLİNEN KISIT — C2-B02 (R4).** Workspace komutlarının servis gövdeleri
(`sendPoaReminder` · `sendTemplateNotification` · `sendDocumentRequest`)
`client.service.ts` içindedir ve bu dosya **C2'ye koşulsuz kapalıdır**. Bu, B02'yi
otomatik olarak bloklamaz: sayfanın **outcome gate**'i gate'in yerini serbest bırakır
(controller katmanı · ortak command-authority helper · `client-mutation-policy`
sınıflandırmasının genişletilmesi). `client.service.ts` gerektiren bir çözüm **seçilemez**;
başka çözüm de kanıtla mümkün değilse blok `WAITING_FOR_OTHER_SESSION` olur ve
master plana disposition için bildirilir (NEW FINDING RULE).

**C2-B01 İSTİSNASI:** B01 **read-only residual reconciliation**'dır (ürün diff'i SIFIR).
Hiçbir yazma yüzeyi olmadığı için C1 ile çakışması yapısal olarak imkânsızdır →
**HEMEN BAŞLAYABİLİR** (pre-flight yine de çalıştırılır ve `çakışma=YOK` olarak kaydedilir).

---

## 2. ÖN KOŞUL — BİLİNEN OWNER KARARLARI (B02'den ÖNCE alınmalı)

Bu sayfada **iki blok**, master plan §13'teki **aynı** ratifiye edilmemiş owner kararına
bağlıdır:

```text
OWNER DECISION (master plan §13, madde 11):
"İletişim/workspace gönderim rol politikası" — hangi roller client-facing komut
dispatch edebilir ve gerçek mail/SMS gönderebilir.

BAĞLI BLOKLAR:
  C2-B02 (R4 workspace command authorization — FIND-C2)
  C2-B06 (notification/workspace authority primitive — CN-1'in kaynağı)
```

**KURAL:** Bu karar alınmadan B02 implementation'a BAŞLAMAZ. Karar öncesi yalnız
**characterization** (mevcut davranışın teste dökülmesi) yapılabilir; blok
`WAITING_FOR_OWNER_DECISION` ile beklemeye alınır ve **sıra atlanmaz**.
`Implementation-layer policy invention YASAKTIR` — rol eşiği owner ratifikasyonu olmadan
koda yazılmaz.

İkinci bilinen owner kararı (yalnız B05'i etkiler): **OWN-10/12/15** kalemlerinden owner
kararı gerektirenler. B05 başlarken hangilerinin ratifiye, hangilerinin `DEFERRED` olduğu
repository kanıtıyla tespit edilir; ratifiye olmayanlar **açıkça owner-deferred** kaydedilir.

---

## 3. ÜÇ DURUM AYRIMI (MERGED ile kapanış YASAK)

```text
CODE_PRESENT:          Kod main'de.
ENGINEERING_COMPLETE:  Kod + test + CI + merge + cleanup + local/controlled runtime
                       verification.
PRODUCTION_ACTIVE:     İlgili migration/flag/runtime/backfill değişikliği GERÇEK hedef
                       ortamda uygulanmış ve doğrulanmış.

KURAL:
MERGED ≠ ENGINEERING_COMPLETE
ENGINEERING_COMPLETE ≠ PRODUCTION_ACTIVE
```

B01–B08 migration TAŞIMAZ → her biri `RUNTIME_VERIFIED` ile kapanır.
ARC-07 backfill (I05/I06/I08) production ortamına bağlıdır → `ACTIVATION_PENDING`.

B08 bittiğinde sayfa durumu:

```text
C2 ENGINEERING:            COMPLETE
C2 PRODUCTION ACTIVATION:  PENDING_WAVE_4  (ARC-07 I05 → I06 → I08)
C2 PAGE:                   SUSPENDED_FOR_ACTIVATION
                           NOT TERMINALLY CLOSED
```

**C3 başlayabilir**; C2'nin production borcu master planda **açık kalır**.
Wave 4 geldiğinde **yeni sahip oluşturulmaz** — aynı C2 sayfası tekrar açılır.

---

## 4. BLOCKER DISCIPLINE + CI MANIFEST RULE

```text
Claude bu sayfada:
- Governance/orchestra/control-plane onarımı BAŞLATMAZ.
- Yeni SA/EG/grant/binding ÜRETMEZ.
- gh-guard -Repair ÇALIŞTIRMAZ.
- Branch protection/ruleset DEĞİŞTİRMEZ.
- Admin/bypass KULLANMAZ.
- Başka PR'ın CI veya merge sorununu SAHİPLENMEZ.
- decision-log/register biçim eksikliğini product blocker SAYMAZ.
- Normal CI beklemesini BLOCKED SAYMAZ.
- Başka lane'in ayrık çalışmasını competing writer SAYMAZ.
- Exact path kanıtı olmadan competing writer İLAN ETMEZ.

STATUS SINIFLARI:
- WAITING_FOR_CI
- WAITING_FOR_PREDECESSOR
- WAITING_FOR_OTHER_SESSION
- WAITING_FOR_CONTROL_PLANE
- WAITING_FOR_OWNER_DECISION      (§2 ön koşulu için)
- ACTIVATION_PENDING_WAVE_4
- BLOCKED_EXACT

BLOCKED_EXACT yalnız DÖRDÜ BİRDEN sağlanırsa:
1. Mevcut exact C2 bloğunun acceptance'ı teknik olarak ilerleyemiyorsa,
2. Engel granted scope içinde çözülemiyorsa,
3. Engel repository/current-main kanıtıyla doğrulanmışsa,
4. Devam etmek veri kaybı veya yetki ihlali yaratacaksa.

CONTROL-PLANE KAYNAKLI MERGE SORUNU ÇIKARSA:
- Product kapsamını GENİŞLETME.
- Control-plane onarımı YAPMA.
- Tek kısa dependency handoff ver.
- Mevcut bloğu WAITING_FOR_CONTROL_PLANE olarak bırak.
- Sırayı ATLAYIP sonraki C2 işine GEÇME.
```

**CI MANIFEST RULE.** `ci-manifests/pure/client-portal.txt` tek fiziksel dosyadır ve hem
client hem portal speclerini taşır → CODEX X1 ile gerçek ortak writer yüzeyi.

```text
- C2 yalnız KENDİ testlerini bağlayan exact satırları yazar.
- C2, X1'in portal manifest satırlarına DOKUNMAZ.
- WAVE 2 MANIFEST WRITER = CLAUDE C2. Aynı anda bu dosyayı iki taraf YAZMAZ; çakışma
  olursa append-only satır olarak serialize edilir (sonra gelen rebase eder).
- `__tests__/*` wildcard EXACT WRITE MANIFEST DEĞİLDİR; her blok başlamadan GERÇEK
  dosya adları listelenir.
```

---

## 5. C2-PROD-ACTIVATION — KOŞULLU YETKİ DURUMU

```text
CONDITIONAL PRODUCTION AUTHORIZATION FOR C2-PROD-ACTIVATION:
NOT YET GRANTED — OWNER DECISION REQUIRED
```

Gerekçe: Owner koşullu production yetkisini açıkça **"GRANTED FOR C1-PROD-ACTIVATION"**
olarak vermiştir. C2'nin ARC-07 backfill zinciri (I05 dry-run → I06 apply → I08
legacy-flat reduction) **ayrı bir production mutation sınıfıdır** ve kendi owner kararını
bekler. Bu sayfa kendine production yetkisi ÜRETEMEZ (`noSelfAuthorizationChange`).

Owner bu bloğa koşullu yetki verirse, master plan §9-D kapıları aynen uygulanır
(fresh backup/restore yolu · duplicate/aday envanteri · deterministik ve audit edilebilir
ön-temizlik · staging/temiz DB PASS · rollback veya forward-repair planı · required CI
PASS · write freeze · dry-run kabul kriterleri içinde · veri kaybı veya çözümsüz duplicate
YOK).

ARC-07'nin kendi kapıları **ayrıca bağlayıcıdır**:
- **D04 zorunlu sırası:** dry-run apply'dan ÖNCE · production sayımları mutasyondan ÖNCE ·
  owner-gated apply · idempotent eligibility · açık duplike/conflict kovaları · açık run
  provenance · post-apply doğrulama · rollback sınırları önce belgelenir.
- **D07 production kanıt sınırı:** production backfill APPLY öncesi production kanıtı
  ZORUNLU; Docker `hukuk_db` development/integration sınıfıdır ve production sayımı olarak
  **atıf edilemez**.

---

## 6. AMAÇ

OWN-13 yetki workstream'inin **residuallerini kapatmak** ve **ClientAddress yaşam
döngüsünü aynı yetki sözleşmesi altında** tamamlamak.

**Adres neden bu sayfada (Codex'te değil):** `client-address.service.ts`,
`client-address-lifecycle.ts`, `client-address-resolver.ts` **`modules/client/` altındadır**
ve OWN-13 I02-R2 (#2096) adres mutasyon yetkisini **`client-mutation-policy.ts`'e
bağlamıştır**. Adresi ayrı bir lane'e vermek garantili same-file + shared-contract
çakışması üretirdi.

---

## 7. BLOKLAR

### C2-B01 — R3 RECONCILE ONLY (yeniden implement ETME)
PR #2107 (`789cf8f6`, ANCESTOR_OK) R3 bulk/backfill authorization'ı
**CANONICAL_EARLY_DELIVERABLE** olarak teslim etti
(`assertCanRunElevatedClientBulkOperation`, owner D04/D06).
Burada yalnız fresh main'de **residual doğrulama** ve master plan kaydı yapılır.
C1-B01 ile örtüşen kalemler **yeniden doğrulanmaz**; C1'in kanıtı devralınır ve yalnız
R3'e özgü residual (bulk mutation authority'nin policy modülündeki yeri ve elevated
predicate'in `assertCanReactivateViaCreate` ile aynı eşikte kalması) teyit edilir.
**DUPLICATE R3 AÇILMAZ.**
**Sonuç:** `RUNTIME_VERIFIED`.

### C2-B02 — R4 Workspace command authorization (FIND-C2)
`client.controller.ts:116-215`: `poa-reminders/send` · `template-notifications/send` ·
`document-requests/send` · `intake-links` · `poas/:poaId/file` **rol kontrolsüz**
(VIEWER dahil her authenticated tenant kullanıcısı client-facing komut dispatch edebiliyor)
ve bu komutlar **AuditLog üretmiyor** (yalnız artefakt satırı / `createdById`).
**ÖN KOŞUL:** §2 owner rol politikası. Karar öncesi yalnız characterization.
**ÇÖZÜM DAYATMASI YOK:** gate'in servis sınırında mı, ortak bir command-authority
helper'ında mı, yoksa mevcut `client-mutation-policy` sınıflandırmasının genişletilmesiyle
mi kurulacağı **kanıtla** seçilir; audit'in hangi kayıt ailesine yazılacağı (BP-09 Axis A/B)
aynı blokta gerekçelendirilir.
**Sonuç:** `RUNTIME_VERIFIED`.

### C2-B03 — R5 Intake-link mutation authority  ⟶ CROSS-LANE TESLİMAT (X3)
Intake-link mutation authority'sini canonical hale getirir.
**Çıktısı CODEX-CLIENT-X3'ün predecessor'ıdır:** primitive burada canonical olur ve
DONDURULUR; X3 yalnız **tüketir**, kendi authority modelini kurmaz.
Kapsam sınırı: `client-intake-link/` modülü **C2'nin FORBIDDEN path'idir** — bu blok
primitive'i `modules/client/` tarafında üretir; intake modülüne bağlama işi X3'ündür.
**Sonuç:** `RUNTIME_VERIFIED` + `CROSS-LANE DELIVERABLE: X3 UNBLOCKED`.

### C2-B04 — R6 POA upload authority
`POST /clients/:clientId/poas/:poaId/file` yetkilendirmesi; mandate artefaktının
yüklenmesi `ClientPowerOfAttorney` yaşam döngüsüne bağlı bir authority işlemidir.
`MANDATE SCOPE ≠ EXECUTION AUTHORITY` ayrımı korunur; POA içerik/kapsam semantiği ve
capability binding **C3'ün** işidir — burada yalnız yükleme yetkisi ve audit kurulur.
**Sonuç:** `RUNTIME_VERIFIED`.

### C2-B05 — R7 OWN-10/12/15 bağlantıları
Blok başında her bir kalemin ratifiye/deferred durumu **repository kanıtıyla** tespit
edilir. Ratifiye olanlar uygulanır; ratifiye olmayanlar **açıkça owner-deferred** olarak
kaydedilir ve blok bu kayıtla kapanır (gerekçesiz "tamamlandı" YAZILMAZ).
**Sonuç:** `RUNTIME_VERIFIED` (uygulanan kalemler) + deferred kalemlerin exact listesi.

### C2-B06 — Notification/workspace authority primitive  ⟶ CROSS-LANE TESLİMAT (X1)
CN-1 (notification `send-email` / `send-sms` / `bulk-email` / `resend` rol kontrolsüz)
için **politika ve primitive burada üretilir ve DONDURULUR**; **CODEX X1 yalnız WIRE eder**.
Codex kendi rol politikasını ÜRETMEZ.
**ÖN KOŞUL:** §2 owner rol politikası (B02 ile aynı karar).
Kapsam sınırı: `client-notification/` **C2'nin FORBIDDEN path'idir** — primitive
`modules/client/` tarafında üretilir; endpoint'lere bağlama X1'in işidir.
**Sonuç:** `RUNTIME_VERIFIED` + `CROSS-LANE DELIVERABLE: X1 CN-1 WIRING UNBLOCKED`.

### C2-B07 — Address lifecycle (ARC-07 mühendislik tamamlama)
I04 production-evidence **hazırlığı** · resolver · `isPrimary`/`isCurrent` invariantları
(çok-current İZİNLİ, çok-primary YASAK; `OBJECT SELECTION (isPrimary) ≠ LIFECYCLE STATE
(isCurrent)`) · multi-address davranışı · rollback sınırlarının belgelenmesi.
**Bilinen defekt:** `isCurrent` AS-IS fiilen **inert** — kod hiçbir yerde `false`
atamıyor (charter §49 kaydı). Bu blokta kapatılır.
**ÇÖZÜM DAYATMASI YOK:** `isCurrent`'ın nasıl etkinleştirileceği (archive yolu üzerinden
mi, ayrı lifecycle geçişi olarak mı, resolver seviyesinde mi) mevcut ARC-07 invariant
guard'ı ve D05 kaynak-otorite aşamalandırması ile **kanıta dayanarak** seçilir.
**Flat alan yazımı DURDURULAMAZ** (D05 Stage 1); Stage 3 azaltımı I08'dir → WAVE 4.
**I05/I06/I08 BU BLOKTA YAPILMAZ.**
**Sonuç:** `RUNTIME_VERIFIED` + `ACTIVATION DEBT: ARC-07 I05/I06/I08`.

### C2-B08 — Fail-closed sertifikasyonu (core + adres)
Yetkisiz her yol **yazımsız** reddedilir: VIEWER · tenant-mismatch · `ADMIN ama elevated
değil` (owner D07: adreste ADMIN tek başına YETMEZ) · DTO allowlist'te olmayan bilinmeyen
alan (fail-closed → SENSITIVE) · partial-sensitive karışık request (tümü hassas yetki ister).
Reddedilen mutasyonda 403 + stabil `reasonCode` döner ve **yalnız alan ADLARI** loglanır —
ham TCKN/VKN/adres değeri audit'e veya gövdeye YAZILMAZ.
Başarısız mutasyon audit ÜRETMEZ; audit-yazım hatası mutasyonu ROLLBACK eder.
**Sonuç:** `ENGINEERING_COMPLETE` → sayfa `SUSPENDED_FOR_ACTIVATION`.

### C2-PROD-ACTIVATION — WAVE 4 (aynı sayfa tarafından)
ARC-07 `I05 dry-run → I06 apply → I08 legacy-flat reduction`, §5 koşullu yetkisi
**owner tarafından verildikten sonra** ve master plan §9-D + ARC-07 D04/D07 kapılarıyla.
Bu blok bitmeden C2 **TERMINAL CLOSED değildir**.
**Sonuç:** `PRODUCTION_ACTIVE`.

---

## 8. EXACT WRITE MANIFEST

**KURAL:** Aşağıdaki liste sayfa-seviyesi kapsamdır; **her blok başlamadan o bloğun
gerçek dosya adları listelenir** (`__tests__/*` wildcard exact manifest sayılmaz).

```text
project/apps/api/src/modules/client/client-mutation-policy.ts        (TEK WRITER)
project/apps/api/src/modules/client/client-address.service.ts
project/apps/api/src/modules/client/client-address-lifecycle.ts
project/apps/api/src/modules/client/client-address.controller.ts
project/apps/api/src/modules/client/client-address-resolver.ts
project/apps/api/src/modules/client/client.controller.ts             (§8-A koşuluyla)
project/apps/api/src/modules/client/__tests__/<blok başına exact spec adları>
project/apps/web/src/components/client/<gerekirse exact dosyalar>
project/apps/api/ci-manifests/pure/client-portal.txt                 (§4 kuralıyla)
```

### 8-A. KALDIRILAN VE KOŞULLU KALEMLER (tutarlılık düzeltmesi)

```text
KALDIRILDI: project/apps/api/src/modules/client/client.service.ts
```

Bu dosya sayfanın **FORBIDDEN PATHS** listesinde (C1 LANE-OWNED, owner kararı 2026-08-02)
olmasına rağmen write manifest'te de duruyordu — **belge içi çelişki**. C1 lane sahipliği
esastır: **C2 `client.service.ts` YAZMAZ.** (Bu, C2-B02'nin §2-A'da kayıtlı bilinen
kısıtının aynısıdır: gate `client.service.ts` DIŞINDA bir yere konur veya blok
`WAITING_FOR_OTHER_SESSION` olur.)

```text
KOŞULLU: project/apps/api/src/modules/client/client.controller.ts
```

Owner'ın lane bölüşümünde **açıkça atanmamıştır** ve C1 geçmişte dokunmuştur (#2107).
Bu yüzden her blok başında §2-A pre-flight'ında **ayrıca kontrol edilir**: aktif C1
bloğunun manifest'inde `client.controller.ts` varsa C2 o bloğu `WAITING_FOR_OTHER_SESSION`
yapar. Yoksa C2 yazabilir.

### 8-B. TEST-SEVİYESİ ÇAPRAZ BAĞ (kayıt)

`client/__tests__/client-address-mutation-authorization-r2.spec.ts:402-403` C1'in
`create`/`update` imza şeklini **regex ile assert eder** ve C1 ile **aynı jest process'inde**
koşar. C1 o imzayı değiştirirse bu C2-lane spec'i kırılır (dosyalar ayrı olsa bile).
Pre-flight'ta C1'in aktif bloğu `client.service.ts` imzasına dokunuyorsa bu **shared-contract
çakışması** sayılır.

## 9. SHARED CONTRACT MANIFEST

```text
YAZILIR (tek writer): client-mutation-policy.ts  → çıkışta DONDURULUR
OKUNUR (yazılmaz):    office-approval.isApproverEligible (3'lü eligibility sapması KORUNUR)
                      ClientService mutation API (C1 dondurdu)
ÜRETİLİR (dondurulur): B03 intake authority primitive       → X3 tüketir
                       B06 notification/workspace primitive → X1 tüketir
ÇAKIŞMA RİSKİ:        C1 aynı client.service.ts'e dokundu → C1 ENGINEERING_COMPLETE
                      olmadan BAŞLAMAZ; her blok fresh main ile başlar.
                      X2 (client-financial-disclosure/) ile write manifest AYRIK →
                      Wave 2 paralelliği manifest karşılaştırmasıyla TEYİT EDİLİR
                      ("farklı dizin" tek başına yeterli DEĞİLDİR).
```

## 10. MERGE ORDER

```text
1. C1 ENGINEERING_COMPLETE ŞARTI KALDIRILDI (owner kararı 2026-08-02).
   Yerine: HER BLOK ÖNCESİ §2-A pre-flight (aktif C1 manifest'i vs bu blok manifest'i).
2. §2 owner rol politikası alınmış (B02 ve B06 için)
3. fresh main
4. C2-B01 → ... → C2-B08 (sıra değişmez; her blok kendi PR'ı, kendi cleanup'ı;
   çakışan blok WAITING_FOR_OTHER_SESSION olur, SIRA ATLANMAZ)
5. B03 kapanışında → X3 UNBLOCKED ilan edilir
   B06 kapanışında → X1 CN-1 WIRING UNBLOCKED ilan edilir
6. C2 ENGINEERING_COMPLETE → C3 başlar (C2 activation borcu açık kalır)
7. WAVE 4 → aynı sayfa C2-PROD-ACTIVATION (owner koşullu yetkisi verilirse)
Codex X2 paralel yürür (write manifest ayrık: client-financial-disclosure/)
```

## 11. ACCEPTANCE KRİTERLERİ (blok bazlı)

- [x] **B01** R3 reconcile edildi; duplicate implementation açılmadı; C1 kanıtı devralındı
      *(2026-08-02, main `573ea61a`: R3'e özgü iki residual koddan kanıtlandı —
      (1) bulk mutation authority policy modülünde: `decideClientBulkMutation`
      `client-mutation-policy.ts:370`, aynı `CLIENT_MUTATION_REASON` sözlüğü; servis kapısı
      `assertCanRunElevatedClientBulkOperation` (`client.service.ts:413`) kararı policy'ye
      devrediyor; (2) elevated eşiği `assertCanReactivateViaCreate` ile AYNI tek predicate:
      `canManageLifecycle → officeApproval.isApproverEligible`, ikinci hesap YOK, tenant
      eşitliği ÖNCE, ADMIN tek başına YETMEZ (D04/D07).
      `client-bulk-mutation-authorization-r3.spec.ts` 12/12 PASS; C1-B01 ile örtüşen
      kalemler YENİDEN doğrulanmadı — C1 kanıtı devralındı (5/5 kalem, 47/47 test,
      #2107 reuse `789cf8f6`). Ürün diff'i SIFIR → RUNTIME_VERIFIED.
      PRE-FLIGHT: C1 aktif blok=B05 (branch `claude/client-c1-b05-identity-design-gate`
      @ 573ea61a, diff BOŞ, PR YOK) · çakışma=YOK · karar=YÜRÜDÜ)*
- [ ] **B02** workspace komutları rol-gated + audited; owner politikası uygulanmış;
      gate yeri kanıtla seçilmiş (dayatma yok)
      *(2026-08-02 — CHARACTERIZATION TAMAM, IMPLEMENTATION `WAITING_FOR_OWNER_DECISION`:
      decision-log'da §13/11 "iletişim/workspace gönderim rol politikası" kaydı YOK
      (CN-1/FIND-C2 anahtarlarıyla sıfır eşleşme, repository-truth). Mevcut davranış
      `client-workspace-command-authorization-characterization.spec.ts` ile sabitlendi,
      15/15 PASS: 5 komut endpoint'i rol kontrolsüz (VIEWER + tanımsız rol dispatch
      edebiliyor); controller aktör rolünü servise İLETMİYOR (sendPoaReminder/uploadPoaFile
      aktörü hiç almıyor); send komutları `isApproverEligible`'a danışmıyor ve AuditLog
      üretmiyor. Gate yeri seçimi (controller / ortak helper / policy sınıflandırması)
      owner kararı SONRASINA bırakıldı — çözüm dayatması yok.
      PRE-FLIGHT: C1 aktif blok=B05/PR #2124 (client.service.ts + migration + kendi spec +
      manifest + §17) · exact yazım çakışması=YOK (yalnız manifest/§17 ortak-anchor —
      sonra gelen rebase eder) · karar=CHARACTERIZATION YÜRÜDÜ)*
- [ ] **B03** intake authority primitive canonical + **dondurulmuş**; X3 tüketebilir
- [ ] **B04** POA upload yetkilendirilmiş + audited; mandate semantiği C3'e bırakılmış
- [ ] **B05** OWN-10/12/15 kalemleri ratifiye/deferred olarak **exact** sınıflandırılmış
- [ ] **B06** notification/workspace primitive canonical + **dondurulmuş**; X1 tüketebilir
- [ ] **B07** `isCurrent` artık inert değil; primary/current invariantları test edilmiş;
      rollback sınırları belgelenmiş; I05/I06/I08 **yapılmamış** (WAVE 4)
- [ ] **B08** yetkisiz mutasyon (core + adres) fail-closed: yazım YOK, audit YOK,
      403 + stabil reasonCode; ham PII sızmıyor; audit-fail → rollback
- [ ] Her blok: CI required checks yeşil · mergeability CLEAN · squash-merge · main sync ·
      kendi branch/worktree cleanup · zorunlu blok çıktısı yayımlandı

## 12. EXIT CRITERIA

```text
ENGINEERING EXIT (B08 sonrası):
Her `client/` mutasyonu (core + adres) fail-closed yetkili ve audited; OWN-13 residualleri
kapalı veya açıkça owner-deferred; client-mutation-policy.ts ve iki cross-lane primitive
CANONICAL ve DONDURULMUŞ (X1 ve X3 serbest); ARC-07 mühendisliği tamam.
→ C2 PAGE: SUSPENDED_FOR_ACTIVATION (TERMINAL CLOSED DEĞİL) → C3 başlar.

TERMINAL EXIT (WAVE 4 sonrası):
C2-PROD-ACTIVATION (ARC-07 I05 → I06 → I08) owner koşullu yetkisiyle uygulandı,
doğrulandı, kanıtlandı.
→ C2 PAGE: TERMINAL CLOSED / PRODUCTION_ACTIVE.
```
