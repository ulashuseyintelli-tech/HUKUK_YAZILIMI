# CLAUDE-CLIENT-C2 — Mutation Authority Completion + Address Lifecycle

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CLAUDE-CLIENT-C2
LANE OWNER:               CLAUDE
PREDECESSOR:              CLAUDE-CLIENT-C1 (canonical kapalı olmalı)
SUCCESSOR:                CLAUDE-CLIENT-C3
                          (ayrıca: C2-R5 çıktısı → CODEX-CLIENT-X3'ün predecessor'ı;
                           C2 notification/workspace primitive'i → CODEX-CLIENT-X1 wiring'in
                           predecessor'ı)

ALLOWED PATHS:
  project/apps/api/src/modules/client/          (core + address alt-sistemi)
  project/apps/api/src/modules/client/client-mutation-policy.ts   (TEK WRITER)
  project/apps/web/src/components/client/       (capability projeksiyonu gerekirse)
  project/apps/api/ci-manifests/pure/

FORBIDDEN PATHS:
  project/apps/api/src/modules/seed/                    (C1 kapsamı, kapandı)
  project/apps/api/prisma/                              (C2 migration YAZMAZ)
  project/apps/api/src/modules/portal/                  (CODEX X1)
  project/apps/api/src/modules/client-notification/     (CODEX X1)
  project/apps/api/src/modules/client-financial-disclosure/  (CODEX X2)
  project/apps/api/src/modules/client-intake-*/         (CODEX X3)
  .github/ · ci.yml

SHARED CONTRACTS:
  client-mutation-policy.ts          → BU SAYFA TEK WRITER'DIR. Diğer tüm lane/sayfalar
                                       read-only tüketir.
  office-approval.isApproverEligible → READ-ONLY. UYARI: eligibility ÜÇ yerde FARKLI
                                       (office: PARTNER, MANAGER HARİÇ · disclosure:
                                       PARTNER/MANAGER · payout: MANAGER dahil).
                                       "Birleştirme/normalizasyon" refactor'ü YASAK —
                                       sessizce bir yolu genişletir. Değişiklik gerekirse
                                       owner kararı + koordineli tek değişiklik.
  ClientService mutation API         → C1'den devralınır

MIGRATION WRITER:         HAYIR — bu sayfa migration YAZMAZ.
                          Şema ihtiyacı doğarsa master plana bildirilir; Claude lane
                          içinde ayrı ve SERİ bir migration görevi olarak ele alınır.

SHARED CONTRACT FREEZE:   Bu sayfa client-mutation-policy.ts'i DONDURUR.
                          Çıkışta primitive'ler canonical ilan edilir; X1 (notification
                          wiring) ve X3 (intake authority) ancak bundan sonra tüketir.

GRANT STATUS:             GRANT İÇİ — modules/client/ allowedPathRoots kapsamındadır.
                          (Web capability projeksiyonu gerekirse ayrıca teyit edilir.)

PRODUCTION GATE:          EVET — ARC-07 I05 (backfill dry-run), I06 (backfill apply) ve
                          I08 (legacy-flat reduction) bu sayfada TAMAMLANMAZ; WAVE 4'e
                          (owner deployment programı) ertelenir. Burada yalnız
                          mühendislik hazırlığı yapılır.

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

OWN-13 yetki workstream'inin **residuallerini kapatmak** ve **ClientAddress yaşam
döngüsünü aynı yetki sözleşmesi altında** tamamlamak.

**Adres neden bu sayfada (Codex'te değil):** `client-address.service.ts`,
`client-address-lifecycle.ts`, `client-address-resolver.ts` **`modules/client/` altındadır**
ve OWN-13 I02-R2 (#2096) adres mutasyon yetkisini **`client-mutation-policy.ts`'e bağlamıştır**.
Adresi ayrı bir lane'e vermek garantili same-file + shared-contract çakışması üretir.

## SIRALI ALT GÖREVLER

1. **R3 — RECONCILE ONLY (yeniden implement ETME).**
   PR #2107 R3 bulk/backfill authorization'ı **CANONICAL_EARLY_DELIVERABLE** olarak teslim
   etti (`assertCanRunElevatedClientBulkOperation`, D04/D06). Burada yalnız fresh main'de
   **residual doğrulama** ve master plan kaydı yapılır.
2. **R4 — Workspace command authorization (FIND-C2).**
   `client.controller.ts:116-215`: `poa-reminders/send`, `template-notifications/send`,
   `document-requests/send`, `intake-links`, `poas/:poaId/file` **rol kontrolsüz**
   (VIEWER dahil herkes client-facing komut dispatch edebiliyor) ve **AuditLog üretmiyor**.
   Owner rol politikası (master plan §13/11) alındıktan sonra servis sınırında gate.
3. **R5 — Intake-link mutation authority.**
   **Çıktısı CODEX X3'ün predecessor'ıdır**: primitive burada canonical olur, X3 yalnız tüketir.
4. **R6 — POA upload authority.**
5. **R7 — OWN-10/12/15 bağlantıları.**
6. **Notification/workspace authority primitive'i canonical hale getirilir.**
   CN-1 (notification send/bulk/resend rol kontrolsüz) için **politika ve primitive burada
   üretilir**; **CODEX X1 yalnız WIRE eder**. Codex kendi rol politikasını üretmez.
7. **Address lifecycle — ARC-07 mühendislik tamamlama.**
   I04 production-evidence hazırlığı · resolver · `isPrimary`/`isCurrent` invariantları
   (çok-current İZİNLİ, çok-primary YASAK) · multi-address davranışı · rollback sınırları.
   **Not:** `isCurrent` AS-IS fiilen inert (kod hiçbir yerde `false` atamıyor) — bu kapatılır.
   **I05/I06/I08 = WAVE 4.**
8. **Fail-closed sertifikasyonu** — core + adres mutasyonlarında yetkisiz her yol
   (VIEWER, tenant-mismatch, ADMIN-ama-elevated-değil, unknown-field) **yazımsız reddedilir**.

## EXACT WRITE MANIFEST (başlangıç)

```text
project/apps/api/src/modules/client/client.controller.ts
project/apps/api/src/modules/client/client.service.ts
project/apps/api/src/modules/client/client-mutation-policy.ts        (TEK WRITER)
project/apps/api/src/modules/client/client-address.service.ts
project/apps/api/src/modules/client/client-address-lifecycle.ts
project/apps/api/src/modules/client/client-address.controller.ts
project/apps/api/src/modules/client/__tests__/*
project/apps/api/ci-manifests/pure/client-portal.txt
```

## SHARED CONTRACT MANIFEST

```text
YAZILIR (tek writer): client-mutation-policy.ts
OKUNUR (yazılmaz):    office-approval.isApproverEligible  (3'lü eligibility sapması korunur)
ÜRETİLİR (dondurulur): R5 intake authority primitive     → X3 tüketir
                       notification/workspace authority primitive → X1 tüketir
ÇAKIŞMA RİSKİ:        C1 aynı client.service.ts'e dokundu → C1 kapanmadan BAŞLAMAZ
```

## MERGE ORDER

```text
1. C1 canonical kapalı + main'e merge edilmiş
2. fresh main
3. C2 alt görevleri 1..8 (sıra değişmez)
4. C2 kapanışında primitive'ler DONDURULUR → X1 wiring ve X3 başlayabilir
Codex X2 paralel yürür (write manifest ayrık: client-financial-disclosure/)
```

## ACCEPTANCE KRİTERLERİ

- [ ] R3 reconcile edildi; duplicate implementation açılmadı
- [ ] R4 workspace komutları rol-gated + audited (owner politikası uygulanmış)
- [ ] R5 intake authority primitive'i canonical + dondurulmuş (X3 tüketebilir)
- [ ] R6/R7 kapalı veya açıkça owner-deferred (gerekçe kayıtlı)
- [ ] Notification/workspace primitive'i canonical + dondurulmuş (X1 tüketebilir)
- [ ] Adres: primary/current invariantları test edilmiş; `isCurrent` inert değil
- [ ] Yetkisiz mutasyon (core + adres) fail-closed: yazım YOK, audit YOK, 403 + reasonCode
- [ ] Reddedilen mutasyonda ham PII sızmıyor (yalnız alan ADLARI)
- [ ] CI required checks yeşil · mergeability CLEAN

## EXIT CRITERIA

Her `client/` mutasyonu (core + adres) fail-closed yetkili ve audited; OWN-13 residualleri
kapalı veya owner-deferred; **R5 ve notification/workspace primitive'leri canonical ve
dondurulmuş**. ARC-07 mühendisliği tamam, backfill WAVE 4'e hazır. Sonra **C3** başlar.
