# C3-B00 — OWNER DECISION PACK R01 (§13/5-10)

```text
BELGE YOLU     : project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/
                 C3-B00-OWNER-DECISION-PACK-R01.md   (TEK KANONİK YER)
PROGRAM        : CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01
ÜRETEN SAYFA   : CLAUDE-CLIENT-C3 · Blok C3-B00 · AŞAMA 1
MOD            : ANALYSIS_ONLY — bu paket karar HAZIRLAR, karar VERMEZ
ÜRÜN DIFF      : SIFIR (yalnız governance dokümanı)
IMPLEMENTATION AUTHORITY: NONE — bu belge hiçbir bloğa MOD B yetkisi vermez
KANIT BASELINE : origin/main cbe49683d64e39390fb19e5275355de4c262715a (2026-08-03)
RESMÎ KAYNAK   : KVKK 6698 tam metin — mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf
                 Avukatlık Kanunu 1136 md.36 — mevzuat.gov.tr/MevzuatMetin/1.5.1136.pdf
                 (iki kaynak da reconstruction R01'de tam metin doğrulandı)
KURAL          : Implementation-layer policy invention YASAKTIR. Bu pakette hiçbir
                 süre, eşik veya yetki kuralı SEÇİLMEMİŞTİR; tüm seçimler owner'ındır.
```

---

## 1. AMAÇ VE KULLANIM

Bu paket, C3 sayfasının implementation'ını bloklayan **altı owner ratifikasyon kalemini**
(MASTER-PLAN §13/5-10) tek tek **karar verilebilir** hale getirir. Her kalem için:
mevcut repository durumu (kanıtla) · karar soruları · kanonik olarak tutarlı seçenekler ·
owner'ın dolduracağı karar formu · AŞAMA 2'de decision-log'a işlenecek taslak satır.

**Karar mekaniği (C3 sayfası §1-B, bağlayıcı):**

```text
1. Owner bu paketten bir veya birkaç kaleme karar verir (KISMİ RATİFİKASYON SERBEST).
2. AŞAMA 2: EXACT kararlar project/docs/governance/decision-log.md'ye docs-only
   PR ile işlenir ve merge edilir. (Bu yeni engineering bloğu DEĞİLDİR.)
3. Yalnız ratifiye kalemin bloğu MOD B · IMPLEMENTATION'a geçer; sıra ATLANMAZ.
4. C3-B01 ve hiçbir ürün implementasyonu, ilgili karar REPOSITORY'YE MERGE
   EDİLMEDEN başlamaz. Sohbet mesajı kanıt DEĞİLDİR.
```

**decision-log.md yazım kısıtı (bilinen tuzak):** tablo satırı **tam 6 pipe** taşır
(5 hücre); hücre içinde `\|` kaçışı çalışmaz — pipe gerektiren içerik düz cümleyle
yazılır. Dosya mixed-eol'dur; AŞAMA 2 editöründe eol korunarak yazılır.

**Kalem ↔ blok eşlemesi (sıra değiştirilemez):**

| §13 | Kalem | Bloke ettiği blok |
|---|---|---|
| 5 | KVKK işleme dayanağı (md.5) | C3-B01 |
| 6 | Aydınlatma + ilgili kişi başvurusu (md.10/11/13) | C3-B02 |
| 8 | Saklama süreleri + legal hold (POL-E-R1) | C3-B03 |
| 7 | Özel nitelikli veri (md.6/3, md.6/4) | C3-B04 |
| 9 | Vekâletname ↔ capability binding (Av.K. md.36) | C3-B05 |
| 10 | UYAP aktarım yetkisi (md.8) | C3-B06 |

C3-B07 (audit bütünlüğü) tekniktir, §13 ratifikasyonuna bağlı değildir; yalnız sıra
gereği B06'dan sonra yürür.

**Migration notu (tüm kalemler için ortak):** Şema değişikliği gerektiren her seçenek
ayrıca (a) owner grant expansion (§13/2 — `prisma/` PROHIBITED), (b) tek-writer seri
migration kuralı (§6), (c) production APPLY'ın WAVE 4'te olması (C3-PROD-ACTIVATION
koşullu yetkisi NOT YET GRANTED) maliyetini taşır. Seçeneklerde bu maliyet açıkça
işaretlenmiştir: **[MIGRATION]**.

---

## 2. KARAR-05 · §13/5 — KVKK İŞLEME DAYANAĞI MODELİ (md.5) → C3-B01

### 2.1 Repository durumu (kanıt)

- CLIENT modülünde işleme dayanağı / rıza kaydı **YOK** (VERIFIED, cbe49683):
  `modules/client/` altında kvkk/consent/rıza eşleşen tek satır
  `client-audit.util.ts:4` — o da maskeleme yorumu; dayanak modeli değil.
  `schema.prisma`'da consent/dayanak modeli yok (yalnız 2 yorum satırı, başka modüller).
- İşlenen kişisel veri alanları (OBSERVED, `schema.prisma` Client modeli):
  `tckn:467` · `isForeigner:468` · `nationality:469` · `gender:470` · `birthDate:471` ·
  adres bloğu `493-499` · `notes:512` (serbest metin) · deprecated `identityNo:518`,
  `email:519`.
- Rıza sorusu doğuran hazır akış (OBSERVED): tebrik/greeting alanları
  `sendBirthdayGreeting/sendAnniversaryGreeting/sendHolidayGreeting` **@default(true)**
  (`schema.prisma:487-489`) — müvekkil kaydı açılır açılmaz, dayanak kaydı olmadan
  tebrik iletişimi AÇIK doğar.

### 2.2 Karar soruları

1. **Faaliyet envanteri:** Hangi işleme faaliyeti kümeleri ayrı dayanak taşır?
   Aday envanter (owner onaylar/değiştirir): kimlik ve iletişim yönetimi · vekâlet/temsil
   kaydı · dava/işlem yürütme · portal erişimi · tebrik/kutlama iletişimi · UYAP aktarımı.
2. **Bent eşlemesi:** Her faaliyet KVKK md.5/1 (açık rıza) mı, md.5/2 hangi bendi mi?
   (Bent seçimi hukuki değerlendirmedir; bu paket eşleme ÖNERMEZ.)
3. **Rıza gereken faaliyet:** Özellikle tebrik iletişimi md.5/2 kapsamında mı, açık rıza mı
   ister? Rıza isterse mevcut default(true) davranışı ne olacak?
4. **Fail-closed davranışın kapsamı:** Dayanağı kayıtlı olmayan faaliyet için davranış:
   yeni işlem reddi mi; mevcut kayıtlarda da mı; geçiş dönemi var mı?

### 2.3 Seçenekler (kayıt modeli — biri seçilir)

- **A · Kod-içi statik matris:** faaliyet→bent eşlemesi versiyonlu bir registry
  dosyasında; DB değişikliği yok. Artı: migration yok, hızlı. Eksi: müvekkil-bazlı
  istisna/rıza kaydı tutamaz.
- **B · DB kayıt modeli [MIGRATION]:** işleme dayanağı + (gerekirse) rıza kaydı ayrı
  tablo; müvekkil-bazlı, tarihli, audit'li. Artı: md.5/1 rızası kanıtlanabilir. Eksi:
  grant expansion + seri migration + WAVE 4 apply borcu.
- **C · Hibrit:** md.5/2 dayanakları statik matris (A); yalnız açık rıza gereken
  faaliyetler için rıza kayıt tablosu (B) [MIGRATION, daha dar].

### 2.4 Owner karar formu

```text
K5.1 Faaliyet envanteri            : ONAYLANDI / DEĞİŞTİRİLDİ → <liste>
K5.2 Faaliyet → md.5 bent eşlemesi : <faaliyet: bent> satırları (owner doldurur)
K5.3 Açık rıza gereken faaliyetler : <liste veya YOK> · tebrik default'u: <karar>
K5.4 Kayıt modeli                  : A / B / C
K5.5 Fail-closed kapsamı           : <yeni işlem / tüm işlemler / geçiş kuralı>
```

### 2.5 Taslak decision-log satırı (AŞAMA 2'de doldurulur)

`| <TARİH> | **CLIENT-C3 §13/5 — KVKK İŞLEME DAYANAĞI MODELİ RATIFIED:** faaliyet envanteri <...>; bent eşlemesi <...>; açık rıza gereken faaliyetler <...>; kayıt modeli <A/B/C>; fail-closed kapsamı <...>. | Docs-only ratifikasyon kaydı; ürün diff yok; implementation C3-B01 MOD B ile ayrıca yürür. | Owner kararı — C3-B00-OWNER-DECISION-PACK-R01 §2; baseline cbe49683. | **§13/5 RATIFIED → C3-B01 MOD B ELIGIBLE.** Kısmi ratifikasyon kuralı geçerli; sıra atlanmaz. |`

---

## 3. KARAR-06 · §13/6 — AYDINLATMA + İLGİLİ KİŞİ BAŞVURU AKIŞI (md.10/11/13) → C3-B02

### 3.1 Repository durumu (kanıt)

- Aydınlatma metni yönetimi, versiyon/teslim kaydı ve ilgili kişi başvuru (DSAR) akışı
  **YOK** (VERIFIED — §2.1'deki grep aynı zamanda bu yüzeyi de kapsıyor; charter §24.11
  bu başlığı OPEN olarak taşıyor).
- md.13 cevap süresi (en geç 30 gün) MASTER-PLAN §11/C3 madde 2'de ratifiye scope'un
  parçası olarak anılıyor; sistemde hiçbir süre takibi yok (OBSERVED).

### 3.2 Karar soruları

1. **Aydınlatma yönetimi:** Metin versiyonlanacak mı; hangi müvekkile hangi versiyonun
   ne zaman/nasıl iletildiği kayıt altına alınacak mı?
2. **Başvuru kanalı:** İlgili kişi başvurusu nereden girer — ofis içi kayıt mı, portal mı,
   ikisi de mi?
3. **Hak kapsamı:** md.11 haklarından hangileri sistemde işlem tipi olarak modellenir
   (bilgi, düzeltme, silme, itiraz, ...)? Silme talebi POL-E 8-koşul kapısına bağlanır
   (KARAR-08 ile kesişim — silme talebi kapıyı OTOMATİK geçemez).
4. **Süre takibi:** 30 günlük yasal cevap süresi sistemde deadline olarak izlenecek mi;
   yaklaşan/aşılan süreyi kim görür?

### 3.3 Seçenekler

- **A · Minimal kayıt:** başvuru + sonuç kaydı (audit'li), süreç manuel; deadline alanı
  var ama otomasyon yok. Şema ihtiyacı karara göre dar [olası MIGRATION].
- **B · İş akışlı:** başvuru statü makinesi (alındı → değerlendirme → sonuç) + süre
  takibi + audit [MIGRATION].
- **C · Portal-entegre:** B + müvekkilin portal üzerinden başvurup sonucu görmesi.
  DİKKAT: portal yüzeyi **CODEX X1 lane'idir** — C3 yalnız arka uç kaydı/kapıyı yazar,
  portal UI işi X1'e dependency olarak gider (CROSS-MODULE/CROSS-LANE kuralı).

### 3.4 Owner karar formu

```text
K6.1 Aydınlatma versiyon+teslim kaydı : EVET / HAYIR → <kapsam>
K6.2 Başvuru kanalı                   : OFİS / PORTAL / İKİSİ
K6.3 Modellenecek hak tipleri         : <liste>
K6.4 Süre takibi (30 gün)             : EVET(deadline+görünürlük: <kim>) / HAYIR
K6.5 Akış modeli                      : A / B / C
```

### 3.5 Taslak decision-log satırı

`| <TARİH> | **CLIENT-C3 §13/6 — AYDINLATMA VE İLGİLİ KİŞİ BAŞVURU AKIŞI RATIFIED:** versiyon+teslim kaydı <...>; kanal <...>; hak tipleri <...>; süre takibi <...>; model <A/B/C>. | Docs-only ratifikasyon kaydı; ürün diff yok; implementation C3-B02 MOD B ile ayrıca yürür; silme talepleri POL-E 8-koşul kapısına tabidir. | Owner kararı — C3-B00-OWNER-DECISION-PACK-R01 §3; baseline cbe49683. | **§13/6 RATIFIED → C3-B02 MOD B ELIGIBLE.** Portal UI ihtiyacı doğarsa X1'e dependency olarak bildirilir. |`

---

## 4. KARAR-08 · §13/8 — SAKLAMA / SİLME + LEGAL HOLD (POL-E-R1) → C3-B03

### 4.1 Repository durumu (kanıt)

- `decision-log.md:709` — **CLIENT-P1-POL-E-GOV** (2026-07-20, OPTION A · MINIMUM
  EVIDENCE-PRESERVING BASELINE) CANONICAL: 8-koşullu fail-closed silme kapısı ·
  BUSINESS LIFECYCLE ≠ DATA LIFECYCLE (12 iş olayı silme tetiklemez) · 18 record-family
  bağımsız · EVIDENCE-CRITICAL 10 aile ayrı inceleme olmadan deletion-safe DEĞİL.
  **Fakat aynı kayıtta:** sabit saklama süresi, otomatik silme/anonimleştirme
  tetikleyicisi ve legal-hold authority modeli **SEÇİLMEDİ**.
- Charter §24.20 (OBSERVED): FIXED RETENTION PERIODS: NOT SELECTED · AUTOMATIC
  DELETION/ANONYMIZATION: NOT AUTHORIZED · LEGAL-HOLD CONTRACT: OPEN/NOT IMPLEMENTED ·
  POL-E-R1: RECOMMENDED/NOT STARTED · IMPLEMENTATION AUTHORITY: NONE.

Yani baseline POLİTİKA ratifiye; C3-B03'ün ihtiyacı olan SOMUT parametreler açık.

### 4.2 Karar soruları

1. **Süre tablosu:** Record-family bazında saklama süresi ve yasal dayanağı — **bu paket
   süre ÖNERMEZ**; tablo owner tarafından doldurulur (POL-E 18 ailesi; tek aile kararı
   enterprise-wide kural olmaz).
2. **Başlangıç anı:** Her ailenin süresi hangi terminal iş olayından başlar (POL-E'nin
   12 olay listesine referansla)?
3. **İşleyiş modeli:** Süre dolumu nasıl işler — zamanlanmış tarama mı, talep-anı
   değerlendirme mi, yalnız raporlama/işaretleme mi? (C3 sayfası bu soruyu açıkça
   owner'a bırakır; hiçbir model peşinen seçilmemiştir. Her durumda fiilî silme/
   anonimleştirme 8-koşul kapısından geçer ve POL-E gereği bugünkü yetki NOT
   AUTHORIZED'dır.)
4. **Legal hold:** Hold'u kim koyar/kaldırır (rol) · kapsam birimi (müvekkil / dava /
   record-family) · hold kaydının şekli ve audit'i.
5. **Silme yöntemi:** Aile bazında hard delete / anonimleştirme / arşiv ayrımı.

### 4.3 Seçenekler (işleyiş modeli)

- **A · Talep-anı (on-demand):** silme/anonimleştirme yalnız yetkili talep +
  8-koşul kapısı PASS ile; zamanlayıcı yok. Artı: en düşük risk. Eksi: süre aşımı
  görünürlüğü manuel.
- **B · İşaretleme + rapor:** zamanlanmış tarama yalnız "süresi dolmuş" İŞARETLER ve
  raporlar; silme yine talep-anı ve kapılı [olası MIGRATION — işaret alanı].
- **C · Otomatik yürütme [MIGRATION + AYRI OWNER YETKİSİ]:** tarama + otomatik
  silme/anonimleştirme. DİKKAT: charter §24.20 bugün bunu NOT AUTHORIZED sayar; C
  seçilirse bu ratifikasyon aynı zamanda o yetkinin açılışıdır (owner bunu bilerek seçer).

### 4.4 Owner karar formu

```text
K8.1 Süre tablosu       : <aile → süre + yasal dayanak> (owner doldurur; boş aile =
                          o aile için süre SEÇİLMEDİ, davranış AS-IS kalır)
K8.2 Başlangıç anı      : <aile → terminal olay>
K8.3 İşleyiş modeli     : A / B / C
K8.4 Legal-hold modeli  : koyan/kaldıran rol <...> · kapsam <...> · kayıt şekli <...>
K8.5 Silme yöntemi      : <aile → hard delete / anonimleştirme / arşiv>
```

### 4.5 Taslak decision-log satırı

`| <TARİH> | **CLIENT-C3 §13/8 — SAKLAMA SÜRELERİ VE LEGAL HOLD RATIFIED (POL-E-R1):** süre tablosu <...>; başlangıç anları <...>; işleyiş modeli <A/B/C>; legal-hold modeli <...>; silme yöntemleri <...>. CLIENT-P1-POL-E-GOV OPTION A baseline ve 8-koşul kapısı AYNEN korunur. | Docs-only ratifikasyon kaydı; ürün diff yok; implementation C3-B03 MOD B ile ayrıca yürür. | Owner kararı — C3-B00-OWNER-DECISION-PACK-R01 §4; decision-log satır 709 baseline; charter §24.20. | **§13/8 RATIFIED → C3-B03 MOD B ELIGIBLE.** Otomatik silme yetkisi yalnız model C açıkça seçildiyse doğar; aksi hâlde NOT AUTHORIZED kalır. |`

---

## 5. KARAR-07 · §13/7 — ÖZEL NİTELİKLİ VERİ (md.6/3, md.6/4) → C3-B04

### 5.1 Repository durumu (kanıt)

- `nationality:469` ve `gender:470` düz kolon; hiçbir alanda özel-nitelik sınıflandırması,
  erişim kısıtı veya ayrı koruma yok (OBSERVED).
- `notes:512` serbest metin (DTO sınırı 5000 — reconstruction R01 kanıt tablosu):
  hukuk bürosu bağlamında sağlık, ceza mahkûmiyeti gibi md.6 kapsamı veriler serbest
  metne girebilir; engel veya uyarı yok.
- Hangi alan/akışın md.6 kapsamında olduğu bir **hukuki değerlendirmedir** — bu paket
  sınıflandırma İDDİA ETMEZ; aday yüzeyleri listeler, kararı owner verir.

### 5.2 Karar soruları

1. **Kapsam sınıflandırması:** Mevcut alanlardan/akışlardan hangileri md.6 kapsamında
   değerlendirilir? (Aday yüzeyler: `notes` serbest metni · dava/işlem içerikleri ·
   `nationality`/`gender` — owner değerlendirir.)
2. **Serbest metin politikası:** `notes` içine özel nitelikli veri girişi: yasak + uyarı mı ·
   ayrı korumalı alan mı · giriş serbest ama erişim/maskeleme kısıtlı mı?
3. **md.6/4 ek önlemler:** 2024/7499 sonrası rejimde Kurul'un aradığı ek teknik önlemlerden
   hangileri uygulanacak (erişim kısıtı, ayrı audit, şifreleme, ...)? Önlem setinin
   hukuki doğrulaması owner'ındır.
4. **Mevcut veri:** Geriye dönük tarama/temizlik yapılacak mı? (Yapılacaksa production
   data operation'dır — WAVE 4 / ayrı owner yetkisi gerektirir; C3 engineering'i yalnız
   ileriye dönük kapıyı yazar.)

### 5.3 Seçenekler

- **A · Politika + giriş uyarısı:** şema değişmez; sınıflandırılan yüzeylerde giriş
  uyarısı + audit. En dar müdahale.
- **B · Sınıflandırma + erişim kapısı [olası MIGRATION]:** md.6 sayılan alan/kayıtlara
  erişim rol-kapılı ve ayrı audit'li.
- **C · Ayrı korumalı depolama [MIGRATION]:** özel nitelikli içerik ayrı, kısıtlı
  modelde tutulur; `notes` bu içerikten arındırılır (geçiş planı owner kararına bağlı).

### 5.4 Owner karar formu

```text
K7.1 md.6 kapsamı sayılan alan/akışlar : <liste>
K7.2 Serbest metin (notes) politikası  : <yasak+uyarı / ayrı alan / erişim kısıtı>
K7.3 md.6/4 ek önlem seti              : <liste>
K7.4 Mevcut veri taraması              : EVET(WAVE 4, ayrı yetki) / HAYIR
K7.5 Model                             : A / B / C
```

### 5.5 Taslak decision-log satırı

`| <TARİH> | **CLIENT-C3 §13/7 — ÖZEL NİTELİKLİ VERİ YÖNETİMİ RATIFIED:** md.6 kapsamı <...>; notes politikası <...>; md.6/4 önlem seti <...>; mevcut veri taraması <...>; model <A/B/C>. | Docs-only ratifikasyon kaydı; ürün diff yok; implementation C3-B04 MOD B ile ayrıca yürür; geriye dönük tarama ayrı production yetkisine tabidir. | Owner kararı — C3-B00-OWNER-DECISION-PACK-R01 §5; baseline cbe49683. | **§13/7 RATIFIED → C3-B04 MOD B ELIGIBLE.** |`

---

## 6. KARAR-09 · §13/9 — VEKÂLETNAME ↔ CAPABILITY BINDING (Av.K. md.36 + KVKK md.5) → C3-B05

### 6.1 Repository durumu (kanıt)

- **`Client.canCollect @default(true)`** (`schema.prisma:502`) — müvekkil kaydı açıldığı
  anda, hiçbir vekâletname olmadan "Ahzu Kabza" yetkisi TRUE doğar. `canWaive/canSettle/
  canRelease` default(false) (503-505).
- `ClientPowerOfAttorney` modeli mevcut (`schema.prisma:682`): `status PoaStatus
  @default(ACTIVE)` (704) · `isLimited/validUntil` (702-703) · `scopeType
  @default(GENEL)` + `scopeDescription` (707-708) · kendi `can*` bayrakları (711-714,
  `canCollect` yine default true) · tenant-safe composite FK (692).
- **Client.can* ile POA arasında hiçbir invariant YOK** (VERIFIED — charter kanonu:
  flat can* = legacy capability indicator, legal mandate evidence DEĞİL; MANDATE SCOPE ≠
  EXECUTION AUTHORITY). C2-B04 kaydı mandate binding'i açıkça C3'e bırakmıştır
  (MASTER-PLAN §17).
- KRİTİK İLKE (C3 sayfası): "müvekkil kaydı var" ≠ "vekaletname/işlem yetkisi var".

### 6.2 Karar soruları

1. **Geçerli POA tanımı:** Hangi koşullar birlikte "geçerli" sayılır — aday tanım
   (owner onaylar/değiştirir): `status=ACTIVE` VE (`isLimited=false` VEYA
   `validUntil` geçmemiş) VE `isActive=true`. `dateIssued`/belge dosyası yokluğu
   geçerliliği etkiler mi?
2. **Kapsam uyumu:** `scopeType=GENEL` dört yetkiyi de kapsar mı; `OZEL`'de
   `scopeDescription` serbest metni nasıl değerlendirilir (yapılandırılmış kapsam alanı
   gerekir mi [MIGRATION])?
3. **Çakışma kuralı:** `Client.can*` ile POA `can*` çeliştiğinde hangisi kazanır?
   Birden çok geçerli POA varsa: birleşim mi, en kısıtlayıcısı mı, en yenisi mi?
4. **Default davranış:** Geçerli POA yokken efektif yetki = dört bayrak da ETKİSİZ
   (fail-closed — C3 acceptance kriteri) onaylanıyor mu? `Client.canCollect`'in şema
   default(true) değeri de değişecek mi [MIGRATION] yoksa efektif-yetki hesabı servis
   seviyesinde mi kalacak?
5. **Mevcut veri geçişi:** Bugün POA'sız ama canCollect=true olan müvekkiller: davranış
   değişikliği hemen mi, envanter + geçiş dönemi mi? (Envanter çıkarımı analiz işidir;
   davranış değişikliği MOD B implementation'dır.)

### 6.3 Seçenekler

- **A · Servis-seviyesi efektif yetki:** şema değişmez; tüm tüketim noktaları
  "efektif capability = flat bayrak + geçerli ve kapsam-uyumlu POA" hesabından geçer.
  Artı: migration yok, geri alınabilir. Eksi: hesabı atlayan yeni kod yüzeyi riski
  (test + tek-kapı ile kapatılır).
- **B · Şema-seviyesi invariant [MIGRATION]:** default'lar düzeltilir ve/veya
  binding kolonları eklenir; DB seviyesinde tutarlılık. Artı: kalıcı bütünlük. Eksi:
  grant expansion + WAVE 4 apply + mevcut veri geçiş planı zorunlu.
- **C · Aşamalı (A sonra B):** önce servis-seviyesi fail-closed; şema düzeltmesi
  ayrı, gerekçeli seri migration olarak (yetki yine bu ratifikasyonla sınırlı).

### 6.4 Owner karar formu

```text
K9.1 Geçerli POA tanımı        : ADAY TANIM ONAYLANDI / DEĞİŞTİRİLDİ → <tanım>
K9.2 Kapsam uyumu kuralı       : GENEL=<dördü de mi> · OZEL=<değerlendirme kuralı>
K9.3 Çakışma + çoklu-POA kuralı: <flat vs POA> · <birleşim/en-kısıtlayıcı/en-yeni>
K9.4 POA'sız efektif yetki     : DÖRT BAYRAK ETKİSİZ (fail-closed) ONAY / <istisna>
     Şema default değişikliği  : EVET [MIGRATION] / HAYIR (servis seviyesi)
K9.5 Mevcut veri geçişi        : <hemen / envanter+geçiş kuralı>
K9.6 Model                     : A / B / C
```

### 6.5 Taslak decision-log satırı

`| <TARİH> | **CLIENT-C3 §13/9 — VEKALETNAME-CAPABILITY BINDING RATIFIED:** geçerli POA tanımı <...>; kapsam kuralı <...>; çakışma kuralı <...>; POA'sız efektif yetki fail-closed <...>; şema değişikliği <...>; geçiş kuralı <...>; model <A/B/C>. | Docs-only ratifikasyon kaydı; ürün diff yok; implementation C3-B05 MOD B ile ayrıca yürür. | Owner kararı — C3-B00-OWNER-DECISION-PACK-R01 §6; schema.prisma 502-505 ve 682-741 kanıtı; baseline cbe49683. | **§13/9 RATIFIED → C3-B05 MOD B ELIGIBLE.** UYAP gate'i (§13/10) bu tanımı TÜKETİR. |`

---

## 7. KARAR-10 · §13/10 — UYAP AKTARIM GATE'İ (md.8) → C3-B06

### 7.1 Repository durumu (kanıt)

- `UyapOperation.representedPartyId String?` **nullable** (`schema.prisma:9792`);
  Client'a tenant-safe composite FK ile bağlı (`schema.prisma:9814`, onDelete: Restrict)
  fakat **geçerli POA şartı veya aktarım-öncesi dayanak doğrulaması YOK** (VERIFIED).
- Sınır (C3 sayfası, bağlayıcı): UYAP domain-law CLIENT'ın değildir; yalnız CLIENT
  tarafındaki kapı yazılır. `modules/uyap/` FORBIDDEN PATH'tir.

### 7.2 Karar soruları

1. **Kapsam:** Hangi UYAP operasyon türleri "müvekkil kişisel verisi aktarımı" sayılır
   ve kapıya tabidir? (Sınıflandırma owner'ındır; teknik envanter B06'da çıkarılır.)
2. **Kapı koşulu:** Aktarım için ikisi de mi aranır — (a) geçerli ve kapsam-uyumlu POA
   (KARAR-09 tanımı) + (b) kayıtlı işleme/aktarım dayanağı (KARAR-05 modeli)?
3. **Fail-closed davranış:** Koşul eksikse operasyon: reddedilir mi, beklemeye mi alınır?
   Acil durum istisnası (break-glass) olacak mı — olacaksa koşulu/audit'i owner tanımlar;
   tanımlanmazsa İSTİSNA YOK demektir.
4. **`representedPartyId` zorunluluğu:** Kapıya tabi operasyon türlerinde bu alan zorunlu
   hale gelir mi (temsilsiz meşru operasyon türü var mı)? Zorunluluk şemaya inerse
   [MIGRATION].

### 7.3 Bağımlılık notu

KARAR-10, KARAR-09'daki "geçerli POA" tanımını ve (kapı koşuluna alınırsa) KARAR-05
dayanak modelini TÜKETİR. Owner yalnız KARAR-10'u ratifiye ederse C3-B06 yine sıra
gereği B05'ten önce BAŞLAYAMAZ (EXECUTION ORDER sabittir).

### 7.4 Owner karar formu

```text
K10.1 Kapıya tabi operasyon sınıfları : <liste / sınıflandırma kuralı>
K10.2 Kapı koşulu                     : POA + DAYANAK / yalnız POA / <tanım>
K10.3 Fail-closed davranış            : RED / BEKLET · break-glass: YOK / <koşul+audit>
K10.4 representedPartyId zorunluluğu  : SERVİS SEVİYESİ / ŞEMA [MIGRATION] / HAYIR
```

### 7.5 Taslak decision-log satırı

`| <TARİH> | **CLIENT-C3 §13/10 — UYAP AKTARIM GATE RATIFIED (md.8):** kapı kapsamı <...>; koşul <...>; fail-closed davranış <...>; break-glass <...>; representedPartyId kuralı <...>. | Docs-only ratifikasyon kaydı; ürün diff yok; implementation C3-B06 MOD B ile ayrıca yürür; modules/uyap domain-law'una dokunulmaz. | Owner kararı — C3-B00-OWNER-DECISION-PACK-R01 §7; schema.prisma 9792/9814 kanıtı; baseline cbe49683. | **§13/10 RATIFIED → C3-B06 MOD B ELIGIBLE.** Sıra kuralı gereği B06, B05'ten önce başlamaz. |`

---

## 8. KAPSAMA DOĞRULAMASI VE AÇIK HUSUSLAR

**Kapsama:** §13/5 (→§2) · §13/6 (→§3) · §13/7 (→§5) · §13/8 (→§4) · §13/9 (→§6) ·
§13/10 (→§7) — **altı kalemin altısı da** bu pakette karar formuna bağlanmıştır.

**Bu paketin karar VERMEDİĞİ, açıkça owner'a bıraktığı hususlar (NOT_PROVEN/AÇIK):**

- Hiçbir saklama süresi, bent eşlemesi, md.6 kapsam sınıflandırması veya break-glass
  koşulu bu pakette seçilmemiştir (policy invention yasağı).
- KVKK md.5/md.6/md.8/md.10/11/13 ve Av.K. md.36'nın somut olaya uygulanması hukuki
  değerlendirmedir; bu paket yalnız doğrulanmış kaynakları ve repository durumunu sunar.
- Runtime davranış iddiaları bu pakette YOKTUR; kanıtlar şema + kod + governance
  kayıtlarındandır (deployment modeli gereği runtime ayrı doğrulanır).

**Sonraki adım:** Owner bu paketten karar verir → AŞAMA 2 decision-log kaydı (docs-only)
→ yalnız ratifiye kalemlerin blokları MOD B. O zamana kadar C3 STATUS =
`WAITING_FOR_OWNER_DECISION`; sıradaki hiçbir engineering bloğu başlamaz.
