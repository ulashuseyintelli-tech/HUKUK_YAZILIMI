# C2-I08 — AŞAMA A READINESS RAPORU (R01)

```text
BLOK:      C2-I08-PRE-WAVE5-LEGACY-FLAT-REDUCTION-R01 · AŞAMA A (ANALYSIS_ONLY)
BASELINE:  origin/main ac3ed371 (fresh, 2026-08-06)
SONUÇ:     AŞAMA A TAMAMLANDI — GATE SONUCU: P1 FAIL · P2 FAIL · P3/P4 SCRIPT HAZIR
           (production koşusu D07 gereği apply-öncesine bağlı) · P5 PARTIAL
           → AŞAMA B AÇILMADI (otomatik geçiş koşulu sağlanmadı — beklenen tablo)
ÜRÜN/ŞEMA/PRODUCTION DEĞİŞİKLİĞİ: SIFIR (analysis-only korundu)
```

## A1 — Envanter (repository-truth, exact dosya:satır)

**WRITER (flat `Client.address/city/district/region/postalCode`) — 2 adet, ikisi de
`client.service.ts` içinde; BYPASS YOK:**
- `client.service.ts` create(): ~1551-1583 (addressStr birleştirme + city/district/
  postalCode) · VER-02 dual-write ClientAddress: 1638-1652
- `client.service.ts` update(): ~1767-1812 · koşullu ClientAddress: 1866-1883
- Doğrudan `prisma.client.create/update` üretim çağrısı taraması: yalnız
  client.service.ts:1986/2033 (contactFollowUpStatus — adres DEĞİL); seed
  (seed.service.ts:215 yorumu) ve export-import (:422 yorumu) kanonik
  `ClientService.create` üzerinden.

**Besleyiciler (flat DTO üretip create'e veren):** export-import.service.ts:390-393
(Excel kolon eşlemesi) · ocr.service.ts:74-76/324-326 (extraction DTO) — doğrudan
prisma yazımı YOK.

**READER (flat okuyan üretim consumer'ları) — 6 saha + resolver fallback:**
1. `uyap-export/uyap-case-mapper.service.ts:228-229` (:233 addresses'i de geçiriyor)
2. `uyap/uyap-xml.service.ts:911-914`
3. `document/document-template.service.ts:234`
4. `document/document.service.ts:119-120`
5. `export-import/export-import.service.ts:64`
6. `template-engine/template-engine.service.ts:495-496` (:500 addresses'i de geçiriyor)
7. `client/client-address-resolver.ts` — I07 3-aşamalı kaynak-otorite fallback'i
   (tasarımsal; satır 14/17: flat fallback açık, yazımı DURDURMAZ)
Portal: flat okuma SIFIR (U03 projeksiyonları). Web components: ayrıca taranmadı —
API contract'ı üzerinden besleniyor; Aşama B dilim listesinde doğrulama kalemi.

## A2 — Flat yazım AKTİF Mİ? EVET (kod kanıtı)

create() ve update() her çağrıda flat alanları yazıyor (yukarıdaki satırlar);
VER-02 dual-write yalnız ClientAddress'e EK yazımdır, flat'i durdurmaz.
→ **P1 = FAIL (aktif writer sayısı 2, hedef 0).**

## A3 — I07 kapsam ayrımı (charter §49.14)

**I07'nin KARŞILADIĞI:** tek kanonik okuma noktası (resolver) mevcut; normalized →
işaretli-primary → flat fallback sıralaması kodda; kapsam sınırı belgeli.
**KARŞILAMADIĞI:** 6 consumer sahası resolver'ı KULLANMIYOR (doğrudan flat okuyor);
flat yazım sürüyor; backfill/parity kanıtı resolver'ın işi değil.
→ **P2 = FAIL (6 hazır olmayan consumer; 4'ü cross-module: uyap×2, document×2 sınıfı,
template-engine, export-import — yazımları cross-lane koordinasyon ister).**

## A4 — Parity/violation DRY-RUN (script teslimi; read-only)

D07 gereği PRODUCTION sayımı apply-öncesi zorunludur ve development DB sayımı
production kanıtı olarak ATIF EDİLEMEZ; bu nedenle script teslim edilir, production
koşusu Aşama B ön-kapısına bağlanır:

```sql
-- C2-I08 A4 parity dry-run (READ-ONLY). Kovalar: esit/farkli/yalniz-flat/yalniz-relational
WITH primary_addr AS (
  SELECT DISTINCT ON ("clientId") "clientId", street, city, district, "postalCode"
  FROM "ClientAddress" WHERE "isCurrent" = true
  ORDER BY "clientId", "isPrimary" DESC, "createdAt" DESC
)
SELECT
  CASE
    WHEN c.address IS NULL AND p."clientId" IS NULL THEN 'BOS'
    WHEN p."clientId" IS NULL THEN 'YALNIZ_FLAT'
    WHEN c.address IS NULL THEN 'YALNIZ_RELATIONAL'
    WHEN trim(coalesce(c.city,'')) = trim(coalesce(p.city,''))
     AND trim(coalesce(c.district,'')) = trim(coalesce(p.district,''))
     AND position(coalesce(trim(p.street),'') in coalesce(c.address,'')) > 0
      THEN 'ESIT'
    ELSE 'FARKLI'
  END AS kova,
  count(*)
FROM "Client" c LEFT JOIN primary_addr p ON p."clientId" = c.id
GROUP BY 1 ORDER BY 1;
-- arc07i06-* satirlari: WHERE c.id LIKE 'arc07i06-%' filtresiyle ayni sorgu ayrica kosulur.
```

→ **P3/P4 = SCRIPT HAZIR; sayım apply-öncesi production'da (freeze altında) koşulacak.**

## A5 — Characterization

Yazılmadı (opsiyonel; davranış zaten mevcut suite'lerle sabit: adres suite +
VER-02 spec'leri). Aşama B dilimlerinde writer-kapatma characterization'ı önerilir.

## P5 — I08 mutation + rollback yöntemi

PARTIAL: mutasyon sınıfı net (flat alanları NULL'a indirme; idempotent, tenant-safe,
audit'li executor) fakat kanıtlı prova (backup/restore + dry-run) Aşama B §9-D
kapılarına aittir. Şema/migration İHTİYACI BUGÜN GÖRÜNMÜYOR (kolon DROP değil,
veri azaltımı — yine de Aşama B başında yeniden değerlendirilir; gerekirse bounded
grant expansion istenir).

## ÖNERİLEN ENGINEERING DİLİMLERİ (owner disposition'ına — Aşama A ürünü)

```text
E1  Writer kapatma: create/update flat yazımını resolver-türevi tek noktaya indirip
    KALDIRMA (C2 sahası; XL-3 imza kısıtı gözetilir)          → P1
E2  Consumer geçişi: 6 sahayı resolver'a bağlama — uyap×2, document×2,
    template-engine, export-import (CROSS-LANE koordinasyon)  → P2
E3  Production parity koşusu (A4 script; freeze altında)       → P3/P4
E4  I08 executor + §9-D prova zinciri                          → P5 / AŞAMA B
```

STATUS: AŞAMA A COMPLETE — AŞAMA B NOT ELIGIBLE (P1/P2 FAIL). Charter §49.6/§49.14
AYNEN yürürlükte; flat veri SİLİNMEDİ, I08 UYGULANMADI.
