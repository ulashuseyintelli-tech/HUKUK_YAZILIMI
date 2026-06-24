# WP-1d-4 — Temporal Responsibility UI Strand Closure Note

> **Durum:** Bilinçli kapanış notu (docs-only). **Kod YOK · yeni endpoint YOK · mutation YOK · migration YOK · enforcement YOK.**
> Bu "durmak" değildir; **temporal sorumluluk (Dosya Operasyon Sorumlusu + Hukuki Sorumlu Avukat) okuma-yüzü** hattını
> bilinçli olarak **"iyi seviyede kapandı"** checkpoint'ine almaktır.
> **Ön sürüm:** origin/main `1ca142f`.
> **Anchor doc'lar:**
> [`wp1d4c-responsibility-history-endpoint-contract.md`](./wp1d4c-responsibility-history-endpoint-contract.md) ·
> temporal query contract (WP-1d-0, #422) · terminoloji kilidi (WP-2a #428 / WP-2b #431).

## 1. Kısa hüküm

- WP-1d-4 temporal responsibility **UI** strand'i artık **"good enough" checkpoint'inde.**
- İki kanonik sorumluluk ekseni için **salt-okuma** görünürlük uçtan uca tamam:
  - **Dosya Operasyon Sorumlusu** (`Case.responsibleLawyerId` XOR `responsibleStaffId`)
  - **Hukuki Sorumlu Avukat** (`CaseLawyer.isResponsible`)
- **Yeni yazma yolu / atama UI / devir akışı / audit reconstruction AÇILMAYACAK.** Mevcut atama yolları
  (responsible-person endpoint + CaseLawyer yönetimi) bu strand'in dışındadır ve değiştirilmedi.
- Değişmez ilke korunur: **görünürlük ≠ otorite.** Bu strand yalnızca *geçmişi okur*; kanonik bakiye/otorite
  kaynaklarını veya atama davranışını değiştirmez.

## 2. Tamamlananlar (main'de)

### Backend temporal temel (okuma servisleri + sözleşme)

| Gate | İçerik | PR |
|---|---|---|
| WP-1d-0 | Temporal responsibility query contract (kod yok) | #422 |
| WP-1d-1 | Operation-owner temporal query (read-only service) | #423 |
| WP-1d-2-pre | CASE_LAWYER audit event'lerine `metadata.caseId` (forward-only) | #424 |
| WP-1d-2 | Legal-responsible-lawyer temporal query (read-only service) | #426 |
| WP-1d-3 | Combined read-only temporal responsibility endpoint (`responsibility-at`) | #427 |

### Terminoloji guardrail'ları

| Gate | İçerik | PR |
|---|---|---|
| WP-2a | Cases UI terminology lock (Dosya Operasyon Sorumlusu / Hukuki Sorumlu Avukat) | #428 |
| WP-2b | Reports UI terminology lock (Eski Sorumlu Personel / Dosya Operasyon Sorumlusu) | #431 |

### UI strand (WP-1d-4)

| Gate | İçerik | PR |
|---|---|---|
| WP-1d-4a | Case-detail **point-in-time** "Sorumluluk Geçmişi" paneli (read-only, `asOf`) | #437 |
| WP-1d-4b | Temporal UI polish + timeline feasibility inventory (kod yok) | #439 |
| WP-1d-4c-0 | Responsibility-history endpoint contract (kod yok) | #454 |
| WP-1d-4c-1 | Read-only responsibility-**history** service + endpoint | #455 |
| WP-1d-4c-2 | "Sorumluluk Değişim Geçmişi" **timeline** UI (read-only) | #457 |
| WP-1d-4c-3 | Timeline **filtre** kontrolleri (tür + tarih aralığı) | #459 |

## 3. Confidence semantiği (kalıcı sözleşme)

Hem point-in-time hem timeline yüzeyi **yanlış kesinlik üretmeme** ilkesine bağlıdır. Üç düzey:

| Düzey | Anlam | Etiket |
|---|---|---|
| `EVENT_CONFIRMED` | AuditLog event stream'inden doğrulanmış | "Audit kaydıyla doğrulandı" |
| `INFERRED_FROM_SNAPSHOT` | Doğrudan event'ten değil, mevcut kayıt/junction'dan çıkarılmış | "Mevcut kayıttan çıkarıldı" |
| `UNKNOWN_BEFORE_HORIZON` | Enstrümantasyon ufku öncesi veya yeterli kayıt yok | "Bu tarih için kesin kayıt yok" |

Dürüstlük kuralları (UI'da enforce edilir + testli):
- `UNKNOWN_BEFORE_HORIZON` **asla** "Atanmamış" gösterilmez (bilinmiyor ≠ atanmamış).
- Çözülemeyen taraf id'si UI'da **gösterilmez**; tip etiketine (Avukat/Personel) düşülür.
- Legal-responsible event'leri `metadata.caseId` ile eşleşince `EVENT_CONFIRMED`, canlı junction fallback'inde
  `INFERRED_FROM_SNAPSHOT` (kaynak notu ile şeffaf).
- Etiketler tek kaynaktan gelir (`lib/responsibility-at.ts`); timeline bunları reuse eder.

## 4. Terminology guardrail'ları (kalıcı)

- **Dosya Operasyon Sorumlusu** = `Case.responsibleLawyerId` XOR `responsibleStaffId` (kanonik operasyon sahibi).
- **Hukuki Sorumlu Avukat** = `CaseLawyer.isResponsible` (yalnız avukat; devredilemez hukuki sıfat).
- **Eski/Legacy Sorumlu Personel** = `Case.sorumluPersonelId` (legacy; "Eski Sorumlu Personel" etiketi + tooltip).
- "Sorumlu Personel" çıplak etiketi **emekliye ayrıldı**; yeni yüzeylerde kullanılmaz (CI/test guardrail'ları ile korunur).

## 5. Bilinçli durdurulanlar (bu strand'de yapılmayacak)

- **Atama / devir / yazma UI** — sorumluluk değiştirme akışı bu okuma-strand'inin dışında.
- **Backend reconstruction / backfill** — geçmiş, mevcut AuditLog event'lerinden okunur; geriye dönük üretilmez.
- **Yeni audit event yazımı** — bu strand audit *okur*, *yazmaz*.
- **URL query sync / kalıcı filtre state / pagination / export** — timeline filtreleri ephemeral kalır.
- **Permission/RBAC enforcement** — yetkilendirme [[wp4z-authorization-strand-closure-note]] kapsamında, ayrı ve kapalı.
- **Balance / shadow-display etkisi** — sorumluluk görünürlüğü kanonik bakiyeyi etkilemez.

## 6. Kalan limitasyonlar (açıkça kabul edilen)

- **Horizon öncesi körlük:** WP-1d-2-pre (#424) öncesi CASE_LAWYER event'lerinde `metadata.caseId` yok →
  o dönem legal-responsible geçişleri `INFERRED_FROM_SNAPSHOT` veya çözülemezse listelenmez. Bu **bilinçli dürüst**
  davranıştır (uydurma kesinlik yok).
- **Tarih aralığı gün-sınırı:** `from`/`to` ham `YYYY-MM-DD` olarak gönderilir; backend `new Date(value)` (UTC gün başı)
  uygular, gün-sonu işlemez. Client timezone yorumu **üretmez** (bilinçli sözleşme). İnce gün-sınırı semantiği bir
  backend-contract konusudur, UI kapsamı değildir.
- **İsim çözümü best-effort:** `responsible-candidates` + `users` lookup başarısız olursa tip etiketine düşülür;
  ham id sızdırılmaz.
- **Operation-owner vs legal-lawyer kaynak asimetrisi:** owner event'leri `EVENT_CONFIRMED` (CASE entityId),
  legal-lawyer replay confidence'ı event/junction'a bağlı.

## 7. Yeniden açma kriterleri

Bu strand şu durumlardan biri doğarsa yeniden açılır:
- **Atama/devir UI** ihtiyacı netleşirse (operasyon sahibi veya hukuki sorumlu avukatı ekrandan değiştirme).
- **Filtre kalıcılığı / paylaşılabilir URL / export** kullanıcıdan talep edilirse.
- **Horizon backfill** (geçmiş CASE_LAWYER event'lerine caseId enjekte etme) için iş değeri doğarsa.
- Sorumluluk görünürlüğünün **rapor/denetim** yüzeyine taşınması istenirse.

## 8. Gelecekte açılırsa ilk gate (aday)

- **Responsibility assignment/transfer UI design** (yazma yolu; legal hard guard ile uyumlu), veya
- **Timeline filter persistence + shareable URL** (küçük UX gate), veya
- **Responsibility history → report surface** (read-model genişletme).

## 9. Non-goals

- Kod değişikliği YOK · yeni endpoint YOK · mutation YOK · audit yazımı YOK · migration/schema YOK ·
  permission/RBAC YOK · URL sync / pagination / export YOK · atama/devir akışı YOK · balance etkisi YOK.

---

> **Kayıt:** Bu not, WP-1d-4 temporal responsibility **UI** strand'ini bilinçli olarak kapatır. Mevcut durum:
> point-in-time panel (#437) + history timeline (#457) + filtreler (#459) main'de canlı, salt-okuma, confidence-dürüst,
> terminoloji-kilitli. Backend temeli (#422–#427) ve terminoloji guardrail'ları (#428/#431) yerinde. Devamı
> (atama UI / backfill / export) **ihtiyaç-gated**. Yetkilendirme ayrı ve kapalı: [[wp4z-authorization-strand-closure-note]].
