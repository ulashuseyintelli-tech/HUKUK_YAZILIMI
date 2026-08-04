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

STATUS:                   ENGINEERING_COMPLETE / MERGED / CANONICAL
REMAINING PRODUCT WORK:   NONE
PRODUCT EVIDENCE:         #2126 / 5f4202a8 + #2140 / cbe49683
CANONICAL SA PUBLICATION: #2165 / cdd24aaa
GRANT STATUS:             SATISFIED / HISTORICAL
U03 TRACK B:              CLOSED / CANONICAL / PASS
PRODUCTION VERIFICATION:  VERIFIED ONCE
CURRENT FLAGS:            DEFAULT OFF
PERSISTENT ACTIVATION:    OWNER-GATED / NOT PERFORMED
NEXT ELIGIBLE:            CODEX-CLIENT-X2
                          X2'nin canonical ilerleme kayıtları MASTER-PLAN'da korunur.

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

## TERMİNAL ALT GÖREV DURUMU

1. **Notification remediation + client-facing verification:** #2126 / `5f4202a8` ile
   DTO validation, provider error sanitization ve portal/U01/U02/U03/object-scope/token/
   workspace-URL doğrulama kapsamı tamamlandı.
2. **CN-1 canonical authority wiring:** #2140 / `cbe49683` ile tamamlandı.
3. **Canonical semantic authority publication:** #2165 / `cdd24aaa` ile yayımlandı.
4. **U03 Track B:** CLOSED / CANONICAL / PASS.
5. **Production verification:** VERIFIED ONCE; current flags DEFAULT OFF;
   persistent activation OWNER-GATED / NOT PERFORMED.

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

## MERGE KANIT ZİNCİRİ

```text
1. #2126 / 5f4202a8 — X1 product engineering + verification
2. #2140 / cbe49683 — CN-1 canonical authority wiring
3. #2165 / cdd24aaa — terminal canonical semantic authority publication
4. X1 ENGINEERING_COMPLETE / MERGED / CANONICAL → X2 NEXT ELIGIBLE
```

## ACCEPTANCE KRİTERLERİ

- [x] Notification DTO validation ve provider error sanitization (#2126)
- [x] CN-1 canonical authority wiring (#2140)
- [x] U01/U02/U03, portal projection, object-scope/BOLA, token/session ve workspace URL
      doğrulaması (#2126)
- [x] `modules/client/`, `seed/`, `prisma/` kapsam sınırı korundu
- [x] U03 Track B CLOSED / CANONICAL / PASS
- [x] Production verification VERIFIED ONCE; flags DEFAULT OFF
- [x] Terminal semantic authority canonical yayımlandı (#2165)

## EXIT CRITERIA

**SATISFIED.** X1 ENGINEERING_COMPLETE / MERGED / CANONICAL; remaining product work
NONE. X2 NEXT ELIGIBLE; X2'nin mevcut canonical ilerleme kayıtları korunur.
