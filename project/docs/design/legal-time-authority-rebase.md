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

## 7. Önerilen PR Sıralaması

**Owner kararı (2026-07-13):** aşağıdaki "PR-3", implementasyon sırasında tek bir PR'ın taşıyamayacağı iki ayrı işe (hesaplama motoru vs. bunun runtime aktivasyonu) ayrıştığı için, owner tarafından retroaktif olarak **PR-3A** ve **PR-3B** alt-workstream'lerine bölünmüştür (bkz. `decision-log.md` aynı tarihli OWNER DECISION kaydı). PR-4/PR-5/PR-6 numaraları bu ayrımdan etkilenmemiştir.

| PR | Kapsam | Not |
|---|---|---|
| **PR-1** | docs/design only | Bu belge |
| **PR-2** | `LegalDeadlineService` read-only | Henüz hiçbir tüketiciyi değiştirmez; tam test kapsamı (Bölüm 3'teki "required tests" sütunu) |
| **PR-3A** | Shadow Read + Diff Engine | Legacy (WorkflowEngine replikası) vs canonical (`LegalDeadlineService`) hesabı arasındaki farkı ölçen, immutable `LegalTimeShadowDiff` kaydı üreten read-only mekanizma — **CLOSED** (PR #1192, squash `e22777c6`) |
| **PR-3B** | Evidence Activation | PR-3A'nın runtime DI kaydı (`app.module.ts`), tetikleme/okuma yüzeyi (`LegalTimeShadowController`) ve local/ofis evidence üretim prosedürü (runbook) — **CLOSED** (PR #1198, squash `6b07bd09`); operasyonel mekanizma AVAILABLE, gerçek ofis verisiyle representative evidence hâlâ ABSENT/owner execution required |
| **PR-4** | UI read-only display | Dört tutarsız frontend gösterimini tek kaynağa yönlendir, demo-veri fallback'ini kaldır |
| **PR-5** | Scheduler/workflow switch | `checkPaymentOrderDeadlines`/`processPendingCases`/policy-engine fact zincirini `LegalDeadlineService`'e bağla, `NotificationQueue` yolunu kaldır |
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
