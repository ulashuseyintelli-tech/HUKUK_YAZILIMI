# OFFICE — ROLLBACK BUILD_ID ERRATUM R01

```text
Kimlik     : OFFICE-ROLLBACK-BUILDID-ERRATUM-R01
Tarih      : 2026-09-09
Yetki      : Owner kararı — "PAKET DIŞI ERRATUM / YOL (B)"
Kapsam     : YALNIZ kayıt düzeltmesi. Mühürlü paket DEĞİŞTİRİLMEDİ; yeniden mühür,
             deploy, migration veya rollback ÇALIŞTIRILMADI.
Bulan      : CLIENT hattının bağımsız I7 uzlaştırması (PR #2585, başka oturum)
Doğrulayan : Ana yürütücü (PAGE-O0), bağımsız salt-okuma ölçümü
```

## 1. DÜZELTİLEN KAYIT — tam bağ

| Bağ | Değer |
|---|---|
| Etkilenen dosya (aday) | `HY_C33_RELEASE21_CANDIDATE\cutover-staging\generations\WEB-LAUNCHER-GENERATION.json` |
| Etkilenen dosya (mühürlü kopya) | `HY_C33_RELEASE21_CUTOVER_R25_VERIFY_REPAIR_CANDIDATE_20260909T105432Z\evidence\WEB-LAUNCHER-GENERATION.json` |
| Kök | `C:\Development\HUKUK_YAZILIMI\` |
| **İkisinin sha256** | **`7118447D403166CF421CD1B374162FB6342E1E1FC2C1641DF93D40A44823FEE5`** (1025 bayt, **birebir aynı**) |
| JSON alanı | `rollbackGeneration.buildId` |
| **Yanlış değer** | **`lt2ag97od6jT4jHG2NX7N`** — bu **RELEASE18**'in BUILD_ID'sidir |
| **Doğru değer** | **`LW4jlJUOMHrvVEqakKB3i`** — RELEASE20 |
| RELEASE20 kökü | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE20` |
| Gerçek BUILD_ID dosyası | `…\HY_W4_RELEASE20\project\apps\web\.next\BUILD_ID` |
| O dosyanın içeriği | `LW4jlJUOMHrvVEqakKB3i` |
| O dosyanın sha256 | `ACE90BEFC7501A78940898D06002BA59FC188FCE8B28854F31E5E32AF03A0BAE` |

Aynı dosyadaki diğer alanlar **doğrudur ve dokunulmamıştır**: `rollbackGeneration.generationId`
= `R20`, `rollbackGeneration.releaseRoot` = `…\HY_W4_RELEASE20`, `forwardGeneration.buildId`
= `g91HUaBesekB-R2rRawQj`.

Ölçülen BUILD_ID eşlemesi (dört release kökü, tek tek okundu):

```text
R18  lt2ag97od6jT4jHG2NX7N     <- kayitta YANLIS olarak duran deger
R19  xFgJAoTFqlTjW89Zf2CYS
R20  LW4jlJUOMHrvVEqakKB3i     <- DOGRU rollback degeri
R21  g91HUaBesekB-R2rRawQj     <- canli (forward)
```

## 2. ÇALIŞTIRICI VE DOĞRULAYICI İNCELEMESİ (salt-okuma)

Owner talimatı: *"Çalıştırıcı yanlış değeri zorunlu kapı olarak kullanıyorsa yalnız belge
ekleyerek 'çözüldü' deme."* İnceleme yapıldı.

### 2.1 Bu alanı kim okuyor?

| Aranan yüzey | `rollbackGeneration` | `LAUNCHER-GENERATION` |
|---|---|---|
| Mühürlü paket `…R25_VERIFY_REPAIR_CANDIDATE_20260909T105432Z` (cutover ve rollback'i **fiilen çalıştıran**) | **0 dosya** | **0 dosya** |
| `HY_C33_RELEASE21_CUTOVER_R25` | **0** | **0** |
| `C:\Ops\hukuk\bin` (canlı launcher + host) | **0** | **0** |
| `HY_C33_RELEASE21_CANDIDATE` | 2 | 3 |

Aday paketteki dört eşleşmenin tamamı **üreten** (yazan) taraftır, tüketen değil:
`tooling/stage-launcher-generation.js` · `tooling/stage-web-launcher-generation.js` ·
`tooling/fork-r20-to-r21.js`.

**Körlük kontrolü (pozitif kontrol):** aynı tarama deseni aynı mühürlü pakette
`buildId`/`BUILD_ID` için **eşleşme buluyor** — `engine/Invoke-C33Cutover.ps1:423` (P-05) ve
`:626` (C-04). Arama uzayı boş değildir ve desen çalışmaktadır; yukarıdaki **0** değerleri kör
ölçüm sonucu değildir. Bulunan bu iki kullanım **forward** pinine aittir
(`$pins.runtime.webBuildId` / `webBuildIdPath`), rollback kaydına değil.

### 2.2 Rollback kapısı neyi doğruluyor?

`engine/Invoke-C33Cutover.ps1:704` — **R-01** kapısının doğruladıkları:

```text
yeni runtime durdu · bin preimage 3/3 GERI (byte-exact) · task kaydi degismedi ·
olusturulan RELEASE21 .env kaldirildi · ACL preimage geri · eski API+Web (RELEASE20)
Running + saglikli · RELEASE20 .env degismedi · DB snapshot ayni · anahtar uretimi YOK
```

**BUILD_ID bu listede YOKTUR.** Rollback'in kimlik bağı **launcher ve host sha256
byte-eşitliği**dir (P-06 ile pinlenir), BUILD_ID alanı değil. Ölçülen rollback malzemesi:

```text
generations/R20/start-web.ps1   E95EF7D7928CFED007909B191B18C1EDB6BE5A5FBC89F6E391CB128B149B9F5B
generations/R20/start-api.ps1   DC4C5AE49B4319F3237CECFED6315923719D234D8C1681BAAB5979BDDEC32489
```

### 2.3 Sonuç

**Yanlış değer hiçbir çalıştırılabilir yolda zorunlu kapı DEĞİLDİR.** Paket dışı erratum
**operasyonel olarak yeterlidir**; bu hüküm ölçüme dayanır, varsayıma değil.

## 3. ERRATUM OPERASYON SIRASINDA NASIL ESAS ALINIR

1. Rollback **kararı** ve **doğrulaması** R-01'in ölçtüğü byte-exact preimage'lara göre yapılır;
   BUILD_ID alanı karar girdisi **değildir**.
2. Bir insan veya araç `rollbackGeneration.buildId` alanını **okursa**, geçerli değer
   **`LW4jlJUOMHrvVEqakKB3i`**'dir. Dosyadaki `lt2ag97od6jT4jHG2NX7N` **geçersizdir**; bu
   erratum onu bağlayıcı olarak geçersiz kılar.
3. Rollback sonrası web sürümü teyit edilecekse kaynak **dosyadır**:
   `…\HY_W4_RELEASE20\project\apps\web\.next\BUILD_ID` (sha256 `ACE90BEF…`), JSON alanı değil.
4. `lt2ag97od6jT4jHG2NX7N` görüldüğünde **RELEASE18'e yönelinmez.** RELEASE18 rollback hedefi
   değildir; hedef RELEASE20'dir.

## 4. KÖK NEDEN VE ÖNERİLEN DAR DÜZELTME (incelemeye sunulur, UYGULANMADI)

Kök neden ölçüldü — değer bir dosyadan okunmuyor, **jeneratörde sabit literal**:

```text
dosya    : HY_C33_RELEASE21_CANDIDATE\tooling\stage-web-launcher-generation.js
sha256   : 542EC5BC38D459A6E6742AE952BC58E7AD1B1C000B7B877E7B47A7ECC38040E1  (3449 bayt)
satir 37 : rollbackGeneration: { ... buildId: 'lt2ag97od6jT4jHG2NX7N' }        <- LITERAL
satir 38 : forwardGeneration:  { ... buildId: readFileSync(bidPath) }          <- DOSYADAN
```

`forwardGeneration` değeri `RNEXT`'in BUILD_ID **dosyasından** okur; `rollbackGeneration`
okumaz. `RPREV` (`…\HY_W4_RELEASE20`) zaten aynı betikte tanımlıdır (satır 12).

**Önerilen dar düzeltme:** satır 37'deki literal, `forwardGeneration` ile aynı biçimde
`path.join(RPREV,'project','apps','web','.next','BUILD_ID')` dosyasından okunacak şekilde
değiştirilsin.

**Neden gereklidir:** literal kaldığı sürece aynı kusur **bir sonraki forkta (R21→R22) aynen
tekrarlanır** — bu turda R18 değerinin R20 kaydında kalmasının sebebi tam olarak budur.

**Bu düzeltme bu turda UYGULANMADI**; owner incelemesine sunulur. Uygulanması yeni paket
üretimi anlamına gelir ve ayrı karar gerektirir.

## 5. `hukuk-task-host.exe` — DEVRALINAN DENETLENEBİLİRLİK AÇIĞI

Çalışan host binary'sinin sha256'sı **hiçbir mühürlü kayıtta bulunmamaktadır**.

**Owner talimatı gereği:** bu turda yapılan hash ölçümü **geçmişte mühürlenmiş kanıt
SAYILMAZ**. Sonradan ölçülen bir değer, cutover anında o değerin geçerli olduğunu kanıtlamaz.

**Mevcut teslim ölçütüne etkisi:** teslim ölçütünün *"release/rollback kanıtları tam"* ayağı bu
kalem nedeniyle **tam karşılanmamaktadır**. Cutover kapısı C-02 `hostReplaced` geçmiştir ve
kimlik bağı `HOST-GENERATION.json`'daki `pins`'tir (`byteExactReproducible: false` /
`semanticIdentity: true` kaydıyla tutarlı) — **yetenek** tarafında kusur ölçülmemiştir. Açık
olan **denetlenebilirliktir**: bağımsız bir denetçi, cutover anında çalışan host'un hangi binary
olduğunu mühürlü kayıttan **doğrulayamaz**.

Bu açık **kapatılmamıştır**; teslim tablosunda açık kalem olarak görünür ve gelecek sürümde host
sha256'sının mühür anında kayda alınmasıyla kapanır.
