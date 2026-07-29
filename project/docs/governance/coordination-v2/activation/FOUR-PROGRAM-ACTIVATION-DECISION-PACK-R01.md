# Dort Program Aktivasyon Karar Paketi (R01)

Faz 5 triyaji, dort programin (CLIENT, DEBTOR, RECEIVABLE, UYAP_CONNECTOR)
authority icinde kalan otomatik yurutulebilir teknik islerinin tukendigini
gosterdi. Bu belge, geriye kalan her kalemi tek tek, karar mercii owner'da
olacak sekilde acar. Hicbiri burada uygulanmadi; hicbiri mekanik olarak
turemedigi icin ayni turda islenmedi.

Her kalem: ITEM, CURRENT CANONICAL TRUTH, EXACT BLOCKER, OPTION A, OPTION B,
RECOMMENDATION, CODE/MIGRATION/RUNTIME EFFECT, ROLLBACK, DEFAULT IF NO DECISION.

---

## CLIENT

### CLIENT-A — STANDING-GRANT-CLIENT-LIVE-R01 path-root genisligi

**CURRENT CANONICAL TRUTH:** `STANDING-GRANT-CLIENT-LIVE-R01.json` `allowedPathRoots`
yalniz `client/`, `client-statement/`, `client-notification/` listeler. FD-ACT-R01
serisi (#1808/#1814/#1819/#1827, MERGED) `client-financial-disclosure/` ve
`client-settlement/` alti dosyalari degistirdi; bu iki kok grant'ta hic yok.

**EXACT BLOCKER:** Grant genisletmek `noSelfAuthorizationChange` ihlalidir; hicbir
ajan bunu kendi karariyla yapamaz.

**OPTION A:** Grant'a iki koku ekle (`client-financial-disclosure/`,
`client-settlement/`), gecmiste merge olmus PR'lari retroaktif olarak grant
kapsaminda say.

**OPTION B:** Grant'i genisletme; FD-ACT-R01'in gecmis mutasyonlarini ayri bir
owner-onayli istisna kaydiyla (governance override, standing grant disi) belgele.

**RECOMMENDATION:** A — iki kok zaten fiilen kullaniliyor; grant'i gerceklige
uydurmak, gerceklik disi birakmaktan daha az risk tasir.

**CODE/MIGRATION/RUNTIME EFFECT:** Yalniz JSON grant dosyasi; kod veya sema
degisikligi yok.

**ROLLBACK:** Grant dosyasini onceki commit'e geri al.

**DEFAULT IF NO DECISION:** Grant mevcut haliyle kalir; iki kok kapsam disi
sayilmaya devam eder ve gelecekteki her PR ayni celiskiyi tekrar uretir.

---

### CLIENT-B — client-financial-disclosure runtime activation

**CURRENT CANONICAL TRUTH:** `CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED` varsayilan
KAPALI (`client-financial-disclosure-activation.ts:36-38`). Kapaliyken servis
`LEVEL_0`'da kalir, hicbir disclosure uretilmez/onaylanmaz.

**EXACT BLOCKER:** I07 program kapanisi (#1788) runtime aktivasyonunu acikca
kapsam disi birakti; sonraki aktivasyon icin ayri bir owner karari gerekiyor.

**OPTION A:** Bayragi `true` yap; disclosure uretim/onay akisi canliya acilir.

**OPTION B:** Bayragi KAPALI birak; I06/I07'nin kanitladigi "restart, concurrency,
uctan uca kabul" hazirligi belgeli kalir ama hicbir gercek veri uretilmez.

**RECOMMENDATION:** B, PR #1845 ("PROGRAM CLOSEOUT, activation ready") merge
olup gozden gecirilene kadar. #1845 zaten bu soruyu owner'a getiriyor;
burada tekrar karar dayatmiyorum.

**CODE/MIGRATION/RUNTIME EFFECT:** Kod degisikligi yok, yalniz ortam degiskeni.
Aktive edilirse: gercek disclosure kayitlari uretilir, `EMAIL_PROVIDER` runtime
degeri (repo'dan dogrulanamaz durumda, charter §46.4) devreye girer.

**ROLLBACK:** Bayragi `false`'a cevir; yeni yazim durur, mevcut kayitlar kalir.

**DEFAULT IF NO DECISION:** KAPALI kalir (varsayilan zaten budur).

---

### CLIENT-C — client-settlement runtime activation

**CURRENT CANONICAL TRUTH:** Aynı FD-ACT-R01 zinciri `client-settlement/` altina
da yazdi (Track B mutabakat/uzlasma yuzeyi); ayri bir aktivasyon bayragi
CLIENT-B'den bagimsiz olarak var olabilir — bu belgeyi hazirlarken repo'da
settlement'a ozel ikinci bir env flag dogrulanamadi.

**EXACT BLOCKER:** Ayni grant-kapsami sorusu (CLIENT-A) + ayri aktivasyon karari.

**OPTION A:** CLIENT-B ile birlikte tek kararda ac.

**OPTION B:** Settlement'i CLIENT-B'den bagimsiz, kendi owner kararina birak
(disclosure yazimi acik olsa da settlement kapali kalabilir).

**RECOMMENDATION:** B — iki yuzeyin risk profili farkli (biri iceriye disclosure
uretir, digeri mutabakat/odeme baglantili); ayri karar daha guvenli.

**CODE/MIGRATION/RUNTIME EFFECT:** UNKNOWN — settlement'in kendi flag'i bu
triyajda dogrulanmadi; aktivasyon oncesi ayri bir teknik dogrulama gerekir.

**ROLLBACK:** Flag bulunup kapatilir.

**DEFAULT IF NO DECISION:** KAPALI kalir.

---

### CLIENT-D — iki bayragin default-OFF durumunun korunmasi/kaldirilmasi

**CURRENT CANONICAL TRUTH:** `WRITE_ENABLED` ve `PUBLICATION_ENABLED` birbirinden
BAGIMSIZ okunur (kod yorumu: "yayinlamanin yazmadan ayri bir risk siniri olmasi
bilinclidir"). Yani dort kombinasyon mumkun: ikisi kapali (LEVEL_0), yalniz
yazma acik (LEVEL_1), ikisi acik (LEVEL_2).

**EXACT BLOCKER:** Hangi kombinasyonun "aktivasyon" sayilacagi owner karari.

**OPTION A:** Kademeli ac — once yalniz WRITE (LEVEL_1, ic uretim/onay, disari
gonderim yok), gozlemle, sonra PUBLICATION.

**OPTION B:** Ikisini ayni anda ac (LEVEL_2).

**RECOMMENDATION:** A — kod zaten bu kademeyi ayri bayraklarla destekliyor;
kullanmamak tasarimin sagladigi guvenligi bosa harcar.

**CODE/MIGRATION/RUNTIME EFFECT:** Yok; yalniz ortam degiskeni sirasi.

**ROLLBACK:** Her asamada ilgili bayragi tek basina kapat.

**DEFAULT IF NO DECISION:** Ikisi de KAPALI.

---

### CLIENT-E — aktivasyon sonrasi smoke/rollback/observability

**CURRENT CANONICAL TRUTH:** Telemetri: charter'da tanimli 12 event isminden
yalniz 2'si emit ediliyor (triyaj bulgusu). `EMAIL_PROVIDER` runtime degeri
repo'dan dogrulanamaz (§46.4, "NOT VERIFIABLE FROM REPOSITORY").

**EXACT BLOCKER:** Aktivasyon oncesi eksik telemetri + saglayici dogrulamasi;
owner karari + ayri bir teknik dogrulama gorevi gerektirir.

**OPTION A:** Aktivasyondan ONCE kalan 10 event'i tamamla + `EMAIL_PROVIDER`i
staging'de dogrula, sonra flag ac.

**OPTION B:** Flag'i ac, telemetriyi paralel tamamla (gozlemlenebilirlik
riskini kabul ederek).

**RECOMMENDATION:** A — mutabakat/disclosure gibi hukuki sonucu olan bir
yuzeyde, gozlem eksikligiyle canliya cikmak riskli.

**CODE/MIGRATION/RUNTIME EFFECT:** Telemetri tamamlanmasi bounded bir kod
isidir (authority icinde, CLIENT grant'i genisletme sorusundan bagimsiz olarak
enqueue edilebilir).

**ROLLBACK:** N/A (henuz aktivasyon yok).

**DEFAULT IF NO DECISION:** Aktivasyon gerceklesmez, telemetri boslugu acik
kalir ama zarar vermez (LEVEL_0).

---

## DEBTOR

### DEBTOR-A — prepareNotification hangi domain event'te tetiklenecek

**CURRENT CANONICAL TRUTH:** `case-debtor.service.ts:162` `prepareNotification=true`
kabul eder ama hicbir bildirim kaydi uretmez — olu bayrak.

**EXACT BLOCKER:** Tetikleyici olay (case durumu degisimi mi, elle istek mi,
zamanlayici mi) tanimlanmamis; bu bir is kurali karari.

**OPTION A:** Yalniz elle/API cagrisinda tetikle (senkron, case-debtor servisinin
kendi sinirinda).

**OPTION B:** Domain event yayinla (`DebtorNotificationRequested`), ayri bir
tuketici (Context-5 / ServiceOfProcessService) isle.

**RECOMMENDATION:** B — tebligat/ServiceAttempt zaten Context-5'e ait; A secimi
bounded-context ihlali (DEBTOR'un Context-5'in isini yapmasi) uretir.

**CODE/MIGRATION/RUNTIME EFFECT:** B secilirse: yeni bir domain event + Context-5
tarafinda tuketici gerekir (iki ayri bounded task).

**ROLLBACK:** Event yayinini durdur, bayragi yine no-op birak.

**DEFAULT IF NO DECISION:** Bayrak olu kalir, tebligat tetiklenmez.

---

### DEBTOR-B — notification ownership hangi bounded context'te

**CURRENT CANONICAL TRUTH:** DEBTOR standing grant'i yalniz `debtor/` +
`debtor-scoring/` kapsar; tebligat/ServiceAttempt modeli ayri (Context-5,
`ServiceOfProcessService`).

**EXACT BLOCKER:** Ownership DEBTOR'da kalirsa grant + kod DEBTOR icinde
genisler; Context-5'te kalirsa DEBTOR yalniz TALEP eder.

**OPTION A:** DEBTOR sahiplensin (grant genisletme + yeni servis).

**OPTION B:** Context-5 sahiplensin, DEBTOR yalniz event/kuyruk kaydi uretir.

**RECOMMENDATION:** B — DEBTOR-A ile tutarli, cift sahiplik onler.

**CODE/MIGRATION/RUNTIME EFFECT:** B: DEBTOR tarafinda tek yayin cagrisi;
Context-5 tarafinda tuketici + olasi yeni tablo/servis.

**ROLLBACK:** Yayin cagrisini kaldir.

**DEFAULT IF NO DECISION:** Sahiplik belirsiz kalir, bayrak olu.

---

### DEBTOR-C — kanal: email / SMS / internal notification

**CURRENT CANONICAL TRUTH:** `communication.service.ts:46,91` SMS (NetGSM/Ileti
Merkezi) ve e-posta (SMTP/SendGrid) gonderimi TODO stub; hicbir saglayici
bagli degil.

**EXACT BLOCKER:** Kanal secimi hem is karari (musteriye nasil ulasilir) hem
saglayici entegrasyonu (owner E ile ayni).

**OPTION A:** Once yalniz internal (sistem ici kayit/gorev), dis kanal yok.

**OPTION B:** Dogrudan e-posta + SMS ile birlikte ac.

**RECOMMENDATION:** A — dis kanal olmadan da tebligat SURECI ilerletilebilir
(Context-5 kaydi olusur); dis gonderim ayri, daha yuksek riskli bir asama.

**CODE/MIGRATION/RUNTIME EFFECT:** A: yeni dis entegrasyon yok. B: NetGSM/SMTP
saglayici anahtarlari + secret yonetimi gerekir (secret genisletme, ayri
onay ister).

**ROLLBACK:** Kanal konfigurasyonunu devre disi birak.

**DEFAULT IF NO DECISION:** Hicbir kanal aktif olmaz.

---

### DEBTOR-D — provider secimi

**CURRENT CANONICAL TRUTH:** Kod yorumlari NetGSM/Ileti Merkezi (SMS) ve
SMTP/SendGrid (e-posta) isimlerini aday olarak geciriyor; hicbiri secilmemis.

**EXACT BLOCKER:** Ticari/sozlesme karari, teknik degil.

**OPTION A / OPTION B:** Saglayici A vs saglayici B — bu belge saglayici
onermez, yalniz secimin owner'a ait oldugunu isaretler.

**RECOMMENDATION:** Karar owner'a ait; teknik olarak her iki saglayici da
mevcut adaptor arayuzune (varsa) uyarlanabilir.

**CODE/MIGRATION/RUNTIME EFFECT:** Secilen saglayicinin SDK/API entegrasyonu.

**ROLLBACK:** Adaptoru degistir.

**DEFAULT IF NO DECISION:** Hicbir saglayici entegre edilmez.

---

### DEBTOR-E — retry / idempotency / failure policy

**CURRENT CANONICAL TRUTH:** Mevcut kodda tanimli degil (ozellik henuz yok).

**EXACT BLOCKER:** Basarisiz gonderimde kac deneme, ne zaman "kalici basarisiz"
sayilir, ayni bildirim iki kez gitmeyi nasil onler — is kurali.

**OPTION A:** Diger sistemlerde (icrabot job-leasing gibi) kullanilan mevcut
retry/lease desenini tekrar kullan.

**OPTION B:** Yeni, tebligata ozel bir politika tasarla.

**RECOMMENDATION:** A — repo'da zaten kanitlanmis bir desen var (icrabot
R02-F09 serisi); yeniden icat etmemek tutarliligi korur.

**CODE/MIGRATION/RUNTIME EFFECT:** Secilen desene gore kuyruk/lease tablosu
gerekebilir.

**ROLLBACK:** Kuyruk/lease mekanizmasini devre disi birak, senkron/best-effort
gonderime don.

**DEFAULT IF NO DECISION:** Politika yok, ozellik hayata gecmez.

---

### DEBTOR-F — hukuki ve operasyonel audit kaydi

**CURRENT CANONICAL TRUTH:** DEBTOR'un genel audit disiplinleri (IDOR-02/03/04
CLOSED) var ama tebligat'a ozel bir audit semasi yok.

**EXACT BLOCKER:** Tebligatin ne zaman/kime/nasil gonderildiginin hukuki
kanit niteligi tasiyip tasimayacagi — bu bir hukuk karari, icat edilmez.

**OPTION A:** Mevcut genel audit tablosunu (varsa) kullan.

**OPTION B:** Tebligata ozel, hukuki kanit standardinda ayri bir audit kaydi
tasarla (Context-5 ile birlikte).

**RECOMMENDATION:** B — tebligat hukuki sonuc dogurabilir; genel audit yetersiz
kalabilir. Ama icerigi owner/hukuk ekibi belirlemeli.

**CODE/MIGRATION/RUNTIME EFFECT:** Yeni tablo/sema (migration gerektirir).

**ROLLBACK:** Migration'i geri al (veri kaybi riski — dikkatli planlanmali).

**DEFAULT IF NO DECISION:** Audit kaydi yok; ozellik aktive edilemez.

---

## RECEIVABLE

### RECEIVABLE-A — LegalSubtypeRegistry runtime resolver activation

**CURRENT CANONICAL TRUTH:** Registry (`receivable-legal-subtype-registry-v1.json`,
7 entry, ratifiye, checksum'li) ve `LegalBasisExactVersionResolverPort`
(soyut) zaten yazili. Somut adaptor YOK; `claim-item.module.ts` ne
`formation-intent`'i ne `LegalSubtypeRegistry`'yi icerir.

**EXACT BLOCKER:** `claim-item-formation-intent-dormancy.static.spec.ts`
acikca sart kosuyor: module bu iki stringi ICEREMEZ. Somut adaptor yazip
module'e baglamak bu testi kirar — yani mevcut bir OWNER KARARINI (dormancy)
bozar.

**OPTION A:** Dormancy testini KALDIR/gevset, resolver'i baglayip I02B/I03/I04'u
aktifle.

**OPTION B:** Dormancy'i koru; resolver'i standalone (baglanmamis, yalniz
kendi birim testleriyle dogrulanan) bir dosya olarak birak, aktivasyonu
tamamen ayri bir owner GO'ya beklet.

**RECOMMENDATION:** B — RCV-PHASE-1-AUTHORIZATION.md zaten "Claim Formation
runtime: DORMANT" diyor; bu kasitli bir owner kararidir, teknik bir bosluk
degil.

**CODE/MIGRATION/RUNTIME EFFECT:** A: `claim-item.module.ts` degisir, I02B/I03/
I04 canliya acilir, gercek ClaimItem/snapshot yazimi baslar. B: hicbir
runtime etkisi yok.

**ROLLBACK:** A secilip sorun cikarsa provider'i module'den cikar (dormancy'ye
don).

**DEFAULT IF NO DECISION:** Dormant kalir (RECEIVABLE-B ile ayni cevap).

---

### RECEIVABLE-B — dormancy testinin kaldirilmasi/korunmasi

**CURRENT CANONICAL TRUTH:** Test dosyasinin adi ve icerigi ("dormancy and
boundary guard") kasitli bir tasarim kararini test olarak kodlamis.

**EXACT BLOCKER:** Bu testi kaldirmak/gevsetmek RECEIVABLE-A'nin OPTION A'sini
acar; ayri bir owner karari olmadan hicbir ajan bunu yapamaz (kendi
yazdigi bir guard'i kendi kaldirmasi anlamina gelir).

**OPTION A:** Testi kaldir/guncelle (RECEIVABLE-A/OPTION A ile birlikte).

**OPTION B:** Testi oldugu gibi birak.

**RECOMMENDATION:** B, RECEIVABLE-A/OPTION B ile tutarli.

**CODE/MIGRATION/RUNTIME EFFECT:** A: test dosyasi degisir, guard kalkar.

**ROLLBACK:** Test dosyasini eski haline getir.

**DEFAULT IF NO DECISION:** Test kalir, dormancy surer.

---

### RECEIVABLE-C — reviewer / final ratifier / production signer ayrimi

**CURRENT CANONICAL TRUTH:** Runtime kodda TEK bir `OfficeApprovalRequest` +
`requesterUserId` var; uc rolu (inceleyen / nihai onaylayan / imzalayan)
ayiran bir mekanizma yok. D02-F01-R02 governance metni kendi ifadesiyle
"CONTENT RATIFICATION + REVIEWER + KEYS MISSING" diyor.

**EXACT BLOCKER:** Bu ayrim "signed release" icerigine (D02-F01-R02) bagli;
icerik henuz ratifiye degil. Private key gerektiren imzalama adimi kesin
olarak PROHIBITED (bu belge private key istemez/saklamaz).

**OPTION A:** Uc rolu ayiran yeni bir onay-zinciri modeli tasarla (owner +
hukuk ekibi icerigi belirler), imzalama HARICI bir HSM/key-yonetim
servisine devredilir (bu repo hic key gormez).

**OPTION B:** Mevcut tek-rolu (`OfficeApprovalRequest`) koru, signed-release
ozelligini tamamen ertele.

**RECOMMENDATION:** B — D02-F01-R02 icerigi ratifiye olmadan bir ayrim modeli
insa etmek, icerigi zimni olarak varsaymak olur.

**CODE/MIGRATION/RUNTIME EFFECT:** A secilirse: yeni rol modeli + harici imza
servisi entegrasyonu (buyuk bir tasarim isi, tek bir PR degil).

**ROLLBACK:** N/A (henuz yok).

**DEFAULT IF NO DECISION:** Tek-rol modeli surer, signed release yok.

---

### RECEIVABLE-D — legal-basis version effectiveAt modeli

**CURRENT CANONICAL TRUTH:** Registry entry'lerinde `effectiveFrom`/
`effectiveUntil` alanlari var (orn. `"effectiveFrom": "2026-07-26T00:00:00Z"`,
`"effectiveUntil": null`); port'un `ResolveExactLegalBasisInput.effectiveAt`
alani da var. Ikisi arasindaki KARSILASTIRMA MANTIGI (resolver'in nasil
"effectiveAt bu araliktadir" diyecegi) somut adaptor yazilmadigi icin
henuz kod olarak yok.

**EXACT BLOCKER:** Bu, RECEIVABLE-A ile ayni guard'a bagli — somut adaptor
yazilamadigi surece bu soru da pratikte cevapsiz kalir.

**OPTION A / OPTION B:** RECEIVABLE-A'nin secenekleriyle birlikte cozulur;
ayri bir karar degil.

**RECOMMENDATION:** RECEIVABLE-A'nin cevabini bekle.

**CODE/MIGRATION/RUNTIME EFFECT:** RECEIVABLE-A ile ayni.

**ROLLBACK:** RECEIVABLE-A ile ayni.

**DEFAULT IF NO DECISION:** Cozulmez (dormant).

---

### RECEIVABLE-E — private-key gerektirmeyen aktivasyon siniri

**CURRENT CANONICAL TRUTH:** Bu belge ve onceki tum triyaj turlari private key
istemedi/saklamadi (sabit kural). Resolver'in kendisi zaten "signature/
certificate/key verification KENDISI yapmaz — onceden adapter-dogrulanmis
bir registry release'i okur" diyor (port JSDoc'u, satir 230-236).

**EXACT BLOCKER:** Yok — bu zaten port'un tasarim sinirinin bir parcasi,
karar gerektirmiyor, yalniz teyit.

**OPTION A / OPTION B:** N/A.

**RECOMMENDATION:** Bu siniri DEGISTIRME; resolver'in "adapter zaten
dogrulamis" varsayimi korunmali. Herhangi bir gelecekteki implementasyon
bu JSDoc kisitina uymali.

**CODE/MIGRATION/RUNTIME EFFECT:** Yok.

**ROLLBACK:** N/A.

**DEFAULT IF NO DECISION:** Sinir zaten yururlukte kalir.

---

### RECEIVABLE-F — migration ve rollback gereksinimi

**CURRENT CANONICAL TRUTH:** `claim_formation_projection_binding` (PR #1630)
zaten APPLIED (register §22, checksum dogrulandi, backup+restore PASS).
RECEIVABLE-A/OPTION A aktive edilirse, resolver'in ClaimItem/snapshot
yazmasi icin EK bir migration GEREKMEZ — sema zaten PB01 ile hazir; yalniz
kod (resolver + module wiring) eksik.

**EXACT BLOCKER:** Yok, bu bir teyit maddesi.

**OPTION A / OPTION B:** N/A.

**RECOMMENDATION:** Aktivasyon karari (RECEIVABLE-A) verilirse, ayrica bir
migration beklemeye gerek yok; yalniz GO-MIGRATE production kapisi (halen
kapali) ayri bir onay gerektirir.

**CODE/MIGRATION/RUNTIME EFFECT:** Yok (zaten uygulandi).

**ROLLBACK:** Migration'in kendi rollback'i register'da tanimli.

**DEFAULT IF NO DECISION:** Degismez.

---

## UYAP_CONNECTOR

### UYAP-A — implementation hard hold'un korunmasi/kaldirilmasi

**CURRENT CANONICAL TRUTH:** Charter: "IMPLEMENTATION AUTHORITY: NONE, CUTOVER:
HARD HOLD". F4-b orchestrator IMPLEMENTED/CI-PROVEN/DEFAULT-OFF/NOT
RUNTIME-PROVEN; `UYAP_DORMANT_DISPATCH_ENABLED = false as const` (module'e
KAYITLI DEGIL, network=0).

**EXACT BLOCKER:** Hard hold, owner'in kendi kararidir; teknik bir engel
degil. Kaldirilmasi ayri, acik bir owner GO gerektirir.

**OPTION A:** Hold'u kaldir, F4-b'yi module'e kaydet (hala default-OFF flag
ile, ama artik "runtime-proven" asamasina gecebilir).

**OPTION B:** Hold'u koru.

**RECOMMENDATION:** B — UYAP-B (semantic mapping ratifikasyonu) ve UYAP-F
(D1 dis blocker) cozulmeden hold'u kaldirmak, aktive edilemeyen bir kodu
"runtime-proven" asamasina tasimanin otesinde bir fayda saglamaz.

**CODE/MIGRATION/RUNTIME EFFECT:** A: `uyap.module.ts`'e provider ekleme +
CI'da gercek (ama hala sifir-network) calisma kaniti.

**ROLLBACK:** Provider'i module'den cikar.

**DEFAULT IF NO DECISION:** Hold surer.

---

### UYAP-B — T-01 / M-01 / M-02 semantic mapping ratifikasyonu

**CURRENT CANONICAL TRUTH:** `UYAP-OFFICIAL-LEGAL-SEMANTIC-MAPPING-AUTHORITY-R01`
(#1838, MERGED) bir MATRIS sundu — ratifikasyon DEGIL. Canary corpus'ta
CS-01/09/10/11 (OWNER_RATIFICATION_REQUIRED) hepsi bu ratifikasyona bagimli.

**EXACT BLOCKER:** rolTur/mahiyetKodu/takipTuru legacy<->resmi eslemesi hukuki
bir karar (P03A/P03B); implementasyon degil.

**OPTION A:** Matrisi oldugu gibi ratifiye et (owner onayi = matris = dogru).

**OPTION B:** Matrisi hukuk ekibiyle tekrar gozden gecir, degisiklikle
ratifiye et.

**RECOMMENDATION:** Owner'a ait; bu belge bir hukuki icerik onermez.

**CODE/MIGRATION/RUNTIME EFFECT:** Ratifikasyon sonrasi CS-01/09/10/11
canary senaryolari REYD durumuna gecebilir (hala synthetic, hala
default-OFF).

**ROLLBACK:** Ratifikasyon kaydini supersede eden yeni bir karar.

**DEFAULT IF NO DECISION:** CS-01/09/10/11 OWNER_RATIFICATION_REQUIRED
kalir.

---

### UYAP-C — default-OFF synthetic runtime aktivasyonu

**CURRENT CANONICAL TRUTH:** Canary R02 senaryo korpusu (#1844) 7 senaryoyu
READY, 5'ini OWNER_RATIFICATION_REQUIRED, 2'sini MODEL_RESIDUAL, birini
EXTERNAL_TECHNICAL_AUTHORITY_REQUIRED, birini D1_BLOCKED olarak siniflandirdi.
Belgenin kendi ifadesi: "bu belge Canary yurutmesini yetkilendirmez."

**EXACT BLOCKER:** "Synthetic/local calistirma izni" ile "gercek UYAP
production baglantisi" AYRI kararlardir (owner'in kendi talimati, bu
belgenin basligi da bunu tekrarliyor — UYAP-D'ye bakiniz).

**OPTION A:** Synthetic/local canary'yi (sifir gercek kimlik bilgisi, sifir
gercek dosyalama, tamamen mock/local ortam) calistirmaya izin ver.

**OPTION B:** Synthetic canary'yi de erteleyip yalniz statik/birim testlerle
devam et.

**RECOMMENDATION:** A — synthetic canary'nin kendi tanimi geregi hicbir dis
sistem/gercek veri riski tasimiyor; READY 7 senaryonun (CS-02-08, UYAP-A'nin
degerlendirmesiyle bir kismi zaten policy-engine'e ait oldugu icin
kapsam disi) buyuk kismi zaten mevcut testlerle kanitli.

**CODE/MIGRATION/RUNTIME EFFECT:** Yalniz test/CI calistirma; production
kod veya runtime etkisi yok.

**ROLLBACK:** N/A (calistirma, mutasyon degil).

**DEFAULT IF NO DECISION:** Canary calistirilmaz.

---

### UYAP-D — external production cutover

**CURRENT CANONICAL TRUTH:** Owner'in standing siniri (bu programin ta
kendisinde defalarca tekrarlanan): NO real credentials, NO real filing,
NO real submission, NO real customer data transmission, NO external
production activation.

**EXACT BLOCKER:** Bu bir teknik soru degildir; UYAP-A/B/C'nin TUMU
cozulse bile bu madde AYRI ve BAGIMSIZ bir owner karari gerektirir.

**OPTION A / OPTION B:** N/A — bu belge bu karari cercevelemez, yalniz
sinirin hala gecerli oldugunu teyit eder.

**RECOMMENDATION:** Bu siniri hicbir asamada gevsetme; UYAP-A/B/C'nin
hicbiri bu maddeyi otomatik olarak acmaz veya acmamalidir.

**CODE/MIGRATION/RUNTIME EFFECT:** N/A.

**ROLLBACK:** N/A.

**DEFAULT IF NO DECISION:** Sinir yururlukte kalir (varsayilan zaten budur).

---

### UYAP-E — real credentials / filing / submission / customer data sinirlari

**CURRENT CANONICAL TRUTH:** UYAP-D ile ayni sinir, ayri madde olarak
sayildigi icin burada da tekrarlaniyor: hicbir kod degisikligi bu sinirlari
gevsetmemeli.

**EXACT BLOCKER:** Yok — bu bir teyit maddesi, karar gerektirmez.

**OPTION A / OPTION B:** N/A.

**RECOMMENDATION:** Degismez.

**CODE/MIGRATION/RUNTIME EFFECT:** Yok.

**ROLLBACK:** N/A.

**DEFAULT IF NO DECISION:** Sinir yururlukte kalir.

---

### UYAP-F — DTD D1 dis blocker etkisi

**CURRENT CANONICAL TRUTH:** DTD/codelist olcumu CLOSED; gercek blocker D1
nondeterministic content model (resmi `exchange.dtd`'de 6 element bildirimi
belirsiz, kok `exchangeData` dahil). Artefakt mevcut ve dogrulanmis
(SHA-256 doğrulandı, teslim 2026-07-18). DTD onarimi YASAK (D2). Kapanis
yolu D7 — dis taraf (UYAP/BIGM) cevabini bekliyor.

**EXACT BLOCKER:** Ne kod ne owner karari bunu cozebilir; dis kuruma bagli.

**OPTION A:** D7 talebini gonder (dis tarafa), cevap bekle.

**OPTION B:** D1'i bypass eden alternatif bir dogrulama yolu tasarla (DTD'yi
degistirmeden, yalniz kabul kriterini gevseterek) — riskli, D2 yasagina
yakin.

**RECOMMENDATION:** A — D2 yasagi zaten B'yi buyuk olcude kapatiyor; tek
gercekci yol dis tarafin resmi DTD'yi netlestirmesi.

**CODE/MIGRATION/RUNTIME EFFECT:** A: kod etkisi yok, yalniz durum takibi.
B secilirse (onerilmez): strict validation kapisinda kod degisikligi.

**ROLLBACK:** N/A.

**DEFAULT IF NO DECISION:** D1_BLOCKED kalir, strict DTD PASS iddiasi hicbir
zaman `true` olmaz (CS-15 sabit kaydi).

---

## Kapanis

```
ORCHESTRA:
OPERATIONAL ON-DEMAND WORKER

PHASE 5:
PASS WITH OWNER-GATED ACTIVATION RESIDUALS

NEW PROGRAM CODE MERGED:
0

REASON:
No authority-valid, non-conflicting, non-owner-gated executable item remained.
```

Bu turda mekanik, tartismasiz bir reconciliation bulunamadi; decision pack
disinda hicbir mutasyon yapilmadi.
