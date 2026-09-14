# İ11 — TAM CANLI KABUL KAPANIŞ KAYDI (R01) · §5.4

BELGE    : I11-TAM-CANLI-KABUL-KAPANIS-KAYDI-R01
KAPSAM   : CLIENT İ11 gönderim-açık tam canlı kabulü (R04 §7 yeniden deneme; **yalnız D2/D3**).
           RELEASE23 CANLIDA (cutover `CUT-20260913-200554-ec45bc63`) — bu kayıt cutover/mühür/authority içermez.
DURUM    : **İ11 KAPANDI — TAM CANLI KABUL PASS.** §5.4 K1–K4 hepsi sağlandı. Sayaç 10/17 → **11/17**.
RUNID    : `158675ab` (ortam=live)
REFERANS : İ11 GO ref = owner'ın CLIENT oturumuna birebir verdiği `<İ11-REF>` (2026-09-14/R01). **Literal bu kayda
           yazılmaz** (owner talimatı; özgün koşum kanıtlarında geçer, K-REF taze koşum başlangıcında tüketim 0 ölçtü).

---

## 1. Yürütme sırası (R04 §7; hepsi kaydedildi)

| Adım | Yürütücü | Sonuç |
|---|---|---|
| §7 madde-3 bağımsız ön-ölçüm | ana yürütücü | PASS (kanıt `r28-m3-14-evidence.txt` sha `EF712F40…`): §1.4 11/11 eşit · §1.1 canlı kimlik eşit · yeni ref main'de 0 · generations\R22 3/3 |
| D2 go-anı kapısı | CLIENT | PASS: env sha=pin · `redactSecretPathSegments` canlı dist · K-API :8080 RELEASE23 dist · K-BLD `2740df3d`/`dOiGPj2M0Abls0kCibY4r` · :2526 0 · I11-WINDOW-BLOCK 0 |
| D3-0 ön durum + yakalayıcı + K-PAR | owner (elevated pwsh 7) | `D3-0 TAMAM` |
| D3-1 T-PENCERE-AÇ | owner | `T-AC cikis=0`, pencere AÇIK; API restart; K-T0 koruma kaydı mevcut |
| D3-2 İ11 §9 (TEK KOŞUM) | owner | §9 blok sha `338FA301…` kaynaktan doğrulandı; koşum PASS (aşağıda) |
| D3-4 T-PENCERE-KAPA | owner | `T-KAPA cikis=0`, pozitif hedef kanıtı VAR, pencere KAPANDI |
| D3-5 bağımsız salt-okuma | OFFICE 33 + ana yürütücü | iki taraflı PASS (aşağıda) |

Wrapper (CLIENT; commit edilmez): §9 bloğunu kanonik `.md`'den açık UTF-8 okur, fence-içi satırları LF + tek sonda-LF ile
`338FA301…` pinine karşı doğrular, üç doldurma satırını **tek-eşleşme + format kapısıyla** değiştirir (`$GoRef`/`$SendGo` =
`$env:T_GOREF`, `$SmtpAck='EVET'`; literal dosyaya yazılmaz), tek kez `Invoke-Expression` eder. Kuru test: pwsh 7 + WinPS 5.1
ikisinde sha eşit, parse 0.

## 2. §5.4 — K1–K4 (hepsi PASS)

**K1 — İ11 tam PASS.** `i11-run` çıkış 0 · `CL-I11-RUN result=PASS` · kapsam **TAM** (A-5 · A-6 · review→promote) ·
ölçümler **11 / 0 / 0 / 0** (PASS/FAIL/ÖLÇÜLEMEYEN/KAPSAM DIŞI) · `unauthorizedStop=null` · `secretsPrinted=false`.
Kurulum 18/18 satır · K-ARC 21/21 uyuşmazlık 0 · K-REF tüketim 0/anma 0 (taze).

**K2 — bağlantı/kullanıcı kapanışı.** `ClientIntakeLink` tümü ACTIVE→**REVOKED** (2) · anonim yol **200→404** ·
kullanıcılar pasif + `tokenVersion++` (3) · kapatma sonrası **login 401** · ikinci `cl-09` `alreadyClosed=true` çıkış 0 ·
`Case` ACTIVE→**CLOSED** · cron maruziyeti kapandı · sayı-düzeyi izolasyon **eşit** (digest `a58ddef5…`, delta 0) ·
kanıt korundu (`evidencePreserved=true`).

**K3 — T-KAPA pozitif hedef kanıtı.** K-T10b: çalışan API yerel yakalayıcıya bağlandı ve **bu koşuma ait 2 sentetik ileti**
teslim etti; R-T6 yakalanan iletilerin tamamı sentetik alan (`cl-acceptance.invalid`, gerçek alıcı yok) · R-T1 env=pin ·
R-T2 API restart PID 48668 kesinti 9 sn (bütçe 180) · R-T3 özgün SMTP hedefi geri geldi (değer yazılmadı — `.env` içeriği) ·
R-T4a kesin-ad engel kuralları kaldırıldı 2, zaten yok 0 (**joker yok**, başka kurala dokunulmadı) · R-T4b Web ayakta ·
R-T7 env SDDL = T-AÇ tabanı · **`Pozitif hedef kaniti: VAR`** · **`PENCERE KAPANDI - tum adimlar basarili`** · **`T-KAPA cikis=0`**.

**K4 — D3-5 iki taraflı bağımsız salt-okuma.**
- OFFICE 33 (çıkış 0): env sha=pin · SDDL=taban · :8080 PID 48668 + :3002 PID 28952 kök `HY_W4_RELEASE23` · iki kesin-ad kural
  "kural yok (doğrulanmış)" · `I11-WINDOW-BLOCK-*` sayım 0 · :2526 0 · bin R23 üç sha · BUILD_ID · R28 MANIFEST değişmedi.
- ana yürütücü (kanıt `r28-d35-retry-158675ab-evidence.txt` sha `2EAF3FDA…`): env sha=pin · SDDL=taban · portlar RELEASE23 ·
  `I11-WINDOW-BLOCK` 0 (DisplayName kesin ad da yok) · HYRT4S 0 · :2526 0 · görevler Running.

CLIENT post-window salt-okuma kontrolü (bilgi): env sha=pin · SDDL=taban · I11-WINDOW-BLOCK 0 · :2526 0 ·
:8080 PID 48668 RELEASE23 dist · :3002 PID 28952 Web.

## 3. Kanıt bağı (korumalı yerel arşiv — repoya kopyalanmaz)

Kabul kanıtları GO ref literali ve `.env` değeri taşıdığından **repoya kopyalanmaz**; korumalı yerel arşive SHA256 ile bağlanır.

- **Konum (owner kararı, 2026-09-14 yazılı):** arşiv `Documents\CLIENT-EVIDENCE-20260911\i11live-deneme2-20260914T101447Z-158675ab`
  altına taşındı (aynı birimde yeniden adlandırma; eski `scratchpad\i11live` yolu YOK). Scratchpad'e geri taşınmaz, silinmez.
- Yerel SHA256 manifesti: bu dizindeki `EVIDENCE-MANIFEST-158675ab.txt` sha256
  **`C55F1D23E692E39757F0FF0B451EC7F79439FB5F19D392C475F0A4E3867BBF8B`** — i11live 7 dosyanın (ENV-PREIMAGE `7A7228B1…` ·
  `i11-state-158675ab.json` · `RUNID-RESERVATION.txt` · FW-RULES · SINK/SDDL taban · `D3-EVIDENCE-158675ab.txt`) yol+sha'sını
  ve peer bağımsız-doğrulama kanıtlarını (`r28-m3-14` `EF712F40…`, `r28-d35-retry-158675ab` `2EAF3FDA…`) listeler.
- **Bütünlük + koruma doğrulaması (owner + OFFICE 33 bağımsız salt-okuma, 2026-09-14):** owner yükseltilmiş pencerede
  OFFICE'in `918200F1…` normalize bloğunu koştu (`NORMALIZE PASS 8/8`); OFFICE bağımsız 26/26 PASS: **8/8 dosya sha256 = taşıma
  öncesi değerler** (içerik korundu) · **8/8 ACL doğru** — dizin SDDL `O:BAG:DUD:PAI(SY FA)(BA FA)(…-1146 FA)`, 7 dosya kalıtımlı
  `D:AI` {SY, BA, …-1146} FullControl, ENV-PREIMAGE açık PAI · **boş DACL 0 · yabancı SID 0** · üst dizin yeniden-adlandırma/silme
  riski KAPALI (yabancı yalnız `…-1003` RX). Manifest 7/7 diskle eşit, ref literali 0.
- **`i11live` (2. deneme) sır taşır, korunur; silinmez** (owner kararı) — §5 temizliğine dâhil DEĞİLDİR.
- Sabit kimlikler: §9 pin `338FA301…` · `T_ENV_PRE_SHA` `7A7228B1…` · kanonik main ⊇ `ae7e1ae5` · canlı RELEASE23 `2740df3d`.

## 4. Kapanış sonrası durum ve açık kalemler

- **İ11 KAPANDI** (K1–K4 PASS). **Sayaç 11/17.** Hizmet kabulü **0/8 tam** (değişmedi). RELEASE23 **canlı kalır**.
- İ11 **yeniden koşulmayacak**; GO ref ve `cl-acc-<runId>` yeniden kullanılmaz/açılmaz. **İ12 bu kayıtla başlamaz.**
- CLIENT temizlik kalemi: `CL_I11LIVE` worktree (koşumun K-WT'si; `5aa0f7b2`) — bu kayıt merge sonrası kaldırılır.
- `i11live` (2. deneme) akıbeti KARARA BAĞLANDI (owner 2026-09-14 yazılı): Documents korumalı arşivde KALIR, silinmez (§3).
- Owner kararı bekleyen (bu kayıt kapsamı dışı): `CL_TOKENFIX` ve `{}` disk artıkları.
- Ana yürütücü bağımsız-doğrulama Ek F'i ayrı closure PR (#2677) MERGED @ `7759f06d` (madde-3 + D3-5; ref literali yok).
