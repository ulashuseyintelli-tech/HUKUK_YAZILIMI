# CODEX-CLIENT-X3 — Intake & Promotion Integrity

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CODEX-CLIENT-X3
LANE OWNER:               CODEX
PREDECESSOR:              ÜÇ AYRI KAPI — durumları FARKLI (owner kararı 2026-08-03):
                          (1) CLAUDE-CLIENT-C2 R5 primitive CANONICAL + DONMUŞ
                              → KARŞILANDI (C2-B03; INTAKE_LINK_CREATE /
                                CREATE_AND_DELIVER / REVOKE, §13/11 eşiği)
                          (2) CODEX-CLIENT-X1 notification-dispatcher SHAPE-FROZEN
                              → GERÇEK TEKNİK BAĞ (XL-4, aşağıda) — X1'in kapanması
                                ŞART DEĞİL, shape'in donmuş olması ŞART
                          (3) CODEX-CLIENT-X2 canonical kapanışı
                              → GLOBAL PREDECESSOR KALDIRILDI. X3 ile X2 arasında
                                SIFIR import bulundu (VERIFIED 2026-08-03) → kapı
                                BLOK-SEVİYESİNE indirildi (§2-A pre-flight).
                          BLOCK-LEVEL PREDECESSOR: MANDATORY
SUCCESSOR:                WAVE 4 (production gates) → WAVE 5 Terminal Integration
                          (X3'ün KENDİ activation borcu YOKTUR — PRODUCTION GATE: HAYIR)

ALLOWED PATHS:
  project/apps/api/src/modules/client-intake-public/
  project/apps/api/src/modules/client-intake-link/
  project/apps/api/src/modules/client-intake-review/
  project/apps/api/src/modules/client-intake-promotion/
  project/apps/web/src/app/(dashboard)/client-intake/
  project/apps/api/ci-manifests/pure/

FORBIDDEN PATHS:
  project/apps/api/src/modules/client/              (CLAUDE lane — DOKUNMA)
  project/apps/api/src/modules/client/client-mutation-policy.ts  (CLAUDE C2 tek writer)
  project/apps/api/src/modules/seed/                (CLAUDE C1)
  project/apps/api/prisma/                          (CLAUDE LANE migration owner)
  project/apps/api/src/modules/client-notification/ (CODEX X1)
  project/apps/api/src/modules/client-financial-disclosure/  (CODEX X2)
  project/apps/api/src/modules/debtor/              (DEBTOR domain — promote hedefi olsa da)
  .github/ · ci.yml

SHARED CONTRACTS:
  C2-R5 intake authority primitive   → CLAUDE C2 ÜRETİR; X3 yalnız TÜKETİR. X3 kendi
                                       authority modelini KURMAZ.
  client-mutation-policy.ts          → READ-ONLY
  office-approval.isApproverEligible → READ-ONLY (promotion gate'i bunu kullanır)
  CaseDebtorLifecycleGuard           → READ-ONLY (DEBTOR-owned)
  DebtorAddress (promote hedefi)     → DEBTOR-owned; yalnız mevcut promote yolu korunur,
                                       yeni DEBTOR özelliği EKLENMEZ

  ⚠ XL-4 · X3 → X1 DERLEME + DI BAĞIMLILIĞI (VERIFIED 2026-08-03, master plan §12-A-2):
  client-intake-link/client-intake-link.service.ts:5
    import { DispatchResult, NotificationDispatcherService }
      from '@/modules/client-notification/notification-dispatcher.service'
  client-intake-link/client-intake-link.module.ts:3  → ClientNotificationModule (DI)
  client-intake-link/client-intake-link.service.spec.ts:5 → aynı sembolleri import eder
  Bu yüzey X1 LANE-OWNED'dır ve XL-1 ile ZATEN SHAPE-FROZEN'dır (C1'in client.service.ts'i
  de aynı shape'e bağlı). X3 bu shape'i DEĞİŞTİRMEZ, yalnız TÜKETİR; ihtiyaç doğarsa
  master plana bildirir. `notification-dispatcher` ÜÇ tarafın hub'ıdır (C1 · X1 · X3) —
  tek bir shape değişikliği üçünü birden kırar ve kırılma jest'te GÖRÜNMEZ
  (diagnostics:false), yalnız required OLMAYAN "Test Suite" içindeki Type check yakalar.

  X2 İLE İLİŞKİ: X3 ile client-financial-disclosure/ arasında SIFIR import bulundu
  (VERIFIED). X3'ün X2'ye teknik bağımlılığı YOKTUR.

MIGRATION WRITER:         HAYIR — Codex migration YAZAMAZ.
                          Şema ihtiyacı doğarsa master plana bildirir.

SHARED CONTRACT FREEZE:   C2'nin dondurduğu R5 primitive'i DEĞİŞTİRİLMEZ; X3 tüketir.

GRANT STATUS:             GRANT İÇİ — EK GRANT GEREKMEZ (düzeltme 2026-08-03).
                          Dört intake modülünün TAMAMI
                          STANDING-GRANT-CLIENT-TERMINAL-COMPLETION-R01
                          allowedPathRoots kapsamındadır (PR #2113, merge a92a5a44):
                            client-intake-public/ · client-intake-link/
                            client-intake-review/ · client-intake-promotion/
                          ÖNCEKİ "OWNER GRANT EXPANSION REQUIRED" ifadesi #2113 ile
                          SUPERSEDE EDİLMİŞTİR — BAYATTI, artık geçerli DEĞİLDİR.
                          Not: web intake sayfası (apps/web/.../client-intake/) grant
                          allowedPathRoots'ta DEĞİLDİR; ona dokunulacaksa ayrıca teyit
                          edilir.

PRODUCTION GATE:          HAYIR (bu sayfada) — intake değişiklikleri normal deployment
                          akışındadır. CR-1 (review≠promote) OWNER POLICY kararı ister.

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
GO-COMPLETE — CODEX-CLIENT-X3 TAM SAYFA
(owner bu sayfayı AYRI bir sayfada açtığında yürürlüğe girer)

AUTHORIZED WITHOUT FURTHER OWNER APPROVAL:
- X3-B01..X3-B07 sıralı engineering execution
- İzole worktree ve branch
- Test ve bounded production-code değişikliği
- Commit, push, PR
- CI polling
- Required checks PASS + MERGEABLE ise normal squash-merge
- main sync
- Kendi branch/worktree cleanup
- Fresh main ile sıradaki X3 bloğuna OTOMATİK geçiş
- MASTER-PLAN §17 register'da KENDİ satırının güncellenmesi

NO PER-BLOCK OWNER APPROVAL:
Listelenen X3 görevleri için tekrar owner GO İSTENMEYECEK.

OWNER RETURN ONLY IF:
- Ratifiye edilmemiş ürün/politika kararı zorunluysa
  (→ BU SAYFADA BİLİNEN BİR TANE VAR: CR-1, §0-B)
- Allowed-path dışına çıkmak teknik olarak kaçınılmazsa
  (→ şema/migration bu sınıfa girer; Codex migration YAZAMAZ)
- Destructive production data operation gerekiyorsa
- Acceptance kriterleri arasında GERÇEK çelişki varsa
```

## 0-B. CR-1 — OWNER RATIFIED (2026-08-03)

**DURUM: RATİFİYE EDİLDİ.** X3-B04 artık `WAITING_FOR_OWNER_DECISION` DEĞİLDİR;
bu karar **X3-B04'ün implementation yetkisidir** ve **yeniden owner GO istenmez**.
Kanonik kayıt: `project/docs/governance/decision-log.md`
(`CLIENT-X3-CR1-REVIEW-PROMOTE-SEPARATION-RATIFIED`).

```text
RATİFİYE EDİLEN POLİTİKA (on madde, owner 2026-08-03):
 1. Intake review ve promotion birbirinden AYRI işlem ve AYRI yetki kapılarıdır.
 2. Review sonucu promotion yetkisi DOĞURMAZ.
 3. Herhangi bir authenticated tenant kullanıcısı field APPROVE/REJECT YAPAMAZ.
 4. Review işlemi MEVCUT kanonik yetki altyapısındaki uygun intake-review/manage
    yetkisiyle korunacaktır; YENİ ve BAĞIMSIZ authority modeli KURULMAYACAKTIR.
 5. Promotion yalnız mevcut approver-eligibility ve promotion authorization
    kontrollerini geçen aktör tarafından yapılabilir.
 6. Aynı kişi her iki işlemi de ancak İKİ YETKİYİ AYRI AYRI TAŞIYORSA yapabilir.
    Zorunlu four-eyes / farklı-kişi kuralı GETİRİLMEMİŞTİR.
 7. Review ve promotion AYRI audit kayıtları üretmeli; aktör ve zaman korunmalıdır.
 8. Mevcut yetki altyapısı bu politikayı gerçekleştirmeye YETMİYORSA X3 politika
    UYDURMAYACAK; exact teknik boşluğu RAPORLAYACAKTIR.
 9. Bu karar X3-B04 implementation yetkisidir; yeniden owner GO istenmeyecektir.
10. PROGRAM LOCK: CLIENT ONLY.
```

### 0-B-1. MADDE 8 ÖNCEDEN TETİKLENDİ — TESPİT EDİLMİŞ TEKNİK BOŞLUK

Bu boşluk **kontrol sayfası tarafından fresh main `cab19831` üzerinde ölçülmüştür**;
X3-B04 bunu yeniden keşfetmek zorunda değildir, fakat **koddan teyit etmelidir**.

```text
BUGÜNKÜ DURUM (VERIFIED):
  client-intake-review.service.ts        → HİÇBİR yetki çağrısı YOK
    (grep isApproverEligible|assertCan|Permission|capability|role → SIFIR eşleşme)
    ⇒ madde (3) BUGÜN İHLAL EDİLİYOR.
  client-intake-promotion.service.ts:87-88 → assertCanManagePromotion
    → officeApproval.isApproverEligible ; çağrı noktaları :114 :242 :336
    ⇒ madde (5) BUGÜN KARŞILANIYOR.

BOŞLUK:
  Kanonik yetki altyapısında REVIEW-ŞEKİLLİ bir yetki YOKTUR.
  C2'nin dondurduğu primitive (client-workspace-command-authority.ts) yalnızca
  INTAKE_LINK_CREATE · INTAKE_LINK_CREATE_AND_DELIVER · INTAKE_LINK_REVOKE tanır;
  review veya field-approve şekilli komut YOKTUR.

İKİ ADAY VE NEDEN İKİSİ DE TEK BAŞINA YETMEZ:
  (a) officeApproval.isApproverEligible'ı review'a da bağlamak → promotion ZATEN onu
      kullanıyor; bu, madde (1) ve (6)'yı fiilen ANLAMSIZLAŞTIRIR (tek kapı olur).
  (b) C2 primitive'ine review komutu eklemek → X3'ün YETKİSİ DIŞINDADIR
      (C2 tek writer; X3 kendi authority modelini KURMAZ — madde 4).

X3-B04'ÜN YAPACAĞI:
  - Yukarıdaki tespiti KODDAN teyit et (characterization).
  - Mevcut altyapıda madde (1)+(3)+(6)'yı BİRLİKTE sağlayan bir yetki VARSA onu kullan.
  - YOKSA politika UYDURMA: exact boşluğu, iki adayı ve neden yetmediklerini
    RAPORLA; bloğu ANALYSIS_DELIVERED ile kapat ve master plana disposition gönder.
  - Kapatma yolu owner kararı veya C2 koordinasyonu gerektirir ve bu kayıtla
    SEÇİLMEMİŞTİR. `Implementation-layer policy invention YASAKTIR.`
```

## 1-A. BLOK YAPISI VE DEĞİŞTİRİLEMEZ SIRA

Bloklar, ratifiye edilmiş sıralı alt görevlerin (v1.0, madde 1–7) **birebir
karşılığıdır**; yeni iş eklenmemiş, sıra değiştirilmemiştir.

```text
X3 BLOCK COUNT:
7 ENGINEERING BLOCKS
+ 0 ACTIVATION BLOCK  (PRODUCTION GATE: HAYIR — X3'ün activation borcu YOKTUR)

EXECUTION ORDER:
X3-B01 → X3-B02 → X3-B03 → X3-B04 → X3-B05 → X3-B06 → X3-B07

ORDER MUTATION:
FORBIDDEN
```

| Blok | İş |
|---|---|
| **X3-B01** | Fresh doğrulama — sağlam kontrollerin current main'de geçerliliği (regresyon kilidi) |
| **X3-B02** | C2-R5 primitive **TÜKETİMİ** — X3 kendi authority modelini KURMAZ |
| **X3-B03** | CIP-1 sertleştirme — per-token throttle · multi-instance limiter · XFF güven sınırı |
| **X3-B04** | CR-1 — **OWNER RATIFIED 2026-08-03** (§0-B); implementation yetkisi VAR. Madde 8 önceden tetiklendi: review-şekilli kanonik yetki YOK (§0-B-1) → boşluk kanıtlanırsa politika UYDURULMAZ, raporlanır |
| **X3-B05** | CIP-2 — kabul-edilen-tasarım notu; değişiklik yalnız owner isterse |
| **X3-B06** | Promote hattı bütünlüğü — `promotedRef` idempotency · atomic per-field tx · audit · #1933 kuralı regresyonu |
| **X3-B07** | Intake testleri — public/review/promotion kapsamı |

### Her blok sonunda ZORUNLU çıktı

```text
CURRENT PAGE:                 CODEX-CLIENT-X3
COMPLETED BLOCK:              <exact ID>
BLOCK RESULT:                 ENGINEERING_COMPLETE / RUNTIME_VERIFIED /
                              ANALYSIS_DELIVERED / FAILED_EXACT
MERGED PR / SHA:              <PR ve merge SHA>
X3 BLOCKS TOTAL:              7
X3 BLOCKS COMPLETED:          <n>
X3 BLOCKS REMAINING:          <n>
REMAINING BLOCKS:             <exact sıralı liste>
CONSUMED CONTRACTS:           <C2-R5 primitive · X1 notification-dispatcher shape — teyit>
PRE-FLIGHT:                   diğer lane aktif blok=<...> · çakışma=<YOK|VAR> · karar=<...>
NEXT ELIGIBLE:                <yalnız sıradaki exact blok>
OWNER AUTHORIZATION REQUIRED: NO / yalnız CR-1 (B04)
PROGRAM LOCK:                 CLIENT ONLY
```

## 2-A. BLOCK-LEVEL PRE-FLIGHT (her blok öncesi — ZORUNLU)

X3 ile X2 arasında global predecessor **kaldırıldığı** için çakışma kontrolü artık
**blok seviyesindedir**.

```text
1. Aktif diğer-lane bloklarının EXACT WRITE MANIFEST'i alınır — repository-truth:
   açık PR `gh pr view <n> --json files` + branch `git diff --name-only`.
   KONUŞMA İDDİASI KANIT DEĞİLDİR.
   ÖZELLİKLE: X1'in aktif bloğu client-notification/ içinde mi?
   (X1'in CN-1 wiring'i notification-dispatcher yüzeyine dokunabilir — XL-4)
2. Bu X3 bloğunun exact write manifest'i yazılır (gerçek dosya adları;
   `__tests__/*` wildcard YETERSİZ).
3. SHARED-CONTRACT karşılaştırması — dosya adı YETMEZ:
   - notification-dispatcher shape (XL-4) değişiyor mu?
   - C2-R5 primitive'i değişiyor mu? (değişmemeli — DONMUŞ)
4. Çakışma YOK → blok yürür.
   Çakışma VAR → YALNIZ o blok WAITING_FOR_OTHER_SESSION; sıra ATLANMAZ,
   diğer lane'e DOKUNULMAZ.
5. Çıktıya PRE-FLIGHT satırı eklenir.
```

## 3-A. ÜÇ DURUM AYRIMI

```text
CODE_PRESENT != ENGINEERING_COMPLETE != PRODUCTION_ACTIVE
MERGED != ENGINEERING_COMPLETE
```

X3'ün **activation borcu YOKTUR** (PRODUCTION GATE: HAYIR). B07 bittiğinde sayfa
doğrudan `ENGINEERING_COMPLETE` olur ve `TERMINAL CLOSED` ilan edilebilir —
CR-1 owner-deferred kalırsa bu **açıkça** kaydedilir.

## 4-A. BLOCKER DISCIPLINE + CI MANIFEST RULE

```text
Codex bu sayfada:
- Governance/orchestra/control-plane onarımı BAŞLATMAZ · yeni SA/EG/grant/binding ÜRETMEZ ·
  gh-guard -Repair ÇALIŞTIRMAZ · branch protection/ruleset DEĞİŞTİRMEZ · admin/bypass
  KULLANMAZ · başka PR'ın CI/merge sorununu SAHİPLENMEZ · register biçim eksikliğini
  product blocker SAYMAZ · normal CI beklemesini BLOCKED SAYMAZ · exact path kanıtı
  olmadan competing writer İLAN ETMEZ · CLAUDE lane dosyalarına DOKUNMAZ.

STATUS SINIFLARI:
WAITING_FOR_CI · WAITING_FOR_PREDECESSOR · WAITING_FOR_OTHER_SESSION ·
WAITING_FOR_CONTROL_PLANE · WAITING_FOR_OWNER_DECISION · BLOCKED_EXACT

BLOCKED_EXACT yalnız DÖRDÜ BİRDEN sağlanırsa:
(1) bloğun acceptance'ı teknik olarak ilerleyemiyor, (2) engel granted scope içinde
çözülemiyor, (3) engel repository/current-main kanıtıyla doğrulanmış, (4) devam etmek
veri kaybı veya yetki ihlali yaratacak.
DİKKAT: CR-1 kararını beklemek BLOCKED_EXACT DEĞİLDİR → WAITING_FOR_OWNER_DECISION.
```

**CI MANIFEST RULE:** `ci-manifests/pure/client-portal.txt` program boyu **tek manifest
writer = C1**'dir. X3 kendi spec satırlarını **append-only** ekler, başka lane'in
satırlarına DOKUNMAZ; çakışırsa **sonra gelen rebase eder** (blocker DEĞİL).
`__tests__/*` wildcard **exact write manifest sayılmaz**.

**NO SIDE QUEST:** Yeni bulgu mevcut göreve gizlice eklenmez ve **blok sayacını
değiştirmez**; master plana disposition için gönderilir.

**ÇÖZÜM DAYATMASI YASAK:** B03'te limiter'ın nasıl paylaşımlı hale geleceği
(Redis / DB-backed / proxy-level) ve per-token throttle'ın nerede duracağı
**peşinen belirlenmemiştir**; mevcut altyapı ve gerçek proxy topolojisi **kanıtlanarak**
seçilir. XFF güven sınırı **varsayımla** değil, doğrulanmış topolojiyle belirlenir.

---

## AMAÇ

Intake (public → review → promotion) hattının bütünlüğünü ve yetki tüketimini tamamlamak —
**`client/` çekirdeğine ve mutation-policy'ye hiç dokunmadan.**

## MEVCUT DURUM (reconstruction R01 — fresh main'de yeniden doğrulanacak)

**SAĞLAM olan (bozulmayacak):**
- Token modeli: `randomBytes(32).base64url` (256-bit); DB'de yalnız `sha256` (`tokenHash`);
  ham token bir kez döner, saklanmaz → enumeration-dirençli.
- Doğrulama: her hata **generic** mesaj (`GENERIC_INVALID`) → varlık oracle'ı yok.
- Tenant binding **server-derived** (`link.*`'ten); dış gövde yalnız
  `category/label/value/note` set edebilir → mass-assignment YOK.
- Atomic use-count: conditional `updateMany(status=ACTIVE, useCount<maxUses)`,
  `count===0 → Gone` → TOCTOU kapalı.
- Honeypot silent-drop; ham IP saklanmaz (yalnız `sha256(ip)`).
- **KIRMIZI ÇİZGİ:** public yüzey **asla** canonical yazmaz — yalnız
  `ClientIntakeSubmission` + `ClientIntakeField`; promotion ayrı, authenticated modüldür.
- Promotion authorization **UYGULANMIŞ**: `assertCanManagePromotion` →
  `isApproverEligible`, her yazımdan ÖNCE; cross-tenant/cross-case forgery bloklu.

**AÇIK bulgular:**
- **CIP-1 (LOW-MED):** rate-limit **in-memory + tek-instance**, IP-keyed; multi-instance
  deploy'da limit process başına. Per-token throttle yok. `trust proxy:1` nedeniyle API'ye
  doğrudan erişilebilen bir yol varsa `X-Forwarded-For` saldırgan kontrollü →
  limit atlatma + `sourceMeta.ipHash` forensik değeri kaybı.
- **CIP-2 (LOW):** token bir **bearer capability**; link'i ele geçiren `maxUses` kadar
  gönderebilir (tasarım gereği; `maxUses` default 1 + expiry + staff review).
- **CR-1 (LOW-INFO):** review adımı (claim/reviewField/bulkReview/reject) JWT+tenant only;
  **herhangi bir tenant kullanıcısı** alanı `APPROVED` yapabilir. Yalnız downstream promote
  approver-eligibility ister. **reviewer ≠ promoter ayrımı YOK** → owner policy kararı.

## SIRALI ALT GÖREVLER

1. **Fresh doğrulama** — yukarıdaki sağlam kontrollerin current main'de hâlâ geçerli
   olduğunu kanıtla (regresyon kilidi).
2. **C2-R5 primitive TÜKETİMİ** — intake-link mutation authority'yi C2'nin dondurduğu
   primitive üzerinden bağla. **X3 kendi authority modelini KURMAZ.**
3. **CIP-1 sertleştirme** — per-token throttle + limiter'ın multi-instance davranışı
   (paylaşımlı store) + XFF güven sınırı (proxy topolojisi doğrulanarak).
4. **CR-1** — review ≠ promote ayrımı: **owner policy kararı alınmadan uygulanmaz**;
   karar gelene kadar yalnız karakterizasyon.
5. **CIP-2** — kabul-edilen-tasarım notu; değişiklik yalnız owner isterse.
6. **Promote hattı bütünlüğü** — `promotedRef` idempotency, atomic per-field tx,
   `CLIENT_INTAKE_PROMOTE*` audit'i korunur; passive `CaseDebtor` promote hedefi olamaz
   (#1933 kuralı) regresyon testiyle kilitlenir.
7. **Intake testleri** — public/review/promotion için kapsam tamamlanır.

## EXACT WRITE MANIFEST (başlangıç)

```text
project/apps/api/src/modules/client-intake-public/**
project/apps/api/src/modules/client-intake-link/**
project/apps/api/src/modules/client-intake-review/**
project/apps/api/src/modules/client-intake-promotion/**
project/apps/api/ci-manifests/pure/*.txt
```

## SHARED CONTRACT MANIFEST

```text
TÜKETİLİR (C2'den): R5 intake authority primitive        (ZORUNLU predecessor)
OKUNUR (yazılmaz):  client-mutation-policy.ts · office-approval eligibility ·
                    CaseDebtorLifecycleGuard · DebtorAddress promote yolu
YAZILIR:            intake modülleri + testleri
ÇAKIŞMA RİSKİ:      Claude C3 client/ içinde → dizin ayrık.
                    DİKKAT: intake, ClientService/authority primitive'ini TÜKETİR →
                    "farklı dizin" tek başına yeterli değil; C2 primitive'i DONMUŞ olmalı.
```

## MERGE ORDER

```text
1. X2 canonical kapalı + merge edilmiş
2. CLAUDE C2 kapalı ve R5 primitive'i CANONICAL + DONMUŞ  (ZORUNLU)
3. Grant expansion alınmış (client-intake-public/, client-intake-link/)
4. fresh main
5. X3 alt görev 1..7   — Claude C3 ile PARALEL (Wave 3)
6. X3 canonical kapanış → WAVE 4/5
```

## ACCEPTANCE KRİTERLERİ

- [ ] Sağlam kontroller (token/tenant-binding/atomic use-count/kırmızı çizgi) regresyon
      testleriyle **kilitlendi**
- [ ] Intake-link mutation authority **C2 primitive'i üzerinden** çalışıyor (kendi modeli YOK)
- [ ] Per-token throttle + multi-instance limiter davranışı çözüldü
- [ ] XFF güven sınırı proxy topolojisiyle doğrulandı
- [ ] CR-1 owner kararına bağlandı (uygulandıysa test edildi, uygulanmadıysa kayıtlı)
- [ ] Promote idempotency + audit + passive-CaseDebtor kuralı regresyonla kilitli
- [ ] `client/`, `client-mutation-policy.ts`, `prisma/`'ya **sıfır dokunuş** (diff kanıtlı)
- [ ] CI required checks yeşil · mergeability CLEAN

## EXIT CRITERIA

Intake yüzeyi authorized (C2 primitive'i ile), rate-limited, idempotent ve test edilmiş;
public yüzeyin canonical-yazmama kırmızı çizgisi regresyonla korunuyor.
CODEX lane ENGINEERING tarafı kapanır → **WAVE 4**.
