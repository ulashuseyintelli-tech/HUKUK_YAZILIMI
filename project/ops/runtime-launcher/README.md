# runtime-launcher — HukukPlatform başlatıcıları ve host pin kaynağı

**Durum:** Bu dizin kurulu üçlü `F02-K1` ile bayt bayt aynıdır (`host/uclu-pin.json`). Üçlü 2026-10-31 başlatıcı penceresinde canlıya alındı. Canlı dosyalar `C:\Ops\hukuk\bin\` altındadır; bu dizinden otomatik kurulum yoktur. Değişiklik ayrı üretim, yeni pin ve owner onaylı pencere ister.

| Dosya | Görev |
|---|---|
| `start-api.ps1`, `start-web.ps1` | Görev başlatıcıları |
| `host/hukuk-task-host.gen.cs` | Host kaynağı. Başlatıcı özetlerini `SHA_PAPI` ve `SHA_PWEB` derleme zamanı sabitleriyle doğrular |
| `host/uclu-pin.json` | Kurulu üçlü, önceki üçlü, derleyici kimliği |
| `host/pin-uret.ps1` | Pin denetimi ve üretimi. `C:\Ops` altına yazmaz |

## Üçlü ve pin kuralı

- Host, başlatıcı özetlerini içine gömer. Başlatıcı değişirse host yeniden derlenir. Karışık durum `SCRIPT_HASH_MISMATCH` çıkış 104 ile başlamaz.
- `.NET Framework csc` bayt-tekrar-üretilebilir değildir. Host kimliği tam çıktı özetidir; aynı kaynak yeniden derlenirse özet değişir.
- Başlatıcıyı değiştirince sıra: `host/pin-uret.ps1 -CiktiDizini <boş dizin>` → `uclu-pin.json` → yayın betiği üçlü tablosu → prova → owner onaylı pencere. Sessiz pin güncellemesi yoktur.

```bash
pwsh -NoProfile -File project/ops/runtime-launcher/host/pin-uret.ps1
```

## Dinleyici sözleşmesi (F02-K1)

Ölçüm: incelenen bağlamlarda durum alanına bakan soket sorguları dinleyen süreci kaçırdı ve yanlış pozitif verdi. Kök neden bilinmiyor. Başlatıcı bu nedenle `GetExtendedTcpTable` + `TCP_TABLE_OWNER_PID_LISTENER` kullanır ve satırın durum alanına bakmaz.

| Durum | Anlam | Davranış |
|---|---|---|
| `EXACT` | Çocuk beklenen her adres ailesinde tek sahip | `STARTED` |
| `YOK` | Sorgu başarılı, satır yok | Beklemeye devam; süre sonunda ardışık kesin ölçümle çıkış 16 |
| `YABANCI` | Portta başka süreç | Kabul edilmez; yabancıya dokunulmaz; süre sonunda kendi çocuğu sonlanır, çıkış 16 |
| `KISMI` | Çocuk tek ailede | `STARTED` yok; çocuk sonlandırılmaz |
| `BELIRSIZ` | Sorgu hatası | "Dinleyici yok" sayılmaz; çocuk sonlandırılmaz; kilit ve host takibi sürer |

- Spawn öncesinde sorgu üç denemede de belirsizse çocuk başlatılmaz, çıkış 26. Görev PT15M yeniden dener.
- Belirsizlikten çıkış yalnız `EXACT` ya da ardışık kesin ölçümle olur (`BindUncertainDefiniteSamples`, varsayılan 36 × 5 sn).
- Kanıt düzeyi: tek makine, canlıda tek başlatma örneği. **Oturum açma ve yeniden başlatma yolu henüz gözlenmedi.**

## Taban

- İlk commit, canlı RELEASE23 üretiminin bayt-aynı kopyasıdır:
  `C:\Ops\hukuk\bin\start-api.ps1` = R28 `generations/R23/start-api.ps1`,
  sha256 `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` (LF, saf ASCII).
- Üretimler arasındaki fark yalnız sürüm yollarıdır (`ReleaseRoot`, `WorkDir`, `EntryJs`, `EnvFile`).
  Sonraki üretim bu dosyadan yol değiştirilerek alınmalıdır. Yoksa A3 yaması canlıya ulaşmaz.

## A3 yaması — DB hazır değilken sınırlı yeniden deneme

Ölçülen sorun (RELEASE22 Ek C.1 + `C:\Ops\hukuk\logs\api\launcher.log`, 2026-09-08 ve 2026-09-11):
açılışta postgres TCP bağlantısını kabul ettiği halde henüz sorgu alamazken yardımcı
`db-readiness.js` hata kodu taşımayan bir Prisma hatası alır. Bu durumda
`DB_ERROR_UNCLASSIFIED code=none` basıp exit 23 ile çıkar. Eski `Wait-HLDbReady` yalnız exit 20'yi
(UNAVAILABLE) yeniden deniyordu, 23'te hemen çıkıyordu. Zamanlanmış görev sıfır dışı çıkışı yeniden
başlatmadığı için (RestartOnFailure yalnız başlatma hatasında devreye girer) toparlanma PT15M
tetiğine kalıyordu.

Yama:

| Probe sonucu | Davranış |
|---|---|
| 0 READY | çocuk başlar (değişmedi) |
| 20 UNAVAILABLE | `DbAttempts` × `DbPollSec` içinde yeniden dene (değişmedi) |
| 23 ve token **tam olarak** `DB_ERROR_UNCLASSIFIED code=none` | **yeni:** en fazla `DbUnclassifiedRetryMax` kez VE ilk kodsuz 23'ten itibaren en çok `DbUnclassifiedWindowSec` sn, `DbAttempts` bütçesi içinde yeniden dene; sınır aşılırsa exit 23 |
| 23 kodlu (ör. `code=P1003`) | hemen exit 23 (değişmedi — kalıcı yapılandırma hatası olabilir) |
| 21 AUTH / 22 IDENTITY / 24 ENV / 25 URLPARSE | hemen 19 / 13 / 14 / 14 (değişmedi) |
| bütçe biterse | son sonuç kodsuz 23 ise exit 23, değilse exit 10 (TIMEOUT) |

- Varsayılanlar: `DbAttempts=24`, `DbPollSec=5` (değişmedi), `DbUnclassifiedRetryMax=12`,
  `DbUnclassifiedWindowSec=90`.
- Geriye uyumluluk: iki yeni anahtar yapılandırmada yoksa davranış yama öncesiyle aynıdır
  (kodsuz 23'te hemen çıkış). Çıkış kodu sözleşmesi değişmedi.
- Yeniden deneme kilit (`launch.lock`) alındıktan sonra, çocuk başlatılmadan önce yapılır. Bu sırada
  ikinci bir başlatıcı `LAUNCHER_BUSY` ile çıkar ve çocuk üretmez. Görev ayarı da `IgnoreNew`.
- Yeni log satırı yalnız sayaçları yazar. Yardımcının stdout/stderr içeriği ve `.env` değeri loga
  yazılmaz. Mevcut probe satırı ve maskeleme değişmedi.
- En kötü ek süre: ilk kodsuz 23'ten sonra en çok ≈ 90 sn + tek probe zaman aşımı (20 sn).

Bu yamanın kapsamı dışında kalanlar (ayrı ölçüm/karar):
- 2026-09-09 `DB_NOT_READY(TIMEOUT) exit 10`: DB 24 × 5 sn içinde hiç gelmedi.
- Oturum açılmadan görevlerin başlamaması (InteractiveToken, olay 332).
- PT15M tetik aralığı.

## Test

- `project/apps/api/src/scripts/__tests__/ops-runtime-launcher-db-ready-retry.spec.ts`: DB yeniden deneme yolu. Başlatıcının gerçek fonksiyonlarını pwsh ile izole geçici dizinde koşar; sahte yardımcı ve sahte giriş kullanılır.
- `project/apps/api/src/scripts/__tests__/ops-runtime-launcher-listener-contract.spec.ts`: dinleyici sözleşmesi, iki başlatıcı, pin tutarlılığı. Gerçek node çocuğu; tek gölge ham Windows sorgusu.

CI manifesti: `apps/api/ci-manifests/pure/platform-scripts-shared.txt`. pwsh yoksa testler düşer.
