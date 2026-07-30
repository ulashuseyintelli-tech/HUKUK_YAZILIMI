# Faz-5 Sonrasi Orphan Dizin Disposition Kaydi (R01)

`POST-PHASE-5-RESIDUAL-HYGIENE-AND-CANONICAL-CLOSEOUT-R01` gorevinin WP01-WP03
adimlarinin canonical kaydi. Uc fiziksel orphan dizin (RECEIVABLE
controlled-default-off gorevinin uc calistirma denemesinden kalan worktree
kalintilari) evidence-gated biçimde incelendi, disposition edildi, guvenli
olanlar temizlendi.

## Kapsanan dizinler

```text
C:\Development\HUKUK_YAZILIMI\HUKUK_orch_runs\RECEIVABLE-LEGAL-BASIS-R-0da0be71
C:\Development\HUKUK_YAZILIMI\HUKUK_orch_runs\RECEIVABLE-LEGAL-BASIS-R-79bd9cca
C:\Development\HUKUK_YAZILIMI\HY_receivable_ci_manifest_fix
```

## WP01 — Envanter (OBSERVED, bu oturumda toplandi)

| Alan | 0da0be71 | 79bd9cca | HY_receivable_ci_manifest_fix |
|---|---|---|---|
| exists (temizlik oncesi) | VAR | VAR | VAR |
| `.git` gitlink | YOK | YOK | YOK |
| `git worktree list` kaydi | YOK (unregistered) | YOK | YOK |
| `apps/api/src/` | SILINMIS (yalniz `node_modules` kalmisti) | SILINMIS | SILINMIS |
| unique commit main'e gore | main ile ozdes (0 commit, EXECUTOR_TIMEOUT) | main'e MERGE oldu (#1930 → `479df1056bbaf94ab0d6d946500e5b01c3550267`) | ayni is, ek commit `0f332ed3` dahil |
| dosya / dizin / boyut | 75136 / 12253 / 1.13 GB | 75139 / 12255 / 1.13 GB | 66988 / 10607 / 0.97 GB |
| reparse point (junction) toplam | 4792 | 4792 | 4792 |
| → canonical-repo hedefi | 0 | 0 | 0 |
| → dis hedef | 0 | 0 | 0 |
| → ic hedef (kendi `node_modules\.pnpm\...`) | 4792 | 4792 | 4792 |
| live process handle (rename testi) | YOK | YOK | YOK |
| PR / merge SHA | yok (PR hic acilmadi) | #1930 / `479df1056bbaf94ab0d6d946500e5b01c3550267` | ayni |
| owner WIP kaniti | YOK | YOK | YOK |

## WP02 — Disposition (tumu SAFE_TO_DELETE)

Her uc dizin icin SAFE_TO_DELETE'in tum on kosulu kanitlandi: worktree kaydi
yok, live process yok, unique unmerged commit yok (0da0be71 main ile ozdes;
digerleri #1930 uzerinden main'e merge oldu), tracked/untracked benzersiz
deger yok (`src/` zaten silinmis, `.git` yok), ilgili PR merge/task terminal,
ilgili branch guvenle silinebilir durumda, external/canonical link hedefi yok
(0/4792), owner WIP yok, exact allowlist eslesmesi (owner'in WP01'de
isimlendirdigi uc dizinin tam kendisi).

## WP03 — Guvenli fiziksel temizlik

**Canonical protected-path baseline (temizlik oncesi, OBSERVED):**

```text
project/node_modules            : 71801 dosya, 16403 dizin, 4687 reparse point
project/apps/api/node_modules    : 33 dosya, 73 dizin, 61 reparse point
.git                             : 192 dosya, 1389 dizin, 0 reparse point
package.json SHA256              : 94968DB1A85206516C30937C3C4032E81D99E3AE74B800411D3A4ACE349639B2
pnpm-lock.yaml SHA256            : AF0E81E795A958AC28D227FBDE3A4AF2029BD42E0403DD6C36E7067ACB051514
```

**Yontem (her uc dizin icin, sirayla):** PASS 1 — her reparse point'i
(`[System.IO.Directory]::Delete($path, $false)` / `File.Delete`) hedefine
GIRMEDEN, yalniz link olarak kaldir. PASS 2 — kalan duz agaci
`Remove-Item -Recurse -Force` ile sil. Her PASS 1 sonrasi kalan reparse point
sayisi 0 dogrulandi; her PASS 2 sonrasi canonical baseline yeniden olculdu.

| Dizin | Junction kaldirildi | Agac silindi | Baseline sonrasi |
|---|---|---|---|
| `...-0da0be71` | 4792/4792, 0 hata | evet | PASS (`node_modules` 88204=88204, hash eslesti) |
| `...-79bd9cca` | 4792/4792, 0 hata | evet | PASS |
| `HY_receivable_ci_manifest_fix` | 4792/4792, 0 hata | evet | PASS (node_modules + apps/api/node_modules + package.json + pnpm-lock.yaml hash tam eslesti) |

Iki orphan local branch de silindi:
`orchestrator/receivable-legal-basis-resolver-controlled-default-off-r01-0da0be71`
(main ile ozdesti) ve `...-79bd9cca` (onceki turda zaten silinmisti, remote'da
da yoktu).

**`.git` sapma notu:** temizlik sonrasi `.git` icindeki toplam ogeler
1581'den 1624'e cikti (+43). `git fsck --no-progress` YALNIZ "dangling
commit/tree/blob" (silinen iki branch'in artik hicbir referanstan
erisilemeyen ama disk uzerinde saglam duran commit'leri — normal git
davranisi) ve tek bir kucuk "garbage" gecici dosyasi gosterdi; hicbir
"missing"/"corrupt" bulgusu yoktu. HEAD=main=origin/main
(`0d9b81e819390c77de9bdc58d52c4b739206f02f`) temizlik sonrasi da tam senkron
kaldi. **PROTECTED PATH INTEGRITY: PASS** (artis git'in kendi dogal
fetch/branch-silme aktivitesinin sonucu, bir bozulma degil).

## Sonuc

Uc dizinin ucu de basariyla, guvenli sekilde temizlendi. Fiziksel olarak
disposition edilecek bir kalinti kalmadi.

## Yan bulgu (implement edilmedi, yalniz kaydedildi)

`project/docs/governance/decision-log.md` satir 441
(`CLIENT-REMEDIATION-CLOSEOUT-R01`, 2026-07-26), R4 maddesi olarak **CLIENT**
programina ait, ayri UC eski worktree dizinini "ACCEPTED_NON_BLOCKING_RESIDUAL"
(git registry temiz, fiziksel silme "Filename too long" ile basarisiz, riskli
silme YAPILMADI) olarak kaydetmisti. Bu oturumda kullanilan junction-guard
tekniği (once reparse point'leri hedefe girmeden link olarak kaldirma, sonra
duz agaci silme) o eski CLIENT kalintilarini da guvenle cozebilir — ancak bu
gorev yalniz owner'in WP01'de isimlendirdigi UC RECEIVABLE dizinini kapsadigi
icin CLIENT'in dizinlerine dokunulmadi, isimleri dogrulanmadi. Owner isterse
ayri, dar kapsamli bir takip gorevi olarak ele alinabilir.
