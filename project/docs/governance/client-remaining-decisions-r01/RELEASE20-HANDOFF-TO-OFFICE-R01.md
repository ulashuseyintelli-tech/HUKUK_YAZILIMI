# RELEASE20 — CLIENT → OFFICE/C33 DEVIR VE CAKISMA BULGULARI

```text
BELGE      : RELEASE20-HANDOFF-TO-OFFICE-R01
URETEN     : CLIENT hatti (owner GO 2026-09-07, madde 1)
DEVRALAN   : Office/C33 — RELEASE20 adayinin TEK URETICISI
DURUM      : CLIENT URETIMI DURDURULDU / YENIDEN BASLATILMAYACAK
SILME      : YAPILMADI — ortak worktree, tooling, belge ve paket YERINDE
```

> Bu belge **devir ve bulgu kaydidir**. Aday paket kimligi, gecerli muhur veya yayin kaniti
> URETMEZ. Karisik uretim sirasinda olusan ara makbuzlar **gecerli yayin kaniti degildir**;
> inceleme icin korunmustur.

## 1. CLIENT tarafinda yapilanlar (madde 1)

| Islem | Durum |
|---|---|
| Ortak RELEASE20 dizinlerine yazma | **DURDURULDU** (son yazma 2026-09-07 ~10:54) |
| CLIENT'e ait uretim/izleyici surecleri | **DURDU** — `run-chain`, `produce-manifest`, `emit-ordinal`, `seal-candidate`, `validate-release`, `Run-R20Qualification`, `stage-*`, `turbo/next/nest build` desenleriyle surec taramasi: **0 calisan surec**; RELEASE20 yolunu tutan surec **YOK** |
| Ortak worktree / tooling / belge / paket silme | **YAPILMADI** (owner kisiti) |
| CLIENT paket uretimi | **YENIDEN BASLATILMAYACAK** |

`HY_W4_RELEASE20` worktree'si yerinde: HEAD `08ce8e2559b4d1d67fcee245413de510209507f3`,
detached, calisma agaci **temiz** (dirty 0).

## 2. Cakisma bulgulari (kanit)

CLIENT uretimi basladiginda RELEASE20 icin baslanmis paket YOKTU (gorev basi olcumu). Uretim
**sirasinda** ikinci bir hat ayni dizinlere yazmaya basladi.

| Gozlem | Kanit |
|---|---|
| Yazilmayan belge belirdi | `docs/CUTOVER-OUTAGE-PLAN.md` (10:58:09) — CLIENT bu adla belge yazmadi |
| CLIENT belgesi uzerine yazildi | `docs/IDENTITY-CHAIN-AND-ROLLBACK-PINS.md` (10:58:09) — icerik tamamen degisti |
| Release koku yeniden derlendi | Web `BUILD_ID`: CLIENT uretimi `rYDvCi6T3lWk_0km72fjT` → diskte `LW4jlJUOMHrvVEqakKB3i` |
| DEPS katmani bayti degisti | `1 105 349 194` → `1 105 346 554` |
| Manifest/makbuz baska ureticiyle yazildi | manifest 10:57:43, makbuz 10:58:49 — CLIENT zinciri kosarken |

**Dogrudan sonuc:** CLIENT'in ikinci zincir kosumu **8/11**'e dustu; iki bagimsiz dogrulayici
`GECERSIZ` verdi (Node 37/38, PowerShell 27/28). Bu bir dogrulayici kusuru DEGILDIR — olctukleri
agac olcum sirasinda degisti.

Diger hattin belgesindeki serh cakismanin karsilikli oldugunu gosteriyor: *"worktree'si bu
oturumdan ONCE olusturulmustu; uzerine yazilmadi, build bu oturumda yeniden uretildi"* — o hat
CLIENT'in olusturdugu worktree'yi devralinmis zemin saymis.

> **CLIENT'in kendi olcumleri gecerli yayin kaniti olarak SUNULMAZ.** Ilk tam kosumun degerleri
> (`candidateDigest B19D0D80…`, zincir 11/11, qualification 26/26) o anki release kokune aitti ve
> o agac artik yok.

## 3. Devredilen duzeltme: supersede / rollback hedefi

RELEASE19 araclarinin RELEASE20'ye forkunda **supersede kaydi tasinmadi**: genel jeton kurali
(`RELEASE19 → RELEASE20`) `HY_W4_RELEASE18` / `b5338552` literallerini kapsamaz. Sonuc: manifest
yanlis rollback hedefi yaziyordu.

### 3.1 CLIENT tarafindan duzeltilen (su an diskte DOGRU)

**`tooling/producer/produce-manifest.js`** (~satir 180):

```diff
-    candidate: 'HY_W4_RELEASE18', sourceCommit: 'b5338552',
-    reason: 'OWNER GO (2026-09-06): aday 08ce8e25… (#2512 F04 + #2513 kayit + #2514 OFFICE F-B01-03) SABIT; RELEASE18 (b5338552) CANLI ve ROLLBACK hedefi olarak KORUNUR, …'
+    candidate: 'HY_W4_RELEASE19', sourceCommit: 'a60d772b',
+    reason: 'OWNER GO (2026-09-07): aday 08ce8e2559b4d1d67fcee245413de510209507f3 (CLIENT #2530/#2534 kod + #2536 kayit; OFFICE #2532/#2533 kayit + #2535 kod) SABIT; RELEASE19 (a60d772b) CANLI ve ROLLBACK hedefi olarak KORUNUR, cutover SONRASI DEPLOY EDILMEZ'
```

**`tooling/producer/seal-candidate-receipt.js`** (satir 50):

```diff
-  status: 'CANDIDATE_BUILT_AND_VERIFIED / CUTOVER_NOT_AUTHORIZED (RELEASE18 rollback pinned)',
+  status: 'CANDIDATE_BUILT_AND_VERIFIED / CUTOVER_NOT_AUTHORIZED (RELEASE19 rollback pinned)',
```

### 3.2 HALA TUTARSIZ — Office/C33'un baglamasi gereken yerler

Ayni duzeltme **dogrulayicilarda uygulanmamis durumda**; uretici ile dogrulayici su an CELISIYOR.
Bu celiski **dogrulanmis bir kusurdur**. Zincirin 8/11 sonucuna katkisi ve **tek neden olup
olmadigi**, ayni pencerede eszamanli yazim da bulundugu icin mevcut kanitla **KESINLESMEMISTIR**:

| Dosya | Satir | Su anki (YANLIS) | Olmasi gereken |
|---|---|---|---|
| `tooling/validators/validate-release20.js` | 40–41 | `'HY_W4_RELEASE18'` · `'b5338552'` · regex `RELEASE18 \(b5338552\)` | `'HY_W4_RELEASE19'` · `'a60d772b'` · regex `RELEASE19 \(a60d772b\)` (baslik metni de `OWNER GO 2026-09-07`) |
| `tooling/validators/Validate-Release20.ps1` | 65 | `$M.supersedes.candidate -ceq 'HY_W4_RELEASE18'` | `-ceq 'HY_W4_RELEASE19'` |

Zaten **DOGRU** olanlar (yeniden uyarlanmasina gerek yok): `binding/validate-binding.js` B-014
(satir 59) ve B-063 (satir 160), `binding/New-R09ProductionBindingProfile.ps1` directive (satir 229),
`env-key-requirements.js` ve `binding/Test-PathSafe.ps1` / `binding/measured-exists.js` basliklari.

> **Owner kurali geregi devredilen tooling DOGRULANMIS KABUL EDILMEZ.** Yukaridaki liste bir
> kolaylik kaydidir; Office/C33 supersede/rollback hedefini RELEASE19 ve **tam** kaynak SHA'sina
> kendi dogrulamasiyla baglar.

## 4. Diger devredilen bulgular

1. **Qualification harness aday manifestini bozmuyor** (temp kopya ile calisiyor); ancak
   harness'in `New-TempCandidate` adimi `tooling/` agacinin tamamini kopyalar. Owner talimatina
   uygun olarak harness **ayri test alaninda** kosulmalidir.
2. **Launcher staging pinleri canli olcumden yenilendi** (2026-09-07, salt-okuma):
   `start-api.ps1` `B5716157…E97C`, `start-web.ps1` `3375A46F…474C`,
   `hukuk-task-host.exe` `BB136AA4…A923`. RELEASE19 forkundaki R22 pinleri **bayattir**.
3. `stage-web-launcher-generation.js` icinde fork sonrasi bir **tanimsiz degisken** kusuru vardi
   (`R19 is not defined`); CLIENT `RNEXT` olarak duzeltti. Office/C33 kendi forkunda ayni tuzagi
   kontrol etmelidir.
4. **PRE-01 / PRE-06 / PRE-07 / PRE-08** olculen gercek durum (CLIENT kosumu, 2026-09-07):
   PRE-01 release kokunde `.env` YOK · PRE-06 **OLCULEMEDI** (limited token gorev listeleyemiyor;
   ELEVATED_ONLY — yok sayilmaz, karsilandi sayilmaz) · PRE-07 kok henuz SALT-OKUNUR degil ·
   PRE-08 baslatici hala RELEASE19'a bagli. Ilk ucu cutover H-fazinda, PRE-08 cutover'in kendisiyle
   karsilanir; **hicbiri PASS sayilmaz**.

## 5. Kaynak tarafi olcumleri (cakismadan ETKILENMEZ)

Bunlar git uzerinden olculmustur ve paket karisikligindan bagimsizdir:

| Olcum | Deger |
|---|---|
| Aday kaynak | `08ce8e2559b4d1d67fcee245413de510209507f3` |
| RELEASE19 kaynak | `a60d772b6c53ece6bc23b77821a2921ab0ec7942` |
| Commit / dosya | 22 / 88 |
| Calisan kod | 34 (API 19 / web 15) |
| Yeni migration | **0** — repo 129 dizin = RELEASE19 129 dizin, `diff -r` icerik birebir (**DB ledger kabulu DEGILDIR**) |
| Sema / lockfile / CI workflow / yeni env anahtari | 0 |
| Dahil teslimler | CLIENT #2530 `815fcf96` · #2534 `6dd25b31` · #2536 `08ce8e25`; OFFICE #2532 `a810418d` · #2533 `3db25358` · #2535 `3ac49083` — altisi da aday kaynagin **atasi** |

## 6. Sinirlar

CLIENT bu noktadan sonra RELEASE20 uretimine **girmez**: manifest/defter/muhur uretmez, release
kokune yazmaz, paket dizinine yazmaz, hicbir seyi silmez. Cutover CLIENT tarafindan
**calistirilmaz**. Canli gecis onayi bu belgeyle **istenmemektedir**.
