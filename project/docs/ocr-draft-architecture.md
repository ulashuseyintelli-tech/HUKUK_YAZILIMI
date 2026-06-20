# OCR Taslak Mimarisi — Karar Kaydı (OCR → Taslak → İnsan Onayı)

> **Durum:** Kararlar **ONAYLANDI** (Ulaş, 2026-06-20) · **Kod YOK · Şema YOK · Migration YOK · PR YOK** (uygulama ayrı plan+PR)
> **Sahip:** Ulaş + Claude (oturum) · **Tarih:** 2026-06-20
> **Tetikleyici:** BUG-2→BUG-1B "taranan borçlu" hattı (5 PR merged) + **canlı çek kanıtı**
> (Gorka 2-çek, flag-on): `party.confidence=95` AMA insan gözüyle belirsizlik var → mimari dönüşüm.
> **İlgili tasarımlar (REUSE — yeniden yazılmaz):** `case-instrument-canonical-design.md` ·
> `party-registry-design.md` · `party-registry-design-review.md` · `debtor-identity-resolution-ir0.md`

Bu doküman koda geçmeden önce **ürün ilkesini + güven modelini + veri-modeli yönünü** yazılı sabitler.
Bu noktadan sonra hata teknik değil, **mimari/veri-modeli hatası** olur.

---

## 0. Bir cümlede dönüşüm

```
OCR 2026 başı:  Veri GİREN sistem   ("OCR doğru okursa sistem çalışır")
OCR 2026 sonu:  Taslak ÜRETEN sistem ("OCR yardımcı olur · insan karar verir · hukuk motoru öneri üretir")
```

**Çekirdek tez (KORUNMALI):** *OCR veri üretir, GÜVEN üretmez. Güven = çözümleme + ilişki motoru + insan onayı.*
Tüm BUG-2 → BUG-3 → BUG-4 → BUG-1A → BUG-1B zincirinin vardığı yer budur ("kontrollü güven":
ekle · düzelt · kontrol et · temizle · şüphe duy).

---

## 1. Çekirdek ilke / invaryant

- **İcra/takipte AUTO-COMMIT YOK.** OCR → yapılandırılmış **TASLAK** → avukat onayı → kayıt.
  Sihirbaz zaten böyle davranıyor (kullanıcı adım adım onaylıyor, takip otomatik açılmıyor) →
  bunu **yazılı invaryant** yapıyoruz, gevşetilmez.
- **Asıl tehlike OCR'ın hatası değil**, avukatın OCR'a fazla güvenmesidir (otomasyon rehaveti /
  autopilot etkisi). Mimari bu rehaveti zorlaştırmalı (en zayıf halkayı öne çıkararak).

---

## 1.1 Guard'lar (commit-öncesi sabit invaryantlar — Ulaş, 2026-06-20)

Bu 4 madde mimarinin **gevşetilemez** kuralıdır; ilgili bölümlerde de tekrar geçer:

- **G1 — A1-P0 ASLA auto-resolve / auto-merge yapmaz.** Hiçbir koşulda kimliği otomatik çözmez/birleştirmez;
  yalnız **rank + aday listesi** üretir. Karar insanındır. (Bkz. §5 A1-P0 + IR-0 invaryantı.)
- **G2 — Ampirik düzeltme-oranı "gerçek doğruluk" DEĞİLDİR.** İnsanın **fark edip düzelttiği** hata oranıdır →
  gerçek hatanın **ALT SINIRI** (kaçırılan hatalar sayılmaz). Üst-otorite gibi yorumlanmaz. (Bkz. §4.)
- **G3 — Çek için `dueDate` / vade UI'da GÖSTERİLMEZ.** Basım/seri tarihi ayrı **evidence/metadata** olabilir
  ama **keşide tarihi yerine GEÇMEZ**. (Bkz. §7 BUG-X.)
- **G4 — PartyRelationship grafı KALICI veri olabilir; borçlu/sanık/şikayetçi önerileri TÜREVDİR** ve her
  zaman **yeniden hesaplanabilir** olmalı (graf düzenlenince motor yeniden koşar). (Bkz. §5 Karar 1.)

---

## 2. Olgunluk modeli + doc-type politikası

**Seviye yığını:** `1 Sakla(belge) → 2 Çıkar(OCR) → 3 Öner → 4 İnsan onaylar → 5 (yalnız güvenli yerde) otomasyon`.

**İki EKSEN ayrıdır (kritik — "el yazısı var/yok" tek eksen DEĞİL):**
- **(i) AUTO-COMMIT:** İcra/takipte **HER ZAMAN YASAK** (doc-type fark etmez; icra = yüksek risk).
- **(ii) PRE-FILL agresifliği:** doc-type + yapıya göre **GÜVEN seviyesi** ayarlanır:
  - **Yapılı / düşük-ambiguity** (ilam · fatura · UYAP evrakı · ödeme emri · takip talebi) → **agresif çıkar**.
  - **Yarı-yapılı / yüksek-ambiguity** (çek — özellikle arka yüz / ciro / el-yazısı) → **ASİSTAN**:
    öner + sakla + müvekkil-bul; ilişkiyi **kesin kabul etme**.

> Çeki "sadece görsel"e İNDİRME. OCR'ı çekte de **asistan** tut (tutar/no/tarih/keşideci ön-doldurması,
> hatalı olsa bile BUG-3 ile düzeltilir = manuel girişten hızlı). Görsel saklama bunu DEĞİŞTİRMEZ, **EKLER**.

---

## 3. Güven YIĞINI — tek sayı değil, 6 boyut (Confidence ≠ Role ≠ Legal)

**Canlı kanıt:** tek `confidence=95`, el-yazısı lehtarın belirsizliğini **gizledi**; grup `confidence=55`
ilk uyarı sinyaliydi. Yani bugünkü tek sayı **modelin metni ne kadar net okuduğunu** ölçüyor — avukatın
ihtiyacı olan **hukuki çıkarımın güvenilirliği** değil.

**İlke:** Güven boyutları **ÇARPILIR** — her biri %95 olsa bile bileşik sonuç < %95; tek sayı **en zayıf
halkayı gizler**. UX kuralı: **ortalama değil, EN ZAYIF boyutu** öne çıkar.

| # | Boyut | Soru | Hata modu (bağımsız) |
|---|---|---|---|
| 1 | **Okuma** (reading) | Glyph'ler doğru mu okundu? | "0265897" yanlış hane |
| 2 | **Segmentasyon** | Hangi sayfalar **tek bir** senet? (ön/arka) | 2 sayfa yanlış birleşti/ayrıldı |
| 3 | **İlişkilendirme** (association) | Bu alan/parti **hangi senede** ait? | Doğru okunan parti **yanlış çeke** bağlandı → **tüm zincir çöker** |
| 4 | **Çözümleme** (resolution) | OCR adı → **hangi gerçek kayıt**? | "Akçelik" → A.Ş. mi Ltd. mi? |
| 5 | **Rol** (role) | Senetteki rol: lehtar / ciranta / aval / kaşe? | "ABC LTD" net okunur, rolü belirsiz |
| 6 | **Hukuki** (legal) | Dosyadaki rol: borçlu / alacaklı / sanık / şikayetçi? | Yanlış kişiye icra/şikayet |

> **Boyut #3 (İlişkilendirme) kritik ve yeni:** metin doğru okunabilir + parti doğru bulunabilir, **ama yanlış
> senede bağlanırsa** bütün zincir çöker. Canlı `group=55` + "arka yüz kendi belge no'su taşıyor" uyarısı
> bunun ilk sinyali. Ayrı boyut olarak izlenmeli.

**Örnek ekran (hedef):**
```
✓ Metin okunabilirliği: %95
⚠ Rol belirsizliği: yüksek
⚠ Zincir/ilişki belirsizliği: yüksek
⚠ İnsan doğrulaması gerekli
```

---

## 4. Köken (Provenance) + Ampirik Ölçüm — "confidence neyi ölçüyor?"un GERÇEK cevabı

Sorunun cevabı teoride değil **ölçümde**. İki parça, **yarışmaz — biri diğerinin mekanizması**:

- **A2 — Köken (minimal):** her ön-doldurulan alan köken taşır:
  `{kaynak belge, OCR geçişi, model-confidence, ham-OCR-değeri, son-değer, insan-düzeltti-mi}`.
  Hukuken zorunlu (avukat her değerin nereden geldiğini savunabilmeli).
- **A3 — Ampirik ölçüm (asıl HEDEF):** taslak→onay akışında **alan-bazlı insan DÜZELTME ORANI** topla.
  Modelin self-report confidence'ından **çok** üstün — gerçek doğruluğun yer-gerçeği (ground truth).

**A2-minimal, A3'ün ZORUNLU mekanizmasıdır** (ham-OCR baseline kaydı olmadan "insan düzeltti mi" ölçülemez).
Dolayısıyla "A3 > A2" bir yarış değil: **A3 hedef, A2-min onun alt-yapısı.**

**Örnek tablo (1000 çek sonrası üretilebilir):**

| Alan | OCR Confidence | İnsan Düzeltme Oranı |
|---|---|---|
| Tutar | %96 | %1 |
| Keşideci | %94 | %3 |
| Lehtar | %95 | %28 |
| Ciranta | %91 | **%44** |

→ Bu tablo ürün kararını **değiştirir**: "ciranta confidence" pratikte **anlamsız** olabilir.

**Kurallar:**
- **Sıra:** `A2-min (instrument) → A3 (veri topla) → SONRA hedefli BUG-1C`. Prompt'u **KÖR** tuning yapma;
  önce verinin "bozuk" dediği alana (ör. Lehtar/Ciranta extraction) yönel. **A3 > BUG-1C.**
- **Confound:** düzeltme-oranı hatanın **ALT SINIRI**dır (insan bazı yanlışları kaçırır → eksik sayar).
  Yine de self-report'tan iyi; bu sınırı bilerek yorumla.
- **Hacim:** N yeterli olana kadar ürün kararı verme (yavaş-yanan enstrüman → **ŞİMDİ toplamaya başla**).
- **İleri sonuç:** ekranda model-confidence yerine/yanında **ampirik alan-güvenilirliği** (geçmiş düzeltme-oranı)
  göster — "confidence neyi ölçüyor" sorusunu kalıcı kapatır.

---

## 5. A1 — Kambiyo İlişki Motoru (veri-modeli yönü)

### Karar 1 (KİLİT) — A1'in ürünü = İLİŞKİ GRAFI; roller grafın TÜREVİ

A1 **borçlu adayı tablosu** değil, **PartyRelationship grafı** üretir. Borçlu/sanık/şikayetçi adayı = graf
üzerinde çalışan **dosya-tipi hukuk motorlarının** çıktısı.

```
Tek graf  →  çok hukuk motoru:
  icra motoru            → borçlu adayları
  ceza/karşılıksız çek   → sanık / şikayetçi adayları
  dava motoru            → davalı / davacı adayları
```

Yeni dosya tipi = grafa **yeni motor**, şema değişmez → **ölçeklenir** (icra + karşılıksız çek + dava).
Graf **insan-DÜZENLENEBİLİR**; motorlar düzenlenmiş graf üzerinde **yeniden** koşar.

### Karar 2 (KİLİT) — merkez nesne = PartyRelationship; ChainPosition = SIRALI GÖRÜNÜM

ChainPosition **merkez değil**, `EndorsedTo` kenarlarının **sıralı projeksiyonu** (türetilen). Ciro **sırası
hukuken anlamlı** (müracaat sorumluluğu konuma bağlı) → sıra atılmaz, **kenarın özelliği** olur.

**İlişki taksonomisi** (kâğıtta hazır; ilk sürüm yalnız `EndorsedTo` dolu — şema baştan geniş, tek tip dolu):
`EndorsedTo` · `GuaranteedBy / Aval` (belirli bir tarafa) · `SignedFor / Temsil` · `Represents` · `AccountHolderOf`.

> **case-instrument-canonical-design.md `AS3`** (açık soru: "hangi borçlu hangi çekten sorumlu?", bugün yalnız
> `drawerName` metni / `endorsers Json` / `avals Json`) bu **yapısal grafla ÇÖZÜLÜR**. Graf, JSON serbest-metni
> birinci-sınıf kenarlara yükseltir.

### A1-P0 — Çözümleme katmanı: köprüden FAZLA, yeni kimlik sisteminden AZ

A1'in çözümleme ihtiyacı, generik Party lookup'tan **daha büyük** ama **yeni bir kimlik sistemi değil**:

- **GENERİK katman (REUSE — yeniden yazma):** `PartyMatch` / IR-0 aday üretimi (isim/kimlik/adres/telefon
  sinyalleri; exact→auto-link, fuzzy→manuel, çelişki→block). Bkz. `party-registry-design.md §4b` + IR-0.
- **DOMAIN katmanı (YENİ, ince):** A1-P0 = **kambiyo-context ranker** — generik adayları KAŞE / CİRO-SIRASI /
  MÜVEKKİL-LİSTESİ / ÖNCEKİ-DOSYA sinyalleriyle **sırala/daralt**. ("Süngersan" → "Süngersan Plastik A.Ş.")
- **Sinyal ağırlığı:** DETERMİNİSTİK-sahip-olunan (müvekkil listesi, önceki dosyalar) **>** BELİRSİZ-OCR
  (kaşe, ciro sırası). Belirsiz sinyalle **oto-seçim YOK** (garbage-in'i büyütme).
- **Invaryant (IR-0):** aday üret, **OTO-MERGE ETME**. Bulanık şirket-adı eşleşmesi tehlikeli
  ("X A.Ş." ≠ "X Ltd." farklı tüzel kişiler) → **çoklu aday** göster, sessiz tek-seçim yok.

### A1 yetenekleri (hepsi gate'li — bkz. §8)

- **V1** müvekkili zincirde bul (A1-P0 çözümlemesine bağımlı).
- **V2** zincir editörü — **taşı / sil / ekle / yukarı-aşağı** (sadece gösterme DEĞİL).
- **V3** borçlu aday motoru. Hukuki kural: **müracaat borçluları = keşideci/düzenleyen + önceki cirantalar +
  onların avalistleri**. "Müvekkilden öncekiler" iyi **ilk filtre** ama tek başına eksik (keşideci/düzenleyen
  konumdan bağımsız her zaman borçlu; avalist konumdan bağımsız borçlu) → **Av. sign-off**.
- **V4** aval ilişkileri.
- **V5** karşılıksız çek bağlamı → **CEZA/şikayet pisti** (5941 s. Çek K. m.5; icra ceza mah.; taraflar
  **şikayetçi / sanık**). Bu yeni bir ROL değil, **İKİNCİ BİR DOSYA TİPİ**dir (icra'nın alacaklı/borçlu
  sözlüğünden ayrı). "Dosya rolü" sözlüğü dosya-tipine bağlı.

---

## 6. Belge Merkezi (L0 substrat — gate-siz, yüksek değer)

Çek **ön/arka** + vekalet + tebligat + haciz tutanağı + ödeme emri **tek dosyada görüntüleme**.

- **OCR-BAĞIMSIZ** kesin değer (her dosyada üretir). OCR ondan **OKUR**, party-review onun **görsellerine bakar**,
  A1 senet **taramasına referans** verir → **substrat**, sıradan bir özellik değil.
- Ürün değeri sıralamasında üst sıra (OCR belge-türüne göre değişken değer üretir; belge merkezi her dosyada üretir).
- **NOT:** muhtemelen mevcut belge/attachment depolamayı **GENİŞLETİR** (greenfield değil) → kodlamadan önce
  mevcut depolamayı kontrol et (anti-tekrar).

---

## 7. BUG-X — Tip-farkındalı Tarih/Alan Modeli (gate-siz, en küçük kod)

Birleşik `issueDate + dueDate` modeli **çek için yanlış**:

- **ÇEK:** yalnız **Keşide tarihi**; **VADE YOK** (TTK — çek görüldüğünde ödenir; vade kaydı çekte geçersiz/
  yazılmamış sayılır). UI'da **"Vade" GÖSTERİLMEZ** (G3); tarih sadece "Keşide Tarihi". OCR **basım tarihini
  keşide sanmasın** — basım/seri tarihi ayrı **evidence/metadata** olarak tutulabilir ama **keşide tarihi yerine GEÇMEZ**.
- **BONO / POLİÇE:** düzenleme/keşide tarihi **+ vade** (vade kalır; vade türleri ileride alt-modellenebilir).

→ `case-instrument-canonical-design.md`'in **tip-farkındalı uzantısı** (yeni küçük karar). **Ayrı küçük PR.**
OCR kalitesinden **bağımsız, deterministik**, A1/BUG-1C'den bağımsız. Buradaki "Vade ≠ Çek" bir **domain-model**
hatasıdır, OCR-doğruluk hatası değil.

---

## 8. Katman yığını + boru hattı + GATE haritası

**Katman yığını:**
```
L0 Belge Merkezi (substrat)
L1 Çıkarım (tip-farkındalı domain model — BUG-X)
L2 Köken (provenance — A2-min)
L3 Güven Yığını (6 boyut, en-zayıf öne)
L4 Çözümleme (A1-P0: generik PartyMatch/IR-0 + kambiyo-context ranker)
L5 İlişki Motoru (PartyRelationship grafı — Karar 1+2)
L6 Dosya-tipi/rol motorları (icra / ceza-şikayet / dava)
```

**Boru hattı (Ulaş sentezi + köken/ölçüm eklemeli):**
```
OCR → Party Candidate → Party Resolution → Party Relationship Graph (insan-düzenlenebilir)
    → Case Context Rules → Suggested Roles → User Approval (+A2 köken / A3 ölçüm yakala) → Case Records
```
**A1'in ürünü = graf; roller = grafın türevi.**

**GATE haritası — neyi ŞİMDİ yapabiliriz:**

| İş | Gate | Not |
|---|---|---|
| **A2-min köken + A3 ölçüm başlat** | **yok** | BUG-1C'yi besler; yavaş-yanan, ŞİMDİ başlat |
| **BUG-X tip-farkındalı tarih** | **yok** | en küçük, deterministik |
| **Belge merkezi (L0)** | **yok** | yüksek değer, OCR-bağımsız |
| **L3 güven/ambiguity yüzeyleme** | **yok** | mevcut grup-uyarı UI'ı genişletir |
| A1-P0 çözümleme ağırlıkları | **veri** | A3 verisi + gerçek dosyalar |
| Taksonomi (EndorsedTo ötesi) | **Av.** | Party doc "ŞİMDİ kodlanmaz" |
| V3 müracaat kuralı | **Av.** | hukuki |
| V5 ceza pisti | **Av. + ikinci dosya tipi** | yeni case type |
| BUG-1C prompt tuning | **A3 verisi** | kör tuning yapma |
| Prod flag açılışı | **ürün/infra** | reverse-proxy body-limit doğrula |

**Önerilen sıra:** (1) A2-min + A3 ölç → (2) BUG-X → (3) Belge merkezi → (4) L3 yüzeyleme →
*(sonra)* A1 epiği (gated).

---

## 9. Reuse vs Yeni (anti-tekrar — CLAUDE.md)

- **REUSE:** `PartyMatch`/IR-0 (çözümleme) · `case-instrument` `CaseInstrument` (evrak/kanonik) ·
  mevcut grup-uyarı UI (ambiguity yüzeyi) · mevcut belge/attachment depolama (L0) · mevcut Task motoru (gerekirse).
- **YENİ:** 6-boyut güven yığını yüzeyi · A2-min köken alanları · A3 düzeltme-oranı ölçümü ·
  A1 ilişki grafı + kambiyo-context ranker · tip-farkındalı tarih (BUG-X).

---

## 10. Kapsam dışı / ertelenen

- A1 **oto-borçlu / oto-takip oluşturma** (invaryant gereği ASLA).
- Taksonomi tam kodlama · V3/V5 hukuki kurallar (Av. sign-off).
- **BUG-1C prompt-tuning** (A3 verisinden SONRA).
- Prod flag açılışı + reverse-proxy body-limit (infra).
- Schema DDL / migration (bu doc'ta yok; kod kararı ayrı plan).

---

## 11. Onay durumu

| Karar | Durum |
|---|---|
| İlke (OCR = taslak, icra'da auto-commit yok) | ✅ Onaylı (Ulaş, önceki) |
| Guard'lar G1-G4 (§1.1) | ✅ Onaylı (Ulaş, 2026-06-20) |
| Karar 1 (A1 ürünü = graf; roller türev) | ✅ Onaylı (Ulaş, 2026-06-20) |
| Karar 2 (merkez = PartyRelationship; ChainPosition = görünüm) | ✅ Onaylı (Ulaş, 2026-06-20) |
| Güven yığını = 6 boyut, en-zayıf öne | ✅ Onaylı (Ulaş, 2026-06-20) |
| A2-min + A3 sırası (A3 > BUG-1C) | ✅ Onaylı (Ulaş, 2026-06-20) |
| A1-P0 = generik reuse + kambiyo-context ranker | ✅ Onaylı (Ulaş, 2026-06-20) |
| BUG-X tip-farkındalı tarih (çek=keşide, vade yok) | ✅ Onaylı (Ulaş, 2026-06-20) |
| Belge merkezi (L0) önceliği | ✅ Onaylı (Ulaş, 2026-06-20) |
| Gate sırası (A2/A3 → BUG-X → belge → L3) | ✅ Onaylı (Ulaş, 2026-06-20) |

**Sonraki adım (Ulaş kararı, 2026-06-20):** İlk kod işi = **A2-min köken + A3 ölçüm** — **BUG-X'ten bile ÖNCE**
("veri toplamaya ne kadar erken başlanırsa OCR tartışması o kadar hızlı gerçek zemine iner"). Ayrı plan + PR.
Bu doc'tan önce kod/şema/migration **yazılmaz**.
