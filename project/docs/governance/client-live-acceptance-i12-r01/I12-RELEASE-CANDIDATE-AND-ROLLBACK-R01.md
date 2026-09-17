# İ12 — YAYIN ADAYI + GERİ ALMA PAKETİ (R01)

```text
BELGE     : I12-RELEASE-CANDIDATE-AND-ROLLBACK-R01
YETKI     : owner GO 2026-09-17 "İ12 yayın adayı ve OFFICE/C33 devir paketini tamamla" —
            AÇIKÇA: "CANLI YÜRÜTME / DEPLOY GO'SU DEĞİLDİR", "canlıya yayınlama"
KONU      : #2697 (G7 dar manuel aylık teslim ucu) içeren somut yayın adayının kimliği,
            canlıya farkı, migration gereksinimi, geri alma yolu ve İ12 paketiyle bağı
YAPILMADI : yayın · cutover · mühür · authority/nonce · T-penceresi · canlı yazma · .env değişikliği ·
            görev yeniden başlatma · GERÇEK GO ref üretimi
SIRALAMA  : yayın ordinali (RELEASE24 vb.) ve cutover motoru OFFICE/C33'ün yetkisindedir; bu belge
            ordinal ATAMAZ, yalnız uygulanabilir aday + geri alma malzemesini tanımlar
```

## 1. Aday kimliği

| Alan | Değer |
|---|---|
| **Kaynak SHA (tam)** | `5593b9bb66242bb5a0cd1f90aeaa7a0ac900e169` |
| Kapsanan ürün değişikliği | **#2697** @ `0ecd3d73` — G7 dar, kimlik-doğrulamalı manuel aylık teslim ucu |
| Birlikte taşınan (aşağı bkz. §2.2) | **#2655** @ `78f49dd3` — B11 ayrıcalıklı avukat güncellemelerinde atomik audit |
| Derleme | `pnpm exec prisma generate` → `pnpm exec nest build` (apps/api), çıkış **0** |
| dist kökü | `project/apps/api/dist/apps/api/src` |
| **dist dosya sayısı** | **3867** (yalnız `.js`: 1286) |
| **TAM AĞAÇ digest** | `87712E0ED2CF71EE8268D81865C2388E030F52AF9AC7E29C56617AEDD0845453` |
| **`.js`-ONLY digest** | `A0770295D75104C141C40A240FB5AF032291FE9CF91AFBEAEBE55B515595981D` |
| `main.js` sha256 | `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` |

> **`main.js` tek başına ayırt edici DEĞİLDİR** (giriş noktası üç ayrı derlemede aynı çıkabilir). Adayın kimliği
> **TAM AĞAÇ digest**'idir: dist altındaki her dosyanın `relpath\0sha256` çiftlerinin sıralı özetinin sha256'sı.
>
> **Derleme tuzağı (ölçüldü):** bayat üretilmiş Prisma client ile `nest build` **1488 hata** verip yine de dist
> yazar. Aday derlemesi `prisma generate` SONRASI yapılmalı ve **çıkış 0** doğrulanmalıdır; aksi hâlde dist
> sessizce kısmi/eski olur.

## 2. Mevcut canlıya fark

Canlı: `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src` (RELEASE23).

| Alan | Canlı | Aday |
|---|---|---|
| dist dosya sayısı | 3867 | 3867 |
| TAM AĞAÇ digest | `F84D680E603A0B8452AC67CBE8F7095AC34CED7A6D6E0CAE281F98D72528F44C` | `87712E0E…5453` |
| `.js`-ONLY digest | `A398776698142EAED55340F549E1E77CAFDDF39D2AC291E9699A3C9FF30F0D55` | `A0770295…981D` |
| **EKLENEN / SİLİNEN** | — | **0 / 0** |
| **DEĞİŞEN** | — | **7 dosya** (3 `.js` + 2 `.map` + 1 `.d.ts` + 1 `.map`) |

### 2.1 Değişen dosyalar — geri alma pinleriyle

| dist yolu | canlı sha256 (GERİ DÖNÜŞ HEDEFİ) | aday sha256 |
|---|---|---|
| `modules/client-statement/client-statement.controller.js` | `2E42A47563F284CE…` | `50F67E63BD45FC0C…` |
| `modules/client-statement/client-statement.controller.d.ts` | `545F48D5105D46D4…` | `F07BCBAF67EA989A…` |
| `modules/client-statement/client-statement.controller.js.map` | `16EFC1CAB439BFCE…` | `CFB95927FFCD2139…` |
| `modules/client-statement/client-statement.module.js` | `3D3DB2469BD53688…` | `3AA80CAE5B830167…` |
| `modules/client-statement/client-statement.module.js.map` | `ECC200B99FA2E717…` | `44E9A530DB5810FA…` |
| `modules/lawyer/lawyer.service.js` | `29812F1C09293228…` | `EF25F06DB9CEA28B…` |
| `modules/lawyer/lawyer.service.js.map` | `70A51B778FE66D1E…` | `38B95EE9C45B5643…` |

### 2.2 ★ ADAY YALNIZ #2697 DEĞİLDİR — B11 de taşınır (OWNER KARARI GEREKİR)

`lawyer.service.js` farkı #2697'den **gelmez**. Ölçülen: aday sürümü canlıya göre **+45 satır**, `canonicalJson`
yardımcısı eklenmiş, ayrıcalıklı-güncelleme belirteçleri **21** (canlıda **17**). Kaynak geçmişi bu değişikliği
**#2655 @ `78f49dd3` (B11 — ayrıcalıklı avukat güncellemelerinde atomik audit)** olarak veriyor. B11 önceki
RELEASE23/R28 aday kapsamında **bilerek DIŞARIDA bırakılmıştı**.

**Sonuç:** main'den kesilen HER aday B11'i zorunlu olarak içerir. Bu belge B11'i onaylamaz; **owner kararı**:
(a) aday B11 ile birlikte yayınlanır, (b) B11 için ayrı değerlendirme/onay istenir, (c) B11'i dışarıda bırakan
bir dal kesilir (ek iş; main'den sapma). Ajan kendiliğinden seçim YAPMAZ.

## 3. Migration gereksinimi — **YOK**

| Ölçüm | Sonuç |
|---|---|
| Aday `prisma/migrations` dizin sayısı | **130** |
| Canlı `prisma/migrations` dizin sayısı | **130** |
| Adayda olup canlıda olmayan | **0** (fark yok) |

`#2697` yalnız controller/module/spec dosyalarına dokunur; **şema değişikliği YOKTUR**. Bu yayın için
`prisma migrate deploy` **GEREKMEZ**; DB şeması ve migration defteri DEĞİŞMEZ. Bu, geri alma yolunu da
basitleştirir (şema geri alma gerekmez).

## 4. Geri alma yolu

Aday yalnız **7 dist dosyası** değiştirdiği ve **migration taşımadığı** için geri alma dosya düzeyindedir:

1. Yayın öncesi canlı dist ağacının TAMAMI yedeklenir; yedeğin TAM AĞAÇ digest'i `F84D680E…F44C` olmalıdır
   (bu değer yayın öncesi yeniden ölçülerek doğrulanır — belgeye güvenilmez).
2. Geri alma = yedeğin yerine konması **veya** §2.1'deki 7 dosyanın canlı sha256 değerlerine döndürülmesi.
3. `Stop-ScheduledTask` → `Start-ScheduledTask` (`HukukPlatform-API`) + sağlık doğrulaması.
4. Doğrulama: dist TAM AĞAÇ digest'i yeniden `F84D680E…F44C` · `GET`/`POST /api/client-statements/monthly-delivery/run-now`
   **404** dönmeli (uç geri alındı).
5. **Şema geri alma YOK** (migration delta 0). DB'ye dokunulmaz.

Pinli başlatıcı (`C:\Ops\hukuk\bin\start-api.ps1`, sha256 `CC634BBF…2619B3`) bu adayla **DEĞİŞMEZ**;
launcher/host ikilileri aday kapsamı dışındadır.

## 5. İ12 paketinin adayla bağı

Aşağıdaki İ12 betikleri bu adaya karşı doğrulanmıştır (governance dosyalarıdır; **dist'i etkilemezler**, bu yüzden
bu commit'lerden sonra aday kimliği değişmez):

| Betik | sha256 |
|---|---|
| `i12-live-preflight.js` | `B010D38AE1244561EE5AE089C2BDB590182F2BC231A2F24B3425C64609574127` |
| `i12-live-setup.js` | `7E1EDC9460CA9A40B261B4A4DA89652EC4E0826AA7EC9A88B6B96AF867FD1458` |
| `i12-live-window.js` | `DDDB4CCA999D715AFA3F0A9AA8E409BB54854370BDAD20C190DB096014BFD1D9` |
| `i12-window.js` | `DB1E5A5A671EE2486D1DB0461FACC2A180E9EA04F310EC10AA531BF926DA08E8` |
| `i12-live-measure-online.js` | `407591FE7AAD1D9E6F7B5313D3496E29156FC346148C7135A2A34CDA660CDB23` |
| `i12-live-recover.js` | `D7BAFDEB5E040ABA3C8AC0360B5E174E4E89D432E265C510B4AEF421738CD06B` |
| `i12-live-identity.js` | `9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F` |
| `i12-live-cron-guard.js` | `3364686577C803E857BB0D5B188A62ED96DE73B0CDC100A83370FD50148CFFA5` |
| `i12-cron-guard-prova.js` | `3B41C835F6E6601C2D74E1EC1B76D1115F0722A921C2B1C6F1572789AC7A5585` |
| `i12-live-measure.js` (DISPOSABLE prova) | `AB531AFBEEBF46285E9F2B5D576892CDAC677C3020850E38B90AA070ABC53F58` |

**Bağ:** G7 fazı (`I12_PHASE=g7`) yalnız bu aday yayımlandıktan SONRA ölçülebilir; yayım öncesi canlıda uç
`404` döner ve ölçüm **UNMEASURED** yazar (sessiz PASS YOK — `i12-live-measure-online` içinde kodlanmıştır).

## 6. Ayrı yayın GO'sundan SONRA owner'ın çalıştıracağı kesin adım

> Aşağıdaki sıra **yayın GO'su verilmeden çalıştırılmaz**. Ordinal/mühür/authority OFFICE/C33 motorundadır.

1. **Aday yeniden üretimi ve doğrulaması** (yayın makinesinde, temiz ağaçta):
   `git checkout 5593b9bb…9e169` → `pnpm install --frozen-lockfile` → `pnpm exec prisma generate` →
   `pnpm exec nest build` (**çıkış 0 ŞART**) → dist TAM AĞAÇ digest **`87712E0E…5453`** doğrulanır.
   Eşleşmezse **DURULUR** (aday yeniden üretilemiyor).
2. **Canlı yedeği:** mevcut canlı dist ağacı yedeklenir; yedeğin digest'i **`F84D680E…F44C`** ölçülerek doğrulanır.
3. **B11 kararı** (§2.2) yazılı olarak kaydedilir — aday B11'i içerir.
4. **Uygulama:** 7 dosya (veya dist ağacı) aday sürümüne alınır. `prisma migrate deploy` **ÇALIŞTIRILMAZ** (delta 0).
5. `Stop-ScheduledTask` → `Start-ScheduledTask` (`HukukPlatform-API`) + süre-sınırlı sağlık.
6. **Yayın doğrulaması:** canlı dist TAM AĞAÇ digest = `87712E0E…5453` · uç `POST /api/client-statements/monthly-delivery/run-now`
   yetkisiz çağrıda **403**, yetkisiz kimlikte **401** döner (**404 DEĞİL** → uç yayında).
7. Sorun hâlinde **§4 geri alma** uygulanır.
8. İ12 canlı kabulü bundan SONRA, **ayrı** İ12 canlı GO'su ile §7.9 zinciriyle koşulur (bu belge onu da vermez).
