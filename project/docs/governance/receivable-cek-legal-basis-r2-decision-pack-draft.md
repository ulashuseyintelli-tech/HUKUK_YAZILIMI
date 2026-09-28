# RCV-LB-R2-CEK — Karşılıksız Çek Hukuki Dayanak ve Alt Tür Karar Paketi (TASLAK)

> **STATÜ: TASLAK — OWNER HUKUKİ ONAYI GEREKLİ (`DRAFT_PENDING_OWNER_LEGAL_RATIFICATION`).**
> Bu paket K3 AUTO-GENERATE FORMATION (owner GO 2026-09-28) için ajan tarafından hazırlanmıştır. Hukuki içerik
> (normatif atıflar, oran, yuvarlama, kategori, yürürlük, kanıt ve sorumluluk kuralları) **owner ve son hukuki
> onaylayıcı tarafından doğrulanmadan üretim yetkisi DEĞİLDİR**. Kod, bu içeriği yalnız açık bir geliştirme/test
> bayrağıyla (`allowDraftContent`) kabul eder; üretimde manifest statüsü `OWNER_LEGAL_AUTHORITY_RATIFIED` olmadan
> çözücü `AUTHORITY_UNAVAILABLE` döner.

## 1. Kapsam

- Yalnız **çek (CEK)**: owner kararı 2026-09-28 "çek kaydı kaynak + yalnız tazminat".
- Kaynak: sunucudaki çek kaydının (`CaseInstrument`, `instrumentType = CEK`) değişmez sürümü.
- Senet, bono, poliçe, kira, ilam ve `generate-from-rules` bu paketin DIŞINDADIR.
- R1 (nafaka) sürümü ve v2 alt tür sicili DEĞİŞMEZ; bu paket ayrı bir taslak sürüm ve ayrı bir alt tür sicil
  parçasıdır.

## 2. Alt türler (sicil taslağı, `registryVersion = 3`, yalnız çek girdileri)

| Alt tür | Kategori | Kalem türü (ClaimItem) | Hukuki nitelik (taslak) |
|---|---|---|---|
| `CHECK_PRINCIPAL` | `PRINCIPAL` | `PRINCIPAL` | Karşılıksız çıkan çekin bedeli |
| `CHECK_PENALTY` | `ANCILLARY` | `CHECK_PENALTY` | Ödenmeyen çek bedeli üzerinden çek tazminatı |

**Owner kararı gereken nokta A — kategori:** governance adayı `R02-CAND-CHECK-PENALTY` "COST veya ANCILLARY"
diyor. Taslak **ANCILLARY** seçer (asıl alacağa bağlı, bedelden türeyen fer'i alacak; masraf değil).

## 3. Hukuki dayanaklar (sürüm taslağı `RCV-LB-R2-CEK`, `releaseVersion = 1`)

| Kod | Sürüm | Normatif atıf (TASLAK — doğrulanacak) | İzinli alt tür | Kaynak türü |
|---|---|---|---|---|
| `TTK_CEK_BEDELI` | 1 | 6102 s. Türk Ticaret Kanunu, çeke ilişkin hükümler (m. 780 vd.) ve hamilin başvuru hakkı | `CHECK_PRINCIPAL` | `CEK` |
| `TTK_CEK_TAZMINATI` | 1 | 6102 s. TTK — ödenmeyen çek bedelinin **%10'u** oranında çek tazminatı (başvuru kapsamı hükmü; madde numarası doğrulanacak) | `CHECK_PENALTY` | `CEK` |

**Owner kararı gereken nokta B — normatif atıfların madde numaraları** hukukçu tarafından doğrulanmalıdır.

## 4. Kanıt, sorumluluk ve tutar kuralları

- **Kanıt sınıfları (kaynak çözücüden):**
  - `CHECK_INSTRUMENT_RECORD`: çek kaydı mevcut (seri, tutar, para birimi, keşide tarihi).
  - `CHECK_DISHONOUR_RECORD`: karşılıksız işlemi (`isBounced = true` ve `bounceDate` dolu).
  - İki alt tür de **ikisini birlikte** ister.
- **Sorumluluk:** `TAM`; takip edilen borçlular istekte AÇIKÇA verilir; örtük "tüm borçlular" YASAK. Kalem bazlı
  borçlu kümeleri SUNUCUDA, dosyadaki borçlu rollerinden ayrılır (K3-L, owner kararı 2026-09-28 — **avukat teyidi
  bekler**):
  - Çek bedeli (`CHECK_PRINCIPAL`): keşideci (`KESIDECI`), ciranta (`CIRANTA`), aval veren (`AVAL`).
  - Çek tazminatı (`CHECK_PENALTY`): **yalnız keşideci ve keşideci lehine aval veren**. Ciranta ve ciranta lehine
    aval veren tazminattan sorumlu değildir.
  - Aval verenin kimin lehine aval verdiği dosyada kayıtlı olmalıdır (`CaseDebtor.avalForDebtorId`); kayıtlı değilse
    talep reddedilir. Rolü çek borçlusu olmayan (`ASIL_BORCLU`, `LEHDAR`, `MUHATAP` …) borçlu reddedilir.
  - Onay anında roller kilitli olarak yeniden doğrulanır; onay beklerken rol, lehine aval veya etkinlik değiştiyse
    kalem oluşmaz.
  - Kısmi aval (tutarla sınırlı aval) bu sürümde kalem düzeyinde sınırlanmaz — açık nokta.
- **Tutar:**
  - Çek bedeli = çek kaydındaki tutar AYNEN.
  - Tazminat = çek bedelinin **%10'u**, kuruşa **yarıdan yukarı** yuvarlanır.
  - İstemcinin gönderdiği tutar kullanılmaz; gönderilirse kayıtla eşit olmalıdır.
  - **Owner kararı gereken nokta C:** yuvarlama kuralı ve %20 seçeneğinin (eski uygulama istemciden %10/%20
    alıyordu) dışarıda bırakılması.
- **Para birimi:** çek kaydının para birimi; dönüşüm YASAK.
- **Yürürlük anı (`effectiveAt`):** karşılıksız işlem tarihi (`bounceDate`); sürüm `effectiveFrom =
  2012-07-01T00:00:00Z` (6102 s. TTK yürürlüğü). **Owner kararı gereken nokta D.**
- **Faiz:** bu formation faiz kalemi ÜRETMEZ; iki kalem de `interestAccrualStatus = UNKNOWN` ile doğar (politika
  bekletmesi) ve faiz işletimi mevcut onaylı güncelleme akışıyla belirlenir.

## 5. Çift sayım kuralı (owner kararı 2026-09-28)

- Çek bedeli `POST /cases` ile `CASE_INSTRUMENT_GENERATOR` rotasından zaten üretilmişse (çek kaydına bağlı
  PRINCIPAL kalemi varsa) formation çek bedeli **ÜRETMEZ**, yalnız tazminat üretir.
- Aynı çek + aynı kalem türü ikinci kez kesinleşemez (kaynak koruması `HUMAN_INSTRUMENT`).

## 6. Ratifikasyon prosedürü (canlıya açılmadan önce)

1. Owner/hukukçu A–D noktalarını ve §3 atıflarını doğrular veya düzeltir.
2. Düzeltilen JSON'lar yeniden kanonikleştirilir; doğrulayıcı
   (`scripts/governance/validate-receivable-cek-legal-basis-release-r2.cjs`) checksum'ları yeniden üretir.
3. Manifestte `contentRatification.status = OWNER_LEGAL_AUTHORITY_RATIFIED` ve bu paketin SHA-256'sı yazılır.
   Bu değişiklik ayrı bir owner onaylı PR'dır.
4. Çalışma bayrağı yalnız ayrı canlı GO ile açılır.
