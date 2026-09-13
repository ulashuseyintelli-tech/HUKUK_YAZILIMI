# RELEASE23 + CLIENT İ11 — TEK NİHAİ KARAR PAKETİ (R03)

```text
BELGE       : RELEASE23-TEK-NIHAI-PAKET-R03   (R02 #2659 @ b855f380'in YERİNE GEÇER; R01 #2656 ve #2658 zaten tarihsel)
YETKİ       : owner GO 2026-09-12 "DEVAM — ÖNCEDEN YETKİLENDİRİLMİŞ ADAY HAZIRLIĞINI TAMAMLA"
              (aday derlemesi + geri dönüş paketi; canlı cutover/restart/yapılandırma değişikliği YOK)
              owner GO 2026-09-13 "RELEASE23 R02 / SON DAR KOMUT DÜZELTMESİ" (OFFICE 33'e doğrudan; madde 1 yazıcısı CLIENT — owner kararı)
              owner GO 2026-09-13 "R02'nin kalan kurtarma kanıtı ve güven sınırı" madde 3 (ana yürütücü dağıtımıyla; CLIENT ve ana
              yürütücü owner'dan ayrıca teyit aldı)
TARAFLAR    : OFFICE 33 — C33/D1 (derleme · Katman 1 · R28 · bu belge ve GO taslağı)
              CLIENT    — İ11 (bağlama + aday doğrulaması #2654 R04 · D3 düzeltmeleri R05 #2657 · R06 #2660 · R07 #2662 ·
                          R-T4a kesin kimlik #2666 @ dd42586c R09 · prova enjeksiyonu #2668 @ 0e6754b5 R10; R08 #2665 KAPATILDI)
              ana yürütücü — hat koordinasyonu; R28 bağımsız doğrulayıcısı (owner GO 2026-09-13; #2661 · Ek A #2663 · Ek B #2664)
DURUM       : ADAY DERLENDİ · İ11 ADAY İKİLİSİNDE DOĞRULANDI · D1 HAZIR · D3 KESİN HEDEFLİ KAPANIŞ + ÇIKIŞ KODU AKTARIMI +
              KAPANIŞ ÖLÇÜTÜ BAĞLANDI · TEK KOŞULLU GO TASLAĞI OWNER KARARINA SUNULUR (§7)
YAPILMADI   : ratifikasyon · owner preflight (yükseltilmiş) · -Live · onaylı kimlik (K-KİMLİK) · mühür/authority/nonce ·
              cutover · D3-P izole R-T4 provası (owner, yükseltilmiş) · D3-0 yakalayıcı · T-pencere · İ11 canlı koşumu
CANLI       : RELEASE22 — API :8080 PID 46332 · Web :3002 PID 47004 (kök HY_W4_RELEASE22) · bin = R22 preimage ·
              RELEASE23 .env YOK · I11-WINDOW-BLOCK-* kuralı 0 (615 kural içinde) · HYRT4S-* 0 · :2526 dinleyici 0 · i11live YOK
              (2026-09-13T12:16:56Z salt-okuma ölçüldü; DEĞİŞMEDİ)
YETKİ SINIRI: bu belge canlı yürütme yetkisi DEĞİLDİR; §7 yalnız owner kararına sunulan taslaktır.
              Tarih/ref/runId/SDDL yer tutucularını doldurmak ONAY DEĞİLDİR. K-KİMLİK 3e digest'i hazır ve §7 madde 4 koşulu
              sağlanmadan kimlik onayı verilmiş SAYILMAZ.
KAYIT       : CLIENT sayaç 10/17 · hizmet kabulü 0/8 tam
```

Ayrıntılı paket kaydı: `RELEASE23-R28-CUTOVER-PAKETI-R01.md` (diskteki
`HY_C33_RELEASE23_CUTOVER_R28\docs\LIVE-APPROVAL-PACKAGE-R28.md` ile bayt-aynı; sha256 §1.3). CLIENT kayıtları:
`client-live-acceptance-i11-r01/I11-ADAY-BAGLAMA-VE-DOGRULAMA-R04.md`, `I11-D3-ENGELLEYICI-DUZELTMELER-R05.md`, `I11-D3-KPAR-KALINTI-R06.md`,
`I11-D3-BUTUNLUK-VE-PS51-R07.md`, `I11-D3-RT4-KESIN-KIMLIK-R09.md`. Ana yürütücü: `RELEASE23-R28-BAGIMSIZ-DOGRULAMA-R01.md` (Ek A, Ek B).
Bu belge **canlı karar için gereken her komutu ve tam hash'i tek yerde toplar**; D1 PowerShell blokları R28 kaydından programatik
olarak alınmıştır (bayt-aynı, R02 ile değişmedi).

## 0. R02'den farklar (R03)

| # | Talimat | R03'teki karşılığı | Doğrulama |
|---|---|---|---|
| M-1 | SON DAR KOMUT madde 1 — R-T4a yalnız bu pencerenin iki kuralının kesin kimliği; joker toplu silme yok; sorgu/erişim hatası ≠ doğrulanmış yokluk; tekrar kapanışta zaten kaldırılmış hedef güvenle geçilir; başka kurala dokunulmaz; R-T4b ve sonraki adımlar her durumda denenir | CLIENT **R09 #2666 @ `dd42586c`**: T-AÇ **K-T0** pencereye özel iki kesin adı korumalı `FW-RULES.txt`'e kurallardan ÖNCE yazar, K-T6 yalnız bu adlarla `New-NetFirewallRule -Name` + özellik doğrulaması yapar; T-KAPA R-T4a `Invoke-WindowRecoveryRT4` kaydı güven denetiminden geçirir, her adı `-NamePattern` + ad/port eşleşmesi + tekrar denetimiyle doğrular, adı `-Name … -ErrorAction Stop` ile sorgular (yalnız `ObjectNotFound` = zaten yok; başka hata BAŞARISIZ), özellik uyuşmazsa DOKUNMAZ, kaldırır ve yeniden sorgular; bir adın hatası diğerini ve R-T4b'yi atlatmaz. §1.5 · §4 D3 · §5.1 | OFFICE 33 merge öncesi bağımsız inceleme: prova betiğinde 4 kusur (S6/S5 beklentisi, S5 enjeksiyonunun sayımda fırlatması — gerçek NetSecurity ile ölçüldü, S2b Web durdurma, owner komutunda çıkış aktarımı) + üretimde 3 kusur (kayıt geç yazılıyor, kayıt satırı denetimi yok, yerel saat `Z`) + düzeltme yan etkisi (koşulsuz `Remove-Item Function:\` gerçek NetSecurity fonksiyonunu hedefliyordu — ön koşul ölçüldü) → CLIENT hepsini kapattı (kaynakta okundu). Merge SHA'sında hash'ler OFFICE 33 **ve** ana yürütücü tarafından bağımsız ölçüldü (birebir). **R10 #2668 @ `0e6754b5`:** prova S2a/S5 enjeksiyonu gerçek cmdlet'i `NetSecurity\…` modül-nitelikli çağırır. İki bağımsız sahte-cmdlet yoklaması `& $FunctionInfo` deseninde yığın taşması gördü; OFFICE 33'ün **gerçek NetSecurity** ile yükseltmesiz salt-okuma ölçümünde aynı desen özyinelemedi (Get). R10 belirsizliği deterministik kapattı; merge ağacı incelenen head `3e079aff` ile aynı, T-AÇ/T-KAPA değişmedi |
| M-2 | SON DAR KOMUT madde 2 — D3-4 çocuk `pwsh` çıkış kodu hemen kaydedilir, ≠0 ise dış blok `throw`; kabul adımlarına geçilmez; kurtarma sırası korunur; §5.2 eski `Set-Content` ifadesi düzeltilir | D3-1 ve D3-4: `$global:LASTEXITCODE=-999` → `& <pwsh mutlak yol> -File` → `$rc=$global:LASTEXITCODE` → `$rc -ne 0` ise `throw` (D3-4 iletisi D3-5 ve kabulü yasaklar). §5.2 bayt düzeyinde yazımı (`[IO.File]::WriteAllBytes`) anlatır | R03'teki blok metinleri belgeden çıkarılıp sahte çocuk betikle pwsh 7 + WinPS 5.1 dış kabukta koşuldu: çıkış 0 geçer · çıkış 3 fırlatır · çocukta `throw` fırlatır · `pwsh` bulunamaz fırlatır (bayat değer taşınmaz) · runId yer tutucusu durur (§4 D3 sınama tablosu) |
| M-3 | SON DAR KOMUT madde 3 — kapanış ölçütü açık; CLIENT D3 çıktıları + yerel kanıt manifestini kapanış kaydına bağlar; CI/merge/main senkronu/temizlik sonrası 11/17 | **§5.4** K1–K4 (tam İ11 PASS · bağlantı/kullanıcı kapanışı · T-KAPA pozitif kanıt + çıkış 0 · D3-5 PASS) + kabul kaydı; **D3-5 artık koşulabilir salt-okuma bloğudur** | D3-5 bloğu belgeden çıkarılıp yalnız yollar/pin/taban/beklenen kök değiştirilerek iki kabukta PASS, yer tutucu ve iki FAIL dalında koşuldu (§4 D3 sınama tablosu) |
| M-4 | Kalan kurtarma kanıtı ve güven sınırı madde 3 — sonuçları R02 metnine bağla; betik değişirse pinleri yenile; tam hash; §5.3 elle kurtarma kapsamı; tarih/ref doldurmak onay sayılmaz | §1.5 / §4 / §7 tam hash (§7'de kısaltma yok) · §5.2 Ek B güven sınırı tablosu · §5.3 kapsam (geri aldıkları / almadıkları) · başlık YETKİ SINIRI · §7 madde 6a(ii) Ek B somut içeriği · D3-P izole prova (madde 1 sonucu; owner koşumu henüz YOK) | ana yürütücü Ek B #2664 @ `1334d2fe` ölçümleri; R28 belgesi §11 notu R09 hash'lerine güncellendi → `PACKAGE-IDENTITY.json` yeniden üretildi (§1.3) |
| M-5 | Ana yürütücü notları (#2666 doğrulaması) | D3-5 salt-okuma `I11-WINDOW-BLOCK-*` sayımı KORUNDU (kayıttaki adlar değiştirilirse R-T4a "zaten yok" diyerek hatasız biter; gerçek engeli bu sayım yakalar) · D3-1 yönlendirmesi birebir K-T0 kapanış satırına bağlandı (`K-T0a:` da "K-T0" ile başlar) · D3-P senaryo listesi gerçek betikle aynı (biçim bozuk/ad deseni/port uyuşmazlığı yalnız bellek-içi harness'ta) · §2.3 kapsam satırları | kaynaktan okundu |

## 0.1 R02'de kapananlar (tarihsel özet; hash'leri §1.5 GEÇERSİZ listesindedir)

**D3 engelleyicileri ve iki takip bulgusu kapandı.** R01 §0'daki kusurlar (#2658) ve sonraki bulgular CLIENT tarafından üç adımda düzeltildi:
**R05** #2657 @ `88b3d07a` · **R06** #2660 @ `af79b50c` · **R07** #2662 @ `59abb70b`. Hepsi yalnız oturuma özel ortamda, aday ikilisinde
yeniden kanıtlandı. OFFICE 33 her birini **main'de kaynaktan okudu ve dosya sha'larını ölçtü**:

| # | Düzeltme | OFFICE 33 bağımsız doğrulaması | CLIENT yeniden kanıtı |
|---|---|---|---|
| E-1 (R05→R06) | §9 K-PAR deseni `smtp-sink` → `smtp-sink\.js` → **`smtp-sink\.js\b`**; `smtp-sink-noauth.js` ve kayıt `smtp-sink.jsonl` dışlanır | fark okundu; **§9 gömülü blok sha'sı yeniden hesaplandı**: R05 `9804FEF6…`, **R06 `27E754A7…`** (LF, sonda LF) | R06 gerçek süreçlerle: noauth **0** · log yolu taşıyan PS sarmalayıcı **0** · `Get-Content -Wait` izleyici **0** · eski AUTH **3** (PS 5.1 + PS 7) |
| E-2 (R05) | T-KAPA'da her adım kendi `try/catch`'inde; R-T4a (engel kaldır) · R-T4b (Web) · R-T5 · R-T6 · R-T7 **her durumda**; hatalar **sonda** fırlatılır | `t-window-close.ps1` okundu (R07'de mantık korunuyor) | hata yolu provası: R-T2/R-T3 düştü, **R-T5 yine koştu**, sonda throw; kurtarma idempotent |
| E-3 (R05) | T-AÇ ve T-KAPA canlı modda **K-ELEV** ilk kapı | kaynak okundu | yükseltilmemiş oturumda iki blok ilk değiştirici komuttan önce DURDU |
| E-6 (R07) | **Yedek bütünlüğü:** zorunlu **`T_ENV_PRE_SHA`** pini (T-AÇ K-T0a env sha = pin değilse, yedek dizini zaten varsa veya yakalayıcı kaydı yoksa **hiçbir değişiklik yapmadan** durur) · yedek dizini **pencere başına yeni**, **kopyadan ÖNCE** korumalı DACL · yedek, SDDL tabanı, taban dosyası ve yakalayıcı kaydı yalnız SYSTEM + Administrators + yürütücü · T-KAPA bunları kullanmadan önce sahip + DACL + reparse denetler; yedek **yalnız güvenilir ve sha = pin ise** geri yazılır, aksi hâlde geri yazmaz ama R-T4/R-T5 yine koşar | main'de sha ölçüldü; `t-window-apply.ps1` K-T0a/`Set-TrustedAcl`/`Get-TrustProblem` ve `t-window-close.ps1` R-T1/R-T3 kaynakta okundu | sınama 1–9 (yanlış pin · yabancı kural · yedeğe bayt ekleme · pin'siz · idempotent · yerleştirilmiş dizin) hepsi beklenen davranış |
| E-7 (R07) | **Windows PowerShell 5.1 env bozulması:** `Get-Content`/`Set-Content` yerine bayt düzeyinde değişim (katı UTF-8, satır sonları ve BOM durumu korunur, `WriteAllBytes`); iki betik **yalnız ASCII** | main'de iki betik: ASCII dışı bayt **0**, CR **0**, ayrıştırma **0** | tam pencere döngüsü **A** (WinPS 5.1, runId `51d2dcc4`) ve **B** (pwsh 7.6.5, runId `95ee9ad2`): T-AÇ çıkış 0 · İ11 **PASS 11/0/0** · T-KAPA çıkış 0 · ASCII dışı değer bayt bayt korundu |
| E-9 (R07) | `Set-Acl` zaten korumalı hedefte düşüyordu → `Set-TrustedAcl` idempotent + `icacls /inheritance:r /grant:r` (SID ile) | kaynak okundu | iki kabukta: yeni/tekrar/kopya/kalıtsal/korumalıya tekrar/yabancı kural yakalandı |

**OFFICE 33 kalıntı bulgusu (R05 deseni `smtp-sink.jsonl` alt dizgisini de eşleştiriyordu) — ölçüldü, R06 ile KAPANDI.** D3-0'daki K-PAR
ön-kontrolü §9 desenini birebir kullanır ve D3 süresince belirteç taşıyan başka süreç kalmadığını ayrıca teyit eder.

**Kayıt — R02 ara sürümündeki hatam:** R02 @ `11a953da` D3-0'ı `i11live`'ı önceden korumalı kuruyor ve D3-4 sarmalayıcısı yedek sha'sı
tutmazsa T-KAPA'yı hiç koşturmuyordu. R07'de T-AÇ K-T0a önceden var olan yedek dizininde **tasarım gereği durur** (yerleştirilmiş dizine karşı
koruma) — ön-kurulum canlıda pencereyi açtırmazdı; sarmalayıcı ise T-KAPA'nın erişimi her durumda geri açma adımlarını da engellerdi. İkisi
de **kaldırıldı**; yedek bütünlüğü CLIENT betiğinin içindedir. D3-0 artık `i11live`'ın **olmadığını** salt-okuma denetler.

**Ana yürütücü bağımsız doğrulaması (#2661, owner GO 2026-09-13 ile doğrudan atandı):** §1.1–§1.4 **44/45 EŞİT** (tek fark beklenen:
RELEASE22 kökünde manifest dışı `project/apps/api/.env`, sha'sı ayrıca pinli ve eşit) · §1.5 **12/12 EŞİT** (R06 durumunda) · K-PAR R06
11/11 · K-ELEV ilk değişiklikten önce · **K-KİMLİK BEKLEMEDE** (3e girdisi yok; OR-03a canlı GO içinde hesaplanır). Bulgularının karşılığı:

| # | Bulgu (#2661) | R02'deki karşılığı |
|---|---|---|
| 1 | `ENV-PREIMAGE.env` kalıtsal ACL ile doğar · üst dizin korumasız · T-KAPA yedek sha'sını denetlemez · taban/kanıt dosyaları zayıf ACL'de | **CLIENT R07 (E-6)** betik içinde çözdü; §1.5 yeni hash'ler; D3-1/D3-4 `T_ENV_PRE_SHA` ile çağrılır |
| 2 | Rol/ölçüm ifadeleri eskimiş | başlık, bu bölüm, §7 madde 2 ve §8 güncellendi |
| 3 | T betikleri PS 7'de prova, R02 5.1 çağırıyordu | R07 (E-7) iki kabukta da doğru; D3 penceresi **yükseltilmiş `pwsh` 7** (döngü B), karışık zincir yok |
| 4a | D3 sırasında kanonik ağaç değişirse T-KAPA sha'sı tutmaz | **dondurma kuralı** (§4 D3) + §5.1 satırı |
| 4b | K-T0 öncesi düşüşte D3-4 API'yi gereksiz yeniden başlatır | **D3-S** (yalnız yakalayıcıyı durdur) + §5.1 satırı |

**Diğer farklar:** main ≠ aday (#2655 B11 @ `78f49dd3`, RELEASE23'te yok) · D3 yürütücüsü yükseltilmiş pencere, owner sağlar.

## 1. Kesin kimlikler (tam değer)

Karar için bağlayıcı her hash bu bölümde ve §7'de **tam** yazılıdır. Kanıt tablolarındaki kısaltılmış (`…`) değerler yalnız buradaki tam
değere atıftır. Hiçbir kapı kısaltmayla çalışmaz; bloklar tam değer taşır.

### 1.1 Aday — sabit kaynak

| | Değer |
|---|---|
| **Sabit kaynak** | `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` (#2646 squash; origin/main atası) — hareketli main KULLANILMADI |
| Kapsam | **#2641** `b9fd97a1` · **#2643** `d199c8dc` · **#2645** `e65ff5de` — üçü de adayın atası (ölçüldü) |
| Fark `13740670..2740df3d` | 33 commit · **ürün farkı 7 dosya** (`party-write-tx.ts`, `case`/`client`/`debtor`/`lawyer.service.ts`, `error-log.sanitize.ts`, `office-write-role.policy.ts`) · migration/şema/lock/`package.json`/web/`packages` **0** |
| **Aday kökü** | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23` — detached worktree, HEAD = kaynak, kirli 0, `.env` YOK |
| **Web BUILD_ID** | `dOiGPj2M0Abls0kCibY4r` |
| API giriş `main.js` | `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` (RELEASE22 ile aynı — derlemeyi AYIRT ETMEZ) |
| main ≠ aday (§0) | #2655 B11 @ `78f49dd3` (`lawyer.service.ts`) adaydan SONRA main'de; RELEASE23'te YOK |

### 1.2 Derleme manifesti — Katman 1 `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CANDIDATE`

| | sha256 |
|---|---|
| Aday makbuzu `RELEASE23-CANDIDATE-RECEIPT.json` | `6BF43693D45C1245693381BCAC448DCA20522E57A6F461BB1476A1EC66D1E6D3` |
| **Manifest** `RELEASE23-PAYLOAD-MANIFEST.json` (= manifestDigest) | `E53618ED81FF02B43CB03B26656275B860D1C9B399C7D561A75BE0CA17F61AD5` |
| candidateDigest | `EF8ED2AC844CB0CB943499C97266FD740677B9D17D6783867E248C02328D6846` |
| packageDigest (50 dosya) | `176500F105359543B8E8092F4CB65CBB5C4ED7987F8ABA2381FD7FABA39C1F59` |
| Sıralı defter `RELEASE23-PAYLOAD.ordinal.tsv` | `52075981B6315B34CB7A51271990908A6A7A570354398C6AA1C86E7ED869EC46` |
| R09 bağlama profili | `80A835B04BB2DC6F3AEB51ECC1ED1237EA208C4C4E867B0630183B739D86E198` · profil `PRF-1c343861-7177-4799-be95-0c1fb72dd212` |

### 1.3 Cutover paketi — R28 `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28` (MÜHÜRSÜZ)

| | sha256 |
|---|---|
| Paket kimliği literali | `HY_C33_RELEASE23_CUTOVER_R28` (motor P-04 · OWNER-COMMAND · verifier V-03/V-04d) |
| Motor `engine\Invoke-C33Cutover.ps1` | `2AE770435B769A21CFF495BF2224A3385EE27A3DD2E5E6E538D6BB3218DFA927` |
| Owner preflight `tools\Invoke-OwnerPreflight.ps1` | `0E74F687BEAF55432879BE1E10D40DFB55A223CCED6119E6CC804AC1332E420C` |
| `qualification\Test-RealPrimitives.ps1` | `5DCD12B31D2457DA5B8219E7A004426D0A7C1DB932DA754196B6A8D5E74179D2` |
| `tools\Seal-Package.ps1` | `650971A51F2CF592DA621EEAA92A2883F1580BB2A06A10573BC4ADB4B6DD588B` |
| `qualification\Verify-Package.node.js` | `1260E1FF42CF9C3442D2C3005ACF821C7B81646ECC181878359AB9546883EABD` |
| Şablon OWNER-COMMAND / OWNER-RUN | `894BB522AC26A36E5518CC831AB30F03623C30CC300BE30D44A25D80FD0A3D2D` / `A24C04FD573EDC46C79463DED5586EDD6E8ECABEFC6B15716C83FE4E0E13842D` |
| `docs\LIVE-APPROVAL-PACKAGE-R28.md` (= repo `RELEASE23-R28-CUTOVER-PAKETI-R01.md`, bayt-aynı) | `8A718CC8B2B08E6A81299D664C900846E3B999E1B60EA8827DA635AF34008103` — R03'te yalnız §11 notu R09 T hash'lerine güncellendi |
| `PACKAGE-IDENTITY.json` (bilgi; OP-01 `engineSha256` taşır) | `4A7B52DC2A824519120DA70BF2BBDBF5BEBA7C5535319CD988465F65E003CA0D` — `fork\produce-package-identity-r28.js --replace` ile yeniden üretildi (`supersedes` = önceki `EFD0EF2553ECB5DA285B13F950A26746A153A10DFAAB0FE349AFD715FFF8A1E5`); 50 dosya, diskle 50/50 eşit, `sealed=false`, `approvedIdentity=null`, motor değişmedi; `preLiveListDigest` `AAFE29316103817569C4FB9AFC868CF0C900CBC3AFEA2DC33B41D3BA5005902B` **ONAY ADAYI DEĞİL** |

Durum (ölçüldü): `pins/`, `authority/`, `claims/`, `journal/`, `cutover-receipts/`, `preflight/`, `MANIFEST.json`,
kök `OWNER-RUN`/`OWNER-COMMAND` **YOK**. R27 tüketildi, yeniden mühürlenemez.

### 1.4 Geri dönüş kimlikleri — RELEASE22 (şu an CANLI)

| | Değer |
|---|---|
| Kök / kaynak | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22` @ `137406701248858221d12be94a941f8837a2a245` · BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` |
| Manifest | `26B31B6976BFB596D399F31EA2688BF79D67FEFF991838E8D3B528E14A911869` — kök TAM yeniden hash **88.178/88.178 eşit**; diskte olup manifestte olmayan yalnız `project/apps/api/.env` (P-040 beklenen istisna; sha aşağıda pinli) |
| `.env` (H-01 kaynağı; içerik okunmadı) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` |
| bin preimage (= canlı; `generations\R22`) | host `E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` · api `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` · web `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` |
| bin postimage (ileri; `generations\R23`) | host `691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627` · api `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` · web `F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0` |

### 1.5 CLIENT İ11 — adaya bağlanmış kimlikler (main @ `0e6754b5` = #2666 R09 + #2667 + #2668 R10; dosya sha'ları OFFICE 33 ve ana yürütücü tarafından bağımsız ölçüldü)

| | sha256 |
|---|---|
| **İ11 §9 kabul bloğu** (R06; R23'e bağlı) | `27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700` — `CLIENT-LIVE-ACCEPTANCE-I11-R01.md` §9 gömülü bloktan OFFICE 33 yeniden hesapladı (LF, sonda LF); belge `59abb70b..0e6754b5` arasında değişmedi |
| **T-PENCERE-AÇ** `scripts\t-window-apply.ps1` (R09) | `834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC` |
| **T-PENCERE-KAPA** `scripts\t-window-close.ps1` (R09) | `676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF` |
| **D3-P izole R-T4 provası** `scripts\t-rt4-isolated-rehearsal.ps1` (R10; canlı DIŞI, yükseltilmiş) | `B643DF51D71BC4012453CCF746CD0ECC4550897701E54346D3DBF9718FBF5803` — enjeksiyon modül-nitelikli (`NetSecurity\…`); içinde T-KAPA pini `676C1542…` + fonksiyon AST özdeşliği + canlı çağrı satırı denetimi |
| Mantık harness'ı `scripts\t-rt4-logic-harness.ps1` (R09; bellek-içi, kanıt aracı) | `998A127B0B59CFB1ACFE1D2D5BD5EDB83AFA749EAC750EC81BEC049DDFD4C731` |
| **`T_ENV_PRE_SHA` pini** (T-AÇ ve T-KAPA'ya AYNI değer) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` — cutover H-01 RELEASE23 `.env`'i RELEASE22 baytlarıyla kurar (§1.4); D1-5 `env sha=` satırı bu değere eşit olmalıdır |
| **Kural adı deseni** (T-AÇ K-T0 üretir · T-KAPA R-T4a `-NamePattern` · D3-5 denetler) | `^I11-WINDOW-BLOCK-(8080\|3002)-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$` — UTC zaman + 8 hex; kayıt `…\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live\FW-RULES.txt` (satır: `<port> <ad>`) |
| GEÇERSİZ — **kullanılmaz** | R07: T-AÇ `ED64A751F75B0F0C3B1406759E92C2F20DAF29018CC893A5EB387391C822BBCF` · T-KAPA `3F027B0DA7AA65F5F8C7A016F1EAD605706C2A4BDA2E703D4A6D4A199DA8BB2C` · R08 T-KAPA `88BCEA01A2A956F4E0AB5976E670162014860FF98E4E68177D4951718E3AB9D7` · R09 ara head'ler: T-AÇ `B13114CAF66D7DC27B0A8C0AF7294E0ED92770CCD474DFCFBDD72D491B55736F` · T-KAPA `A81544B8DEEFC9DA4B4271E5FEB3E8AB675469B5A2FB4030426FD7C4AE680EE0` · prova `CB4D89D9405EFAEB79818AAF68E3DF96ABB87E1FD8A48D00BC82CF80533FBCFE` / `41356908278E05263B11D4F6D4DC655BFFF90F0105DF978219EFD81ED2681C32` / `B058D35B98A7676C2DB9D729FB1CE521732F24587B8A36DFB6B8C7A88F845D98` · R09 merge prova `2BB3D3E9F7414C234C8318DC4E387DB6F9612FDDC54F927EA908D5C54FF55E2C` · daha eski (tanıma amaçlı kısa): R04 §9 `A16E4791…` T-AÇ `508C5323…` T-KAPA `5895CFC7…` · R05 §9 `9804FEF6…` · R05/R06 T-AÇ `CA99E69E…` T-KAPA `0A80982B…` · R07 ara T-AÇ `5AB1AF16…` |
| `i11-run.js` · `i11-01-setup.js` · `i11-02-intake.js` | `27821B463D2DDA5E1F180A79A677CEA13B2EAD15840D95F8218012A0E2632F4B` · `1317D727F08C81108D027C41B9B0DF9EF8E6B5C0C99979F76AEF30E3CA427DC4` · `7D8D492BC6CE4A2E2CD3CB77EEACAC01594D1DDD9D17F9F767D0625DDB251789` |
| Kurtarma `i11-03-close-links.js` · `cl-09-close-access.js` | `87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740` · `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` |
| `smtp-sink-noauth.js` | `99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800` |
| Bağlayıcı `i11-bind-candidate.ps1` · V-B `i11-vb-compiled-redaction.js` | `B1C24402E7999B89AF0A4A26E93DF9B2EAADEC7CB0609A7E7B871B0AADDFBD49` · `5E0E05384CD422A85E9FD35530A88A141798FAED968E94EC8667AB7AD5AC7ABA` |
| Bağlama kaydı `I11-CANDIDATE-BINDING.json` (CLIENT yerel kanıt) | `FCD57F04E58767ED43F85152222C1A95C5B8423C54500F432D53D580FFA157EA` |

## 2. Aday üzerinde kabul sonucu — iki taraf

### 2.1 OFFICE / C33 (derlenmiş aday ve paket)

| Kanıt | Sonuç |
|---|---|
| Derleme (RELEASE22 yordamı) | worktree add · `pnpm install --frozen-lockfile` (8.15.0) · `db:generate` · `build` — dördü exit 0 (4/27/7/69 s); turbo cache miss 3/3; `node_modules` yerel (junction yok) |
| API `dist` farkı | 16 değişen + 3 yeni (`common/party-write-tx`), silinen 0; kapsam dışı derleme farkı 0; web rota yüzeyi birebir (55/55 · 42/42) |
| Derlenmiş işaretler (satır) | `redactSecretPathSegments` 3 · `party-write-tx` 1/1/1/1 · `createPartyWriteTxContext` 2 · korunan `pureNoOpDetected` 3 · `OFFICE_WRITE_DENIED_VIEWER` 3 · `assertGenericDecisionAllowed` 5 · `LAWYER_REACTIVATE` 1 |
| Katman 1 zinciri | **11/11 exit 0** — Node 38/38 · PS 28/28 · ADIM2 39/39 · yazıcı 5/sınıflandırılamayan 0 · ADIM4 22/22 · env anahtarı RELEASE22 ile birebir · R09 37/37 (+B-072b NOT_EXECUTED) |
| R28 kalifikasyonu (motor `2AE77043…`) | NC **91/91** · gerçek primitif (yerel) **21/21** · preflight giriş yolu **12/12** / fikstür **14/14** · C36 bağlama **29/29** · OC şablonu **16/16** · verifier mühürsüz **FAIL 0** (NOT_EXECUTED 15) |
| Mühür S-06 / S-08c canlı salt-okuma | **10/10** beklenenle uyumlu (R28 mühürlenebilir; R27 mühürlenemez) |
| **Owner preflight PROVASI** (kopya; yalnız OP-00 ön-koşul yamalı; yükseltilmemiş) | **PASS 28 · FAIL 2 · NOT_MEASURED 3** — düşenlerin tamamı yükseltme kaynaklı (OP-00, OP-05c, OP-08a/09d/09e). R28'e özgü engel YOK. Kanıt `HY_C33_RELEASE23_CUTOVER_R28.PREFLIGHT-PROVA-R01\prova-preflight.json` `CE2A161ABFEA9BDEE36143814E405DA51F265CAE8089CEB205A60C1320FEED1C` |
| Geri dönüş kökü | 88.178/88.178 eşit; nesil kopyası canlı bin ile bayt-eşit |
| **D2 SONRASI aday kökü** (bağımsız, OFFICE) | Katman 1 Node doğrulayıcısı manifest `E53618ED…`'e karşı **38/38** — EXACT-SET iki yönde PASS, yeniden hash 83.437 / uyuşmaz 0; **CLIENT aday köküne yazmadı** |

### 2.2 CLIENT / İ11 (aday ikilisinde; yalnız oturuma özel DB + Redis + yerel yakalayıcı)

| Kanıt | Sonuç |
|---|---|
| Bağlama B-0..B-5 (R04) | HEAD · BUILD_ID · manifest · ürün farkı 7 · `redactSecretPathSegments` MEVCUT · İ11'in 12 ürün hash'i RELEASE22 ile aynı — **hepsi eşit** |
| **V-B** derlenmiş B-I11-3 (R04) | **PASS** — 503, ErrorLog 1 satır, ham token 0 (kanıt `7121CB3A5101692EC13057C5D54FD1AC734E5759C96C7280F8D782D3236DE951`); RELEASE22 negatif kontrol FAIL |
| **V-A** birleşik dizi (R04, runId `64245dc2`) | **PASS 11 · FAIL 0 · ÖLÇÜLEMEYEN 0**; taşıma gövdesi A-5 token yok / A-6 token yalnız sağlayıcı metninde (kanıt `C7E7B8E859003EDF4B42C8BF0DD125640B0B78F7329614F7D1305B3D93F1895F`) |
| V-A tekrarı R05 blokları (runId `51c11954`; tarihsel — bloklar R07 ile değişti) | İ11 **PASS 11/0/0**; T-KAPA hata yolu (R-T5 yine koştu, sonda throw) + kurtarma (idempotent) |
| K-PAR sondası (R05 → R06) | R05: noauth **0** · eski AUTH **4** · **R06** gerçek süreçlerle (PS 5.1 + PS 7): noauth **0** · log yolu taşıyan sarmalayıcı **0** · izleyici **0** · eski AUTH **3** |
| K-ELEV izole sınama (R05) | yükseltilmemiş oturumda T-AÇ ve T-KAPA ilk değiştirici komuttan önce DURDU |
| **R07 sınamaları 1–9** (WinPS 5.1 `-File`) | yanlış pin → K-T0a durdu, değişiklik 0 · yedeğe/kayda yabancı kural → R-T1 "güvenilir DEĞİL, GERİ YAZILMADI", R-T4/R-T5 yine koştu, sonda throw · yedeğe bayt eklendi → "pinli değere EŞİT DEĞİL, GERİ YAZILMADI" · özgün bayt geri → kurtarma çıkış 0 · pin'siz T-KAPA → T-PIN durdu · idempotent tekrar çıkış 0 · yerleştirilmiş yedek dizini → K-T0a durdu |
| R07 tam pencere döngüleri (tarihsel — bloklar R09 ile değişti) | A — WinPS 5.1: T-AÇ 0 · İ11 runId `51d2dcc4` PASS 11/0/0 · T-KAPA 0 · B — pwsh 7.6.5: T-AÇ 0 · İ11 runId `95ee9ad2` PASS 11/0/0 · T-KAPA 0; yalnız `SMTP_HOST`/`SMTP_PORT` değişti, ASCII dışı değer ve CRLF/BOM durumu bayt bayt korundu |
| **R09 R-T4a/R-T4b mantığı** (bellek-içi harness `998A127B…`; üretim fonksiyonu T-KAPA'dan AST ile alınır) | **PASS 11/11**, PS 7.6.5 + PS 5.1.26100: S1 başarı · S2a kısmi hata (diğer ad kaldırıldı) · S3a tekrar (zaten yok) · S4 idempotent · S2b R-T4b hata · S5 sorgu/erişim hatası ≠ yokluk · S6 özellik uyuşmaz (dokunulmadı) · S7 kayıt yok/güvenilmez (joker yedeği yok) · S8 kayıt biçimi bozuk · S9 ad deseni geçersiz · S10 addaki port ≠ kayıt portu; her senaryoda `-DisplayName` sorgusu yasak, dokunulmama tanıkları değişmedi (CLIENT R09 §3) |
| **R09 tam pencere döngüleri** (nihai bloklar `834DF587…` / `676C1542…`; R-T4a/R-T4b ve K-T6 kural oluşturma `live`-özel olduğundan provada koşmaz) | **WinPS 5.1:** T-AÇ 0 (K-T0 FW kaydı, restart 7 s) · İ11 runId `5b3e7c0b` **PASS 11/0/0 TAM** · T-KAPA K-T10b VAR · R-T1 = pin · çıkış 0 · **pwsh 7:** T-AÇ 0 (restart 6 s) · İ11 runId `6a50e907` **PASS 11/0/0 TAM** · T-KAPA çıkış 0 · env = pin (CLIENT R09 §6; aday kökü nöbetçisi değişen 0) |
| **OFFICE 33 bağımsız inceleme (R09, merge öncesi)** | kaynak farkı her head'de okundu; prova betiğinin `Scen`/`Setup`/`Expect` metinleri ve üretim fonksiyonu AST ile alınıp sahte firewall ile iki kabukta koşuldu; S5 enjeksiyonu ve `Function:` sürücüsü davranışı **gerçek NetSecurity** ile yükseltmesiz salt-okuma ölçüldü → 8 bulgu, CLIENT tarafından kapatıldı (§0 M-1). Yan bilgi (salt-okuma, yükseltilmemiş görünüm): gelen yönde `Block` kuralı **0** (toplam 615) |
| Nöbetçi (aday kökü) | R04 `1AF16597659351D368D210B0FE6B92C265099EFE853E7D8F1902902274BC6D33` · R05 `2A1062EAC54A2D5EBBCE2E7F583B4769E1654AF786420EBCCE0B88E5FCAFF7CB` · R07 iki prova oturumunda ayrı taban — hepsinde dosya 88.248 → 88.248, değişen 0 |

**Önceki yordam provası (RELEASE22 dist) aday kanıtı SAYILMADI**; V-A/V-B aday ikilisinde koşuldu. Tamamlanmış testler
(S · G · F · R · N3) gerekçeyle tekrarlanmadı (CLIENT R03 §3).

### 2.3 Bu kanıtların KANITLAMADIKLARI

- Yükseltilmiş ölçümler: OP-00, **PRE-06 / OP-05c CutoverWriter**, OP-08a/09d/09e escrow/writer/broker ACL — yalnız D1-1.
- `-Live` canlı primitifler (D1-2) ve mühür kapılarının tamamı (D1-4 içinde).
- OFFICE #2641/#2645 davranışı **aday ikilisinde işlevsel olarak koşulmadı** (kanıt PR CI + disposable PG, kaynak üzerinde); aday bağı derlenmiş dosya sha'ları + işaretlerdir.
- T-KAPA **R-T4a/R-T4b gerçek işlemi** (gerçek firewall kuralı kaldırma, gerçek görev + port) **hiçbir modda koşulmadı**: kanıt kaynak + AST +
  bellek-içi harness 11/11'dir. Gerçek işlem kanıtı yalnız owner'ın yükseltilmiş **D3-P** izole provasında doğar (henüz koşulmadı);
  koşulmazsa §7 madde 6a(i) owner kabulü gerekir.
- T-AÇ **K-T6 kesin-ad kural oluşturma yolu** (`New-NetFirewallRule -Name` + özellik doğrulaması) **hiçbir modda koşmadı** (prova K-T6'yı atlar;
  D3-P de oluşturmayı kendi izole adlarıyla yapar, T-AÇ kodunu çağırmaz) — §7 madde 6a(i).
- D3-P'nin kapsamı: gerçek 9 senaryo **S1 başarı · S2a kısmi hata · S3a tekrar (zaten yok) · S2b R-T4b hata · S3b R-T4b toparlanma · S4 idempotent ·
  S5 sorgu hatası ≠ yokluk · S6 özellik uyuşmaz · S7 kayıt yok**; kayıt biçimi bozuk / ad deseni / port uyuşmazlığı D3-P'de YOK (yalnız harness S8–S10).
  D3-P R-T4b bütçesi **12 s** (üretim 180 s, aynı kod yolu); canlı anlık görüntüsü görev durumu + :8080/:3002 PID + `I11-WINDOW-BLOCK-*` sayımıdır
  (görev `LastRunTime` içermez).
- Canlı modda sahip = `BUILTIN\Administrators` davranışı (yükseltilmiş yazım) ölçülmedi (R07 §6); `.env` sahibi/DACL korunumu canlıda R-T7 + D3-5 ile denetlenir.
- **Güven sınırı (ana yürütücü Ek B #2664):** `TELLI\ulastelli` ile çalışan yükseltilmemiş süreçler güvenilir kümededir. Canlı `.env`'i zaten
  okuyabilen bu küme, yedek dizinine (`ENV-PREIMAGE.env`, SDDL tabanı, taban dosyası, `FW-RULES.txt`) ve yakalayıcı kaydına **yazabilir**.
  Yedek değişikliğini pin yakalar (geri yazılmaz). Değiştirilmiş `FW-RULES.txt` desen/port denetimini geçemez ya da D3-5 sayımında
  görünür. **K-T10b "Pozitif hedef kanıtı" ve R-T6 alıcı denetimi bu süreçlere karşı KORUNMAZ** — §5.2, §7 madde 6a(ii).
- D3-0 ve D3-5 blokları canlıda koşulmadı; yerelde sınandı (§4 D3).
- İ11 canlı gözlemleri — canlıda yalnız D3'te ölçülür.

## 3. D1 hazırlığı — canlı GO'dan ÖNCE bitenler ve GO İÇİNDE kalan mekanik adımlar

**Bitti (bu GO altında):** aday derlemesi · Katman 1 mühürlü makbuz · R28 forku, nesiller, belgeler · tüm kalifikasyon ·
S-06/S-08c canlı salt-okuma · **owner preflight provası** · geri dönüş kökü doğrulaması · D2 sonrası aday kökü doğrulaması.

**Canlı GO'dan önce bitirilemez (yapısal):** onaylı kimlik (3e), Adım 2 `-Live` sonucunu (`REAL-PRIMITIVES-RESULTS.json`) ve 3b/3c
çıktılarını İÇERİR; mühür (S-02b) `liveExecuted=true` ister. Bu yüzden 3a–3f GO içinde, sabit sırayla ve §7 K-KİMLİK koşuluyla yürür.
Yazıcı OFFICE 33, bağımsız doğrulama ana yürütücü; production teması 0.

## 4. Tek yürütme sırası — kesin komutlar

D1 adımları **"Yönetici olarak çalıştır" Windows PowerShell 5.1 ConsoleHost** (OWNER-RUN OR-00); D3 adımları **yükseltilmiş PowerShell 7
(`pwsh`)** penceresinde (§4 D3). Her adım bir öncekinin beklenen sonucuna bağlıdır;
beklenmeyen sonuçta **DUR** ve §5 uygulanır. **Aynı anda tek canlı yürütücü:** D1 boyunca CLIENT, D3 boyunca OFFICE canlıya dokunmaz;
her devirde hat boşluğu ana yürütücüyle teyit edilir.

### D1-0 — Ratifikasyon referansı (owner)

Önerilen biçim `OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-<YYYYMMDD>-R01`. Ölçüldü: öneke ait kullanım git tüm tarihçede **0**,
origin/main'de **0**; R28 paketinde yalnız sentetik fikstür değerleri (`…-20260906-R0x-FIXTURE`, OC testi `…-20260909-R01`) — bunlar seçilmez.
Rnn revizyondur, paket numarası DEĞİLDİR.

### D1-1 — Owner preflight (salt-okuma; DB/HTTP/login 0; `.env` içeriği okunmaz)

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28'; $p="$R\tools\Invoke-OwnerPreflight.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '0E74F687BEAF55432879BE1E10D40DFB55A223CCED6119E6CC804AC1332E420C') { Write-Host 'PREFLIGHT ARACI SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Beklenen `cikis=0` `OWNER_PREFLIGHT_READY`; yazma yalnız `preflight\OWNER-PREFLIGHT-<utc>.json` + `.sha256`. Çıkış 1 FAIL · 2 NOT_MEASURED
(PASS değil) · 3 ön koşul · 4 ABORTED → DUR (mutasyon 0; neden giderilip yeniden koşulabilir). **READY cutover yetkisi değildir.**

### D1-2 — Canlı salt-okuma gerçek primitifler

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28'; $p="$R\qualification\Test-RealPrimitives.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '5DCD12B31D2457DA5B8219E7A004426D0A7C1DB932DA754196B6A8D5E74179D2') { Write-Host 'SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Live; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Beklenen `REAL_PRIMITIVES_PASS`, `liveExecuted=true`, 31/31 (21 çevrimdışı + 10 canlı), failed 0 (Seal S-02b `total>=29` ister).
Etki: 4 HTTP isteği (API `GET /` 404 · Web `GET /` 200 · `POST /api/auth/smoke/login {}` 400 · `GET /api/auth/capabilities` 200);
smoke POST canlı API belleğindeki giriş-deneme sayacını IP başına +1 artırır (DB/dosya yazması değil; mühür S-08d bir kez daha +1);
yerel test sunucusu benzersiz `%LOCALAPPDATA%\Temp\hy-r28-realprim\<utc>` altında (silme yok); `REAL-PRIMITIVES-RESULTS.json`
yeniden yazılır. Restart 0.

### D1-3 — Onaylı kimlik + çalıştırıcılar (paket yazıcısı OFFICE 33; bağımsız doğrulama ana yürütücü)

| # | İş | Kimlik etkisi |
|---|---|---|
| 3a | `docs\OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-<YYYYMMDD>-R01.md` (owner metni) | digest dışı |
| 3b | OWNER-COMMAND şablonunda `__OWNER_RATIFICATION_REF__` → ref; kök `OWNER-COMMAND.C33-CUTOVER.ps1` = şablonun bayt-kopyası | şablon digest içi, kök dışı |
| 3c | `qualification\Test-OwnerCommandTemplate.ps1` yeniden (OC-10 ref'in 3a kaydını ister) | digest içi |
| 3d | Verifier mühürsüz: `PACKAGE_STATIC_VERIFIED_UNSEALED`, V-05d canlı PASS | digest dışı |
| 3e | `docs\APPROVED-IDENTITY-<digest8>.json`; `unsealedDigest` = OR-03a (`sha256(concat(yol + ":" + sha256 + "\n"))`, ordinal sıra) — **§7 K-KİMLİK** | digest dışı |
| 3f | OWNER-RUN şablonu: ref · preflight kanıt yolu+sha (D1-1) · onaylı digest/liste (3e) · kök OWNER-COMMAND sha (3b) · kayıt yolları; kök `OWNER-RUN.C33-RELEASE23.ps1` = bayt-kopya | onay-sonrası değişen |

Yer tutucu kalırsa çalıştırıcılar DURUR (exit 90/91). Owner D1-4'ten önce onaylı digest'i ve iki çalıştırıcının sha'sını görür.

### D1-4 — Tek owner komutu (OR-00..OR-04b → SEAL [30 dk pencere] → VERIFIER → OWNER-COMMAND → motor)

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28\OWNER-RUN.C33-RELEASE23.ps1" -Confirm "C33-RELEASE23-CUTOVER-GO"
```

Motor fazları: **P** ön-uçuş (yazma 0) → **B** claim (nonce tüketilir) → **H** release-yerel (RELEASE23 `.env` CreateNew = RELEASE22 baytları;
`.env` ebeveyni + dosya `RUNTIME_CONFIG_*`, RELEASE23 kökü `IMMUTABLE_RELEASE`) → **C** API/Web Disable+Stop → bin 3 dosya atomik →
Enable+Start → **V** (DB snapshot eşit) → COMMIT (makbuz). DB yazması 0; görev kaydı değişmez.
**Tek desteklenen yol OWNER-RUN'dır**; Seal/Verifier/OWNER-COMMAND elle ayrı koşulmaz. Çıkış kodları ve karşılıkları §5.1.

### D1-5 — Teknik yayın kabulü (salt-okuma) + devir makbuzu

```powershell
& {
$want='HY_W4_RELEASE23'; $bid='dOiGPj2M0Abls0kCibY4r'; $d="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\dist\apps\api\src"
foreach($port in 8080,3002){ $c=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1; $pr=Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess); $root=if($pr.CommandLine -match '(HY_W4_RELEASE[0-9A-Z]+)'){$Matches[1]}else{'-'}; '{0} pid={1} kok={2} {3}' -f $port,$c.OwningProcess,$root,$(if($root -ceq $want){'OK'}else{'FARKLI'}) }
foreach($f in 'hukuk-task-host.exe','start-api.ps1','start-web.ps1'){ 'bin {0} {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath "C:\Ops\hukuk\bin\$f").Hash,$f }
'BUILD_ID=' + (Get-Content -Raw -LiteralPath "C:\Development\HUKUK_YAZILIMI\$want\project\apps\web\.next\BUILD_ID").Trim()
'buildManifest=' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3002/_next/static/$bid/_buildManifest.js").StatusCode}catch{$_.Exception.Response.StatusCode.value__})
'api GET / =' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/').StatusCode}catch{$_.Exception.Response.StatusCode.value__}) + ' (404 beklenir)'
$ef="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\.env"; if(Test-Path -LiteralPath $ef){ 'env sha=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $ef).Hash; 'env sddl=' + (Get-Acl -LiteralPath $ef).Sddl }else{ 'env YOK' }
foreach($m in @(@('modules\error-log\error-log.sanitize.js','redactSecretPathSegments'),@('modules\case\case.service.js','party-write-tx'),@('modules\client\client.service.js','party-write-tx'),@('modules\debtor\debtor.service.js','party-write-tx'),@('modules\lawyer\lawyer.service.js','party-write-tx'),@('common\party-write-tx.js','createPartyWriteTxContext'),@('modules\client\client.service.js','pureNoOpDetected'),@('modules\office-approval\office-write-role.policy.js','OFFICE_WRITE_DENIED_VIEWER'),@('modules\office-approval\office-approval.service.js','assertGenericDecisionAllowed'),@('modules\lawyer\lawyer.service.js','LAWYER_REACTIVATE'))){ $p=Join-Path $d $m[0]; '{0,-28} {1,-48} satir={2}' -f $m[1], $m[0], $(if(Test-Path -LiteralPath $p){@(Select-String -LiteralPath $p -SimpleMatch -Pattern $m[1]).Count}else{'DOSYA YOK'}) }
}
```

Beklenen: iki port `kok=HY_W4_RELEASE23 OK` (eski PID 46332/47004 yok) · bin `691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627` /
`CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` / `F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0` ·
`BUILD_ID=dOiGPj2M0Abls0kCibY4r` · `buildManifest=200` · `api GET / =404` · `env sha=7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` · işaret satırları sırasıyla
**3 · 1 · 1 · 1 · 1 · 2 · 3 · 3 · 5 · 1** (işaret listesi ve sayım yöntemi aday kökünde ölçüldü; bloğun port/HTTP/bin kısımları
cutover öncesi anlamsızdır, koşulmadı). **Devir makbuzu CLIENT'a (yazılı):** cutover makbuzu
yolu + sha · canlı SHA/BUILD_ID · bu bloğun çıktısı · **`env sha=` satırı = D3 `T_ENV_PRE_SHA` pini** (beklenen `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC`; farklıysa D3 başlamaz) ·
**`env sddl=` satırı = D3 kapanış taban çizgisi** (D3-5 `$base` değeri). OFFICE canlıdan çekilir.

### D2 kapısı (CLIENT) — D3'ten hemen önce

Bağlama main'de (#2654). Canlı dist'te `redactSecretPathSegments` satır 3 (D1-5 çıktısı) görülmeden ve §9 bloğunun K-API/K-BLD
kapıları canlı RELEASE23'e karşı geçmeden D3 başlamaz. R23'e bağlı bloklar cutover ÖNCESİ canlıda koşulursa K-API/K-BLD'de durur (beklenen).

### D3-P — İzole R-T4 provası (canlı DIŞI; owner yükseltilmiş `pwsh` 7; isteğe bağlı — §7 madde 6a(i)'yi kaldırır)

Komut, CLIENT `I11-D3-RT4-KESIN-KIMLIK-R09.md` §4'teki komutla birebir aynıdır (R10 #2668 ile güncellendi) ve main `0e6754b5`'teki
prova sha'sına bağlıdır. Ölçenler: OFFICE 33 — merge SHA'sında kapı = main prova sha'sı; ana yürütücü — #2666'da prova içindeki T-KAPA
pini = main T-KAPA (R10 T-KAPA'yı değiştirmedi). Canlı görev/port/`I11-WINDOW-BLOCK-*` kurallarına **dokunmaz**. Yalnız `HYRT4S-<runId>-*` adlı geçici kural ve
görevleri, 47100–47199 aralığındaki portları ve CLIENT oturum dizininde `i11s\rt4s\RT4S-<runId>` klasörünü kullanır, sonra temizler. D1 ya da
D3 ile **aynı anda koşulmaz**:

```powershell
& { $f='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\t-rt4-isolated-rehearsal.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'B643DF51D71BC4012453CCF746CD0ECC4550897701E54346D3DBF9718FBF5803'){ throw 'RT4S SHA UYUSMUYOR - DUR' }; $pw=(Get-Command pwsh -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source; $global:LASTEXITCODE=-999; & $pw -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'RT4S cikis=' + $rc; if($rc -ne 0){ throw "RT4S PASS DEGIL (cikis=$rc)" } }
```

**PASS koşulu:** betik sonu `SONUC: PASS | senaryo 9/9 | artik temiz=True | canli esit=True` ve `RT4S cikis=0`. Çıktı dosya yolu ve sha'sı
(`KANIT:` satırı) CLIENT kaydına bağlanır. PASS → §7 madde 6a(i) düşer. FAIL ya da koşulmadı → 6a(i) owner kabulü gerekir; FAIL
ayrıntısı CLIENT'a iletilir ve betik düzeltmesi yeni hash ister (bu belge yeniden sürümlenir). Kapsamı ve sınırları §2.3'te.

### D3 — Canlı pencere (CLIENT yönetir; YÜKSELTİLMİŞ yürütücü)

**Yürütücü ve pencere:** D3 blokları **yükseltilmiş Administrators PowerShell 7 (`pwsh`)** penceresinde koşar (K-ELEV zorlar); T betikleri
aynı pencereden `pwsh -File` ile çağrılır — CLIENT R07 döngü **B** ile birebir aynı kabuk (döngü A WinPS 5.1 de geçti). **Karışık zincir
kurulmaz** (PowerShell 7 içinden `cmd` üzerinden `powershell.exe`: PS 7 modül yolu 5.1'e geçer, `Get-FileHash`/`Get-Acl` yüklenmez —
CLIENT ölçümü). D1 penceresi OWNER-RUN OR-00 gereği Windows PowerShell 5.1'dir; D3, D1 bittikten sonra ayrı pencerede yürür.
Ajan oturumları yükseltilmemiştir (ölçüldü: preflight provası `elevated=False`; CLIENT E-3): **yükseltilmiş pencereyi owner sağlar ve D3
bloklarını owner yapıştırarak koşar** (pencere komut satırında desen belirteci yok); CLIENT sırayı yönetir, her çıktıyı doğrular ve sonraki
bloğu verir. D3 blokları **aynı pencerede** koşar (D3-0'ın ortam değişkenleri ve §9'un `CL_*` değerleri sonraki adımlara taşınır).
Aynı anda tek canlı yürütücü: D3 boyunca OFFICE canlıya dokunmaz.

**Betik kaynağı ve dondurma kuralı:** kanonik main — `C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\`
(sha doğrulamalı). Kanonik çalışma ağacı **`0e6754b5`'i içeren** main'de olmalıdır (2026-09-13 R10 merge sonrası ölçüldü: HEAD = `0e6754b5`; D3-0
sha kapısı bunu yeniden doğrular). **D3 süresince kanonik çalışma ağacında git işlemi (pull/merge/checkout) YAPILMAZ**; D3-1 ve D3-4 sha'yı
yeniden doğrular.

**Blokların kaynağı (Ek B B.4):** yükseltilmiş pencereye yapıştırılan her blok **GitHub main'deki birleşmiş R03 metninden** alınır.
Yapıştırmadan önce bloktaki sha/pin değerleri §1 ile **gözle** karşılaştırılır. Yerel kopya ve pano `ulastelli` süreçlerince
değiştirilebilir (UIPI yalnız doğrudan girdi gönderimini engeller). Bloklardaki sha kapıları betik dosyalarını korur, **blok metninin
kendisini korumaz**.

**İşletim uyarısı (ölçüldü):** D3 süresince komut satırında `smtp-sink.js` · `i11-run` · `cl-09` vb. geçen başka süreç (ör. `-Command` ile
açılmış kabuk, ajan kabuk çağrısı) bulunmamalıdır; K-PAR tasarım gereği durur.

**D3-0 — Ön durum + yakalayıcı + K-PAR ön-kontrolü** (OFFICE 33):

```powershell
& {
$ErrorActionPreference='Stop'
$SC='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts'
$SP='C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad'
$want=[ordered]@{'smtp-sink-noauth.js'='99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800';'t-window-apply.ps1'='834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC';'t-window-close.ps1'='676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF'}
foreach($f in $want.Keys){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $SC $f)).Hash -cne $want[$f]){ throw ('SHA UYUSMUYOR: ' + $f + ' - DUR') } }
if(@(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue).Count -ne 0){ throw ':2526 zaten dinleniyor - DUR' }
if(Test-Path -LiteralPath (Join-Path $SP 'i11live')){ throw 'i11live zaten var - T-AC K-T0a duracak (onceki pencere kapanmamis ya da yerlestirilmis dizin) - DUR, owner karari' }
$env:SINK_PORT='2526'; $env:SINK_LOG=(Join-Path $SP 'i11s\runs\smtp-sink.jsonl')
[void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $env:SINK_LOG))
[void](Start-Process -FilePath 'node' -ArgumentList ('"' + (Join-Path $SC 'smtp-sink-noauth.js') + '"') -WindowStyle Hidden -PassThru)
$t0=Get-Date; while((@(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue).Count -eq 0) -or (-not (Test-Path -LiteralPath $env:SINK_LOG))){ if(((Get-Date)-$t0).TotalSeconds -gt 15){ throw 'yakalayici 15 s icinde dinlemedi ya da kaydi yok - DUR' }; Start-Sleep -Milliseconds 300 }
$rx='ak-live|i11-run|i10-run|i9-run|i11-0|i10-0|i9-0|cl-09|ro-check|drive2?\.js|fault-proxy|start-api-r22s|smtp-sink\.js\b'
$busy=@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -match $rx) -and ($_.ProcessId -ne $PID) })
if($busy.Count -ne 0){
  foreach($p in $busy){ 'K-PAR-ON: PID ' + $p.ProcessId + ' ' + $p.Name }
  foreach($k in @(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue)){ Stop-Process -Id ([int]$k.OwningProcess) -Force -ErrorAction SilentlyContinue }
  throw 'K-PAR on-kontrolu: §9 DURACAK - yakalayici durduruldu, D3-1 BASLATILMAZ'
}
'D3-0 TAMAM: i11live yok · yakalayici 127.0.0.1:2526 + kayit var · K-PAR on-kontrolu 0'
}
```

Sınama (canlıda koşulmadı; R02'de — R03'te blokta yalnız iki `$want` değeri değişti): bu blok belgeden çıkarılıp YALNIZ betik dizini,
scratchpad kökü ve port (2599) değiştirilerek yerelde uçtan uca koşuldu — **WinPS 5.1 başarı:** `D3-0 TAMAM`, çıkış 0, dinleyici `127.0.0.1`, kayıt dosyası var, `i11live` oluşmadı · **pwsh 7 başarı:** aynı ·
**WinPS 5.1 düşüş** (komut satırında `i11-run` belirteci taşıyan zararsız yardımcı süreç açıkken): K-PAR yakaladı, yakalayıcı durduruldu
(dinleyici 0), çıkış 1 · test süreçleri sonunda 0. `i11live` VAR dalı koşulmadı (tek satırlık salt-okuma kapısı). Blok `i11live`'ı
**oluşturmaz**: yedek dizini T-AÇ K-T0'ın işidir (R07 E-6).

**D3-1 — T-PENCERE-AÇ çağrısı** (çocuk `pwsh` çıkış kodu HEMEN kaydedilir; ≠0 ise dış blok da fırlatır ve D3-2'ye geçilmez):

```powershell
& { $ErrorActionPreference='Stop'; $f='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\t-window-apply.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC'){ throw 'T-AC SHA UYUSMUYOR - DUR' }; $pw=(Get-Command pwsh -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source; $env:T_MODE='live'; $env:T_GOREF='<OWNER-GO-CLIENT-I11-YYYYMMDD-Rnn>'; $env:T_ENV_PRE_SHA='7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'; $global:LASTEXITCODE=-999; & $pw -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'T-AC cikis=' + $rc; if($rc -ne 0){ throw ('T-AC cikis=' + $rc + ' - D3-2 BASLATILMAZ: ciktida K-T0 kapanis satiri VARSA D3-4, YOKSA D3-S (§5.1)') } }
```

**D3-1 yönlendirmesi (birebir satır):** çıkış ≠ 0 ise çıktıda
`K-T0: yedek dizini + yedek + SDDL tabani + yakalayici kaydi + firewall kaydi KORUMALI` satırı **VARSA → D3-4**, **YOKSA → D3-S**.
(`K-T0a:` satırı da "K-T0" ile başlar ama değişiklik öncesidir; yalnız K-T0a görünürken D3-4 koşulursa API boşuna yeniden başlar.)
Kapanış satırı basıldıysa `FW-RULES.txt` kurallardan önce yazılmıştır; K-T6 yarıda düşse bile D3-4 kaydı bulur ve oluşturulmamış
kuralı `ObjectNotFound` = zaten yok sayar (CLIENT R09 B1).

**D3-4 — T-PENCERE-KAPA çağrısı** (aynı pin; yedek güveni, pin ve kesin kural kimliği denetimi betiğin içindedir; çocuk çıkış kodu HEMEN
kaydedilir, ≠0 ise dış blok fırlatır ve **D3-5 ile kabul adımlarına geçilmez**). `$rid` §9 çıktısındaki runId'dir (`crypto.randomBytes(4)` →
8 hex küçük harf, `i11-run.js:45`); doldurulmamış yer tutucu blokta DURUR — literal `<runId>` ile koşulan T-KAPA kanıtı bu koşuma bağlayamaz
ve "Pozitif hedef kanıtı: YOK" verir. §9 runId üretmeden durduysa (ya da §9 hiç koşmadıysa) `$rid=''` yazılır:

```powershell
& { $ErrorActionPreference='Stop'; $f='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\t-window-close.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF'){ throw 'T-KAPA SHA UYUSMUYOR - DUR (§5.1)' }; $rid='<runId>'; if($rid -and ($rid -cnotmatch '^[0-9a-f]{8}$')){ throw 'T_RUNID gecersiz ya da yer tutucu - DUR: §9 ciktisindaki 8 hex runId yazilir (§9 runId uretmediyse bos deger)' }; $pw=(Get-Command pwsh -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source; $env:T_MODE='live'; $env:T_RUNID=$rid; $env:T_ENV_PRE_SHA='7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'; $global:LASTEXITCODE=-999; & $pw -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'T-KAPA cikis=' + $rc; if($rc -ne 0){ throw ('T-KAPA cikis=' + $rc + ' - PENCERE KAPANISI EKSIK: listelenen adimlar owner a; D3-5 ve kabul adimlarina GECILMEZ; kurtarma = ayni D3-4 blogunun tekrari (§5.1)') } }
```

Çağrı deseni sınandı (canlı dışı): D3-1 ve D3-4 blokları **bu belgeden çıkarılıp** yalnız `$f` yolu ve sha değeri sahte bir çocuk betiğe
çevrilerek pwsh 7 ve WinPS 5.1 dış kabukta koşuldu — sonuçlar D3-5'ten sonraki sınama tablosunda.

**D3-S — Yalnız yakalayıcıyı durdur** (D3-1 çıktısında K-T0 kapanış satırı YOKSA — canlı değişiklik yoktur, API yeniden başlatılmaz):

```powershell
& { foreach($k in @(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue)){ Stop-Process -Id ([int]$k.OwningProcess) -Force }; Start-Sleep -Seconds 2; ':2526 dinleyici=' + @(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue).Count }
```

**D3-5 — Kapanış ölçütü** (salt-okuma; yalnız D3-4 `T-KAPA cikis=0` sonrası; §5.4 K4). `$base` = D1-5 çıktısındaki `env sddl=` satırının
değeri (yer tutucu blokta DURUR; doldurmak onay değildir):

```powershell
& {
$ErrorActionPreference='Stop'
$base='<D1-5 env sddl= satirindaki deger>'
if(($base -cnotmatch '^O:\S+G:\S+D:') -or $base.Contains('<')){ throw 'D3-5: taban SDDL yer tutucu ya da gecersiz - DUR (D1-5 env sddl= satirindaki deger yazilir)' }
$want='HY_W4_RELEASE23'; $pin='7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'
$ef="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\.env"
$rec='C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live\FW-RULES.txt'
$rx='^I11-WINDOW-BLOCK-(8080|3002)-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$'
$bad=New-Object 'System.Collections.Generic.List[string]'
$h=(Get-FileHash -Algorithm SHA256 -LiteralPath $ef).Hash; 'env sha=' + $h; if($h -cne $pin){ $bad.Add('env sha pin DEGIL') }
$s=(Get-Acl -LiteralPath $ef).Sddl; 'env sddl=' + $s; if($s -cne $base){ $bad.Add('env sddl D1-5 tabanindan FARKLI') }
foreach($port in 8080,3002){ $cn=@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1); if($cn.Count -eq 0){ $bad.Add(':' + $port + ' dinleyici YOK'); continue }; $pr=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $cn[0].OwningProcess); $root=if($pr.CommandLine -match '(HY_W4_RELEASE[0-9A-Z]+)'){$Matches[1]}else{'-'}; '{0} pid={1} kok={2}' -f $port,$cn[0].OwningProcess,$root; if($root -cne $want){ $bad.Add(':' + $port + ' koku ' + $root) } }
$names=@(); if(Test-Path -LiteralPath $rec){ $names=@(Get-Content -LiteralPath $rec | ForEach-Object { $_.Trim() } | Where-Object { $_ } | ForEach-Object { ($_ -split '\s+',2)[-1] }) } else { $bad.Add('FW-RULES.txt YOK') }
if(($names.Count -ne 2) -or (@($names | Where-Object { $_ -cnotmatch $rx }).Count -ne 0)){ $bad.Add('FW-RULES.txt iki gecerli kesin ad TASIMIYOR (' + $names.Count + ')') }
foreach($n in $names){ try { $null=Get-NetFirewallRule -Name $n -ErrorAction Stop; $bad.Add('kural HALA VAR: ' + $n) } catch { if($_.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::ObjectNotFound){ 'kural yok (dogrulanmis): ' + $n } else { $bad.Add('kural sorgu hatasi (yokluk SAYILMAZ): ' + $n) } } }
$iwb=@(Get-NetFirewallRule -ErrorAction Stop | Where-Object { ($_.Name -like 'I11-WINDOW-BLOCK-*') -or ($_.DisplayName -like 'I11-WINDOW-BLOCK-*') }).Count; 'I11-WINDOW-BLOCK-* salt-okuma sayimi=' + $iwb; if($iwb -ne 0){ $bad.Add('I11-WINDOW-BLOCK-* sayimi ' + $iwb) }
$sk=@(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue).Count; ':2526 dinleyici=' + $sk; if($sk -ne 0){ $bad.Add(':2526 dinleyici var') }
if($bad.Count -ne 0){ foreach($b in $bad){ '!!! ' + $b }; throw ('D3-5 FAIL (' + $bad.Count + ') - I11 KAPANMAZ; owner a (§5.1)') }
'D3-5 PASS'
}
```

Kural sayımı tüm kuralları **`-ErrorAction Stop`** ile okuyup istemci tarafında süzer: sorgu hatası yokluk sayılmaz, blok düşer. Kesin ad
denetimi yalnız `ObjectNotFound`'u yokluk sayar. Joker yalnız okumadadır; hiçbir şey silinmez (owner koşulu silme içindir).

**D3-1 / D3-4 / D3-5 sınaması (canlıda koşulmadı; 2026-09-13):** Üç blok **bu belgeden satır satır çıkarıldı**. Yalnız sınama değerleri
birebir değiştirildi, her biri tek eşleşme olarak denetlendi:
- D3-1/D3-4: `$f` → sahte çocuk betik; sha → onun sha'sı; D3-4 `$rid` → `deadbeef`.
- D3-5: `$base`/`$pin`/`$ef` → oturum dizininde sahte `.env`; `$rec` → sahte kayıt; `$want` → bugünkü canlı kök `HY_W4_RELEASE22`.

Her durum ayrı süreçte koşuldu; dış kabuk pwsh 7.6.5 ve WinPS 5.1.

| Blok | Durum | pwsh 7.6.5 | WinPS 5.1 |
|---|---|---|---|
| D3-1 / D3-4 | çocuk çıkış 0 | fırlatmadı · `cikis=0` | aynı |
| D3-1 / D3-4 | çocuk `exit 3` | fırlattı · `cikis=3` + D3-2 / D3-5 yasağı iletisi | aynı |
| D3-1 / D3-4 | çocukta `throw` (çıkış 1) | fırlattı · `cikis=1` + yasak iletisi | fırlattı; sınama stderr'i `2>&1` ile yakaladığı için 5.1 çocuğun stderr satırında erken durdu (`cikis=` satırı basılmadı) — fail-closed; D3 pwsh 7'de koşar |
| D3-1 / D3-4 | `pwsh` PATH'te yok | fırlattı (`Get-Command`), çocuk koşmadı | aynı |
| D3-4 | `$rid='<runId>'` yer tutucu | fırlattı · `T_RUNID gecersiz ya da yer tutucu - DUR` | aynı |
| D3-5 | geçerli taban + pin + kayıtta iki geçerli ama var olmayan ad | `kural yok (dogrulanmis)` ×2 · sayım 0 · `:2526` 0 · kökler eşit · **`D3-5 PASS`** | aynı |
| D3-5 | `$base` yer tutucu | fırlattı · `taban SDDL yer tutucu … DUR` | aynı |
| D3-5 | pin yanlış + SDDL farklı + kayıtta tek bozuk ad | **`D3-5 FAIL (3)`** · üç madde listelendi | aynı |
| D3-5 | kayıt dosyası yok | **`D3-5 FAIL (2)`** (`FW-RULES.txt YOK` · iki geçerli ad yok) | aynı |

Sınamada yazma yalnız oturum dizinindeki sahte dosyalardadır; firewall, görev ve servis işlemi yapılmadı (kural sorguları salt-okuma).

| Sıra | Komut | Girdi | Etki / beklenen |
|---|---|---|---|
| D3-0 | yukarıdaki blok | — | `i11live` YOK · yakalayıcı `127.0.0.1:2526` + kayıt dosyası var (komut satırında log yolu YOK) · K-PAR ön-kontrolü **0** → `D3-0 TAMAM` |
| D3-1 | **T-PENCERE-AÇ** `834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC` (`& <pwsh> -File`, çıkış kodu aktarımlı) | `T_MODE=live` · `T_GOREF=<İ11 ref>` · `T_ENV_PRE_SHA=7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` | **T-PIN** · **K-ELEV** · K-T1..K-T3 yakalayıcı yalnız loopback, AUTH ilan yok · K-T4 API tek dinleyici · **K-T5 ayın 1'i 02:00–05:00 reddi** · **K-T0a** env sha = pin · yedek dizini yok · kayıt var · **K-T0** yeni korumalı `i11live` (kopyadan önce) + yedek + SDDL tabanı + yakalayıcı kaydı korumalı + **iki kesin ad `FW-RULES.txt`'e** (`K-T0: firewall kesin adlari kayda yazildi (…)`) + kapanış satırı `K-T0: yedek dizini + … + firewall kaydi KORUMALI` · **K-T6 Web durur + yalnız bu iki kesin adla engel kuralı** (aynı adlı kural varsa DUR; özellik doğrulaması; `K-T6: ONLEME ETKIN … kesin-ad engel kurallari (…); joker YOK`) · K-T7/K-T8 bayt düzeyinde TAM iki satır (`SMTP_HOST=127.0.0.1`, `SMTP_PORT=2526`), satır sonları/BOM/SDDL aynı · API restart (180 s) · `T-AC cikis=0` (≠0 → dış blok fırlatır; yönlendirme yukarıda) |
| D3-2 | **İ11 §9 bloğu** `27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700` — **TEK KEZ** (belgeden kopyalanır; yalnız üç değişken doldurulur; aynı pencereye yapıştırılır) | `$GoRef` = İ11 ref · `$SendGo` = aynı ref · `$SmtpAck = 'EVET'` | K-GO · K-WT · K-ARC (9 araç + 12 ürün hash) · K-PAR (noauth ve `smtp-sink.jsonl` dışlanır) · K-INTAKE · tek `node i11-run.js`; yazma yalnız `cl-acc-<runId>` (gönderim açık **28 satır**; başarısız gönderimde 21); kapanış koşum içinde |
| D3-3 | **Kurtarma** (yalnız koşum kesilir/durum belirsizse; `CLIENT-LIVE-ACCEPTANCE-I11-R01.md` §11) | `CL_RUN_ID=<runId>` + §9'un `CL_*` değerleri | `i11-03-close-links.js` `87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740` → bağlantılar REVOKED · `cl-09-close-access.js` `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` → 3 User pasif + Case CLOSED; tekrarı güvenli |
| D3-4 | **T-PENCERE-KAPA** `676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF` (`& <pwsh> -File`, çıkış kodu aktarımlı) — **K-T0 kapanış satırı sonrası HER SONUÇTA** | `T_MODE=live` · `T_RUNID=<§9 runId, 8 hex>` (yer tutucu blokta durur) · `T_ENV_PRE_SHA=7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` (T-AÇ ile aynı) | **T-PIN** · **K-ELEV** · K-T10b pozitif hedef kanıtı (kanıt dosyaları güvenilir değilse YOK) · **R-T1 yedek yalnız güvenilir ve sha = pin ise geri yazılır** · R-T2 API restart (180 s) · R-T3 env = pin + özgün hedef · **R-T4a — HER DURUMDA:** `FW-RULES.txt` güven denetimi + her ad desen/port/tekrar denetimi; her ad kendi `try`'ında `Get-NetFirewallRule -Name -ErrorAction Stop` (yalnız `ObjectNotFound` → `zaten YOK (dogrulanmis)`; başka hata → BAŞARISIZ, yoklukla karıştırılmaz) · özellik uyuşmazsa `DOKUNULMADI` · `Remove -Name` + yeniden sorgu; `R-T4a: kesin-ad engel kurallari - kaldirilan N, zaten yok M (joker YOK; baska kurala dokunulmadi)`; kayıt yok/güvenilmez/bozuk → BAŞARISIZ, **joker yedeği yok** · **R-T4b Web — HER DURUMDA** · **R-T5 yakalayıcı durdur — HER DURUMDA** · R-T6 sentetik alan dışı ileti → yeniden gönderim YOK · **R-T7 env SDDL = K-T0 tabanı** · hata varsa tüm adımlar denendikten sonra **sonda throw** (adım listesi) → dış blok `T-KAPA cikis=1` ile fırlatır · **kabul için:** `Pozitif hedef kaniti: VAR` **ve** `PENCERE KAPANDI - tum adimlar basarili.` **ve** `T-KAPA cikis=0` |
| D3-S | yalnız yakalayıcı durdur | — | D3-1 çıktısında K-T0 kapanış satırı YOKSA (T-PIN / K-ELEV / K-T1..K-T5 / K-T0a / K-T0 içi düşüş): `:2526 dinleyici=0` |
| D3-5 | **Kapanış ölçütü** — yukarıdaki blok (salt-okuma; OFFICE) | `$base` = D1-5 `env sddl=` değeri | `env sha=7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` · `env sddl` = D1-5 taban çizgisi (R-T7'den bağımsız) · :8080/:3002 kökü `HY_W4_RELEASE23` · `FW-RULES.txt`'teki iki kesin ad `kural yok (dogrulanmis)` · `I11-WINDOW-BLOCK-* salt-okuma sayimi=0` · `:2526 dinleyici=0` → **`D3-5 PASS`** (herhangi biri düşerse `D3-5 FAIL (n)` fırlatır) |

## 5. Kapanış ve geri dönüş — TÜM sonuçlarda

### 5.1 Karar tablosu

| Nokta / sonuç | Canlı durum | Yapılacak |
|---|---|---|
| D1-1 veya D1-2 beklenmeyen | RELEASE22, mutasyon 0 | DUR; neden giderilir, adım yeniden koşulabilir (sonuç dosyaları üzerine yazılır) |
| D1-3 K-KİMLİK sağlanmaz | RELEASE22 | DUR; fark owner'a sunulur |
| D1-4 exit **90 / 91** (motor koşmadı) | RELEASE22 | neden giderilir; OWNER-RUN yeniden (authority varsa ve claim yoksa reseal'i kendisi yapar) |
| exit **1** `HARD_STOP_PREFLIGHT_NOT_APPLIED` | RELEASE22, mutasyon 0, makbuz yazıldı | **reseal YOK**; OWNER-COMMAND doğrudan yalnız aynı pencerede ve **AYRI owner kararıyla** (bu GO kapsamında DEĞİL); pencere dolduysa yeni C33 paket numarası + yeni ratifikasyon · D3 başlamaz |
| exit **2** `ROLLBACK_COMPLETE_OLD_RUNTIME_RESTORED` | RELEASE22 geri, nonce tüketildi | D3 İPTAL; D1-5 bloğu **geri yön beklentisiyle** doğrulanır; yeni deneme = yeni paket numarası (R29) + yeni ratifikasyon |
| exit **3** `HARD_STOP_STATE_UNCERTAIN_MANUAL_RECOVERY_REQUIRED` | belirsiz | §5.3 elle kurtarma + geri yön doğrulaması; D3 İPTAL |
| exit **70** (makbuz birincil yola yazılamadı; motor koştu) | makbuz/journal okunur | owner kararı; D3 başlamaz |
| exit 0 fakat **D1-5 teknik kabul düşer** | RELEASE23 canlı, doğrulanmadı | D3 İPTAL; §5.3 elle geri dönüş + geri yön doğrulaması |
| D2 kapısı düşer | RELEASE23 canlı ve teknik kabul geçmiş | D3 başlamaz (yazma 0); yayın kalır; İ11 açık |
| D3-0 düşer (sha · `:2526` dolu · `i11live` var · 15 s dinleme/kayıt yok · K-PAR ön-kontrolü ≥1) | canlı değişiklik 0 (K-PAR düşüşünde blok yakalayıcıyı durdurur) | D3-1 başlamaz; neden giderilir, D3-0 yeniden · `i11live` varsa owner kararı (önceki pencere kanıtı; silme owner kararı) |
| D3-1 çıkış ≠ 0 ve **K-T0 kapanış satırı YOK** — T-PIN / K-ELEV / K-T1..K-T5 / **K-T0a** (env sha ≠ pin · yedek dizini var · kayıt yok) | değişiklik 0 (K-T0 bu kapılardan SONRA) | D3-2 koşulmaz; **D3-S** (yalnız yakalayıcıyı durdur; API yeniden BAŞLATILMAZ, D3-4 KOŞULMAZ); env sha ≠ pin ise owner'a |
| D3-1 çıkış ≠ 0, K-T0 **içinde** düştü (kapanış satırı YOK; yedek dizini oluşmuş olabilir) | canlı servis/env/kural değişikliği 0 (yazma yalnız yedek dizini + yakalayıcı kaydı ACL'i) | **D3-S**; D3-4 KOŞULMAZ; `i11live` kalırsa yeni T-AÇ K-T0a'da durur → yeni pencere owner kararı (dizin sır taşır; silme owner kararı) |
| D3-1 çıkış ≠ 0 ve **K-T0 kapanış satırı VAR** (K-T6 · env yazımı · K-T8 · restart) | yedek + SDDL tabanı + `FW-RULES.txt` var; engel/Web/env kısmen değişmiş olabilir | D3-2 koşulmaz; **D3-4 HER DURUMDA** (oluşturulmamış kural `zaten YOK`) |
| D3-1 dış blok `T-AC SHA UYUSMUYOR` ya da `pwsh` bulunamadı | değişiklik 0 (T-AÇ koşmadı) | **D3-S**; neden giderilir (dondurma kuralı / kanonik ağaç `0e6754b5`); yeni deneme D3-0'dan |
| D3-2 başarısız / yarıda | sentetik tenant yazmaları | koşum içi kapanış doğrulanamadıysa D3-3 yalnız runId ile → D3-4 |
| D3-4 pin'siz çağrıldı (T-PIN) | değişiklik yok | aynı bloğu pinle tekrar |
| D3-4 T-KAPA sha uyuşmaz (kanonik ağaç değişmiş) | pencere açık | T-KAPA KOŞULMAZ; betik `0e6754b5`'teki blob'dan sha doğrulamalı bayt-kopya ile koşulur — owner kararı; dondurma kuralı ihlali kayda yazılır |
| D3-4 R-T4a BAŞARISIZ — kayıt yok/güvenilmez/bozuk · ad deseni/port uyuşmaz · sorgu/erişim hatası · özellikleri farklı `DOKUNULMADI` · kaldırma sonrası hâlâ var | R-T4b/R-T5/R-T6/R-T7 yine denendi; engel kuralı kalmış olabilir; **başka kurala dokunulmadı** | dış blok fırlatır; D3-5 ve kabul YOK; owner'a DERHAL. Kurtarma = aynı D3-4 tekrarı (zaten kaldırılmış ad `zaten YOK` geçer). Kalıcı hatada kuralın **yalnız kesin adıyla** (D3-1 K-T0 çıktısındaki iki ad) elle kaldırılması **ayrı owner kararıdır**; joker silme yok. D3-5 salt-okuma sayımı kalan kuralı gösterir |
| D3-4 R-T1 "yedek dizini/dosyası güvenilir DEĞİL" ya da "pinli değere EŞİT DEĞİL" | env pencere değerinde kalır (SMTP loopback; yakalayıcı R-T5'te durur → dış gönderim yok); R-T4/R-T5 yine koşar, erişim geri açılır | sonda throw; owner'a DERHAL; **elle müdahale:** yedek başka kaynaktan doğrulanmadan canlı `.env`'e YAZILMAZ; doğrulanmış kaynak sha doğrulamalı `HY_W4_RELEASE22\project\apps\api\.env` (`7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC`) — owner kararı |
| D3-4 sonda throw (diğer adımlar) → `T-KAPA cikis≠0`, dış blok fırlattı | R-T4a/R-T4b/R-T5 yine denendi; listelenen adım(lar) başarısız | owner'a DERHAL; **D3-5 ve kabul adımlarına geçilmez**; otomatik tekrar YOK; kurtarma = aynı D3-4 bloğunun tekrarı (idempotent, ölçüldü) |
| D3-4 çıkış 0 fakat `Pozitif hedef kaniti: YOK` | pencere kapandı, env = pin | geri dönüş TAMAM; D3-5 koşulur; **İ11 §5.4 K3 sağlanmadı → İ11 KAPANMAZ, GO-COMPLETE DEĞİL**; owner'a (yeni İ11 penceresi ayrı karar; `cl-acc-<runId>` yeniden açılmaz) |
| D3-5 `FAIL (n)` | listelenen koşul(lar) sağlanmadı | İ11 KAPANMAZ; owner'a; `I11-WINDOW-BLOCK-*` sayımı ≠ 0 ya da kesin ad hâlâ var → aynı D3-4 tekrarı, düzelmezse yalnız kesin adla elle kaldırma ayrı owner kararı · env sha ≠ pin → R-T1 satırı · kök ≠ RELEASE23 → yayın durumu owner'a · `:2526` dolu → D3-S |
| R-T7 veya D3-5 `env sddl` tabandan farklı | içerik bayt-eşit | owner'a bildirilir; otomatik ACL düzeltmesi YOK |
| **D3 açıkken yayın geri dönüşü gerekirse** | — | **ÖNCE D3-4** (engel + Web her durumda geri açılır; env ön görüntüye), **SONRA** §5.3 |

Veri: migration yok. Koşum yazmaları **geri alınmaz**, kapatılır ve kanıt olarak kalır; `cl-acc-<runId>` yeniden açılmaz.
Geri dönüş RELEASE23'ün üç düzeltmesini geri alır (#2641 · #2645 · #2643 B-I11-3 kusurları canlıya döner); AK-2/AK-1a/CLF-O0-01/B-1 RELEASE22'dedir.

### 5.2 `.env` yazımları, yedek ve güven sınırı

**Yazım yöntemleri (R07/R09; kaynaktan okundu):**
- Motor H-01 RELEASE23 `.env`'i RELEASE22 baytlarıyla kurar ve `RUNTIME_CONFIG_FILE` sınıfını uygular (korumalı DACL: SYSTEM FA ·
  Administrators FA · runtime FR; sahip SYSTEM). Canlı RELEASE22 `.env` bugün aynı sınıfta (preflight provası OP-09h PASS; CLIENT SDDL
  ölçümü `O:SYG:DUD:PAI(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;S-1-5-21-3828948545-3622927028-3332160207-1146)`).
- **T-PENCERE-AÇ** `.env`'i **bayt düzeyinde** değiştirir: `[IO.File]::ReadAllBytes` → katı UTF-8 çözümü (geçersiz baytta DUR) → yalnız
  `SMTP_HOST`/`SMTP_PORT` satırları, satır sonları ve BOM durumu korunarak → **`[IO.File]::WriteAllBytes`**. K-T8 yazılan bayt = hesaplanan bayt,
  farklı satır tam 2 ve env SDDL'in yazımdan sonra aynı olduğunu denetler. `Get-Content`/`Set-Content` `.env` için **kullanılmaz**
  (R02'deki "`Set-Content` yazar" ifadesi R07 öncesine aitti ve bu sürümde düzeltildi).
- **T-PENCERE-KAPA** R-T1, yedeği yalnız güvenilir (sahip + korumalı DACL + yabancı kural 0 + reparse değil) ve sha = pin ise
  `Copy-Item -Force` ile geri yazar ve sonucu pinle doğrular; R-T7 env SDDL'ini K-T0 tabanıyla, OFFICE D3-5 D1-5 taban çizgisiyle bağımsız
  karşılaştırır. Farkta otomatik düzeltme yok. CLIENT karalama deneyi: korumalı DACL'lı hedefte yazımlardan sonra **DACL korundu**;
  canlıda **sahip (SYSTEM) korunumu ölçülmedi** → R-T7 + D3-5 yakalar.

**Yedek dizini ve kanıt dosyaları — güven sınırı (ana yürütücü Ek B, #2664 @ `1334d2fe`; içerik okunmadı):**

| Soru | Cevap |
|---|---|
| Kim okuyabilir? | SYSTEM · yükseltilmiş Administrators · `TELLI\ulastelli` ile çalışan her süreç — **canlı `.env`'i zaten okuyabilen kümeyle AYNI** (API bu hesapla çalışır). Codex sandbox hesapları, 5 çözümlenmemiş SID, diğer yerel kullanıcılar, Everyone/Users: erişim YOK |
| Kim yazabilir/silebilir? | canlı `.env`'e yalnız SYSTEM ve yükseltilmiş admin; **yedeğe (`ENV-PREIMAGE.env`), SDDL tabanına, taban dosyasına, `FW-RULES.txt`'e ve yakalayıcı kaydına `ulastelli` ile çalışan yükseltilmemiş her süreç de** (kapsam genişler) |
| "Güvenilir süreçler" | token'ında SYSTEM, **etkin** Administrators veya `TELLI\ulastelli` kullanıcı SID'i bulunan her süreç: canlı API/Web zinciri, ajan oturumları ve alt süreçleri, yükseltilmiş owner penceresi |
| Sır gizliliği | kapsam **genişlemez**; oluşturma penceresi kapalı (dizin kopyadan önce korumalı). Kalan: yedek ikinci kalıcı sır kopyasıdır; silme owner kararı |
| İçerik bütünlüğü | canlı yapılandırma **korunur**: değiştirilmiş/silinmiş yedek pin + güven denetimi nedeniyle **geri yazılmaz** (sonuç erişilebilirlik kaybı; §5.1 R-T1 satırı). Kural kaydı: desen/port/tekrar denetimi uymayan adı reddeder; iyi biçimli ama farklı bir adla değiştirilirse R-T4a "zaten yok" diyerek geçebilir → **D3-5 `I11-WINDOW-BLOCK-*` sayımı kalan kuralı yakalar**. SDDL tabanı değişirse D3-5 (D1-5 tabanı) yakalar. **Yakalayıcı kaydı/taban dosyası değiştirilirse K-T10b "Pozitif hedef kanıtı" ve R-T6 alıcı denetimi YANILTILABİLİR** (§7 madde 6a(ii)) |
| Blokların kaynağı | yükseltilmiş pencereye yapıştırılan bloklar **GitHub main'deki birleşmiş R03 metninden** alınır; sha/pin değerleri §1 ile **gözle** karşılaştırılır (§4 D3) |
| İsteğe bağlı sertleştirme (Ek B B.5) | karar şart değil; betik değişikliği yeni hash ve yeni belge sürümü demektir (§8) |

### 5.3 Elle geri dönüş (yalnız bin + görev katmanı; sha ve ACL korumalı; tek parça `& { }`)

```powershell
& {
$ErrorActionPreference='Stop'
$G='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28\generations\R22'; $B='C:\Ops\hukuk\bin'
$exp=[ordered]@{'hukuk-task-host.exe'='E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706';'start-api.ps1'='77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51';'start-web.ps1'='1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D'}
foreach($f in $exp.Keys){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $G $f)).Hash -cne $exp[$f]){ throw "rollback kaynagi sapmis: $f" } }
$sd=@{}; foreach($f in $exp.Keys){ $sd[$f]=(Get-Acl -LiteralPath (Join-Path $B $f)).Sddl }
Stop-ScheduledTask -TaskName 'HukukPlatform-API'; Stop-ScheduledTask -TaskName 'HukukPlatform-Web'
$t0=Get-Date; while((Get-NetTCPConnection -State Listen -LocalPort 8080,3002 -ErrorAction SilentlyContinue) -or (Get-Process -Name 'hukuk-task-host' -ErrorAction SilentlyContinue)){ if(((Get-Date)-$t0).TotalSeconds -gt 90){ throw 'surecler 90 s icinde durmadi - DUR' }; Start-Sleep -Milliseconds 500 }
foreach($f in $exp.Keys){ $d=Join-Path $B $f; Copy-Item -LiteralPath (Join-Path $G $f) -Destination $d -Force; if((Get-FileHash -Algorithm SHA256 -LiteralPath $d).Hash -cne $exp[$f]){ throw "geri yazim dogrulanamadi: $f" }; $a=Get-Acl -LiteralPath $d; if($a.Sddl -cne $sd[$f]){ $a.SetSecurityDescriptorSddlForm($sd[$f]); Set-Acl -LiteralPath $d -AclObject $a } }
Enable-ScheduledTask -TaskName 'HukukPlatform-API' | Out-Null; Enable-ScheduledTask -TaskName 'HukukPlatform-Web' | Out-Null
Start-ScheduledTask -TaskName 'HukukPlatform-API'; Start-ScheduledTask -TaskName 'HukukPlatform-Web'
}
```

Ardından D1-5 bloğu geri yön beklentileriyle koşulur: kök `HY_W4_RELEASE22`, BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ`, bin = preimage,
işaret satırları **0 · 0 · 0 · 0 · 0 · DOSYA YOK · 3 · 3 · 5 · 1** (aynı işaret listesi ve sayım yöntemi RELEASE22 kökünde bugün ölçüldü); blokta `$want`/`$bid` geri değerlerle koşulur.

**§5.3 kapsamı — geri ALDIKLARI:** `C:\Ops\hukuk\bin` altındaki 3 dosya — `hukuk-task-host.exe`
`E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` · `start-api.ps1` `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` ·
`start-web.ps1` `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` — sha doğrulamalı kaynaktan
(`HY_C33_RELEASE23_CUTOVER_R28\generations\R22`) bayt-kopya; her dosyanın DACL'i kopyadan ÖNCE okunan SDDL'e geri döndürülür;
`HukukPlatform-API` ve `HukukPlatform-Web` görevleri durdurulur (90 s içinde :8080/:3002 dinleyicisi ve `hukuk-task-host` süreci yoksa DUR),
sonra Enable + Start. Başlatıcılar RELEASE22 köküne işaret ettiği için servisler RELEASE22 ile kalkar.

**§5.3 kapsamı — geri ALMADIKLARI:** RELEASE23 `.env` (kalır; RELEASE22 kendi `.env`'ini kullanır) · RELEASE23 kök ACL'i (`IMMUTABLE_RELEASE`
kalır) · veritabanı (migration yok; koşum ve kullanıcı yazmaları kalır) · paket durum dosyaları (claim, nonce işaretçisi, journal, makbuz) ·
D3 güvenlik duvarı kuralları, Web durumu, `.env` pencere değerleri ve yakalayıcı (**D3 açıksa ÖNCE D3-4**). Bu GO kapsamında **yalnız** motor
çıkışı 3 veya D1-5 teknik kabul düşüşünde ya da D3 açıkken yayın geri dönüşü gerektiğinde (D3-4'ten SONRA) koşulur; ardından D1-5 bloğu geri
yön beklentileriyle koşulur. Başka her kullanım ayrı owner kararıdır.

### 5.4 İ11 kapanış ölçütü ve kabul kaydı

İ11 canlıda **yalnız dört koşulun HEPSİ** sağlanırsa kapanır:

| # | Koşul | Kanıt (çıktı) |
|---|---|---|
| K1 | **Tam İ11 ölçütleri PASS** | §9 `i11-run cikis kodu: 0` · `CL-I11-RUN` kaydı `result: PASS`, `scope: TAM (A-5 · A-6 · review→promote)`, `measurements` PASS **11** · FAIL **0** · ÖLÇÜLEMEYEN **0** · KAPSAM DIŞI **0** |
| K2 | **Bağlantı ve kullanıcı kapanışı doğrulanmış** | `CL-I11-RUN` alanları (`i11-run.js` 241–264): `intakeLinks.anonUsableAfter: 0` (= `linksClosed`; `i11-03-close-links.js` 65) ve `intakeLinks.evidencePreserved: true` · `anonIntakeProbe.before: 200`, `anonIntakeProbe.after: 404` · `closureOk: true` · `verification.loginAfter: 401` · `verification.repeatAlreadyClosed: true` (ikinci `cl-09` çağrısı `alreadyClosed: true` + `usersDeactivated: 0` + exit 0; `i11-run.js` 185–186) · `isolation.equal: true`. Koşum kesildiyse D3-3 kurtarma komutları (`i11-03-close-links.js` `87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740`, `cl-09-close-access.js` `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4`) aynı doğrulamayı vermelidir |
| K3 | **T-PENCERE-KAPA pozitif hedef kanıtı ve çıkış 0** | D3-4 çıktısı `Pozitif hedef kaniti: VAR` + `PENCERE KAPANDI - tum adimlar basarili.` + `T-KAPA cikis=0` (dış blok fırlatmadı). **Sınır (Ek B):** yakalayıcı kaydı ve taban dosyası yabancı SID'lere karşı korunur, `TELLI\ulastelli` ile çalışan yükseltilmemiş süreçlere karşı korunmaz — §7 madde 6a(ii) |
| K4 | **D3-5 PASS** | D3-5 bloğu `D3-5 PASS` (env sha = pin · env sddl = D1-5 tabanı · :8080/:3002 kökü RELEASE23 · kayıttaki iki kesin ad yok · `I11-WINDOW-BLOCK-*` sayımı 0 · `:2526` 0) |

Biri eksikse İ11 **KAPANMAZ**; geri dönüş/kapanış §5.1'e göre tamamlanır, yeni pencere ayrı owner kararıdır (`cl-acc-<runId>` yeniden açılmaz).

**Kabul kaydı:** CLIENT, D3 çıktılarını (D3-0, D3-1 T-PENCERE-AÇ, D3-2 §9/`CL-I11-RUN`, varsa D3-3, D3-4 T-PENCERE-KAPA, D3-5) ve **yerel kanıt
manifestini** (dosya yolu + sha256 listesi; varsa D3-P `KANIT:` satırı) **kendi kapanış kaydına** bağlar. Kayıt PR'ı CI → `--match-head-commit`
ile merge → main senkronu → temizlik (worktree/dal; kanıt dosyaları ve `i11live` silinmez) tamamlandıktan **SONRA** CLIENT sayacı
**10/17 → 11/17** olur. Hizmet kabulü **0/8 tam** kalır.

## 6. Kesinti ve süre

| Pencere | Beklenti | Üst sınır / kural |
|---|---|---|
| D1 cutover (API+Web) | **~15–60 s** (emsaller 14,673 · 13,716 · 57,647 · **39,467 s**; nedeni ölçülmedi) | quiesce 90 s + start 240 s (ayrı); rollback süresi ölçülmemiş; Web BUILD_ID değişir (sekmeler bir kez yenilenebilir) |
| Authority | SEAL'den itibaren 30 dk, tek kullanım | pencere dolarsa §5.1 exit 90/91 satırı |
| D3 bakım penceresi | Web kapalı + :8080/:3002 dışarıya kapalı; API iki restart (aday provası R04 7 s / 6 s · R05 6 s / 6 s) | her restart 180 s; aşımda otomatik tekrar YOK; geçmiş süre garanti değildir (2026-09-11 logon beklemesi 35,5 dk) |

Cutover penceresinde kabul/sentetik tenant koşumu YAPILMAZ (motor V-01 DB snapshot eşitliği rollback tetikler).

## 7. TEK KOŞULLU OWNER GO TASLAĞI (owner kararına)

> **GO — RELEASE23 CANLI YAYIN + CLIENT İ11 TAM CANLI KABUL (TEK KOŞULLU ONAY)**
>
> Referanslar: C33 `OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-<YYYYMMDD>-R01` · İ11 `OWNER-GO-CLIENT-I11-<YYYYMMDD>-R<nn>`
> (gönderim kapsamı `$SendGo` = aynı İ11 ref'i · `$SmtpAck = 'EVET'` · Yöntem T #2644).
> **Onay sınırı:** onay yalnız owner'ın bu metni açıkça "GO" diyerek vermesidir. Tarih/ref/runId/SDDL yer tutucularını doldurmak ONAY
> DEĞİLDİR. K-KİMLİK (madde 4) 3e digest'i hazır olup koşul sağlanmadan kimlik onayı verilmiş SAYILMAZ.
>
> 1. **Sabit kimlikler (tam değer; herhangi bir uyuşmazlıkta DUR):** kaynak `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` · aday kökü
>    `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23` · BUILD_ID `dOiGPj2M0Abls0kCibY4r` · manifest
>    `E53618ED81FF02B43CB03B26656275B860D1C9B399C7D561A75BE0CA17F61AD5` · paket `HY_C33_RELEASE23_CUTOVER_R28` (motor
>    `2AE770435B769A21CFF495BF2224A3385EE27A3DD2E5E6E538D6BB3218DFA927` · owner preflight
>    `0E74F687BEAF55432879BE1E10D40DFB55A223CCED6119E6CC804AC1332E420C` · gerçek primitifler
>    `5DCD12B31D2457DA5B8219E7A004426D0A7C1DB932DA754196B6A8D5E74179D2`) · İ11 §9 `27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700` ·
>    T-AÇ `834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC` · T-KAPA `676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF` ·
>    yakalayıcı `99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800` · `T_ENV_PRE_SHA`
>    `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` · D3-P prova `B643DF51D71BC4012453CCF746CD0ECC4550897701E54346D3DBF9718FBF5803` ·
>    kanonik betik kaynağı main `0e6754b570a0ce6283acf1bb9c1b36da6dc284b7` (#2666 R09 · #2668 R10). Geri dönüş: RELEASE22 @ `137406701248858221d12be94a941f8837a2a245`,
>    bin preimage `E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` / `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` /
>    `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D`. Kalan kimlikler §1'dedir; §1.5 GEÇERSİZ listesindekiler kullanılmaz.
>    **B11 (#2655 @ `78f49dd3`) adayda YOKTUR** ve bu GO ile yayına alınmaz.
> 2. **Bağımsız doğrulama (ana yürütücü; owner GO 2026-09-13 ataması bu yürütmede sürer):** (i) D1-1'den hemen önce §1.3 R28 araçları ve
>    §1.4 geri dönüş pinlerinin **yeniden ölçümü**, (ii) D1-3/3e'de OR-03a digest'inin **bağımsız hesabı**, (iii) D3-0'dan önce §1.5 pinlerinin
>    main `0e6754b5` + kanonik ağaçta yeniden ölçümü. Sonuçlar kayda yazılmadan sıradaki adıma geçilmez.
> 3. **D1 (OFFICE/C33; owner yükseltilmiş WinPS 5.1 penceresinde koşar):** D1-1 preflight `OWNER_PREFLIGHT_READY` → D1-2 `-Live`
>    `REAL_PRIMITIVES_PASS` (live) → D1-3 3a–3f → D1-4 tek OWNER-RUN komutu → D1-5 teknik kabul (§4 beklenenleri birebir) ve devir makbuzu
>    (`env sha=` ve `env sddl=` satırları dahil). Her adım yalnız öncekinin beklenen sonucuyla başlar.
> 4. **K-KİMLİK (3e onayı yalnız şu koşulla geçerlidir):** OR-03a digest'i OFFICE 33 ve ana yürütücü tarafından bağımsız hesaplanır ve
>    **eşittir**; onaylı liste ile `PACKAGE-IDENTITY.json` (§1.3 tam sha) listesi arasında dosya kümesi AYNIDIR ve sha farkı YALNIZ
>    `qualification/REAL-PRIMITIVES-RESULTS.json`, `fork/templates/OWNER-COMMAND.C33-CUTOVER.forked.ps1`,
>    `qualification/OWNER-COMMAND-TEMPLATE-RESULTS.json` dosyalarındadır (OWNER-RUN OR-03b kimlik dışı kuralları aynen). Aksi hâlde DUR ve
>    fark owner'a sunulur. **3e digest'i hazır olmadan kimlik onayı verilmiş sayılmaz.**
> 5. **D2 kapısı (CLIENT):** canlı dist'te `redactSecretPathSegments` satır 3 ve D1-5 `env sha=` = `T_ENV_PRE_SHA`
>    (`7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC`); §9 K-API/K-BLD canlı RELEASE23'e karşı geçer; aksi hâlde D3 başlamaz.
> 6. **D3 (CLIENT yönetir; yükseltilmiş `pwsh` 7 penceresini owner sağlar ve blokları owner yapıştırarak koşar; tek yürütücü; karışık kabuk
>    zinciri yok; D3 süresince kanonik ağaçta git işlemi yok; bloklar GitHub main'deki R03 metninden alınır ve sha/pin §1 ile gözle
>    karşılaştırılır):** D3-0 (sha kapısı · `i11live` yok · yakalayıcı + kayıt · K-PAR ön-kontrolü **0**) → D3-1 T-AÇ (pin; çıkış kodu aktarımlı)
>    → D3-2 İ11 §9 (gönderim AÇIK) **TEK KEZ** → gerekirse D3-3 kurtarma (runId) → D3-4 T-KAPA (aynı pin; çıkış kodu aktarımlı; `T_RUNID` =
>    §9 runId) — D3-1 çıktısında **K-T0 kapanış satırı varsa her sonuçta**, yoksa yalnız D3-S → D3-4 `T-KAPA cikis=0` ise D3-5. Çocuk çıkış
>    kodu ≠ 0 olduğunda dış blok fırlatır ve kabul adımlarına geçilmez. Bakım penceresidir (Web durur, bu pencerenin iki kesin adlı engel
>    kuralı :8080/:3002 dış erişimini kapatır); her restart bütçesi 180 s; aşımda otomatik tekrar YOK.
> 6a. **Owner kabulleri (bu GO ile):** (i) T-KAPA R-T4a/R-T4b'nin ve T-AÇ K-T6 kesin-ad kural oluşturmanın **gerçek işlem** kanıtı yoktur:
>    kanıt kaynak + AST + bellek-içi harness 11/11 (PS 7 + 5.1) + tam pencere provaları (bu adımlar provada koşmaz). **§4 D3-P owner
>    koşumu PASS verirse (i) düşer**, K-T6 oluşturma yolu için ise kaynak kanıtı kalır.
>    (ii) **Ek B güven sınırı:** `TELLI\ulastelli` ile çalışan yükseltilmemiş süreçler; yedeğe, SDDL tabanına, taban dosyasına, `FW-RULES.txt`'e
>    ve yakalayıcı kaydına yazabilir. Canlı `.env` pin + güven denetimiyle korunur (kötü yedek geri yazılmaz → erişilebilirlik kaybı, §5.1).
>    SDDL tabanı sahteciliğini ve kalan engel kuralını D3-5 yakalar. **K-T10b "Pozitif hedef kanıtı" ve R-T6 alıcı denetimi bu süreçlere
>    karşı KORUNMAZ** — bu süreçlerin D3 boyunca bu dosyalara yazmadığı varsayılır.
>    Owner (i)'yi ya da (ii)'yi kabul etmezse D3 başlamaz (D3-P koşumu / ek sertleştirme ayrı karar ve yeni belge sürümü).
> 7. **Kapanış/geri dönüş (§5.1 bu GO'nun parçasıdır):** exit 2/3 veya D1-5 düşerse D3 İPTAL ve RELEASE22'ye dönüş doğrulanır.
>    **§5.3 elle yol** bu GO kapsamında **yalnız** exit 3, D1-5 düşüşü ve D3 açıkken yayın geri dönüşü (ÖNCE D3-4, SONRA §5.3) için koşulur;
>    kapsamı bin 3 dosya + iki görev (sha + ACL korumalı) — `.env`, kök ACL, DB, paket durum dosyaları ve D3 kuralları geri alınmaz (§5.3).
>    exit 1 sonrası OWNER-COMMAND'ın doğrudan koşulması, exit 70 sonrası her adım, T-KAPA R-T1 "güvenilir değil / pine eşit değil" sonrası
>    elle `.env` müdahalesi, T-KAPA sha uyuşmazlığında bayt-kopya ile koşum, R-T4a kalıcı hatasında kuralın kesin adıyla elle kaldırılması ve
>    R-T7/D3-5 SDDL farkının düzeltilmesi **ayrı owner kararıdır**. Otomatik reseal/tekrar YOK; tüketilen ref/nonce yeniden kullanılmaz.
> 8. **Kapsam dışı:** migration · bayrak · ikinci API süreci · gerçek kişiye gönderim · başka tenant'a yazma · joker kural silme ·
>    `i11live` yedeğinin ve `CL_TOKENFIX` artığının silinmesi · RELEASE22 kökünde değişiklik · #2655 B11'in yayına alınması.
>
> **Yürütücü sorumlulukları:** owner — ref'ler, yükseltilmiş pencereler, D1-1/D1-2/D1-4, D3 bloklarının yapıştırılması, D3-P (isteğe bağlı),
> ayrı karar gerektiren her adım · OFFICE 33 — D1-3 3a–3f yazımı, D1-5 ve D3-5 değerlendirmesi, D3-0 bloğu, bu belge · ana yürütücü — madde 2
> bağımsız doğrulama, hat boşluğu teyidi · CLIENT — D2 kapısı, D3 sırası ve her D3 çıktısının doğrulanması, §5.4 kabul kaydı.
>
> **IF GO-COMPLETE:** RELEASE23 canlı (`C33_RELEASE23_CUTOVER_APPLIED_AND_VERIFIED` + D1-5 PASS) · İ11 §5.4 **K1–K4 hepsi** sağlandı (tam İ11
> PASS 11/0/0/0 TAM · bağlantı/kullanıcı kapanışı doğrulandı · D3-4 `Pozitif hedef kaniti: VAR` + `tum adimlar basarili` + `T-KAPA cikis=0` ·
> `D3-5 PASS`) · CLIENT D3 çıktıları + yerel kanıt manifestini kapanış kaydına bağladı; CI/merge/main senkronu/temizlik tamamlandı → sayaç
> 10/17 → **11/17** · hizmet kabulü **0/8 tam** · `CL_TOKENFIX` ayrı açık kalem.

## 8. Açık kalemler (kapatılmış gösterilmez)

| Kalem | Durum |
|---|---|
| **`CL_TOKENFIX` disk artığı** (`C:\Development\HY_WT\CL_TOKENFIX`) | **AYRI AÇIK KALEM** (CLIENT) — git kaydı 0, yalnız disk; kancayı aşacak alternatif silme yolu denenmedi ve denenmeyecek; seçenek (a) owner siler (b) kancayı tetiklemeyen yola açık onay |
| `i11live` yedek dizini (D3 sonrası CLIENT oturum dizininde canlı `.env` kopyası + `FW-RULES.txt`; sır taşır) | R07/R09: pencere başına yeni, korumalı (SYSTEM + Administrators + yürütücü); T-AÇ'ın tekrar-açma kilidi; **silme owner kararı** |
| T-KAPA R-T4a/R-T4b gerçek işlem · T-AÇ K-T6 kesin-ad oluşturma | hiçbir modda koşulmadı — **D3-P owner koşumu YOK** (PASS → §7 madde 6a(i) düşer; K-T6 oluşturma için kaynak kanıtı kalır) |
| Ek B güven sınırı (yürütücü hesabı güvenilir kümede; K-T10b/R-T6 bu süreçlere karşı korunmaz) | §2.3 · §5.2 — §7 madde 6a(ii) owner kabulü; isteğe bağlı sertleştirme (Ek B B.5 a/b) karar şart değil, yapılırsa yeni hash + yeni belge sürümü |
| R-T4a kalıcı hatasında kesin adlı kuralın elle kaldırılması | §5.1 — ayrı owner kararı; joker silme hiçbir koşulda yok |
| main ≠ aday — #2655 B11 @ `78f49dd3` | RELEASE23'te YOK (sabit aday); yayını ayrı aday/ayrı karar |
| K-KİMLİK (OR-03a) | **BEKLEMEDE — onay verilmiş SAYILMAZ**; 3e girdileri canlı GO içinde doğar; ana yürütücü (owner ataması) bağımsız hesaplar (#2661 §1.4); `PACKAGE-IDENTITY.json` bu sürümde R28 §11 notu nedeniyle yeniden üretildi (§1.3) — madde 2(i) yeniden ölçümü bunu kapsar |
| PRE-06 / OP-05c · OP-08a/09d/09e | yalnız D1-1 yükseltilmiş oturumda ölçülür; NOT_MEASURED PASS sayılmaz |
| OFFICE AK paketi K-BLD pinleri | RELEASE22'ye bağlı (`lawyer.service.js` `427DB2F1…`); RELEASE23'te `29812F1C…` → paket DURUR (beklenen; AK kabulü KAPALI, yeniden koşulmaz) |
| İ12 | başlatılmadı |

---

**Canlı değişiklik yok.** CLIENT sayaç **10/17**; hizmet kabulü **0/8 tam**.
