# R27 — YAYIN PAKETİ (R02 revizyonu; dosya adı korunur) · D-5 güvenlik düzeltmeleri · API + WEB · canlı taban + dar aday

> **DURUM: HAZIR — CANLIYA UYGULANMADI.** Yayın, migration, gerçek e-posta gönderimi ve canlı kabul koşumları bu paketle
> **yetkilendirilmez**; her biri için ayrı owner GO gerekir (§10). Bu belge inceleme paketidir; "hazırlık tamamlandı" demek
> canlı güvenlik düzeltmesi ya da H1–H8 hizmet kabulü tamamlandı demek DEĞİLDİR.
> Yetki ayrımı: **(Y1) yayın** = B1 · **(Y2) migration** = bu adayda YOK (A/C seçilirse ayrı GO) · **(Y3) e-posta** = D-5 Run'da
> owner konsolunda tek gönderim onayı · **(Y4) kabul** = D-5/D-8/D-6/D-7/D-9 koşumları, her biri ayrı GO.
> **R02 (2026-09-30):** canlı SelfTest FAIL-1'in başarısız ölçütü **sahte-süreç sayımıydı**; eşleşen sürecin kimliği o koşumda kaydedilmediği için **kök neden belirlenemedi**.
> Kapı GEVŞETİLMEDİ, teşhis edilebilir yapıldı; son baytlarla temiz pencerede PASS ölçüldü (§6) · public belgeye eklenen güvenlik satırı çıkarıldı, kayıt kısıtlı kayıtta AÇIK (§1.4) ·
> D-5 QR betiği + owner bloğu, D-6/D-7 paketleri, H1–H8 kalemleri · tek kanıt paketi (§13). Aday kimliği (`1b758d29`) DEĞİŞMEDİ; kapsam **B** (owner kararı, §10).

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
| D-5 | **Ölçülmedi** — koşucu + sahte API + öz-test + **QR betiği** + owner bloğu + blok öz-testi HAZIR (`client-extacc-portal-d5-r01`: koşucu öz-testi 41/41 · QR öz-testi 23/23 · blok 90/90 ×2 kabuk; §13) | ÖN KOŞUL: canlı dist R27 (kapatmada token iptali D5-SEC-R01); owner kararları §10 |
| D-6 / D-7 | **Ölçülmedi** — koşucu + sahte API + öz-test + owner bloğu + blok öz-testi **HAZIR** (`client-extacc-portal-d6-r01`: koşucu öz-testi 51/51, blok 64/64 WinPS 5.1 + pwsh 7 · `client-extacc-portal-d7-r01`: koşucu öz-testi 41/41, blok 58/58 ×2 kabuk; son dosya baytlarıyla §13), canlıda koşulmadı | ÖN KOŞUL: canlı dist R27 (bloklar R27 pinli, R26 ile DUR); owner kararları §10; tanım eşlemesi `client-extacc-d8-staff-surface-r01` §4/§5 |
| D-8 | **Kısmi** — owner telefonu 5 GET 403 (27.09 21:14–21:15; katman ölçülmedi); makine sondası HAZIR (bu paket) | sonda canlıda koşulmadı; diğer yöntem/yollar açık |
| D-9 (intake) | Kabul (`cff5c692`) | — |
| D-9 (portal, D-4) | Kabul (`e34b7e6d`) | — |
| D-9 (birleşik) | **Tanım hazır** (bileşen → ölçüt kimliği), koşulmadı | `client-extacc-d8-staff-surface-r01` §6: oturum P5-C*/P6-C*/P7-C*, sıfırlama bağlantısı P5-C-TOKEN, belge P6-C-DOC (üç durumlu) + P6-FOREIGN-CLEAN, mesaj P7-MSG-KEPT ("saklandı", silinmiş gibi raporlanmaz), personel/dosya U-CLOSE, izolasyon U-ISO; ölçütler D-5/D-6/D-7 paketlerinde; Recover ölçülemeyeni 0 yapmaz |

### 1.3 H1–H8 (hizmet kabulü **0/8**; sayaçlar D sonuçlarından türetilmez)

"Kalan" sütunu kayıttan adlandırılan kalemlerdir (kaynak: `H1-H8-ACIK-OLCUTLER-R01.md` §2–§10; sayılar o belgenin sayaç doğrulamasından,
türetimsiz "N ölçüt" ifadesi kullanılmaz). Sayaç (x/y) CLIENT programının teknik İ sayacıdır, hizmet ölçüt eşiği değildir (H1-H8 §1).

| H | Teknik kapanış (İ kilometre taşı) | Kalan (H1-H8 belgesi §N) |
|---|---|---|
| H1 | İ9 `d19ce2c7` (14 PASS / 0 FAIL) | B-2 lifecycle ret gövdesi stabil kod hükmü ("kabul dışı / ürün işi") + hizmet kabulü imzası — §2 |
| H2 | İ13 `8811f395` 15/18 | KB-03 / H2-10 ayrı CRUD ucu kararı ((a) mevcut davranış · (b) ürün işi) + hizmet kabulü — §3 |
| H3 | İ10 `c9b07bcb` (10 PASS) | yalnız hizmet kabulü imzası (açık madde yok) — §4 |
| H4 | İ14 `e28c5c06` 16/18 | H4-08 gerçek yayın ayağı (İ12 sink kanıtı yeterli mi / gerçek sağlayıcıyla ayrı ölçüm) + hizmet kabulü — §5 |
| H5 | İ11 `158675ab` 11/17; `PUBLIC_INTAKE_BASE_URL` canlıda uygulandı (H5 URL paketi, runId `dda5d8c3` 13/13 dar) | B-I11-2 promote ret kodu hükmü + **ayrı hizmet-kabulü satırı** (tek imzaya dahil değil); H5-04/H5-06 pozitif ayağı `I2` sözleşmesi gereği açık değil — §6, §10 |
| H6 | İ12 `92d04ef3` 14/18 | karar mevcut (CLAIM/RECLAIM/HANG "yalnız kaydet", imza metninde "canlıda ölçülmedi" ifadesi korunur) + hizmet kabulü — §7 |
| H7 | İ16 `6b883b16` 18/18 | H7-05b · K-1 matrisi · PSUS için "disposable yeterli" hükmü (K-1 istenirse D-6 canlı koşumuna bağlanır) + hizmet kabulü — §8 |
| H8 | İ15 `1b83637a` 17/18 | karar mevcut (İ5(b) "canlı yarış testi değil" ifadesi korunur) + hizmet kabulü — §9 |

### 1.4 Açık ürün/güvenlik bulguları

| Kayıt | Durum | Bu paketle ilişkisi |
|---|---|---|
| SEC-STAFF-XFF-01 | **AÇIK** — owner-yerel kısıtlı kayıt; ayrıntı public repoya YAZILMAZ | D-5 sayaç ayrımı (#2832) bu bulguyu **kapatmaz**. Bu yayın için engelleyici **değil** (gerekçe kısıtlı kayıtta). Kapanış ayrı iş: ek ölçüm + ayrı yama |
| SEC-API-BIND-01 | AÇIK — kısıtlı kayıt | Yayın kapsamı dışı; yayın değiştirmez |
| SEC-MAIL-LOG-01 | AÇIK — kısıtlı kayıt | D-5 canlı koşumunda alıcı adresi sağlayıcı günlüğüne düşebilir; owner onay metnine yazıldı |
| SEC-PORTAL-ADMIN-MSG-01 | **AÇIK** — kısıtlı kayıt (2026-09-29, D-7 paketi kaynak ölçümü); ayrıntı public repoya YAZILMAZ | D-7'de yalnız personel yanıtını **üreten** adımları (D7-3/3N/3U/3G/3F/3B; yerel API) ilgilendirir; D-7 kabul ölçütlerini ve bu yayını **engellemez** (aday bu uçları değiştirmez — kaynak diff'i ile ölçüldü). Kayıt açılması **giderildi demek değildir**; ürün değişikliği ayrı iş + owner kararı (§10 K-11) |
| ClaimItem ACCRUES kullanıcı yolu (OFFICE authz notu) | AÇIK, ayrı iş | Adayda yok |
| #2830 eski PR gövdesi / commit `02276b68` geçmişi | owner kararı bekliyor (§10) | — |

### 1.5 Koşucular ve yayın bağımlılıkları

| Bileşen | Hazır? | Not |
|---|---|---|
| `r27-release.ps1` / `r27-rollback.ps1` / `r27-fault-prova.ps1` | Evet — hata provası harness'ı **18/18 PASS** (9 işlevsel + 9 kapı senaryosu, 344 assert; izole `-TestRoot` + simülatör) · canlı salt-okuma SelfTest **PASS** (yayın + geri alma; son baytlar) · sahte-süreç canlı kontrolleri A/B/C ölçüldü | §6 |
| `r27-dar-kabul.js` (B2, HTTP salt okuma) | Evet (öz-test 7/7) | DK-7 R26/R27 ayırt edici |
| D-5 koşucu + sahte API + öz-test + QR betiği + owner bloğu + blok öz-testi | Evet (koşucu öz-testi 41/41 · QR öz-testi 23/23 · blok öz-testi 90/90 ×2 kabuk) | canlı dist pini **R27**; QR `/portal/forgot-password` (yanlış yol reddedilir); dış origin canlı `.env` + owner R05 teyidi |
| D-8 sondası + öz-test | Evet (15/15) | canlıda koşulmadı; katman kanıt yoksa UNKNOWN |
| D-6/D-7 koşucu + sahte API + öz-test + owner bloğu + blok öz-testi | **Evet** (D-6 51/51 · blok 64/64 ×2 kabuk; D-7 41/41 · blok 58/58 ×2 kabuk) | canlı dist pini R27; W2 sonrası koşum |
| Pin güncelleme PR'ı (D-4/EXTACC/H5/C4 blokları `ExpLiveDist` → R27) | **#2838 AÇIK (taslak)** (`claude/r27-pin-updates`); **yayından sonra** merge | §9 |
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
silme yok); **sahte-süreç kapısı** (R02): komut satırı desene eşleşen **her** süreç sayılır — `izleme` sınıfı **dahil**; kapı taban sürümden
gevşek değildir. Desen D-6/D-7/D-8 koşucuları ve öz-test/sahte-API/QR/owner-blok adlarıyla **genişletildi**; eşleşme kültürden bağımsız ve harf
duyarsızdır, U+0130/U+0131/U+212A karakterleri eşleşmeden önce katlanır (taban sürümün tr-TR kültüründe saydığı girdiler yine sayılır; büyük `I` içeren
komut satırları eskiden kaçıyordu). Desen eski paketlerin bütün koşucu adlarını **kapsamaz** (taban sürümle aynı sınır; genişletme §10 K-14).
Eşleşenler **listelenir**: pid, görüntü adı, sınıf, eşleşen parça ve — yalnız koşulların hepsi sağlanırsa — yaprak dosya adı. **Tam komut satırı
rapora/kanıta yazılmaz; dosya adı yazılır** (dosya adına gömülü bir değer ayıklanmaz — bilinen sınır, testle sabit). Sınıf yalnız teşhistir: `izleme` =
doğrulanmış görüntüleyici (görüntü adı + güvenilir dizin), `test-uygulama` = diğer her şey. Kendi süreci ve **gerçek** üst süreç dışlanır — üst süreç
yalnız: listede tek kaydı var, oluşturma zamanı okunabilir ve daha eski/eşit, komut satırından bu betiğin tam yolu ve adı **yalnız tam argüman olarak**
(başka bir adın parçası değil; ad yalnız dizinsiz ya da `.\` ile) çıkarılınca desene eşleşmiyor; kendi ya da üst pid listede birden çok kez geçerse
dışlanmaz. Dışlananlar raporda görünür. Canlıda taranan süreç 0 ise, **20'den azsa** (daraltılmış liste) ya da tarama **kendi sürecini/komut satırını
göremiyorsa** DUR (liste güvenilir değil); canlı liste filtresiz okunur ve betik/oturum düzeyindeki `$PSDefaultParameterValues` bu okumayı
daraltamaz (yerel gölgeleme; harness sahte CIM ile ölçer). SelfTest ve yayın akışı **aynı karar fonksiyonunu** çağırır; harness kapı zincirinin
bütünlüğünü AST ile 41 ölçümle pinler (15 fonksiyonun ve `ROGUE_*` atamalarının tam metni, SelfTest bloğu, akışın 0-kapılar kesiti, fonksiyon kümesi,
`exit` konumları, dinamik tanım/gölge yasağı — sürücü-değişkeni dahil —, mod değişkeni envanteri, çağrı konumları); 43 kaçış biçiminin her birinin
ölçümü değiştirdiğini ve her ölçümün en az bir denemeyle tetiklendiğini gösterir — ölçümlerin **dışında** kalan kasıtlı bir düzenlemeyi kanıtlayamaz;
o sınıf için savunma yayın betiğinin B0/B1 bloklarındaki sha pini ve incelemedir. **Karşılaştırma tabanı:** #2837'nin ilk head'indeki kapı kendi komut
satırını da saydığı için her koşumda DUR veriyordu (işlevsiz); taban, 19:11Z/19:51Z SelfTest'lerinde koşan sürümdür (kendi + üst süreç pid ile dışlanır)
ve yeni kapı ona göre **gevşek değildir** (§13 inceleme ölçümleri); rollback'te 8.3 kısa yol normalizasyonu (kullanıcı profilinin 8.3 kısa adı digest'i bozuyordu). Boş `modules/portal/dto` dizini geri almada kalır (zararsız).

**R26'da olmayan hata yönetimi (bu turda eklendi, harness ile ölçüldü):**
- **Aşama takibi:** `$script:STAGE` (`0-kapilar | 1-yedek | 2-durdur-web | 2-durdur-api | 3-takas-api | 3-takas-web | 4-kimlik | 5-baslat-api |
  5-baslat-web | 6-kapsam | 7-kanit`; geri alma `R-durdur | R-geri-yukle | R-dogrula | R-baslat`); kanıt JSON'unda `stage` (kanıt yazımından
  önceki son aşama), `failedAt`, `stages[]`.
- **Servisler durdurulduktan sonra her hata yolu** (takas/rename, kimlik okuma, servis başlatma, kapsam) → `Restore-All` (eklenenler karantinaya,
  değişenler yedekten, `.next` + cfg geri) → **geri yüklenen kimlik doğrulanır** (API ağaç == `A8B17A38`, 16 dosyalık paket == `B7FE81DB`,
  eklenen 6 dosya yok/karantinada, WEB `.next` == `C17E7B13`, BUILD_ID == `5waeMoFG`, cfg == `C43DEB5A`) → **yalnız PASS ise** eski servisler
  başlatılır ve B3 ile aynı sağlık kümesi ölçülür (dinleyici ==1, `/api/auth/me`/run-now/portal-cases 401, `/portal/login` 200,
  buildManifest(BID_LIVE) 200, süreç kökü RELEASE23, üçlü değişmedi). API sağlık tutmazsa **WEB adayla hiç başlatılmaz** (`failedAt=5-baslat-api`).
- **Kanıt yazımı `finally` içinde ve korumalı:** `HY_R27_RELEASE_EVIDENCE` yazılamazsa `%TEMP%\r27-evidence-fallback` + konsol; yükseltilmemiş
  (yanlışlıkla/parametresiz) koşum canlı kanıt dizinine **dosya bırakmaz** (yalnız `%TEMP%` fallback). Geri alma betiğinde yedek bütünlüğü ölçümü
  de korumalıdır (yedek dizini yok/okunamıyor → kanıt JSON yazılır, çıkış 20; kanıtsız çıkış yok).
- **Yol bütçesi kapısı** (`1-yedek`): WinPS 5.1 `Get-ChildItem`/`Get-FileHash` MAX_PATH (260) üzerini okuyamaz. Yedek/hazırlık/önceki-`.next`
  kökleri + ağaçtaki en uzun göreli yol (API 123, WEB 87 karakter) < 260 değilse DUR; marjlar kanıtta (`health.pathBudget`). Canlı için ölçülen
  (SelfTest 2026-09-29): `backupApi` 215 (marj 45) · `backupWebNext` 181 (79) · `stagedNext` 184 (76) · `preNext` 181 (79); `failedNext` 184 ·
  `rollbackFailedNext` 191 (dize hesabı). Harness aynı kapıyı ProvaRoot için koşar (uzun kökte 3 = ÖLÇÜLEMEDİ; inceleme bu tuzağı 262 > 260 ile ölçmüştü).
- **İzole test modu** `-TestRoot <dizin> [-Fault <ad>]`: tüm canlı yollar TestRoot altına bağlanır; yükseltme/görev/dinleyici/Http/boot-log/üçlü/
  ACL/sahte-süreç **simülatör** (`sim\state.json`). TestRoot canlı kökün altında/eşitse DUR; canlı modda `-Fault` DUR. 7 fault:
  `api-copy-interrupt | web-swap-fail | identity-read-error (geçici, tek sefer) | identity-read-persistent (kalıcı: R-doğrula da okuyamaz) |
  service-start-fail | restore-hash-mismatch | stop-fail (WEB kapanmaz → 21, dosyalara dokunulmaz)`. Rollback betiğinde de `-TestRoot`; doğrulamadan başlatma yok.
- **Simülatörün ölçmediği:** `.next` ACL kalıtımı, **canlı süreç listesi okuması** (`Win32_Process`), gerçek görev/Http gecikmeleri — bunlar yalnız canlı SelfTest/B0/B1'de
  ölçülür. Sahte-süreç **kararı** ise test modunda sentetik süreç listesiyle (`sim rogueProcs`) ve enjekte sağlayıcıyla ölçülür (aşağıdaki dört `gate-rogue-*` senaryosu).

**Çıkış kodları ve verdict'ler (`r27-release.ps1`):**

| Çıkış | Verdict | Anlamı | Owner eylemi |
|---|---|---|---|
| 0 | `YAYIN PASS` | aday canlıda, sağlık + kapsam tuttu | B2 |
| 10 | `ROLLBACK` | otomatik geri alındı, kimlik doğrulandı, eski servisler ayakta (B3 sağlık kümesi) | kanıt `rollback.reason`/`failedAt` okunur; yayın yok |
| 11 | `ROLLBACK-DOGRULANAMADI` | dosyalar geri yüklendi ama kimlik doğrulanamadı → **servis başlatılmadı**; `verify.mismatches` + B3 talimatı kanıtta | `KURTARMA:` satırları → B3 |
| 12 | `ROLLBACK-ENGELLENDI` | geri alma sırasında durdurma/dosya işlemi başarısız → kalan adımlar kanıtta; servis başlatılmadı (durdurma başarısızsa aday servisler **hâlâ çalışıyor olabilir** — kurtarma metni ayrıdır) | `KURTARMA:` → önce durdurma, sonra B3 |
| 13 | `ROLLBACK-OK-ESKI-BASLAMADI` | geri alındı + doğrulandı ama eski servisler gelmedi/sağlık tutmadı | ESCALATE (dosya işlemi gerekmez) |
| 20 | `KAPIDA-DURDU` | ön kapı/aday/yedek/yol bütçesi aşamasında durdu; dosyalara dokunulmadı; servisler durdurulmadı | neden kanıtta |
| 21 | `DURDURMA-BASARISIZ` | WEB/API kapanmadı; dosyalara dokunulmadı; servisler yeniden başlatıldı | ESCALATE |
| 1 | — | yalnız `-SelfTest` FAIL | B0 durur |

`r27-rollback.ps1`: 0 `ROLLBACK PASS` · 11 · 12 · 13 · 20 (yetki/yedek kimliği/yedek okunamadı/üçlü/.env) · 21 · 1 (SelfTest FAIL) — aynı anlamlar.

| Betik | sha256 |
|---|---|
| `r27-release.ps1` | `EEC582C125FB6308A839E435A072E5449B5E619CA0BBE08F17B9564CF3197961` |
| `r27-rollback.ps1` | `7843A3EBD4FA4E7E46104A382B239910ADCD58C794B1DEB4BBB1161296A37B28` |
| `r27-fault-prova.ps1` (harness; canlıya dokunmaz) | `D66F253626EBC1F60C905E0FE41A093100843DA015A1A79CBC9F897A2FF53B80` |
| `r27-dar-kabul.js` | `F077A8E40462F2F47A98AC27575F2D5EDBF2BB0C16328732CFF454324C09A4A6` |

Betik dizini (merge sonrası kanonik): `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\`.

**B0 — SelfTest + yayın öncesi taban ölçümü (normal pencere; salt okuma; DK-7 tek POST, yazma yok):**
```powershell
& { $ErrorActionPreference='Stop'; $d='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts'; $f="$d\r27-release.ps1"; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'EEC582C125FB6308A839E435A072E5449B5E619CA0BBE08F17B9564CF3197961'){ throw 'R27 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -SelfTest; $rc=$global:LASTEXITCODE; 'SelfTest cikis=' + $rc; if($rc -ne 0){ throw 'SelfTest PASS degil - YAYIN BASLATILMAZ' }; $k="$d\r27-dar-kabul.js"; if((Get-FileHash -Algorithm SHA256 -LiteralPath $k).Hash -cne 'F077A8E40462F2F47A98AC27575F2D5EDBF2BB0C16328732CFF454324C09A4A6'){ throw 'DAR KABUL SHA UYUSMUYOR - DUR' }; $o="D:\Development\HUKUK_YAZILIMI\HY_R27_RELEASE_EVIDENCE"; New-Item -ItemType Directory -Force -Path $o | Out-Null; & node $k before "$o\dar-kabul-before-$((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))Z.json"; 'before cikis=' + $LASTEXITCODE; if($LASTEXITCODE -ne 0){ throw 'taban olcumu R26 davranisini gostermedi - DUR' } }
```
Durma koşulu: SelfTest FAIL (kimlik/pin/üçlü/.env/dinleyici/sahte-süreç/yol bütçesi) ya da `before` ≠ 0 (canlı R26 değil ya da API/WEB ayakta değil).
SelfTest'in sahte-süreç ölçümü 0 değilse çıktı eşleşen süreçleri sınıfıyla listeler; listedeki süreçler (**izleme pencereleri dahil**) kapatılır ve
SelfTest yeniden koşulur. **İzleme süreçleri de DUR verir**: yanlış pozitif ortadan kalkmadı, **teşhis edilebilir** hale geldi (muafiyet ayrı owner
kararıdır, §10 K-15). **Ön koşul (B0 ve B1):** pencere açıkken bu makinede ajan oturumu, harness, öz-test ya da inceleme **koşmaz**; blok etkileşimli
PowerShell penceresine **yapıştırılarak** başlatılır (`-Command`/`cmd /c` sarmalayıcısı ya da komut satırında paket yolunu taşıyan başka bir betik üst
süreç olarak sayılır ve DUR verir). B1 aynı kapıyı yükseltilmiş pencerede yeniden koşar; 0 değilse 20 ile durur (dosyalara dokunmaz). Yükseltilmemiş
pencerede (B0) başka kullanıcının süreçlerinin komut satırı okunamayabilir — sayısı SelfTest çıktısındadır; bu yüzden B0 PASS, B1 kapısının yerine
geçmez. Yükseltilmiş pencerede komut satırı okunamayan yorumlayıcı/kabuk süreci varsa çıktı **UYARI** verir (DUR değil).

**B1 — Yayın (YÜKSELTİLMİŞ pencere; B0 PASS sonrası):**
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\r27-release.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'EEC582C125FB6308A839E435A072E5449B5E619CA0BBE08F17B9564CF3197961'){ throw 'R27 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'YAYIN cikis=' + $rc; if($rc -ne 0){ throw ('YAYIN PASS DEGIL (cikis ' + $rc + ') - KANIT JSON verdict/failedAt/recovery okunur: 10 ROLLBACK = otomatik geri alindi, eski servisler ayakta ; 11 ROLLBACK-DOGRULANAMADI / 12 ROLLBACK-ENGELLENDI = servis BASLATILMADI -> KURTARMA satirlari -> B3 ; 13 ROLLBACK-OK-ESKI-BASLAMADI = ESCALATE ; 20 KAPIDA-DURDU / 21 DURDURMA-BASARISIZ = dosyalara dokunulmadi') } }
```
Sıra ve beklenen kesinti: doğrulanmış yedekler (canlı çalışırken; yol bütçesi kapısı burada) → WEB durur → API durur → API 16 dosya yazılır
(6 için dizin oluşturulur), `.next` yeniden adlandırılarak takas → durmuşken kimlik kontrolü (`E28A6863` / `B2DEE365` / BUILD_ID / cfg) →
API başlar (401 uçları, run-now, portal/cases, boot log `Mapped`; **tutmazsa WEB adayla başlatılmadan geri alınır**) → WEB başlar
(`/portal/login` 200, buildManifest 200, `/intake/x` 200, rewrite 401) → kapsam kontrolü (digest'ler, `.env` sha, üçlü, görev eylemleri
DEĞİŞMEDİ). Kesinti ≈ R26 ile aynı (dakikalar; iki servis sırayla); API başlamazsa 180 sn'lik WEB beklemesi yaşanmaz. Herhangi biri
tutmazsa **otomatik geri alma** (API + WEB birlikte; eklenen 6 dosya karantinaya) → geri yüklenen kimlik doğrulanır → **yalnız PASS ise**
eski servisler başlar; FAIL ise başlatılmaz, `KURTARMA:` satırları B3 komutunu tam yollarla verir.
Korunanlar: başlatıcı üçlüsü, host exe, `.env`, görev tanımları, `.next` ACL (yalnız kalıtım ölçülür), DB (yazma yok, migration yok).
Kanıt: `HY_R27_RELEASE_EVIDENCE\R27-RELEASE-<ts>.json` (yazılamazsa `%TEMP%\r27-evidence-fallback`). **Tarihsel not:** bu dizinde inceleme
sırasında yanlışlıkla parametresiz/yükseltilmemiş koşulan 6 adet `R27-RELEASE-20260929-1844[53-58]Z` / `-1845[00-05]Z.json` (verdict
`KAPIDA-DURDU`, "yükseltilmiş pencere gerekli", canlıya dokunuş yok) durur; B0/B1 kanıtı okunurken bu ts'ler dışlanır; silinip silinmeyeceği
owner kararıdır. Betik artık yükseltilmemiş koşumda bu dizine yazmaz.

**B2 — Yayın sonrası dar kabul (normal pencere; salt okuma):**
```powershell
& { $ErrorActionPreference='Stop'; $k='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\r27-dar-kabul.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $k).Hash -cne 'F077A8E40462F2F47A98AC27575F2D5EDBF2BB0C16328732CFF454324C09A4A6'){ throw 'DAR KABUL SHA UYUSMUYOR - DUR' }; $o="D:\Development\HUKUK_YAZILIMI\HY_R27_RELEASE_EVIDENCE"; & node $k after "$o\dar-kabul-after-$((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))Z.json"; 'after cikis=' + $LASTEXITCODE; if($LASTEXITCODE -ne 0){ throw 'B2 PASS DEGIL - DK satirlari okunur; DK-7 FAIL = yayin davranisi gelmedi -> B3 degerlendirilir' } }
```
Geri dönüş tetikleyicileri: B2 ≠ 0; API/WEB dinleyicisi tek değil; boot log'da `Mapped` yok; portal girişi/intake sayfası
bozuldu (owner gözlemi) ; D-5 Preflight'ta dist pini eşleşmiyor (yayın kimliği beklenen değil).

**B3 — Elle geri dönüş (YÜKSELTİLMİŞ; yalnız gerekirse; `<api.backup>`/`<web.backup>` B1 kanıt JSON'undan, TAM yol):**
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\r27-rollback.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '7843A3EBD4FA4E7E46104A382B239910ADCD58C794B1DEB4BBB1161296A37B28'){ throw 'R27 GERI ALMA BETIGI SHA UYUSMUYOR - DUR' }; $api='<api.backup>'; $web='<web.backup>'; if($api -like '<*' -or $web -like '<*'){ throw 'yer tutucu doldurulmadi - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web -SelfTest; if($global:LASTEXITCODE -ne 0){ throw 'yedek kimligi dogrulanamadi - GERI ALMA BASLAMAZ' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web; $rc=$global:LASTEXITCODE; 'GERI ALMA cikis=' + $rc; if($rc -ne 0){ throw 'ROLLBACK DOGRULANAMADI - ESCALATE' } }
```

**Hata provası harness'ı — senaryo sonuçları** (koşum `run-20260930-065942Z`, WinPS 5.1, canlıya dokunmadan; özet `fault-prova-summary.json` sha256
`A8F0C957ECA9B64E79D04A87D87C258D223E4087A2AC663AEA3395316DFA5DB2`; kalıcı kanıt §13). Pristine taban kopyası `A8B17A38`/`C17E7B13`, aday `HY_WT_R27` `E28A6863`/`B2DEE365` harness başında pinlerle doğrulandı;
her işlevsel senaryo TestRoot `robocopy /MIR` ile sıfırlandı (yalnız prova kökü). "Başarısız geri dönüş" hiçbir senaryoda PASS sayılmadı: 10 için
`verify.ok=true` + `servicesStarted=true` + `postStart.ok=true`, 11 için `servicesStarted=false` + `KURTARMA:` şart.

| Senaryo | Beklenen → ölçülen çıkış / verdict | `failedAt` / `stage` | Dosya durumu (TestRoot) | Simülatör servis | Kurtarma talimatı | Assert | Kanıt JSON sha256 |
|---|---|---|---|---|---|---|---|
| happy-path | 0 → 0 `YAYIN PASS` | — / `6-kapsam` | API `E28A6863`, WEB `B2DEE365`/`W2UQpBPD`, 6 eklenen VAR | API+WEB ayakta | yok (beklenen) | 21 | `C73BEF850E123061496AB0826201F55B92416EFA80BFEDD9D70D4C1723AA09A8` |
| rollback-script | 0 → 0 `ROLLBACK PASS` | — / `6-kapsam` | taban `A8B17A38`/`C17E7B13`/`5waeMoFG`, eklenen YOK, karantina var | ayakta | yok | 22 | `769B5BFA18974EDDF12A2EEF6E48FF1D4A5DEF286DA1A7ADF73A8CE387DF0E2E` |
| api-copy-interrupt | 10 → 10 `ROLLBACK` | `3-takas-api` / `R-baslat` | taban; karantina; silme yok | ayakta (doğrulama SONRASI başlatıldı) | yok | 23 | `7A9772887BC7B38654401F55FFA5C7EE2D3902549E77359C01BD94F370EBB55F` |
| web-swap-fail | 10 → 10 `ROLLBACK` | `3-takas-web` / `R-baslat` | taban (`.next.pre-*` geri taşındı) | ayakta | yok | 23 | `5CD5C01B402FA77FE9ADD209DA41C46BBC28AE568BF2744878847943059B1C51` |
| identity-read-error | 10 → 10 `ROLLBACK` | `4-kimlik` / `R-baslat` | taban (geçici, tek seferlik okuma istisnası) | ayakta | yok | 23 | `731DC5CB94E99A98608141BFC0D8E86B68B67040CFF62312DB2E70B0877A4D7B` |
| identity-read-persistent | 11 → 11 `ROLLBACK-DOGRULANAMADI` | `4-kimlik` / `R-dogrula` | dosyalar taban (restoreSteps TAMAM) ama `verify.*=OKUNAMADI` | **DURMUŞ** (başlatılmadı) | **var** (B3 tam yollarla) | 26 | `852D37A241D6643FA0AA5A5D0ACD09F3CA480BC2666985007B41E284FD3CEC0C` |
| service-start-fail | 10 → 10 `ROLLBACK` | `5-baslat-api` / `R-baslat` | taban; **WEB adayla hiç başlatılmadı** | ayakta | yok | 24 | `DD38EF6C595DBE9308B84CF6A099394BCC874A5C2EAA18C7378BCEB8DDE3C3C0` |
| restore-hash-mismatch | 11 → 11 `ROLLBACK-DOGRULANAMADI` | `5-baslat-api` / `R-dogrula` | API digest taban DEĞİL (bozulma korundu, yakalandı) | **DURMUŞ** | **var** | 23 | `EAC0D655BF57CE5F8160280C8689579F06FA496A8B9C53A4962C8B58D08AF937` |
| stop-fail | 21 → 21 `DURDURMA-BASARISIZ` | `2-durdur-web` / `2-durdur-web` | dokunulmadı (taban); WEB kapanmadı → yeniden başlatıldı, API hiç durdurulmadı; karantina/geri alma yok | API+WEB ayakta | yok | 24 | `7D9420EEA1F3BCF45D25A1970ECD5D8D759F113C8E536225A6F0571DF9124EE0` |
| gate-fault-live-mode | 20 → 20 | — / — | dokunulmadı; canlı kanıt dizinine dosya eklenmedi | — | — | 4 | — |
| gate-testroot-under-live | 20 → 20 | — / — | dokunulmadı (release + rollback; altında ve eşit) | — | — | 6 | — |
| gate-sim-missing | 20 → 20 `KAPIDA-DURDU` | `0-kapilar` / `0-kapilar` | dokunulmadı; kanıt TestRoot altında | stop/start yok | — | 8 | `B3AA9958B769C936840B390F654F20C4E90000386E2851A93BC44702DE6A67BB` |
| gate-evidence-fallback | 20 → 20 `KAPIDA-DURDU` | `0-kapilar` / `0-kapilar` | `KANIT YAZILAMADI` + kanıt `%TEMP%` fallback | — | — | 7 | `AFBB37013C0621616BE25920CE13723E9E7FFCCDFA60DA1BE1BE6A68EF6AECB0` |
| gate-rollback-backup-missing | 20 → 20 `KAPIDA-DURDU` | `1-yedek-butunluk` / `1-yedek-butunluk` | dokunulmadı; kanıt JSON yazıldı | stop/start yok | — | 11 | `9DF632F8CC0A09926C8C405B927CA308BA54D11D13EB48A75882609A8A0A1B8B` |
| gate-rogue-process | 20 → 20 `KAPIDA-DURDU` | `0-kapilar` / `0-kapilar` | dokunulmadı; kapının **kendi** hata metni (izleme dahil 2 eşleşme); ADAY DOĞRULAMA'ya geçilmedi; `health.rogue` alan kümesi tam eşit; kanıtta tam komut satırı/sır işareti yok | stop/start yok | — | 17 | `D11A25D7EA646418E5088D9F3F5DE0B3D9A561CE5BCD0DCA73829AA5096A76CF` |
| gate-rogue-viewer-only | 20 → 20 `KAPIDA-DURDU` | `0-kapilar` / `0-kapilar` | dokunulmadı; yalnız izleme süreci → yine DUR (kapının kendi metni) + karşı kontrol: eşleşme yoksa akış ADAY DOĞRULAMA'ya ulaşır | stop/start yok | — | 14 | `6C0E62EC6B93B88681D4A043BBB81F52A68F8F3365C92C1F993F62FE9F352F75` |
| gate-rogue-classifier | — | — / — | süreç koşmaz: desen/izleme/dizin/uzantı/bayrak/kabuk listeleri tam eşitlikle sabit; büyük/küçük harf; U+0130/U+0131/U+212A; sahte ad/yol; üst süreç kenar durumları (eşit/bozuk tarih, yinelenen pid, başka oturum); 70 süreçlik liste; öğe adı korumaları tek tek; 27 fonksiyon + 7 değişken mutasyonu | — | — | 39 | — |
| gate-rogue-wiring | — | — / — | süreç koşmaz: kapı zinciri bütünlüğü (41 AST ölçümü pinle tam eşit) + 43 kaçış biçimi + 15 fonksiyon ölçüm denemesi, ölçüm kapsamı tam; SelfTest + akış aynı karar fonksiyonu (AST çağrı konumu); gerçek `Get-ProcList` sahte CIM + etkin varsayılanla; canlı dal enjekte sağlayıcıyla (kanarya, taranan=0, <20, sağlayıcı istisnası) | — | — | 29 | — |

**Sonuç: 18/18 PASS** (9 işlevsel + 9 kapı; 344 assert). Betik sha'ları özetle eşittir: yayın `EEC582C1…`, geri alma `7843A3EB…`, harness `D66F2536…`.
Önceki koşumlar (7/7, 13/13, 14/14, 16/16, önceki baytlarla 17/17 ve inceleyicinin uzun kökte aldığı FAIL) **tarihsel kayıt** olarak korunur; bu tablo
yalnız son baytları kanıtlar.

**Canlı salt-okuma SelfTest kayıtları (kronolojik; FAIL kayıtları korunur):**

| Zaman (UTC) | Betik sha | Sonuç | Başarısız ölçüt | Not |
|---|---|---|---|---|
| 2026-09-29 18:02 | `03B68804…` | PASS | — | sahte-süreç ölçümü o sürümde yoktu |
| 2026-09-29 19:11 | `61CD14CC…` | **FAIL 1** | sahte-süreç sayımı = 3 (diğer 15 ölçüm PASS) | **kök neden belirlenemedi**: o sürüm eşleşen sürecin kimliğini kaydetmiyordu. Ajanın "kendi log izleme süreçlerim" açıklaması **beyandır, ölçüm değildir** |
| 2026-09-29 19:51 | `61CD14CC…` | **FAIL 1** | sahte-süreç sayımı = 1 (diğer 15 ölçüm PASS) | **kök neden belirlenemedi**: eşleşen sürecin kimliği kaydedilmedi. Aynı anda koşan salt-okuma kabuk/`node --check` komutları aday; **kanıtlanmadı** |
| 2026-09-29 21:54 (A/B/C) | `1D246DAA…` | A FAIL (çıkış 1) · B **PASS (çıkış 0)** · C PASS | — | **tarihsel, GERİ ALINDI**: ilk yeniden tasarım izleme görüntüleyicisini muaf tutuyordu; inceleme "kapı gevşedi" buldu |
| 2026-09-29 23:06 (A/B/C) | `88BCE19E…` | A FAIL (çıkış 1) · B FAIL (çıkış 1) · C PASS | — | tarihsel: muafiyet kaldırıldı; sonraki inceleme turunun düzeltmelerinden **önceki** baytlar |
| 2026-09-30 08:04 (A) | `EEC582C1…` | **FAIL** (çıkış 1; beklenen) | negatif kontrol: koşucu adını taşıyan gerçek `node` süreci çalışırken | 3 `test-uygulama` satırı; yalnız yaprak dosya adı, yerel yol/komut satırı yok |
| 2026-09-30 08:04 (B) | `EEC582C1…` | **FAIL** (çıkış 1; beklenen) | yalnız doğrulanmış izleme süreci (`tail.exe`) çalışırken | izleme sınıfı da sayılır (muafiyet yok) |
| 2026-09-30 08:04 (C) | `EEC582C1…` | **PASS** (çıkış 0) | — | temiz pencere: eşleşen 0; kendi süreci görüldü; taranan/okunamayan süreç sayıları çıktıda |
| son doğrulama | `EEC582C1…` | **PASS** | — | yayın SelfTest + geri alma SelfTest (canlı kopyasından sentetik yedek); §13 `RESULTS.json` |

19:11Z ve 19:51Z hataları için "yanlış pozitifti" ya da "giderildi" **denmez**: kök neden belirlenemedi; yapılan değişiklik kapıyı **gevşetmez**, nedenini
**görünür** kılar. Bundan sonraki her FAIL'de listelenen satırlar kanıta alınır. A/B/C kontrol betiği kanıt paketindedir (§13) ve yayın betiğinin sha'sı
her değiştiğinde yeniden koşulur. `r27-dar-kabul.js` sahte R26/R27 ile 7/7 (değişmedi).
**Sınanmayan:** yükseltilmiş gerçek koşum ve **yükseltilmiş pencerede sahte-süreç taraması** (yalnız canlı B1'de mümkün); B2 `before` canlıda koşulmadı
(B0'ın parçası); harness'ta senaryosu olmayan yollar: geri alma sırasında (R-durdur) durdurma başarısızlığı (12) ve doğrulama sonrası
`Start-ScheduledTask` istisnası (13 ön-ataması) — kod yolu vardır, ölçülmedi. (21/`DURDURMA-BASARISIZ` artık `stop-fail` senaryosuyla ölçülür.)
Simülatör `.next` ACL kalıtımını ve gerçek görev/Http gecikmelerini ölçmez. Canlı süreç listesi okuması harness'ta ölçülmez; yalnız canlı SelfTest
(A/B/C kontrolleri, B0, B1) ölçer.

## 7. Yayın sonrası — kalan kabullerin sırası

1. Bu paketin PR'ı (#2837) merge → `main` senkron (owner blokları pinleri `main` checkout'undan okur).
2. **Y1** owner GO → B0 → B1 → B2 (§6).
3. Pin güncelleme PR'ı (#2838, taslak; §9) merge → main senkron.
4. **D-5** (`client-extacc-portal-d5-r01`): Preflight (salt okuma; R27 dist pini; adres sorulmaz) → QrTest (owner R05 portal adresini konsola yazar; canlı `.env` ile eşleşmeli) → **Run** (Y3: R05 adres teyidi + alıcı adresi + tek gönderim onayı + GO) → gerekirse Recover.
5. **D-8** makine sondası (`d8-staff-surface-probe.js`; dış origin canlı `.env`'den salt okuma, yer tutucu yok) + telefon listesi beyanı.
6. **D-6** (`client-extacc-portal-d6-r01`) ve **D-7** (`client-extacc-portal-d7-r01`) canlı koşumu — her biri Preflight → QrTest → Run → gerekirse Recover, ayrı GO.
7. Birleşik D-9 ölçümü (`client-extacc-d8-staff-surface-r01` §6 bileşen → ölçüt tablosu) ve kayıt PR'ı.

## 8. Kalan iş listesi (bağımlılık sırası)

| # | İş | Bağımlılık | Durum |
|---|---|---|---|
| W1 | Bu paket PR'ı (#2837; docs + betikler) merge | owner onayı (2026-09-30, sohbet: "plana göre merge edilebiliyorsa merge et") + son head'de CI/CodeQL yeşil + `main` CI boş | koşullar sağlanınca ajan merge eder (`--match-head-commit`); sonuç kanıt paketindeki `PR-HEADS-AND-ORDER.json`'da |
| W2 | R27 yayını B0→B2 | W1 + owner GO Y1 | bekliyor |
| W3 | Pin güncelleme PR'ı (#2838) | W2 (canlı dist R27) | taslak; merge yalnız B1 + B2 PASS **sonrası** (öncesinde eski paketlerin Preflight'ları canlı R26'da DUR verir) |
| W4 | D-5 canlı kabul | W2, W3 + §10 D-5 kararları + GO | paket hazır (koşucu öz-testi 41/41 · QR 23/23 · blok 90/90 ×2 kabuk) |
| W5 | D-8 makine sondası + telefon | W2 (R26'da da koşabilir) | sonda hazır (öz-test 15/15) |
| W6 | D-6 / D-7 canlı koşumu | W2 + ayrı GO'lar | paketler hazır (D-6 51/51 · blok 64/64; D-7 41/41 · blok 58/58) |
| W7 | Birleşik D-9 | W4–W6 | tanım hazır |
| W8 | K3/OFFICE kapsamı + 3 migration (ayrı aday) | owner kararı (§10) | ertelendi; disposable migration provası yapılmadı |
| W9 | SEC-* kayıtlarının ürün düzeltmeleri | owner kararı (§10) | açık; bu paket hiçbirini gidermez |

## 9. Güvenlik ve kabul pinleri

- Kısıtlı kayıt (owner-yerel) kalemleri **ID ile** izlenir; ayrıntı bu belgede/PR'da/test açıklamasında yoktur. SEC-STAFF-XFF-01 ve SEC-API-BIND-01 **AÇIK** kalır; dar D-5 yaması bunları **gidermez** (D-5 sayaç ayrımı ayrı konudur). SEC-PORTAL-ADMIN-MSG-01 **AÇIK** (§1.4).
- Yayından sonra `ExpLiveDist`/`EXP_DIST` pini R26 `A8B17A38…` olan owner blokları güncellenir (#2838: yalnız pin satırı + yorum; eski kabul kanıtları/kayıt belgeleri DEĞİŞTİRİLMEZ): `c4-live-block.ps1`, `extacc-owner-live-block.ps1`, `d4-owner-live-block.ps1`, `h5-owner-env-block.ps1`, `h5-owner-live-block.ps1`. R26 yayın/kabul betikleri ve `r26p1-stage-gate.ps1` **tarihsel** kalır.
- Hash yalnız ölçülen aday artefaktından alınır (`E28A6863…`); canlı eşleşme yayından sonra Preflight'larla **ayrıca** doğrulanır.
- Yayın/geri alma betikleri ve harness simülatörü başlatıcı yollarını R26 betikleriyle **aynı literaller** olarak taşır (emsal; betiğin çalışması için gerekli; sır değil).
- **D-5, D-6 ve D-7** owner blokları public host ve yerel kullanıcı yolu literali taşımaz: portal adresi canlı `.env` `PUBLIC_PORTAL_BASE_URL`'den okunur (https/yolsuz biçim kapısı) ve Run/QrTest'te owner'ın konsola yazdığı R05 adresiyle doğrulanır; kanıt kökü kullanıcı profiline görelidir. D-4/EXTACC/H5/C4 blokları (eski paketler) aynı literalleri **emsal** olarak taşımaya devam eder; bu turda değiştirilmedi.
- D-5/D-6/D-7 blokları R27 pinlidir: canlı R26 iken Preflight **DUR** verir (beklenen).
- SelfTest ve yayın kanıtındaki sahte-süreç raporuna tam komut satırı yazılmaz; pid, görüntü adı, sınıf, eşleşen parça ve (koşullar sağlanırsa) yaprak dosya adı yazılır. Dosya adı yazıldığı için bu çıktılar "sır içermez" diye **varsayılmaz** ve public PR/test açıklamasına kopyalanmaz.

## 10. Owner kararları — yalnız gerçekten eksik olanlar

**Verilmiş karar (yeniden sorulmaz):** yayın kapsamı **B** — canlı R26 tabanı + dar D-5 adayı; K3/OFFICE davranışları ve üç migration bu yayına alınmaz (owner, 2026-09-29).

| # | Karar / yetki | Seçenekler | Ne zaman gerekir | Engelleyici mi |
|---|---|---|---|---|
| Y1 | R27 canlı yayın GO'su (B0 → B1 → B2) | ver / verme | W2 | yayın için evet |
| K-2 | D-5 alıcı e-posta adresi | owner konsola girer (repoya/rapora/kanıta yazılmaz) | D-5 Run anında | D-5 için evet |
| K-3 | D-5 gerçek gönderim | plan **1** e-posta; ek talep = ek gönderim, onaysız yapılmaz | D-5 Run anında (konsolda "GÖNDER") | D-5 için evet |
| K-4 | D-5 kapanışında alıcı adresi sentetik hesapta `.invalid` ile ezilsin mi | E / H | D-5 Run/Recover anında | hayır (her iki seçenek de koşulur) |
| K-5 | #2830 eski PR gövdesi + `02276b68` commit geçmişi | geçmişi yeniden yaz / olduğu gibi bırak | herhangi bir zaman | hayır |
| K-6 | K3/OFFICE kapsamı ve 3 migration'ın yayın zamanı | R27 sonrası ayrı aday | R27 sonrası | hayır |
| K-7 | D-6 belge onay/ret akışının canlı kabulü (koşucu `approve/reject` uçlarını bilinçli çağırmaz) | ayrı paket iste / D-6 kapsamıyla yetin | D-6 GO'sundan önce | hayır |
| K-8 | D-7 sonrası sentetik tenantta kalan mesaj/bildirim satırları | "saklandı" kaydıyla kabul (önerilen; ürün silme ucu yok) / elle DB silme (önerilmez) | D-7 GO'sundan önce | D-7 kapanış ifadesi için evet |
| K-11 | SEC-PORTAL-ADMIN-MSG-01 ürün düzeltmesi | yetki kuralını belirle + ayrı yama / ertele | herhangi bir zaman | hayır (yayın ve D-7 için) |
| K-12 | Hizmet kabulü imza metni ön koşulları: B-2 (H1), KB-03 / H2-10 (H2), H4-08 gerçek yayın ayağı (H4), H7-05b · K-1 · PSUS (H7) | her kalem: "kabul dışı / sonraki iş" ya da ayrı karar | hizmet kabulü imzasından önce | hizmet kabulü için evet |
| K-13 | H5 ayrı hizmet-kabulü satırı (B-I11-2 hükmü) | hüküm ver | H5 hizmet kabulünden önce | H5 hizmet kabulü için evet |
| K-14 | Sahte-süreç deseninin **eski paket** koşucu adlarına genişletilmesi (R25–R26 yayın/geri alma/kabul, H5 sahte-API/owner/pin, İ1x owner blokları, İ3 koşucu/başlatıcı, C4 canlı, T-pencere adları) | genişlet (ayrı küçük değişiklik + envanter testi + yeniden inceleme) / mevcut kapsamla yetin (taban sürümle **aynı** sınır; B0/B1 ön koşulu "pencerede başka koşum yok") | Y1'den önce | hayır (kapı tabandan gevşek değil; genişletme bu talimatın "yalnız yanlış pozitifi düzelt" kapsamını aşar) |
| K-15 | Yalnız okuyan izleme görüntüleyicilerinin (`tail`, `findstr` vb.) kapıdan muaf tutulması | muaf tutma — mevcut davranış: DUR (önerilen) / muaf tut (ayrı değişiklik + yeniden inceleme) | isteğe bağlı | hayır |

Karar **gerektirmeyenler** (teknik olarak kapatıldı, bilgi): D-7 kapsam dışı `caseId` için ürün **400** döner ve tanım buna göre güncellendi (`client-extacc-d8-staff-surface-r01` §5);
D-7 Recover'ın dist değişiminden etkilenmesi yalnız o durum oluşursa ele alınır; yayın kanıt dizinindeki 6 adet inceleyici kaynaklı `KAPIDA-DURDU` kaydı tarihsel
not olarak yerinde durur (silinmesi istenirse owner yapar). H1–H8 kalemlerinin kaynak atıfları `H1-H8-ACIK-OLCUTLER-R01.md` içindedir; sayaç **0/8** değişmedi.

## 11. Uygulama sırası — başarı ve durma ölçütleri

| Adım | Başarı | Durma |
|---|---|---|
| PR merge (#2837) | owner onayı + main CI/CodeQL SUCCESS merge SHA'sında; `gh run list --branch main` boşken merge | CI FAIL / başka merge koşuyor / onay yok |
| B0 | SelfTest PASS (WinPS 5.1), `before` çıkış 0; ön koşul: makinede ajan oturumu/harness/öz-test/inceleme koşmuyor, blok etkileşimli pencereye yapıştırıldı | herhangi bir kapı; sahte-süreç listesi boş değil (izleme dahil); tarama kendi sürecini göremedi |
| B1 | `YAYIN PASS`; API `E28A6863`, WEB `B2DEE365`/`W2UQpBPD` | 10/11/12/13/20/21 (§6 tablo); 11/12 → B3 |
| B2 | çıkış 0 (DK-1…DK-8) | DK-7 FAIL → davranış gelmedi → B3 değerlendirilir |
| Pin PR (#2838) | D-4/EXTACC/H5/C4 Preflight'ları R27 dist ile PASS | pin uyuşmazlığı |
| D-5 | Run çıkış 0 + owner beyanı; tek kullanım yalnız makine gözlemi PASS **ve** owner beyanı "formu gönderdim, reddedildi" ise doğrulanmış sayılır | 3 = ölçülemeyen (kabul değil); 5/6 → Recover; ürün bulgusu |
| D-8 | sonda çıkış 0 + telefon beyanı 5/5 "E" | herhangi bir 403-dışı ret |
| D-6 / D-7 | Run çıkış 0 + owner beyanı | 3 = ölçülemeyen; 5/6 → Recover; ürün bulgusu |

Bu revizyon commit edildiğinde #2837 head SHA'sı değişir; güncel head SHA'ları ve uygulama sırası kanıt paketindeki `PR-HEADS-AND-ORDER.json` dosyasında ve PR açıklamasındadır
(belge kendi commit SHA'sını içeremez). Aday SHA (`1b758d29`) **değişmedi** — ürün kaynağına bu turda dokunulmadı; değişen yalnız governance belgeleri ve betikleridir.

## 12. Şeffaflık ve sınırlar

- Bu turlarda canlıya giden istekler: yalnız SelfTest'in kimliksiz GET'leri (`/api/auth/me`, `/portal/login`, web `/api/auth/me`), canlı dosya/ACL/süreç listesi **okuması** ve canlı DB'ye salt okuma migration sorgusu. Yazma yok; e-posta yok; servis yeniden başlatılmadı; canlıda hata enjeksiyonu yapılmadı.
- SelfTest kontrollerinde başlatılan yardımcı süreçler (uyuyan bir `node` betiği, bir `tail`) kontrol betiğince kapatıldı; canlı servislerle ilgileri yoktur.
- `HY_WT_R27`, `HY_WT_R26`, disposable veritabanı konteynerleri, hata provası kökleri ve checkpoint dizini **silinmez**.
- Sahte API'ler ürünün kendisi değildir; ürünün hız sınırı, gönderim, kova/ACL ve yetki davranışı yalnız canlıda ölçülür.
- D-5'te e-posta **teslimi** ölçülmez: token üretimi, SMTP kabulü ve posta kutusuna teslim ayrı olaylardır; yalnız owner beyanı vardır.
- D-8'de katman, doğrudan ilişkilendirilebilir sunucu kanıtı yoksa **UNKNOWN**'dur; boş 403 gövdesi katmanı kanıtlamaz.

## 13. R02 kanıt paketi, inceleme turları ve açık kalan bulgular

**Kanıt dizini (yerel, repo dışı):** `Documents\CLIENT-EVIDENCE-20260911\r27-package-r02-20260929\` (kullanıcı profiline göreli).

| Alt dizin | İçerik |
|---|---|
| `final\tests\` | son dosya baytlarıyla koşulan 15 sonuç + `RESULTS.json` (her sonuç: test edilen dosyaların sha256'sı, komut, ortam, çıkış kodu, çıktı dosyası sha256) |
| `final\selftest-controls\` | canlı salt-okuma SelfTest kontrolleri A (negatif) / B (izleme) / C (temiz) + özet + **kontrol betiği** (yayın betiğinin sha'sı her değiştiğinde yeniden koşulur; paket yolunu taşımayan bir dizinden başlatılır) |
| `final\fault-prova\` | son hata provası koşumu (18 senaryo, 344 assert): özet, senaryo çıktıları, kanıt JSON'ları, simülatör durumları |
| `history\` | önceki koşumlar ve **korunan FAIL kayıtları** (ilk 7/7 ve 13/13 provaları, 19:11Z ve 19:51Z SelfTest FAIL'leri, inceleyici koşumları, ajan kanıt dizinleri); son başarılı koşumlardan ayrıdır |
| `source-diff\`, `build\`, `artifact-manifests\` | R26 → R27 ürün kaynak diff'i, kritik bağımlılık sürümleri, derleme/test çıktıları, API/WEB dosya → sha haritaları |
| `package\` | bu PR'daki beş paket dizininin son hali |
| `PR-HEADS-AND-ORDER.json`, `COPY-LOG.json`, `SHA256-MANIFEST.txt` | güncel PR head SHA'ları + uygulama sırası · hash doğrulamalı kopya günlüğü · bütün dosyaların sha256'sı |

Kopyalar kaynak/hedef sha256 eşitliğiyle doğrulanır; hiçbir kaynak silinmez. Sır taraması dosya kodlamasını dikkate alır (BOM'a göre UTF-8 / UTF-16;
BOM'suz UTF-16 ayrıca denenir). ZIP üretildikten sonra **yeniden açılır** ve içindeki her dosyanın sha256'sı manifestle karşılaştırılır. ZIP adı, sha256'sı ve
manifest doğrulama sonucu PR açıklamasında ve teslim raporundadır (ZIP bu belgenin kopyasını içerdiği için sha'sı burada yer alamaz).
Paket dışı bırakılanlar (yerelde kalır): hata provası `testroot` kopyaları (tam ürün ağacı), H1–H8 çalışmasının ilk atıf dökümü (tarihsel GO literali/host
içerir; ayıklanmış sürümü pakettedir) ve D-5 çalışmasının kaldırılan literalleri içeren üç ara dosyası (maskeli kopyaları pakettedir).

**İnceleme turları:** her iş uygulayıcıdan bağımsız iki lensle (talimat uyumu + doğruluk; güvenlik + kanıt bütünlüğü) incelendi, bulgular düzeltildi ve
testler son baytlarla yeniden koşuldu. Sahte-süreç kapısı art arda incelendi: ilk yeniden tasarımdaki izleme muafiyeti "kapı gevşedi" bulgusu üzerine
**kaldırıldı**; ikinci turun bulguları (yanlış-yeşil senaryo, U+0130/U+0131/U+212A, test edilmeyen canlı dal ve SelfTest bağlantısı, öğe adı korumaları,
kanarya, üst süreç tam yolu) uygulandı. **Sahte-süreç kapısının 4.–6. inceleme turları:** 4. tur (iki mercek) DÜZELTME GEREKLİ verdi; 13 bulgu uygulandı. 5. tur kredi sınırı yüzünden
sonuç döndürmeden kesildi; ajanların bıraktığı ham ölçümler kullanıldı: gevşeme merceği 19:11Z tabanına göre gevşeme bulmadı, duyarlılık merceğinde
79 mutanttan 35'i hayatta kaldı → üst-süreç kuralı sıkılaştırıldı, sınıflandırıcıya yeni örnekler ve harness'e kapı zinciri bütünlük ölçümü eklendi.
6. tur (iki mercek, bir önceki bayt sürümü) **KABUL** verdi: 6 yapılandırmada (WinPS 5.1 / pwsh 7 × tr-TR / en-US / Invariant) 1650 karşılaştırmada
gevşeme 0; 118 mutant. KÜÇÜK bulguları (`$PSDefaultParameterValues` ile canlı listeyi daraltma, `${function:…}` sürücü-değişkeniyle yeniden tanım,
bazı ölçümlerin tek başına sınanmaması, bazı yakalamaların yalnız metin pinine dayanması) son baytlarda giderildi: `Get-ProcList` varsayılanları yerel
olarak gölgeler, canlıda taranan süreç 20'den azsa DUR, her bütünlük ölçümünün en az bir denemeyle tetiklendiği denetlenir, davranışsal örnekler eklendi.
**Son baytlarla regresyon:** incelemecilerin mutant setlerinde uygulanabilen 100 mutantın 100'si yakalandı, 0'i hayatta kaldı,
0'u ölçülemedi (2 mutant, hedeflediği satır değiştiği için uygulanamadı); harness öz-zayıflatma setinde 49/49 yakalandı.
Bir ara denemede uzun dizin adı yol bütçesini aştığı için mutantlar **hiç koşmamış**, koşucu bunu "yakalandı" saymıştı; o sonuç geçersiz sayıldı,
koşucu düzeltildi ("yakalandı" = senaryolar koştu ve en az biri FAIL) ve geçersiz deneme kanıt paketinde işaretli olarak durur.
**Sınırlar (açıkça):** harness kendi assert'lerini zayıflatan bir değişikliği içeriden yakalayamaz ve ölçümlerin dışında kalan kasıtlı bir düzenlemeyi
kanıtlayamaz — bu sınıf için savunma yayın betiğinin ve harness'in sha pini + incelemedir. Regresyonda tek hayatta kalan (21/`DURDURMA-BASARISIZ` → 0)
sahte-süreç kapısı dışındaki bir kapsam boşluğunu gösterdi; `stop-fail` hata senaryosu eklendi ve mutant son baytlarla yakalandı.

**Eleştirmenin 13. bulgusu (açıkça):** dosya/konu — kalıcı inceleme paketi dizini (`r27-package-r02-20260929`); davranış — dizin eksikti (ZIP ve tüm dosyaları
kapsayan manifest yoktu; hata provası, D-6/D-7/D-8 çıktıları ve kapanış düzeltmesi kanıtları taşınmamıştı); önem — ÖNEMLİ; çözüm — R02'de kapatıldı: yukarıdaki
yapı kuruldu, kopyalar hash doğrulamalı, manifest + ZIP üretildi ve ZIP yeniden açılıp doğrulandı.

**Açık engeller:** canlı yayın GO'su (Y1) ve D-5 çalışma anı kararları (K-2/K-3) verilmeden hiçbir canlı adım başlamaz. Kısıtlı kayıtlar (§1.4) açıktır ve bu paketle
giderilmez. H1–H8 hizmet kabulü **0/8**'dir.
