# Legal Time Authority Rebase — Amended Design Specification

**Tarih:** 2026-07-10 · **Statü:** GO-DOCS (design-only, kod/schema/migration/runtime değişikliği yok) · **Yetki:** Bu belge, tebligat/itiraz/kesinleşme süre hesabının kanonik kaynağının `NotificationQueue`'dan hukuki olarak doğru bir `LegalDeadlineService`'e taşınması için tasarım şartnamesidir. MPB-028 (P0 security fix, PR #1027) kapanışında PROPOSED bırakılan "süre otoritesi rebase" takip maddesinin doğrudan devamıdır.

**Revizyon notu:** Bu belgenin ilk taslağı `TK 21/2 = +15 gün` varsayımını "doğru ama bağlantısız" olarak sınıflandırmıştı. Owner tarafından bu sınıflandırma **reddedildi** ve birincil kanun metnine karşı doğrulama istendi. Doğrulama yapıldı, hata teyit edildi. Bu belge o düzeltmeyi içeren revize (amended) versiyondur.

---

## 1. LEGAL_CITATION_CORRECTION

### 1.1 Geri çekilen hatalı kabul

Önceki taslakta şu sınıflandırma yapılmıştı:

```text
(C) Doğru ama ölü uç — tebligat.service.ts.checkTk212Deadlines
Tebligat.tebligSayilmaDate (TK 21/2, +15 gün ilan tarihinden)
```

**Bu hatalıdır ve geri çekilmiştir.** `+15 gün` kuralı TK m.21/2'ye ait değildir.

### 1.2 Doğrulanmış birincil kaynak metni

Tebligat Kanunu (7201 sayılı) konsolide metni doğrudan okunarak doğrulanmıştır:

> **Madde 20** (muhatabın muvakkaten başka yere gitmesi): "...tebliğ, tebliğ evrakının [13,14,16,17,18 inci maddelerde yazılı kişilere] verildiği tarihte veya ihbarname kapıya yapıştırılmışsa **bu tarihten itibaren onbeş gün sonra** yapılmış sayılır."

> **Madde 21/1** (adreste bulunmama / tebellüğden imtina): "...**İhbarnamenin kapıya yapıştırıldığı tarih, tebliğ tarihi sayılır.**"

> **Madde 21/2** (adres kayıt sistemindeki/MERNİS adresi): "...**İhbarnamenin kapıya yapıştırıldığı tarih, tebliğ tarihi sayılır.**" — 21/1 ile birebir aynı kural, gecikme yoktur.

**Sonuç:** `+15 gün`, Madde 20'nin (muvakkaten başka yere gitme) kuralıdır. Madde 21/1 ve 21/2'nin ikisi de gecikmesizdir — kapıya yapıştırma tarihi doğrudan tebliğ tarihidir.

### 1.3 Kod tarafındaki hatanın tam konumu

`apps/api/src/modules/tebligat/tebligat.service.ts`, `determinePttResultAction` metodu:

| Dal | Girdi | Mevcut davranış | Doğru mu? |
|---|---|---|---|
| `IMTINA` + `BILINEN` adres | `muhtarlikDate` | `tk21Type=TK_21_1`, `tebligSayilmaDate=muhtarlikDate` (gecikmesiz) | **Doğru** — Madde 21/1 ile uyumlu |
| `MUHTARLIGA_BIRAKILDI` + BILINEN/diğer | `muhtarlikDate` | `tk21Type=TK_21_1`, `tebligSayilmaDate=muhtarlikDate` (gecikmesiz) | **Doğru** |
| `MUHTARLIGA_BIRAKILDI` + **`MERNIS`** | `ilanDate` | `tk21Type=TK_21_2`, `tebligSayilmaDate = ilanTarihi + 15 gün` | **Yanlış** — olması gereken: `tebligSayilmaDate = ilanTarihi`, gecikmesiz |

Hata dar ve tek dallıdır: yalnız MERNİS/21-2 dalının tarih matematiği yanlıştır. Ayrıca `Tk21Type` enum'ı yalnız `TK_21_1`/`TK_21_2` değerlerini içerir — **Madde 20'nin kendi senaryosu (muvakkaten başka yere gitme, komşu/muhtar beyanı) şemada ayrı bir değer olarak hiç modellenmemiştir.** Bu yalnız bir sabit düzeltmesi değil, enum'a üçüncü bir değerin eklenmesini gerektiren bir şema eksikliğidir.

### 1.4 Diğer doğrulanmış rejimler

> **Madde 31** (ilanen tebligat): tebliğ tarihi, son ilan tarihinden itibaren **7 gün** sonradır (merci gerekirse bu süreyi uzatabilir).

> **Tebligat Kanunu m.7/a + Elektronik Tebligat Yönetmeliği m.9/6** (e-tebligat/UETS): "elektronik yolla yapılan tebligat, muhatabın elektronik adresine ulaştığı tarihi izleyen **beşinci günün sonunda** yapılmış sayılır." Yargıtay Hukuk Genel Kurulu (14.01.2020) bu yorumu teyit etmiştir. Okunma/okunmama tebliğ tarihini etkilemez.

**İİK itiraz süreleri** (rejimden bağımsız, takip tipine göre) — önceki taslakla değişmedi, iki bağımsız kaynaktan (repo-içi `computed-fact-registry.ts` atfı + dış hukuki kaynak) yakınsadı: İİK m.62 ilamsız/genel **7 gün**, İİK m.168 kambiyo **5 gün**.

---

## 2. Mevcut Durum — Dört Paralel Sistem (özet)

| Sistem | Tarih kaynağı | Gün sayısı | Hukuki dayanak | Durum |
|---|---|---|---|---|
| **(A) Aktif/canlı** — `workflow-engine.calculateNextActionTime` + `notification.service.ts` | `NotificationQueue.deliveredAt` | sabit 10 gün (tip ayrımı yok) | Yok | Otomatik `ENFORCEMENT` geçişini bugün fiilen tetikleyen tek sistem |
| **(B) Doğru, bağlantısız** — `policy-engine` `CaseObjectionPeriodDaysProvider` | — (girdi eksik) | Kambiyo 5, genel/ilamsız 7 | İİK m.62 + m.168, atıflı | Gün sayısı doğru ama besleyen tarih fact'i hiç yazılmıyor |
| **(C) Kısmen doğru, dar hata** — `tebligat.service.ts.checkTk212Deadlines` | `Tebligat.tebligSayilmaDate` | — | Bkz. Bölüm 1.3 | Ölü uç (çağıran yok); MERNİS dalı hatalı, diğer dallar doğru |
| **(D) Daha eksiksiz, devre dışı** — icrabot `kesinlesme` recipe'leri | `Case.lastServiceDate` (şemada yok) | İlamsız 7, Kambiyo 5, Kira 7, İlamlı 0, MTS 7, Diğer 7 | En eksiksiz tablo | `IcrabotModule` devre dışı; referans verdiği `Case` kolonları şemada yok |

Ek not: `workflow-engine.ts`'nin `NotificationQueue` include'unda `type` filtresi yoktur — `PAYMENT_ORDER` dışı bir `DELIVERED` bildirim yanlışlıkla deadline hesabını tetikleyebilir. Frontend'de dört ayrı, birbiriyle tutarsız gösterim mevcuttur (`AutomationPanel.tsx`, `DebtorDetailDrawer.tsx`'in `FinalizationCountdown`'ı, `ServiceStatusBadge.tsx`, `case-deadlines.tsx` — sonuncusu API hatasında demo veri gösterir).

**P0 fix yan etkisi:** PR #1027, `checkETebligatStatus`'un `Math.random()` ile sahte DELIVERED üretmesini durdurdu. Bunun sonucu: gerçek e-tebligat entegrasyonu gelene kadar `NotificationQueue.deliveredAt` yeni dosyalarda artık neredeyse hiç dolmayacak, yani (A) zincirinin otomatik `ENFORCEMENT` geçişi **sessizce devre dışı kalmıştır**. Bu, yanlış veri yazma riskini ortadan kaldırdı ama "otomasyon durdu" durumunu yarattı.

---

## 3. Altı Tebligat Rejimi — Kaynak Tablosu

| Rejim | Input date | Legal service date | Objection period days source | Final deadline formula | Legal basis | Confidence | Required tests |
|---|---|---|---|---|---|---|---|
| Doğrudan/elden teslim | teslim tarihi | = teslim tarihi | Bölüm 1.4 İİK tablosu | `teslimTarihi + itirazGünü` | TK genel hüküm | Yüksek | happy-path unit |
| **TK 21/1** (adreste yok/imtina) | kapıya yapıştırma | = kapıya yapıştırma tarihi (gecikmesiz) | Bölüm 1.4 İİK tablosu | `kapıyaYapıştırma + itirazGünü` | TK m.21/1 (Lexpera, doğrulandı) | Yüksek | mevcut kodda zaten doğru — regresyon testi |
| **TK 21/2** (MERNİS) | kapıya yapıştırma | = kapıya yapıştırma tarihi (gecikmesiz) — **ŞU AN KODDA YANLIŞ: +15 gün** | Bölüm 1.4 İİK tablosu | `kapıyaYapıştırma + itirazGünü` | TK m.21/2 (Lexpera, doğrulandı) | Yüksek | **regresyon testi zorunlu — mevcut +15 gün hatasını yakalayacak** |
| **TK 20** (muvakkaten ayrılma) | kapıya yapıştırma / muhtar-zabıtaya teslim | kapıya yapıştırma **+ 15 gün** | Bölüm 1.4 İİK tablosu | `kapıyaYapıştırma + 15 + itirazGünü` | TK m.20 (Lexpera, doğrulandı) | Yüksek | yeni — kodda bu senaryo hiç ayrı modellenmemiş |
| İlanen tebliğ | son ilan tarihi | son ilan **+ 7 gün** (merci uzatabilir) | Bölüm 1.4 İİK tablosu | `sonİlan + 7 + itirazGünü` | TK m.31 (doğrulandı) | Orta-Yüksek | yeni |
| E-tebligat/UETS | elektronik adrese ulaşma | ulaşma **+ 5 gün** (okunma etkisiz) | Bölüm 1.4 İİK tablosu | `ulaşma + 5 + itirazGünü` | TK m.7/a + Yönetmelik m.9/6 + Yargıtay HGK 14.01.2020 (doğrulandı) | Yüksek | yeni |

**İtiraz süresi (gün, tebliğ tarihinden itibaren, takip tipine göre — Bölüm 1.4/owner kararı):** İlamsız/genel **7** (İİK m.62), Kambiyo **5** (İİK m.168), Kira **7**, İlamlı **0 / ayrı rejim** (m.33, itiraz kurumu yok), MTS **7**, Diğer **7**.

---

## 4. `NotificationQueue.deliveredAt` — Otorite Statüsü

**`NotificationQueue.deliveredAt` bundan böyle hiçbir hukuki süre hesabının girdisi değildir.** Hedef mimaride:
- `workflow-engine.service.ts`'in `calculateNextActionTime` metodu `NotificationQueue`'yu hiç okumaz.
- `NotificationQueue` yalnız operasyonel hatırlatma/iletişim kuyruğu (SMS/e-posta/hatırlatma) olarak kalır — hukuki süre otoritesi hiçbir zaman değildi, olmamalıydı.
- Kanonik girdi: `Tebligat.tebligSayilmaDate` / `Tebligat.deliveredAt` / `Tebligat.tk21Type` / ilgili tarih alanları.

---

## 5. Hedef Mimari — `LegalDeadlineService`

### 5.1 Servis

`LegalDeadlineService` (yeni, kanonik): Bölüm 3'teki altı rejimi + takip-tipi gün tablosunu (Bölüm 1.4) birleştirir. Girdi: `Tebligat` kaydı + `Case.type`/`subType`. Çıktı: `LegalDeadlineSnapshot`.

### 5.2 `LegalDeadlineSnapshot` (kavramsal model, kesin Prisma söz dizimi implementasyon aşamasında netleşir)

| Alan | Tip (kavramsal) | Amaç |
|---|---|---|
| `legalServiceDate` | `DateTime` | Bölüm 3 tablosuna göre hesaplanan gerçek hukuki tebliğ tarihi |
| `objectionDeadlineAt` | `DateTime` | `legalServiceDate + itirazGünü` (takip tipine göre) |
| `deadlineReasonCode` | `String`/enum | Hangi rejim + hangi madde uygulandığı (örn. `TK_21_2`, `TK_20`, `ILANEN`, `UETS_M7A`) — UI'de "neden bu tarih" açıklaması için |
| `sourceTebligatId` | `String` (FK) | Hangi `Tebligat` kaydına dayandığı — izlenebilirlik |
| `calculationVersion` | `String`/`Int` | Hesaplama mantığı değiştiğinde (örn. bu belgedeki düzeltme sonrası) eski/yeni hesapları ayırt etmek için |

`Case.nextActionAt` **hukuki deadline alanı olarak kullanılmaz** — workflow/scheduler'ın türetilmiş aksiyon tarihi olarak kalır (mevcut anlamıyla). Hukuki gerçek yalnız `LegalDeadlineSnapshot`/`legalServiceDate`/`objectionDeadlineAt` üzerinden tutulur.

---

## 6. Owner Kararları

```text
1. Kanonik takip-tipi gün tablosu: icrabot'un 6 kırılımı esas alınır
   (ILAMSIZ 7, KAMBIYO 5, KIRA 7, ILAMLI 0/ayrı rejim, MTS 7, DIGER 7).
2. Case.nextActionAt hukuki deadline alanı olarak KULLANILMAZ.
   Yeni açık alanlar: legalServiceDate, objectionDeadlineAt
   (LegalDeadlineSnapshot modeli üzerinden).
3. Geçmiş veriye backfill YOK.
   Önce shadow/read-only recompute: açık dosyalar için mevcut değerle
   yeni kanonik hesap arasındaki fark raporlanır.
4. Backfill ayrı owner onayı ister.
5. Rollout feature-flag ile, kademeli (Bölüm 7).
6. checkTk212Deadlines standalone kalmaz: MERNİS dalının tarih matematiği
   düzeltilir (gecikmesiz), TK m.20 için ayrı bir dal/enum değeri eklenir,
   doğru kısım LegalDeadlineService içine taşınır.
```

---

## 6A. Owner Decision 3 (2026-07-13) — Canonical Legal Time Model

**Statü:** Owner kararı, kesin ve bağlayıcı; owner'ın kendi ifadesiyle "yeniden tartışılmayacak veya alternatif önerilmeyecektir." Bu bölüm Bölüm 3-6'yı YOK SAYMAZ — `legalServiceDate`'in kendisinin nasıl hesaplandığı (Bölüm 3, altı rejim) hâlâ GEÇERLİDİR; bu karar onun ÜZERİNE, tebliğ tarihinden SONRAKİ süre modelini (itiraz/ödeme/tahliye/bekleme + "sonraki işlem" uygunluğu) kesinleştirir.

### 6A.1 Temel model

1. **Tek hukuki başlangıç tarihi:** `LegalServiceDate`. Ayrı bir `PhysicalDeliveryDate` modeli OLMAYACAK (repo'da hâlihazırda böyle bir alan/model mevcut değil — doğrulandı, bkz. 6A.3).
2. **Sürenin başlangıcı:** tebliğ günü süreye dahil değildir; `periodStartDate = legalServiceDate + 1 gün`. Bütün takip türlerinde ortak kuraldır.
3. **Elektronik tebligat:** UETS/KEP'teki 5 gün itiraz/bekleme/ödeme süresi DEĞİLDİR — yalnızca "tebliğ edilmiş sayılma" kuralıdır: `electronicArrivalDate + 5 gün = legalServiceDate`, ardından `legalServiceDate + 1 gün` takip süresinin 1. günüdür.
4. **Takip türü kuralları:** her takip türünün kendi itiraz/ödeme/bekleme/tahliye süreleri vardır; bu süreler takip türünün kuralı olarak saklanır. Sistemde hiçbir yerde sabit `+7/+10/+15/+23/+30` gibi sayılar kod içinde hardcode EDİLMEYECEK — kanonik bir takip-türü tablosundan (6A.2) okunacaktır.
5. **Paralel süre modeli:** itiraz süresi ile ödeme/bekleme/tahliye süresi genellikle ARDIŞIK değil, AYNI tebliğ tarihinden başlayan PARALEL sürelerdir:
   ```
   nextActionWaitingDays = max(objectionDays, complaintDays, paymentDays, vacateDays, performanceDays)
   nextActionEligibleDate = periodStartDate + nextActionWaitingDays - 1 gün
   ```
   (Bu, `legalServiceDate + nextActionWaitingDays`'e sayısal olarak denktir — mevcut `LegalDeadlineService.calculateDeadline`'ın `dueDate = addDays(legalServiceDate, objectionPeriodDays)` formülüyle TUTARLIDIR; bkz. 6A.3.)
6. **Operasyonel gösterim:** kullanıcıya "5 + 5", "7 + 23", "7 + 8" gibi "kalan süre" gösterilebilir — ama bu YALNIZCA UI gösterimidir, kanonik hukuk kuralı DEĞİLDİR ve birincil fact olarak SAKLANMAZ (`waitingDays` birincil alan olarak persist EDİLMEYECEK; gerekirse `remainingAfterObjectionDays = nextActionWaitingDays - objectionDays` olarak türetilir).
7. **Sonraki işlem tipi:** tek bir `finalizationEligibleDate` yerine, süre sonunda doğan yetki takip türüne göre ayrı tiplerde temsil edilir: `HACIZ_REQUEST_ELIGIBLE`, `SALE_REQUEST_ELIGIBLE`, `EVICTION_REQUEST_ELIGIBLE`, `BANKRUPTCY_REQUEST_ELIGIBLE`, `FORCED_DELIVERY_ELIGIBLE`, `FORCED_PERFORMANCE_ELIGIBLE`, `FINALIZATION_REQUEST_ELIGIBLE`.

### 6A.2 Kanonik takip-türü süre tablosu (owner araştırması, 2026-07-13 — 2004 sayılı İİK + TBK + 7155 + 6183 esas alınarak; Yeni Cebrî İcra Kanunu henüz yürürlükte değil, taslak aşamasında)

| Takip türü | İtiraz/şikâyet | Ödeme/ifa/tahliye | Toplam (max) | Sonraki işlem |
|---|---:|---:|---:|---|
| Genel haciz (Form 7) | 7 | 7 | **7** | HACIZ_REQUEST_ELIGIBLE |
| Kambiyo haciz | 5 | 10 | **10** | HACIZ_REQUEST_ELIGIBLE |
| Taşınır rehni (ödeme emri) | 7 | 15 | **15** | SALE_REQUEST_ELIGIBLE |
| İpotek (ödeme emri) | 7 | 30 | **30** | SALE_REQUEST_ELIGIBLE |
| İpotek (icra emri) | yok | 30 | **30** | SALE_REQUEST_ELIGIBLE |
| Taşınır rehni (icra emri) | yok | 7 | **7** | SALE_REQUEST_ELIGIBLE |
| Adi iflas | 7 | 7 | **7** | BANKRUPTCY_REQUEST_ELIGIBLE |
| Kambiyo iflas | 5 | 5 | **5** | BANKRUPTCY_REQUEST_ELIGIBLE |
| Para/teminat ilamı | yok | 7 | **7** | FORCED_PERFORMANCE_ELIGIBLE |
| Taşınır teslimi (ilamlı) | yok | 7 | **7** | FORCED_DELIVERY_ELIGIBLE |
| Taşınmaz tahliye (ilamlı) | yok | 7 | **7** | EVICTION_REQUEST_ELIGIBLE |
| İş yapılması/yapılmaması | yok | değişken | **değişken** | FORCED_PERFORMANCE_ELIGIBLE |
| İpotekli ilam/icra emri | yok | 30 | **30** | SALE_REQUEST_ELIGIBLE |
| Konut/çatılı işyeri kira | 7 | 30 | **30** | EVICTION_REQUEST_ELIGIBLE |
| Diğer adi kira | 7 | 10 | **10** | EVICTION_REQUEST_ELIGIBLE |
| Ürün/hasılat kirası | 7 | 60 | **60** | EVICTION_REQUEST_ELIGIBLE |
| Tahliye taahhüdü | 7 | 15 | **15** | EVICTION_REQUEST_ELIGIBLE |
| MTS | 7 | 7 | **7** | HACIZ_REQUEST_ELIGIBLE |
| 6183 kamu alacağı | 15 | 15 | **15** | FINALIZATION_REQUEST_ELIGIBLE |
| İİK m.89/1 (üçüncü kişi haciz ihbarnamesi) | — | 7 | **7** | Bağımsız takip türü değil, ayrı rule |
| İİK m.89/2 | — | 7 | **7** | Bağımsız takip türü değil, ayrı rule |
| İİK m.89/3 | — | 15 | **15** | Bağımsız takip türü değil, ayrı rule |

### 6A.3 Bu kararın MEVCUT koda etkisi (kod taraması ile doğrulanmış bulgular, 2026-07-13)

- **`LegalDeadlineService.determineLegalServiceDate`** (Bölüm 3'teki altı rejim: Doğrudan/TK21-1/TK21-2/TK20/İlanen/UETS) **DEĞİŞMİYOR** — `legalServiceDate`'in kendisinin hesaplanmasıyla ilgili, owner'ın 6A.1/#1-3 maddeleriyle zaten TUTARLI. UETS/KEP dalı zaten `addDays(deliveredAt, 5)` yapıyor — owner'ın "e-tebligat 5 günü tebliğ-sayılma kuralı" maddesiyle birebir uyumlu, düzeltme GEREKMİYOR.
- **`CalculateDeadlineInput.objectionPeriodDays: number`** (tek alan) owner'ın 6A.1/#5 paralel-süre modeliyle **YETERSİZ KALIYOR** — artık `objectionDays`/`paymentDays`/`vacateDays`/`performanceDays` gibi ayrı paralel alanlara ve bunların `max()`'ına ihtiyaç var.
- **Kritik bulgu:** `LegalDeadlineService.calculateDeadline` (owner'ın paralel modelinin uygulanacağı asıl metod) **production'da hiçbir yerden çağrılmıyor** — yalnızca kendi test dosyalarında literal sabit değerlerle (7/10/365/-1) çağrılıyor; `LegalTimeShadowService` de bu metodu değil, `objectionPeriodDays` almayan `resolveLegalServiceDateForTebligat`'ı kullanıyor. Yani PR-2'nin ana snapshot-yazan metodu henüz hiçbir gerçek akışa bağlı değil — owner'ın yeni modelini uygularken geriye dönük bir tüketiciyi bozma riski YOK.
- **`CaseObjectionPeriodDaysProvider`** (`policy-engine/fact-store/computed-fact-registry.ts:258-272`) zaten VAR ama **dead logic**: yalnızca `case.type === 'ILAMSIZ' && case.sub_type === 'KAMBIYO' ? 5 : 7` mantığı çalıştırıyor; gerçek `CaseType` enum'ında (`GENERAL_EXECUTION/MORTGAGE/PLEDGE/BANKRUPTCY/CHECK/BOND/RENTAL/OTHER`) `'ILAMSIZ'` diye bir değer YOK — yani bu provider pratikte HER ZAMAN 7 dönüyor, kambiyo dalı hiç tetiklenmiyor. Bu, MEVCUT PR-2/PR-3A/PR-3B kapsamının HİÇBİRİNİ etkilemiyor (zaten bağlantısız, tasarım belgesi Bölüm 2'de "(B) Doğru, bağlantısız" olarak işaretli).
- **Şema tarafında owner'ın 6A.2 tablosundaki ~20 takip türünü birebir temsil eden tek bir alan/enum YOK:** `CaseType` (8 değer, enstrüman bazlı), `subType` (serbest metin, enum değil), `CaseSubCategory` (5 değer: GENEL/NAFAKA/DOVIZ/KIRA/CEZA), `isMtsCase` (ayrı boolean), `ExecutionPath` (5 değer: HACIZ/IFLAS/REHIN/IPOTEK/TAHLIYE — owner'ın "sonraki işlem tipi" kavramına en yakın alan, ama owner'ın 7 NextActionType değerine birebir eşlenmiyor). **Bu, owner'ın hukuki modelini koda bağlayacak şema/eşleştirme kararının henüz verilmediği anlamına gelir — ayrı bir teknik adım gerektirir (bkz. Bölüm 7, PR-3C).**
- **`PhysicalDeliveryDate`:** repo genelinde (kod, schema, migration, docs) hiç geçmiyor — doğrulandı, owner'ın "olmayacak" kararıyla zaten tutarlı, hiçbir düzeltme gerekmiyor.

### 6A.4 Icrabot 6-kırılım verisiyle karşılaştırma

Bölüm 2/6'daki "icrabot'un 6 kırılımı" (İlamsız 7, Kambiyo 5, Kira 7, İlamlı 0, MTS 7, Diğer 7) owner'ın 6A.2 tablosuyla karşılaştırıldığında, icrabot verisinin YALNIZCA İTİRAZ süresini temsil ettiği görülüyor (toplamı değil): Kambiyo'da icrabot "5" diyor ama owner'ın tablosunda toplam 10'dur (itiraz 5, ödeme 10, max); Kira'da icrabot tek bir "7" diyor ama owner'ın tablosunda dört ayrı kira alt-türü vardır (Konut 30 / Diğer 10 / Ürün 60 / Tahliye taahhüdü 15). Form 7 (İlamsız 7) ve MTS (7) icrabot verisiyle owner'ın toplam sütunuyla yalnızca bu türlerde itiraz=ödeme=7 olduğu için örtüşüyor. **Sonuç: Bölüm 6'daki Owner Kararı #1 ("icrabot'un 6 kırılımı esas alınır") artık owner'ın 6A.2 tablosuyla SÜPERSEDE edilmiştir — icrabot verisi yalnızca kısmi/eksik bir ilk kaynaktı.**

---

## 7. Önerilen PR Sıralaması

**Owner kararı (2026-07-13):** "PR-3", implementasyon sırasında tek bir PR'ın taşıyamayacağı iki ayrı işe (hesaplama motoru vs. bunun runtime aktivasyonu) ayrıştığı için, owner tarafından retroaktif olarak **PR-3A** ve **PR-3B** alt-workstream'lerine bölünmüştür (bkz. `decision-log.md` aynı tarihli OWNER DECISION kaydı). PR-4/PR-5/PR-6 numaraları bu ayrımdan etkilenmemiştir.

**Owner Decision 3 etkisi (2026-07-13, aynı gün, ayrı karar — bkz. Bölüm 6A):** Canonical Legal Time Model, PR-4/PR-5'in dayanacağı süre modelini (paralel objectionDays/paymentDays/vacateDays/performanceDays + max() formülü + takip-türüne-özgü NextActionType) PR-2'nin tek-alanlı `objectionPeriodDays` tasarımından daha geniş bir hale getirdi. Bu nedenle PR-4'ten önce, PR-3 ailesinin doğal devamı olarak **PR-3C** eklendi ve CLOSED oldu (PR #1212). PR-4/PR-5 artık PR-3C'nin kanonik modeline göre inşa edilebilir — ama **Representative Local Evidence (Operational Gate) tamamlanmadan PR-4 açılmış sayılmaz.**

**Owner Decision 4 etkisi (2026-07-14, PR-4 GO-IMPLEMENT sırasında, çoklu revizyon — bkz. `decision-log.md` 2026-07-14 MPB-028(a) PR-4 kaydı):** Operational Gate (Representative Local Evidence) tamamlandıktan hemen sonra owner PR-4'ün kapsamını, aşağıdaki orijinal tasarımdan ("dört tutarsız frontend gösterimini tek kaynağa yönlendir") önemli ölçüde daralttı. Gerçekleşen PR-4, `finalizationDate`'i (legacy tebliğ+7 gün tahmini) hiç DEĞİŞTİRMEDEN, yalnız AYRI bir `finalizationRequestEligibleDate`/`finalizationEligibilitySource` read-only projection alanı ekledi; itiraz/durdurucu-etki fact'i repoda kanonik olarak BULUNMADIĞI (kapsamlı araştırmayla kanıtlandı) için gerçek `finalizationDate` veya `enforcementCapabilityStatus` ÜRETİLMEDİ, UI flag açıkken "Kesinleşti" hükmünü ASLA göstermez. Aşağıdaki tablo satırı ("Dört tutarsız frontend gösterimini tek kaynağa yönlendir, demo-veri fallback'ini kaldır") **orijinal/tarihsel kapsam tanımıdır — gerçekleşen implementasyon bundan DAHA DARdır**; güncel/gerçek kapsam için `decision-log.md` ve `product-backlog.md` (`LEGAL-TIME-AUTHORITY-REBASE` PR-4 paragrafı) esas alınır.

**Owner Decision 5 etkisi (2026-07-14, PR-5 GO-ANALYZE/GO-IMPLEMENT sırasında — bkz. `decision-log.md` 2026-07-14 MPB-028(a) PR-5 kaydı):** Owner önce PR-5'in tüm consumer/scheduler yüzeyinin (`WorkflowEngine.calculateNextActionTime`, `NotificationService.getPaymentDeadline`, `RuleEngine.checkNotificationExpiry`, `SchedulerService.checkPaymentOrderDeadlines`) taze bir GO-ANALYZE ile taranmasını istedi, sonra kapsamı aşağıdaki orijinal tasarımdan ("scheduler/workflow switch, `checkPaymentOrderDeadlines`/`processPendingCases`/policy-engine fact zincirini bağla, `NotificationQueue` yolunu KALDIR") çok daha dar tuttu. Gerçekleşen PR-5, **yalnız** `WorkflowEngine.calculateNextActionTime`'ın `PAYMENT_ORDER`/`WAITING_RESPONSE` dalını kanonikleştirdi; `NotificationQueue` yolu KALDIRILMADI, aksine flag kapalı/servis yok/Tebligat yok/kanonik kural UNRESOLVED durumlarında **legacy fallback olarak bilinçli korundu** ("NotificationQueue yalnız legacy fallback olarak kalacaktır" — owner kararı). `NotificationService.getPaymentDeadline` gerçek consumer'ı olmadığı gerekçesiyle kapsam dışı bırakıldı; `checkPaymentOrderDeadlines`/`RuleEngine.checkNotificationExpiry`/Scheduler'ın otomatik `ENFORCEMENT` geçişine (itiraz fact'i kanonik olarak modellenmeden) HİÇ DOKUNULMADI. Aşağıdaki tablo satırı ("`NotificationQueue` yolunu kaldır") **orijinal/tarihsel kapsam tanımıdır — gerçekleşen implementasyon bundan ÇOK DAHA DARdır ve `NotificationQueue`'yu KALDIRMAZ, yalnız flag altında bir ALTERNATİF ekler**; güncel/gerçek kapsam için `decision-log.md` ve `product-backlog.md` (`LEGAL-TIME-AUTHORITY-REBASE` PR-5 paragrafı) esas alınır.

| PR | Kapsam | Not |
|---|---|---|
| **PR-1** | docs/design only | Bu belge |
| **PR-2** | `LegalDeadlineService` read-only | Henüz hiçbir tüketiciyi değiştirmez; tam test kapsamı (Bölüm 3'teki "required tests" sütunu) |
| **PR-3A** | Shadow Read + Diff Engine | Legacy (WorkflowEngine replikası) vs canonical (`LegalDeadlineService`) hesabı arasındaki farkı ölçen, immutable `LegalTimeShadowDiff` kaydı üreten read-only mekanizma — **CLOSED** (PR #1192, squash `e22777c6`) |
| **PR-3B** | Evidence Activation | PR-3A'nın runtime DI kaydı (`app.module.ts`), tetikleme/okuma yüzeyi (`LegalTimeShadowController`) ve local/ofis evidence üretim prosedürü (runbook) — **CLOSED** (PR #1198, squash `6b07bd09`); operasyonel mekanizma AVAILABLE, gerçek ofis verisiyle representative evidence hâlâ ABSENT/owner execution required |
| **PR-3C** | Canonical Proceeding-Type and Legal-Period Rule Matrix | Owner Decision 3'ün (Bölüm 6A) kod tarafındaki karşılığı — nihai model owner'ın "Proceeding Type ≠ Instrument Type" ilkesiyle genişledi: `ProceedingType`(9)/`RentalType`(4)/`BankruptcyType`(2)/`JudgmentExecutionType`(5)/`NextActionType`(7)/`PreEnforcementProcessType`+`Status` additive enum'lar, `Case`+`LegalDeadlineSnapshot`'a nullable kolonlar, tek merkezli `legal-period-rule-matrix.ts`, `ProceedingClassificationService` (CaseType/subType/executionPath'ten gizli fallback YOK), `LegalPeriodCalculationService` (read-only). `Case.instrumentType`/yeni `InstrumentType` enum'ı OLUŞTURULMADI — kanonik enstrüman kaynağı mevcut `CaseInstrument[]`. `PLEDGE`/`MORTGAGE`/bağımsız `EVICTION`/`PUBLIC_RECEIVABLE` bilinçli UNRESOLVED — **CLOSED** (PR #1212, squash `e39ce54c`); Representative Local Evidence BLOCKED UNTIL OWNER OPERATION |
| **PR-4** | UI read-only display (orijinal kapsam tanımı — bkz. yukarıdaki Owner Decision 4 notu) | Dört tutarsız frontend gösterimini tek kaynağa yönlendir, demo-veri fallback'ini kaldır; PR-3C'nin `nextActionType`/`nextActionEligibleDate` alanlarına dayanır — **CLOSED** (PR #1228, squash `78013f74`); gerçekleşen kapsam DAHA DAR: yalnız `DebtorRow`/`ServiceStatusBadge`/`DebtorDetailDrawer`/`FinalizationCountdown` consumer'ları, ayrı read-only `finalizationRequestEligibleDate`/`finalizationEligibilitySource` alanı (`finalizationDate` değiştirilmedi), itiraz fact'i yok olduğu için gerçek finalizationDate/enforcementCapability üretilmedi |
| **PR-5** | Scheduler/workflow switch (orijinal kapsam tanımı — bkz. yukarıdaki Owner Decision 5 notu) | `checkPaymentOrderDeadlines`/`processPendingCases`/policy-engine fact zincirini `LegalDeadlineService`'e bağla, `NotificationQueue` yolunu kaldır; PR-3C'nin paralel süre modeline dayanır — **CLOSED** (PR #1235, squash `71ee4d64`); gerçekleşen kapsam ÇOK DAHA DAR: yalnız `WorkflowEngine.calculateNextActionTime`, `NotificationQueue` KALDIRILMADI (bilinçli legacy fallback olarak korundu), `checkPaymentOrderDeadlines`/`RuleEngine.checkNotificationExpiry`/Scheduler ENFORCEMENT'a hiç dokunulmadı, `NotificationService.getPaymentDeadline` kapsam dışı bırakıldı |
| **PR-6** | Backfill/data cleanup | Ayrı owner onayı ister — bu belge onu yetkilendirmez |

---

## 8. Final Verdict

```text
GO-DOCS: YES
GO-IMPLEMENT: NO
IMPLEMENTATION_BLOCKER: owner legal sign-off + schema field naming (LegalDeadlineSnapshot
  alan adları kesinleşmedi) + shadow diff strategy (PR-3'ün fark-raporlama detayları
  henüz tasarlanmadı)
```

Bu belge, Av. (lisanslı hukuk danışmanı) sign-off'unun yerine geçmez. Birincil kanun metni (Tebligat Kanunu 7201, Lexpera konsolide) doğrudan okunarak doğrulanmıştır, ancak nihai/resmi hukuki yorum — özellikle Madde 20 senaryosunun kod tarafında hiç modellenmemiş olmasının doğurduğu yeni şema kararı — hukuk danışmanına aittir.

---

**Kaynaklar:** [7201 sayılı Tebligat Kanunu — Konsolide metin (LEXPERA)](https://www.lexpera.com.tr/mevzuat/kanunlar/tebligat-kanunu-7201) · [TEBLİGAT KANUNU Madde 31 — İlanen tebligatta tebliğ tarihi](https://app.e-uyar.com/madde/index/230bc346-8ecb-4078-b553-77d0bc6f70b1) · [Elektronik yolla tebligat — beşinci günün sonunda yapılmış sayılır (Osmaniye Barosu, Yargıtay HGK 14.01.2020 atfıyla)](https://www.osmaniyebarosu.org.tr/haberler/elektronik-yolla-tebligat-muhatabin-elektronik-adresine-ulastigi-tarihi-izleyen-besinci-gunun-sonunda-yapilmis-sayilir-tebligatin-once-ya-da-sonra-okunmus-olmasi-teblig-tarihini-etkilemez)
