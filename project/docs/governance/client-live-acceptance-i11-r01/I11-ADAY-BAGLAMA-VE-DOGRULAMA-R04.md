# CLIENT İ11 — RELEASE23 ADAYINA BAĞLAMA VE ADAY ÜZERİNDE DOĞRULAMA (R04)

```text
BELGE       : I11-ADAY-BAGLAMA-VE-DOGRULAMA-R04   (R03 teslim belgesinin sonucu)
YETKİ       : owner GO 2026-09-12 "CLIENT İ11 / ADAYA BAĞLAMA VE SON KABUL HAZIRLIĞI" madde 2
              (C33 teslimi üzerine YENİDEN GO BEKLENMEDEN)
TETİK       : OFFICE 33 (C33/D1) RELEASE23 derlenmiş aday teslimi — teammate girdisi; değerler
              CLIENT tarafından BAĞIMSIZ ÖLÇÜLDÜ
DURUM       : BAĞLANDI · ADAY İKİLİSİNDE DOĞRULANDI · canlı kabul YAPILMADI
ORTAM       : yalnız oturuma özel DB + Redis + yerel yakalayıcı; canlı DB/görev/firewall/env YOK
```

**Yazıcı bölüşümü (OFFICE 33 önerisi, CLIENT kabul etti):** tek nihai paket, koşullu GO taslağı ve
C33 aday/cutover kaydı **OFFICE 33**'tedir (`release23-candidate-r01/`). Bu belge yalnız **İ11
bağlama + aday doğrulama** kaydıdır; OFFICE dosyalarına yazılmaz.

## 1. Bağlama — `scripts/i11-bind-candidate.ps1` (`B1C24402…`)

C33 teslim girdileri: kök `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23` · BUILD_ID
`dOiGPj2M0Abls0kCibY4r` · manifest `HY_C33_RELEASE23_CANDIDATE\RELEASE23-PAYLOAD-MANIFEST.json`
sha256 `E53618ED81FF02B43CB03B26656275B860D1C9B399C7D561A75BE0CA17F61AD5`. Her biri **ölçümle**
karşılaştırıldı:

| Kapı | Ölçüm | Sonuç |
|---|---|---|
| B-0 | kök HEAD `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` | **sabit kaynakla EŞİT** |
| B-1 | `.next/BUILD_ID` `dOiGPj2M0Abls0kCibY4r` | **C33 bildirimiyle EŞİT** |
| B-2 | manifest sha256 `E53618ED…61AD5` | **C33 bildirimiyle EŞİT** |
| B-3 | `13740670..2740df3d` ürün farkı | **tam 7 dosya** (#2641 · #2643 · #2645) |
| B-4 | dist `error-log.sanitize.js` | `redactSecretPathSegments` **MEVCUT** |
| B-5 | İ11'in 12 ürün dist hash'i · `main.js` | **12/12 RELEASE22 ile AYNI**, değişen 0 · `main.js` `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` |

Bağlama kaydı `I11-CANDIDATE-BINDING.json` sha256
`FCD57F04E58767ED43F85152222C1A95C5B8423C54500F432D53D580FFA157EA` (yerel kanıt).

**B-5 öngörüsü doğrulandı:** 12 dosyanın hiçbirinin kaynağı aday farkında olmadığından hash'lerin
aynı kalması **beklenmişti** (R02 §6) — ölçüm bunu **birebir** gösterdi.

## 2. Yeniden bağlanan bloklar

| Blok | Önce (R22) | **Sonra (R23)** | Değişen |
|---|---|---|---|
| İ11 §9 | `7A10D817…F62D0` | **`A16E479155084F3B6F7D12D7A820E2BA0760411A18FB64D749FA0799C647D148`** | `$REL` → `HY_W4_RELEASE23` · K-API komut satırı · K-BLD HEAD `2740df3d…` · BUILD_ID `dOiGPj2M0Abls0kCibY4r` |
| T-PENCERE-AÇ | `D07E3F3D…BE0C7` | **`508C532372BA04E61677569123098A285F16388BBD5F52128DB09A1A1BFD86AB`** | canlı `$REL` → `HY_W4_RELEASE23` (mantık değişmedi) |
| T-PENCERE-KAPA | `D84C3B3A…3F207` | **`5895CFC7B7D400F44A50DCF81A462DED05C259E86FD5B8DFF00D3F0ECD82EB27`** | canlı `$REL` → `HY_W4_RELEASE23` |

**§9 kuru doğrulama (bloktan çıkarılan sabitler, gerçek R23 köküne karşı):** 21/21 hash (9 araç +
12 ürün) · HEAD **eşit** · BUILD_ID **eşit**.

§9'un 12 ürün hash'i (değişmedi): `111807F3…` · `6F7BA8DE…` · `ED8455F9…` · `97DF59B7…` ·
`2DE45ABB…` · `8AE1BC03…` · `32223CA8…` · `92D3EA95…` · `1463DB9C…` · `231B77F6…` · `D8373C72…` ·
`075FBE3D…` (tam değerler `CLIENT-LIVE-ACCEPTANCE-I11-R01.md` §4.1 ve §9).

**Bilinçli kalan R22 atfı:** §9'daki `CL_PRISMA_ROOT` / `CL_BCRYPT_PATH` harness bağımlılıklarını
**geri dönüş kökü RELEASE22**'den salt-okunur okur. Schema ve lock değişmediği için uyumludur; aday
köküne (mühürlü manifestin konusu) **hiç dokunulmaz**.

**Fail-closed davranış:** R23'e bağlı bloklar **cutover'dan önce** canlıda koşulursa K-API / K-BLD'de
**durur** — beklenen davranış.

## 3. V-B — derlenmiş B-I11-3 (`scripts/i11-vb-compiled-redaction.js`, `5E0E0538…`)

| İkili | Sonuç |
|---|---|
| **RELEASE23 adayı** (limiter Redis'i ulaşılamaz) | **PASS** · 503 · ErrorLog 1 satır · **ham token 0** · endpoint `/api/public/intake/:token` · kanıt sha `7121CB3A5101692EC13057C5D54FD1AC734E5759C96C7280F8D782D3236DE951` |
| RELEASE22 (onarımsız; negatif kontrol, R03) | **FAIL** · ham token **VAR** |

→ Onarım **derlenmiş aday ikilisinde** çalışıyor; araç boş değil.

## 4. V-A — birleşik dizi aday ikilisinde (runId `64245dc2`)

Aynı sıra: **T-PENCERE-AÇ → İ11 (gönderim AÇIK) → kapanış → T-PENCERE-KAPA.** Bloklar **R23'e
bağlanmış** hâlleriyle koşuldu; API süreci her aşamada `HY_W4_RELEASE23` dist'i (komut satırıyla
doğrulandı).

| Aşama | Ölçülen |
|---|---|
| T-PENCERE-AÇ (`508C5323…`) | 9 kapı geçti · env farkı tam 2 anahtar · restart **7 sn** (bütçe 180) · yeni süreç R23 dist |
| İ11 | **PASS 11 · FAIL 0 · ÖLÇÜLEMEYEN 0 · KAPSAM DIŞI 0** · kapsam **TAM** |
| Taşıma gövdesi | yakalayıcıda **2 ileti**, ikisi de bu koşumun · **A-5 token YOK** · **A-6 token VAR**, `sha256(token)` DB `tokenHash`'te **VAR**, kalıcı gövdede **YOK** · URL taşıyan kalıcı gövde **0** · kanıt sha `C7E7B8E859003EDF4B42C8BF0DD125640B0B78F7329614F7D1305B3D93F1895F` |
| Kapanış | bağlantılar **REVOKED ×2** · anonim yol **200 → 404** · login **401** · tekrar `alreadyClosed` · izolasyon **EŞİT** |
| T-PENCERE-KAPA (`5895CFC7…`) | **POZİTİF HEDEF KANITI VAR** (bu koşuma ait 2 ileti) · env **bayt bayt** geri · restart **6 sn** · özgün hedef geri geldi · yakalayıcı durdu · iletilerin tamamı sentetik alan |

**Önceki provada bulunan beş kusurun hiçbiri yeniden görülmedi**; bağlanmış bloklar aday üzerinde
**tek seferde** geçti.

### 4.1 Yazma envanteri (bu koşum, sentetik tenant `cl-acc-64245dc2`)

Ölçülen anahtar tablolar: Tenant 1 · User 3 · StaffMember 2 · Lawyer 1 · Client 1 · Case 1 ·
ClientIntakeSubmission 1 · ClientIntakeLink **2** · ClientInfoRequest **2** · ClientNotification **2** ·
AuditLog **3** — gönderim açık **28 satır** envelopesiyle tutarlı. **Bu koşumda tam 210-tablo farkı
alınmadı**; 28 satırın tablo bazında tam doğrulaması önceki provalarda (`drive.js` N2) ölçüldü.
UPDATE: başvuru IN_REVIEW · bağlantılar REVOKED · 3 User pasif · Case CLOSED. **Yazmalar geri
alınmaz; kapatılır ve kanıt olarak kalır.**

## 5. Aday köküne YAZMA YOK — ÖLÇÜLDÜ (OFFICE 33 D2 kuralı)

- API `cwd`, `HUKUK_DATA_ROOT` ve `HUKUK_OCR_MODELS_ROOT` **oturum dizinindeydi**; kaynakta
  geliştirme modunda veri kökü `cwd`'ye düşer (`runtime-storage-paths.ts`), bu yüzden açıkça verildi.
- **Nöbetçi** (salt okuma, baseline `2026-09-12T20:28:04Z`): dosya **88.248 → 88.248** · klasör
  **13.600 → 13.600** · baseline sonrası değişen girdi **0** · okuma hatası 0 → **YAZMA YOK**.
  Kayıt sha `1AF16597659351D368D210B0FE6B92C265099EFE853E7D8F1902902274BC6D33`.
- Manifest `E53618ED`'e karşı bağımsız yeniden doğrulama **OFFICE 33**'tedir; fark çıkarsa DUR.

## 6. Tekrarlanmayanlar (gerekçe R03 §3)

S (kurulum rollback) · G (ref kapıları) · F (dur kuralı) · R (runId kurtarma) — düzenek düzeyi;
N3 (gönderim hatası) — `client-info-request` / `email-provider` aday farkında yok.

## 7. Devir durumu

**D1 (OFFICE/C33) aday teslimi ✔ → D2 (CLIENT) bağlama + doğrulama ✔ → D3 (CLIENT canlı pencere)**
tek canlı GO ve **cutover sonrası** yürütülür. Aynı anda iki canlı yürütücü yok; D1 cutover'ı canlı
GO'dan önce koşmaz.

## 8. Açık kalemler

- **`CL_TOKENFIX` disk artığı** ayrı açık temizlik kalemi (kanca reddi; alternatif silme yolu denenmedi).
- **İ12 başlatılmadı.** **Canlı kabul yapılmadı.**

---

CLIENT sayaç **10/17**; hizmet kabulü **0/8 tam**.
