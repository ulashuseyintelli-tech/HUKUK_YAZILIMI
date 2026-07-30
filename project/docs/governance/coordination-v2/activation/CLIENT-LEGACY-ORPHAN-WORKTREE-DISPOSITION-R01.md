# CLIENT Legacy Orphan Worktree Disposition Kaydi (R01)

`CLIENT-LEGACY-ORPHAN-WORKTREE-DISPOSITION-R01` gorevinin canonical kaydi.
`CLIENT-GOVERNANCE-CHARTER.md` §36 R4'te "ACCEPTED_NON_BLOCKING_RESIDUAL"
olarak birakilmis, "Filename too long" nedeniyle daha once fiziksel olarak
temizlenemeyen uc eski CLIENT worktree dizini fresh canonical gercek
uzerinden bulundu, evidence-gated biçimde disposition edildi, temizlendi.

## Kaynak

`CLIENT-GOVERNANCE-CHARTER.md` §36, R4 maddesi (satir ~2091-2094):

```text
R4 Uc orphaned fiziksel worktree dizini
   (HUKUK_client_sec_p01, HUKUK_client_pol_f_r01, HUKUK_client_config_p01)
   git registry temiz; fiziksel silme "Filename too long" ile basarisiz
   → ACCEPTED_NON_BLOCKING_RESIDUAL
```

## Envanter (fresh, bu oturumda toplandi)

| Alan | client_sec_p01 | client_pol_f_r01 | client_config_p01 |
|---|---|---|---|
| exact path | `C:\Development\HUKUK_YAZILIMI\HUKUK_client_sec_p01` | `...\HUKUK_client_pol_f_r01` | `...\HUKUK_client_config_p01` |
| exists (temizlik oncesi) | VAR | VAR | VAR |
| `.git` gitlink | YOK | YOK | YOK |
| `git worktree list` kaydi | YOK | YOK | YOK |
| `apps/api/src/` | SILINMIS (yalniz `node_modules` kalmisti) | SILINMIS | SILINMIS |
| ilgili PR | #1613 | #1614 | #1617 |
| PR state (fresh `gh pr view`) | MERGED | MERGED | MERGED |
| merge SHA | `7fcd3b986ebe3111f3bdde34dfe393b31bb4c69f` | `771425d69ee918f6dba0bfb7dc108aa8214332a0` | `24852ac1c28a50fb1456f5a9d343cbd5b3e847e9` |
| merge SHA → origin/main ancestor | PASS | PASS | PASS |
| ilgili branch | silinmis (local+remote yok) | silinmis | silinmis |
| dosya / dizin / boyut | 66867 / 10597 / 1.02 GB | 66887 / 10598 / 1.02 GB | 66874 / 10596 / 0.97 GB |
| reparse point (junction) toplam | 4792 | 4792 | 4792 |
| → canonical-repo hedefi | 0 | 0 | 0 |
| → dis hedef | 0 | 0 | 0 |
| → ic hedef (kendi `node_modules\.pnpm\...`) | 4792 | 4792 | 4792 |
| live process handle (rename testi) | YOK | YOK | YOK |
| owner WIP / historical evidence kaniti | YOK | YOK | YOK |

## Disposition: SAFE_TO_DELETE × 3

Her uc dizin icin tum on kosul kanitlandi: worktree kaydi yok, live process
yok, unique unmerged commit yok (PR'lar terminal/MERGED, merge SHA
origin/main atasi), tracked/untracked benzersiz deger yok (`src/` zaten
silinmis, `.git` yok), acik PR bagimliligi yok, external/canonical link
hedefi yok (0/14376), owner WIP yok, exact allowlist eslesmesi
(CLIENT-GOVERNANCE-CHARTER.md §36'nin isimlendirdigi uc dizinin tam kendisi).

## Guvenli fiziksel temizlik

**Canonical protected-path baseline (temizlik oncesi, OBSERVED):**

```text
project/node_modules            : 88204 oge
project/apps/api/node_modules    : 106 oge
package.json SHA256              : 94968DB1A85206516C30937C3C4032E81D99E3AE74B800411D3A4ACE349639B2
pnpm-lock.yaml SHA256             : AF0E81E795A958AC28D227FBDE3A4AF2029BD42E0403DD6C36E7067ACB051514
```

**Yontem (her uc dizin icin, sirayla, STRICTLY SEQUENTIAL):** PASS 1 — her
reparse point'i (`[System.IO.Directory]::Delete($path, $false)` /
`File.Delete`) hedefine GIRMEDEN, yalniz link olarak kaldir. PASS 2 — kalan
duz agaci `Remove-Item -Recurse -Force` ile sil. Her PASS 1 sonrasi kalan
reparse point sayisi 0 dogrulandi; her PASS 2 sonrasi canonical baseline
yeniden olculdu.

| Dizin | Junction kaldirildi | Agac silindi | Baseline sonrasi |
|---|---|---|---|
| `HUKUK_client_sec_p01` | 4792/4792, 0 hata | evet | PASS (node_modules 88204=88204, hash eslesti) |
| `HUKUK_client_pol_f_r01` | 4792/4792, 0 hata | evet | PASS |
| `HUKUK_client_config_p01` | 4792/4792, 0 hata | evet | PASS (node_modules + apps/api/node_modules + package.json + pnpm-lock.yaml hash tam eslesti) |

**Bitis sonrasi tam dogrulama:** `git fsck --no-progress` (dangling
objeler haric) hicbir corruption/missing bulgusu vermedi. HEAD=main=origin/main
temizlik sonrasi da senkron kaldi. Uc dizin de fiziksel olarak dogrulandi:
YOK (`Test-Path` False). **PROTECTED PATH INTEGRITY: PASS.**

## Sonuc

Uc dizinin ucu de basariyla, guvenli sekilde temizlendi. R4
`ACCEPTED_NON_BLOCKING_RESIDUAL`'dan `CLOSED_BY_PHYSICAL_CLEANUP`'a
tasindi (`CLIENT-GOVERNANCE-CHARTER.md` §36, bu kayitla birlikte
guncellendi — historical kayit SILINMEDI, yalniz fresh evidence eklendi).
