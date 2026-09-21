# R26 + P1 (OFFICE A3) — ORTAK CANLI GEÇİŞ YÖNERGESİ R01

| alan | değer |
|---|---|
| Yazıcı | Claude oturumu `a8d9121a`. Görev: owner GO "R26 / P1 ORTAK GEÇİŞ SIRASINI KESİNLEŞTİR" (2026-09-22) |
| Durum | **HAZIR — CANLIYA UYGULANMADI.** R26 canlıda değil; P1 canlıda değil; **A3 CLOSED DEĞİL** |
| Yetki | Bu belge canlı yetki **vermez**. Her pencere ayrı owner GO'su ister |
| Sahiplik | R26 paketi ve betikleri: **CLIENT** (#2743). P1 paketi: **Codex** `01a07087` (`HY_P1_A3_codex\P1-delivery`). Bu yönerge ikisini de **değiştirmez**; yalnız ikisini bağlar ve salt okuma bir aşama kapısı ekler |

---

## 1. Bağlanan kimlikler (ölçüldü)

### 1.1 P1 teslimi (owner'ın verdiği pinlerle eşit)

| dosya | sha256 |
|---|---|
| `OWNER-RUNBOOK.md` | `5F07A30A23BF20EDD7F225333F5D3D6A55EE1C2246BBC2C1BE7F1D0B22B81118` |
| `manifest.json` | `17CF1EEB99C5F1873E64DB291B89299B180781D45320ADB7775D9F1FFFDB845E` |
| `R26-HANDOFF.md` | `48E2522819347AEB1F241C13921E75936C0475BA98F8CC8E4AF05282D2C57B7E` |
| `Preflight.ps1` | `116E9E409A11E620B631461372D594E927AB64C9C2E9BCA359281915914BD728` |
| `candidate/start-api.ps1` | `DDCCD09157E0AAF209AB38316A33815A0298FFACBC9006ED62F35F137F86219C` |
| `candidate/hukuk-task-host.exe` | `27099BDF66C83A44B3061D65AE2DAF24EADB523EE4F464179C2F53BB6C78DEAB` |

P1 kaynağı #2681 `ba037026`. Host, R23 kaynağıdır; yalnız `SHA_PAPI` değişti. `SHA_PWEB` = `F39F7A54…` ve `MANIFEST_SHA` = `84E530B1…` (pwsh closure) aynen kaldı.

### 1.2 R26 adayı — #2740/AUTH-01 katılımı

| kalem | değer | nasıl bağlandı |
|---|---|---|
| Aday kaynak | `c7a154b3c0728fee7618ca65e54898ed02cc8b3b` (`origin/release/r26-candidate`) | Tek ebeveyni `47fcf395`, o da `4443600a` (R25B kaynağı) üzerine kurulu |
| #2740 katılımı | `47fcf395..c7a154b3` = 3 dosya (`auth-context.tsx` + 2 spec) | Üç dosyanın blob'u `799a7346` (#2740 merge) ile **birebir**; patch-id ikisinde de `c8269af9b62b97f6` |
| API artefaktı | `A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0` (3867 dosya) | `HY_WT_R26` dist'i bu belgenin tarifiyle yeniden ölçüldü, eşit |
| WEB `.next` | `C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326` (505 dosya; `cache/` ve `trace` hariç) · BUILD_ID `5waeMoFGGMTLAYmn9oJvW` | yeniden ölçüldü, eşit |
| `next.config.js` | `C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C` | yeniden ölçüldü, eşit |

**Geçerli R26 paketi R02'dir** (#2743, head `731475f2`). R01 artık tarihseldir: R01'in yayın ve geri dönüş betikleri yalnız eski API başlatıcı pinini kabul eder, yani P1 sonrasında reddeder. Bu yönerge R01 provasını yeni adayla **eşitlemez**. Kullanılan tek R26 seti R02'dir:

| R02 betiği | sha256 |
|---|---|
| `r26-release.ps1` | `A10EA04A002E85E75C31735089052A8202E3BE3D9FB7BF0A5BE4ACED0AF82F39` |
| `r26-rollback.ps1` | `43C1202F24A6C5CD8BCB3C59B44724E9EADF1E487BC9141875A28E41FF435686` |
| `r26-live-accept-block.ps1` | `4A218FA03425FC52353A1C7F3D4D90D164811E5AAB48A0034B33321215F66E2A` |
| R01 (**KULLANILMAZ**) release / rollback | `F00EA8ED…62DB` / `0539854D…4049` |

### 1.3 Aşama kapısı (bu paket)

| dosya | sha256 |
|---|---|
| `scripts/r26p1-stage-gate.ps1` | `214465BBF85400B73BF7928036B1B3BF79D439249321A2C30C14C976A2155200` |

---

## 2. Sıra — KESİN: R26 → R26 kabulü → P1

Owner'ın ilk değerlendirilecek sırası kabul edildi. Kesinleştirme şartı "geri dönüş uyumu kanıtlanmış olmalı" idi. Bu şart aşağıdaki kanıtlarla sağlandı.

| # | Kanıt | Sonuç |
|---|---|---|
| R-1 | R02 `r26-release.ps1` ve `r26-rollback.ps1` iki üçlüyü tanımlıyor: `P1-ONCESI` ve `P1-SONRASI`. `P1-SONRASI` pinleri P1 `candidateFiles` ile | **birebir eşit** (kaynak) |
| R-2 | R02'nin **kendi** üçlü kodu, **gerçek** dosya baytlarıyla izole koşturuldu: canlı `C:\Ops\hukuk\bin` kopyası ve P1 aday çifti | Her iki betikte canlı → `P1-ONCESI`, P1 çifti → `P1-SONRASI`, yalnız start-api → `TANIMSIZ`, yalnız host → `TANIMSIZ`. **4/4 + 4/4** (`evidence/r02-tuple-real-bytes.log.txt`) |
| R-3 | P1 host mühürü (`gen.cs:392-453`) şunları doğrular: mod, `PROD_SELF`, profil/nesil, mod başlatıcısının pini, `C:\Ops\hukuk\pwsh` ACL'i ve closure'ı (994 dosya) | **Uygulama dosyaları mühür kapsamında değil.** R26'nın dist ve `.next` takası P1 mühürünü etkilemez. Ters yönde de mühür PASS'i uygulama kimliğini kanıtlamaz; bunu aşama kapısı ölçer |
| R-4 | R02 betikleri servisleri görev adıyla durdurup başlatıyor. Süreç tespiti `hukuk-task-host.exe` adı + `api`/`web` argümanıyla yapılıyor | P1 host'u aynı yol, ad ve argümanı kullanır; uyumlu |
| R-5 | P1 geri alması yalnız başlatıcı/host çiftini döndürür; API dist, `.next` ve `next.config.js`'e **asla** dokunmaz (P1 manifest `preserved.rollbackScope`) | R26 kimliği P1 geri almasında korunur |
| R-6 | R02 `r26-rollback.ps1 -SelfTest`: yazma ve yükseltme yok. Yedek kimliğini ve üçlünün tanımlı olduğunu ölçer (kaynak) | Uygulama gününde S1'de **ve** S2'de gerçek yedeklerle koşulur (§4 A5, B7). Böylece geri dönüşün iki durumda da kullanılabilir olduğu canlıda, yazmadan ölçülür |

**Neden P1 → R26 değil:** O sırada R26, P1'in kurulu aday mühürü ve canlı kabulü açıkken yapılırdı. R26 hazır ve mühürlü; P1'in kurulu mühürü ise yalnız canlı kurulumda ölçülebiliyor. Önce kanıtı tam olan değişiklik uygulanır. Her iki sırada da betikler uyumludur (R-1). Sıra seçimi uyumsuzluktan değil, risk sırasından gelir.

---

## 3. Üç durum (+ bir geri dönüş son durumu)

Kapı her durumu **exact** olarak doğrular. R02 betiklerinden farkı şudur: R02 "iki üçlüden herhangi biri" kabul eder; kapı ise aşamaya özgü tek üçlüyü ister.

| | **S0** geçiş öncesi (bugün) | **S1** R26 sonrası / P1 öncesi | **S2** R26 + P1 (son durum) | **S3** P1 kalıcı, R26 geri alındı |
|---|---|---|---|---|
| `start-api.ps1` | `CC634BBF…19B3` | `CC634BBF…19B3` | `DDCCD091…219C` | `DDCCD091…219C` |
| `hukuk-task-host.exe` | `691BC146…1627` | `691BC146…1627` | `27099BDF…DEAB` | `27099BDF…DEAB` |
| `start-web.ps1` | `F39F7A54…59E0` | aynı | aynı | aynı |
| Üçlü adı | `P1-ONCESI` | `P1-ONCESI` | `P1-SONRASI` | `P1-SONRASI` |
| API dist | R25B `1524EDC1…4D4E` | R26 `A8B17A38…53A0` | R26 `A8B17A38…53A0` | R25B `1524EDC1…4D4E` |
| WEB `.next` / BUILD_ID | `F064DC95…82F1` / `dOiGPj2M0Abls0kCibY4r` | `C17E7B13…5326` / `5waeMoFGGMTLAYmn9oJvW` | `C17E7B13…5326` / `5waeMoFG…` | `F064DC95…` / `dOiGPj2M…` |
| `next.config.js` | `4AD4915C…F750` | `C43DEB5A…5B5C` | `C43DEB5A…5B5C` | `4AD4915C…F750` |
| **Değişmeyenler** (tüm durumlar) | `db-readiness.js` `AD18CBB6…13A9` · `pwsh-file-manifest.json` `84E530B1…307A` · `.env` sha `7A7228B1…FDDC` (içerik okunmaz) · görevler `HukukPlatform-API`/`-WEB` **etkin**, eylem `C:\Ops\hukuk\bin\hukuk-task-host.exe api`/`web` · migration yok | | | |
| Geçerli ileri betik | R02 `r26-release.ps1` `A10EA04A` | P1 runbook `5F07A30A` | — | — |
| Geçerli geri betik | — | R26: R02 `r26-rollback.ps1` `43C1202F` (→ S0) | P1: runbook §4 çift geri alma (→ S1). R26: R02 `43C1202F` (→ S3) | P1: runbook §4, **yeni pencerede**; anlık görüntü = S3 kimliği (→ S0) |
| Geri dönülecek uygulama kimliği | — | R25B (B1 yedeği) | P1 geri alınınca uygulama **R26 kalır**; R26 geri alınınca R25B | R25B |
| Kapı komutu | `-Stage S0` | `-Stage S1` | `-Stage S2` | `-Stage S3` |

**P1 sonrasında R26 geri alınacaksa önce P1 geri alması ZORUNLU DEĞİLDİR.** R02 geri dönüşü zaten uyarlanmıştır: `43C1202F` `P1-SONRASI`'nı kabul eder. Sonuç S3 olur; bu, sistemin geçerli ve kapıyla doğrulanan bir son durumudur. R01 geri dönüşü (`0539854D`) bu durumda **reddeder ve kullanılmaz.**

**İkisi de geri alınacaksa bu yönergenin kesin sırası ters sıradır (LIFO): önce P1, sonra R26.**
- LIFO ara durum olarak **S1**'den geçer. S1, Pencere A'da canlıda çalıştı ve kabul edildi (A3–A5).
- Ters sıra ara durum olarak **S3**'ten geçer. S3 canlıda hiç çalışmamıştır.
- İki yol da kapıyla doğrulanan durumlardan geçer ve S0'da biter. Seçim kanıtlanmış ara durumu tercih eder; ters yol "yasak" değil, **seçilmemiştir**. Ters sıra ancak owner'ın ayrı kararıyla uygulanır.
- P1 geri alması her koşumda kendi penceresinin başında **yeni** bir uygulama kimliği görüntüsü alır ve onu korur. Kimliği değiştirmez.

---

## 4. Tek ortak yürütme sırası

**Önkoşul (canlıdan önce, repo):**
1. #2743 (R26 R02) CLIENT tarafından merge edilir; merge SHA'sında main CI SUCCESS olur.
2. Bu paketin PR'ı merge edilir.
3. §1 hash'leri kanonik yolda yeniden doğrulanır:
   - `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\`
   - `…\r26-p1-joint-transition-r01\scripts\`

   R02 merge öncesi değişirse §1.2 pinleri tutmaz ve bu yönerge revize edilir (R02). Pin **elle güncellenmez**.

**Kapı komutu** (her `Kx` satırında `<S>` ve kanıt dosyası değişir; kanıt dosyası yeni ve kullanılmamış bir ad olmalı):
```powershell
& { $ErrorActionPreference='Stop'; $g='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\r26-p1-joint-transition-r01\scripts\r26p1-stage-gate.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $g).Hash -cne '214465BBF85400B73BF7928036B1B3BF79D439249321A2C30C14C976A2155200'){ throw 'ASAMA KAPISI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $g -Stage <S> -ExpectRunning -EvidencePath '<kanit-dizini>\gate-<S>-<adim>.json'; if($global:LASTEXITCODE -ne 0){ throw 'ASAMA KAPISI PASS DEGIL - SONRAKI ADIMA GECILMEZ' } }
```

### Pencere A — R26 (münhasır; owner koşar, CLIENT bağımsız doğrular)

| adım | işlem | kabul | başarısızsa |
|---|---|---|---|
| A0 | Kapı `S0` (normal pencere) | çıkış 0 | **DUR.** Hiçbir şey değişmedi; durum sahibi uzlaştırır |
| A1 | R02 **B0** SelfTest (R02 §4 bloğu) | çıkış 0 | DUR |
| A2 | R02 **B1** yayın (**yükseltilmiş**) | `YAYIN PASS` | R02 otomatik geri alır → kapı `S0`. `ROLLBACK-DOGRULANAMADI`/`-ENGELLENDI` → R02 B3 → kapı `S0` → **DUR**, P1'e geçilmez |
| A3 | Kapı `S1` | çıkış 0 | R02 B3 (B1 kanıtındaki `api.backup`/`web.backup`) → kapı `S0` → DUR |
| A4 | R02 **B2** dar canlı kabul (GO ref yerel) | çıkış 0; kapanış doğrulandı | çıkış 5 → B2-R. B3'e owner karar verir. Aksi halde DUR |
| A5 | R02 B3 **`-SelfTest`**, aynı yedeklerle (normal pencere, yazma yok) | çıkış 0 · `baslatici uclusu=P1-ONCESI` | DUR. Geri dönüş hazırlığı kanıtlanmadan P1 penceresi açılmaz |
| A6 | CLIENT R26 kayıt PR'ı (B1/B2 kanıtı + yedek yolları) | merge + main CI SUCCESS | P1 penceresi açılmaz |

**"R26 kabulü" = A3 + A4 + A5 PASS ve A6 kaydı.** Hizmet kabulü (0/8) ve dış erişim bu sıranın **dışındadır**.

### Pencere B — P1 (ayrı münhasır pencere, A6'dan sonra; owner koşar, Codex P1 yürütücüsü doğrular)

| adım | işlem | kabul | başarısızsa |
|---|---|---|---|
| B0 | Kapı `S1`. P1'in "anlık uygulama kimliği" budur (R26) | çıkış 0 | **DUR**, P1 başlamaz |
| B1 | P1 runbook §0: `pwsh -NoProfile -File .\Preflight.ps1` + `validation\read-only-seal-inputs.ps1` (yeni kanıt dosyası) | `P1_READ_ONLY_PREFLIGHT_PASS` + girdi PASS | DUR, fark uzlaştırılır. **Beklenen değer değiştirilmez** |
| B2 | Runbook §1 yedek (yükseltilmiş pwsh 7) | yedek hash = `liveBaseline` | DUR |
| B3 | Runbook §2 durdurma: WEB sonra API **Disable + Stop**, sessizlik kapısı. Ardından çift kopyalanır, hash'ler `candidateFiles` ile, ACL SDDL yedekle karşılaştırılır | hepsi eşit | Görevler **disabled kalır**; çift yedekten geri yüklenir (§4 runbook) |
| **B4** | **Servisler başlamadan önce:** `hukuk-task-host.exe api --verify-seal` **ve** `web --verify-seal` | **ikisi de çıkış 0** | Görevler disabled kalır → çift geri yüklenir → eski çiftle iki `--verify-seal` = 0 → API sonra WEB enable/start → kapı `S1` → DUR |
| B5 | Enable + start **API**; log READY + tek child. Sonra enable + start **WEB**. Ardından `Preflight.ps1 -Installed` | Preflight PASS | Runbook §4: ikisi disable + stop → sessizlik → çift geri → mühür 0 → API sonra WEB → kapı `S1` |
| B6 | Kapı `S2` | çıkış 0 (R26 kimliği korunmuş, üçlü `P1-SONRASI`, görevler etkin, tek dinleyici) | Runbook §4 → kapı `S1` |
| B7 | R02 B3 **`-SelfTest`**, A5'teki yedeklerle | çıkış 0 · `baslatici uclusu=P1-SONRASI` | P1 geri alınmaz. R26 geri dönüşünün S2'deki hazırlığı kanıtlanamadı → owner'a bildirilir; A3 kabulü **bekler** |
| B8 | P1 canlı kabulü (runbook §3): tek örnek (ikinci başlatmada yeni ağaç yok), `/api/auth/me` 401, web 200, başlangıç süreleri ayrı kaydedilir | owner kabul eder | Runbook §4 → kapı `S1` |

**Durdurma/başlatma sırası iki pencerede de aynıdır: WEB sonra API durur; API sonra WEB başlar.** Pencereler çakışmaz. Pencere içinde başka yazıcı, yeniden başlatma, AUTH-01 işi ya da C123 canlı koşumu olmaz.

### Birleşik son durumda (S2) geri dönüş

| ihtiyaç | sıra | son durum | kapı |
|---|---|---|---|
| Yalnız P1 sorunlu | P1 runbook §4 (çift, mühür 0, API → WEB) | S1 | `S1` |
| Yalnız R26 sorunlu | R02 B3 `-SelfTest` → B3 (yükseltilmiş). P1'e dokunulmaz | S3 | `S3` |
| İkisi de | **Önce P1** runbook §4 → kapı `S1` → **sonra** R02 B3 | S0 | `S1`, sonra `S0` |
| P1 geri alması doğrulanamadı (`ROLLBACK_NOT_VERIFIED`), görevler disabled ya da üçlü yarım | **R26 B3 YASAK** | — | Kapı `G-*`/`U-*` FAIL verir. Escalate; kör yeniden deneme yok |

---

## 5. Bilinen sınırlar (değiştirilmedi; kapı ile karşılandı)

1. **R02 betikleri görevlerin etkin olup olmadığını denetlemiyor** (kaynakta `Disabled`/`Enable` 0 eşleşme). P1 runbook ise görevleri disable ediyor. Yarım kalmış bir P1'den sonra B3 koşulursa dosyalar takas edilir, ama `Start-ScheduledTask` başarısız olur ve servisler kapalı kalır. **Karşılık:** A0/A3/B0/B6 ve her B3 öncesi kapı, görevlerin etkin olmasını ister (SelfTest ST-11). R02 dosyalarına dokunulmadı; aynı dosyada ikinci yazıcı olunmaz.
2. **R02'nin API sağlık bütçesi 120 sn.** DB hazırlığı bozuksa P1 başlatıcısının yeniden deneme bütçesi bu süreyi aşabilir. O zaman S2/S3'te R02 B3 "doğrulanamadı" der; bu fail-closed bir sonuçtur. Karşılık: escalate; yeniden koşum yok. Canlıda DB arızası **üretilmez**.
3. Görev adı R02'de `HukukPlatform-Web`, P1'de `HukukPlatform-WEB`. Görev Zamanlayıcı harf duyarsızdır; kapı da harf duyarsız eşler (ST-01).
4. P1 mühür PASS'i uygulama kimliğini kanıtlamaz (R-3). Kapı PASS'i de P1'in mühür ve closure kontrolünün yerine geçmez; ikisi birlikte gerekir.
5. Kapı yalnız salt okumadır. Çıkış 0 hizmet sağlığı değildir; sağlık R02 B1/B2 ve P1 §3'tedir.

---

## 6. Doğrulama kanıtı (hazırlık; canlıya yazma yok)

| kanıt | sonuç | dosya |
|---|---|---|
| Kapı SelfTest (16 durum; tarif için Node ile bağımsız bilinen cevap) | **PASS 16/16**, WinPS 5.1 ve pwsh 7'de | `evidence/gate-selftest.log.txt` |
| Canlı S0, salt okuma, `-ExpectRunning` | **PASS 16/16**. API 3867 dosya → `1524EDC1`, WEB 505 dosya → `F064DC95`; R26 pinleriyle eşit (bağımsız uygulamanın ikinci bilinen cevabı) | `evidence/live-s0-readonly-20260922.json` |
| Canlı S1/S2/S3, salt okuma | Beklendiği gibi FAIL (10/14, 8/14, 12/14); her biri yalnız o aşamada değişecek kalemlerde düşüyor | `evidence/live-negative-stages-20260922.log.txt` |
| R02 üçlü kodu gerçek baytlarla | 4/4 + 4/4 | `evidence/r02-tuple-real-bytes.log.txt` |

Kanıt dosyası sha256: `gate-selftest.log.txt` `F1DE6E3088917A131F05DDC7B0AFE24D8CA9143E2F6E1DF8E003958A81AD8637` · `live-s0-readonly-20260922.json` `E8CB5E5BB4CDDC08918FE0EB8E9F45DC8EF39AFE3611FF24E886BD4868B5A2BC` · `live-negative-stages-20260922.log.txt` `A221EC57BF2D2DD4093B9D1E21253B29A1CA088B6BC29B5987BF15D69BA9AFF6` · `r02-tuple-real-bytes.log.txt` `6AE452C73E43AB28548930FF32C98C6AD530C7374BB9CB543A9FBCA973A1847B`.

**Yapılmayanlar:**
- P1 testleri tekrarlanmadı; P1 dosyaları değiştirilmedi.
- R02 dosyaları değiştirilmedi.
- Canlı dosya değişimi, servis işlemi, migration ve canlı kabul yok.
- `.env` içeriği okunmadı; yalnız sha256 alındı.
- Kurulu P1 aday mühürü ölçülmedi: yalnız canlı kurulumda ölçülebilir (B4).

---

## 7. Owner'ın tek kararı

**Pencere A (R26) için GO.** Önkoşul: #2743 ve bu paket merge edilmiş, §1 pinleri kanonik yolda eşit.

Pencere B (P1) için **ayrı GO** gerekir ve ancak A6'dan sonra verilir. Herhangi bir kapı PASS vermezse sonraki aşamaya geçilmez.

---

## 8. Ek — tam pinler (§3 tablosundaki kısaltmaların tam hâli; kapı betiğindekilerle aynı)

| kalem | sha256 / değer |
|---|---|
| `start-api.ps1` P1-ONCESI | `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` |
| `start-api.ps1` P1-SONRASI | `DDCCD09157E0AAF209AB38316A33815A0298FFACBC9006ED62F35F137F86219C` |
| `hukuk-task-host.exe` P1-ONCESI | `691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627` |
| `hukuk-task-host.exe` P1-SONRASI | `27099BDF66C83A44B3061D65AE2DAF24EADB523EE4F464179C2F53BB6C78DEAB` |
| `start-web.ps1` (hep) | `F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0` |
| `db-readiness.js` (hep) | `AD18CBB621A2D58FD41B481C07A09D25726C150C2D9DA028C23B60986AD413A9` |
| `pwsh-file-manifest.json` (hep) | `84E530B1A90F5A069C7C87B68B73948F574752650DB607DDFB29A959B9F0307A` |
| API `.env` sha (hep; içerik okunmaz) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` |
| API dist R25B / R26 | `1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E` / `A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0` |
| WEB `.next` R25B / R26 | `F064DC95CBCCA6218E8D5E84A89A6472F03AF54994E425E28A02B135956282F1` / `C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326` |
| BUILD_ID R25B / R26 | `dOiGPj2M0Abls0kCibY4r` / `5waeMoFGGMTLAYmn9oJvW` |
| `next.config.js` R25B / R26 | `4AD4915C0A741AF609CCD241DFE08EF2C76A17E2175E3BD1FB7AE925128EF750` / `C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C` |
