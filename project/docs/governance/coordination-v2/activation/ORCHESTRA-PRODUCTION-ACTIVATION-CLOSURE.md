# ORCHESTRA-PRODUCTION-ACTIVATION-R01 — kapanış kaydı

<!-- GOV-COORD-AUTHORITY kind=PROGRAM_CLOSURE recordId=ORCHESTRA-PRODUCTION-ACTIVATION-R01 -->

```text
Program        : ORCHESTRA-PRODUCTION-ACTIVATION-R01
Parent         : OWNER-GRANT-ORCHESTRA-PRODUCTION-ACTIVATION-R01
Is paketleri   : WP00 .. WP10
Yurutme        : seri, concurrency 1
Auto-merge     : bu programin kendi PR'lari icin owner tarafindan yetkilendirildi
```

## Ne değişti — tek cümlede

Pilot **bir kez, elle** koşabilen bir araçtı; artık **kuyruğu olan, çökmeden
kurtulan, kapıları merge anında yeniden okuyan ve bir dosyayla durdurulabilen**
bir servistir.

## Neden bu iş yapıldı

Owner'ın tespiti: *"devreye alınmamış iş bitmiş demek değildir."*

T5 pilotu orkestratörün **çalıştığını** kanıtladı. Kanıtlamadığı şey, gözetim
olmadan çalışabileceğiydi. Aradaki fark bu programın tamamıdır:

| Pilot | Servis |
|---|---|
| İnsan komutu yazınca bir görev | Kuyruk kabul eder, sırayla koşturur |
| Çökme = iş asılı kalır | Kurtarma geri sarar, ikinci executor başlatmaz |
| `performMerge` her zaman fırlatır | İki anahtarlı sınırlı auto-merge |
| Durdurma yolu yok | Dosya tabanlı kill switch |
| Program açma = elle manifest | Owner kaydından mekanik türetme |

## İş paketleri

```text
WP00  gercek envanteri ve bagimlilik haritasi
WP01  kalan uc dogruluk acigi (iptal, attestation durustlugu)
WP02  standing grant modeli + iki program grant'i
WP03  kalici, idempotent, seri kuyruk
WP04  kurtarma ve idempotent devralma
WP05  sinirli auto-merge ve hedef dal senkronu
WP06  servis yasam dongusu, kill switch, operator konsolu
WP07  program eligibility authority + admission kapisi
WP08  dispatch aninda yeniden dogrulama + COLLECTION seridi
WP09  MECHANICAL_GOVERNANCE kisitli profili
WP10  operasyonel kabul ve kapanis
```

## Taşıyıcı üç ilke

### 1. Kapılar fotoğraf değildir

Attestation yazıldığı anı kanıtlar. O an ile eylem arasında dünya hareket eder.
Bu yüzden aynı kapı iki kez koşar — ilki yanlış olduğu için değil, tarif ettiği
dünyanın değişmeye vakti olduğu için:

```text
admission -> dispatch      grant iptali, eligibility degisimi, grant duzenlemesi
MERGE_READY -> merge       hedef dal ilerlemesi, review, head push, check tekrari
```

### 2. Ret kaybolmaz, daralır

`performMerge` yapısı gereği fırlatıyordu. Yerine gelen şey izin değil, **daha
dar bir ret**: iki anahtar (grant + bayrak) ve on iki gerekçe. Varsayılan —
grant yok, bayrak yok — V1/V2 pilotundaki davranışın aynısıdır.

### 3. Durdurmak, çalışanın işbirliğini gerektirmez

Kill switch bir **dosya**. İstemci yok, port yok, token yok. Push edilebilir,
elle yazılabilir, orkestratör ölüyken bile etkilidir.

## Yürürlükteki operasyonel gerçek

```text
STATUS        : OPERATIONAL
SERVICE       : on-demand (daemon degil) — pnpm orch:service
QUEUE         : kalici JSONL, git common dir altinda
CONCURRENCY   : 1 (standing grant'larda pinli, ayar degil)
AUTO-MERGE    : yalniz standing grant + --auto-merge birlikte
KILL SWITCH   : coordination-v2/activation/KILL-SWITCH
ELIGIBLE      : OFFICE, COLLECTION
DENIED        : UYAP_CONNECTOR, CLIENT, DEBTOR, RECEIVABLE
PROFIL        : MECHANICAL_GOVERNANCE — kisitli, auto-merge YOK
```

## Kabul kriterleri

25 kriter prose değil **test**tir: `service/operational-acceptance.test.cjs`.
Rapor "kill switch merge'ü durdurur" diyorsa, bu doğru olmaktan çıktığı gün
AC-21 kırmızı döner. Bir kontrol listesi ancak yazıldığı anda inanılanı söyler;
test, sistemin bugünkü hâlini söyler.

## Kapsam dışı bırakılanlar

Bunlar bu programda **yapılmadı** ve yapılmamış olmaları bir eksiklik değil,
sınırın kendisidir:

```text
daemon / servis kaydi        tek host, on-demand yeterli
dagitik lease protokolu      olmayan hata modlari eklerdi
kanonik governance yazimi    contract §1.2 — V1 akisindan gecer
production runtime aktivasyonu
schema / migration
diger dort programin acilmasi
```

## Bilinen sınırlar

```text
tek host          pid + heartbeat; makine degisirse kuyruk tasinmaz
Windows MAX_PATH  worktree dizin adi 24 karaktere kirpilir
CI suresi         Test Suite ~30 dk; required degil ama CLEAN icin beklenir
grant kapsami     yalniz characterization + bounded fix; davranis degisikligi yok
```

---

**IMPLEMENTATION AUTHORITY:** bu kayıt yalnız `ORCHESTRA-PRODUCTION-ACTIVATION-R01`
programının kapanışını belgeler. Yeni program açmaz, mevcut grant'ları genişletmez
ve gelecekteki işler için yetki üretmez.
