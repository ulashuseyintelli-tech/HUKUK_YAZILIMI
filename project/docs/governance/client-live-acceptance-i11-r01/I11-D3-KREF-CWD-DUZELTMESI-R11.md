# CLIENT İ11 — §9 K-REF CWD-BAĞIMSIZLIK DÜZELTMESİ (R11)

```text
BELGE    : I11-D3-KREF-CWD-DUZELTMESI-R11   (§9 blok hash'ini yeniler; T betikleri DEĞİŞMEDİ)
TETİK    : 2026-09-13 canlı D3-2 §9, owner yükseltilmiş penceresinde (cwd C:\Windows\System32) K-REF'te DURDU
YETKİ    : owner GO "RELEASE23 R03 / R28 KOŞULLU CANLI YÜRÜTME" madde 3 (dar düzeltme; otomatik tekrar YOK)
DURUM    : DÜZELTİLDİ + iki kabukta ayrıştırma 0 + gh -R cwd-bağımsız ölçüldü · canlı kabul YAPILMADI (yeniden deneme ayrı owner GO)
```

## 1. Kusur — ÖLÇÜLDÜ (canlı koşumda)

D3-2 §9 owner penceresinde koşarken K-REF gate'i şu hatayla durdu:
```
failed to run git: fatal: not a git repository (or any of the parent directories): .git
K-REF: acik PR listesi alinamadi
```
Kök neden: K-REF'in açık-PR taraması `gh pr list --state open …` çağrısını **çalışma dizinine bağlı** yapıyordu. Owner penceresinin cwd'si `C:\Windows\System32` (git deposu değil) olduğu için `gh` hedef depoyu belirleyemedi ve çıkış ≠ 0 verdi → K-REF fırlattı.

**K-REF, `node i11-run.js`'den ÖNCEki bir kapıdır** → İ11 kabulü **koşmadı** (runId yok, DB yazımı yok, gönderim yok). Öndeki kapılar geçmişti: K-WT (worktree `a24431ba` = origin/main), K-ARC (21/21 uyuşmazlık 0), K-API (:8080 PID 41560 RELEASE23), K-BLD (2740df3d / dOiGPj2M), K-SMTP (canlı sağlayıcı `smtp`, host pencere içi 127.0.0.1), K-INTAKE (rastgele token → 404).

Pencere D3-4 T-KAPA `$rid=''` ile **temiz kapandı** (`PENCERE KAPANDI - tum adimlar basarili`, çıkış 0); bağımsız salt-okuma: `.env` sha `7A7228B1…` (=pin, SMTP_HOST özgün), :8080/:3002 RELEASE23, `I11-WINDOW-BLOCK` 0, :2526 0, görevler Running, R-T7 SDDL=taban.

## 2. Düzeltme — dar (yalnız K-REF'in gh çağrısı)

§9 bloğundaki **tek** cwd-bağımlı çağrı `gh pr list`'ti; tüm `git` çağrıları zaten `git -C $CANON` (cwd-bağımsız). Düzeltme yalnız o satırı hedef depoya açıkça bağlar:

```powershell
# ÖNCE
$openBranches = @(gh pr list --state open --json headRefName --jq '.[].headRefName')
# SONRA
$ru = (git -C $CANON remote get-url origin); if ($LASTEXITCODE -ne 0) { throw 'K-REF: origin remote url alinamadi' }
if ($ru -match '[/:]([^/:]+/[^/]+?)(?:\.git)?/?\s*$') { $ghRepo = $Matches[1] } else { throw "K-REF: repo adi cozulemedi ($ru)" }
$openBranches = @(gh pr list -R $ghRepo --state open --json headRefName --jq '.[].headRefName')
```
Repo `$CANON`'un origin remote'undan türetilir (`ulashuseyintelli-tech/HUKUK_YAZILIMI`); `gh -R $ghRepo` cwd'den bağımsızdır. K-REF'in diğer adımları (origin/main grep, açık-PR dal grep, koşum-kaydı taraması, tüketim/anma sayımı) DEĞİŞMEDİ. §9'un başka hiçbir kapısı/satırı değişmedi.

**Denetim:** §9 bloğundaki tüm git/gh çağrıları tarandı — `git -C $CANON` (fetch main, worktree add, grep origin/main, fetch $b, grep FETCH_HEAD) hepsi cwd-bağımsız; tek istisna gh idi, düzeltildi. Başka cwd-bağımlı çağrı yok.

## 3. Hash

| Öğe | Değer |
|---|---|
| İ11 §9 gömülü blok | `27E754A7…` → **`338FA301B0274D84C9F060A55B84A4C1EA78973FE73843C0D6BE796C387D805A`** |
| T-PENCERE-AÇ / T-KAPA / prova / harness | **DEĞİŞMEDİ** (834DF587 / 676C1542 / B643DF51 / 998A127B) |

§9 bloğu: PS 5.1.26100 + PS 7.6.5 ayrıştırma hatası 0 (blok içi 4 ASCII-dışı karakter yorumlardadır — önceden vardı, sha 27E754A7 onlarla hesaplanmıştı; düzeltme ASCII).

## 4. Yeniden deneme ön koşulları (otomatik tekrar YOK — ayrı owner GO)

D3 yeniden denenirse (owner'ın ayrı GO'su ile):
1. **Bu düzeltme main'de** ve kanonik ağaç senkron; §9 sha = `338FA301…`. D3-2 sarmalayıcısının sha kapısı bu değere güncellenir.
2. **CL_I11LIVE worktree kaldırılmalı** — aborte olan §9'un K-WT'si oluşturmuştu (`a24431ba`); K-WT var olan worktree'de DURUR. `git -C <CANON> worktree remove C:\Development\HY_WT\CL_I11LIVE`.
3. **`i11live` yedek dizini kaldırılmalı** — T-AÇ K-T0'ın oluşturduğu (`…\scratchpad\i11live`, ENV-PREIMAGE + FW-RULES + SDDL tabanı); **sır taşır, korumalı → silme owner kararı.** Kalırsa D3-0 ve T-AÇ K-T0a "zaten var" ile durur.
4. OFFICE 33 R03 D3-2 pinini `338FA301…` olarak yeniler; owner İ11 ref'i `OWNER-GO-CLIENT-I11-20260913-R01` aynen (K-REF tüketim kontrolünden geçer — İ11 koşmadığı için ref tüketilmedi).

## 5. Durum
- Cutover DURUYOR: **RELEASE23 CANLI** (D1/D2 geçti; teknik kabul PASS). Pencere kapalı.
- İ11 canlı kabulü **KOŞMADI** (K-REF cwd kusuru). Pozitif kabul kanıtı yokluğu başarıya çevrilmedi.
- **İ11 AÇIK, sayaç 10/17, hizmet kabulü 0/8 tam.** İ12 başlatılmadı.
- Açık kalemler owner kararı: `i11live` yedek (sır, korumalı), CL_I11LIVE worktree (kaldırma), `{}` artığı, CL_TOKENFIX.
