# ═══════════ EXTACC D-6 OWNER BLOĞU ÖZ-TESTİ (R01) — CANLIYA DOKUNMAZ ═══════════
# NE     : d6-owner-live-block.ps1 içindeki GERÇEK fonksiyonları (Invoke-RunMode, Invoke-RecoverMode, Invoke-Node, Complete-NodeRc,
#          Resolve-NodeExe, Confirm-LiveDataProcessing, Read-ResidueDecision, Write-OwnerDeclaration, Invoke-QrTestMode ...) AST ile yükler ve koşar.
#          Dosyanın AKIŞ bölümü (kapılar, canlı yollar) HİÇ ÇALIŞMAZ.
# YÖNLENDİRME: yalnız yol değişkenleri geçici dizine alınır ve etkileşim noktaları teste bağlanır: Read-GoRef (test GO), Read-Answer (kuyruktan
#          yanıt), Invoke-RepoGit (git grep "bulunmadı"), Assert-LocalConsole (test sürecinin çıktısı yönlendirildiği için no-op; GERÇEK hali
#          ayrıca K-1'de ölçülür), Clear-OwnerScreen (no-op). Node GERÇEKTİR: PATH'teki node + geçici betik ya da BAŞLATILAMAYAN dosya.
# R02    : G-1..G-4 + O-6..O-8 (2026-10-01) — blokta kapsamı adlandırılmamış "hiçbir … dosya/log/kanıt … yazılmaz" türü mutlak iddia yok
#          (yorumlar dahil) ve geçici portal parolası bloğun kanıt dizininde yok (G-1); owner'a GÖSTERİLEN onay metni telefon yüklemesinin
#          günlük (dosya adı maskesiz) + kova etkisini, kapanışta kalan boş kova dizinini ve çıkış 5/6'nın Recover yetkisi olmadığını yazar
#          (G-2); Recover çıkış 6 yeni bir Recover yetkisi değildir (G-3); Run çıkış 5/6 metni Run'ın kendi kapanışını Recover'dan ayırır,
#          blok tek node çağrısı yapar, çıkış 0'da koşum sonu metninde Recover yok (G-4); kapanış "DOĞRULANDI" metni kanıttaki ölçüt
#          verdict'lerinden kurulur — PASS olmayan parça "ÖLÇÜLMEDİ" / "FAIL" yazılır (O-6..O-8). Eski blok baytlarında bu 7 test FAIL verir.
# R02 ikinci tur (inceleme düzeltmeleri; yalnız yeni METNİ ölçen kalemler): G-3 yeniden yazıldı — Recover çıkış 6 metni İKİNCİ bir Recover
#          için yol TANIMLAMAZ ("bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir"; "YENİ ve AYRI onayla / sonraki Recover / BİR KEZ" yok);
#          G-5 onay metni kapsamı (iki sentetik tenant: kaynaktan + U-ISO yalnız sayı; bildirim: statik ölçüt T-1) ve kova dizini TEK adla
#          (portal-documents/<sentetik tenant>/); O-9 kapanış satırı "bu satırın devamında" + parçalar aynı satırda + satır rengi notu.
#          R02 ilk tur blok baytlarında (5AEF3893…) G-3, G-5, O-9 FAIL verir (negatif kontrol).
# R03    : PIN-1 bloğun PkgPins değerleri bu checkout'taki 9 dosyanın GERÇEK sha256'sına ve $ExpPackage yeniden hesaplanan paket digest'ine
#          eşit (koşucu değişince pin + digest birlikte güncellenmezse FAIL); O-10 Recover bitiş satırı 3'ü "yeni giriş reddi" diye iddia
#          etmez (P6-C3L/D satırlarına yönlendirir) ve 6'da kalıntının DOĞRULANDI / ÖLÇÜLEMEDİ ayrımını kanıttaki P6-C-DOC + docResidue.durum'a
#          bağlar. R02 ikinci tur blok baytlarında (082527EE…) PIN-1 ve O-10 FAIL verir (negatif kontrol).
# R03-b  : O-11 Run'daki BELGE KALINTISI satırı kanıttaki P6-C-DOC verdict'ine + docResidue.durum'a bağlı: FAIL → "DOĞRULANDI (… DOGRULANMIS_KALINTI)",
#          ÖLÇÜLEMEYEN + ERISIM_OLCULEMEDI → "ÖLÇÜLEMEDİ (…)" + kova okunabilirliği, PASS → satır yok; eski "kalmış olabilir (P6-C-DOC PASS değil)"
#          metni gösterilen metinde ve kaynakta YOK. R03 blok baytlarında (76018BA7…) O-11 ve PIN-1 (koşucu pini) FAIL verir (negatif kontrol).
# R03-c  : (owner talimatı: kapanış / Recover doğruluğu) O-12 Recover bitiş satırı her kodu yalnız ölçülenle açıklar (1 ve 2 dahil) ve mevcut oturum
#          reddinin Recover'da HER ZAMAN ölçülemediğini kodlardan ÖNCE yazar; O-13 Run çıkış 5/6 metni Recover komutunu yalnız makbuz dosyası okuma
#          kapısını geçiyorsa önerir (yok / bozuk → kanıttaki receipt yolu; kanıtta da yoksa SOMUT ENGEL); O-5 değişti ("hiç açılmamıştı" çıkarımı yok).
#          Sahte koşucu Run'da kanıt dizinine makbuz yazar (EXSTUB_NO_RECEIPT / EXSTUB_EV_RECEIPT ile değiştirilir). R03-b blok baytlarında
#          (7B43591A…) O-5, O-12, O-13 ve PIN-1 (koşucu pini) FAIL verir (negatif kontrol).
# R03-d  : (R03-c bağımsız doğrulaması) O-12 genişledi — "1 + kanıt yok" ve "kanıttaki exitCode ≠ süreç kodu" varyantlarında Recover bitiş satırı kırmızı
#          "KAPANIŞ DOĞRULANMADI — …" der ve kod açıklamalarını (0/1/2/3) YAZMAZ (M2); O-14 Recover 3 metni ölçülenle (m3); O-13 değişti — makbuz yok /
#          bozuk / BAYAT (yeni durum, m7) iken diskteki dosya önerilmez, kanıttaki makbuzJson'dan yeni dosya yazan TEK komut somut yollarla gösterilir (m4);
#          O-15 o TEK komut Windows PowerShell 5.1 VE PowerShell 7'de koşulur, üretilen dosya bloğun Recover okuma kapısından ve GERÇEK koşucunun
#          readReceiptForRecover kapısından geçer (m4 kapı kalemi); O-16 ürün bulgusu ADAYI "ADAYIDIR" diye gösterilir (M1). Sahte koşucu kanıta record +
#          exitCode + recovery.makbuzJson yazar (EXSTUB_STALE / EXSTUB_EV_EXITCODE / EXSTUB_SV / EXSTUB_EXPECT_COPY / EXSTUB_REAL_RUNNER).
# R03-e  : (R03-d iki bağımsız doğrulaması, B1) O-17 — kanıttaki portalClose.acikErisim (açık portal erişimi, "(Recover kapatabilir)") Run sonu ekranında ürün
#          bulgusu satırından AYRI "PORTAL ERİŞİMİ: …" satırında gösterilir; bulgu satırı onu içermez. Sahte koşucu EXSTUB_ACIK ile acikErisim yazar. PIN-1 yeni
#          koşucu pini + $ExpPackage ile. R03-d blok baytlarında (60b2a84d aynası) yalnız O-17 FAIL verir (satır gösterilmez; iki kabukta ölçüldü) — PIN-1
#          aynada eski koşucu + eski pinle tutarlı olduğundan PASS.
# R03-f  : (R03-e iki bağımsız doğrulamasının MINOR bulguları; blokta YALNIZ yorum + pin) O-18 — blok kaynağında (yorumlar dahil) Recover'ın açık erişimi
#          kapatabileceğine dair kesin ifade YOK (F2) ve R03-d'den kalma bayat "P6-C2 PASS + P6-C5 FAIL iken sürüm sınıflaması" yorumu YOK (F6); ADAY yorumu
#          sessionClass200 karar tablosunu adlandırır. PIN-1 yeni koşucu pini + $ExpPackage ile. R03-e blok baytlarında (4b75bbe7 aynası) O-18 FAIL verir.
# R04    : (owner kararı 2026-10-04, madde 5 + 6 — "R04-recover-girdi") YENİ RG-1..RG-10: `-Mode Recover -RunEvidenceDir` — makbuzu blok, AYRI Recover onayından
#          (modu ayrıca başlatma + mevcut kalıntı kararı) SONRA Run kanıtındaki recovery.makbuzJson alanından Run kanıt dizininin DIŞINA (kardeş dizin) yazar ve
#          Recover başlamadan doğrular: RG-1 geçerli çıkarma (baytlar = sahte koşucunun makbuz metni, BOM yok, LF, ek satır sonu yok, kayıt dosyası, Run dizini ve
#          manifest değişmedi, Recover yeni dosyayla başladı, GERÇEK koşucunun okuma kapısı "ok") · RG-2 değiştirilmiş kaynak (manifest uyuşmaz / yazım sırasında
#          değişti) · RG-3 yanlış koşum ve yanlış kayıt türü · RG-4 kimlik alanı · RG-5 eksik kaynak (kanıt / manifest / manifest satırı / makbuzJson / GO defteri
#          satırı) · RG-6 ezme yok (hedef dizin ya da aynı adlı dosya) · RG-7 yazma hatası (gerçek ACL reddi + kısmi yazım taklidi) · RG-8 geri okuma uyuşmazlığı
#          taklidi + KULLANILMAZ işaretli dizindeki makbuzun -ReceiptFile ile de reddi · RG-9 Recover bitiş ekranı AÇIK / KAPALI / ÖLÇÜLEMEDİ · RG-10 çift kaynak reddi + statik (sıra, otomatik Recover yok, silme yok, CreateNew,
#          kodlama tanımı). O-13 DEĞİŞTİ: kanıtta makbuz metni varsa Run sonu ekranı elle komut yerine "-Mode Recover -RunEvidenceDir '<kanıt dizini>'" gösterir.
#          O-15 KALDIRILDI (blok artık elle TEK komutu göstermez; makbuzu blok yazar → RG-1 iki kabukta). Sahte koşucu kanıta runId + tam receipt yazar;
#          EXSTUB_PC ile kanıttaki portalClose verilir. Her RG kalemi kendi istisnasını yakalar ve SOMUT ret nedenini ister. 83 − 1 + 10 = 92 test.
#          origin/main blok baytlarında (549b8344 aynası; blok 194816C5…) O-13 ve RG-1..RG-10 FAIL verir (11; negatif kontrol, iki kabukta); PIN-1 aynada PASS
#          (eski blok + eski koşucu tutarlı).
# R04-b  : (aşama 2; iki somut kusur) YENİ RG-11: -RunEvidenceDir yolunda makbuz koşucuya SALT OKUNUR verilir (D6_RECEIPT_READONLY=1); bayrağı tanımayan koşucu
#          taklidi makbuzu yeniden yazarsa bitiş ekranı kırmızı "RECOVER GİRDİSİ (makbuz): … DEĞİŞTİ …" der; -ReceiptFile yolunda bayrak VERİLMEZ; statik (tek atama,
#          $SecretEnv). DEĞİŞEN: RG-1 (bayrak + Recover'dan SONRA makbuz baytları / sha256 = kayıt + "… DEĞİŞMEDİ" satırı + kayıtta makbuzRecoverda) · O-13 (Run sonu
#          metni "kanıttaki kurtarma adımı da bu seçeneği gösterir"; "elle komut" ifadesi YOK). Sahte koşucu: marker'da `ro`, EXSTUB_REWRITE (runner / force).
#          92 + 1 = 93 test. Aşama 1 ucu blok baytlarında (1854df9f aynası; blok 054CB962…) O-13, RG-1, RG-11 FAIL verir (negatif kontrol; PIN-1 aynada PASS).
# R04-c  : (aşama 3; odak doğrulamanın beş somut noktası — koşucu / sahte API / koşucu öz-testi DEĞİŞMEDİ) DEĞİŞEN: RG-9 (K1 — PORTAL ERİŞİMİ satırı DB KAPALI iken
#          kanıttaki yeni giriş reddi ölçütlerine (P6-C3L/D) bağlı: ikisi PASS → yeşil "KAPALI (DB + yeni giriş reddi PASS)"; biri FAIL → kırmızı "DB'de kapalı AMA yeni
#          giriş reddi FAIL (…) — erişim kapalı SAYILMAZ"; ÖLÇÜLEMEYEN / satır yok → sarı "DB'de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ (…)"; satırın RENGİ de ölçülür;
#          çıkış kodu değişmez) · RG-10 (statik: `$rin = New-RecoverInputFromRun …`; silme / üzerine yazma taraması yeni yardımcı fonksiyonları da kapsar). YENİ:
#          RG-12 (K2 — -ReceiptFile ile manifesti olan Run kanıt dizinindeki makbuz: kanıtta makbuz metni varken DUR + -RunEvidenceDir yönlendirmesi, dizin değişmez;
#          kanıtta makbuz metni yokken izin + "orijinal kanıt dizini DEĞİŞİR" metni Recover başında, bitişinde ve Run sonu ekranında; manifesti olmayan dizin: davranış
#          aynı) · RG-13 (K3 — makbuz kayıt yazımı ile node arasında değişirse node 0 + KULLANILMAZ işareti; iki ölçüm noktası ayrı ayrı) · RG-14 (K4 — manifest yokken
#          DUR metni kalan yolu ve makbuz dosyasının ölçülen durumunu yazar) · RG-15 (K5 — okuma kapısında BEKLENMEYEN istisna → işaret + DUR; o dizindeki makbuz sonradan
#          -ReceiptFile ile de reddedilir). Renk yakalama: Get-HostLines (Write-Host kaydının ForegroundColor alanı). 93 + 4 = 97 test. Aşama 2 ucu blok baytlarında
#          (bcea51c1 aynası; blok F01D0E6E…) RG-9, RG-10, RG-12, RG-13, RG-14, RG-15 FAIL verir (6; negatif kontrol, iki kabukta; PIN-1 aynada PASS).
# KULLANIM: powershell.exe -NoProfile -ExecutionPolicy Bypass -File d6-owner-block-selftest.ps1   (ve pwsh)
# ÇIKIŞ  : 0 hepsi PASS · 1 en az bir FAIL · 2 ölçülemedi
$ErrorActionPreference = 'Stop'
$here    = $PSScriptRoot
$wrapper = Join-Path $here 'd6-owner-live-block.ps1'

$tok = $null; $perr = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($wrapper, [ref]$tok, [ref]$perr)
if ($perr.Count -gt 0) { Write-Host "OLCULEMEDI: wrapper ayrıştırılamadı ($($perr.Count) hata)"; exit 2 }
$funcs = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $false))
foreach ($f in $funcs) { . ([scriptblock]::Create($f.Extent.Text)) }
$secAssign = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$SecretEnv' }, $false))
if ($secAssign.Count -ne 1) { Write-Host 'OLCULEMEDI: $SecretEnv ataması bulunamadı'; exit 2 }
. ([scriptblock]::Create($secAssign[0].Extent.Text))
$lpAssign = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$LiveParams' }, $false))
if ($lpAssign.Count -ne 1) { Write-Host 'OLCULEMEDI: $LiveParams ataması bulunamadı'; exit 2 }
. ([scriptblock]::Create($lpAssign[0].Extent.Text))
# R03 (PIN-1): bloğun pin tablosu ve paket digest'i AST'den okunur (akış ÇALIŞMAZ); karşılaştırma bu checkout'un governance dizinindeki dosyalarla.
$pinAssign = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$PkgPins' }, $false))
$pkgAssign = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$ExpPackage' }, $false))
if ($pinAssign.Count -ne 1 -or $pkgAssign.Count -ne 1) { Write-Host 'OLCULEMEDI: $PkgPins / $ExpPackage ataması bulunamadı'; exit 2 }
. ([scriptblock]::Create($pinAssign[0].Extent.Text)); . ([scriptblock]::Create($pkgAssign[0].Extent.Text))
$GovReal = (Resolve-Path -LiteralPath (Join-Path $here '..\..')).Path
$need = 'Get-ClosureStatus', 'Invoke-RunMode', 'Invoke-RecoverMode', 'Invoke-QrTestMode', 'Assert-ExternalChain', 'Get-ExternalChainState', 'Invoke-Node', 'Complete-NodeRc', 'Resolve-NodeExe', 'Assert-FreshEvidence', 'Set-RunEnv',
        'Clear-SecretEnv', 'Read-GoRef', 'Read-Answer', 'Invoke-RepoGit', 'Assert-LocalConsole', 'Confirm-LiveDataProcessing', 'Read-ResidueDecision', 'Write-OwnerDeclaration', 'EnvValue', 'Test-BucketReadable',
        'Assert-PortalBaseUrl', 'Confirm-PortalBaseUrlR05'
$missing = @($need | Where-Object { -not (Get-Command $_ -CommandType Function -ErrorAction SilentlyContinue) })
if ($missing.Count -gt 0) { Write-Host "OLCULEMEDI: wrapper fonksiyonu yok: $($missing -join ',')"; exit 2 }
$script:RealAssertLocalConsole = ${function:Assert-LocalConsole}
$src0 = [IO.File]::ReadAllText($wrapper)

$T = Join-Path ([IO.Path]::GetTempPath()) ('d6-ownerblock-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
foreach ($d in 'sc', 'ev', 'rel', 'repo', 'bogus', 'badcmd', 'empty') { New-Item -ItemType Directory -Path (Join-Path $T $d) | Out-Null }
$Sc = Join-Path $T 'sc'; $EvRoot = Join-Path $T 'ev'; $GoLedger = Join-Path $EvRoot 'extacc-d6-goref-ledger.txt'
$Rel = Join-Path $T 'rel'; $Repo = Join-Path $T 'repo'; $Api = 'http://127.0.0.1:1/api'; $ExpBaseUrl = 'https://example.invalid'
$EnvFile = Join-Path $T 'fake.env'
[IO.File]::WriteAllText($EnvFile, "DATABASE_URL=postgresql://test-only:test-only@127.0.0.1:1/not_a_db`nPUBLIC_PORTAL_BASE_URL=https://example.invalid`n")
$script:LastNodeRc = $null
$marker = Join-Path $T 'node-calls.txt'
[IO.File]::WriteAllText((Join-Path $Sc 'd6-portal-documents-live-run.js'), @'
const fs = require('fs');
// R03-d: Recover modunda GERÇEK koşucunun makbuz okuma kapısı (readReceiptForRecover) bu sahte koşucunun aldığı makbuz dosyasıyla koşulur (EXSTUB_REAL_RUNNER).
let rgate = null;
if (process.env.D6_MODE === 'recover' && process.env.EXSTUB_REAL_RUNNER) {
  try { const RR = require(process.env.EXSTUB_REAL_RUNNER); rgate = typeof RR.readReceiptForRecover === 'function' ? (RR.readReceiptForRecover(process.env.D6_RECEIPT).ok ? 'ok' : 'red') : 'fonksiyon-yok'; }
  catch (e) { rgate = 'hata:' + String(e && e.message).slice(0, 80); }
}
fs.appendFileSync(process.env.EXSTUB_MARKER, JSON.stringify({ mode: process.env.D6_MODE || null, db: !!process.env.AH_DATABASE_URL,
  go: !!process.env.D6_LIVE_GO_REF, receipt: !!process.env.D6_RECEIPT, display: process.env.D6_DISPLAY || null, slug: process.env.D6_EXPECT_TENANT_SLUG || null,
  residue: process.env.D6_RESIDUE_CLEANUP || null, sink: process.env.D6_TEST_DISPLAY_SINK || null, base: process.env.D6_EXPECT_BASE_URL || null,
  pw: process.env.D6_LIVE_LOGIN_PW || null, rgate, receiptPath: process.env.D6_RECEIPT || null, ro: process.env.D6_RECEIPT_READONLY || null,
  params: ['D6_WAIT_MS', 'D6_POLL_MS', 'D6_VIEW_MS', 'D6_HTTP_TIMEOUT_MS', 'D6_CALL_TIMEOUT_MS', 'D6_LATE_CREATE_MS', 'D6_RESIDUE_WAIT_MS'].map((k) => process.env[k] || null) }) + '\n');
// R03-c: Run modunda koşucu gibi kanıt dizinine makbuz yazar (EXSTUB_NO_RECEIPT=1 → yazmaz · B → bozuk makbuz); kanıtta receipt nesnesi (EXSTUB_EV_RECEIPT=0 → yok)
// R03-d: makbuz metni koşucunun writeJson'u gibi girintili (1); tarih biçimli alan (createdAt) ve ASCII dışı karakter içerir. Kanıtta recovery.makbuzJson = bu metin
// (EXSTUB_STALE=1 → kanıttaki metin diskteki dosyadan FARKLI: bayat makbuz). Kanıtta record + exitCode (EXSTUB_EV_EXITCODE ile farklı verilebilir).
const rcptText = JSON.stringify({ record: 'EXTACC-D6-SETUP-RECEIPT', runId: String(process.env.D6_RUNID || ''), tenantId: 't', tenantSlug: process.env.D6_EXPECT_TENANT_SLUG || '', clientId: 'k',
  elevUserId: 'u', elevEmail: 'e@example.invalid', createdAt: '2026-10-03T20:15:25.123Z', residueFiles: ['D:\\veri\\portal-documents\\t\\çğış-İÖÜ.pdf'] }, null, 1);
if (process.env.D6_MODE === 'run' && process.env.D6_RECEIPT && process.env.EXSTUB_NO_RECEIPT !== '1') fs.writeFileSync(process.env.D6_RECEIPT, process.env.EXSTUB_NO_RECEIPT === 'B' ? '{"record":"BASKA"}' : rcptText);
if (process.env.EXSTUB_EXPECT_COPY) fs.writeFileSync(process.env.EXSTUB_EXPECT_COPY, rcptText);
// R04-b: Recover'da makbuzun yerinde yeniden yazımı taklidi. EXSTUB_REWRITE=runner → GERÇEK koşucu gibi yalnız D6_RECEIPT_READONLY=1 DEĞİLKEN yazar;
// EXSTUB_REWRITE=force → bayrağa bakmadan yazar (bayrağı tanımayan / eski koşucu taklidi). Yazım = sona bir bayt (dosya JSON olarak okunabilir kalır).
if (process.env.D6_MODE === 'recover' && process.env.D6_RECEIPT && (process.env.EXSTUB_REWRITE === 'force' || (process.env.EXSTUB_REWRITE === 'runner' && process.env.D6_RECEIPT_READONLY !== '1'))) fs.appendFileSync(process.env.D6_RECEIPT, '\n');
if (process.env.EXSTUB_WRITE_EVID === '1') {
  const pc = Object.assign({}, process.env.EXSTUB_DOCDURUM ? { docResidue: { durum: process.env.EXSTUB_DOCDURUM } } : {}, process.env.EXSTUB_SV ? { sessionVersion: { sinif: process.env.EXSTUB_SV } } : {},
    process.env.EXSTUB_ACIK ? { acikErisim: process.env.EXSTUB_ACIK } : {});   // R03-e: açık portal erişimi (koşucu portalClose.acikErisim)
  const noRc = process.env.EXSTUB_EV_RECEIPT === '0';
  // R04: kanıtta runId + koşucu gibi TAM receipt nesnesi (makbuzJson ile aynı alanlar); EXSTUB_PC → kanıttaki portalClose (Recover bitiş ekranı ölçümü).
  fs.writeFileSync(process.env.D6_EVID_FILE, JSON.stringify({ record: process.env.D6_MODE === 'recover' ? 'EXTACC-D6-RECOVER' : 'EXTACC-D6-PORTAL-DOCUMENTS-LIVE-RUN', runId: String(process.env.D6_RUNID || ''),
    exitCode: Number(process.env.EXSTUB_EV_EXITCODE !== undefined ? process.env.EXSTUB_EV_EXITCODE : (process.env.EXSTUB_RC || 0)), productFinding: process.env.EXSTUB_FINDING || null,
    receipt: noRc ? undefined : JSON.parse(rcptText),
    recovery: noRc ? undefined : { gerekli: true, makbuzJson: process.env.EXSTUB_STALE === '1' ? rcptText.replace('"clientId": "k",', '"clientId": "k",\n "documentId": "d",') : rcptText },
    portalClose: process.env.EXSTUB_PC ? JSON.parse(process.env.EXSTUB_PC) : (Object.keys(pc).length ? pc : undefined),
    results:[{ id: 'P6-WAIT', verdict: process.env.EXSTUB_WAIT || 'PASS' }, { id: 'P6-C-DOC', verdict: process.env.EXSTUB_DOC || 'PASS' }, { id: 'D6-1', verdict: 'PASS' }, { id: 'P6-PHONE-DOC', verdict: 'PASS' }, { id: 'P6-D9', verdict: process.env.EXSTUB_D9 || 'PASS' }]
      .concat(JSON.parse(process.env.EXSTUB_EXTRA || '[]')) }));
}
process.exit(Number(process.env.EXSTUB_RC || 0));
'@)
[IO.File]::WriteAllText((Join-Path $Sc 'd6-qr-test.js'), "if ((process.env.EXA_QRTEST_URL || '') !== 'https://example.invalid/portal/documents') process.exit(4); process.exit(Number(process.env.EXSTUB_QR_RC || 0));`n")
$bogusNode = Join-Path $T 'bogus\node.exe'; [IO.File]::WriteAllText($bogusNode, 'bu dosya bir çalıştırılabilir dosya DEĞİLDİR')
$goneNode  = Join-Path $T 'gone\node.exe'
[IO.File]::WriteAllText((Join-Path $T 'badcmd\node.cmd'), "@echo merhaba`r`n@exit /b 0`r`n")
$env:EXSTUB_MARKER = $marker

$rows = New-Object System.Collections.Generic.List[object]
function Check([string]$id, [string]$desc, [bool]$ok, [string]$obs) { $rows.Add([pscustomobject]@{ id = $id; sonuc = $(if ($ok) { 'PASS' } else { 'FAIL' }); aciklama = $desc; gozlem = $obs }) }
$script:goN = 10
$script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D6-20000101-R{0:D2}'
function Read-GoRef { $script:goN++; return ($script:GoFmt -f $script:goN) }
function Invoke-RepoGit { $global:LASTEXITCODE = 1 }
function Assert-LocalConsole { }
function Clear-OwnerScreen { }
$script:Answers = New-Object System.Collections.Generic.Queue[string]
function Read-Answer([string]$q) { if ($script:Answers.Count -gt 0) { return $script:Answers.Dequeue() } return '?' }
function Set-Answers([string[]]$a) { $script:Answers.Clear(); foreach ($x in $a) { $script:Answers.Enqueue($x) } }
$script:CmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
function Set-PriorZero { & $script:CmdExe /c 'exit 0'; if ($global:LASTEXITCODE -ne 0) { throw 'önceki kod 0 yapılamadı' } }
$script:RealSetRunEnv = ${function:Set-RunEnv}
$script:PriorAtNode = $null
function Set-RunEnv { & $script:RealSetRunEnv @args; Set-PriorZero; $script:PriorAtNode = $global:LASTEXITCODE }
function Node-Calls { @(if (Test-Path -LiteralPath $marker) { Get-Content -LiteralPath $marker }) }
$okAnswers = @('E', 'https://example.invalid', 'EVET', 'B', '1', 'E', 'A', 'H', 'Y', 'B', 'M', 'G')   # pencere · R05 adresi · onay · beyan x9
$okChain = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '4242'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
function Invoke-Mode([string]$mode, [string]$nodeExe, [int]$stubRc, [bool]$writeEvid, [string]$receipt = '', [string[]]$answers = $okAnswers, [string]$waitVerdict = 'PASS', $chain = $okChain, [string]$runDir = '') {
  $env:EXSTUB_RC = [string]$stubRc; $env:EXSTUB_WRITE_EVID = $(if ($writeEvid) { '1' } else { '0' }); $env:EXSTUB_WAIT = $waitVerdict
  Set-Answers $answers
  $g = [ordered]@{ head = 'test'; pkg = 'test'; dist = 'test'; envSha = 'test'; apiPid = 0; baseHost = 'example.invalid'; dataRootState = 'test'; bucketState = 'test-okunabilir'
                   caddyLoopback = $true; cloudflaredRunning = $true; chain = $chain; nodeExe = $nodeExe; nodeVersion = 'test' }
  $before = (Node-Calls).Count; $script:LastNodeRc = $null; $script:PriorAtNode = $null
  $ledgerBefore = if (Test-Path -LiteralPath $GoLedger) { @(Get-Content -LiteralPath $GoLedger).Count } else { 0 }
  Set-PriorZero
  $threw = $null; $out = $null
  try { if ($mode -eq 'Run') { $out = Invoke-RunMode $g } else { $out = Invoke-RecoverMode $g $receipt $runDir } } catch { $threw = $_.Exception.Message }
  $calls = @(Node-Calls)
  $ledgerAfter = if (Test-Path -LiteralPath $GoLedger) { @(Get-Content -LiteralPath $GoLedger).Count } else { 0 }
  return @{ out = $out; count = @($out).Count; threw = $threw; prior = $script:PriorAtNode; nodeCalls = $calls.Count - $before
            last = $(if ($calls.Count -gt $before) { $calls[-1] | ConvertFrom-Json } else { $null }); ledgerDelta = $ledgerAfter - $ledgerBefore
            secretsLeft = @($SecretEnv | Where-Object { Test-Path "Env:$_" }).Count }
}
function Last-EvDir { Get-ChildItem -LiteralPath $EvRoot -Directory -Filter 'extacc-d6-live-*' | Sort-Object LastWriteTimeUtc | Select-Object -Last 1 }
function Consumed-Rc { $d = Last-EvDir; (Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'goref-consumed.json') | ConvertFrom-Json).exitCode }
$ps = "PS $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"

try {
  $real = Resolve-NodeExe
  Check 'N-1' 'Resolve-NodeExe: gerçek node çözülür, --version geçer' ((Test-Path -LiteralPath $real.Exe -PathType Leaf) -and $real.Version -match '^v\d+\.\d+\.\d+$') "$($real.Version)"
  $savedPath = $env:PATH
  try {
    $env:PATH = Join-Path $T 'bogus'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-2' 'başlatılamayan node (önceki kod 0) → DUR' ($m -like 'EXTACC-D6-DUR:*' -and $m -match 'node') "mesaj=$m"
    $env:PATH = Join-Path $T 'badcmd'; Set-PriorZero; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-3' 'node --version beklenmeyen çıktı → DUR' ($m -like 'EXTACC-D6-DUR:*' -and $m -match 'version') "mesaj=$m"
    $env:PATH = Join-Path $T 'empty'; $m = $null; try { $null = Resolve-NodeExe } catch { $m = $_.Exception.Message }
    Check 'N-4' 'node yok → DUR' ($m -like 'EXTACC-D6-DUR:*') "mesaj=$m"
  } finally { $env:PATH = $savedPath }

  # ---- Run öncesi owner kararları: reddedilirse GO sorulmaz, defter yazılmaz, node çağrılmaz
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('H')
  Check 'K-2' 'bağımsız pencere teyit edilmezse DUR; GO defteri yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw) · defter+=$($r.ledgerDelta)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', 'https://example.invalid', 'evet')
  Check 'K-3' 'canlı veri işleme "EVET" (büyük harf) değilse DUR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'onaylanmadı' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', 'https://baska.invalid', 'EVET')
  Check 'K-6' 'R05 adresi: owner''ın yazdığı adres .env değeriyle eşleşmezse canlı veri onayından ÖNCE DUR; GO sorulmaz; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'R05' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Run' $real.Exe 0 $true '' @('E', ' HTTPS://Example.INVALID/ ', 'EVET', 'B', '1', 'E', 'A', 'H', 'Y', 'B', 'M', 'G')
  Check 'K-6b' 'R05 adresi: boşluk / sondaki "/" / büyük-küçük harf farkı eşleşmeyi bozmaz (koşum 0)' ($r.out -eq 0 -and $r.nodeCalls -eq 1 -and $r.last.base -eq 'https://example.invalid') "rc=$($r.out) · origin=$($r.last.base)"
  $okU = $null; try { $okU = Assert-PortalBaseUrl 'https://portal.example.com' } catch { $okU = 'DUR' }
  $badU = @(); foreach ($u in 'http://portal.example.com', 'https://portal.example.com/portal', 'https://portal.example.com:8443', 'https://127.0.0.1', 'https://localhost', 'https://portal.example.com?x=1', '') { try { $null = Assert-PortalBaseUrl $u; $badU += "KABUL:$u" } catch { if ($_.Exception.Message -notlike 'EXTACC-D6-DUR:*') { $badU += "BASKA:$u" } } }
  Check 'K-7' 'Assert-PortalBaseUrl: https://<alan adı> kabul; http / yol / port / IP / localhost / sorgu / boş → DUR' ($okU -eq 'https://portal.example.com' -and $badU.Count -eq 0) "kabul=$okU · yanlış kabul=$($badU -join ',')"
  $savedBase = $ExpBaseUrl; $ExpBaseUrl = $null; $m = $null; Set-Answers @('https://example.invalid'); try { Confirm-PortalBaseUrlR05 } catch { $m = $_.Exception.Message }; $ExpBaseUrl = $savedBase
  Check 'K-8' 'Confirm-PortalBaseUrlR05: adres kapılarda çözülmemişse (null) DUR' ($m -like 'EXTACC-D6-DUR:*' -and $m -match 'çözülmedi') "mesaj=$m"
  $gs = $script:goN; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D5-20000101-R{0:D2}'; $r = Invoke-Mode 'Run' $real.Exe 0 $true; $script:GoFmt = 'OWNER-GO-CLIENT-EXTACC-D6-20000101-R{0:D2}'; $script:goN = $gs
  Check 'K-4' 'D-5 GO biçimi D-6 için REDDEDİLİR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'BİÇİMİ' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $m = $null; try { & $script:RealAssertLocalConsole } catch { $m = $_.Exception.Message }
  Check 'K-1' 'GERÇEK Assert-LocalConsole: çıktısı yönlendirilmiş süreçte DURUR (giriş bilgisi gösterilmez)' ($m -like 'EXTACC-D6-DUR:*') "mesaj=$m"
  $ev0 = EnvValue 'HUKUK_DATA_ROOT' -Optional
  Check 'K-5' 'EnvValue -Optional: .env''de olmayan anahtar DUR vermez (null); zorunlu anahtar tek geçiş' ($null -eq $ev0 -and (EnvValue 'PUBLIC_PORTAL_BASE_URL') -eq 'https://example.invalid') "opsiyonel=$ev0"
  # ---- Belge kovası okunabilirliği (inceleme R01): gerçek dizin + gerçek ACL reddi
  $bRoot = Join-Path $T 'bucket-root'; New-Item -ItemType Directory -Path $bRoot | Out-Null
  Check 'B-1' 'Test-BucketReadable: HUKUK_DATA_ROOT .env''de yoksa "env-dosyasinda-yok" (DUR yok)' ((Test-BucketReadable $null) -eq 'env-dosyasinda-yok' -and (Test-BucketReadable '') -eq 'env-dosyasinda-yok') 'null/boş'
  Check 'B-2' 'Test-BucketReadable: portal-documents alt dizini henüz yoksa not (DUR yok)' ((Test-BucketReadable $bRoot) -eq 'kova-alt-dizini-henuz-yok') 'alt dizin yok'
  $bDir = Join-Path $bRoot 'portal-documents'; New-Item -ItemType Directory -Path $bDir | Out-Null; [IO.File]::WriteAllText((Join-Path $bDir 'x.pdf'), 'x')
  Check 'B-3' 'Test-BucketReadable: alt dizin var ve listelenebiliyor → "okunabilir"' ((Test-BucketReadable $bRoot) -eq 'okunabilir') 'okunabilir'
  $bm = $null; $bDenied = $false
  try {
    & icacls.exe $bDir /deny "$($env:USERNAME):(RD)" *> $null; $bDenied = ($LASTEXITCODE -eq 0)
    try { $null = Test-BucketReadable $bRoot } catch { $bm = $_.Exception.Message }
  } finally { & icacls.exe $bDir /remove:d "$env:USERNAME" *> $null }
  Check 'B-4' 'Test-BucketReadable: alt dizin liste (RD) reddiyle OKUNAMIYORSA DUR (sahte "yok" riski)' ($bDenied -and $bm -like 'EXTACC-D6-DUR:*' -and $bm -match 'OKUNAMIYOR') "deny=$bDenied · mesaj=$bm"
  Check 'B-5' 'Test-BucketReadable: ACL geri alınınca yine "okunabilir"; Invoke-ReadOnlyGates kovayı çağırır ve sonuca koyar' ((Test-BucketReadable $bRoot) -eq 'okunabilir' -and (($funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' }).Extent.Text -match '\$bucketState = Test-BucketReadable \$dataRoot') -and (($funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' }).Extent.Text -match 'bucketState = \$bucketState')) 'statik+geri alma'

  # ---- RUN
  $r = Invoke-Mode 'Run' $real.Exe 0 $true
  $d = Last-EvDir; $decl = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
  $man = Get-Content -LiteralPath (Join-Path $d.FullName 'SHA256-MANIFEST.txt')
  Check 'R-1' 'Run: node 0 + kanıt → 0; node run modunda, D6_DISPLAY=conout, slug ah-<runId>, GO/DB/makbuz ortamla; kalıntı kararı KURULMADI (yalnız Recover); sink KURULMADI; ortam temizlendi; defter +1' ($r.out -eq 0 -and $r.count -eq 1 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'run' -and $r.last.display -eq 'conout' -and $r.last.slug -match '^ah-[0-9a-f]{8}$' -and $r.last.db -and $r.last.go -and $r.last.receipt -and $null -eq $r.last.residue -and $null -eq $r.last.sink -and $r.last.base -eq 'https://example.invalid' -and $r.secretsLeft -eq 0 -and $r.ledgerDelta -eq 1 -and (Consumed-Rc) -eq 0) "rc=$($r.out) · display=$($r.last.display) · kalıntı=$($r.last.residue) · kalan gizli=$($r.secretsLeft)"
  $blk = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-block.json'); $allTxt = (Get-ChildItem -LiteralPath $d.FullName -File | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
  Check 'R-9' 'kanıt dizininde GO literali ve DB URL yok; owner-block.json plannedRealSends=0, machineMeasuredUpload=kosucu, phoneUploadOptional=true, bucketState kayıtlı' ($allTxt -notmatch 'OWNER-GO-CLIENT-EXTACC-D6-20000101' -and $allTxt -notmatch 'test-only' -and $blk -match '"plannedRealSends":\s*0' -and $blk -match '"machineMeasuredUpload":\s*"kosucu"' -and $blk -match '"phoneUploadOptional":\s*true' -and $blk -match '"bucketState":\s*"test-okunabilir"') "dosya=$((Get-ChildItem -LiteralPath $d.FullName -File).Count)"
  Check 'R-8' 'owner beyanı AYRI dosyada (makine ölçümü değil notu; 9 yönlendirmesiz soru; owner''a gösterilen kapanış metni kayıtlı) ve manifestte' ($decl.record -eq 'EXTACC-D6-OWNER-DECLARATION' -and $decl.not -match 'beyan' -and $decl.girisSonrasiEkran -eq 'B' -and $decl.listedekiBelgeSayisi -eq '1' -and $decl.ekrandakiBaslikGoruldu -eq 'E' -and $decl.indirmeSonucu -eq 'A' -and $decl.telefondanYuklemeYapildi -eq 'H' -and $decl.telefonYuklemesiSilindi -eq 'Y' -and $decl.silmeSonrasiListe -eq 'B' -and $decl.telefonAgi -eq 'M' -and $decl.yenilemeSonrasiEkran -eq 'G' -and $decl.closureShownToOwner -match 'DOĞRULANDI' -and (@($man | Where-Object { $_ -match 'owner-declaration\.json$' }).Count -eq 1)) "beyan=$($decl.girisSonrasiEkran)/$($decl.listedekiBelgeSayisi)/$($decl.ekrandakiBaslikGoruldu)/$($decl.indirmeSonucu)/$($decl.telefondanYuklemeYapildi)/$($decl.telefonYuklemesiSilindi)/$($decl.silmeSonrasiListe)/$($decl.telefonAgi)/$($decl.yenilemeSonrasiEkran) · kapanış=$($decl.closureShownToOwner)"
  foreach ($c in 2, 3, 5, 6) {
    $r = Invoke-Mode 'Run' $real.Exe $c $true
    Check "R-2.$c" "Run: node $c → $c değişmeden (tek node çağrısı; otomatik tekrar/Recover yok)" ($r.out -eq $c -and $r.nodeCalls -eq 1 -and (Consumed-Rc) -eq $c) "rc=$($r.out) · node=$($r.nodeCalls)"
  }
  $r = Invoke-Mode 'Run' $real.Exe 0 $false
  Check 'R-3' 'Run: node 0 ama kanıt yok → 7' ($r.out -eq 7 -and (Consumed-Rc) -eq 7) "rc=$($r.out)"
  $r = Invoke-Mode 'Run' $bogusNode 0 $true
  Check 'R-4' 'Run: önceki kod 0 iken node BAŞLATILAMAZ → 91 (0 değil); ortam temiz' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and $r.prior -eq 0 -and (Consumed-Rc) -eq 91 -and $r.secretsLeft -eq 0) "rc=$($r.out) · önceki=$($r.prior)"
  $r = Invoke-Mode 'Run' $goneNode 0 $true
  Check 'R-5' 'Run: önceki kod 0 iken node dosyası YOK → 91' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and $r.prior -eq 0) "rc=$($r.out)"
  $script:goN = 10; $r = Invoke-Mode 'Run' $real.Exe 0 $true
  Check 'R-6' 'aynı GO ikinci kez → DUR (defter), node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'KULLANILDI' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $script:goN = 50
  $r = & { function node { }; Invoke-Mode 'Run' $real.Exe 0 $true }
  Check 'R-7' '`node` fonksiyon gölgesi varken gerçek node dosya yoluyla koşar' ($r.out -eq 0 -and $r.nodeCalls -eq 1) "rc=$($r.out) · node=$($r.nodeCalls)"

  # ---- RECOVER
  $rd = Join-Path $EvRoot 'recover-case'; New-Item -ItemType Directory -Path $rd | Out-Null
  $rcpt = Join-Path $rd 'd6-setup-receipt.json'
  '{"record":"EXTACC-D6-SETUP-RECEIPT","runId":"0123abcd","tenantId":"t","tenantSlug":"ah-0123abcd","caseId":"c","clientId":"k","elevUserId":"u","elevEmail":"e@example.invalid"}' | Set-Content -LiteralPath $rcpt -Encoding ASCII
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('E')
  Check 'V-0' 'Recover: kalıntı kararı (E) node''a D6_RESIDUE_CLEANUP=1 olarak geçer' ($r.last.residue -eq '1' -and $r.last.mode -eq 'recover') "kalıntı=$($r.last.residue)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('x')
  Check 'V-5' 'Recover: kalıntı kararı E/H değilse DUR; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'kalıntı' -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('H')
  $rz = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('H') 'PASS' ([pscustomobject]@{ loopbackCount = 0; otherAddresses = '0.0.0.0'; loopbackPids = ''; caddyServiceState = 'Stopped'; caddyServicePid = 0; cloudflaredStatus = 'Stopped' })
  Check 'Z-8' 'Recover: dış zincir BOZUKKEN de kapanış yapılabilir (çıkış 0, node koştu)' ($rz.out -eq 0 -and $rz.nodeCalls -eq 1 -and -not $rz.threw) "rc=$($rz.out) · istisna=$($rz.threw)"
  Check 'V-1' 'Recover: node 0 + kanıt → 0; recover modu + makbuz + kalıntı=0; ortam temiz; defter DEĞİŞMEZ' ($r.out -eq 0 -and $r.nodeCalls -eq 1 -and $r.last.mode -eq 'recover' -and $r.last.receipt -and $r.last.residue -eq '0' -and $r.secretsLeft -eq 0 -and $r.ledgerDelta -eq 0) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $real.Exe 6 $true $rcpt @('H')
  Check 'V-2' 'Recover: 6 değişmeden' ($r.out -eq 6 -and $r.nodeCalls -eq 1) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $real.Exe 0 $false $rcpt @('H')
  Check 'V-3' 'Recover: kanıt yok → 7' ($r.out -eq 7) "rc=$($r.out)"
  $r = Invoke-Mode 'Recover' $bogusNode 0 $true $rcpt @('H')
  Check 'V-4' 'Recover: önceki kod 0 iken node başlatılamaz → 91' ($r.out -eq 91 -and $r.nodeCalls -eq 0 -and $r.prior -eq 0) "rc=$($r.out)"

  # ---- CANLI SÜRELER: pencereden devralınan değerler canlı süreleri DEĞİŞTİREMEZ
  foreach ($k in 'D6_WAIT_MS', 'D6_POLL_MS', 'D6_VIEW_MS', 'D6_HTTP_TIMEOUT_MS', 'D6_CALL_TIMEOUT_MS', 'D6_LATE_CREATE_MS', 'D6_RESIDUE_WAIT_MS') { Set-Item -Path "Env:$k" -Value '1' }
  $script:goN = 70; $r = Invoke-Mode 'Run' $real.Exe 0 $true
  $exp = @('1200000', '5000', '300000', '15000', '30000', '120000', '300000')   # R06: inceleme 300 sn (önceki 120 sn)
  $saved = $LiveParams; $LiveParams = $null; $script:goN = 72
  $r2 = Invoke-Mode 'Run' $real.Exe 0 $true
  $LiveParams = $saved
  Check 'L-2' 'Run: canlı süre tablosu eksikse node BAŞLAMAZ (sessizce devralınan değerlerle koşmaz)' ($r2.threw -like 'EXTACC-D6-DUR:*' -and $r2.threw -match 'süre tablosu' -and $r2.nodeCalls -eq 0) "mesaj=$($r2.threw)"
  Check 'L-1' 'Run: devralınan 7 süre değişkeni (=1) node''a CANLI değerlerle geçer (20 dk bekleme / 5 sn yoklama / 300 sn inceleme / zaman aşımları / 120 sn geç oluşma / 5 dk kalıntı bekleme) ve sonra temizlenir' (($r.last.params -join ',') -eq ($exp -join ',') -and $r.secretsLeft -eq 0) "node gördü=$($r.last.params -join ',') · kalan=$($r.secretsLeft)"

  # ---- OWNER METNİ: kapanış metni kanıta bağlı; koşulsuz "kapatıldı" yok; sorular yönlendirmesiz
  $env:EXSTUB_D9 = 'FAIL'; $env:EXSTUB_DOC = 'FAIL'; $script:goN = 80; $r = Invoke-Mode 'Run' $real.Exe 6 $true; $env:EXSTUB_D9 = 'PASS'; $env:EXSTUB_DOC = 'PASS'
  $d = Last-EvDir; $declF = Get-Content -Raw -LiteralPath (Join-Path $d.FullName 'owner-declaration.json') | ConvertFrom-Json
  Check 'O-1' 'P6-D9 FAIL (çıkış 6): owner''a gösterilen metin "DOĞRULANAMADI", "DOĞRULANDI (" değil' ($r.out -eq 6 -and $declF.closureShownToOwner -match 'DOĞRULANAMADI' -and $declF.closureShownToOwner -notmatch 'DOĞRULANDI \(') "metin=$($declF.closureShownToOwner)"
  $cs = Get-ClosureStatus (Join-Path $T 'yok\d6-evidence.json') 7
  Check 'O-2' 'kanıt okunamazsa kapanış DOĞRULANAMADI sayılır' (-not $cs.verified -and $cs.text -match 'DOĞRULANAMADI') "metin=$($cs.text)"
  $declBody = ($funcs | Where-Object { $_.Name -eq 'Write-OwnerDeclaration' }).Extent.Text
  $leading = @('döndü mü', 'görünmedi mi', 'YALNIZ konsolda', 'oturumun kapandığını', 'kapatıldı', 'silindi mi', 'boş muydu', 'reddedildi mi')
  $hits = @($leading | Where-Object { $declBody -match [regex]::Escape($_) })
  $srcAll = [IO.File]::ReadAllText($wrapper)
  Check 'O-3' 'owner beyanı soruları yönlendirmesiz (seçenekli); bloğun hiçbir yerinde koşulsuz "erişimi kapatıldı" yok; 9 soru' ($hits.Count -eq 0 -and $srcAll -notmatch 'erişimi kapatıldı' -and ([regex]::Matches($declBody, 'Read-Answer')).Count -eq 9) "yönlendiren=$($hits -join ',') · soru=$(([regex]::Matches($declBody, 'Read-Answer')).Count)"
  $confBody = ($funcs | Where-Object { $_.Name -eq 'Confirm-LiveDataProcessing' }).Extent.Text
  Check 'O-4' 'canlı veri işleme onay metni kaynakla uyumlu: yükleme günlüğü MASKESİZ (kaynak portal.service.ts maskEmail kullanmaz); "maskelenmiş" iddiası yok' ($confBody -match 'MASKESİZ' -and $confBody -notmatch 'maskelenmiş') 'metin'
  $recBody = ($funcs | Where-Object { $_.Name -eq 'Invoke-RecoverMode' }).Extent.Text
  # R03-c: 0 metni ölçülenle sınırlandı — "hiç açılmamıştı" bir çıkarımdı (ölçülen: Recover anında hesap DB'de yok); ölçüt buna göre değişti.
  Check 'O-5' 'Recover bitiş metni 0''ı olduğundan güçlü anlatmaz: R03-c — "0 = Recover anında portal hesabı DB''de YOK (ölçüldü)" ("hiç açılmamıştı" çıkarımı YOK) … "HTTP reddi ÖLÇÜLMEDİ"; "mevcut oturum reddi Recover''da ÖLÇÜLEMEZ"; erişim ölçülemedi yönlendirmesi' ($recBody -match "0 = Recover anında portal hesabı DB'de YOK \(ölçüldü\)" -and $recBody -notmatch 'hiç açılmamıştı' -and $recBody -match 'HTTP reddi ÖLÇÜLMEDİ' -and $recBody -match "mevcut oturum reddi Recover'da ÖLÇÜLEMEZ" -and $recBody -notmatch '0 kapanış \+ HTTP reddi' -and $recBody -match 'okunabilirliği') 'metin'

  # ---- DIŞ ZİNCİR: doğrulanamazsa Preflight/Run DURUR; Recover engellenmez
  $bad = @{
    'Z-1 8081 loopback dinleyicisi yok'            = [pscustomobject]@{ loopbackCount = 0; otherAddresses = ''; loopbackPids = ''; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
    'Z-2 8081 başka arayüzde de dinliyor (0.0.0.0)' = [pscustomobject]@{ loopbackCount = 1; otherAddresses = '0.0.0.0'; loopbackPids = '4242'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
    'Z-3 dinleyici HY-Caddy servisine ait değil'  = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '999'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Running' }
    'Z-4 HY-Caddy servisi yok'                     = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '4242'; caddyServiceState = 'YOK'; caddyServicePid = 0; cloudflaredStatus = 'Running' }
    'Z-5 Cloudflared durmuş'                       = [pscustomobject]@{ loopbackCount = 1; otherAddresses = ''; loopbackPids = '4242'; caddyServiceState = 'Running'; caddyServicePid = 4242; cloudflaredStatus = 'Stopped' }
  }
  foreach ($name in ($bad.Keys | Sort-Object)) {
    $m = $null; try { Assert-ExternalChain $bad[$name] } catch { $m = $_.Exception.Message }
    Check ($name.Substring(0, 3)) ("Assert-ExternalChain: " + $name.Substring(4) + ' → DUR') ($m -like 'EXTACC-D6-DUR:*') "mesaj=$m"
  }
  $m = 'yok'; try { Assert-ExternalChain $okChain; $m = $null } catch { $m = $_.Exception.Message }
  Check 'Z-0' 'Assert-ExternalChain: sağlıklı zincir (yalnız loopback, pid = servis, Cloudflared çalışıyor) geçer' ($null -eq $m) "mesaj=$m"
  $script:goN = 71; $r = Invoke-Mode 'Run' $real.Exe 0 $true '' $okAnswers 'PASS' $bad['Z-5 Cloudflared durmuş']
  Check 'Z-6' 'Run: dış zincir eksikse GO sorulmadan DURUR; defter yazılmaz; node çağrılmaz' ($r.threw -like 'EXTACC-D6-DUR:*' -and $r.threw -match 'Cloudflared' -and $r.ledgerDelta -eq 0 -and $r.nodeCalls -eq 0) "mesaj=$($r.threw)"
  $pre = $src0.Substring($src0.IndexOf('if ($Mode -eq ''Preflight'')'))
  Check 'Z-7' 'Preflight: dış zincir kapısı "PREFLIGHT GEÇTİ" yazısından ÖNCE' ($pre.IndexOf('Assert-ExternalChain $g.chain') -ge 0 -and $pre.IndexOf('Assert-ExternalChain $g.chain') -lt $pre.IndexOf('PREFLIGHT GEÇTİ')) 'sıra'

  # ---- QR DENEMESİ: yalnız açık "E" başarıdır; gösterim ile telefon okuması ayrı; URL /portal/documents (stub başka URL'de 4 döner)
  $g0 = [ordered]@{ nodeExe = $real.Exe; chain = $okChain }
  foreach ($case in @(@('E', 0), @('H', 2), @('?', 3), @('e', 3), @('', 3))) {
    $env:EXSTUB_QR_RC = '0'; Set-Answers @('https://example.invalid', $case[0])
    $q = $null; $qt = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
    Check ("Q-" + $(if ($case[0] -eq '') { 'boş' } else { $case[0] })) ("QrTest: R05 adresi + yanıt [" + $case[0] + "] → çıkış " + $case[1]) ($q -eq $case[1] -and @($q).Count -eq 1) "dönen=$q · istisna=$qt"
  }
  $env:EXSTUB_QR_RC = '4'; Set-Answers @('https://example.invalid', 'E'); $qt = $null; $q = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
  Check 'Q-G' 'QrTest: gösterim başarısızsa (qr 4) owner "E" dese de DURUR (sıfır dışı)' ($qt -like 'EXTACC-D6-DUR:*' -and $null -eq $q) "istisna=$qt"
  $env:EXSTUB_QR_RC = '0'; Set-Answers @('https://baska.invalid', 'E'); $qt = $null; $q = $null; try { $q = Invoke-QrTestMode $g0 } catch { $qt = $_.Exception.Message }
  Check 'Q-R05' 'QrTest: owner''ın yazdığı R05 adresi .env değeriyle eşleşmezse QR gösterilmeden DUR' ($qt -like 'EXTACC-D6-DUR:*' -and $qt -match 'R05' -and $null -eq $q) "istisna=$qt"

  # ---- statik
  $src = [IO.File]::ReadAllText($wrapper)
  $body = ($funcs | Where-Object { $_.Name -eq 'Invoke-Node' } | Select-Object -First 1).Extent.Text
  $iS = $body.IndexOf('$global:LASTEXITCODE = -999'); $iC = $body.IndexOf('& $exe'); $iR = $body.IndexOf('$rc = $global:LASTEXITCODE')
  Check 'S-1' 'Invoke-Node: sentinel çağrıdan önce, yakalama hemen sonra' ($iS -ge 0 -and $iS -lt $iC -and $iC -lt $iR) "sentinel@$iS çağrı@$iC yakalama@$iR"
  Check 'S-2' 'başka `& node` yok' (-not ($src -match '&\s+node\b')) 'yok'
  $run = ($funcs | Where-Object { $_.Name -eq 'Invoke-RunMode' }).Extent.Text
  $iW = $run.IndexOf('Assert-LocalConsole'); $iK = $run.IndexOf('Confirm-LiveDataProcessing'); $iG = $run.IndexOf('Read-GoRef'); $iL = $run.IndexOf('Add-Content -LiteralPath $GoLedger'); $iN = $run.IndexOf('Invoke-Node')
  Check 'S-3' 'Run sırası: konsol → pencere teyidi → canlı veri onayı → GO → defter → node; alıcı/gönderim/ezme soruları YOK' ($iW -ge 0 -and $iW -lt $iK -and $iK -lt $iG -and $iG -lt $iL -and $iL -lt $iN -and $run -notmatch 'Read-Recipient|Confirm-SingleSend|Read-ScrubDecision|Read-ResidueDecision') "konsol@$iW onay@$iK GO@$iG defter@$iL node@$iN"
  Check 'S-4' 'sink kurulmaz; D6_RESIDUE_CLEANUP yalnız Invoke-RecoverMode içinde kurulur; QR URL /portal/documents' ($src -notmatch '\$env:D6_TEST_DISPLAY_SINK\s*=' -and ([regex]::Matches($src, '\$env:D6_RESIDUE_CLEANUP\s*=')).Count -eq 1 -and (($funcs | Where-Object { $_.Name -eq 'Invoke-RecoverMode' }).Extent.Text -match '\$env:D6_RESIDUE_CLEANUP\s*=') -and $src -match '/portal/documents"') 'statik'
  $gates = ($funcs | Where-Object { $_.Name -eq 'Invoke-ReadOnlyGates' }).Extent.Text; $qrB = ($funcs | Where-Object { $_.Name -eq 'Invoke-QrTestMode' }).Extent.Text
  $iR05 = $run.IndexOf('Confirm-PortalBaseUrlR05'); $iConf = $run.IndexOf('Confirm-LiveDataProcessing')
  Check 'S-5' 'topoloji literali yok: $ExpBaseUrl https:// literali DEĞİL (.env''den, biçim kapısıyla); kanıt kökü $env:USERPROFILE''a göreli; "C:\Users\" yok; R05 onayı Run''da canlı veri onayından ÖNCE ve QrTest''te' ($src -notmatch "\`\$ExpBaseUrl\s*=\s*'https://" -and $src -notmatch 'C:\\Users\\' -and $src -match '\$EvRoot\s*=\s*Join-Path \$env:USERPROFILE' -and $gates -match '\$script:ExpBaseUrl\s*=\s*\$baseUrl' -and $gates -match 'Assert-PortalBaseUrl \(EnvValue ''PUBLIC_PORTAL_BASE_URL''\)' -and $iR05 -ge 0 -and $iR05 -lt $iConf -and $qrB -match 'Confirm-PortalBaseUrlR05') "R05@$iR05 onay@$iConf"

  # ---- R02 (2026-10-01) METİN ÖLÇÜMLERİ: hem kaynakta (yorumlar DAHİL) hem owner'a GÖSTERİLEN metinde (Write-Host yakalaması, 6>&1) ölçülür.
  #      Owner kuralı: Run çıkış 5/6 otomatik Recover yetkisi DEĞİLDİR; Run'ın koşucu içindeki kendi kapanış adımları ile ayrıca başlatılan
  #      Recover AYRIDIR; Recover yalnız kanıt incelendikten sonra AYRI owner onayıyla, BİR kez başlatılır; blok Recover'ı başlatmaz.
  #      Bu 7 testin eski blok baytlarına karşı FAIL verdiği ayrıca ölçülür (negatif kontrol).
  function Get-HostText([scriptblock]$b) { return ((@(& $b 6>&1) | ForEach-Object { [string]$_ }) -join "`n") }
  # R04-c: gösterilen satırlar RENGİYLE (Write-Host kaydının ForegroundColor alanı) — satır rengi ölçülen kalemler için (RG-9).
  function Get-HostLines([scriptblock]$b) { return @(@(& $b 6>&1) | Where-Object { $_ -is [Management.Automation.InformationRecord] } | ForEach-Object { [pscustomobject]@{ t = [string]$_.MessageData; c = [string]$_.MessageData.ForegroundColor } }) }
  $absRe ='(?i)h[iİı]çb[iİı]r[^\r\n]{0,40}(dosya|log|günlü|kanıt|rapor)[^\r\n]{0,40}(yazılmaz|yazmaz|YAZILMAZ|YAZMAZ)'
  $absPos = @('GO ref ve token''lar hiçbir dosyaya yazılmaz', 'Hiçbir dosyaya/kanıta yazılmaz.', 'parola HİÇBİR log dosyasına YAZILMAZ', 'DB URL''yi hiçbir kanıta yazmaz')
  $absNeg = @('GO sorulmaz, hiçbir şey yazılmaz', 'bu blok ve koşucu KENDİ kanıt/log dosyalarına YAZMAZ')
  $absPosMiss = @($absPos | Where-Object { $_ -notmatch $absRe }); $absNegHit = @($absNeg | Where-Object { $_ -match $absRe })
  $srcLines = @($src0 -split "`n"); $absHits = @($srcLines | Where-Object { $_ -match $absRe })
  $hdrTxt = (@($srcLines | Select-Object -First 40) -join "`n")
  $scopeNeed = @('bu blok ve koşucu KENDİ kanıt/log dosyalarına YAZMAZ', 'KAPSAM (ölçülen)', 'KAPSAM DIŞI (ÖLÇÜLMEDİ)', 'canlı API', 'terminal kayıtları')
  $scopeMiss = @($scopeNeed | Where-Object { $hdrTxt -cnotmatch [regex]::Escape($_) })
  $script:goN = 55; $rG = Invoke-Mode 'Run' $real.Exe 0 $true; $dG = Last-EvDir
  $evFiles = @(Get-ChildItem -LiteralPath $dG.FullName -File)
  $evTxt = (($evFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n") + "`n" + $(if (Test-Path -LiteralPath $GoLedger) { Get-Content -Raw -LiteralPath $GoLedger } else { '' })
  $pwG = [string]$rG.last.pw
  $pwOk = ($rG.out -eq 0 -and $evFiles.Count -ge 5 -and $pwG -cmatch '^D6S!.{20,}$' -and $evTxt.IndexOf($pwG, [StringComparison]::Ordinal) -lt 0 -and $evTxt -notmatch 'OWNER-GO-CLIENT-EXTACC-D6-20000101' -and $evTxt -notmatch 'test-only')
  Check 'G-1' 'kaynakta (yorumlar DAHİL) "hiçbir … dosya/log/günlük/kanıt/rapor … yazılmaz" türü KAPSAMSIZ mutlak iddia YOK; desen kör değil (4 bilinen mutlak cümleyi yakalar; kapsamı adlandırılmış "blok ve koşucu KENDİ … YAZMAZ" ve ilgisiz "hiçbir şey yazılmaz" cümlelerini yakalamaz); başlık kapsamı ADLANDIRIR (ölçülen dosyalar + KAPSAM DIŞI: canlı API günlüğü, terminal kayıtları); ölçüm: Run kanıt dizini + GO defterinde geçici portal parolası, GO literali ve DB URL YOK' ($absHits.Count -eq 0 -and $srcLines.Count -gt 400 -and $absPosMiss.Count -eq 0 -and $absNegHit.Count -eq 0 -and $scopeMiss.Count -eq 0 -and $pwOk) "taranan satır=$($srcLines.Count) · mutlak iddia=$($absHits.Count)$(if ($absHits.Count) { ' [' + (($absHits | ForEach-Object { $_.Trim().Substring(0, [Math]::Min(70, $_.Trim().Length)) }) -join ' | ') + ']' }) · desen pozitif kaçırılan=$($absPosMiss.Count)/$($absPos.Count) · negatif yanlış=$($absNegHit.Count)/$($absNeg.Count) · kapsam eksik=$($scopeMiss -join ',') · kanıt dosyası=$($evFiles.Count) · parola kanıtta yok=$pwOk"

  Set-Answers @('EVET'); $script:g2err = $null; $consentTxt = Get-HostText { try { Confirm-LiveDataProcessing } catch { $script:g2err = $_.Exception.Message } }
  $need2 = @('Telefondan yükleme OPSİYONELDİR', 'dosyanın ADI', 'MASKESİZ', 'kaynaktan doğrulandı', 'kişisel', 'canlı belge kovasına', 'kovada KALIR', 'BOŞ kova dizini', 'saklandı', 'canlıda ölçülmedi', 'Recover YETKİSİ DEĞİLDİR', 'Recover BAŞLATMAZ', 'kanıt incelendikten sonra', 'AYRI owner')
  $miss2 = @($need2 | Where-Object { $consentTxt -cnotmatch [regex]::Escape($_) })
  $old2 = @(@('(Recover''da owner kararı)', 'maskelenmiş') | Where-Object { $consentTxt -match [regex]::Escape($_) })
  $g2U = $consentTxt.IndexOf('dosyanın ADI'); $g2B = $consentTxt.IndexOf('canlı belge kovasına'); $g2R = $consentTxt.IndexOf('Recover YETKİSİ DEĞİLDİR')
  Check 'G-2' 'owner''a GÖSTERİLEN canlı veri onayı metni: telefon yüklemesinde dosyanın ADI canlı API günlüğüne MASKESİZ yazılır (kaynaktan doğrulandı; kişisel veri içermeyen dosya) → dosya canlı belge kovasına yazılır, silinmezse kovada KALIR → kapanıştan sonra BOŞ kova dizini kalır (saklandı; canlıda ölçülmedi) → çıkış 5/6 Recover YETKİSİ DEĞİLDİR, blok Recover BAŞLATMAZ, karar kanıt incelendikten sonra AYRI owner onayıyla; eski "(Recover''da owner kararı)" ve mutlak iddia YOK; EVET ile istisna yok' ($null -eq $script:g2err -and $miss2.Count -eq 0 -and $old2.Count -eq 0 -and $consentTxt -notmatch $absRe -and $g2U -ge 0 -and $g2U -lt $g2B -and $g2B -lt $g2R) "eksik=$($miss2 -join ',') · eski ifade=$($old2 -join ',') · sıra günlük@$g2U kova@$g2B Recover@$g2R · istisna=$($script:g2err) · satır=$(@($consentTxt -split "`n").Count)"

  $g3Txt = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 6 $true $rcpt @('H') }; $g3 = $script:capR
  $g3zTxt = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true $rcpt @('H') }; $g3z = $script:capR
  # R02 ikinci tur (owner kuralı): İKİNCİ bir Recover TANIMLI DEĞİLDİR — metin "yeni onayla tekrar edilebilir" türü bir YOL tanımlamaz.
  $need3 = @('yeni bir Recover için YETKİ DEĞİLDİR', 'yeniden BAŞLATMAZ', 'İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR', 'owner kararı gerektirir', 'ÖNERİDİR', 'Kanıtı inceleyin', 'OWNER elle siler', 'okunabilirliğini owner düzeltir')
  $miss3 = @($need3 | Where-Object { $g3Txt -cnotmatch [regex]::Escape($_) })
  $path3List = @('YENİ ve AYRI', 'yeni ve ayrı', 'sonraki Recover', 'BİR KEZ', 'bir kez', 'Recover BİR KEZ daha koşulur', 'tekrar edilebilir', 'yeniden başlatılabilir', 'önce belge kovasının')
  $path3 = @($path3List | Where-Object { $g3Txt -cmatch [regex]::Escape($_) })
  $src3 = @(@('YENİ ve AYRI', 'sonraki Recover') | Where-Object { $src0 -cmatch [regex]::Escape($_) })   # kaynakta (yorumlar DAHİL) ikinci Recover yolu yok
  $hdr3 = ($hdrTxt -cmatch 'İKİNCİ bir Recover bu' -and $hdrTxt -cmatch 'paketle TANIMLI DEĞİLDİR, owner kararı gerektirir')
  Check 'G-3' 'Recover çıkış 6: owner''a gösterilen metin bu çıkış kodunun yeni bir Recover için YETKİ olmadığını ve bloğun Recover''ı yeniden BAŞLATMADIĞINI söyler; İKİNCİ bir Recover için YOL TANIMLAMAZ ("bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir"; "YENİ ve AYRI onayla / sonraki Recover / BİR KEZ / tekrar edilebilir" YOK — gösterilen metinde ve kaynakta, yorumlar dahil); kanıttaki adım ÖNERİDİR; blok başlığı aynı kuralı yazar; blok tek node çağrısı yapar (mod recover); Recover çıkış 0''da yetki / ikinci Recover metni yok' ($g3.out -eq 6 -and $g3.nodeCalls -eq 1 -and $g3.last.mode -eq 'recover' -and $miss3.Count -eq 0 -and $path3.Count -eq 0 -and $src3.Count -eq 0 -and $hdr3 -and $g3z.out -eq 0 -and $g3z.nodeCalls -eq 1 -and $g3zTxt -match 'KURTARMA BİTTİ' -and $g3zTxt -cnotmatch 'YETKİ' -and $g3zTxt -cnotmatch 'TANIMLI') "rc=$($g3.out) node=$($g3.nodeCalls) mod=$($g3.last.mode) eksik=$($miss3 -join ',') · yol tanımlayan ifade=$($path3 -join ',') · kaynakta=$($src3 -join ',') · başlık=$hdr3 · çıkış 0: rc=$($g3z.out) node=$($g3z.nodeCalls)"

  # R02 ikinci tur: onay metni kapsamı (V-2) ve kova dizini tek adla (V-3). $consentTxt G-2'de yakalanan GÖSTERİLEN metindir.
  $need5 = @('İKİ yeni sentetik tenantında (hedef + yabancı)', 'Kapsam: koşucu canlı DB''de yalnız bu koşumun iki sentetik tenantına yazar (kaynaktan okundu; koşumda U-ISO yalnız diğer tenantlardaki', 'kullanıcı/müvekkil SAYILARINI ölçer) ve bildirim üreten uçları çağırmaz (statik ölçüt: koşucu öz-testi T-1).')
  $miss5 = @($need5 | Where-Object { $consentTxt -cnotmatch [regex]::Escape($_) })
  $old5 = @(@('Koşucu yalnız bu koşumun sentetik tenantlarına yazar ve bildirim üreten uçları çağırmaz.', 'YALNIZ yeni bir sentetik tenantta', 'PORTAL_DOCUMENTS') | Where-Object { $consentTxt -cmatch [regex]::Escape($_) })
  $bucket5 = @([regex]::Matches($consentTxt, '\(([^()\s]+)/<sentetik tenant>/\)') | ForEach-Object { $_.Groups[1].Value })
  Check 'G-5' 'owner''a GÖSTERİLEN canlı veri onayı metni (ikinci tur): "yalnız … tenantına yazar" iddiası KAPSAMIYLA yazılır (iki sentetik tenant; kaynaktan okundu; koşumda U-ISO yalnız diğer tenantlardaki kullanıcı/müvekkil SAYILARINI ölçer) ve "bildirim üreten uçları çağırmaz" ölçüm türüyle (statik ölçüt: koşucu öz-testi T-1); eski kapsamsız cümle ve "YALNIZ yeni bir sentetik tenantta" YOK; kova dizini metinde TEK adla geçer (portal-documents/<sentetik tenant>/ ×3; PORTAL_DOCUMENTS gösterilen metinde ve kaynakta YOK)' ($miss5.Count -eq 0 -and $old5.Count -eq 0 -and $bucket5.Count -eq 3 -and @($bucket5 | Sort-Object -Unique).Count -eq 1 -and $bucket5[0] -ceq 'portal-documents' -and $src0 -cnotmatch 'PORTAL_DOCUMENTS') "eksik=$($miss5.Count)/$($need5.Count) · eski ifade=$($old5 -join ',') · kova adları=$($bucket5 -join ',') · kaynakta PORTAL_DOCUMENTS=$($src0 -cmatch 'PORTAL_DOCUMENTS')"

  $script:goN = 60; $g4 = [ordered]@{}; $g4Before = @(Node-Calls).Count
  foreach ($c in 5, 6, 0) {
    $g4Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe $c $true }; $iEnd = $g4Txt.IndexOf('Koşum bitti.')   # koşum SONU metni: onay metni hariç
    $g4["$c"] = [pscustomobject]@{ tail = $(if ($iEnd -ge 0) { $g4Txt.Substring($iEnd) } else { '' }); found = ($iEnd -ge 0); r = $script:capR }
  }
  $g4Modes = @(@(Node-Calls) | Select-Object -Skip $g4Before | ForEach-Object { ($_ | ConvertFrom-Json).mode })
  $need4 = @('Recover YETKİSİ DEĞİLDİR', 'Recover BAŞLATMAZ', 'kendi kapanış adımlarını koşucu İÇİNDE', 'kanıtı inceleyin', 'd6-evidence.json', 'ÖNERİDİR', 'AYRI owner onayıyla', 'BİR KEZ')
  $bad4 = @()
  foreach ($k4 in '5', '6') { $x = $g4[$k4]; $miss4 = @($need4 | Where-Object { $x.tail -cnotmatch [regex]::Escape($_) })
    if (-not ($x.found -and $x.r.out -eq [int]$k4 -and $x.r.nodeCalls -eq 1 -and $x.r.last.mode -eq 'run' -and $miss4.Count -eq 0 -and $x.tail -notmatch 'KAPANIŞ DOĞRULANMADI: -Mode Recover')) { $bad4 += "çıkış ${k4}: rc=$($x.r.out) node=$($x.r.nodeCalls) mod=$($x.r.last.mode) eksik=$($miss4 -join ',')" } }
  $zeroRec = ($g4['0'].found -and $g4['0'].r.out -eq 0 -and $g4['0'].r.nodeCalls -eq 1 -and $g4['0'].tail -notmatch 'Recover')
  $runTxt = ($funcs | Where-Object { $_.Name -eq 'Invoke-RunMode' }).Extent.Text
  $resLine = @($runTxt -split "`n" | Where-Object { $_ -cmatch 'BELGE KALINTISI:' })   # büyük/küçük harf duyarlı: çıkış kodu açıklaması ("belge kalıntısı") sayılmaz
  $resOk = ($resLine.Count -eq 1 -and $resLine[0] -cmatch 'Recover BAŞLATMAZ' -and $resLine[0] -cmatch 'kanıt incelendikten sonra' -and $resLine[0] -cmatch 'AYRI owner onayıyla' -and $resLine[0] -cmatch 'otomatik DEĞİL')
  $modesOk = ($g4Modes.Count -eq 3 -and @($g4Modes | Where-Object { $_ -ne 'run' }).Count -eq 0)
  Check 'G-4' 'Recover yetkisi: Run çıkış 5/6''da owner''a gösterilen koşum sonu metni Run''ın kendi kapanış adımlarını (koşucu içinde) Recover''dan AYIRIR, çıkış kodunun Recover YETKİSİ olmadığını ve bloğun Recover BAŞLATMADIĞINI söyler, önce kanıt incelemesini (d6-evidence.json) ister, Recover''ı yalnız AYRI owner onayıyla BİR KEZ ÖNERİR; eski doğrudan "-Mode Recover" talimatı YOK; blok koşum başına tek node çağrısı yapar (3 koşum: mod run ×3, recover çağrısı 0); çıkış 0''da koşum sonu metninde Recover yok; belge kalıntısı satırı da blok başlatmaz + kanıt incelemesi + AYRI owner onayı + otomatik değil der' ($bad4.Count -eq 0 -and $zeroRec -and $resOk -and $modesOk) "hata=$($bad4 -join ' | ') · çıkış 0 Recover metni yok=$zeroRec · kalıntı satırı=$resOk · node modları=$($g4Modes -join ',')"

  # ---- R02 KAPANIŞ METNİ: "DOĞRULANDI" parçaları kanıttaki ölçüt verdict'lerinden kurulur (koşulsuz "yeni giriş + mevcut oturum reddi" iddiası yok).
  function New-ClosureEvid([string]$name, [hashtable]$v) {
    $p = Join-Path $T ("closure-$name.json")
    $res = @($v.Keys | Sort-Object | ForEach-Object { [pscustomobject]@{ id = $_; verdict = $v[$_] } })
    [IO.File]::WriteAllText($p, ([pscustomobject]@{ productFinding = $null; results = $res } | ConvertTo-Json -Depth 4))
    return $p
  }
  $partLabels = @('DB kapalı', 'yeni giriş reddi', 'mevcut oturum reddi', 'belge kalıntısı yok', 'yabancı satır temiz', 'personel/dosya kapanışı')
  function Get-Parts([string]$txt) {
    return (@($partLabels | ForEach-Object { $pm = [regex]::Match($txt, [regex]::Escape($_) + '[^·]*?\]: (PASS|FAIL|ÖLÇÜLMEDİ)'); if ($pm.Success) { $pm.Groups[1].Value } else { 'YOK' } }) -join '/')
  }
  $oldClaim = 'DOĞRULANDI \(DB \+ yeni giriş'
  $vAll = @{ 'P6-D9' = 'PASS'; 'P6-C1' = 'PASS'; 'P6-C2' = 'PASS'; 'P6-C2V' = 'PASS'; 'P6-C5' = 'PASS'; 'P6-C3L' = 'PASS'; 'P6-C3D' = 'PASS'; 'P6-C4L' = 'PASS'; 'P6-C4D' = 'PASS'; 'P6-C-DOC' = 'PASS'; 'P6-FOREIGN-CLEAN' = 'PASS'; 'U-CLOSE' = 'PASS' }
  $cs6 = Get-ClosureStatus (New-ClosureEvid 'all' $vAll) 0
  $extraIds = @('P6-C2', 'P6-C2V', 'P6-C5', 'P6-C3L', 'P6-C3D', 'P6-C4L', 'P6-C4D', 'P6-FOREIGN-CLEAN', 'U-CLOSE')
  $env:EXSTUB_EXTRA = '[' + (($extraIds | ForEach-Object { '{"id":"' + $_ + '","verdict":"PASS"}' }) -join ',') + ']'
  $script:goN = 85; $o6Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 0 $true }; $o6 = $script:capR; Remove-Item 'Env:EXSTUB_EXTRA' -ErrorAction SilentlyContinue
  $d6o = Last-EvDir; $shown6 = [string](Get-Content -Raw -LiteralPath (Join-Path $d6o.FullName 'owner-declaration.json') | ConvertFrom-Json).closureShownToOwner
  Check 'O-6' 'tüm kapanış ölçütleri PASS: metin "P6-D9 PASS" + altı parçanın HER BİRİ için kanıttaki verdict''i (PASS) yazar; mevcut oturumun KOŞUCUNUN kendi oturumu olduğunu ve telefondaki oturumu koşucunun ÖLÇMEDİĞİNİ söyler; eski koşulsuz "DOĞRULANDI (DB + yeni giriş + mevcut oturum reddi …)" cümlesi YOK; aynı metin Run''da owner''a gösterilir ve beyan dosyasına yazılır' ($cs6.verified -and (Get-Parts $cs6.text) -eq 'PASS/PASS/PASS/PASS/PASS/PASS' -and $cs6.text -cmatch 'P6-D9 PASS' -and $cs6.text -cmatch 'koşucunun kendi portal oturumu' -and $cs6.text -cmatch 'koşucu ÖLÇMEZ' -and $cs6.text -notmatch $oldClaim -and $o6.out -eq 0 -and (Get-Parts $shown6) -eq 'PASS/PASS/PASS/PASS/PASS/PASS' -and $shown6.Length -gt 0 -and $o6Txt.Contains($shown6)) "birim=$(Get-Parts $cs6.text) · Run beyanı=$(Get-Parts $shown6) · rc=$($o6.out) · gösterilen metinde=$($shown6.Length -gt 0 -and $o6Txt.Contains($shown6))"
  $vNo = @{ 'P6-D9' = 'PASS'; 'P6-C1' = 'PASS'; 'P6-C-DOC' = 'PASS'; 'P6-FOREIGN-CLEAN' = 'PASS'; 'U-CLOSE' = 'PASS' }
  $cs7 = Get-ClosureStatus (New-ClosureEvid 'noaccount' $vNo) 0
  Check 'O-7' 'portal hesabı hiç açılmamış (P6-D9 PASS ama P6-C2..C5 satırı YOK): DB kapalı / yeni giriş reddi / mevcut oturum reddi "ÖLÇÜLMEDİ" yazılır (PASS iddia edilmez); kalıntı / yabancı satır / personel PASS; eski koşulsuz cümle YOK' ($cs7.verified -and (Get-Parts $cs7.text) -eq 'ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/PASS/PASS/PASS' -and $cs7.text -notmatch $oldClaim) "parçalar=$(Get-Parts $cs7.text)"
  $v8a = $vAll.Clone(); $v8a['P6-C4L'] = 'UNMEASURED'; $v8a['P6-C4D'] = 'UNMEASURED'
  $v8b = $vAll.Clone(); $v8b['P6-C2V'] = 'UNMEASURED'
  $v8c = $vAll.Clone(); $v8c['P6-C3D'] = 'FAIL'; $v8c['P6-C4L'] = 'UNMEASURED'
  $v8d = $vAll.Clone(); $v8d['P6-D9'] = 'FAIL'
  $cs8a = Get-ClosureStatus (New-ClosureEvid 'nosession' $v8a) 0; $cs8b = Get-ClosureStatus (New-ClosureEvid 'c2v' $v8b) 0
  $cs8c = Get-ClosureStatus (New-ClosureEvid 'fail' $v8c) 0; $cs8d = Get-ClosureStatus (New-ClosureEvid 'd9fail' $v8d) 6
  Check 'O-8' 'parça verdict''i kanıttan: koşucu oturumu yoksa (P6-C4L/D UNMEASURED) yalnız mevcut oturum reddi "ÖLÇÜLMEDİ"; gruptaki tek ölçüt PASS değilse (P6-C2V UNMEASURED) grup "ÖLÇÜLMEDİ"; gruptaki bir ölçüt FAIL ise "FAIL" (PASS/ÖLÇÜLMEDİ diye yumuşatılmaz); P6-D9 FAIL ise metin DOĞRULANAMADI ve parça listesi YOK' ((Get-Parts $cs8a.text) -eq 'PASS/PASS/ÖLÇÜLMEDİ/PASS/PASS/PASS' -and (Get-Parts $cs8b.text) -eq 'ÖLÇÜLMEDİ/PASS/PASS/PASS/PASS/PASS' -and (Get-Parts $cs8c.text) -eq 'PASS/FAIL/ÖLÇÜLMEDİ/PASS/PASS/PASS' -and -not $cs8d.verified -and $cs8d.text -match 'DOĞRULANAMADI' -and (Get-Parts $cs8d.text) -eq 'YOK/YOK/YOK/YOK/YOK/YOK') "oturumsuz=$(Get-Parts $cs8a.text) · C2V=$(Get-Parts $cs8b.text) · FAIL=$(Get-Parts $cs8c.text) · D9 FAIL=$(Get-Parts $cs8d.text)"

  # R02 ikinci tur (V-4): parçalar ayrı satırlarda değil, "Koşum bitti." satırının DEVAMINDADIR → metin "bu satırın devamında" der ("aşağıda" değil);
  # satır rengi yalnız birleşik ölçütü (P6-D9) gösterir — not owner'a ayrı satırda yazılır. Renk mantığı (tek `$c` ataması) statik olarak ölçülür.
  $o9Lines = @($o6Txt -split "`n"); $o9Main = @($o9Lines | Where-Object { $_ -cmatch '^Koşum bitti\.' })
  $noteRe = [regex]::Escape('satır rengi yalnız birleşik ölçütü (P6-D9) gösterir')
  $o9Note = @($o9Lines | Where-Object { $_ -cmatch $noteRe })
  $env:EXSTUB_D9 = 'FAIL'; $env:EXSTUB_DOC = 'FAIL'; $script:goN = 90; $o9fTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o9f = $script:capR; $env:EXSTUB_D9 = 'PASS'; $env:EXSTUB_DOC = 'PASS'
  $o9fMain = @($o9fTxt -split "`n" | Where-Object { $_ -cmatch '^Koşum bitti\.' }); $o9fNote = @($o9fTxt -split "`n" | Where-Object { $_ -cmatch $noteRe })
  $o9Color = ([regex]::Matches($declBody, '-ForegroundColor \$c\b')).Count -eq 1 -and $declBody.Contains('$c = if ($closure -and $closure.verified) { ''Green'' } else { ''Red'' }')
  Check 'O-9' 'kapanış satırı (ikinci tur): DOĞRULANDI metni "bu satırın devamında PASS yazan parçalar" der ("aşağıda PASS yazan" gösterilen metinde ve kaynakta YOK); altı parça gerçekten "Koşum bitti." satırının İÇİNDEDİR (tek satır); "satır rengi yalnız birleşik ölçütü (P6-D9) gösterir" notu P6-D9 PASS ve FAIL koşumlarında owner''a gösterilir; renk mantığı değişmedi (tek `-ForegroundColor $c`, `$c` yalnız $closure.verified''a bağlı)' ($cs6.text -cmatch 'DOĞRULANDI yalnız bu satırın devamında PASS yazan parçalar içindir' -and $cs6.text -cnotmatch 'aşağıda PASS yazan' -and $src0 -cnotmatch 'aşağıda PASS yazan' -and $o9Main.Count -eq 1 -and (Get-Parts $o9Main[0]) -eq 'PASS/PASS/PASS/PASS/PASS/PASS' -and $o9Main[0].Contains($shown6) -and $o9Note.Count -eq 1 -and $o9f.out -eq 6 -and $o9fMain.Count -eq 1 -and $o9fMain[0] -cmatch 'DOĞRULANAMADI' -and $o9fNote.Count -eq 1 -and $o9Color) "PASS koşumu: satır=$($o9Main.Count) parçalar=$(if ($o9Main.Count -eq 1) { Get-Parts $o9Main[0] } else { 'YOK' }) not=$($o9Note.Count) · FAIL koşumu: rc=$($o9f.out) satır=$($o9fMain.Count) not=$($o9fNote.Count) · renk mantığı aynı=$o9Color"

  # ---- R03: PIN-1 — bloğun pinleri bu checkout'taki GERÇEK dosya baytlarına eşit (Invoke-ReadOnlyGates ile aynı Sha + Digest yöntemi; canlı kapı KOŞULMAZ)
  $pinBad = @(); $pk1 = [System.Collections.Generic.List[string]]::new(); $pinN = 0
  foreach ($f in $PkgPins.Keys) {
    $p = Join-Path $GovReal $f
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { $pinBad += "YOK:$f"; continue }
    $h = Sha $p; $pinN++
    if ($h -ne $PkgPins[$f]) { $pinBad += "$(Split-Path -Leaf $f)=$($h.Substring(0, 8))≠$($PkgPins[$f].Substring(0, 8))" }
    $pk1.Add(($f -replace '\\', '/') + [char]0 + $h + "`n")
  }
  $dig1 = Digest $pk1
  Check 'PIN-1' 'bloğun PkgPins tablosundaki 9 dosyanın pini bu checkout''taki GERÇEK sha256''ya ve $ExpPackage yeniden hesaplanan paket digest''ine EŞİT (koşucu değişince pin + digest birlikte güncellenir; aksi halde canlı Preflight DUR verirdi)' ($PkgPins.Count -eq 9 -and $pinN -eq 9 -and $pinBad.Count -eq 0 -and $dig1 -eq $ExpPackage) "dosya=$pinN/$($PkgPins.Count) · uyuşmayan=$(if ($pinBad.Count) { $pinBad -join ',' } else { 'yok' }) · digest=$($dig1.Substring(0, 16)) beklenen=$($ExpPackage.Substring(0, 16))"

  # ---- R03: O-10 — Recover bitiş satırı yalnız ölçüleni söyler: 3 "yeni giriş reddi" İDDİASI değildir; 6'da kalıntı DOĞRULANDI / ÖLÇÜLEMEDİ ayrımı kanıta bağlı
  $o10Need = @('3 = DB kapalı, FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN', 'P6-C3L/D satırlarından okunur', 'belge kalıntısı DOĞRULANDI / ÖLÇÜLEMEDİ', 'docResidue.durum')
  # R03-c: döngü değişkeni `$o10t` (önceki `$t`, PowerShell'de büyük/küçük harf duyarsız olduğundan geçici dizin değişkeni `$T`'yi eziyor ve son
  # satırdaki "geçici dizin" çıktısını bozuyordu; ölçüt mantığı değişmedi).
  $o10Miss = @(foreach ($o10t in @($g3Txt, $g3zTxt)) { $o10Need | Where-Object { $o10t -cnotmatch [regex]::Escape($_) } })
  $o10Old = @(@($g3Txt, $g3zTxt, $src0) | Where-Object { $_ -cmatch [regex]::Escape('3 = DB kapalı + yeni giriş reddi') })
  $o10Six = ($g3Txt -cmatch [regex]::Escape('"depolama erişimi ÖLÇÜLEMEDİ" ise belge kovasının okunabilirliğini owner düzeltir') -and $g3Txt -cmatch 'DOĞRULANMIŞ KALINTI')
  Check 'O-10' 'Recover bitiş satırı (çıkış 6 ve 0 koşumlarında GÖSTERİLEN metin): "3 = DB kapalı + yeni giriş reddi" İDDİASI YOK (gösterilen metinde ve kaynakta); 3 = "DB kapalı, FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN" + yeni giriş reddi P6-C3L/D satırlarından okunur; 6''da belge kalıntısı "DOĞRULANDI / ÖLÇÜLEMEDİ" ayrımı kanıttaki P6-C-DOC + docResidue.durum''a bağlı; çıkış 6 yönlendirmesi koşucunun "depolama erişimi ÖLÇÜLEMEDİ" metniyle ve DOĞRULANMIŞ KALINTI ile ayrılır' ($o10Miss.Count -eq 0 -and $o10Old.Count -eq 0 -and $o10Six) "eksik=$($o10Miss -join ',') · eski iddia=$($o10Old.Count) · 6 yönlendirmesi=$o10Six"

  # ---- R03-b: O-11 — Run'daki BELGE KALINTISI satırı (owner'a GÖSTERİLEN metin) kanıttaki P6-C-DOC verdict'ine + docResidue.durum'a bağlı
  $script:goN = 92; $o11 = [ordered]@{}
  foreach ($case in @(@('FAIL', 'DOGRULANMIS_KALINTI', 'FAIL', 6), @('UNMEASURED', 'ERISIM_OLCULEMEDI', 'FAIL', 6), @('PASS', 'YOK', 'PASS', 0))) {
    $env:EXSTUB_DOC = $case[0]; $env:EXSTUB_DOCDURUM = $case[1]; $env:EXSTUB_D9 = $case[2]
    $o11Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe $case[3] $true }
    $o11[$case[0]] = [pscustomobject]@{ lines = @($o11Txt -split "`n" | Where-Object { $_ -cmatch 'BELGE KALINTISI:' }); r = $script:capR }
  }
  $env:EXSTUB_D9 = 'PASS'; $env:EXSTUB_DOC = 'PASS'; Remove-Item 'Env:EXSTUB_DOCDURUM' -ErrorAction SilentlyContinue
  $oF = $o11['FAIL']; $oU = $o11['UNMEASURED']; $oP = $o11['PASS']; $o11Old = 'kalmış olabilir (P6-C-DOC PASS değil)'
  $o11Both = @(@($oF.lines) + @($oU.lines))
  $o11Ok = ($oF.r.out -eq 6 -and $oF.lines.Count -eq 1 -and $oF.lines[0] -cmatch [regex]::Escape('BELGE KALINTISI: DOĞRULANDI (P6-C-DOC FAIL · docResidue.durum=DOGRULANMIS_KALINTI)') -and $oF.lines[0] -cnotmatch 'ÖLÇÜLEMEDİ' -and
            $oU.r.out -eq 6 -and $oU.lines.Count -eq 1 -and $oU.lines[0] -cmatch [regex]::Escape('BELGE KALINTISI: ÖLÇÜLEMEDİ (P6-C-DOC ÖLÇÜLEMEYEN · docResidue.durum=ERISIM_OLCULEMEDI)') -and $oU.lines[0] -cmatch 'okunabilirliğini owner düzeltir' -and $oU.lines[0] -cnotmatch 'DOĞRULANDI' -and
            $oP.r.out -eq 0 -and $oP.lines.Count -eq 0 -and
            @($o11Both | Where-Object { $_ -cmatch [regex]::Escape($o11Old) }).Count -eq 0 -and $src0 -cnotmatch [regex]::Escape($o11Old) -and
            @($o11Both | Where-Object { $_ -cmatch 'Recover BAŞLATMAZ' -and $_ -cmatch 'kanıt incelendikten sonra' -and $_ -cmatch 'AYRI owner onayıyla' -and $_ -cmatch 'otomatik DEĞİL' }).Count -eq 2)
  Check 'O-11' 'Run''daki BELGE KALINTISI satırı (owner''a GÖSTERİLEN metin) kanıttaki P6-C-DOC verdict''ine + docResidue.durum''a bağlı: FAIL → "DOĞRULANDI (P6-C-DOC FAIL · docResidue.durum=DOGRULANMIS_KALINTI)" ("ÖLÇÜLEMEDİ" yok); ÖLÇÜLEMEYEN + ERISIM_OLCULEMEDI → "ÖLÇÜLEMEDİ (P6-C-DOC ÖLÇÜLEMEYEN · …)" + kova okunabilirliği ("DOĞRULANDI" yok); PASS → satır YOK; eski "kalmış olabilir (P6-C-DOC PASS değil)" gösterilen metinde ve kaynakta YOK; iki satır da Recover BAŞLATMAZ + kanıt incelendikten sonra + AYRI owner onayı + otomatik değil der; çıkış kodu değişmeden' $o11Ok "FAIL: rc=$($oF.r.out) [$(@($oF.lines) -join ' | ')] · ÖLÇÜLEMEYEN: rc=$($oU.r.out) [$(@($oU.lines) -join ' | ')] · PASS: rc=$($oP.r.out) satır=$($oP.lines.Count) · eski metin kaynakta=$($src0 -cmatch [regex]::Escape($o11Old))"

  # ---- R03-c: O-12 — Recover bitiş satırı (GÖSTERİLEN metin; çıkış 0/1/2/3/6): her kod yalnız ölçülenle açıklanır (1 ve 2 dahil); mevcut oturum reddinin
  #      Recover'da HER ZAMAN ölçülemediği ve yeni giriş reddinin P6-C3L/D satırlarından okunduğu kodlardan ÖNCE, genel olarak yazılır.
  # R03-d (M2): kanıtsız çıkışlar AYRI ölçülür (aşağıda) — buradaki beş koşum sahte koşucunun kanıt yazdığı (record + exitCode = çıkış) durumlardır.
  $o12 = [ordered]@{}
  foreach ($c in 0, 1, 2, 3, 6) {
    $o12Txt = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe $c $true $rcpt @('H') }
    $o12["$c"] = [pscustomobject]@{ lines = @($o12Txt -split "`n" | Where-Object { $_ -cmatch 'KURTARMA BİTTİ' }); r = $script:capR }
  }
  # R03-d (M2): "1 + kanıt yok" (koşucu yakalanmamış hatayla kanıt yazmadan 1 — bağımsız doğrulamada ölçüldü) · "3 + kanıttaki exitCode 1" (kod farklı)
  $o12nTxt = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 1 $false $rcpt @('H') }; $o12n = $script:capR
  $env:EXSTUB_EV_EXITCODE = '1'; $o12kTxt = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 3 $true $rcpt @('H') }; $o12k = $script:capR; Remove-Item 'Env:EXSTUB_EV_EXITCODE' -ErrorAction SilentlyContinue
  $o12nLine = @($o12nTxt -split "`n" | Where-Object { $_ -cmatch 'KURTARMA BİTTİ' }); $o12kLine = @($o12kTxt -split "`n" | Where-Object { $_ -cmatch 'KURTARMA BİTTİ' })
  $legendRe = '0 = Recover anında|aynı kapanışlar doğrulandı|3 = DB kapalı'
  $o12NoEv = ($o12n.out -eq 1 -and $o12n.nodeCalls -eq 1 -and $o12nLine.Count -eq 1 -and $o12nLine[0].Contains('KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi') -and $o12nLine[0] -cnotmatch $legendRe -and
              $o12nTxt.Contains('İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR') -and $o12k.out -eq 3 -and $o12kLine.Count -eq 1 -and $o12kLine[0].Contains('KAPANIŞ DOĞRULANMADI — kanıttaki exitCode (1) süreç çıkış koduyla (3) EŞİT DEĞİL') -and $o12kLine[0] -cnotmatch $legendRe)
  $o12Need = @("HER KODDA: mevcut oturum reddi Recover'da ÖLÇÜLEMEZ — HER ZAMAN (P6-C4L/D", 'P6-C3L/D satırlarından okunur', "0 = Recover anında portal hesabı DB'de YOK (ölçüldü)", 'HTTP reddi ÖLÇÜLMEDİ (hesap yok)',
               '3 = DB kapalı, FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN', '2 = aynı kapanışlar doğrulandı, en az bir satır FAIL', 'yalnız P6-FOREIGN-CLEAN üretir', '1 = DURDU: aynı kapanışlar doğrulandı ama Recover''ın hazırlık adımında hata (kanıttaki fatal alanı',
               '6 portal DB/HTTP kapanışı doğrulanmadı', '5 personel/dosya kapanışı doğrulanmadı', '4 kimlik reddi', '7 kanıt yok', '91 node başlatılamadı')
  $o12Bad = @()
  foreach ($k in $o12.Keys) {
    $x = $o12[$k]; $l = if (@($x.lines).Count -eq 1) { [string]$x.lines[0] } else { '' }
    $miss = @($o12Need | Where-Object { $l -cnotmatch [regex]::Escape($_) }); $iGen = $l.IndexOf('HER KODDA'); $i0 = $l.IndexOf('0 = Recover anında')
    if (-not ($x.r.out -eq [int]$k -and $x.r.nodeCalls -eq 1 -and @($x.lines).Count -eq 1 -and $miss.Count -eq 0 -and $iGen -ge 0 -and $iGen -lt $i0 -and $l -cnotmatch 'hiç açılmamıştı')) { $o12Bad += "çıkış ${k}: rc=$($x.r.out) satır=$(@($x.lines).Count) eksik=$($miss -join ' | ')" }
  }
  Check 'O-12' 'Recover bitiş satırı (GÖSTERİLEN metin; kanıtlı Recover çıkış 0, 1, 2, 3, 6 koşumları): kodlardan ÖNCE genel olarak "HER KODDA: mevcut oturum reddi Recover''da ÖLÇÜLEMEZ — HER ZAMAN (P6-C4L/D …)" + yeni giriş reddi P6-C3L/D satırlarından okunur; 0 = "Recover anında portal hesabı DB''de YOK (ölçüldü)" ("hiç açılmamıştı" YOK) + HTTP reddi ÖLÇÜLMEDİ; 3 = DB kapalı, FAIL yok, ÖLÇÜLEMEYEN var; 2 = aynı kapanışlar doğrulandı + FAIL (kaynaktan: yalnız P6-FOREIGN-CLEAN); 1 = DURDU + hazırlık hatası (fatal); 6 / 5 / 4 / 7 / 91 açıklamalı; çıkış kodu değişmeden, tek node çağrısı · R03-d (M2): "1 + kanıt yok" → kırmızı "KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi" ve kod açıklamaları (0 / "aynı kapanışlar doğrulandı" / 3) YAZILMAZ + ikinci Recover tanımlı değil; kanıttaki exitCode süreç kodundan farklıysa (3 vs 1) "KAPANIŞ DOĞRULANMADI — kanıttaki exitCode (1) süreç çıkış koduyla (3) EŞİT DEĞİL", açıklama yok' ($o12Bad.Count -eq 0 -and $o12NoEv) "hata=$(if ($o12Bad.Count) { $o12Bad -join ' || ' } else { 'yok' }) · koşum=$($o12.Keys -join ',') · 1+kanıt yok: rc=$($o12n.out) satır=[$(@($o12nLine) -join ' | ')] · kod farklı: rc=$($o12k.out) satır=[$(@($o12kLine) -join ' | ')]"

  # ---- R03-d: O-14 (m3) — Recover 3'ün metni ölçülenle: P6-C2 / P6-C5 ve P6-C-DOC ölçüldü; P6-C2V yalnız "FAIL değil" (ÖLÇÜLEMEYEN olabilir); eski "(P6-C2/C2V/C5) … ölçüldü" YOK
  $l3 = if (@($o12['3'].lines).Count -eq 1) { [string]$o12['3'].lines[0] } else { '' }
  $o14Old = 'portal DB kapanışı (P6-C2/C2V/C5) ve belge kalıntısı yokluğu (P6-C-DOC) ölçüldü'
  $o14New = $l3.Contains('P6-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir'); $o14OldSrc = $src0.Contains($o14Old)
  Check 'O-14' 'Recover 3 metni (GÖSTERİLEN, kanıtlı çıkış 3) ölçülenle: "P6-C2 / P6-C5 ve P6-C-DOC ölçüldü; P6-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir — kanıttaki satır)"; eski "portal DB kapanışı (P6-C2/C2V/C5) … ölçüldü" iddiası gösterilen metinde ve kaynakta YOK; 2 ve 1 "aynı kapanışlar" atfıyla bu metne bağlı' ($l3.Contains('3 = DB kapalı, FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN — P6-C2 / P6-C5 ve P6-C-DOC ölçüldü; P6-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir — kanıttaki satır)') -and -not $l3.Contains($o14Old) -and -not $src0.Contains($o14Old) -and $l3.Contains('2 = aynı kapanışlar doğrulandı')) "3 satırı=$($l3.Length) karakter · yeni metin=$o14New · eski kaynakta=$o14OldSrc"

  # ---- R03-c: O-13 — Run çıkış 5/6 metni Recover komutunu YALNIZ kanıt dizinindeki makbuz dosyası Recover'ın okuma kapısını geçiyorsa önerir
  # R03-d: m4 (kanıttaki makbuzJson → yeni dosya: TEK komut) + m7 (BAYAT makbuz önerilmez) ile beklentiler değişti; 'bayat' durumu eklendi.
  # R04 (DEĞİŞTİ; owner kararı 2026-10-04): kanıtta makbuz metni (recovery.makbuzJson) VARSA — kanıt dizinindeki makbuz dosyası VAR / YOK / bozuk / BAYAT fark
  #   etmeksizin — öneri elle komut yerine "-Mode Recover -RunEvidenceDir '<kanıt dizini>'" (SOMUT yol; AYRI owner onayıyla, BİR KEZ, otomatik DEĞİL); elle TEK komut
  #   ve "-ReceiptFile <makbuz>" / "-ReceiptFile '<yol>'" önerisi GÖSTERİLMEZ; dosyanın durumu bilgi olarak yazılır + "-ReceiptFile ile VERMEYİN". Kanıtta makbuz
  #   metni yoksa SOMUT ENGEL (değişmedi). Run tek node çağrısı yapar (mod run) — otomatik Recover YOK.
  $o13 = [ordered]@{}; $script:goN = 30   # 31..35 başka ölçütte kullanılmaz (GO defteri tekrar kullanımı reddeder; GO biçimi iki haneli R\d{2})
  foreach ($case in @(@('var', '0', '1', 6, '0'), @('yok', '1', '1', 6, '0'), @('bozuk', 'B', '1', 5, '0'), @('yok-kanitta-yok', '1', '0', 6, '0'), @('bayat', '0', '1', 6, '1'))) {
    $env:EXSTUB_NO_RECEIPT = $case[1]; $env:EXSTUB_EV_RECEIPT = $case[2]; $env:EXSTUB_STALE = $case[4]
    $o13Txt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe $case[3] $true }; $iEnd = $o13Txt.IndexOf('Koşum bitti.')
    $o13[$case[0]] = [pscustomobject]@{ tail = $(if ($iEnd -ge 0) { $o13Txt.Substring($iEnd) } else { '' }); r = $script:capR; rc = $case[3]; ev = (Last-EvDir).FullName }
  }
  Remove-Item 'Env:EXSTUB_NO_RECEIPT', 'Env:EXSTUB_EV_RECEIPT', 'Env:EXSTUB_STALE' -ErrorAction SilentlyContinue
  $o13Var = $o13['var']; $o13Yok = $o13['yok']; $o13Boz = $o13['bozuk']; $o13Eng = $o13['yok-kanitta-yok']; $o13Bay = $o13['bayat']
  $optOk = { param($x, [string]$state) $q = ([string]$x.ev).Replace("'", "''")
             $x.tail.Contains("    -Mode Recover -RunEvidenceDir '$q'") -and $x.tail.Contains('AYRI owner onayıyla, BİR KEZ') -and $x.tail.Contains('otomatik DEĞİL') -and
             $x.tail.Contains('Run kanıt dizininin DIŞINDA kardeş bir dizine') -and $x.tail.Contains('biri tutmazsa Recover BAŞLAMAZ') -and
             $x.tail.Contains("Kanıt dizinindeki makbuz dosyası (d6-setup-receipt.json): $state") -and $x.tail.Contains('-ReceiptFile ile VERMEYİN') -and
             $x.tail.Contains('kanıttaki kurtarma adımı da bu seçeneği gösterir') -and -not $x.tail.Contains('elle komut') -and   # R04-b: koşucunun adımı da aynı seçenek (elle komut koşucudan kalktı)
             -not $x.tail.Contains('makbuzJson | Set-Content') -and -not $x.tail.Contains('-ReceiptFile <makbuz>') -and -not $x.tail.Contains("-ReceiptFile '") -and $x.tail -cnotmatch 'SOMUT ENGEL' }
  # Dört durumun sonucu önce değişkene alınır (çift tırnaklı gözlem dizgesinin içinde tek tırnaklı, parantezi kapanmayan metin ayrıştırılamaz).
  $o13sVar = [bool](& $optOk $o13Var 'VAR — kanıttaki son makbuz metniyle (recovery.makbuzJson) EŞİT'); $o13sYok = [bool](& $optOk $o13Yok 'YOK'); $o13sBoz = [bool](& $optOk $o13Boz 'OKUNAMIYOR')
  $o13sBay = [bool](& $optOk $o13Bay 'BAYAT (kanıttaki son makbuz metniyle — recovery.makbuzJson — EŞİT DEĞİL')
  $o13Ok = (@($o13.Values | Where-Object { $_.r.out -ne $_.rc -or $_.r.nodeCalls -ne 1 -or $_.r.last.mode -ne 'run' }).Count -eq 0 -and
            $o13sVar -and $o13sYok -and $o13sBoz -and $o13sBay -and
            -not $o13Eng.tail.Contains('-RunEvidenceDir') -and -not $o13Eng.tail.Contains('-ReceiptFile <') -and -not $o13Eng.tail.Contains("-ReceiptFile '") -and -not $o13Eng.tail.Contains('makbuzJson | Set-Content') -and
            $o13Eng.tail.Contains('SOMUT ENGEL: kanıtta makbuz metni (recovery.makbuzJson) YOK') -and $o13Eng.tail.Contains('owner/CLIENT'))
  Check 'O-13' 'R04 (DEĞİŞTİ; R04-b: "kanıttaki kurtarma adımı da bu seçeneği gösterir", "elle komut" ifadesi YOK): Run çıkış 5/6 metni (GÖSTERİLEN) — kanıtta makbuz metni (recovery.makbuzJson) varken (kanıt dizinindeki makbuz dosyası VAR / YOK (6) / bozuk (5) / BAYAT (6)) "    -Mode Recover -RunEvidenceDir ''<kanıt dizini>''" SOMUT yolla, "AYRI owner onayıyla, BİR KEZ", "otomatik DEĞİL", makbuzun Run kanıt dizininin DIŞINDA kardeş bir dizine yazılacağı ve doğrulama tutmazsa Recover''ın BAŞLAMAYACAĞI yazılır; dosyanın durumu (VAR — … EŞİT / YOK / OKUNAMIYOR / BAYAT …) bilgi olarak + "-ReceiptFile ile VERMEYİN"; elle TEK komut ("makbuzJson | Set-Content"), "-ReceiptFile <makbuz>" ve "-ReceiptFile ''<yol>''" önerisi YOK; kanıtta makbuz metni yoksa "SOMUT ENGEL" (seçenek / komut YOK) + owner/CLIENT; çıkış kodu değişmeden, tek node çağrısı (mod run; otomatik Recover YOK)' $o13Ok "istisna=$(@($o13.Values | ForEach-Object { $_.r.threw } | Where-Object { $_ }) -join ' | ') · var: rc=$($o13Var.r.out) seçenek=$o13sVar · yok: rc=$($o13Yok.r.out) seçenek=$o13sYok · bozuk: rc=$($o13Boz.r.out) seçenek=$o13sBoz · bayat: rc=$($o13Bay.r.out) seçenek=$o13sBay · kanıtta-yok: rc=$($o13Eng.r.out) engel=$($o13Eng.tail.Contains('SOMUT ENGEL')) seçenek=$($o13Eng.tail.Contains('-RunEvidenceDir'))"

  # ---- R03-d: O-15 KALDIRILDI (R04): blok artık elle TEK komutu göstermez; makbuzu -RunEvidenceDir ile blok yazar ve doğrular → RG-1 (iki kabukta, GERÇEK koşucunun
  #      readReceiptForRecover kapısı dahil). O-15'in ölçtüğü TEK komut kanıttaki kurtarma adımı metninde (koşucu) kalır; bloğun öneri yolu değildir.

  # ---- R03-d: O-16 (M1, blok tarafı) — ürün bulgusu ADAYI (kanıtta portalClose.sessionVersion.sinif=ADAY) "ADAYIDIR (CLIENT doğrular)" diye gösterilir; kesin bulgu metni korunur
  $env:EXSTUB_FINDING = 'ÜRÜN BULGUSU ADAYI: x'; $env:EXSTUB_SV = 'ADAY'; $env:EXSTUB_D9 = 'FAIL'; $script:goN = 37
  $o16aTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o16a = $script:capR
  $env:EXSTUB_FINDING = 'ÜRÜN BULGUSU: y'; Remove-Item 'Env:EXSTUB_SV' -ErrorAction SilentlyContinue; $script:goN = 38
  $o16bTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o16b = $script:capR
  Remove-Item 'Env:EXSTUB_FINDING' -ErrorAction SilentlyContinue; $env:EXSTUB_D9 = 'PASS'
  $o16Ok = ($o16a.out -eq 6 -and $o16aTxt.Contains('ÜRÜN BULGUSU ADAYI: x — bu bir ÜRÜN BULGUSU ADAYIDIR (CLIENT doğrular); kapanış PASS SAYILMAZ') -and -not $o16aTxt.Contains('bu bir ÜRÜN BULGUSUDUR') -and
            $o16b.out -eq 6 -and $o16bTxt.Contains('ÜRÜN BULGUSU: y — bu bir ÜRÜN BULGUSUDUR; kapanış PASS SAYILMAZ') -and -not $o16bTxt.Contains('ADAYIDIR'))
  Check 'O-16' 'ürün bulgusu satırı (GÖSTERİLEN): kanıtta portalClose.sessionVersion.sinif=ADAY ise "… — bu bir ÜRÜN BULGUSU ADAYIDIR (CLIENT doğrular)" ("ÜRÜN BULGUSUDUR" YOK); sınıf yoksa (P6-C2 + P6-C5 PASS iken kesin bulgu) "… — bu bir ÜRÜN BULGUSUDUR" aynen; kanıt -Encoding UTF8 ile okunur (WinPS 5.1''de Türkçe metin bozulmadan gösterilir)' $o16Ok "aday: rc=$($o16a.out) ADAYIDIR=$($o16aTxt.Contains('ADAYIDIR (CLIENT doğrular)')) · kesin: rc=$($o16b.out) BULGUSUDUR=$($o16bTxt.Contains('bu bir ÜRÜN BULGUSUDUR'))"

  # ---- R03-e: O-17 (B1, blok tarafı) — kanıtta portalClose.acikErisim varsa "PORTAL ERİŞİMİ: …" AYRI satırda gösterilir; ürün bulgusu satırı onu İÇERMEZ (birleşik tek satır YOK)
  $o17Find = 'ÜRÜN BULGUSU ADAYI (T2): eski portal oturumu sürüm reddine rağmen belge listesine erişti (ölçüm); oturum reddi ürün tarafıdır, Recover düzeltemez'
  $o17Acik = 'portal hesabı açık (HTTP ölçümlerinden sonra isActive=true hasPortalAccess=true sürüm=2) — açık erişim kapatılmalıdır (Recover kapatabilir)'
  $env:EXSTUB_FINDING = $o17Find; $env:EXSTUB_SV = 'ADAY'; $env:EXSTUB_ACIK = $o17Acik; $env:EXSTUB_D9 = 'FAIL'; $script:goN = 39
  $o17aTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o17a = $script:capR
  Remove-Item 'Env:EXSTUB_ACIK' -ErrorAction SilentlyContinue; $script:goN = 40
  $o17bTxt = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }; $o17b = $script:capR
  Remove-Item 'Env:EXSTUB_FINDING', 'Env:EXSTUB_SV' -ErrorAction SilentlyContinue; $env:EXSTUB_D9 = 'PASS'
  $o17aLines = @($o17aTxt -split "`n"); $o17FindL = @($o17aLines | Where-Object { $_.Contains($o17Find) }); $o17AcikL = @($o17aLines | Where-Object { $_ -cmatch '^\s*PORTAL ERİŞİMİ: ' })
  $o17Ok = ($o17a.out -eq 6 -and $o17FindL.Count -eq 1 -and $o17AcikL.Count -eq 1 -and $o17FindL[0] -ne $o17AcikL[0] -and $o17AcikL[0].Contains("PORTAL ERİŞİMİ: $o17Acik") -and
            -not $o17FindL[0].Contains('Recover kapatabilir') -and -not $o17FindL[0].Contains('açık erişim') -and -not $o17AcikL[0].Contains('Recover düzeltemez') -and $o17FindL[0].Contains('ADAYIDIR (CLIENT doğrular)') -and
            $o17b.out -eq 6 -and @($o17bTxt -split "`n" | Where-Object { $_ -cmatch '^\s*PORTAL ERİŞİMİ: ' }).Count -eq 0)
  Check 'O-17' 'R03-e: ürün bulgusu satırı ile açık portal erişimi satırı (GÖSTERİLEN) AYRI — kanıtta portalClose.acikErisim varsa "PORTAL ERİŞİMİ: portal hesabı açık (…) — açık erişim kapatılmalıdır (Recover kapatabilir)" kendi satırında; ürün bulgusu satırı ("… Recover düzeltemez — bu bir ÜRÜN BULGUSU ADAYIDIR …") "Recover kapatabilir" / "açık erişim" İÇERMEZ, açık erişim satırı "Recover düzeltemez" İÇERMEZ; acikErisim yoksa "PORTAL ERİŞİMİ:" satırı YOK; çıkış kodu değişmeden' $o17Ok "açık: rc=$($o17a.out) bulgu satırı=$($o17FindL.Count) erişim satırı=$($o17AcikL.Count) [$(@($o17AcikL) -join ' | ')] · açık yok: rc=$($o17b.out)"

  # ---- R03-f: O-18 (F2 + F6, blok tarafı; statik) — blok kaynağında (yorumlar DAHİL) Recover'ın açık erişimi kapatabileceğine dair kesin ifade YOK ve R03-d'den
  #      kalma bayat ADAY yorumu YOK; ADAY yorumu karar tablosunu (sessionClass200) adlandırır. Gösterilen "PORTAL ERİŞİMİ:" metni koşucudan gelir (O-17).
  $o18Src = [IO.File]::ReadAllText($wrapper, [Text.Encoding]::UTF8)
  $o18Kap = ([regex]::Matches($o18Src, 'Recover kapatabilir')).Count; $o18Eski = ([regex]::Matches($o18Src, [regex]::Escape('P6-C2 PASS + P6-C5 FAIL iken sürüm sınıflaması'))).Count
  $o18Ok = ($o18Src.Length -gt 1000 -and $o18Kap -eq 0 -and $o18Eski -eq 0 -and $o18Src.Contains('sessionClass200 karar tablosunun ADAY hücreleri'))
  Check 'O-18' 'R03-f (F2 + F6): blok kaynağında (yorumlar dahil) "Recover kapatabilir" YOK; R03-d''den kalma bayat yorum ("P6-C2 PASS + P6-C5 FAIL iken sürüm sınıflaması") YOK; ADAY gösterim yorumu "sessionClass200 karar tablosunun ADAY hücreleri" der' $o18Ok "kaynak=$($o18Src.Length) karakter · Recover-kapatabilir sayısı=$o18Kap · bayat R03-d yorumu=$o18Eski · karar tablosu yorumu=$($o18Src.Contains('sessionClass200 karar tablosunun ADAY hücreleri'))"

  # ================================================================ R04 — RG-1..RG-10: `-Mode Recover -RunEvidenceDir` (owner kararı 2026-10-04, madde 5 + 6)
  # KAYNAK: sahte koşucuyla GERÇEK Invoke-RunMode'un ürettiği tamamlanmış Run kanıt dizini (kanıt + owner-block.json + goref-consumed.json + owner-declaration.json +
  #   makbuz + log + SHA256-MANIFEST.txt; GO defteri satırı). Ret kalemleri bu dizinin KOPYALARI üzerinde koşar (her kopya AYRI üst dizinde → kardeş dizinler
  #   karışmaz); kopyada bir dosya değiştirilirse manifest bloğun kendi Write-Manifest'iyle yeniden yazılır ("manifest uyuşmaz" kalemleri hariç).
  # YÖNTEM: her kalem kendi istisnasını yakalar (Invoke-RgItem) — eski blok baytlarında fonksiyon yoksa kalem FAIL verir, öz-test "ölçülemedi"ye düşmez. Fonksiyon /
  #   değişken gölgeleri (yazma hatası, geri okuma, zaman damgası, GO defteri) kalemin KENDİ kapsamında tanımlanır ve kalem bitince kendiliğinden kalkar (R-7'deki
  #   `node` gölgesiyle aynı yöntem). Her ret kalemi SOMUT neden metnini ister (yalnız "DUR" yetmez) → eski blokta rastlantıyla PASS vermez.
  function Invoke-RgItem([string]$id, [string]$desc, [scriptblock]$body) {
    $res = $null; $err = $null
    try { $res = @(& $body) | Select-Object -Last 1 } catch { $err = $_.Exception.Message }
    Check $id $desc ([bool]($null -eq $err -and $res -and $res.ok -eq $true)) ($(if ($res) { [string]$res.obs } else { 'sonuç yok' }) + $(if ($err) { " · istisna=$err" } else { '' }))
  }
  function Get-RgSnap([string]$dir) {
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) { return 'DİZİN-YOK' }
    return ((@(Get-ChildItem -LiteralPath $dir -Force | Sort-Object Name | ForEach-Object { if ($_.PSIsContainer) { "D:$($_.Name)" } else { "F:$($_.Name):$(Sha $_.FullName)" } })) -join '|')
  }
  function New-RgCase([string]$name, [string[]]$skip = @(), [string]$leaf = '') {
    $up = Join-Path $rgRoot $name; New-Item -ItemType Directory -Path $up | Out-Null
    $dst = Join-Path $up $(if ($leaf) { $leaf } else { Split-Path -Leaf $rgSrc }); New-Item -ItemType Directory -Path $dst | Out-Null
    foreach ($f in @(Get-ChildItem -LiteralPath $rgSrc -File -Force)) { if ($skip -notcontains $f.Name) { [IO.File]::WriteAllBytes((Join-Path $dst $f.Name), [IO.File]::ReadAllBytes($f.FullName)) } }
    return $dst
  }
  function Edit-RgFile([string]$dir, [string]$name, [string]$old, [string]$new, [bool]$manifest = $true) {
    $p = Join-Path $dir $name; $enc = [Text.UTF8Encoding]::new($false); $txt = [IO.File]::ReadAllText($p, $enc)
    if (-not $txt.Contains($old)) { throw "RG düzeneği: $name içinde beklenen metin yok [$old]" }
    [IO.File]::WriteAllText($p, $txt.Replace($old, $new), $enc)
    if ($manifest) { Write-Manifest $dir }
  }
  # Recover'ı -RunEvidenceDir ile koşar; gösterilen metni, sonucu, kardeş dizinlerin durumunu ve kaynak dizinin değişip değişmediğini (ad + sha256 dökümü) döndürür.
  function Invoke-RgRecover([string]$dir, [string[]]$answers = @('H'), [string]$receipt = '', [int]$stubRc = 0) {
    $up = Split-Path -Parent $dir; $snapBefore = Get-RgSnap $dir
    $txt = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe $stubRc $true $receipt $answers 'PASS' $okChain $dir }; $r = $script:capR
    $sib = @(if (Test-Path -LiteralPath $up -PathType Container) { Get-ChildItem -LiteralPath $up -Force | Where-Object { $_.Name -like '*.recover-girdi-*' } })
    $sibDirs = @($sib | Where-Object { $_.PSIsContainer })
    $inSib = { param([string]$n) @($sibDirs | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName $n) -PathType Leaf }).Count }
    return [pscustomobject]@{ r = $r; txt = $txt; msg = [string]$r.threw; dur = ($r.threw -like 'EXTACC-D6-DUR:*'); node = $r.nodeCalls; sib = $sib.Count; sibDirs = $sibDirs
      receipts = (& $inSib 'd6-setup-receipt-kanittan.json'); records = (& $inSib 'RECOVER-GIRDI-KAYDI.json'); marks = (& $inSib 'RECOVER-GIRDI-KULLANILMAZ.txt')
      recDirs = @($sibDirs | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory -Filter 'recover-*' }).Count; same = ((Get-RgSnap $dir) -ceq $snapBefore); ledger = $r.ledgerDelta }
  }
  # Yazımdan ÖNCE ret: DUR + somut neden + "Recover başlamadı" + node çağrısı 0 + kardeş dizin OLUŞMADI + kaynak dizin değişmedi + GO defteri değişmedi.
  $rgPre = { param($x, [string]$needle) [bool]($x.dur -and $x.msg.Contains($needle) -and $x.msg.Contains('Recover başlamadı') -and $x.node -eq 0 -and $x.sib -eq 0 -and $x.same -and $x.ledger -eq 0) }
  # Hedef dizin oluştuktan SONRA ret: DUR + somut neden + "Recover BAŞLAMADI (başarı sayılmaz)" + dizin SİLİNMEDİ + KULLANILMAZ işareti + kayıt dosyası yok + recover-* yok + node 0.
  $rgPost = { param($x, [string]$needle) [bool]($x.dur -and $x.msg.Contains($needle) -and $x.msg.Contains('Recover BAŞLAMADI (başarı sayılmaz)') -and $x.msg.Contains('Hedef dizin SİLİNMEDİ') -and $x.msg.Contains('KULLANILMAZ diye işaretlendi (RECOVER-GIRDI-KULLANILMAZ.txt)') -and
                                           $x.node -eq 0 -and $x.sib -eq 1 -and $x.marks -eq 1 -and $x.records -eq 0 -and $x.recDirs -eq 0 -and $x.ledger -eq 0) }
  $rgRoot = Join-Path $T 'rg'; New-Item -ItemType Directory -Path $rgRoot | Out-Null
  $rgExpFile = Join-Path $T 'rg-beklenen-makbuz.txt'; $rgSrc = $null; $rgRunId = $null; $rgExp = $null; $rgSetupErr = $null; $rgOther = 'ffffffff'
  try {
    # Beklenen baytlar: sahte koşucunun yazdığı makbuz metni (node, UTF-8) — PowerShell'in JSON ayrıştırmasından BAĞIMSIZ kaynak.
    $env:EXSTUB_EXPECT_COPY = $rgExpFile; $script:goN = 20
    $null = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true }
    if ($script:capR.out -ne 6) { throw "RG kaynağı Run çıkışı $($script:capR.out) (6 bekleniyor) · $($script:capR.threw)" }
    $rgSrc = (Last-EvDir).FullName; $rgRunId = [regex]::Match((Split-Path -Leaf $rgSrc), '^extacc-d6-live-([0-9a-f]{8})-').Groups[1].Value
    $rgExp = [IO.File]::ReadAllBytes($rgExpFile); if ($rgRunId -ceq $rgOther) { $rgOther = 'eeeeeeee' }
  } catch { $rgSetupErr = $_.Exception.Message } finally { Remove-Item 'Env:EXSTUB_EXPECT_COPY' -ErrorAction SilentlyContinue }

  Invoke-RgItem 'RG-1' 'R04 geçerli çıkarma (GERÇEK Run kanıt dizini, -RunEvidenceDir, kalıntı kararı H): hedef Run dizininin KARDEŞİ "<Run dizini>.recover-girdi-<UTC yyyyMMddTHHmmssZ>" (Run dizininin İÇİNDE değil); yeni makbuzun baytları sahte koşucunun yazdığı makbuz metninin UTF-8 baytlarına BİREBİR eşit (tarih biçimli alan + ASCII dışı karakter + ters bölü dahil), BOM YOK ("{" ile başlar), satır sonu yalnız LF (CR yok), sonda ek satır sonu YOK ("}" ile biter); RECOVER-GIRDI-KAYDI.json (BOM''suz): kaynak dizin adı + kanıt adı + kanıt sha256 + manifest sha256 + manifest satırı + runId + yeni dosyanın sha256''sı / bayt sayısı + kodlama tanımı + bağımsız çapa durumu (manifest ve kanıt için YOK; runId için GO defteri); Run kanıt dizini (dosya adları + her dosyanın sha256''sı, alt dizin yok) ve manifest DEĞİŞMEDİ; Recover (sahte koşucu) YENİ dosyayla başladı (mod recover, kalıntı=0, tek node çağrısı) ve GERÇEK koşucunun readReceiptForRecover kapısı "ok"; recover-* kanıt dizini kardeş dizinde; ekranda kaynak özeti + "SINIR: manifestin bağımsız çapası YOK" Recover bitiş satırından ÖNCE; GO defteri değişmedi; R04-b: makbuz koşucuya SALT OKUNUR verildi (D6_RECEIPT_READONLY=1; sahte koşucu gerçek koşucu gibi yalnız bayrak yokken yeniden yazar) → Recover''dan SONRA makbuzun baytları ve sha256''sı (= kayıttaki makbuzSha256) DEĞİŞMEDİ, kayıtta makbuzRecoverda "SALT OKUNUR", bitiş ekranında "RECOVER GİRDİSİ (makbuz): Recover''dan sonra DEĞİŞMEDİ (sha256 önce = sonra = <özet>" Recover bitiş satırından SONRA' {
    if ($rgSetupErr -or -not $rgSrc) { throw "RG kaynağı kurulamadı: $rgSetupErr" }
    $snap0 = Get-RgSnap $rgSrc; $evSha0 = Sha (Join-Path $rgSrc 'd6-evidence.json'); $manSha0 = Sha (Join-Path $rgSrc 'SHA256-MANIFEST.txt')
    $manAll = @(Get-Content -LiteralPath (Join-Path $rgSrc 'SHA256-MANIFEST.txt') | Where-Object { $_ }); $manLine = @($manAll | Where-Object { $_ -cmatch '  d6-evidence\.json$' })
    $env:EXSTUB_REAL_RUNNER = Join-Path $here 'd6-portal-documents-live-run.js'; $env:EXSTUB_REWRITE = 'runner'   # R04-b: sahte koşucu GERÇEK koşucu gibi yalnız bayrak YOKKEN makbuzu yeniden yazar
    try { $x = Invoke-RgRecover $rgSrc @('H') } finally { Remove-Item 'Env:EXSTUB_REAL_RUNNER', 'Env:EXSTUB_REWRITE' -ErrorAction SilentlyContinue }
    $tgt = if ($x.sibDirs.Count -eq 1) { [string]$x.sibDirs[0].FullName } else { '' }; $tgtLeaf = if ($tgt) { Split-Path -Leaf $tgt } else { '' }
    $nameOk = ($tgt -and $tgtLeaf -cmatch ('^' + [regex]::Escape((Split-Path -Leaf $rgSrc)) + '\.recover-girdi-\d{8}T\d{6}Z$') -and (Split-Path -Parent $tgt) -eq (Split-Path -Parent $rgSrc))
    $np = if ($tgt) { Join-Path $tgt 'd6-setup-receipt-kanittan.json' } else { '' }
    $nb = if ($np -and (Test-Path -LiteralPath $np -PathType Leaf)) { [IO.File]::ReadAllBytes($np) } else { $null }
    $bytesOk = ($null -ne $nb -and $null -ne $rgExp -and $rgExp.Length -gt 150 -and [Convert]::ToBase64String($nb) -ceq [Convert]::ToBase64String($rgExp))
    $bomOk = ($null -ne $nb -and $nb[0] -eq 0x7B -and -not ($nb[0] -eq 0xEF -and $nb[1] -eq 0xBB -and $nb[2] -eq 0xBF))
    $lfN = if ($nb) { @($nb | Where-Object { $_ -eq 10 }).Count } else { -1 }; $crN = if ($nb) { @($nb | Where-Object { $_ -eq 13 }).Count } else { -1 }; $hiN = if ($nb) { @($nb | Where-Object { $_ -gt 127 }).Count } else { -1 }
    $eolOk = ($lfN -ge 8 -and $crN -eq 0 -and $hiN -gt 0 -and $nb[$nb.Length - 1] -eq 0x7D)
    $kp = if ($tgt) { Join-Path $tgt 'RECOVER-GIRDI-KAYDI.json' } else { '' }; $k = $null; $kb = $null
    if ($kp -and (Test-Path -LiteralPath $kp -PathType Leaf)) { $kb = [IO.File]::ReadAllBytes($kp); $k = [IO.File]::ReadAllText($kp, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json }
    $recOk = ($k -and $k.record -ceq 'EXTACC-D6-RECOVER-INPUT' -and $k.runId -ceq $rgRunId -and $k.kaynakDizinAdi -ceq (Split-Path -Leaf $rgSrc) -and $k.kaynakKanit -ceq 'd6-evidence.json' -and $k.kaynakKanitSha256 -ceq $evSha0 -and
               $k.kaynakKayitTuru -ceq 'EXTACC-D6-PORTAL-DOCUMENTS-LIVE-RUN' -and $k.manifestSha256 -ceq $manSha0 -and $manLine.Count -eq 1 -and $k.manifestSatiri -ceq $manLine[0] -and [int]$k.manifestDogrulananDosya -eq $manAll.Count -and
               $k.makbuzDosyasi -ceq 'd6-setup-receipt-kanittan.json' -and $k.makbuzSha256 -ceq (Sha $np) -and [int]$k.makbuzBayt -eq $rgExp.Length -and ([string]$k.kodlama).Contains('BOM YOK') -and ([string]$k.kodlama).Contains('sonda ek satır sonu YOK') -and
               ([string]$k.bagimsizCapa.manifestVeKanit).StartsWith('YOK') -and ([string]$k.bagimsizCapa.runId).Contains("runId=$rgRunId") -and [string]$k.atUtc -and $kb[0] -eq 0x7B)
    $rp = [string]$x.r.last.receiptPath
    $startOk = (-not $x.r.threw -and $x.r.out -eq 0 -and $x.node -eq 1 -and $x.r.last.mode -eq 'recover' -and $x.r.last.residue -eq '0' -and $x.r.last.rgate -eq 'ok' -and $rp -and (Split-Path -Leaf $rp) -ceq 'd6-setup-receipt-kanittan.json' -and
                 (Split-Path -Leaf (Split-Path -Parent $rp)) -ceq $tgtLeaf -and $x.recDirs -eq 1 -and $x.receipts -eq 1 -and $x.records -eq 1 -and $x.marks -eq 0 -and $x.ledger -eq 0 -and $x.r.secretsLeft -eq 0)
    $srcOk = ($x.same -and (Get-RgSnap $rgSrc) -ceq $snap0 -and $snap0 -cnotmatch '(^|\|)D:' -and (Sha (Join-Path $rgSrc 'd6-evidence.json')) -ceq $evSha0 -and (Sha (Join-Path $rgSrc 'SHA256-MANIFEST.txt')) -ceq $manSha0)
    $iH = $x.txt.IndexOf('RECOVER GİRDİSİ HAZIR'); $iS = $x.txt.IndexOf('SINIR: manifestin bağımsız çapası YOK'); $iE = $x.txt.IndexOf('KURTARMA BİTTİ')
    $txtOk = ($iH -ge 0 -and $iS -gt $iH -and $iE -gt $iS -and $x.txt.Contains('UTF-8 BOM YOK, satır sonları dönüştürülmedi, sonda ek satır sonu YOK') -and $x.txt.Contains('Run kanıt dizinine yazılmadı'))
    # R04-b: makbuz koşucuya SALT OKUNUR verildi (D6_RECEIPT_READONLY=1) → Recover'dan SONRA dosyanın baytları hâlâ beklenen baytlar ve sha256'sı kayıttaki makbuzSha256;
    # bitiş ekranında "RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞMEDİ (sha256 önce = sonra = <özet>" satırı Recover bitiş satırından SONRA.
    $iR = $x.txt.IndexOf("RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞMEDİ (sha256 önce = sonra = $(if ($np -and (Test-Path -LiteralPath $np -PathType Leaf)) { Sha $np } else { '-' });")
    $roOk = ($x.r.last.ro -eq '1' -and $bytesOk -and $k -and $k.makbuzSha256 -ceq (ShaBytes $rgExp) -and ([string]$k.makbuzRecoverda).Contains('SALT OKUNUR') -and $iR -gt $iE -and -not $x.txt.Contains("Recover'dan sonra DEĞİŞTİ"))
    [pscustomobject]@{ ok = ($nameOk -and $bytesOk -and $bomOk -and $eolOk -and $recOk -and $startOk -and $srcOk -and $txtOk -and $roOk)
      obs = "hedef adı=$nameOk [$tgtLeaf] · baytlar birebir=$bytesOk ($(if ($nb) { $nb.Length } else { '-' })/$(if ($rgExp) { $rgExp.Length } else { '-' }) bayt) · BOM yok=$bomOk · LF=$lfN CR=$crN ASCII dışı bayt=$hiN son bayt }=$eolOk · kayıt dosyası=$recOk · Recover yeni dosyayla=$startOk (rc=$($x.r.out) node=$($x.node) mod=$($x.r.last.mode) koşucu kapısı=$($x.r.last.rgate) recover dizini=$($x.recDirs)) · Run dizini + manifest değişmedi=$srcOk · ekran=$txtOk · makbuz salt okunur + Recover'dan sonra değişmedi=$roOk (bayrak=$($x.r.last.ro)) · istisna=[$($x.r.threw)]" }
  }

  Invoke-RgItem 'RG-2' 'R04 DEĞİŞTİRİLMİŞ kaynak → RED, Recover başlamaz: (kontrol) değiştirilmemiş kopya kaynak doğrulamasını geçer; (a) kanıttaki recovery.makbuzJson değiştirilmiş, manifest eski → "manifest uyuşmuyor: d6-evidence.json"; (b) manifestteki kanıt satırının özeti değiştirilmiş → aynı ret; (c) manifestteki BAŞKA bir dosya (owner-block.json) değiştirilmiş → "manifest uyuşmuyor: owner-block.json" (a–c: kardeş dizin OLUŞMAZ, node çağrısı 0); (d) kaynak kanıt makbuz yazılırken değişirse (taklit: yazımdan hemen sonra kanıta bayt eklenir) → "yazım sırasında DEĞİŞTİ", hedef dizin KULLANILMAZ diye işaretlenir, kayıt dosyası yazılmaz, node çağrısı 0' {
    $c0 = New-RgCase 'rg2-kontrol'; $s0 = Test-RunEvidenceSource $c0
    $ctl = ($s0.runId -ceq $rgRunId -and [Convert]::ToBase64String($s0.bytes) -ceq [Convert]::ToBase64String($rgExp) -and @(Get-ChildItem -LiteralPath (Split-Path -Parent $c0) -Force).Count -eq 1)
    $ca = New-RgCase 'rg2-makbuz'; Edit-RgFile $ca 'd6-evidence.json' '\"clientId\": \"k\"' '\"clientId\": \"x\"' $false; $xa = Invoke-RgRecover $ca
    $cb = New-RgCase 'rg2-satir'; $mp = Join-Path $cb 'SHA256-MANIFEST.txt'
    [IO.File]::WriteAllLines($mp, @([IO.File]::ReadAllLines($mp) | ForEach-Object { if ($_ -cmatch '  d6-evidence\.json$') { ('0' * 64) + '  d6-evidence.json' } else { $_ } }), [Text.Encoding]::ASCII); $xb = Invoke-RgRecover $cb
    $cc = New-RgCase 'rg2-diger'; [IO.File]::AppendAllText((Join-Path $cc 'owner-block.json'), ' '); $xc = Invoke-RgRecover $cc
    $rgDirD = New-RgCase 'rg2-yazimda'; $rgRealW = ${function:Write-NewFileBytes}; $script:rgW = 0
    function Write-NewFileBytes([string]$path, [byte[]]$bytes) { & $rgRealW $path $bytes; $script:rgW++; if ($script:rgW -eq 1) { [IO.File]::AppendAllText((Join-Path $rgDirD 'd6-evidence.json'), ' ') } }
    $xd = Invoke-RgRecover $rgDirD
    $okA = (& $rgPre $xa 'manifest uyuşmuyor: d6-evidence.json'); $okB = (& $rgPre $xb 'manifest uyuşmuyor: d6-evidence.json'); $okC = (& $rgPre $xc 'manifest uyuşmuyor: owner-block.json')
    $okD = ((& $rgPost $xd 'yazım sırasında DEĞİŞTİ') -and -not $xd.same -and $script:rgW -ge 2)
    [pscustomobject]@{ ok = ($ctl -and $okA -and $okB -and $okC -and $okD); obs = "kontrol=$ctl · (a) makbuzJson=$okA [$($xa.msg)] · (b) manifest satırı=$okB · (c) başka dosya=$okC [$($xc.msg)] · (d) yazımda değişti=$okD (işaret=$($xd.marks) kayıt=$($xd.records) node=$($xd.node)) [$($xd.msg)]" }
  }

  Invoke-RgItem 'RG-3' 'R04 BOZULMUŞ / YANLIŞ KOŞUMA ait makbuz → RED, Recover başlamaz (manifest her kopyada yeniden yazıldı → ret nedeni hash değil içerik): (a) makbuzJson içindeki runId başka koşum → "makbuz BAŞKA bir koşuma ait"; (b) kanıt kayıt türü Recover kanıtı → "kayıt türü Run kanıtı DEĞİL"; (c) dizin adındaki runId kanıttakiyle farklı → "dizin adındaki runId"; (d) makbuzJson JSON değil → "JSON olarak ayrıştırılamadı"; (e) makbuzJson kayıt türü makbuz değil → "Recover okuma kapısını geçmez"; hepsinde kardeş dizin OLUŞMAZ, node çağrısı 0, kaynak değişmez' {
    $ca = New-RgCase 'rg3-baska-kosum'; Edit-RgFile $ca 'd6-evidence.json' ('\"runId\": \"' + $rgRunId + '\"') ('\"runId\": \"' + $rgOther + '\"'); $xa = Invoke-RgRecover $ca
    $cb = New-RgCase 'rg3-recover-kaniti'; Edit-RgFile $cb 'd6-evidence.json' '"record":"EXTACC-D6-PORTAL-DOCUMENTS-LIVE-RUN"' '"record":"EXTACC-D6-RECOVER"'; $xb = Invoke-RgRecover $cb
    $cc = New-RgCase 'rg3-dizin-adi' @() ('extacc-d6-live-' + $rgOther + '-20000101-000000'); $xc = Invoke-RgRecover $cc
    $cd = New-RgCase 'rg3-bozuk'; Edit-RgFile $cd 'd6-evidence.json' '"makbuzJson":"{' '"makbuzJson":"['; $xd = Invoke-RgRecover $cd
    $ce = New-RgCase 'rg3-makbuz-turu'; Edit-RgFile $ce 'd6-evidence.json' '\"record\": \"EXTACC-D6-SETUP-RECEIPT\"' '\"record\": \"BASKA\"'; $xe = Invoke-RgRecover $ce
    $okA = (& $rgPre $xa 'makbuz BAŞKA bir koşuma ait'); $okB = (& $rgPre $xb 'kayıt türü Run kanıtı DEĞİL'); $okC = (& $rgPre $xc 'dizin adındaki runId'); $okD = (& $rgPre $xd 'JSON olarak ayrıştırılamadı'); $okE = (& $rgPre $xe 'Recover okuma kapısını geçmez')
    [pscustomobject]@{ ok = ($okA -and $okB -and $okC -and $okD -and $okE); obs = "(a) başka koşum=$okA [$($xa.msg)] · (b) Recover kanıtı=$okB · (c) dizin adı=$okC · (d) bozuk JSON=$okD [$($xd.msg)] · (e) makbuz türü=$okE" }
  }

  Invoke-RgItem 'RG-4' 'R04 KİMLİK alanı uyuşmaz → RED, Recover başlamaz (manifest yeniden yazıldı): makbuzJson içindeki tenantId / tenantSlug / clientId / elevUserId / elevEmail kanıttaki receipt nesnesinden farklı → her biri "kimlik alanı uyuşmuyor: <alan>"; makbuz ve receipt birbirine eşit ama tenantSlug runId''den türetilen değer değil → "tenantSlug runId''den türetilen"; owner-block.json başka koşumun kaydı → "owner-block.json bu Run''ın blok kaydı DEĞİL"; hepsinde kardeş dizin OLUŞMAZ, node çağrısı 0' {
    $bad = @(); $n = 0
    foreach ($c in @(@('tenantId', '\"tenantId\": \"t\"', '\"tenantId\": \"z\"'), @('tenantSlug', ('\"tenantSlug\": \"ah-' + $rgRunId + '\"'), ('\"tenantSlug\": \"ah-' + $rgOther + '\"')), @('clientId', '\"clientId\": \"k\"', '\"clientId\": \"x\"'),
                     @('elevUserId', '\"elevUserId\": \"u\"', '\"elevUserId\": \"v\"'), @('elevEmail', '\"elevEmail\": \"e@example.invalid\"', '\"elevEmail\": \"x@example.invalid\"'))) {
      $cx = New-RgCase ('rg4-' + $c[0]); Edit-RgFile $cx 'd6-evidence.json' $c[1] $c[2]; $xx = Invoke-RgRecover $cx; $n++
      if (-not (& $rgPre $xx ('kimlik alanı uyuşmuyor: ' + $c[0] + ' '))) { $bad += ($c[0] + ': ' + $xx.msg) }
    }
    $cs = New-RgCase 'rg4-turetilen'; Edit-RgFile $cs 'd6-evidence.json' ('\"tenantSlug\": \"ah-' + $rgRunId + '\"') ('\"tenantSlug\": \"ah-' + $rgOther + '\"') $false
    Edit-RgFile $cs 'd6-evidence.json' ('"tenantSlug":"ah-' + $rgRunId + '"') ('"tenantSlug":"ah-' + $rgOther + '"'); $xs = Invoke-RgRecover $cs
    $co = New-RgCase 'rg4-blok-kaydi'; Edit-RgFile $co 'owner-block.json' $rgRunId $rgOther; $xo = Invoke-RgRecover $co
    $okS = (& $rgPre $xs "tenantSlug runId'den türetilen"); $okO = (& $rgPre $xo "owner-block.json bu Run'ın blok kaydı DEĞİL")
    [pscustomobject]@{ ok = ($n -eq 5 -and $bad.Count -eq 0 -and $okS -and $okO); obs = "alan kalemi=$n · uyuşmayan=$(if ($bad.Count) { $bad -join ' | ' } else { 'yok' }) · türetilen slug=$okS [$($xs.msg)] · blok kaydı=$okO [$($xo.msg)]" }
  }

  Invoke-RgItem 'RG-5' 'R04 EKSİK kaynak → RED, Recover başlamaz: (a) Run kanıt dizini yok / (b) yol bir dosya → "Run kanıt dizini yok ya da dizin değil"; (c) kanıt dosyası yok (manifestte satırı var) → "manifestteki dosya YOK: d6-evidence.json"; (d) manifest yok → "SHA256-MANIFEST.txt YOK"; (e) manifestte kanıt satırı yok → "d6-evidence.json satırı YOK"; (f) kanıtta recovery.makbuzJson yok → "makbuz metni (recovery.makbuzJson) YOK"; (g) manifestte goref-consumed.json satırı yok → "goref-consumed.json satırı YOK"; (h) GO defterinde bu Run''ın satırı yok (kanıt dizini DIŞINDAKİ runId çapası) → "GO defterinde bu Run''ın satırı"; hepsinde kardeş dizin OLUŞMAZ, node çağrısı 0' {
    $upA = Join-Path $rgRoot 'rg5-yok'; New-Item -ItemType Directory -Path $upA | Out-Null; $xa = Invoke-RgRecover (Join-Path $upA (Split-Path -Leaf $rgSrc))
    $upB = Join-Path $rgRoot 'rg5-dosya'; New-Item -ItemType Directory -Path $upB | Out-Null; $fb = Join-Path $upB (Split-Path -Leaf $rgSrc); [IO.File]::WriteAllText($fb, 'dizin değil'); $xb = Invoke-RgRecover $fb
    $cc = New-RgCase 'rg5-kanit' @('d6-evidence.json'); $xc = Invoke-RgRecover $cc
    $cd = New-RgCase 'rg5-manifest' @('SHA256-MANIFEST.txt'); $xd = Invoke-RgRecover $cd
    $ce = New-RgCase 'rg5-satir'; $mp = Join-Path $ce 'SHA256-MANIFEST.txt'; [IO.File]::WriteAllLines($mp, @([IO.File]::ReadAllLines($mp) | Where-Object { $_ -cnotmatch '  d6-evidence\.json$' }), [Text.Encoding]::ASCII); $xe = Invoke-RgRecover $ce
    $cf = New-RgCase 'rg5-makbuzjson'; Edit-RgFile $cf 'd6-evidence.json' '"recovery":{' '"recoveryX":{'; $xf = Invoke-RgRecover $cf
    $cg = New-RgCase 'rg5-goref' @('goref-consumed.json'); Write-Manifest $cg; $xg = Invoke-RgRecover $cg
    $ch = New-RgCase 'rg5-defter'; $xh = & { $GoLedger = Join-Path $T 'rg-bos-defter.txt'; Invoke-RgRecover $ch }
    $okA = (& $rgPre $xa 'Run kanıt dizini yok ya da dizin değil'); $okB = (& $rgPre $xb 'Run kanıt dizini yok ya da dizin değil'); $okC = (& $rgPre $xc 'manifestteki dosya YOK: d6-evidence.json'); $okD = (& $rgPre $xd 'SHA256-MANIFEST.txt YOK')
    $okE = (& $rgPre $xe "SHA256-MANIFEST.txt'de d6-evidence.json satırı YOK"); $okF = (& $rgPre $xf 'kanıtta makbuz metni (recovery.makbuzJson) YOK'); $okG = (& $rgPre $xg "SHA256-MANIFEST.txt'de goref-consumed.json satırı YOK"); $okH = (& $rgPre $xh "GO defterinde bu Run'ın satırı")
    [pscustomobject]@{ ok = ($okA -and $okB -and $okC -and $okD -and $okE -and $okF -and $okG -and $okH); obs = "(a) dizin yok=$okA · (b) dosya=$okB · (c) kanıt yok=$okC [$($xc.msg)] · (d) manifest yok=$okD · (e) kanıt satırı yok=$okE · (f) makbuzJson yok=$okF [$($xf.msg)] · (g) goref satırı yok=$okG · (h) GO defteri satırı yok=$okH [$($xh.msg)]" }
  }

  Invoke-RgItem 'RG-6' 'R04 EZME YOK: (a) hedef kardeş dizin ZATEN VAR (içinde eski bir makbuz dosyası) → "hedef ZATEN VAR (ezilmez)", eski dosyanın baytları DEĞİŞMEDİ, kayıt / işaret dosyası yazılmadı, node çağrısı 0; (b) hedef yol bir DOSYA → aynı ret, dosya değişmedi; (c) Write-NewFileBytes var olan dosyaya yazmaz (CreateNew → istisna; içerik değişmedi); (d) gerçek zaman damgası biçimi yyyyMMddTHHmmssZ (UTC)' {
    $stampReal = [string](Get-RecoverInputStamp); $utcNow = (Get-Date).ToUniversalTime().ToString('yyyyMMdd')
    function Get-RecoverInputStamp { return '20000101T000000Z' }
    $ca = New-RgCase 'rg6-dizin'; $ta = $ca + '.recover-girdi-20000101T000000Z'; New-Item -ItemType Directory -Path $ta | Out-Null; $oldF = Join-Path $ta 'd6-setup-receipt-kanittan.json'; [IO.File]::WriteAllText($oldF, 'ESKI-MAKBUZ')
    $xa = Invoke-RgRecover $ca
    $okA = ($xa.dur -and $xa.msg.Contains('hedef ZATEN VAR (ezilmez)') -and $xa.msg.Contains('Recover başlamadı') -and $xa.node -eq 0 -and $xa.same -and $xa.sib -eq 1 -and $xa.records -eq 0 -and $xa.marks -eq 0 -and $xa.recDirs -eq 0 -and
            [IO.File]::ReadAllText($oldF) -ceq 'ESKI-MAKBUZ' -and @(Get-ChildItem -LiteralPath $ta -Force).Count -eq 1)
    $cb = New-RgCase 'rg6-dosya'; $tb = $cb + '.recover-girdi-20000101T000000Z'; [IO.File]::WriteAllText($tb, 'DOSYA'); $xb = Invoke-RgRecover $cb
    $okB = ($xb.dur -and $xb.msg.Contains('hedef ZATEN VAR (ezilmez)') -and $xb.node -eq 0 -and $xb.same -and $xb.sib -eq 1 -and $xb.sibDirs.Count -eq 0 -and (Test-Path -LiteralPath $tb -PathType Leaf) -and [IO.File]::ReadAllText($tb) -ceq 'DOSYA')
    $wErr = $null; try { Write-NewFileBytes $oldF ([byte[]](1, 2, 3)) } catch { $ie = $_.Exception; while ($ie.InnerException) { $ie = $ie.InnerException }; $wErr = $ie.GetType().Name }
    $okC = ($wErr -ceq 'IOException' -and [IO.File]::ReadAllText($oldF) -ceq 'ESKI-MAKBUZ')
    $okD = ($stampReal -cmatch '^\d{8}T\d{6}Z$' -and $stampReal.StartsWith($utcNow.Substring(0, 6)))
    [pscustomobject]@{ ok = ($okA -and $okB -and $okC -and $okD); obs = "(a) hedef dizin var=$okA [$($xa.msg)] · (b) hedef yol dosya=$okB · (c) CreateNew var olan dosyada=$wErr, içerik aynı=$okC · (d) gerçek damga=$stampReal ($okD)" }
  }

  Invoke-RgItem 'RG-7' 'R04 YAZMA HATASI → RED, Recover başlamaz, başarı sayılmaz: (a) GERÇEK ACL reddi — üst dizinde alt dizin oluşturma (AD) reddedilmiş → "hedef dizin oluşturulamadı", kardeş dizin YOK, node çağrısı 0, kaynak değişmedi; (b) kısmi yazım taklidi (makbuzun yarısı yazılır, sonra G/Ç hatası) → "makbuz dosyası yazılamadı", hedef dizin SİLİNMEZ, eksik dosya yerinde kalır ve RECOVER-GIRDI-KULLANILMAZ.txt (neden) ile işaretlenir, kayıt dosyası YOK, node çağrısı 0; (c) kayıt dosyası yazılamaz → "RECOVER-GIRDI-KAYDI.json yazılamadı", işaretlenir, node çağrısı 0; (d) işaret dosyası da yazılamazsa metin bunu söyler ("işaret dosyası da YAZILAMADI — dizin elle KULLANILMAZ sayılır"), node çağrısı 0' {
    $ca = New-RgCase 'rg7-acl'; $upA = Split-Path -Parent $ca; $denied = $false; $xa = $null
    try { & icacls.exe $upA /deny "$($env:USERNAME):(AD)" *> $null; $denied = ($LASTEXITCODE -eq 0); $xa = Invoke-RgRecover $ca } finally { & icacls.exe $upA /remove:d "$env:USERNAME" *> $null }
    $okA = ($denied -and (& $rgPre $xa 'hedef dizin oluşturulamadı'))
    $rgRealW = ${function:Write-NewFileBytes}
    $cb = New-RgCase 'rg7-kismi'; $script:rgW = 0
    $xb = & { function Write-NewFileBytes([string]$path, [byte[]]$bytes) { $script:rgW++; if ($script:rgW -eq 1) { & $rgRealW $path ([byte[]]($bytes[0..([int][Math]::Floor($bytes.Length / 2))])); throw [IO.IOException]::new('RG taklidi: disk dolu') }; & $rgRealW $path $bytes }
              Invoke-RgRecover $cb }
    $pf = if ($xb.sibDirs.Count -eq 1) { Join-Path $xb.sibDirs[0].FullName 'd6-setup-receipt-kanittan.json' } else { '' }; $mf = if ($xb.sibDirs.Count -eq 1) { Join-Path $xb.sibDirs[0].FullName 'RECOVER-GIRDI-KULLANILMAZ.txt' } else { '' }
    $pLen = if ($pf -and (Test-Path -LiteralPath $pf -PathType Leaf)) { ([IO.File]::ReadAllBytes($pf)).Length } else { -1 }; $mTxt = if ($mf -and (Test-Path -LiteralPath $mf -PathType Leaf)) { [IO.File]::ReadAllText($mf, [Text.UTF8Encoding]::new($false)) } else { '' }
    $okB = ((& $rgPost $xb 'makbuz dosyası yazılamadı (IOException)') -and $xb.same -and $pLen -gt 0 -and $pLen -lt $rgExp.Length -and $mTxt.Contains('KULLANILMAZ') -and $mTxt.Contains('neden: makbuz dosyası yazılamadı') -and $mTxt.Contains('-ReceiptFile ile vermeyin'))
    $cc = New-RgCase 'rg7-kayit'; $script:rgW = 0
    $xc = & { function Write-NewFileBytes([string]$path, [byte[]]$bytes) { $script:rgW++; if ($script:rgW -eq 2) { throw [IO.IOException]::new('RG taklidi: kayıt yazılamadı') }; & $rgRealW $path $bytes }
              Invoke-RgRecover $cc }
    $okC = ((& $rgPost $xc 'RECOVER-GIRDI-KAYDI.json yazılamadı') -and $xc.same -and $xc.receipts -eq 1)
    $cd = New-RgCase 'rg7-isaret'
    $xd = & { function Write-NewFileBytes([string]$path, [byte[]]$bytes) { throw [IO.IOException]::new('RG taklidi: hiçbir yazım olmuyor') }
              Invoke-RgRecover $cd }
    $okD = ($xd.dur -and $xd.msg.Contains('makbuz dosyası yazılamadı') -and $xd.msg.Contains('Recover BAŞLAMADI (başarı sayılmaz)') -and $xd.msg.Contains('işaret dosyası da YAZILAMADI — dizin elle KULLANILMAZ sayılır') -and $xd.node -eq 0 -and $xd.sib -eq 1 -and $xd.marks -eq 0 -and $xd.receipts -eq 0 -and $xd.same)
    [pscustomobject]@{ ok = ($okA -and $okB -and $okC -and $okD); obs = "(a) ACL reddi uygulandı=$denied ret=$okA [$(if ($xa) { $xa.msg } else { '-' })] · (b) kısmi yazım=$okB (eksik dosya=$pLen/$($rgExp.Length) bayt, işaret=$($xb.marks)) [$($xb.msg)] · (c) kayıt yazılamadı=$okC · (d) işaret de yazılamadı=$okD" }
  }

  Invoke-RgItem 'RG-8' 'R04 GERİ OKUMA uyuşmazlığı (taklit) → RED, Recover başlamaz: (a) geri okunan baytlardan biri farklı → "geri okunan baytlar … EŞİT DEĞİL"; (b) geri okunan bayt sayısı eksik → aynı ret; (c) geri okuma istisna verir → "makbuz dosyası geri okunamadı"; üçünde de hedef dizin SİLİNMEZ ve KULLANILMAZ diye işaretlenir, kayıt dosyası YOK, node çağrısı 0, kaynak değişmedi; (d) işaret ZORLANIR: KULLANILMAZ işaretli dizinde kalan (diskte sağlam, yalın okuma kapısından geçen) makbuz -ReceiptFile ile verilirse de DUR ("KULLANILMAZ diye işaretlenmiş …"), node çağrısı 0, recover-* dizini açılmaz' {
    $ca = New-RgCase 'rg8-bayt'
    $xa = & { function Read-FileBytesForCheck([string]$path) { $rb = [IO.File]::ReadAllBytes($path); $rb[5] = [byte]($rb[5] -bxor 1); return , $rb }
              Invoke-RgRecover $ca }
    $cb = New-RgCase 'rg8-eksik'
    $xb = & { function Read-FileBytesForCheck([string]$path) { $rb = [IO.File]::ReadAllBytes($path); return , ([byte[]]($rb[0..($rb.Length - 2)])) }
              Invoke-RgRecover $cb }
    $cc = New-RgCase 'rg8-istisna'
    $xc = & { function Read-FileBytesForCheck([string]$path) { throw [IO.IOException]::new('RG taklidi: okunamadı') }
              Invoke-RgRecover $cc }
    $okA = ((& $rgPost $xa 'geri okunan baytlar recovery.makbuzJson dizgesinin UTF-8 baytlarıyla EŞİT DEĞİL') -and $xa.same -and $xa.receipts -eq 1)
    $okB = ((& $rgPost $xb 'geri okunan baytlar recovery.makbuzJson dizgesinin UTF-8 baytlarıyla EŞİT DEĞİL') -and $xb.same -and $xb.msg.Contains("okunan=$($rgExp.Length - 1) bayt · beklenen=$($rgExp.Length) bayt"))
    $okC = ((& $rgPost $xc 'makbuz dosyası geri okunamadı (IOException)') -and $xc.same)
    # (d) İşaret ZORLANIR: (a)'dan kalan makbuz dosyası diskte sağlamdır (bloğun yalın okuma kapısından geçer) ama dizini KULLANILMAZ işaretlidir → -ReceiptFile ile de DUR.
    $flagged = if ($xa.sibDirs.Count -eq 1) { Join-Path $xa.sibDirs[0].FullName 'd6-setup-receipt-kanittan.json' } else { '' }
    $plain = [bool]($flagged -and (Get-ReceiptFileState $flagged).usable)
    $null = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true $flagged @('H') }; $rF = $script:capR
    $okD = ($plain -and $rF.threw -like 'EXTACC-D6-DUR:*' -and ([string]$rF.threw).Contains('KULLANILMAZ diye işaretlenmiş bir Recover girdisi dizininde') -and $rF.nodeCalls -eq 0 -and
            @(Get-ChildItem -LiteralPath $xa.sibDirs[0].FullName -Directory -Filter 'recover-*').Count -eq 0)
    [pscustomobject]@{ ok = ($okA -and $okB -and $okC -and $okD); obs = "(a) bayt farkı=$okA [$($xa.msg)] · (b) eksik bayt=$okB · (c) okuma istisnası=$okC [$($xc.msg)] · (d) işaretli dizindeki makbuz -ReceiptFile ile: yalın okuma kapısı=$plain ret=$okD [$($rF.threw)]" }
  }

  Invoke-RgItem 'RG-9' 'R04 Recover BİTİŞ EKRANI (GÖSTERİLEN metin + satır RENGİ; -ReceiptFile yolu, sahte koşucunun Recover kanıtındaki portalClose + P6-C3L/D satırları): "PORTAL ERİŞİMİ (son ölçüme göre, bu Recover''ın kanıtından; DB durumu + yeni giriş reddi ölçütleri): … — …" tek satır — AÇIK (kırmızı): son ölçüm (afterMeasure) aktif (kapatma sonrası "after" kapalı olsa da SON ölçüm esas; P6-C3L/D PASS olsa da AÇIK) + kanıttaki açık erişim metni; AÇIK (kırmızı): hesap pasif ama müvekkil erişim bayrağı açık ("kapanış TAMAMLANMADI"; afterMeasure yokken "after"); R04-c (K1) DB KAPALI iken satır yalnız DB durumundan kurulmaz: P6-C3L + P6-C3D PASS → YEŞİL "KAPALI (DB + yeni giriş reddi PASS)" (yeşil YALNIZ bu durumda); biri FAIL (FAIL/FAIL · PASS/FAIL · FAIL/ÖLÇÜLEMEYEN · aynı kimlikli iki satırdan biri FAIL) → KIRMIZI "DB''de kapalı AMA yeni giriş reddi FAIL (P6-C3L=…, P6-C3D=…) — erişim kapalı SAYILMAZ" ("KAPALI (DB" YOK); ÖLÇÜLEMEYEN / satır yok / aynı kimlikli iki PASS satırı → SARI "DB''de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ (…)"; hesap satırı DB''de YOK (koşucu giriş reddini ölçmez → satır yok) → SARI; ÖLÇÜLEMEDİ (sarı): portalClose yok / geç oluşma dışlanamadı / kapanış adımı hatası / Recover kanıtı yok; değerler küçük harfle (isActive=true); çıkış kodu DEĞİŞMEDEN (0 / 1 / 3 / 6), tek node çağrısı; mevcut kod açıklamaları ve "mevcut oturum reddi Recover''da ÖLÇÜLEMEZ" korunur; statik: renk yalnız Get-RecoverPortalAccess''in döndürdüğü `renk` alanından' {
    $run9 = { param([string]$pc, [int]$rc, [bool]$evid = $true, [string]$extra = '')
      if ($pc) { $env:EXSTUB_PC = $pc } else { Remove-Item 'Env:EXSTUB_PC' -ErrorAction SilentlyContinue }
      if ($extra) { $env:EXSTUB_EXTRA = $extra } else { Remove-Item 'Env:EXSTUB_EXTRA' -ErrorAction SilentlyContinue }
      try { $ls9 = Get-HostLines { $script:capR = Invoke-Mode 'Recover' $real.Exe $rc $evid $rcpt @('H') } } finally { Remove-Item 'Env:EXSTUB_PC', 'Env:EXSTUB_EXTRA' -ErrorAction SilentlyContinue }
      $ln = @($ls9 | Where-Object { $_.t -cmatch 'PORTAL ERİŞİMİ \(son ölçüme göre' }); $en = @($ls9 | Where-Object { $_.t -cmatch 'KURTARMA BİTTİ' })
      [pscustomobject]@{ r = $script:capR; n = $ln.Count; line = $(if ($ln.Count -eq 1) { [string]$ln[0].t } else { '' }); color = $(if ($ln.Count -eq 1) { [string]$ln[0].c } else { '' }); end = $(if ($en.Count -eq 1) { [string]$en[0].t } else { '' }); rc = $rc } }
    # Kanıta eklenen yeni giriş reddi satırları (sahte koşucu EXSTUB_EXTRA): her öğe "kimlik=verdict"; aynı kimlik iki kez verilebilir.
    $c3x = { param([string[]]$rowsIn) '[' + ((@($rowsIn) | ForEach-Object { $kv = $_ -split '=', 2; '{"id":"' + $kv[0] + '","verdict":"' + $kv[1] + '"}' }) -join ',') + ']' }
    $pOpen = '{"exists":true,"isActive":true,"hasPortalAccess":true,"tokenVersion":1}'; $pShut = '{"exists":true,"isActive":false,"hasPortalAccess":false,"tokenVersion":2}'
    $pcShut = '{"before":' + $pOpen + ',"after":' + $pShut + ',"afterMeasure":' + $pShut + '}'
    $head = "PORTAL ERİŞİMİ (son ölçüme göre, bu Recover'ın kanıtından; DB durumu + yeni giriş reddi ölçütleri): "; $tail = "Yeni giriş reddi kanıttaki P6-C3L/D satırlarından okunur; mevcut oturum reddi Recover'da ÖLÇÜLEMEZ."
    $dbShut = 'hesap pasif + müvekkil erişim bayrağı kapalı (isActive=false hasPortalAccess=false sürüm=2; son ölçüm: HTTP ölçümlerinden sonraki DB okuması (P6-C5))'
    $c1 = & $run9 ('{"before":' + $pOpen + ',"after":' + $pShut + ',"afterMeasure":{"exists":true,"isActive":true,"hasPortalAccess":true,"tokenVersion":2},"acikErisim":"RG-9 açık erişim metni"}') 6 $true (& $c3x @('P6-C3L=PASS', 'P6-C3D=PASS'))
    $c2 = & $run9 ('{"before":' + $pOpen + ',"after":{"exists":true,"isActive":false,"hasPortalAccess":true,"tokenVersion":2}}') 6
    $c3 = & $run9 $pcShut 3 $true (& $c3x @('P6-C3L=PASS', 'P6-C3D=PASS'))
    $c4 = & $run9 '{"before":{"exists":false,"hasPortalAccess":false}}' 0
    $c5 = & $run9 '' 0
    $c6 = & $run9 '{"before":{"exists":false,"hasPortalAccess":false},"lateCreateRisk":true}' 6
    $c7 = & $run9 '{"ok":false,"reason":"RG-9 hata"}' 6
    $c8 = & $run9 '' 1 $false
    # R04-c (K1): DB KAPALI + yeni giriş reddi FAIL / ÖLÇÜLEMEYEN / satır yok varyantları (aynı DB durumu; yalnız P6-C3L/D satırları değişir).
    $f1 = & $run9 $pcShut 6 $true (& $c3x @('P6-C3L=FAIL', 'P6-C3D=FAIL'))
    $f2 = & $run9 $pcShut 6 $true (& $c3x @('P6-C3L=PASS', 'P6-C3D=FAIL'))
    $f3 = & $run9 $pcShut 6 $true (& $c3x @('P6-C3L=FAIL', 'P6-C3D=UNMEASURED'))
    $f4 = & $run9 $pcShut 6 $true (& $c3x @('P6-C3L=PASS', 'P6-C3L=FAIL', 'P6-C3D=PASS'))
    $u1 = & $run9 $pcShut 3 $true (& $c3x @('P6-C3L=UNMEASURED', 'P6-C3D=PASS'))
    $u2 = & $run9 $pcShut 3
    $u3 = & $run9 $pcShut 3 $true (& $c3x @('P6-C3L=PASS'))
    $u4 = & $run9 $pcShut 3 $true (& $c3x @('P6-C3L=PASS', 'P6-C3L=PASS', 'P6-C3D=PASS'))
    $all = @($c1, $c2, $c3, $c4, $c5, $c6, $c7, $c8, $f1, $f2, $f3, $f4, $u1, $u2, $u3, $u4)
    $base = (@($all | Where-Object { $_.n -ne 1 -or $_.r.out -ne $_.rc -or $_.r.nodeCalls -ne 1 -or $_.r.threw -or -not $_.line.Contains($head) -or -not $_.line.Contains($tail) }).Count -eq 0)
    $ok1 = ($c1.color -eq 'Red' -and $c1.line.Contains($head + 'AÇIK — portal hesabı AKTİF (isActive=true hasPortalAccess=true sürüm=2; son ölçüm: HTTP ölçümlerinden sonraki DB okuması (P6-C5)) — kanıttaki açık erişim metni: RG-9 açık erişim metni. '))
    $ok2 = ($c2.color -eq 'Red' -and $c2.line.Contains($head + 'AÇIK — portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (isActive=false hasPortalAccess=true sürüm=2; son ölçüm: kapatma adımından sonraki DB okuması (P6-C2)). '))
    $ok3 = ($c3.color -eq 'Green' -and $c3.line.Contains($head + "KAPALI (DB + yeni giriş reddi PASS) — $dbShut; P6-C3L=PASS, P6-C3D=PASS. "))
    $ok4 = ($c4.color -eq 'Yellow' -and $c4.line.Contains($head + "DB'de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ (P6-C3L=satır yok, P6-C3D=satır yok) — portal hesabı satırı DB'de YOK (hasPortalAccess=false; son ölçüm: Recover başındaki DB okuması; hesap yokken koşucu yeni giriş reddini ölçmez). "))
    $ok5 = ($c5.color -eq 'Yellow' -and $c5.line.Contains($head + "ÖLÇÜLEMEDİ — Recover kanıtında portalClose yok — portal erişimi bu Recover'da ölçülmedi. "))
    $ok6 = ($c6.color -eq 'Yellow' -and $c6.line.Contains($head + 'ÖLÇÜLEMEDİ — portal hesabı oluşturma sonucu belirsiz ve hesap Recover penceresinde görülmedi — geç oluşma DIŞLANAMADI. '))
    $ok7 = ($c7.color -eq 'Yellow' -and $c7.line.Contains($head + 'ÖLÇÜLEMEDİ — portal DB durumu Recover kanıtında yok (kapanış adımı hatası: RG-9 hata). '))
    $ok8 = ($c8.color -eq 'Yellow' -and $c8.line.Contains($head + "ÖLÇÜLEMEDİ — Recover kanıtı okunabilir değil (YOK) — son portal ölçümü bu Recover'dan okunamaz. ") -and $c8.end.Contains('KAPANIŞ DOĞRULANMADI — kanıt yok'))
    $failOk = { param($x, [string]$vt) [bool]($x.color -eq 'Red' -and $x.line.Contains($head + "DB'de kapalı AMA yeni giriş reddi FAIL ($vt) — erişim kapalı SAYILMAZ — $dbShut. ") -and -not $x.line.Contains('KAPALI (DB') -and -not $x.line.Contains('ÖLÇÜLEMEDİ (')) }
    $unmOk = { param($x, [string]$vt) [bool]($x.color -eq 'Yellow' -and $x.line.Contains($head + "DB'de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ ($vt) — $dbShut. ") -and -not $x.line.Contains('KAPALI (DB') -and -not $x.line.Contains('SAYILMAZ')) }
    $okF = ((& $failOk $f1 'P6-C3L=FAIL, P6-C3D=FAIL') -and (& $failOk $f2 'P6-C3L=PASS, P6-C3D=FAIL') -and (& $failOk $f3 'P6-C3L=FAIL, P6-C3D=ÖLÇÜLEMEYEN') -and (& $failOk $f4 'P6-C3L=FAIL, P6-C3D=PASS'))
    $okU = ((& $unmOk $u1 'P6-C3L=ÖLÇÜLEMEYEN, P6-C3D=PASS') -and (& $unmOk $u2 'P6-C3L=satır yok, P6-C3D=satır yok') -and (& $unmOk $u3 'P6-C3L=PASS, P6-C3D=satır yok') -and (& $unmOk $u4 'P6-C3L=satır tek değil (2), P6-C3D=PASS'))
    $greenN = @($all | Where-Object { $_.color -eq 'Green' }).Count
    $recT9 = [string](($funcs | Where-Object { $_.Name -eq 'Invoke-RecoverMode' } | Select-Object -First 1).Extent.Text)
    $statOk = ($recT9.Contains('-ForegroundColor $pa.renk') -and -not $recT9.Contains("elseif (`$pa.durum -eq 'KAPALI') { 'Green' }") -and ([regex]::Matches($recT9, 'PORTAL ERİŞİMİ \(son ölçüme göre')).Count -eq 1)
    $keep = ($c3.end.Contains("HER KODDA: mevcut oturum reddi Recover'da ÖLÇÜLEMEZ — HER ZAMAN (P6-C4L/D") -and $c3.end.Contains('3 = DB kapalı, FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN') -and $c4.end.Contains("0 = Recover anında portal hesabı DB'de YOK (ölçüldü)"))
    [pscustomobject]@{ ok = ($base -and $ok1 -and $ok2 -and $ok3 -and $ok4 -and $ok5 -and $ok6 -and $ok7 -and $ok8 -and $okF -and $okU -and $greenN -eq 1 -and $statOk -and $keep)
      obs = "ortak (16 koşum: tek satır, çıkış kodu değişmedi, tek node, baş + son metin)=$base · AÇIK aktif=$ok1 [$($c1.color)] · AÇIK bayrak=$ok2 [$($c2.color)] · KAPALI + C3 PASS=$ok3 [$($c3.color)] · hesap yok=$ok4 [$($c4.color)] · ÖLÇÜLEMEDİ portalClose yok=$ok5 / geç oluşma=$ok6 / adım hatası=$ok7 / kanıt yok=$ok8 · K1 FAIL varyantları (4)=$okF [$($f1.color),$($f2.color),$($f3.color),$($f4.color)] · K1 ÖLÇÜLEMEDİ varyantları (4)=$okU [$($u1.color),$($u2.color),$($u3.color),$($u4.color)] · yeşil satır sayısı=$greenN (1 bekleniyor) · statik renk=$statOk · eski metin korundu=$keep · örnek FAIL=[$($f1.line.Trim())] · örnek ÖLÇÜLEMEDİ=[$($u1.line.Trim())] · örnek PASS=[$($c3.line.Trim())]" }
  }

  Invoke-RgItem 'RG-10' 'R04 AYRI ONAY + sıra + statik: (a) -ReceiptFile ile -RunEvidenceDir BİRLİKTE → "BİRLİKTE verilemez", kardeş dizin OLUŞMAZ, node çağrısı 0; (b) kalıntı kararı E/H değilse (owner yanıtı "x" / yanıt yok) DUR ve makbuz YAZILMAZ (kardeş dizin yok) — yazım owner kararından SONRA; (c) statik: Invoke-RecoverMode içinde Read-ResidueDecision çağrısı New-RecoverInputFromRun çağrısından ÖNCE; New-RecoverInputFromRun içinde kaynak doğrulama → dizin oluşturma → yazım sırası; Invoke-RunMode Recover / makbuz çıkarma fonksiyonlarını ÇAĞIRMAZ (otomatik Recover yok); R04 fonksiyonlarında dosya / dizin silen, taşıyan ya da üzerine yazan çağrı YOK (yalnız CreateNew); blokta Remove-Item yalnız ortam değişkeni içindir; kodlama tanımı kaynakta ("BOM YOK", "DÖNÜŞTÜRÜLMEZ", "sonda EK satır sonu YOK"); param bloğunda $RunEvidenceDir ve akış onu Invoke-RecoverMode''a geçirir; -ReceiptFile yolu korunur (V-0..V-5, RG-9); R04-c: silme / üzerine yazma taraması Set-RecoverInputUnusable, Assert-RecoverInputUnchanged ve Assert-ReceiptFileRoute fonksiyonlarını da kapsar ve Invoke-RunMode bunları da ÇAĞIRMAZ; çıkarma çağrısı `$rin = New-RecoverInputFromRun $runEvidenceDir`' {
    $ca = New-RgCase 'rg10-cift'; $xa = Invoke-RgRecover $ca @('H') $rcpt
    $okA = ($xa.dur -and $xa.msg.Contains('BİRLİKTE verilemez') -and $xa.node -eq 0 -and $xa.sib -eq 0 -and $xa.same)
    $cb = New-RgCase 'rg10-karar'; $xb = Invoke-RgRecover $cb @('x'); $xb2 = Invoke-RgRecover $cb @()
    $okB = ($xb.dur -and $xb.msg.Contains('kalıntı kararı E ya da H olmalı') -and $xb.node -eq 0 -and $xb.sib -eq 0 -and $xb.same -and $xb2.dur -and $xb2.msg.Contains('kalıntı kararı E ya da H olmalı') -and $xb2.sib -eq 0)
    $fn = { param([string]$n) [string](($funcs | Where-Object { $_.Name -eq $n } | Select-Object -First 1).Extent.Text) }
    $recT = & $fn 'Invoke-RecoverMode'; $runT = & $fn 'Invoke-RunMode'; $newT = & $fn 'New-RecoverInputFromRun'; $srcT = & $fn 'Test-RunEvidenceSource'; $wT = & $fn 'Write-NewFileBytes'
    # R04-c (K3): New-RecoverInputFromRun yol + makbuz özeti döndürür → çağrı `$rin = New-RecoverInputFromRun $runEvidenceDir` (önceki: `$receiptPath = …`).
    $i1 = $recT.IndexOf('$Residue = Read-ResidueDecision'); $i2 = $recT.IndexOf('$rin = New-RecoverInputFromRun $runEvidenceDir'); $i3 = $recT.IndexOf('Invoke-Node')
    $j1 = $newT.IndexOf('Test-RunEvidenceSource $runDir'); $j2 = $newT.IndexOf('New-Item -ItemType Directory'); $j3 = $newT.IndexOf('Write-NewFileBytes $rcptPath')
    $ordOk = ($i1 -ge 0 -and $i1 -lt $i2 -and $i2 -lt $i3 -and $j1 -ge 0 -and $j1 -lt $j2 -and $j2 -lt $j3)
    $autoOk = ($runT.Length -gt 1000 -and $runT -notmatch 'Invoke-RecoverMode|New-RecoverInputFromRun|Test-RunEvidenceSource|Write-NewFileBytes|Assert-ReceiptFileRoute|Assert-RecoverInputUnchanged|Set-RecoverInputUnusable' -and $runT -notmatch "D6_MODE\s*=\s*'recover'")
    $delRe = 'Remove-Item|Move-Item|Rename-Item|Clear-Content|Set-Content|Add-Content|Out-File|::Delete\(|\.Delete\(|::Move\(|WriteAllText|WriteAllBytes|WriteAllLines|\[IO\.FileMode\]::(Create|OpenOrCreate|Truncate|Append)\b'
    # R04-c: tarama yeni yardımcı fonksiyonları da kapsar (işaretleme · girdi yeniden ölçümü · -ReceiptFile yol kapısı) — hiçbiri dosya / dizin silmez ya da üzerine yazmaz.
    $delHit = @(@($newT, $srcT, $wT, (& $fn 'Set-RecoverInputUnusable'), (& $fn 'Assert-RecoverInputUnchanged'), (& $fn 'Assert-ReceiptFileRoute')) | Where-Object { $_.Length -lt 100 -or $_ -match $delRe })
    $rmAll = ([regex]::Matches($src0, 'Remove-Item')).Count; $rmEnv = ([regex]::Matches($src0, 'Remove-Item "Env:')).Count
    $noDel = ($delHit.Count -eq 0 -and $wT.Contains('[IO.FileMode]::CreateNew') -and $rmAll -ge 1 -and $rmAll -eq $rmEnv -and $src0 -notmatch '::Delete\(|\.Delete\(|\brmdir\b|\brd /s')
    $encOk = ($src0.Contains('BOM YOK') -and $src0.Contains('DÖNÜŞTÜRÜLMEZ') -and $src0.Contains('sonda EK satır sonu YOK') -and $src0.Contains('BAĞIMSIZ ÇAPA: manifest ve kanıt içeriği için YOK'))
    $parOk = ($src0 -match '\[string\]\$RunEvidenceDir = ''''' -and $src0.Contains('else { $rc = Invoke-RecoverMode $g $ReceiptFile $RunEvidenceDir }') -and $src0.Contains("[string]`$ReceiptFile = '',"))
    [pscustomobject]@{ ok = ($okA -and $okB -and $ordOk -and $autoOk -and $noDel -and $encOk -and $parOk)
      obs = "(a) çift kaynak=$okA [$($xa.msg)] · (b) karar önce=$okB · sıra: karar@$i1 < çıkarma@$i2 < node@$i3, doğrulama@$j1 < dizin@$j2 < yazım@$j3 → $ordOk · Run otomatik Recover yok=$autoOk · silme / üzerine yazma yok=$noDel (R04 fonksiyon eşleşmesi=$($delHit.Count), Remove-Item=$rmAll, Env=$rmEnv) · kodlama tanımı=$encOk · param + akış=$parOk" }
  }

  Invoke-RgItem 'RG-11' 'R04-b DOĞRULANMIŞ GİRDİ (makbuz) Recover''da değişmez; değişirse GÖSTERİLİR: (a) -RunEvidenceDir + bayrağı TANIMAYAN koşucu taklidi (sahte koşucu makbuzu bayrağa bakmadan yeniden yazar): blok koşucuya D6_RECEIPT_READONLY=1 vermiştir, Recover''dan SONRA makbuzu yeniden ölçer ve "RECOVER GİRDİSİ (makbuz): Recover''dan sonra DEĞİŞTİ ya da okunamadı (sha256 önce=<kayıttaki makbuzSha256> · sonra=<yeni özet>) — RECOVER-GIRDI-KAYDI.json''daki makbuzSha256 Recover''dan ÖNCEKİ baytlara aittir" satırını gösterir ("DEĞİŞMEDİ" YOK); çıkış kodu değişmez, kayıt dosyasındaki özet eski değerde kalır, Run dizini değişmedi; (b) -ReceiptFile yolu DEĞİŞMEDİ: bayrak VERİLMEZ (sahte koşucu gerçek koşucu gibi makbuzu yerinde yeniden yazar — dosya değişir), "RECOVER GİRDİSİ (makbuz)" satırı YOK; (c) statik: bayrak kaynakta TEK yerde ve yalnız `if ($runEvidenceDir)` koşuluyla kurulur, Invoke-RunMode''da YOK, $SecretEnv listesinde (akış başı / sonu temizliği) ve koşumlardan sonra ortamda KALMAZ' {
    if ($rgSetupErr -or -not $rgSrc) { throw "RG kaynağı kurulamadı: $rgSetupErr" }
    $ca = New-RgCase 'rg11-zorla'; $env:EXSTUB_REWRITE = 'force'
    try { $xa = Invoke-RgRecover $ca @('H') } finally { Remove-Item 'Env:EXSTUB_REWRITE' -ErrorAction SilentlyContinue }
    $ta = if ($xa.sibDirs.Count -eq 1) { [string]$xa.sibDirs[0].FullName } else { '' }
    $ka = if ($ta) { [IO.File]::ReadAllText((Join-Path $ta 'RECOVER-GIRDI-KAYDI.json'), [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json } else { $null }
    $shaNow = if ($ta) { Sha (Join-Path $ta 'd6-setup-receipt-kanittan.json') } else { '' }
    $okA = (-not $xa.r.threw -and $xa.r.out -eq 0 -and $xa.node -eq 1 -and $xa.r.last.ro -eq '1' -and $ka -and $ka.makbuzSha256 -ceq (ShaBytes $rgExp) -and $shaNow -and $shaNow -cne $ka.makbuzSha256 -and
            $xa.txt.Contains("RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞTİ ya da okunamadı (sha256 önce=$($ka.makbuzSha256) · sonra=$shaNow)") -and
            $xa.txt.Contains("RECOVER-GIRDI-KAYDI.json'daki makbuzSha256 Recover'dan ÖNCEKİ baytlara aittir") -and -not $xa.txt.Contains("Recover'dan sonra DEĞİŞMEDİ") -and $xa.same -and $xa.r.secretsLeft -eq 0)
    # (PowerShell değişken adları büyük/küçük harf duyarsızdır: yol ve sonuç değişkenleri ayrı adlarla.)
    $dirB = Join-Path $rgRoot 'rg11-receiptfile'; New-Item -ItemType Directory -Path $dirB | Out-Null; $rcptB = Join-Path $dirB 'd6-setup-receipt.json'; [IO.File]::WriteAllBytes($rcptB, $rgExp)
    $env:EXSTUB_REWRITE = 'runner'
    try { $txtB = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true $rcptB @('H') } } finally { Remove-Item 'Env:EXSTUB_REWRITE' -ErrorAction SilentlyContinue }
    $resB = $script:capR
    $okB = (-not $resB.threw -and $resB.out -eq 0 -and $resB.nodeCalls -eq 1 -and $resB.last.mode -eq 'recover' -and $null -eq $resB.last.ro -and (Sha $rcptB) -cne (ShaBytes $rgExp) -and -not $txtB.Contains('RECOVER GİRDİSİ (makbuz)') -and $resB.secretsLeft -eq 0)
    $recT = [string](($funcs | Where-Object { $_.Name -eq 'Invoke-RecoverMode' } | Select-Object -First 1).Extent.Text); $runT = [string](($funcs | Where-Object { $_.Name -eq 'Invoke-RunMode' } | Select-Object -First 1).Extent.Text)
    $nSet = ([regex]::Matches($src0, [regex]::Escape('$env:D6_RECEIPT_READONLY ='))).Count
    $okC = ($nSet -eq 1 -and $recT.Contains('if ($runEvidenceDir) { $env:D6_RECEIPT_READONLY = ''1'' }') -and $runT.Length -gt 1000 -and -not $runT.Contains('D6_RECEIPT_READONLY') -and ($SecretEnv -contains 'D6_RECEIPT_READONLY') -and -not (Test-Path 'Env:D6_RECEIPT_READONLY'))
    [pscustomobject]@{ ok = ($okA -and $okB -and $okC)
      obs = "(a) bayrağı tanımayan koşucu: rc=$($xa.r.out) bayrak=$($xa.r.last.ro) kayıt özeti=$(if ($ka) { ([string]$ka.makbuzSha256).Substring(0, 12) } else { '-' }) şimdi=$(if ($shaNow) { $shaNow.Substring(0, 12) } else { '-' }) DEĞİŞTİ satırı=$okA · (b) -ReceiptFile: rc=$($resB.out) bayrak=[$($resB.last.ro)] makbuz yeniden yazıldı=$((Sha $rcptB) -cne (ShaBytes $rgExp)) satır yok=$(-not $txtB.Contains('RECOVER GİRDİSİ (makbuz)')) → $okB · (c) statik: bayrak ataması=$nSet → $okC · istisna=[$($xa.r.threw)$($resB.threw)]" }
  }

  # ================================================================ R04-c — RG-12..RG-15: odak doğrulamanın somut noktaları (K2 · K3 · K4 · K5; K1 = RG-9)
  Invoke-RgItem 'RG-12' 'R04-c (K2) -ReceiptFile ORİJİNAL Run kanıt dizinine yazamaz: (a) makbuz, manifesti olan (tamamlanmış) Run kanıt dizininin İÇİNDE ve o dizindeki kanıtta makbuz metni (recovery.makbuzJson) VAR → DUR ("manifesti olan (tamamlanmış) bir Run kanıt dizininin İÇİNDE … Recover BAŞLAMADI"), node çağrısı 0, kalıntı kararı SORULMAZ (yanıt kuyrukta kalır), Run dizini (dosya adları + sha256, alt dizin yok) DEĞİŞMEDİ, GO defteri değişmedi; metin SOMUT yolla "-Mode Recover -RunEvidenceDir ''<dizin>'' kullanın" der; makbuz dosyası bloğun yalın okuma kapısından GEÇER (ret nedeni kapı değil, dizin); (a2) yönlendirme KULLANILABİLİR: aynı dizinle -RunEvidenceDir Recover başlar (node 1, makbuz kardeş dizinde, Run dizini değişmedi); (b) manifest VAR ama kanıtta makbuz metni YOK (GERÇEK Run: sahte koşucu kanıta receipt / recovery yazmaz; makbuz dosyası okunabilir) → Run sonu ekranı "-Mode Recover -ReceiptFile <makbuz>" önerir ve "DİKKAT: kanıtta makbuz metni (recovery.makbuzJson) yok → -RunEvidenceDir kullanılamaz; bu yol recover-* dizinini Run kanıt dizinine açar (D-6: makbuzu yerinde yeniden yazabilir) — orijinal kanıt dizini DEĞİŞİR; manifest kapsamı dışında kalır" der (-RunEvidenceDir ''<yol>'' önerisi YOK); aynı makbuzla -ReceiptFile Recover BAŞLAR (tek kalan yol; node 1, çıkış kodu değişmeden, salt okunur bayrağı YOK) ve aynı cümle Recover başında ("UYARI — makbuz, manifesti olan (tamamlanmış) bir kanıt dizininin İÇİNDE", Recover bitiş satırından ÖNCE) ve bitişinde ("NOT (-ReceiptFile, manifesti olan kanıt dizini)", bitiş satırından SONRA) gösterilir; ölçüm: recover-* dizini Run dizininin İÇİNDE açıldı ve sahte koşucu (gerçek koşucu gibi, bayrak yokken) makbuzu yerinde yeniden yazdı → Run dizini DEĞİŞTİ; (b2) manifest var + kanıt OKUNAMIYOR → aynı uyarıyla izin (node 1); (c) statik: cümle tek fonksiyonda (Get-RunDirWriteNote) ve Run sonu + Recover başı + Recover bitişi onu çağırır. Manifesti olmayan dizin: RG-14 (e) ve RG-11 (b)' {
    if ($rgSetupErr -or -not $rgSrc) { throw "RG kaynağı kurulamadı: $rgSetupErr" }
    # Beklenen cümle SABİT yazılır (bloktan alınmaz): eski blok baytlarında fonksiyon yoksa kalem istisnayla değil, senaryoların ÖLÇÜLEN davranışıyla FAIL verir.
    $note = 'bu yol recover-* dizinini Run kanıt dizinine açar (D-6: makbuzu yerinde yeniden yazabilir) — orijinal kanıt dizini DEĞİŞİR; manifest kapsamı dışında kalır'
    $noteFn = if (Get-Command 'Get-RunDirWriteNote' -CommandType Function -ErrorAction SilentlyContinue) { [string](Get-RunDirWriteNote) } else { '<fonksiyon yok>' }
    $ca = New-RgCase 'rg12-red'; $rcA = Join-Path $ca 'd6-setup-receipt.json'; $snapA = Get-RgSnap $ca; $fullA = (Resolve-Path -LiteralPath $ca).ProviderPath.TrimEnd('\')
    $plainA = [bool](Get-ReceiptFileState $rcA).usable
    $null = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true $rcA @('H') }; $rA = $script:capR; $leftA = $script:Answers.Count; $sameA = ((Get-RgSnap $ca) -ceq $snapA)
    $wantA = "-Mode Recover -RunEvidenceDir '" + $fullA.Replace("'", "''") + "' kullanın"
    $okA = ($plainA -and $rA.threw -like 'EXTACC-D6-DUR:*' -and ([string]$rA.threw).Contains('manifesti olan (tamamlanmış) bir Run kanıt dizininin İÇİNDE') -and ([string]$rA.threw).Contains('kanıtta makbuz metni (recovery.makbuzJson) VAR') -and
            ([string]$rA.threw).Contains('Recover BAŞLAMADI (node çağrılmadı)') -and ([string]$rA.threw).Contains($wantA) -and
            $rA.nodeCalls -eq 0 -and $leftA -eq 1 -and $sameA -and $snapA -cnotmatch '(^|\|)D:' -and $rA.ledgerDelta -eq 0 -and $rA.secretsLeft -eq 0)
    $xa2 = Invoke-RgRecover $ca @('H')
    $okA2 = (-not $xa2.r.threw -and $xa2.r.out -eq 0 -and $xa2.node -eq 1 -and $xa2.receipts -eq 1 -and $xa2.records -eq 1 -and $xa2.marks -eq 0 -and $xa2.recDirs -eq 1 -and $xa2.same)
    # (b) GERÇEK Run: kanıtta receipt / recovery YOK (EXSTUB_EV_RECEIPT=0), makbuz dosyası kanıt dizininde ve okunabilir, manifest yazıldı.
    $env:EXSTUB_EV_RECEIPT = '0'; $script:goN = 22
    try { $txtRun = Get-HostText { $script:capR = Invoke-Mode 'Run' $real.Exe 6 $true } } finally { Remove-Item 'Env:EXSTUB_EV_RECEIPT' -ErrorAction SilentlyContinue }
    $rRun = $script:capR; $runB = (Last-EvDir).FullName; $iEnd = $txtRun.IndexOf('Koşum bitti.'); $tailB = if ($iEnd -ge 0) { $txtRun.Substring($iEnd) } else { '' }
    $okRun = ($rRun.out -eq 6 -and $rRun.nodeCalls -eq 1 -and $rRun.last.mode -eq 'run' -and (Test-Path -LiteralPath (Join-Path $runB 'SHA256-MANIFEST.txt') -PathType Leaf) -and
              $tailB.Contains('-Mode Recover -ReceiptFile <makbuz>') -and $tailB.Contains("DİKKAT: kanıtta makbuz metni (recovery.makbuzJson) yok → -RunEvidenceDir kullanılamaz; $note.") -and
              -not $tailB.Contains("-RunEvidenceDir '") -and $tailB -cnotmatch 'SOMUT ENGEL')
    $rcB = Join-Path $runB 'd6-setup-receipt.json'; $snapB = Get-RgSnap $runB; $shaB0 = Sha $rcB; $env:EXSTUB_REWRITE = 'runner'
    try { $txtB = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 3 $true $rcB @('H') } } finally { Remove-Item 'Env:EXSTUB_REWRITE' -ErrorAction SilentlyContinue }
    $rB = $script:capR; $iW = $txtB.IndexOf('UYARI — makbuz, manifesti olan (tamamlanmış) bir kanıt dizininin İÇİNDE'); $iD = $txtB.IndexOf("DİKKAT: $note."); $iK = $txtB.IndexOf('KURTARMA BİTTİ'); $iN = $txtB.IndexOf("NOT (-ReceiptFile, manifesti olan kanıt dizini): $note.")
    $recB = @(Get-ChildItem -LiteralPath $runB -Directory -Filter 'recover-*')
    $okB = (-not $rB.threw -and $rB.out -eq 3 -and $rB.nodeCalls -eq 1 -and $rB.last.mode -eq 'recover' -and $null -eq $rB.last.ro -and $iW -ge 0 -and $iD -gt $iW -and $iK -gt $iD -and $iN -gt $iK -and
            $txtB.Contains('-RunEvidenceDir kullanılamaz; -ReceiptFile bu paketle tanımlı tek yoldur') -and $recB.Count -eq 1 -and (Sha $rcB) -cne $shaB0 -and (Get-RgSnap $runB) -cne $snapB -and $rB.secretsLeft -eq 0)
    $cd = New-RgCase 'rg12-kanit-bozuk'; [IO.File]::WriteAllText((Join-Path $cd 'd6-evidence.json'), '{bozuk')
    $txtD = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true (Join-Path $cd 'd6-setup-receipt.json') @('H') }; $rD = $script:capR
    $okB2 = (-not $rD.threw -and $rD.out -eq 0 -and $rD.nodeCalls -eq 1 -and $txtD.Contains('UYARI — makbuz, manifesti olan (tamamlanmış) bir kanıt dizininin İÇİNDE') -and $txtD.Contains("DİKKAT: $note."))
    $fn12 = { param([string]$n) [string](($funcs | Where-Object { $_.Name -eq $n } | Select-Object -First 1).Extent.Text) }
    $okC = ($noteFn -ceq $note -and ([regex]::Matches($src0, [regex]::Escape('orijinal kanıt dizini DEĞİŞİR; manifest kapsamı dışında kalır'))).Count -eq 1 -and
            (& $fn12 'Invoke-RunMode').Contains('(Get-RunDirWriteNote)') -and (& $fn12 'Invoke-RecoverMode').Contains('(Get-RunDirWriteNote)') -and (& $fn12 'Assert-ReceiptFileRoute').Contains('(Get-RunDirWriteNote)') -and
            (& $fn12 'Invoke-RecoverMode').Contains('if (-not $runEvidenceDir) { $inEvidenceDir = [bool](Assert-ReceiptFileRoute $rcptDir) }'))
    [pscustomobject]@{ ok = ($okA -and $okA2 -and $okRun -and $okB -and $okB2 -and $okC)
      obs = "(a) manifest + makbuz metni var: ret=$okA (yalın okuma kapısı=$plainA node=$($rA.nodeCalls) kuyrukta yanıt=$leftA Run dizini değişmedi=$sameA) [$($rA.threw)] · (a2) yönlendirilen -RunEvidenceDir çalışır=$okA2 (rc=$($xa2.r.out) node=$($xa2.node) kardeş makbuz=$($xa2.receipts)) · (b) Run sonu metni=$okRun (rc=$($rRun.out)) · -ReceiptFile tek kalan yol: izin + uyarı=$okB (rc=$($rB.out) node=$($rB.nodeCalls) bayrak=[$($rB.last.ro)] uyarı@$iW < dikkat@$iD < bitiş@$iK < not@$iN · Run dizininde recover-*=$($recB.Count) · makbuz yeniden yazıldı=$((Sha $rcB) -cne $shaB0) · Run dizini DEĞİŞTİ=$((Get-RgSnap $runB) -cne $snapB)) · (b2) kanıt okunamıyor: izin + uyarı=$okB2 (node=$($rD.nodeCalls)) · (c) statik=$okC · istisna=[$($rB.threw)$($rD.threw)]" }
  }

  Invoke-RgItem 'RG-13' 'R04-c (K3) makbuz GERİ OKUMA doğrulamasından SONRA, node başlamadan ÖNCE değişirse Recover BAŞLAMAZ: (a) kayıt dosyası (RECOVER-GIRDI-KAYDI.json) yazılırken makbuza bayt eklenir (taklit: geri okuma, okuma kapısı ve kaynak ölçümü geçmiştir) → DUR "Recover girdisi artık doğrulanmış girdi DEĞİL: makbuz doğrulamadan SONRA, node başlamadan ÖNCE DEĞİŞTİ ya da okunamadı (Recover kanıt dizini açılmadan önce; sha256 kayıttaki=<kayıttaki makbuzSha256> · şimdi=<dosyanın özeti>)", node çağrısı 0, recover-* dizini AÇILMAZ, dizin KULLANILMAZ diye işaretlenir (neden işaret dosyasında), kayıt dosyası yerinde ve özeti eski (doğrulanmış) baytlara ait, Run dizini değişmedi; o dizindeki makbuz sonradan -ReceiptFile ile de reddedilir; (b) makbuz ilk ölçümden SONRA, node''dan hemen önce değişir (taklit: Set-RunEnv sırasında bayt eklenir) → ikinci ölçüm noktası yakalar ("node çağrısından hemen önce"), node çağrısı 0, işaret var, ortam temizlendi, recover-* dizininde kanıt / log YOK; (c) makbuz node''dan önce OKUNAMAZSA (taklit: özet ölçümü istisna verir) → "şimdi=okunamadı", node çağrısı 0, işaret var; (d) statik: Invoke-RecoverMode makbuzu iki noktada yeniden ölçer — recover-* dizini açılmadan ÖNCE ve `$rc = Invoke-Node` satırının HEMEN öncesinde; çıkış kodu yolu değişmedi (DUR → 90)' {
    if ($rgSetupErr -or -not $rgSrc) { throw "RG kaynağı kurulamadı: $rgSetupErr" }
    $rgRealW = ${function:Write-NewFileBytes}; $shaExp = ShaBytes $rgExp
    $sibOf = { param([string]$dir) @(Get-ChildItem -LiteralPath (Split-Path -Parent $dir) -Directory | Where-Object { $_.Name -like '*.recover-girdi-*' }) }
    $ca = New-RgCase 'rg13-kayitta'; $script:rgW = 0
    $xa = & { function Write-NewFileBytes([string]$path, [byte[]]$bytes) { & $rgRealW $path $bytes; $script:rgW++; if ($script:rgW -eq 2) { [IO.File]::AppendAllText((Join-Path (Split-Path -Parent $path) 'd6-setup-receipt-kanittan.json'), "`n") } }
              Invoke-RgRecover $ca }
    $ta = if ($xa.sibDirs.Count -eq 1) { [string]$xa.sibDirs[0].FullName } else { '' }
    $ka = if ($ta -and (Test-Path -LiteralPath (Join-Path $ta 'RECOVER-GIRDI-KAYDI.json') -PathType Leaf)) { [IO.File]::ReadAllText((Join-Path $ta 'RECOVER-GIRDI-KAYDI.json'), [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json } else { $null }
    $nowA = if ($ta) { Sha (Join-Path $ta 'd6-setup-receipt-kanittan.json') } else { '' }
    $markA = if ($ta -and (Test-Path -LiteralPath (Join-Path $ta 'RECOVER-GIRDI-KULLANILMAZ.txt') -PathType Leaf)) { [IO.File]::ReadAllText((Join-Path $ta 'RECOVER-GIRDI-KULLANILMAZ.txt'), [Text.UTF8Encoding]::new($false)) } else { '' }
    $okA = ($xa.dur -and $xa.msg.Contains('Recover girdisi artık doğrulanmış girdi DEĞİL: makbuz doğrulamadan SONRA, node başlamadan ÖNCE DEĞİŞTİ ya da okunamadı (Recover kanıt dizini açılmadan önce; ') -and
            $xa.msg.Contains("sha256 kayıttaki=$shaExp · şimdi=$nowA)") -and $nowA -and $nowA -cne $shaExp -and $xa.msg.Contains('Recover BAŞLAMADI (node çağrılmadı; başarı sayılmaz)') -and
            $xa.msg.Contains('KULLANILMAZ diye işaretlendi (RECOVER-GIRDI-KULLANILMAZ.txt)') -and $xa.node -eq 0 -and $xa.sib -eq 1 -and $xa.marks -eq 1 -and $xa.records -eq 1 -and $xa.recDirs -eq 0 -and $xa.same -and $xa.ledger -eq 0 -and
            $script:rgW -eq 3 -and $ka -and $ka.makbuzSha256 -ceq $shaExp -and $markA.Contains('neden: makbuz doğrulamadan SONRA, node başlamadan ÖNCE DEĞİŞTİ') -and $xa.r.secretsLeft -eq 0)
    $flagged = if ($ta) { Join-Path $ta 'd6-setup-receipt-kanittan.json' } else { '' }
    $null = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true $flagged @('H') }; $rF = $script:capR
    $okA2 = ($flagged -and $rF.threw -like 'EXTACC-D6-DUR:*' -and ([string]$rF.threw).Contains('KULLANILMAZ diye işaretlenmiş bir Recover girdisi dizininde') -and $rF.nodeCalls -eq 0)
    # (b) ilk ölçümden SONRA (recover-* dizini açıldıktan sonra), node'dan hemen önce: Set-RunEnv sırasında makbuza bayt eklenir.
    $cb = New-RgCase 'rg13-node-oncesi'
    $xb = & { function Set-RunEnv { & $script:RealSetRunEnv @args; Set-PriorZero; $script:PriorAtNode = $global:LASTEXITCODE; $sd = @(& $sibOf $cb); [IO.File]::AppendAllText((Join-Path $sd[0].FullName 'd6-setup-receipt-kanittan.json'), "`n") }
              Invoke-RgRecover $cb }
    $tb = if ($xb.sibDirs.Count -eq 1) { [string]$xb.sibDirs[0].FullName } else { '' }
    $recB = @(if ($tb) { Get-ChildItem -LiteralPath $tb -Directory -Filter 'recover-*' })
    $recBFiles = @(if ($recB.Count -eq 1) { Get-ChildItem -LiteralPath $recB[0].FullName -File | ForEach-Object { $_.Name } })
    $okB = ($xb.dur -and $xb.msg.Contains('DEĞİŞTİ ya da okunamadı (node çağrısından hemen önce; ') -and $xb.msg.Contains("sha256 kayıttaki=$shaExp · şimdi=") -and $xb.msg.Contains('Recover BAŞLAMADI (node çağrılmadı; başarı sayılmaz)') -and
            $xb.node -eq 0 -and $xb.marks -eq 1 -and $xb.records -eq 1 -and $xb.same -and $xb.r.secretsLeft -eq 0 -and $recB.Count -eq 1 -and ($recBFiles -notcontains 'd6-evidence.json') -and ($recBFiles -notcontains 'd6-recover.log'))
    # (c) makbuz node'dan önce ÖLÇÜLEMEZ (özet ölçümü istisna verir): doğrulanamayan girdi başarıya çevrilmez.
    $cc = New-RgCase 'rg13-okunamadi'; $rgRealSha = ${function:Sha}
    $xc = & { function Sha([string]$p) { if ($p -like '*-setup-receipt-kanittan.json') { throw [IO.IOException]::new('RG taklidi: makbuz kilitli') }; & $rgRealSha $p }
              Invoke-RgRecover $cc }
    $okC = ($xc.dur -and $xc.msg.Contains("sha256 kayıttaki=$shaExp · şimdi=okunamadı)") -and $xc.node -eq 0 -and $xc.marks -eq 1 -and $xc.recDirs -eq 0 -and $xc.same)
    $recT = [string](($funcs | Where-Object { $_.Name -eq 'Invoke-RecoverMode' } | Select-Object -First 1).Extent.Text)
    $p1 = $recT.IndexOf("Assert-RecoverInputUnchanged `$rin 'Recover kanıt dizini açılmadan önce'"); $pDir = $recT.IndexOf('New-Item -ItemType Directory -Force -Path $EvDir')
    $okD = ($p1 -ge 0 -and $p1 -lt $pDir -and ([regex]::Matches($recT, 'Assert-RecoverInputUnchanged \$rin ')).Count -eq 2 -and
            [regex]::IsMatch($recT, "Assert-RecoverInputUnchanged \`$rin 'node çağrısından hemen önce' \}\r?\n\s*\`$rc = Invoke-Node ") -and ([regex]::Matches($recT, 'Invoke-Node ')).Count -eq 1)
    [pscustomobject]@{ ok = ($okA -and $okA2 -and $okB -and $okC -and $okD)
      obs = "(a) kayıt yazımında değişti: ret=$okA (node=$($xa.node) işaret=$($xa.marks) kayıt=$($xa.records) recover dizini=$($xa.recDirs) yazım çağrısı=$($script:rgW) kayıt özeti=$(if ($ka) { ([string]$ka.makbuzSha256).Substring(0, 12) } else { '-' }) şimdi=$(if ($nowA) { $nowA.Substring(0, 12) } else { '-' })) [$($xa.msg)] · sonradan -ReceiptFile reddi=$okA2 · (b) node'dan hemen önce değişti: ret=$okB (node=$($xb.node) işaret=$($xb.marks) recover dizini=$($recB.Count) içerik=[$($recBFiles -join ',')] kalan gizli=$($xb.r.secretsLeft)) [$($xb.msg)] · (c) okunamadı: ret=$okC [$($xc.msg)] · (d) statik: ilk ölçüm@$p1 < dizin@$pDir, ikinci ölçüm node'dan hemen önce → $okD" }
  }

  Invoke-RgItem 'RG-14' 'R04-c (K4) manifest YOK (Run beyan adımında kesilmiş olabilir) → -RunEvidenceDir DUR metni kalan yolu söyler (yalnız METİN; kapı aynı: kardeş dizin OLUŞMAZ, node çağrısı 0, kaynak değişmez): "SHA256-MANIFEST.txt YOK … Run tamamlanmamış olabilir (manifest yazılmadan kesilmiş): bu durumda bu paketle tanımlı tek yol, kanıt dizinindeki makbuz dosyası okunabiliyorsa ''-Mode Recover -ReceiptFile <makbuz>'' — bu yol Run kanıt dizinine yazar; karar owner / CLIENT." + kanıt dizinindeki makbuz dosyasının ÖLÇÜLEN durumu: (a) okunabilir ve kanıttaki makbuz metniyle eşit → "şu an: VAR — … EŞİT" (ek uyarı yok); (b) dosya YOK → "şu an: YOK → -ReceiptFile mevcut ve okunabilir bir makbuz dosyası ister: bu paketle Recover BAŞLATILAMAZ"; (c) dosya bozuk → "şu an: OKUNAMIYOR …" + aynı; (d) dosya kanıttaki makbuz metninden farklı → "şu an: BAYAT …" + "bu dosyayla Recover ÖNERİLMEZ (eksik kapanış yapabilir)"; (e) yönlendirme KULLANILABİLİR ve manifesti olmayan dizinde -ReceiptFile davranışı DEĞİŞMEDİ: (a)''daki makbuzla -ReceiptFile Recover başlar (node 1, uyarı / DUR yok; recover-* dizini o dizinde)' {
    if ($rgSetupErr -or -not $rgSrc) { throw "RG kaynağı kurulamadı: $rgSetupErr" }
    $need = "Run tamamlanmamış olabilir (manifest yazılmadan kesilmiş): bu durumda bu paketle tanımlı tek yol, kanıt dizinindeki makbuz dosyası okunabiliyorsa '-Mode Recover -ReceiptFile <makbuz>' — bu yol Run kanıt dizinine yazar; karar owner / CLIENT. Kanıt dizinindeki makbuz dosyası (d6-setup-receipt.json) şu an: "
    $ca = New-RgCase 'rg14-makbuz-var' @('SHA256-MANIFEST.txt'); $xa = Invoke-RgRecover $ca
    $cb = New-RgCase 'rg14-makbuz-yok' @('SHA256-MANIFEST.txt', 'd6-setup-receipt.json'); $xb = Invoke-RgRecover $cb
    $cc = New-RgCase 'rg14-makbuz-bozuk' @('SHA256-MANIFEST.txt'); [IO.File]::WriteAllText((Join-Path $cc 'd6-setup-receipt.json'), '{"record":"BASKA"}'); $xc = Invoke-RgRecover $cc
    $cd = New-RgCase 'rg14-makbuz-bayat' @('SHA256-MANIFEST.txt'); [IO.File]::AppendAllText((Join-Path $cd 'd6-setup-receipt.json'), ' '); $xd = Invoke-RgRecover $cd
    $okA = ((& $rgPre $xa 'SHA256-MANIFEST.txt YOK') -and $xa.msg.Contains($need + 'VAR — kanıttaki son makbuz metniyle (recovery.makbuzJson) EŞİT') -and -not $xa.msg.Contains('BAŞLATILAMAZ') -and -not $xa.msg.Contains('ÖNERİLMEZ'))
    $okB = ((& $rgPre $xb 'SHA256-MANIFEST.txt YOK') -and $xb.msg.Contains($need + 'YOK → -ReceiptFile mevcut ve okunabilir bir makbuz dosyası ister: bu paketle Recover BAŞLATILAMAZ'))
    $okC = ((& $rgPre $xc 'SHA256-MANIFEST.txt YOK') -and $xc.msg.Contains($need + 'OKUNAMIYOR (kayıt türü / runId tanınmadı) → -ReceiptFile mevcut ve okunabilir bir makbuz dosyası ister: bu paketle Recover BAŞLATILAMAZ'))
    $okD = ((& $rgPre $xd 'SHA256-MANIFEST.txt YOK') -and $xd.msg.Contains($need + 'BAYAT (') -and $xd.msg.Contains(' → bu dosyayla Recover ÖNERİLMEZ (eksik kapanış yapabilir)') -and -not $xd.msg.Contains('BAŞLATILAMAZ'))
    $txtE = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true (Join-Path $ca 'd6-setup-receipt.json') @('H') }; $rE = $script:capR
    $okE = (-not $rE.threw -and $rE.out -eq 0 -and $rE.nodeCalls -eq 1 -and $rE.last.mode -eq 'recover' -and -not $txtE.Contains('UYARI — makbuz, manifesti olan') -and -not $txtE.Contains('NOT (-ReceiptFile, manifesti olan kanıt dizini)') -and
            @(Get-ChildItem -LiteralPath $ca -Directory -Filter 'recover-*').Count -eq 1)
    [pscustomobject]@{ ok = ($okA -and $okB -and $okC -and $okD -and $okE)
      obs = "(a) makbuz okunabilir=$okA [$($xa.msg)] · (b) makbuz yok=$okB · (c) makbuz bozuk=$okC · (d) makbuz bayat=$okD [$($xd.msg)] · (e) -ReceiptFile ile başlar (manifest yok; uyarı yok)=$okE (rc=$($rE.out) node=$($rE.nodeCalls)) [$($rE.threw)]" }
  }

  Invoke-RgItem 'RG-15' 'R04-c (K5) makbuz yazıldıktan SONRAKİ adımlarda BEKLENMEYEN istisna → KULLANILMAZ işareti + DUR (başarı sayılmaz): (a) okuma kapısı ölçümü istisna verir (taklit: dosya kilidi, IOException) → "Recover girdisi hazırlanamadı: yazımdan sonraki adımda BEKLENMEYEN hata (IOException) …", hedef dizin SİLİNMEZ ve KULLANILMAZ diye işaretlenir (neden işaret dosyasında), kayıt dosyası YOK, recover-* dizini YOK, node çağrısı 0, Run dizini değişmedi; (b) geri okuma karşılaştırması istisna verir (taklit: InvalidOperationException) → aynı ret; (c) işaret ZORLANIR: (a)''dan kalan makbuz diskte TAM ve bloğun yalın okuma kapısından geçer ama dizini işaretlidir → -ReceiptFile ile de DUR, node çağrısı 0; (d) statik: yazımdan sonraki adımlar TEK try/catch içinde' {
    if ($rgSetupErr -or -not $rgSrc) { throw "RG kaynağı kurulamadı: $rgSetupErr" }
    $ca = New-RgCase 'rg15-okuma-kapisi'
    $xa = & { function Get-ReceiptFileState([string]$path, [object]$expectedJson = $null) { throw [IO.IOException]::new('RG taklidi: okuma kilidi') }
              Invoke-RgRecover $ca }
    $ta = if ($xa.sibDirs.Count -eq 1) { [string]$xa.sibDirs[0].FullName } else { '' }
    $markA = if ($ta -and (Test-Path -LiteralPath (Join-Path $ta 'RECOVER-GIRDI-KULLANILMAZ.txt') -PathType Leaf)) { [IO.File]::ReadAllText((Join-Path $ta 'RECOVER-GIRDI-KULLANILMAZ.txt'), [Text.UTF8Encoding]::new($false)) } else { '' }
    $okA = ((& $rgPost $xa 'yazımdan sonraki adımda BEKLENMEYEN hata (IOException)') -and $xa.same -and $xa.receipts -eq 1 -and $markA.Contains('neden: yazımdan sonraki adımda BEKLENMEYEN hata (IOException)') -and $markA.Contains('-ReceiptFile ile vermeyin'))
    $cb = New-RgCase 'rg15-karsilastirma'
    $xb = & { function Test-SameBytes([byte[]]$a, [byte[]]$b) { throw [InvalidOperationException]::new('RG taklidi: karşılaştırma') }
              Invoke-RgRecover $cb }
    $okB = ((& $rgPost $xb 'yazımdan sonraki adımda BEKLENMEYEN hata (InvalidOperationException)') -and $xb.same -and $xb.receipts -eq 1)
    $flagged = if ($ta) { Join-Path $ta 'd6-setup-receipt-kanittan.json' } else { '' }
    $plain = [bool]($flagged -and (Get-ReceiptFileState $flagged).usable -and [Convert]::ToBase64String([IO.File]::ReadAllBytes($flagged)) -ceq [Convert]::ToBase64String($rgExp))
    $null = Get-HostText { $script:capR = Invoke-Mode 'Recover' $real.Exe 0 $true $flagged @('H') }; $rF = $script:capR
    $okC = ($plain -and $rF.threw -like 'EXTACC-D6-DUR:*' -and ([string]$rF.threw).Contains('KULLANILMAZ diye işaretlenmiş bir Recover girdisi dizininde') -and $rF.nodeCalls -eq 0 -and @(Get-ChildItem -LiteralPath $ta -Directory -Filter 'recover-*').Count -eq 0)
    $newT = [string](($funcs | Where-Object { $_.Name -eq 'New-RecoverInputFromRun' } | Select-Object -First 1).Extent.Text)
    $q1 = $newT.IndexOf('Write-NewFileBytes $rcptPath'); $q2 = $newT.IndexOf("RECOVER-GIRDI-KAYDI.json') ("); $q3 = $newT.IndexOf('} catch { if (-not $why) { $why = "yazımdan sonraki adımda BEKLENMEYEN hata')
    $q0 = [regex]::Match($newT, 'try \{\r?\n\s*try \{ Write-NewFileBytes \$rcptPath ')   # dış try, makbuz yazımının HEMEN öncesinde açılır
    $okD = ($q1 -gt 0 -and $q2 -gt $q1 -and $q3 -gt $q2 -and $q0.Success -and $q0.Index -lt $q1 -and ([regex]::Matches($newT, [regex]::Escape('yazımdan sonraki adımda BEKLENMEYEN hata'))).Count -eq 1)
    [pscustomobject]@{ ok = ($okA -and $okB -and $okC -and $okD)
      obs = "(a) okuma kapısı istisnası: ret + işaret=$okA (işaret=$($xa.marks) kayıt=$($xa.records) makbuz dosyası=$($xa.receipts) node=$($xa.node)) [$($xa.msg)] · (b) karşılaştırma istisnası=$okB [$($xb.msg)] · (c) işaretli dizindeki TAM makbuz -ReceiptFile ile: yalın okuma kapısı + baytlar tam=$plain ret=$okC [$($rF.threw)] · (d) statik: dış try@$($q0.Index) < yazım@$q1 < kayıt@$q2 < dış catch@$q3 → $okD" }
  }
}
finally {
  foreach ($k in 'EXSTUB_RC', 'EXSTUB_WRITE_EVID', 'EXSTUB_MARKER', 'EXSTUB_WAIT', 'EXSTUB_QR_RC', 'EXSTUB_FINDING', 'EXSTUB_D9', 'EXSTUB_DOC', 'EXSTUB_EXTRA', 'EXSTUB_DOCDURUM', 'EXSTUB_NO_RECEIPT', 'EXSTUB_EV_RECEIPT',
             'EXSTUB_STALE', 'EXSTUB_EV_EXITCODE', 'EXSTUB_SV', 'EXSTUB_EXPECT_COPY', 'EXSTUB_REAL_RUNNER', 'EXSTUB_ACIK', 'EXSTUB_PC', 'EXSTUB_REWRITE') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
  Clear-SecretEnv
}

$rows | Format-Table -AutoSize -Wrap | Out-String -Width 240 | Write-Host
# Gözlem dökümü (R02): tablo genişliği gözlem sütununu düşürdüğü için her ölçütün ölçülen değeri ayrıca yazılır.
Write-Host 'GÖZLEMLER (her ölçütün ölçülen değeri):'
foreach ($row in $rows) { Write-Host ("  {0,-4} {1,-6} {2}" -f $row.sonuc, $row.id, $row.gozlem) }
Write-Host ''
$fail = @($rows | Where-Object { $_.sonuc -eq 'FAIL' }).Count
Write-Host ("EXTACC D-6 OWNER BLOĞU ÖZ-TESTİ [{0}]: PASS {1} / {2}" -f $ps, ($rows.Count - $fail), $rows.Count)
Write-Host ("  test edilen blok: d6-owner-live-block.ps1 sha256={0}" -f (Sha $wrapper))   # log tek başına hangi blok baytlarının koşulduğunu söyler
Write-Host "  geçici dizin: $T  (canlı kapılar, canlı .env, canlı DB ve GO KULLANILMADI)"
if ($fail -gt 0) { exit 1 }
exit 0
