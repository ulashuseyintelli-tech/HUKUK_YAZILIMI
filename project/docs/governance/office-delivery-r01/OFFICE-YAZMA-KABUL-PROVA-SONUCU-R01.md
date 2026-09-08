# OFFICE Yazma Kabul Paketi — Disposable Prova Sonucu (R01)

**Durum:** PROVA TAMAM (A-03…A-06) · **CANLI KABUL DEĞİL**
**Kapsam:** `OFFICE-YAZMA-KABUL-PAKETI-R01.md` (A-02) §8 provası
**Ölçüm ortamı:** disposable PostgreSQL `hukuk_office_acc_test` @ `127.0.0.1:5439` + ayrı API örneği `127.0.0.1:8097`
**Derleme tabanı:** `project/apps` ağacı `b26d922cd7f39121b0881b62305d6e90908c80e0`
— bu ağaç **aday `d2223e78`** ile **`f8d15f73`** arasında BİREBİR AYNIDIR (iki SHA'da da aynı tree hash)
**Canlı sisteme temas:** **SIFIR** (canlı API `:8080` ve canlı DB'ye tek istek/yazma yok)

---

## 1. Bu belge NEDİR, NE DEĞİLDİR

**Nedir.** A-02 sözleşmesinin çalıştırılabilir karşılığının (harness) uçtan uca koşturulmuş
sonucu. Kanıtladığı şey **paketin kendi doğruluğudur**: ölçütler ölçülebilir mi, kapılar
gerçekten kapanıyor mu, kapanış doğrulanıyor mu.

**Ne değildir.** Canlı kabul. Hiçbir hizmetin kabulü bu belgeye dayanarak verilemez.
A-03…A-06 **kapanmamıştır**; kabul satırları ancak cutover sonrası canlı koşumla dolar.

**A-02 belgesi bu turda DEĞİŞTİRİLMEDİ** (sözleşme ana yürütücünün; harness onun uygulaması).

---

## 2. Sonuç

| Adım | Kapsam | Sonuç |
|---|---|---|
| Kurulum | A-02 §3 — 7 satır, atomik | **7/7 PASS** |
| **A-03** | Ayar yüzeyi PUT (S-01…S-08) | **53/53 PASS** |
| **A-04** | Avukat + personel yazma (S-09/S-10) | **27/27 PASS** |
| **A-05** | Personel okuma (S-10) | **12/12 PASS** |
| **A-06** | Raporlama hattı (S-11) | **17/17 PASS** |
| Kapanış | `revoke-access` | **3/3 PASS** |
| | | **PROVA SONUÇ: PASS · FAIL 0 · ÖLÇÜLEMEDİ 0** |

**A-07 KOŞULMADI.** Gerekçe §5'te; owner kararı bekliyor.

---

## 3. Provanın yakaladığı altı kusur — **hepsi harness'ta, hiçbiri üründe değil**

Provanın işi tam olarak budur: ölçüm aracının kendi kusurlarını canlıya çıkmadan bulmak.

| # | Kusur | Düzeltme |
|---|---|---|
| 1 | **A-02 §7'nin "boş izleme kümesi → FAIL" kuralı ZORLANMIYORDU** — ilk koşumda izlenen tenant 0 iken kapı PASS verdi. (F04 provasının yakaladığı kusurun aynı sınıfı: *"izolasyon kapısı boş izleme kümesiyle PASS veriyordu"*.) | Boş küme artık **hard FAIL**. Taze disposable DB'de ölçümü anlamlı kılmak için **kabul kapsamı dışı seyirci tenant** kurulur. |
| 2 | `S-05.applied` yanlış ölçüt: "hedef alan yazıldı"yı *önceki değerden farklı mı* diye ölçüyordu | Ölçüt **gönderilen değere eşit mi** oldu. Aynı-boolean gönderimi kusur değildir (A-04'ün kendi ölçütündeki nüans). |
| 3 | `S-02.delete` ölçülemiyordu: kaydın id'si yanıt şeklinden okunuyordu | Yanıt şekli sözleşmenin parçası değil → id, **kendi office'imiz içinden** DB'den okunur. |
| 4 | `A-06.tenant` ölçülemiyordu: seyirci tenant'ta kullanıcı yoktu (boş gözlem kümesi) | Seyirciye **tek kullanıcı** eklendi. Kapanış ölçütü "sıfır satır" yerine **"kurulumdan beri değişmedi"** oldu. |
| 5 | **Login rate limit**: her adım kendi login'ini yapıyordu, tam koşum **429**'a çarpıyordu | Tek yürütücü oturumu **bir kez** açar, token'ları alt süreçlere env ile geçirir; `login` sunucunun `retryAfter` değerine saygılı bekler. |
| 6 | Eklenen rate-limit önlemi **atıldı**: `ow-run.js` parolayı `process.env`'e koymuyordu, merkezî login sessizce düşüp adımlar yine tek tek login yapıyordu | `process.env` ataması eklendi; koşum çıktısında `[OTURUM] … BİR KEZ alındı` ile doğrulandı. |

### Düzeltilen ölçüm hatası (bizim tarafımızda)
İlk ölçümde `WINDOW_MS = 60_000` kilit süresi sanıldı. **Gerçek kilit `BLOCK_DURATION_MS` = 5 dakikadır**
(`MAX_ATTEMPTS = 10` aşılınca `resetAt` 5 dk'ya uzatılır). Bloke istek erken `throw` ettiği için
yeniden deneme kilidi **uzatmaz** — güvenle beklenebilir.

### G-0b'nin düzeltilen yanlış gerekçesi
G-0b (API gerçekten aynı disposable DB'ye mi bağlı) probe'u bir **login**'dir. `429` alındığında
"API başka DB'ye bağlı" diye raporlanıyordu — **yanlış**. Artık 429 ayırt edilir, `retryAfter`
kadar beklenir, yine doğrulanamazsa gerekçe dürüstçe *"bağlantı doğrulanamadı (yanlış DB iddiası değil)"*
yazılır. **Fail-closed davranış değişmedi:** doğrulanamazsa yazılan satırlar geri alınır.

---

## 4. A-02 sözleşmesiyle ölçülen iki fark (paket sahibine bildirildi)

1. **§3 satır 7 tarifi şemayla örtüşmüyor.** Paket 7. satırı *"Lawyer ikinci (ast) — A-06 raporlama
   hattı ataması"* diye tanımlıyor; ama `ReportingLine` **`actorUserId`/`managerUserId` ile KULLANICI**
   bağlar, avukat değil (`assignManager`). Satır sayısı **değiştirilmedi (7/7 korunur)**: A-06 hattı
   kurulumun iki kullanıcısıyla kurulur; ikinci avukat A-04'ün `order/update` yolunda kullanılır.
2. **A-02 çalıştırılabilir betik içermiyordu.** Belge sözleşmedir; bu turda onun uygulaması yazıldı.
   Belge yeniden yazılmadı.

---

## 5. A-07 neden koşulmadı

`OfficeApprovalExecutorService.execute()`'un ürün kodunda **tek çağıranı cron'dur**
(`office-approval-executor-cron.service.ts:126` / `:159`); `office-approval.controller.ts`'te
**yürütme ucu yoktur**. Dolayısıyla ADR-009 tek-motor yürütme izini üretebilen başka yol yok:
*"cron kabul satırını yürütmesin"* ile *"yürütme izi üret"* mevcut kodla **aynı anda sağlanamaz**.

Kod-dışı kaldıraç aranıp bulunamadı: cron/executor'da tenant lifecycle yüklemi **sıfır**;
üç `findMany`'nin yüklemi yalnız status + executionStatus + SCOPE, **tenant filtresi yok**;
`PENDING_APPROVAL` penceresi olasılıksaldır; bayrağa güvenmek owner tarafından yasaklandı.

**Sonuç:** A-07 için kontrollü bir yürütme tetikleyicisi (uygulama kodu) ve talebe kesin bağ
(`CaseStatusHistory.approvalRequestId` + `approvalAttempt`) gerekir. Bu, **migration ve kalıcı
üretim API yüzeyi** demektir; her ikisi de bu oturumun owner yetkisinin **açıkça dışındadır**
ve yazılmamıştır. Tasarım hazırdır, owner kararı beklenmektedir.

---

## 6. Harness dosyaları

`scripts/` altında; **`project/apps` altına tek dosya bile eklenmemiştir** (delta **0**, kanıtlandı).

| Dosya | İş |
|---|---|
| `ow-lib.js` | G-0…G-4 kapıları · HTTP · oturum · sonuç toplayıcı |
| `ow-01-setup.js` | 7 satırlık atomik kurulum · izolasyon baseline · G-0b |
| `ow-03-settings.js` · `ow-04-writes.js` · `ow-05-staff-read.js` · `ow-06-reporting.js` | A-03…A-06 |
| `ow-99-teardown.js` | `preserve` / `revoke-access` / `purge` (canlıda yasak) |
| `ow-run.js` | Tek yürütücü; kapanış `finally`de |

### F04 paketinin iki kanıtlanmış kusuru burada tekrarlanmadı
- Kapanış `finally` yolunda çalışır ve **envanter hatası kapanışı engellemez**.
- **Çıkış kodu beyaz listesi YOKTUR.** `f04-run.js` kapatmayı `setupCode === 0 || 4`'e bağlıyordu;
  commit sonrası herhangi bir hata "kurulum commit edilmedi" sayılıp hesabı açık bırakıyordu (fail-open).
  Burada kapatma kararı **yalnız "tenant gerçekten var mı"** ölçümüne dayanır; ölçüm yapılamazsa
  kapanış **yine denenir**.
- Üçüncü ders: ölçüm yapılamıyorsa sonuç `OLCULEMEDI` + nonzero; "yok" sayılmaz.

---

## 7. Sınırlar

- Bu prova **canlı kabul yerine geçmez**; A-03…A-06 **AÇIK** kalır.
- Kesinti enjeksiyonu **yalnız izole provada**; canlıda asla.
- Canlı kabul koşumları **cutover'dan sonra** yapılmalıdır: her canlı kabul koşumu paket
  `dbSnapshot` pin'ini oynatır (ana yürütücünün ölçümü).
- **IMPLEMENTATION AUTHORITY: NONE. PRODUCTION AUTHORITY: NONE.** Bu belge canlı çalıştırma
  yetkisi üretmez.
