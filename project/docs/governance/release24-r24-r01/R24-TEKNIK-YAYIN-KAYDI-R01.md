# R24 — TEKNİK YAYIN KAYDI (R01) · B11 + G7 içeren sabit aday

```text
BELGE    : R24-TEKNIK-YAYIN-KAYDI-R01
YETKI    : owner GO 2026-09-18 "OFFICE/C33: B11 + G7 içeren sabit adayın yayınını gerçekleştir"
           (B11'in bu adayla yayımlanması + §5.4 davranış değişikliğinin kabulü owner'ın YAZILI kararıdır)
           + owner GO 2026-09-18 "r24-release.ps1 içindeki H/Get-History isim çakışmasını dar kapsamda düzelt"
           + owner GO 2026-09-18 "R24 yayın kapanışı ve İ12 devir"
KONU     : İ12 R06 paketi (#2702 @ 88f159ea) §6 sırasıyla yürütülen DOSYA DÜZEYİ teknik yayın: kimlik kapıları,
           doğrulanmış geri dönüş yedeği, 7 dosya takası, sağlık ve gönderimsiz route/yetki kontrolü
SONUC    : **YAYIN PASS** (teknik yayın). İşlevsel/yetkili-rol kabulü YAPILMADI — ayrı owner GO'suna bağlı.
YAPILMADI: migration · mühür/authority/nonce/cutover motoru · yeni yayın ordinali ataması · gerçek alıcıya
           gönderim · İ12 canlı kabul · .env değişikliği · pinli launcher değişikliği · DB yazımı · İ13
```

## 1. Üç kimlik ve canlı taban

| # | Kimlik | Değer | Doğrulama |
|---|---|---|---|
| 1 | KAYNAK SHA | `006c4dd2928f6c719669cc17b3b61f6ce3e2bc89` | main `88f159ea`'nın atası; izole D: worktree temiz |
| 2 | PAKET DIGEST (İ12 canlı betik seti) | `34222C149172C91DC9A153F07CA0F0B0EC3ED82357DFADBDD26939DE36DE3FE0` | 8 betiğin sha256'ları tablo ile birebir; digest yeniden hesaplandı |
| 3 | ADAY DIST (tam ağaç) | `87712E0ED2CF71EE8268D81865C2388E030F52AF9AC7E29C56617AEDD0845453` · 3867 dosya | `pnpm install --frozen-lockfile` → `prisma generate` → `nest build` **çıkış 0** sonrası ölçüldü |
| — | CANLI TABAN (yayın öncesi) | `F84D680E603A0B8452AC67CBE8F7095AC34CED7A6D6E0CAE281F98D72528F44C` · 3867 dosya | ölçüldü (belgeye güvenilmedi) |

**Digest reçetesi (kayda geçer, tekrar üretilebilir olsun diye):** her dosya için `relpath` (ileri eğik çizgi) +
`NUL` + `SHA256` (BÜYÜK harf) + `LF` birleştirilir, sıralama **ordinal** (`StringComparer::Ordinal`), toplamın
SHA-256'sı alınır. Reçete, bilinen canlı taban digest'i yeniden üretilerek belirlendi.

**★ Kimlik nüansı (ileride yanlış varsayım üretmemesi için):** canlı kök adı **`HY_W4_RELEASE23` olarak KALDI**;
değişen şey o kökün `dist/apps/api/src` ağacıdır. Bu kayıttan sonra "RELEASE23 canlı = `F84D680E…`" eşitliği
**TARİHSELDİR**; canlı dist artık `87712E0E…5453`. Cutover makbuzu (`CUT-20260913-200554-ec45bc63`) değişmedi;
bu yayın mühür/cutover motoru kullanmadı, dosya düzeyindedir.

## 2. Canlıya fark (ölçülen)

| Alan | Değer |
|---|---|
| eklenen / silinen | **0 / 0** |
| değişen | **7 / 7** |
| migration | aday 131 = canlı 131 dosya · içerik digest `DD38F07D092CD2839142291058C1EC28B1325B42C0C0E82DF045E0BAB1AEC93D` **AYNI** → `migrate deploy` KOŞULMADI |

Değişen dosyalar (canlı → aday sha256 ilk 16):

| dist yolu | önce (geri dönüş hedefi) | sonra |
|---|---|---|
| `modules/client-statement/client-statement.controller.d.ts` | `545F48D5105D46D4` | `F07BCBAF67EA989A` |
| `modules/client-statement/client-statement.controller.js` | `2E42A47563F284CE` | `50F67E63BD45FC0C` |
| `modules/client-statement/client-statement.controller.js.map` | `16EFC1CAB439BFCE` | `CFB95927FFCD2139` |
| `modules/client-statement/client-statement.module.js` | `3D3DB2469BD53688` | `3AA80CAE5B830167` |
| `modules/client-statement/client-statement.module.js.map` | `ECC200B99FA2E717` | `44E9A530DB5810FA` |
| `modules/lawyer/lawyer.service.js` | `29812F1C09293228` | `EF25F06DB9CEA28B` |
| `modules/lawyer/lawyer.service.js.map` | `70A51B778FE66D1E` | `38B95EE9C45B5643` |

İçerik: **#2697** (G7 dar manuel aylık teslim ucu) + **#2655 / B11** (ayrıcalıklı avukat güncellemesinde atomik audit).

## 3. Yürütme (owner yükseltilmiş koşum) — kanıt bağı

| Alan | Değer |
|---|---|
| Kanıt dosyası | `D:\Development\HUKUK_YAZILIMI\HY_R24_RELEASE_EVIDENCE\R24-RELEASE-20260917-220435Z.json` |
| Kanıt sha256 | `C92B8F5F9BEA36A09E8EDB6845DCE2161D73362F3C04B002E145D9A38523E9AD` (owner beyanıyla eşit; OFFICE salt-okuma doğruladı) |
| Verdict | `YAYIN PASS` |
| Yayın betiği | `r24-release.ps1` sha256 `93A19F269A343BE838D42845B3D5A5582FE85ECC219EEE5D1CB3CB8D24C03B26` |
| Geri alma betiği | `r24-rollback.ps1` sha256 `870687F7FA66D4C48DF35C42A67444D428BB197B250B166AA01585132091F922` |

Kanıttaki zaman çizgisi (UTC), konsol çıktısıyla uzlaştırıldı:

| Saat | Adım |
|---|---|
| 22:04:36 | ön kapılar: görev Running · action `hukuk-task-host.exe api` · :8080 pid 25172 · launcher+`.env` pin OK · i12/cron/sink süreci 0 |
| 22:04:39 | aday 3867 dosya · digest `87712E0E…` |
| 22:04:41 | canlı 3867 dosya · digest `F84D680E…` · fark 0/0/7 |
| 22:05:08 | yedek alındı ve **digest yeniden ölçülerek** taban doğrulandı |
| 22:05:11 | görev durduruldu; dinleyici 0, host api süreci 0, görev Running değil |
| 22:05:11 | **7/7** dosya değişti (her dosyanın sha'sı doğrulandı) · `migrate deploy` yok |
| 22:05:14 | **durmuşken** tam ağaç digest = aday `87712E0E…` |
| 22:05:14 | API başlatıldı |
| 22:05:52 | sağlık: :8080 tek dinleyici pid **34552** · `/api/auth/me` = **401** |
| 22:05:52 | gönderimsiz route: kimliksiz `POST /api/client-statements/monthly-delivery/run-now` = **401**; boot log `api-out.20260918-010520.log` içinde `Mapped {…run-now, POST} route` **1**, toplam `Mapped` **977** |
| 22:05:55 | kapsam: canlı digest aday · `.env` sha değişmedi · launcher pin · görev action aynı → **YAYIN PASS** |

## 4. OFFICE bağımsız doğrulama (salt-okuma, 2026-09-17T22:08:38Z) — 15/15 PASS

- canlı dist digest = aday `87712E0E…5453` · 3867 dosya · 7 dosyanın sha'sı canlı = aday
- **R23 geri dönüş yedeği** `…\HY_R24_RELEASE_EVIDENCE\rollback-dist-src-R23-20260917-220435Z` digest = taban
  `F84D680E…F44C` · 3867 dosya; yedeğe göre fark 0 eklenen / 0 silinen / 7 değişen (manifestle aynı)
- `.env` sha = pin `7A7228B1…` (yalnız sha okundu; içerik okunmadı) · pinli launcher `CC634BBF…` değişmedi
- görev action korundu · görev Running · :8080 tek dinleyici pid 34552, kök `HY_W4_RELEASE23`
- `/api/auth/me` = 401 · kimliksiz `POST run-now` = **401** (olmayan yol referansı 404) · boot logda run-now `Mapped` = 1 / 977
- canlı migration içerik digest değişmedi (`DD38F07D…`) · kanıt dosyası sha256 = owner beyanı

## 5. Yayın öncesi ölçülen "yoklu" durum (401 yorumu için gerekli)

Yayından önce aynı probe'lar: `POST …/run-now` → **404**; boot loglarında (`api-out.20260915-141728`,
`20260916-113546`, `20260916-124324`) run-now `Mapped` **0**, toplam `Mapped` **976**. Yayından sonra 401 + Mapped 1 +
toplam 977. **401 tek başına yetkili-rol veya işlevsel kabul kanıtı DEĞİLDİR** — yalnız korumalı bir route'un
eşleştiğini gösterir; asıl kanıt durmuşken ölçülen tam ağaç digest'i ve boot logundaki route kaydıdır.

## 6. Geri dönüş paketi (KORUNUR — silinmez)

| Öğe | Yol / değer |
|---|---|
| R23 dist yedeği | `D:\Development\HUKUK_YAZILIMI\HY_R24_RELEASE_EVIDENCE\rollback-dist-src-R23-20260917-220435Z` (3867 dosya, digest `F84D680E…F44C`) |
| Yayın kanıtı | `…\HY_R24_RELEASE_EVIDENCE\R24-RELEASE-20260917-220435Z.json` (sha `C92B8F5F…E9AD`) |
| Geri alma yordamı | R06 §7; betik `r24-rollback.ps1` (`870687F7…F922`), yedek digest doğrulanmadan başlamaz; 404 dönüşü kontrolü içerir |
| Şema geri alma | **YOK** (migration delta 0); DB'ye dokunulmaz |

## 7. Yayın öncesi giderilen iki betik kusuru (kayıt)

1. **`H` / `Get-History` çakışması.** Yardımcı fonksiyon adı `H`, PowerShell'de `h` alias'ının (`Get-History`)
   gölgesinde kaldı (alias > fonksiyon) → ilk çağrı 0. adımdaki launcher pin kapısında hata verdi. **Etki: yok** —
   ölçümle doğrulandı: canlı dist tabanda kaldı, görev/PID değişmedi, yedek dizini boştu (robocopy hiç koşmadı),
   yani **canlı yazma / durdurma / takas olmadı**. Ad `Get-R24FileSha256` yapıldı (yayın 7, geri alma 5 çağrı);
   oturumun `h` alias'ına dokunulmadı.
2. **Kabuk-bağımlı digest (self-test yakaladı).** Ağaç digest'i `Sort-Object -CaseSensitive` ile sıralıyordu; bu
   sıralama kültüre bağlı olduğundan **PS 5.1 ile pwsh 7 farklı digest** üretiyordu (5.1'de aday/canlı digest
   beklenenden farklı çıktı). Sonuç fail-closed olurdu (dosyalara dokunmadan durma) ama yayın da olmazdı.
   Sıralama `.NET StringComparer::Ordinal` ile kabuk/kültür bağımsız hale getirildi; her iki kabukta aday
   `87712E0E…` ve canlı taban `F84D680E…` birebir üretildi (`-SelfTest` kipi, canlıya dokunmaz).

## 8. Sınırlar ve sayaçlar

- **Teknik yayın ≠ işlevsel kabul.** Bu kayıt yalnız artefaktın yerinde ve route'un kayıtlı olduğunu kanıtlar.
  Yetkili rolle davranış kabulü (403 `SCHEDULER_MANUAL_RUN_DENIED_NOT_ELEVATED`, hedef-scoped teslim, dedupe)
  **yapılmadı**: elevated aktörle çağrı GERÇEK teslim tetikler, elevated olmayan canlı aktör kimliği owner kararıdır.
- **İ12 canlı kabul BAŞLAMADI.** CLIENT hold'da; İ12 için ayrı owner GO gerekir. **Sayaç 11/17 · hizmet kabulü 0/8**
  bu yayınla ARTMADI.
- Cron: `CLIENT_STATEMENT_MONTHLY_DELIVERY` ölçüm anı 2026-09-17T21:38:40Z'de `true` (CLIENT ölçümü; yalnız o anahtar
  okundu) — bu bir anlık görüntüdür. Sonraki aylık ateşleme `'0 3 1 * *'` @ Europe/Istanbul → **2026-10-01 03:00**;
  yayın penceresinde çakışma yoktu ve yayın yeni bir bayrak/cron AÇMADI.
- B11 davranış değişikliği canlıdadır: ayrıcalıklı `PUT/PATCH /lawyers/:id` çağrısında audit yazılamazsa güncelleme
  geri alınır ve hata çağırana ulaşır (owner GO'su bunu açıkça kapsıyor).
