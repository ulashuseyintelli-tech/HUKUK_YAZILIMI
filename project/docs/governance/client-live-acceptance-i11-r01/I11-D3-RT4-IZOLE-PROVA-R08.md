# CLIENT İ11 — R-T4a/R-T4b İZOLE KURTARMA PROVASI VE GÜVEN SINIRI (R08)

```text
BELGE    : I11-D3-RT4-IZOLE-PROVA-R08   (T-PENCERE-KAPA'yı R07'den yeniden pinler; §9 ve T-PENCERE-AÇ DEĞİŞMEDİ)
TETİK    : owner GO "R02'nin kalan kurtarma kanıtı ve güven sınırı" (2026-09-13, bu CLIENT oturumunda doğrudan teyit edildi)
YETKİ    : aynı GO madde 1 (CLIENT) + madde 3'ün "betik değişirse pin/doğrulama yenile" kısmı
ORTAM    : yalnız oturuma özel DB + Redis + yerel yakalayıcı + RELEASE23 aday dist; canlıya DOKUNULMADI
           (canlıda yalnız salt-okuma: sha, dinleyici/görev/kural sayımı, .env sha; içerik OKUNMADI)
DURUM    : R-T4a/R-T4b TEK fonksiyona alındı; senaryo mantığı 6/6 ÇALIŞTIRILARAK doğrulandı; R-T4b gerçek görev+port
           yolu koşuldu; GERÇEK FIREWALL (R-T4a) yükseltme gerektirir → owner'ın tek komutu · canlı kabul YAPILMADI
```

## 1. Ne değişti, neden

Owner, R02 §7 madde 6a(i)'deki tek boşluğu kapatmak istedi: **T-KAPA R-T4a/R-T4b hiçbir modda koşmamıştı** (yalnız `live` dalında çalışıyordu; kanıt kaynak + AST + R-T5 benzeşimiydi). R08 bu iki adımı **üretimde kullanılacak tek fonksiyona** aldı ve gerçek işlemleri izole, canlı-dışı hedeflerde sınadı.

- `t-window-close.ps1` R-T4 bloğu → `Invoke-WindowRecoveryRT4($FwPattern, $WebTask, $WebPort, $Budget, $ErrList)`. Canlı yol bu fonksiyonu **canlı hedeflerle** çağırır (`'I11-WINDOW-BLOCK-*'`, `'HukukPlatform-Web'`, `3002`). Davranış R07 ile aynı; yalnız gövde fonksiyona taşındı.
- İzole prova betiği `t-rt4-isolated-rehearsal.ps1`, bu fonksiyonun metnini `t-window-close.ps1`'den **sha doğrulayıp AST ile** alır ve aynen tanımlar (ayrı kopya YOK); canlı çağrı satırının dosyada birebir var olduğunu da doğrular. Yalnız hedef adları izoledir.

## 2. Güven sınırı — ÖLÇÜLDÜ

Bu CLIENT oturumu **yükseltilmemiştir** (ölçüldü: `IsInRole(Administrator)=False`; `New-NetFirewallRule` → **Erişim engellendi**). Sonuç:

| İşlem | Bu oturumda | Kanıt kaynağı |
|---|---|---|
| R-T4a gerçek firewall (`Remove-NetFirewallRule`) | **KOŞULAMAZ** (yükseltme gerekir) | owner'ın tek komutu (§4) — hiçbir modda koşmadı, PASS SAYILMAZ |
| R-T4b gerçek görev + port (`Start-ScheduledTask`, dinleyici) | **KOŞTU** (gerçek görev + gerçek port 47101, non-elevated) | dev koşumu S1 "Web ayakta" |
| Senaryo mantığı (kısmi hata, toparlanma, idempotent) | **KOŞTU** 6/6 | bellek-içi mantık harness'ı (§3) |

Bu, R02 §2.3'teki E-3 durumunun aynısıdır: ajan oturumu yükseltilemez. R-T4a'nın gerçek-firewall PASS'i **yalnız owner'ın yükseltilmiş penceresinde** doğar; §4'teki tek komut budur.

## 3. Kanıt — senaryo mantığı (bellek-içi, iki kabuk, KANIT değil ama mantık doğrulaması)

`rt4s-logic.ps1` (sha `975C559A…`): üretim fonksiyonunu `t-window-close.ps1`'den (sha `88BCEA01…`) AST ile alır; firewall/görev/port cmdlet'lerini bellek-içi sahteler. Her senaryonun üretim çıktısı ve son durumu beklentiyle karşılaştırılır.

| Senaryo | Sonuç | Gözlem |
|---|---|---|
| S1 başarı | PASS | `R-T4a: … kaldirildi (2)` · `R-T4b: Web ayakta` · kural 0 · web açık |
| S2a R-T4a kısmi hata | PASS | 2. kaldırmada enjekte hata → `!!! R-T4a BASARISIZ` · hata listesinde 1 · **R-T4b yine koştu** · kural 1 kaldı |
| S3a tekrar (R-T4a toparlanma) | PASS | kalan 1 kural silindi · hata 0 |
| S2b R-T4b hata | PASS | görev ayağa kalkmaz → bütçe dolar → `!!! R-T4b BASARISIZ` · **R-T4a başarıyla koştu** (kural 0) |
| S3b tekrar (R-T4b toparlanma) | PASS | neden giderilir → web ayakta · hata 0 |
| S4 idempotent tekrar | PASS | kural 0, web açık, hata 0 |

**PASS 6/6**, PS 7.6.5 ve PS 5.1.26100'de aynı. İki adımın bağımsızlığı doğrulandı: biri düşerken diğeri koşuyor; toparlanma aynı bloğun tekrarı; idempotent.

**Ölçüm aracı düzeltmeleri (kusur değil, harness'ta):** ilk sürümde S2a beklentisi yanlış yazılmıştı (üretim `foreach` içinde doğrudan fırlatıyor, `kaldirilamadi` satırına ulaşmadan) ve sahte `Get-NetTCPConnection` boş listeyi `,@()` ile 1 elemanlı sarıyordu (web hep "ayakta" görünüyordu). İkisi düzeltilip 6/6 alındı.

## 4. Owner'a tek komut — R-T4a/R-T4b gerçek işlem izole prova (YÜKSELTİLMİŞ)

Aşağıdaki tek blok yükseltilmiş pencerede yapıştırılır. `t-window-close.ps1`'i sha ile doğrular, `Invoke-WindowRecoveryRT4` fonksiyonunu AST ile alır, **izole** hedefler kurar, altı senaryoyu koşar, her sonuçta temizler.

```powershell
& { pwsh -NoProfile -ExecutionPolicy Bypass -File "C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\t-rt4-isolated-rehearsal.ps1" }
```

- **Betik sha (doğrulanmış):** `t-rt4-isolated-rehearsal.ps1` `17B3C026F375C1D7602115DDBF3047D264B71B078DB1E8414EDA0C8F07F09466`; içinde `t-window-close.ps1` `88BCEA01…` sha kapısı.
- **Oluşturur/siler (izole, canlı DEĞİL):**
  - Firewall: `HYRT4S-<runId>-BLOCK-<p1>`, `HYRT4S-<runId>-BLOCK-<p2>` (Inbound·Block·TCP·Profile Any; `I11-WINDOW-BLOCK-*` ile **çakışmaz**; loopback etkilenmez).
  - Görev: `HYRT4S-<runId>-WEB` (tetikleyicisiz; `HukukPlatform-*` **değil**).
  - Portlar: 47100–47199 arasından boş iki port (8080/3002 **değil**).
  - Karalama dizininde log + JSON kanıtı. Sır/`.env` **okunmaz, yazılmaz**.
- **Önce/sonra ölçer:** `HukukPlatform-API`/`Web` durumu + LastRunTime, 8080/3002 PID'leri, `I11-WINDOW-BLOCK-*` sayısı; sonda `CANLI ESIT` doğrular.
- **Çıktı:** `RT4S-<runId>.log` / `.json` (sha çıktının sonunda; sır içermez). **PASS**: 6/6 senaryo + artık 0 + canlı eşit. Çıkış 0.
- **Not:** owner çalıştırmazsa R-T4a gerçek-firewall PASS'i açık kalır; R02 §7 madde 6a(i) owner kabulü bu boşluğu kapatan alternatiftir.

## 5. Yeni ve değişmeyen hash'ler (madde 3: pin/doğrulama yenileme)

| Öğe | R07 → R08 |
|---|---|
| T-PENCERE-KAPA `scripts/t-window-close.ps1` | `3F027B0D…` → **`88BCEA01A2A956F4E0AB5976E670162014860FF98E4E68177D4951718E3AB9D7`** |
| T-PENCERE-AÇ `scripts/t-window-apply.ps1` | **DEĞİŞMEDİ** `ED64A751F75B0F0C3B1406759E92C2F20DAF29018CC893A5EB387391C822BBCF` |
| İ11 §9 gömülü blok | **DEĞİŞMEDİ** `27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700` |
| yeni: `scripts/t-rt4-isolated-rehearsal.ps1` | `17B3C026F375C1D7602115DDBF3047D264B71B078DB1E8414EDA0C8F07F09466` |

**T-KAPA değişikliğinin etki alanı — OFFICE 33 (R02 yazıcısı) yenilemeli:** `RELEASE23-TEK-NIHAI-PAKET-R02.md`'de eski `3F027B0D…` geçen her yer — D3-0 `$want` sözlüğü, D3-4 çağrı bloğu sha kapısı, D3-4 tablo satırı, §1.5, §7 madde 1, §5.1 sha-uyuşmazlık satırı — **`88BCEA01…`** olmalı. §9 ve T-AÇ pinleri değişmedi.

**R05/R07 kanıtlarının geçerliliği:** T-KAPA saf yeniden düzenlemedir (iki `try` bloğu bir fonksiyona alınıp `live` dalından çağrıldı; mantık aynı). Gerilemediği **bir kez** doğrulandı (§6). R05/R06/R07'nin §9, K-PAR, T-PIN, K-ELEV, yedek bütünlüğü ve PS 5.1 env kanıtları **T-AÇ ve §9 değişmediği** için geçerliliğini korur; yalnız T-KAPA blok sha'sı yenilendi.

## 6. Regresyon — refactored T-KAPA tam pencere döngüsü (prova, PS 5.1)

Betik sha'sı değiştiği için (somut gerekçe) bir tam döngü koşuldu. Aday dist, oturum DB/Redis, yerel yakalayıcı; pin `8ACF239A…`.

| Adım | Sonuç |
|---|---|
| T-PENCERE-AÇ (`ED64A751…`) | çıkış 0 · K-T0a/K-T0/K-T8 · restart 6 sn |
| İ11 §9 koşumu (runId **a515d67b**) | **PASS 11/0/0, kapsam TAM** · anonim yol 200→404 · izolasyon eşit · From başlığı ASCII dışı ad doğru |
| T-PENCERE-KAPA (`88BCEA01…`) | K-T10b VAR (2/2) · R-T1 geri yazıldı = pin · R-T2 6 sn · R-T3 özgün hedef · R-T5/R-T6/R-T7 · **`PENCERE KAPANDI - tum adimlar basarili.`** · çıkış 0 |

Prova modunda R-T4a/R-T4b **çalışmaz** (yalnız `live`); onların gerçek işlemi §4 (owner) + §3 (mantık) ile karşılanır.

**Kanıt dosyaları (scratchpad):** `rt4s-logic.ps1` (`975C559A…`); mantık harness çıktısı ekranda; regresyon `i11s/r07window/REG-apply.out` (`135FBDB2…`) · `REG-close.out` (`16FFACA8…`) · `REG-run-a515d67b.log` (`B902970C…`); dev R-T4b gerçek-yol `i11s/rt4s/RT4S-62254688/RT4S-62254688.log` (`03FF29B7…`).

## 7. CLIENT'a/CLIENT'ten devir (mevcut ortak pakete göre)

Bu sonuç R02 karar metnine (OFFICE 33 yazar) şöyle bağlanır:
1. **§2.2 / §2.3:** "R-T4a/R-T4b hiçbir modda koşmadı" satırı → "R08: R-T4b gerçek görev+port koşuldu; senaryo mantığı 6/6; R-T4a gerçek-firewall yükseltilmiş owner komutuyla (§4) — CLIENT oturumu yükseltilemez (ölçüldü)."
2. **§7 madde 6a(i):** owner iki seçenekten birini seçer — (a) §4 tek komutu yükseltilmiş pencerede koşup R-T4a gerçek-firewall PASS'ini alır, ya da (b) kabulü R-T4b gerçek + R-T4a mantık + AST özdeşliği temelinde verir. İkisi de karar verilebilir; PASS'i olmayan yol PASS sayılmaz.
3. **§1.5 / D3-0 / D3-4 / §5.1:** T-KAPA pini `88BCEA01…` olarak yenilenir.
4. **Devir yönü:** R08 betikleri ve bu belge **CLIENT alanındadır** (`client-live-acceptance-i11-r01/`). OFFICE 33 yalnız R02 metnindeki pin ve ifade satırlarını günceller; CLIENT betiklerine yazmaz.

## 8. Açık kalemler ve sınırlar

- **R-T4a gerçek-firewall PASS:** yükseltilmiş owner komutu koşulana dek AÇIK (§4). Mantık + R-T4b gerçek + AST özdeşliği ile desteklenir.
- **`{}` artığı** (`C:\Development\HUKUK_YAZILIMI\project\{}`, 0 bayt, git'te izlenmez): önceki oturum yan etkisi; **DOKUNULMADI**, silme owner kararı.
- **CL_TOKENFIX** disk artığı: ayrı açık kalem, DOKUNULMADI.
- `i11live` / prova yedek dizinleri sır taşır (korumalı): silme owner kararı.
- İ12 başlatılmadı; İ11 canlı kabulü yapılmadı. Sayaç **10/17**, hizmet kabulü **0/8 tam**.
