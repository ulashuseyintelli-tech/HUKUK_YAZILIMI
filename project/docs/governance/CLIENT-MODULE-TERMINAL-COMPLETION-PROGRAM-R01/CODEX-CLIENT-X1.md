# CODEX-CLIENT-X1 — Portal, Notification & Client-Facing Security

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CODEX-CLIENT-X1
LANE OWNER:               CODEX
PREDECESSOR:              R0 — Reconciliation (master plan §10)
SUCCESSOR:                CODEX-CLIENT-X2

ALLOWED PATHS:
  project/apps/api/src/modules/client-notification/
  project/apps/api/src/modules/portal/
  project/apps/web/src/app/portal/
  project/apps/api/ci-manifests/pure/

FORBIDDEN PATHS:
  project/apps/api/src/modules/client/              (CLAUDE C1/C2/C3 — DOKUNMA)
  project/apps/api/src/modules/client/client-mutation-policy.ts   (CLAUDE C2 tek writer)
  project/apps/api/src/modules/seed/                (CLAUDE C1)
  project/apps/api/prisma/                          (CLAUDE LANE migration owner)
  project/apps/api/src/app.module.ts                (CLAUDE serialize eder)
  project/apps/api/src/modules/client-intake-*/     (CODEX X3)
  project/apps/api/src/modules/client-financial-disclosure/  (CODEX X2)
  .github/ · ci.yml

SHARED CONTRACTS:
  client-mutation-policy.ts             → READ-ONLY (CLAUDE C2 tek writer)
  office-approval.isApproverEligible    → READ-ONLY
  notification/workspace authority primitive → CLAUDE C2 ÜRETİR; X1 yalnız TÜKETİR/WIRE eder

  ⚠ XL-1 · SHAPE-FROZEN (master plan §12-A-2, VERIFIED 2026-08-02):
  notification-dispatcher.service.ts public shape'i DEĞİŞTİRİLEMEZ:
      DispatchResult alan seti · DispatchStatus değerleri ·
      NotificationDispatcherService constructor/provider kimliği
  Gerekçe: C1'in client.service.ts:6/320/2562/2574/2611 ve client.module.ts:12/16
  bu shape'e DERLEME ve DI seviyesinde bağımlıdır. Daraltma/yeniden adlandırma/kaldırma
  C1'i tsc --noEmit'te ve ClientModule'ü boot'ta KIRAR — ve bunu jest YAKALAMAZ
  (diagnostics:false); yalnız required OLMAYAN "Test Suite" içindeki Type check yakalar,
  yani kırık kod main'e inebilir.
  GENİŞLETME (yeni opsiyonel alan) serbest. Daraltma → owner kararı + C1 ile koordineli
  TEK değişiklik; aksi hâlde blok WAITING_FOR_OTHER_SESSION.

  ⚠ XL-2 · TÜKETİLEN C1 TİPLERİ (READ-ONLY):
  portal.service.ts:11 `import type { AuditActor }` ← client.service.ts:21 (C1-owned)
  portal.service.ts:10 client-audit.util export'ları    ← C1/C2 tarafı
  X1 bu tipleri YAZMAZ; C1 de daraltmayacağına dair karşılıklı kısıt altındadır.

MIGRATION WRITER:         HAYIR — Codex migration YAZAMAZ.
                          Şema ihtiyacı doğarsa master plana BİLDİRİR; migration Claude
                          lane içinde seri olarak üretilir.

SHARED CONTRACT FREEZE:   CN-1 için rol/yetki politikası ve primitive'i CLAUDE C2'de
                          canonical olur. X1 kendi rol politikasını ÜRETMEZ.

GRANT STATUS:             OWNER GRANT EXPANSION REQUIRED
                          Gerekçe: modules/portal/ mevcut STANDING-GRANT-CLIENT-LIVE-R01
                          allowedPathRoots kapsamı DIŞINDA.
                          client-notification/ grant İÇİNDEDİR.

PRODUCTION GATE:          HAYIR (bu sayfada) — portal/notification değişiklikleri normal
                          deployment akışındadır; U03 Track B ayrı owner authorization ister.

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

## AMAÇ

Müvekkil-yüzü (portal) ve iletişim (notification) yüzeyini validated, sanitized ve
authorized hale getirmek — **çekirdek `client/` yazma alanına hiç dokunmadan.**

## KRİTİK SIRA KURALI — CN-1 WAVE 1'DE UYGULANMAZ

Notification gönderim yetkisi (CN-1) bir **authorization politikası** kararıdır ve
primitive'i **CLAUDE C2** üretir. X1 Wave 1'de yalnız **characterization** yapar.

```text
WAVE 1 (X1):   CN-2 + CN-3 mekanik işler  +  CN-1 CHARACTERIZATION ONLY
CLAUDE C2:     notification/workspace yetki politikası + primitive → canonical, dondurulur
X1 ARDIL:      CN-1 WIRING — donmuş primitive'i endpoint'lere bağla
```

**Codex kendi rol politikasını ÜRETMEZ** — aksi hâlde kavram kayması başlar ve iki lane
farklı yetki modeli uygular.

## SIRALI ALT GÖREVLER

1. **CN-2 — DTO validation divergence (MED).**
   `client-notification.controller.ts:43-131`: `send-email`, `send-sms`, `bulk-email`,
   template create/update **inline TS object type** kullanıyor → global
   `ValidationPipe({whitelist,forbidNonWhitelisted,transform})` **uygulanmıyor**.
   Length cap yok, `bulk-email.recipients` için `ArrayMaxSize` yok, `html: dto.body`
   verbatim persist ediliyor. → decorated DTO class'lara taşı.
   *(Ailenin geri kalanı decorated DTO kullanıyor; tek sapma burası.)*
2. **CN-3 — Provider error leak (LOW).**
   `client-notification.service.ts:573,578,668,675` ham provider `error.message` çağırana
   dönüyor ve `ClientNotification.errorMessage`'a yazılıyor. Mevcut `sanitizeTestError`
   deseniyle sarmala.
3. **CN-4 — SMS secret-in-URL (LOW-OPS).** Log redaksiyonu; provider zorunluysa not düş.
4. **CN-1 CHARACTERIZATION ONLY.**
   `send-email`/`send-sms`/`bulk-email`/`resend` **rol kontrolsüz** (JWT-only), `overview`
   ve `test-send` ise ADMIN-gated. Mevcut davranışı **teste dök**; **yetki UYGULAMA.**
5. **P2 U01/U02 durum doğrulaması** — credential recovery (#1477/#1483/#1487) ve
   session revocation/`tokenVersion` (#1493) fresh main'de doğrula.
6. **U03 field-visibility** — 5 projection sabiti (`CASE_DETAIL_SELECT`,
   `PORTAL_{DOCUMENT,MESSAGE,POA,NOTIFICATION}_CLIENT_SELECT`) fail-closed mü, teyit et.
7. **Object-scope / BOLA kontrolleri** — POL-J enforcement delta'sı KNOWN/NON-ZERO
   (`STF-PRD-BOLA-001`, `STF-PRD-SCP-001`); kapsamı ölç, owner kararına taşı.
8. **Token/session güvenliği · workspace URL erişilebilirlik** (OWN-11 kontratı).
9. **U03 Track B** — **owner authorization gerekir**; alınmadan başlama.
10. **CN-1 WIRING** — yalnız C2 primitive'i canonical + dondurulmuş ise.

## EXACT WRITE MANIFEST (başlangıç)

```text
project/apps/api/src/modules/client-notification/client-notification.controller.ts
project/apps/api/src/modules/client-notification/client-notification.service.ts
project/apps/api/src/modules/client-notification/dto/**                (YENİ DTO class'ları)
project/apps/api/src/modules/client-notification/__tests__/**
project/apps/api/src/modules/portal/portal.service.ts                  (projection doğrulama)
project/apps/api/src/modules/portal/__tests__/**
project/apps/api/ci-manifests/pure/client-portal.txt
```

## SHARED CONTRACT MANIFEST

```text
OKUNUR (yazılmaz): client-mutation-policy.ts · office-approval eligibility ·
                   ClientService API
TÜKETİLİR (C2'den): notification/workspace authority primitive  → CN-1 wiring için
YAZILIR:            notification DTO'ları, portal projection testleri
ÇAKIŞMA RİSKİ:      YOK — write manifest Claude C1 (client/, seed/) ile ayrık.
                    UYARI: portal.service.ts CLIENT verisi OKUR; yazmaz.
```

## MERGE ORDER

```text
1. R0 kapalı + grant expansion (portal/) alınmış
2. X1 alt görev 1..8 — Claude C1 ile PARALEL (Wave 1)
3. U03 Track B → ayrı owner authorization
4. CN-1 WIRING → yalnız CLAUDE C2 kapanıp primitive dondurulduktan SONRA
5. X1 canonical kapanış → X2 başlar
```

## ACCEPTANCE KRİTERLERİ

- [ ] Tüm notification send/template gövdeleri decorated DTO + length/array cap
- [ ] Ham provider error artık çağırana/DB'ye sızmıyor
- [ ] CN-1 mevcut davranışı **teste dökülmüş**; yetki **uygulanmamış** (Wave 1)
- [ ] U01/U02/U03 durumu fresh main'de doğrulanmış
- [ ] Portal projection'ları fail-closed (raw entity dönüşü YOK)
- [ ] Object-scope/BOLA delta'sı ölçülmüş ve owner kararına taşınmış
- [ ] `modules/client/`, `seed/`, `prisma/`'ya **sıfır dokunuş** (diff ile kanıtlı)
- [ ] CI required checks yeşil · mergeability CLEAN

## EXIT CRITERIA

Portal/notification yüzeyi validated + sanitized; CN-1 karakterize edilmiş ve (primitive
geldiyse) wire edilmiş; `client/`, `seed/`, `prisma/`'ya hiç dokunulmamış. Sonra **X2**.
