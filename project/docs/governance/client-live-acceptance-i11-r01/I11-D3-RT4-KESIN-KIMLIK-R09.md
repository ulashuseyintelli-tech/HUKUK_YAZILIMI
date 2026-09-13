# CLIENT İ11 — R-T4a KESİN KİMLİK / DAR KOMUT DÜZELTMESİ (R09)

```text
BELGE    : I11-D3-RT4-KESIN-KIMLIK-R09   (R08 supersede edildi; T-AÇ ve T-KAPA yeniden pinlenir; §9 DEĞİŞMEDİ)
TETİK    : owner GO "RELEASE23 R02 / SON DAR KOMUT DÜZELTMESİ" (OFFICE 33 aktardı → CLIENT owner'a bu oturumda
           DOĞRUDAN sordu, teyit aldı, sonra başladı; aktarılan onay tek başına yetki sayılmadı)
YETKİ    : aynı GO madde 1 (CLIENT, t-window-*.ps1 yazıcısı) + madde 3 pin/doğrulama yenileme
ORTAM    : yalnız oturuma özel DB + Redis + yerel yakalayıcı + RELEASE23 aday dist; canlıya DOKUNULMADI
           (canlıda yalnız salt-okuma: .env sha, dinleyici/görev/kural sayımı)
DURUM    : R-T4a kesin kimliğe bağlandı; senaryo mantığı 11/11 ÇALIŞTIRILARAK doğrulandı; refactored T-KAPA
           regresyonu PASS; GERÇEK FIREWALL izole provası owner'ın tek yükseltilmiş komutu · canlı kabul YAPILMADI
```

## 0. R08 neden supersede edildi

R08 (#2665, KAPATILDI/CLOSED_SUPERSEDED) R-T4a'yı hâlâ **joker** ile yapıyordu (`Get/Remove -DisplayName 'I11-WINDOW-BLOCK-*'`). Owner GO bunu dört ilkeyle daralttı:

1. **Kesin kimlik** — yalnız bu pencerenin oluşturduğu iki kuralın kesin adı.
2. **Joker yok** — hiçbir `-DisplayName *` toplu sorgu/silme.
3. **Sorgu/erişim hatası ≠ yokluk** — yalnız `ObjectNotFound` "zaten yok" (başarı); diğer her hata başarısızlık.
4. **Başka kurala dokunma** — kayıttaki adlar dışına çıkma; kayıt yok/güvenilmez/bozuksa R-T4a başarısız, joker yedeği yok.

## 1. Değişiklikler

| Bileşen | Değişiklik |
|---|---|
| **T-AÇ K-T0/K-T6** (live) | Pencereye özel benzersiz iki ad `I11-WINDOW-BLOCK-<8080\|3002>-<yyyyMMddTHHmmssZ(UTC)>-<8hex>`. **B1:** adlar + korumalı `i11live\FW-RULES.txt` **K-T0'da** (kurallardan ve K-T6'dan önce) yazılır — böylece "K-T0 geçti ⇒ kayıt var". K-T6 yalnız plandan `New-NetFirewallRule -Name <ad>` oluşturur + özellik doğrular (DisplayName · Inbound · Block · LocalPort); aynı adlı kural varsa DUR. |
| **T-KAPA R-T4a** | `Invoke-WindowRecoveryRT4(-FwRecordFile ...)` tek fonksiyonu. Kayıt trust denetimi (`Get-TrustProblem`); yok/güvenilmez/bozuk → başarısız, joker yedeği yok. **Her kesin ad kendi try'ında**: `Get-NetFirewallRule -Name <ad> -ErrorAction Stop` → `ObjectNotFound`=ABSENT (başarı), diğer hata=başarısız; özellik uyuşmazsa DOKUNMA; `Remove -Name <ad> -ErrorAction Stop` + yeniden sorgu ABSENT. Bir adın hatası diğerini atlatmaz; hatalar toplanır. **B2:** her ad `-NamePattern`'e uymalı, addaki port kayıt portuyla eşit, ad tekrarı yok — kurcalanmış kayıt ilgisiz kural sildiremez. |
| **T-KAPA R-T4b/R-T5/R-T6/R-T7** | Değişmedi; R-T4a düşse de her biri kendi try'ında koşar (R05 hata yolu korunur). |
| Canlı çağrı | `Invoke-WindowRecoveryRT4 -FwRecordFile $FwRecord -NamePattern '^I11-WINDOW-BLOCK-(?<port>8080\|3002)-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$' -WebTask 'HukukPlatform-Web' -WebPort 3002 -Budget $BudgetSec -ErrList $rt4Err` |

Kasıtlı değişmeyenler: K-ELEV · T-PIN · K-T0/K-T0a yedek bütünlüğü · K-T7/K-T8 bayt düzeyinde env · §9 bloğu (`27E754A7…`) · yakalayıcı `smtp-sink-noauth.js`.

## 2. Güven sınırı — ÖLÇÜLDÜ (değişmedi)

CLIENT oturumu **yükseltilmemiş** (`New-NetFirewallRule` → Erişim engellendi). R-T4a'nın **gerçek-firewall** PASS'i yalnız owner'ın yükseltilmiş penceresinde doğar (§4 tek komut). Bu oturumda kanıtlanan: senaryo mantığı (bellek-içi, 11/11) + refactored T-KAPA'nın paylaşılan adımlarının regresyonu (prova). Gerçek görev+port yolu (R-T4b) R08 dev koşumunda görülmüştü; R09'da R-T4b mantığı aynı, gerçek işlem owner komutunda.

## 3. Kanıt — kesin-kimlik senaryo mantığı (bellek-içi, iki kabuk)

`t-rt4-logic-harness.ps1` (sha `998A127B…`): üretim fonksiyonunu `t-window-close.ps1`'den (sha `676C1542…`) AST ile alır; firewall/görev/port cmdlet'lerini ve `Get-TrustProblem`'i bellek-içi sahteler. **`Get-NetFirewallRule -DisplayName` her senaryoda YASAK** (joker denetimi). Her senaryoda "başka kural" tanıkları (aynı DisplayName'li farklı ad + ilgisiz) dokunulmamış doğrulanır.

| Senaryo | Sonuç | Gözlem |
|---|---|---|
| S1 başarı | PASS | kaldırılan 2, zaten yok 0 · web ayakta · iso 0 |
| S2a kısmi hata (1. ad silinemez) | PASS | o ad başarısız, **2. ad kaldırıldı** (iso 1), R-T4b koştu |
| S3a tekrar (zaten yok güvenle geçilir) | PASS | kaldırılan 1, zaten yok 1 |
| S4 idempotent (ikisi de yok) | PASS | kaldırılan 0, zaten yok 2 |
| S2b R-T4b hata | PASS | R-T4a 2 kaldırdı, R-T4b bütçe dolunca başarısız |
| S5 sorgu/erişim hatası ≠ yokluk | PASS | `PermissionDenied` → başarısız (yoklukla karışmaz), **diğer ad kaldırıldı** |
| S6 özellik uyuşmaz | PASS | o ada DOKUNULMADI (iso 1), diğer ad kaldırıldı |
| S7 kayıt dosyası yok/güvenilmez | PASS | R-T4a başarısız, **joker yedeği YOK**, hiçbir kurala dokunulmadı, R-T4b koştu |
| S8 kayıt biçimi bozuk | PASS | R-T4a başarısız, dokunma yok |
| S9 ad deseni geçersiz (B2) | PASS | kayıttaki ad `-NamePattern`'e uymuyor → başarısız, dokunma yok |
| S10 addaki port ≠ kayıt portu (B2) | PASS | port tutarsızlığı → başarısız, dokunma yok |

**PASS 11/11**, PS 7.6.5 ve PS 5.1.26100. Dört ilke: kesin kimlik (S6) · joker yok (her senaryoda DisplayName sorgusu yasak) · sorgu hatası ≠ yokluk (S5) · başka kurala dokunma (tanıklar + S7 + S9/S10 kayıt bütünlüğü).

## 4. Owner'a tek komut — R-T4a/R-T4b gerçek işlem izole prova (YÜKSELTİLMİŞ pwsh 7)

**Yükseltilmiş PowerShell 7 (`pwsh`) penceresinde** yapıştırılır. Komut, betiği çalıştırmadan **önce sha doğrular** (kanonik ağaç `ulastelli` süreçlerine yazılabilir olduğundan — ana yürütücü Ek B ölçümü); uyuşmazsa hiçbir şey koşmaz.

```powershell
& { $f='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\t-rt4-isolated-rehearsal.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'B643DF51D71BC4012453CCF746CD0ECC4550897701E54346D3DBF9718FBF5803'){ throw 'RT4S SHA UYUSMUYOR - DUR' }; $pw=(Get-Command pwsh -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source; $global:LASTEXITCODE=-999; & $pw -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'RT4S cikis=' + $rc; if($rc -ne 0){ throw "RT4S PASS DEGIL (cikis=$rc)" } }
```

- **Dış sha kapısı** betiğin kendisini doğrular (yukarıdaki komut). **İç kapılar** betiğin içinde: `t-window-close.ps1` `676C1542…` sha + fonksiyon AST özdeşliği + canlı çağrı satırı denetimi.
- **Çıkış kodu (A4):** `$global:LASTEXITCODE=-999` ön-değeri bayat değeri engeller; `pwsh` mutlak yolla çağrılır; `$rc ≠ 0` ise komut `throw` eder (PASS değilse owner'a görünür).
- **Dinleyici DOSYASIZ (ön inceleme bulgusu 2):** görev eylemi bir `.ps1` yolu çalıştırmaz; dinleyici kodu **`-EncodedCommand`** ile görev tanımına gömülür (yükseltilmiş `Register-ScheduledTask` kaydıyla korunur). Üst zincir korumalı `RT4S-<runId>`'yi yeniden adlandırsa bile görev, değiştirilmiş bir kod dosyası çalıştıramaz. `WEB-FAIL.flag` yalnızca veri dosyasıdır (kod değil).
- **`$OutDir` sertleştirmesi (bulgu 1):** `-Force` YOK — önceden yerleştirilmiş yabancı sahipli dizin kabul edilmez (varsa DUR); oluşturulur → `Set-TrustedAcl` (SYSTEM+Administrators+yürütücü) → `Get-TrustProblem` boş → `Get-ChildItem` 0; aksi halde DUR. Log/JSON/`FW-RULES.txt` bu korumalı dizinde doğar.
- **Tek okuma (bulgu 3):** `t-window-close.ps1` bir kez okunur; sha o metinden hesaplanır ve **aynı metin** `ParseInput` ile ayrıştırılır (hash-sonra-tekrar-oku aralığı kapatıldı).
- **Enjeksiyon özyineleme-güvenli (R10):** S2a/S5 hata enjeksiyonu, gerçek cmdlet'i `& $FunctionInfo` ile değil **modül-nitelikli** (`NetSecurity\Remove-NetFirewallRule` / `NetSecurity\Get-NetFirewallRule`) çağırır. Modül-nitelikli çözümleme fonksiyon-kapsam gölgesine dönmez → özyineleme yok. İki kabukta ölçüldü: enjekte ad → `PermissionDenied`, yok ad → `ObjectNotFound`, yığın taşması yok.
- **İzole hedefler:** `HYRT4S-<runId>-BLOCK-<port>` (I11-WINDOW-BLOCK-* ile çakışmaz), görev `HYRT4S-<runId>-WEB`, port 47100–47199. Kayıt `FW-RULES.txt` korumalı. **Dokunulmama tanıkları:** aynı DisplayName'li başka-ad kuralı + ilgisiz WITNESS kuralı; her senaryoda değişmediği doğrulanır.
- **9 senaryo** gerçek firewall/görev/port ile: S1 başarı · S2a kısmi hata · S3a tekrar (zaten yok) · S2b R-T4b hata · S3b R-T4b toparlanma · S4 idempotent · S5 sorgu hatası≠yokluk · S6 özellik uyuşmaz · S7 kayıt yok. (Kayıt **biçim bozuk / ad deseni geçersiz / port uyuşmaz** yalnız §3 mantık harness'ındadır — S8/S9/S10; izole provada bu üç kayıt-bütünlüğü dalı ayrıca koşulmaz.)
- Önce/sonra: canlı görev durumu + 8080/3002 PID + I11-WINDOW-BLOCK-* sayısı; sonda `ESIT` ve artık 0 doğrulanır. Çıktı sır içermez. PASS = 9/9 + artık 0 + canlı eşit, çıkış 0.
- Owner çalıştırmazsa gerçek-firewall PASS açık kalır; §7 madde 6a(i) owner kabulü bu boşluğu kapatan alternatiftir.

## 5. Yeni ve değişmeyen hash'ler (madde 3)

| Öğe | R08/R07 → R09 |
|---|---|
| T-PENCERE-AÇ `t-window-apply.ps1` | `ED64A751…` → **`834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC`** (K-T6 kesin ad + FW-RULES.txt) |
| T-PENCERE-KAPA `t-window-close.ps1` | R07 `3F027B0D…` / R08 `88BCEA01…` → **`676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF`** |
| İ11 §9 gömülü blok | **DEĞİŞMEDİ** `27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700` |
| `t-rt4-isolated-rehearsal.ps1` | `B643DF51D71BC4012453CCF746CD0ECC4550897701E54346D3DBF9718FBF5803` |
| `t-rt4-logic-harness.ps1` | `998A127B0B59CFB1ACFE1D2D5BD5EDB83AFA749EAC750EC81BEC049DDFD4C731` |

İki T betiği: yalnız ASCII, LF; PS 5.1.26100 + PS 7.6.5 ayrıştırma hatası 0.

**T-AÇ + T-KAPA değişikliğinin etki alanı — OFFICE 33 (R02 yazıcısı) yenilemeli:** `RELEASE23-TEK-NIHAI-PAKET-R02.md`'de D3-0 `$want` sözlüğü (t-window-apply **ve** t-window-close sha'ları), D3-1 T-AÇ pini, D3-4 T-KAPA sha kapısı ve tablo satırı, §1.5, §7 madde 1, §5.1 sha-uyuşmazlık satırı → yukarıdaki değerler. §9 pini değişmedi. D3-0 zaten `i11live` oluşturmaz; K-T6'nın kesin-ad + FW-RULES.txt üreteceğini D3-1 beklenen sonucuna eklemek yerinde olur.

## 6. Regresyon — refactored T-KAPA tam pencere döngüsü (prova, İKİ KABUK)

Betik sha'sı değiştiği için tam döngü **iki kabukta** koşuldu (ana yürütücü ön inceleme bulgusu 3: R02 D3 `pwsh -File` çağırır). R-T4a/R-T4b `live`-özel olduğundan prova onları çalıştırmaz; bu döngü paylaşılan adımların (K-T0/K-T8/R-T1/R-T2/R-T3/R-T5/R-T6/R-T7) gerilemediğini, R-T4a/R-T4b **fonksiyon mantığı** ise §3 harness'ıyla iki kabukta doğrular.

Tam döngü, **final sha'larda** iki kabukta koşuldu. R-T4a/R-T4b `live`-özel olduğundan prova onları çalıştırmaz; bu döngü paylaşılan adımların (K-T0 FW kaydı dahil / K-T8 / R-T1 / R-T2 / R-T3 / R-T5 / R-T6 / R-T7) gerilemediğini, R-T4a/R-T4b **fonksiyon mantığı** ise §3 harness'ıyla iki kabukta 11/11 doğrular.

| Kabuk | T-AÇ (`834DF587…`) | İ11 §9 | T-KAPA (`676C1542…`) |
|---|---|---|---|
| Windows PowerShell 5.1 (`-File`) | çıkış 0 · K-T0 FW kaydı · restart 7 sn | runId **5b3e7c0b** PASS 11/0/0 TAM | K-T10b VAR · R-T1=pin · R-T2 7 sn · R-T3 özgün · `tum adimlar basarili` · çıkış 0 |
| PowerShell 7 (`pwsh -File`) | çıkış 0 · K-T0 FW kaydı · restart 6 sn | runId **6a50e907** PASS 11/0/0 TAM | aynı adımlar · çıkış 0 · env = pin |

**Kanıt (scratchpad):** `t-rt4-logic-harness.ps1` çıktısı (**11/11**, iki kabuk); regresyon `i11s/r07window/R09C-*` (5.1) ve `R09D-*` (pwsh 7). Aday köküne yazma 0 (nöbetçi 88.248/13.600, değişen 0). Canlı: `.env` `7A7228B1…`, :8080 46332, :3002 47004, I11-WINDOW 0, HYRT4S artık 0, görevler Running.

## 7. Devir (mevcut ortak pakete göre)

- **CLIENT payı tamam:** R08 kapatıldı, R09 kesin-kimlik + izole prova + mantık 11/11 + regresyon; pinler yenilendi.
- **OFFICE 33 (R02 yazıcısı):** §5'teki pin/ifade satırlarını günceller; madde 2 (D3-4 çağrı bloğu + §5.2) ve madde 3 (kapanış ölçütü) kendisinde.
- **Owner:** §4 tek komutu yükseltilmiş pencerede koşarsa R-T4a gerçek-firewall PASS'i doğar; koşmazsa §7 madde 6a(i) kabulü geçerli.
- **CLIENT kapanış kaydı (madde 3):** İ11 canlı kabulü yapıldığında D3 çıktıları ve yerel kanıt manifesti CLIENT kapanış kaydına bağlanır; CI/merge/senkron/temizlik sonrası sayaç 11/17. Bu belge o kaydın kanıt zincirini hazırlar.

## 8. Açık kalemler ve sınırlar

- **R-T4a gerçek-firewall PASS:** yükseltilmiş owner komutu (§4) koşulana dek AÇIK. Mantık 11/11 + AST özdeşliği ile desteklenir.
- **`{}` artığı** (`C:\Development\HUKUK_YAZILIMI\project\{}`): önceki oturum yan etkisi, DOKUNULMADI, silme owner kararı.
- **CL_TOKENFIX** disk artığı: ayrı açık kalem, DOKUNULMADI.
- `i11live` / prova yedek dizinleri sır taşır (korumalı): silme owner kararı.
- **Kayıt dosyası kalan riski (ön inceleme bulgusu 4):** güvenilir kümedeki (`ulastelli`, Ek B) bir süreç `FW-RULES.txt`'teki adları değiştirirse R-T4a yanlış adları "zaten yok" sayıp hatasız biter, gerçek `I11-WINDOW-BLOCK-*` engeli kalabilir. Bunu **OFFICE D3-5'in bağımsız salt-okuma `I11-WINDOW-BLOCK-*` sayımı** (0 olmalı) yakalar; ek çapa: T-AÇ K-T6 çıktısındaki kesin adlar owner konsolunda görünür. FW-RULES.txt korumalı olsa da güvenilir küme yazabilir — bu kabul edilen kalan risktir; D3-5 sayımı R02/R03'te korunmalı (OFFICE 33'e iletildi).
- **Kapsam notu (bulgu 5):** T-AÇ K-T6'nın yeni kesin-ad oluşturma yolu `live`-özeldir, hiçbir provada koşmaz (prova K-T6 atlanır); mantık §3 harness'ında, gerçek işlem §4 owner komutunda ölçülür. Prova bütçesi 12 sn, üretim 180 sn (aynı kod yolu, `-Budget` parametresi).
- İ12 başlatılmadı; İ11 canlı kabulü yapılmadı. Sayaç **10/17**, hizmet kabulü **0/8 tam**.
