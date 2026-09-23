# PERSONEL DAVETİ — UÇTAN UCA CANLI KABUL KAYDI (runId `aa89937b`)

> **2026-09-23'te owner GO'su ile BİR KEZ koşuldu: PASS 8 / FAIL 0.** Bağımsız doğrulama PASS (15/15).
> **Teknik sayaç ve H1–H8 hizmet kabulü 0/8 DEĞİŞMEDİ.** Bu kayıt hizmet kabulü değildir.
> Aynı gün **önce bir pencere yarıda kaldı**; o denemede kabul koşumu HİÇ BAŞLAMADI (§6).

## 1. Kimlik

| Alan | Değer |
|---|---|
| runId / slug | `aa89937b` / `inv-aa89937b` (tenantId `cmueivq2v0001xxwmp3jzbxik`) |
| main (koşum anı) | `0abe92e80d6c3596e53ae6d08ff82973e01e3b99` (#2773 kök neden düzeltmesi) |
| Kanıt dizini | `Documents\CLIENT-EVIDENCE-20260911\` (`inv-window-state.json.*`) |
| GO ref | Yalnız sha256 olarak kayıtlı; literal hiçbir dosyaya, rapora veya repoya **yazılmadı** |
| Pencere | Web durduruldu + devre dışı · 8080/3002 uzak erişim engeli · `.env`'de yalnız `SMTP_HOST`/`SMTP_PORT` loopback yakalayıcıya |

## 2. Ölçütler — 8/8 PASS

| # | Ölçüt | Gözlem |
|---|---|---|
| D-1 | ADMIN davet oluşturur | HTTP 201; davet doğru tenant'ta; DB'de **yalnız** `tokenHash` |
| D-2 | Yakalayıcıda **teslim** | `inv-msg-0001.eml` oluştu; kabul bağlantısı var; **yakalanan token'ın sha256'sı DB hash'iyle birebir eşit** |
| D-3 | Gerçek kabul ucu | HTTP 201; `isActive=true`, `passwordHash` yazıldı, davet `consumedAt` doldu |
| D-4 | Yeni parolayla giriş | HTTP 201, token alındı |
| D-5 | Aynı token tekrar | **HTTP 400** ve parola hash'i **değişmedi** |
| D-6 | Kullanılmamış davetler | API bekleyen 0, DB bekleyen 0 |
| D-7 | Erişim kapanışı | 2 kullanıcı pasif (`tokenVersion++`), aktif kalan 0, giriş **401**, eski token **401** |
| D-8 | İzolasyon | `3539a3d967030e3d` / 28 tenant — önce = sonra |

**Sonradan tespit (önleme değil):** yakalama taraması 1 dosya, **hedef dışı alıcı 0**.
**Sır temizliği:** yakalama dosyası silindi, **kalan 0**. Ham token yalnız sha256 olarak kayıtlı.

## 3. Bağımsız doğrulama — PASS

Doğrulayıcı: `Avukat personel analiz dosyası`, owner'ın bu işe **özgü** doğrudan READ ONLY yetkisiyle.
Kanıt: `HY_INV_OFFICE_VERIFY\inv-office-readonly-verify-aa89937b.json` · kopyası `record/evidence/office-verify-inv-aa89937b.json`.

**Doğrulayıcının KENDİ ölçtükleri — 15/15 PASS**

- Dört kanıt dosyasının sha256'sı, CLIENT'ın bildirdiği değerlerle **birebir eşit**.
- Makbuz ile sonuç arasında altı kimlik tutarlı; `goRefSha256` var, **GO ref literali yok**; `tokenSha256` 64 hane,
  ham token biçimi (43 karakter) **yok**; `run.log` sonuçla tutarlı.
- `close.json`: `restored=true`, `rules=0`, `envSha` eşit, `webTask=Running/enabled`, zorunlu karar alanları `true`, `blockers=[]`.
- Canlı `hukuk_db`, kendi READ ONLY transaction'ı (`transaction_read_only=on` sorgudan **önce** doğrulandı, `writes=0`):
  makbuzun altı kimliği DB ile eşleşti · davetli kullanıcı `isActive=false`, `tokenVersion=1` (arttı), `passwordHash` dolu ·
  davet `consumedAt` dolu, `tokenHash` 64 hane · tenant içinde aktif kullanıcı 0, bekleyen davet 0 ·
  tenant içindeki tüm davet `tokenHash` alanları hash biçiminde.
- **Tenant sayısı 29**; doğrulayıcının kendi önceki bağımsız ölçümüyle (C123, 2026-09-22, **28**) tam **+1**:
  yalnız yeni `inv-` tenant'ı eklendi. Bu karşılaştırma doğrulayıcının **kendi iki ölçümü** arasındadır.

**Doğrulayıcının ölçmediği, CLIENT kanıtından kabul ettikleri** (kapsam dışı ya da kanıtı artık yok):
D-2'deki token↔hash eşleşmesi (yakalama dosyası tasarım gereği silindi) · D-4 (canlı HTTP probu yetkisi yok) ·
izolasyon digest'i · ortam dönüşü (servis/port/kural durumu).

**Ölçüm yöntemi düzeltmesi:** Doğrulayıcı ilk raporunda kanıt dosyasının sha256'sını `8DB5044C…` olarak bildirdi;
CLIENT iki kez farklı ölçtü. Neden: hash metin modundan geçen bir boru hattıyla, yani ham baytlar yerine yeniden
kodlanmış içerik üzerinden alınmıştı. `Get-FileHash` ile ham baytlar ölçüldüğünde iki taraf **eşit** çıktı.
Kayda yalnız doğrulanmış değerler girmiştir; `8DB5044C…` **kullanılmaz**. Bu, DB sorgu sonuçlarını etkilemez.

## 4. Ortam dönüşü — üç ayrı ölçüm

| Ölçen | Sonuç |
|---|---|
| Kapanış bloğu (`close.json`) | `restored=true`, kurallar 0, `.env` sha eşit, Web başlangıç durumunda |
| CLIENT (canlı salt okuma) | `.env` sha `7A7228B1…FDDC` · API ve Web `Running/enabled` · 8080 pid 8256, 3002 pid 7656, 2527 kapalı · firewall kuralı 0 · yakalama dizini boş · `/auth/me` 401 · web `/` ve `/auth/login` 200 |
| `OFFİCE 33` (S2 aşama kapısı, bağımsız) | **PASS 16/16**; `.env` sha = R26 pini (içerik okunmadan) · API dist 3867 dosya · web `.next` 505 dosya · BUILD_ID · iki görev etkin · 8080 ve 3002'de tam bir dinleyici. Kanıt `OFFICE33-gate-S2-after-invite2-20260923T195923Z.json` (`637D7195…1F4A`, CLIENT tarafından bağımsız ölçüldü) |

## 5. Canlıda kalıcı kalanlar

Sentetik tenant `inv-aa89937b`, ADMIN ve davet edilen kullanıcı, `UserInvite` satırı ve audit satırları **kalır**.
Silme yapılmadı; erişim kapalıdır (kullanıcılar pasif, `tokenVersion` artırıldı, bekleyen davet 0).
Üründe kabul edilmiş bir hesabı pasifleştiren API ucu **yoktur**; kapanış DB düzeyinde ve yalnız makbuzun
işaret ettiği tenant'ta yapılmıştır.

## 6. Aynı gün yarıda kalan ilk pencere — ayrı kayıt

İlk denemede açılış betiği `Restart-ScheduledTask` bu sistemde bulunmadığı için `.env` değiştirildikten sonra,
durum dosyası yazılmadan durdu. **Kabul koşumu hiç başlamadı** (sonuç/makbuz artefaktı 0). Kurtarma yapıldı ve
üç ayrı ölçümle doğrulandı. Kök nedenler #2773 ile düzeltildi (desteklenen görev komutları · durum dosyası ilk
canlı değişiklikten **önce** · ayırıcı-bağımsız yakalayıcı kimliği) ve `inv-window-selftest.ps1` ile 12/12 ölçüldü.

**O pencerede gerçek SMTP üzerinden gönderim olup olmadığı ÖLÇÜLMEDİ.** Yakalayıcının boş olması ve API'nin
yalnız kurtarmada yeniden başlaması bunu kanıtlamaz; bu kayıt öyle bir iddia taşımaz.

## 7. Kanıt sha256

| Dosya (kaynak, bayt-birebir) | sha256 |
|---|---|
| `inv-window-state.json.result.json` | `827E57BFF6C48491DDC4C61A0B4FC88E1324C7B2B6C02A05AECA19B9FFFE0486` |
| `inv-window-state.json.receipt.json` | `3172908A6FC490E14742E9EBC2A86BE7AF2D9E31D9B3D93769B4CEE05D566FA8` |
| `inv-window-state.json.run.log` | `2C9717A5CF9FD555CC1D635604A5E04B5EFACE0ED5A77D79ED929C55DF51A6EE` |
| `inv-window-state.json.close.json` | `7EBC0C24CBD9FAEFE8DD386F3EE0469B8FC45AA05F38D7CDAB2B551EAD6CEA6A` |
| Doğrulayıcı sonucu `inv-office-readonly-verify-aa89937b.json` | `D13017ABD57627A58E0710ECDA49396330D40A0FC1D835AE219B94647EB14B10` |
| Doğrulayıcı betiği `invverify.office.js` | `B1331AF66F92C540398DF56C0B6283DC1DE2B6688DD90F35CA8E4AEA41A30C26` |

`record/evidence/` altındaki kopyalar **türevdir**: GO ref alanları maskelenmiş, satır sonları normalize edilmiştir;
bayt-birebir dosyalar repo dışındaki kanıt dizinindedir ve **silinmemiştir**. `.env` yedeği de korunmaktadır.

## 8. Kapsam

Bu kayıt **yalnız** personel daveti uçtan uca akışının canlıda çalıştığını gösterir: davet açma, teslim, kabul,
giriş, tekrar reddi, davet iptali, erişim kapanışı ve izolasyon. **H1–H8 hizmet kabulü 0/8 değişmez** ve bu kayıt
OFFICE finali anlamına gelmez.
