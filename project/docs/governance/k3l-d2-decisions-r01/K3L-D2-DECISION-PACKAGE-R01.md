# K3-L D2 — Kanonik Bakiye Karar Paketi R01

- **Tarih:** 30.09.2026 (TSİ)
- **Dayanak:** owner GO 2026-09-30 "#2846 kapanışı ve kalan işlerin somutlaştırılması", madde 2 ve 4.
- **Kaynak kod:** origin/main `626362b8` (D2-b1 #2846 dahil).
- **Kapsam dışı (bu pakette yapılmadı):** hesap politikası değişikliği, canlı DB erişimi, geçmiş kayıt düzeltmesi, bayrak açma.
- **R02 (01.10.2026):** `K3L-D2-DECISION-PACKAGE-R02.md` bu paketi üç gruba indirir (KP-6 önceki kararla — ADR-014 MUST-3/I-15 — çözülen gruba geçti; KP-1 owner yönüyle birlikte karar grubunda kalır; KP-7 pilot etiketine daraldı), TK-1…TK-4 düzeltmelerini (#2859 MERGED `d4f2b9fc`, #2860 MERGED `2507f73c`) ve 3095 md. 1 kayıt düzeltmesini (yürürlük 31/7/2026) taşır. Bu dosya kanıt ve ayrıntı kaydı olarak yerinde kalır.

## 0. Yöntem ve kanıt sınırı

- **Kod ve belge:** her madde için kod ve belge taraması yapıldı. Tarama salt okumaydı, `git show 626362b8` üzerinden yürütüldü. Bulgular iki ayrı eleştiri ajanıyla çürütmeye çalışıldı: biri "zaten karara bağlı mı / sınıf doğru mu", diğeri "sayılar doğru mu" sorusuna baktı. Eleştiri düzeltmeleri bu metne işlendi.
- **Sayılar:** "**motorla doğrulandı**" işaretli değerler gerçek `CaseBalanceService` + `InterestEngineService` ile koşuldu. Veri sahte prisma ve oran sağlayıcıyla sentetik olarak verildi. Kaynak `evidence/dp-scenarios.measure.spec.ts.txt`, sonuç `evidence/dp-scenarios.result.json`. İşaretsiz değerler kod okumasıyla ya da elle hesaplandı ve öyle yazıldı.
  - Sabit oran olarak %36,5 kullanıldı; günlük faiz tutarın binde biridir.
  - Değişken oranlı senaryolardaki oranlar **sentetiktir**, gerçek yasal faiz oranı değildir.
- **Hukuki metin:** güncel resmî Mevzuat PDF'lerinden okundu:
  - 6098 sayılı TBK md. 100, 101, 102 ve 120;
  - 3095 sayılı Kanun md. 1 ve 2;
  - 2004 sayılı İİK md. 58.

  Metinden hesap kuralı türetilmedi; yalnız karar gerektiren noktaların dayanağı gösterildi.
- **Canlı veri ölçülmedi.** Erişim ve yetki yok. Etki sayımı için salt okuma planı §5'te.
- **Canlı sürüm notu:** #2853 kaydına göre canlıdaki sürüm R27 (aday `1b758d29`). R27 paket kaydına göre bu adayın kaynak zinciri K3-L düzeltmelerini (#2845, #2846, #2848 …) içermiyor. Buradaki kusurların bir kısmı bu yüzden canlıda sürüyor olabilir. Bu durum ölçülmedi.

## 1. KARAR GEREKENLER — tek tablo

Yalnız kaynaklarda karara bağlanmamış ve teknik düzeltmeyle çözülemeyen noktalar.

| # | Karar | Seçenekler | Öneri | Sınıf | Bağımlılık |
|---|---|---|---|---|---|
| **KP-1** | **Birden çok anapara arasında mahsup sırası** (K-8, K-2). İki yolda tek, sürümlü kural. | (A) kanonik: faiz başlangıcı · (B) `sortOrder` · (C) vade artan + deterministik ikincil anahtar, vadesiz kalemde engel · (D) owner R2 dizisi (ALC-P1-3) | **D.** ALC-P1-3 dizisi TBK 101–102 ile örtüşüyor (§4); iki yolda tek sürümlü politika olur. Owner'dan beklenen teyitler aşağıda. | HUKUKİ KURAL (TBK 101–102) + owner teyidi | K-2-EK hizalaması; PaymentDesignation (ALC-P1-1); K-3 |
| **KP-2** | **Dosya faiz türü kullanıcı seçmeden varsayılan "YASAL" olabiliyor** (K-6a). Belge ve kanonik hesap bu değeri farklı yorumluyor. | (A) varsayılan YASAL meşru (bugün) · (B) hesap sürer + "dosya faiz türü teyitsiz" uyarısı; yeni dosyada açık seçim zorunlu · (C) seçim kaynağı olmayan tür çözülemeyen sayılır | Hukuki doğrulama bitene kadar **kural değiştirilmez**. Sonra **B**. Ayrıca oran tablosunun 3095 md. 1 değişikliğine (7589 md. 10; kabul 16/7/2026, **yürürlük 31/7/2026** — R02 §5) uygunluğu doğrulanmalı. | HUKUKİ KURAL (TBK 120; 3095 md. 1–2) + ürün | K-6, K-9 |
| **KP-3** | **Takip talebinde istenmiş işlemiş faiz kayıtlarının (eski INTEREST / PRE / POST) kanonik temsili** (K-7). | (A) bugünkü dışlama · (B) dışlama + görünür tanı · (C) ADR-014 hedefi: sabit ACCRUED_INTEREST kovası; göç ve envanter | Kısa vade **B** (teknik; TK-7). Hedef **C**. Owner kararı eski kayıtların envanter ve göç biçimi için gerekir. | Ürün / yönetişim (anlam karara bağlı) | KP-1, K-5c |
| **KP-4** | **Sorumluluğu kaydedilmemiş çek tazminatı** simülasyonda nasıl ele alınır (K-3b). Varsayılan `isAllDebtorsLiable=true`. | (i) tüm borçlular · (ii) dışarıda + tanı · (iii) ödemesiz dosyada brüt kesin + etiket; ödemeli dosyada engel | **(iii)** | Ürün (sorumlu kişi owner kararıyla belirli) | TK-6 |
| **KP-5** | **Tarihi kaydedilmemiş masraf** geriye dönük mahsup edilir mi (K-3c) | (i) kayıt anı (`createdAt`) masraf tarihi sayılır · (ii) ödemeli dosyada engel + tanı · (iii) masraf doğum tarihi alanı (şema) | Kısa vade **(ii)**, kalıcı çözüm **(iii)**. `createdAt` hukuki tarih sayılmamalı. | İlke karara bağlı (ADR-014 tarih ilkesi); veri modeli kararı | TK-6 |
| **KP-6** | **Q4 / MUST-10 okumasının teyidi.** Q4 "dağıtılmaz" kalıcı kilit mi, aşama ertelemesi mi? MUST-10 dağıtımı yasaklar mı, yalnız sunum ayrımı mı? | (A) Q4 aşama ertelemesi, MUST-10 sunum kuralı · (B) kalıcı kilit | **A.** Kod yorumları dağıtımın G4c-3'e bırakıldığını söylüyor. | Yorum teyidi | TK-6 |
| **KP-7** | Pilot ekrandaki "**Toplam tahsilat**" etiketi neyi göstermeli (K-5b) | (A) dosyaya gelen para · (B) borca tahsis edilen | **A** (etiket anlamıyla uyumlu). Pilot varsayılan kapalı. | Ürün (etiket) | TK-4, TK-5 |
| **KP-8** | **DİĞER türündeki çoklu OCR evrakı** için eşleme / ret kuralı ve çoklu tarama akışı (SEP-A). FATURA modeli zaten donmuş. | (A) fatura → onaylı PRINCIPAL taslak kalem; DİĞER → zorunlu kullanıcı kararı; `instruments[]` yalnız kambiyo · (B) bugün: ret + elle giriş | **A** (§6.1) | Ürün | — |
| **KP-9** | **Kanıtsız varsayılan yetki** için yönetimin "onayla" aksiyonu (SEP-B) | (A) ayrı onay aksiyonu + avukat kartında durum rozeti · (B) bugün: değiştir-geri al · (C) aynı değer kaydını onay say | **A** (§6.2). Ayrıca karar: kendi kaydını kim onaylayabilir? | Ürün / yetki | — |
| **KP-10** | **Geçmiş dosya etki sayımı için erişim** (SEP-C) | (A) son yedeğin izole geri yüklemesinde salt okuma · (B) canlı salt-okuma rolü · (C) ölçmeden karar | **A** (§5). Canlıya dokunmaz. | Erişim GO'su | — |
| **KP-11** | **Hesap tarihi varsayılanı** (COL/OD-02): kullanıcıya hangi "as-of" tarihi varsayılan gösterilir | (A) bugün · (B) son ödeme tarihi · (C) kullanıcı seçer | Owner tercihi. K-4'ün teknik düzeltmesinden (TK-3) bağımsız. | Ürün | TK-3 |

KP-1 için owner'dan beklenen teyitler:
1. Aynı takipteki anaparalarda "ilk takip edilen" ölçütü eşit kalır; sıra vadeye geçer.
2. Eşit vadede orantılı mahsup yapılır.
3. Vadesi kaydedilmemiş anaparada açık engel verilir.
4. Borçlunun ödemeyi hangi borca saydığını bildirmesi (TBK 101) ve makbuz verisi için yapısal alan yok (PaymentDesignation). Bu alan olmadığı sürece kanuni sıra (TBK 102) uygulanır ve bu durum açık etiketle gösterilir.

**İsteğe bağlı küçük ürün seçimi (K-1/C):** karar gerekmez. Bir para biriminde ödeme yoksa, çözülebilen kalemlerin kesin sonucu yalnız ofis içi tanı olarak gösterilebilir. Kamuya açık toplam, ekstre ve skor bu durumda yine `null` kalır.

## 2. KARARA BAĞLI OLANLAR — owner'a yeniden sorulmuyor

| Madde | Karar kaynağı | Mevcut kod | Sonuç |
|---|---|---|---|
| **K-1** karma dosyada kısmi sonuç | ADR-014 RD01 (129–135): eksik bağlam → tipli `null` + UNAVAILABLE; I-10 (UI = API = rapor); decision-log PR-A5 (sessiz atlama yok) | D2-b1 (#2846) bu kuralla uyumlu | Değişiklik yok |
| **K-2-EK** denetim alanları eksik ya da çelişkili NO_INTEREST | decision-log PR-A0 A2/A4 (800), RCV-CLAIM-FORM-P01 "UNRESOLVED ≠ NO_INTEREST" (665), PR-A5 (744) | Kod bu kaydı "açık faizsiz" etiketliyor (sayısal etki yok; iki durum da engel) | Teknik hizalama (TK-9) |
| **K-4b** hesap tarihinden sonraki iptal | ADR-014 MUST-6 / I-07: bağlı tam ters kayıt → sıfır net etki; COL-INV-036 | Kod uyumlu (motorla doğrulandı: iptal edilen ödeme netlenir) | Değişiklik yok |
| **K-6** UNKNOWN tahakkuklu kalemin dosya düzeyi faizle işlemesi | Şema: UNKNOWN ≠ NO_INTEREST; ALC-P0-3B3 (decision-log 857): dosya türü + kalem tarihi meşru kaynak | Kod uyumlu. İstisna: politika bekletmeli (ALLOWED_WITH_POLICY_HOLD) oluşum kalemi faiz alıyor; RECEIVABLE-GOVERNANCE 23.7.8 ile çelişiyor (TK-10) | Kalan soru KP-2 |
| **K-3** mahsup kategori sırası (MASRAF → FER'İ → FAİZ → ANAPARA) | legal-kernel doc-27 (owner-legal kilit 13.06.2026), ADR-014 MUST-3 / I-15 / I-16, REC-ALLOC-001 | Kanonik motor masraf ve fer'iyi simülasyona almadığı için sıra fiilen bozuk | Teknik kusur (TK-6) |
| **K-5** brüt tahsilatın anlamı | REC-ALLOC-008: tahsilat = Σ uygulanan + held kalan | Görünüm formülü kısmi fazla ödemede aynı parayı iki kez sayıyor | Teknik kusur (TK-4) |
| **K-9** bilinmeyen oran | Owner GO ("bilinmeyeni sıfır sayma"), ADR-014 MUST-7 / MUST-NOT-9, motor spesifikasyonu req. 14 | Oran yoksa faiz 0; boşlukta komşu ya da gelecek oran; görünüm "OK" | Teknik kusur (TK-1, TK-2) |

## 3. TEKNİK KUSURLAR — owner kararı gerekmez; bu GO "hesap politikasını değiştirme" dediği için UYGULANMADI

Her biri ayrı, dar bir düzeltme PR'ı önerisidir. Önerilen sıra tablodaki sıradır.

| # | Kusur | Kanıt (sentetik) | Etki |
|---|---|---|---|
| **TK-1** (K-9b) | Oran araması faiz türüne göre süzülmüyor. Aynı dosyada sabit oranlı bir kalemin sentetik oranı, değişken oranlı kalemin dönemine uygulanıyor. | **Motorla doğrulandı:** A (değişken, sentetik %73) tek başına faiz 180,00. Aynı dosyaya B (sabit %36,5, 01.02 başlangıç) eklenince A'nın faizi **121,00**; dosya toplamı 2.180 (doğrusu 2.239). Görünüm "OK", yalnız ham `E_RATE_OVERLAP` uyarısı var. | Faiz eksik; kullanıcı fark etmez |
| **TK-2** (K-9) | Oran tablosunda boşluk ya da hiç oran yok → komşu, gelecek ya da **sıfır** oran; görünüm "OK" | **Motorla doğrulandı:** 1.000 TL, değişken, 01.01–01.04. Şubat satırı yok → faiz 121,00 (Şubat Ocak oranıyla). Başlangıç 10.02 → 100,00 (Şubat **Mart** oranıyla). Oran tablosu boş → faiz **0,00**, `totalDue` 1.000, "OK". | "Bilinmeyeni sıfır sayma" ihlali |
| **TK-3** (K-4) | Faiz hesap tarihinde kesiliyor, ama hesap tarihinden **sonraki** ödeme yine bakiyeden düşülüyor. Çıktı hiçbir tarihteki gerçek duruma karşılık gelmiyor. | **Motorla doğrulandı:** 1.000 TL %36,5, 01.01'den; ödeme 100 TL (01.05); hesap tarihi 11.04. Bugün `totalDue` 1.000, kalan faiz 0 (müvekkil ekstresinde işlemiş faiz satırı çıkmaz). Kesim filtresiyle **1.100**. | As-of bakiyesi ve ekstre yanlış |
| **TK-4** (K-5a) | Görünümdeki `grossReceivedAmount` = tahsis + HELD. Kısmi fazla ödemede aynı parayı iki kez sayıyor. | **Motorla doğrulandı:** 1.000 anapara, 1.200 tahsilat, kalıcı HELD 200 → brüt **1.400** (gerçekte gelen 1.200) | Pilot ve uyumluluk adaptöründe yanlış toplam |
| **TK-5** (K-5b) | `totalPaid` / `allocatedPaid` "borca tahsis edilen" anlamında, ama değer ödemenin yüz değeri | Aynı senaryoda 1.200 (tahsis edilen 1.000) | Etiket için KP-7 |
| **TK-6** (K-3a) | Masraf ve fer'i kanonik mahsup simülasyonuna girmiyor. Kategori sırası karara bağlı olduğu hâlde ödeme faiz ve anaparaya gidiyor. | **Motorla doğrulandı:** 10.000 anapara %36,5, masraf 500, çek tazminatı 1.000; 1.200 tahsilat (31.01); hesap tarihi 02.03. Kanonik: faiz 300 + anapara 900 → `totalDue` 9.373; masraf ve tazminat brüt kalıyor, kalan **10.873**. Kalıcı yol (kod okuması): masraf 500 + tazminat 700. | İki yol aynı parayı farklı kaleme yazıyor |
| **TK-7** (K-7) | İstenmiş işlemiş faiz kalemi kanonikte **sessizce** dışlanıyor; tanı yok, görünüm "OK" | **Motorla doğrulandı:** 10.000 %36,5, istenmiş faiz 500 (01.12–20.01), takip 20.01, tahsilat 1.000 (01.03), hesap tarihi 31.03. Anapara faizi takip tarihinden başlarsa **9.682**. Talep edilen faiz dahil edilseydi (elle hesap) 10.197; **515 TL eksik** ve görünmüyor. | Adli belge (İİK 58/3) ile ofis hesabı ayrışıyor |
| **TK-8** (K-8t) | Kalıcı mahsupta eşit `sortOrder`'lı kalemlerde sıra belirsiz (DB satır sırası) | Kod okuması: iki 10.000 TL kalemde iki 4.000 TL ödeme, sıraya göre (A 2.000 / B 10.000) ya da (A 6.000 / B 6.000) | Ölçülmedi; deterministik değil |
| **TK-9** (K-2-EK) | Denetim alanları eksik ya da çelişkili NO_INTEREST kaydı "açık faizsiz" etiketleniyor | Envanter `NO_INTEREST_AUDIT_INCOMPLETE`, UYAP adaptörü `NO_INTEREST_CONFIGURATION_CONFLICT` diyor; kanonik taşıma `NO_INTEREST_DECLARED` | Bugün sayısal etki yok (iki durum da engel); b2 öncesi zorunlu |
| **TK-10** (K-6) | Politika bekletmeli oluşum kalemi faiz alıyor (RECEIVABLE-GOVERNANCE 23.7.8 aksini söylüyor) | Kod okuması | Faiz fazla |
| **TK-11** | Borçlu skoru "güvenli" yolda `totalDue` değerlerini para birimi dönüştürmeden topluyor (REC-ALLOC-008 çapraz para birimi toplamını yasaklar) | Kod okuması (`financial-input.adapter.ts:62-64`) | Skor girdisi |
| **TK-12** | Takip talebi metni TBK 100 sırasının masraf ve fer'iyi kapsadığını söylüyor; kanonik motor bu kalemleri mahsup etmiyor (TK-6) | Kod okuması (`template-engine.service.ts:1148`) | Belge ile hesap tutarsız |
| **TK-13** | Takip talebi şablonu dosya türü "YASAL"ı "belirtilmemiş" sayıp çek / senet / fatura dosyasında TİCARİ faize karar veriyor; kanonik hesap aynı değeri yasal faiz olarak işletiyor | Kod okuması | Belge ile hesap tutarsız (KP-2) |

## 4. MADDE AYRINTILARI (karar gerekenler)

### KP-1 — Anaparalar arası mahsup sırası (K-8, K-2)

- **Mevcut kod:**
  - Kanonik: `claim-priority.service.ts` OLDEST_DUE_FIRST, faiz başlangıç tarihine göre (mühendislik varsayılanı).
  - Kalıcı: `summary-engine.service.ts:621-629` `sortOrder`; eşitlikte sıra belirsiz (TK-8).
  - Kategori sırası karara bağlı (§2). Anaparalar arası sıra hiçbir owner ya da hukuki kayıtta karara bağlanmamış. Tek yön veren kayıt: owner R2 düzeltmesi, `product-backlog.md` ALC-P1-3. Bu kayıt `sortOrder` kullanımını sorun olarak işaretliyor ve şu diziyi yazıyor: açıklama → makbuz → muaccel → ilk takip edilen → vade → orantılı → güvencesi en az.
- **Hukuki dayanak** (6098 TBK, resmî metin):
  - **md. 101:** birden çok borcu olan borçlu, ödeme gününde hangisini ödediğini bildirebilir. Bildirmezse ödeme, derhâl itiraz etmedikçe, alacaklının makbuzda gösterdiği borca sayılır.
  - **md. 102:** geçerli açıklama ya da makbuzda açıklık yoksa ödeme muaccel borca sayılır. Birden çok muaccel borçta ilk takip edilen borca, takip yoksa vadesi önce gelen borca sayılır. Vadeler aynıysa mahsup orantılıdır. Hiçbirinin vadesi gelmemişse ödeme güvencesi en az olan borca sayılır.
  - **md. 100:** borçlu faiz ya da giderleri ödemede gecikmemişse kısmi ödemeyi ana borçtan düşme hakkına sahiptir; aksine anlaşma yapılamaz.
    - Kodun kategori sırası (önce masraf, fer'i ve faiz) doc-27 ile owner-legal kilitli.
    - İcra takibindeki temerrüt hâliyle birlikte okunması **avukat teyidi** ister; bu paket bunu kurala çevirmez.
- **Sayısal örnek A (K-8)** — takip 15.03, tahsilat 15.000 TL (01.04), hesap tarihi 30.04:

  | Kalem | Anapara | Oran | Faiz başlangıcı = vade | sortOrder |
  |---|---|---|---|---|
  | A | 10.000 | %36,5 | 01.01 | 1 |
  | B | 10.000 | %73 | 01.03 | 0 |

  | Seçenek | Sonuç |
  |---|---|
  | Kanonik (faiz başlangıcı → A önce) | **Motorla doğrulandı:** faiz 1.520 → A kapanır → B 6.520 kalır; `totalDue` **6.898,16** |
  | TBK 102 (aynı takip → vade önce gelen A) | Aynı: 6.898,16 |
  | `sortOrder` (B önce) | Elle hesap: faiz 1.520 → B kapanır → A 6.520; `totalDue` **6.709,08** |
  | Kalıcı yol bugün | Kod okuması: işleyen faiz bilinmediği için 15.000 TL'nin tamamı anaparaya; kalan A 5.000, B 0. **Aynı tahsilat iki yolda farklı kaleme bağlanıyor.** |

- **Sayısal örnek B (K-2)** — 01.03'te 6.000 TL tahsilat, hesap tarihi 30.09:

  | Kalem | Anapara | Faiz | Vade |
  |---|---|---|---|
  | A | 10.000 | %36,5 | 01.01 |
  | N | 5.000 | NO_INTEREST | 01.02 |

  | Seçenek | Sonuç |
  |---|---|
  | Bugün | Motorla doğrulandı: o para biriminde sonuç yok, `NON_ACCRUING_NOT_SIMULATED` engeli |
  | A önce (vade) | Motorla eşdeğer koşum: 590 faiz + 5.410 anapara → A 4.590 + faiz 977,67 + N 5.000 = **10.567,67** |
  | N önce | Motorla eşdeğer koşum: 590 faiz + N 5.000 + A 410 → A 9.590 + faiz 2.042,67 = **11.632,67** |

  Seçenekler arasındaki fark **1.065,00 TL**. Sıra seçimi borçlu bakiyesini doğrudan değiştiriyor.
- **Kullanıcıya etkisi:**
  - Ofis içi hesap özeti ve borçlu bakiyesi: sıraya göre değişir.
  - Gerçek tahsilat kaydı: kalıcı mahsup kalemi değişir. Geçmiş kayıtlar yeniden yazılmaz; yeni kural yalnız ileriye uygulanır.
  - Adli belge: takip talebi toplamı etkilenmez (talep tutarları). Ödeme sonrası bakiye bildirimleri etkilenir.
- **Öneri:** **D.** ALC-P1-3 dizisi tek, sürümlü politika olarak iki yolda uygulanır; owner teyitleri §1'de. Ön koşullar TK-8 ve TK-9. b2 (faizsiz anaparanın simülasyonu) bu karardan sonra gelir.

### KP-2 — Varsayılan "YASAL" dosya faiz türü (K-6a)

- **Mevcut:** `Case.interestType` NOT NULL, varsayılanı YASAL. Kullanıcı seçmese de dolu geliyor.
  - Kanonik hesap kademe 1.5 / 3 ile bu değeri LEGAL_3095 olarak işletiyor. Örnek: 10.000 TL UNKNOWN kalem, 1.000 TL tahsilat → **9.860,60** (motorla doğrulandı; SABIT dosya türüyle aynı yol). "Tür varsayılandı" bilgisi hiçbir çıktıda görünmüyor.
  - Takip talebi şablonu aynı YASAL değerini "belirtilmemiş" sayıp çek / senet / fatura dosyasında TİCARİ seçiyor (TK-13).
  - UYAP XML hattı UNKNOWN kalemde faiz elemanı üretmeyi reddediyor (fail-closed).
- **Hukuki dayanak** (resmî metin):
  - **TBK md. 120/1:** temerrüt faizi oranı sözleşmede kararlaştırılmamışsa faiz borcunun doğduğu tarihte yürürlükteki mevzuata göre belirlenir.
  - **3095 md. 1** (7589 s.K. md. 10 ile değişik; kabul 16/7/2026, RG 31/7/2026-33326, **yürürlük 31/7/2026** — R02 §5 düzeltmesi): kanuni faiz, TCMB'nin önceki yılın 31 Aralık günü kısa vadeli kredi işlemlerinde uyguladığı reeskont oranının %80'i. 30 Haziran oranı önceki yılın 31 Aralık oranından beş puan veya daha çok farklıysa yılın ikinci yarısında 30 Haziran oranının %80'i geçerli. 7589 bu değişiklik için yeni geçiş hükmü eklemedi; 3095'in mevcut Geçici Madde 1–2'sinin uygulanması hukuki yorum ister.
  - **3095 md. 2:** temerrüt faizi; ticari işlerde avans faizi istenebilir.
- **Karar gereken:**
  - Seçim kaynağı olmayan "YASAL" hukuken "oran kararlaştırılmamış → mevzuat faizi" anlamında kullanılabilir mi, yoksa kullanıcı seçimi mi zorunlu?
  - Belge ile hesap hangi yorumda birleşir?
  - Oran tablosunun 7589 değişikliğini yansıtıp yansıtmadığı **ölçülmedi**; hukuki / veri doğrulaması gerekir.
- **Öneri:** doğrulama bitene kadar kural değişmez. Sonra B: hesap sürer, "dosya faiz türü teyitsiz" uyarısı gösterilir, yeni dosyada açık seçim zorunlu olur.

### KP-3 — İstenmiş işlemiş faiz kayıtları (K-7)

- **Mevcut:** INTEREST / PRE / POST ClaimItem kanonikte Q6 ile dışlanıyor; kalıcı mahsupta pay alıyor.
  - Anapara faizi vadeden başlıyorsa sonuç tutarlı: **10.197** (motorla doğrulandı).
  - Takip tarihinden başlıyorsa istenmiş faiz hiçbir çıktıda yok: **9.682** (motorla doğrulandı). Fark 515 TL.
- **Hukuki dayanak:** İİK md. 58/3. Takip talebinde faizli alacaklarda faizin miktarı ve işlemeye başladığı gün gösterilir. Talep edilen işlemiş faiz adli belgenin parçasıdır.
- **Anlam karara bağlı:** ADR-014 değişikliği (2026-07-18) madde 8. Takip tarihine kadar işlemiş faiz sabit ACCRUED_INTEREST kovasıdır; eski INTEREST kaydı LEGACY_ONLY.
- **Karar gereken:** eski kayıtların envanteri ve göç biçimi (RCV legacy INTEREST envanter kararı); dönem çakışması kuralı.
- **Öneri:** hemen TK-7 (görünür tanı + sessiz kayıpta engel). Karardan sonra C.

### KP-4, KP-5, KP-6 — Masraf ve fer'i simülasyonu çevresi (K-3)

Kategori sırası karara bağlı. TK-6 teknik düzeltmedir. Düzeltme ancak şu üç noktada seçim gerektirir.

- **KP-4:**
  - Sorumlu kişi owner kararıyla belirli: tazminattan yalnız keşideci ve keşideci lehine aval veren sorumlu.
  - Ancak kayıtlarda sorumluluk yazılmamış olabilir (`isAllDebtorsLiable=true` varsayılanı).
  - Kod okuması: ciranta ödemesi keşidecinin tazminatına gidiyor.
  - Önerilen (iii): ödemesiz dosyada brüt tutar kesin ve etiketli gösterilir. Örnek: faiz dahil **12.100**. Ödemeli dosyada engel.
- **KP-5:**
  - Ödemeden sonra kaydedilen, tarihsiz masrafın geriye dönük mahsubu.
  - Kod okuması: kanonik 9.873, kalıcı 9.300 (işleyen faiz hariç).
  - `createdAt` hukuki masraf tarihi sayılmamalı.
- **KP-6:** Q4 / MUST-10 okumasının teyidi (§1).

### KP-7 — "Toplam tahsilat" etiketi

TK-4 ve TK-5 teknik olarak düzeltilir. Pilot ekrandaki etiketin **dosyaya gelen parayı** mı yoksa **borca tahsis edileni** mi göstereceği ürün tercihi. Pilot varsayılan kapalı.

### KP-11 — Hesap tarihi varsayılanı

TK-3 teknik düzeltmedir: yalnız ödeme etkin tarihi ≤ hesap tarihi olanlar hesaba girer, sonraki ödemeler ayrı bilgi satırında gösterilir. Kullanıcıya varsayılan hangi hesap tarihinin gösterileceği (COL/OD-02, açık) ayrı ürün tercihi. Gün kesiminin UTC mi TSİ mi olacağı ayrı bir kararın (ADR-014 I-06) konusu; TK-3 bu kararı içermez.

## 5. KP-10 — Geçmiş dosya etki sayımı: salt okuma sorgular ve ölçüm planı

**Koşum koşulları:**
1. Ayrı owner GO.
2. Kaynak tercihen son yedeğin **izole geri yüklemesi**; veritabanı adı "test" içerir.
3. Tek oturumda çalışılır:
   ```sql
   BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
   SET LOCAL statement_timeout = '120s';
   SET LOCAL lock_timeout = '1s';
   -- ... sorgular ...
   ROLLBACK;
   ```
4. Çıktı yalnız büro kimliği ve sayılardır. Ad, kimlik no, OCR metni ya da tutar listesi alınmaz.
5. Kesim anları (`kesim_2848_utc`, `kesim_2845_utc`): düzeltmeyi içeren sürümün **canlı yayın anı**. Merge anı kullanılmaz.
6. Kayıt tutulur: ölçüm anı (TSİ), yedek zaman damgası, main SHA, canlı sürüm, sorgu metinlerinin sha256'sı. Düzeltme yapılmaz.
7. D2-b1 kesin sayısı izole kopyada mevcut salt okuma harness'ıyla alınır (`scenario-diagnostic-runner` / `adr014-rep-02-local-execution`). SQL-2 yalnız çapraz kontroldür.
8. Canlı bayrak durumu (`OCR_MULTI_INSTRUMENT`, `MANUAL_CASE_INSTRUMENTS`, web bayrağı) yalnız okunur.

Tablo ve kolon adları `schema.prisma`'dan doğrulandı.

**SQL-1 — #2848: sınıflandırma alanları boş kalan dosyalar**
```sql
SELECT c."tenantId",
       date_trunc('month', (c."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul') AS ay_tsi,
       count(*) AS dosya,
       count(*) FILTER (WHERE c."takipTuruId" IS NULL) AS takip_turu_bos,
       count(*) FILTER (WHERE c."mahiyetTipiId" IS NULL) AS mahiyet_tipi_bos,
       count(*) FILTER (WHERE c."asamaId" IS NULL) AS asama_bos,
       count(*) FILTER (WHERE c."takipTuruId" IS NULL AND c."mahiyetTipiId" IS NULL AND c."asamaId" IS NULL
                          AND c."riskId" IS NULL AND c."durumEtiketiId" IS NULL AND c."mahiyetKodu" IS NULL) AS siniflandirma_tamamen_bos,
       count(*) FILTER (WHERE c."type" = 'GENERAL_EXECUTION' AND c."subType" IS NULL) AS genel_icra_alt_tursuz,
       count(*) FILTER (WHERE c."type" = 'GENERAL_EXECUTION' AND (
                 EXISTS (SELECT 1 FROM "CaseInstrument" i WHERE i."tenantId" = c."tenantId" AND i."caseId" = c.id)
              OR EXISTS (SELECT 1 FROM "ClaimItem" x WHERE x."tenantId" = c."tenantId" AND x."caseId" = c.id
                          AND x."sourceDocumentType" IN ('CEK','SENET')))) AS kambiyo_izli_genel_icra
FROM "Case" c
WHERE c."createdAt" < :'kesim_2848_utc'::timestamp
GROUP BY 1, 2 ORDER BY 1, 2;
-- Sınır: seçilip kaybolan ile hiç seçilmeyen ayırt edilemez (taslak tarayıcıdaydı).
```

**SQL-2 — D2-b1 / K-6 aday sınıflaması (yaklaşık; eleştiri düzeltmeleri işlendi)**
```sql
WITH p AS (
  SELECT ci."tenantId", ci."caseId", ci."currency", ci."interestAccrualStatus"::text AS st,
         ci."interestTypeCode"::text AS kod, ci."interestType"::text AS tur, ci."interestRate" AS oran,
         ci."interestStartDateProvenance"::text AS kaynak, c."interestType"::text AS dosya_tur,
         (ci."interestTypeCode" IS NOT NULL OR ci."interestType" IS NOT NULL) AS kendi_tur,
         (ci."interestStartDate" IS NOT NULL) AS kendi_baslangic,
         (ci."noInterestReason" IS NOT NULL AND ci."noInterestConfirmedById" IS NOT NULL) AS faizsiz_denetim_tam,
         (c."interestStartDate" IS NOT NULL) AS dosya_baslangic,
         EXISTS (SELECT 1 FROM "ClaimFormationSnapshot" s WHERE s."tenantId" = ci."tenantId"
                   AND s."claimItemId" = ci.id AND s."admissionResult" = 'ALLOWED_WITH_POLICY_HOLD') AS politika_bekletme
  FROM "ClaimItem" ci JOIN "Case" c ON c.id = ci."caseId" AND c."tenantId" = ci."tenantId"
  WHERE ci."itemType" = 'PRINCIPAL' AND ci."status" IN ('ACTIVE','COLLECTED')),
k AS (
  SELECT p.*, CASE
    WHEN st = 'NO_INTEREST' AND kendi_tur                               THEN 'COZULEMEZ_CELISKILI_FAIZSIZLIK'
    WHEN st = 'NO_INTEREST' AND NOT faizsiz_denetim_tam                 THEN 'FAIZSIZ_DENETIM_EKSIK'
    WHEN st = 'NO_INTEREST'                                             THEN 'FAIZSIZ'
    WHEN politika_bekletme                                              THEN 'POLITIKA_BEKLETMELI'
    WHEN kendi_tur AND kod IS NULL AND upper(tur) NOT IN ('YASAL','TICARI','SABIT')
                                                                        THEN 'COZULEMEZ_DESTEKSIZ_TUR'
    WHEN kendi_tur AND (kod IN ('COMMERCIAL_FIXED','CONTRACTUAL') OR upper(tur) = 'SABIT')
         AND (oran IS NULL OR oran <= 0)                                THEN 'COZULEMEZ_SABIT_ORANSIZ'
    WHEN kendi_tur AND NOT kendi_baslangic AND coalesce(kaynak,'') <> 'ENFORCEMENT_PROCEEDING_DATE'
                                                                        THEN 'COZULEMEZ_BASLANGICSIZ'
    WHEN kendi_tur                                                      THEN 'KENDI_AYARI'
    WHEN upper(dosya_tur) = 'YOKSUN'                                    THEN 'COZULEMEZ_DESTEKSIZ_TUR'
    WHEN kendi_baslangic AND upper(dosya_tur) = 'SABIT' AND (oran IS NULL OR oran <= 0)
                                                                        THEN 'COZULEMEZ_SABIT_ORANSIZ'
    WHEN kendi_baslangic                                                THEN 'KADEME_1_5'
    WHEN dosya_baslangic AND upper(dosya_tur) = 'SABIT'                 THEN 'COZULEMEZ_SABIT_ORANSIZ'  -- kademe 3'te oran her zaman boş
    WHEN dosya_baslangic                                                THEN 'KADEME_3_DOSYA_DUZEYI'
    ELSE 'COZULEMEZ_ADAY' END AS sinif
  FROM p)
SELECT "tenantId", sinif, count(*) AS kalem, count(DISTINCT "caseId") AS dosya FROM k GROUP BY 1, 2 ORDER BY 1, 2;
-- Karma dosya (aynı WITH bloğuyla):
-- SELECT "tenantId", count(*) AS karma, count(*) FILTER (WHERE odemeli) AS odemeli FROM (
--   SELECT k."tenantId", k."caseId", k."currency",
--     EXISTS (SELECT 1 FROM "LedgerEntry" l WHERE l."tenantId" = k."tenantId" AND l."caseId" = k."caseId"
--               AND l."entryType" = 'PAYMENT' AND l."status" = 'CONFIRMED')
--     OR EXISTS (SELECT 1 FROM "Collection" co WHERE co."tenantId" = k."tenantId" AND co."caseId" = k."caseId"
--               AND co."status" = 'CONFIRMED' AND co."cancelledAt" IS NULL) AS odemeli
--   FROM k GROUP BY 1, 2, 3
--   HAVING bool_or(sinif LIKE 'COZULEMEZ%' OR sinif LIKE 'FAIZSIZ%' OR sinif = 'POLITIKA_BEKLETMELI')
--      AND bool_or(sinif IN ('KENDI_AYARI','KADEME_1_5','KADEME_3_DOSYA_DUZEYI'))) t GROUP BY 1;
-- Sınır: kademe 2 (tek faiz kalemi), oran tablosu eksikliği ve tür eşleme ayrıntısı modellenmez; kesin sayı harness ile.
```

**SQL-3 — #2845: sessizce atlanmış evrak ADAYLARI**
```sql
WITH d AS (
  SELECT c.id, c."tenantId", c."isAutoDetected", (c."ocrText" IS NOT NULL) AS ocr_metin, c."principalAmount",
    (SELECT count(*) FROM "CaseInstrument" i WHERE i."tenantId" = c."tenantId" AND i."caseId" = c.id) AS evrak,
    (SELECT count(*) FROM "ClaimItem" x WHERE x."tenantId" = c."tenantId" AND x."caseId" = c.id AND x."itemType" = 'PRINCIPAL') AS anapara_kalem,
    (SELECT COALESCE(sum(COALESCE(x."demandedAmount", x."amount")), 0) FROM "ClaimItem" x
      WHERE x."tenantId" = c."tenantId" AND x."caseId" = c.id AND x."itemType" = 'PRINCIPAL' AND x."status" <> 'CANCELLED') AS anapara_toplam,
    (SELECT count(*) FROM "Due" u WHERE u."caseId" = c.id AND u."type" = 'PRINCIPAL') AS anapara_due,
    (SELECT count(*) FROM "CaseDocument" cd WHERE cd."caseId" = c.id AND (cd."isSourceDocument" OR cd."ocrProcessedAt" IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM "CaseInstrument" i2 WHERE i2."tenantId" = c."tenantId" AND i2."documentId" = cd.id)) AS bagsiz_taranmis_belge
  FROM "Case" c WHERE c."createdAt" < :'kesim_2845_utc'::timestamp)
SELECT "tenantId", count(*) AS dosya,
  count(*) FILTER (WHERE anapara_kalem = 0 AND anapara_due = 0) AS anaparasiz,
  count(*) FILTER (WHERE anapara_kalem = 0 AND ("isAutoDetected" OR ocr_metin)) AS ocr_izli_anaparasiz,
  count(*) FILTER (WHERE "principalAmount" IS NOT NULL AND "principalAmount" > anapara_toplam) AS principal_amount_kalemden_buyuk,
  count(*) FILTER (WHERE bagsiz_taranmis_belge > 0) AS evraga_baglanmamis_taranmis_belgeli,
  count(*) FILTER (WHERE evrak = 0 AND bagsiz_taranmis_belge > 0) AS evraksiz_taranmis_belgeli
FROM d GROUP BY 1 ORDER BY 1;
-- Sınır: atlanan evrakın tutarı saklanmıyor → yalnız aday listesi; web principalAmount OCR evrakını kapsamaz.
```

**SQL-4 — K-7 ve TK-2 için**
```sql
SELECT ci."tenantId", count(DISTINCT ci."caseId") AS dosya, count(*) AS kalem,
       count(*) FILTER (WHERE ci."interestStartDate" IS NULL OR ci."interestEndDate" IS NULL) AS donemsiz_kalem
FROM "ClaimItem" ci
WHERE ci."itemType" IN ('INTEREST','PRE_INTEREST','POST_INTEREST') AND ci."status" IN ('ACTIVE','COLLECTED')
GROUP BY 1 ORDER BY 1;

SELECT "tenantId", "interestType", count(*) AS satir, min("validFrom") AS ilk,
       max(COALESCE("validTo", 'infinity'::timestamp)) AS son,
       count(*) FILTER (WHERE onceki_bitis IS NOT NULL AND "validFrom" > onceki_bitis + interval '1 day') AS bosluk
FROM (SELECT r.*, lag(r."validTo") OVER (PARTITION BY r."tenantId", r."interestType" ORDER BY r."validFrom") AS onceki_bitis
      FROM rate_schedule r) t
GROUP BY 1, 2 ORDER BY 1, 2;
```

## 6. AYRI KARARLAR (kendiliğinden tasarlanıp uygulanmadı)

### 6.1 KP-8 — FATURA / DİĞER çoklu OCR evrakı (SEP-A)

- **Karara bağlı olan:** faturanın alacak modeli (decision-log D5 ve fatura motoru tasarımı). Genel belge PRINCIPAL üretemez (RCV-CLAIM-FORM-P01).
- **Bugün:**
  - Çoklu taramada seçilen tüm satırlar `instruments[]`'a gidiyor.
  - #2845 kabul kapısı FATURA / DİĞER için açılışı 400 ile reddediyor (dosya yok, kayıp yok, iş duruyor). Mesaj "alacak kalemi olarak girin" diyor.
  - Tek belge taraması faturayı PRINCIPAL Due'ya çeviriyor. Elle kalem de aynısını yapıyor.
- **Mevcut yol neden yetmiyor:**
  - Okunmuş fatura verisi elle yeniden yazılıyor: çift giriş, yazım hatası, aynı faturanın iki kez girilmesi.
  - DİĞER için güvenli eşleme yok.
- **Önerilen akış (A):**
  1. Tarama inceleme tablosunda her satırın türü görünür.
  2. FATURA satırında varsayılan eylem "alacak kalemi olarak ekle". Sonuç: Alacak Kalemleri adımında "taramadan: fatura" rozetli, düzenlenebilir PRINCIPAL taslak. Tutar, vade, faiz durumu UNKNOWN, belge no ve KDV taşınır.
  3. DİĞER satırında zorunlu seçim: kalem türü (OTHER hariç) / yalnız belge olarak ekle / çıkar.
  4. Aynı belge no + tutarla elle eklenmiş kalem varsa uyarı verilir (#2856'daki kambiyo koruması gibi).
  5. `instruments[]` yalnız kambiyo evrakı taşır; sunucu kapısı aynen kalır.
- **Owner'dan istenen:** A akışının onayı ve DİĞER eşleme / ret kuralı.

### 6.2 KP-9 — Kanıtsız varsayılan yetkinin onayı (SEP-B)

- **Bugün (#2851, K3 kararı A):**
  - Avukatın varsayılan yetkisi açılışta yalnız aynı büro ve aynı avukat için en son yönetim kaydının izi güncel değerle eşleşirse uygulanıyor.
  - Kayıt yoksa `SOURCE_NOT_MANAGEMENT_VERIFIED`, iz eşleşmezse `SOURCE_VALUE_MISMATCH`.
  - Kayıt yalnız değer gerçekten değişince yazılıyor (B11).
- **Mevcut yol neden yetmiyor:**
  1. Yeni avukatın varsayılanı, yönetim bir değişiklik yapıp kaydedene kadar uygulanmıyor.
  2. Aynı değeri yeniden kaydetmek kayıt üretmediği için değer onaylanamıyor.
  3. Tek geçici yol "değiştir-kaydet, geri al-kaydet". Bu iki yanıltıcı değişiklik kaydı üretiyor ve arada açılan dosyalar ara değeri alıyor.
  4. Yönetim, hangi avukatın varsayılanının uygulanmadığını göremiyor.
- **Önerilen akış (A):**
  - **Kim:** ADMIN ya da aynı büroda aktif, bağlı PARTNER. Güncelleme ile aynı yetki; tx içinde kilitli satırdan yeniden doğrulama. Kendi kaydını onaylayabilme owner kararı; öneri: kendi kaydı için ADMIN ya da başka bir PARTNER.
  - **Ekran:** Avukatlar > avukat kartı > "Varsayılan dosya yetkileri". Durum rozeti: uygulanıyor (onaylayan + tarih, TSİ) ya da uygulanmıyor (neden). Değer listesi ve "Bu değerleri onayla" düğmesi. Onay penceresi değeri yeniden gösterir.
  - **Sunucu:**
    - İstemci gösterdiği değerin izini gönderir.
    - İşlem içinde satır kilitlenir ve iz karşılaştırılır; farklıysa 409 döner.
    - Ayrı eylem kaydı `LAWYER_DEFAULT_PERMISSIONS_CONFIRMED` yazılır; yalnız iz, değer kopyalanmaz.
    - Açılışta dayanak sorgusu iki eylemin en sonuncusunu okur.
  - **Riskler:**
    - göz atmadan onay (toplu onay önerilmez);
    - yarış (iz + kilit ile kapanır);
    - onayın değişiklik sanılması (ayrı eylem adı).

    Geçmiş dosyalara geriye dönük yetki verilmez.

## 7. Ölçüm ve kanıt sınırları

- Tüm sayılar sentetiktir. Canlı frekans bilinmiyor; KP-10 bunun içindir.
- **Motorla doğrulanan senaryolar** (`evidence/dp-scenarios.result.json`): K-1, K-2 (bugün ve iki alternatif), K-3a, K-4, K-5a, K-6, K-7 (a/b), K-8, K-9 (boşluk, gelecek oran, oransız), K-9b.
- **Elle hesap ya da kod okuması:** K-8 `sortOrder` alternatifi, K-7 dahil edilseydi değeri, kalıcı yol sonuçları, TK-8, TK-10 … TK-13.
- **K-9 sayıları** takip tarihi ve ödeme tarihleri boşluk aralığının dışındayken geçerli. Segment sınırı boşluğa düşerse değer değişir (örnek eleştiride: 135 / 670). Kusurun kendisi değişmez.
- **Hukuki metin** bu paketi yazan ajan tarafından resmî PDF'ten okundu. Avukat teyidi yerine geçmez.
- **Dış belge / UYAP kabulü:** bu paket bir dış belge ya da UYAP kabulü iddia etmez.
