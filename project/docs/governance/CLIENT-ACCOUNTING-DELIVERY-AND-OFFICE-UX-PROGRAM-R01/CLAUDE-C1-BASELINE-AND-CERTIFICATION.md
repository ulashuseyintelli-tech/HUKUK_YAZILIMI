# C1 — BASELINE + COVERAGE MATRIX + METİN ONARIMI + UÇTAN UCA SERTİFİKASYON (P0 · P1 · P8)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    CLAUDE-C1        LANE OWNER: CLAUDE
PREDECESSOR:  YOK — programın ilk hattı
SUCCESSOR:    C1-B01 → C3, X2, X3-B01   ·   C1-B02 → C2, X1
              C1-B03+ (UAT) → tüm hatların ARDILI

ALLOWED PATHS:
  project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/
  <C1-B02 EXACT WRITE MANIFEST>          (yalnız metin onarımı; blok başında yayımlanır)

FORBIDDEN PATHS:
  apps/web/src/components/client-compliance/**  ·  .../client-disclosure/**   (C2 · X1)
  apps/api/src/modules/client-statement/**  ·  .../client-financial-disclosure/**  (C3 · X2)
  apps/api/prisma/                                                (MIGRATION OWNER = X3)
  apps/web/src/components/client-accounting/**                    (ÇALIŞAN EKRAN)
  project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/  (KAPALI PROGRAM)
  .github/ · ci.yml · coordination-v2/activation/ · project/scripts/orchestration-v2/

BLOCK ORDER (DEĞİŞTİRİLEMEZ):
  C1-B01 → C1-B02 → C1-B03 → C1-B04 → C1-B05
BLOCKS TOTAL: 5   COMPLETED: 1 (B01)   ACTIVATION DEBT: NONE
PROGRAM LOCK: CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## C1-B01 — FRESH BASELINE + COVERAGE MATRIX + DİLİM ATAMASI  *(docs-only)*

**1. Baseline sabitleme**
`git fetch origin` → fresh `origin/main`. `#2262` / `94ddb975` için
`git merge-base --is-ancestor` doğrulaması. Kapalı programın
`CLIENT PROGRAM STATUS: TERMINAL_CLOSED / PRODUCTION_VERIFIED / CANONICAL` satırı
**okunur** (değiştirilmez). Bayat kayıt reddi (`f34c371a`, "WAVE 4 açık") bu programın
kendi sayfasında kaydedilir — kapalı programın dosyasına DOKUNULMADAN.

**2. Coverage matrix** — master plan §6 şekli, 12 hareket, 10 sütun.
Her hücre exact dosya/route/kolon/enum referansı taşır. `UNKNOWN` geçerli ve terminal
hücre sonucudur. `.env`/secret OKUNMAZ; runtime kanıtı üretilemiyorsa `UNKNOWN`.

**3. Dilim ataması** — her boş/`UNKNOWN` hücre master plan §3'teki **mevcut** bir hatta
ve bloğa bağlanır. Yeni hat AÇILMAZ. Bu blok implementation BAŞLATMAZ.

**BLOCK RESULT:** `ANALYSIS_DELIVERED`
**MERGE SONRASI AÇILAN:** C3 · X2 · X3-B01

> **B01 SONUCU (2026-08-08, baseline afd84aee):** `ANALYSIS_DELIVERED` — kanıt dosyası
> `C1-B01-BASELINE-COVERAGE-MATRIX.md` (bu dizin): 13 hareket × 9 sütun exact-referanslı
> matris; #2262/#2265 ancestry VERIFIED; kapalı program satırı :1198 salt-okuma OBSERVED;
> bayat kayıt reddi kaydedildi; dilim ataması §3 (C2/C3/X1/X2/X3 + 3 hat-dışı disposition
> F-5/F-6/F-7); bulgular F-1..F-8. Runtime: Web 3002 UP, API 3001 DOWN → runtime-visible
> doğrulaması C1-B03/UAT'a ertelendi. Ürün/şema/production mutation YOK (docs-only).

---

## C1-B02 — MOJIBAKE, DİAKRİTİK VE BOŞ-DURUM METNİ ONARIMI (P1)

**Kapsam:** mojibake · "Bilgi Talepleri" boş-durum metni · Türkçe/İngilizce ve
diakritik tutarsızlıkları.

```text
YAPILMAZ: mevcut işleyen ekranların yeniden tasarımı
YAPILMAZ: bileşen API'si / prop sözleşmesi değişikliği
YAPILMAZ: şema · migration · backend çağrısı değişikliği
YAPILMAZ: "bu arada şunu da düzeltelim" — NEW FINDING RULE geçerli
```

**Yürütme kuralı:** blok başında **exact write manifest** yayımlanır (gerçek dosya
adları; `**/*` wildcard YETERSİZ). Bozukluk taraması manifesti belirler; manifest
dışına çıkılmaz — çıkmak gerekirse manifest revize edilip yeniden yayımlanır.

> Bu blok **çapraz kesen** olduğu için serilik zorunludur. Merge edilmeden C2 ve X1
> açılmaz (master plan §3-A).

**BLOCK RESULT:** `ENGINEERING_COMPLETE`
**MERGE SONRASI AÇILAN:** C2 · X1  → **DALGA 1 beş paralel hat başlar**

---

## C1-B03 — PORTAL UÇTAN UCA UAT (P8/1)

Güvenli **demo** portal hesabıyla portal FD ve geçmiş ekranları doğrulanır.
Desktop / tablet / mobile · console ve network temiz · **tenant izolasyonu** ·
**rol matrisi** PASS. Ürün kodu yazılmaz; bulgu çıkarsa ilgili hatta disposition
için bildirilir.

**ÖNCÜL:** C2 · C3 · X1 · X2 tamamlanmış olmalı.
**BLOCK RESULT:** `RUNTIME_VERIFIED`

---

## C1-B04 — CANARY TESLİMLERİ (P8/2)

```text
- TELLİ HUKUK GERÇEK müvekkillerine test maili GÖNDERİLMEZ.
- Demo tenant + owner'ın yetkilendirdiği canary alıcısı kullanılır.
- Olay bildirimi için TAM 1 canary.
- Dönemsel ekstre için TAM 1 canary.
- Owner teslim teyidi alınmadan kalıcı publication/schedule activation YAPILMAZ.
```

Canary çıktısı **içerik doğruluğu** üzerinden değerlendirilir: tutarlar, kesinti
kalemleri, net pay, para birimi, tarih ve izin verilen dosya referansı **doğru** mu;
yasak alan sızmış mı. "Mail gitti" tek başına PASS DEĞİLDİR.

**BLOCK RESULT:** `RUNTIME_VERIFIED`

---

## C1-B05 — PRODUCT_COMPLETE SERTİFİKASYONU

Master plan §9 eşiği tek sayfada kanıtla doğrulanır:

```text
ofis ekranı + portal + doğru finansal içerik + PDF + yetki + audit +
idempotency + GERÇEK canary teslimi   →   HEPSİ BİRLİKTE
```

Eksik varsa `PRODUCT_COMPLETE` **ilan edilmez**; eksik kalem ilgili hatta geri gider.
Activation borcu doğmuşsa (X3 migration, C3 schedule) ayrı kaydedilir ve owner'ın
mevcut production mutation disiplinine tabidir.

**BLOCK RESULT:** `ENGINEERING_COMPLETE` veya `WAITING_FOR_OWNER_DECISION`
