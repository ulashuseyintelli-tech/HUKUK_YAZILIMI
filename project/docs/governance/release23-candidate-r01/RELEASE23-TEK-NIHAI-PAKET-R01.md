# RELEASE23 + CLIENT İ11 — TEK NİHAİ KARAR PAKETİ (R01)

```text
BELGE       : RELEASE23-TEK-NIHAI-PAKET-R01
YETKİ       : owner GO 2026-09-12 "DEVAM — ÖNCEDEN YETKİLENDİRİLMİŞ ADAY HAZIRLIĞINI TAMAMLA"
              (aday derlemesi + geri dönüş paketi; canlı cutover/restart/yapılandırma değişikliği YOK)
TARAFLAR    : OFFICE 33 — C33/D1 (derleme · Katman 1 · R28 · bu belge ve GO taslağı)
              CLIENT    — İ11/D2 (bağlama + aday doğrulaması: #2654 @ 98878222, I11-ADAY-BAGLAMA-VE-DOGRULAMA-R04)
              ana yürütücü — hat koordinasyonu ve bağımsız doğrulama
DURUM       : ADAY DERLENDİ · İ11 ADAY İKİLİSİNDE DOĞRULANDI · D1 HAZIR ·
              ★ D3 ENGELLİ — 3 engelleyici kusur (§0); §7 GO TASLAĞI ASKIDA, owner'a SUNULMAZ
YAPILMADI   : ratifikasyon · owner preflight (yükseltilmiş) · -Live · onaylı kimlik · mühür/authority/nonce ·
              cutover · T-pencere · İ11 canlı koşumu
DÜZELTME    : 2026-09-13 — §0 eklendi (CLIENT ölçümü + OFFICE 33 kaynak doğrulaması; ana yürütücü notu);
              R01 ilk metni (#2656 @ 506f1dd3) aşağıda korunur, §0 ile ÇELİŞEN yerde §0 geçerlidir
CANLI       : RELEASE22 — API :8080 PID 46332 · Web :3002 PID 47004 · bin = R22 preimage · RELEASE23 .env YOK
              (2026-09-12T21:05:42Z salt-okuma ölçüldü; DEĞİŞMEDİ)
YETKİ SINIRI: bu belge canlı yürütme yetkisi DEĞİLDİR; §7 yalnız owner onayına sunulan taslaktır
KAYIT       : CLIENT sayaç 10/17 · hizmet kabulü 0/8 tam
```

Ayrıntılı paket kaydı: `RELEASE23-R28-CUTOVER-PAKETI-R01.md` (diskteki
`HY_C33_RELEASE23_CUTOVER_R28\docs\LIVE-APPROVAL-PACKAGE-R28.md` ile bayt-aynı; sha256
`EDBA8DCC682933D6FE4132D6C825D2A4CB718E34DB58E7CA7FABB366F11554C2`). Bu belge onu tekrar etmez; **canlı karar için gereken her
komutu ve tam hash'i tek yerde toplar.** Aşağıdaki PowerShell blokları o belgeden programatik olarak
alınmıştır (bayt-aynı).

## 0. DURUM DÜZELTMESİ (2026-09-13) — D3 ENGELLİ, GO TASLAĞI ASKIDA

#2656 merge edildikten sonra CLIENT, D3 teyidi yerine **üç engelleyici kusur** bildirdi (mesajlar çaprazlandı; CLIENT
"#2656'yı mevcut T/§9 hash'leriyle birleştirmeyin" demişti). OFFICE 33 üçünü de **kaynakta yeniden doğruladı** (main @ `506f1dd3`):

| # | Kusur | OFFICE 33 kaynak doğrulaması | Etki | Düzeltme (CLIENT dosyalarında) |
|---|---|---|---|---|
| **E-1** | §9 K-PAR, pencere yakalayıcısını paralel kabul sanıp DURUR | `CLIENT-LIVE-ACCEPTANCE-I11-R01.md:566` deseni `…\|start-api-r22s\|smtp-sink`; `:567` yalnız `I11-KAPI-BLOK` imzasını dışlar. T-AÇ K-T1 `:2526` dinleyicisini şart koşar; yakalayıcı `node smtp-sink-noauth.js` ile çalışır → komut satırı desene uyar. CLIENT ölçümü: yakalayıcı açıkken 4 süreç eşleşti | D3-2 kabul koşumuna **hiç ulaşılmaz** (V-A `i11-run.js`'i doğrudan koştuğu için görünmedi) | K-PAR yalnız eski AUTH'lu `smtp-sink\.js`'i yakalar → **§9 hash değişir** |
| **E-2** | T-KAPA hata yolunda önlemi kaldırmaz | `t-window-close.ps1:98` (R-T2 API bütçe aşımı) ve `:105`/`:108` (R-T3) `throw`, `:111-117` R-T4'ten (engel kuralı kaldırma + Web başlatma) ve `:130-135` R-T5'ten ÖNCE | API kalkmazsa `I11-WINDOW-BLOCK-8080/3002` **kalır**, Web **kapalı** kalır; §5.1 "önce T-KAPA, sonra C33 geri dönüş" satırı tam bu senaryoda kullanıcıları dışarıda bırakır | R-T4/R-T5 HER DURUMDA koşar, hatalar toplanıp sonda fırlatılır → **T-KAPA hash değişir** |
| **E-3** | Yükseltme ön koşulu yok | İki T betiğinde `IsInRole`/Administrators kontrolü **0**; `t-window-apply.ps1:95` `New-NetFirewallRule` yükseltme ister. Canlı `.env` sınıfı `RUNTIME_CONFIG_FILE` (preflight provası OP-09h): runtime hesabı (= oturum kullanıcısı `…-1146`) yalnız FR; CLIENT SDDL ölçümü `O:SYG:DUD:PAI(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;…-1146)` | Yükseltilmemiş oturumda T-AÇ `.env`'e yazamaz, kural ekleyemez | T-AÇ/T-KAPA canlı modda İLK kapı: yükseltilmiş Administrators; aksi hâlde hiçbir değişiklikten önce DUR → **iki T hash'i değişir** |

**Ek bulgular (bu paketin D3 satırlarına işlenir):**

- **(a) Çağrı sözleşmesi** doğru ama **eksik ön koşul**: T-AÇ'tan ÖNCE yakalayıcı
  `SINK_PORT=2526 SINK_LOG=<CLIENT scratchpad>\i11s\runs\smtp-sink.jsonl node smtp-sink-noauth.js` ile başlatılır
  (`smtp-sink-noauth.js:15-17` `SINK_LOG` zorunlu; T-AÇ/T-KAPA `$SinkLog` = aynı yol; farklı yol → K-T10b pozitif kanıt YOK).
- **(b) D3-5 ölçütü** CLIENT tarafından kabul edildi. CLIENT karalama deneyi: korumalı DACL'lı hedefte `Set-Content` ve `Copy-Item -Force`
  sonrası SDDL KORUNDU; **sahip (SYSTEM) korunumu yükseltilmemiş oturumda ÖLÇÜLEMEDİ** → D3-5 kalır. CLIENT ek olarak K-T0'da SDDL tabanını blok içinde kaydedecek.
- **(c) `ENV-PREIMAGE.env` yedeği KORUMASIZ — sır açığı:** yedek `Copy-Item` ile CLIENT scratchpad'ine alınır ve dizinin kalıtsal ACL'ini
  devralır. OFFICE 33 salt-okuma ölçümü (`…\894280b1-…\scratchpad`, korumasız, kalıtsal): SYSTEM/Administrators/kullanıcı FullControl'e
  ek olarak **6 ek SID/grup Modify** (`CodexSandboxUsers` + 5 çözümlenmemiş SID). Canlı `.env` kopyası `DATABASE_URL` ve SMTP parolası taşır.
  Düzeltme (CLIENT): yedek alındıktan hemen sonra korumalı DACL (SYSTEM + Administrators + yürütücü) + doğrulama. Silme owner kararı.
- **(d) Geri dönüş sırası** ("D3 açıkken önce T-KAPA, sonra C33 elle geri dönüş") yalnız **E-2 düzeltmesinden SONRA** geçerlidir.
- **main ≠ aday (ana yürütücü notu, OFFICE 33 doğruladı):** main'de adaydan sonra çalışma zamanı değişikliği var —
  **#2655 B11 @ `78f49dd3`** (`project/apps/api/src/modules/lawyer/lawyer.service.ts`, ayrıcalıklı avukat güncellemesinde atomik audit);
  `merge-base --is-ancestor 78f49dd3 2740df3d` = HAYIR. RELEASE23 bu değişikliği **İÇERMEZ**; sabit aday kararı gereği taşınmaz.
- **K-KİMLİK / bağımsız doğrulama rolü:** ana yürütücü, akran talebiyle rol üstlenmeyeceğini, görevin **owner GO'suyla** atanması gerektiğini
  bildirdi; §1 hash'lerini ölçmedi, doğrulama kaydı üretmedi. §7 taslağı bu rolü açıkça ATAMALIDIR (R02'de işlenir); o zamana kadar K-KİMLİK karşılanmış sayılmaz.

**Sonuç:**
- **D1 (C33 yayın) teknik olarak etkilenmez:** §1.1–§1.4 kimlikleri, D1 komutları ve §5.3 elle geri dönüş geçerlidir.
- **D3 ENGELLİ:** §1.5'teki §9 `A16E4791…`, T-AÇ `508C5323…`, T-KAPA `5895CFC7…` hash'leri CLIENT düzeltmesiyle **geçersizleşecek**;
  §4 D3 tablosu, §5.1'in D3 satırları ve §7 madde 5–6 bu hash'lerle **UYGULANMAZ**.
- **§7 tek koşullu GO taslağı ASKIDA — owner'a sunulmaz.** CLIENT dört düzeltmeyi yapıp oturuma özel ortamda yeniden kanıtlayınca
  (K-PAR sondası, T-KAPA hata yolu, yedek DACL, yükseltme kapısı izole sınaması, V-A tekrarı) yeni hash'ler + merge SHA'sı ile bu paketin
  **R02**'si yazılır: D3 satırları, (a) yakalayıcı ön koşulu, D3 yürütücüsünün **yükseltilmiş Administrators** oturumu ve rol ataması GO'ya işlenir.

## 1. Kesin kimlikler (tam değer)

### 1.1 Aday — sabit kaynak

| | Değer |
|---|---|
| **Sabit kaynak** | `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` (#2646 squash; origin/main atası) — hareketli main KULLANILMADI |
| Kapsam | **#2641** `b9fd97a1` · **#2643** `d199c8dc` · **#2645** `e65ff5de` — üçü de adayın atası (ölçüldü) |
| Fark `13740670..2740df3d` | 33 commit · **ürün farkı 7 dosya** (`party-write-tx.ts`, `case`/`client`/`debtor`/`lawyer.service.ts`, `error-log.sanitize.ts`, `office-write-role.policy.ts`) · migration/şema/lock/`package.json`/web/`packages` **0** |
| **Aday kökü** | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23` — detached worktree, HEAD = kaynak, kirli 0, `.env` YOK |
| **Web BUILD_ID** | `dOiGPj2M0Abls0kCibY4r` |
| API giriş `main.js` | `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` (RELEASE22 ile aynı — derlemeyi AYIRT ETMEZ) |
| main ≠ aday (§0) | #2655 B11 @ `78f49dd3` (`lawyer.service.ts`) adaydan SONRA main'de; RELEASE23'te YOK |

### 1.2 Derleme manifesti — Katman 1 `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CANDIDATE`

| | sha256 |
|---|---|
| Aday makbuzu `RELEASE23-CANDIDATE-RECEIPT.json` | `6BF43693D45C1245693381BCAC448DCA20522E57A6F461BB1476A1EC66D1E6D3` |
| **Manifest** `RELEASE23-PAYLOAD-MANIFEST.json` (= manifestDigest) | `E53618ED81FF02B43CB03B26656275B860D1C9B399C7D561A75BE0CA17F61AD5` |
| candidateDigest | `EF8ED2AC844CB0CB943499C97266FD740677B9D17D6783867E248C02328D6846` |
| packageDigest (50 dosya) | `176500F105359543B8E8092F4CB65CBB5C4ED7987F8ABA2381FD7FABA39C1F59` |
| Sıralı defter `RELEASE23-PAYLOAD.ordinal.tsv` | `52075981B6315B34CB7A51271990908A6A7A570354398C6AA1C86E7ED869EC46` |
| R09 bağlama profili | `80A835B04BB2DC6F3AEB51ECC1ED1237EA208C4C4E867B0630183B739D86E198` · profil `PRF-1c343861-7177-4799-be95-0c1fb72dd212` |

### 1.3 Cutover paketi — R28 `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28` (MÜHÜRSÜZ)

| | sha256 |
|---|---|
| Paket kimliği literali | `HY_C33_RELEASE23_CUTOVER_R28` (motor P-04 · OWNER-COMMAND · verifier V-03/V-04d) |
| Motor `engine\Invoke-C33Cutover.ps1` | `2AE770435B769A21CFF495BF2224A3385EE27A3DD2E5E6E538D6BB3218DFA927` |
| Owner preflight `tools\Invoke-OwnerPreflight.ps1` | `0E74F687BEAF55432879BE1E10D40DFB55A223CCED6119E6CC804AC1332E420C` |
| `qualification\Test-RealPrimitives.ps1` | `5DCD12B31D2457DA5B8219E7A004426D0A7C1DB932DA754196B6A8D5E74179D2` |
| `tools\Seal-Package.ps1` | `650971A51F2CF592DA621EEAA92A2883F1580BB2A06A10573BC4ADB4B6DD588B` |
| `qualification\Verify-Package.node.js` | `1260E1FF42CF9C3442D2C3005ACF821C7B81646ECC181878359AB9546883EABD` |
| Şablon OWNER-COMMAND / OWNER-RUN | `894BB522AC26A36E5518CC831AB30F03623C30CC300BE30D44A25D80FD0A3D2D` / `A24C04FD573EDC46C79463DED5586EDD6E8ECABEFC6B15716C83FE4E0E13842D` |
| `PACKAGE-IDENTITY.json` (bilgi; OP-01 `engineSha256` taşır) | `E2CD1F9F4DEC4048E78B6474A73FDF0EEC2B56AB0CAA2C53E6A02B46B5DCD652` — `preLiveListDigest` **ONAY ADAYI DEĞİL** |

Durum (ölçüldü): `pins/`, `authority/`, `claims/`, `journal/`, `cutover-receipts/`, `preflight/`, `MANIFEST.json`,
kök `OWNER-RUN`/`OWNER-COMMAND` **YOK**. R27 tüketildi, yeniden mühürlenemez.

### 1.4 Geri dönüş kimlikleri — RELEASE22 (şu an CANLI)

| | Değer |
|---|---|
| Kök / kaynak | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22` @ `137406701248858221d12be94a941f8837a2a245` · BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` |
| Manifest | `26B31B6976BFB596D399F31EA2688BF79D67FEFF991838E8D3B528E14A911869` — kök TAM yeniden hash **88.178/88.178 eşit** |
| `.env` (H-01 kaynağı; içerik okunmadı) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` |
| bin preimage (= canlı; `generations\R22`) | host `E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` · api `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` · web `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` |
| bin postimage (ileri; `generations\R23`) | host `691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627` · api `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` · web `F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0` |

### 1.5 CLIENT İ11 — adaya bağlanmış kimlikler (main @ `98878222`; dosya sha'ları OFFICE tarafından da ölçüldü)

| | sha256 |
|---|---|
| İ11 §9 kabul bloğu (R23'e bağlı) | `A16E479155084F3B6F7D12D7A820E2BA0760411A18FB64D749FA0799C647D148` (CLIENT ölçümü) |
| T-PENCERE-AÇ `scripts\t-window-apply.ps1` | `508C532372BA04E61677569123098A285F16388BBD5F52128DB09A1A1BFD86AB` |
| T-PENCERE-KAPA `scripts\t-window-close.ps1` | `5895CFC7B7D400F44A50DCF81A462DED05C259E86FD5B8DFF00D3F0ECD82EB27` |
| `i11-run.js` · `i11-01-setup.js` · `i11-02-intake.js` | `27821B463D2DDA5E1F180A79A677CEA13B2EAD15840D95F8218012A0E2632F4B` · `1317D727F08C81108D027C41B9B0DF9EF8E6B5C0C99979F76AEF30E3CA427DC4` · `7D8D492BC6CE4A2E2CD3CB77EEACAC01594D1DDD9D17F9F767D0625DDB251789` |
| Kurtarma `i11-03-close-links.js` · `cl-09-close-access.js` | `87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740` · `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` |
| `smtp-sink-noauth.js` | `99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800` |
| Bağlayıcı `i11-bind-candidate.ps1` · V-B `i11-vb-compiled-redaction.js` | `B1C24402E7999B89AF0A4A26E93DF9B2EAADEC7CB0609A7E7B871B0AADDFBD49` · `5E0E05384CD422A85E9FD35530A88A141798FAED968E94EC8667AB7AD5AC7ABA` |
| Bağlama kaydı `I11-CANDIDATE-BINDING.json` (CLIENT yerel kanıt) | `FCD57F04E58767ED43F85152222C1A95C5B8423C54500F432D53D580FFA157EA` |

## 2. Aday üzerinde kabul sonucu — iki taraf

### 2.1 OFFICE / C33 (derlenmiş aday ve paket)

| Kanıt | Sonuç |
|---|---|
| Derleme (RELEASE22 yordamı) | worktree add · `pnpm install --frozen-lockfile` (8.15.0) · `db:generate` · `build` — dördü exit 0 (4/27/7/69 s); turbo cache miss 3/3; `node_modules` yerel (junction yok) |
| API `dist` farkı | 16 değişen + 3 yeni (`common/party-write-tx`), silinen 0; kapsam dışı derleme farkı 0; web rota yüzeyi birebir (55/55 · 42/42) |
| Derlenmiş işaretler (satır) | `redactSecretPathSegments` 3 · `party-write-tx` 1/1/1/1 · `createPartyWriteTxContext` 2 · korunan `pureNoOpDetected` 3 · `OFFICE_WRITE_DENIED_VIEWER` 3 · `assertGenericDecisionAllowed` 5 · `LAWYER_REACTIVATE` 1 |
| Katman 1 zinciri | **11/11 exit 0** — Node 38/38 · PS 28/28 · ADIM2 39/39 · yazıcı 5/sınıflandırılamayan 0 · ADIM4 22/22 · env anahtarı RELEASE22 ile birebir · R09 37/37 (+B-072b NOT_EXECUTED) |
| R28 kalifikasyonu (motor `2AE77043…`) | NC **91/91** · gerçek primitif (yerel) **21/21** · preflight giriş yolu **12/12** / fikstür **14/14** · C36 bağlama **29/29** · OC şablonu **16/16** · verifier mühürsüz **FAIL 0** (NOT_EXECUTED 15) |
| Mühür S-06 / S-08c canlı salt-okuma | **10/10** beklenenle uyumlu (R28 mühürlenebilir; R27 mühürlenemez) |
| **Owner preflight PROVASI** (kopya; yalnız OP-00 ön-koşul yamalı; yükseltilmemiş) | **PASS 28 · FAIL 2 · NOT_MEASURED 3** — düşenlerin tamamı yükseltme kaynaklı (OP-00, OP-05c, OP-08a/09d/09e). R28'e özgü engel YOK. Kanıt `HY_C33_RELEASE23_CUTOVER_R28.PREFLIGHT-PROVA-R01\prova-preflight.json` `CE2A161ABFEA9BDEE36143814E405DA51F265CAE8089CEB205A60C1320FEED1C` |
| Geri dönüş kökü | 88.178/88.178 eşit; nesil kopyası canlı bin ile bayt-eşit |
| **D2 SONRASI aday kökü** (bağımsız, OFFICE) | Katman 1 Node doğrulayıcısı manifest `E53618ED…`'e karşı **38/38** — EXACT-SET iki yönde PASS, yeniden hash 83.437 / uyuşmaz 0; **CLIENT aday köküne yazmadı** |

### 2.2 CLIENT / İ11 (aday ikilisinde; yalnız oturuma özel DB + Redis + yerel yakalayıcı)

| Kanıt | Sonuç |
|---|---|
| Bağlama B-0..B-5 | HEAD · BUILD_ID · manifest · ürün farkı 7 · `redactSecretPathSegments` MEVCUT · İ11'in 12 ürün hash'i RELEASE22 ile aynı — **hepsi eşit** |
| **V-B** derlenmiş B-I11-3 | **PASS** — 503, ErrorLog 1 satır, ham token 0 (kanıt `7121CB3A5101692EC13057C5D54FD1AC734E5759C96C7280F8D782D3236DE951`); RELEASE22 negatif kontrol FAIL |
| **V-A** birleşik dizi (runId `64245dc2`) | T-AÇ → İ11 → kapanış → T-KAPA: **PASS 11 · FAIL 0 · ÖLÇÜLEMEYEN 0**; restart 7 s / 6 s; env bayt bayt geri (kanıt `C7E7B8E859003EDF4B42C8BF0DD125640B0B78F7329614F7D1305B3D93F1895F`) |
| Nöbetçi (CLIENT) | aday kökü dosya 88.248 → 88.248, değişen 0 (kayıt `1AF16597659351D368D210B0FE6B92C265099EFE853E7D8F1902902274BC6D33`) |

**Önceki yordam provası (RELEASE22 dist) aday kanıtı SAYILMADI**; V-A/V-B aday ikilisinde yeniden koşuldu. Tamamlanmış
testler (S · G · F · R · N3) gerekçeyle tekrarlanmadı (CLIENT R03 §3).

### 2.3 Bu kanıtların KANITLAMADIKLARI

- Yükseltilmiş ölçümler: OP-00, **PRE-06 / OP-05c CutoverWriter**, OP-08a/09d/09e escrow/writer/broker ACL — yalnız Adım 1.
- `-Live` canlı primitifler (Adım 2) ve mühür kapılarının tamamı (Adım 4 içinde).
- OFFICE #2641/#2645 davranışı **aday ikilisinde işlevsel olarak koşulmadı** (kanıt PR CI + disposable PG, kaynak üzerinde); aday bağı derlenmiş dosya sha'ları + işaretlerdir.
- **C33 H-01 sertleştirmesi ile T-pencerenin `.env` üzerindeki etkileşimi** (§5.2) — V-A oturum `.env`'inde koştu.
- İ11 canlı gözlemleri — canlıda yalnız D3'te ölçülür.

## 3. D1 hazırlığı — canlı GO'dan ÖNCE bitenler ve GO İÇİNDE kalan mekanik adımlar

**Bitti (bu GO altında):** aday derlemesi · Katman 1 mühürlü makbuz · R28 forku, nesiller, belgeler · tüm kalifikasyon ·
S-06/S-08c canlı salt-okuma · **owner preflight provası** · geri dönüş kökü doğrulaması · D2 sonrası aday kökü doğrulaması.

**Canlı GO'dan önce bitirilemez (yapısal):** onaylı kimlik (3e), Adım 2 `-Live` sonucunu (`REAL-PRIMITIVES-RESULTS.json`) ve 3b/3c
çıktılarını İÇERİR; mühür (S-02b) `liveExecuted=true` ister. Bu yüzden 3a–3f GO içinde, sabit sırayla ve §7 K-KİMLİK koşuluyla yürür.
Yazıcı OFFICE 33, bağımsız doğrulama ana yürütücü; production teması 0.

## 4. Tek yürütme sırası — kesin komutlar

Hepsi **"Yönetici olarak çalıştır" Windows PowerShell 5.1 ConsoleHost**. Her adım bir öncekinin beklenen sonucuna bağlıdır;
beklenmeyen sonuçta **DUR** ve §5 uygulanır. **Aynı anda tek canlı yürütücü:** D1 boyunca CLIENT, D3 boyunca OFFICE canlıya dokunmaz;
her devirde hat boşluğu ana yürütücüyle teyit edilir.

### D1-0 — Ratifikasyon referansı (owner)

Önerilen biçim `OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-<YYYYMMDD>-R01`. Ölçüldü: öneke ait kullanım git tüm tarihçede **0**,
origin/main'de **0**; R28 paketinde yalnız sentetik fikstür değerleri (`…-20260906-R0x-FIXTURE`, OC testi `…-20260909-R01`) — bunlar seçilmez.
Rnn revizyondur, paket numarası DEĞİLDİR.

### D1-1 — Owner preflight (salt-okuma; DB/HTTP/login 0; `.env` içeriği okunmaz)

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28'; $p="$R\tools\Invoke-OwnerPreflight.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '0E74F687BEAF55432879BE1E10D40DFB55A223CCED6119E6CC804AC1332E420C') { Write-Host 'PREFLIGHT ARACI SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Beklenen `cikis=0` `OWNER_PREFLIGHT_READY`; yazma yalnız `preflight\OWNER-PREFLIGHT-<utc>.json` + `.sha256`. Çıkış 1 FAIL · 2 NOT_MEASURED
(PASS değil) · 3 ön koşul · 4 ABORTED → DUR (mutasyon 0; neden giderilip yeniden koşulabilir). **READY cutover yetkisi değildir.**

### D1-2 — Canlı salt-okuma gerçek primitifler

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28'; $p="$R\qualification\Test-RealPrimitives.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '5DCD12B31D2457DA5B8219E7A004426D0A7C1DB932DA754196B6A8D5E74179D2') { Write-Host 'SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Live; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Beklenen `REAL_PRIMITIVES_PASS`, `liveExecuted=true`, 31/31 (21 çevrimdışı + 10 canlı), failed 0 (Seal S-02b `total>=29` ister).
Etki: 4 HTTP isteği (API `GET /` 404 · Web `GET /` 200 · `POST /api/auth/smoke/login {}` 400 · `GET /api/auth/capabilities` 200);
smoke POST canlı API belleğindeki giriş-deneme sayacını IP başına +1 artırır (DB/dosya yazması değil; mühür S-08d bir kez daha +1);
yerel test sunucusu benzersiz `%LOCALAPPDATA%\Temp\hy-r28-realprim\<utc>` altında (silme yok); `REAL-PRIMITIVES-RESULTS.json`
yeniden yazılır. Restart 0.

### D1-3 — Onaylı kimlik + çalıştırıcılar (paket yazıcısı OFFICE 33; bağımsız doğrulama ana yürütücü)

| # | İş | Kimlik etkisi |
|---|---|---|
| 3a | `docs\OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-<YYYYMMDD>-R01.md` (owner metni) | digest dışı |
| 3b | OWNER-COMMAND şablonunda `__OWNER_RATIFICATION_REF__` → ref; kök `OWNER-COMMAND.C33-CUTOVER.ps1` = şablonun bayt-kopyası | şablon digest içi, kök dışı |
| 3c | `qualification\Test-OwnerCommandTemplate.ps1` yeniden (OC-10 ref'in 3a kaydını ister) | digest içi |
| 3d | Verifier mühürsüz: `PACKAGE_STATIC_VERIFIED_UNSEALED`, V-05d canlı PASS | digest dışı |
| 3e | `docs\APPROVED-IDENTITY-<digest8>.json`; `unsealedDigest` = OR-03a (`sha256(concat(yol + ":" + sha256 + "\n"))`, ordinal sıra) — **§7 K-KİMLİK** | digest dışı |
| 3f | OWNER-RUN şablonu: ref · preflight kanıt yolu+sha (D1-1) · onaylı digest/liste (3e) · kök OWNER-COMMAND sha (3b) · kayıt yolları; kök `OWNER-RUN.C33-RELEASE23.ps1` = bayt-kopya | onay-sonrası değişen |

Yer tutucu kalırsa çalıştırıcılar DURUR (exit 90/91). Owner D1-4'ten önce onaylı digest'i ve iki çalıştırıcının sha'sını görür.

### D1-4 — Tek owner komutu (OR-00..OR-04b → SEAL [30 dk pencere] → VERIFIER → OWNER-COMMAND → motor)

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28\OWNER-RUN.C33-RELEASE23.ps1" -Confirm "C33-RELEASE23-CUTOVER-GO"
```

Motor fazları: **P** ön-uçuş (yazma 0) → **B** claim (nonce tüketilir) → **H** release-yerel (RELEASE23 `.env` CreateNew = RELEASE22 baytları;
`.env` ebeveyni + dosya `RUNTIME_CONFIG_*`, RELEASE23 kökü `IMMUTABLE_RELEASE`) → **C** API/Web Disable+Stop → bin 3 dosya atomik →
Enable+Start → **V** (DB snapshot eşit) → COMMIT (makbuz). DB yazması 0; görev kaydı değişmez.
**Tek desteklenen yol OWNER-RUN'dır**; Seal/Verifier/OWNER-COMMAND elle ayrı koşulmaz. Çıkış kodları ve karşılıkları §5.1.

### D1-5 — Teknik yayın kabulü (salt-okuma) + devir makbuzu

```powershell
& {
$want='HY_W4_RELEASE23'; $bid='dOiGPj2M0Abls0kCibY4r'; $d="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\dist\apps\api\src"
foreach($port in 8080,3002){ $c=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1; $pr=Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess); $root=if($pr.CommandLine -match '(HY_W4_RELEASE[0-9A-Z]+)'){$Matches[1]}else{'-'}; '{0} pid={1} kok={2} {3}' -f $port,$c.OwningProcess,$root,$(if($root -ceq $want){'OK'}else{'FARKLI'}) }
foreach($f in 'hukuk-task-host.exe','start-api.ps1','start-web.ps1'){ 'bin {0} {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath "C:\Ops\hukuk\bin\$f").Hash,$f }
'BUILD_ID=' + (Get-Content -Raw -LiteralPath "C:\Development\HUKUK_YAZILIMI\$want\project\apps\web\.next\BUILD_ID").Trim()
'buildManifest=' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3002/_next/static/$bid/_buildManifest.js").StatusCode}catch{$_.Exception.Response.StatusCode.value__})
'api GET / =' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/').StatusCode}catch{$_.Exception.Response.StatusCode.value__}) + ' (404 beklenir)'
$ef="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\.env"; if(Test-Path -LiteralPath $ef){ 'env sha=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $ef).Hash; 'env sddl=' + (Get-Acl -LiteralPath $ef).Sddl }else{ 'env YOK' }
foreach($m in @(@('modules\error-log\error-log.sanitize.js','redactSecretPathSegments'),@('modules\case\case.service.js','party-write-tx'),@('modules\client\client.service.js','party-write-tx'),@('modules\debtor\debtor.service.js','party-write-tx'),@('modules\lawyer\lawyer.service.js','party-write-tx'),@('common\party-write-tx.js','createPartyWriteTxContext'),@('modules\client\client.service.js','pureNoOpDetected'),@('modules\office-approval\office-write-role.policy.js','OFFICE_WRITE_DENIED_VIEWER'),@('modules\office-approval\office-approval.service.js','assertGenericDecisionAllowed'),@('modules\lawyer\lawyer.service.js','LAWYER_REACTIVATE'))){ $p=Join-Path $d $m[0]; '{0,-28} {1,-48} satir={2}' -f $m[1], $m[0], $(if(Test-Path -LiteralPath $p){@(Select-String -LiteralPath $p -SimpleMatch -Pattern $m[1]).Count}else{'DOSYA YOK'}) }
}
```

Beklenen: iki port `kok=HY_W4_RELEASE23 OK` (eski PID 46332/47004 yok) · bin `691BC146…`/`CC634BBF…`/`F39F7A54…` ·
`BUILD_ID=dOiGPj2M0Abls0kCibY4r` · `buildManifest=200` · `api GET / =404` · `env sha=7A7228B1…` · işaret satırları sırasıyla
**3 · 1 · 1 · 1 · 1 · 2 · 3 · 3 · 5 · 1** (işaret listesi ve sayım yöntemi aday kökünde ölçüldü; bloğun port/HTTP/bin kısımları
cutover öncesi anlamsızdır, koşulmadı). **Devir makbuzu CLIENT'a (yazılı):** cutover makbuzu
yolu + sha · canlı SHA/BUILD_ID · bu bloğun çıktısı · **`env sddl=` satırı = D3 kapanış taban çizgisi**. OFFICE canlıdan çekilir.

### D2 kapısı (CLIENT) — D3'ten hemen önce

Bağlama main'de (#2654). Canlı dist'te `redactSecretPathSegments` satır 3 (D1-5 çıktısı) görülmeden ve §9 bloğunun K-API/K-BLD
kapıları canlı RELEASE23'e karşı geçmeden D3 başlamaz. R23'e bağlı bloklar cutover ÖNCESİ canlıda koşulursa K-API/K-BLD'de durur (beklenen).

### D3 — Canlı pencere (CLIENT, tek yürütücü)

> **★ ASKIDA (§0):** aşağıdaki tablo E-1/E-2/E-3 nedeniyle bu hash'lerle UYGULANMAZ. R02'de: D3-0 yakalayıcı başlatma
> (`SINK_PORT=2526`, `SINK_LOG=<CLIENT scratchpad>\i11s\runs\smtp-sink.jsonl`), yükseltilmiş Administrators yürütücü ve yeni hash'ler.

| Sıra | Komut (CLIENT kaynaklı; sha doğrulanmadan koşulmaz) | Girdi | Etki |
|---|---|---|---|
| D3-1 | **T-PENCERE-AÇ** `t-window-apply.ps1` `508C5323…` | `T_MODE=live`, `T_GOREF=<İ11 GO ref>` | K-T0 `.env` ön görüntü yedeği · K-T1..T3 yakalayıcı yalnız loopback, AUTH ilan yok · K-T4 API tek dinleyici · **K-T5 ayın 1'i 02:00–05:00 reddi** · **K-T6 Web durur + `I11-WINDOW-BLOCK-8080/-3002` gelen engeli** · `.env`'de TAM iki satır (`SMTP_HOST=127.0.0.1`, `SMTP_PORT=2526`) · API restart (bütçe 180 s) |
| D3-2 | **İ11 §9 bloğu** `A16E4791…` — TEK KEZ | `$GoRef` = İ11 GO ref · `$SendGo` = aynı ref · `$SmtpAck = 'EVET'` | K-GO/K-WT/K-ARC (9 araç + 12 ürün hash) kapıları · tek `node i11-run.js` · yazma yalnız `cl-acc-<runId>` (gönderim açık **28 satır**; başarısız gönderimde 21) |
| D3-3 | **Kapanış** (koşum sonucundan bağımsız; yalnız `CL_RUN_ID`) | `i11-03-close-links.js` `87C16DB3…` · `cl-09-close-access.js` `01273998…` | bağlantılar REVOKED · anonim yol 404 · 3 User pasif · Case CLOSED; tekrarı güvenli |
| D3-4 | **T-PENCERE-KAPA** `t-window-close.ps1` `5895CFC7…` — **HER SONUÇTA** | `T_MODE=live`, `T_RUNID=<runId>` | K-T10b pozitif hedef kanıtı · `.env` ön görüntüye (sha birebir) · API restart (180 s) · engel kuralları kaldırılır + Web başlar · yakalayıcı durur · sentetik alan dışı ileti → otomatik yeniden gönderim YOK |
| D3-5 | **Kapanış ölçütü (salt-okuma; OFFICE ekledi)** | D1-5 bloğunun iki `env` satırı | `env sha=7A7228B1…` VE `env sddl` = D1-5 taban çizgisi; API/Web kökü RELEASE23 |

## 5. Kapanış ve geri dönüş — TÜM sonuçlarda

### 5.1 Karar tablosu

| Nokta / sonuç | Canlı durum | Yapılacak |
|---|---|---|
| D1-1 veya D1-2 beklenmeyen | RELEASE22, mutasyon 0 | DUR; neden giderilir, adım yeniden koşulabilir (sonuç dosyaları üzerine yazılır) |
| D1-3 K-KİMLİK sağlanmaz | RELEASE22 | DUR; fark owner'a sunulur |
| D1-4 exit **90 / 91** (motor koşmadı) | RELEASE22 | neden giderilir; OWNER-RUN yeniden (authority varsa ve claim yoksa reseal'i kendisi yapar) |
| exit **1** `HARD_STOP_PREFLIGHT_NOT_APPLIED` | RELEASE22, mutasyon 0, makbuz yazıldı | **reseal YOK**; OWNER-COMMAND doğrudan yalnız aynı pencerede ve **AYRI owner kararıyla** (bu GO kapsamında DEĞİL); pencere dolduysa yeni C33 paket numarası + yeni ratifikasyon · D3 başlamaz |
| exit **2** `ROLLBACK_COMPLETE_OLD_RUNTIME_RESTORED` | RELEASE22 geri, nonce tüketildi | D3 İPTAL; D1-5 bloğu **geri yön beklentisiyle** doğrulanır; yeni deneme = yeni paket numarası (R29) + yeni ratifikasyon |
| exit **3** `HARD_STOP_STATE_UNCERTAIN_MANUAL_RECOVERY_REQUIRED` | belirsiz | §5.3 elle kurtarma + geri yön doğrulaması; D3 İPTAL |
| exit **70** (makbuz birincil yola yazılamadı; motor koştu) | makbuz/journal okunur | owner kararı; D3 başlamaz |
| exit 0 fakat **D1-5 teknik kabul düşer** | RELEASE23 canlı, doğrulanmadı | D3 İPTAL; §5.3 elle geri dönüş + geri yön doğrulaması |
| D2 kapısı düşer | RELEASE23 canlı ve teknik kabul geçmiş | D3 başlamaz (yazma 0); yayın kalır; İ11 açık |
| D3-1 bir kapıda durur | K-T0 yedeği alınmış olabilir | D3-2 koşulmaz; **D3-4 yine koşulur** (idempotent) |
| D3-2 başarısız / yarıda | sentetik tenant yazmaları | D3-3 yalnız runId ile → D3-4 |
| D3-4 restart bütçesi aşımı | `.env` zaten ön görüntüde | owner'a DERHAL; otomatik tekrar YOK |
| D3-5 `env sddl` taban çizgisinden farklı | içerik bayt-eşit | owner'a bildirilir; otomatik ACL düzeltmesi YOK |
| **D3 açıkken yayın geri dönüşü gerekirse** | — | **ÖNCE D3-4** (env · engel · Web), **SONRA** §5.3 — **yalnız E-2 düzeltmesinden SONRA geçerli (§0)**; mevcut T-KAPA API kalkmazsa engel kurallarını ve kapalı Web'i BIRAKIR |

Veri: migration yok. Koşum yazmaları **geri alınmaz**, kapatılır ve kanıt olarak kalır; `cl-acc-<runId>` yeniden açılmaz.
Geri dönüş RELEASE23'ün üç düzeltmesini geri alır (#2641 · #2645 · #2643 B-I11-3 kusurları canlıya döner); AK-2/AK-1a/CLF-O0-01/B-1 RELEASE22'dedir.

### 5.2 Etkileşim — ÖLÇÜLMEDİ, kapanış ölçütüne bağlandı

Motor H-01 RELEASE23 `.env`'e `RUNTIME_CONFIG_FILE` uygular (korumalı DACL: SYSTEM FA · Administrators FA · runtime FR; sahip SYSTEM).
Canlı RELEASE22 `.env` bugün aynı sınıfta (preflight provası OP-09h PASS). T-PENCERE-AÇ mevcut dosyaya `Set-Content` yazar
(yönetici FA → yazabilir), T-PENCERE-KAPA `Copy-Item -Force` ile geri yazar ve ACL'e dokunmaz. İçerik bayt-eşit döner; **DACL ve
sahibin korunduğu ölçülmedi** → D3-5.

### 5.3 Elle geri dönüş (yalnız bin + görev katmanı; sha ve ACL korumalı; tek parça `& { }`)

```powershell
& {
$ErrorActionPreference='Stop'
$G='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28\generations\R22'; $B='C:\Ops\hukuk\bin'
$exp=[ordered]@{'hukuk-task-host.exe'='E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706';'start-api.ps1'='77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51';'start-web.ps1'='1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D'}
foreach($f in $exp.Keys){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $G $f)).Hash -cne $exp[$f]){ throw "rollback kaynagi sapmis: $f" } }
$sd=@{}; foreach($f in $exp.Keys){ $sd[$f]=(Get-Acl -LiteralPath (Join-Path $B $f)).Sddl }
Stop-ScheduledTask -TaskName 'HukukPlatform-API'; Stop-ScheduledTask -TaskName 'HukukPlatform-Web'
$t0=Get-Date; while((Get-NetTCPConnection -State Listen -LocalPort 8080,3002 -ErrorAction SilentlyContinue) -or (Get-Process -Name 'hukuk-task-host' -ErrorAction SilentlyContinue)){ if(((Get-Date)-$t0).TotalSeconds -gt 90){ throw 'surecler 90 s icinde durmadi - DUR' }; Start-Sleep -Milliseconds 500 }
foreach($f in $exp.Keys){ $d=Join-Path $B $f; Copy-Item -LiteralPath (Join-Path $G $f) -Destination $d -Force; if((Get-FileHash -Algorithm SHA256 -LiteralPath $d).Hash -cne $exp[$f]){ throw "geri yazim dogrulanamadi: $f" }; $a=Get-Acl -LiteralPath $d; if($a.Sddl -cne $sd[$f]){ $a.SetSecurityDescriptorSddlForm($sd[$f]); Set-Acl -LiteralPath $d -AclObject $a } }
Enable-ScheduledTask -TaskName 'HukukPlatform-API' | Out-Null; Enable-ScheduledTask -TaskName 'HukukPlatform-Web' | Out-Null
Start-ScheduledTask -TaskName 'HukukPlatform-API'; Start-ScheduledTask -TaskName 'HukukPlatform-Web'
}
```

Ardından D1-5 bloğu geri yön beklentileriyle koşulur: kök `HY_W4_RELEASE22`, BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ`, bin = preimage,
işaret satırları **0 · 0 · 0 · 0 · 0 · DOSYA YOK · 3 · 3 · 5 · 1** (aynı işaret listesi ve sayım yöntemi RELEASE22 kökünde bugün ölçüldü); blokta `$want`/`$bid` geri değerlerle koşulur.

## 6. Kesinti ve süre

| Pencere | Beklenti | Üst sınır / kural |
|---|---|---|
| D1 cutover (API+Web) | **~15–60 s** (emsaller 14,673 · 13,716 · 57,647 · **39,467 s**; nedeni ölçülmedi) | quiesce 90 s + start 240 s (ayrı); rollback süresi ölçülmemiş; Web BUILD_ID değişir (sekmeler bir kez yenilenebilir) |
| Authority | SEAL'den itibaren 30 dk, tek kullanım | pencere dolarsa §5.1 exit 90/91 satırı |
| D3 bakım penceresi | Web kapalı + :8080/:3002 dışarıya kapalı; API iki restart (aday provası 7 s / 6 s) | her restart 180 s; aşımda otomatik tekrar YOK; geçmiş süre garanti değildir (2026-09-11 logon beklemesi 35,5 dk) |

Cutover penceresinde kabul/sentetik tenant koşumu YAPILMAZ (motor V-01 DB snapshot eşitliği rollback tetikler).

## 7. TEK KOŞULLU OWNER GO TASLAĞI (owner onayına)

> **★ ASKIDA — OWNER'A SUNULMAZ (§0).** Madde 1'deki İ11 §9 / T-AÇ / T-KAPA hash'leri geçersizleşecek; madde 5–6 E-1/E-2/E-3
> düzeltmeleri olmadan uygulanamaz. R02 ayrıca şunları taşıyacak: D3 yürütücüsü **yükseltilmiş Administrators** oturum (kim sağlar: owner
> veya owner'ın açtığı yükseltilmiş kabuk — açık yazılır) · D3-0 yakalayıcı ön koşulu · ana yürütücüye §1 bağımsız yeniden ölçüm ve
> K-KİMLİK OR-03a bağımsız hesap görevinin **bu GO ile ATANMASI** · `ENV-PREIMAGE.env` korumalı DACL kapısı.

> **GO — RELEASE23 CANLI YAYIN + CLIENT İ11 TAM CANLI KABUL (TEK KOŞULLU ONAY)**
>
> Referanslar: C33 `OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-<YYYYMMDD>-R01` · İ11 `OWNER-GO-CLIENT-I11-<YYYYMMDD>-R<nn>`
> (gönderim kapsamı `$SendGo` = aynı İ11 ref'i · `$SmtpAck = 'EVET'` · Yöntem T #2644).
>
> 1. **Sabit kimlikler:** kaynak `2740df3dd58c5e711a790cc21a5f69d6dbffb35d`, aday kökü `HY_W4_RELEASE23`, BUILD_ID
>    `dOiGPj2M0Abls0kCibY4r`, manifest `E53618ED…61AD5`, paket `HY_C33_RELEASE23_CUTOVER_R28` (motor `2AE77043…A927`),
>    İ11 §9 `A16E4791…D148`, T-AÇ `508C5323…86AB`, T-KAPA `5895CFC7…EB27` — tam değerler bu belge §1. Başka SHA/kök/paket kullanılmaz;
>    herhangi bir sha uyuşmazlığında DUR.
> 2. **D1 (OFFICE/C33):** D1-1 preflight `OWNER_PREFLIGHT_READY` → D1-2 `-Live` `REAL_PRIMITIVES_PASS` (live) → D1-3 3a–3f →
>    D1-4 tek OWNER-RUN komutu → D1-5 teknik kabul (§4 beklenenleri birebir). Her adım yalnız öncekinin beklenen sonucuyla başlar.
> 3. **K-KİMLİK (bu GO'nun 3e onayı yalnız şu koşulla geçerlidir):** OR-03a digest'i OFFICE 33 ve ana yürütücü tarafından
>    **bağımsız** hesaplanır ve **eşittir**; onaylı liste ile `PACKAGE-IDENTITY.json` (§1.3 sha) listesi arasında dosya kümesi
>    AYNIDIR ve sha farkı YALNIZ `qualification/REAL-PRIMITIVES-RESULTS.json`, `fork/templates/OWNER-COMMAND.C33-CUTOVER.forked.ps1`,
>    `qualification/OWNER-COMMAND-TEMPLATE-RESULTS.json` dosyalarındadır (OWNER-RUN OR-03b kimlik dışı kuralları aynen). Aksi hâlde
>    DUR ve fark owner'a sunulur.
> 4. **D2 kapısı (CLIENT):** canlı dist'te `redactSecretPathSegments` satır 3 ve §9 K-API/K-BLD canlı RELEASE23'e karşı geçer; aksi hâlde D3 başlamaz.
> 5. **D3 (CLIENT, tek yürütücü):** T-AÇ → İ11 §9 (gönderim AÇIK) **TEK KEZ** → kapanış (runId) → T-KAPA **her sonuçta** →
>    D3-5 kapanış ölçütü. Bakım penceresidir (Web durur, :8080/:3002 dışarıya kapalı); restart bütçesi 180 s; aşımda otomatik tekrar YOK.
> 6. **Kapanış/geri dönüş (§5.1 bu GO'nun parçasıdır):** exit 2/3 veya D1-5 düşerse D3 İPTAL ve RELEASE22'ye dönüş doğrulanır
>    (exit 3 / D1-5 düşüşünde §5.3 elle yol bu GO kapsamındadır); D3 açıkken geri dönüş gerekirse önce T-KAPA. exit 1 sonrası
>    OWNER-COMMAND'ın doğrudan koşulması ve exit 70 sonrası her adım **ayrı owner kararıdır**. Otomatik reseal/tekrar YOK;
>    tüketilen ref/nonce yeniden kullanılmaz.
> 7. **Kapsam dışı:** migration · bayrak · ikinci API süreci · gerçek kişiye gönderim · başka tenant'a yazma · `ENV-PREIMAGE.env`
>    yedeğinin ve `CL_TOKENFIX` artığının silinmesi · RELEASE22 kökünde değişiklik.
>
> **IF GO-COMPLETE:** RELEASE23 canlı (`C33_RELEASE23_CUTOVER_APPLIED_AND_VERIFIED` + D1-5 PASS) · İ11 üç gözlemle canlıda kapandı ·
> D3-5 kapanış ölçütü PASS · CLIENT sayaç 10/17 → **11/17** · hizmet kabulü **0/8 tam** · `CL_TOKENFIX` ayrı açık kalem.

## 8. Açık kalemler (kapatılmış gösterilmez)

| Kalem | Durum |
|---|---|
| **`CL_TOKENFIX` disk artığı** (`C:\Development\HY_WT\CL_TOKENFIX`) | **AYRI AÇIK KALEM** (CLIENT) — git kaydı 0, yalnız disk; kancayı aşacak alternatif silme yolu denenmedi ve denenmeyecek; seçenek (a) owner siler (b) kancayı tetiklemeyen yola açık onay |
| `ENV-PREIMAGE.env` (D3 sonrası CLIENT oturum dizininde canlı `.env` kopyası) | D3 sonrası akıbeti ayrı karar; T-AÇ'ın tekrar-açma kilidi olarak da çalışır. **§0 (c): mevcut blokta ACL KORUMASIZ (scratchpad kalıtsal ACL, 6 ek SID/grup Modify) — CLIENT düzeltmesi bekleniyor** |
| **D3 engelleyicileri E-1 / E-2 / E-3** (§0) | AÇIK — CLIENT düzeltip oturuma özel ortamda yeniden kanıtlayacak; yeni hash + merge SHA → bu paketin R02'si |
| main ≠ aday — #2655 B11 @ `78f49dd3` | RELEASE23'te YOK (sabit aday); canlıya çıkışı ayrı aday/ayrı karar |
| Ana yürütücü rol ataması (§1 yeniden ölçüm + K-KİMLİK) | owner GO ile atanacak; akran talebiyle üstlenilmedi, ölçüm yapılmadı |
| PRE-06 / OP-05c · OP-08a/09d/09e | yalnız D1-1 yükseltilmiş oturumda ölçülür; NOT_MEASURED PASS sayılmaz |
| OFFICE AK paketi K-BLD pinleri | RELEASE22'ye bağlı (`lawyer.service.js` `427DB2F1…`); RELEASE23'te `29812F1C…` → paket DURUR (beklenen; AK kabulü KAPALI, yeniden koşulmaz) |
| İ12 | başlatılmadı |

---

**Canlı değişiklik yok.** CLIENT sayaç **10/17**; hizmet kabulü **0/8 tam**.
