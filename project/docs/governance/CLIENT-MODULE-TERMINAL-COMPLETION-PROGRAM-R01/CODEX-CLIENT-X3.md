# CODEX-CLIENT-X3 — Intake & Promotion Integrity

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CODEX-CLIENT-X3
LANE OWNER:               CODEX
PREDECESSOR:              CODEX-CLIENT-X2 (canonical kapalı olmalı)
                          + CLAUDE-CLIENT-C2 R5 primitive'i CANONICAL ve DONMUŞ olmalı
SUCCESSOR:                WAVE 4 (production gates) → WAVE 5 Terminal Integration

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

MIGRATION WRITER:         HAYIR — Codex migration YAZAMAZ.
                          Şema ihtiyacı doğarsa master plana bildirir.

SHARED CONTRACT FREEZE:   C2'nin dondurduğu R5 primitive'i DEĞİŞTİRİLMEZ; X3 tüketir.

GRANT STATUS:             OWNER GRANT EXPANSION REQUIRED
                          Gerekçe: client-intake-public/ ve client-intake-link/ mevcut
                          STANDING-GRANT-CLIENT-LIVE-R01'de AÇIKÇA prohibitedPathRoots
                          listesindedir. Bu kaldırılmadan CANLI implementation BAŞLAMAZ.

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
