# RELEASE23 / R28 — ANA YURUTUCU BAGIMSIZ DOGRULAMASI VE R02 HAZIRLIK KONTROLU (R01)

```text
BELGE     : RELEASE23-R28-BAGIMSIZ-DOGRULAMA-R01
YETKI     : owner GO 2026-09-13 "R28 bagimsiz dogrulama ve R02 hazirlik kontrolu" — ana yurutucu R28 bagimsiz
            dogrulayicisi olarak owner tarafindan DOGRUDAN atandi (akran talebiyle DEGIL)
KONU      : R28 cutover paketi HY_C33_RELEASE23_CUTOVER_R28 (repo disi, MUHURSUZ) · CLIENT I11 D3 duzeltmeleri
            #2657 @ 88b3d07a (R05) ve K-PAR kalinti duzeltmesi #2660 @ af79b50c (R06) · OFFICE 33 R02 taslagi #2659
            (ilk inceleme 810624af, bu kaydin dayandigi head 1ce1cc54; sonraki head'ler bu kaydin DISINDA)
URETICI   : paketleri OFFICE 33 (C33/D1, R02) ve CLIENT (I11/D3) uretti. Bu belge yalniz bagimsiz dogrulamadir: onlarin
            dosyalarina yazilmadi, PR'lari devralinmadi, ikinci paket veya ikinci GO taslagi uretilmedi
YONTEM    : SALT OKUMA — diskten sha256 · Get-Acl (yalniz guvenlik tanimlayicisi) · PowerShell AST · desen eslestirme ·
            surec/dinleyici okuma. `.env` icerigi OKUNMADI (yalniz sha256). Olcum 2026-09-12T21:48Z–22:31Z
YAPILMADI : yayin · -Live · muhur · authority/nonce · cutover · T-pencere · canli veya yukseltilmis prova · CLIENT canli
            kosumu · OR-03a digest hesabi (nihai 3e girdisi yok)
K-KIMLIK  : BEKLEMEDE — tamamlanmis SAYILMAZ (§1.4)
```

## 0. Ozet

| GO maddesi | Sonuc |
|---|---|
| 1 — R28 arac hash'leri + geri donus pinleri | **ESIT** — R02 @ 1ce1cc54 §1'e karsi 44/45; tek fark beklenen `.env` istisnasi (§1.1) |
| 1 — OR-03a / K-KIMLIK | **BEKLEMEDE** — nihai 3e girdileri yok; digest HESAPLANMADI |
| 2 — K-PAR yakalayiciyi bozmamali | **KARSILANDI** — R05 kalintisi (`smtp-sink.jsonl` alt dizgisi) R06 ile kapandi; desen iki PowerShell surumunde 11/11 (§2.1) |
| 2 — T-KAPA hata yolunda engel kurali ve Web | **AKIS KARSILANDI · CALISMA KANITI EKSIK** — R-T4a/R-T4b hicbir modda kosmadi (§2.2) |
| 2 — yukseltme kapisi ilk degisiklikten once | **KARSILANDI** (§2.3) |
| 2 — `ENV-PREIMAGE.env` sir icerigine uygun ACL ile olusturulma ve korunma | **KISMEN — KARSILANMADI** — dosya DACL'i dogru; olusturma penceresi, korumasiz ust dizin zinciri ve geri yazmada butunluk kontrolu yok (§2.4) |
| 3 — R02: D1 ve D3 bagimliliklari · B11 aday disi | **DOGRU** (§3) |
| 3 — R02: basarisizlikta toparlanma | **BUYUK OLCUDE DOGRU · eksikler var** (§3) |
| 3 — R02: durum ifadeleri | **ESKIMIS** — "rol atanmadi / §1 olculmedi" ifadeleri artik gecersiz (§3) |

## 1. GO madde 1 — R28 arac hash'leri ve geri donus pinleri

### 1.1 §1.1–§1.4 diskten yeniden olcum

| Kosum | Beklenen degerlerin kaynagi | Sonuc | Kanit |
|---|---|---|---|
| S1 · 2026-09-12T21:48:22Z | R01 §1 (#2656 metni) | 43/45 ESIT · 2 fark: (a) R22 kok ters yonde fazla `project/apps/api/.env` · (b) `PACKAGE-IDENTITY.json` `E2CD1F9F…` ≠ belge `4A44BAD7…` (belge eskiydi; #2658 guncelledi) | `r28-verify-s1-evidence.json` |
| S1b · 2026-09-12T22:17:59Z | R02 @ 810624af §1 | 44/45 ESIT · tek fark (a) | `r28-verify-s1b-evidence.json` |
| S1c · 2026-09-12T22:30:52Z | R02 @ 1ce1cc54 §1 | **44/45 ESIT** · tek fark (a) | `r28-verify-s1c-evidence.json` |

| Bolum | Olculen | Sonuc (S1c) |
|---|---|---|
| §1.3 | motor · owner preflight · Test-RealPrimitives · Seal · Verifier · OWNER-COMMAND / OWNER-RUN sablonlari | ESIT: `2AE77043…A927` · `0E74F687…420C` · `5DCD12B3…79D2` · `650971A5…588B` · `1260E1FF…EABD` · `894BB522…3D2D` / `A24C04FD…842D` (uc kosumda da degismedi) |
| §1.3 | paket kimligi literali `HY_C33_RELEASE23_CUTOVER_R28` | motor, OWNER-COMMAND sablonu ve verifier'da MEVCUT |
| §1.3 | muhursuzluk | `pins/` `authority/` `claims/` `journal/` `cutover-receipts/` `preflight/` `MANIFEST.json` ve kokte `OWNER-RUN*`/`OWNER-COMMAND*` YOK |
| §1.3 | `PACKAGE-IDENTITY.json` | ESIT `77889A6E04BC3BE480FAA147938222BDC1C92D43F907DE31FB72B5224B8A52BC` (producedUtc 2026-09-12T22:26:46.263Z). Zincir: `4A44BAD7…` → `E2CD1F9F…` → `FC558DC4…` → `77889A6E…`; paket belgeleri 50 dosyalik listede oldugu icin her belge duzenlemesiyle yeniden uretilir. Icerik: `engineSha256` = motor · `sealed`/`authorityProduced`/`nonceProduced` false · `approvedIdentity` null · `preLiveListDigest.fileCount` 50, not "ONAY ADAYI DEGIL". `files[]` 50 girdinin **50'si diskle ESIT** |
| §1.4 | R22 HEAD · BUILD_ID · manifest · `.env` sha (icerik okunmadi) | ESIT: `137406701248858221d12be94a941f8837a2a245` · `xJZ1G1TsbOnHoWUzMD8CQ` · `26B31B69…1869` · `7A7228B1…FDDC` |
| §1.4 | canli `C:\Ops\hukuk\bin` = `generations\R22` preimage · `generations\R23` postimage | 3 + 3 ESIT (`E744A74B…` / `77B6FBCD…` / `1B7654F6…` · `691BC146…` / `CC634BBF…` / `F39F7A54…`) |
| §1.4 | R22 koku tam yeniden hash (her iki yon) | 88.178/88.178 esit · manifestte olup diskte olmayan 0 · uyusmaz 0 · **diskte olup manifestte olmayan yalniz `project/apps/api/.env`** |
| §1.1 / §1.2 | aday HEAD · BUILD_ID · `main.js` · aday kokunde `.env` YOK · izlenen kirli 0 · makbuz · manifest · ordinal · R09 profili · candidateDigest | hepsi ESIT |
| kayit | `RELEASE23-R28-CUTOVER-PAKETI-R01.md` (PR #2659 @ 1ce1cc54) ↔ disk `docs\LIVE-APPROVAL-PACKAGE-R28.md` | bayt-esit `216D8147698B1A1D4D8EEB259FE04003BA88B5CD8C25013AB312518BCE2447AA` |

**Tek fark — ters yonde `.env` (beklenen):** manifest `.env`'i (sir) disarida birakir; `PACKAGE-IDENTITY.rollback.rootRehash` ayni
istisnayi "P-040 .env beklenen" diye kaydeder; `.env` sha'si ayrica pinlidir ve ESIT. R02 §1.4 satiri yalniz "88.178/88.178 eşit"
der, istisnayi yazmaz — bilgi notu, kusur degil.

### 1.2 §1.5 CLIENT I11 kimlikleri (main @ `af79b50c`)

**12/12 ESIT:** §9 gomulu blok **R06** (belge satir 415–599, 185 satir, LF, sonda LF) `27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700`
(R05 `9804FEF6…` ayni yontemle olculmustu, artik GECERSIZ) · T-PENCERE-AC `CA99E69E…74F4` · T-PENCERE-KAPA `0A80982B…AE05`
(R06'da DEGISMEDI) · `i11-run.js` `27821B46…2F4B` · `i11-01-setup.js` `1317D727…7DC4` · `i11-02-intake.js` `7D8D492B…1789` ·
`i11-03-close-links.js` `87C16DB3…9740` · `cl-09-close-access.js` (`client-live-acceptance-i1b-r01/scripts`) `01273998…62C4` ·
`smtp-sink-noauth.js` `99A5D681…8800` · `i11-bind-candidate.ps1` `B1C24402…BD49` · `i11-vb-compiled-redaction.js` `5E0E0538…7ABA` ·
`I11-CANDIDATE-BINDING.json` (CLIENT yerel kanit) `FCD57F04…57EA`.

### 1.3 Aday koku ve canli durum (salt okuma, 2026-09-12 ~22:06–22:31Z)

- `HY_W4_RELEASE23`: HEAD `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` · izlenen kirli 0 (`git --no-optional-locks`) · BUILD_ID
  `dOiGPj2M0Abls0kCibY4r` · `.env` YOK.
- Canli: :8080 PID 46332 · :3002 PID 47004 (RELEASE22) · `HukukPlatform-API` / `HukukPlatform-Web` Running ·
  `I11-WINDOW-BLOCK-*` kurali 0 · :2526 ve :8101 dinleyici 0 · CLIENT `scratchpad\i11live` dizini YOK.

### 1.4 OR-03a / K-KIMLIK — BEKLEMEDE

Nihai 3e girdileri yok: `approvedIdentity` null, `preLiveListDigest` "ONAY ADAYI DEGIL", `-Live` sonucu ve 3a–3c ciktilari
uretilmedi (R02 §3: yapisal olarak canli GO icinde). **OR-03a digest'i HESAPLANMADI**; `files[]` yalniz dosya dosya sha
karsilastirmasi icin kullanildi. **K-KIMLIK tamamlanmis SAYILMAZ.** 3e hazir oldugunda (canli GO icinde) ana yurutucu OR-03a'yi
OFFICE 33'ten bagimsiz hesaplar.

## 2. GO madde 2 — birlesen kaynak ve prova kanitlarinin bagimsiz incelemesi

Incelenen: #2657 `88b3d07a` (R05; 4 dosya), #2658 `260b6844` (paket §0) ve #2660 `af79b50c` (R06; §9 K-PAR deseni) main'de.
Prova kanitlari CLIENT oturum dizininde salt okundu: `i11s\twork\fix-apply.out` · `fix-close-broken.out` · `fix-close-recover.out` ·
`fix-launch.out` · `restart-launcher.out` · `close-launcher.out` · `i11s\fixwindow\run-51c11954.log` · `i11s\runs\kpar-*` ·
`kpar-residual.ps1`. Dokumlerde gorulen sha'lar main ile ayni (T-AC `CA99E69E…`, T-KAPA `0A80982B…`); runId `51c11954`
PASS 11 · FAIL 0 · olculemeyen 0. **Canli prova baslatilmadi.**

### 2.1 K-PAR yakalayiciyi bozmamali — KARSILANDI

R05 deseni (`…\|smtp-sink\.js`) noauth yakalayiciyi dislamisti ama `smtp-sink.jsonl` tasiyan cmd/pwsh sarmalayiciyi ve log
izleyiciyi de eslestiriyordu (alt dizgi; fail-closed). Bu kalintiyi OFFICE 33 bildirdi; ana yurutucu, CLIENT ve OFFICE 33 ayri
ayri olctu. CLIENT R06 ile deseni `…\|smtp-sink\.js\b` yapti. R06 deseni main'deki §9 gomulu bloktan birebir cikarildi ve
PowerShell `-match` ile (surec baslatilmadan) sinandi:

| Vaka | Beklenen | PS 7.6.5 | WinPS 5.1 |
|---|---|---|---|
| `smtp-sink-noauth.js` goreli · R02 D3-0 bicimi (tirnakli tam yol) | eslesmez | eslesmez | eslesmez |
| eski AUTH `smtp-sink.js` (satir sonu · tirnakli · arguman izler) | eslesir | eslesir | eslesir |
| cmd sarmalayici `SINK_LOG=…smtp-sink.jsonl` · pwsh sarmalayici · `Get-Content -Wait …smtp-sink.jsonl` | eslesmez | eslesmez | eslesmez |
| canli API (R23 dist) · T betigi `-File` | eslesmez | eslesmez | eslesmez |
| `i11-run.js` kosumu (koruma) | eslesir | eslesir | eslesir |

**11/11 beklenen, iki surumde de sapma 0.** §9 blogunda `Stop-Process`/kill/`:2526` islemi yok: K-PAR yalniz throw eder,
yakalayiciyi durdurmaz. Olcum anindaki eslesen surec 0. R02 @ 1ce1cc54 D3-0 on-kontrolu R06 desenini birebir kullanir.

### 2.2 T-KAPA hata yolu — AKIS KARSILANDI · CALISMA KANITI EKSIK

| Kontrol | Yontem | Sonuc |
|---|---|---|
| Akis | PowerShell AST: `$errs = @()` (satir 47) sonrasindaki ust duzey ifadeler | R-T0/R-T1 · R-T2 · R-T3 · R-T4a · R-T4b · R-T5 · R-T6 · R-T7 her biri kendi `try`'inda, tek `catch`, catch icinde throw 0, finally 0; try disinda throw yalniz sondaki toplama (`if ($errs.Count -ne 0)`, satir 196); exit/return 0 |
| R-T4a/R-T4b erisilebilirligi | ayni | onceki adimlarin hatasindan bagimsiz erisilir; yalniz `$Mode -eq 'live'` kosuluna bagli |
| Hata yolu provasi | `fix-close-broken.out` ("baslatici KASITLI BOZUK") | R-T1 geri yazdi · R-T2 182 sn sonra BASARISIZ · R-T3 BASARISIZ · **R-T5 yine kostu** · R-T6 · R-T7 ESIT · sonda 2 hatayla throw |
| Kurtarma | `fix-close-recover.out` | R-T1 idempotent · API 6 sn · R-T3 · R-T5 · R-T7 ESIT · "tum adimlar basarili" |
| Prova ortaminin son hali | env ve yedek sha (icerik okunmadi); dinleyiciler | ikisi de `E00FBC67…` = K-T0 on goruntusu · :2526 ve :8101 dinleyici 0 |
| **R-T4a (engel kurali kaldirma) / R-T4b (Web baslatma)** | dokumler | **HICBIR MODDA KOSMADI** — prova modunda `live` dali atlanir; bu kurallari ekleyen/Web'i durduran K-T6 da kosmadi |

**Somut eksik:** owner'in adlandirdigi iki etki (engel kurali, Web durumu) icin calisma kaniti yok. Kanit kaynak + AST + R-T5
benzesimidir. Yukseltilmis ama canli olmayan bir sinama guvenlik duvari/gorev degisikligi gerektirir: ancak owner karariyla
yapilabilir, ana yurutucu yapmaz. Not: kasitli bozuk baslaticinin G-A reddi ciktisi (`close-launcher.out`) kurtarma kosusunun
ciktisiyla uzerine yazilmis; basarisizligin kendisi `fix-close-broken.out`'ta gorunur.

### 2.3 Yukseltme kapisi ilk degisiklikten once — KARSILANDI

| Kontrol | T-PENCERE-AC | T-PENCERE-KAPA |
|---|---|---|
| K-ELEV konumu / kosulu | satir 34–40 · `$Mode -eq 'live'` | satir 39–45 · ayni |
| K-ELEV oncesi komutlar | yalniz `Join-Path`, `Write-Output` (+ T_MODE ve T-GO bicim throw'u) · .NET cagrisi 0 · degistirici 0 | yalniz `Join-Path`, `Split-Path` · degistirici 0 |
| Ilk degistirici komut | `New-Item` satir 90 (K-T0 dizini; R05 "Copy-Item" der — kapi yine ondan once) | `Copy-Item` satir 82 (R-T1) |
| Kapi ile ilk degisiklik arasi | 8 salt-okuma kapi throw'u (K-T1..K-T5) | 1 (R-T0 "yedek yok", try icinde) |
| Kapi parcasi calistirildi (yukseltilmemis oturum) | PS 7.6.5 ve WinPS 5.1: DURDU | PS 7.6.5 ve WinPS 5.1: DURDU |

Degistirici sayilan komutlar: dosya (`New-Item`, `Copy-Item`, `Set-Content`, `Set-Acl`, …), gorev (`Start/Stop-ScheduledTask`),
guvenlik duvari (`New/Remove-NetFirewallRule`), surec (`Start/Stop-Process`). Yukseltilmis (gecen) dal calistirilmadi.

### 2.4 `ENV-PREIMAGE.env` ACL — KISMEN · KARSILANMADI

Olcum (Get-Acl; icerik okunmadi):

| Nesne | Korumali | Kural | Yabanci SID yazma/silme |
|---|---|---|---|
| `…\Temp\claude` → proje → oturum `894280b1-…` → `scratchpad` → `i11s` → `twork` / `runs` | HAYIR (kalitsal) | 9 | **6** — (OI)(CI): 4× `0x1301BF` (Modify: DELETE, yazma, ADD_SUBDIR, okuma; `CodexSandboxUsers` + 3 cozumlenmeyen SID) · 2× `0x1301FF` (Modify + **DELETE_CHILD**; 2 cozumlenmeyen SID) |
| `i11s\twork\ENV-PREIMAGE.env` (prova yedegi) | **EVET** | 3 | **0** (SYSTEM · Administrators · yurutucu) |
| `i11s\twork\ENV-SDDL-BASELINE.txt` · `SINK-BASELINE.txt` · `i11s\runs\smtp-sink.jsonl` | HAYIR | 9 | 6 |
| `scratchpad\i11live` (canli yedek dizini) | — | — | henuz YOK; olusunca yukaridaki zincirden kalitim alir |

Kaynak incelemesi (`t-window-apply.ps1` satir 90–111 · `t-window-close.ps1` satir 74–87 ve 184–191; R06'da degismedi):

| # | Bulgu | Dayanak | Etki |
|---|---|---|---|
| a | Yedek `Copy-Item` ile **kalitsal ACL ile dogar**; korumali DACL satir 105'te uygulanir | kaynak + olculen kalitim | kisa pencerede 6 yabanci SID'in okuma hakki var (bu pencerede acilan tanitici sonra da gecerli kalir) → "uygun ACL ile OLUSTURULMA" saglanmaz |
| b | Ust dizin (`i11live`) korunmaz | olculen ACL'den **TURETILDI, denenmedi** | DELETE_CHILD sahibi 2 SID yedegi dosya DACL'ina ragmen silip ayni adla yenisini yazabilir; DELETE + ADD_SUBDIR sahibi 6 SID `i11live` dizinini yeniden adlandirip yenisini kurabilir → "korunma" dizin duzeyinde saglanmaz |
| c | `$preHash` yalniz ekrana yazilir, kalici kaydedilmez; R-T0/R-T1 yedegi **guvenilir bir degerle karsilastirmadan** canli `.env` uzerine kopyalar | kaynak | degistirilmis yedek canli `.env`'e yazilir ve API onunla yeniden baslar; D3-5 (`env sha=7A7228B1…`) bunu ancak SONRADAN yakalar. Yedek silinirse R-T1 "elle mudahale" ile duser; R02 §5.1'de bu durumun satiri yok |
| d | R-T7 tabani (`ENV-SDDL-BASELINE.txt`) ve K-T10b kaniti (`SINK-BASELINE.txt`, `smtp-sink.jsonl`) ayni zayif ACL'de | olculen | R-T7 tabani ve pozitif kanit degistirilebilir. SDDL icin D3-5'in D1-5 tabanina karsi bagimsiz karsilastirmasi bunu ortuler |

Dogru olan: yedek dosyasi korumali DACL alir ve K-T0 bunu dogrular (prova yedeginde bagimsiz olculdu); koruma uygulandiktan sonra
yabanci SID'ler dosyayi okuyamaz. Eksik olan: olusturma ani, ust dizin butunlugu ve geri yazma butunlugu.

Dar duzeltme secenekleri (karar CLIENT / OFFICE 33 / owner):
1. R-T1'den once yedek sha'si pinli degerle karsilastirilir (D3'te beklenen `7A7228B1…` = §1.4 ve D1-5 env sha); farkta veya
   yoklukta DUR + owner karari; elle geri yazma kaynagi sha dogrulamali R22 kok `.env`. CLIENT hash'ini degistirmeden R02 D3-4
   cagri blogunda da yapilabilir.
2. `i11live` kopyadan ONCE korumali DACL ile olusturulur veya yedek, ust zinciri yabanci yazmaya kapali bir konuma alinir
   (CLIENT betik degisikligi → yeni hash).

### 2.5 PowerShell surumu — ek bulgu

| Kontrol | Sonuc |
|---|---|
| CLIENT T betik provasinin surumu | PS 7 (hata dokumu ConciseView bicimi: ANSI `Exception:` + `Line \|`) |
| R02 canli cagrisi | D3-1/D3-4 `powershell.exe -File` → **Windows PowerShell 5.1** (§4 "Hepsi WinPS 5.1") |
| 5.1'de ayristirma (iki T betigi + §9 blogu) | 0 hata · iki betik BOM'suz · ASCII disi bayt 22 / 14, yalniz yorum ve `Write-Output` metinlerinde (islevsel etki yok) |
| 5.1 `Set-Content -Encoding UTF8` BOM ekler | zararsiz: `dotenv@16.4.5` BOM'lu ornegi dogru ayristirdi · API `ConfigModule` dotenv kullanir · `start-api.ps1` pwsh 7'de `Get-Content` ile okur · `db-readiness.js` `dotenv.parse` kullanir |
| **OLCULMEDI** | `.env`'de ASCII disi deger varsa 5.1 `Get-Content` (ANSI) pencere kopyasinda o degeri bozar (geri donus bayt kopyasi oldugu icin kalici degil). `.env` icerigi okunmadigi icin olculmedi |

Oneri: T betikleri prova edilen surumle (`pwsh -File`) cagrilir ya da bu fark R02 §2.3 "kanitlamadiklari" listesine yazilir.

## 3. GO madde 3 — R02 taslagi kontrolu (#2659 @ 1ce1cc54; ilk inceleme 810624af)

| Kontrol | R02'deki ifade | Sonuc |
|---|---|---|
| D1 bagimliliklari | §3: 3e canli GO'dan once bitirilemez (`-Live` sonucu + 3b/3c icerir) · §4 D1-0→D1-5, her adim oncekinin beklenen sonucuna bagli · §7 m.3–4 K-KIMLIK kosulu (iki bagimsiz OR-03a esit + dosya kumesi ayni + sha farki yalniz 3 dosyada) | DOGRU |
| D1 → D2 → D3 baglari | D2: D1-5 `redactSecretPathSegments` 3 + §9 K-API/K-BLD canli R23'e karsi · D1-5 `env sddl` = D3 tabani · D3-5 D1-5 env satirlarina bagli · D1 dususlerinde (exit 1/2/3/70, D1-5, D2) D3 baslamaz veya IPTAL | DOGRU |
| D3 bagimliliklari | D3-0 (K-PAR on-kontrolu 0, R06 deseni) → D3-1 → D3-2 tek kez (§9 `27E754A7…`) → D3-3 yalniz kurtarma → D3-4 her sonucta → D3-5 · yukseltilmis pencereyi owner saglar ve bloklari owner kosar | DOGRU — D3-3'un yalniz kurtarma olmasi `i11-run.js` icindeki kapanisla (`i11-03-close-links` + `cl-09`) ve CLIENT belgesi §11 ile tutarli |
| Basarisizlikta toparlanma | §5.1: D1 cikis kodlari · D3-0 dususu · D3-1 K-T0 oncesi/sonrasi · D3-2 · D3-4 sonda throw → ayni blogun tekrari (idempotent, olculdu) · R-T7/D3-5 SDDL farki owner · D3 acikken geri donus once D3-4 sonra §5.3 | BUYUK OLCUDE DOGRU — eksikler asagida |
| B11 aday disi | §0 · §1.1 · §7 m.8 (kapsam disi) · §8 | DOGRU — `78f49dd3` adayda HAYIR, main'de EVET; aday→main ve aday→PR head calisma zamani farki yalniz `lawyer.service.ts` |
| §1 kimlikleri | §1.1–§1.5 | DOGRU (§1) |
| K-PAR kalintisi | §0 · D3-0 | DOGRU — R06 ile kapandi, D3-0 guncellendi (§2.1) |
| R-T4a/R-T4b | §2.3 ve §8: "provada sinanmadi" | DOGRU ve acik |

**R02 @ 1ce1cc54 eksikleri ve eskimis ifadeler:**

1. **ENV-PREIMAGE korumasi fazla guclu anlatiliyor:** §5.2 (satir 340) "Yedek ENV-PREIMAGE.env artık korumalı DACL'lıdır (K-T0 doğrular)"
   ve §8 (satir 411) §2.4 (a)–(d)'yi yansitmiyor; §5.1'de "yedek YOK / sha farkli" satiri yok.
2. **Eskimis rol ve olcum ifadeleri:** baslik (satir 10), §0 (satir 50) ve §8 (satir 414) rolun henuz atanmadigini ve §1'in
   olculmedigini soyluyor. Owner rolu 2026-09-13 GO'suyla dogrudan atadi; §1 olcumu bu kayittadir. §7 madde 2 (canli GO zamaninda
   D1-1 oncesi yeniden olcum ve 3e'de OR-03a) uygun kalir.
3. **Surum farki yazilmamis:** T betiklerinin 5.1 ile cagrilmasi, prova edilen surumle (PS 7) ayni degil (§2.5); §2.3'te yok.
4. Kucuk: (a) D3 betik kaynagi paylasilan kanonik calisma agaci; D3 sirasinda T-KAPA sha'si degisirse D3-4 DURUR ve pencere
   kapanamaz, §5.1'de satiri yok (oneri: D3 suresince kanonik agaci dondurma kurali veya sabit kopya). (b) §5.1 "D3-1 K-T1..K-T5'te
   durur → D3-4": R-T2 canli API'yi gereksiz yeniden baslatir (Web ayakta kalmistir); yalniz yakalayiciyi durdurma secenegi
   tercih edilmelidir.

1–4 numarali notlar 2026-09-12 ~22:20Z'de (810624af incelemesiyle) OFFICE 33 ve CLIENT oturumlarina **BILGI** olarak iletildi
(yetki veya talimat degil). 1ce1cc54 yalniz R06'yi isler; bu notlari henuz islemez. R02'nin sonraki head'leri bu kaydin disindadir.

## 4. Sonuc ve owner kararina sunulanlar

- **R28 araclari ve geri donus pinleri:** hazir ve ESIT (§1).
- **K-KIMLIK:** BEKLEMEDE — nihai 3e girdileri yok; OR-03a hesaplanmadi.
- **D3 hazirligi:** K-PAR (R06) ve K-ELEV karsilandi; T-KAPA akisi karsilandi ama R-T4a/R-T4b'nin calisma kaniti yok;
  `ENV-PREIMAGE.env` ACL olcutu karsilanmadi.
- **R02:** D1/D3 bagimliliklari ve B11'in aday disinda kalmasi dogru aktarilmis. §3'teki 1–3. maddeler islenmeden §7 taslagi
  "hazirlik kontrolleri tamam" diye sunulmamalidir.

| # | Karar | Secenekler |
|---|---|---|
| K1 | `ENV-PREIMAGE.env` butunlugu | §2.4 secenek 1 (R02 D3-4 on kontrolu, CLIENT hash'i degismez) · secenek 2 (CLIENT betik duzeltmesi, yeni hash) · ikisi · riskin kabulu |
| K2 | R-T4a/R-T4b calisma kaniti | kaynak + AST + R-T5 benzesimi yeterli · yukseltilmis, canli olmayan sinama (owner yurutur) |
| K3 | T betik surumu | `pwsh -File` (prova edilen) · 5.1 farkinin yazili kabulu |

## 5. Kanit dosyalari (ana yurutucu oturum dizini; silinmez)

Dizin: `C:\Users\ULASTE~1\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\a8d9121a-4dce-4df7-9d25-7a28dd99c6ca\scratchpad`

| Dosya | sha256 | Icerik |
|---|---|---|
| `r28-verify-s1-evidence.json` (betik `r28-verify-s1.py`) | `F69B66E8A43E750EC8AA48B73F0D2CCC2BE84D1FE12F125659C225B488822966` | §1, R01 beklentileriyle: 43/45 |
| `r28-verify-s1b-evidence.json` (betik `r28-verify-s1b.py`) | `CA18CC7D21F651F8147B370846719F59EBA80A8EB3D1229DD504A675E149DB7E` | §1, R02 @ 810624af: 44/45 |
| `r28-verify-s1c-evidence.json` (betik `r28-verify-s1c.py`) | `EB46AF52E95ECD984836E3638BAD06DBA3B262A917B43F6B81E2EBA5E7069261` | §1, R02 @ 1ce1cc54: 44/45 |
| `r28-s2-evidence.json` (betik `r28-s2-verify.ps1`) | `6CCECA0379A805CA19F76FDC39BC896F057731E56714392562F1F1AB106D18C7` | R05 K-PAR deseni ve surec taramasi · AST · K-ELEV calistirma · ACL · canli durum |
| `r28-s2-ps51.ps1` · `r28-s3-kpar-r06.ps1` | — | WinPS 5.1 ayristirma + K-ELEV · R06 deseni PS 7.6.5 ve 5.1'de 11 vaka |
| `r28-s2-hash.py` | — | §9 gomulu blok hash bicimi · R28 kaydi repo↔disk |

## 6. Sinirlar

- Yabanci SID'lerin silme ve yeniden adlandirma yetenekleri olculen ACL'den turetildi; baska kimlikle denenmedi.
- Yukseltilmis dal, K-T6, R-T4a ve R-T4b calistirilmadi; canli veya yukseltilmis prova yapilmadi.
- `.env` icerigi okunmadi; ASCII disi deger riski olculmedi.
- R02 incelemesi yalniz `1ce1cc54` icindir (fark `810624af` → `1ce1cc54` okundu).
- Bu belge muhur, authority, cutover, T-pencere veya canli kosum yetkisi DEGILDIR.

## Ek A — R07 (#2662) ve nihai R02 (#2659 @ b855f380) delta dogrulamasi (ayni owner GO; 2026-09-12T22:45Z–23:52Z)

Bu ek, #2661 notlarindan sonra birlesen duzeltmeleri ayni yontemle (salt okuma; `.env` icerigi okunmadi) inceler. #2661 §0 ve
§4'teki D3 ve R02 hukumleriyle celistigi yerde **bu ek gecerlidir**. CLIENT R07'yi iki head'de (b370c722 → 176a5c53) birlestirdi:
`59abb70b`. OFFICE 33 R02'yi uc kez guncelledi (11a953da → ebe3e1e4 → 7b9ff7aa) ve birlestirdi: `b855f380` (icerik 7b9ff7aa ile
bayt-esit). Ara head'lerde bulunan capraz paket celiskileri iki oturuma **BILGI** olarak iletildi (yetki veya talimat degil).

### A.1 R07 — birlesen kaynak (main @ 59abb70b) — `ENV-PREIMAGE.env` olcutu KARSILANDI

| Kontrol | Yontem | Sonuc |
|---|---|---|
| Hash / bicim | main blob sha256; bayt sayimi | T-AC `ED64A751F75B0F0C3B1406759E92C2F20DAF29018CC893A5EB387391C822BBCF` · T-KAPA `3F027B0DA7AA65F5F8C7A016F1EAD605706C2A4BDA2E703D4A6D4A199DA8BB2C` (ara surum T-AC `5AB1AF16…` GECERSIZ) · §9 `27E754A7…` ve `smtp-sink-noauth.js` `99A5D681…` DEGISMEDI · iki betik LF, ASCII disi bayt 0 |
| Ayristirma | PS 7.6.5 ve WinPS 5.1 | iki betikte 0 hata |
| Kapi sirasi | PowerShell AST | T-AC: T-PIN satir 37 < K-ELEV 43–49 < ilk etkili degistirici `New-Item` @133 · T-KAPA: T-PIN 24 < K-ELEV 49–55 < `Copy-Item` @118 · K-ELEV oncesi degistirici veya fonksiyon cagrisi 0 |
| Kapi parcalari | yukseltilmemis oturumda, PS 7.6.5 ve 5.1 | pin'siz → T-PIN DURDU · K-ELEV DURDU |
| T-KAPA hata yolu | AST | 9 adim (K-T10b · R-T0/R-T1 · R-T2 · R-T3 · R-T4a · R-T4b · R-T5 · R-T6 · R-T7) her biri kendi try/catch'inde, catch icinde throw 0, try disinda throw yalniz sondaki toplama, exit/return 0 |
| Geri yazma butunlugu | kaynak (R-T0/R-T1) | once yedek dizini, sonra yedek dosyasi guven denetimi (sahip · korumali DACL · reparse · yabanci kural); ardindan yedek sha = pin; ancak bunlardan sonra `Copy-Item`. Aksi hâlde "GERI YAZILMADI; elle mudahale" |
| Olusturma ani | kaynak (K-T0a/K-T0) | `i11live` onceden varsa K-T0a HICBIR degisiklik yapmadan durur; dizin olusturulur → `icacls` (SID ile, (OI)(CI)) korumali → guven + bosluk denetimi → kopya korumali ACE'lerle DOGAR → dosya guveni → sha = pin. `Set-TrustedAcl` idempotent (E9: `Set-Acl` korumali hedefte SeSecurityPrivilege istiyordu) |
| Env degisimi | kaynak (K-T7/K-T8) | bayt oku → katı UTF-8 → yalniz iki satir, satir sonu ve BOM korunur → `WriteAllBytes` → bayt-bayt dogrulama + farkli satir tam 2 ve beklenen indeksler + SDDL ayni |
| Prova kalintilari | Get-Acl + sha256 (icerik okunmadi) | `twork\preimage` korumali, 3 kural, kalitsal 0, yabanci 0, (OI)(CI) · `ENV-PREIMAGE.env` korumali, sha = prova pini `8ACF239A…` · SDDL/taban dosyalari yalniz 3 guvenilir kural (korumali dizinden) · `smtp-sink.jsonl` korumali, yabanci 0 |
| Nihai bloklarla pencere donguleri | CLIENT dokumleri (`i11s\r07window`) | **A — WinPS 5.1** (`A1`/`A3`, blok sha `ED64A751…`/`3F027B0D…`): K-T0a pin esit · K-T0 korumali · K-T8 tam iki satir, BOM ve SDDL ayni · restart 6 sn · runId `51d2dcc4` PASS 11/0/0 · T-KAPA R-T1 = pin · R-T5 · R-T6 (2 ileti, sentetik) · R-T7 esit · "Pozitif hedef kaniti: VAR" · "tum adimlar basarili". **B — PS 7** (`B1`/`B3`): ayni; runId `95ee9ad2` PASS 11/0/0 |

**Kalan:**
- `scratchpad`/`i11s` ust zinciri hâlâ korumasiz (2 SID DELETE_CHILD). Bu SID'ler `i11live`'i yeniden adlandirip yerine baska dizin
  koyabilir (ACL'den turetildi, denenmedi). Bu bir erisilebilirlik riskidir: butunluk pinle korunur, degistirilmis yedek geri
  yazilmaz ve durum R02 §5.1'deki R-T1 "guvenilir DEGIL" satiriyla owner'a gider. R02 §2.3 nedeni ayrica yazmaz (bilgi notu).
- Canlida sahip = `BUILTIN\Administrators` davranisi olculmedi.
- Yurutucu hesabiyla calisan surecler guvenilir kumededir (R07 §6, R02 §7 m.6a(ii)).
- **R-T4a/R-T4b hicbir modda kosmadi** (degismedi).

### A.2 Capraz paket celiskileri — ara head'ler (CIKTI: nihai R02'de KAPANDI)

| # | R02 @ 11a953da | R07 | Durum |
|---|---|---|---|
| 1 | D3-0 `i11live`'i korumali DACL ile ONCEDEN olusturuyordu | T-AC K-T0a dizin varsa DURUR | ebe3e1e4: on-kurulum KALDIRILDI; D3-0 yalniz "yok" denetler |
| 2 | D3-1/D3-4 `T_ENV_PRE_SHA` gecmiyordu | iki betik zorunlu T-PIN | ebe3e1e4: ikisine de `7A7228B1…FDDC` |
| 3 | T hash'leri R05 (`CA99E69E…`/`0A80982B…`) | R07 `ED64A751…`/`3F027B0D…` | ebe3e1e4: guncellendi |
| 4 | D3 `pwsh 7` | R07 ilk sozlesmesi 5.1 penceresi | 176a5c53: CLIENT iki kabugu da olctu (dongu A/B); R02 `pwsh -File` = dongu B |

### A.3 Nihai R02 — main @ b855f380

| Kontrol | Yontem | Sonuc |
|---|---|---|
| D3-0 | bloktan birebir cikarma | `$want` 3 hash = main blob'lari · `$rx` = §9 `$rx` · `i11live` yalniz salt-okuma "yok" denetimi (olusturma 0) · yakalayici + kayit dosyasi beklenir |
| D3-1 / D3-4 cagrilari | ayni | dosya pinleri = main · `T_ENV_PRE_SHA='7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'` (§1.4 R22 `.env` = D1-5 env sha) · `T_MODE='live'` · `T_GOREF` / `T_RUNID` · `pwsh -NoProfile -ExecutionPolicy Bypass -File` · cikis kodu yazdirilir |
| D3-4 runId koruyucusu | kosul ifadesi ayrica calistirildi | `<runId>` · buyuk harf · 7 hex · metin → DURUR; 8 hex kucuk harf veya bos → GECER. `i11-run.js:45` runId'yi `randomBytes(4)` hex + kucuk harf uretir |
| §1.5 | main blob + CLIENT yerel baglama kaniti | tum hash'ler R02'de mevcut; tam uzunlukta tek ek deger pin satiri |
| §1 (S1e, 2026-09-12T23:51:50Z) | diskten yeniden olcum | **44/45 ESIT** · tek fark ters yonde `project/apps/api/.env` (P-040 beklenen) · `PACKAGE-IDENTITY.json` `EFD0EF2553ECB5DA285B13F950A26746A153A10DFAAB0FE349AFD715FFF8A1E5` = disk · `files[]` 50/50 · muhursuz, `approvedIdentity` null · R28 kaydi main = disk `FB99418F0CAC52E80250256FCFC56F9356FFD9F0E9B293C6F62D729138C346D0` |
| §5.1 toparlanma | metin | D3-0 dususu (`i11live` var dahil) · D3-1 K-T0 oncesi durus → **D3-S** (yalniz yakalayici; API yeniden baslamaz, D3-4 kosmaz) · D3-4 pin'siz · D3-4 T-KAPA sha uyusmaz → `59abb70b` blob'undan sha dogrulamali kopya, owner karari + dondurma kurali · R-T1 "guvenilir DEGIL / pin ESIT DEGIL" → env pencere degerinde, erisim geri acilir, owner · SDDL farki · D3 acikken geri donus once D3-4 sonra §5.3 — DOGRU (#2661 §3 not 4a/4b KAPANDI) |
| Durum ifadeleri | metin taramasi | "olcum yok / henuz yapilmadi / §7 GO ile ATANIR" kalintisi 0 · §7 m.2 rol bu yurutmede surer · §7 m.6a owner kabulleri: (i) R-T4a/R-T4b kanit eksigi, (ii) R07 §6 kalan riski; kabul edilmezse D3 baslamaz · §7 m.8 B11 kapsam disi |
| D1 bagimliliklari · B11 | #2661 §3 ile karsilastirma | degismedi, DOGRU |
| Canli (salt okuma, 23:52Z) | dinleyici / kural / dizin | :8080 PID 46332 · :3002 PID 47004 (RELEASE22) · `I11-WINDOW-BLOCK-*` 0 · :2526 0 · `i11live` YOK |

### A.4 Guncel sonuc

| GO maddesi | Sonuc |
|---|---|
| 1 — R28 araclari + geri donus pinleri | **ESIT** (S1e) |
| 1 — OR-03a / K-KIMLIK | **BEKLEMEDE** — nihai 3e girdisi yok; hesaplanmadi |
| 2 — K-PAR | **KARSILANDI** (R06) |
| 2 — T-KAPA hata yolu | **Akis KARSILANDI** (R07'de yeniden dogrulandi); **R-T4a/R-T4b calisma kaniti YOK** → R02 §7 m.6a(i) owner kabulune bagli |
| 2 — K-ELEV | **KARSILANDI** (R07'de T-PIN de ondan once) |
| 2 — `ENV-PREIMAGE.env` ACL | **KARSILANDI (R07)** — olusturma ani korumali, geri yazma pin + guven denetimli; kalan ust zincir erisilebilirlik riski §5.1 R-T1 satiriyla karsilanir (A.1 "Kalan") |
| 3 — R02 D1/D3 bagimliliklari · toparlanma · B11 | **DOGRU** — ara head celiskileri nihai metinde kapandi |
| **R02 karar metni (main @ b855f380)** | **Owner incelemesine HAZIR.** Owner'in vermesi gereken kabuller §7 m.6a'dadir. #2661 §4'teki K1 (yedek butunlugu) R07 ile, K3 (kabuk) dongu A/B ile KAPANDI; K2, §7 m.6a(i) oldu |

Ek kanit (ana yurutucu oturum dizini): `r28-verify-s1d-evidence.json` `CA931CB5BA2EFE5E087A5A52419EFD1D2DE32BB1934624F26767404D6F5CF544` ·
`r28-verify-s1e-evidence.json` `F5AE6E2802F3892A73E5CD68E3C3A8009BC96B4D94CC7BFFDD048A8DD8A20DC1` · `r28-s3-kpar-r06.ps1` ·
`r28-s4-r07-ast.ps1` · `r28-s4-r07-prova.ps1` · `r28-s5-rid-guard.ps1`. Bu ek de muhur, authority, cutover, T-pencere veya canli kosum
yetkisi DEGILDIR.
