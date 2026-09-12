# CLIENT İ11 — TEK CANLI GO PAKETİ (R02): SABİT ADAY + BİRLEŞİK KABUL

```text
BELGE       : I11-TEK-CANLI-GO-PAKETI-R02   (R01 karar paketinin yerine geçer; R01 tarihsel kalır)
YETKİ       : owner GO 2026-09-12 "SABİT YAYIN ADAYI VE BİRLEŞİK İ11 PROVASI" (hazırlık)
DURUM       : HAZIRLIK — CANLI DEĞİŞİKLİK YOK · yayın/restart yetkisi YOK · V1 BAŞLATILMADI
SABİT ADAY  : 2740df3dd58c5e711a790cc21a5f69d6dbffb35d   (owner kararıyla SABİT; origin/main DEĞİL)
CANLI       : RELEASE22 137406701248858221d12be94a941f8837a2a245 · BUILD_ID xJZ1G1TsbOnHoWUzMD8CQ
PROVA       : BİRLEŞİK — SMTP geçişi → tam kabul → kapanış → SMTP dönüşü : **BAŞARILI** (§3)
YAPILMAYAN  : aday derlemesi · cutover · deploy · restart · canlı .env değişikliği · migration
```

**Tek onay, tek yürütücü zinciri.** A–F ayrı onaylara bölünmez; owner tek GO verir, devir noktaları
§5'te yazılıdır ve **aynı anda iki canlı yürütücü olmaz**.

---

## 1. SABİT ADAY — ürün farkı bu SHA'da doğrulandı

`origin/main` hareketli olduğu için aday **kullanılmaz**; aday `2740df3d…` SHA'sında **sabittir**.

| Ölçüm | Değer |
|---|---|
| Aday | `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` (commit; canlının **ardılı**) |
| Canlı → aday commit sayısı | **33** |
| **Ürün kaynak farkı** | **7 dosya** (spec/test/CI-manifest hariç) |
| Prisma migration | **0 dosya** |
| `schema.prisma` | değişmedi |
| `pnpm-lock.yaml` / `package.json` | değişmedi |
| `apps/web` | değişmedi |

**Kapsama bağlanan üç PR (başka ürün farkı ÇIKMADI — kendiliğinden ekleme yapılmadı):**

| PR | Kapsam | Dosyalar |
|---|---|---|
| **#2641** `b9fd97a1` | OFFICE create **sırası**: satır içi avukat create'i müvekkil yazmasından ÖNCE; ofis oto-oluşturma avukat+audit ile aynı transaction | `case.service.ts` · `lawyer.service.ts` |
| **#2643** `d199c8dc` | **B-I11-3**: public intake ham token'ı hata kaydına yazılmaz; rota şekli korunur | `error-log.sanitize.ts` |
| **#2645** `e65ff5de` | OFFICE **dar atomiklik**: satır içi taraf yazmaları dosya `$transaction`'ına katılır | `party-write-tx.ts` (**YENİ**) · `case` · `client` · `debtor` · `lawyer.service.ts` · `office-write-role.policy.ts` |

**Doğrulama komutu (dondurulmuş SHA ile; sonuç yukarıdakinden farklı çıkarsa DUR ve owner'a bildir):**

```bash
LIVE=137406701248858221d12be94a941f8837a2a245
CAND=2740df3dd58c5e711a790cc21a5f69d6dbffb35d
git diff --name-only $LIVE..$CAND -- project/apps \
  | grep -vE "\.spec\.ts$|__tests__/|\.test\.ts$|ci-manifests/" | sort     # 7 dosya beklenir
git diff --name-only $LIVE..$CAND -- project/apps/api/prisma project/pnpm-lock.yaml   # BOŞ beklenir
```

**Sonuç:** aday **B-I11-3'ün yanında iki OFFICE davranış değişikliği** taşır. Yayın kabulü üç kalemi
birden kapsar; "yalnız log maskeleme çıkıyor" ölçümle çelişir.

## 2. GERİ DÖNÜŞ PAKETİ — ölçülen kimlikler

| Konu | Değer |
|---|---|
| Geri dönüş kökü | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22` |
| Kök HEAD | `137406701248858221d12be94a941f8837a2a245` |
| web BUILD_ID | `xJZ1G1TsbOnHoWUzMD8CQ` |
| api `dist/.../main.js` | `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` |
| `start-api.ps1` / `start-web.ps1` | `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` / `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` |
| Süreç denetimi | **Zamanlanmış Görev** `HukukPlatform-API` / `HukukPlatform-Web` — servis DEĞİL |
| Yerleşik geri dönüş | C33 motoru **R-01** (`bin` ön görüntüsü 3/3 + görevler Enable+Start) |

**Migration olmaması geri dönüşü kolaylaştırır; ancak koşum yazmalarının geri alındığı anlamına
GELMEZ** — bkz. §4.3.

**OFFICE/C33'ün tamamlayacağı (bu oturum YAPMADI, aday derleme kökü YOK):** aday derlemesi · C33
KATMAN 1 paket kimliği · mühür · geri dönüş paketi · cutover. Mevcut yordam:
`release22-candidate-r01/`.

## 3. BİRLEŞİK PROVA — **BAŞARILI** (oturuma özel DB + Redis + yerel yakalayıcı)

Sıra birebir koşuldu: **SMTP geçişi → tam kabul → bağlantı/kullanıcı kapanışı → SMTP dönüşü.**
Bloklar **gerçekten çalıştırıldı**; sözdizimi kontrolü kanıt sayılmadı.

| Aşama | Ölçülen sonuç |
|---|---|
| **T-PENCERE-AÇ** | 9 kapı geçti · env farkı **tam 2 anahtar** · restart **10 sn** (bütçe 180) · yakalayıcı tabanı 22 |
| **İ11 koşumu** (gönderim AÇIK) | **PASS 11 · FAIL 0 · ÖLÇÜLEMEYEN 0 · KAPSAM DIŞI 0** · kapsam **TAM** |
| Yakalayıcı | **2 ileti**, ikisi de bu koşumun alıcısı (`client-<runId>@cl-acceptance.invalid`) · **A-5'te intake token YOK, A-6'da VAR** |
| Kapanış | bağlantılar REVOKED · anonim yol **200 → 404** · login **401** · tekrar güvenli · izolasyon **EŞİT** |
| **T-PENCERE-KAPA** | **POZİTİF HEDEF KANITI VAR** · `R-T1` **idempotent** · restart **7 sn** · özgün hedef geri geldi · yakalayıcı durdu · yakalanan iletilerin tamamı sentetik alan |

### 3.1 Provanın yakaladığı **beş** gerçek kusur (çalıştırmasaydık görünmezdi)

| # | Kusur | Düzeltme |
|---|---|---|
| 1 | K-T2 deseni fazla gevşek: sunucu **adında** geçen `auth` (`i11-sink-noauth`) yetenek sanıldı | desen yetenek satırına bağlandı (`^\d{3}[- ]AUTH\b`), pozitif+negatif kontrolle doğrulandı |
| 2 | K-T4 yol ayracı: prova komut satırı `/`, canlı `\` | karşılaştırmadan önce ayraç normalize edildi |
| 3 | Başlatıcı çağrısı **askıda kalıyordu** (ayrılmış torun süreç tutamacı) | **ateşle-unut + bütçeli döngü** (canlıdaki `Start-ScheduledTask` ile aynı sınıf) |
| 4 | `Test-Path … -and (…)` → **çalışma zamanı hatası** (`-and` parametre sanıldı) | parantezlendi |
| 5 | R-T6 yanlış-pozitif: yakalayıcının `LISTEN` defter satırı "yabancı ileti" sayıldı | yalnız gerçek iletiler (`"raw"`) sayılır |

**Provanın kanıtlamadığı:** aday **ikilisi** denenmedi (derleme OFFICE/C33'ün adımı); prova
RELEASE22 dist'iyle koşuldu. Prova, **yordamı ve kapıları** kanıtlar.

## 4. YÖNTEM T — kesin komutlar, önleme, bütçe

### 4.1 Bloklar (prova ile ÇALIŞTIĞI GÖSTERİLDİ)

| Blok | sha256 | Doğrulama |
|---|---|---|
| **T-PENCERE-AÇ** | `D07E3F3DD6DAAB887842F676C86BE5C4360B9643EE25BBCAA0200127BA8BE0C7` | PS7+5.1 hata 0 · 9 kapı · 19 durdurucu · **prova modunda koşuldu ve geçti** |
| **T-PENCERE-KAPA** | `D84C3B3A0A3FC5B873BC51EE94711DAA1B81C7A4A41A8D86A65A0DCC8DF3F207` | PS7+5.1 hata 0 · 7 kapı · 9 durdurucu · **koşuldu, idempotentliği ölçüldü** |
| **İ11 §9** | `7A10D817D8E306DF534C704D99196E44EA71CD591D12607D44706D89C56F62D0` | değişmedi; yayından sonra §6'ya göre yeniden bağlanır |

Her iki blok `T_MODE=live|prova` ile aynı dosyadır: canlıda Zamanlanmış Görev, provada başlatıcı.

### 4.2 Kullanıcı gönderimlerini **ÖNLEME** (sonradan sayım önleme değildir)

Ölçüldü: `:8080` ve `:3002` **tüm arayüzlerde** dinliyor ve Volta `node.exe` için **inbound Allow
kuralları var** → dışarıdan erişilebilir. Bu yüzden pencere bir **bakım penceresidir**:

| Adım (K-T6, blokta) | Etki |
|---|---|
| `HukukPlatform-Web` **durdurulur** (ve :3002 dinleyicisi kapanana kadar doğrulanır) | kullanıcı arayüzü erişilemez → UI kaynaklı hiçbir gönderim başlayamaz |
| `I11-WINDOW-BLOCK-8080` / `-3002` **Block** kuralları eklenir | doğrudan API erişimi de dışarıdan engellenir; **loopback etkilenmez** (kabul koşumu localhost) |
| Kural sayısı 2 değilse **DURUR** | önleme kanıtsız açılmaz |

Zamanlanmış işler: posta üreten **tek açık** iş `CLIENT_STATEMENT_MONTHLY_DELIVERY=true`, cron **her
ayın 1'i 03:00 Europe/Istanbul** → **K-T5** o pencereyi reddeder. POA expiry / escalation / greeting
**tanımsız (kapalı)**; ICRABOT outbox açık ama `IcrabotEmailLog` **0**.

Pencere sonrası sayım **doğrulamadır, önleme değildir**; ikisi birlikte raporlanır.

### 4.3 Hedef doğrulaması — yapısal **yetmez**, pozitif kanıt şarttır

- **K-T10a (yapısal):** süreç başlangıcı `.env` yazımından sonra · `:465` bağlantısı 0.
  Blok bunu açıkça **"pozitif kanıt DEĞİL"** diye yazdırır.
- **K-T10b (pozitif):** yakalayıcı kaydında, **bu koşumun kimliğini taşıyan** yeni ileti.
  Provada ölçüldü: *"çalışan API yerel yakalayıcıya BAĞLANDI ve ileti teslim etti (bu koşuma ait 2)"*.
  Pozitif kanıt yoksa T-PENCERE-KAPA bunu **açıkça YOK** diye yazar ve geri dönüş yine uygulanır.

### 4.4 Süre bütçesi ve aşım

**Her restart için 180 sn.** Provada ölçülen: **10 sn** (açılış) ve **7 sn** (dönüş). Canlı emsal
39,467 sn (RELEASE22 cutover, API+Web). **Geçmiş süre garantili üst sınır sayılmaz** — 2026-09-11'de
reboot+logon beklemesi 35,5 dk'ya çıkmıştı (Ek C.1); bütçe bu yüzden var.

| Aşım | Davranış |
|---|---|
| T-PENCERE-AÇ restart'ı aşarsa | Beklenmez; **derhal T-PENCERE-KAPA**. Otomatik tekrar YOK |
| T-PENCERE-KAPA restart'ı aşarsa | `.env` **zaten ön görüntüdedir**; owner'a **derhal** bildirilir, elle incelenir. Otomatik tekrar YOK |
| Web geri gelmezse (R-T4) | aynı: bildir, otomatik tekrar yok |

### 4.5 TÜM SONUÇLARDA kapanış ve geri dönüş

- **Kapanış** (İ11 §11): intake bağlantıları REVOKED → anonim yol 404 → 3 kullanıcı pasif +
  `Case` CLOSED → izolasyon. **Koşum sonucundan bağımsız** çalışır; yalnız `runId` ile tekrar edilebilir.
- **Geri dönüş** (T-PENCERE-KAPA): **koşum/state dosyasından bağımsız**, tek girdisi `.env` ön
  görüntü yedeği, **idempotent** (ölçüldü).
- **Migration yok ≠ yazmalar geri alındı.** Kabul koşumu sentetik tenant'ta **19–28 satır** yazar;
  bunlar **geri ALINMAZ**, kapanışla **kapatılır** ve **kanıt olarak kalır**. `cl-acc-<runId>`
  yeniden açılmaz.
- **Başka tenant'a ait ileti yakalanırsa: OTOMATİK YENİDEN GÖNDERİM YOK** (R-T6) — owner'a bildirilir.

## 5. DEVİR NOKTALARI — aynı anda iki canlı yürütücü YOK

| # | Yürütücü | İş | Devir koşulu |
|---|---|---|---|
| **D1** | **OFFICE/C33** | Aday `2740df3d` derlemesi · paket kimliği · geri dönüş paketi · **cutover** | Cutover makbuzu + yeni canlı SHA/BUILD_ID yazılı olarak CLIENT'a devredilir. **CLIENT bu süre boyunca canlıya DOKUNMAZ** |
| **D2** | **CLIENT** | İ11'i yeni kimliklere **bağlar** (§6) ve **kapıyı ölçer**: canlı dist'te `redactSecretPathSegments` **var mı** | Bağlama PR'ı main'de + kapı `True` |
| **D3** | **CLIENT** | Pencere: T-PENCERE-AÇ → İ11 §9 (gönderim AÇIK) → T-PENCERE-KAPA | Pencere kapanış makbuzu. **OFFICE bu süre boyunca canlıya DOKUNMAZ** |

Her devir noktasında hat boşluğu ana yürütücüyle teyit edilir.

## 6. İ11'İ YENİ KİMLİKLERE BAĞLAMA (D2, mekanik)

Güncellenecekler: §9 `K-BLD` SHA + BUILD_ID · `$dist` 12 ürün hash'i · `$REL` kök · blok sha256 ·
§7.6 B-I11-3 satırı. **Ölçülebilir beklenti:** 12 dosyanın hiçbirinin kaynağı aday farkında yok →
hash'lerin aynı kalması beklenir; değişirse **derleme farkıdır** ve öyle kaydedilir. `apps/web`
değişmemesine rağmen **BUILD_ID'nin yeniden derlemede değişmesi olağandır**.

**Kapı (ön koşul):** canlı dist'te
`Select-String … 'redactSecretPathSegments' -Quiet` **True** dönmeden İ11 canlı kabulü başlatılmaz.

## 7. TEK CANLI GO TASLAĞI (owner onayına)

> **GO — CLIENT İ11 TAM CANLI KABUL (TEK ONAY)** · Ref: `OWNER-GO-CLIENT-I11-<YYYYMMDD>-R<nn>`
>
> 1. **Yayın (D1, OFFICE/C33):** aday **`2740df3dd58c5e711a790cc21a5f69d6dbffb35d`** — SABİT; başka
>    SHA kullanılmaz. Ürün farkı §1 komutuyla doğrulanır; **7 dosya / üç PR** dışında fark çıkarsa
>    DURULUR. Cutover mevcut C33 yordamıyla; geri dönüş §2.
> 2. **Bağlama (D2, CLIENT):** İ11 paketi yeni SHA/BUILD_ID/12 dist hash'ine bağlanır; canlı dist'te
>    `redactSecretPathSegments` **görülmeden** 3. adıma geçilmez.
> 3. **Pencere (D3, CLIENT, tek yürütücü):** `T-PENCERE-AÇ` (`D07E3F3D…`) → İ11 §9 (`7A10D817…`,
>    gönderim kapsamı **AÇIK**) **TEK KEZ** → `T-PENCERE-KAPA` (`D84C3B3A…`). Pencere bir **bakım
>    penceresidir**: Web durur ve :8080/:3002 dışarıya kapatılır. Her restart bütçesi **180 sn**;
>    aşımda otomatik tekrar YOK.
> 4. **Kapsam:** yazma yalnız `cl-acc-<runId>`; gönderim yalnız **yerel yakalayıcıya** (dış çıkış
>    yapısal olarak imkânsız). Gerçek kişiye gönderim, başka tenant'a yazma, ikinci API süreci,
>    migration ve flag değişikliği **kapsam dışı**.
> 5. **Her sonuçta:** kapanış (bağlantı + kullanıcı + Case) ve geri dönüş uygulanır; koşum yazmaları
>    geri alınmaz, kapatılır ve kanıt olarak kalır. Sentetik alan dışı ileti yakalanırsa **yeniden
>    gönderilmez**, owner'a bildirilir.
>
> **IF GO-COMPLETE:** İ11 üç gözlemle canlıda kapandı; sayaç 10/17 → **11/17**; hizmet kabulü 0/8 tam.

## 8. AÇIK TEMİZLİK KALEMİ (ayrı; hiçbir işi beklettmez)

`C:\Development\HY_WT\CL_TOKENFIX` dizini duruyor (373.693 girdi). `git worktree remove --force`
yerli "Filename too long" verdi; kayıtlı `robocopy /MIR /XJ` yordamı araç kancasınca reddedildi
(yanlış-pozitif). **Kancayı aşacak alternatif silme yolu denenmedi ve denenmeyecek.** Git kaydı 0,
dal 0 → yalnız disk artığı. Seçenekler: (a) owner siler, (b) kancayı tetiklemeyen yola açık onay.

---

**Canlı değişiklik yok.** CLIENT sayaç **10/17**; hizmet kabulü **0/8 tam**.
