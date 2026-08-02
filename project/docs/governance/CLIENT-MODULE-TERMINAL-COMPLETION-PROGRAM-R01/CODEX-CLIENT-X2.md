# CODEX-CLIENT-X2 — Financial Disclosure

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
MASTER PLAN VERSION:      v1.0 (OWNER RATIFIED)
THIS PAGE:                CODEX-CLIENT-X2
LANE OWNER:               CODEX
PREDECESSOR:              CODEX-CLIENT-X1 (canonical kapalı olmalı)
SUCCESSOR:                CODEX-CLIENT-X3

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
