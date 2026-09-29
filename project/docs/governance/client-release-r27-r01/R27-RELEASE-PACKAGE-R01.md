# R27 — YAYIN PAKETİ (R01) · D-5 güvenlik düzeltmeleri · API + WEB · canlı taban + dar aday

> **DURUM: HAZIR — CANLIYA UYGULANMADI.** Yayın, migration, gerçek e-posta gönderimi ve canlı kabul koşumları bu paketle
> **yetkilendirilmez**; her biri için ayrı owner GO gerekir (§10). Bu belge inceleme paketidir; "hazırlık tamamlandı" demek
> canlı güvenlik düzeltmesi ya da H1–H8 hizmet kabulü tamamlandı demek DEĞİLDİR.
> Yetki ayrımı: **(Y1) yayın** = B1 · **(Y2) migration** = bu adayda YOK (A/C seçilirse ayrı GO) · **(Y3) e-posta** = D-5 Run'da
> owner konsolunda tek gönderim onayı · **(Y4) kabul** = D-5/D-8/D-6/D-7/D-9 koşumları, her biri ayrı GO.

## 1. Tek durum envanteri

### 1.1 Canlı ve aday kimliği

| | Canlı (R26) | Aday R27 |
|---|---|---|
| Kaynak | `c7a154b3c0728fee7618ca65e54898ed02cc8b3b` (`release/r26-candidate`) | **`1b758d29c45033311c8c2c0ea598619d6bba13a0`** (`release/r27-candidate`, origin'de) = `c7a154b3` + #2830 (`f8f1b013` → `dbf9d3e0`) + #2832 (`b84919ad` → `27873bf4`) + `common/trust-proxy.config.ts` (#2730'daki dosyanın birebir kopyası; yalnız test yardımcısı, `main.ts` DEĞİŞMEDİ) |
| API `dist/apps/api/src` | `A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0` (3867 dosya) | **`E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134`** (3873 dosya) |
| WEB `.next` (`cache/` + `trace` hariç) | `C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326` · BUILD_ID `5waeMoFGGMTLAYmn9oJvW` | **`B2DEE3652F0843FAF05085243144ED0A4146C85C2C91FBCFA94BECB1A9D9F621`** · BUILD_ID **`W2UQpBPD_fp8pq4y7aFIe`** |
| `next.config.js` | `C43DEB5A04F1529CE2D368204ED7D10B8DBC257327E0BC64A01F1D7CF3AC5B5C` | aynı (değişmedi) |
| `.env` (yalnız sha) | `5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D` | değişmez; yeni anahtar YOK |
| Başlatıcı üçlüsü | `P1-SONRASI` (start-api `DDCCD091…`, host `27099BDF…`, start-web `F39F7A54…`) — SelfTest 2026-09-29 okudu | değişmez |
| Şema / migration | 130 uygulanmış | **0 yeni migration** (şema canlıyla aynı) |
| Bağımlılıklar (`pnpm-lock`) | — | fark 0 |

`main` bu paket yazılırken `9e3bd1b1` (#2835) idi; **adaya dahil değildir** (§2).

### 1.2 D halkaları (`client-external-access-r01` §7)

| Halka | Durum | Kanıt / eksik |
|---|---|---|
| D-1 / D-2 / D-3 | **Kabul (intake kapsamı)** | EXTACC runId `cff5c692` (#2815 paketi kaydı) |
| D-4 | **Kabul (dar)** | runId `e34b7e6d` 21/21, kayıt #2826 |
| D-5 | **Ölçülmedi** — koşucu + owner bloğu HAZIR (bu paket, `client-extacc-portal-d5-r01`) | ÖN KOŞUL: canlı dist R27 (kapatmada token iptali D5-SEC-R01); owner kararları §10 |
| D-6 / D-7 | **Ölçülmedi** — koşucu YOK; kapsam/kanıt/kapanış TANIMI hazır (`client-extacc-d8-staff-surface-r01` §5) | koşucu yazımı kalan iş (§8) |
| D-8 | **Kısmi** — owner telefonu 5 GET 403 (27.09 21:14–21:15; katman ölçülmedi); makine sondası HAZIR (bu paket) | sonda canlıda koşulmadı; diğer yöntem/yollar açık |
| D-9 (intake) | Kabul (`cff5c692`) | — |
| D-9 (portal, D-4) | Kabul (`e34b7e6d`) | — |
| D-9 (birleşik) | **Tanım hazır**, koşulmadı | D-5/D-6/D-7 kapanışları + izolasyon; `client-extacc-d8-staff-surface-r01` §6 |

### 1.3 H1–H8 (hizmet kabulü **0/8**; sayaçlar D sonuçlarından türetilmez)

| H | Teknik kapanış (İ kilometre taşı) | Kalan |
|---|---|---|
| H1 | İ9 `d19ce2c7` | owner hizmet kabulü |
| H2 | İ13 `8811f395` 15/18 | 3 ölçüt owner kararı + hizmet kabulü |
| H3 | İ10 `c9b07bcb` | owner hizmet kabulü |
| H4 | İ14 `e28c5c06` 16/18 | 2 ölçüt owner kararı + hizmet kabulü |
| H5 | İ11 `158675ab` 11/17; `PUBLIC_INTAKE_BASE_URL` canlıda uygulandı (H5 URL paketi, runId `dda5d8c3` 13/13 dar) | 6 ölçüt + hizmet kabulü |
| H6 | İ12 `92d04ef3` 14/18 | 4 ölçüt owner kararı + hizmet kabulü |
| H7 | İ16 `6b883b16` 18/18 | owner hizmet kabulü |
| H8 | İ15 `1b83637a` 17/18 | 1 ölçüt (kapsam cümlesi kararı) + hizmet kabulü |

### 1.4 Açık ürün/güvenlik bulguları

| Kayıt | Durum | Bu paketle ilişkisi |
|---|---|---|
| SEC-STAFF-XFF-01 | **AÇIK** — owner-yerel kısıtlı kayıt; ayrıntı public repoya YAZILMAZ | D-5 sayaç ayrımı (#2832) bu bulguyu **kapatmaz**. Bu yayın için engelleyici **değil** (gerekçe kısıtlı kayıtta). Kapanış ayrı iş: ek ölçüm + ayrı yama |
| SEC-API-BIND-01 | AÇIK — kısıtlı kayıt | Yayın kapsamı dışı; yayın değiştirmez |
| SEC-MAIL-LOG-01 | AÇIK — kısıtlı kayıt | D-5 canlı koşumunda alıcı adresi sağlayıcı günlüğüne düşebilir; owner onay metnine yazıldı |
| ClaimItem ACCRUES kullanıcı yolu (OFFICE authz notu) | AÇIK, ayrı iş | Adayda yok |
| #2830 eski PR gövdesi / commit `02276b68` geçmişi | owner kararı bekliyor (§10) | — |

### 1.5 Koşucular ve yayın bağımlılıkları

| Bileşen | Hazır? | Not |
|---|---|---|
| `r27-release.ps1` / `r27-rollback.ps1` | Evet (SelfTest PASS ×2 kabuk; takas+geri alma mekaniği sentetik kopyada PASS) | §6 |
| `r27-dar-kabul.js` (B2, HTTP salt okuma) | Evet (öz-test 7/7) | DK-7 R26/R27 ayırt edici |
| D-5 koşucu + sahte API + öz-test + owner bloğu + blok öz-testi | Evet (33/33 · 53/53 ×2 kabuk) | canlı dist pini **R27** |
| D-8 sondası + öz-test | Evet (9/9) | canlıda koşulmadı |
| D-6/D-7 koşucu | **Hayır** | tanım hazır |
| Pin güncelleme PR'ı (D-4/EXTACC/H5/C4 blokları `ExpLiveDist` → R27) | Hazırlanacak; **yayından sonra** merge | §9 |
| Yayın öncesi: bu paketin PR'ı merge + main senkron | — | owner blokları `main` checkout'undan pin okur |

## 2. Yayın kapsamı — kanıtlanmış karşılaştırma ve seçim

**Düzeltme:** Önceki turda "yalnız D-5 uygulanamaz (`portal.service` `isApproverEligibleInTx`'e bağlı)" denmişti. Ölçüm bunu
**yanlışladı**: #2830 ve #2832 squash'ları `c7a154b3` üzerine cherry-pick edildi; `portal.service.ts` otomatik birleşti,
çakışma yalnız CI manifest dosyalarındaydı (aday sürüm korundu, yeni spec satırları eklendi). Dar aday derlendi ve test edildi.

| Ölçüt | **A** sabitlenmiş tam `main` (`9e3bd1b1`) | **B** canlı taban + D-5 (seçilen) | **C** canlı taban + D-5 + OFFICE yetki |
|---|---|---|---|
| Kaynak farkı (canlıya göre) | 112 commit; 95 ürün dosyası (claim-item 23, client-settlement 10, case 6, office-approval 5, debtor 4, …) | **7 ürün dosyası** (`common/trust-proxy.config.ts`, 2 guard, portal dto/controller/service, web `portal/profile/page.tsx`) | 7 + #2818/#2821/#2824/#2825 dosyaları (office-authz, office-approval, lawyer, portal ek değişiklikleri; uyarlama gerekir) |
| Davranış değişikliği | D-5 + K3 çek tazminatı/claim-formation/tahsilat mahsup (mali) + OFFICE yetki sertleştirme + davet penceresi + ADR-014 + CI | **Yalnız D-5**: sıfırlama politikası API'de (token tüketilmeden), pasif hesapta sıfırlama yok, kapatmada token iptali, portal hız sınırı anahtarı kenar IP + ayrı depo, profil 8 karakter | D-5 + yetki sertleştirme (VIEWER yazma reddi, pasif avukat, cross-office, iptal yarışı) |
| Migration | **3** (`20260919 sim_snapshot unique index`, `20260928 claim_formation batch position` (kolon+CHECK), `20260929 case_debtor aval_for` (kolon+CHECK)) | **0** | 0 (yetki PR'ları migration içermez — doğrulandı: 3 migration K3/#2725 kaynaklı) |
| `.env` / bağımlılık | yeni anahtar `PUBLIC_INTAKE_TRUSTED_PROXY_IPS` (canlıda ZATEN var); lock farkı 0 | 0 / 0 | 0 / 0 |
| Mali / personel etkisi | **Evet** (hesap özeti, tahsilat mahsubu, claim formation onayı) — owner ürün kararı | Yok (müvekkil parola yüzeyi) | Personel yetki davranışı değişir (403'ler) — owner kararı |
| Test yükü | tam CI (1174 spec) + K3/OFFICE canlı kabulleri | odak 134/134 + manifest `pure/client-portal` 147 suite/2113 test + `pure/office-auth-user` 124/2253 + web 12/12 | B + office-authz manifestleri + uyarlanan kodun ayrı incelemesi |
| Geri dönüş yükü | kod + **şema** (3 migration geri alınamaz-ileri; "şema kalır kod döner" için uyumluluk provası gerekir — YAPILMADI) | **yalnız kod**; şema aynı | yalnız kod |
| İncelenmemiş / başka oturum kapsamı | K3-L Faz 0/1a/1b/1c, ADR-014, davet paketi vb. **başka oturumların** işi; bu oturum incelemedi | yalnız bu oturumun incelediği #2830/#2832 + 1 yardımcı dosya | yetki PR'ları başka oturumun; uyarlama incelenmedi |

**Seçim: B.** En küçük tutarlı ve doğrulanabilir aday: davranış farkı yalnız D-5, migration 0, geri dönüş yalnız kod, tüm
değişiklik bu oturumca incelendi/test edildi. Uyarlama gerektirdi (manifest çakışması + 1 yardımcı dosya) — bu ret nedeni
sayılmadı; uyarlanan kod ayrıca derlendi ve test edildi (§3). A ve C **reddedilmedi, ertelendi**: A mali/ürün kararı ve 3
migration'ın disposable provasını, C uyarlanmış yetki kodunun ayrı incelemesini gerektirir (§10 K-1).

## 3. Aday derlemesi ve testleri — AYRI gösterilir

Worktree `D:\Development\HUKUK_YAZILIMI\HY_WT_R27` (taze `pnpm install --frozen-lockfile` rc 0; junction yok).

| Adım | Sonuç | Kanıt |
|---|---|---|
| `prisma generate` | rc **0** | `%TEMP%\r27\prisma-generate.txt` |
| `nest build` | rc **0**, `error TS` satırı **0** | `nest-build.txt` |
| `next build` (`NEXT_PUBLIC_API_URL`/`API_INTERNAL_URL` tanımsız, R26 ile aynı koşul) | rc **0**, BUILD_ID `W2UQpBPD_fp8pq4y7aFIe` | `next-build.txt` |
| `tsc --noEmit` (eşit ortam: aynı node_modules/Prisma istemcisi) | aday **530** hata (rc 2) = taban `c7a154b3` **530** (rc 2); yalnız-aday **0**, yalnız-taban **0** | `tsc-cand.txt`, `tsc-base.txt`, `tsc-only-cand.txt` |
| Odak API testleri (D-5 + portal, disposable DB `d5_reset_test`) | **134/134** PASS | `api-tests.txt` |
| Manifest `pure/client-portal` | **147 suite / 2113 test PASS** | `man-pure-client-portal.txt` |
| Manifest `pure/office-auth-user` | **124 suite / 2253 test PASS** | `man-pure-office-auth-user.txt` |
| Web vitest (profile/reset/login) | **12/12** PASS | `web-tests.txt` |

**Derleme ≠ test:** derleme başarısı `nest build` rc 0 / 0 hata ile ölçüldü; `tsc --noEmit`'teki 530 hata **derlemeyi
etkilemedi** (`nest build` tsconfig'i farklı) ve adayla tabanda dosya-hata kümesi bire bir aynıdır. "501" (main tabanı) ile
"530" farkı ortam farkıdır (main ölçümü başka node_modules ile); bu paket aynı ortamda ölçülen 530=530 eşitliğini kanıt sayar,
"tabanla aynı" ifadesini derleme başarısı yerine KULLANMAZ.
**Sınır:** `run-ci-manifest.cjs` `c7a154b3`'te yoktur (#2735 ile geldi); `.sh` Windows'ta argv sınırına takıldı ("command
line too long"). Manifestler argv'yi atlayan stdin koşucuyla (`--ci --forceExit --runInBand --runTestsByPath`, aynı
bayraklar) koşuldu; `--forceExit` kaydı (doğal çıkış kanıtlanmadı) ve eski çıkış-127 kaydı korunur.

## 4. Dosya/davranış farkı canlıya göre

- **API dist:** 10 değişen + **6 eklenen** + 0 silinen + 3857 aynı (`api-dist-diff.json`). Eklenenler: `common/trust-proxy.config.{d.ts,js,js.map}`,
  `modules/portal/dto/portal-password.dto.{d.ts,js,js.map}`. Değişenler: `credential-recovery-rate-limit.guard.{js,js.map}`,
  `login-rate-limit.guard.{d.ts,js,js.map}`, `portal.controller.{d.ts,js,js.map}`, `portal.service.{js,js.map}`.
  16 dosyalık paket digest'i aday `BE17EBD0C0801EA1569DEB5306C5E0FE6B76B39FB1954BD76744333A479AF1BB`, canlı (eklenenler `-`) `B7FE81DBF83A4F20327667C5610C0E956CEB2D489357782E08D7A5647CBFA59E`.
- **WEB:** `.next` tam takas (319 değişen / 64 eklenen / 64 silinen / 122 aynı — Next derlemesi her seferinde farklı chunk adı üretir); `next.config.js` aynı.
- **Davranış (yalnız D-5):** `POST /api/portal/reset-password` → parola < 8 ise token tüketilmeden 400 "Şifre en az 8 karakter olmalıdır"; pasif hesapta token yazılmaz/e-posta gitmez, pasif hesap token'la parola değiştiremez; `disable-user` `resetToken/Exp` NULL; `PortalLoginRateLimitGuard` anahtarı kenar IP çözümleyicisi + personelden **ayrı** depo; `CredentialRecoveryRateLimitGuard` anahtarı kenar IP; `POST /api/portal/change-password` DTO 8 karakter; web `/portal/profile` 6→8.
- **Yan etkisi olmayanlar:** intake, personel yüzeyi, OFFICE yetki, K3, zamanlayıcılar — adayda dosya değişikliği yok.

## 5. Migration uzlaştırması ve geri dönüş

| | Sayı | Not |
|---|---|---|
| Canlı `_prisma_migrations` | **130** (finished 130, rolledBack 0) | checksum'lar canlı kaynak `c7a154b3`'teki 130 dizinle **birebir** (`live-migration-checksums.js`, salt okuma) |
| `main` dizinleri | **133** | 130 + 3 yeni; **silinen/yeniden adlandırılan yok**; önceki "131" sayımı hataydı (`grep '^2'` iki baseline dizinini dışlıyordu) |
| Aday R27 | 130 | **migration farkı 0** → `migrate deploy` YOK, `Y2` yetkisi gerekmez |

Yeni 3 (adaya DAHİL DEĞİL): `20260919120000_sim_snapshot_restore_unique_indexes` (#2725; koşullu unique index; lock/statement
timeout'lu DO bloğu), `20260928120000_claim_formation_batch_approval_position` (#2827; 2 kolon + 2 CHECK, 226 satır),
`20260929090000_case_debtor_aval_for` (#2831; kolon + CHECK NOT VALID → VALIDATE).
**Geri dönüş (B):** şema değişmediği için "eski uygulama yeni şema" sorusu yoktur; geri dönüş yalnız kod (§6 B3) ve mekaniği
sentetik kopyada ölçüldü (`swap-prova.txt`: taban → aday `E28A6863` → geri alma sonrası taban `A8B17A38`, 6 dosya karantinada, silme yok).
**A/C için** (ertelendi): 3 migration'ın disposable provası (ileri + veri/kısıt/indeks etkisi + eski uygulama yeni şemada +
yedekten geri yükleme) **yapılmadı**; "şema kalır, kod döner" uyumluluk provası olmadan geri dönüş planı sayılmaz.

## 6. B0 → B1 → B2 → B3 — R26 yöntemi korunarak (`r26-release.ps1`'den en küçük değişiklikle)

R27 betiklerinin R26'dan farkı (diff ile ölçülür): pinler/FILES/dizin adları; eklenen 6 dosya için hedef dizin oluşturma; fark
kapısı "eklenen = tam bu 6 dosya" (R26'da 0); geri almada eklenenler **karantinaya taşınır** (`HY_R27_RELEASE_EVIDENCE\added-quarantine-*`,
silme yok); sahte-süreç regex'ine `d4-portal-|d5-portal-|extacc-|h5-url-|r27-`; rollback'te 8.3 kısa yol normalizasyonu
(SelfTest'te ölçülen tuzak: `ULASTE~1` yolu digest'i bozuyordu). Boş `modules/portal/dto` dizini geri almada kalır (digest dosya bazlıdır; zararsız).

| Betik | sha256 |
|---|---|
| `r27-release.ps1` | `8821834CC99BCE265E37CE144F301FE49E1FC9A568169A60AF61D5C4747FFC4F` |
| `r27-rollback.ps1` | `4F321970350CBB44710BDF792D2CE9ABA25DC22BD486E0FDFFAC474524951A94` |
| `r27-dar-kabul.js` | `F077A8E40462F2F47A98AC27575F2D5EDBF2BB0C16328732CFF454324C09A4A6` |

Betik dizini (merge sonrası kanonik): `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\`.

**B0 — SelfTest + yayın öncesi taban ölçümü (normal pencere; salt okuma; DK-7 tek POST, yazma yok):**
```powershell
& { $ErrorActionPreference='Stop'; $d='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts'; $f="$d\r27-release.ps1"; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '8821834CC99BCE265E37CE144F301FE49E1FC9A568169A60AF61D5C4747FFC4F'){ throw 'R27 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -SelfTest; $rc=$global:LASTEXITCODE; 'SelfTest cikis=' + $rc; if($rc -ne 0){ throw 'SelfTest PASS degil - YAYIN BASLATILMAZ' }; $k="$d\r27-dar-kabul.js"; if((Get-FileHash -Algorithm SHA256 -LiteralPath $k).Hash -cne 'F077A8E40462F2F47A98AC27575F2D5EDBF2BB0C16328732CFF454324C09A4A6'){ throw 'DAR KABUL SHA UYUSMUYOR - DUR' }; $o="D:\Development\HUKUK_YAZILIMI\HY_R27_RELEASE_EVIDENCE"; New-Item -ItemType Directory -Force -Path $o | Out-Null; & node $k before "$o\dar-kabul-before-$((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))Z.json"; 'before cikis=' + $LASTEXITCODE; if($LASTEXITCODE -ne 0){ throw 'taban olcumu R26 davranisini gostermedi - DUR' } }
```
Durma koşulu: SelfTest FAIL (kimlik/pin/üçlü/.env/dinleyici) ya da `before` ≠ 0 (canlı R26 değil ya da API/WEB ayakta değil).

**B1 — Yayın (YÜKSELTİLMİŞ pencere; B0 PASS sonrası):**
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\r27-release.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '8821834CC99BCE265E37CE144F301FE49E1FC9A568169A60AF61D5C4747FFC4F'){ throw 'R27 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'YAYIN cikis=' + $rc; if($rc -ne 0){ throw 'YAYIN PASS DEGIL - KANIT JSON verdict alanina bakilir (ROLLBACK = otomatik geri alindi; ROLLBACK-DOGRULANAMADI / ROLLBACK-ENGELLENDI = B3)' } }
```
Sıra ve beklenen kesinti: doğrulanmış yedekler (canlı çalışırken) → WEB durur → API durur → API 16 dosya yazılır (6 için dizin
oluşturulur), `.next` yeniden adlandırılarak takas → durmuşken kimlik kontrolü (`E28A6863` / `B2DEE365` / BUILD_ID / cfg) →
API başlar (401 uçları, run-now, portal/cases, boot log `Mapped`) → WEB başlar (`/portal/login` 200, buildManifest 200, `/intake/x` 200,
rewrite 401) → kapsam kontrolü (digest'ler, `.env` sha, üçlü, görev eylemleri DEĞİŞMEDİ). Kesinti ≈ R26 ile aynı (dakikalar; iki
servis sırayla). Herhangi biri tutmazsa **otomatik geri alma** (API + WEB birlikte; eklenen 6 dosya karantinaya).
Korunanlar: başlatıcı üçlüsü, host exe, `.env`, görev tanımları, `.next` ACL (yalnız kalıtım ölçülür), DB (yazma yok, migration yok).

**B2 — Yayın sonrası dar kabul (normal pencere; salt okuma):**
```powershell
& { $ErrorActionPreference='Stop'; $k='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\r27-dar-kabul.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $k).Hash -cne 'F077A8E40462F2F47A98AC27575F2D5EDBF2BB0C16328732CFF454324C09A4A6'){ throw 'DAR KABUL SHA UYUSMUYOR - DUR' }; $o="D:\Development\HUKUK_YAZILIMI\HY_R27_RELEASE_EVIDENCE"; & node $k after "$o\dar-kabul-after-$((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))Z.json"; 'after cikis=' + $LASTEXITCODE; if($LASTEXITCODE -ne 0){ throw 'B2 PASS DEGIL - DK satirlari okunur; DK-7 FAIL = yayin davranisi gelmedi -> B3 degerlendirilir' } }
```
Geri dönüş tetikleyicileri: B2 ≠ 0; API/WEB dinleyicisi tek değil; boot log'da `Mapped` yok; portal girişi/intake sayfası
bozuldu (owner gözlemi) ; D-5 Preflight'ta dist pini eşleşmiyor (yayın kimliği beklenen değil).

**B3 — Elle geri dönüş (YÜKSELTİLMİŞ; yalnız gerekirse; `<api.backup>`/`<web.backup>` B1 kanıt JSON'undan, TAM yol):**
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\r27-rollback.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '4F321970350CBB44710BDF792D2CE9ABA25DC22BD486E0FDFFAC474524951A94'){ throw 'R27 GERI ALMA BETIGI SHA UYUSMUYOR - DUR' }; $api='<api.backup>'; $web='<web.backup>'; if($api -like '<*' -or $web -like '<*'){ throw 'yer tutucu doldurulmadi - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web -SelfTest; if($global:LASTEXITCODE -ne 0){ throw 'yedek kimligi dogrulanamadi - GERI ALMA BASLAMAZ' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web; $rc=$global:LASTEXITCODE; 'GERI ALMA cikis=' + $rc; if($rc -ne 0){ throw 'ROLLBACK DOGRULANAMADI - ESCALATE' } }
```

**Sınanan (2026-09-29, canlıya dokunmadan):** yayın SelfTest WinPS 5.1 ve pwsh 7.6.6 PASS (üçlü `P1-SONRASI`, `.env` pin eşit,
aday/canlı API-WEB pinleri eşit, ACL yalnız kalıtım, `:8080`/`:3002` tek dinleyici, `/api/auth/me` 401, `/portal/login` 200, rewrite 401) ·
geri alma SelfTest canlı kopyasından sentetik yedekle iki kabukta PASS (kısa-yol tuzağı bulundu ve giderildi; tam ve kısa yolla PASS) ·
takas+geri alma mekaniği sentetik kopyada PASS (digest'ler bire bir) · `r27-dar-kabul.js` sahte R26/R27 ile 7/7.
**Sınanmayan:** yükseltilmiş gerçek koşum (yalnız canlıda mümkün); B2 `before` canlıda koşulmadı (B0'ın parçası).

## 7. Yayın sonrası — kalan kabullerin sırası

1. Bu paketin PR'ı merge → `main` senkron (owner blokları pinleri `main` checkout'undan okur).
2. **Y1** owner GO → B0 → B1 → B2 (§6).
3. Pin güncelleme PR'ı (§9) merge → main senkron.
4. **D-5** (`client-extacc-portal-d5-r01`): Preflight (salt okuma; R27 dist pini) → QrTest → **Run** (Y3: owner konsolunda alıcı adresi + tek gönderim onayı + GO) → gerekirse Recover.
5. **D-8** makine sondası (`d8-staff-surface-probe.js --origin <public host> --out …`) + telefon listesi beyanı.
6. D-6/D-7 koşucu yazımı (kalan iş) → koşum.
7. Birleşik D-9 ölçümü ve kayıt PR'ı.

## 8. Kalan iş listesi (bağımlılık sırası)

| # | İş | Bağımlılık | Durum |
|---|---|---|---|
| W1 | Bu paket PR'ı (docs+scripts) merge | — | PR açıldı (başlık: R27 paketi + D-5/D-8) |
| W2 | R27 yayını B0→B2 | W1 + owner GO Y1 | bekliyor |
| W3 | Pin güncelleme PR'ı | W2 (canlı dist R27) | hazırlanacak (§9) |
| W4 | D-5 canlı kabul | W2, W3 + owner kararları K-2..K-4 + GO | koşucu hazır |
| W5 | D-8 makine sondası + telefon | W2 (bağımsız da koşabilir; R26'da da geçerli) | sonda hazır |
| W6 | D-6/D-7 koşucu | tanım hazır | **yazılmadı** |
| W7 | Birleşik D-9 | W4–W6 | tanım hazır |
| W8 | A/C kapsamı için migration provası + K3/OFFICE yayın kararı | owner K-1 | ertelendi |

## 9. Güvenlik ve kabul pinleri

- Kısıtlı kayıt (owner-yerel) kalemleri **ID ile** izlenir; istismar ayrıntısı bu belgede/PR'da yoktur. SEC-STAFF-XFF-01 engelleyici değildir (§1.4); D-5 sayaç ayrımıyla **kapatılmaz**.
- Yayından sonra `ExpLiveDist`/`EXP_DIST` pini R26 `A8B17A38…` olan owner blokları güncellenir (yalnız pin satırı + yorum; eski kabul kanıtları/kayıt belgeleri DEĞİŞTİRİLMEZ; blok sha'ları değiştiği için ilgili paket belgelerine "R02 pin notu" eklenir): `client-c4-live-403-r01/scripts/c4-live-block.ps1`, `client-extacc-intake-chain-r01/scripts/extacc-owner-live-block.ps1`, `client-extacc-portal-d4-r01/scripts/d4-owner-live-block.ps1`, `client-h5-intake-url-r01/scripts/h5-owner-env-block.ps1`, `client-h5-intake-url-r01/scripts/h5-owner-live-block.ps1`. R26 yayın/kabul betikleri ve `r26p1-stage-gate.ps1` **tarihsel** kalır.
- Hash yalnız ölçülen aday artefaktından alınır (`E28A6863…`); canlı eşleşme yayından sonra Preflight'larla **ayrıca** doğrulanır.
- D-5 bloğu bugünden R27 pinlidir: canlı R26 iken Preflight **DUR** verir (beklenen; D-5 R26'da koşulmaz — kapatma token'ı temizlemez).

## 10. Owner karar listesi (asgari)

| # | Karar | Seçenekler | Etki |
|---|---|---|---|
| K-1 | Yayın kapsamı | **B** (önerilen) · A (tam main: mali/K3/OFFICE + 3 migration + prova) · C (B + yetki) | Y1'in hedefi |
| K-2 | D-5 alıcı e-posta adresi | Owner konsoluna girer (repoya/rapora yazılmaz) | D-5 Run |
| K-3 | D-5 gerçek gönderim adedi | Plan **1** (tek talep). Ek talep = ek e-posta; onaysız yapılmaz | D-5 Run |
| K-4 | Kapanışta alıcı adresi sentetik hesapta `.invalid` ile ezilsin mi | E / H (Run ve Recover'da sorulur) | DB'de gerçek adres kalıp kalmaması |
| K-5 | #2830 eski PR gövdesi + `02276b68` geçmişi | geçmiş yeniden yazımı / olduğu gibi (kısıtlı kayıtta izlenir) | public repo |
| K-6 | K3/OFFICE kapsamının yayın zamanı ve 3 migration | R27 sonrası ayrı aday (R28) | W8 |
| K-7 | D-6/D-7 koşucu yazımı önceliği | R27'den önce / sonra | W6 |

## 11. Uygulama sırası — başarı ve durma ölçütleri

| Adım | Başarı | Durma |
|---|---|---|
| PR merge | main CI + CodeQL SUCCESS merge SHA'sında; `gh run list --branch main` boşken merge | CI FAIL / başka merge koşuyor |
| B0 | SelfTest PASS ×1 (WinPS), `before` çıkış 0 | herhangi bir kapı |
| B1 | `YAYIN PASS`; kanıt JSON `verdict=PASS`; API `E28A6863`, WEB `B2DEE365`/`W2UQpBPD` | otomatik geri alma → ROLLBACK verdict; ROLLBACK-DOGRULANAMADI → B3 |
| B2 | çıkış 0 (DK-1…DK-8) | DK-7 FAIL → davranış gelmedi → B3 |
| Pin PR | D-4/EXTACC/H5/C4 Preflight'ları R27 dist ile PASS | pin uyuşmazlığı |
| D-5 | Run çıkış 0 + owner beyanı; 3 = ölçülemeyen (kabul değil); 6/5 → Recover | ürün bulgusu (P5-C4 200 / P5-SINGLE-USE FAIL) |
| D-8 | sonda çıkış 0 + telefon beyanı 5/5 "E" | herhangi bir 403-dışı ret |

## 12. Şeffaflık ve sınırlar

- Bu turda canlıya giden istekler: yalnız SelfTest'in kimliksiz GET'leri (`/api/auth/me`, `/portal/login`, web `/api/auth/me`) ve canlı DB'ye **salt okuma** migration sorgusu. Yazma yok; e-posta yok; servis yeniden başlatılmadı.
- `HY_WT_R27` (aday kaynağı + dist/.next) ve `HY_WT_R26` **SİLİNMEZ**; disposable `d5-reset-pg` (durduruldu) ve `h5-test-pg` korunur.
- Öz-test kanıtları `%TEMP%\r27\` altındadır (repoya alınmadı; inceleme ZIP'inde).
- D-5 öz-testinde sahte API ürünün kendisi değildir; ürünün hız sınırı/gönderim davranışı yalnız canlıda ölçülür.
