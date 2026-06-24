# WP-2c-0 — Tasks / Staff Sorumluluk Terminolojisi Envanteri

> **Durum:** Envanter (yalnız döküman). Kod değişikliği YOK, rename YOK, UI string değişikliği YOK.
> **Amaç:** Görev (Task) ve dosya-personeli (CaseStaff) alanındaki tüm "sorumlu / atanan / kapatan /
> görev sahibi / personel rolü" kullanımlarını gerçek model alanına bağlamak ve WP-2c rename planını **onaya** hazırlamak.
> **Anchor:** [`case-responsibility-canonical-model-design.md`](./case-responsibility-canonical-model-design.md) · önceki: WP-2a (cases), WP-2b (reports `#431`).
> **Ön sürüm:** origin/main `a4ca07c` üzerinde tarandı (3-dilimli paralel okuma + binding doğrulaması + 2 spot-check).

---

## 1. Kısa hüküm

- **Task UI zaten temiz.** `tasks/page.tsx` ve `tasks/kanban/page.tsx` içinde tek bir "Sorumlu"/"Yapan" geçmiyor.
  Tek kişi-sorumluluğu etiketi **"Atanan"/"Atanan Kişi"** ve doğru şekilde `Task.assigneeId`'ye bağlı.
  → Özel-dikkat kuralı 1 (assignee'yi "Sorumlu" demek) **HİÇ tetiklenmedi**. WP-2c-1'de zorunlu rename **yok**;
  yalnız opsiyonel "Atanan" → "Görev Atanan" uyumlaması olabilir (düşük değer).
- **"Görevi Kapatan" kavramı UI'da hiç yüzeye çıkmıyor.** `completedByUserId` / `resolutionType` ne `findAll`
  include'unda seçiliyor ne de render ediliyor. Yani kural 2/3 için ortada etiket yok. **AUTO_SYSTEM riski YOK**
  (backend `getTaskPerformanceReport` dürüst: AUTO_SYSTEM yalnız sayı, isimsiz; üstelik **frontend tüketicisi 0**).
- **Asıl terminoloji sorunu CaseStaff tarafında.** `cases/[id]/page.tsx` personel "Dosyadaki Rol" dropdown'ındaki
  **"Sorumlu Personel"** seçeneği = `CaseStaff.roleOnCase = "SORUMLU"` (serbest String, **per-dosya personel rolü**).
  Bu ne canonical `responsibleStaffId` (Dosya Operasyon Sorumlusu) ne de legacy `sorumluPersonelId`'dir; **ikisine de
  bağlı değil** → `NEEDS_MODEL_CONFIRMATION`. Otomatik olarak "Dosya Operasyon Sorumlusu" yapılMAMALI.
- **CaseStaff.roleOnCase'in sabit bir değer kümesi yok** (DB'de enum değil, serbest String). Detay-düzenleme ekranı
  `SORUMLU/YARDIMCI/TAKIPCI` sunarken, yeni-dava sihirbazı `STAJYER/KONTROL/YAZI_ISLERI/MUHASEBE/TEBLIGAT_SORUMLUSU`
  sunuyor; şema yorumu ise `STAJYER/KONTROL/YAZI_ISLERI/MUHASEBE/TEBLIGAT/ARSIV` diyor. **Üç farklı sözlük.**
  Üstelik bazı ekranlar değeri **ham token** olarak basıyor (`SORUMLU` yazısı görünüyor).
- **Cross-cutting legacy karışması (WP-2b/WP-2a artığı):** `case-compare-modal.tsx` ve `custom-report-builder.tsx`
  canonical-görünümlü etiketler ("Dosya Operasyon Sorumlusu" / "Dosya Sorumlusu") altında **legacy** `sorumluPersonel`
  değerini gösteriyor. Bunlar rename değil, bağlama (binding) düzeltmesi → follow-up.

**Sonuç:** WP-2c'nin gövdesi basit bir rename değil; **model onayına bağlı (gated)**. En yüksek-risk hata,
CaseStaff "SORUMLU" rolünü canonical owner'la karıştıracak bir rename yapmaktır.

---

## 2. İncelenen dosyalar

**Task UI:** `apps/web/src/app/(dashboard)/tasks/page.tsx`, `tasks/kanban/page.tsx`
**Case-staff UI:** `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`, `cases/new/page.tsx`
**Shared:** `components/case/responsible-person-picker.tsx`, `responsible-candidate-select.tsx`, `case-compare-modal.tsx`,
`case-checklist.tsx`, `bulk-case-assignment.tsx`, `components/case-detail/CasePartiesSection.tsx`,
`components/reports/custom-report-builder.tsx`, `components/dashboard/personel-performance.tsx`, `lawyer-task-distribution.tsx`, `lib/api.ts`
**Backend (yalnız frontend-görünür etiketler için):** `apps/api/src/modules/task/{task.service.ts, task.controller.ts, dto/task.dto.ts}`,
`modules/report/report.service.ts`, `modules/case/dto/{case.dto.ts, responsible-person.dto.ts}`, `prisma/schema.prisma`

---

## 3. Envanter tablosu

| ID | Dosya | Mevcut metin | Göründüğü yer | Bağlı model/alan | Kanonik anlam | Önerilen yeni etiket | Karar |
|---|---|---|---|---|---|---|---|
| T1 | tasks/page.tsx:341 | `Atanan: {ad soyad}` | görev listesi satırı | `Task.assigneeId` (doğrulandı: include `assignee`) | Görev Atanan | "Atanan" doğru; ops. "Görev Atanan" | LEAVE_AS_IS |
| T2 | tasks/page.tsx:472 | `Atanan Kişi` | ekle/düzenle modal `<label>` | `Task.assigneeId` (form→DTO→model) | Görev Atanan | doğru; ops. "Görev Atanan" | LEAVE_AS_IS |
| T3 | tasks/kanban/page.tsx:187 | (ikon + ad, etiket yok) | kanban kart altı | `Task.assigneeId` | Görev Atanan | (etiket yok) | LEAVE_AS_IS |
| S1 | cases/[id]/page.tsx:3047 | `Sorumlu Personel` | "Dosyadaki Rol" dropdown `<option value=SORUMLU>` | `CaseStaff.roleOnCase="SORUMLU"` (serbest String) | **Per-dosya personel rolü** (owner DEĞİL) | model onayı; "Dosya Operasyon Sorumlusu" YAPMA | **NEEDS_MODEL_CONFIRMATION** |
| S2 | cases/[id]/page.tsx:3048-3049 | `Yardımcı Personel` / `Takipçi` | aynı dropdown | `CaseStaff.roleOnCase=YARDIMCI/TAKIPCI` | Per-dosya personel rolü | değiştirme | LEAVE_AS_IS |
| S3 | cases/[id]/page.tsx:3040 | `Dosyadaki Rol` | dropdown başlığı | `CaseStaff.roleOnCase` etiketi | Per-dosya rol başlığı | doğru | LEAVE_AS_IS |
| S4 | cases/[id]/page.tsx:2099 | `{roleOnCase}` (ham) | "Dosya Ekibi" rozet | `CaseStaff.roleOnCase` ham basılıyor | Per-dosya personel rolü | label-map gerekli (S1 ile) | **NEEDS_MODEL_CONFIRMATION** |
| S5 | cases/new/page.tsx:2539 | `STAJYER/KONTROL/YAZI_ISLERI/MUHASEBE/TEBLIGAT_SORUMLUSU` | yeni-dava sihirbazı personel rol dropdown | `CaseStaff.roleOnCase` (farklı değer kümesi!) | Per-dosya personel rolü | S1/S4 ile birlikte sözlüğü birle | **NEEDS_MODEL_CONFIRMATION** |
| S6 | cases/[id]/page.tsx:2019 → responsible-person-picker.tsx:86 | `Dosya Operasyon Sorumlusu` | owner picker başlığı | `Case.responsibleLawyerId`/`responsibleStaffId` (XOR) | **Dosya Operasyon Sorumlusu** (canonical) | zaten doğru (WP-2a) | LEAVE_AS_IS |
| S7 | responsible-person-picker.tsx:95,118 | `… (eski)` | legacy owner rozeti | `Case.sorumluPersonelId` → User | Eski/Legacy Sorumlu Personel | zaten "(eski)" ile ayrışmış | LEAVE_AS_IS |
| S8 | cases/[id]/page.tsx:2826 | `Hukuki Sorumlu Avukat` | avukat "Bu Dosyadaki Rol" dropdown | `CaseLawyer.role=RESPONSIBLE`/`isResponsible` | **Hukuki Sorumlu Avukat** (canonical) | zaten doğru (WP-2a) | LEAVE_AS_IS |
| S9 | cases/[id]/page.tsx:2827-2829 | `Yetkili/Yardımcı/Stajyer Avukat` | aynı dropdown | `CaseLawyer.role=ASSIGNED/ASSISTANT/INTERN` | Avukat ekip rolü | değiştirme | LEAVE_AS_IS |
| S10 | cases/[id]/page.tsx:2084 | `Yetkili Personel` | "Dosya Ekibi" panel başlığı | grup başlığı (CaseStaff[]) | Ekip başlığı | değiştirme | LEAVE_AS_IS |
| S11 | responsible-candidate-select.tsx:64 | aria `Dosya Operasyon Sorumlusu seç` | create-mode owner seçici | `responsibleLawyerId`/`responsibleStaffId` | Dosya Operasyon Sorumlusu | zaten doğru | LEAVE_AS_IS |
| X1 | case-compare-modal.tsx:264 (değer :120) | `Dosya Operasyon Sorumlusu` | dosya karşılaştırma tablosu | **MISMATCH:** etiket canonical AMA değer `data.sorumluPersonel` = **legacy** | Görünen=Eski/Legacy Sorumlu Personel, etiket=canonical | "Eski Sorumlu Personel" YA DA değeri canonical'a bağla | **FOLLOW_UP_REQUIRED** |
| X2 | custom-report-builder.tsx:34 | `Dosya Sorumlusu` (`field:'sorumlu'`) | özel rapor kolon seçimi | backend `sorumlu` = `sorumluPersonelId` (legacy); endpoint stub | Eski/Legacy Sorumlu Personel | "Eski Sorumlu Personel" (WP-2d ile) | FOLLOW_UP_REQUIRED |
| X3 | report.service.ts:607 (CSV) / :477,:394 | CSV başlık `Sorumlu` | dosya export CSV / cases-summary | `sorumluPersonel` = `sorumluPersonelId` (legacy) | Eski/Legacy Sorumlu Personel | "Eski Sorumlu Personel" (frontend ile birlikte) | FOLLOW_UP_REQUIRED |
| D1 | CasePartiesSection.tsx:73-77 | `RESPONSIBLE:"Sorumlu"`, `ASSIGNED:"Atanan"` | `roleLabels` map | `CaseLawyer.role` — **map render edilmiyor (ölü kod)** | (canlıysa) Hukuki Sorumlu Avukat / Atanan Avukat | ölü → dokunma | LEAVE_AS_IS |
| D2 | CasePartiesSection.tsx:155 | `{roleOnCase}` (ham) | "Dosya Ekibi" alt etiket | `CaseStaff.roleOnCase` ham (mount şüpheli) | Per-dosya personel rolü | mount doğrula; canlıysa S4 ile | NEEDS_MODEL_CONFIRMATION |
| O1 | bulk-case-assignment.tsx | `Toplu Dosya Atama / Avukat / Personel / Ata` | toplu atama widget'ı | **demo veri, model bağı yok** | (yok) | n/a | OUT_OF_SCOPE |
| O2 | case-checklist.tsx:13 | `assignee?: string` | ChecklistItem tipi | checklist-item alanı (Task DEĞİL); render edilmiyor | n/a | n/a | OUT_OF_SCOPE |
| O3 | lawyer-task-distribution.tsx | `Tamamlanan/Bekleyen` | dashboard mockup | **demo veri, model bağı yok** | n/a | n/a | OUT_OF_SCOPE |
| O4 | dashboard/personel-performance.tsx | `Personel Performansı` | sahiplik leaderboard | `responsibleLawyerId/StaffId` (+legacy, gerçek-kişi filtreli) | Case sahiplik performansı (görev-kapanışı DEĞİL) | doğru | LEAVE_AS_IS |
| O5 | task.dto.ts:3-44 | `TaskStatus/Priority` enum, `assigneeId` | DTO | display etiketi taşımıyor (ham token) | n/a | n/a | OUT_OF_SCOPE |
| B1 | report.service.ts:171-260 | `getTaskPerformanceReport` | GET /reports/task-performance (ADMIN) | `completedByUserId`+`resolutionType`; AUTO_SYSTEM isimsiz; **frontend tüketici 0** | Görevi Kapatan / Manuel / Sistem Kapanışı | n/a (UI yok) | LEAVE_AS_IS |

> Not: `cases/[id]/page-v2.tsx`, `page-new.tsx`, `[id]/v2/page.tsx` bayat/duplike varyantları da `roleOnCase`/"Sorumlu"
> stringleri taşıyor (ör. `page-v2.tsx:397 "Sorumlu:"`). Canlı olup olmadıkları teyit edilmeden rename edilmemeli (bkz. §5).

---

## 4. Kanonik eşleme kararları

| Model alanı | Kanonik etiket | Durum |
|---|---|---|
| `Task.assigneeId` | **Görev Atanan** | UI "Atanan" diyor = doğru; opsiyonel uyumlama |
| `Task.completedByUserId` | **Görevi Kapatan** | UI'da yüzey yok (henüz etiket yok) |
| `Task.resolutionType=MANUAL` | **Manuel Kapanış** | yalnız backend; UI yok |
| `Task.resolutionType=AUTO_SYSTEM` | **Sistem Kapanışı** | yalnız backend; isimsiz; **risk yok** |
| `CaseStaff.roleOnCase="SORUMLU"` | **Per-dosya personel rolü** (owner DEĞİL) | **model onayı bekliyor** — canonical owner'a eşitlenMEZ |
| `Case.responsibleLawyerId/responsibleStaffId` | **Dosya Operasyon Sorumlusu** | UI doğru (WP-2a) |
| `CaseLawyer.isResponsible` | **Hukuki Sorumlu Avukat** | UI doğru (WP-2a) |
| `Case.sorumluPersonelId` | **Eski/Legacy Sorumlu Personel** | picker'da "(eski)" doğru; compare/report'ta YANLIŞ etiket (X1/X2/X3) |

---

## 5. Riskli / belirsiz alanlar

1. **CaseStaff "SORUMLU" rolü kavram-çakışması (EN YÜKSEK RİSK).** "Sorumlu Personel" (per-dosya rol) sözel olarak
   hem legacy `sorumluPersonelId` hem canonical `responsibleStaffId` ile çakışıyor ama **ikisine de bağlı değil**.
   Yanlış rename = canonical owner sanılması. Önce ürün/model kararı şart.
2. **`roleOnCase` sözlük tutarsızlığı + DB zorlaması yok.** Detay-düzenleme (`SORUMLU/YARDIMCI/TAKIPCI`) ≠ yeni-dava
   sihirbazı (`STAJYER/KONTROL/…/TEBLIGAT_SORUMLUSU`) ≠ şema yorumu. Mevcut satırlar herhangi bir değeri içerebilir;
   dropdown'ı yeniden adlandırmak **veriyi normalize etmez**. Label-map iki sözlüğü + `staffType` fallback'ini kapsamalı.
3. **Ham token render.** `roleOnCase` bazı yerlerde ham basılıyor (`cases/[id]/page.tsx:2099`, `CasePartiesSection.tsx:155`)
   → kullanıcı çıplak "SORUMLU" görüyor, owner rozetiyle karışıyor.
4. **Legacy↔canonical karışması (X1/X2/X3).** `case-compare-modal.tsx` canonical etiket + legacy değer (doğrulandı:
   değer satır 120 `sorumluPersonel`, etiket satır 264 "Dosya Operasyon Sorumlusu"). Bu muhtemelen **WP-2a boşluğu**.
   `custom-report-builder` + CSV başlığı da legacy'yi canonical-görünümlü etiketle gösteriyor.
5. **Mount/canlılık belirsizliği.** `CasePartiesSection.tsx` (D1/D2) ve `bulk-case-assignment.tsx` (O1) detay sayfasınca
   mount edilmiyor olabilir; `roleLabels` map'i ölü kod. Bayat `page-v2/page-new/v2` varyantları da string taşıyor.
   **Ölü koda rename = sahte ilerleme.** Rename öncesi canlılık teyidi zorunlu.
6. **AUTO_SYSTEM = risk YOK (pozitif teyit).** `getTaskPerformanceReport` AUTO_SYSTEM'i isimsiz sayıyor, yalnız
   MANUAL+`completedByUserId` isim alıyor; frontend tüketicisi 0. İleride "kimsin kapattı" kolonu eklenirse
   `completedByUserId=null` (AUTO_SYSTEM) asla insan gibi gösterilmemeli — **tasarım ön-koşulu**.

---

## 6. WP-2c rename PR önerisi (öneri — onaya tabi)

**WP-2c-1 — Task terminology rename:**
- Önerilen kapsam: **neredeyse boş.** Task UI temiz; zorunlu rename yok. **Opsiyon:** "Atanan"/"Atanan Kişi" →
  "Görev Atanan" uyumlaması (kozmetik, düşük değer). Önerim: **yapma/erteleme** (gereksiz diff).

**WP-2c-2 — CaseStaff / staff role terminology rename:**
- **BLOKE — `NEEDS_MODEL_CONFIRMATION`.** Önce model/ürün kararı: (a) `CaseStaff.roleOnCase`'in kanonik değer kümesi
  ve etiketleri ne olacak? (b) iki ekranın sözlüğü birleştirilecek mi? (c) ham token yerine label-map kullanılacak mı?
  (d) "Sorumlu Personel" etiketi korunup "(dosya ekibi rolü)" gibi bir niteleyiciyle mi ayrışacak?
  Bu kararlar verilmeden rename **yapılmamalı** (canonical owner'la karışma riski).

**WP-2c-3 — Kalan task/staff docs/help cleanup:**
- Bayat varyant (`page-v2`/`page-new`/`v2`) ve ölü `roleLabels` durumu netleştikten sonra; düşük öncelik.

---

## 7. Kapsam dışı bırakılanlar (non-goals)

- Kod / UI string / backend davranış değişikliği (bu PR yalnız döküman).
- Audit, migration/schema, temporal UI.
- Reports terminolojisi (WP-2b'de kapandı) ve balance/shadow-display epiği.
- Devir ekranı, staff capability matrisi, review/sign-off.
- Demo-veri bileşenleri (`bulk-case-assignment`, `lawyer-task-distribution`) — model bağı yok.

---

## 8. Follow-up listesi

- **WP-2c-followup-modelconfirm:** `CaseStaff.roleOnCase` kanonik değer kümesi + etiket haritası + iki-ekran
  birleştirme kararı (ürün/model). WP-2c-2'nin ön-koşulu.
- **WP-2c-followup-rawtoken:** `roleOnCase` ham token render eden yüzeyler (label-map). Model onayına bağlı.
- **WP-2b-followup-X1 (case-compare-modal):** canonical etiket altında legacy `sorumluPersonel` değeri →
  "Eski Sorumlu Personel" et VEYA değeri canonical owner'a bağla. (WP-2a boşluğu; reports değil ama cases-terminoloji.)
- **WP-2d (custom-report-builder + CSV):** legacy `sorumlu`/"Dosya Sorumlusu" → "Eski Sorumlu Personel";
  `/reports/custom` stub kararıyla birlikte (bkz. WP-2b-0 inventory).
- **Liveness teyidi:** `CasePartiesSection`, `bulk-case-assignment`, `cases/[id]` v2/page-new varyantları canlı mı?
  Ölü ise temizlik (ayrı dead-code işi), canlı ise rename kapsamına alma kararı.
- **Task closer kolonu (ileride):** "Görevi Kapatan" UI'ı eklenirse AUTO_SYSTEM-bilinçli tasarla (insan gibi gösterme).
