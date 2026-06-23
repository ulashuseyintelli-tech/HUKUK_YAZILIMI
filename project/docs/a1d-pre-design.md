# PR-A1d-pre — Kambiyo Arka-Yüz Ciro Bölge Tespiti, Sınıflandırma & Ön-İşleme (Tasarım)

> **Durum:** PLAN (tasarım) · **Kod / şema / migration / PR YOK** · **Tarih:** 2026-06-23 · **Karar:** ulas
> **Bu doküman HOW / SIRA + araştırma hipotezidir.** WHAT / WHY (kilitli kararlar) şu dokümanlarda — burada **TEKRARLANMAZ** (AGENTS.md anti-tekrar):
> - `ocr-draft-architecture.md` **§5 / §5.0** (A1-V1 kavram sözleşmesi; K1–K8; K7 "asıl yatırım"; V2 manuel zincir; V3 müracaat) — ✅ Onaylı (Ulaş, 2026-06-21)
> - `a1-kambiyo-motoru-uygulama-plan.md` (Faz 0–5; **Faz 3 = A1-V1b arka-yüz OCR**; **A1-d = HOLD**)
> - `a1-client-anchoring-design.md` (A1-a/b ✅ MERGED #361; A1-c kilitli; **A1-d ciro-sırası HOLD**)
> - `case-instrument-canonical-design.md` (`CaseInstrument` = evrak; `endorsers/avals Json`)
> - **Bu oturum A1-d spike round-1 bulguları** (aşağıda §1) — gerçek arka yüz n=3, ground truth ulas onaylı.

---

## 0. Bağlam — niçin bu doküman, niçin ŞİMDİ

- **A1 müracaat motoru uçtan uca CANLI:** motor (`instrument-chain-engine` #381) → endpoint (`POST /case-instruments/chain/analyze` #384) → UI (`InstrumentChainPanel` #387, flag `A1_INSTRUMENT_CHAIN` default OFF). Bugün zincir **MANUEL** kurulur; avukat sıra/rol/onay girer.
- **A1-d** (OCR'dan ciro **SIRASI** otomatik çıkarımı) **HOLD** — gerekçe: "müvekkilden önceki ciranta=borçlu" kuralı kesin sıra ister, arka-yüz OCR sırası güvenilmez.
- **"Ölç-önce" kararı (ulas):** A1-d'yi koda dökmeden ÖNCE gerçek çek arka yüzlerinde ölçüldü (round-1).
- **Bu doküman = PR-A1d-pre tasarımı:** A1-d'den ÖNCEKİ **ön-koşul hattı**. Round-1 artık mimariyi olgunlaştıracak teknik bulguyu üretti (§1). ⚠️ **A1-V1b-order (otomatik sıra) bu PR DEĞİL**; ancak Round-2 reliability geçerse açılır (§5 karar kapısı).

---

## 1. Round-1 spike kanıt tabanı (2026-06-23 · n=3 gerçek arka yüz · model=güçlü vision)

**Örnekler & ground truth (ulas onaylı):**
- **S1 — QNB çeki arkası** (çok-cirantali): gerçek zincir = **İŞIKLI AYAKKABI → SÜNGERSAN → KARBOY [İPTAL kaşeli]**.
- **S2 / S3 — Gorka/Şükrü 2-çek (Ziraat) arkaları** (tek-ciro): **Şükrü Akdoğan = son ve TEK ciro.**

**Bulgu:**
- ✅ **Sıra YÖNÜ doğru çıktı** (İŞIKLI önce → SÜNGERSAN sonra; tek-ciro Şükrü doğru entity). → *"OCR sırası TAMAMEN güvenilmez"* abartı; **gördüğü düğümlerde sırayı doğru verdi.**
- ❌ **4 gerçek hata modu (ölçülmüş):**
  1. **DÖNÜKLÜK** — 3/3 örnek 90–180° dönük → ham görüntüde sıra çıkarılamaz.
  2. **BANKA ŞERHİ KARIŞIMI** — "ibraz / karşılıksız / kısmi ödeme" şerhleri ciroya benziyor ama ciro DEĞİL.
  3. **COMPLETENESS** — en alttaki **KARBOY** düğümü kaçtı (soluk / kenar / üst-üste binmiş kaşe).
  4. 🔴 **İPTAL KAŞESİ kaçtı** — EN KRİTİK: iptal edilmiş ciro **hukuken zincirden ÇIKAR**. Model iptal'i görmezse ya düğümü kaçırır ya da iptal edilmiş tarafı **YANLIŞ müracaat adayı** yapar.

**Çıkarım:** gerçek engel "okuyamamak" DEĞİL → **oryantasyon + bölge/şerh/iptal sınıflandırma + completeness**. (Bu repodaki ders tekrarı: "OCR çekleri okuyamıyor" korkusu YANLIŞTI, gerçek sorun parse/grouping idi — bkz. OCR multi-instrument roadmap. Burada da gerçek engel ön-işleme/sınıflandırma.)

---

## 2. ARAŞTIRMA HİPOTEZİ (ulas) — "tek kök, iki semptom"

> **HİPOTEZ:** KARBOY kaçağı (completeness) ve İPTAL kaşesi kaçağı **AYRI iki bug DEĞİL**. İkisi de tek bir kök problemin iki semptomu olabilir:
> **"zayıf / kenarda / üst-üste binmiş endorsement-region detection."**

**İmplikasyon (tasarımı yönlendirir):**
- İki ayrı geliştirme yerine **TEK görüntü-bölge-tespit (region-detection) hattı** ikisini birden çözebilir:
  - **Completeness** = "kaç ciro bölgesi var, hepsini yakaladık mı?" → region-detection **recall**'i.
  - **İptal** = "bir ciro bölgesinin ÜSTÜNE binmiş ikinci işaret (çapraz çizgi / İPTAL / X)" → region-üstü-region (overlap) ilişkisi.
- Yani **completeness ve iptal AYNI bölge çıktısından** türetilir.

**Doğrulama tasarımı:** PR-A1d-pre'de region-detection katmanını öyle kur ki hem zayıf/kenar düğümler (completeness) hem iptal-kaşesi-bindirmesi aynı segmentasyon çıktısından çıksın. **Round-2'de tek-hat hipotezi test edilir:** region-detection iyileştikçe **KARBOY-tipi completeness recall ↑ ile İPTAL detection recall ↑ BİRLİKTE mi hareket ediyor?** Birlikte hareket → hipotez doğrulanır, tek hat yatırımı haklı. Bağımsız hareket → iki ayrı problem, ayrı ele alınır.

---

## 3. Mimari — PR-A1d-pre hattı (ön-koşul; **sıra motoru DEĞİL**)

```
PR-A1d-pre
├─ 3.1 Deskew / orientation        (ham görüntü → normalize edilmiş yön)
├─ 3.2 Endorsement region detection (TEK HAT — §2 hipotez katmanı)
├─ 3.3 Region classifier
│        ├─ CIRO          (müracaat zincirine girer)
│        ├─ BANKA_SERHI   (ibraz/karşılıksız — zincire GİRMEZ, meta)
│        └─ IPTAL         (bir CIRO bölgesini geçersiz kılar)
├─ 3.4 Completeness scoring        (kaç bölge / okunabilirlik / eksik-risk)
├─ 3.5 Low-confidence order suggestion (ANCAK 3.1–3.4 sonrası)
└─ 3.6 #387 integration contract   (Faz 0 kontratına uyumlu + iptal/region meta)
```

### 3.1 Deskew / orientation
- **Sorun:** round-1'de 3/3 örnek dönük → sıra çıkarımı imkânsız.
- **Yaklaşım:** sayfa-seviyesi oryantasyon tespiti (metin satır açısı / 0-90-180-270 sınıflandırma) → normalize. Çıktı: **deskew açısı + güven**. Düşük güven → "oryantasyon belirsiz" bayrağı (sıra motoruna GEÇME, manuel).
- **Mevcut ile ilişki:** OCR DPI iyileştirmesi (#216) var; deskew AYRI ön-işleme katmanı. `endorsement-extractor.ts` (bugün names-only, sıra/zincir kurmaz) bu normalize edilmiş görüntüyü tüketir.

### 3.2 Endorsement region detection (hipotez katmanı)
- Arka yüzde her ciro/şerh genelde ayrı bir **kaşe/imza bölgesi**.
- Bu katman bölgeleri (bounding region + okunabilirlik skoru) tespit eder — **zayıf / soluk / kenar / üst-üste binmiş dahil** (completeness kaynağı).
- **İptal ilişkisi:** iptal kaşesi = bir ciro bölgesinin ÜSTÜNE binmiş ikinci işaret → **bölge-overlap** sinyali burada yakalanır.
- **Tek hat:** completeness (kaç bölge?) + iptal (bölge üstünde iptal işareti?) **aynı region çıktısından** (§2).

### 3.3 Region classifier — CIRO | BANKA_SERHI | IPTAL
Her tespit edilen bölge sınıflanır:
- **CIRO:** ciranta kaşesi/imzası (şirket adı + VKN/VD + imza). **Müracaat zincirine girer.**
- **BANKA_SERHI:** ibraz/karşılıksız/kısmi ödeme şerhi (banka şube + "İşbu çek … ibraz/karşılıksız"). **Zincire GİRMEZ;** ayrı meta (çekin durumu).
- **IPTAL:** bir ciro bölgesini geçersiz kılan iptal/çizik kaşesi. İlişkili ciro → **"iptal edilmiş"** (müracaat zincirinden çıkar / flag).
- **Ayırt edici sinyaller:** metin anahtarları (`ibraz`/`karşılıksız`/`iptal`), banka logosu/şube ismi, çapraz-çizik/X morfolojisi, bölge-overlap (§3.2).

### 3.4 Completeness scoring
- Tespit edilen **CIRO** bölgesi sayısı + her birinin okunabilirlik/güven skoru.
- **Eksik-düğüm-riski metriği:** düşük-güven/kısmi bölge varsa → completeness DÜŞÜK → **sıra motoruna GEÇME, avukatı uyar** ("zincir eksik olabilir").
- Round-2'de **recall** (yakalanan gerçek ciro / toplam gerçek ciro) ölçülür.

### 3.5 Low-confidence order suggestion
- **ANCAK 3.1–3.4 sonrası:** deskew yapılmış + bölgeler sınıflanmış + completeness yeterli ise.
- Üst→alt görsel sıra (deskew sonrası) + varsa ciro tarihi → **tentatif position** (`source=OCR, confidence=low`).
- **İptal'li ciro:** position atanır AMA **"iptal" flag'li → müracaat adayına OTOMATİK GİRMEZ.**
- **Çıktı asla otorite değil** → #387'ye ÖNERİ; motor (#384) needsReview/aday.

### 3.6 #387 integration contract
- Çıktı, mevcut **InstrumentChain** kontratına (Faz 0 #369) uyumlu: `nodes[]` (position low-conf), `provenance{ source:'OCR', confidence:düşük }`.
- ⚠️ **Kontrat genişlemesi (tasarım kararı, additive):** iptal'i ve region-meta'yı temsil için yeni alan(lar) gerekebilir — ör. `node.cancelled?: boolean` / `node.cancellationRef?` ve okunabilirlik/region güveni. Faz 0 kontratına **additive**; migration kararı AYRI (bugün `endorsers Json` şemasız taşır → şema migrasyonu gerekmeyebilir).
- **#387 davranışı:** iptal'li ciro **"İPTAL" rozetiyle** gösterilir + **completeness düşükse uyarı** ("zincir eksik olabilir, doğrula"). Avukat onaylar.
- 🔴 **KIRMIZI ÇİZGİ:** otomatik borçlu YOK; iptal'li / düşük-completeness → avukat onayı ŞART; OCR=aday, MANUAL=otorite.

---

## 4. Round-2 — Reliability Dataset (PR-A1d-pre SONRASI)

```
Round-2 Reliability Dataset
→ 3–5 gerçek çek arka yüzü
→ en az 1–2 İPTAL kaşeli
→ mümkünse FARKLI bankalardan
→ Metrikler:
   ├─ precision        (CIRO dediklerimizin doğruluğu)
   ├─ recall           (gerçek ciroları yakalama)
   ├─ completeness     (zincir tamlığı)
   ├─ iptal detection rate
   └─ sıra doğruluğu   (komşuluk / Kendall-tau)
```

- **Tek-hat hipotezi testi (§2):** region-detection iyileştikçe completeness recall VE iptal recall **birlikte mi** yükseliyor?

---

## 5. KARAR KAPISI — A1-V1b-order ne zaman açılır

> A1-V1b-order (otomatik sıra **PR'ı**) **ANCAK** Round-2 sonunda şu üçü birden sağlanırsa açılır:
> 1. **sıra doğruluğu YÜKSEK**, 2. **completeness KABUL EDİLEBİLİR**, 3. **iptal tespiti GÜVENİLİR**.
>
> Aksi halde **HOLD DEVAM** eder. (Ön-koşul hattının isim çıkarımı + sınıflandırma değeri yine kalır; yalnız *otomatik sıra* beklemede.)

---

## 6. Kapsam / kırmızı çizgiler / OUT

- **Bu PR-A1d-pre = ön-koşul** (deskew + region + classify + completeness + iptal-aware low-conf öneri). **Sıra MOTORU / otoriter sıra DEĞİL.**
- **OUT:** otomatik borçlu üretimi · otoriter sıra hükmü · Party Registry (Faz 4) · cross-dava normalize · UYAP XML.
- **Provenance:** OCR = düşük güven aday; MANUAL = otorite; #387 avukat onayı zorunlu.
- **Motor sözleşmesi korunur:** sıra/holder belirsiz → motor (#384) NEEDS_REVIEW; CaseDebtor YARATILMAZ.

---

## 7. Etki alanı (AGENTS.md — ön bildirim)

- **Yeni OCR katmanları** (deskew / region-detection / classifier) — mevcut `endorsement-extractor.ts` (bugün names-only, "sıra/zincir kurmaz") ile ilişki: bu hat onun **ÜSTÜNE** region + classify + order ekler; **isim çıkarımı korunur** (geriye dönük kırılma yok).
- **Multitenant:** OCR zaten tenant-scoped; yeni alan/çıktılar tenant-scoped kalır.
- **Kontrat alanı eklenirse** (iptal/region-meta) → `InstrumentChain`'i OKUYAN/YAZAN tüm yerler taranır: Faz 1a mapper (`buildEndorsersJson`), #384 `analyze-chain.dto.ts`, #387 `InstrumentChainPanel` + `lib/instrument-chain.ts`. Faz 0 kontratı bu yüzden tek-kaynak.
- **Çağrı yerleri / `<remarks>`:** kod yazımında değişen metotların "Çağrıldığı yerler:" listesi güncellenecek.

---

## 8. Sonraki adım (bu doküman onaylanınca)

1. **A (BU DOKÜMAN):** PR-A1d-pre tasarımı — onay bekler.
2. **B (sonra):** Round-2 reliability dataset (ulas gerçek örnek sağlar) → §4 metrikler → §5 karar kapısı.
3. **C (ertelendi):** gpt-4o vs güçlü-vision karşılaştırması — round-1 hata kaynağı model-seçimi değil OCR-öncesi/yanı (oryantasyon/sınıflandırma/completeness/iptal) olduğundan bugün düşük öncelik.
