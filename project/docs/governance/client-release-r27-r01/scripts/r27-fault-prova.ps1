param(
  [string]$PristineDir = (Join-Path $env:LOCALAPPDATA 'Temp\r27\synthetic-backup'),
  [string]$CandApps = 'D:\Development\HUKUK_YAZILIMI\HY_WT_R27\project\apps',
  [string]$ProvaRoot = 'D:\Development\HUKUK_YAZILIMI\HY_R27_FAULT_PROVA',
  [string]$ScriptDir = '',
  [string]$ChildShell = 'powershell.exe',   # yayin/geri alma betiklerini kosan kabuk: 'powershell.exe' (WinPS 5.1, varsayilan) | 'pwsh.exe' (PowerShell 7)
  [string[]]$Scenarios = @('happy-path', 'rollback-script', 'api-copy-interrupt', 'web-swap-fail', 'identity-read-error', 'identity-read-persistent', 'service-start-fail', 'restore-hash-mismatch', 'stop-fail',
                          'stop-web-throw', 'stop-api-throw', 'stop-recovery-start-throw', 'rollback-stop-fail', 'rollback-start-throw',
                          'stop-measure-unreadable', 'rollback-measure-unreadable',
                          'b3-read-transient', 'b3-read-persistent', 'b3-api-start-throw', 'b3-web-start-throw', 'b3-stop-api-fail', 'b3-stop-read-persistent',
                          'b3-toparla-read-transient', 'b3-api-crash-after', 'b3-web-stopthrow-api-fail', 'b3-stop-recovery-start-throw', 'b3-api-down-before',
                          'b3-toparla-web-crash', 'b3-web-down-before', 'b3-web-unhealthy', 'b3-web-late-stop', 'b3-final-read-transient',
                          'b3-before-read-transient', 'b3-trigger-before-swap', 'b3-trigger-during-swap', 'b3-tuple-changed', 'b3-unexpected-after-kimlik',
                          'b3-web-down-toparla-unreadable', 'b3-gate-read-persistent', 'b3-swapend-read-persistent', 'b3-trigger-before-swap-api', 'b3-tuple-unreadable', 'b3-swap-trigger-kimlik-fail',
                          'gate-fault-live-mode', 'gate-testroot-under-live', 'gate-sim-missing', 'gate-evidence-fallback', 'gate-rollback-backup-missing',
                          'gate-rogue-process', 'gate-rogue-viewer-only', 'gate-rogue-classifier', 'gate-rogue-wiring', 'gate-svc-measure'))
$ErrorActionPreference = 'Stop'
# =============================================================================
# R27 HATA PROVASI HARNESS'I - CANLIYA DOKUNMAZ. Saf ASCII.
# r27-release.ps1 / r27-rollback.ps1'i -TestRoot (izole kopya + simulator) ile kosar; her senaryo icin cikis kodu, verdict,
# dosya digest'leri, simulator servis durumu ve kurtarma talimati varligini ASSERT eder.
# Pristine kaynaklar (kopyalanir, DEGISTIRILMEZ):
#   canli taban kopyasi : <PristineDir>\api-src (3867 dosya, A8B17A38), <PristineDir>\web\.next (C17E7B13), <PristineDir>\web\next.config.js
#   aday                : <CandApps>\api\dist\apps\api\src (E28A6863), <CandApps>\web\.next (B2DEE365), <CandApps>\web\next.config.js
# TestRoot = <ProvaRoot>\testroot : live\api\dist\apps\api\src, live\api\.env (SAHTE), live\web\{.next,next.config.js},
#   cand\api\dist\apps\api\src, cand\web\{.next,next.config.js}, sim\state.json, evidence\
# Her senaryo oncesi robocopy /MIR ile sifirlanir (yalniz ProvaRoot altindaki kopyalar; baska hicbir dizin silinmez).
#   Istisna: 'rollback-script' senaryosu 'happy-path'in biraktigi durumu (canli=aday + yedekleri) KULLANIR; happy-path olmadan kosulursa
#   yedekler harness'ca pristine'den kurulur.
# ISLEVSEL SENARYOLAR ve beklenen: happy-path 0/YAYIN PASS ; rollback-script 0/ROLLBACK PASS ; api-copy-interrupt 10/ROLLBACK (3-takas-api) ;
#   web-swap-fail 10/ROLLBACK (3-takas-web) ; identity-read-error 10/ROLLBACK (4-kimlik; GECICI tek seferlik istisna) ;
#   identity-read-persistent 11/ROLLBACK-DOGRULANAMADI (4-kimlik; KALICI okuma hatasi, verify OKUNAMADI, servis baslatilmaz) ;
#   service-start-fail 10/ROLLBACK (5-baslat-api) ; restore-hash-mismatch 11/ROLLBACK-DOGRULANAMADI (5-baslat-api) ;
#   stop-fail 21/DURDURMA-BASARISIZ (2-durdur-web; WEB kapanmadi -> CALISIYOR olculdu, Start VERILMEDI, saglik PASS; dosyalara DOKUNULMADI, API durdurulmadi)
# DURDURMA/GERI DONUS ISTISNA SENARYOLARI (dosya digest + simulator servis durumu + cikis kodu + kanit/konsol ifadesi BIRLIKTE):
#   stop-web-throw 21 (WEB komutu WEB'i kapatir ama istisna; WEB KAPALI olculur -> baslatilir -> saglik PASS) ;
#   stop-api-throw 21 (WEB durdu, API komutu istisna, API calisiyor -> API'ye Start YOK, WEB baslatilir) ;
#   stop-recovery-start-throw 22/DURDURMA-BASARISIZ-TOPARLANAMADI (stop-api-throw + WEB baslatma istisnasi -> WEB KAPALI kalir; KURTARMA
#     yalniz WEB'e Start; B3 YOK) ; rollback-stop-fail 12 (aday WEB sagligi tutmaz -> R-durdur'da WEB istisna, API yine durdurulur;
#     dosyalara DOKUNULMAZ, canli = aday) ; rollback-start-throw 13 (dogrulama sonrasi API baslatma istisnasi; WEB yine baslar; dosyalar taban)
#   Her birinde konsolda olculmemis 'yeniden baslatildi' iddiasi YOK; saglik sonucu simulator durumuyla esit.
#   OLCUM HATASI (R03-b): stop-measure-unreadable 22 (WEB durdurma etkili ama :3002 okumasi hata -> OLCULEMEDI, KAPALI SAYILMAZ; takas YOK,
#     WEB'e Start YOK) ; rollback-measure-unreadable 12 (R-durdur'da ayni okuma hatasi -> geri yukleme YOK, canli = aday)
#   gate-svc-measure (SUREC KOSMAZ): yayin + B3 betiklerinin CANLI dal olcum fonksiyonlari (Get-Pids, Get-HostProcCount, Measure-Svc,
#     Wait-Stopped) sahte Get-NetTCPConnection / Get-CimInstance / Get-ScheduledTask ile: gercek bos (ObjectNotFound) -> 0 / KAPALI;
#     TCP okuma hatasi ve CIM okuma hatasi -> OLCULEMEDI / Wait-Stopped false / B3 (R03-c) Wait-Stopped FIRLATMAZ, stopped=false +
#     state=OLCULEMEDI doner (sure dolana kadar yeniden olcer); eski SilentlyContinue bicimi ayni girdide KAPALI verir (ayirt edicilik).
# B3 (r27-rollback.ps1) HATA SENARYOLARI (R03-c; B3 -Fault ile; canli=aday + yedekler pristine'den; dosya digest + simulator + cikis + kanit/konsol):
#   b3-read-transient 0/ROLLBACK PASS (5-baslat-api'de TEK dinleyici okuma hatasi -> yeniden olculur; WEB yine baslar; 'GERI DONUS TAMAMLANDI') ;
#   b3-read-persistent 13 (5-baslat-* KALICI okuma hatasi -> iki servis de baslatma komutu ALIR, sonuc OLCULEMEDI; KURTARMA 'once olcun') ;
#   b3-api-start-throw 13 (API komut istisnasi -> WEB YINE baslar ve AYAKTA olculur; KURTARMA yalniz API'ye Start) ;
#   b3-web-start-throw 13 (API AYAKTA, WEB istisna -> KURTARMA yalniz WEB'e Start) ;
#   b3-stop-api-fail 21 (WEB durdu, API kapanmadi -> dosyalara dokunulmaz; bu kosumda durdurulan WEB yeniden baslatilir ve AYAKTA olculur) ;
#   b3-stop-read-persistent 22 (2-durdur-web okuma hatasi -> OLCULEMEDI, KAPALI sayilmaz; WEB'e Start YOK; KURTARMA 'once olcun') ;
#   b3-toparla-read-transient 21 (toparlamada TEK okuma hatasi karari belirlemez) ; b3-api-crash-after 13 (karar SON olcume dayanir) ;
#   b3-web-stopthrow-api-fail 21 (etkili ama istisnali durdurma) ; b3-stop-recovery-start-throw 22 ; b3-api-down-before 22 (kosum oncesi
#   kapali API'ye Start yok) ; b3-toparla-web-crash 22 (baslatilip sonra dusen WEB: 'yeniden baslatildi' YOK) ; b3-web-down-before 22
#   (kosum oncesi kapali WEB'e otomatik Start yok; KURTARMA owner karari) ; b3-web-unhealthy 13 (calisan ama sagliksiz WEB: elle dokunma,
#   ESCALATE) ; b3-web-late-stop 21 (bekleme penceresinden SONRA kapanan WEB bu kosumca durdurulmus sayilir ve yeniden baslatilir).
#   b3-final-read-transient 0 (son olcumde tek okuma hatasi kisa yeniden olcumle giderilir).
#   R03-d: b3-before-read-transient 21 (kosum oncesi olcumde TEK okuma hatasi -> oturmus olcum CALISIYOR; bu kosumun durdurdugu WEB yeniden
#   baslatilir) ; b3-stop-read-persistent / b3-api-down-before: kosum oncesi durumu OLCULEMEDI kalan WEB'e durdurma komutu VERILMEZ (stop=0) ;
#   b3-trigger-before-swap 21 (API durdurma beklemesinde tetik WEB'i baslatir -> takas oncesi yeniden olcum, dosyalara DOKUNULMAZ; API
#   yeniden baslatilir) ; b3-trigger-during-swap 13 (takas sirasinda tetik -> takas sonu olcumu KAPALI degil; 'TAMAMLANDI' YOK; KURTARMA
#   owner karari) ; b3-tuple-changed 13 (Kapsam satiri) ; b3-unexpected-after-kimlik 13 (beklenmeyen hata sonrasi olcume dayali metin) ;
#   b3-web-down-toparla-unreadable 22 (kosum oncesi KAPALI WEB; toparlama karari OLCULEMEDI, son olcum KAPALI -> KURTARMA Start'i OWNER KARARI notuyla) ;
#   b3-gate-read-persistent 21 (takas oncesi yeniden olcumde OLCULEMEDI KAPALI sayilmaz) ; b3-swapend-read-persistent 13 (takas sonu OLCULEMEDI 0'i
#   engeller) ; b3-trigger-before-swap-api 21 (kapinin API dali) ; b3-tuple-unreadable 13 (Kapsam OKUNAMADI). b3-unexpected-after-kimlik: hata WEB
#   Start'tan ONCE -> WEB KAPALI olculur, KURTARMA Start adimi (uydurma AYAKTA ile olcum ayni sonucu vermez). b3-swap-trigger-kimlik-fail 11
#   (takas sirasinda tetik + kimlik FAIL -> KURTARMA takas sonu satiri Start ONERMEZ, yalniz olcum + owner karariyla durdurma).
#   Tum b3-*: KURTARMA olcum satirlari parse edilir, SilentlyContinue yok, 'eslesme yok' FQID ile 0, baska hata 'OLCULEMEDI: ...';
#   (R03-d) AYAKTA olmayan her servis icin en az 4 olcum satiri (dinleyici/host/gorev/HTTP) o servisin port/gorev/host argumaniyla bulunur.
#   Her birinde olculmemis "baslatildi / geri donus tamamlandi" iddiasi YOK.
# KAPI SENARYOLARI (ucuz; TestRoot sifirlamasi yok):
#   gate-fault-live-mode        release.ps1 -Fault (TestRoot YOK) -> 20 daha ilk satirda; canli dosya/kanit dizinine DOKUNMAZ
#   gate-testroot-under-live    release/rollback -TestRoot canli kok ALTINDA -> 20 (Test-Path'ten once)
#   gate-sim-missing            release -TestRoot (bos dizin) -> 0-kapilar KAPIDA-DURDU 20 + kanit JSON TestRoot\evidence altinda
#   gate-evidence-fallback      release -TestRoot (evidence bir DOSYA) -> 20 + 'KANIT YAZILAMADI' + kanit %TEMP%\r27-evidence-fallback
#   gate-rollback-backup-missing rollback -TestRoot (sim var) + yedek dizini YOK -> SelfTest 1 ; gercek kosum 1-yedek-butunluk 20 + kanit JSON
#   gate-rogue-process          release -TestRoot + simulatore ENJEKTE sentetik surec listesi (kosucu + dogrulanmis goruntuleyici) -> AKISTAKI
#                               0-kapilar kapisi 20 KAPIDA-DURDU; kapinin KENDI hata metni; ADAY DOGRULAMA'ya gecilmez; health.rogue alan
#                               kumesi TAM ESIT; kanitta tam komut satiri/sir isareti YOK; stop/start YOK
#   gate-rogue-viewer-only      yalniz dogrulanmis goruntuleyici -> yine 20 (izleme muaf DEGIL; kapinin kendi metni) + KARSI KONTROL: eslesme
#                               yoksa kapi gecer ve akis ADAY DOGRULAMA'ya ulasir (cikis kodu tek basina kanit degildir)
#   gate-rogue-classifier       SUREC KOSMAZ: release.ps1'in desen/siniflandirma/dislama/oge-adi/kapi fonksiyonlarini AST ile yukler; desen parcalari,
#                               izleme listesi, guvenilir dizinler, uzanti/bayrak listeleri TAM ESITLIKLE sabitlenir; her parca kucuk+BUYUK harf;
#                               U+0130/U+0131/U+212A; sahte ad/yol; oge adi korumalari TEK TEK; fonksiyon ve degisken mutasyonlari
#   gate-rogue-wiring           SUREC KOSMAZ: kapi zinciri BUTUNLUGU (Get-GateIntegrity; pinle TAM ESIT) + 25 kacis biciminin her birinin olcumu
#                               degistirdigi (kopya betikte) + SelfTest/akis AST cagri konumlari; CANLI dal enjekte surec listesi saglayicisiyla
#                               kosulur (kanarya, taranan=0, saglayici istisnasi). Gercek Win32_Process okumasi burada OLCULMEZ (canli SelfTest olcer)
# YOL BUTCESI KAPISI: WinPS 5.1 Get-ChildItem/Get-FileHash MAX_PATH (260) uzerindeki yollari okuyamaz -> ProvaRoot uzunsa yedek
#   dogrulamasi 'Cannot find path' ile duser (inceleme olcumu: kok 139 kr + 123 kr goreli = 262 > 260). Harness basta olcer: kok + en
#   uzun goreli yol >= 260 ise OLCULEMEDI (3). r27-release.ps1 ayni kapiyi canli yedek koku icin 1-yedek'te kosar (health.pathBudget).
# Kanit: <ProvaRoot>\evidence\fault-prova-summary.json (son kosum) + <ProvaRoot>\evidence\run-<ts>\{fault-prova-summary.json, <senaryo>\{stdout.txt, R27-*.json, sim-state.json}}
#   Onceki kosumlarin dizinleri SILINMEZ (run-<ts> ile ayrisir). Ozet 'evidence' alani KALICI kopyayi (run-<ts>\<senaryo>\...) gosterir;
#   'evidenceTestRoot' TestRoot icindeki (sonraki senaryoda /MIR ile silinen) orijinal yoldur.
# Cikis: 0 tum senaryolar PASS ; 2 en az bir senaryo FAIL ; 3 olculemedi (pristine/aday kimligi ya da yol butcesi tutmadi) ; 1 harness hatasi
# NOT: %TEMP% icin TAM yol kullanilir (8.3 kisa yol digest'i bozar) - GetFullPath + Get-Item.FullName ile normalize edilir.
# NOT: pwsh 7'den kosarken PSModulePath temiz olmali (WinPS 5.1 cocuk surecte Get-FileHash bulunamazsa harness 1 verir; olculdu).
# =============================================================================
$Scenarios = @($Scenarios | ForEach-Object { ([string]$_) -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })   # 'powershell -File' virgullu listeyi TEK dize gecirir
if ($ScriptDir -eq '') { $ScriptDir = $PSScriptRoot }
$RELEASE = Join-Path $ScriptDir 'r27-release.ps1'; $ROLLBACK = Join-Path $ScriptDir 'r27-rollback.ps1'
$EXP_LIVE = 'A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0'
$EXP_CAND = 'E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134'
$EXP_WEB_LIVE = 'C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326'
$EXP_WEB_CAND = 'B2DEE3652F0843FAF05085243144ED0A4146C85C2C91FBCFA94BECB1A9D9F621'
$BID_LIVE = '5waeMoFGGMTLAYmn9oJvW'; $BID_CAND = 'W2UQpBPD_fp8pq4y7aFIe'
$CFG_LIVE = 'C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C'
$ADDED = @('common/trust-proxy.config.d.ts', 'common/trust-proxy.config.js', 'common/trust-proxy.config.js.map', 'modules/portal/dto/portal-password.dto.d.ts', 'modules/portal/dto/portal-password.dto.js', 'modules/portal/dto/portal-password.dto.js.map')
$LIVE_ROOT_CANON = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
$LIVE_EVID_DIR = 'D:\Development\HUKUK_YAZILIMI\HY_R27_RELEASE_EVIDENCE'
$EXPECT = @{
  'happy-path'               = @{ exit = 0;  verdict = 'YAYIN PASS';             api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true;  apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '' }
  'rollback-script'          = @{ exit = 0;  verdict = 'ROLLBACK PASS';          api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '' }
  'api-copy-interrupt'       = @{ exit = 10; verdict = 'ROLLBACK';               api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '3-takas-api' }
  'web-swap-fail'            = @{ exit = 10; verdict = 'ROLLBACK';               api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '3-takas-web' }
  'identity-read-error'      = @{ exit = 10; verdict = 'ROLLBACK';               api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '4-kimlik' }
  'identity-read-persistent' = @{ exit = 11; verdict = 'ROLLBACK-DOGRULANAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $false; webUp = $false; recovery = $true;  failedAt = '4-kimlik'; unreadable = $true }
  'service-start-fail'       = @{ exit = 10; verdict = 'ROLLBACK';               api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '5-baslat-api' }
  'restore-hash-mismatch'    = @{ exit = 11; verdict = 'ROLLBACK-DOGRULANAMADI'; api = 'NOT:' + $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $false; webUp = $false; recovery = $true; failedAt = '5-baslat-api' }
  'stop-fail'                = @{ exit = 21; verdict = 'DURDURMA-BASARISIZ';     api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '2-durdur-web'
                                  stopCalls = 1; startCalls = 0; failSvc = 'WEB'; apiAction = 'START VERILMEDI (calisiyor olculdu)'; webAction = 'START VERILMEDI (calisiyor olculdu)'; faultMark = 'stop: web kapanmadi' }
  'stop-web-throw'           = @{ exit = 21; verdict = 'DURDURMA-BASARISIZ';     api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '2-durdur-web'
                                  stopCalls = 1; startCalls = 1; failSvc = 'WEB'; apiAction = 'START VERILMEDI (calisiyor olculdu)'; webAction = 'BASLATMA KOMUTU VERILDI'; faultMark = 'stop: web kapandi + komut istisnasi' }
  'stop-api-throw'           = @{ exit = 21; verdict = 'DURDURMA-BASARISIZ';     api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 1; failSvc = 'API'; apiAction = 'START VERILMEDI (calisiyor olculdu)'; webAction = 'BASLATMA KOMUTU VERILDI'; faultMark = 'stop: api komut istisnasi' }
  'stop-recovery-start-throw' = @{ exit = 22; verdict = 'DURDURMA-BASARISIZ-TOPARLANAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $false; recovery = $true; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 1; failSvc = 'API'; apiAction = 'START VERILMEDI (calisiyor olculdu)'; webAction = 'BASLATMA ISTISNASI'; faultMark = 'start: web komut istisnasi (toparlama)' }
  'rollback-stop-fail'       = @{ exit = 12; verdict = 'ROLLBACK-ENGELLENDI';    api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true;  apiUp = $false; webUp = $true;  recovery = $true;  failedAt = '5-baslat-web' }
  'stop-measure-unreadable'  = @{ exit = 22; verdict = 'DURDURMA-BASARISIZ-TOPARLANAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $false; recovery = $true; failedAt = '2-durdur-web'
                                  stopCalls = 1; startCalls = 0; failSvc = 'WEB'; apiAction = 'START VERILMEDI (calisiyor olculdu)'; webAction = 'START VERILMEDI (durum OLCULEMEDI)'; faultMark = 'olcum: web dinleyici okumasi hata'
                                  webMeasured = 'OLCULEMEDI'; recStartWeb = $false; webUnreadable = $true }
  'rollback-measure-unreadable' = @{ exit = 12; verdict = 'ROLLBACK-ENGELLENDI';  api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true;  apiUp = $false; webUp = $false; recovery = $true; failedAt = '5-baslat-web'
                                  rbWebCommand = 'TAMAM'; rbWebState = 'OLCULEMEDI'; faultMark = 'olcum: web dinleyici okumasi hata' }
  'rollback-start-throw'     = @{ exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $false; webUp = $true; recovery = $true;  failedAt = '4-kimlik' }
  'b3-read-transient'        = @{ b3 = $true; exit = 0;  verdict = 'ROLLBACK PASS'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'VERILDI'; apiState = 'AYAKTA'; webState = 'AYAKTA'; apiReadErr = $true; webReadErr = $false; stopCalls = 2; startCalls = 2; faultMark = '5-baslat-api: dinleyici okuma hatasi' }
  'b3-read-persistent'       = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $true; recovery = $true; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'VERILDI'; apiState = 'OLCULEMEDI'; webState = 'OLCULEMEDI'; apiReadErr = $true; webReadErr = $true; stopCalls = 2; startCalls = 2; faultMark = '5-baslat-web: dinleyici okuma hatasi' }
  'b3-api-start-throw'       = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $false; webUp = $true; recovery = $true; failedAt = ''
                                  apiCmd = 'ISTISNA'; webCmd = 'VERILDI'; apiState = 'AYAKTA-DEGIL'; webState = 'AYAKTA'; apiReadErr = $false; webReadErr = $false; stopCalls = 2; startCalls = 2; faultMark = '5-baslat-api: HukukPlatform-API baslatma istisnasi' }
  'b3-web-start-throw'       = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $false; recovery = $true; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'ISTISNA'; apiState = 'AYAKTA'; webState = 'AYAKTA-DEGIL'; apiReadErr = $false; webReadErr = $false; stopCalls = 2; startCalls = 2; faultMark = '5-baslat-web: HukukPlatform-Web baslatma istisnasi' }
  'b3-stop-api-fail'         = @{ b3 = $true; exit = 21; verdict = 'DURDURMA-BASARISIZ'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $true; recovery = $false; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 1; webAction = 'BASLATMA KOMUTU VERILDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA'; apiAfter = 'AYAKTA'; faultMark = '2-durdur-api: API kapanmiyor' }
  'b3-toparla-read-transient' = @{ b3 = $true; exit = 21; verdict = 'DURDURMA-BASARISIZ'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $true; recovery = $false; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 1; webAction = 'BASLATMA KOMUTU VERILDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA'; apiAfter = 'AYAKTA'; webStoppedByRun = $true; faultMark = '2-toparla: dinleyici okuma hatasi' }
  'b3-api-crash-after'       = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $false; webUp = $true; recovery = $true; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'VERILDI'; apiState = 'AYAKTA-DEGIL'; webState = 'AYAKTA'; apiPostState = 'AYAKTA'; apiReadErr = $false; webReadErr = $false; stopCalls = 2; startCalls = 2; faultMark = '5-baslat-web: API dustu (sim)' }
  'b3-web-stopthrow-api-fail' = @{ b3 = $true; exit = 21; verdict = 'DURDURMA-BASARISIZ'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $true; recovery = $false; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 1; webAction = 'BASLATMA KOMUTU VERILDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA'; apiAfter = 'AYAKTA'; webStoppedByRun = $true; faultMark = '2-durdur-web: HukukPlatform-Web durdurma istisnasi (etkili)' }
  'b3-stop-recovery-start-throw' = @{ b3 = $true; exit = 22; verdict = 'DURDURMA-BASARISIZ-TOPARLANAMADI'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $false; recovery = $true; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 1; webAction = 'BASLATMA ISTISNASI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA-DEGIL'; apiAfter = 'AYAKTA'; webStoppedByRun = $true; recWeb = 'START'; recApi = 'YOK'; faultMark = '2-toparla: HukukPlatform-Web baslatma istisnasi' }
  'b3-api-down-before'       = @{ b3 = $true; exit = 22; verdict = 'DURDURMA-BASARISIZ-TOPARLANAMADI'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $false; webUp = $true; recovery = $true; failedAt = '2-durdur-web'
                                  stopCalls = 0; startCalls = 0; webAction = 'OLCULEMEDI - baslatma komutu VERILMEDI'; apiActionPrefix = 'KAPALI - bu kosum DURDURMADI (durdurma denenmedi'; webAfter = 'OLCULEMEDI'; apiAfter = 'AYAKTA-DEGIL'; recWeb = 'OLCULEMEDI'; recApi = 'OWNER-START'; webNoStop = $true; faultMark = '0-kapilar: API kosum oncesi KAPALI (sim)' }
  'b3-final-read-transient'  = @{ b3 = $true; exit = 0;  verdict = 'ROLLBACK PASS'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true;  webUp = $true;  recovery = $false; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'VERILDI'; apiState = 'AYAKTA'; webState = 'AYAKTA'; apiReadErr = $false; webReadErr = $false; finalApiReadErr = $true; stopCalls = 2; startCalls = 2; faultMark = '6-kapsam: dinleyici okuma hatasi' }
  'b3-toparla-web-crash'     = @{ b3 = $true; exit = 22; verdict = 'DURDURMA-BASARISIZ-TOPARLANAMADI'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $false; recovery = $true; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 1; webAction = 'BASLATMA KOMUTU VERILDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA-DEGIL'; apiAfter = 'AYAKTA'; webStoppedByRun = $true; recWeb = 'START'; recApi = 'YOK'; faultMark = '2-toparla-son: WEB dustu (sim)' }
  'b3-web-down-before'       = @{ b3 = $true; exit = 22; verdict = 'DURDURMA-BASARISIZ-TOPARLANAMADI'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $false; recovery = $true; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 0; webAction = 'KAPALI - kosum oncesi CALISIYOR olculmedi (kosum oncesi durum KAPALI; durdurma komutu=VERILDI; baslatma OWNER KARARI) - baslatma komutu VERILMEDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA-DEGIL'; apiAfter = 'AYAKTA'; webStoppedByRun = $false; recWebStoppedByRun = $false; recWeb = 'OWNER-START'; recApi = 'YOK'; faultMark = '0-kapilar: WEB kosum oncesi KAPALI (sim)' }
  'b3-web-unhealthy'         = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $true; recovery = $true; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'VERILDI'; apiState = 'AYAKTA'; webState = 'AYAKTA-DEGIL'; webRec = 'DOKUNMA'; apiReadErr = $false; webReadErr = $false; stopCalls = 2; startCalls = 2; faultMark = 'WEB calisiyor ama /portal/login 500 (sim)' }
  'b3-web-late-stop'         = @{ b3 = $true; exit = 21; verdict = 'DURDURMA-BASARISIZ'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $true; recovery = $false; failedAt = '2-durdur-web'
                                  stopCalls = 1; startCalls = 1; webAction = 'BASLATMA KOMUTU VERILDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA'; apiAfter = 'AYAKTA'; webStoppedByRun = $false; recWebStoppedByRun = $true; faultMark = '2-toparla: WEB gec kapandi (sim)' }
  'b3-stop-read-persistent'  = @{ b3 = $true; exit = 22; verdict = 'DURDURMA-BASARISIZ-TOPARLANAMADI'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $true; recovery = $true; failedAt = '2-durdur-web'
                                  stopCalls = 0; startCalls = 0; webAction = 'OLCULEMEDI - baslatma komutu VERILMEDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'OLCULEMEDI'; apiAfter = 'AYAKTA'; webNoStop = $true; faultMark = '2-durdur-web: dinleyici okuma hatasi' }
  # R03-d (son inceleme duzeltmeleri)
  'b3-before-read-transient' = @{ b3 = $true; exit = 21; verdict = 'DURDURMA-BASARISIZ'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $true; recovery = $false; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 1; webAction = 'BASLATMA KOMUTU VERILDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA'; apiAfter = 'AYAKTA'; webStoppedByRun = $true; recWebStoppedByRun = $true; webBeforeReadErr = $true; faultMark = '2-durdur-web: dinleyici okuma hatasi' }
  'b3-trigger-before-swap'   = @{ b3 = $true; exit = 21; verdict = 'DURDURMA-BASARISIZ'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $true; recovery = $false; failedAt = '2-durdur-dogrula'
                                  stopCalls = 2; startCalls = 1; webAction = 'YOK (CALISIYOR - baslatma komutu VERILMEDI)'; apiActionPrefix = 'BASLATMA KOMUTU VERILDI'; webAfter = 'AYAKTA'; apiAfter = 'AYAKTA'; webStoppedByRun = $true; restarted = 'API'; preSwapWeb = 'CALISIYOR'; faultMark = '2-durdur-dogrula: WEB zamanlanmis tetikle yeniden basladi (sim)' }
  'b3-trigger-during-swap'   = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $true; recovery = $true; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'VERILDI'; apiState = 'AYAKTA'; webState = 'AYAKTA'; apiReadErr = $false; webReadErr = $false; stopCalls = 2; startCalls = 2; swapEndBad = 'WEB'; faultMark = '3-geri-yukle-web: WEB takas sirasinda tetikle basladi (sim)' }
  'b3-tuple-changed'         = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $true; recovery = $true; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'VERILDI'; apiState = 'AYAKTA'; webState = 'AYAKTA'; apiReadErr = $false; webReadErr = $false; stopCalls = 2; startCalls = 2; tupleChanged = $true; faultMark = '6-kapsam: baslatici uclusu degisti (sim)' }
  'b3-unexpected-after-kimlik' = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $false; recovery = $true; failedAt = '5-baslat-web'
                                  apiCmd = 'VERILDI'; webCmd = ''; apiState = 'AYAKTA'; webState = 'AYAKTA-DEGIL'; apiReadErr = $false; webReadErr = $false; stopCalls = 2; startCalls = 1; unexpected = $true; faultMark = '5-baslat-web: beklenmeyen hata (sim)' }
  'b3-web-down-toparla-unreadable' = @{ b3 = $true; exit = 22; verdict = 'DURDURMA-BASARISIZ-TOPARLANAMADI'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $false; recovery = $true; failedAt = '2-durdur-api'
                                  stopCalls = 2; startCalls = 0; webAction = 'OLCULEMEDI - baslatma komutu VERILMEDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA-DEGIL'; apiAfter = 'AYAKTA'; webStoppedByRun = $false; recWebStoppedByRun = $false; recWeb = 'OWNER-START'; recApi = 'YOK'; faultMark = '2-toparla: dinleyici okuma hatasi' }
  'b3-gate-read-persistent'  = @{ b3 = $true; exit = 21; verdict = 'DURDURMA-BASARISIZ'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $true; recovery = $false; failedAt = '2-durdur-dogrula'
                                  stopCalls = 2; startCalls = 2; webAction = 'BASLATMA KOMUTU VERILDI'; apiActionPrefix = 'BASLATMA KOMUTU VERILDI'; webAfter = 'AYAKTA'; apiAfter = 'AYAKTA'; webStoppedByRun = $true; preSwapWeb = 'OLCULEMEDI'; faultMark = '2-durdur-dogrula: dinleyici okuma hatasi' }
  'b3-swapend-read-persistent' = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $true; recovery = $true; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'VERILDI'; apiState = 'AYAKTA'; webState = 'AYAKTA'; apiReadErr = $false; webReadErr = $false; stopCalls = 2; startCalls = 2; swapEndBad = 'WEB'; faultMark = '3-geri-yukle-web: dinleyici okuma hatasi' }
  'b3-trigger-before-swap-api' = @{ b3 = $true; exit = 21; verdict = 'DURDURMA-BASARISIZ'; api = $EXP_CAND; web = $EXP_WEB_CAND; bid = $BID_CAND; addedPresent = $true; apiUp = $true; webUp = $true; recovery = $false; failedAt = '2-durdur-dogrula'
                                  stopCalls = 2; startCalls = 1; webAction = 'BASLATMA KOMUTU VERILDI'; apiActionPrefix = 'YOK (CALISIYOR'; webAfter = 'AYAKTA'; apiAfter = 'AYAKTA'; webStoppedByRun = $true; preSwapApi = 'CALISIYOR'; faultMark = '2-durdur-dogrula: API zamanlanmis tetikle yeniden basladi (sim)' }
  'b3-tuple-unreadable'      = @{ b3 = $true; exit = 13; verdict = 'ROLLBACK-OK-ESKI-BASLAMADI'; api = $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $true; webUp = $true; recovery = $true; failedAt = ''
                                  apiCmd = 'VERILDI'; webCmd = 'VERILDI'; apiState = 'AYAKTA'; webState = 'AYAKTA'; apiReadErr = $false; webReadErr = $false; stopCalls = 2; startCalls = 2; tupleUnreadable = $true; faultMark = '6-kapsam: baslatici uclusu okunamadi (sim)' }
  'b3-swap-trigger-kimlik-fail' = @{ b3 = $true; exit = 11; verdict = 'ROLLBACK-DOGRULANAMADI'; api = 'NOT:' + $EXP_LIVE; web = $EXP_WEB_LIVE; bid = $BID_LIVE; addedPresent = $false; apiUp = $false; webUp = $true; recovery = $true; failedAt = '4-kimlik'
                                  stopCalls = 2; startCalls = 0; swapEndBad = 'WEB'; faultMark = '3-geri-yukle-web: WEB takas sirasinda tetikle basladi (sim)' }
  'gate-fault-live-mode'        = @{ gate = $true }
  'gate-testroot-under-live'    = @{ gate = $true }
  'gate-sim-missing'            = @{ gate = $true }
  'gate-evidence-fallback'      = @{ gate = $true }
  'gate-rollback-backup-missing' = @{ gate = $true }
  'gate-rogue-process'          = @{ gate = $true }
  'gate-rogue-viewer-only'      = @{ gate = $true }
  'gate-rogue-classifier'       = @{ gate = $true; noProcess = $true }
  'gate-rogue-wiring'           = @{ gate = $true; noProcess = $true }
  'gate-svc-measure'            = @{ gate = $true; noProcess = $true }
}
$PristineDir = (Get-Item -LiteralPath $PristineDir).FullName; $CandApps = (Get-Item -LiteralPath $CandApps).FullName
$ProvaRoot = [IO.Path]::GetFullPath($ProvaRoot).TrimEnd('\')
if ($ProvaRoot.StartsWith($LIVE_ROOT_CANON, [StringComparison]::OrdinalIgnoreCase)) { Write-Host 'HARNESS: ProvaRoot canli kok altinda olamaz'; exit 1 }
$RUN_TS = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'
$TESTROOT = Join-Path $ProvaRoot 'testroot'
$EVID = Join-Path $ProvaRoot 'evidence'
$RUN_EVID = Join-Path $EVID ('run-' + $RUN_TS)
$GATE_ROOT = Join-Path $ProvaRoot ('gate\' + $RUN_TS)
$EMPTY = Join-Path $ProvaRoot '.empty'
New-Item -ItemType Directory -Force -Path $TESTROOT, $EVID, $RUN_EVID, $EMPTY | Out-Null
$P_API = Join-Path $PristineDir 'api-src'; $P_WEB = Join-Path $PristineDir 'web'
$C_API = Join-Path $CandApps 'api\dist\apps\api\src'; $C_WEB = Join-Path $CandApps 'web'
$T_LIVE_API_ROOT = Join-Path $TESTROOT 'live\api'; $T_LIVE = Join-Path $T_LIVE_API_ROOT 'dist\apps\api\src'
$T_LIVE_WEB = Join-Path $TESTROOT 'live\web'; $T_LIVE_NEXT = Join-Path $T_LIVE_WEB '.next'; $T_LIVE_CFG = Join-Path $T_LIVE_WEB 'next.config.js'
$T_CAND = Join-Path $TESTROOT 'cand\api\dist\apps\api\src'; $T_CAND_WEB = Join-Path $TESTROOT 'cand\web'
$T_SIM = Join-Path $TESTROOT 'sim'; $T_STATE = Join-Path $T_SIM 'state.json'; $T_EVID = Join-Path $TESTROOT 'evidence'
$TEMP_FALLBACK = Join-Path ([IO.Path]::GetFullPath($env:TEMP)) 'r27-evidence-fallback'
$hlog = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $l = ((Get-Date).ToUniversalTime().ToString('HH:mm:ss') + 'Z  ' + $m); Write-Host $l; $hlog.Add($l) }
function Sha([string]$p) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash }
function Get-Map([string]$root, [switch]$Web) {
  $m = [ordered]@{}
  foreach ($f in (Get-ChildItem -LiteralPath $root -Recurse -File -Force)) {
    $rel = ($f.FullName.Substring($root.Length).TrimStart('\', '/')) -replace '\\', '/'
    if ($Web -and ($rel.StartsWith('cache/') -or $rel -ceq 'trace')) { continue }
    $m[$rel] = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash
  }
  return $m
}
function Get-TreeDigest($map) {
  $sb = New-Object Text.StringBuilder
  $keys = New-Object 'System.Collections.Generic.List[string]'
  foreach ($k in $map.Keys) { $keys.Add([string]$k) }
  $keys.Sort([StringComparer]::Ordinal)
  foreach ($k in $keys) { [void]$sb.Append($k).Append("`0").Append($map[$k]).Append("`n") }
  return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString()))).Replace('-', '')
}
function Get-MaxRelLen($map) { $m = 0; foreach ($k in $map.Keys) { if (([string]$k).Length -gt $m) { $m = ([string]$k).Length } }; return $m }
function Mirror([string]$src, [string]$dst) {
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $global:LASTEXITCODE = 0
  & robocopy.exe $src $dst /MIR /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -ge 8) { throw ('robocopy /MIR ' + $src + ' -> ' + $dst + ' rc=' + $LASTEXITCODE) }
}
function Write-SimState([string]$path, $rogueProcs = $null) {
  $state = [ordered]@{ apiRunning = $true; webRunning = $true; apiPid = 4242; webPid = 4343; launcherTuple = 'P1-SONRASI'
    apiAction = 'C:\Ops\hukuk\bin\hukuk-task-host.exe api'; webAction = 'C:\Ops\hukuk\bin\hukuk-task-host.exe web'
    procCommandLine = 'sim node C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\dist\apps\api\src\main.js (SIMULATOR)'
    stopCalls = 0; startCalls = 0; eventLog = '' }
  if ($null -ne $rogueProcs) { $state.rogueProcs = @($rogueProcs) }   # sentetik surec listesi (sahte-surec kapisi icin)
  New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  [IO.File]::WriteAllText($path, ($state | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
}
function Reset-TestRoot([string]$scenario) {
  Say ('[' + $scenario + '] TestRoot sifirlaniyor (robocopy /MIR; yalniz ' + $TESTROOT + ' altinda)')
  Mirror $P_API $T_LIVE
  Mirror $P_WEB $T_LIVE_WEB          # .next + next.config.js ; onceki senaryonun .next.pre-*/.next.r27-* kalintilarini da temizler
  Mirror $C_API $T_CAND
  Mirror $C_WEB $T_CAND_WEB
  Mirror $EMPTY $T_EVID              # onceki senaryonun yedekleri/karantinasi (TestRoot icinde) temizlenir
  Mirror $EMPTY $T_SIM
  New-Item -ItemType Directory -Force -Path $T_LIVE_API_ROOT | Out-Null
  [IO.File]::WriteAllBytes((Join-Path $T_LIVE_API_ROOT '.env'), [Text.Encoding]::ASCII.GetBytes("R27_TESTROOT_FAKE_ENV=1`n"))
  Write-SimState $T_STATE
}
function Get-LiveDigests {
  $r = [ordered]@{}
  $r.api = Get-TreeDigest (Get-Map $T_LIVE)
  $r.web = $(if (Test-Path -LiteralPath $T_LIVE_NEXT) { Get-TreeDigest (Get-Map $T_LIVE_NEXT -Web) } else { 'YOK' })
  $r.bid = $(if (Test-Path -LiteralPath (Join-Path $T_LIVE_NEXT 'BUILD_ID')) { (Get-Content -Raw -LiteralPath (Join-Path $T_LIVE_NEXT 'BUILD_ID')).Trim() } else { 'YOK' })
  $r.cfg = Sha $T_LIVE_CFG
  $r.addedPresent = @($ADDED | Where-Object { Test-Path -LiteralPath (Join-Path $T_LIVE ($_ -replace '/', '\')) -PathType Leaf })
  return $r
}
function Run-Script([string]$file, [string[]]$argList, [string]$outFile) {
  $global:LASTEXITCODE = -999
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $ChildShell; $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.Arguments = ('-NoProfile -ExecutionPolicy Bypass -File "' + $file + '" ' + ($argList -join ' '))
  $p = [Diagnostics.Process]::Start($psi)
  $errTask = $p.StandardError.ReadToEndAsync()
  $out = $p.StandardOutput.ReadToEnd(); $p.WaitForExit(); $err = $errTask.Result
  [IO.File]::WriteAllText($outFile, $out + $(if ($err) { "`n--- STDERR ---`n" + $err } else { '' }), (New-Object Text.UTF8Encoding($false)))
  return @{ rc = $p.ExitCode; out = $out }
}
function Find-EvidencePath([string]$out) {
  $m = [regex]::Match($out, '(?m)^KANIT: (.+?\.json) sha256=([0-9A-F]{64})')
  if ($m.Success) { return @{ path = $m.Groups[1].Value; sha = $m.Groups[2].Value } }
  return $null
}
function Get-DirFileCount([string]$d) { if (Test-Path -LiteralPath $d) { return @(Get-ChildItem -LiteralPath $d -File -Force -ErrorAction SilentlyContinue).Count } else { return -1 } }
function Assert($list, [string]$name, [bool]$cond, [string]$detail) { $list.Add([ordered]@{ name = $name; ok = $cond; detail = $detail }); Say (('  ' + $(if ($cond) { 'OK  ' } else { 'FAIL' }) + ' ' + $name + ' : ' + $detail)) }
function Q([string]$s) { return ('"' + $s + '"') }
function Get-GateIntegrity([string]$file) {
  # Sahte-surec kapi zincirinin BUTUNLUK olcumu (AST; betik KOSULMAZ). Olculen: kapi fonksiyonlarinin ve ROGUE_* atamalarinin tam metni,
  # SelfTest blogu ve akisin 0-kapilar kesiti, fonksiyon tanim kumesi (yalniz ust duzey, tekil), dinamik tanim/golge kullanimi, mod
  # degiskenleri ($TEST/$TestRoot/$Fault/$SIM_STATE) envanteri, $ge atamalari ve kapi cagri konumlari. Harness bunlari pinle TAM ESIT
  # ister; bilincli degisiklik pinleri yeniler (fark incelemede gorunur). SINIR: kasitli ve bu olcumlerin disinda kalan bir duzenlemeyi
  # (ornegin baska bir canli/test ayrimi) kanitlayamaz; o sinif icin savunma yayin betiginin sha pini + incelemedir.
  $tok = $null; $perr = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tok, [ref]$perr)
  $sh = { param($t) return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes((([string]$t) -replace "`r`n", "`n")))).Replace('-', '') }
  $ord = { param($a) $l = New-Object 'System.Collections.Generic.List[string]'; foreach ($x in @($a)) { $l.Add([string]$x) }; $l.Sort([StringComparer]::Ordinal); return ,($l.ToArray()) }
  $vn = { param($v) return (([string]$v.VariablePath.UserPath) -replace '^(?i)(global|script|local|private|using|variable):', '') }   # VariablePath.UnqualifiedPath PowerShell'de genel DEGIL ($null doner)
  $r = [ordered]@{ parseErrors = [string]@($perr).Count }
  $allF = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true))
  $top = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.FunctionDefinitionAst] })
  $r.functionsTotal = [string]$allF.Count; $r.functionsTop = [string]$top.Count
  $r.functionsDuplicate = ((& $ord @($allF | Group-Object Name | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })) -join ',')
  $r.functionNamesSha = & $sh ((& $ord @($top | ForEach-Object { $_.Name })) -join "`n")
  foreach ($n in @('Say', 'Get-SimState', 'ConvertTo-RogueFolded', 'Get-RogueMatchInfo', 'Test-RogueMatch', 'Get-RogueClass', 'Get-RogueItemName', 'Get-RogueReport', 'Get-ProcList',
                   'Get-LiveRogueReport', 'Get-RogueCount', 'Get-RogueGateError', 'Write-RogueReport', 'Invoke-RogueGate', 'Test-RogueClassifier')) {
    $d = @($top | Where-Object { $_.Name -ceq $n }); $r[('fn:' + $n)] = $(if ($d.Count -eq 1) { & $sh $d[0].Extent.Text } else { 'ADET=' + $d.Count })
  }
  $isRogueAsg = { param($n) return ($n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and (& $vn $n.Left) -like 'ROGUE_*') }
  $rg = @($ast.EndBlock.Statements | Where-Object { & $isRogueAsg $_ })
  $r.rogueAssignTop = [string]$rg.Count
  $r.rogueAssignAll = [string]@($ast.FindAll({ param($n) & $isRogueAsg $n }, $true)).Count
  $r.rogueAssignSha = & $sh ((@($rg | ForEach-Object { $_.Extent.Text })) -join "`n")
  $r.selfPathAssign = ((@($rg | Where-Object { (& $vn $_.Left) -ceq 'ROGUE_SELF_PATH' } | ForEach-Object { $_.Right.Extent.Text })) -join ' | ')
  $selfIf = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.IfStatementAst] -and $_.Clauses.Count -ge 1 -and $_.Clauses[0].Item1.Extent.Text -ceq '$SelfTest' })
  $r.selfTestBlocks = [string]$selfIf.Count
  $r.selfTestSha = $(if ($selfIf.Count -eq 1) { & $sh $selfIf[0].Extent.Text } else { 'YOK' })
  if ($selfIf.Count -eq 1) {
    $b = $selfIf[0].Clauses[0].Item2
    $r.selfFailsAssign = (@($b.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and (& $vn $n.Left) -ieq 'fails' }, $true) | ForEach-Object { $_.Extent.Text })) -join ' | '
    $r.selfFailsUnary = ((& $ord @($b.FindAll({ param($n) $n -is [System.Management.Automation.Language.UnaryExpressionAst] -and $n.Child -is [System.Management.Automation.Language.VariableExpressionAst] -and (& $vn $n.Child) -ieq 'fails' }, $true) | ForEach-Object { [string]$_.TokenKind } | Select-Object -Unique)) -join ',')
    $r.selfClassifierLink = [string]@($b.FindAll({ param($n) $n -is [System.Management.Automation.Language.IfStatementAst] -and $n.Clauses.Count -eq 1 -and $n.Clauses[0].Item1.Extent.Text -ceq '-not $rcOk' -and $n.Clauses[0].Item2.Extent.Text -ceq '{ $fails++ }' }, $true)).Count
    $r.selfJumps = (@($b.FindAll({ param($n) $n -is [System.Management.Automation.Language.ExitStatementAst] -or $n -is [System.Management.Automation.Language.ReturnStatementAst] -or $n -is [System.Management.Automation.Language.BreakStatementAst] -or $n -is [System.Management.Automation.Language.ContinueStatementAst] }, $true) | ForEach-Object { $_.Extent.Text })) -join ' | '
  }
  $inner = @()
  foreach ($o in @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] })) {
    $inner += @($o.Body.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] -and $_.Body.Statements.Count -gt 0 -and $_.Body.Statements[0].Extent.Text -ceq "Set-Stage '0-kapilar'" })
  }
  $r.flowBlocks = [string]$inner.Count
  if ($inner.Count -eq 1) {
    $st = @($inner[0].Body.Statements); $gi = -1
    for ($i = 0; $i -lt $st.Count; $i++) { if ($st[$i].Extent.Text -ceq '$ge = Invoke-RogueGate') { $gi = $i } }
    $r.flowGateIndex = [string]$gi
    $r.flowSegmentSha = $(if ($gi -ge 0 -and ($gi + 1) -lt $st.Count) { & $sh ((@($st[0..($gi + 1)] | ForEach-Object { $_.Extent.Text })) -join "`n") } else { 'YOK' })
    $r.flowAfterGate = $(if ($gi -ge 0 -and ($gi + 2) -lt $st.Count) { $st[$gi + 2].Extent.Text } else { '' })
    $pre = @(); if ($gi -gt 0) { $pre = @($st[0..($gi - 1)]) }
    $r.flowPreGateJumps = (@($pre | ForEach-Object { $_.FindAll({ param($n) $n -is [System.Management.Automation.Language.ExitStatementAst] -or $n -is [System.Management.Automation.Language.ReturnStatementAst] -or $n -is [System.Management.Automation.Language.BreakStatementAst] -or $n -is [System.Management.Automation.Language.ContinueStatementAst] }, $true) } | ForEach-Object { $_.Extent.Text })) -join ' | '
  }
  $calls = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-RogueGate' }, $true))
  $r.gateCallCount = [string]$calls.Count
  $sites = New-Object 'System.Collections.Generic.List[string]'
  foreach ($c in $calls) {
    $a = $c.Parent; if ($null -ne $a) { $a = $a.Parent }
    if ($a -is [System.Management.Automation.Language.AssignmentStatementAst] -and $a.Extent.Text -ceq '$ge = Invoke-RogueGate' -and $a.Parent -is [System.Management.Automation.Language.StatementBlockAst]) {
      $blk = $a.Parent; $i = $blk.Statements.IndexOf($a); $nx = $(if (($i + 1) -lt $blk.Statements.Count) { $blk.Statements[$i + 1].Extent.Text } else { '' })
      $kind = 'BILINMEYEN-BLOK'
      if ($selfIf.Count -eq 1 -and [object]::ReferenceEquals($blk, $selfIf[0].Clauses[0].Item2)) { $kind = 'selftest' }
      elseif ($inner.Count -eq 1 -and [object]::ReferenceEquals($blk, $inner[0].Body)) { $kind = 'akis' }
      $sites.Add($kind + ' -> ' + $nx)
    } else { $sites.Add('BICIM-DISI: ' + $c.Extent.Text) }
  }
  $r.gateSites = ((& $ord $sites) -join ' || ')
  $r.geAssignAll = [string]@($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and (& $vn $n.Left) -ieq 'ge' }, $true)).Count
  $FORBID = @('Set-Alias', 'New-Alias', 'sal', 'nal', 'Set-Variable', 'sv', 'New-Variable', 'nv', 'Get-Variable', 'gv', 'Remove-Variable', 'rv', 'Clear-Variable', 'clv',
              'Invoke-Expression', 'iex', 'Import-Module', 'ipmo', 'Add-Type', 'Invoke-Command', 'icm', 'Set-Item', 'si', 'New-Module', 'nmo', 'Set-PSBreakpoint', 'Update-TypeData', 'Update-FormatData')
  $dyn = New-Object 'System.Collections.Generic.List[string]'
  foreach ($c in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true))) { $nm = $c.GetCommandName(); if ($nm -and ($FORBID -icontains $nm)) { $dyn.Add('komut:' + $nm) } }
  foreach ($s in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -or $n -is [System.Management.Automation.Language.ExpandableStringExpressionAst] }, $true))) {
    if ([regex]::IsMatch([string]$s.Value, '^\s*(function|alias|variable):', 'IgnoreCase')) { $dyn.Add('surucu:' + ([string]$s.Value).Split(':')[0]) }
  }
  foreach ($t in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.TypeExpressionAst] -and @('scriptblock', 'System.Management.Automation.ScriptBlock', 'powershell', 'System.Management.Automation.PowerShell', 'runspacefactory') -icontains $n.TypeName.FullName }, $true))) { $dyn.Add('tur:' + $t.TypeName.FullName) }
  foreach ($v in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and @('ExecutionContext', 'PSBoundParameters', 'MyInvocation') -icontains (& $vn $n) }, $true))) { $dyn.Add('degisken:' + (& $vn $v)) }
  $encl0 = { param($n) $e = $n.Parent; while ($null -ne $e) { if ($e -is [System.Management.Automation.Language.FunctionDefinitionAst]) { return $e.Name }; $e = $e.Parent }; return '<ust>' }
  foreach ($v in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and @('PSDefaultParameterValues', 'PSModuleAutoLoadingPreference', 'PSCommandPath') -icontains (& $vn $n) }, $true))) {
    $dyn.Add('tercih:' + (& $vn $v) + '@' + (& $encl0 $v))
  }
  foreach ($v in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and $n.VariablePath.IsDriveQualified -and @('function', 'alias', 'variable') -icontains [string]$n.VariablePath.DriveName }, $true))) {
    $dyn.Add('surucu-degisken:' + ([string]$v.VariablePath.DriveName).ToLowerInvariant())
  }
  $r.dynamicUse = ((& $ord $dyn) -join ',')
  $ex = @{}
  foreach ($x in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.ExitStatementAst] }, $true))) { $k = & $encl0 $x; $ex[$k] = 1 + [int]$ex[$k] }
  $r.exitSites = ((& $ord @($ex.Keys | ForEach-Object { $_ + '=' + $ex[$_] })) -join ';')
  $inv = @{}
  $modeNames = @('TEST', 'TESTROOT', 'FAULT', 'SIM_STATE')
  $encl = { param($n) $e = $n.Parent; while ($null -ne $e) { if ($e -is [System.Management.Automation.Language.FunctionDefinitionAst]) { return $e.Name }; $e = $e.Parent }; return '<ust>' }
  foreach ($v in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and ($modeNames -contains (& $vn $n).ToUpperInvariant()) }, $true))) {
    $k = (& $encl $v) + ':' + (& $vn $v).ToUpperInvariant(); $inv[$k] = 1 + [int]$inv[$k]
  }
  foreach ($s in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and ($modeNames -contains ([string]$n.Value).ToUpperInvariant()) }, $true))) {
    $k = (& $encl $s) + ':DIZGI:' + ([string]$s.Value).ToUpperInvariant(); $inv[$k] = 1 + [int]$inv[$k]
  }
  $r.modeVarInventory = ((& $ord @($inv.Keys | ForEach-Object { $_ + '=' + $inv[$_] })) -join ';')
  return $r
}
# ---- /Get-GateIntegrity

# ---------------------------------------------------------------- 0) PRISTINE / ADAY KIMLIGI + YOL BUTCESI
Say ('HARNESS baslangic: ProvaRoot=' + $ProvaRoot + ' | Pristine=' + $PristineDir + ' | Cand=' + $CandApps + ' | scripts=' + $ScriptDir + ' | cocuk kabuk=' + $ChildShell + ' | run=' + $RUN_TS)
foreach ($f in @($RELEASE, $ROLLBACK, $PSCommandPath)) {
  $tok = $null; $perr = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$tok, [ref]$perr)
  if ($perr.Count -ne 0) { Write-Host ('HARNESS: parse hatasi ' + $f + ' (' + $perr.Count + ')'); exit 1 }
  Say ('betik parse OK: ' + $f + ' sha256=' + (Sha $f))
}
$pMapApi = Get-Map $P_API; $pMapWeb = Get-Map (Join-Path $P_WEB '.next') -Web
$pApi = Get-TreeDigest $pMapApi; $pWeb = Get-TreeDigest $pMapWeb; $pCfg = Sha (Join-Path $P_WEB 'next.config.js')
$cMapWeb = Get-Map (Join-Path $C_WEB '.next') -Web
$cApi = Get-TreeDigest (Get-Map $C_API); $cWeb = Get-TreeDigest $cMapWeb; $cCfg = Sha (Join-Path $C_WEB 'next.config.js')
Say ('pristine api=' + $pApi + ' (' + ($pApi -ceq $EXP_LIVE) + ') web=' + $pWeb + ' (' + ($pWeb -ceq $EXP_WEB_LIVE) + ') cfg=' + ($pCfg -ceq $CFG_LIVE))
Say ('aday     api=' + $cApi + ' (' + ($cApi -ceq $EXP_CAND) + ') web=' + $cWeb + ' (' + ($cWeb -ceq $EXP_WEB_CAND) + ') cfg=' + ($cCfg -ceq $CFG_LIVE))
if (-not ($pApi -ceq $EXP_LIVE -and $pWeb -ceq $EXP_WEB_LIVE -and $pCfg -ceq $CFG_LIVE -and $cApi -ceq $EXP_CAND -and $cWeb -ceq $EXP_WEB_CAND -and $cCfg -ceq $CFG_LIVE)) {
  Write-Host 'HARNESS: pristine/aday kimligi pinlerle tutmadi - OLCULEMEDI'; exit 3
}
# yol butcesi: TestRoot altindaki yedek/hazirlik/onceki-.next kokleri (ts 16 kr: yyyyMMdd-HHmmssZ) + en uzun goreli yol < 260
$maxRelApi = Get-MaxRelLen $pMapApi; $maxRelWeb = [Math]::Max((Get-MaxRelLen $pMapWeb), (Get-MaxRelLen $cMapWeb))
$tsLen = 16
$budget = [ordered]@{
  backupApi     = (Join-Path $T_EVID 'rollback-api-src-R26-').Length + $tsLen + 1 + $maxRelApi
  backupWebNext = (Join-Path $T_EVID 'rollback-web-R26-').Length + $tsLen + 6 + $maxRelWeb
  stagedNext    = (Join-Path $T_LIVE_WEB '.next.r27-staged-').Length + $tsLen + 1 + $maxRelWeb
  preNext       = (Join-Path $T_LIVE_WEB '.next.pre-r27-').Length + $tsLen + 1 + $maxRelWeb
  failedNext    = (Join-Path $T_LIVE_WEB '.next.r27-failed-').Length + $tsLen + 1 + $maxRelWeb
  rollbackFailedNext = (Join-Path $T_LIVE_WEB '.next.rollback-from-r27-').Length + $tsLen + 1 + $maxRelWeb
}
$budgetOk = $true; foreach ($k in $budget.Keys) { if ($budget[$k] -ge 260) { $budgetOk = $false } }
Say ('yol butcesi (<260; maxRelApi=' + $maxRelApi + ' maxRelWeb=' + $maxRelWeb + '): ' + (($budget.Keys | ForEach-Object { $_ + '=' + $budget[$_] + ' (marj ' + (260 - $budget[$_]) + ')' }) -join ' | ') + ' -> ok=' + $budgetOk)
if (-not $budgetOk) { Write-Host ('HARNESS: yol butcesi asildi - ProvaRoot cok uzun (' + $ProvaRoot.Length + ' kr); WinPS 5.1 yedek yollarini okuyamaz - OLCULEMEDI'); exit 3 }

# ---------------------------------------------------------------- 1) SENARYOLAR
$results = New-Object System.Collections.Generic.List[object]
$lastHappyEvidence = $null
foreach ($sc in $Scenarios) {
  if (-not $EXPECT.ContainsKey($sc)) { Write-Host ('HARNESS: bilinmeyen senaryo ' + $sc); exit 1 }
  $exp = $EXPECT[$sc]; $asserts = New-Object System.Collections.Generic.List[object]
  $scDir = Join-Path $RUN_EVID $sc; New-Item -ItemType Directory -Force -Path $scDir | Out-Null
  $t0 = Get-Date
  $isGate = [bool]$exp.gate
  Say ('================ SENARYO ' + $sc + $(if ($isGate) { ' (kapi senaryosu)' } else { ' (beklenen cikis ' + $exp.exit + ' / ' + $exp.verdict + ')' }))
  $r = $null; $evPath = $null; $ev = $null; $evCopy = $null
  try {
    if ($isGate) {
      # ---------------------------------------------------------- KAPI SENARYOLARI
      $liveEvidBefore = Get-DirFileCount $LIVE_EVID_DIR
      switch ($sc) {
        'gate-fault-live-mode' {
          # TestRoot YOK + -Fault: betik param kontrolunde (canli yol cozumlemesinden ONCE) 20 ile cikar; canli kanit dizinine dosya birakmaz
          $r = Run-Script $RELEASE @('-Fault', 'api-copy-interrupt') (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'KAPI mesaji (-Fault yalniz -TestRoot ile)' ($r.out -match 'KAPI: -Fault yalniz -TestRoot') ''
          Assert $asserts 'kanit JSON YOK (akisa girmedi)' ($null -eq (Find-EvidencePath $r.out)) ''
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore + ' sonra=' + (Get-DirFileCount $LIVE_EVID_DIR))
          # B3 (R03-c): -Fault canli modda (TestRoot YOK) -> 20, ilk satirlarda; yedek/durdurma/kanit YOK
          $rb = Run-Script $ROLLBACK @('-BackupApiDir', (Q 'X:\yok-api'), '-BackupWebDir', (Q 'X:\yok-web'), '-Fault', 'b3-read-transient') (Join-Path $scDir 'stdout-rollback.txt')
          Assert $asserts 'B3: -Fault canli modda -> cikis 20 + KAPI mesaji; kanit JSON yok' ($rb.rc -eq 20 -and $rb.out -match 'KAPI: -Fault yalniz -TestRoot' -and $null -eq (Find-EvidencePath $rb.out)) ('rc=' + $rb.rc)
        }
        'gate-testroot-under-live' {
          $under = Join-Path $LIVE_ROOT_CANON 'r27-prova-olmayan-dizin'
          $r = Run-Script $RELEASE @('-TestRoot', (Q $under)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'release: cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'release: KAPI mesaji (canli kok altinda)' ($r.out -match 'KAPI: TestRoot canli kokun altinda') ''
          $r2 = Run-Script $ROLLBACK @('-BackupApiDir', (Q 'X:\yok-api'), '-BackupWebDir', (Q 'X:\yok-web'), '-TestRoot', (Q $under)) (Join-Path $scDir 'stdout-rollback.txt')
          Assert $asserts 'rollback: cikis kodu 20' ($r2.rc -eq 20) ('rc=' + $r2.rc)
          Assert $asserts 'rollback: KAPI mesaji (canli kok altinda)' ($r2.out -match 'KAPI: TestRoot canli kokun altinda') ''
          $r3 = Run-Script $RELEASE @('-TestRoot', (Q $LIVE_ROOT_CANON)) (Join-Path $scDir 'stdout-equal.txt')
          Assert $asserts 'release: TestRoot canli koke ESIT -> 20' ($r3.rc -eq 20 -and $r3.out -match 'KAPI: TestRoot canli kokun altinda') ('rc=' + $r3.rc)
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-sim-missing' {
          $tr = Join-Path $GATE_ROOT 'sim-missing'; New-Item -ItemType Directory -Force -Path $tr | Out-Null
          $r = Run-Script $RELEASE @('-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit JSON yazildi (KANIT: satiri)' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'kanit TestRoot\evidence altinda ve sha esit' ($evPath.path.StartsWith((Join-Path $tr 'evidence'), [StringComparison]::OrdinalIgnoreCase) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.path
            $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU / exit 20' ($ev.verdict -ceq 'KAPIDA-DURDU' -and [int]$ev.exitCode -eq 20) ('verdict=' + $ev.verdict + ' exit=' + $ev.exitCode)
            Assert $asserts 'failedAt=0-kapilar ve stage=0-kapilar (7-kanit DEGIL)' ([string]$ev.failedAt -ceq '0-kapilar' -and [string]$ev.stage -ceq '0-kapilar') ('failedAt=' + $ev.failedAt + ' stage=' + $ev.stage)
            Assert $asserts 'error: simulator durumu yok' ([string]$ev.error -match 'simulator durumu yok') ([string]$ev.error)
            Assert $asserts 'rollback yok, servisler durdurulmadi' ($null -eq $ev.rollback) ''
          }
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-evidence-fallback' {
          $tr = Join-Path $GATE_ROOT 'evidence-fallback'; New-Item -ItemType Directory -Force -Path $tr | Out-Null
          [IO.File]::WriteAllText((Join-Path $tr 'evidence'), 'bu bir DOSYA - dizin olusturulamaz (enjekte)')   # evidence dizini yerine dosya
          $fbBefore = Get-DirFileCount $TEMP_FALLBACK
          $r = Run-Script $RELEASE @('-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'KANIT YAZILAMADI satiri (TestRoot\evidence)' ($r.out -match '(?m)^KANIT YAZILAMADI \(') ''
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit %TEMP% fallback dizinine yazildi' ($null -ne $evPath -and $evPath.path.StartsWith($TEMP_FALLBACK, [StringComparison]::OrdinalIgnoreCase)) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'fallback kanit dosyasi mevcut ve sha esit' ((Test-Path -LiteralPath $evPath.path) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.sha.Substring(0, 16)
            Assert $asserts 'fallback dizininde dosya sayisi +1' ((Get-DirFileCount $TEMP_FALLBACK) -eq ($fbBefore + 1) -or $fbBefore -lt 0) ('once=' + $fbBefore + ' sonra=' + (Get-DirFileCount $TEMP_FALLBACK))
            $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU' ($ev.verdict -ceq 'KAPIDA-DURDU') ('verdict=' + $ev.verdict)
          }
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-rollback-backup-missing' {
          $tr = Join-Path $GATE_ROOT 'rb-backup-missing'; New-Item -ItemType Directory -Force -Path $tr | Out-Null
          Write-SimState (Join-Path $tr 'sim\state.json')
          $bkA = Join-Path $tr 'yok-api'; $bkW = Join-Path $tr 'yok-web'
          $rs = Run-Script $ROLLBACK @('-BackupApiDir', (Q $bkA), '-BackupWebDir', (Q $bkW), '-TestRoot', (Q $tr), '-SelfTest') (Join-Path $scDir 'stdout-selftest.txt')
          Assert $asserts 'SelfTest: cikis 1 (FAIL, yedek olculemedi)' ($rs.rc -eq 1 -and $rs.out -match 'SELFTEST SONUC: FAIL') ('rc=' + $rs.rc)
          Assert $asserts 'SelfTest: yedek dizini yok mesaji' ($rs.out -match 'yedek butunlugu OLCULEMEDI: yedek dizini yok') ''
          $r = Run-Script $ROLLBACK @('-BackupApiDir', (Q $bkA), '-BackupWebDir', (Q $bkW), '-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'gercek kosum: cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit JSON yazildi (KANIT: satiri) - kanitsiz 20 YOK' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'kanit TestRoot\evidence altinda ve sha esit' ($evPath.path.StartsWith((Join-Path $tr 'evidence'), [StringComparison]::OrdinalIgnoreCase) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.path
            $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU / exit 20' ($ev.verdict -ceq 'KAPIDA-DURDU' -and [int]$ev.exitCode -eq 20) ('verdict=' + $ev.verdict + ' exit=' + $ev.exitCode)
            Assert $asserts 'failedAt=1-yedek-butunluk, stage=1-yedek-butunluk' ([string]$ev.failedAt -ceq '1-yedek-butunluk' -and [string]$ev.stage -ceq '1-yedek-butunluk') ('failedAt=' + $ev.failedAt + ' stage=' + $ev.stage)
            Assert $asserts 'error: yedek butunlugu olculemedi' ([string]$ev.error -match 'yedek butunlugu olculemedi') ([string]$ev.error)
            Assert $asserts 'restoreSteps yok (dosyalara dokunulmadi)' ($null -eq $ev.restoreSteps) ''
            $st = Get-Content -Raw -LiteralPath (Join-Path $tr 'sim\state.json') | ConvertFrom-Json
            Assert $asserts 'simulator: stop/start cagrisi yok' ([int]$st.stopCalls -eq 0 -and [int]$st.startCalls -eq 0 -and [bool]$st.apiRunning -and [bool]$st.webRunning) ('stop=' + $st.stopCalls + ' start=' + $st.startCalls)
          }
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-rogue-process' {
          # AKISTAKI kapi: simulatore sentetik surec listesi enjekte edilir (kosucu + dogrulanmis goruntuleyici + ilgisiz surec) -> 0-kapilar DUR (20)
          $tr = Join-Path $GATE_ROOT 'rogue-process'; New-Item -ItemType Directory -Force -Path (Join-Path $tr 'live\api') | Out-Null
          [IO.File]::WriteAllBytes((Join-Path $tr 'live\api\.env'), [Text.Encoding]::ASCII.GetBytes("R27_TESTROOT_FAKE_ENV=1`n"))
          $rp = @(
            [ordered]@{ ProcessId = 5001; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'node.exe'; CommandLine = 'node D:\g\d5-portal-reset-live-run.js --token S3CR3T-DEGER postgresql://kullanici:S3CR3T@127.0.0.1:1/db'; ExecutablePath = 'C:\n\node.exe' },
            [ordered]@{ ProcessId = 5002; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'tail.exe'; CommandLine = 'tail -f D:\x\r27-izleme.log'; ExecutablePath = (Join-Path $env:ProgramFiles 'Git\usr\bin\tail.exe') },
            [ordered]@{ ProcessId = 5003; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'node.exe'; CommandLine = 'node D:\app\server.js'; ExecutablePath = 'C:\n\node.exe' })
          Write-SimState (Join-Path $tr 'sim\state.json') $rp
          $r = Run-Script $RELEASE @('-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'akis kapida DURDU: ADAY DOGRULAMA asamasina GECILMEDI' ($r.out -notmatch 'ADAY DOGRULAMA') ''
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit JSON yazildi (KANIT: satiri)' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'kanit TestRoot\evidence altinda ve sha esit' ($evPath.path.StartsWith((Join-Path $tr 'evidence'), [StringComparison]::OrdinalIgnoreCase) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.path
            $evText = Get-Content -Raw -LiteralPath $evPath.path; $ev = $evText | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU / exit 20' ($ev.verdict -ceq 'KAPIDA-DURDU' -and [int]$ev.exitCode -eq 20) ('verdict=' + $ev.verdict + ' exit=' + $ev.exitCode)
            Assert $asserts 'failedAt=0-kapilar' ([string]$ev.failedAt -ceq '0-kapilar') ('failedAt=' + $ev.failedAt)
            Assert $asserts 'error: sahte-surec kapisinin KENDI metni (izleme dahil 2 eslesme)' ([string]$ev.error -match 'test/prova sureci var \(izleme dahil 2 eslesme\)') ([string]$ev.error)
            Assert $asserts 'health.rogue: eslesen=2 (test-uygulama=1 izleme=1) taranan=3 simulated' ([int]$ev.health.rogue.count -eq 2 -and [int]$ev.health.rogue.testApp -eq 1 -and [int]$ev.health.rogue.viewers -eq 1 -and [int]$ev.health.rogue.scanned -eq 3 -and [bool]$ev.health.rogue.simulated) ('count=' + $ev.health.rogue.count + ' testApp=' + $ev.health.rogue.testApp + ' izleme=' + $ev.health.rogue.viewers + ' taranan=' + $ev.health.rogue.scanned)
            $it1 = @($ev.health.rogue.items | Where-Object { [int]$_.pid -eq 5001 })[0]; $it2 = @($ev.health.rogue.items | Where-Object { [int]$_.pid -eq 5002 })[0]
            Assert $asserts 'kosucu: sinif test-uygulama, eslesen d5-portal-, oge yalniz yaprak ad' ($it1 -and $it1.class -ceq 'test-uygulama' -and $it1.token -ceq 'd5-portal-' -and $it1.item -ceq 'd5-portal-reset-live-run.js') ('class=' + $it1.class + ' item=' + $it1.item)
            Assert $asserts 'goruntuleyici: sinif izleme AMA SAYILDI' ($it2 -and $it2.class -ceq 'izleme' -and $it2.item -ceq 'r27-izleme.log') ('class=' + $it2.class + ' item=' + $it2.item)
            $topKeys = (@($ev.health.rogue.PSObject.Properties.Name) -join ','); $itemKeys = (@($ev.health.rogue.items | ForEach-Object { (@($_.PSObject.Properties.Name) -join ',') } | Sort-Object -Unique) -join ' | ')
            Assert $asserts 'kanit alan kumesi TAM ESIT (ust duzey)' ($topKeys -ceq 'count,viewers,testApp,scanned,unreadable,unreadableShells,unreadableShellNames,selfSeen,excluded,items,simulated,elevated') $topKeys
            Assert $asserts 'kanit alan kumesi TAM ESIT (oge: pid,name,class,token,item)' ($itemKeys -ceq 'pid,name,class,token,item') $itemKeys
            Assert $asserts 'kanitta sir isareti ve komut satiri parcasi YOK' (($evText -notmatch 'S3CR3T') -and ($evText -notmatch 'kullanici:') -and ($evText -notmatch 'postgresql') -and ($evText -notmatch '--token')) ''
            Assert $asserts 'rollback yok (dosyalara dokunulmadi)' ($null -eq $ev.rollback) ''
          }
          Assert $asserts 'stdout: sir isareti YOK; siniflar listelendi' (($r.out -notmatch 'S3CR3T') -and ($r.out -notmatch 'postgresql') -and ($r.out -match 'test-uygulama\s+pid=5001') -and ($r.out -match 'izleme\s+pid=5002')) ''
          $st = Get-Content -Raw -LiteralPath (Join-Path $tr 'sim\state.json') | ConvertFrom-Json
          Assert $asserts 'simulator: stop/start cagrisi yok, servisler ayakta' ([int]$st.stopCalls -eq 0 -and [int]$st.startCalls -eq 0 -and [bool]$st.apiRunning -and [bool]$st.webRunning) ('stop=' + $st.stopCalls + ' start=' + $st.startCalls)
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-rogue-viewer-only' {
          # (1) Yalniz DOGRULANMIS goruntuleyici calisiyor -> yine DUR (izleme muaf DEGIL). Kapinin KENDI hata metni ve ADAY DOGRULAMA'ya
          #     gecilmedigi olculur (aday dizini olmadigi icin sonraki asama da 20 verirdi: cikis kodu tek basina kanit DEGILDIR).
          $tr = Join-Path $GATE_ROOT 'rogue-viewer-only'; New-Item -ItemType Directory -Force -Path (Join-Path $tr 'live\api') | Out-Null
          [IO.File]::WriteAllBytes((Join-Path $tr 'live\api\.env'), [Text.Encoding]::ASCII.GetBytes("R27_TESTROOT_FAKE_ENV=1`n"))
          $rp = @(
            [ordered]@{ ProcessId = 5002; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'tail.exe'; CommandLine = 'tail -f D:\x\r27-izleme.log'; ExecutablePath = (Join-Path $env:ProgramFiles 'Git\usr\bin\tail.exe') },
            [ordered]@{ ProcessId = 5003; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'node.exe'; CommandLine = 'node D:\app\server.js'; ExecutablePath = 'C:\n\node.exe' })
          Write-SimState (Join-Path $tr 'sim\state.json') $rp
          $r = Run-Script $RELEASE @('-TestRoot', (Q $tr)) (Join-Path $scDir 'stdout.txt')
          Assert $asserts 'cikis kodu 20 (izleme de DUR verir)' ($r.rc -eq 20) ('rc=' + $r.rc)
          Assert $asserts 'akis kapida DURDU: ADAY DOGRULAMA asamasina GECILMEDI' ($r.out -notmatch 'ADAY DOGRULAMA') ''
          Assert $asserts 'stdout: izleme sinifi satiri listelendi' ($r.out -match 'izleme\s+pid=5002 tail\.exe eslesen=r27- oge=r27-izleme\.log') ''
          $evPath = Find-EvidencePath $r.out
          Assert $asserts 'kanit JSON yazildi' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
          if ($evPath) {
            Assert $asserts 'kanit TestRoot\evidence altinda ve sha esit' ($evPath.path.StartsWith((Join-Path $tr 'evidence'), [StringComparison]::OrdinalIgnoreCase) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.path
            $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
            $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
            Assert $asserts 'verdict KAPIDA-DURDU, failedAt 0-kapilar' ($ev.verdict -ceq 'KAPIDA-DURDU' -and [string]$ev.failedAt -ceq '0-kapilar') ('verdict=' + $ev.verdict)
            Assert $asserts 'error: sahte-surec kapisinin KENDI metni (izleme dahil 1 eslesme)' ([string]$ev.error -match 'test/prova sureci var \(izleme dahil 1 eslesme\)') ([string]$ev.error)
            Assert $asserts 'health.rogue: eslesen=1 izleme=1 test-uygulama=0' ([int]$ev.health.rogue.count -eq 1 -and [int]$ev.health.rogue.viewers -eq 1 -and [int]$ev.health.rogue.testApp -eq 0) ('count=' + $ev.health.rogue.count)
            Assert $asserts 'rollback yok (dosyalara dokunulmadi)' ($null -eq $ev.rollback) ''
          }
          $st = Get-Content -Raw -LiteralPath (Join-Path $tr 'sim\state.json') | ConvertFrom-Json
          Assert $asserts 'simulator: stop/start cagrisi yok' ([int]$st.stopCalls -eq 0 -and [int]$st.startCalls -eq 0) ''
          # (2) KARSI KONTROL: desene eslesen surec YOK -> kapi GECER ve akis ADAY DOGRULAMA'ya ULASIR (aday dizini olmadigindan orada durur).
          $tr2 = Join-Path $GATE_ROOT 'rogue-none'; New-Item -ItemType Directory -Force -Path (Join-Path $tr2 'live\api') | Out-Null
          [IO.File]::WriteAllBytes((Join-Path $tr2 'live\api\.env'), [Text.Encoding]::ASCII.GetBytes("R27_TESTROOT_FAKE_ENV=1`n"))
          $rp2 = @([ordered]@{ ProcessId = 5003; ParentProcessId = 1; CreationDate = '2026-01-01T00:00:00Z'; Name = 'node.exe'; CommandLine = 'node D:\app\server.js'; ExecutablePath = 'C:\n\node.exe' })
          Write-SimState (Join-Path $tr2 'sim\state.json') $rp2
          $r2 = Run-Script $RELEASE @('-TestRoot', (Q $tr2)) (Join-Path $scDir 'stdout-karsi-kontrol.txt')
          Assert $asserts 'karsi kontrol: eslesme yok -> kapi gecti, akis ADAY DOGRULAMA asamasina ulasti' (($r2.out -match 'ADAY DOGRULAMA') -and ($r2.out -match 'eslesen=0 \[test-uygulama=0 izleme=0\]') -and ($r2.out -notmatch 'test/prova sureci var')) ('rc=' + $r2.rc)
          Assert $asserts 'karsi kontrol: aday olmadigi icin yayin YAPILMADI (cikis 0 degil)' ($r2.rc -ne 0) ('rc=' + $r2.rc)
          $st2 = Get-Content -Raw -LiteralPath (Join-Path $tr2 'sim\state.json') | ConvertFrom-Json
          Assert $asserts 'karsi kontrol: stop/start cagrisi yok' ([int]$st2.stopCalls -eq 0 -and [int]$st2.startCalls -eq 0) ''
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-rogue-classifier' {
          # Betigin AKISI calismaz: yalniz atamalar + saf fonksiyonlar AST ile yuklenir. Canli surec listesine BAKILMAZ (sentetik nesneler).
          $tok = $null; $perr = $null
          $ast = [System.Management.Automation.Language.Parser]::ParseFile($RELEASE, [ref]$tok, [ref]$perr)
          $wantF = @('ConvertTo-RogueFolded', 'Get-RogueMatchInfo', 'Test-RogueMatch', 'Get-RogueClass', 'Get-RogueItemName', 'Get-RogueReport', 'Get-RogueGateError', 'Test-RogueClassifier')
          $wantV = @('$ROGUE_TOKENS', '$ROGUE_RX', '$ROGUE_RXO', '$ROGUE_VIEWERS', '$ROGUE_VIEWER_DIRS', '$ROGUE_SHELLS', '$ROGUE_ITEM_EXT', '$ROGUE_ITEM_FLAGS')
          $fdefs = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and ($wantF -contains $n.Name) }, $false))
          $asg = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and ($wantV -contains $n.Left.Extent.Text) }, $false))
          Assert $asserts 'betikte 8 fonksiyon + 8 atama bulundu' ($fdefs.Count -eq 8 -and $asg.Count -eq 8) ('fonksiyon=' + $fdefs.Count + ' atama=' + $asg.Count)
          $fnText = @{}
          foreach ($a in $asg) { . ([scriptblock]::Create($a.Extent.Text)) }
          foreach ($f in $fdefs) { $fnText[$f.Name] = $f.Extent.Text; . ([scriptblock]::Create($f.Extent.Text)) }
          # ---- SABITLEME: desen parcalari, izleme listesi ve guvenilir dizinler TAM ESIT (sessiz ekleme/cikarma yakalanir)
          $EXP_TOKENS = @('i1[2-6]-live', 'i12-cron', 'i12-window', 'i15-kabul', 'smtp-sink', 'i3-sink', 'i3-spy', 'edge-proxy', 'r26-dar-kabul', 'r26-live-portal',
            'd4-portal-', 'd5-portal-', 'd6-portal-', 'd7-portal-', 'd8-staff-', 'd[4-8]-selftest', 'd[4-8]-fake-', 'd[4-8]-qr-', 'd[4-8]-owner-', 'extacc-', 'h5-url-', 'r27-',
            'c-run\.js', 'c-setup\.js', 'c-99-close', 'c-start-api', 'P1-delivery', 'Preflight\.ps1')
          Assert $asserts 'desen parcalari beklenen 28 parcaya TAM ESIT' ((($ROGUE_TOKENS -join '|') -ceq ($EXP_TOKENS -join '|')) -and ($ROGUE_RX -ceq ($EXP_TOKENS -join '|'))) ('adet=' + @($ROGUE_TOKENS).Count)
          Assert $asserts 'izleme listesi TAM ESIT (tail,cat,head,grep,findstr,more.com; less/rg/notepad YOK)' (($ROGUE_VIEWERS -join ',') -ceq 'tail.exe,cat.exe,head.exe,grep.exe,findstr.exe,more.com') ($ROGUE_VIEWERS -join ',')
          Assert $asserts 'guvenilir dizinler TAM ESIT (Git usr\bin, System32)' ((@($ROGUE_VIEWER_DIRS).Count -eq 2) -and ([string]$ROGUE_VIEWER_DIRS[0] -ieq (Join-Path $env:ProgramFiles 'Git\usr\bin')) -and ([string]$ROGUE_VIEWER_DIRS[1] -ieq (Join-Path $env:SystemRoot 'System32'))) ''
          Assert $asserts 'oge adi izinli uzanti + bayrak listeleri TAM ESIT' ((($ROGUE_ITEM_EXT -join ',') -ceq '.js,.cjs,.mjs,.ps1,.psm1,.cmd,.bat,.py,.sh,.log,.txt,.json') -and (($ROGUE_ITEM_FLAGS -join ',') -ceq '-file,-f')) (($ROGUE_ITEM_EXT -join ',') + ' | ' + ($ROGUE_ITEM_FLAGS -join ','))
          Assert $asserts 'yorumlayici/kabuk listesi TAM ESIT (okunamayan komut satiri teshisi)' (($ROGUE_SHELLS -join ',') -ceq 'node.exe,powershell.exe,pwsh.exe,cmd.exe,bash.exe,sh.exe,python.exe,python3.exe,py.exe,wscript.exe,cscript.exe') ($ROGUE_SHELLS -join ',')
          Assert $asserts 'eslesme secenekleri IgnoreCase + CultureInvariant' (([int]$ROGUE_RXO -band [int][Text.RegularExpressions.RegexOptions]::IgnoreCase) -ne 0 -and ([int]$ROGUE_RXO -band [int][Text.RegularExpressions.RegexOptions]::CultureInvariant) -ne 0) ([string]$ROGUE_RXO)
          # ---- her parca: kucuk ve BUYUK harf (tr-TR 'I' tuzagi dahil) -> eslesir ve 'test-uygulama'
          $hit = 0; $miss = New-Object System.Collections.Generic.List[string]
          foreach ($t in $EXP_TOKENS) {
            $sample = ($t -replace '\[2-6\]', '4' -replace '\[4-8\]', '6' -replace '\\\.', '.')
            foreach ($v in @($sample.ToLowerInvariant(), $sample.ToUpperInvariant())) {
              $c = 'node D:\g\' + $v + 'x.js'
              if ((Test-RogueMatch $c) -and ((Get-RogueClass 'node.exe' $c 'C:\n\node.exe') -ceq 'test-uygulama')) { $hit++ } else { $miss.Add($v) }
            }
          }
          Assert $asserts 'her desen parcasi kucuk + BUYUK harfle eslesir (28 x 2 = 56)' ($hit -eq 56 -and $miss.Count -eq 0) ('eslesen=' + $hit + ' kacan=' + ($miss -join ','))
          Assert $asserts 'BUYUK I iceren komut satirlari kulturden bagimsiz eslesir (tr-TR tuzagi)' ((Test-RogueMatch 'NODE D:\G\SMTP-SINK.JS') -and (Test-RogueMatch 'NODE D:\G\I12-CRON.JS') -and (Test-RogueMatch 'powershell -File PREFLIGHT.PS1')) ('CurrentCulture=' + [Globalization.CultureInfo]::CurrentCulture.Name)
          # ---- katlama: taban surumun (-match, kultur tr-TR) saydigi U+0130 / U+212A girdileri yeni eslesmede de SAYILIR (gevseme yok); U+0131 ek sikilastirma
          $uDotI = [string][char]0x0130; $uNoDotI = [string][char]0x0131; $uKelvin = [string][char]0x212A   # PowerShell degisken adlari harf DUYARSIZ: adlar ayri tutulur
          $uIn = @(('node D:\g\SMTP-S' + $uDotI + 'NK.JS'), ('node D:\g\' + $uDotI + '12-CRON.JS'), ('powershell -File PREFL' + $uDotI + 'GHT.PS1'), ('node D:\g\smtp-s' + $uNoDotI + 'nk.js'), ('node D:\g\smtp-sin' + $uKelvin + '.js'), ('node D:\g\' + $uNoDotI + '15-' + $uKelvin + 'abul.js'))
          $uMiss = @($uIn | Where-Object { -not ((Test-RogueMatch $_) -and ((Get-RogueClass 'node.exe' $_ 'C:\n\node.exe') -ceq 'test-uygulama')) })
          Assert $asserts 'U+0130 / U+0131 / U+212A iceren 6 komut satiri eslesir ve test-uygulama sayilir' ($uIn.Count -eq 6 -and $uMiss.Count -eq 0 -and $uDotI -cne $uNoDotI) ('kacan=' + $uMiss.Count)
          Assert $asserts 'katlama AYNI UZUNLUKTA (eslesme konumu kaymaz)' ((ConvertTo-RogueFolded ('a' + $uDotI + $uNoDotI + $uKelvin + 'b')) -ceq 'aIiKb') (ConvertTo-RogueFolded ('a' + $uDotI + $uNoDotI + $uKelvin + 'b'))
          # ---- siniflandirma: dogrulanmis goruntuleyici / sahte ad / sahte yol
          $gitBin = Join-Path $env:ProgramFiles 'Git\usr\bin'; $sys32 = Join-Path $env:SystemRoot 'System32'
          Assert $asserts 'tail.exe + Git usr\bin -> izleme' ((Get-RogueClass 'tail.exe' 'tail -f D:\x\R27-RELEASE-1.log' (Join-Path $gitBin 'tail.exe')) -ceq 'izleme') ''
          Assert $asserts 'TAIL.EXE + BUYUK harfli yol -> izleme' ((Get-RogueClass 'TAIL.EXE' 'tail -f D:\x\r27-x.log' ((Join-Path $gitBin 'TAIL.EXE').ToUpperInvariant())) -ceq 'izleme') ''
          Assert $asserts 'findstr.exe + System32 -> izleme' ((Get-RogueClass 'findstr.exe' 'findstr /c:x D:\x\r27-x.log' (Join-Path $sys32 'findstr.exe')) -ceq 'izleme') ''
          Assert $asserts 'ayni adli ikili BASKA dizinde -> test-uygulama' ((Get-RogueClass 'tail.exe' 'D:\tmp\tail.exe D:\g\d5-portal-reset-live-run.js' 'D:\tmp\tail.exe') -ceq 'test-uygulama') ''
          Assert $asserts 'goruntuleyici adi ama calistirilabilir yol BOS/okunamaz -> test-uygulama' ((Get-RogueClass 'cat.exe' 'cat D:\x\r27-x.log' '') -ceq 'test-uygulama') ''
          Assert $asserts 'yol gecisi (..\) ile guvenilir dizin taklidi -> test-uygulama' ((Get-RogueClass 'tail.exe' 'tail r27-x.log' (Join-Path $gitBin '..\..\evil\tail.exe')) -ceq 'test-uygulama') ''
          Assert $asserts 'guvenilir dizinin ALT dizini -> test-uygulama' ((Get-RogueClass 'findstr.exe' 'findstr x r27-x.log' (Join-Path $sys32 'alt\findstr.exe')) -ceq 'test-uygulama') ''
          $badNames = @('eviltail.exe', 'tail.exe.bak.exe', 'tail', 'tailx.exe', 'TAIL~1.EXE', 'less.exe', 'rg.exe', 'notepad.exe', 'node.exe', 'powershell.exe', 'pwsh.exe', 'cmd.exe', 'bash.exe', 'python.exe', 'perl.exe', 'wsl.exe', 'mshta.exe', 'curl.exe', 'psql.exe')
          $bad = @($badNames | Where-Object { (Get-RogueClass $_ 'x D:\g\r27-x.js' (Join-Path $gitBin $_)) -cne 'test-uygulama' })
          Assert $asserts 'listede OLMAYAN 19 goruntu adi (guvenilir dizinde olsa bile) -> test-uygulama' ($bad.Count -eq 0) ('kacan=' + ($bad -join ','))
          Assert $asserts 'bash -c "tail -f ..." sarmalayicisi -> test-uygulama' ((Get-RogueClass 'bash.exe' 'bash -c "tail -f /d/x/r27-x.log"' (Join-Path $gitBin 'bash.exe')) -ceq 'test-uygulama') ''
          Assert $asserts 'powershell Get-Content -Wait -> test-uygulama' ((Get-RogueClass 'powershell.exe' 'powershell -Command Get-Content -Wait D:\x\r27-x.log' 'C:\w\powershell.exe') -ceq 'test-uygulama') ''
          Assert $asserts 'desene eslesmeyen surec -> none' ((Get-RogueClass 'node.exe' 'node D:\app\main.js' 'C:\n\node.exe') -ceq 'none') ''
          Assert $asserts 'Test-RogueClassifier (sentetik listeler: sinif + kardes/cocuk + dislama + oge adi + kapi + kanarya) TRUE' ([bool](Test-RogueClassifier)) ''
          # ---- rapor alan kumesi (dislanan dahil) TAM ESIT
          $pkgP = 'D:\repo\project\docs\governance\client-release-r27-r01\scripts\r27-release.ps1'
          $mkP = { param($i, $pp, $sec, $n, $c) New-Object psobject -Property @{ ProcessId = $i; ParentProcessId = $pp; CreationDate = ([datetime]'2026-01-01T00:00:00Z').AddSeconds($sec); Name = $n; CommandLine = $c; ExecutablePath = 'C:\n\x.exe' } }
          $repK = Get-RogueReport @((& $mkP 99 1 0 'powershell.exe' 'powershell.exe'), (& $mkP 100 99 10 'powershell.exe' ('powershell.exe -File ' + $pkgP)), (& $mkP 102 1 5 'node.exe' 'node D:\g\d5-portal-x.js')) 100 'r27-release.ps1' $pkgP
          Assert $asserts 'rapor alan kumesi TAM ESIT (ust duzey / oge / dislanan)' (((@($repK.Keys) -join ',') -ceq 'count,viewers,testApp,scanned,unreadable,unreadableShells,unreadableShellNames,selfSeen,excluded,items') -and ((@($repK.items[0].Keys) -join ',') -ceq 'pid,name,class,token,item') -and ((@($repK.excluded[0].Keys) -join ',') -ceq 'pid,name,why')) ((@($repK.Keys) -join ','))
          # ---- oge adi: tam komut satiri YAZILMAZ; sir baska argumanda / dizinde / bayrak degerinde / URL'de ise rapora GIRMEZ
          $leakIn = @('node D:\g\d5-portal-x.js postgresql://kullanici:S3CR3T@127.0.0.1:1/db', 'node x.js --token extacc-S3CR3T', 'node x.js --password=extacc-S3CR3T', 'node x.js --password extacc-S3CR3T',
            'curl https://S3CR3T@host/extacc-x.js', 'node d5-portal-x.js?token=S3CR3T', 'cmd /c set PGPASSWORD=S3CR3T&& node d5-portal-x.js', 'node extacc-run.js --go-ref S3CR3T', 'powershell -File "C:\Users\biri\S3CR3T\r27-release.ps1"',
            'redis://:S3CR3T@h/extacc-db', 'node r27-x.js S3CR3T', 'node D:\S3CR3T\d6-portal-x.js', 'node x.js --token extacc-S3CR3T.json', 'node x.js -p extacc-S3CR3T.txt', 'node x.js /key extacc-S3CR3T.log',
            'curl https://host/extacc-S3CR3T.json', 'curl http://h/r27-S3CR3T.txt', 'node a://S3CR3T/r27-x.js', 'node --a:S3CR3T\r27-x.cmd', 'node D:\a=S3CR3T\r27-x.js', 'node r27-x.js;S3CR3T.js', 'node (r27-S3CR3T.js)',
            'node r27-S3CR3T:y.js', 'node extacc-S3CR3T.key', 'node r27-S3CR3T~y.js', 'node D:\r27-x\S3CR3T.txt', 'node extacc-S3CR3T', 'node "D:\S3CR3T dizin\r27-x.js"', 'node x.js --header "Authorization: S3CR3T" extacc-x.js',
            'node extacc-x.js,S3CR3T.js', 'node r27-x.js@S3CR3T')
          $leak = New-Object System.Collections.Generic.List[string]
          foreach ($c in $leakIn) {
            $rep1 = Get-RogueReport @((New-Object psobject -Property @{ ProcessId = 7; ParentProcessId = 1; CreationDate = [datetime]'2026-01-01'; Name = 'node.exe'; CommandLine = $c; ExecutablePath = 'C:\n\node.exe' })) -1 'r27-release.ps1' ''
            $js = ($rep1 | ConvertTo-Json -Depth 5)
            if ($js -match 'S3CR3T' -or $js -match 'biri' -or (@($rep1.items | Where-Object { $_.Contains('cmd') }).Count -gt 0) -or $rep1.count -ne 1) { $leak.Add($c.Substring(0, [Math]::Min(30, $c.Length))) }
          }
          Assert $asserts 'rapor 31 komut satiri biciminde sir isaretini YAZMAZ (tam komut satiri yok) ve her birini SAYAR' ($leakIn.Count -eq 31 -and $leak.Count -eq 0) ('sizan=' + ($leak -join ' | '))
          Assert $asserts 'oge adi: tirnakli bosluklu yol -> yalniz yaprak ad' ((Get-RogueItemName 'node "C:\Program Files\x y\d5-portal-reset-live-run.js"') -ceq 'd5-portal-reset-live-run.js') ''
          Assert $asserts 'oge adi: gercek paket yolu (dizin de desene eslesir) -> yaprak ad' ((Get-RogueItemName ('powershell -File ' + $pkgP + ' -SelfTest')) -ceq 'r27-release.ps1') ''
          Assert $asserts 'BILINEN SINIR (sabitlendi): desenle BASLAYAN dosya ADI rapora yazilir - dosya adina gomulu kisa deger ayiklanmaz' ((Get-RogueItemName 'node extacc-S3CR3T.js') -ceq 'extacc-S3CR3T.js') ''
          # ---- oge adi korumalari: HER koruma icin yalniz o korumanin yakaladigi ornek + korumayi kaldiran mutasyon (siniflandirici FALSE olmali)
          $long61 = 'r27-' + ('ab-' * 18) + 'x.js'    # 4 + 54 + 4 = 62 karakter
          $prot = @(
            @{ n = 'ayirici/ozel karakter';  s = 'node D:\a=b\r27-x.js';                  old = 'if ($arg.IndexOfAny([char[]]@(''?'', ''#'', ''&'', ''='', '';'', '','', ''@'', ''('', '')'', ''+'', ''%'')) -ge 0) { continue }' },
            @{ n = 'sema ayirici (://)';     s = 'node a://x/r27-x.js';                   old = 'if ($arg.Contains(''://'')) { continue }' },
            @{ n = 'iki nokta konumu';       s = 'node --a:b\r27-S3.cmd';                 old = '$c1 = $arg.IndexOf('':''); if ($c1 -ge 0 -and ($c1 -ne 1 -or $arg.LastIndexOf('':'') -ne 1)) { continue }' },
            @{ n = 'yaprak basi';            s = 'node D:\r27-x\S3CR3T.txt';              old = 'if ($m.Index -ne ($s + $i + 1)) { continue }' },
            @{ n = 'uzunluk (<=60)';         s = ('node ' + $long61);                     old = 'if ($leaf.Length -lt 1 -or $leaf.Length -gt 60) { continue }' },
            @{ n = 'karakter kumesi';        s = 'node r27-S3CR3T~y.js';                  old = 'if (-not [regex]::IsMatch($leaf, ''^[A-Za-z0-9._-]+$'', $rxi)) { continue }' },
            @{ n = 'belirtec gorunumu (20+)'; s = 'node extacc-A1b2C3d4E5f6G7h8I9j0K.js'; old = 'if ([regex]::IsMatch($leaf, ''[A-Za-z0-9]{20,}'', $rxi)) { continue }' },
            @{ n = 'izinli uzanti';          s = 'node extacc-S3CR3T.key';                old = 'if (-not $extOk) { continue }' },
            @{ n = 'onceki arguman bayrak';  s = 'node x.js --token extacc-S3CR3T.json';  old = 'if (-not $flagOk) { continue }' })
          $protBad = New-Object System.Collections.Generic.List[string]
          foreach ($pr in $prot) {
            $base0 = (Get-RogueItemName $pr.s)
            $t = $fnText['Get-RogueItemName']; $ix = $t.IndexOf($pr.old)
            if ($ix -lt 0 -or $t.IndexOf($pr.old, $ix + 1) -ge 0) { $protBad.Add($pr.n + ': mutasyon metni bulunamadi/tek degil'); continue }
            . ([scriptblock]::Create($t.Substring(0, $ix) + $t.Substring($ix + $pr.old.Length)))
            $mutItem = (Get-RogueItemName $pr.s); $mutCls = [bool](Test-RogueClassifier)
            . ([scriptblock]::Create($fnText['Get-RogueItemName']))
            if ($base0 -cne '' -or $mutItem -ceq '' -or $mutCls) { $protBad.Add($pr.n + ': taban=[' + $base0 + '] mutasyon=[' + $mutItem + '] siniflandirici=' + $mutCls) }
          }
          Assert $asserts 'oge adi: 9 korumanin HER BIRI tek basina olculur (ornek BOS; koruma kaldirilinca ad yazilir ve siniflandirici FALSE)' ($protBad.Count -eq 0) ($protBad -join ' ; ')
          # ---- fonksiyon mutasyonlari: kapi karari, kanarya, dislama kurallari, katlama
          $fmut = @(
            @{ n = 'kapi: izleme muaf (count yerine testApp)'; f = 'Get-RogueGateError'; old = 'if ([int]$rr.count -ne 0)';            new = 'if ([int]$rr.testApp -ne 0)' },
            @{ n = 'kapi: taranan=0 korumasi kaldirildi';     f = 'Get-RogueGateError'; old = 'if ([int]$rr.scanned -eq 0)';           new = 'if ($false)' },
            @{ n = 'kapi: kanarya (selfSeen) kaldirildi';     f = 'Get-RogueGateError'; old = 'if (-not [bool]$rr.selfSeen)';         new = 'if ($false)' },
            @{ n = 'kapi: canli korumalar TEST gibi atlandi'; f = 'Get-RogueGateError'; old = 'if (-not [bool]$rr.simulated)';        new = 'if ($false)' },
            @{ n = 'kapi: rapor yok -> gecer';                f = 'Get-RogueGateError'; old = 'if ($null -eq $rr) { return ''KAPI: sahte-surec raporu yok - DUR'' }'; new = 'if ($null -eq $rr) { return '''' }' },
            @{ n = 'dislama: cocuk surecler muaf';            f = 'Get-RogueReport';    old = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid) { continue }'; new = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid -or [int]$p.ParentProcessId -eq $selfPid) { continue }' },
            @{ n = 'dislama: kardes surecler muaf';           f = 'Get-RogueReport';    old = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid) { continue }'; new = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid -or ($me -and [int]$p.ParentProcessId -eq [int]$me.ParentProcessId)) { continue }' },
            @{ n = 'ust surec: baska betik tasisa da dislanir'; f = 'Get-RogueReport';  old = 'if ($older -and -not (Test-RogueMatch $rest))'; new = 'if ($older)' },
            @{ n = 'ust surec: yas kontrolu yok';             f = 'Get-RogueReport';    old = 'if ($older -and -not (Test-RogueMatch $rest))'; new = 'if (-not (Test-RogueMatch $rest))' },
            @{ n = 'ust surec: tam yol cikarilmiyor';         f = 'Get-RogueReport';    old = 'if ($selfPath) { $rest = [regex]::Replace($rest, ($bL + [regex]::Escape((ConvertTo-RogueFolded $selfPath)) + $bR), '''', $ROGUE_RXO) }'; new = '' },
            @{ n = 'ust surec: sinir yok (baska adin parcasi da cikarilir)'; f = 'Get-RogueReport'; old = '$bL = ''(?<=^|[\s"''''=])''; $bR = ''(?=$|[\s"''''])'''; new = '$bL = ''''; $bR = ''''' },
            @{ n = 'ust surec: yinelenen pid kaydinda da dislanir'; f = 'Get-RogueReport'; old = 'if ($ppAll.Count -eq 1) {'; new = 'if ($ppAll.Count -ge 1) {' },
            @{ n = 'ust surec: tarih okunamazsa ESKI sayilir'; f = 'Get-RogueReport';   old = 'if ($null -ne $p.CreationDate -and $null -ne $me.CreationDate -and [string]$p.CreationDate -ne '''' -and [string]$me.CreationDate -ne '''') {'; new = '$older = $true; if ($false) {' },
            @{ n = 'kendi pid yinelenirse de dislanir';       f = 'Get-RogueReport';    old = '$me = $(if ($meAll.Count -eq 1) { $meAll[0] } else { $null })'; new = '$me = $(if ($meAll.Count -ge 1) { $meAll[0] } else { $null })' },
            @{ n = 'liste ilk 64 surecle kirpilir';           f = 'Get-RogueReport';    old = '$list = @($procs | Where-Object { $null -ne $_ })'; new = '$list = @($procs | Where-Object { $null -ne $_ } | Select-Object -First 64)' },
            @{ n = 'pwsh.exe surecleri muaf';                 f = 'Get-RogueReport';    old = '$cls = Get-RogueClass ([string]$p.Name) $cl ([string]$p.ExecutablePath)'; new = '$cls = $(if ([string]$p.Name -ieq ''pwsh.exe'') { ''none'' } else { Get-RogueClass ([string]$p.Name) $cl ([string]$p.ExecutablePath) })' },
            @{ n = 'kanarya zayif (ad aranmaz)';              f = 'Get-RogueReport';    old = '$selfSeen = ((ConvertTo-RogueFolded ([string]$me.CommandLine)).IndexOf($selfLeaf, [StringComparison]::OrdinalIgnoreCase) -ge 0)'; new = '$selfSeen = $true' },
            @{ n = 'uzun komut satiri (>260) eslesmez';       f = 'Test-RogueMatch';    old = 'if (-not $cmdLine) { return $false }'; new = 'if (-not $cmdLine -or $cmdLine.Length -gt 260) { return $false }' },
            @{ n = 'okunamayan komut satiri sayilmiyor';      f = 'Get-RogueReport';    old = '$unreadable++'; new = '$null = 0' },
            @{ n = 'kapi: liste tabani (taranan<20) kaldirildi'; f = 'Get-RogueGateError'; old = 'if ([int]$rr.scanned -lt 20)'; new = 'if ($false)' },
            @{ n = 'ust surec: esit zamanli ust sayilir (-lt)'; f = 'Get-RogueReport';  old = '[datetime]$p.CreationDate -le [datetime]$me.CreationDate'; new = '[datetime]$p.CreationDate -lt [datetime]$me.CreationDate' },
            @{ n = 'ust surec: tarih bicimi bozuksa ESKI sayilir'; f = 'Get-RogueReport'; old = 'catch { $older = $false }'; new = 'catch { $older = $true }' },
            @{ n = 'baska oturumdaki surecler muaf';         f = 'Get-RogueReport';    old = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid) { continue }'; new = 'if (($null -ne $me -and [int]$p.ProcessId -eq $selfPid) -or [int]$p.ProcessId -eq $parentPid -or ($me -and $null -ne $p.SessionId -and $null -ne $me.SessionId -and [int]$p.SessionId -ne [int]$me.SessionId)) { continue }' },
            @{ n = 'dislanan kaydinda ad yerine TAM KOMUT SATIRI'; f = 'Get-RogueReport'; old = 'name = [string]$p.Name; why = ''ust-surec'''; new = 'name = [string]$p.CommandLine; why = ''ust-surec''' },
            @{ n = 'canlida python.exe muaf';                f = 'Get-RogueReport';    old = '$cls = Get-RogueClass ([string]$p.Name) $cl ([string]$p.ExecutablePath)'; new = '$cls = $(if ([string]$p.Name -ieq ''python.exe'') { ''none'' } else { Get-RogueClass ([string]$p.Name) $cl ([string]$p.ExecutablePath) })' },
            @{ n = 'katlama: U+0130 katlanmiyor';             f = 'ConvertTo-RogueFolded'; old = '.Replace([string][char]0x0130, ''I'')'; new = '' },
            @{ n = 'sinif: dizin dogrulamasi yok (ad yeter)'; f = 'Get-RogueClass';     old = 'if ($isViewerName -and $exePath) {'; new = 'if ($isViewerName) { return ''izleme'' }; if ($false) {' })
          $fmBad = New-Object System.Collections.Generic.List[string]
          foreach ($mu in $fmut) {
            $t = $fnText[$mu.f]; $ix = $t.IndexOf($mu.old)
            if ($ix -lt 0 -or $t.IndexOf($mu.old, $ix + 1) -ge 0) { $fmBad.Add($mu.n + ': mutasyon metni bulunamadi/tek degil'); continue }
            . ([scriptblock]::Create($t.Substring(0, $ix) + $mu.new + $t.Substring($ix + $mu.old.Length)))
            $mres = $true; try { $mres = [bool](Test-RogueClassifier) } catch { $mres = $false }
            . ([scriptblock]::Create($fnText[$mu.f]))
            if ($mres) { $fmBad.Add($mu.n + ': siniflandirici TRUE kaldi (mutasyon YAKALANMADI)') }
          }
          Assert $asserts ($fmut.Count.ToString() + ' fonksiyon mutasyonunun HEPSI yakalanir (siniflandirici FALSE)') ($fmBad.Count -eq 0 -and $fmut.Count -eq 27) ($fmBad -join ' ; ')
          # ---- duyarlilik (degisken mutasyonu): test gercekten olcuyor mu
          $sv = $ROGUE_VIEWERS; $ROGUE_VIEWERS = @(); $m1 = [bool](Test-RogueClassifier); $ROGUE_VIEWERS = $sv
          Assert $asserts 'mutasyon: izleme listesi bos -> siniflandirici testi FALSE' (-not $m1) ('sonuc=' + $m1)
          $sd = $ROGUE_VIEWER_DIRS; $ROGUE_VIEWER_DIRS = @($ROGUE_VIEWER_DIRS + 'D:\tmp'); $m2 = [bool](Test-RogueClassifier); $ROGUE_VIEWER_DIRS = $sd
          Assert $asserts 'mutasyon: guvenilir dizine D:\tmp eklendi -> FALSE' (-not $m2) ('sonuc=' + $m2)
          $so = $ROGUE_RXO; $ROGUE_RXO = [Text.RegularExpressions.RegexOptions]::None; $m3 = [bool](Test-RogueClassifier); $ROGUE_RXO = $so
          Assert $asserts 'mutasyon: eslesme harf DUYARLI -> FALSE' (-not $m3) ('sonuc=' + $m3)
          $sr = $ROGUE_RX; $ROGUE_RX = (@($ROGUE_TOKENS | Where-Object { $_ -cne 'smtp-sink' }) -join '|'); $m4 = [bool](Test-RogueClassifier); $ROGUE_RX = $sr
          Assert $asserts 'mutasyon: desenden smtp-sink dusuruldu -> FALSE' (-not $m4) ('sonuc=' + $m4)
          $sv = $ROGUE_VIEWERS; $ROGUE_VIEWERS = @($ROGUE_VIEWERS + 'less.exe'); $m5 = [bool](Test-RogueClassifier); $ROGUE_VIEWERS = $sv
          Assert $asserts 'mutasyon: less.exe izleme listesine eklendi -> FALSE' (-not $m5) ('sonuc=' + $m5)
          $sx = $ROGUE_ITEM_FLAGS; $ROGUE_ITEM_FLAGS = @($ROGUE_ITEM_FLAGS + '--token'); $m6 = [bool](Test-RogueClassifier); $ROGUE_ITEM_FLAGS = $sx
          Assert $asserts 'mutasyon: --token izinli bayraklara eklendi -> FALSE' (-not $m6) ('sonuc=' + $m6)
          $se = $ROGUE_ITEM_EXT; $ROGUE_ITEM_EXT = @($ROGUE_ITEM_EXT + '.key'); $m7 = [bool](Test-RogueClassifier); $ROGUE_ITEM_EXT = $se
          Assert $asserts 'mutasyon: .key izinli uzantilara eklendi -> FALSE' (-not $m7) ('sonuc=' + $m7)
          Assert $asserts 'mutasyonlardan sonra siniflandirici yeniden TRUE (durum geri yuklendi)' ([bool](Test-RogueClassifier)) ''
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
        'gate-svc-measure' {
          # SUREC KOSMAZ: yayin (R03-b) + B3 betiklerinin CANLI dal olcum fonksiyonlari AST ile yuklenir; Get-NetTCPConnection / Get-CimInstance /
          # Get-ScheduledTask / Start-Sleep SAHTE gelismis fonksiyonlarla golgelenir (gercek sistem cagrilmaz). Olculen: 'eslesme yok' (ObjectNotFound +
          # CmdletizationQuery_NotFound) BASARILI BOS; TCP yetki hatasi, ObjectNotFound kategorili ama baska kimlikli hata ve CIM hatasi OKUMA HATASI
          # -> OLCULEMEDI / Wait-Stopped false (B3: firlatmaz; stopped=false + OLCULEMEDI). Duyarlilik: eski SilentlyContinue bicimi ayni girdide KAPALI verir.
          $ld = { param($file, [string[]]$names)
            $tk = $null; $pe = $null; $a = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tk, [ref]$pe); $o = [ordered]@{}
            foreach ($n in $names) { $d = @($a.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -ceq $n }); if ($d.Count -ne 1) { throw ('tanim adedi ' + $d.Count + ': ' + $n) }; $o[$n] = $d[0].Extent.Text }
            return $o }
          $relF = & $ld $RELEASE @('Test-EmptyQueryError', 'Get-Pids', 'Get-HostProcCount', 'Get-TaskState', 'Measure-Svc', 'Wait-Stopped')
          $rbF = & $ld $ROLLBACK @('Test-EmptyQueryError', 'Get-Pids', 'Get-HostCount', 'Get-TaskState', 'Get-SvcTask', 'Get-SvcPort', 'Get-SvcMeasure', 'Wait-Stopped')
          $TEST = $false; $API_TASK = 'HukukPlatform-API'; $WEB_TASK = 'HukukPlatform-Web'; $API_PORT = 8080; $WEB_PORT = 3002
          $script:MOCK = @{ tcp = 'empty'; cim = 'empty'; task = 'Ready' }; $script:SEQ = $null
          function Get-NetTCPConnection { [CmdletBinding()] param([string]$State, [int]$LocalPort)
            # SIRALI mock (R03-c): $script:SEQ doluysa her olcumun ilk cagrisi (dinleyici) sonraki durumu alir; cim/gorev ayni olcumde onu kullanir
            if ($null -ne $script:SEQ -and @($script:SEQ).Count -gt 0) { $script:MOCK = @($script:SEQ)[0]; $script:SEQ = @(@($script:SEQ) | Select-Object -Skip 1) }
            $mk = { param($ex, $id, $cat) New-Object System.Management.Automation.ErrorRecord($ex, $id, $cat, $LocalPort) }
            switch ($script:MOCK.tcp) {
              'empty'  { $PSCmdlet.WriteError((& $mk (New-Object System.Exception ('No MSFT_NetTCPConnection objects found with property LocalPort equal to ' + $LocalPort + '.')) 'CmdletizationQuery_NotFound_LocalPort' ([System.Management.Automation.ErrorCategory]::ObjectNotFound))) }
              'denied' { $PSCmdlet.WriteError((& $mk (New-Object System.UnauthorizedAccessException 'Access denied (sahte)') 'HRESULT 0x80041003' ([System.Management.Automation.ErrorCategory]::PermissionDenied))) }
              'nf-other' { $PSCmdlet.WriteError((& $mk (New-Object System.Exception 'provider not found (sahte)') 'ProviderLoadFailure' ([System.Management.Automation.ErrorCategory]::ObjectNotFound))) }
              'one'    { return [pscustomobject]@{ OwningProcess = 4343; LocalPort = $LocalPort } } } }
          function Get-CimInstance { [CmdletBinding()] param([Parameter(Position = 0)][string]$ClassName, [string]$Filter)
            switch ($script:MOCK.cim) {
              'empty'  { return }
              'denied' { $PSCmdlet.WriteError((New-Object System.Management.Automation.ErrorRecord((New-Object System.UnauthorizedAccessException 'Access denied (sahte CIM)'), 'HRESULT 0x80041003,Get-CimInstance', ([System.Management.Automation.ErrorCategory]::PermissionDenied), $ClassName))) }
              'one'    { return [pscustomobject]@{ Name = 'hukuk-task-host.exe'; CommandLine = 'C:\Ops\hukuk\bin\hukuk-task-host.exe web' } }
              'blind'  { return [pscustomobject]@{ Name = 'hukuk-task-host.exe'; CommandLine = $null } } } }
          function Get-ScheduledTask { [CmdletBinding()] param([string]$TaskName) return [pscustomobject]@{ TaskName = $TaskName; State = $script:MOCK.task } }
          function Start-Sleep { param([int]$Seconds) }
          foreach ($k in $relF.Keys) { . ([scriptblock]::Create($relF[$k])) }
          $case = { param($tcp, $cim, $task) $script:MOCK = @{ tcp = $tcp; cim = $cim; task = $task }
            $pids = $(try { [string]@(Get-Pids $WEB_PORT).Count } catch { 'THROW' })
            $hc = $(try { [string](Get-HostProcCount 'web') } catch { 'THROW' })
            $m = Measure-Svc 'web'; $w = [bool](Wait-Stopped $WEB_TASK $WEB_PORT 'web' 0)
            return [ordered]@{ pids = $pids; host = $hc; state = [string]$m.state; err = [string]$m.error; wait = $w } }
          $c1 = & $case 'empty' 'empty' 'Ready'; $c2 = & $case 'denied' 'empty' 'Ready'; $c3 = & $case 'empty' 'denied' 'Ready'
          $c4 = & $case 'nf-other' 'empty' 'Ready'; $c5 = & $case 'one' 'one' 'Running'
          Assert $asserts 'yayin: GERCEK BOS (ObjectNotFound + CmdletizationQuery_NotFound, CIM bos) -> dinleyici 0, host 0, KAPALI, Wait-Stopped true' ($c1.pids -ceq '0' -and $c1.host -ceq '0' -and $c1.state -ceq 'KAPALI' -and $c1.wait) (($c1.Values | ForEach-Object { [string]$_ }) -join ' / ')
          Assert $asserts 'yayin: TCP OKUMA HATASI (yetki) -> Get-Pids firlatir, OLCULEMEDI (hata kayitta), Wait-Stopped false (KAPALI SAYILMAZ)' ($c2.pids -ceq 'THROW' -and $c2.state -ceq 'OLCULEMEDI' -and $c2.err -ne '' -and -not $c2.wait) (($c2.Values | ForEach-Object { [string]$_ }) -join ' / ')
          Assert $asserts 'yayin: CIM OKUMA HATASI -> Get-HostProcCount firlatir, OLCULEMEDI, Wait-Stopped false' ($c3.host -ceq 'THROW' -and $c3.pids -ceq '0' -and $c3.state -ceq 'OLCULEMEDI' -and $c3.err -ne '' -and -not $c3.wait) (($c3.Values | ForEach-Object { [string]$_ }) -join ' / ')
          Assert $asserts 'yayin: ObjectNotFound kategorili AMA baska kimlikli hata BOS SAYILMAZ -> OLCULEMEDI' ($c4.pids -ceq 'THROW' -and $c4.state -ceq 'OLCULEMEDI' -and -not $c4.wait) (($c4.Values | ForEach-Object { [string]$_ }) -join ' / ')
          Assert $asserts 'yayin: calisan servis (tek dinleyici + host + Running) -> CALISIYOR, Wait-Stopped false' ($c5.pids -ceq '1' -and $c5.host -ceq '1' -and $c5.state -ceq 'CALISIYOR' -and -not $c5.wait) (($c5.Values | ForEach-Object { [string]$_ }) -join ' / ')
          # duyarlilik: R03 oncesi bicim (SilentlyContinue) ayni TCP/CIM hatasinda KAPALI + Wait true uretir -> bu test farki OLCER
          . ([scriptblock]::Create('function Get-Pids([int]$port) { return @((Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique) }'))
          . ([scriptblock]::Create('function Get-HostProcCount([string]$hostArg) { return @(Get-CimInstance Win32_Process -Filter "Name=''hukuk-task-host.exe''" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match (''(^|\s)'' + $hostArg + ''(\s|$)'') }).Count }'))
          $o2 = & $case 'denied' 'empty' 'Ready'; $o3 = & $case 'empty' 'denied' 'Ready'
          Assert $asserts 'duyarlilik: eski SilentlyContinue bicimi ayni TCP ve CIM hatasinda KAPALI + Wait-Stopped true verir (testin ayirt ediciligi)' ($o2.state -ceq 'KAPALI' -and $o2.wait -and $o3.state -ceq 'KAPALI' -and $o3.wait) ('tcp=' + $o2.state + '/' + $o2.wait + ' cim=' + $o3.state + '/' + $o3.wait)
          # B3 (r27-rollback.ps1, R03-c) ayni kok neden: okuma hatasi Wait-Stopped'i true yapmaz; FIRLATMAZ, sure dolana kadar yeniden olcer ve
          # stopped=false + state=OLCULEMEDI doner (2-durdur HATA -> toparlama; dosyaya dokunulmaz). Calisan -> CALISIYOR.
          foreach ($k in $rbF.Keys) { . ([scriptblock]::Create($rbF[$k])) }
          $b3 = { param($tcp, $cim, $task) $script:MOCK = @{ tcp = $tcp; cim = $cim; task = $task }; $(try { $w = Wait-Stopped $WEB_TASK $WEB_PORT 'web' 1; [string][bool]$w.stopped + '/' + [string]$w.state + '/' + [string]([int]$w.attempts -ge 1) } catch { 'THROW' }) }
          $b1 = & $b3 'empty' 'empty' 'Ready'; $b2 = & $b3 'denied' 'empty' 'Ready'; $b3c = & $b3 'empty' 'denied' 'Ready'; $b4 = & $b3 'one' 'one' 'Running'; $b5 = & $b3 'nf-other' 'empty' 'Ready'
          $script:MOCK = @{ tcp = 'empty'; cim = 'empty'; task = 'Ready' }; $bp = $(try { [string]@(Get-Pids $WEB_PORT).Count } catch { 'THROW' })
          Assert $asserts 'B3: gercek bos -> True/KAPALI; TCP ve CIM okuma hatasi ve baska kimlikli ObjectNotFound -> False/OLCULEMEDI (FIRLATMAZ, KAPALI sayilmaz); calisan -> False/CALISIYOR' ($b1 -ceq 'True/KAPALI/True' -and $b2 -ceq 'False/OLCULEMEDI/True' -and $b3c -ceq 'False/OLCULEMEDI/True' -and $b5 -ceq 'False/OLCULEMEDI/True' -and $b4 -ceq 'False/CALISIYOR/True' -and $bp -ceq '0') ('bos=' + $b1 + ' tcp=' + $b2 + ' cim=' + $b3c + ' nf-other=' + $b5 + ' calisan=' + $b4 + ' Get-Pids(bos)=' + $bp)
          # ---- B3 canli dal SURELI YENIDEN OLCUM (R03-c; TS-2/TS-3/TS-4): sirali mock ile beklemenin GERCEKTEN yeniden olctugu kanitlanir
          $rbF2 = & $ld $ROLLBACK @('Get-SettledMeasure', 'Wait-SvcHealthy')
          foreach ($k in $rbF2.Keys) { . ([scriptblock]::Create($rbF2[$k])) }
          function Http { param([string]$method, [string]$url, [int]$timeoutMs = 8000) if ($url -like '*:8080/*') { return 401 } else { return 200 } }
          $ROUTE = '/api/client-statements/monthly-delivery/run-now'; $PORTAL_GET = '/api/portal/cases'; $BID_LIVE = 'SAHTEBID'
          $sq = { param($a) return @($a | ForEach-Object { @{ tcp = $_[0]; cim = $_[1]; task = $_[2] } }) }
          $script:SEQ = & $sq @(@('denied', 'empty', 'Ready'), @('denied', 'empty', 'Ready'), @('empty', 'empty', 'Ready')); $w1 = Wait-Stopped $WEB_TASK $WEB_PORT 'web' 30
          $script:SEQ = $null; $script:MOCK = @{ tcp = 'denied'; cim = 'empty'; task = 'Ready' }; $w2 = Wait-Stopped $WEB_TASK $WEB_PORT 'web' 1
          Assert $asserts 'B3 Wait-Stopped canli dal: gecici okuma hatasi (2x) sonra bos -> YENIDEN olcer, KAPALI (attempts 3, readErrors 2); kalici hata 1 sn -> OLCULEMEDI, her olcum hata (attempts>=2)' ([bool]$w1.stopped -and [string]$w1.state -ceq 'KAPALI' -and [int]$w1.attempts -eq 3 -and [int]$w1.readErrors -eq 2 -and -not [bool]$w2.stopped -and [string]$w2.state -ceq 'OLCULEMEDI' -and [int]$w2.attempts -ge 2 -and [int]$w2.readErrors -eq [int]$w2.attempts) ('w1=' + $w1.state + '/' + $w1.attempts + '/' + $w1.readErrors + ' w2=' + $w2.state + '/' + $w2.attempts + '/' + $w2.readErrors)
          $script:SEQ = & $sq @(@('denied', 'empty', 'Ready'), @('empty', 'empty', 'Ready'), @('one', 'one', 'Running')); $h1 = Wait-SvcHealthy 'web' 30 $true 'SAHTEBID'
          $script:SEQ = $null; $script:MOCK = @{ tcp = 'denied'; cim = 'empty'; task = 'Ready' }; $h2 = Wait-SvcHealthy 'web' 1 $true 'SAHTEBID'
          $script:SEQ = $null; $script:MOCK = @{ tcp = 'one'; cim = 'one'; task = 'Running' }; $h3 = Wait-SvcHealthy 'web' 0 $false ''
          Assert $asserts 'B3 Wait-SvcHealthy canli dal: okuma hatasi -> kapali -> calisiyor dizisinde YENIDEN olcer ve AYAKTA (attempts 3, readErrors 1); kalici hata -> OLCULEMEDI (AYAKTA/AYAKTA-DEGIL denmez); BUILD_ID okunamadi -> OLCULEMEDI' ([string]$h1.state -ceq 'AYAKTA' -and [int]$h1.attempts -eq 3 -and [int]$h1.readErrors -eq 1 -and [string]$h2.state -ceq 'OLCULEMEDI' -and [int]$h2.attempts -ge 2 -and [string]$h3.state -ceq 'OLCULEMEDI' -and [string]$h3.text -match 'BUILD_ID OKUNAMADI') ('h1=' + $h1.state + '/' + $h1.attempts + '/' + $h1.readErrors + ' h2=' + $h2.state + '/' + $h2.attempts + ' h3=' + $h3.state)
          $script:SEQ = & $sq @(@('denied', 'empty', 'Ready'), @('one', 'one', 'Running')); $s1 = Get-SettledMeasure 'web' 30
          $script:SEQ = $null; $script:MOCK = @{ tcp = 'empty'; cim = 'blind'; task = 'Ready' }; $m5 = Get-SvcMeasure 'web'
          Assert $asserts 'B3 Get-SettledMeasure: gecici okuma hatasindan sonra oturmus olcum CALISIYOR (karar tek hataya dayanmaz); komut satiri OKUNAMAYAN host -> OLCULEMEDI (0 sayilmaz)' ([string]$s1.state -ceq 'CALISIYOR' -and [int]$s1.attempts -eq 2 -and [int]$s1.readErrors -eq 1 -and [string]$m5.state -ceq 'OLCULEMEDI' -and [string]$m5.error -match 'OKUNAMADI') ('settled=' + $s1.state + '/' + $s1.attempts + ' blind=' + $m5.state)
          $script:SEQ = $null
          foreach ($f in @('Get-NetTCPConnection', 'Get-CimInstance', 'Get-ScheduledTask', 'Start-Sleep', 'Get-Pids', 'Get-HostProcCount', 'Get-HostCount', 'Get-TaskState', 'Get-SvcTask', 'Get-SvcPort', 'Get-SvcMeasure', 'Measure-Svc', 'Wait-Stopped', 'Test-EmptyQueryError', 'Get-SettledMeasure', 'Wait-SvcHealthy', 'Http')) { Remove-Item -LiteralPath ('function:\' + $f) -ErrorAction SilentlyContinue }
          $TEST = $null
        }
        'gate-rogue-wiring' {
          # SUREC KOSMAZ. (1) STATIK: kapi zinciri BUTUNLUGU (Get-GateIntegrity: 15 fonksiyonun ve ROGUE_* atamalarinin tam metni, SelfTest
          # blogu, akisin 0-kapilar kesiti, fonksiyon kumesi, dinamik tanim/golge yasagi, mod degiskeni envanteri, AST cagri konumlari) pinle
          # TAM ESIT + 25 bilinen kacis biciminin her birinin olcumu degistirdigi (kopya betikte). (2) DINAMIK: CANLI dal ($TEST = $false)
          # enjekte edilen surec listesi saglayicisiyla kosulur (gercek surec listesine BAKILMAZ). Canli Win32_Process okumasi ve yukseltilmis
          # pencere yalniz canli SelfTest kontrolleriyle olculur. SINIR: olcumlerin disinda kalan KASITLI bir duzenlemeyi kanitlayamaz.
          $tok = $null; $perr = $null
          $ast = [System.Management.Automation.Language.Parser]::ParseFile($RELEASE, [ref]$tok, [ref]$perr)
          $src = $ast.Extent.Text
          $shaText = { param($t) return [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes(([string]$t -replace "`r`n", "`n")))).Replace('-', '') }
          $cnt = { param($needle) return ([regex]::Matches($src, [regex]::Escape($needle))).Count }
          $allF = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false))
          $fn = @{}; foreach ($f in $allF) { $fn[$f.Name] = $f }
          # ---- BUTUNLUK: kapi zinciri pinle TAM ESIT (Get-GateIntegrity; degisiklik bu testi bilincli guncelletir, fark incelemede gorunur)
          $gi = Get-GateIntegrity $RELEASE
          $EXPI = [ordered]@{
            'parseErrors' = '0'
            'functionsTotal' = '53'
            'functionsTop' = '53'
            'functionsDuplicate' = ''
            'functionNamesSha' = '401C0482CF90C020FAC166C564B25BE90AE46A4A31099E8B6FCB550AF40785EB'
            'fn:Say' = 'FE49505CF9B83BF88F2A9EA2700AB41F0BCC650BB7C6D726F5FF7BEC7C63EE81'
            'fn:Get-SimState' = 'EF43A7BFEC648E5D534C33666D151A95B55E5C4498216C5F2A6A1EB0E1A691F0'
            'fn:ConvertTo-RogueFolded' = '427D6E02B0548E2B444F160D0C4D457E1D09C3EA73DB2C068A15A21B75144E90'
            'fn:Get-RogueMatchInfo' = 'F6198C0BCA43351469270BF3C3BAC79F1AB3F2F5E2A8EFBA7B1F2032032A951D'
            'fn:Test-RogueMatch' = '96961F98EF6E62CF86DD3C81E0CF1EA75A5D4BD68119ABB94B66D200055D4CA6'
            'fn:Get-RogueClass' = '4914857ED7BD089D66E3BA10568E16D3BD49F4E50FAA9100DF1EB51009FBFFC2'
            'fn:Get-RogueItemName' = 'CB171E1B99D2E13561C9C2D9968650B44D09104363F1F1F1EEEB91D7F4929B57'
            'fn:Get-RogueReport' = '2471FFA601233926AF26B940C720A34D75C1B665F14CF191B2250C0BC1F8A7CE'
            'fn:Get-ProcList' = '2F4E1784AED02AE698D9DEF9F48A942C67828C39179F5ACD41A5391A8A4C2B4C'
            'fn:Get-LiveRogueReport' = 'D02AD46307453290F96B5FA9614BAD04EF5E70F6BD0AD8F8237F78DABB7263F5'
            'fn:Get-RogueCount' = '3C1226201D37ECFD7C677BEB76B44D9F85A324BC3A0C292030649F95CC2E7279'
            'fn:Get-RogueGateError' = 'B8846B8363C844E0D9D362319625123D55ED2F96C17107D0E12FBD2180C45A07'
            'fn:Write-RogueReport' = '7ECC7E1A9ED3E8B5A6271A1A9D7E5A63A873B57EB54296084286C6AB122A29EA'
            'fn:Invoke-RogueGate' = '763EBFFC6FF9B7E14BBB2FF5439C705951253C7C11CB58AA393EB9A1A85220D6'
            'fn:Test-RogueClassifier' = '37047681FE2FAB71D273D3F1A94E2AF06436198C1F83C4F8D14E442D1A96DBE1'
            'rogueAssignTop' = '9'
            'rogueAssignAll' = '9'
            'rogueAssignSha' = 'F039A6D72C59B2581CF92AF1AFEBDA216D205AC0A2A1B310A2D3624C406046E5'
            'selfPathAssign' = '[string]$PSCommandPath'
            'selfTestBlocks' = '1'
            'selfTestSha' = '4C08A1E239352684200E8B83D918563378859B9D55404A46E371A21B59C2BBFB'
            'selfFailsAssign' = '$fails = 0'
            'selfFailsUnary' = 'PostfixPlusPlus'
            'selfClassifierLink' = '1'
            'selfJumps' = 'exit 1 | exit 0'
            'flowBlocks' = '1'
            'flowGateIndex' = '17'
            'flowSegmentSha' = '80F6CAA24B3B8B03E6355B4B340A7353D9DE6C5E5C9AE51E94A6AC6722F38FF5'
            'flowAfterGate' = 'Say ''--- 1) ADAY DOGRULAMA'''
            'flowPreGateJumps' = ''
            'gateCallCount' = '2'
            'gateSites' = 'akis -> if ($ge) { throw $ge } || selftest -> if ($ge) { Say (''  '' + $ge); $fails++ }'
            'geAssignAll' = '2'
            'dynamicUse' = 'tercih:PSCommandPath@<ust>,tercih:PSDefaultParameterValues@Get-ProcList'
            'exitSites' = '<ust>=8'
            'modeVarInventory' = '<ust>:FAULT=7;<ust>:SIM_STATE=3;<ust>:TEST=15;<ust>:TESTROOT=15;Get-HostProcCount:TEST=1;Get-LauncherTuple:TEST=1;Get-LiveRogueReport:TEST=2;Get-Pids:TEST=2;Get-ProcCommandLine:TEST=1;Get-ProcList:TEST=1;Get-RecoveryText:TEST=1;Get-RecoveryText:TESTROOT=1;Get-ServiceState:TEST=1;Get-SimState:SIM_STATE=1;Get-TaskAction:TEST=1;Get-TaskState:TEST=1;Http:FAULT=2;Http:TEST=1;Invoke-FaultPoint:FAULT=8;Invoke-FaultPoint:TEST=1;Invoke-StartTask:FAULT=5;Invoke-StartTask:TEST=1;Invoke-StopTask:FAULT=9;Invoke-StopTask:TEST=1;Set-SimState:SIM_STATE=1;Test-Elevated:TEST=1;Test-InheritOnly:TEST=1;Test-OldSvcHealth:TEST=1;Wait-Stopped:TEST=1;Write-EvidenceProtected:DIZGI:FAULT=1;Write-EvidenceProtected:DIZGI:TESTROOT=1;Write-EvidenceProtected:FAULT=1;Write-EvidenceProtected:TEST=3;Write-EvidenceProtected:TESTROOT=1'
          }
          $iBad = New-Object System.Collections.Generic.List[string]
          foreach ($k in $EXPI.Keys) { if ([string]$gi[$k] -cne [string]$EXPI[$k]) { $v = [string]$gi[$k]; $iBad.Add($k + ' -> ' + $(if ($v.Length -gt 48) { $v.Substring(0, 48) + '...' } else { $v })) } }
          foreach ($k in $gi.Keys) { if (-not $EXPI.Contains($k)) { $iBad.Add('pinlenmemis olcum: ' + $k) } }
          Assert $asserts ('kapi zinciri butunlugu: ' + $EXPI.Count + ' olcum pinle TAM ESIT (15 fonksiyon metni, ROGUE_* atamalari, SelfTest blogu, akis 0-kapilar kesiti, fonksiyon kumesi, dinamik tanim, mod degiskeni envanteri, cagri konumlari)') ($iBad.Count -eq 0 -and $EXPI.Count -ge 30) ($iBad -join ' ; ')
          Assert $asserts 'yapisal: fonksiyonlar yalniz ust duzeyde ve tekil; dinamik tanim/golge YOK; $ge yalniz 2 kez atanir; kapidan once atlama YOK; ROGUE_* yalniz ust duzeyde atanir' (([string]$gi.functionsTotal -ceq [string]$gi.functionsTop) -and ([string]$gi.functionsDuplicate -ceq '') -and (@(([string]$gi.dynamicUse -split ',') | Where-Object { $_ -and (@('tercih:PSDefaultParameterValues@Get-ProcList', 'tercih:PSCommandPath@<ust>') -cnotcontains $_) }).Count -eq 0) -and ([string]$gi.geAssignAll -ceq '2') -and ([string]$gi.flowPreGateJumps -ceq '') -and ([string]$gi.rogueAssignAll -ceq [string]$gi.rogueAssignTop)) ('toplam=' + $gi.functionsTotal + ' ust=' + $gi.functionsTop + ' dinamik=[' + $gi.dynamicUse + '] ge=' + $gi.geAssignAll + ' rogue=' + $gi.rogueAssignAll + '/' + $gi.rogueAssignTop)
          Assert $asserts 'yapisal (AST): kapi cagri konumlari = akis -> throw, selftest -> $fails++' ([string]$gi.gateSites -ceq 'akis -> if ($ge) { throw $ge } || selftest -> if ($ge) { Say (''  '' + $ge); $fails++ }') ([string]$gi.gateSites)
          Assert $asserts 'yapisal (AST): SelfTest sayaci yalniz $fails = 0 ile baslar, yalniz ++ ile artar; atlamalar yalniz exit 1 | exit 0' (([string]$gi.selfFailsAssign -ceq '$fails = 0') -and ([string]$gi.selfFailsUnary -ceq 'PostfixPlusPlus') -and ([string]$gi.selfJumps -ceq 'exit 1 | exit 0')) ([string]$gi.selfFailsAssign + ' / ' + $gi.selfFailsUnary + ' / ' + $gi.selfJumps)
          Assert $asserts 'yapisal (AST): SelfTest siniflandirici sonucu sayaca bagli (if (-not $rcOk) { $fails++ } TEK); $ROGUE_SELF_PATH = [string]$PSCommandPath; dinamik/tercih kullanimi yalniz izinli iki yerde' (([string]$gi.selfClassifierLink -ceq '1') -and ([string]$gi.selfPathAssign -ceq '[string]$PSCommandPath') -and ([string]$gi.dynamicUse -ceq 'tercih:PSCommandPath@<ust>,tercih:PSDefaultParameterValues@Get-ProcList')) ('bag=' + $gi.selfClassifierLink + ' yol=' + $gi.selfPathAssign + ' dinamik=[' + $gi.dynamicUse + ']')
          # ---- butunluk DUYARLILIGI: bilinen kacis bicimlerinin HER BIRI olcumu degistirir (yayin betiginin gecici KOPYASI; betik KOSULMAZ)
          $src0 = [IO.File]::ReadAllText($RELEASE)
          $GFL = '$ge = Invoke-RogueGate; if ($ge) { throw $ge }'; $GST = '$ge = Invoke-RogueGate; if ($ge) { Say (''  '' + $ge); $fails++ }'; $ANC = 'function Get-Pids('; $NLx = "`n"
          $iMut = @(
            @{ n = 'akis kapisi yalniz TEST modunda (if ($TEST) sarmali)'; old = $GFL; new = ('if ($TEST) { ' + $GFL + ' }') },
            @{ n = 'akis kapisi try/catch ile canlida yutulur'; old = $GFL; new = ('try { ' + $GFL + ' } catch { if ($TEST) { throw } }') },
            @{ n = 'akis: $ge canlida ezilir'; old = $GFL; new = '$ge = Invoke-RogueGate; if (-not $TEST) { $ge = '''' }; if ($ge) { throw $ge }' },
            @{ n = 'akis: kapidan once return'; old = $GFL; new = ('if (-not $TEST) { return }; ' + $GFL) },
            @{ n = 'SelfTest kapisi if ($false) icinde'; old = $GST; new = ('if ($false) { ' + $GST + ' }') },
            @{ n = 'SelfTest kapi sonucu atilir (tam metin yorumda)'; old = $GST; new = ('$null = Invoke-RogueGate # ' + $GST) },
            @{ n = 'SelfTest $fails = -1 ile baslar'; old = '$fails = 0'; new = '$fails = -1' },
            @{ n = 'SelfTest kapidan once exit 0'; old = $GST; new = ('exit 0; ' + $GST) },
            @{ n = 'SelfTest kapi hatasi geri alinir ($fails--)'; old = $GST; new = '$ge = Invoke-RogueGate; if ($ge) { Say (''  '' + $ge); $fails++; $fails-- }' },
            @{ n = 'SelfTest FAIL cikisi yorumda'; old = 'if ($fails -ne 0) { exit 1 }'; new = '# if ($fails -ne 0) { exit 1 }' },
            @{ n = 'SelfTest siniflandirici sayaca bagli degil'; old = 'if (-not $rcOk) { $fails++ }'; new = '# if (-not $rcOk) { $fails++ }' },
            @{ n = 'Get-CimInstance golge fonksiyonu'; old = $ANC; new = ('function Get-CimInstance { return @() }' + $NLx + $ANC) },
            @{ n = 'Invoke-RogueGate alias golgesi (canlida)'; old = $ANC; new = ('if (-not $TEST) { Set-Alias Invoke-RogueGate Get-Date }' + $NLx + $ANC) },
            @{ n = 'ic ice fonksiyon tanimi (Get-RogueGateError yeniden)'; old = $ANC; new = ('function Get-Pids0 { function Get-RogueGateError($rr) { return '''' } }' + $NLx + $ANC) },
            @{ n = 'Set-Variable ile $ROGUE_RX ezilir (canlida)'; old = $ANC; new = ('if (-not $TEST) { Set-Variable -Name ROGUE_RX -Value zzz -Scope Script }' + $NLx + $ANC) },
            @{ n = 'scriptblock icinde yeniden tanim (canlida)'; old = $ANC; new = ('if (-not $TEST) { . { function Get-RogueGateError($rr) { return '''' } } }' + $NLx + $ANC) },
            @{ n = 'Get-Variable ile mod okunur'; old = $ANC; new = ('$zz = Get-Variable -Name TEST -ValueOnly' + $NLx + $ANC) },
            @{ n = 'Invoke-Expression'; old = $ANC; new = ('Invoke-Expression $env:ZZ' + $NLx + $ANC) },
            @{ n = '$ExecutionContext ile dinamik kod'; old = $ANC; new = ('$null = $ExecutionContext.InvokeCommand.InvokeScript(''1'')' + $NLx + $ANC) },
            @{ n = 'function: surucusu ile tanim'; old = $ANC; new = ('$null = New-Item -Path ''function:Get-RogueGateError'' -Value { '''' } -Force' + $NLx + $ANC) },
            @{ n = 'kanitta rogue ogeleri canlida silinir'; old = 'health = $script:health'; new = 'health = $(if (-not $TEST -and $script:health.rogue) { $script:health.rogue.items = @() }; $script:health)' },
            @{ n = 'yeni canli/test ayrimi ($TestRoot)'; old = $ANC; new = ('if ($TestRoot -eq '''') { $ROGUE_SELF_PATH = '''' }' + $NLx + $ANC) },
            @{ n = 'fonksiyon icinde $script:ROGUE_* atamasi'; old = 'function Write-RogueReport($rr) {'; new = ('function Write-RogueReport($rr) {' + $NLx + '  $script:ROGUE_SELF_PATH = ''r27-''') },
            @{ n = 'Write-RogueReport canlida raporu sifirlar'; old = 'function Write-RogueReport($rr) {'; new = ('function Write-RogueReport($rr) {' + $NLx + '  if (-not $TEST) { $rr.count = 0 }') },
            @{ n = '$ROGUE_RXO RightToLeft'; old = '$ROGUE_RXO = [Text.RegularExpressions.RegexOptions]''IgnoreCase, CultureInvariant'''; new = '$ROGUE_RXO = [Text.RegularExpressions.RegexOptions]''IgnoreCase, CultureInvariant, RightToLeft''' },
            @{ n = 'betik duzeyinde $PSDefaultParameterValues ile liste daraltma'; old = $ANC; new = ('$PSDefaultParameterValues = @{ ''Get-CimInstance:Filter'' = (''ProcessId='' + $PID) }' + $NLx + $ANC) },
            @{ n = 'Get-ProcList yerel varsayilan sifirlamasi kaldirildi'; old = '  $PSDefaultParameterValues = @{}'; new = '' },
            @{ n = '${function:} ile ortam kosullu yeniden tanim'; old = $ANC; new = ('if ($env:R27_ZZ -eq ''1'') { ${function:Get-RogueGateError} = { param($rr) '''' } }' + $NLx + $ANC) },
            @{ n = 'Set-Stage icinde exit (kapidan sonraki asamada)'; old = 'function Set-Stage([string]$s) { $script:STAGE = $s;'; new = 'function Set-Stage([string]$s) { if ($s -eq ''1-yedek'') { exit 0 }; $script:STAGE = $s;' },
            @{ n = 'min: Set-Alias (yalniz dinamik kullanim)'; old = $ANC; new = ('Set-Alias zzAlias Get-Date' + $NLx + $ANC) },
            @{ n = 'min: Set-Variable'; old = $ANC; new = ('Set-Variable -Name zzVar -Value 1' + $NLx + $ANC) },
            @{ n = 'min: Get-Variable'; old = $ANC; new = ('$null = Get-Variable -Name zzVar -ErrorAction SilentlyContinue' + $NLx + $ANC) },
            @{ n = 'min: Invoke-Expression'; old = $ANC; new = ('Invoke-Expression ''1''' + $NLx + $ANC) },
            @{ n = 'min: function: surucusu (New-Item)'; old = $ANC; new = ('$null = New-Item -Path ''function:zzFn'' -Value { 1 } -Force' + $NLx + $ANC) },
            @{ n = 'min: ${function:} surucu degiskeni'; old = $ANC; new = ('${function:zzFn} = { 1 }' + $NLx + $ANC) },
            @{ n = 'min: $ExecutionContext'; old = $ANC; new = ('$null = $ExecutionContext' + $NLx + $ANC) },
            @{ n = 'min: [scriptblock] turu'; old = $ANC; new = ('$null = [scriptblock]' + $NLx + $ANC) },
            @{ n = 'olcum: yeni ust duzey ROGUE_* atamasi'; old = $ANC; new = ('$ROGUE_ZZ = 1' + $NLx + $ANC) },
            @{ n = 'olcum: $ROGUE_SELF_PATH ifadesi degisti'; old = '$ROGUE_SELF_PATH = [string]$PSCommandPath'; new = '$ROGUE_SELF_PATH = [string]$PSCommandPath + ''''' },
            @{ n = 'olcum: ikinci if ($SelfTest) blogu'; old = $ANC; new = ('if ($SelfTest) { }' + $NLx + $ANC) },
            @{ n = 'olcum: akis 0-kapilar kesitinin basi degisti'; old = "    Set-Stage '0-kapilar'"; new = ('    $null = 0' + $NLx + "    Set-Stage '0-kapilar'") },
            @{ n = 'olcum: kapidan sonraki deyim degisti'; old = $GFL; new = ($GFL + '; $null = 0') },
            @{ n = 'olcum: ucuncu Invoke-RogueGate cagrisi'; old = $ANC; new = ('$zzg = Invoke-RogueGate' + $NLx + $ANC) })
          $imDir = Join-Path $GATE_ROOT 'integrity-mut'; New-Item -ItemType Directory -Force -Path $imDir | Out-Null
          $imFile = Join-Path $imDir 'r27-release.ps1'
          $imBad = New-Object System.Collections.Generic.List[string]
          $cov = @{}; foreach ($k in $EXPI.Keys) { $cov[$k] = 0 }
          foreach ($m in $iMut) {
            $ix = $src0.IndexOf($m.old)
            if ($ix -lt 0 -or $src0.IndexOf($m.old, $ix + 1) -ge 0) { $imBad.Add($m.n + ': metin bulunamadi/tek degil'); continue }
            [IO.File]::WriteAllText($imFile, ($src0.Substring(0, $ix) + $m.new + $src0.Substring($ix + $m.old.Length)), (New-Object Text.UTF8Encoding($false)))
            $gm = Get-GateIntegrity $imFile
            if ([string]$gm.parseErrors -cne '0') { $imBad.Add($m.n + ': kopya parse hatasi'); continue }
            $diff = @($EXPI.Keys | Where-Object { [string]$gm[$_] -cne [string]$EXPI[$_] })
            foreach ($k in $diff) { $cov[$k]++ }
            if ($diff.Count -eq 0) { $imBad.Add($m.n + ': butunluk olcumu DEGISMEDI (kacis YAKALANMADI)') }
            elseif ($m.n -like 'min:*' -and ($diff -join ',') -cne 'dynamicUse') { $imBad.Add($m.n + ': yalniz dynamicUse degismeliydi, degisen=[' + ($diff -join ',') + ']') }
          }
          Assert $asserts ('butunluk duyarliligi: ' + $iMut.Count + ' kacis biciminin HER BIRI olcumu degistirir (kopya betikte; min: bicimleri YALNIZ dinamik-kullanim olcumunu degistirir)') ($imBad.Count -eq 0 -and $iMut.Count -eq 43) ($imBad -join ' ; ')
          # fonksiyon metni olcumleri: her kapi fonksiyonunun govdesine zararsiz bir deyim eklenince YALNIZ o fonksiyonun olcumu degismeli
          $fpBad = New-Object System.Collections.Generic.List[string]
          $astS = [System.Management.Automation.Language.Parser]::ParseInput($src0, [ref]$null, [ref]$null)
          foreach ($k in @($EXPI.Keys | Where-Object { $_ -like 'fn:*' })) {
            $nm = $k.Substring(3); $d = @($astS.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -ceq $nm })
            if ($d.Count -ne 1) { $fpBad.Add($nm + ': tanim adedi ' + $d.Count); continue }
            $at = $d[0].Body.Extent.StartOffset + 1
            [IO.File]::WriteAllText($imFile, ($src0.Substring(0, $at) + ' $null = $null; ' + $src0.Substring($at)), (New-Object Text.UTF8Encoding($false)))
            $gm = Get-GateIntegrity $imFile
            $diff = @($EXPI.Keys | Where-Object { [string]$gm[$_] -cne [string]$EXPI[$_] })
            foreach ($x in $diff) { $cov[$x]++ }
            if (($diff -join ',') -cne $k) { $fpBad.Add($nm + ': degisen=[' + ($diff -join ',') + ']') }
          }
          Assert $asserts 'olcum duyarliligi: her kapi fonksiyonunun metin olcumu YALNIZ kendi degisikliginde degisir (15 fonksiyon)' ($fpBad.Count -eq 0 -and @($EXPI.Keys | Where-Object { $_ -like 'fn:*' }).Count -eq 15) ($fpBad -join ' ; ')
          $uncov = @($EXPI.Keys | Where-Object { $_ -cne 'parseErrors' -and $cov[$_] -eq 0 })
          Assert $asserts 'olcum kapsami: parseErrors disindaki HER olcum en az bir kacis/olcum denemesiyle tetiklendi (sabitlenmis ya da kor olcum yok)' ($uncov.Count -eq 0) ('tetiklenmeyen=[' + ($uncov -join ',') + ']')
          $calls = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Invoke-RogueGate' }, $true) | Sort-Object { $_.Extent.StartOffset })
          $selfIf = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.IfStatementAst] -and $_.Clauses[0].Item1.Extent.Text -ceq '$SelfTest' })
          Assert $asserts 'Invoke-RogueGate TAM 2 yerde cagrilir; ust duzey if ($SelfTest) blogu TEK' ($calls.Count -eq 2 -and $selfIf.Count -eq 1) ('cagri=' + $calls.Count + ' selfIf=' + $selfIf.Count)
          if ($calls.Count -eq 2 -and $selfIf.Count -eq 1) {
            $sb = $selfIf[0].Extent; $c1 = $calls[0].Extent.StartOffset; $c2 = $calls[1].Extent.StartOffset
            $stage0 = $src.IndexOf("Set-Stage '0-kapilar'", $sb.EndOffset); $cand0 = $src.IndexOf("Say '--- 1) ADAY DOGRULAMA'", $sb.EndOffset)
            # ilk durdurma: SelfTest blogundan SONRA, fonksiyon govdesi DISINDAKI ilk Invoke-StopTask / Invoke-StopOne komutu (AST; akis
            # durdurmayi Invoke-StopOne 'web' ile yapar - metin aramasi fonksiyon tanimlarina ya da yoruma takilabilirdi)
            $inFn = { param($n) $e = $n.Parent; while ($null -ne $e) { if ($e -is [System.Management.Automation.Language.FunctionDefinitionAst]) { return $true }; $e = $e.Parent }; return $false }
            $stopCmds = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and @('Invoke-StopTask', 'Invoke-StopOne') -contains $n.GetCommandName() }, $true) | Where-Object { $_.Extent.StartOffset -gt $sb.EndOffset -and -not (& $inFn $_) } | Sort-Object { $_.Extent.StartOffset })
            $stop0 = $(if ($stopCmds.Count -ge 1) { $stopCmds[0].Extent.StartOffset } else { -1 })
            Assert $asserts 'ilk cagri SelfTest blogunun ICINDE' ($c1 -gt $sb.StartOffset -and $c1 -lt $sb.EndOffset) ''
            Assert $asserts 'ikinci cagri yayin akisinda: 0-kapilar asamasindan SONRA, ADAY DOGRULAMA ve ilk durdurmadan ONCE' ($stage0 -gt 0 -and $cand0 -gt 0 -and $stop0 -gt 0 -and $c2 -gt $stage0 -and $c2 -lt $cand0 -and $c2 -lt $stop0) ('stage0=' + $stage0 + ' cagri=' + $c2 + ' aday=' + $cand0 + ' durdur=' + $stop0)
            $selfText = $sb.Text
            Assert $asserts 'SelfTest baglantisi: kapi hatasi $fails sayacini artirir (tam metin, tek)' ((& $cnt '$ge = Invoke-RogueGate; if ($ge) { Say (''  '' + $ge); $fails++ }') -eq 1 -and $selfText.Contains('$ge = Invoke-RogueGate; if ($ge) { Say (''  '' + $ge); $fails++ }')) ''
            Assert $asserts 'yayin akisi baglantisi: kapi hatasi throw eder (tam metin, tek)' ((& $cnt '$ge = Invoke-RogueGate; if ($ge) { throw $ge }') -eq 1) ''
            $f0 = [regex]::Matches($selfText, '\$fails\s*=(?!=)'); $gateInSelf = $selfText.IndexOf('$ge = Invoke-RogueGate')
            Assert $asserts 'SelfTest: $fails yalniz BIR kez (kapidan ONCE) sifirlanir; FAIL cikisi 1' ($f0.Count -eq 1 -and $f0[0].Index -lt $gateInSelf -and $selfText.Contains('if ($fails -ne 0) { exit 1 }')) ('atama=' + $f0.Count)
            Assert $asserts 'SelfTest: siniflandirici oz-testi de sayaca bagli' ($selfText.Contains('$rcOk = Test-RogueClassifier;') -and $selfText.Contains('if (-not $rcOk) { $fails++ }')) ''
          }
          $usesTest = { param($name) return @($fn[$name].Body.FindAll({ param($n) $n -is [System.Management.Automation.Language.VariableExpressionAst] -and $n.VariablePath.UserPath -ieq 'TEST' }, $true)).Count }
          Assert $asserts 'karar fonksiyonlari $TEST okumaz (Get-RogueGateError, Invoke-RogueGate, Get-RogueReport); $TEST yalniz saglayici + rapor etiketinde' ((& $usesTest 'Get-RogueGateError') -eq 0 -and (& $usesTest 'Invoke-RogueGate') -eq 0 -and (& $usesTest 'Get-RogueReport') -eq 0 -and (& $usesTest 'Get-ProcList') -ge 1) ''
          $cim = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Get-CimInstance' -and $n.Extent.Text -match 'Win32_Process' }, $true))
          $cimIn = @($cim | Where-Object { $_.Extent.StartOffset -ge $fn['Get-ProcList'].Extent.StartOffset -and $_.Extent.EndOffset -le $fn['Get-ProcList'].Extent.EndOffset })
          Assert $asserts 'canli surec listesi okumasi (Win32_Process, filtresiz) Get-ProcList icinde TEK' ($cimIn.Count -eq 1 -and $cimIn[0].Extent.Text -ceq 'Get-CimInstance -ClassName Win32_Process') ('toplam=' + $cim.Count + ' saglayicida=' + $cimIn.Count)
          Assert $asserts 'health.rogue yalniz Invoke-RogueGate icinde atanir (2 atama: rapor + okuma hatasi)' ((& $cnt '$script:health.rogue =') -eq 2 -and ([regex]::Matches($fn['Invoke-RogueGate'].Extent.Text, [regex]::Escape('$script:health.rogue ='))).Count -eq 2) ''
          # ---- DINAMIK: canli dal, enjekte saglayici
          $wantV = @('$ROGUE_TOKENS', '$ROGUE_RX', '$ROGUE_RXO', '$ROGUE_VIEWERS', '$ROGUE_VIEWER_DIRS', '$ROGUE_SHELLS', '$ROGUE_ITEM_EXT', '$ROGUE_ITEM_FLAGS')
          $wantF = @('ConvertTo-RogueFolded', 'Get-RogueMatchInfo', 'Test-RogueMatch', 'Get-RogueClass', 'Get-RogueItemName', 'Get-RogueReport', 'Get-LiveRogueReport', 'Get-RogueGateError', 'Write-RogueReport', 'Invoke-RogueGate')
          foreach ($a in @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and ($wantV -contains $n.Left.Extent.Text) }, $false))) { . ([scriptblock]::Create($a.Extent.Text)) }
          foreach ($k in $wantF) { . ([scriptblock]::Create($fn[$k].Extent.Text)) }
          $TEST = $false
          $ROGUE_SELF_PATH = 'D:\repo\project\docs\governance\client-release-r27-r01\scripts\r27-release.ps1'
          # ---- GERCEK Get-ProcList (canli dal): SAHTE Get-CimInstance (gelismis fonksiyon; gercek CIM cagrilmaz) + ETKIN $PSDefaultParameterValues
          #      ('Get-CimInstance:Filter') ile liste DARALMAZ; yerel sifirlama kaldirilinca daralir (testin olctugunun kaniti).
          . ([scriptblock]::Create($fn['Get-ProcList'].Extent.Text))
          $cimNames = @('node.exe', 'powershell.exe', 'pwsh.exe', 'python.exe', 'cmd.exe', 'bash.exe', 'tail.exe', 'svchost.exe', 'System', 'conhost.exe')
          $script:CIM_LIST = @(for ($k = 0; $k -lt 30; $k++) { New-Object psobject -Property @{ ProcessId = 400 + $k; Name = $cimNames[$k % $cimNames.Count] } })
          function Get-CimInstance { [CmdletBinding()] param([string]$ClassName, [string]$Filter) if ($Filter) { return @($script:CIM_LIST | Select-Object -First 1) }; if ($ClassName -cne 'Win32_Process') { return @() }; return @($script:CIM_LIST) }
          $savedPD = $PSDefaultParameterValues
          $PSDefaultParameterValues = @{ 'Get-CimInstance:Filter' = 'ProcessId=1' }
          $cDirect = @(Get-CimInstance -ClassName Win32_Process).Count; $realList = @(Get-ProcList); $cReal = $realList.Count
          $samePids = ((@($realList | ForEach-Object { [int]$_.ProcessId }) -join ',') -ceq (@($script:CIM_LIST | ForEach-Object { [int]$_.ProcessId }) -join ','))
          . ([scriptblock]::Create(($fn['Get-ProcList'].Extent.Text).Replace('$PSDefaultParameterValues = @{}', ''))); $cMut = @(Get-ProcList).Count
          $PSDefaultParameterValues = $savedPD
          Remove-Item -LiteralPath function:\Get-CimInstance -ErrorAction SilentlyContinue
          Assert $asserts 'GERCEK Get-ProcList (canli dal, sahte CIM; 10 farkli goruntu adi): liste AYNEN doner (30/30, pid sirasi esit; ad bazli suzme yok); etkin Get-CimInstance:Filter varsayilani DARALTMAZ; sifirlama kaldirilinca daralir (1)' ($cDirect -eq 1 -and $cReal -eq 30 -and $samePids -and $cMut -eq 1) ('dogrudan=' + $cDirect + ' gercek=' + $cReal + ' pid-esit=' + $samePids + ' sifirlamasiz=' + $cMut)
          $script:WIRE_LIST = @(); $script:WIRE_THROW = $false
          function Get-ProcList { if ($script:WIRE_THROW) { throw (New-Object InvalidOperationException 'saglayici hatasi (enjekte)') }; return @($script:WIRE_LIST) }
          $script:health = [ordered]@{}
          $t0w = [datetime]'2026-01-01T00:00:00Z'
          $mkW = { param($i, $pp, $sec, $n, $c, $x) New-Object psobject -Property @{ ProcessId = $i; ParentProcessId = $pp; CreationDate = $t0w.AddSeconds($sec); Name = $n; CommandLine = $c; ExecutablePath = $x } }
          $wSelf = (& $mkW ([int]$PID) 99 10 'powershell.exe' ('powershell.exe -NoProfile -File ' + $ROGUE_SELF_PATH) 'C:\w\powershell.exe')
          $wParent = (& $mkW 99 1 0 'powershell.exe' 'powershell.exe' 'C:\w\powershell.exe')
          $wOther = (& $mkW 5003 1 5 'node.exe' 'node D:\app\server.js' 'C:\n\node.exe')
          $wTail = (& $mkW 5002 1 5 'tail.exe' 'tail -f D:\x\r27-izleme.log' (Join-Path $env:ProgramFiles 'Git\usr\bin\tail.exe'))
          $wNode = (& $mkW 5001 1 5 'node.exe' 'node D:\g\d5-portal-reset-live-run.js' 'C:\n\node.exe')
          $wSelfBlind = (& $mkW ([int]$PID) 99 10 'powershell.exe' '' '')
          $wPad = @(for ($k = 0; $k -lt 20; $k++) { & $mkW (600 + $k) 1 5 'svchost.exe' ('svchost.exe -k w' + $k) 'C:\Windows\System32\svchost.exe' })
          $script:WIRE_LIST = @($wSelf, $wParent, $wOther) + $wPad; $g1 = Invoke-RogueGate; $h1 = $script:health.rogue
          Assert $asserts 'canli dal: temiz liste -> kapi GECER (simulated=false, kendi sureci goruldu, ust surec dislandi)' ($g1 -ceq '' -and [int]$h1.count -eq 0 -and (-not [bool]$h1.simulated) -and [bool]$h1.selfSeen -and [int]$h1.scanned -eq 23 -and @($h1.excluded).Count -eq 1) ('hata=[' + $g1 + '] taranan=' + $h1.scanned)
          $script:WIRE_LIST = @($wSelf, $wParent, $wOther, $wTail) + $wPad; $g2 = Invoke-RogueGate; $h2 = $script:health.rogue
          Assert $asserts 'canli dal: YALNIZ izleme goruntuleyicisi -> DUR (izleme dahil 1 eslesme)' ($g2 -match 'test/prova sureci var \(izleme dahil 1 eslesme\)' -and [int]$h2.viewers -eq 1 -and [int]$h2.testApp -eq 0) ('hata=[' + $g2 + ']')
          $script:WIRE_LIST = @($wSelf, $wParent, $wOther, $wNode) + $wPad; $g3 = Invoke-RogueGate; $h3 = $script:health.rogue
          Assert $asserts 'canli dal: kosucu sureci -> DUR (izleme dahil 1 eslesme; test-uygulama=1)' ($g3 -match 'test/prova sureci var \(izleme dahil 1 eslesme\)' -and [int]$h3.testApp -eq 1) ('hata=[' + $g3 + ']')
          $script:WIRE_LIST = @($wParent, $wOther) + $wPad; $g4 = Invoke-RogueGate
          Assert $asserts 'canli dal: listede kendi sureci YOK -> DUR (liste guvenilir degil)' ($g4 -match 'kendi surecini/komut satirini goremedi') ('hata=[' + $g4 + ']')
          $script:WIRE_LIST = @($wSelfBlind, $wParent, $wOther) + $wPad; $g5 = Invoke-RogueGate
          Assert $asserts 'canli dal: kendi komut satiri OKUNAMIYOR -> DUR (liste guvenilir degil)' ($g5 -match 'kendi surecini/komut satirini goremedi') ('hata=[' + $g5 + ']')
          $script:WIRE_LIST = @($wSelf, $wParent, $wOther); $g5b = Invoke-RogueGate
          Assert $asserts 'canli dal: DARALTILMIS liste (taranan=3 < 20; kendi sureci gorunse de) -> DUR (liste eksik)' ($g5b -match 'surec listesi eksik \(taranan=3 < 20') ('hata=[' + $g5b + ']')
          $script:WIRE_LIST = @(); $g6 = Invoke-RogueGate
          Assert $asserts 'canli dal: bos liste -> DUR (taranan=0)' ($g6 -match 'taranamadi \(taranan=0\)') ('hata=[' + $g6 + ']')
          $script:WIRE_THROW = $true; $g7 = Invoke-RogueGate; $h7 = $script:health.rogue; $script:WIRE_THROW = $false
          Assert $asserts 'canli dal: saglayici istisnasi -> DUR (surec listesi okunamadi) + kanitta hata turu' ($g7 -match 'surec listesi okunamadi \(InvalidOperationException\)' -and [string]$h7.error -ceq 'InvalidOperationException') ('hata=[' + $g7 + ']')
          $TEST = $true; $script:WIRE_LIST = @($wOther); $g8 = Invoke-RogueGate; $h8 = $script:health.rogue
          $script:WIRE_LIST = @($wOther, $wTail); $g9 = Invoke-RogueGate; $TEST = $false
          Assert $asserts 'simulator etiketi: kendi sureci listede olmasa da temiz liste gecer; eslesme varsa yine DUR' ($g8 -ceq '' -and [bool]$h8.simulated -and $g9 -match 'izleme dahil 1 eslesme') ('g8=[' + $g8 + '] g9=[' + $g9 + ']')
          Remove-Item -LiteralPath function:\Get-ProcList -ErrorAction SilentlyContinue
          Assert $asserts 'canli kanit dizinine dosya eklenmedi' ((Get-DirFileCount $LIVE_EVID_DIR) -eq $liveEvidBefore) ('once=' + $liveEvidBefore)
        }
      }
    } else {
      # ---------------------------------------------------------- ISLEVSEL SENARYOLAR
      if ($sc -eq 'rollback-script') {
        # happy-path'in biraktigi durum: canli = aday, yedekler TestRoot\evidence altinda. Yoksa pristine'den kur.
        $bkApi = $null; $bkWeb = $null
        if ($lastHappyEvidence -and (Test-Path -LiteralPath $lastHappyEvidence.api.backup) -and (Test-Path -LiteralPath $lastHappyEvidence.web.backup)) {
          $bkApi = $lastHappyEvidence.api.backup; $bkWeb = $lastHappyEvidence.web.backup
          Say ('  happy-path yedekleri kullaniliyor: ' + $bkApi + ' | ' + $bkWeb)
        } else {
          Reset-TestRoot $sc
          Mirror $C_API $T_LIVE; Mirror (Join-Path $C_WEB '.next') $T_LIVE_NEXT; Copy-Item -LiteralPath (Join-Path $C_WEB 'next.config.js') -Destination $T_LIVE_CFG -Force
          $bkApi = Join-Path $T_EVID 'rollback-api-src-R26-harness'; $bkWeb = Join-Path $T_EVID 'rollback-web-R26-harness'
          Mirror $P_API $bkApi; Mirror (Join-Path $P_WEB '.next') (Join-Path $bkWeb '.next'); Copy-Item -LiteralPath (Join-Path $P_WEB 'next.config.js') -Destination (Join-Path $bkWeb 'next.config.js') -Force
          Say '  happy-path yok: canli=aday ve yedekler pristine''den kuruldu'
        }
        $pre = Get-LiveDigests
        Assert $asserts 'on-durum canli=aday' ($pre.api -ceq $EXP_CAND -and $pre.web -ceq $EXP_WEB_CAND) ('api=' + $pre.api.Substring(0, 8) + ' web=' + $pre.web.Substring(0, 8))
        $rs = Run-Script $ROLLBACK @('-BackupApiDir', (Q $bkApi), '-BackupWebDir', (Q $bkWeb), '-TestRoot', (Q $TESTROOT), '-SelfTest') (Join-Path $scDir 'stdout-selftest.txt')
        Assert $asserts 'rollback -SelfTest (TestRoot) cikis 0' ($rs.rc -eq 0) ('rc=' + $rs.rc)
        $r = Run-Script $ROLLBACK @('-BackupApiDir', (Q $bkApi), '-BackupWebDir', (Q $bkWeb), '-TestRoot', (Q $TESTROOT)) (Join-Path $scDir 'stdout.txt')
      } elseif ($exp.b3) {
        # B3 hata senaryolari (R03-c): canli = aday, yedekler pristine'den; B3 -Fault ile kosulur (canliya dokunmaz)
        Reset-TestRoot $sc
        Mirror $C_API $T_LIVE; Mirror (Join-Path $C_WEB '.next') $T_LIVE_NEXT; Copy-Item -LiteralPath (Join-Path $C_WEB 'next.config.js') -Destination $T_LIVE_CFG -Force
        $bkApi = Join-Path $T_EVID 'rollback-api-src-R26-harness'; $bkWeb = Join-Path $T_EVID 'rollback-web-R26-harness'
        Mirror $P_API $bkApi; Mirror (Join-Path $P_WEB '.next') (Join-Path $bkWeb '.next'); Copy-Item -LiteralPath (Join-Path $P_WEB 'next.config.js') -Destination (Join-Path $bkWeb 'next.config.js') -Force
        $pre = Get-LiveDigests
        Assert $asserts 'on-durum canli=aday (B3 oncesi)' ($pre.api -ceq $EXP_CAND -and $pre.web -ceq $EXP_WEB_CAND) ('api=' + $pre.api.Substring(0, 8) + ' web=' + $pre.web.Substring(0, 8))
        $r = Run-Script $ROLLBACK @('-BackupApiDir', (Q $bkApi), '-BackupWebDir', (Q $bkWeb), '-TestRoot', (Q $TESTROOT), '-Fault', $sc) (Join-Path $scDir 'stdout.txt')
      } else {
        Reset-TestRoot $sc
        $argList = @('-TestRoot', (Q $TESTROOT)); if ($sc -ne 'happy-path') { $argList += @('-Fault', $sc) }
        $r = Run-Script $RELEASE $argList (Join-Path $scDir 'stdout.txt')
      }
      Assert $asserts 'cikis kodu' ($r.rc -eq $exp.exit) ('beklenen ' + $exp.exit + ' olculen ' + $r.rc)
      $evPath = Find-EvidencePath $r.out
      Assert $asserts 'kanit JSON yazildi (KANIT: satiri)' ($null -ne $evPath) $(if ($evPath) { $evPath.path } else { 'YOK' })
      if ($evPath) {
        Assert $asserts 'kanit dosyasi mevcut ve sha esit' ((Test-Path -LiteralPath $evPath.path) -and ((Sha $evPath.path) -ceq $evPath.sha)) $evPath.sha.Substring(0, 16)
        Assert $asserts 'kanit TestRoot\evidence altinda' ($evPath.path.StartsWith($T_EVID, [StringComparison]::OrdinalIgnoreCase)) $evPath.path
        $ev = Get-Content -Raw -LiteralPath $evPath.path | ConvertFrom-Json
        $evCopy = Join-Path $scDir (Split-Path -Leaf $evPath.path); Copy-Item -LiteralPath $evPath.path -Destination $evCopy -Force
        Assert $asserts 'verdict' ($ev.verdict -ceq $exp.verdict) ('beklenen ' + $exp.verdict + ' olculen ' + $ev.verdict)
        Assert $asserts 'kanit exitCode == surec cikisi' ([int]$ev.exitCode -eq $r.rc) ('json=' + $ev.exitCode + ' rc=' + $r.rc)
        Assert $asserts 'kanit testMode.enabled' ([bool]$ev.testMode.enabled) ('testRoot=' + $ev.testMode.testRoot)
        if ($exp.failedAt -ne '') { Assert $asserts 'failedAt asamasi' ([string]$ev.failedAt -ceq $exp.failedAt) ('beklenen ' + $exp.failedAt + ' olculen ' + $ev.failedAt) }
        else { Assert $asserts 'failedAt bos' ([string]$ev.failedAt -eq '') ('olculen ' + $ev.failedAt) }
        Assert $asserts 'stage alani 7-kanit DEGIL (son gercek asama)' ([string]$ev.stage -cne '7-kanit' -and [string]$ev.stage -ne '') ('stage=' + $ev.stage)
        Assert $asserts 'stages listesi dolu' (@($ev.stages).Count -ge 2) ('adet=' + @($ev.stages).Count)
        if ($exp.b3) {
          # ---- B3 (R03-c): olcum hatasi/istisna kalan servisi ATLATMAZ; metinler yalniz OLCULEN sonuca dayanir
          $stNow = Get-Content -Raw -LiteralPath $T_STATE | ConvertFrom-Json
          $recT = (@($ev.recovery) -join "`n")
          Assert $asserts ('B3 fault kanitta + faultLog: ' + $exp.faultMark) ([string]$ev.testMode.fault -ceq $sc -and ((@($ev.testMode.faultLog) -join ' ; ').Contains($exp.faultMark))) ((@($ev.testMode.faultLog) -join ' ; '))
          Assert $asserts ('simulator: ' + $exp.stopCalls + ' durdurma + ' + $exp.startCalls + ' baslatma istegi') ([int]$stNow.stopCalls -eq $exp.stopCalls -and [int]$stNow.startCalls -eq $exp.startCalls) ('stop=' + $stNow.stopCalls + ' start=' + $stNow.startCalls)
          Assert $asserts 'kanit serviceState servis basina AYRI (api ve web state alanlari dolu)' ($null -ne $ev.serviceState.api -and $null -ne $ev.serviceState.web -and [string]$ev.serviceState.api.state -ne '' -and [string]$ev.serviceState.web.state -ne '') ('api=' + $ev.serviceState.api.state + ' web=' + $ev.serviceState.web.state)
          # KURTARMA komutlari yapistirilinca calisir (ms-1/2/6): olcum satirlari tek tek parse edilir; SilentlyContinue YOK; @(Get-NetTCPConnection ... -ErrorAction Stop)
          $cmdLines = @(@($ev.recovery) | Where-Object { ([string]$_) -match '^\s+(@\(|\(Get-|curl\.exe|try \{)' })
          $perr = @(); foreach ($cl in $cmdLines) { $tk = $null; $pe = $null; [void][System.Management.Automation.Language.Parser]::ParseInput(([string]$cl).Trim(), [ref]$tk, [ref]$pe); if (@($pe).Count) { $perr += ([string]$cl).Trim().Substring(0, [Math]::Min(60, ([string]$cl).Trim().Length)) } }
          $tcpOk = (-not $recT.Contains('Get-NetTCPConnection') -or ($recT.Contains('@(Get-NetTCPConnection -State Listen -LocalPort') -and $recT.Contains('-ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique') -and $recT.Contains("-like 'CmdletizationQuery_NotFound*'") -and $recT.Contains("'OLCULEMEDI: '")))
          Assert $asserts ('KURTARMA olcum komutlari parse edilir (' + $cmdLines.Count + ' satir); SilentlyContinue yok; dinleyici: -ErrorAction Stop + benzersiz PID + eslesme-yok FQID ile 0, baska hata OLCULEMEDI') ($perr.Count -eq 0 -and $recT -notmatch 'SilentlyContinue' -and $tcpOk) ('parse hatali=' + ($perr -join ' | '))
          if ($null -ne $ev.recovery) {
            # R03-d (TD-2): satir YOKLUGU parse assert'ini gecirmesin - AYAKTA olmayan her servis icin >= 4 olcum satiri, o servisin port/gorev/host argumaniyla
            $svcSt = $(if ($exp.exit -eq 13) { @{ api = [string]$ev.health.api.state; web = [string]$ev.health.web.state } } elseif ($exp.exit -eq 11) { @{ api = 'AYAKTA'; web = 'AYAKTA' } } else { @{ api = [string]$ev.stopRecovery.api.after.state; web = [string]$ev.stopRecovery.web.after.state } })
            $mlBad = @(); $mlSeen = @(); $mlN = 0
            foreach ($svc in @('api', 'web')) {
              # AYAKTA olmayan servis + (13) takas sonu KAPALI olculmeyen servis incelenir; dort olcum turunun HER BIRI ayri aranir
              if ($svcSt[$svc] -eq 'AYAKTA' -and $exp.swapEndBad -ne $svc.ToUpperInvariant()) { continue }
              $mlN++; $pt = $(if ($svc -eq 'api') { 8080 } else { 3002 }); $tn = $(if ($svc -eq 'api') { 'HukukPlatform-API' } else { 'HukukPlatform-Web' })
              $kinds = [ordered]@{ dinleyici = ('-LocalPort ' + $pt + ' '); host = ('''(^|\s)' + $svc + '(\s|$)'''); gorev = ('-TaskName ' + $tn + ' -ErrorAction Stop'); http = ('127.0.0.1:' + $pt + '/') }
              foreach ($k in @($kinds.Keys)) { $c = @($cmdLines | Where-Object { ([string]$_).Contains($kinds[$k]) }).Count; $mlSeen += ($svc + '.' + $k + '=' + $c); if ($c -lt 1) { $mlBad += ($svc + '.' + $k) } }
            }
            Assert $asserts '(R03-d) incelenen her servis icin dort olcum turu (dinleyici/host/gorev/HTTP) AYRI ayri var; inceleme gereken servis varsa en az biri incelendi' ($mlBad.Count -eq 0 -and ($mlN -ge 1 -or ($svcSt.api -eq 'AYAKTA' -and $svcSt.web -eq 'AYAKTA' -and -not $exp.swapEndBad))) ('incelenen=' + $mlN + ' olculen: ' + ($mlSeen -join ' ') + ' ; eksik: ' + ($mlBad -join ' '))
          }
          if ($exp.exit -eq 11) {
            # R03D2-1: kimlik DOGRULANMADI -> KURTARMA hicbir yerde Start onermez; takas sonu satiri yalniz olcum + owner karariyla durdurma
            Assert $asserts '(R03-d) 11: kimlik dogrulanmadi (verify.ok=false), servis baslatma YOK, KURTARMA Start ONERMEZ; takas sonu satiri + olcum + yalniz durdurma' (-not [bool]$ev.verify.ok -and [int]$stNow.startCalls -eq 0 -and $recT -match 'bu kosum SERVIS BASLATMADI' -and $recT -match ($exp.swapEndBad + ' takas bitiminde KAPALI olculmedi[^\r\n]*dosya kimligi DOGRULANMADI') -and $recT -match 'owner karariyla yalniz durdurma: Stop-ScheduledTask -TaskName HukukPlatform-Web ; Start VERME' -and $recT -notmatch 'Start-ScheduledTask' -and $recT -notmatch 'TABAN dosyalarla') ('mismatch=' + (@($ev.verify.mismatches) -join ' ; '))
          } elseif ($exp.exit -eq 0 -or $exp.exit -eq 13) {
            $h = $ev.health
            Assert $asserts 'dosyalar geri yuklendi + kimlik DOGRULANDI (verify.ok; restoreSteps hepsi TAMAM)' ([bool]$ev.verify.ok -and @($ev.restoreSteps.PSObject.Properties | Where-Object { -not ([string]$_.Value).StartsWith('TAMAM') }).Count -eq 0) ''
            Assert $asserts ('baslatma girisimi AYRI: api=' + $exp.apiCmd + ' web=' + $exp.webCmd + ' (birinin hatasi digerini ATLATMAZ)') (([string]$h.startAttempts.api).StartsWith($exp.apiCmd) -and ([string]$h.startAttempts.web).StartsWith($exp.webCmd)) ('api=' + $h.startAttempts.api + ' | web=' + $h.startAttempts.web)
            Assert $asserts ('SON olcum (karar): api=' + $exp.apiState + ' web=' + $exp.webState) ([string]$h.api.state -ceq $exp.apiState -and [string]$h.web.state -ceq $exp.webState) ('api=' + $h.api.text + ' | web=' + $h.web.text)
            if ($exp.finalApiReadErr) { Assert $asserts 'SON olcumde tek gecici okuma hatasi YENIDEN olculdu (karari degistirmedi)' ([int]$h.api.readErrors -ge 1 -and [string]$h.api.state -ceq 'AYAKTA') ('api=' + $h.api.readErrors + '/' + $h.api.attempts + ' ' + $h.api.state) }
            if ($exp.apiPostState) { Assert $asserts ('baslatma sonrasi (eski) olcum api=' + $exp.apiPostState + ' ama karar SON olcume gore') ([string]$h.postStart.api.state -ceq $exp.apiPostState) ([string]$h.postStart.api.text) }
            Assert $asserts ('okuma hatasi kaydi (baslatma beklemesi): api ' + $exp.apiReadErr + ' web ' + $exp.webReadErr + ' (okuma hatasi KAPALI/BASARILI sayilmadi)') ((([int]$h.postStart.api.readErrors) -ge 1) -eq $exp.apiReadErr -and (([int]$h.postStart.web.readErrors) -ge 1) -eq $exp.webReadErr) ('api=' + $h.postStart.api.readErrors + '/' + $h.postStart.api.attempts + ' web=' + $h.postStart.web.readErrors + '/' + $h.postStart.web.attempts)
            Assert $asserts 'AYAKTA iddiasi simulatorle tutarli (AYAKTA -> calisiyor; AYAKTA-DEGIL + istisna -> calismiyor)' ((([string]$h.api.state -ne 'AYAKTA') -or [bool]$stNow.apiRunning) -and (([string]$h.web.state -ne 'AYAKTA') -or [bool]$stNow.webRunning) -and (-not ($exp.apiCmd -eq 'ISTISNA') -or -not [bool]$stNow.apiRunning) -and (-not ($exp.webCmd -eq 'ISTISNA') -or -not [bool]$stNow.webRunning)) ('sim api=' + $stNow.apiRunning + ' web=' + $stNow.webRunning)
            if ($exp.exit -eq 0) {
              Assert $asserts 'stdout: GERI DONUS TAMAMLANDI (son olcum) + KURTARMA yok' ($r.out -match 'GERI DONUS TAMAMLANDI \(son olcum' -and $null -eq $ev.recovery -and $r.out -notmatch '(?m)^KURTARMA: ') ''
              Assert $asserts '(R03-d) takas oncesi yeniden olcum iki servis KAPALI + takas sonu iki servis KAPALI (0 icin sart)' ([string]$ev.preSwap.api.state -ceq 'KAPALI' -and [string]$ev.preSwap.web.state -ceq 'KAPALI' -and [bool]$ev.swapEnd.ok -and [bool]$ev.health.swapEnd.ok) ('preSwap api=' + $ev.preSwap.api.state + ' web=' + $ev.preSwap.web.state + ' swapEnd=' + $ev.swapEnd.ok)
            } else {
              Assert $asserts 'stdout: basari iddiasi YOK (GERI DONUS TAMAMLANDI yok; SERVISLER baslatildi yok) + GERI DONUS TAMAMLANMADI + KURTARMA' ($r.out -notmatch 'GERI DONUS TAMAMLANDI \(' -and $r.out -notmatch 'SERVISLER baslatildi' -and $recT -notmatch 'baslatildi' -and $r.out -match 'GERI DONUS TAMAMLANMADI' -and $r.out -match '(?m)^KURTARMA: ') ''
              Assert $asserts 'kurtarma: dosyalar DOGRULANDI, B3 yeniden kosulmaz; servis basina komut + olculen sonuc satiri' ($recT -match 'dosyalar TABAN kimliginde DOGRULANDI' -and $recT -match 'B3 YENIDEN KOSULMAZ' -and $recT -match '(?m)^\s+API: baslatma komutu=' -and $recT -match '(?m)^\s+WEB: baslatma komutu=') ''
              if ($exp.swapEndBad) {
                Assert $asserts ('(R03-d) takas sonu olcumu ' + $exp.swapEndBad + ' KAPALI DEGIL -> 0 verilmedi; KURTARMA satiri: takas sirasinda baslamis olabilir, yeniden baslatma OWNER KARARI') (-not [bool]$ev.swapEnd.ok -and -not [bool]$ev.health.swapEnd.ok -and $recT -match ($exp.swapEndBad + ' takas bitiminde KAPALI olculmedi[^\r\n]*OWNER KARARI; ESCALATE') -and $r.out -match 'takas sonu KAPALI=False' -and $recT -match ('\(a\) Stop-ScheduledTask -TaskName HukukPlatform-' + $(if ($exp.swapEndBad -eq 'WEB') { 'Web' } else { 'API' }) + '[^\r\n]*\(c\) ANCAK sonra Start-ScheduledTask -TaskName HukukPlatform-' + $(if ($exp.swapEndBad -eq 'WEB') { 'Web' } else { 'API' }))) ('swapEnd=' + $ev.swapEnd.ok)
              } else {
                Assert $asserts '(R03-d) takas sonu iki servis KAPALI olculdu (13 nedeni baska)' ([bool]$ev.swapEnd.ok) ('swapEnd=' + $ev.swapEnd.ok)
              }
              if ($exp.tupleChanged) { Assert $asserts '(R03-d) uclu degisti -> 13 + KURTARMA Kapsam satiri (DEGISTI)' (-not [bool]$ev.health.tupleUnchanged -and $recT -match 'Kapsam: baslatici uclusu 1-yedek-butunluk sonrasi DEGISTI') ('tuple=' + $ev.health.tuple) }
              if ($exp.unexpected) { Assert $asserts '(R03-d) kimlik sonrasi beklenmeyen hata -> 13; olcume dayali metin (servis basina olcum nesnesi + deneme sayisi); uclu OLCULMEDI; basari iddiasi yok' ($r.out -match 'GERI DONUS TAMAMLANMADI \(beklenmeyen hata sonrasi olcum\)' -and $recT -match 'Kapsam: baslatici uclusu OLCULMEDI' -and [string]$ev.failedAt -ceq '5-baslat-web' -and $null -ne $h.api.measured -and $null -ne $h.web.measured -and [int]$h.web.attempts -ge 2 -and [string]$h.web.measured.state -ceq 'KAPALI') ('web=' + $h.web.text) }
              if ($exp.tupleUnreadable) { Assert $asserts '(R03-d) uclu OKUNAMADI -> 13 + KURTARMA Kapsam OKUNAMADI satiri' (-not [bool]$ev.health.tupleUnchanged -and ([string]$ev.health.tuple).StartsWith('OLCULEMEDI') -and $recT -match 'Kapsam: baslatici uclusu OKUNAMADI') ('tuple=' + $ev.health.tuple) }
              foreach ($svc in @('api', 'web')) {
                $t = $(if ($svc -eq 'api') { 'HukukPlatform-API' } else { 'HukukPlatform-Web' }); $es = $(if ($svc -eq 'api') { $exp.apiState } else { $exp.webState })
                $rk = $(if ($svc -eq 'api') { $exp.apiRec } else { $exp.webRec })
                if ($exp.swapEndBad -eq $svc.ToUpperInvariant()) { Assert $asserts ($svc + ': takas sonu KAPALI olculmedi -> Start adimi DEGIL, owner kararli yeniden baslatma satiri') (-not $recT.Contains('YUKSELTILMIS: Start-ScheduledTask -TaskName ' + $t)) '' }
                elseif ($es -eq 'AYAKTA') { Assert $asserts ($svc + ': AYAKTA olculen servis icin KURTARMA adimi YOK') (-not $recT.Contains('TaskName ' + $t)) '' }
                elseif ($rk -eq 'DOKUNMA') { Assert $asserts ($svc + ': CALISIYOR ama sagliksiz -> surece elle DOKUNMA + ESCALATE; Stop/Start ONERISI YOK') ($recT.Contains($svc.ToUpperInvariant() + ' CALISIYOR ama saglik tutmadi - surece elle DOKUNMA') -and $recT -notmatch 'Stop-ScheduledTask' -and -not $recT.Contains('Start-ScheduledTask -TaskName ' + $t)) '' }
                elseif ($es -eq 'OLCULEMEDI') { Assert $asserts ($svc + ': OLCULEMEDI -> once olcum talimati (Start VERMEDEN once olcun)') ($recT -match ([regex]::Escape($svc.ToUpperInvariant()) + ' durumu OLCULEMEDI - Start VERMEDEN once olcun')) '' }
                else { Assert $asserts ($svc + ': KAPALI olculen servis icin Start adimi') ($recT.Contains('YUKSELTILMIS: Start-ScheduledTask -TaskName ' + $t)) '' }
              }
            }
          } else {
            # 21/22: durdurma asamasi; dosyalara DOKUNULMADI (canli = aday, generic digest assert'leri); toparlama OLCULDU
            $rc2 = $ev.stopRecovery
            Assert $asserts 'geri yukleme BASLAMADI (restoreSteps/verify yok)' ($null -eq $ev.restoreSteps -and $null -eq $ev.verify) ''
            Assert $asserts 'stops: WEB kaydi var (komut + olculen durum)' ($null -ne $ev.stops.web -and [string]$ev.stops.web.command -ne '' -and $null -ne $ev.stops.web.wait) $(if ($ev.stops.web) { [string]$ev.stops.web.text } else { 'YOK' })
            Assert $asserts ('toparlama: web=' + $exp.webAction + ' -> ' + $exp.webAfter + ' ; api=' + $exp.apiActionPrefix + '... -> ' + $exp.apiAfter) ($null -ne $rc2 -and [string]$rc2.web.action -ceq $exp.webAction -and ([string]$rc2.api.action).StartsWith($exp.apiActionPrefix) -and [string]$rc2.web.after.state -ceq $exp.webAfter -and [string]$rc2.api.after.state -ceq $exp.apiAfter) $(if ($rc2) { 'web=' + $rc2.web.action + ' -> ' + $rc2.web.after.text + ' | api=' + $rc2.api.action + ' -> ' + $rc2.api.after.text } else { 'YOK' })
            Assert $asserts 'toparlama AYAKTA iddiasi simulatorle tutarli' ((([string]$rc2.web.after.state -ne 'AYAKTA') -or [bool]$stNow.webRunning) -and (([string]$rc2.api.after.state -ne 'AYAKTA') -or [bool]$stNow.apiRunning)) ('sim api=' + $stNow.apiRunning + ' web=' + $stNow.webRunning)
            if ($null -ne $exp.recWebStoppedByRun) { Assert $asserts ('toparlama: WEB "bu kosumda durduruldu" = ' + $exp.recWebStoppedByRun + ' (once calisiyordu + durdurma denendi + simdi KAPALI; gec durma dahil)') ([bool]$rc2.web.stoppedByThisRun -eq [bool]$exp.recWebStoppedByRun) ('toparlama=' + $rc2.web.stoppedByThisRun + ' ranBefore=' + $ev.stops.web.ranBefore) }
            if ($exp.webStoppedByRun -ne $null) { Assert $asserts ('WEB "bu kosumda durduruldu" = ' + $exp.webStoppedByRun + ' (durdurmadan ONCE olcum + sonra KAPALI; komut istisnasindan bagimsiz)') ([bool]$ev.stops.web.stoppedByThisRun -eq [bool]$exp.webStoppedByRun -and [string]$ev.stops.web.before.state -ne '') ('once=' + $ev.stops.web.before.state + ' komut=' + $ev.stops.web.command + ' durdu=' + $ev.stops.web.stopped) }
            if ($exp.webNoStop) { Assert $asserts '(R03-d) kosum oncesi durumu oturmus olcumle de OLCULEMEDI kalan WEB icin durdurma komutu VERILMEDI' (([string]$ev.stops.web.command).StartsWith('VERILMEDI') -and [string]$ev.stops.web.before.state -ceq 'OLCULEMEDI' -and -not [bool]$ev.stops.web.stopped) ('komut=' + $ev.stops.web.command) }
            if ($exp.webBeforeReadErr) { Assert $asserts '(R03-d) kosum oncesi olcumde TEK okuma hatasi oturmus olcumle giderildi (once=CALISIYOR; ranBefore)' ([int]$ev.stops.web.beforeReadErrors -ge 1 -and [string]$ev.stops.web.before.state -ceq 'CALISIYOR' -and [bool]$ev.stops.web.ranBefore) ('once=' + $ev.stops.web.before.state + ' okuma hatasi=' + $ev.stops.web.beforeReadErrors + '/' + $ev.stops.web.beforeAttempts) }
            if ($exp.failedAt -eq '2-durdur-dogrula' -and $exp.exit -eq 21) { Assert $asserts '(R03-d) 21 neden metni takas oncesi yeniden olcumu gosterir (preSwap + error)' ($r.out -match 'ESCALATE: neden kanitta \(preSwap \+ error\)') '' }
            if ($exp.preSwapApi) { Assert $asserts ('(R03-d) takas oncesi yeniden olcum API=' + $exp.preSwapApi + ' -> dosyalara DOKUNULMADI (kapinin API dali)') ([string]$ev.preSwap.api.state -ceq $exp.preSwapApi -and [string]$ev.preSwap.web.state -ceq 'KAPALI' -and [string]$ev.error -match 'API takastan hemen once KAPALI olculmedi') ('preSwap api=' + $ev.preSwap.api.state + ' | error=' + $ev.error) }
            if ($exp.preSwapWeb) { Assert $asserts ('(R03-d) takas oncesi yeniden olcum WEB=' + $exp.preSwapWeb + ' -> dosyalara DOKUNULMADI (kapi metni)') ([string]$ev.preSwap.web.state -ceq $exp.preSwapWeb -and [string]$ev.error -match 'takastan hemen once KAPALI olculmedi' -and [bool]$ev.stops.api.stopped -and [bool]$ev.stops.web.stopped) ('preSwap web=' + $ev.preSwap.web.state + ' | error=' + $ev.error) }
            if ($exp.exit -eq 21) {
              $rsv = $(if ($exp.restarted) { $exp.restarted } else { 'WEB' })
              Assert $asserts ('stdout: TOPARLAMA OLCULDU + ' + $rsv + ' yeniden baslatildi (olculdu: AYAKTA) + GERI DONUS YAPILMADI/ESCALATE + KURTARMA yok') ($r.out -match 'TOPARLAMA OLCULDU \(iki servis AYAKTA\)' -and $r.out -match ($rsv + ': [^\r\n]*sonuc=yeniden baslatildi \(olculdu: AYAKTA\)') -and $r.out -match 'GERI DONUS YAPILMADI' -and $null -eq $ev.recovery) ''
            } else {
              Assert $asserts 'stdout: TOPARLAMA TAMAMLANAMADI + KURTARMA; yeniden baslatildi iddiasi YOK' ($r.out -match 'TOPARLAMA TAMAMLANAMADI' -and $r.out -match '(?m)^KURTARMA: ' -and $r.out -notmatch 'yeniden baslatildi') ''
              $okWeb = $(if ($exp.recWeb -eq 'START') { $recT.Contains('YUKSELTILMIS: Start-ScheduledTask -TaskName HukukPlatform-Web') } elseif ($exp.recWeb -eq 'OWNER-START') { $recT -match 'WEB (bu kosum DURDURMADI|kosum oncesi CALISIYOR olculmedi)[^\r\n]*OWNER KARARI - Start-ScheduledTask -TaskName HukukPlatform-Web' } else { $recT -match 'WEB durumu OLCULEMEDI - Start VERMEDEN once olcun' })
              $okApi = $(if ($exp.recApi -eq 'OWNER-START') { $recT -match 'API (bu kosum DURDURMADI|kosum oncesi CALISIYOR olculmedi)[^\r\n]*OWNER KARARI - Start-ScheduledTask -TaskName HukukPlatform-API' } else { -not $recT.Contains('TaskName HukukPlatform-API') })
              Assert $asserts ('kurtarma: WEB=' + $(if ($exp.recWeb) { $exp.recWeb } else { 'OLCULEMEDI' }) + ' API=' + $(if ($exp.recApi) { $exp.recApi } else { 'YOK' }) + '; B3 yeniden kosulmaz') ($okWeb -and $okApi -and $recT -match 'B3 YENIDEN KOSULMAZ') ''
              if ($exp.webNoStop) { Assert $asserts '(R03-d) OLCULEMEDI WEB adimi da bu kosumun durdurmadigi servis icin OWNER KARARI notunu tasir' ($recT -match 'WEB durumu OLCULEMEDI[^\r\n]*kosum oncesi CALISIYOR olculmedi[^\r\n]*OWNER KARARI: Start-ScheduledTask -TaskName HukukPlatform-Web') '' }
            }
          }
        } elseif ($exp.exit -eq 11) {
          Assert $asserts 'kurtarma talimati var (B3 komutu + tam yollar)' ($null -ne $ev.recovery -and (($ev.recovery -join ' ') -match 'r27-rollback\.ps1' ) -and (($ev.recovery -join ' ') -match '-BackupApiDir')) (($ev.recovery -join ' | ').Substring(0, [Math]::Min(160, ($ev.recovery -join ' | ').Length)))
          Assert $asserts 'verify.mismatches dolu' (@($ev.verify.mismatches).Count -ge 1) (($ev.verify.mismatches -join ' ; '))
          Assert $asserts 'rollback.servicesStarted=false' (-not [bool]$ev.rollback.servicesStarted) ('servicesStarted=' + $ev.rollback.servicesStarted)
          Assert $asserts 'stdout KURTARMA satiri' ($r.out -match '(?m)^KURTARMA: ') ''
          if ($exp.unreadable) {
            Assert $asserts 'verify OKUNAMADI (kalici okuma hatasi: agac+paket+web)' (([string]$ev.verify.apiTree).StartsWith('OKUNAMADI') -and ([string]$ev.verify.pkg).StartsWith('OKUNAMADI') -and ([string]$ev.verify.webTree).StartsWith('OKUNAMADI')) ('apiTree=' + ([string]$ev.verify.apiTree).Substring(0, [Math]::Min(40, ([string]$ev.verify.apiTree).Length)))
            Assert $asserts 'faultLog: kalici fault 4-kimlik + R-dogrula (>=2 kayit)' (@($ev.testMode.faultLog).Count -ge 2) (($ev.testMode.faultLog -join ' ; '))
            Assert $asserts 'restoreSteps hepsi TAMAM (dosyalar geri yuklendi, yalniz OLCUM basarisiz)' (@($ev.restoreSteps.PSObject.Properties | Where-Object { -not ([string]$_.Value).StartsWith('TAMAM') }).Count -eq 0) ''
          }
        } elseif ($exp.exit -eq 10) {
          Assert $asserts 'verify.ok=true (geri yuklenen kimlik dogrulandi)' ([bool]$ev.verify.ok) ('mismatches=' + @($ev.verify.mismatches).Count)
          Assert $asserts 'rollback.servicesStarted=true (yalniz dogrulama sonrasi)' ([bool]$ev.rollback.servicesStarted) ''
          Assert $asserts 'rollback.postStart.ok=true (B3 saglik kumesi: pid==1, 401x3, buildManifest, kok, uclu)' ([bool]$ev.rollback.postStart.ok -and [bool]$ev.rollback.postStart.api.health.ok -and [bool]$ev.rollback.postStart.web.health.ok) ('api=' + $ev.rollback.postStart.api.health.text + ' web=' + $ev.rollback.postStart.web.health.text + ' tuple=' + $ev.rollback.postStart.tupleUnchanged)
          Assert $asserts 'restoreSteps hepsi TAMAM' (@($ev.restoreSteps.PSObject.Properties | Where-Object { -not ([string]$_.Value).StartsWith('TAMAM') }).Count -eq 0) (($ev.restoreSteps.PSObject.Properties | ForEach-Object { $_.Name + '=' + $_.Value }) -join ' ; ')
          if ($sc -eq 'service-start-fail' -or $sc -eq 'identity-read-error') { }
        } elseif ($exp.exit -eq 21 -or $exp.exit -eq 22) {
          # takas ONCESI durdurma hatasi: dosya + gercek simulator servis durumu + cikis kodu + kanit/konsol ifadesi BIRLIKTE
          $stNow = Get-Content -Raw -LiteralPath $T_STATE | ConvertFrom-Json
          Assert $asserts 'rollback yok, restoreSteps yok (dosya takasi BASLAMADI)' ($null -eq $ev.rollback -and $null -eq $ev.restoreSteps) ''
          Assert $asserts ('error: ' + $exp.failSvc + ' durdurulamadi + DOSYA TAKASI BASLAMADI') ([string]$ev.error -match ($exp.failSvc + ' durdurulamadi') -and [string]$ev.error -match 'DOSYA TAKASI BASLAMADI') ([string]$ev.error)
          Assert $asserts 'aday API/WEB sagligi olculmedi (health.api / health.web yok)' ($null -eq $ev.health.api -and $null -eq $ev.health.web) ''
          Assert $asserts ('faultLog: ' + $exp.faultMark) ((($ev.testMode.faultLog) -join ' ; ').Contains($exp.faultMark)) (($ev.testMode.faultLog) -join ' ; ')
          $sw = $ev.stops.web; $sa = $ev.stops.api
          if ($exp.failSvc -eq 'WEB') {
            Assert $asserts 'stops: WEB durdurulamadi kaydi; API durdurma DENENMEDI (kayit yok)' ($null -ne $sw -and -not [bool]$sw.stopped -and $null -eq $sa) ('web=' + $(if ($sw) { $sw.text } else { 'YOK' }) + ' | api=' + $(if ($sa) { $sa.text } else { 'YOK' }))
          } else {
            Assert $asserts 'stops: WEB DURDU (olculen KAPALI) ve API durdurulamadi (komut ISTISNA, olculen CALISIYOR) AYRI kayitli' ($null -ne $sw -and [bool]$sw.stopped -and [string]$sw.measured.state -ceq 'KAPALI' -and $null -ne $sa -and -not [bool]$sa.stopped -and [string]$sa.command -ceq 'ISTISNA' -and [string]$sa.measured.state -ceq 'CALISIYOR') ('web=' + $(if ($sw) { $sw.text } else { 'YOK' }) + ' | api=' + $(if ($sa) { $sa.text } else { 'YOK' }))
          }
          $rcv = $ev.stopRecovery
          Assert $asserts 'toparlama: canli dosya kimligi OLCULDU ve taban (paket/BUILD_ID/cfg)' ($null -ne $rcv -and [bool]$rcv.filesOk -and [bool]$rcv.files.pkg -and [bool]$rcv.files.buildId -and [bool]$rcv.files.cfg) ''
          Assert $asserts ('toparlama eylemleri: api=' + $exp.apiAction + ' | web=' + $exp.webAction) ([string]$rcv.api.action -ceq $exp.apiAction -and [string]$rcv.web.action -ceq $exp.webAction) ('api=' + $rcv.api.action + ' | web=' + $rcv.web.action)
          Assert $asserts 'toparlama: servis bazinda saglik sonucu gercek simulator durumuyla ESIT (Start komutu ayakta sayilmaz)' ([bool]$rcv.api.health.ok -eq [bool]$stNow.apiRunning -and [bool]$rcv.web.health.ok -eq [bool]$stNow.webRunning) ('api saglik=' + $rcv.api.health.ok + '/sim ' + $stNow.apiRunning + ' web saglik=' + $rcv.web.health.ok + '/sim ' + $stNow.webRunning)
          Assert $asserts ('toparlama.ok=' + ($exp.exit -eq 21) + ' (verdict/cikis ile tutarli)') ([bool]$rcv.ok -eq ($exp.exit -eq 21)) ('ok=' + $rcv.ok)
          $expWebSt = $(if ($exp.webMeasured) { $exp.webMeasured } elseif ([bool]$stNow.webRunning) { 'CALISIYOR' } else { 'KAPALI' })
          Assert $asserts ('kanit serviceState: son olcum simulatorle ESIT (api/web; web=' + $expWebSt + ')') (([string]$ev.serviceState.api.state -ceq $(if ([bool]$stNow.apiRunning) { 'CALISIYOR' } else { 'KAPALI' })) -and ([string]$ev.serviceState.web.state -ceq $expWebSt)) ('api=' + $ev.serviceState.api.state + ' web=' + $ev.serviceState.web.state)
          if ($exp.webUnreadable) {
            Assert $asserts 'olcum hatasi KAPALI SAYILMADI: WEB komut TAMAM + bekleme false + olculen OLCULEMEDI (hata metni kayitta) -> DURDURULAMADI' ([string]$sw.command -ceq 'TAMAM' -and $sw.waitStopped -eq $false -and [string]$sw.measured.state -ceq 'OLCULEMEDI' -and [string]$sw.measured.error -ne '' -and -not [bool]$sw.stopped) ([string]$sw.text)
            Assert $asserts 'toparlama: WEB once OLCULEMEDI -> Start YOK; simulatorde WEB gercekte kapali (olcumsuz basari iddiasi yok)' ([string]$rcv.web.before.state -ceq 'OLCULEMEDI' -and -not [bool]$rcv.web.health.ok -and -not [bool]$stNow.webRunning) ('once=' + $rcv.web.before.state + ' saglik=' + $rcv.web.health.ok)
          }
          Assert $asserts 'konsol: olculmemis yeniden baslatma iddiasi YOK' ($r.out -notmatch 'yeniden baslatildi') ''
          Assert $asserts ('stdout: ' + $exp.verdict + ' sonucu ve cikis ' + $exp.exit) ($r.out -match ('=== SONUC: ' + [regex]::Escape($exp.verdict) + ' \(cikis ' + $exp.exit + '\)')) ''
          if ($exp.exit -eq 21) {
            Assert $asserts 'stdout: TOPARLAMA PASS; kurtarma talimati YOK (gerekmez)' ($r.out -match 'TOPARLAMA PASS' -and $null -eq $ev.recovery -and $r.out -notmatch '(?m)^KURTARMA: ') ''
          } else {
            $recT = (@($ev.recovery) -join "`n")
            Assert $asserts 'stdout: TOPARLAMA TAMAMLANAMADI + KURTARMA satirlari; TOPARLAMA PASS iddiasi YOK' ($r.out -match 'TOPARLAMA TAMAMLANAMADI' -and $r.out -match '(?m)^KURTARMA: ' -and $r.out -notmatch 'TOPARLAMA PASS') ''
            Assert $asserts 'kurtarma: DOSYA TAKASI BASLAMADI; B3 GEREKMEZ (r27-rollback.ps1 komutu YOK)' ($recT -match 'DOSYA TAKASI BASLAMADI' -and $recT -notmatch 'r27-rollback\.ps1') ''
            if ($exp.recStartWeb -eq $false) {
              Assert $asserts 'kurtarma: OLCULEMEDI WEB icin Start YOK, once olcum talimati; calisan API icin Start YOK' (-not $recT.Contains('Start-ScheduledTask -TaskName HukukPlatform-Web') -and -not $recT.Contains('Start-ScheduledTask -TaskName HukukPlatform-API') -and $recT -match 'KARISIK/OLCULEMEDI olan servis\(ler\) \[web:HukukPlatform-Web\]') ''
            } else {
              Assert $asserts 'kurtarma: YALNIZ KAPALI olculen WEB icin Start; calisan API icin Start YOK' ($recT.Contains('Start-ScheduledTask -TaskName HukukPlatform-Web') -and -not $recT.Contains('Start-ScheduledTask -TaskName HukukPlatform-API')) ''
            }
            Assert $asserts 'kurtarma: servis bazinda durum satirlari (API/WEB)' ($recT -match '(?m)^\s+API: durdurma=' -and $recT -match '(?m)^\s+WEB: durdurma=') ''
          }
        } elseif ($exp.exit -eq 12) {
          # otomatik geri donuste durdurma basarisiz: kapanmamis surec uzerinde geri yukleme YOK; servis bazinda durum + kalan adimlar
          $rb = $ev.rollback; $sw = $rb.stops.web; $sa = $rb.stops.api
          $rbCmd = $(if ($exp.rbWebCommand) { $exp.rbWebCommand } else { 'ISTISNA' }); $rbSt = $(if ($exp.rbWebState) { $exp.rbWebState } else { 'CALISIYOR' }); $rbMark = $(if ($exp.faultMark) { $exp.faultMark } else { 'R-durdur: web komut istisnasi' })
          Assert $asserts ('R-durdur: WEB komut ' + $rbCmd + ' + olculen ' + $rbSt + ' (durdurulamadi; olcum hatasi KAPALI sayilmaz)') ($null -ne $sw -and [string]$sw.command -ceq $rbCmd -and -not [bool]$sw.stopped -and [string]$sw.measured.state -ceq $rbSt) $(if ($sw) { $sw.text } else { 'YOK' })
          Assert $asserts 'R-durdur: WEB istisnasina ragmen API durdurma DENENDI ve AYRI kayitli (DURDU, olculen KAPALI)' ($null -ne $sa -and [string]$sa.command -ceq 'TAMAM' -and [bool]$sa.stopped -and [string]$sa.measured.state -ceq 'KAPALI') $(if ($sa) { $sa.text } else { 'YOK' })
          Assert $asserts 'geri yukleme YOK: stoppedBeforeRestore=false, verify yok, servicesStarted=false' (($rb.stoppedBeforeRestore -eq $false) -and $null -eq $ev.verify -and -not [bool]$rb.servicesStarted) ''
          Assert $asserts 'restoreSteps: durdur BASARISIZ + dosya adimlarinin hepsi KALAN' (([string]$ev.restoreSteps.durdur).StartsWith('BASARISIZ') -and @($ev.restoreSteps.PSObject.Properties | Where-Object { $_.Name -ne 'durdur' -and [string]$_.Value -cne 'KALAN' }).Count -eq 0) (($ev.restoreSteps.PSObject.Properties | ForEach-Object { $_.Name + '=' + $_.Value }) -join ' ; ')
          $recT = (@($ev.recovery) -join "`n")
          Assert $asserts 'kurtarma: servis bazinda satirlar + YALNIZ durdurulamayan WEB icin elle durdurma (duran API icin yok) + B3 tam yollarla' ($recT -match 'GERI ALMADA DURDURMA BASARISIZ' -and $recT -match ('(?m)^\s+WEB: komut=' + $rbCmd) -and $recT -match '(?m)^\s+API: komut=TAMAM' -and $recT.Contains('Stop-ScheduledTask -TaskName HukukPlatform-Web') -and -not $recT.Contains('Stop-ScheduledTask -TaskName HukukPlatform-API') -and $recT -match 'r27-rollback\.ps1' -and $recT -match '-BackupApiDir') ''
          Assert $asserts ('faultLog: ' + $rbMark) ((($ev.testMode.faultLog) -join ' ; ').Contains($rbMark)) (($ev.testMode.faultLog) -join ' ; ')
          Assert $asserts 'stdout: KURTARMA satiri + SONUC 12' ($r.out -match '(?m)^KURTARMA: ' -and $r.out -match '=== SONUC: ROLLBACK-ENGELLENDI \(cikis 12\)') ''
        } elseif ($exp.exit -eq 13) {
          # eski kimlik DOGRULANDIKTAN sonra baslatma istisnasi: dosya durumu (verify) ile servis durumu (postStart) ayri
          $ps = $ev.rollback.postStart
          Assert $asserts 'dosyalar DOGRULANDI (verify.ok) + restoreSteps hepsi TAMAM' ([bool]$ev.verify.ok -and @($ev.restoreSteps.PSObject.Properties | Where-Object { -not ([string]$_.Value).StartsWith('TAMAM') }).Count -eq 0) ''
          Assert $asserts 'servicesStarted=true (baslatma GIRISIMI) ama postStart.ok=false (olcumle ayakta degil)' ([bool]$ev.rollback.servicesStarted -and $null -ne $ps -and -not [bool]$ps.ok) ''
          Assert $asserts 'postStart.api: komut ISTISNA + saglik FAIL + olculen KAPALI' ([string]$ps.api.startCommand -ceq 'ISTISNA' -and -not [bool]$ps.api.health.ok -and [string]$ps.api.measured.state -ceq 'KAPALI') ([string]$ps.api.health.text)
          Assert $asserts 'postStart.web: API istisnasina ragmen BASLATILDI + saglik PASS + olculen CALISIYOR' ([string]$ps.web.startCommand -ceq 'TAMAM' -and [bool]$ps.web.health.ok -and [string]$ps.web.measured.state -ceq 'CALISIYOR') ([string]$ps.web.health.text)
          $recT = (@($ev.recovery) -join "`n")
          Assert $asserts 'kurtarma: dosyalar dogrulandi (B3 YOK); YALNIZ KAPALI API icin Start; calisan WEB icin Start YOK' ($recT -match 'DOSYALAR TABAN kimliginde DOGRULANDI' -and $recT -notmatch 'r27-rollback\.ps1' -and $recT.Contains('Start-ScheduledTask -TaskName HukukPlatform-API') -and -not $recT.Contains('Start-ScheduledTask -TaskName HukukPlatform-Web')) ''
          Assert $asserts 'faultLog: R-baslat api komut istisnasi' ((($ev.testMode.faultLog) -join ' ; ').Contains('R-baslat: api komut istisnasi')) (($ev.testMode.faultLog) -join ' ; ')
          Assert $asserts 'stdout: KURTARMA + SONUC 13; AYAKTA iddiasi YOK' ($r.out -match '(?m)^KURTARMA: ' -and $r.out -match '=== SONUC: ROLLBACK-OK-ESKI-BASLAMADI \(cikis 13\)' -and $r.out -notmatch 'AYAKTA \(olculdu\)') ''
        } elseif ($sc -eq 'rollback-script') {
          Assert $asserts 'verify.ok=true' ([bool]$ev.verify.ok) ('mismatches=' + @($ev.verify.mismatches).Count)
          Assert $asserts 'restoreSteps hepsi TAMAM' (@($ev.restoreSteps.PSObject.Properties | Where-Object { -not ([string]$_.Value).StartsWith('TAMAM') }).Count -eq 0) ''
        } else {
          Assert $asserts 'rollback yok' ($null -eq $ev.rollback) ''
          Assert $asserts 'saglik api/web/kapsam ok' ([bool]$ev.health.api.ok -and [bool]$ev.health.web.ok -and [bool]$ev.health.scope.ok) ''
          Assert $asserts 'health.pathBudget.ok (yol butcesi kanitta)' ([bool]$ev.health.pathBudget.ok) ('maxRelApi=' + $ev.health.pathBudget.maxRelApi + ' maxRelWeb=' + $ev.health.pathBudget.maxRelWeb)
        }
        if ($sc -eq 'service-start-fail') { Assert $asserts 'WEB aday ile HIC baslatilmadi (failedAt 5-baslat-api; health.web yok)' ($null -eq $ev.health.web) '' }
        if ($sc -eq 'happy-path') { $lastHappyEvidence = $ev }
      }
      $d = Get-LiveDigests
      if ($exp.api.StartsWith('NOT:')) { Assert $asserts 'canli API digest taban DEGIL (bozulma korundu, dogrulama yakaladi)' ($d.api -cne $exp.api.Substring(4)) ('olculen ' + $d.api.Substring(0, 16)) }
      else { Assert $asserts 'canli API agac digest' ($d.api -ceq $exp.api) ('beklenen ' + $exp.api.Substring(0, 16) + ' olculen ' + $d.api.Substring(0, 16)) }
      Assert $asserts 'canli WEB .next digest' ($d.web -ceq $exp.web) ('beklenen ' + $exp.web.Substring(0, 16) + ' olculen ' + $d.web.Substring(0, [Math]::Min(16, $d.web.Length)))
      Assert $asserts 'BUILD_ID' ($d.bid -ceq $exp.bid) ('beklenen ' + $exp.bid + ' olculen ' + $d.bid)
      Assert $asserts 'next.config.js' ($d.cfg -ceq $CFG_LIVE) $d.cfg.Substring(0, 16)
      Assert $asserts ('eklenen 6 dosya canlida ' + $(if ($exp.addedPresent) { 'VAR' } else { 'YOK' })) ($(if ($exp.addedPresent) { $d.addedPresent.Count -eq 6 } else { $d.addedPresent.Count -eq 0 })) ('mevcut=' + $d.addedPresent.Count)
      $st = Get-Content -Raw -LiteralPath $T_STATE | ConvertFrom-Json
      Copy-Item -LiteralPath $T_STATE -Destination (Join-Path $scDir 'sim-state.json') -Force
      Assert $asserts ('simulator API ' + $(if ($exp.apiUp) { 'AYAKTA' } else { 'DURMUS' })) ([bool]$st.apiRunning -eq $exp.apiUp) ('apiRunning=' + $st.apiRunning + ' stopCalls=' + $st.stopCalls + ' startCalls=' + $st.startCalls)
      Assert $asserts ('simulator WEB ' + $(if ($exp.webUp) { 'AYAKTA' } else { 'DURMUS' })) ([bool]$st.webRunning -eq $exp.webUp) ('webRunning=' + $st.webRunning)
      if ($exp.exit -ne 0) {
        $q = @(Get-ChildItem -LiteralPath $T_EVID -Directory -Filter 'added-quarantine-*' -ErrorAction SilentlyContinue)
        $qFiles = 0; foreach ($qd in $q) { $qFiles += @(Get-ChildItem -LiteralPath $qd.FullName -Recurse -File -Force).Count }
        if ($exp.exit -eq 21 -or $exp.exit -eq 22) { Assert $asserts ('karantina dizini YOK (dosyalara dokunulmadi); simulator: ' + $exp.stopCalls + ' durdurma + ' + $exp.startCalls + ' baslatma istegi (yalniz KAPALI olculene Start)') ($q.Count -eq 0 -and [int]$st.stopCalls -eq $exp.stopCalls -and [int]$st.startCalls -eq $exp.startCalls) ('karantina=' + $q.Count + ' stop=' + $st.stopCalls + ' start=' + $st.startCalls) }
        elseif ($exp.exit -eq 12) { Assert $asserts 'karantina dizini YOK (kapanmamis surec uzerinde geri yukleme yapilmadi); simulator: 4 durdurma (2-durdur x2 + R-durdur x2) + 2 baslatma (aday)' ($q.Count -eq 0 -and [int]$st.stopCalls -eq 4 -and [int]$st.startCalls -eq 2) ('karantina=' + $q.Count + ' stop=' + $st.stopCalls + ' start=' + $st.startCalls) }
        else { Assert $asserts 'karantina dizini var; silme yok' ($q.Count -ge 1) ('dizin=' + $q.Count + ' dosya=' + $qFiles) }
        if ($exp.exit -eq 13) { $es13 = $(if ($exp.b3) { [int]$exp.startCalls } else { 2 }); Assert $asserts ('simulator: 2 durdurma + ' + $es13 + ' baslatma istegi' + $(if ($exp.b3) { ' (B3 EXPECT)' } else { ' (R-baslat: API istisna + WEB)' })) ([int]$st.stopCalls -eq 2 -and [int]$st.startCalls -eq $es13) ('stop=' + $st.stopCalls + ' start=' + $st.startCalls) }
      }
      $leftover = @(Get-ChildItem -LiteralPath $T_LIVE_WEB -Directory -Force | Where-Object { $_.Name -ne '.next' })
      Say ('  live\web kalinti dizinleri (silme yok): ' + $(if ($leftover.Count) { ($leftover.Name -join ', ') } else { '(yok)' }))
      # canli koke/hicbir canli yola dokunulmadigi: kanit JSON'undaki tum yollar TestRoot altinda
      if ($ev) {
        $paths = @($ev.api.backup, $ev.web.backup, $ev.quarantineDir, $ev.web.preDirInPlace, $ev.backupApiDir, $ev.backupWebDir) | Where-Object { $_ }
        $bad = @($paths | Where-Object { $_.StartsWith($LIVE_ROOT_CANON, [StringComparison]::OrdinalIgnoreCase) -or $_.StartsWith($LIVE_EVID_DIR, [StringComparison]::OrdinalIgnoreCase) })
        Assert $asserts 'kanit yollari canli/gercek kanit kokune isaret etmiyor' ($bad.Count -eq 0) ($paths -join ' | ')
      }
    }
  } catch {
    Assert $asserts 'harness istisnasi' $false $_.Exception.Message
  }
  $pass = (@($asserts | Where-Object { -not $_.ok }).Count -eq 0) -and ($asserts.Count -ge 1)
  $results.Add([ordered]@{ scenario = $sc; kind = $(if ($isGate) { 'gate' } else { 'functional' }); result = $(if ($pass) { 'PASS' } else { 'FAIL' })
      expectedExit = $(if ($exp.noProcess) { $null } elseif ($isGate) { 20 } else { $exp.exit }); measuredExit = $(if ($r) { $r.rc } else { $null }); expectedVerdict = $(if ($isGate) { 'KAPIDA-DURDU / kapi' } else { $exp.verdict }); measuredVerdict = $(if ($ev) { $ev.verdict } else { $null })
      failedAt = $(if ($ev) { $ev.failedAt } else { $null }); stage = $(if ($ev) { $ev.stage } else { $null })
      evidence = $evCopy; evidenceTestRoot = $(if ($evPath) { $evPath.path } else { $null }); evidenceSha256 = $(if ($evPath) { $evPath.sha } else { $null })
      stdout = (Join-Path $scDir 'stdout.txt'); durationSec = [int]((Get-Date) - $t0).TotalSeconds; assertCount = $asserts.Count; asserts = $asserts.ToArray() })   # WinPS 5.1: hashtable ogeli List[object] icin @() sozlukte 'argument types do not match' verir; ToArray() calisir (olculdu)
  Say ('================ SENARYO ' + $sc + ' => ' + $(if ($pass) { 'PASS' } else { 'FAIL' }) + ' (' + [int]((Get-Date) - $t0).TotalSeconds + ' sn; ' + $asserts.Count + ' assert)')
}
$allPass = (@($results | Where-Object { $_.result -ne 'PASS' }).Count -eq 0) -and ($results.Count -eq $Scenarios.Count)
$summary = [ordered]@{
  record = 'R27-FAULT-PROVA-SUMMARY'; tsUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); runTs = $RUN_TS; result = $(if ($allPass) { 'PASS' } else { 'FAIL' })
  scenariosRun = $results.Count; scenariosPass = @($results | Where-Object { $_.result -eq 'PASS' }).Count
  childShell = $ChildShell; scripts = [ordered]@{ release = $RELEASE; releaseSha256 = (Sha $RELEASE); rollback = $ROLLBACK; rollbackSha256 = (Sha $ROLLBACK); harness = $PSCommandPath; harnessSha256 = (Sha $PSCommandPath) }
  pristine = [ordered]@{ dir = $PristineDir; api = $pApi; web = $pWeb; cfg = $pCfg }; candidate = [ordered]@{ dir = $CandApps; api = $cApi; web = $cWeb; cfg = $cCfg }
  pathBudget = [ordered]@{ limit = 260; maxRelApi = $maxRelApi; maxRelWeb = $maxRelWeb; items = $budget; ok = $budgetOk }
  testRoot = $TESTROOT; runEvidenceDir = $RUN_EVID; gateRoot = $GATE_ROOT; liveTouched = $false
  note = 'Canliya dokunulmadi: tum yollar TestRoot altinda, gorev/dinleyici/Http/uclu/ACL/sahte-surec simulatorle. ACL kalitim kontrolu test modunda OLCULMEZ (canli SelfTest olcer). Sahte-surec kapisi TEST modunda sentetik surec listesiyle (sim rogueProcs) ve enjekte saglayiciyla olculur; CANLI surec listesi okumasi (Win32_Process), SelfTest kosumu ve yukseltilmis pencere yalniz canli SelfTest kontrolleriyle olculur. Kapi zinciri butunlugu AST ile pinlenir; olcumlerin disinda kalan KASITLI duzenlemeyi kanitlamaz (savunma: yayin betigi sha pini + inceleme). Kapi senaryolari canli yol cozumlemesinden once ya da TestRoot altinda durur; canli kanit dizinine dosya eklenmedigi her kapi senaryosunda olculur.'
  scenarios = $results.ToArray(); log = @($hlog)
}
$sf = Join-Path $EVID 'fault-prova-summary.json'; $sfRun = Join-Path $RUN_EVID 'fault-prova-summary.json'
$sjson = ($summary | ConvertTo-Json -Depth 8)
[IO.File]::WriteAllText($sf, $sjson, (New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText($sfRun, $sjson, (New-Object Text.UTF8Encoding($false)))
Write-Host ('OZET: ' + $sf + ' sha256=' + (Sha $sf) + ' (kalici kopya: ' + $sfRun + ')')
foreach ($x in $results) { Write-Host ('  ' + $x.result + '  ' + $x.scenario + '  cikis ' + $x.measuredExit + '/' + $x.expectedExit + '  ' + $x.measuredVerdict + '  failedAt=' + $x.failedAt) }
Write-Host ('=== HARNESS SONUC: ' + $(if ($allPass) { 'PASS' } else { 'FAIL' }) + ' (' + $summary.scenariosPass + '/' + $results.Count + ')')
if (-not $allPass) { exit 2 }
exit 0
