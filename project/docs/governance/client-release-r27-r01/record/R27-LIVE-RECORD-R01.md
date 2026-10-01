# R27 — CANLI YAYIN KAYDI (B0 → B1 → B2) · 2026-09-30

| alan | değer |
|---|---|
| Dayanak | Owner GO'su (Y1) ve owner talimatı, 2026-09-30. Yöntem: `../R27-RELEASE-PACKAGE-R01.md` §6 (B0/B1/B2 blokları, sha pinli) |
| Rol | **Owner** B0/B1/B2'yi kendi Windows PowerShell pencerelerinde koştu (B1 yükseltilmiş). **Bu kaydı** yerel Claude Code oturumu yazdı; kanıt dosyalarının SHA256'sını bağımsız yeniden hesapladı ve içeriklerini salt okudu. Ajan B0/B1/B2'yi **yeniden koşmadı**; canlıda servis/dosya/yapılandırma değiştirmedi |
| Sonuç | **R27 CANLIDA.** B0 PASS · B1 `YAYIN PASS` (çıkış 0) · B2 dar kabul **8/8 PASS** |
| Kapsam | **B**: canlı R26 tabanı + dar D-5 düzeltmeleri. Migration **0**. `.env` ve başlatıcı üçlüsü **değişmedi** |
| Açık kalanlar | Güvenlik kayıtları **AÇIK** (§5; yayın için owner risk kabulü bulguların giderildiği anlamına gelmez) · D-5/D-6/D-7 canlı kabulü, D-8 sondası ve birleşik D-9 **koşulmadı** · H1–H8 hizmet kabulü **0/8** (değişmedi) · B3 geri dönüş betiğinde inceleme bulguları (§6) |

Kaynak ayrımı: **[O]** = owner'ın paylaştığı çıktı/beyan · **[A]** = bu kaydı yazan ajanın kendi ölçümü (hash yeniden hesabı, kanıt JSON'unun salt okunması, GitHub durumu).

## 1. Canlı kimlik

| | Önce (R26) | Sonra (R27, canlı) | Kaynak |
|---|---|---|---|
| Ürün kaynağı | `c7a154b3` | **`1b758d29c45033311c8c2c0ea598619d6bba13a0`** (`release/r27-candidate`) = `c7a154b3` + #2830 (`f8f1b013`) + #2832 (`b84919ad`) + `common/trust-proxy.config.ts` test yardımcısı | [A] kanıt JSON `sourceSha`/`prs` |
| API `dist/apps/api/src` | `A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0` | **`E28A6863CF109A1A3AE1F53E096D5F5C2037E382EF2D8D3EC87FEE3B827E5134`** (6 eklenen dosya canlıda) | [A] `health.identityAfterSwap`, `health.scope` |
| WEB `.next` | `C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326` · BUILD_ID `5waeMoFGGMTLAYmn9oJvW` | **`B2DEE3652F0843FAF05085243144ED0A4146C85C2C91FBCFA94BECB1A9D9F621`** · BUILD_ID **`W2UQpBPD_fp8pq4y7aFIe`** | [A] |
| `next.config.js` | `C43DEB5A…5B5C` | aynı | [A] |
| `.env` / başlatıcı üçlüsü / görev eylemleri | — | değişmedi (`envUnchanged`, `tupleUnchanged` = `P1-SONRASI`, `taskActionsUnchanged`); `.env` okunmadı; silme 0; migration koşulmadı | [A] |

**main ≠ canlı:** Bu kayıt yazılırken `main` = `626362b8`. `1b758d29` dışındaki ürün değişiklikleri (K3/OFFICE, faiz motoru vb.; örn. #2842–#2852, #2846) **canlıda değildir**. `main`'deki R27 governance betikleri (#2849) yayında kullanılan araçlardır; ürün kodu değildir.

## 2. Adımlar

| adım | işlem | pencere | sonuç | kanıt dosyası (owner yayın kanıt dizini) · SHA256 | kaynak |
|---|---|---|---|---|---|
| **B0** | Yayın betiği SelfTest + yayın öncesi dar ölçüm | owner / normal | SelfTest **PASS**; `before` **8/8 PASS** (DK-7: R26 davranışı), çıkış 0 · 18:02:15Z | `dar-kabul-before-20260930-180215395Z.json` · `47C0D93B9226F9A8407D4AB0858BC9BD2B27E2E4879904D6268A05BDD7379010` | SelfTest: [O] (dosya yazmaz) · dar ölçüm: [A] hash eşit + içerik |
| **B1** | Yayın | owner / **yükseltilmiş** | **`YAYIN PASS`**, çıkış 0 · 18:03:46Z–18:05:20Z | `R27-RELEASE-20260930-180346Z.json` · `E576D0EAAECCC9111185A27E38A7A95674BF4DC9F94577C710865A14E36E6153` | [A] hash eşit + içerik |
| **B2** | Yayın sonrası dar kabul | owner / normal | **8/8 PASS** (DK-7: R27 parola politikası — 7 karakter token tüketilmeden 400 "en az 8 karakter"), çıkış 0 · 18:13:32Z | `dar-kabul-after-20260930-181332286Z.json` · `5FE976BD167F57652B2084D40D678E215ED3CB19F9A3BDB21D41BC422023CF4C` | [A] hash eşit + içerik |

### B1 ayrıntısı ([A], kanıt JSON'undan)

- **Aşamalar:** `0-kapilar` 18:03:46Z → `1-yedek` → `2-durdur-web` 18:04:24Z → `2-durdur-api` → `3-takas-api`/`3-takas-web`/`4-kimlik` 18:04:27Z → `5-baslat-api` 18:04:31Z → `5-baslat-web` 18:05:09Z → `6-kapsam` 18:05:16Z → `7-kanit` 18:05:20Z. `failedAt`/`error`/`rollback`/`stopRecovery` boş.
- **Durdurma (servis başına ölçüm):** WEB ve API durdurma komutu TAMAM; bekleme sonrası ölçüm `KAPALI (gorev=Ready dinleyici=0 host=0)`.
- **Sahte-süreç kapısı (canlı, yükseltilmiş):** eşleşen **0**; taranan 575; komut satırı okunamayan 20; kendi süreci görüldü.
- **API sağlığı:** tek dinleyici; `/api/auth/me` 401, run-now 401, `portal/cases` 401; boot log `Mapped` 977 (run-now 1, portal upload 1).
- **WEB sağlığı:** tek dinleyici, süreç kökü doğru; `/portal/login` 200, buildManifest 200, `/intake/x` 200, rewrite `/api/auth/me` 401.
- **Son servis ölçümü:** API ve WEB `CALISIYOR (gorev=Running dinleyici=1 host=1)`.
- **Yayın betiği:** B1 bloğu `main` `32927399` (#2849) sha pinli `r27-release.ps1` (`0A1570F0556904E7AD2463FFB97D0DA6E2D15CD14DAA797311F3F3FC05573E94`) ile koşuldu [O]. Betik sha'sı kanıt JSON'unda alan olarak yoktur; kanıttaki servis başına durdurma ölçümü yapısı #2849 (R03-b) biçimindedir [A].
- **Yedekler (KORUNUR, silinmez):** yayın kanıt dizininde `rollback-api-src-R26-20260930-180346Z` ve `rollback-web-R26-20260930-180346Z`; canlı dizinde eski `.next` `.pre-*` olarak yerinde. Aynı dizindeki 6 adet `R27-RELEASE-20260929-1844*/1845*Z.json` inceleme sırasındaki tarihsel `KAPIDA-DURDU` kayıtlarıdır (canlıya dokunuş yok).

## 3. Yayın öncesi Windows doğrulaması ve merge'ler

| öğe | değer | kaynak |
|---|---|---|
| #2837 (R27 paketi R02) | MERGED `429a0f5b488cb404c508b703fad65ec550b60a73` | [A] GitHub |
| #2849 (R03/R03-b yayın/geri dönüş hata yolları) | MERGED 2026-09-30T17:24:04Z `32927399c8750b7ea8ba2f88452180ce9b772bdf`; CI, Push on main, GOV-COORD SUCCESS | [A] GitHub |
| #2838 (owner bloklarında `ExpLiveDist` R26→R27) | MERGED 2026-09-30T18:18:22Z `596201654d5c38e8c0c086cfe41ec9b05b62dccd` (B1 + B2 PASS **sonrası**); CI, Push on main, GOV-COORD SUCCESS | [A] GitHub; beş bloğun yeni pinleri [O] |
| V1 harness, gerçek taban + aday dist | İlk kayıt **FAIL** (PS7 kabuk kimliği doğrulanamadı → PS7 harness'ı koşmadı) `v1-kanit.json` `C2912A22F872FE14D82F0CA47E8DF3E4DDA9226C46AB854DEF3234F61EC04761` — **korunur**. Birleşik inceleme (yeni test değildir) `3C6D5F3EC37BDC7AD43199CD1D0C362088B9B7A3B419AF9FB54808AC6662DC8A`: WinPS 5.1 **26/26** (özet `2EB8B5B301BCFECEF463AD9662F9B64070A26A9451898C0C18EBA8C0C541AE24`) + PowerShell 7 **26/26** (özet `BE933D9C4BE0A3FBFA40C0B5C3175207C9291F9685CF3A79033507CCD68529C8`); iki çıkış kodu owner konsolundan | [A] hash eşit · çıkış kodları [O] |
| V2 canlı salt-okuma SelfTest (`0A1570F0`) | **PASS**, boş-sonuç ölçümü 0/0 · `v2-kanit.json` `B9B31CB2DF5CC4165CCEA2492AC7F370D2F589A6CEADE9031C2D88CABCC38C1E` | [A] hash eşit |
| Sahte-süreç A/B negatif kontrolleri `0A1570F0` ile | **Koşulmadı** (yalnız C eşdeğeri V2 ve B1'in canlı kapısı: eşleşen 0) | [A] |

## 4. Kanıt bütünlüğü ([A])

- Yukarıdaki kanıt dosyalarının SHA256'ları owner aktarımıyla **birebir eşit**. Ayrı takip kaydı `verification-followup.json` `8511DD546BF0749B01C1DAA6EFE5B3122866D1DF867AB3A5A413C9348420EE41` de eşit (içeriği kısıtlı ayrıntı taşır; repoya alınmadı).
- Ham kanıt dosyaları, yerel kullanıcı yolları ve kısıtlı güvenlik ayrıntıları bu kayda **alınmadı**; dosyalar owner makinesinde yerinde durur.

## 5. Güvenlik kayıtları (yalnız ID + karar özeti; ayrıntı kısıtlı kayıtta)

| Kayıt | Durum |
|---|---|
| SEC-STAFF-XFF-01 | **AÇIK** — yayın kapatmaz |
| SEC-API-BIND-01 | **AÇIK** — owner yayın öncesi ağ düzeyinde bir azaltım uyguladı (ayrıntı ve ölçüm sınırları kısıtlı kayıtta); bütün ağ yollarının kapandığı **gösterilmedi** |
| SEC-MAIL-LOG-01 | **AÇIK** — D-5 canlı koşumu öncesi owner onay metnine girer |
| SEC-PORTAL-ADMIN-MSG-01 | **AÇIK** — owner koşullu risk kabulüyle yayın yapıldı; kayıt **giderilmedi**; ürün düzeltmesi ayrı iş + owner kararı (paket §10 K-11) |

## 6. Yayın araçlarında açık bulgular (inceleme 2026-09-30; canlı yayını etkilemedi)

`main` `32927399`'daki betikler bağımsız incelendi (izole kopyalarda ölçüldü). B1 başarıyla bittiği için otomatik geri dönüş yolu kullanılmadı. Aşağıdakiler **elle geri dönüş (B3, `r27-rollback.ps1`)** ya da sonraki yayınlar için önemlidir:

| ID | Özet | Etki |
|---|---|---|
| B3H-1 | B3'te dinleyici okuma hatası artık fırlatıyor; `5-baslat` yoklama döngüleri bunu yakalamıyor. | Kimlik doğrulandıktan sonra tek geçici okuma hatası WEB'i başlatmadan 13'e düşürür; kurtarma metni yanlışlıkla "başlatıldı" der |
| B3H-2 | B3 13 kurtarma metni ölçüme dayanmıyor | Başlatılmamış servis için "başlatıldı" yazabilir; başlatma adımı yok |
| B3H-3 | B3 21 yolunda (WEB durdu, API durmadı/okunamadı) WEB kapalı kalır; kurtarma satırı ve servis başına kayıt yok | Operatör WEB'in kapalı olduğunu kanıttan göremeyebilir |
| FRK-1 | `r27-release.ps1` 21/10 kararı ölçülen görev/host durumunu karara katmıyor (yalnız sağlık kümesi) | Görev denetimi dışında sağlıklı yanıt veren dinleyici "ayakta" sayılabilir |

**Öneri:** B3 gerekirse, önce bu bulguların dar düzeltmesi (ayrı PR + izole test) ya da B3 çıktısının servis başına elle ölçülmesi. Düzeltme bu kaydın kapsamında değildir.

**İleri atıf (2026-10-01; bu kaydın ölçümleri değişmedi):** B3H-1, B3H-2 ve B3H-3 `r27-rollback.ps1` üzerinde #2862 (`496e6f6a`) ile **betik düzeyinde** giderildi (paket §6 R03-c / R03-d: izole harness 53/53, mutant 27/27; B3 sha `A249B4DF…9353`). Canlı B3 akışı **koşulmadı**. **FRK-1 AÇIK** kalır: `r27-release.ps1` değişmedi (sha `0A1570F0…3E94`); karar paket §10 K-16.

## 7. Sonraki adımlar

D-5 hazırlığı (gönderimsiz Preflight, QR adımı) → owner'ın D-5 GO'su ve tek onayı → D-5 Run. D-8 sondası, D-6/D-7 ve birleşik D-9 ayrı GO'larla. Hiçbiri bu kayıtla başlatılmadı.

**İleri atıf (2026-10-01):** D-5 bir kez koşuldu — runId `00c96bd5`, çıkış 3 (ÖLÇÜLEMEYEN), **kabul tamamlanmadı**; kayıt `client-extacc-portal-d5-r01` §8. Kalan işlerin tek tablosu ve owner karar listesi: `../CLIENT-KALAN-ISLER-R01.md`. Canlı kimlik (§1) değişmedi.
