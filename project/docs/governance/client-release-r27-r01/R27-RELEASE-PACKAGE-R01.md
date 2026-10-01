# R27 — YAYIN PAKETİ (R03 revizyonu; dosya adı korunur) · D-5 güvenlik düzeltmeleri · API + WEB · canlı taban + dar aday

> **DURUM: R27 CANLIDA (2026-09-30)** — owner B0 PASS · B1 `YAYIN PASS` · B2 8/8; kayıt `record/R27-LIVE-RECORD-R01.md`. Aşağıdaki "CANLIYA UYGULANMADI" ifadeleri yayın ÖNCESİ revizyon notlarıdır. Migration, gerçek e-posta gönderimi ve canlı kabul koşumları bu paketle
> **yetkilendirilmez**; her biri için ayrı owner GO gerekir (§10). Bu belge inceleme paketidir; "hazırlık tamamlandı" demek
> canlı güvenlik düzeltmesi ya da H1–H8 hizmet kabulü tamamlandı demek DEĞİLDİR.
> Yetki ayrımı: **(Y1) yayın** = B1 · **(Y2) migration** = bu adayda YOK (A/C seçilirse ayrı GO) · **(Y3) e-posta** = D-5 Run'da
> owner konsolunda tek gönderim onayı · **(Y4) kabul** = D-5/D-8/D-6/D-7/D-9 koşumları, her biri ayrı GO.
> **R02 (2026-09-30):** canlı SelfTest FAIL-1'in başarısız ölçütü **sahte-süreç sayımıydı**; eşleşen sürecin kimliği o koşumda kaydedilmediği için **kök neden belirlenemedi**.
> Kapı GEVŞETİLMEDİ, teşhis edilebilir yapıldı; son baytlarla temiz pencerede PASS ölçüldü (§6) · public belgeye eklenen güvenlik satırı çıkarıldı, kayıt kısıtlı kayıtta AÇIK (§1.4) ·
> D-5 QR betiği + owner bloğu, D-6/D-7 paketleri, H1–H8 kalemleri · tek kanıt paketi (§13). Aday kimliği (`1b758d29`) DEĞİŞMEDİ; kapsam **B** (owner kararı, §10).
> **R03 (2026-09-30, dar düzeltme):** `r27-release.ps1` durdurma/geri dönüş hata yolları — `2-durdur-*` istisnasında satır içi yeniden
> başlatma atlanıyor ve koşulsuz "servisler yeniden başlatıldı" (21) yazılıyordu. Artık her servis ayrı denenir ve ölçülür, yalnız KAPALI ölçülen
> servis başlatılır, "ayakta" yalnız sağlık kümesiyle söylenir (21 = ölçülerek ayakta; yeni **22** = toparlanamadı); 12/13 yollarında servis bazında
> kayıt (§6). D-8 sondası: `Server`/sağlayıcı başlıkları katman **ipucudur**, kesin katman `unknown`. SEC-PORTAL-ADMIN-MSG-01 kısıtlı değerlendirmesi
> tamamlandı (§1.4). Aday (`1b758d29`), kapsam **B** ve migration 0 DEĞİŞMEDİ. Linux izole provası yapıldı; gerçek taban kopyasıyla WinPS 5.1 harness'ı
> ve yeni sha ile canlı salt-okuma SelfTest A/B/C bu turda **koşulmadı** (§6 R03, §8 W0).
> **R03-b (2026-09-30):** servis ölçümünde dinleyici/CIM **okuma hatası** artık sıfır sayım ("kapalı") sayılmıyor → `OLCULEMEDI`; yalnız
> "eşleşme yok" başarılı boş sonuçtur. `Wait-Stopped` ve toparlama aynı ölçümü kullanır; ölçülemeyen servise Start verilmez, takas/geri yükleme
> başlamaz. Aynı kök neden **B3** (`r27-rollback.ps1`) `Wait-Stopped`'unda da vardı ve aynı dar düzeltme uygulandı (B3 sha değişti). SEC-PORTAL-ADMIN-MSG-01
> kararı **koşullu** hale getirildi (§1.4, §8 W0-d).
> **R03-c (2026-09-30, canlı R27 sonrası; yalnız B3 `r27-rollback.ps1` + harness):** bağımsız incelemede doğrulanan B3 kusurları giderildi —
> B3H-1 (dinleyici okuma hatası `5-baslat` döngüsünü keserek WEB'i başlatmadan 13'e düşürüyordu), B3H-2 (13 kurtarma metni ölçümsüz
> "başlatıldı"), B3H-3 (durdurma hatasında WEB kapalı kalıyor, kurtarma satırı yok, servis durumu tek hatada kayboluyordu). Okuma hatası artık süreli
> yeniden ölçülür, sonunda **OLCULEMEDI** olur (KAPALI/AYAKTA sayılmaz); iki servisin başlatma girişimi ayrıdır; 13/21/22 metinleri yalnız ölçüme
> dayanır; B3'e yeni **22**. Test modu hata enjeksiyonu (`-Fault`, yalnız `-TestRoot`) + 16 B3 senaryosu (R03-d düzeltmesi: bu notta önce yanlışlıkla "6" yazıyordu). `r27-release.ps1` DEĞİŞMEDİ. Canlı rollback koşulmadı.
> **R03-d (2026-10-01; R03-c son baytlarının bağımsız incelemesi; yalnız B3 + harness):** iki major kusur doğrulandı ve giderildi —
> (1) koşum öncesi ölçüm tek atıştı: tek geçici okuma hatası, bu koşumun durdurduğu WEB'in toparlamada yeniden başlatılmamasına ve ölçümle
> çelişen "DURDURULMADI" metnine yol açıyordu → koşum öncesi ölçüm artık oturmuş ölçüm; durumu yine ölçülemeyen servise durdurma komutu
> verilmez. (2) Görevlerin 15 dakikalık zamanlanmış tekrar tetiği (tabandan beri var; canlı görev tanımı salt okuma ölçüldü) WEB'i API
> durdurma beklemesinde ya da takas sırasında yeniden başlatabilir ve B3 bu durumda 0 "TAMAMLANDI" verebiliyordu → takastan hemen önce iki
> servis yeniden KAPALI ölçülmeden (OLCULEMEDI dahil) dosyalara dokunulmaz (21/22); takas bitiminde KAPALI ölçülmeyen servis 0'ı engeller (13 + owner kararlı
> KURTARMA). KURTARMA "OWNER KARARI" notu eylem metnine değil ölçüme bağlandı; ölçüm satırı yokluğu ve iki test edilmemiş 13 dalı artık
> senaryoyla ölçülür. `r27-release.ps1` DEĞİŞMEDİ. Canlı rollback koşulmadı.

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
| D-5 | **ÖLÇÜLEMEYEN — kabul tamamlanmadı (2026-10-01)**: tek canlı koşum runId `00c96bd5`, çıkış 3, 21 PASS / 0 FAIL / 8 ÖLÇÜLEMEYEN; bu koşumun kapanışı PASS (P5-C4L/C4D hariç); kayıt ve teşhis `client-extacc-portal-d5-r01` §8. Paket: koşucu öz-testi 41/41 · QR öz-testi 23/23 · blok R04 94/94 ×2 kabuk | yeni deneme: `CLIENT-KALAN-ISLER-R01.md` §9 KP-1 (yeni GO + alıcı + tek gönderim onayı); owner kararları §10 |
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
| SEC-MAIL-LOG-01 | AÇIK — kısıtlı kayıt | D-5 canlı koşumunda alıcı adresi canlı API uygulama günlüğüne (kaynaktan doğrulandı) ve sağlayıcı kayıtlarına (ölçülmedi) düşebilir; ayrım D-5 onay metninde (R04); ayrıntı kısıtlı kayıtta |
| SEC-PORTAL-ADMIN-MSG-01 | **AÇIK** — kısıtlı kayıt; ayrıntı public repoya YAZILMAZ | **Karar özeti:** owner koşullu risk kabulüyle R27 yayınlandı (2026-09-30); önkoşul ölçümleri ve gerekçe kısıtlı kayıtta. Kayıt **giderilmedi**; ürün düzeltmesi ayrı iş + owner kararı (§10 K-11) |
| SEC-PORTAL-REQ-01 (2026-10-01) | **AÇIK** — kısıtlı kayıt; ayrıntı public repoya YAZILMAZ | Yayından SONRA kaydedildi; R27 yayını için verilen risk kabulünün kapsamında **değildir**. Etkilediği adım: portal giriş ve sıfırlama talebi uçları, D-5 yeni denemesi. Düzeltme ayrı PR'da (`CLIENT-KALAN-ISLER-R01.md` §7); merge edilmedi, canlıda değil |
| ClaimItem ACCRUES kullanıcı yolu (OFFICE authz notu) | AÇIK, ayrı iş | Adayda yok |
| #2830 eski PR gövdesi / commit `02276b68` geçmişi | owner kararı bekliyor (§10) | — |

### 1.5 Koşucular ve yayın bağımlılıkları

| Bileşen | Hazır? | Not |
|---|---|---|
| `r27-release.ps1` / `r27-rollback.ps1` / `r27-fault-prova.ps1` | Evet — **R03-d (B3): harness 53 senaryo, son baytlarla §6 "R03-d" bölümü** · R03-c: 42 senaryo (§6 "R03-c") · R02 tarihsel: hata provası harness'ı **18/18 PASS** (9 işlevsel + 9 kapı senaryosu, 344 assert; izole `-TestRoot` + simülatör) · canlı salt-okuma SelfTest **PASS** (yayın + geri alma; son baytlar) · sahte-süreç canlı kontrolleri A/B/C ölçüldü | §6 |
| `r27-dar-kabul.js` (B2, HTTP salt okuma) | Evet (öz-test 7/7) | DK-7 R26/R27 ayırt edici |
| D-5 koşucu + sahte API + öz-test + QR betiği + owner bloğu + blok öz-testi | Evet (koşucu öz-testi 41/41 · QR öz-testi 23/23 · blok öz-testi 90/90 ×2 kabuk) | canlı dist pini **R27**; QR `/portal/forgot-password` (yanlış yol reddedilir); dış origin canlı `.env` + owner R05 teyidi |
| D-8 sondası + öz-test | Evet (15/15) | canlıda koşulmadı; katman kanıt yoksa UNKNOWN |
| D-6/D-7 koşucu + sahte API + öz-test + owner bloğu + blok öz-testi | **Evet** (D-6 51/51 · blok 64/64 ×2 kabuk; D-7 41/41 · blok 58/58 ×2 kabuk) | canlı dist pini R27; W2 sonrası koşum |
| Pin güncelleme PR'ı (D-4/EXTACC/H5/C4 blokları `ExpLiveDist` → R27) | **#2838 MERGED `59620165`** (2026-09-30, B1 + B2 PASS sonrası) | §9 |
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
  5-baslat-web | 6-kapsam | 7-kanit`; geri alma `R-durdur | R-geri-yukle | R-dogrula | R-baslat`; takas öncesi durdurma hatasında `2-toparla`); kanıt JSON'unda `stage` (kanıt yazımından
  önceki son aşama), `failedAt`, `stages[]`.
- **Servisler durdurulduktan sonra her hata yolu** (takas/rename, kimlik okuma, servis başlatma, kapsam) → `Restore-All` (eklenenler karantinaya,
  değişenler yedekten, `.next` + cfg geri) → **geri yüklenen kimlik doğrulanır** (API ağaç == `A8B17A38`, 16 dosyalık paket == `B7FE81DB`,
  eklenen 6 dosya yok/karantinada, WEB `.next` == `C17E7B13`, BUILD_ID == `5waeMoFG`, cfg == `C43DEB5A`) → **yalnız PASS ise** eski servisler
  başlatılır ve B3 ile aynı sağlık kümesi ölçülür (dinleyici ==1, `/api/auth/me`/run-now/portal-cases 401, `/portal/login` 200,
  buildManifest(BID_LIVE) 200, süreç kökü RELEASE23, üçlü değişmedi). API sağlık tutmazsa **WEB adayla hiç başlatılmaz** (`failedAt=5-baslat-api`).
- **Durdurma ve başlatma hataları (R03):** her servis **ayrı** denenir ve ayrı kaydedilir (`Invoke-StopOne`: komut sonucu, bekleme sonucu, son ölçülen
  durum `KAPALI | CALISIYOR | KARISIK | OLCULEMEDI`); bir servisin istisnası diğerinin girişimini ya da kaydını engellemez. "Durdu" = komut istisnasız +
  bekleme PASS + ölçülen KAPALI. **Takas öncesi** (`2-durdur-*`) başarısızlıkta dosyalara dokunulmaz ve bu **ölçülür** (paket/BUILD_ID/cfg taban);
  `2-toparla`: her servis ölçülür, **yalnız KAPALI** ölçülen başlatılır (çalışan servise Start verilmez), sonra B3 sağlık kümesi ölçülür → iki servis
  PASS + üçlü değişmedi + dosyalar taban ise **21**, aksi halde **22** + servis bazında `KURTARMA:` satırları (B3 gerekmez). Kanıt: `stops`,
  `stopRecovery`, `serviceState` (servis bazında). **Geri alma `R-durdur`** aynı fonksiyonla: WEB istisnası API durdurma girişimini atlatmaz; biri
  kapanmazsa dosya geri yüklemesi yapılmaz (12; `rollback.stops`; `KURTARMA:` yalnız durdurulamayan servisi elle durdurmayı söyler, sonra B3).
  **Doğrulama sonrası başlatma** (`R-baslat`): servis bazında; bir servisin başlatma istisnası diğerini engellemez; "ayakta" yalnız sağlık kümesiyle
  (13; `rollback.postStart.{api,web}`; dosya durumu `verify`'de ayrı; `KURTARMA:` yalnız KAPALI ölçülen servise Start, B3 gerekmez). Canlı
  `Stop-/Start-ScheduledTask` çıktısı bastırılır (fonksiyon dönüş değerine karışmaz; simülatör bunu ölçemez).
- **Ölçüm hatası ≠ kapalı (R03-b):** `Get-Pids` yalnız `Get-NetTCPConnection`'ın "eşleşme yok" sonucunu (ObjectNotFound + `CmdletizationQuery_NotFound*`)
  boş sayar; yetki/CIM sağlayıcı/zaman aşımı gibi her başka hata ve `Get-HostProcCount`'taki CIM hatası **fırlatılır** → `Measure-Svc` `OLCULEMEDI`.
  `Wait-Stopped` artık doğrudan sorgu yapmaz, `Measure-Svc` ile yalnız **KAPALI ölçülürse** true döner; toparlama KARIŞIK/OLCULEMEDI servisi ≤30 sn
  yeniden ölçer, KAPALI olmazsa Start vermez. Sonuç: okuma hatasında durdurma doğrulanmaz → takas (2-durdur) ya da geri yükleme (R-durdur) başlamaz
  (22 / 12). B3 aynı kuralla (R03-c): `2-durdur-*`'da okuma hatası süreli yeniden ölçülür, sonunda OLCULEMEDI → durdurulmuş sayılmaz, dosyaya dokunulmaz → B3 toparlaması (21/22). SelfTest canlı **boş-sonuç yolunu** ölçer (dinlenmeyen
  port ve eşleşmeyen host argümanı 0 dönmeli; okuma hatası FAIL) — B1'de kapanan servisin "ölçülemedi" kalıp açılmaması riskine karşı ön kapı.
- **Kanıt yazımı `finally` içinde ve korumalı:** `HY_R27_RELEASE_EVIDENCE` yazılamazsa `%TEMP%\r27-evidence-fallback` + konsol; yükseltilmemiş
  (yanlışlıkla/parametresiz) koşum canlı kanıt dizinine **dosya bırakmaz** (yalnız `%TEMP%` fallback). Geri alma betiğinde yedek bütünlüğü ölçümü
  de korumalıdır (yedek dizini yok/okunamıyor → kanıt JSON yazılır, çıkış 20; kanıtsız çıkış yok).
- **Yol bütçesi kapısı** (`1-yedek`): WinPS 5.1 `Get-ChildItem`/`Get-FileHash` MAX_PATH (260) üzerini okuyamaz. Yedek/hazırlık/önceki-`.next`
  kökleri + ağaçtaki en uzun göreli yol (API 123, WEB 87 karakter) < 260 değilse DUR; marjlar kanıtta (`health.pathBudget`). Canlı için ölçülen
  (SelfTest 2026-09-29): `backupApi` 215 (marj 45) · `backupWebNext` 181 (79) · `stagedNext` 184 (76) · `preNext` 181 (79); `failedNext` 184 ·
  `rollbackFailedNext` 191 (dize hesabı). Harness aynı kapıyı ProvaRoot için koşar (uzun kökte 3 = ÖLÇÜLEMEDİ; inceleme bu tuzağı 262 > 260 ile ölçmüştü).
- **İzole test modu** `-TestRoot <dizin> [-Fault <ad>]`: tüm canlı yollar TestRoot altına bağlanır; yükseltme/görev/dinleyici/Http/boot-log/üçlü/
  ACL/sahte-süreç **simülatör** (`sim\state.json`). TestRoot canlı kökün altında/eşitse DUR; canlı modda `-Fault` DUR. 14 fault:
  `api-copy-interrupt | web-swap-fail | identity-read-error (geçici, tek sefer) | identity-read-persistent (kalıcı: R-doğrula da okuyamaz) |
  service-start-fail | restore-hash-mismatch | stop-fail (WEB kapanmaz → 21, Start verilmez) | stop-web-throw (→ 21) | stop-api-throw (→ 21) |
  stop-recovery-start-throw (→ 22) | rollback-stop-fail (→ 12) | rollback-start-throw (→ 13) | stop-measure-unreadable (→ 22) |
  rollback-measure-unreadable (→ 12)`. Rollback betiğinde de `-TestRoot`; doğrulamadan başlatma yok.
- **Simülatörün ölçmediği:** `.next` ACL kalıtımı, **canlı süreç listesi okuması** (`Win32_Process`), gerçek görev/Http gecikmeleri — bunlar yalnız canlı SelfTest/B0/B1'de
  ölçülür. Sahte-süreç **kararı** ise test modunda sentetik süreç listesiyle (`sim rogueProcs`) ve enjekte sağlayıcıyla ölçülür (aşağıdaki dört `gate-rogue-*` senaryosu).

**Çıkış kodları ve verdict'ler (`r27-release.ps1`):**

| Çıkış | Verdict | Anlamı | Owner eylemi |
|---|---|---|---|
| 0 | `YAYIN PASS` | aday canlıda, sağlık + kapsam tuttu | B2 |
| 10 | `ROLLBACK` | otomatik geri alındı, kimlik doğrulandı, eski servisler ayakta (B3 sağlık kümesi) | kanıt `rollback.reason`/`failedAt` okunur; yayın yok |
| 11 | `ROLLBACK-DOGRULANAMADI` | dosyalar geri yüklendi ama kimlik doğrulanamadı → **servis başlatılmadı**; `verify.mismatches` + B3 talimatı kanıtta | `KURTARMA:` satırları → B3 |
| 12 | `ROLLBACK-ENGELLENDI` | geri alma sırasında durdurma/dosya işlemi başarısız → servis başlatılmadı. Durdurma başarısızsa ya da **ölçülemezse** dosyalara **dokunulmaz** (canlı = aday) ve servis bazında durum `rollback.stops`'tadır (kapanmayan aday servis **çalışıyor olabilir**); dosya işlemi başarısızsa kalan adımlar `restoreSteps`'te | `KURTARMA:` → önce yalnız durdurulamayan servisi elle durdur, sonra B3 |
| 13 | `ROLLBACK-OK-ESKI-BASLAMADI` | geri alındı + doğrulandı (`verify.ok`) ama eski servis(ler) sağlık kümesiyle ayakta değil (başlatma istisnası dahil; servis bazında `rollback.postStart`) | `KURTARMA:` yalnız KAPALI ölçülen servise Start + sağlık; dosya işlemi ve B3 gerekmez; tutmazsa ESCALATE |
| 20 | `KAPIDA-DURDU` | ön kapı/aday/yedek/yol bütçesi aşamasında durdu; dosyalara dokunulmadı; servisler durdurulmadı | neden kanıtta |
| 21 | `DURDURMA-BASARISIZ` | WEB/API durdurulamadı; dosya takası başlamadı (ölçüldü); toparlama PASS — API ve WEB sağlık kümesiyle **ölçülerek** ayakta (Start yalnız KAPALI ölçülene) | neden kanıtta (`stops.<servis>`); giderilmeden yayın yeniden denenmez |
| 22 | `DURDURMA-BASARISIZ-TOPARLANAMADI` | durdurulamadı; dosya takası başlamadı; en az bir servis sağlık kümesiyle ayakta değil ya da ölçülemedi (yeniden başlatma istisnası dahil) | `KURTARMA:` servis bazında (yalnız KAPALI → Start; KARIŞIK/ölçülemeyen → önce ölç, sürece elle dokunma); B3 gerekmez |
| 1 | — | yalnız `-SelfTest` FAIL | B0 durur |

**Çıkış kodu eşlemesi — otomatik geri dönüş (`r27-release.ps1`) ≠ bağımsız B3 (`r27-rollback.ps1`):** aynı sayı iki betikte aynı olayı anlatmaz;
kanıt JSON'undaki `record` alanı (`R27-RELEASE-EXECUTION` / `R27-ROLLBACK-EXECUTION`) hangi betiğin yazdığını söyler. **R03-c'de B3 akışı değişti:**
okuma hatası süreli yeniden ölçülür (sonunda OLCULEMEDI); API/WEB başlatma girişimleri ayrıdır (birinin istisnası/okuma hatası diğerini atlatmaz);
durdurma hatasında bu koşumda durdurulup KAPALI ölçülen servis yeniden başlatılır ve ölçülür (21/22); 13/21/22 metinleri servis başına ölçülen duruma dayanır. **R03-d:** koşum öncesi ölçüm oturmuş ölçümdür (durumu ölçülemeyen servis durdurulmaz); takas yalnız takastan hemen önce iki servis yeniden
KAPALI ölçülürse başlar, aksi hâlde dosyalara dokunulmaz (21/22); takas bitiminde KAPALI ölçülmeyen servis varsa 0 verilmez (13).

| Kod | `r27-release.ps1` (B1; otomatik geri alma dahil) | `r27-rollback.ps1` (B3; elle geri dönüş) |
|---|---|---|
| 0 | `YAYIN PASS` (aday canlıda) | `ROLLBACK PASS` (taban canlıda, eski servisler ayakta, üçlü değişmedi) |
| 10 | `ROLLBACK`: otomatik geri alındı + doğrulandı + eski servisler ölçülerek ayakta | kullanılmaz |
| 11 | otomatik geri almada geri yüklenen kimlik doğrulanamadı → servis başlatılmadı → `KURTARMA:` → B3 | B3 geri yüklemesinden sonra kimlik doğrulanamadı → servis başlatılmadı → ESCALATE |
| 12 | otomatik geri almada durdurma (dosyaya dokunulmaz) ya da dosya işlemi başarısız → `KURTARMA:` → B3 | B3 dosya geri yüklemesi yarım kaldı → servis başlatılmadı → ESCALATE |
| 13 | otomatik geri alındı + doğrulandı, eski servis(ler) sağlıkla ayakta değil → yalnız KAPALI olana Start | B3 geri aldı + **doğruladı**; en az bir servis ölçümle ayakta değil / OLCULEMEDI, üçlü değişti ya da (R03-d) takas bitiminde bir servis KAPALI ölçülmedi → `KURTARMA:` servis başına (KAPALI → Start; OLCULEMEDI → önce ölç; CALISIYOR/KARIŞIK ama sağlıksız → sürece dokunma, ESCALATE; takas sırasında başlamış olabilecek servis → yeniden başlatma OWNER KARARI); B3 yeniden koşulmaz |
| 20 | kapı/aday/yedek/yol bütçesi; canlıya dokunulmadı; servisler durdurulmadı | yetki/yedek kimliği/yedek okunamadı/üçlü/.env; canlıya dokunulmadı |
| 21 | durdurulamadı, takas başlamadı, toparlama **ölçülerek** PASS | durdurulamadı ya da kapandığı **OLCULEMEDI** ya da (R03-d) takastan hemen önceki yeniden ölçümde bir servis KAPALI değil (zamanlanmış tetik); dosyalara dokunulmadı (**geri dönüş yapılmadı**); toparlama (R03-c) **ölçülerek** PASS — koşum öncesi çalışan ve bu koşumun durdurduğu (koşum öncesi oturmuş ölçümle; şimdi KAPALI; geç durma, toparlama karar ölçümünden önce gerçekleştiyse) servis yeniden başlatıldı, iki servis son ölçümde sağlık kümesiyle ayakta (canlı `.next` kendi BUILD_ID'siyle) → ESCALATE (durdurma nedeni) |
| 22 | durdurulamadı, takas başlamadı, toparlama tamamlanamadı → `KURTARMA:` (servis bazında) | (R03-c) durdurulamadı; dosyalara dokunulmadı; toparlama sonrası en az bir servis ayakta değil / OLCULEMEDI → `KURTARMA:` servis başına; B3 yeniden koşulmaz |
| 1 | yalnız `-SelfTest` FAIL | yalnız `-SelfTest` FAIL |

| Betik | sha256 |
|---|---|
| `r27-release.ps1` | `0A1570F0556904E7AD2463FFB97D0DA6E2D15CD14DAA797311F3F3FC05573E94` |
| `r27-rollback.ps1` | `A249B4DFD1FEF0BAC9090A8F532A51DE1F92C81AED5AAB5377B387CDD6589353` (R03-d; önceki `F6231D94…` R03-c, `DAEB5DEB…`) |
| `r27-fault-prova.ps1` (harness; canlıya dokunmaz) | `063B8D6F1467F1E35FFC7AE9A3B4AD663F4B60CCF1255F64CC704D0B536214BC` (R03-d; önceki `05790FAC…` R03-c, `6C9A2EF0…`) |
| `r27-dar-kabul.js` | `F077A8E40462F2F47A98AC27575F2D5EDBF2BB0C16328732CFF454324C09A4A6` |

Betik dizini (merge sonrası kanonik): `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\`.

**B0 — SelfTest + yayın öncesi taban ölçümü (normal pencere; salt okuma; DK-7 tek POST, yazma yok):**
```powershell
& { $ErrorActionPreference='Stop'; $d='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts'; $f="$d\r27-release.ps1"; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '0A1570F0556904E7AD2463FFB97D0DA6E2D15CD14DAA797311F3F3FC05573E94'){ throw 'R27 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -SelfTest; $rc=$global:LASTEXITCODE; 'SelfTest cikis=' + $rc; if($rc -ne 0){ throw 'SelfTest PASS degil - YAYIN BASLATILMAZ' }; $k="$d\r27-dar-kabul.js"; if((Get-FileHash -Algorithm SHA256 -LiteralPath $k).Hash -cne 'F077A8E40462F2F47A98AC27575F2D5EDBF2BB0C16328732CFF454324C09A4A6'){ throw 'DAR KABUL SHA UYUSMUYOR - DUR' }; $o="D:\Development\HUKUK_YAZILIMI\HY_R27_RELEASE_EVIDENCE"; New-Item -ItemType Directory -Force -Path $o | Out-Null; & node $k before "$o\dar-kabul-before-$((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))Z.json"; 'before cikis=' + $LASTEXITCODE; if($LASTEXITCODE -ne 0){ throw 'taban olcumu R26 davranisini gostermedi - DUR' } }
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
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\r27-release.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '0A1570F0556904E7AD2463FFB97D0DA6E2D15CD14DAA797311F3F3FC05573E94'){ throw 'R27 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'YAYIN cikis=' + $rc; if($rc -ne 0){ throw ('YAYIN PASS DEGIL (cikis ' + $rc + ') - KANIT JSON verdict/failedAt/recovery okunur: 10 ROLLBACK = otomatik geri alindi, eski servisler ayakta ; 11 ROLLBACK-DOGRULANAMADI / 12 ROLLBACK-ENGELLENDI = servis BASLATILMADI -> KURTARMA satirlari -> B3 ; 13 ROLLBACK-OK-ESKI-BASLAMADI = dosyalar dogrulandi, KURTARMA: yalniz KAPALI servise Start ; 20 KAPIDA-DURDU = dosyalara dokunulmadi ; 21 DURDURMA-BASARISIZ = takas baslamadi, servisler olculerek ayakta ; 22 DURDURMA-BASARISIZ-TOPARLANAMADI = takas baslamadi, KURTARMA satirlari (servis bazinda; B3 gerekmez)') } }
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
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r27-r01\scripts\r27-rollback.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'A249B4DFD1FEF0BAC9090A8F532A51DE1F92C81AED5AAB5377B387CDD6589353'){ throw 'R27 GERI ALMA BETIGI SHA UYUSMUYOR - DUR' }; $api='<api.backup>'; $web='<web.backup>'; if($api -like '<*' -or $web -like '<*'){ throw 'yer tutucu doldurulmadi - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web -SelfTest; if($global:LASTEXITCODE -ne 0){ throw 'yedek kimligi dogrulanamadi - GERI ALMA BASLAMAZ' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web; $rc=$global:LASTEXITCODE; 'GERI ALMA cikis=' + $rc; if($rc -ne 0){ throw ('GERI ALMA PASS DEGIL (cikis ' + $rc + ') - KURTARMA satirlari okunur: 11/12 = servis BASLATILMADI, ESCALATE ; 13 = dosyalar TABAN dogrulandi, servis basina olculen durum + adim (B3 yeniden kosulmaz) ; 20 = dosyalara dokunulmadi ; 21 = durdurulamadi ya da takastan hemen once KAPALI olculmedi, dosyalara dokunulmadi, servisler olculerek ayakta, ESCALATE ; 22 = durdurulamadi, dosyalara dokunulmadi, KURTARMA satirlari (servis basina)') } }
```

**R03-c — B3 (`r27-rollback.ps1`) dar düzeltmesi ve kanıtı (2026-09-30/10-01; R27 canlıdayken; canlı geri dönüş, servis durdurma/başlatma ve artefakt takası YAPILMADI).**

Giderilen doğrulanmış kusurlar (bağımsız inceleme, izole kopyalarda üretildi):

- **B3H-1:** Dinleyici okuma hatası `5-baslat` yoklamasını kesiyor, WEB'i başlatmadan 13 veriyordu. Artık okuma hatası süreli yeniden ölçülüyor. API'nin istisnası ya da okuma hatası WEB'in başlatma girişimini atlatmıyor.
- **B3H-2:** 13 kurtarma metni ölçümsüz "başlatıldı" diyordu. Artık servis başına son ölçüm ve komut sonucu yazılıyor.
- **B3H-3:** Durdurma hatasında WEB kapalı kalıyordu. Artık toparlama yapılıyor:
  - Yalnız koşum öncesi çalışan ve bu koşumun durdurduğu servis (geç durma dahil) yeniden başlatılıyor ve ölçülüyor.
  - Koşum öncesi kapalı ya da durumu bilinmeyen servise otomatik Start verilmiyor.
  - Sonuç 21 ya da 22 (yeni). Servis durumu kanıtta alan alan kaydediliyor.
- **İlk düzeltme turunun inceleme bulguları da giderildi:**
  - Toparlama kararı artık tek okuma hatasına dayanmıyor.
  - 0/13/21/22 kararları tüm adımlardan sonraki son ölçüme dayanıyor.
  - BUILD_ID okunamazsa sonuç `OLCULEMEDI`.
  - KURTARMA ölçüm satırları tek tek yapıştırılıp çalıştırılabiliyor (WinPS 5.1 ve PS 7). Okuma hatası "0" gibi görünmüyor; çıktı `OLCULEMEDI: …` olarak yazılıyor. Dinleyici satırı B3 ile aynı birimi, benzersiz PID'i sayıyor.
  - Çalışan ama sağlıksız servis için elle Stop/Start önerilmiyor; öneri ESCALATE.

`r27-release.ps1` (B1, otomatik geri dönüş) **değişmedi** (`0A1570F0…`).

| B3 senaryosu (`-Fault`, yalnız `-TestRoot`) | Beklenen → ölçülen | Ne kanıtlanır |
|---|---|---|
| b3-read-transient | 0 → 0 | Geçici dinleyici okuma hatası yeniden ölçülür; WEB yine başlar |
| b3-read-persistent | 13 → 13 | Kalıcı okuma hatası: iki servis de başlatma girişimi alır; sonuç `OLCULEMEDI`; KURTARMA "önce ölçün" |
| b3-api-start-throw / b3-web-start-throw | 13 → 13 | Bir servisin Start istisnası diğerini atlatmaz; KURTARMA yalnız kapalı servise Start |
| b3-api-crash-after | 13 → 13 | WEB başlarken API düşer; karar son ölçüme dayanır (eski "ayakta" ölçümüne değil) |
| b3-final-read-transient | 0 → 0 | Son ölçümde tek okuma hatası kısa yeniden ölçümle giderilir |
| b3-web-unhealthy | 13 → 13 | Çalışan ama sağlıksız WEB: elle dokunma yok, ESCALATE |
| b3-stop-api-fail / b3-web-stopthrow-api-fail / b3-toparla-read-transient / b3-web-late-stop | 21 → 21 | Bu koşumun durdurduğu WEB (istisnalı, geç duran ya da tek okuma hatalı) yeniden başlatılır ve ölçülerek ayakta; dosyalara dokunulmaz; "geri dönüş yapılmadı" |
| b3-stop-read-persistent / b3-api-down-before / b3-web-down-before / b3-toparla-web-crash / b3-stop-recovery-start-throw | 22 → 22 | Okunamayan ya da koşum öncesi kapalı servise otomatik Start yok. Başlatılıp düşen WEB için "yeniden başlatıldı" denmez. KURTARMA servis başına |
| gate-svc-measure (B3 canlı dal, sıralı sahte ölçüm) | — | `Wait-Stopped` / `Wait-SvcHealthy` / oturmuş ölçüm okuma hatasında gerçekten yeniden ölçer. Komut satırı okunamayan host 0 sayılmaz |
| gate-fault-live-mode (B3) | 20 → 20 | `-Fault` canlı modda ilk satırlarda reddedilir |

**Son baytlarla sonuçlar:**
- Tam harness, WinPS 5.1 çocuk kabuğu: **42/42 PASS**, 1082 assert (16 B3 senaryosu 504 assert). Özet `6DD1AA30DD43910830210D91B3EED7DD2FE4C5F08798D66C63135019E4E0ACD9`.
- B3 alt kümesi, PowerShell 7 çocuk kabuğu: **21/21 PASS**, 558 assert. Özet `366646F88AB9FC89E001A9573B84A4441B4F08F1D87CAD8A810EBA0B47C81E49`.
- Yeni B3'ün salt-okuma `-SelfTest`'i, B1'in bıraktığı gerçek yedeklerle: WinPS 5.1 ve PS 7'de **PASS**. Yedek kimliği ve üçlü `P1-SONRASI` doğrulandı; yazma yok.

**Negatif kontrol:** 10 mutantın **10'u yakalandı**. Her biri kendi hedef senaryosunda koştu ve gerçek assert FAIL'i verdi. Mutantlar:
- ölçümden bağımsız "yeniden başlatıldı" metni;
- final yerine eski bekleme ölçümü;
- koşum öncesi durum kuralının kaldırılması;
- operatör komutunda `-ErrorAction Stop` yokluğu;
- sağlıksız servise Stop+Start önerisi;
- geç durmanın sayılmaması;
- son ölçümün tek atış olması;
- kararın eski ölçümle verilmesi;
- toparlama kararının tek ölçümle verilmesi;
- okuma hatasının beklemeyi kesmesi.

Kanıt yerel ajan kanıt dizininde (`HY_R27_AGENT_EVIDENCE\b3-fix\`).

**İnceleme turları (korunur):**
- İlk düzeltme bağımsız incelemede üç mantık kusuru ve KURTARMA komutlarında üç kusur verdi.
- Yeniden doğrulama bir gerilemeyi (geç duran servisin yeniden başlatılmaması) ve dört test boşluğunu buldu.
- Hepsi giderildi ve yukarıdaki son koşumlarla ölçüldü.

**Sınırlar:**
- Simülatör gerçek görev ve Http gecikmelerini ölçmez.
- Canlı `Get-NetTCPConnection`'ın "eşleşme yok" kimliği yalnız sahte cmdlet'le ve betiklerin kendi FQID kuralıyla sınandı.
- Canlı B3 akışı koşulmadı (yalnız salt-okuma SelfTest).


**R03-d — R03-c son baytlarının bağımsız incelemesi ve dar düzeltme (2026-10-01; R27 canlıdayken; canlı geri dönüş, servis durdurma/başlatma ve artefakt takası YAPILMADI).**

R03-c son baytları (`F6231D94…`) 5 mercekli bağımsız incelemeden geçti. Her major bulgu ayrı bir doğrulayıcı tarafından çürütülmeye çalışıldı ve izole kopyada yeniden üretildi. Doğrulanan iki major kusur ve küçük bulgular giderildi; düzeltilmiş fark ikinci kez bağımsız incelendi (doğrulanmış blocker/major yok), o turun minor/nit bulguları da giderildi. Bu ikinci düzeltmenin kontrolü bir major daha buldu (yeni eklenen 11/12 metni, kimliği doğrulanmamış dosyalarla Start öneriyordu) ve giderildi: 11/12'de takas sonu satırı yalnız ölçüm + owner kararıyla durdurma der, Start önermez.

- **F1 (major; R03-c'de eklenen toparlamaya ait):** Koşum öncesi ölçüm tek atıştı. Tek geçici okuma hatası, çalışan ve bu koşumun durdurduğu WEB'i "durdurulmadı" sayıyordu. Toparlamada WEB başlatılmıyor (21 yerine 22), KURTARMA metni ölçümle çelişiyordu.
  - Artık koşum öncesi ölçüm oturmuş ölçümdür.
  - Durumu oturmuş ölçümle de OLCULEMEDI kalan servise **durdurma komutu verilmez**: durumu bilinmeyen servis durdurulmaz → 21/22, dosyalara dokunulmaz.
  - R03-c bölümündeki "toparlama kararı artık tek okuma hatasına dayanmıyor" ifadesi koşum öncesi ölçüm için eksikti; bu düzeltmeyle tamamlandı.
- **LS-1 (major; tabandan beri var, R03-c getirmedi):** Görevlerin 15 dakikalık zamanlanmış tekrar tetiği (canlı görev tanımı salt okuma ölçüldü) WEB'i API durdurma beklemesinde ya da takas sırasında yeniden başlatabilir. B3 bu durumda takası çalışan servisin altında yapıp 0 "GERİ DÖNÜŞ TAMAMLANDI" verebiliyordu. Artık:
  - takastan hemen önce iki servis yeniden ölçülür (`2-durdur-dogrula`); KAPALI ölçülmeyen varsa (OLCULEMEDI dahil) dosyalara dokunulmaz → toparlama (21/22);
  - takas bitiminde iki servis yeniden ölçülür; KAPALI ölçülmeyen servis varsa (OLCULEMEDI dahil) 0 verilmez → 13 + KURTARMA. 11/12 metninde de satır vardır ama orada dosya kimliği doğrulanmadığı için Start önerilmez.
  - KURTARMA satırı: "takas sırasında başlamış olabilir; yeniden başlatma OWNER KARARI". Yeniden başlatma ayrı adımlardır: önce Stop, ölçüm satırları KAPALI gösterene kadar bekleme, ancak sonra Start.
  - Kalıcı çözüm (görevleri durdurma süresince devre dışı bırakmak) kalıcı yapılandırma değişikliğidir; **owner kararı, bu işin kapsamı dışında**.
  - **Operatör notu:** B3'ü görev tetik dakikalarından (:00 / :15 / :30 / :45) uzak başlatın. Tetiğe denk gelen koşum güvenli biter (21 ya da 13), ama geri dönüş tamamlanmaz.
- **Minor/nit (kontrol turları):**
  - KURTARMA "OWNER KARARI" notu eylem metnine değil ölçüme bağlandı; OLCULEMEDI adımında da var.
  - KURTARMA ölçüm satırlarının yokluğu artık yakalanıyor: incelenen her servis için dört ölçüm türü (dinleyici/host/görev/HTTP) ayrı ayrı assert edilir.
  - 13'ün test edilmemiş dalları (üçlü değişti, üçlü okunamadı, kimlik sonrası beklenmeyen hata) senaryoya bağlandı. Beklenmeyen hata dalı artık tek atış değil, kısa süreli yeniden ölçer.
  - Metinler ölçülenle hizalandı: 0 mesajı yalnız ölçülen iki noktayı yazar; durdurma kapısı metni verilen komutu yazar; takas öncesi kapıdan düşen 21/22 nedeni `preSwap` olarak gösterilir; 11/12 metni "bu koşum servis başlatmadı" der.
  - "Koşum öncesi KAPALI servise otomatik Start yok" kuralı **toparlama** içindir. Başarılı geri yüklemeden sonra 5-baslat iki R26 servisini de başlatır (tasarım).
  - Diğer düzeltmeler: başlıktaki senaryo sayısı (6 → 16), 13 eşleme satırına ESCALATE dalı, okunamayan üçlü için "OKUNAMADI", operatör HTTP sondasının tek uç olduğu notu, harness yorumu, R27 risk tablosundaki SEC-MAIL-LOG-01 satırı (D-5 R04 ayrımıyla hizalandı).

| B3 senaryosu (R03-d; `-Fault`, yalnız `-TestRoot`) | Beklenen → ölçülen | Ne kanıtlanır |
|---|---|---|
| b3-before-read-transient | 21 → 21 | Koşum öncesi ölçümde tek okuma hatası oturmuş ölçümle giderilir; bu koşumun durdurduğu WEB yeniden başlatılır |
| b3-stop-read-persistent / b3-api-down-before | 22 → 22 | Koşum öncesi durumu ölçülemeyen WEB'e durdurma komutu verilmez (stop=0; WEB çalışır kalır); OLCULEMEDI adımı OWNER KARARI notunu taşır |
| b3-trigger-before-swap / b3-trigger-before-swap-api | 21 → 21 | API durdurma beklemesinde tetik WEB'i ya da API'yi başlatır → takas öncesi yeniden ölçüm, dosyalara dokunulmaz; bu koşumun durdurduğu diğer servis yeniden başlatılır |
| b3-gate-read-persistent | 21 → 21 | Takas öncesi yeniden ölçümde OLCULEMEDI KAPALI sayılmaz; dosyalara dokunulmaz |
| b3-trigger-during-swap / b3-swapend-read-persistent | 13 → 13 | Takas sırasında başlayan ya da takas sonunda ölçülemeyen WEB → 0 verilmez; "TAMAMLANDI" yok; KURTARMA owner kararlı |
| b3-tuple-changed / b3-tuple-unreadable | 13 → 13 | Üçlü değişti / okunamadı → KURTARMA Kapsam satırı (DEĞİŞTİ / OKUNAMADI) |
| b3-unexpected-after-kimlik | 13 → 13 | Kimlik sonrası beklenmeyen hata (WEB başlatılmadan) → ölçüme dayalı metin; WEB KAPALI ölçülür, Start adımı; başarı iddiası yok |
| b3-swap-trigger-kimlik-fail | 11 → 11 | Takas sırasında tetik + kimlik FAIL → servis başlatılmaz; KURTARMA takas sonu satırı yalnız ölçüm + owner kararıyla durdurma, Start önermez |
| b3-web-down-toparla-unreadable | 22 → 22 | Koşum öncesi KAPALI WEB; toparlama kararı OLCULEMEDI, son ölçüm KAPALI → Start adımı OWNER KARARI notuyla |
| b3-web-down-before | 22 → 22 | Eylem metni ölçülene dayanır ("koşum öncesi CALISIYOR ölçülmedi; durdurma komutu=VERILDI") |

**Son baytlarla sonuçlar (B3 `A249B4DF…`, harness `063B8D6F…`, B1 `0A1570F0…` değişmedi):**
- Tam harness, WinPS 5.1 çocuk kabuğu (tek başına koşu): **53/53 PASS**, 1473 assert (27 B3 senaryosu 895 assert). Özet `E120F55AB38432E1F8C3FE0C2C78DF5FEEF5EEBC5A91509FF2E558342592BC96`.
- İlk tam koşu (korunur; üç koşu + mutantlar + inceleme paralelken): **52/53** — `b3-gate-read-persistent` çocuk süreçte yedek özeti alınırken `OutOfMemoryException` aldı. Betik kapıda durdu (çıkış 20, dosyalara dokunulmadı); test ortamı kaynaklı, betik kusuru değil. Özet `9B3F5BC439DD53DBC74F52EAB77CECB898252E6E7EDA1263DDCF4BF909049320`.
- B3 alt kümesi, PowerShell 7 çocuk kabuğu: **32/32 PASS**, 949 assert. Özet `0488B15F6AFF0DCEAD774E869FC6E9E9D2C303602A1057244ED5333A9A11640A`.
- Yeni B3'ün salt-okuma `-SelfTest`'i gerçek yedeklerle: WinPS 5.1 ve PS 7'de **PASS**. Kanıt dizini dosya sayısı önce/sonra aynı (yazma yok).
- Ara bayt kanıtı korunur: ilk R03-d baytları (`6CCB7971…`) 48/48 (WinPS 5.1), 27/27 (PS 7), 19/19 mutant; ikinci tur baytları (`9825DCC3…`) hedefli 8/8 — o turun tam koşusu, kontrolün bulduğu major yüzünden yarıda durduruldu ve son baytlarla yeniden koşuldu.

**Negatif kontrol:** 27 mutantın **27'si yakalandı**; her biri kendi hedef senaryosunda koştu ve gerçek assert FAIL'i verdi (rc=2). R03-c'nin 10 mutantı son baytlara göre yeniden üretildi; 17 yeni mutant R03-d kurallarını bozar:
- koşum öncesi ölçümün tek atış olması; durumu bilinmeyen servise durdurma verilmesi;
- takas öncesi kapının uygulanmaması, OLCULEMEDI'yi KAPALI sayması ya da API dalını atlaması;
- takas sonu ölçümünün kararı etkilememesi ya da OLCULEMEDI'yi KAPALI sayması;
- OWNER KARARI notunun eylem metnine bağlanması ya da OLCULEMEDI adımından düşmesi;
- KAPALI adımında ölçüm satırlarının olmaması; üçlü değişiminin kararı etkilememesi; okunamayan üçlünün "DEĞİŞTİ" yazılması;
- beklenmeyen hata dalında başarı metni ya da ölçümsüz AYAKTA;
- 11/12 metninin Start önermesi; 21 nedeninin takas öncesi ölçümü göstermemesi; owner yeniden başlatma sırasının bozulması.

**Yeniden inceleme:** R03-d farkı üç tur bağımsız kontrol edildi (her turda major iddiaları ayrı doğrulayıcıyla çürütülmeye çalışıldı):
- Tur 1 (3 mercek): doğrulanmış blocker/major yok; minor/nit'ler giderildi.
- Tur 2: 1 major doğrulandı (11/12 metni kimliği doğrulanmamış dosyalarla Start öneriyordu) ve giderildi.
- Tur 3: doğrulanmış blocker/major yok. Açık kalan minor'lar Sınırlar'dadır.

Kanıt yerel ajan kanıt dizininde (`HY_R27_AGENT_EVIDENCE\b3-fix-r03d\`; R03-c kanıtı `b3-fix\` değiştirilmeden durur).

**Sınırlar:**
- Simülatör gerçek zamanlanmış görev ve HTTP gecikmelerini ölçmez; tetik davranışı simülatörde enjekte edilir.
- Toparlama karar ölçümünden SONRA kapanan servis yeniden başlatılmaz (dürüst 22 + KURTARMA Start adımı).
- Oturmuş koşum öncesi ölçümün son okuması hataya denk gelirse sonuç OLCULEMEDI olur ve servis durdurulmaz (güvenli yön; 21/22).
- Takas bitiminden sonra ama başlatmadan önce tetiklenen servis (dosyalar zaten TABAN) 13'e düşmez; takas sırasında başlayan servis 13'e düşer (güvenli yön).
- 13'te "takas sonu KAPALI ölçülmedi + son ölçümde servis ayakta değil" hücresi uçtan uca senaryosuzdur; KURTARMA metni fonksiyon düzeyinde (1666 girdi bileşimi, WinPS 5.1 + PS 7) doğru bulundu.
- 12'de takas yarıda kalırsa KURTARMA servis durumunu yazmaz; kanıt JSON `serviceState` alanına bakılır.
- 13 takas sonu satırı servisin son ölçüm durumunu tekrar etmez; son ölçüm aynı metnin servis satırındadır.
- Canlı B3 akışı koşulmadı (yalnız salt-okuma SelfTest).


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

**R03 hata provası (2026-09-30; Linux izole provası — yukarıdaki R02 tablosunun yerine GEÇMEZ):** bu turun ortamı bulut Linux konteyneriydi;
gerçek canlı taban kopyası (`A8B17A38`, 3867 dosya), aday dist (`HY_WT_R27`), `robocopy` ve WinPS 5.1 **yoktu**. Bu yüzden harness **pwsh 7.4.6 / Linux** ile,
**sentetik** taban/aday ağaçlarıyla (47 dosya; digest'ler yayın betiğinin kendi `Get-Map`/`Get-TreeDigest`/`Get-PackageDigest` fonksiyonlarıyla hesaplandı) ve
betik kopyalarında **yalnız 64-hex pin literalleri** sentetik değerlerle değiştirilerek koşuldu (kopya ↔ gerçek dosya: 64-hex maskelendiğinde bayt bayt eşit,
üç betik için ölçüldü); `robocopy.exe` / `powershell.exe` yerine koşum-yerel kabuk sarmalayıcıları. Kapı zinciri bütünlük pinleri Linux pwsh'ta HEAD baytlarında
41/41 birebir üretildi (yani burada hesaplanan pinler Windows'taki ölçümle aynı yöntemdir); yeni baytlarda yalnız fonksiyon kümesi (46 → 52), SelfTest bloğu
ve mod envanteri değişti — 15 kapı fonksiyonu, `ROGUE_*` atamaları, 0-kapılar kesiti, çağrı konumları ve `exit` konumları **değişmedi**.

| Senaryo | Beklenen → ölçülen | `failedAt` / `stage` | Dosya (TestRoot) | Simülatör servis | Kurtarma | Assert |
|---|---|---|---|---|---|---|
| stop-fail | 21 → 21 `DURDURMA-BASARISIZ` | `2-durdur-web` / `2-toparla` | taban; takas başlamadı (paket/BUILD_ID/cfg ölçüldü) | API+WEB ayakta; **Start verilmedi** (WEB çalışıyor ölçüldü; 1 durdurma, 0 başlatma) | yok | 32 |
| stop-web-throw | 21 → 21 | `2-durdur-web` / `2-toparla` | taban | WEB komut istisnası + KAPALI ölçüldü → başlatıldı → sağlık PASS; API hiç durdurulmadı (1/1) | yok | 32 |
| stop-api-throw | 21 → 21 | `2-durdur-api` / `2-toparla` | taban | WEB durdu; API komut istisnası, çalışıyor → Start yok; WEB başlatıldı → ikisi sağlık PASS (2/1) | yok | 32 |
| stop-recovery-start-throw | 22 → 22 `DURDURMA-BASARISIZ-TOPARLANAMADI` | `2-durdur-api` / `2-toparla` | taban | API ayakta; WEB başlatma istisnası → **WEB KAPALI** (2/1) | **var**: yalnız WEB'e Start; B3 yok | 35 |
| rollback-stop-fail | 12 → 12 `ROLLBACK-ENGELLENDI` | `5-baslat-web` / `R-durdur` | **aday** (`E28A6863`-karşılığı; 6 eklenen VAR); karantina YOK — geri yükleme yapılmadı | aday WEB çalışıyor (komut istisnası); API **yine denendi** ve durdu (4/2) | **var**: yalnız WEB elle durdur + B3 | 26 |
| rollback-start-throw | 13 → 13 `ROLLBACK-OK-ESKI-BASLAMADI` | `4-kimlik` / `R-baslat` | taban; `verify.ok`; karantina var | API başlatma istisnası → KAPALI; WEB **yine başlatıldı** → sağlık PASS (2/2) | **var**: yalnız API'ye Start; B3 yok | 27 |

Tam koşu (23 senaryo) Linux'ta **20/23** (499 assert): 18 işlevsel + 5 kapı senaryosu PASS. Düşen 3 kapı senaryosu (`gate-testroot-under-live`: `C:` sürücüsü yok;
`gate-rogue-classifier`: Windows yol anlamlı güvenilir-dizin mutasyonu; `gate-rogue-wiring` canlı dal: `WindowsPrincipal` yok) HEAD baytlarıyla aynı ortamda
**aynı assert'lerle** düşüyor (HEAD: 15/18; düşen assert kümeleri birebir eşit) → platform farkıdır, bu değişikliğin sonucu değildir; bu üç senaryo yalnız Windows'ta
ölçülür. **Negatif kontrol (tek mutant):** eski koşulsuz `21` + "servisler yeniden başlatıldı" satırı geri getirildiğinde stop senaryolarının **4/4**'ü FAIL
(35 assert); `stop-web-throw`/`stop-api-throw`'da "simülatör WEB AYAKTA: FAIL (webRunning=False)" + "ölçülmemiş yeniden başlatma iddiası" — raporlanan hata
birebir yakalanır. **Bu turda koşulmayan (açık):** gerçek taban kopyası + aday dist ile **WinPS 5.1** harness'ı (23 senaryo) ve yayın betiğinin yeni sha'sıyla canlı
salt-okuma SelfTest A/B/C kontrolleri (§8 W0; owner makinesinde).

**R03-b ek provası (aynı Linux yöntemi, son baytlar):** `stop-measure-unreadable` 22 → 22 (WEB durdurma etkili ama `:3002` okuması hata →
`OLCULEMEDI`; takas yok, WEB'e Start yok, 1 durdurma/0 başlatma; `KURTARMA:` önce ölçüm, Start yok) · `rollback-measure-unreadable` 12 → 12 (R-durdur'da aynı okuma
hatası → geri yükleme yok, karantina yok, canlı = aday) · `gate-svc-measure` (süreç koşmaz; yayın + B3 canlı dal ölçüm fonksiyonları sahte cmdlet'lerle): gerçek
boş → 0/KAPALI/Wait true; TCP yetki hatası, ObjectNotFound kategorili ama başka kimlikli hata ve CIM hatası → `OLCULEMEDI`/Wait false; B3 `Wait-Stopped`
okuma hatasında fırlatır; **duyarlılık:** eski `SilentlyContinue` biçimi aynı girdilerde KAPALI + Wait true verir. Tam koşu **23/26**; düşen 3 kapı senaryosu
yine HEAD ile aynı assert'ler (Windows'a özgü). Canlı `Get-NetTCPConnection`'ın "eşleşme yok" hata kimliği burada sahte cmdlet'le taklit edildi; gerçek
davranış SelfTest'in boş-sonuç ölçümüyle (W0-b) doğrulanır.

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
(B0'ın parçası). Geri alma sırasında (R-durdur) durdurma başarısızlığı (12) ve doğrulama sonrası başlatma istisnası (13) R03'te `rollback-stop-fail` /
`rollback-start-throw` senaryolarıyla **Linux izole provasında** ölçüldü; aynı senaryoların gerçek taban + WinPS 5.1 koşumu §8 W0'dadır.
Simülatör `.next` ACL kalıtımını ve gerçek görev/Http gecikmelerini ölçmez. Canlı süreç listesi okuması harness'ta ölçülmez; yalnız canlı SelfTest
(A/B/C kontrolleri, B0, B1) ölçer.

## 7. Yayın sonrası — kalan kabullerin sırası

1. Bu paketin PR'ı (#2837) merge → `main` senkron (owner blokları pinleri `main` checkout'undan okur).
2. **Y1** owner GO → B0 → B1 → B2 (§6).
3. Pin güncelleme PR'ı (#2838; §9) merge → main senkron. **(1–3 TAMAM, 2026-09-30.)**
4. **D-5** (`client-extacc-portal-d5-r01`): Preflight (salt okuma; R27 dist pini; adres sorulmaz) → QrTest (owner R05 portal adresini konsola yazar; canlı `.env` ile eşleşmeli) → **Run** (Y3: R05 adres teyidi + alıcı adresi + tek gönderim onayı + GO). Çıkış 5/6 Recover yetkisi değildir; Recover yalnız kanıt incelemesi sonrası ayrı owner onayıyla. **(2026-10-01: bir kez koşuldu, çıkış 3 — kabul değil; D-5 paketi §8.)**
5. **D-8** makine sondası (`d8-staff-surface-probe.js`; dış origin canlı `.env`'den salt okuma, yer tutucu yok) + telefon listesi beyanı.
6. **D-6** (`client-extacc-portal-d6-r01`) ve **D-7** (`client-extacc-portal-d7-r01`) canlı koşumu — her biri Preflight → QrTest → Run → gerekirse Recover, ayrı GO.
7. Birleşik D-9 ölçümü (`client-extacc-d8-staff-surface-r01` §6 bileşen → ölçüt tablosu) ve kayıt PR'ı.

## 8. Kalan iş listesi (bağımlılık sırası)

| # | İş | Bağımlılık | Durum |
|---|---|---|---|
| W1 | Bu paket PR'ı (#2837; docs + betikler) merge | owner onayı + CI/CodeQL yeşil + `main` CI boş | **TAMAM** — `429a0f5b` |
| W0 | R03/R03-b dar düzeltme PR'ı (#2849) | (a) harness 26/26 iki kabuk · (b) canlı salt-okuma SelfTest · (c) owner incelemesi + merge · (d) kısıtlı önkoşullar | **TAMAM** — (a) WinPS 5.1 26/26 + PS7 26/26 (ilk V1 kaydı FAIL korunur; birleşik inceleme) · (b) V2 PASS (A/B negatif kontrolleri koşulmadı) · (c) MERGED `32927399` · (d) kısıtlı kayıtta; ayrıntı `record/R27-LIVE-RECORD-R01.md` §3 |
| W2 | R27 yayını B0→B2 | W0 + W1 + owner GO Y1 | **TAMAM** — B0 PASS · B1 `YAYIN PASS` 18:03:46Z · B2 8/8 (`record/R27-LIVE-RECORD-R01.md`) |
| W3 | Pin güncelleme PR'ı (#2838) | W2 (canlı dist R27) | **TAMAM** — MERGED `59620165` (B1 + B2 PASS sonrası) |
| W4 | D-5 canlı kabul | W2, W3 + §10 D-5 kararları + GO | **AÇIK** — bir kez koşuldu (runId `00c96bd5`, 2026-10-01): çıkış 3 ÖLÇÜLEMEYEN, kabul değil; yeni deneme `CLIENT-KALAN-ISLER-R01.md` §9 KP-1 |
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
| Y1 | R27 canlı yayın GO'su (B0 → B1 → B2) | **VERİLDİ ve kullanıldı (2026-09-30)**; yeniden sorulmaz | W2 | — |
| K-2 | D-5 alıcı e-posta adresi | owner konsola girer (repoya/rapora/kanıta yazılmaz) | D-5 Run anında | D-5 için evet |
| K-3 | D-5 gerçek gönderim | plan **1** e-posta; ek talep = ek gönderim, onaysız yapılmaz | D-5 Run anında (konsolda "GÖNDER") | D-5 için evet |
| K-4 | D-5 kapanışında alıcı adresi sentetik hesapta `.invalid` ile ezilsin mi | E / H | D-5 Run/Recover anında | hayır (her iki seçenek de koşulur) |
| K-5 | #2830 eski PR gövdesi + `02276b68` commit geçmişi | geçmişi yeniden yaz / olduğu gibi bırak | herhangi bir zaman | hayır |
| K-6 | K3/OFFICE kapsamı ve 3 migration'ın yayın zamanı | R27 sonrası ayrı aday | R27 sonrası | hayır |
| K-7 | D-6 belge onay/ret akışının canlı kabulü (koşucu `approve/reject` uçlarını bilinçli çağırmaz) | ayrı paket iste / D-6 kapsamıyla yetin | D-6 GO'sundan önce | hayır |
| K-8 | D-7 sonrası sentetik tenantta kalan mesaj/bildirim satırları | "saklandı" kaydıyla kabul (önerilen; ürün silme ucu yok) / elle DB silme (önerilmez) | D-7 GO'sundan önce | D-7 kapanış ifadesi için evet |
| K-11 | SEC-PORTAL-ADMIN-MSG-01 ürün düzeltmesi (kısıtlı kayıt) | yetki kuralını belirle + ayrı yama / ertele | herhangi bir zaman | yayın için hayır (owner koşullu risk kabulü, 2026-09-30); kayıt açık kalır |
| K-12 | Hizmet kabulü imza metni ön koşulları: B-2 (H1), KB-03 / H2-10 (H2), H4-08 gerçek yayın ayağı (H4), H7-05b · K-1 · PSUS (H7) | her kalem: "kabul dışı / sonraki iş" ya da ayrı karar | hizmet kabulü imzasından önce | hizmet kabulü için evet |
| K-13 | H5 ayrı hizmet-kabulü satırı (B-I11-2 hükmü) | hüküm ver | H5 hizmet kabulünden önce | H5 hizmet kabulü için evet |
| K-14 | Sahte-süreç deseninin **eski paket** koşucu adlarına genişletilmesi (R25–R26 yayın/geri alma/kabul, H5 sahte-API/owner/pin, İ1x owner blokları, İ3 koşucu/başlatıcı, C4 canlı, T-pencere adları) | genişlet (ayrı küçük değişiklik + envanter testi + yeniden inceleme) / mevcut kapsamla yetin (taban sürümle **aynı** sınır; B0/B1 ön koşulu "pencerede başka koşum yok") | Y1'den önce | hayır (kapı tabandan gevşek değil; genişletme bu talimatın "yalnız yanlış pozitifi düzelt" kapsamını aşar) |
| K-15 | Yalnız okuyan izleme görüntüleyicilerinin (`tail`, `findstr` vb.) kapıdan muaf tutulması | muaf tutma — mevcut davranış: DUR (önerilen) / muaf tut (ayrı değişiklik + yeniden inceleme) | isteğe bağlı | hayır |
| K-16 | FRK-1 (`record/R27-LIVE-RECORD-R01.md` §6; yayın betiğinin 21/10 kararı) dar düzeltmesinin önceliği | sonraki yayından önce düzelt (ayrı PR + izole harness + yeni sha ile canlı SelfTest GO'su) / ertele | sonraki yayın adayından önce | sonraki yayın için evet |
| K-17 | LS-1 (§6 R03-d) kalıcı çözümü | uygula (ayrı iş) / B3 kapılarıyla yetin (mevcut: tetik dakikalarına denk gelen koşum güvenli durur, geri dönüş tamamlanmaz) | herhangi bir zaman | hayır |

Karar **gerektirmeyenler** (teknik olarak kapatıldı, bilgi): D-7 kapsam dışı `caseId` için ürün **400** döner ve tanım buna göre güncellendi (`client-extacc-d8-staff-surface-r01` §5);
D-7 Recover'ın dist değişiminden etkilenmesi yalnız o durum oluşursa ele alınır; yayın kanıt dizinindeki 6 adet inceleyici kaynaklı `KAPIDA-DURDU` kaydı tarihsel
not olarak yerinde durur (silinmesi istenirse owner yapar). H1–H8 kalemlerinin kaynak atıfları `H1-H8-ACIK-OLCUTLER-R01.md` içindedir; sayaç **0/8** değişmedi.

## 11. Uygulama sırası — başarı ve durma ölçütleri

| Adım | Başarı | Durma |
|---|---|---|
| PR merge (#2837) | owner onayı + main CI/CodeQL SUCCESS merge SHA'sında; `gh run list --branch main` boşken merge | CI FAIL / başka merge koşuyor / onay yok |
| B0 | SelfTest PASS (WinPS 5.1), `before` çıkış 0; ön koşul: makinede ajan oturumu/harness/öz-test/inceleme koşmuyor, blok etkileşimli pencereye yapıştırıldı | herhangi bir kapı; sahte-süreç listesi boş değil (izleme dahil); tarama kendi sürecini göremedi |
| B1 | `YAYIN PASS`; API `E28A6863`, WEB `B2DEE365`/`W2UQpBPD` | 10/11/12/13/20/21/22 (§6 tablo + eşleme); 11/12 → B3; 13/22 → servis bazında `KURTARMA:` (B3 gerekmez) |
| B2 | çıkış 0 (DK-1…DK-8) | DK-7 FAIL → davranış gelmedi → B3 değerlendirilir |
| Pin PR (#2838) | D-4/EXTACC/H5/C4 Preflight'ları R27 dist ile PASS | pin uyuşmazlığı |
| D-5 | Run çıkış 0 + owner beyanı; tek kullanım yalnız makine gözlemi PASS **ve** owner beyanı "formu gönderdim, reddedildi" ise doğrulanmış sayılır | 3 = ölçülemeyen (kabul değil); 5/6 → önce kanıt incelemesi, Recover yalnız ayrı owner onayıyla (D-5 R04); ürün bulgusu |
| D-8 | sonda çıkış 0 + telefon beyanı 5/5 "E" | herhangi bir 403-dışı ret |
| D-6 / D-7 | Run çıkış 0 + owner beyanı | 3 = ölçülemeyen; 5/6 → önce kanıt incelemesi, Recover yalnız ayrı owner onayıyla (blok metinleri R02 PR'larında: `CLIENT-KALAN-ISLER-R01.md` §7); ürün bulgusu |

Bu revizyon commit edildiğinde #2837 head SHA'sı değişir; güncel head SHA'ları ve uygulama sırası kanıt paketindeki `PR-HEADS-AND-ORDER.json` dosyasında ve PR açıklamasındadır
(belge kendi commit SHA'sını içeremez). Aday SHA (`1b758d29`) **değişmedi** — ürün kaynağına bu turda dokunulmadı; değişen yalnız governance belgeleri ve betikleridir.

## 12. Şeffaflık ve sınırlar

- Bu turlarda canlıya giden istekler: yalnız SelfTest'in kimliksiz GET'leri (`/api/auth/me`, `/portal/login`, web `/api/auth/me`), canlı dosya/ACL/süreç listesi **okuması** ve canlı DB'ye salt okuma migration sorgusu. Yazma yok; e-posta yok; servis yeniden başlatılmadı; canlıda hata enjeksiyonu yapılmadı.
- SelfTest kontrollerinde başlatılan yardımcı süreçler (uyuyan bir `node` betiği, bir `tail`) kontrol betiğince kapatıldı; canlı servislerle ilgileri yoktur.
- `HY_WT_R27`, `HY_WT_R26`, disposable veritabanı konteynerleri, hata provası kökleri ve checkpoint dizini **silinmez**.
- Sahte API'ler ürünün kendisi değildir; ürünün hız sınırı, gönderim, kova/ACL ve yetki davranışı yalnız canlıda ölçülür.
- D-5'te e-posta **teslimi** ölçülmez: token üretimi, SMTP kabulü ve posta kutusuna teslim ayrı olaylardır; yalnız owner beyanı vardır.
- D-8'de `Server`/sağlayıcı başlıkları ve gövde imzası katman **ipucudur** (`layerHint`); sondada kesin katman kanıtı yoktur, `layer` = **UNKNOWN**; bu
  ret ölçümünü başarısız saydırmaz. Boş 403 gövdesi ipucu da değildir. Ham request-target korunur (öz-testte kenarın gördüğü yolla birebir).

## 13. R02 kanıt paketi, inceleme turları ve açık kalan bulgular

**Kanıt dizini (yerel, repo dışı):** `Documents\CLIENT-EVIDENCE-20260911\r27-package-r02-20260929\` (kullanıcı profiline göreli). **R02 arşivi
(`R27-R02-INCELEME-PAKETI-20260930.zip`) ve tarihsel FAIL kayıtları R03'te DEĞİŞMEDİ.** R03 için ayrıca yalnız son dosyaları, dar diff'i ve Linux izole
sonuçlarını içeren **küçük inceleme ZIP'i** üretildi (ad + sha256 teslim raporunda; kısıtlı değerlendirme metni ZIP'e **girmez**).

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

**Açık engeller (2026-10-01 güncellemesi):** yayın yapıldı (Y1 kullanıldı). D-5 bir kez koşuldu ve kabul tamamlanmadı; yeni D-5 denemesi, D-6/D-7/D-8 koşumları ve birleşik D-9 ayrı owner
kararlarıdır (`CLIENT-KALAN-ISLER-R01.md`). Kısıtlı kayıtlar (§1.4) açıktır ve bu paketle giderilmez. H1–H8 hizmet kabulü **0/8**'dir.
