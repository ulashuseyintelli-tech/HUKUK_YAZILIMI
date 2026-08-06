# CLAUDE-CLIENT-C2-I08 — Pre-Wave5 Legacy-Flat Reduction

```text
ACTIVE MODULE:            CLIENT ONLY
MASTER PROGRAM:           CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
THIS PAGE:                CLAUDE-CLIENT-C2-I08
LANE OWNER:               CLAUDE
KURULUŞ:                  Owner disposition 2026-08-06 (SELECTED OPTION a) —
                          decision-log kaydı + WAVE4-EVIDENCE-R01.md §14
BLOK:                     C2-I08-PRE-WAVE5-LEGACY-FLAT-REDUCTION-R01 (TEK blok, iki aşama)
PREDECESSOR:              WAVE 4 = PRODUCTION_ACTIVE / CONTROLLED_RESIDUALS OPEN;
                          ARC-07 I05 PASS + I06 PASS (WAVE4-EVIDENCE §11);
                          I08 = MANDATORY PRE-WAVE5 RESIDUAL (NOT EXECUTED / NOT WAIVED)
KANONİK SINIR:            Charter §49.6/§49.14 (D05 Stage-3) AYNEN YÜRÜRLÜKTE —
                          consumer-readiness KANITLANMADAN legacy-flat reduction YASAK.
                          Bu sayfa charter'ı OVERRIDE EDEMEZ.

ALLOWED PATHS:
  project/apps/api/src/modules/client/                  (adres/lifecycle yüzeyi)
  project/apps/api/src/modules/export-import/ · ocr/ · portal/  (YALNIZ AŞAMA A
                          READ-ONLY envanter; yazım cross-lane koordinasyon ister)
  project/apps/api/prisma/                              (YALNIZ AŞAMA B + bounded grant
                          expansion canonical kayda alınmışsa)
  project/docs/governance/                              (bu programın kayıtları)
FORBIDDEN:                .github/ · ci.yml · başka lane WIP'i · HY_WT/RUNTIME (dirty)

CONTEXT RULE:             Konuşma hafızası kanonik değildir; current main + bu sayfa +
                          decision-log + charter §49 kanonik kaynaktır.
PROGRAM LOCK:             CLIENT ONLY
```

## 0. OWNER AUTHORIZATION

GO (owner disposition 2026-08-06): **AŞAMA A hemen başlayabilir** — yeni oturum/sayfa
üzerinde; mevcut C3 sayfasında I08 engineering'i YASAK. AŞAMA B yalnız AŞAMA A'nın
TÜM pass koşulları kanıtla PASS olursa OTOMATİK açılır; ayrı owner GO istenmez.
Şema/migration gerekirse **bounded grant expansion canonical kayda alınmadan yazılmaz**.

## 1. AŞAMA A — READINESS (ANALYSIS_ONLY; ürün davranışı/şema/production data mutation YOK)

```text
A1  Legacy-flat READER + WRITER envanteri (exact dosya:satır; repository-truth).
    Bilinen başlangıç izleri: client.service create/update flat adres yazımı (VER-02),
    export-import, ocr, portal projeksiyonu — TAM envanter bu aşamada çıkarılır.
A2  Flat yazımın devam edip etmediğini gerçek runtime/code kanıtıyla belirle
    (yalnız iddia değil: kod yolu + gerekirse kontrollü gözlem).
A3  I07'nin KARŞILADIĞI ve KARŞILAMADIĞI consumer-readiness koşullarını ayır
    (charter §49.14: I07 kanıtın PARÇASIDIR, TAMAMI DEĞİLDİR).
A4  Normalized (ClientAddress) ↔ flat parity/violation DRY-RUN'ı üret
    (I06 arc07i06-* satırları dahil; kova: eşit/farklı/yalnız-flat/yalnız-relational).
A5  Characterization testleri YAZILABİLİR (davranış değiştirmeden).
```

**AŞAMA A PASS KOŞULLARI (hepsi birden, kanıtla):**

```text
P1  Legacy-flat AKTİF WRITER sayısı = 0
P2  TÜM consumer'lar normalized yapıya hazır (I07 + kalan boşluklar kapalı)
P3  Backfill parity EKSİKSİZ
P4  Violation = 0 VEYA ratifiye edilmiş disposition mevcut
P5  Exact I08 mutation + rollback/forward-repair yöntemi KANITLI
```

DİKKAT: P1/P2 bugün SAĞLANMIYOR (flat yazım sürüyor — VER-02); bunları sağlamak
AŞAMA A'nın analiz çıktısına dayalı, ayrıca yetkilendirilecek engineering işidir —
AŞAMA A kendisi ürün davranışını DEĞİŞTİRMEZ; boşlukları exact olarak raporlar ve
gereken engineering dilimlerini owner disposition'ına sunar.

## 2. AŞAMA B — ENGINEERING + ACTIVATION (yalnız AŞAMA A tamamen PASS ise otomatik)

```text
- İdempotent I08 executor (tenant-safe, audit'li, testli; veri kaybı YOK)
- Ayrı dry-run ve apply; §9-D kapıları: fresh backup/restore provası + formal freeze
- I08 dry-run PASS → apply → runtime verification
- Şema/migration: yalnız bounded grant expansion canonical kayda alındıktan sonra
```

## 3. STOP KURALLARI

```text
Readiness eksikse: charter OVERRIDE EDİLMEZ · flat veri SİLİNMEZ · I08 UYGULANMAZ.
Her kapı FAIL'inde sonraki adıma geçilmez; BLOCKED_EXACT kanıtıyla dönülür.
```

## 4. STATUS

```text
C2-I08-PRE-WAVE5-LEGACY-FLAT-REDUCTION-R01: NOT STARTED — AŞAMA A NEXT ELIGIBLE
WAVE 5 ELIGIBILITY bağı: bu sayfanın production-verified kapanışı + FD provider
ops gate'i (WAVE4-EVIDENCE §14) birlikte.
```
