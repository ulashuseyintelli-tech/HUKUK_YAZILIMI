# İ12 — YAYIN ADAYI + GERİ ALMA PAKETİ (R02)

```text
BELGE     : I12-RELEASE-CANDIDATE-AND-ROLLBACK-R01 (içerik R02'ye güncellendi)
YETKI     : owner GO 2026-09-17 "İ12 yayın adayı ve OFFICE/C33 devir paketini tamamla" + aynı gün
            "kalan iki açığı kapat ve karar paketini tamamla" — İKİSİ DE "CANLI YÜRÜTME / DEPLOY GO'SU DEĞİLDİR"
KONU      : #2697 (G7 dar manuel aylık teslim ucu) içeren adayın kimliği, canlıya farkı, migration
            gereksinimi, DOĞRU sıralı yayın/geri alma yordamı ve B11 karar paketi
YAPILMADI : yayın · cutover · mühür · authority/nonce · T-penceresi · canlı yazma · .env değişikliği ·
            görev durdurma/başlatma · GERÇEK GO ref üretimi
SIRALAMA  : yayın ordinali (RELEASE24 vb.), mühür ve cutover motoru OFFICE/C33 yetkisindedir; bu belge
            ordinal ATAMAZ — yalnız uygulanabilir aday + geri alma yordamını tanımlar
```

## 1. ÜÇ AYRI KİMLİK (karıştırılmaz)

| # | Kimlik | Değer | Ne kanıtlar |
|---|---|---|---|
| 1 | **KAYNAK SHA** (git commit) | `006c4dd2928f6c719669cc17b3b61f6ce3e2bc89` | dist'i üreten `apps/api/src` ağacı |
| 2 | **PAKET DIGEST** (İ12 canlı betik seti) | `4992D27F2B6F97F4A8C93A773F86816619A132A71213320B16CB83F251B5564B` | kabul yordamının hangi betiklerle koşacağı |
| 3 | **DERLEME KİMLİĞİ** (dist tam ağaç) | `87712E0ED2CF71EE8268D81865C2388E030F52AF9AC7E29C56617AEDD0845453` · **3867 dosya** | yayına çıkacak ikili artefakt |

**KAYNAK SHA neden `006c4dd2`?** Ürün değişikliği `#2697 @ 0ecd3d73` ile main'e girdi, ancak G7 ucunun spec'i
CI'da **ancak `#2699 @ 987f0c1e` ile koşmaya başladı** (§4). `006c4dd2`, `987f0c1e`'yi ata olarak içerir.
**Ölçüldü:** dist `5593b9bb` ve `006c4dd2`'de yeniden derlendi → **tam ağaç digest BİREBİR AYNI**
(`87712E0E…5453`), yani aradaki commit'ler (spec/CI kablolaması + governance) artefaktı değiştirmez.

**PAKET DIGEST bileşenleri** (`relpath\0sha256` sıralı özeti; disposable prova betikleri HARİÇ):

| Betik | sha256 |
|---|---|
| `i12-live-cron-guard.js` | `3364686577C803E857BB0D5B188A62ED96DE73B0CDC100A83370FD50148CFFA5` |
| `i12-live-identity.js` | `9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F` |
| `i12-live-measure-online.js` | `CE41C911EEDB33D8AD0694E89DB82F9F354568E6110EDBF6ADFCE6C4105467BF` |
| `i12-live-preflight.js` | `B010D38AE1244561EE5AE089C2BDB590182F2BC231A2F24B3425C64609574127` |
| `i12-live-recover.js` | `D7BAFDEB5E040ABA3C8AC0360B5E174E4E89D432E265C510B4AEF421738CD06B` |
| `i12-live-setup.js` | `7E1EDC9460CA9A40B261B4A4DA89652EC4E0826AA7EC9A88B6B96AF867FD1458` |
| `i12-live-window.js` | `DDDB4CCA999D715AFA3F0A9AA8E409BB54854370BDAD20C190DB096014BFD1D9` |
| `i12-window.js` | `DB1E5A5A671EE2486D1DB0461FACC2A180E9EA04F310EC10AA531BF926DA08E8` |

> **Derleme tuzağı (ölçüldü):** bayat üretilmiş Prisma client ile `nest build` **1488 hata + exit 1** verip
> **yine de dist yazar**. Sıra ZORUNLU: `pnpm install --frozen-lockfile` → `pnpm exec prisma generate` →
> `pnpm exec nest build` → **çıkış kodu 0 ÖLÇÜLÜR**. `main.js` sha'sı **tek başına ayırt edici DEĞİLDİR**.

## 2. Mevcut canlıya fark

Canlı: `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src` (RELEASE23).

| Alan | Canlı | Aday |
|---|---|---|
| dist dosya sayısı | 3867 | 3867 |
| tam ağaç digest | `F84D680E603A0B8452AC67CBE8F7095AC34CED7A6D6E0CAE281F98D72528F44C` | `87712E0E…5453` |
| **EKLENEN / SİLİNEN** | — | **0 / 0** |
| **DEĞİŞEN** | — | **7 dosya** |

| dist yolu | canlı sha256 (GERİ DÖNÜŞ HEDEFİ) | aday sha256 |
|---|---|---|
| `modules/client-statement/client-statement.controller.js` | `2E42A47563F284CE…` | `50F67E63BD45FC0C…` |
| `modules/client-statement/client-statement.controller.d.ts` | `545F48D5105D46D4…` | `F07BCBAF67EA989A…` |
| `modules/client-statement/client-statement.controller.js.map` | `16EFC1CAB439BFCE…` | `CFB95927FFCD2139…` |
| `modules/client-statement/client-statement.module.js` | `3D3DB2469BD53688…` | `3AA80CAE5B830167…` |
| `modules/client-statement/client-statement.module.js.map` | `ECC200B99FA2E717…` | `44E9A530DB5810FA…` |
| `modules/lawyer/lawyer.service.js` | `29812F1C09293228…` | `EF25F06DB9CEA28B…` |
| `modules/lawyer/lawyer.service.js.map` | `70A51B778FE66D1E…` | `38B95EE9C45B5643…` |

İçerik: **#2697** (client-statement controller+module) **ve #2655 / B11** (lawyer.service) — B11 karar paketi **§5**.

## 3. Migration gereksinimi — **YOK** (içerik eşitliğiyle)

Dosya sayısı tek başına yeterli kanıt değildir; **içerik** karşılaştırıldı:

| Ölçüm | Aday | Canlı |
|---|---|---|
| `prisma/migrations` altındaki dosya sayısı | **131** | **131** |
| **İÇERİK digest** (`relpath\0sha256` sıralı özeti) | `DD38F07D092CD2839142291058C1EC28B1325B42C0C0E82DF045E0BAB1AEC93D` | `DD38F07D…C93D` |
| eklenen / silinen / **içeriği değişen** | **0 / 0 / 0** | — |

→ `prisma migrate deploy` **ÇALIŞTIRILMAZ**; şema ve migration defteri değişmez, şema geri alma gerekmez.

## 4. CI yürütme kaydı — G7 spec'i gerçekten koştu

**Önemli düzeltme:** `#2697`'nin kendi CI'ında Test Suite **yeşildi ama G7 spec'i KOŞMADI** — o sırada
`client-statement` modülü hiçbir CI manifest kovasına bağlı değildi (aynı koşuda mevcut
`client-statement.service.spec` de görünmez). "CI yeşil" tek başına "spec koştu" DEMEZ.

Boşluğu **#2699 @ `987f0c1e`** kapattı (*"client-statement CI boslugu kapatildi — 5 spec →
`pure/claim-collection-finance` (modul 12/12)"*). Kayıt:

| Alan | Değer |
|---|---|
| Workflow run | `35268331580` · job `105361013145` (**Test Suite**) |
| Kova | `pure/claim-collection-finance` |
| Satır | `PASS src/modules/client-statement/client-statement-monthly-delivery-manual.controller.spec.ts` |
| Zaman damgası | `2026-09-17T20:06:28.3504037Z` |
| Kova toplamı | `Tests: 1092 passed, 1092 total` |
| Yol manifesti | aynı logun `Ran all test suites within paths …` satırında bu spec **açıkça listelidir** |

→ G7 ucunun spec'inin CI'da yürütülme garantisi **`987f0c1e`'den itibaren** geçerlidir; bu yüzden KAYNAK SHA
`006c4dd2` seçilmiştir (§1).

## 5. B11 KARAR PAKETİ (owner kararı — ajan onaylamaz/çıkarmaz)

### 5.1 Önceki adaydan çıkarılma gerekçesi — kanonik kayıttan doğrulandı
| Kaynak | Hüküm |
|---|---|
| `product-backlog.md` B11 satırı | **"POLITIKA KARARI VERILDI (owner 2026-09-12) ve UYGULANDI — main'de; CANLIDA DEGIL; RELEASE23 adayinda DEGIL"** |
| `product-backlog.md` SINIF satırı | **"POLITIKA KARARI — kusur DEGIL"** (kanonik kural sessizdi) |
| `product-backlog.md` yayın tablosu | B11 · *"**HAYIR** — aday `2740df3d`'den SONRA; **adaya girmesi yeni derleme ister**"* |
| `product-backlog.md` | *"**B11 bu nedenle RELEASE23 adayindan sonraki İLK çalışma zamanı OFFICE değişikliğidir.**"* |
| `RELEASE23-TEK-NIHAI-PAKET-R01.md` | *"main ≠ aday — #2655 B11 · RELEASE23'te YOK (sabit aday); **canlıya çıkışı ayrı aday/ayrı karar**"* |
| `RELEASE23-R28-BAGIMSIZ-DOGRULAMA-R01.md` | B11 aday dışı · **DOGRU** — `78f49dd3` adayda HAYIR, main'de EVET |

**Sonuç:** B11 **kusur veya engel nedeniyle DEĞİL**, yalnız **aday dondurulduktan sonra main'e girdiği** için
RELEASE23 dışındadır. Kanonik kayıt çıkışını zaten **"ayrı aday / ayrı karar"a** bağlamıştır — eldeki aday tam
olarak o ayrı adaydır.

### 5.2 #2655'in mevcut kabul kanıtları (YENİDEN AÇILMADI — kayıttan aktarım)
- Yetki: **owner GO 2026-09-12** "B11 / Ayrıcalıklı avukat güncellemelerinde atomik audit"; PR **#2655 MERGED**
  2026-09-12T21:28:46Z, squash **`78f49dd3`**.
- `lawyer-privileged-update-audit-b11.spec.ts` — **11/11 PASS**.
- **Mutasyon kanıtı:** audit çağrısı kaldırılınca **7/11 DÜŞER** · tx dışına taşınınca **7/11** · delegation
  `changedFields`'a eklenince **1/11** · no-op tespiti kaldırılınca **1/11**.
- `…b11.db-gated.integration.spec.ts` (disposable PostgreSQL) — **5/5 PASS**, gerçek rollback dahil.
- **RED koşusu** (aynı db-gated spec, YAMASIZ kod) — **4/5 DÜŞER** → testler yamaya gerçekten bağlı.
- Manifestler: `pure/office-auth-user` 103 suite/2044 test · `db/core-lifecycle` 33/321 · `pure/architecture-guards`
  47/997 · lawyer modülü 13 suite — hepsi PASS. `tsc`: yama öncesi 530 = sonrası 530 (eklenen hata **0**).

### 5.3 Açık engel taraması
Kanonik kayıtlarda B11 için **açık engel/itiraz bulunamadı**. Kapsam bilinçli olarak dardır: yalnız beş ayrıcalıklı
alan (`lawyerRank`, `permissionsLocked`, `canModifyOtherPermissions`, `defaultPermissions`, `canApproveOfficeActions`);
genel profil alanları ve STAFF update **bilinçli kapsam dışı**.

### 5.4 ★ Owner'ın bilerek kabul etmesi gereken TEK davranış değişikliği
Kayıttaki ifadeyle **"bilinçli davranış değişikliği"**: eskiden delegation audit'i güncellemeden SONRA
**hata-yutan** `audit.log()` ile yazılıyordu (audit düşerse değişiklik **audit'siz kalıcı** oluyordu). Artık
audit yazılamazsa **güncelleme geri alınır ve hata çağırana ulaşır**. Yani daha önce sessizce başarılı olan bir
`PUT/PATCH /lawyers/:id` çağrısı, audit altyapısı arızalıysa artık **hata dönebilir**. Bu, veri bütünlüğü lehine
kasıtlı bir sıkılaştırmadır; operasyonel etkisi owner tarafından kabul edilmelidir.

### 5.5 Gerekçeli öneri (KARAR OWNER'IN)
**Öneri: B11 bu adayla birlikte yayınlansın.** Gerekçe: (1) kanonik sınıflandırma **kusur değil, owner onaylı
politika**; (2) kabul kanıtı mutasyon + RED koşusu dahil **tam**; (3) açık engel **yok**; (4) kanonik kayıt çıkışını
zaten "ayrı aday/ayrı karar"a bağlamış, bu aday odur; (5) B11'i dışarıda bırakmak main'den **sapan** bir dal ve
**ayrı bir derleme** gerektirir — yani ek risk üretir, azaltmaz; (6) değişiklik **migration taşımaz** ve geri alma
§7 ile dosya düzeyinde tamdır. **Kabul edilmesi gereken tek kalem §5.4'teki davranış değişikliğidir.**
Ajan B11'i onaylamaz ve adaydan çıkarmaz; karar owner'ındır ve yayın öncesi **yazılı** kaydedilmelidir.

## 6. YAYIN SIRASI (ayrı yayın GO'su OLMADAN çalıştırılmaz)

> **KURAL: ÇALIŞAN API'nin dist dosyaları DEĞİŞTİRİLMEZ.** Dosya değişimi yalnız süreç gerçekten kapandıktan
> sonra yapılır. Sıra bozulursa yükleme yarı-yarıya olur ve çalışan süreç tutarsız modül yükler.

```powershell
# Yardımcı: görev DURDU ve SÜREÇ GERÇEKTEN KAPANDI mı (dosyaya dokunmadan ÖNCE zorunlu)
function Wait-ApiStopped {
  param([Parameter(Mandatory)][int]$Port, [int]$TimeoutSec = 90)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $listen = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    $procs  = @(Get-CimInstance Win32_Process -Filter "Name='hukuk-task-host.exe'" -ErrorAction SilentlyContinue |
                Where-Object { $_.CommandLine -match '(^|\s)api(\s|$)' })
    $task   = (Get-ScheduledTask -TaskName 'HukukPlatform-API').State
    if ($listen.Count -eq 0 -and $procs.Count -eq 0 -and $task -ne 'Running') { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}
```

1. **ADAY HAZIRLA + DOĞRULA** (yayın makinesi, temiz ağaç — canlıya dokunmaz):
   `git checkout 006c4dd2…2bc89` → `pnpm install --frozen-lockfile` → `pnpm exec prisma generate` →
   `pnpm exec nest build` → **çıkış 0 ŞART** → dist tam ağaç digest = **`87712E0E…5453`**.
   Eşleşmezse **DUR** (aday yeniden üretilemiyor).
2. **CANLI KİMLİK + YEDEK BÜTÜNLÜĞÜ**: canlı dist tam ağaç digest'i ölç → **`F84D680E…F44C`** olmalı (belgeye
   güvenilmez, ölçülür). Yedeği al ve **yedeğin digest'ini yeniden ölçerek** `F84D680E…F44C` doğrula.
   Yedek doğrulanmadan **sonraki adıma geçilmez**.
3. **GÖREVİ DURDUR + SÜRECİN KAPANDIĞINI DOĞRULA**:
   `Stop-ScheduledTask -TaskName 'HukukPlatform-API'` →
   `if (-not (Wait-ApiStopped -Port <apiPort>)) { throw "API kapanmadı — DOSYALARA DOKUNULMAZ" }`
4. **DOSYALARI DEĞİŞTİR**: §2'deki 7 dosya (veya dist ağacı) aday sürümüne alınır.
   `prisma migrate deploy` **ÇALIŞTIRILMAZ** (§3).
5. **TAM AĞAÇ DIGEST DOĞRULA** (hâlâ durmuşken): canlı dist digest = **`87712E0E…5453`**.
   Eşleşmezse **başlatma**, §7 geri almaya geç.
6. **API'Yİ BAŞLAT**: `Start-ScheduledTask -TaskName 'HukukPlatform-API'`.
7. **SÜRELİ SAĞLIK KONTROLÜ**: `/api/auth/login` isteğe yanıt verene kadar ≤120 sn bekle; vermezse §7.
8. **ROUTE DOĞRULAMASI** (§8).

## 7. GERİ ALMA SIRASI (aynı durdurma/doğrulama disiplini)

1. Yedeğin digest'ini **yeniden ölç** → `F84D680E…F44C` (yedek bozuksa geri alma BAŞLAMAZ).
2. `Stop-ScheduledTask -TaskName 'HukukPlatform-API'` → **`Wait-ApiStopped` ile kapandığını DOĞRULA**;
   kapanmadıysa **dosyalara dokunma**, escalate.
3. 7 dosyayı (veya dist ağacını) canlı sha256 değerlerine döndür.
4. **Tam ağaç digest doğrula** = `F84D680E…F44C` (hâlâ durmuşken).
5. `Start-ScheduledTask` → süreli sağlık kontrolü.
6. Route geri alma doğrulaması: uç artık **404** (yetkili elevated aktörle bile) → uç yayından kalktı.
7. **Şema geri alma YOK** (§3: migration delta 0). DB'ye dokunulmaz.

Pinli başlatıcı `C:\Ops\hukuk\bin\start-api.ps1` (`CC634BBF…2619B3`) bu adayla **değişmez**.

## 8. Uç varlığı nasıl KANITLANIR (401 tek başına kanıt DEĞİLDİR)

**Ölçülen davranış (aday dist'i, gerçek boot):** kimliksiz `POST` → gerçek uçta **401**
(`{"message":"Unauthorized","statusCode":401}`), olmayan bir yolda **404** (`Cannot POST …`).
Yani 401, uç varlığıyla **tutarlıdır** ama **yeterli kanıt DEĞİLDİR**: (a) yalnız "korumalı bir route eşleşti"
der — **hangi handler'ın ve hangi yetki kapısının** yayında olduğunu göstermez; (b) 401/404 ayrımı guard
sırasına bağlıdır ve sürümler arasında değişebilir; (c) yanlış/eski bir handler da aynı 401'i üretir.
Bu yüzden 401 **tek başına** route kaydı kanıtı sayılmaz.

Kabul edilen iki kanıt **birlikte**:

1. **ROUTE KAYDI (boot logu) — ADAY DIST'İNDE ÖLÇÜLDÜ:** `main.ts`, `NestFactory.create(AppModule)` çağrısını
   **logger override'ı OLMADAN** yapar (`useLogger`/`overrideLogger`/`logger:false` YOK) → Nest varsayılan
   `RouterExplorer` günlüğü etkindir. Aday dist'i gerçekten boot edildi ve log şu satırı **birebir** içerdi:
   `[RouterExplorer] Mapped {/api/client-statements/monthly-delivery/run-now, POST} route`
   (**`/api` global öneki dahil**; aynı boot'ta toplam 977 `Mapped {` satırı). Yayın sonrası bu satır aranır.
2. **GÖNDERİM YAPMAYAN YETKİ KONTROLÜ (çalışma zamanı):** **kimliği DOĞRULANMIŞ ama elevated OLMAYAN** bir aktörle
   `POST /api/client-statements/monthly-delivery/run-now` →
   **HTTP 403** + `reasonCode: SCHEDULER_MANUAL_RUN_DENIED_NOT_ELEVATED`.
   Bu kod **yalnız bu ucun kendi yetki kapısından** üretilebilir; kapı `runMonthlyDelivery`'den **ÖNCE** çalışır →
   **hiçbir ekstre üretilmez/gönderilmez, ledger'a yazılmaz** (izole birim testinde "koşu HİÇ çağrılmaz" olarak
   ölçülü). Böylece ucun varlığı **gönderim yapmadan** kanıtlanır.

> Yayım ÖNCESİ aynı çağrı **404** döner ve `i12-live-measure-online` G7'yi **UNMEASURED** yazar (sessiz PASS YOK).

## 9. Kapsam dışı / açık kalem
- **`G7_MANUAL` kalıntı dizini** — ayrı açık kalem; **yayın hazırlığını BLOKE ETMEZ** (aday kanonik ağaçtan
  üretildi ve digest'i doğrulandı). Araç kancasının reddi **aşılmadı**; temizlik owner kararıdır.
- Bu belge **yayın GO'su değildir**; İ12 canlı kabulü de **ayrı** owner GO'suna bağlıdır.
