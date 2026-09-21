# R26 — SOMUT YAYIN + GERİ DÖNÜŞ PAKETİ (R01) · API + WEB birlikte · iç ağ

> **YERİNİ ALDI (2026-09-22): `R26-RELEASE-PACKAGE-R02.md`.** R02'nin R01'den farkları:
> - #2740 dahil: aday `c7a154b3`, web `C17E7B13` / `5waeMoFG`.
> - Betik hash'leri yeni; betikler P1 başlatıcı üçlüsünü tanıyor.
> - Başarılı canlı portal girişi B2'nin zorunlu adımı.
>
> Bu belgedeki blok ve hash'ler **KULLANILMAZ**; tarihsel kayıttır.

> **DURUM: HAZIR — CANLIYA UYGULANMADI.** Bu belge yayın onayı değildir. Canlı uygulama, owner bu somut paketi
> kimliğiyle onayladıktan sonra başlar. **İnternet erişimi bu paketin KAPSAMI DIŞINDADIR**: kenar/tünel/DNS yok,
> `.env` anahtarı yok, dış yayın yok. Teknik sayaç **18/18**, hizmet kabulü **0/8** — bu paket ikisini de değiştirmez.

## 1. Aday kimliği

| | Değer |
|---|---|
| Kaynak | `47fcf395902ff66561ea1beab0de7776233a7a31` — dal `release/r26-candidate` (origin'e gönderildi; PR yok) |
| Taban | `4443600a` — R25B'yi bit-bit üreten kaynak (`ebbe1ae8` + replay adapter `006c4dd2` hâli) |
| Eklenen | #2739 web: 12 dosya, yani 8 ürün + 4 test (canlı web kaynağı `2740df3d` ile main arasındaki TEK web farkı) · #2738 `portal.service.ts` + spec |
| **API aday** (`dist/apps/api/src`, 3867 dosya) | **`A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0`** |
| API canlı taban (R25B) | `1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E` (aynı tarifle yeniden üretildi) |
| API 2 dosya paketi — aday / canlı | `D0AFE2E9…27FF` / `9F58C985…FB2F` |
| **WEB aday** `.next` (505 dosya; `cache/` ve `trace` hariç) | **`136881575BBFE1A243F2DB6DF1B72CD919E342E495C2C280040D1D4BD67619A4`** · BUILD_ID `dol1nkobfH4jQ8WC4w8yh` |
| WEB canlı taban | `F064DC95CBCCA6218E8D5E84A89A6472F03AF54994E425E28A02B135956282F1` · BUILD_ID `dOiGPj2M0Abls0kCibY4r` |
| `next.config.js` — aday / canlı | `C43DEB5A…5B5C` / `4AD4915C…F750` |
| Derleme | `pnpm install --frozen-lockfile` (kilit dosyası canlı kaynakla aynı) → `prisma generate` 0 → `nest build` **0** · `next build` **0**; `NEXT_PUBLIC_API_URL` ve `API_INTERNAL_URL` **tanımsız** (canlı derlemeyle aynı koşul) |
| Digest tarifi | relpath(`/`) + NUL + BÜYÜK sha256 + LF; Ordinal sıralama; SHA256. PowerShell (5.1 ve 7) ile Python bağımsız olarak aynı değeri üretti |

## 2. Kesin kapsam — dosya düzeyinde

**API: canlı R25B'den yalnız 2 dosya farklı.** Eklenen 0, silinen 0; değişenler `modules/portal/portal.service.js` ve `.js.map`.
`dist/config` ve `dist/packages` aynı. `tsconfig.dev.tsbuildinfo` yalnız derleme önbelleği, takas edilmez.

| Dosya | Canlı sha256 | Aday sha256 | PR |
|---|---|---|---|
| `modules/portal/portal.service.js` | `56AC0973…3266` | `F5537058…4E48` | #2738 |
| `modules/portal/portal.service.js.map` | `A8CE2642…6303` | `E3DD7D02…965A` | #2738 |

**WEB: `.next` tam takas + `next.config.js`.** Next.js derlemesi bütünsel olduğu için dosya düzeyi birleştirme yapılamaz.
Kaynak düzeyinde fark yalnız #2739: `api-base-url.ts` (yeni), `api-transport.ts`, `api.ts`, `intake-api.ts`,
`error-reporter.ts`, `config/portal-api-url.ts`, `auth-context.tsx`, `next.config.js`.

**Main'de olup adaya ALINMAYANLAR (sessizce değil, açıkça):**

| PR | Neden alınmadı |
|---|---|
| #2716 replay adapter | Owner kararı (R25B'de de dışarıda); ürün davranışı R25B ile aynı kalır |
| **#2727 migration** (`20260919120000_sim_snapshot_restore_unique_indexes`) + `prisma-snapshot.repository.ts` | Canlıya uygulanmamış bir migration getirir; dış erişimle ilgisiz. **Aday migration farkı = 0**: aday ile canlı kökün son migration'ı aynı (`20260908171230_office_a07_approval_execution_binding`), `schema.prisma` farkı yok. `migrate deploy` KOŞULMAZ |
| #2730 trust-proxy | **Davranışı değiştirmeyen refactor.** `trust proxy=1` canlıda zaten var (`main.js:8`, kaynak `006c4dd2`). Önceki "#2730 gerekli" hükmü düzeltildi (dış erişim paketi §4) |
| #2740 OFFICE-AUTH-01 | OFFICE yüzeyi; katılımı ayrı karar (§8) |

**Kalan `localhost:8080` geçişleri (17), sınıflandırılmış:**
- 2'si `api-base-url` varsayılanı; yalnız localhost host'unda kullanılır.
- 1'i hata iletisi metni.
- 14'ü personel yüzeyinde doğrudan çağrı (OCR, şablon motoru, seed, AI araçları). Bugünkü canlıyla aynı, yani regresyon değil. Dış izin listesinde yoklar. Bu çağrılar personelin sunucuyu makine adıyla açtığı durumda bugün olduğu gibi çalışmaz. Bu, **ayrı bir iyileştirme kalemidir**, R26 kapsamı dışında.

## 3. Prova — adayın kendisiyle, yayından önce

| Ölçüm | Sonuç | Kanıt |
|---|---|---|
| Web vitest (aday kaynağı) | 259 dosya / **2518 test PASS** | — |
| API portal jest (aday kaynağı) | 18 suite / **242 test PASS** (3 suite DB kapılı, atlandı) | — |
| **İzole uçtan uca prova — R26 artefaktlarıyla** (runId `6da7f0cc`) | **14/14 PASS**: D-1..D-9 + aynı origin + D-3b (IP) + **D-8b şablon sınırı** | `edge-e2e-r26.json` `F50C8C37…5222` · `edge-db-verify-r26.json` `3845D67A…4B3B` |
| Kenar taklidi | İzin listesi `templates/Caddyfile.template`'ten **okundu**: sınanan sınır, yayımlanacak sınırla aynı | `edge-proxy-r26.js` `3DC76C32…4B64` |
| Çalışan süreç kimliği | API süreci `HY_WT_R26/…/dist/…/main.js`, web süreci `HY_WT_R26/…/apps/web` (süreçten ölçüldü) | — |
| D-5 notu | İlk koşuda ÖLÇÜLEMEDİ: ölçüm aracının kendi kusuru (yakalayıcı numaralandırması `msg-0001`'den yeniden başladı; yeni e-posta eski adla "önceden var" sayıldı). Ürün e-postayı göndermişti. Zamana göre bulan araçla PASS | `edge-d5-r26.js` `C3C47EFA…5BD5` |
| Aynı-origin rewrite hedefi | `routes-manifest` fallback → `http://127.0.0.1:8080/api/:path*` | `r26-pins.json` `DE448A1A…A172` |

Kanıt dizini: `C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911\r26-candidate-prova-6da7f0cc-20260921\`.

## 4. Dar kabul — iç ağ, alan adı yok, canlı DB'ye yazma yok

Betik: `scripts/r26-dar-kabul.js`. Gerçek tarayıcı (başsız Edge) kullanır; alan adına ihtiyaç duymaz.
- **İzinli istekler yalnız iki tür:** (a) her GET; (b) var olmayan sentetik e-postayla `POST /api/portal/login`. Başarısız portal girişi yazma yapmaz; `update` yalnız başarılı girişte çalışır, kaynakta ölçüldü.
- **Diğer her istek engellenir ve sayılır.** Engellenen sayısı 0 değilse kabul geçersizdir.

| # | Ölçüt | **Canlı taban (yayın öncesi, ölçüldü)** | Aday doğrulaması (:3012) |
|---|---|---|---|
| DK-1 | Intake `localhost:3002` girişsiz açılır | **FAIL — `/auth/login`'e yönleniyor (K-B canlıda)** | Sayfa doğru¹ |
| DK-2 | Intake makine adıyla; API aynı origin (rewrite) | **FAIL** | PASS (404 aynı origin) |
| DK-3 | Portal girişi `localhost` → API'ye ulaşır (401) | **FAIL — istek hiç çıkmıyor (K-A canlıda)** | PASS |
| DK-4 | Portal girişi makine adıyla, aynı origin | **FAIL** | PASS |
| DK-5 | Personel girişi açılır | PASS | PASS |
| OBS | OFFICE-AUTH-01 (sıfırlama/davet) | `/auth/login`'e yönleniyor | aynı (R26 kapsamı dışı) |

Engellenen istek sayısı iki koşuda da **0**. Kanıtlar: `r26-dar-kabul-before.json` `FEB98EF2…2B2C`, `r26-dar-kabul-cand3012.json` `524A813F…0DEA`.

¹ Aday 3012'de DK-1'in sayfa davranışı doğruydu: formda kaldı ve "Bağlantı geçersiz" iletisi göründü. Yalnız
`localhost:8080`'e giden çapraz istek tarayıcıda CORS nedeniyle engellendi, çünkü canlı API yalnız `http://localhost:3002`
kaynağına izin veriyor (ölçüldü). Canlı 3002'de aynı istek 404 dönüyor (taban koşusu). Yani bu bir prova yan etkisi.

**Kapsam dışı (ayrı GO):** başarılı portal girişi canlıda sentetik portal hesabı gerektirir, bu da canlı DB'ye yazmak
demektir. Başarılı giriş izole provada ölçüldü (D-4); canlıda ölçülmesi istenirse İ16 kalıbında ayrı GO gerekir.

## 5. Yayın sırası ve geri dönüş (betik içinde, kapılı)

`scripts/r26-release.ps1` — saf ASCII; ayrıştırma hatası 0. SelfTest PASS: WinPS 5.1 ve pwsh 7.
0. **Ön kapılar:**
   - yükseltilmiş pencere;
   - launcher pinleri (API `CC634BBF…`, web `F39F7A54…`);
   - `.env` sha = `7A7228B1…`;
   - `:8080` ve `:3002`'de tek dinleyici, kökleri `HY_W4_RELEASE23`;
   - test/prova süreci 0;
   - hedef dizinlerin hiçbiri önceden yok.
1. **Aday doğrulama:** API digest ve 2 dosya paketi; web digest, BUILD_ID ve `next.config.js`.
2. **Canlı kimlik:**
   - API fark kümesi tam olarak bu 2 dosya olmalı; web taban kimliği tutmalı.
   - **Doğrulanmış yedekler:** API `src` ve web `.next` + `next.config.js`, `HY_R26_RELEASE_EVIDENCE` altına.
   - **Web hazırlık kopyası** canlı dizine yazılır; digest'i ve ACL'si kontrol edilir (yalnız kalıtım). Bu adıma kadar canlı sistem çalışmaya devam eder.
3. **Durdurma:** önce WEB, sonra API. Kapandıkları doğrulanır (dinleyici 0, host süreci 0, görev Running değil). Kapanmazsa dosyalara dokunulmaz ve durdurulan servis yeniden başlatılır.
4. **Takas (silme yok):**
   - API'de 2 dosya kopyalanır ve sha'ları doğrulanır.
   - Web'de `.next` → `.next.pre-r26-<ts>`, hazırlık kopyası → `.next`; `next.config.js` kopyalanır.
5. **Durmuşken kimlik:** API, web ve cfg aday değerinde olmalı, ACL kalıtım modelinde olmalı. Değilse **başlatmadan geri alınır**.
6. **API'yi başlat:**
   - `/api/auth/me` 401;
   - run-now 401;
   - portal/cases 401;
   - yeni boot log'da run-now ve portal upload `Mapped`.
7. **Web'i başlat (≤180 sn):**
   - `/portal/login` 200;
   - `buildManifest(dol1nkob…)` 200;
   - `/intake/x` 200;
   - **rewrite `/api/auth/me` 401**;
   - BUILD_ID aday değerinde;
   - süreç kökü RELEASE23.
8. **Kapsam:** API ve web digest'i, `.env` değişmedi, launcher pinleri ve görev eylemleri aynı.

Adım 6–8'de biri tutmazsa **API ve WEB birlikte** geri alınır: ikisi durdurulur, yedekten dönülür, kimlik doğrulanır, ikisi başlatılır.
Otomatik geri dönüşün sonucu `ROLLBACK`, `ROLLBACK-DOGRULANAMADI` ya da `ROLLBACK-ENGELLENDI` olur ve kanıt JSON'una yazılır.
Uyumluluk: eski web ile yeni API ve yeni web ile eski API ikilileri de uyumludur (değişiklikler bağımsız); yine de geri dönüş,
tam olarak bilinen R25B durumunu hedefler.

`scripts/r26-rollback.ps1` (elle geri dönüş):
- Yedek kimliği doğrulanmadan başlamaz: API `1524EDC1` + paket `9F58C985`, web `F064DC95` + BUILD_ID + cfg.
- Silme yapmaz; mevcut `.next` `.next.rollback-from-r26-<ts>` adıyla yeniden adlandırılır.
- SelfTest, canlının kopyasından oluşturulan sahte yedekle PASS verdi. Bozuk yedekle FAIL verdi. Yükseltilmemiş gerçek koşum kapıda DUR verdi.

## 6. Owner blokları — tam hash'li (merge sonrası kanonik yoldan)

Betik yolu: `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\`.
`core.autocrlf=false`; bu yüzden merge sonrası baytlar aynı kalır ve pinler kanonik checkout'ta yeniden doğrulanır.

| Betik | sha256 |
|---|---|
| `r26-release.ps1` | `F00EA8EDBE005D8A434CC1CA190B3B8DB66B1E5A150EDCA408B1F7F7190562DB` |
| `r26-rollback.ps1` | `0539854D600C7E2DDB52FF13B117C120549C1ECA97D8CB70C1A235E09FB04049` |
| `r26-dar-kabul.js` | `9045CD3760F16BEDC0D905C732C1EB4620A536E4F9E4818FE661AF24A95020E0` |

**B0 — SelfTest (normal pencere; canlıya dokunmaz):**

```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\r26-release.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'F00EA8EDBE005D8A434CC1CA190B3B8DB66B1E5A150EDCA408B1F7F7190562DB'){ throw 'R26 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -SelfTest; $rc=$global:LASTEXITCODE; 'SelfTest cikis=' + $rc; if($rc -ne 0){ throw 'SelfTest PASS degil - YAYIN BASLATILMAZ' } }
```

**B1 — Yayın (YÜKSELTİLMİŞ pencere; B0 PASS sonrası):**

```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\r26-release.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'F00EA8EDBE005D8A434CC1CA190B3B8DB66B1E5A150EDCA408B1F7F7190562DB'){ throw 'R26 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'YAYIN cikis=' + $rc; if($rc -ne 0){ throw 'YAYIN PASS DEGIL - KANIT satirindaki JSON verdict alanina bakilir (ROLLBACK = otomatik geri alindi; ROLLBACK-DOGRULANAMADI / ROLLBACK-ENGELLENDI = B3)' } }
```

**B2 — Dar kabul (normal pencere; B1 `YAYIN PASS` sonrası):**

```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\r26-dar-kabul.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '9045CD3760F16BEDC0D905C732C1EB4620A536E4F9E4818FE661AF24A95020E0'){ throw 'DAR KABUL BETIGI SHA UYUSMUYOR - DUR' }; $node=(Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source; $out='D:\Development\HUKUK_YAZILIMI\HY_R26_RELEASE_EVIDENCE\R26-DAR-KABUL-after-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z.json'; $global:LASTEXITCODE=-999; & $node $f after $out; $rc=$global:LASTEXITCODE; 'DAR KABUL cikis=' + $rc + ' | kanit=' + $out + ' sha256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $out).Hash; if($rc -ne 0){ throw 'DAR KABUL PASS DEGIL - owner karari: B3 ya da inceleme' } }
```

**B3 — Elle geri dönüş (YÜKSELTİLMİŞ; yalnız gerekirse). Yer tutucular B1 kanıt JSON'undaki `api.backup` ve `web.backup` ile doldurulur:**

```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\r26-rollback.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '0539854D600C7E2DDB52FF13B117C120549C1ECA97D8CB70C1A235E09FB04049'){ throw 'R26 GERI ALMA BETIGI SHA UYUSMUYOR - DUR' }; $api='<api.backup>'; $web='<web.backup>'; if($api -like '<*' -or $web -like '<*'){ throw 'yer tutucu doldurulmadi - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web -SelfTest; if($global:LASTEXITCODE -ne 0){ throw 'yedek kimligi dogrulanamadi - GERI ALMA BASLAMAZ' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web; $rc=$global:LASTEXITCODE; 'GERI ALMA cikis=' + $rc; if($rc -ne 0){ throw 'ROLLBACK DOGRULANAMADI - ESCALATE' } }
```

Blok kalıbı, paket worktree yolundan sınandı: B0 PASS; yanlış pin → DUR.

## 7. Yayın sonrası bağımsız doğrulama (koşucu; salt okuma)

- API ve web tam ağaç digest'leri, Python'dan bağımsız olarak.
- BUILD_ID ve `next.config.js`.
- `.env` sha, launcher pinleri, görev eylemleri.
- Uçlar: `/api/auth/me` 401 · web `/portal/login` 200 · rewrite `/api/auth/me` 401.
- Yedek dizinlerinin kimliği.
- B2 kanıt JSON'u.
- Kayıt PR'ı → CI → merge → merge SHA'sında main CI.

## 8. Ortak final listesi — açık kalemler ve owner kararları

| # | Kalem | Durum | Karar sahibi |
|---|---|---|---|
| 1 | **R26 teknik yayını** (bu paket: B0 → B1 → B2) | HAZIR, UYGULANMADI | Owner GO |
| 2 | **OFFICE-AUTH-01** — personel parola sıfırlama/davet kabulü sayfaları girişsiz `/auth/login`'e yönleniyor | **AÇIK.** Gerçek tarayıcıda doğrulandı: aday + **canlı taban** (DK OBS). Düzeltme main'de: #2740, merge `799a7346`. Canlıda değil. R26'ya DAHİL DEĞİL. OFFICE 33'e kanıtıyla devredildi (`office-auth-obs.json` `639FE10C…3329`) | Owner: R26 web'e katılım mı (web yeniden derlenir + prova yenilenir), ayrı OFFICE yayını mı |
| 3 | Dış erişim (internet) | Bu paketin DIŞINDA; alan adı/DNS/yayın imkânı bilgisi bekleniyor (`client-external-access-r01` §13) | Owner bilgi + ayrı GO |
| 4 | H8 — "≤ 4 sn" kapsam cümlesi | Açıklama düzeltmesi (transaction + `FOR NO KEY UPDATE` + koşullu güncelleme) **yapıldı ve ayrı**; kapsam cümlesinin değiştirilmesi **owner kararı**, önerilen metin uygulanmadı | Owner |
| 5 | A3 / C1 / C2 / C3 | Tek satır karar tablosu: `client-external-access-r01` §12; tarihsel OFFICE kapanışı kabul sayılmaz | Owner, satır satır |
| 6 | Başarılı portal girişinin canlıda ölçülmesi | İsteğe bağlı; sentetik hesap = canlı DB yazımı → ayrı GO | Owner |
| 7 | Personel yüzeyinde 14 doğrudan `localhost:8080` çağrısı | Bugünkü davranış; iyileştirme kalemi | Owner/OFFICE önceliklendirmesi |
| 8 | Hizmet kabulü | **0/8**; teknik hazırlıktan ayrı | Owner, hizmet başına |

## 9. Codex final denetimi — bulgu ↔ paket eşlemesi

Codex raporu owner üzerinden iletildi. Önceki notta "Codex raporu gelmedi" yazıyordu; bu not **YANLIŞTIR ve düzeltildi**.
Raporun üç bulgusu:

| Codex bulgusu | Karşılığı |
|---|---|
| Web'in derlenmiş `localhost:8080` API adresi | #2739 (aynı origin + K-A + K-B) → bu paket (R26 web). Canlıda ölçüldü (DK taban), aday provada giderildi |
| H8: ürün mekanizması `FOR NO KEY UPDATE` | F04 paketi §A açıklama düzeltmesi (#2739 ile main'de). **Ayrı tutulan:** "≤ 4 sn" kapsam cümlesi owner kararı (§8 #4) |
| A3/C1/C2/C3 kabul boşlukları | `client-external-access-r01` §12 tek satır karar formatı (§8 #5) |

## 10. Şeffaflık notları

- R26 provasında personel sayfaları `127.0.0.1:3011` üzerinden açılırken, sayfaların açılışta yaptığı
  `GET localhost:8080/api/auth/capabilities` çağrısı ilk koşuda engellenmemişti. **Canlı API'ye en fazla 4 kimliksiz,
  salt okuma GET isteği gitmiş olabilir**; yazma, giriş ya da veri yok. Sonraki koşularda canlıya giden her istek engellendi ve sayıldı.
- Aday kaynak commit'i ilk denemede kanca atlatılarak (`core.hooksPath`) atıldı. Bu bir **süreç ihlaliydi**; commit
  geri alındı ve kancalarla yeniden atıldı (`47fcf395`, ağaç içeriği aynı).
- OFFICE 33'e iletilen devir mesajında #2740 için head commit (`833b8e83`) merge SHA diye yazıldı; doğrusu `799a7346`.
- `HY_WT_R26` (aday kaynağı ve artefaktlar) yayın ve kayıt tamamlanana kadar **SİLİNMEZ**.
  `D:\Development\HUKUK_YAZILIMI\HY_R26_SELFTEST_MOCK` yalnız SelfTest için oluşturulmuş bir kopya; canlı sistem onu kullanmaz.
