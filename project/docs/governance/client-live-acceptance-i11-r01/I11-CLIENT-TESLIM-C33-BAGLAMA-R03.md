# CLIENT İ11 — C33 YAYIN PAKETİNE BAĞLANAN TEK CLIENT TESLİMİ (R03)

```text
BELGE        : I11-CLIENT-TESLIM-C33-BAGLAMA-R03   (R02 tek canlı GO paketinin CLIENT eki)
YETKİ        : owner GO 2026-09-12 "CLIENT İ11 / ADAYA BAĞLAMA VE SON KABUL HAZIRLIĞI"
DURUM        : HAZIR — C33 DERLENMİŞ ADAY TESLİMİNİ BEKLİYOR · canlı kabul YAPILMADI
SABİT KAYNAK : 2740df3dd58c5e711a790cc21a5f69d6dbffb35d   (ikinci aday / yayın hattı AÇILMAZ)
C33 TESLİMİ  : ÖLÇÜLDÜ — YOK (aşağıda §1)
YAPILMAYAN   : canlı DB bağlantısı · canlı görev/firewall/env değişikliği · aday derlemesi · İ12
```

## 1. C33 teslim durumu — ÖLÇÜLDÜ, tahmin yok

| Arama | Sonuç |
|---|---|
| `2740df3d`'de duran worktree | **YOK** |
| `HY_W4_RELEASE23*` / `HY_C33_RELEASE23*` / `HY_C33_*R28*` | **YOK** |
| main'de `2740df3d`'yi anan C33/yayın kaydı | **YOK** (tek isabet CLIENT'ın R02 belgesi) |
| Açık C33 PR'ı | **YOK** |

→ **Derlenmiş aday teslim edilmedi.** GO madde 2'deki bağlama ve aday üzerindeki doğrulama bu teslimle
tetiklenir; teslim gelince **yeniden GO beklenmeden** §3–§4 yürütülür.

## 2. C33'ten beklenen ve BAĞLANACAK alanlar — eksik olan TAHMİN EDİLMEZ

| Alan | Kaynak | Bağlayıcının davranışı |
|---|---|---|
| **Aday kökü** (mutlak yol) | C33 yazılı teslimi | yoksa **DURUR** (`B-GİRDİ`) |
| **Tam kaynak SHA** | kökün `.git` → `HEAD` ölçümü | `2740df3d…` değilse **DURUR** (`B-0`, "ikinci aday açılmaz") |
| **Web BUILD_ID** | C33 bildirimi **ve** `.next/BUILD_ID` ölçümü | ikisi eşit değilse **DURUR** (`B-1`) |
| **Aday manifesti** (yol + sha256) | C33 bildirimi **ve** dosya ölçümü | eksik ya da eşit değilse **DURUR** (`B-2`) |
| Ürün kaynak farkı | `git diff 13740670..2740df3d` | bilinen **7 dosya** dışında fark → **DURUR** (`B-3`), kapsama ekleme yok |
| B-I11-3 derlenmiş mi | aday dist `error-log.sanitize.js` | `redactSecretPathSegments` yoksa **DURUR** (`B-4`) |
| 12 İ11 ürün hash'i + `main.js` | aday dist ölçümü | ölçülür; RELEASE22'den farklı olanlar **derleme farkı** olarak kaydedilir (`B-5`) |

### 2.1 Bağlayıcı — `scripts/i11-bind-candidate.ps1`

sha256 `B1C24402E7999B89AF0A4A26E93DF9B2EAADEC7CB0609A7E7B871B0AADDFBD49` · repo dosyası **değiştirmez**;
bağlama kaydını (`I11-CANDIDATE-BINDING.json`) yerel dizine yazar · canlıya dokunmaz.

**Çalıştığı gösterildi (sözdizimi değil, koşum):**

| Sınama | Sonuç |
|---|---|
| **Öz-sınama** — ölçüm kodu canlı RELEASE22 köküne karşı | HEAD eşit · **12/12 hash kayıtlı değerle EŞİT** · B-I11-3 RELEASE22'de **YOK** (doğru) → **GEÇTİ** |
| C33 teslimi eksik | **DURDU**: "BIND_ROOT verilmedi — C33 teslimi EKSİK; kimlik TAHMİN EDİLMEZ" |
| Yanlış kök (HEAD sabit kaynak değil) | **DURDU**: "B-0 … sabit kaynak DEĞİL — ikinci aday AÇILMAZ" |

**Teslim gelince (yeniden GO gerekmez):**

```powershell
$env:BIND_ROOT         = '<C33 aday koku>'
$env:BIND_BUILD_ID     = '<C33 bildirdigi BUILD_ID>'
$env:BIND_MANIFEST     = '<C33 aday manifest yolu>'
$env:BIND_MANIFEST_SHA = '<C33 bildirdigi manifest sha256>'
& '.\project\docs\governance\client-live-acceptance-i11-r01\scripts\i11-bind-candidate.ps1'
```

## 3. Aday üzerindeki EKSİK doğrulama — neyin koşulacağı ve NEDEN

Önceki başarılı testler **somut gerekçe olmadan tekrarlanmaz**. Aday ikilisi RELEASE22'den farklı
olduğu için yalnız **ikili farkından etkilenebilecek** doğrulamalar koşulur:

| Doğrulama | Aday üzerinde | Gerekçe |
|---|---|---|
| **V-A** Birleşik dizi: T-PENCERE-AÇ → İ11 (gönderim AÇIK) → kapanış → T-PENCERE-KAPA | **KOŞULUR** | Ürün ikilisi değişti (7 dosya); kabul edilecek olan **aday ikilisidir**. Taşıma gövdesi kanıtı (A-5 token YOK / A-6 VAR, `sha256(token)=tokenHash`) ve pozitif hedef kanıtı bu dizinin içindedir |
| **V-B** Derlenmiş B-I11-3 | **KOŞULUR (YENİ)** | Onarım yalnız birim testte doğrulandı; canlıya çıkacak olan **derlenmiş** ikili. Gerçek süreçte gerçek hata kayıt yolu sürülür |
| S (kurulum rollback) · G (ref kapıları) · F (dur kuralı) · R (runId kurtarma) | **TEKRARLANMAZ** | Düzenek düzeyindedir; aday farkındaki 7 dosyanın hiçbirine dokunmaz |
| N3 (gönderim hatası envanteri) | **TEKRARLANMAZ** | `client-info-request.service` / `email-provider.service` aday farkında **yok** |

### 3.1 V-B aracı — `scripts/i11-vb-compiled-redaction.js`

sha256 `5E0E05384CD422A85E9FD35530A88A141798FAED968E94EC8667AB7AD5AC7ABA` · yalnız **oturuma özel DB**
(kapı: `5432`/`hukuk_db` reddedilir) · sentetik token üretir, **basmaz**.

Yöntem: API, public-intake hız sınırının Redis'ine **ulaşamayacak** biçimde başlatılır → uç
**fail-closed 503** → küresel filtre → `ErrorLog`. PASS = satır var · **hiçbir alanında token YOK** ·
`endpoint = /api/public/intake/:token`.

**Negatif kontrol — onarımsız RELEASE22 ikilisinde (ÖLÇÜLDÜ):**

```json
{ "verdict": "FAIL", "http503": true, "errorLogRows": 1,
  "rowsWithRawToken": 1, "rowsWithMaskedRoute": 0,
  "endpointsSeen": ["/api/public/intake/<SENTETIK-TOKEN>"] }
```

→ Araç **boş değil**: onarımsız ikilide sızıntıyı yakalıyor. **Aday ikilisinde PASS vermesi gerekir.**

### 3.2 Aday doğrulama komutları (teslim + bağlama sonrası)

```bash
# Ortam: yalniz oturuma ozel DB + Redis + yerel yakalayici (canli DB/gorev/firewall/env YOK)
S="<oturum scratchpad>"; CAND="<C33 aday koku>"; CAND_MAIN_SHA="<B-5 ciktisindaki main.js sha256>"

# V-B — limiter Redis'i ULASILAMAZ (I9S_PUBLIC_INTAKE_REDIS VERILMEZ)
I9S_DIST="$CAND/project/apps/api/dist/apps/api/src/main.js" I9S_DIST_SHA="$CAND_MAIN_SHA" \
I9S_PORT=8101 I9S_SESSION_DB='5442/<oturum db>' I9S_DB='<oturum db url>' I9S_WORK="$S/i11s/vbwork" \
  node "$S/i9s/start-api-r22s.js"
VB_API='http://127.0.0.1:8101/api' VB_DB='<oturum db url>' VB_SESSION_DB='5442/<oturum db>' \
  node project/docs/governance/client-live-acceptance-i11-r01/scripts/i11-vb-compiled-redaction.js   # exit 0 = PASS

# V-A — birlesik dizi (T_MODE=prova; limiter Redis'i oturuma ozel; SMTP .env'den)
#   T-PENCERE-AC -> i11-run.js (gonderim ACIK) -> T-PENCERE-KAPA  (R02 §3 ile ayni sira)
```

## 4. TEK CLIENT TESLİMİ — C33 yayın paketine bağlanır

### 4.1 Aday kimliği

| Alan | Değer |
|---|---|
| Sabit ürün kaynağı | `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` |
| Ürün farkı (RELEASE22'ye göre) | 7 dosya — **#2641 · #2643 · #2645**; migration 0; schema/lock/web değişmedi |
| Aday kökü · BUILD_ID · manifest · 12 hash · `main.js` | **C33 teslimiyle doldurulur** (§2) — şu an **BOŞ**, tahmin edilmedi |

### 4.2 Kesin komutlar ve tam hash'ler (hepsi repoda, `scripts/`)

| Dosya | sha256 | Kanıt |
|---|---|---|
| `t-window-apply.ps1` (T-PENCERE-AÇ) | `D07E3F3DD6DAAB887842F676C86BE5C4360B9643EE25BBCAA0200127BA8BE0C7` | birleşik provada **koşuldu, geçti** (R02 §3) |
| `t-window-close.ps1` (T-PENCERE-KAPA) | `D84C3B3A0A3FC5B873BC51EE94711DAA1B81C7A4A41A8D86A65A0DCC8DF3F207` | **koşuldu**, idempotentliği ölçüldü |
| `smtp-sink-noauth.js` | `99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800` | K-T2 ile doğrulandı (AUTH ilan yok) |
| `i11-bind-candidate.ps1` | `B1C24402E7999B89AF0A4A26E93DF9B2EAADEC7CB0609A7E7B871B0AADDFBD49` | öz-sınama + iki durma sınaması (§2.1) |
| `i11-vb-compiled-redaction.js` | `5E0E05384CD422A85E9FD35530A88A141798FAED968E94EC8667AB7AD5AC7ABA` | negatif kontrol FAIL (§3.1) |
| İ11 §9 kabul bloğu | `7A10D817D8E306DF534C704D99196E44EA71CD591D12607D44706D89C56F62D0` | yayından sonra §2'ye göre yeniden bağlanır |

> **Kalıcılık düzeltmesi:** R02'de T-PENCERE blokları ve AUTH'suz yakalayıcı **yalnız hash'leriyle**
> kayıtlıydı; dosyaların kendisi oturum dışında yoktu. Bu teslimle **bayt bayt** repoya alındı
> (hash'ler R02 ile birebir). Prova başlatıcısı (`start-api-r22s.js`) yalnız **prova** modunda
> kullanılır, canlı yol ona bağlı değildir.

### 4.3 Kabul sonucu

| Aşama | Durum |
|---|---|
| Birleşik prova (RELEASE22 dist) | **BAŞARILI** — PASS 11/0/0 · kapsam TAM · pozitif hedef kanıtı VAR · geri dönüş idempotent (R02 §3) |
| **V-A** aday ikilisinde | **BEKLİYOR** — C33 teslimi yok |
| **V-B** aday ikilisinde | **BEKLİYOR** — araç hazır, negatif kontrol FAIL (araç geçerli) |
| Canlı kabul | **YAPILMADI** |

### 4.4 Yazma envanteri (canlıda, sentetik tenant `cl-acc-<runId>`)

| Durum | INSERT | UPDATE |
|---|---|---|
| Gönderim kapsamı AÇIK (Yöntem T) | **28 satır** (kurulum 18 + claim audit 1 + A-5/A-6 her biri Request/Notification/AddressAudit/Audit + A-6 Link) | başvuru IN_REVIEW · bağlantılar REVOKED · 3 User pasif · Case CLOSED |
| Gönderim denendi, başarısız | **21 satır** (yetim Link + ErrorLog dahil) | aynı |
| Kurtarma yolu (runId) | **0** yeni | yalnız kapanış UPDATE'leri |

**Migration olmaması koşum yazmalarının geri alındığı anlamına gelmez:** yazmalar **geri alınmaz**,
kapanışla **kapatılır**, kanıt olarak **kalır**. Dosya yazımı 0 · DELETE yok.

### 4.5 Süre bütçesi

Her restart **180 sn** · provada **10 sn** (açılış) / **7 sn** (dönüş) · canlı emsal 39,467 sn.
**Geçmiş süre garantili üst sınır sayılmaz**; aşımda otomatik tekrar YOK (R02 §4.4).

### 4.6 Bağımsız kurtarma yolu

| Katman | Komut | Bağımsızlık |
|---|---|---|
| SMTP hedefi | `T-PENCERE-KAPA` | **koşum/state dosyasından bağımsız**; tek girdi `.env` ön görüntü yedeği; idempotent |
| Anonim intake | `i11-03-close-links.js` (yalnız `CL_RUN_ID`) | durum dosyası gerektirmez; tekrarı güvenli |
| Kullanıcı + Case | `cl-09-close-access.js` (yalnız `CL_RUN_ID`) | aynı |
| Yayın | C33 motoru **R-01** (RELEASE22 köküne dönüş) | migration olmadığı için DB geri alma gerekmez |

## 5. Devir — aynı anda iki canlı yürütücü YOK

**D1 OFFICE/C33** (derleme + paket + cutover) → teslim: kök · SHA · BUILD_ID · manifest →
**D2 CLIENT** (bağlayıcı §2.1 + V-B + V-A, yalnız oturuma özel ortam) → **D3 CLIENT** (canlı pencere,
tek GO). D2 canlıya **dokunmaz**; D3 başlamadan OFFICE canlıdan çekilmiş olmalıdır.

## 6. Kapsam dışı ve açık kalemler

- **İ12 başlatılmadı.**
- **`CL_TOKENFIX` disk artığı** ayrı açık temizlik kalemidir; kancayı aşacak alternatif silme yolu
  denenmedi ve denenmeyecek.

---

Canlı kabul **yapılmadı**. CLIENT sayaç **10/17**; hizmet kabulü **0/8 tam**.
