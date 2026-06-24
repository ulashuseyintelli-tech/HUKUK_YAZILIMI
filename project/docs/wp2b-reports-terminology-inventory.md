# WP-2b-0 — Raporlar Alanı Sorumluluk Terminolojisi Envanteri

> **Durum:** Envanter (yalnız döküman). Kod değişikliği YOK, rename YOK, UI string değişikliği YOK.
> **Amaç:** Raporlar (`reports`) alanındaki her "sorumlu / Sorumlu" kullanımını gerçek model alanına bağlamak,
> kanonik anlamı tespit etmek ve WP-2b rename planını **onaya** hazırlamak.
> **Anchor doc:** [`case-responsibility-canonical-model-design.md`](./case-responsibility-canonical-model-design.md) (#409)
> **Ön sürüm:** origin/main `cd91c44` üzerinde tarandı.

---

## 1. Kanonik eşleme referansı (3 ayrı kavram)

| Model alanı | Kanonik anlam | Türkçe etiket |
|---|---|---|
| `CaseLawyer.isResponsible = true` | Dosyanın hukuki sorumlu avukatı (≤1/dosya) | **Hukuki Sorumlu Avukat** |
| `Case.responsibleLawyerId` / `Case.responsibleStaffId` | Operasyonu yürüten kişi (avukat XOR personel) | **Dosya Operasyon Sorumlusu** |
| `Case.sorumluPersonelId` (`sorumluPersonel` relation) | Eski/geçiş alanı — oluşturan kullanıcı fallback'i | **Eski / Legacy Sorumlu Personel** |
| `Task.assigneeId` | Göreve atanan kişi | **Görev Atanan** (WP-2c kapsamı) |
| `Task.completedByUserId` | Görevi kapatan kişi | **Görevi Kapatan** (WP-2c kapsamı) |
| `Task.resolutionType = AUTO_SYSTEM` | Sistem otomatik kapanışı | **Sistem Kapanışı** (WP-2c kapsamı) |

**Kritik ayrım:** "Sorumlu" kelimesi tek başına yeterli değil. Aynı sayfada hem **legacy** (`sorumluPersonelId`),
hem **operasyon owner** (`responsibleLawyerId/StaffId`) eşlemeleri var; ikisi farklı kişi olabilir.

---

## 2. Envanter tablosu

| # | Dosya | Mevcut metin | Göründüğü yer | Bağlı model/alan | Kanonik anlam | Önerilen yeni etiket | Karar |
|---|---|---|---|---|---|---|---|
| R1 | `reports/page.tsx:669` | `Sorumlu` | "Dosyalar" sekmesi tablo başlığı (`<th>`) | backend `GET /reports/cases-with-summary` → `c.sorumluPersonel` = **`Case.sorumluPersonelId`** (`report.service.ts:477`) | Eski/Legacy Sorumlu Personel | "Eski Sorumlu (Personel)" — veya kolonu operasyon-owner'a taşı | **ONAY BEKLİYOR** (semantik düzeltme) |
| R2 | `reports/page.tsx:65,722` | `sorumlu` alanı + `{item.sorumlu}` hücresi | R1 ile aynı tablonun veri alanı | backend response alanı `sorumlu` (legacy kaynaklı) | Eski/Legacy Sorumlu Personel | (veri alanı, görünür etiket değil) | **ONAY BEKLİYOR** — alan adı `sorumlu` backend kontratı; rename = WP-2b dışı |
| R3 | `reports/page.tsx:846` | `{c.sorumlu}` | "Dashboard" sekmesi → kritik dosyalar mini-listesi | backend dashboard → `c.sorumluPersonel` = **`Case.sorumluPersonelId`** (`report.service.ts:394`) | Eski/Legacy Sorumlu Personel | R1 ile aynı | **ONAY BEKLİYOR** (R1 ile birlikte) |
| R4 | `reports/page.tsx:766` | `Avukat ve personel (Dosya Sorumlusu)` | "Personel" sekmesi → **"Gerçek Kişi Sahipliği"** bölümü altyazısı | `GET /reports/personel` → `realPersons` = LAWYER(`responsibleLawyerId`) + STAFF(`responsibleStaffId`) (`report.service.ts:130-140`) | **Dosya Operasyon Sorumlusu** | "Avukat ve personel (Dosya Operasyon Sorumlusu)" | **ÖNERİ — düşük risk** (doğru eşleme, yalnız netleştirme) |
| R5 | `reports/page.tsx:773` | `Eski kullanıcı-hesabı sahipliği (gerçek kişi atanmamış dosyalar)` | "Personel" sekmesi → **"Legacy / Geçiş"** bölümü altyazısı | `getPersonelReport` LEGACY_USER = `sorumluPersonelId` & responsible* IS NULL (`report.service.ts:141-148`) | Eski/Legacy Sorumlu Personel | (zaten doğru) | **DEĞİŞİKLİK YOK** — etiket zaten "Eski" diyor |
| R6 | `reports/page.tsx:910` | `Sorumlu Personel` (`<label>`) | "Dosyalar" sekmesi → toplu güncelleme paneli | UI state `sorumluPersonelId` → `POST /cases/batch-update {sorumluPersonelId}` → **yazar** `Case.sorumluPersonelId` (legacy) | Eski/Legacy Sorumlu Personel | "Eski Sorumlu Personel" + uyarı notu | **ONAY BEKLİYOR** — write-path legacy alanı; gerçek owner ataması cases sayfasında |
| R7 | `reports/page.tsx:569` | (görünür "sorumlu" etiketi yok) | "Dosyalar" sekmesi → owner filtresi `ResponsibleCandidateSelect` | filtre param `responsibleLawyerId`/`responsibleStaffId` (`reports/page.tsx:197-198,622-623`) | **Dosya Operasyon Sorumlusu** | (etiket yok) | **DEĞİŞİKLİK YOK** — ama bkz. Bulgu B1 (tutarsızlık) |
| R8 | `custom-report-builder.tsx:34` | `Dosya Sorumlusu` (`field: 'sorumlu'`) | Özel rapor oluşturucu → kolon seçimi | `GET /reports/custom` → **backend uç YOK** (controller'da yok); kolon enabled:false varsayılan | belirsiz (canlı binding yok) | önce endpoint doğrula; canlıysa hangi alan? | **ONAY BEKLİYOR + STUB UYARISI** |
| R9 | `custom-report-builder.tsx:40` | `Avukat` (`field: 'lawyerName'`) | Özel rapor oluşturucu → kolon seçimi | aynı stub uç; "Avukat" ≠ "Hukuki Sorumlu Avukat" (herhangi avukat) | belirsiz | (sorumlu terimi değil) | **WP-2b DIŞI** — stub + farklı kavram |

---

## 3. Bulgular (terminolojiden bağımsız, doğrulanmış)

### B1 — Filtre kanonik, görünen kolon legacy (tutarsızlık)
"Dosyalar" sekmesinde owner **filtresi** kanonik operasyon owner'a (`responsibleLawyerId/StaffId`, R7) bağlı;
ama tabloda görünen **"Sorumlu" kolonu** legacy `sorumluPersonelId`'ye (R1/R2) bağlı. Kullanıcı operasyon
owner'a göre filtreleyip, ekranda farklı bir (legacy) kişi görebilir. **Bu salt rename ile çözülmez; veri
bağlamı düzeltmesi gerekir (WP-2b sonrası ayrı iş).**

### B2 — Toplu güncelleme legacy alana yazıyor
"Sorumlu Personel" toplu güncelleme alanı (R6) `Case.sorumluPersonelId`'ye yazar — bu **operasyon owner
ataması değildir**. Kanonik operasyon owner ataması cases sayfasındaki `ResponsiblePersonPicker` üzerinden
(WP-1a audit'li yol) yapılır. Etiketi "Eski/Legacy" olarak işaretlemek doğru; ancak write-path'in kendisinin
deprecate/migrate edilip edilmeyeceği **ayrı karar** (WP-2b kapsamı dışı, kod + olası audit etkisi var).

### B3 — Özel rapor oluşturucu büyük olasılıkla ölü/stub
`custom-report-builder.tsx` `GET /reports/custom` ve `/reports/custom/export` çağırıyor; bu uçlar API
controller'da **mevcut değil** (tüm `src` taraması: yalnız ilgisiz `keyPrefix:'custom'` eşleşmeleri).
R8/R9 etiketlerinin canlı bir model bağı yok. Rename'den önce bu bileşenin gerçekten kullanımda olup
olmadığı doğrulanmalı.

### B4 — "Personel" raporu zaten doğru ayrılmış
`/reports/personel` (R4/R5) gerçek-kişi (operasyon owner) ile legacy satırları **zaten** ikiye bölüyor
(`splitPersonelByOwnership`, ownerType: LAWYER/STAFF vs LEGACY_USER). Burada yalnız üst-başlık netleştirmesi
(R4) gerekiyor; veri modeli doğru. Çift sayım yok, K1 (CaseLawyer) köprüsü zorlanmıyor.

---

## 4. WP-2b rename planı (öneri — onaya tabi)

**Yalnız görünür UI string'leri, davranış/şema/kontrat değişikliği yok.**

**Grup A — düşük riskli, doğru eşleme (önerilen WP-2b kapsamı):**
- R4: "Avukat ve personel (Dosya Sorumlusu)" → "Avukat ve personel (Dosya Operasyon Sorumlusu)"

**Grup B — legacy etiketleme (semantik düzeltme, onay gerekir):**
- R1/R3: tablo başlığı "Sorumlu" → legacy olduğu net edilecek (örn. "Eski Sorumlu (Personel)") **veya** B1
  düzeltmesiyle birlikte operasyon-owner'a yeniden bağlanacak.
- R6: "Sorumlu Personel" toplu güncelleme etiketi → "Eski Sorumlu Personel" + uyarı.

**Grup C — WP-2b dışı / ertelenmiş:**
- R2 (backend response alan adı `sorumlu` rename = kontrat değişikliği).
- R8/R9 (önce stub doğrulaması; B3).
- B1 (filtre≠kolon veri bağlamı düzeltmesi — kod + veri işi).
- B2 (batch write-path deprecate/migrate kararı — kod + olası audit).
- Görev (Task) terminolojisi ve CaseStaff `SORUMLU` rol seçeneği → **WP-2c**.

---

## 5. Açık onay soruları (WP-2b kapsam kilidi)

1. **WP-2b'de hangi etiketler gerçekten değişecek?** (Öneri: en azından Grup A/R4; Grup B onayınıza bağlı.)
2. **Hangileri WP-2c'ye ertelenecek?** (Öneri: tüm Task/görev terminolojisi + CaseStaff `SORUMLU` rolü.)
3. **Hangileri "Eski / Legacy" etiketi alacak?** (Öneri: R1/R3/R6 = `sorumluPersonelId` bağlı olanlar.)
4. **Riskli/belirsiz alanlar onaylanıyor mu?** (B1 filtre≠kolon, B2 batch legacy-write, B3 custom stub — bunlar
   rename değil, ayrı kod/veri işi olarak işaretlendi. Bu sınır kabul mü?)

---

## 6. Kapsam dışı (non-goals)

- Hiçbir kod / UI string / backend kontrat değişikliği (bu PR yalnız döküman).
- B1/B2/B3 düzeltmeleri (kod + veri; ayrı WP).
- Task/görev ve CaseStaff rol terminolojisi (WP-2c).
- Temporal sorumluluk UI'ı (WP-1d-4).
- Staff-owner hukuki-sorumlu-eksik guard'ın block aşaması (WP-3b, legal-gated).
