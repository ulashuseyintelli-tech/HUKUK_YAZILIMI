# Sahipsiz Dosyalar (Ownerless Cases) — Görünürlük Tasarımı

> Durum: **TASARIM — Katman 1 (G1) KİLİTLİ, kod ayrı PR.** Katman 2/3 ERTELENDİ.
> Tarih: 2026-06-21 · Üst bağlam: [[case-responsibility-model-design.md]] (A2)
> Karar veren: Ulaş

---

## 0. Problem

`Case.sorumluPersonelId IS NULL` olan dosyalar = "sahipsiz". **A2 (#298)** sonrası
yeni dosya sahipsiz oluşamaz (`dto.sorumluPersonelId || userId`); sorun yalnızca
**LEGACY** (A2 öncesi) dosyalardır. Amaç: bunları **GÖRÜNÜR** kılmak ki admin manuel
atasın. **Otomatik atama YOK.**

### Neden otomatik atama yok (envanter sonuçları)
- **BACKFILL-1:** sahipsiz dosyalarda güvenilir sinyal yok (dev: 96/96 sinyalsiz;
  K1 köprüsü %0 dolu; K1 migration prod N/A → avukat/personel→User eşlemesi prod'da yok).
- **BACKFILL-2:** `Case`'te `createdById` yok; case-create audit'i (`case.service.ts:1739`)
  `userId` yazmıyor; global audit interceptor yok → **creator hiçbir yerde kayıtlı değil.**
- Karar (Ulaş): "creator kesin değilse → manuel kuyruk." Tahminle toplu atama YASAK.

---

## 1. Reuse haritası (anti-duplikasyon)

| Parça | Durum | Konum |
|-------|-------|-------|
| **Toplu atama eylemi** (sorumluPersonelId yazar) | ✅ VAR — reuse | "Dosya Sorumlusu Ata" modal → `POST /cases/batch-update`; `lib/bulk-assign.ts` |
| Per-dosya "Atanmamış" göstergesi | ✅ VAR (A3) | `cases/[id]/page.tsx:2005` (Dosya Ekibi kartı) |
| `sorumluPersonel` API yanıtlarında | ✅ VAR | `case.service.ts:657` (liste) |
| "Sahipsiz" filtre/chip | ❌ YOK | — |
| Liste `where` `sorumluPersonelId=null` filtresi | ❌ YOK | `case.service.findAll:615` |
| `getStats` ownerless sayacı | ❌ YOK | `case.service.getStats:1891` |

**Sonuç:** atama mekanizması zaten uçtan uca var; eksik olan tek şey **görünürlük**.

---

## 2. Karar — katmanlı; YALNIZ Katman 1 (G1) uygulanır

### ✅ KATMAN 1 — SAHIPSIZ-DOSYALAR-G1 (KİLİTLİ)
**Backend (additive, migration yok):**
- `getStats` += `ownerless` = `count(where: { tenantId, sorumluPersonelId: null })` → DOĞRU toplam
  (smart-filter chip'leri client-side sayar = yalnız yüklü sayfa; ölçekte yanıltır → sayaç server'dan).
- `findAll` + controller `GET /cases` + `api.getCases` → opsiyonel `noOwner` param →
  `where.sorumluPersonelId = null` (TÜM sahipsizler, yalnız yüklü sayfa değil).

**Frontend:**
- Cases sayfasına **"Sahipsiz"** smart-filter chip'i (category=data). Aktifken server-side
  `noOwner` filtresini tetikler; sayısı `getStats.ownerless`'tan.
- Atama = **MEVCUT** "Dosya Sorumlusu Ata" toplu modalı (yeni component YOK).

### ❌ KATMAN 2 — Dashboard sayacı — ERTELENDİ
QuickSummary'ye "Sahipsiz Dosya: N" kartı + deep-link. **Önce G1 adoption ölç** (kaç dosya
sahipsiz + filtre kullanılıyor mu?), sonra karar.

### ❌ KATMAN 3 — Detay banner — ERTELENDİ
`cases/[id]` üst amber banner (`!sorumluPersonel`). Aynı gerekçe (önce adoption).

---

## 3. Etki analizi (G1)
- **Additive** · migration YOK · davranış değişmez (yalnız görünürlük + MEVCUT atama).
- **Multitenant:** `getStats`/`findAll`/`batch-update` zaten tenant-scoped; `noOwner` filtre
  mevcut tenant where'ine eklenir.
- **Otomatik atama YOK** — otorite admin'de.
- Risk: düşük. Backend = 2 küçük ek; frontend = 1 chip + mevcut modal reuse.

---

## 4. G1 gate planı (onaylı; ayrı küçük PR)
- **G1a backend:** `getStats.ownerless` + `findAll noOwner` param (+ controller + `api.getCases`). Unit/e2e.
- **G1b frontend:** "Sahipsiz" chip + server-side `noOwner` wiring + sayaç (`getStats.ownerless`) + mevcut bulk-assign.
- (İstenirse tek PR'da birleşik — küçük.)

---

## 5. Ayrı backlog — AUDIT-USERID-HARDENING
Bulgu (BACKFILL-2): `api/src`'te audit.log çağrılarından yalnız 1'i `userId` geçiyor
(`ocr-feedback.service.ts:47`); case create/update/delete dahil çoğu yazmıyor → `AuditLog.userId`
sistematik boş → "kim yaptı" audit'te yok. **Acil değil · güvenlik açığı değil · compliance/forensic
hardening.** Servisler `userId`'ye zaten sahip (A2'de case.create userId zorunlu). Ayrı kart; şimdi kod yok.

---

## 6. Non-goals
- ❌ Otomatik/tahminle backfill atama. ❌ Dashboard/detay yüzeyleri (Katman 2/3, ertelendi).
- ❌ Yeni "owner" kavramı/tablosu. ❌ Migration.
