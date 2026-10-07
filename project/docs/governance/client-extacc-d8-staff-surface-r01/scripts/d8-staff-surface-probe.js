'use strict';
/*
 * EXTACC D-8 R09 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI: AD BAŞINA makine ölçümü (owner PC'sinden, gerçek alan adı, gerçek TLS).
 *
 * BİR SÜREÇ = BİR AD = BİR KANIT. Sonda tek `--origin` ve zorunlu bir ad kimliği (`--alias AD-<n>`; AD-1 = birincil ad) alır; çok adlı
 *            döngü ya da ikinci origin YOKTUR; başka bir adın kanıtını OKUMAZ ve var olan bir kanıt dosyasının ÜZERİNE YAZMAZ. Bir adın
 *            sonucu başka bir ada taşınmaz: her ad ayrı süreç, ayrı dosya. Okuduğu dosyalar: kendi kaynağı (SHA-256 için) · yalnız
 *            AD-1 dışındaki adlarda kapsam yetkisi kaydı ile o kaydın gösterdiği kanıt dosyaları (yalnız SHA-256 için; içerik
 *            yorumlanmaz, hiçbir yere yazılmaz) · yalnız `--finalize` adımında, AYNI adın ve AYNI sonda baytlarının yazdığı TEK ham
 *            kanıt dosyası (aşağıda "DAR KABUL İSTİSNASI"; ad / sonda / vektör kümesi tutmuyorsa reddedilir, istek atılmaz).
 * KAPSAM YETKİSİ KAPISI (owner kararları 2026-10-05 ve 2026-10-06): birincil ad (AD-1) dışındaki her ad kimliği için sonda, kısıtlı bir
 *            "kapsam yetkisi kaydı" (`--scope-record <dosya>`) olmadan KOŞMAZ — istek atılmaz, çıkış 4, ileti tam olarak
 *            "KOŞULMADI — kapsam yetkisi doğrulanmadı" (+ ad / yol / özet değeri içermeyen neden SINIFI; zorunlu bir kalem eksikse
 *            aynı satırda eksik kalemin TÜRÜ: `eksik=<tür>[,<tür>]` — owner kararı: "kanıt eksikse yalnız eksik girdiyi iste"). Kayıt (JSON):
 *              { "record": "EXTACC-D8-SCOPE-AUTHORIZATION", "nameAlias": "AD-<n>", "originHost": "<ana makine>",
 *                "items": [ { "type": "SAGLAYICI-HESABI-KAYDI", "file": "<yol>", "sha256": "<64 onaltılık>", "date": "YYYY-AA-GG" },
 *                           { "type": "DNS-ZINCIRI",            "file": "<yol>", "sha256": "<64 onaltılık>", "date": "YYYY-AA-GG" } ],
 *                "review": { "reviewer": "<inceleyen>", "date": "YYYY-AA-GG", "itemTypes": [ "SAGLAYICI-HESABI-KAYDI", "DNS-ZINCIRI" ] } }
 *            İKİ AYRI ŞEY AYRI KAYDEDİLİR (owner kararı 2026-10-06):
 *            (1) DOSYA BÜTÜNLÜĞÜ — sondanın ÖLÇTÜĞÜ tek şey: listelenen her kalemin dosyası VAR, boş değil ve SHA-256'sı kayıttakiyle
 *                AYNI (kanıtta `fileIntegrity: OLCULDU`). Bu, içeriğin neyi gösterdiği hakkında hiçbir şey söylemez.
 *            (2) İÇERİK İNCELEMESİ — bir İNSAN incelemesidir; sonda kanıtın içeriğini OKUMAZ, yorumlamaz ve sahipliği DOĞRULAMAZ.
 *                Kayıtta inceleyenin beyanı ZORUNLUDUR (`review`: kim · ne zaman · hangi kalem türleri — iki zorunlu türü de kapsar);
 *                sonda onu YALNIZ "beyan var" diye kaydeder (kanıtta `contentReview: BEYAN-VAR`; inceleyenin adı ve tarih yazılmaz).
 *            Ayrıca ölçülen bağlar: ad kimliği `--alias` ile aynı · `originHost`, `--origin` ana makinesiyle BİREBİR aynı (büyük / küçük
 *            harf dışında; alt alan, önek, sondaki nokta eşleşme DEĞİLDİR) · İKİ AYRI KANIT UNSURU kayıtta ayrı kalem olarak VAR:
 *            (i) yetkili sağlayıcı hesabındaki bölge / özel ad kaydı, (ii) DNS zinciri · her tarih geçerli ve gelecekte değil.
 *            İKİ AYRI DOSYA ZORUNLU DEĞİLDİR: sağlayıcı hesabı kaydı ile DNS zinciri TEK birleşik belgede bulunabilir (iki kalem aynı
 *            dosyayı / aynı özeti gösterebilir). Zorunlu olan: iki ayrı kanıt unsuru (iki tür), ad bağı, dosya bütünlüğü ve inceleme beyanı.
 *            TARİH: yalnız `YYYY-AA-GG` (saatli biçim kabul edilmez — bu bir biçim reddidir, saat dilimine bağlı değildir). "Gelecekte"
 *            denetimi UTC gününe göre bir takvim günü payla yapılır (tarih ≤ UTC bugün + 1 gün → kabul): yerel gün UTC gününden
 *            ilerideyken (TSİ 00:00–03:00) yerel BUGÜNÜN tarihi reddedilmez (öz-test SA-11, sınır saatleriyle).
 *            `TUNEL-KAYDI` türü tanınır ama tek başına YETMEZ (yalnız tünel kaydı sunulmuşsa RET). Göreli dosya yolu kaydın dizinine
 *            göre çözülür. Kayıt ve kanıt dosyaları KISITLIDIR (depoya girmez): ham kanıta ve adsız özete yalnız DURUM + dosya bütünlüğü /
 *            inceleme beyanı durumu + kalem TÜRLERİ yazılır; ad, yol, özet değeri, tarih, inceleyen yazılmaz. AD-1 için kapı yoktur ve
 *            `--scope-record` verilmez (birincil adı owner bloğu canlı yapılandırmadan okur). SINIR: sonda AD-1 ile koşulan adın
 *            gerçekten birincil ad olduğunu ÖLÇEMEZ.
 * NE ÖLÇER : izin listesi DIŞINDAKİ (yöntem, yol) çiftlerine verilen yanıt (59 ret vektörü: personel sayfaları, personel API'si,
 *            /api/portal/admin/*, izinli yollarda yanlış yöntem, HEAD/OPTIONS [D8-E1], 18 kodlama/normalizasyon varyantı [D8-E2];
 *            HAM yol korunur) ve 9 pozitif kontrol (3 sayfa 200, 6 API 401).
 *
 * AD DÜZEYİNDE ÜÇ AYRI ALAN + POZİTİF KONTROL (owner kararları 2026-10-05 ve 2026-10-06). Her alan YALNIZ `PASS` / `FAIL` /
 * `OLCULEMEYEN` alır; alanlar birbirinin yerine geçmez; birleşik tek "PASS" ya da "D-8 PASS" ÜRETİLMEZ. Kanıtta `nameVerdict {
 * httpReject, edgeBlocking, layerVerification, positiveControl }`; her alanda `value` + nedenler (`reasons`). TEK EK DEĞER (R07;
 * YALNIZ `httpReject` alanında): `OWNER-ISTISNASIYLA-UYGUN` — aşağıdaki dar kabul istisnası uygulandığında yazılır; `PASS` DEĞİLDİR.
 * KANIT SINIRI (owner kararı 2026-10-06): bu sondanın elindeki tek katman kanıtı "API'nin yeni kimlik üretmesi"dir ve o yalnız
 * API'ye ULAŞMAYI gösterebilir. İsteğin API'ye ulaşMADIĞINI gösteren bağımsız hiçbir kanıt sondada YOKTUR: kimlik başlığının
 * bulunmaması bunu kanıtlamaz (zincirde yalnız API'nin ret yanıtından başlığı silen bir katman dışarıdan ayırt edilemez) ve pozitif
 * yolların kalibrasyonu ret yollarında başlığın korunacağını kanıtlamaz. Bu yüzden KENAR ENGELLEME ve KATMAN DOĞRULAMASI alanları
 * bu sondayla `PASS` ÜRETMEZ; ölçüm koşumunun çıkış kodu 0 OLMAZ. Kesin kenar kabulü sonda DIŞI bağımsız kanıt ve owner
 * değerlendirmesi gerektirir.
 *   (a) HTTP / RET SONUCU (`httpReject`) — YALNIZ durum kodu ölçütü (yalnız ret vektörleri):
 *         PASS         bütün ret vektörleri 403 (sınama işaretli 403 de durum kodu olarak 403'tür; kenar hükmü (b)'dedir). İstisna
 *                      uygulanan koşum PASS ALMAZ.
 *         FAIL         en az bir ret vektörüne DOĞRULANMIŞ başka bir HTTP yanıtı geldi — hangi kod olursa olsun (2xx · 3xx · 403 dışı
 *                      4xx · 429 · 5xx · sınıflanamayan kod); hangi katmanın ürettiği bu alana GİRMEZ (dar sınıfın UYGULANDIĞI tek
 *                      satır dışında; istisna uygulanmayan / kesinleşmeyen satır bu kuralla FAIL'dir)
 *         OLCULEMEYEN  FAIL yok ama yanıt alınamayan ret vektörü var (taşıma hatası)
 *         OWNER-ISTISNASIYLA-UYGUN  (owner şartı 2026-10-06: "İstisna uygulanan HTTP 400 satırını 'HTTP/ret PASS' diye sunma.")
 *                      FAIL nedeni YOK, ÖLÇÜLEMEYEN nedeni YOK ve TAM BİR satır aşağıdaki DAR KABUL İSTİSNASI sınıfında: istisna
 *                      dışındaki bütün ret vektörleri 403 aldı; o TEK satırın gerçek HTTP kodu 400'dür ve öyle kaydedilir (`status` 400,
 *                      `outcome` DORTYUZ-403-DISI, `acceptedClass` = sınıfın adı). Bu değer 403 BAŞARISI DEĞİLDİR; toplu uygunluğun
 *                      owner istisnasına dayandığını açıkça söyler; kenar engelleme ya da katman için PASS üretmez (o iki alan ve
 *                      pozitif kontrol bu değeri HİÇ almaz ve görmez). Sayılar `httpReject.counts` alanında ayrı tutulur (o satır
 *                      "403" SAYILMAZ). Çıkış kodu eşlemesinde FAIL değildir (FAIL yok → 3).
 *   (b) KENAR ENGELLEME SONUCU (`edgeBlocking`):
 *         FAIL         engellenmesi gereken bir isteğin API'YE ULAŞTIĞI API'ye ÖZGÜ kanıtla gösterildi — API'nin o isteğe 403 vermesi
 *                      bunu KAPATMAZ (kenarda engellenmesi gereken istek API'ye ulaşmıştır) · YA DA ret vektörü hiç reddedilmedi (2xx)
 *         OLCULEMEYEN  FAIL yoksa HER ZAMAN (bu alan sondayla PASS ÜRETMEZ — yukarıda "KANIT SINIRI"). Neden sınıfı ayırt edilir:
 *                      · `ULASMAMA-BAGIMSIZ-KANITI-YOK` — başka hiçbir ölçülemeyen nedeni yokken (bütün ret vektörleri işaretsiz,
 *                        kimlik başlıksız 403; pozitifler beklendiği gibi; kalibrasyon VAR): gözlem temizdir ama isteğin API'ye
 *                        ulaşMADIĞINI gösteren bağımsız kanıt yoktur. SAĞLIKLI kenar ile zincirde başlığı silinmiş bir API reddi bu
 *                        sınıfta AYNI görünür (öz-test S1 / SINIR-2); ikisine de PASS verilmez.
 *                      · diğer nedenler (her biri ayrı sınıf): kalibrasyon eksik / geçersiz · sınama (challenge) ya da tanınmayan
 *                        azaltım işaretli 403 (durum kodu eşleşir ama hedeflenen erişim kuralının uygulandığını KANITLAMAZ) · ret-403
 *                        dışındaki bir yanıtta azaltım işareti · pozitifler beklendiği gibi değil (tekdüze 403 dahil) · yanıt
 *                        alınamayan vektör · durum kodu ölçütü PASS değil ama API'ye ulaşma kanıtı da yok · ret yanıtında katmanı
 *                        belirlenemeyen kimlik başlığı (yansıma / yabancı kimlik)
 *         PASS         ÜRETİLMEZ. Kayıt eki (`scope`) her koşumda yazılır: yalnız bu istek profili, bu konum, bu vektör kümesi için +
 *                      kanıt sınırı.
 *         Kalibrasyon eksikliği somut olumsuz kanıtı SİLMEZ: kalibrasyon eksikken / yansıtan katman görülmüşken de API'ye özgü kanıt
 *         FAIL verir. Kalibrasyon, API kanıtının KULLANILABİLİRLİĞİ ve yansıma / damga göstergeleri içindir (FAIL yönü ona dayanır);
 *         "kalibrasyon VAR → kapalı" çıkarımı YAPILMAZ.
 *   (c) KATMAN DOĞRULAMASI (`layerVerification`) — kanıtın desteklemediği katman kesinliği REDDEDİLİR:
 *         FAIL         bir ret satırını API'nin yanıtladığı kanıtlı VE koşumun kendi kalibrasyonu API'nin "kabul edilmeyen biçim →
 *                      yeni kimlik" davranışını EN AZ BİR kez gösterdi (`calibration.apiReplace` ≥ 1)
 *         PASS         ÜRETİLMEZ: "yanıtlayan katman API değil" hiçbir ret satırında gösterilemez (başlık yokluğu satır düzeyinde de
 *                      kanıt DEĞİLDİR; "API değil" çıkarımı KALKTI).
 *         OLCULEMEYEN  diğer her durum + kapsam sayısı (`coverage`: kaç satır API kanıtlı · kaç satır ölçülemez ve neden sınıfı).
 *                      Kenar / tünel / sağlayıcı bu sondayla HİÇBİR koşulda adlandırılmaz.
 *         DESTEKSİZ KESİNLİK YOK: kalibrasyon o davranışı HİÇ göstermediyse (değiştirme 0 / N) ret satırındaki "yeni kimlik" gözlemi
 *                      (b)'de yine FAIL / bulgu adayıdır (somut olumsuz kanıt silinmez) ama bu alan "API yanıtladı" kesinliği BİLDİRMEZ:
 *                      OLCULEMEYEN + neden `YENI-KIMLIK-GOZLEMI-KALIBRASYON-DEGISTIRMEYI-GOSTERMEDI`; o satır kapsam sayısında
 *                      "API kanıtlı" değil "ölçülemez" sayılır.
 *   POZİTİF KONTROL (`positiveControl`) — API'ye geçmesine İZİN VERİLEN yollar; (a)–(c) kurallarına KARIŞTIRILMAZ. TEK KURAL
 *         (owner kararı 2026-10-06; gönderilen kimlik biçimine ve satırın katman kimliğine BAĞLI DEĞİL; 403 İSTİSNASI YOK):
 *         PASS dokuz pozitifin hepsi beklenen kodu verdi · FAIL beklenen dışında DOĞRULANMIŞ başka HER HTTP yanıtı — 2xx · 3xx ·
 *         403 DAHİL her 4xx · 429 · 5xx · sınıflanamayan kod; hangi katman üretmiş olursa olsun (ör. token'sız 200; reddedilen
 *         pozitif — tek bir pozitif de olsa, tekdüze ret de olsa; web pozitifinde 3xx / 404; izinli yolda 5xx) · OLCULEMEYEN yalnız
 *         yanıt alınamadı. Pozitif kontrol FAIL bir ÖLÇÜT İHLALİ / BULGU ADAYIDIR; nedeni ayrı değerlendirilir — "ürün güvenlik
 *         kusuru kesinleşti" demek DEĞİLDİR.
 *
 * DAR KABUL İSTİSNASI (owner kararı 2026-10-06; kural sürümü R07) — sınıfın adı TAM OLARAK:
 *         "İzin verilen bozuk istek reddi — katman doğrulanmadı".
 *         Bu bir OWNER KABUL KURALIDIR; uygulamaya hiç ulaşılmadığının teknik kanıtı DEĞİLDİR. Yanıtı hangi katmanın ürettiği bu
 *         sondayla ÖLÇÜLEMEZ (kanıt sınırı aynen geçerlidir); sınıf yalnız (a) durum kodu ölçütünde TEK bir satırın tek başına FAIL
 *         saydırılmamasıdır — o koşumda (a) alanı `PASS` DEĞİL `OWNER-ISTISNASIYLA-UYGUN` değerini alır; satırın gerçek HTTP kodu
 *         (400) ve sınıfın adı ayrı görünür. Kural 2026-10-06'da verildi ve R07 ile yürürlüğe girdi; GEÇMİŞ KOŞUMA GERİYE DÖNÜK UYGULANMAZ (kesinleştirme
 *         adımı yalnız bu sonda baytlarının yazdığı kanıtı kabul eder).
 *   KAPSAM — satır numarasıyla DEĞİL, değişmez tanımla sabittir (liste sırası değişse de başka isteğe taşınmaz): vektör kimliği
 *         `D8E2-BOS-BAYT-KODLU` = ret listesindeki "varyant boş bayt kodlu" vektörü + yöntem GET + HAM request-target
 *         `/api/portal/cases%00/admin`. Üçü de birebir tutmalı ve ret listesinde TAM BİR vektör bu tanımla eşleşmelidir.
 *   KOŞULLAR — HEPSİ (biri eksik ya da çelişkiliyse istisna YOK; mevcut FAIL / OLCULEMEYEN kuralları aynen uygulanır):
 *         (1) tanımlı vektör VE HTTP 400;
 *         (2) incelenmiş hata yanıtının özellikleri birebir: `content-type` tam `text/html` · gövde tam 155 bayt · gövdenin SHA-256'sı
 *             EFCA0895B4D88B27A94249F8E7AC0083EFF0A4FF3AC37C2841B3F6D7E11C1905 — yalnız genel bir sağlayıcı başlığı YETMEZ (Server
 *             başlığı ve gövde imzası ipucudur; bu kurala GİRMEZ). Bu üç DEĞER owner metninde yoktur (owner "incelenmiş hata yanıtı
 *             özellikleriyle uyum" dedi): 2026-10-06 teşhis ölçümünde incelenen yanıttan uygulayıcı tarafından sabitlenmiştir
 *             (ölçüm kısıtlı kayıttadır). Özet karşılaştırması HAM değerle yapılır (kanıttaki türetilmiş "eşleşti" alanıyla değil);
 *         (3) o yanıtta uygulama kimliği ya da başka olumlu uygulamaya ulaşma kanıtı YOK: kimlik başlığı HİÇ yok (yeni kimlik,
 *             yansıma ve yabancı kimlik dahil her kimlik başlığı istisnayı geçersiz kılar) ve satır API kanıtlı değil;
 *         (4) AYNI ham yol ve AYNI ad bağlamıyla (Host başlığı = `--origin` ana makinesi) YEREL KENARDA 403 gözlemi, kimlik başlıksız:
 *             `--local-edge http://127.0.0.1:<port>` (YALNIZ bu biçim: ad çözümlemesine bağlı olmamak için `localhost` dahil başka
 *             her ad / adres / şema / yol kabul edilmez → kapı, çıkış 4). Sonda o TEK vektörü dış 68 istekten SONRA yerel kenara BİR kez gönderir (yeniden deneme ve yönlendirme
 *             takibi yok; kimlik bilgisi yok; gövde yok). Parametre verilmediyse ya da gözlem 403 değilse / yanıt alınamadıysa
 *             istisna YOK. İstek kanıta AYRI kayıt olarak yazılır (`localEdgeComparison`) ve toplam istek sayısına DAHİLDİR
 *             (`measured.requestCount` = dış 68 + yerel 1);
 *         (5) bu satırın değerlendirmesinde sonda dışı ek kanıt (sayaç kanıtı) KULLANILIYORSA geçerlilik koşulları sağlanmış ve
 *             açıklanamayan artış bulunmamış olmalı. Sonda bu kanıtı ÖLÇMEZ ve nasıl elde edildiğini BİLMEZ (yöntem kısıtlı
 *             kayıttadır); yalnız owner'ın açık BEYANINI kaydeder:
 *               `--offprobe-evidence KULLANILMIYOR`  bu satırın değerlendirmesinde sonda dışı ek kanıt kullanılmıyor → koşul (5)
 *                                                    uygulanmaz; diğer dört koşul tutuyorsa sınıf koşum anında UYGULANIR;
 *               `--offprobe-evidence KULLANILACAK`   kullanılacak; sonucu koşumdan SONRA oluşur → koşum anında sınıf KESİNLEŞMEZ
 *                                                    (durum `KESINLESMEDI-EK-KANIT-SONUCU-YOK`; satır mevcut kuralla FAIL, çıkış 2);
 *               beyan YOK                            eksik kanıt → istisna YOK (`EK-KANIT-BEYANI-YOK`).
 *             KESİNLEŞTİRME (çevrimdışı ikinci adım; İSTEK ATMAZ): `--finalize <kanit.json> --evidence-sha256 <KAYITLI ÖZET>
 *             --offprobe-result <SONUÇ> --out <yeni.json>` — aynı `--alias` / `--vantage` / `--origin` ile.
 *             KAYITLI ÖZET KAPISI (R08; owner talimatı 2026-10-06: "Ham kanıt özetini kesinleştirmeden önce kaydet; sonradan
 *             değişmiş kanıtı reddet." · "… beklenen SHA-256 değerini, kesinleştirme sırasında yeniden hesaplayıp 'beklenen' diye
 *             kullanma. Koşum sonunda ayrı kayda alınmış değerle karşılaştır."): `--evidence-sha256` ZORUNLUDUR ve koşum SONUNDA
 *             ayrı kayda alınmış değerdir (64 onaltılık hane). Sonda bu değeri dosyadan TÜRETMEZ: dosyanın gerçek SHA-256'sını
 *             hesaplar ve VERİLEN değerle karşılaştırır; farklıysa kesinleştirme YAPILMAZ (`KANIT-OZETI-KAYITLA-UYUSMUYOR`; çıkış 4;
 *             kayıt yazılmaz). Değer yoksa / biçimsizse kapı (çıkış 4). Kesinleştirme kaydına ikisi de yazılır
 *             (`registeredEvidenceSha256` = verilen · `sourceEvidenceSha256` = hesaplanan). GÜVEN SINIRI: kanıt dosyası ile ayrı
 *             kayıt BİRLİKTE ve tutarlı biçimde değiştirilirse sonda bunu AYIRT EDEMEZ — korunma, ayrı kaydın kanıt dizininin
 *             DIŞINDA ve bağımsız bir yerde (koşum çıktısının alındığı kısıtlı kayıt / manifest) tutulmasına dayanır; her ikisine de
 *             yazma erişimi olan biri için teknik engel DEĞİLDİR. SONUÇ: `GECERLI-ACIKLANAMAYAN-ARTIS-YOK` → koşul (5) sağlandı ·
 *             `GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS` → istisna YOK. Adım kanıt dosyasını okur, kalibrasyonu / katman kimliğini / dar
 *             sınıf kararını / dört alanı kanıttaki satırlardan YENİDEN türetir (kanıttaki eski hükme güvenmez) ve AYRI bir
 *             kesinleştirme kaydı yazar (kaynak kanıtın SHA-256'sıyla; kaynak kanıtın üzerine yazmaz). Reddeder (çıkış 4): kanıt bu
 *             sonda baytlarıyla / bu revizyonla / bu vektör kümesiyle / bu ad · ana makine · konum etiketiyle yazılmamışsa ya da
 *             kanıttaki beyan `KULLANILACAK` değilse — ya da kanıt KENDİ İÇİNDE TUTARSIZSA: satırlardan yeniden türetilen dört alan /
 *             çıkış kodu / beş koşul kanıttaki kayıtla aynı değilse, ya da tanımlı satırın türetilmiş "özet eşleşti" alanı ham özetle
 *             çelişiyorsa (yalnız türetilmiş alanı elle çevrilmiş kanıt kabul edilmez). SINIR: ham değerleri de birlikte ve tutarlı
 *             biçimde yeniden yazılmış bir kanıtı adım İÇERİĞİNDEN ayırt edemez — dosyanın bütünlüğü yukarıdaki KAYITLI ÖZET
 *             KAPISI ile korunur (koşum sonunda ayrı kayda alınan değer verilir; dosya sonradan değiştiyse özet tutmaz ve adım
 *             reddeder); o kapının güven sınırı yukarıda yazılıdır. Adım beyanın doğruluğunu ÖLÇEMEZ ve aynı kanıt için ikinci
 *             bir kesinleştirmeyi engelleyemez.
 *   SINIRLAR — bu sınıf: 2xx yanıtları KAPSAMAZ · başka vektöre UYGULANMAZ · KENAR ENGELLEME ve KATMAN DOĞRULAMASI alanlarına PASS
 *         ya da lehte neden VERMEZ — o iki alan sınıfı GÖRMEZ: istisna uygulanan koşumda, uygulanmayan aynı girdideki değer ve
 *         nedenlerle BİREBİR aynıdır (o satır 403 almamıştır: kenar engelleme nedeni `DURUM-KODU-OLCUTU-PASS-DEGIL` kalır; burada
 *         "durum kodu ölçütü" = istisnasız ölçüt, yani bütün ret vektörleri 403) · başka bir bulguyu KAPATMAZ · genel D-8 kabulü
 *         ÜRETMEZ · çıkış kodu eşlemesini DEĞİŞTİRMEZ (FAIL → 2, FAIL yok → 3) · (a) alanında `PASS` ÜRETMEZ (değer
 *         `OWNER-ISTISNASIYLA-UYGUN`'dur; "403 başarısı" diye sunulmaz).
 *   KAYIT — satırda `acceptedClass` (uygulandıysa sınıfın tam adı; aksi null); ham kanıtta ve adsız özette `malformedRejectClass`
 *         { className, notice, limits, ruleRevision, vectorId, state: UYGULANDI / UYGULANMADI / KESINLESMEDI-EK-KANIT-SONUCU-YOK,
 *         conditions (beş koşul ayrı ayrı), whyNot, offprobeEvidence { declared, result }, localEdge }; çıktıda `D8-DAR-SINIF=` satırı
 *         ve — uygulandıysa — sınıfın tam adı + "owner kabul kuralı; teknik kanıt değildir" cümlesi. Adsız özete HAM YOL, yöntem ve
 *         yerel adres yazılmaz (yalnız vektör kimliği).
 *
 * SATIR DÜZEYİ: `outcome` (durum kodu sınıfı): RET-403 · SINAMA-ISARETLI-403 · TANINMAYAN-AZALTIM-ISARETLI-403 · DORTYUZ-403-DISI ·
 *       HIZ-SINIRI-429 · REDDEDILMEDI-2XX · YONLENDIRME-3XX · SUNUCU-HATASI-5XX · SONUC-YOK (taşıma hatası; yalnız `errorClass`:
 *       AD-COZULMEDI / BAGLANTI / TLS / ZAMAN-ASIMI / DIGER — hata İLETİSİ ve yönlendirme HEDEFİ kanıta yazılmaz) · SINIFLANAMADI.
 *       AZALTIM İŞARETİ (sağlayıcının yanıt başlığı; satırda `mitigationMark`: YOK / SINAMA / TANINMAYAN — başlığın DEĞERİ kanıta
 *       yazılmaz): tanınan sınama (challenge) değeri virgül / boşlukla ayrılmış listenin ÖGESİ olarak ve harf duyarsız aranır (iki ayrı
 *       başlık satırı tek listedir); başlık VAR ama değer tanınmıyorsa (boş değer dahil) TANINMAYAN. İşaret kenar engelleme alanına
 *       AYRI bir ölçülemeyen nedeni yazar (var olan hiçbir işaret "temiz gözlem" sınıfına düşmez; FAIL'i de kaldırmaz); durum kodu
 *       ölçütünü ve bir bulgu adayını DEĞİŞTİRMEZ; katmana GİRMEZ. Yalnız bilinen başlık okunur; işaretsiz bir sınama yanıtı bu
 *       sondayla ayırt edilemez.
 *
 * API'YE ÖZGÜ KANIT — İSTEK KİMLİĞİ PROTOKOLÜ (kaynak: apps/api/src/common/request-id.middleware.ts). API, gelen `x-request-id` değerini
 * kabul ettiği biçimdeyse yanıta AYNEN geri yazar; kabul ETMEDİĞİ biçimdeyse ATAR ve YENİ bir kimlik üretir (`randomUUID()`).
 * İsteğin başlığını yanıta yansıtan SIRADAN bir aracı katman birinci davranışı taklit eder; ikincisini üretemez. Bu yüzden:
 *   GÖNDERİLEN BİÇİM (`sent.requestIdForm`; her istekte tek kullanımlık değer):
 *     · ret vektörlerinin HEPSİ           → GECERSIZ-BICIM (API'nin kabul etmediği biçim)
 *     · API pozitifleri (sınıf içi sırayla) → GECERLI-BICIM, GECERSIZ-BICIM, GECERLI-BICIM, … (bugün 3 + 3)
 *     · web pozitifleri (sınıf içi sırayla) → GECERLI-BICIM, GECERSIZ-BICIM, GECERLI-BICIM (bugün 2 + 1)
 *   GÖZLEM (`idObs`): YOK · AYNEN (gönderilen değer geri döndü) · YENI-KIMLIK (farklı değer, API'nin ürettiği biçimde) · BASKA-DEGER ·
 *     SONUC-YOK. Yanıt başlığının DEĞERİ kanıta yazılmaz.
 *   ANLAM (`idSignal` = gözlem × gönderilen biçim):
 *     · DEGISTIRME        GECERSIZ-BICIM gönderildi, YENI-KIMLIK döndü — API'nin ikinci davranışı; yansıtan katman bunu ÜRETEMEZ
 *     · AYNEN-GERI-YAZMA  GECERLI-BICIM gönderildi, AYNEN döndü — API'nin birinci davranışı; yansıtan katman da aynısını üretir
 *                         (tek başına API kanıtı DEĞİLDİR; yalnız kalibrasyon girdisidir)
 *     · YANSIMA           GECERSIZ-BICIM gönderildi, AYNEN döndü — API bunu üretemez: YANSITAN KATMAN GÖSTERGESİ (API kanıtı SAYILMAZ)
 *     · YABANCI-KIMLIK    API'nin üretemeyeceği başka her değer (GECERLI-BICIM gönderildi ama farklı değer döndü · GECERSIZ-BICIM
 *                         gönderildi ama API biçiminde olmayan değer döndü): kendi kimliğini DAMGALAYAN ya da başlığı EZEN katman göstergesi
 *   BAŞLIKSIZ BÖLGE = API'nin kimlik başlığı yazamayacağı yanıtlar (kaynak okuması): API öneki DIŞINDAKİ yollar (web pozitifleri dahil)
 *     ve ön uçuş (OPTIONS — ara katmandan önce biter). Bu bölgede görülen HER kimlik başlığı yabancı bir katmanındır.
 *   KALİBRASYON (aynı ad, aynı koşum; `calibration.result`):
 *     · GECERSIZ  yansıma göstergesi (başlıksız bölgede AYNEN · herhangi bir satırda YANSIMA) YA DA yabancı kimlik göstergesi
 *                 (başlıksız bölgede başka değer · herhangi bir satırda YABANCI-KIMLIK) var
 *     · VAR       gösterge yok VE API pozitiflerinde İKİ davranış da tam: GECERLI-BICIM gönderilenlerin TAMAMI AYNEN-GERI-YAZMA,
 *                 GECERSIZ-BICIM gönderilenlerin TAMAMI DEGISTIRME (her birinden en az bir tane) VE web pozitiflerinin tamamı ölçülmüş
 *                 VE başlıksız bölgede ölçülen en az bir yanıt var (hiçbirinde başlık yok)
 *     · YOK       diğer her durum (kısmi kalibrasyon dahil)
 *   KATMAN KİMLİĞİ (`layerId` + neden sınıfı `layerWhy`):
 *     · UYGULAMA-API       DEGISTIRME + satır başlıksız bölgede DEĞİL + API kanıtı kullanılabilir (`calibration.apiEvidenceUsable`:
 *                          koşumda HİÇ yabancı kimlik göstergesi yok VE başlıksız bölgede ölçülen en az bir yanıt var). Kalibrasyon
 *                          `VAR` ŞART DEĞİLDİR (eksik kalibrasyon ve yansıtan katman bu kanıtı açıklayamaz; damgalayan katman açıklar).
 *     · OLCULEMEYEN        diğer her durum (WEB-YOLU · ON-UCUS · YOL-BELIRSIZ · KALIBRASYON-YOK / -GECERSIZ · YANSIMA ·
 *                          YABANCI-KIMLIK · AYIRT-ETMEYEN-GOZLEM · KANIT-KULLANILAMAZ · BASLIK-YOKLUGU-KANIT-DEGIL)
 *     · SONUC-YOK
 *     "API DEĞİL" ÇIKARIMI KALKTI (owner kararı 2026-10-06): kalibrasyon VAR + başlık YOK + ön uçuş değil + yol API-KESIN olan satır
 *     artık `OLCULEMEYEN` / `BASLIK-YOKLUGU-KANIT-DEGIL`'dir — başlığın bulunmaması isteğin API'ye ulaşmadığını KANITLAMAZ.
 *   Server başlığı, gövde imzası, boş / dolu gövde İPUCUDUR (`hints`, `layerHint`); katman kimliğine ve hiçbir alana GİRMEZ.
 *   İKİ SINIR (öz-testte SINIR-1 / SINIR-2 kalemleriyle KAYITLI; güvence değildir):
 *     · ULAŞMAMA yönünde — KANIT SINIRI (yukarıda): yalnız API'nin RET yanıtından kimlik başlığını silen bir katman varsa API'ye
 *       ulaşan bir istek, kenarın reddettiği istekle AYNI görünür. R05'te bu durumda kenar engelleme PASS / çıkış 0 üretiliyordu
 *       (gerçek API ile izole provada ölçüldü); R06'da iki durum da OLCULEMEYEN'dir (neden `ULASMAMA-BAGIMSIZ-KANITI-YOK`), çıkış 3.
 *     · FAIL yönünde: YALNIZ API önekli ve ön uçuş olmayan RET yanıtlarına, API'nin ürettiği biçimde KENDİ kimliğini yazan ve başka
 *       hiçbir yanıtta görünmeyen bir katman API'den ayırt edilemez — o yanıtlar API kanıtı sayılır (kenar engelleme FAIL / bulgu
 *       adayı). Katman doğrulaması bu gözlemde yalnız koşumun kalibrasyonu "değiştirme" davranışını en az bir kez gösterdiyse FAIL
 *       verir; göstermediyse OLCULEMEYEN kalır (yukarıda (c) "desteksiz kesinlik yok").
 *   YOL SINIFI (`pathClass`; kaynak okuması — Nest 10.4.20 + Express 4: `setGlobalPrefix("api")` + `forRoutes('*')` ara katmanı
 *     `/api` ve `/api/*` için kaydeder; `enableCors` ön uçuşu ara katmandan ÖNCE yanıtlar; yüzde dizisi çözülemezse ara katman
 *     çalışmaz): API-KESIN = ham yol tam `/api` önekli ve normalleştirilecek bir yanı yok (yüzde dizisi, nokta segmenti, çift
 *     eğik çizgi, noktalı virgül, büyük harfli önek yok) — API bu isteği işleseydi ara katman kesin çalışırdı · API-BELIRSIZ =
 *     ham ya da çözülmüş / sadeleştirilmiş biçimi API önekine düşen diğer her yol (çıkarım YAPILMAZ) · ONEK-DISI = web yolu.
 *   Bu protokolün dayanağı KAYNAK OKUMASIDIR; gerçek API ile izole prova bu betikte değil ayrı bir düzenekte koşuldu (paket belgesi
 *   §1.1, "Gerçek API ile izole prova": hangi sonda baytlarıyla koşulduğu orada yazılıdır).
 *
 * ADSIZ ÖZET: ham kanıtın yanına (`<out>.json` → `<out>.ozet.json`) ad İÇERMEYEN ayrı bir özet yazılır (ad kimliği, revizyon, sondanın
 *            SHA-256'sı, vektör kümesi kimliği, kapsam yetkisi durumu [durum · dosya bütünlüğü · içerik incelemesi beyanı · kalem
 *            türleri], sayılar, kalibrasyon, üç alan + pozitif kontrol, zaman, çıkış kodu, beyan edilen konum etiketi, gönderilen
 *            başlık ADLARI). İçermez: ad, hata metni, yönlendirme hedefi, yol düzeyinde bulgu adayı, kanıt dosyası yolu / özeti,
 *            inceleyen. Yöntem SINIFI düzeyinde sayı İÇERİR — bu yüzden özet de KISITLIDIR (depoya konmaz).
 *            Public satıra YALNIZ alan DEĞERLERİ ve ad kimliği yazılır: sayı, neden, yol / yöntem ayrıntısı ve hiçbir özet (SHA-256)
 *            değeri yazılmaz (paket belgesi §1b).
 *            AD DENETİMİ (ölçülen kapsam): (a) istek atılmadan — owner'ın verdiği konum etiketi, ana makine adının TAM dizgisini
 *            ya da nokta ile ayrılmış bir ETİKETİNİ (harf / rakam dışı atıldıktan sonra ≥ 3 karakter; tireli türev dahil)
 *            içeriyorsa sonda koşmaz (çıkış 4); (b) özet yazılmadan — özet metninde adın TAM dizgisi geçiyorsa özet yazılmaz
 *            (çıkış 7). (b) yalnız tam dizgiyi yakalar; adın parçası yalnız (a)'da, yalnız owner etiketinde aranır.
 * HAM YOL  : istek `https.request({host, port, path, method, servername})` ile atılır; `path` vektördeki HAM dizedir
 *            ('/api/portal/./admin/...', '%2F', '?x=1' normalize EDİLMEZ). Öz-test kenarın gördüğü yolu birebir doğrular.
 * İSTEK LİSTESİ VE YAN ETKİ (KİMLİK BİLGİSİ GÖNDERİLMEZ):
 *   · Ret listesinde POST/PUT/PATCH/DELETE vardır — POST/PUT/PATCH gövdesi BOŞ JSON `{}`; DELETE GÖVDESİZ (yalnız
 *     `content-type: application/json` başlığı). Hiçbir istekte authorization/cookie/x-api-key başlığı yoktur.
 *   · Her istekte tek kullanımlık `x-request-id` vardır (kimlik bilgisi DEĞİLDİR). İstek uygulamaya ulaşırsa: GECERLI-BICIM değer o
 *     isteğin kimliği olur (uygulama o istekte 5xx üretirse değer uygulamanın hata kaydına yazılır); GECERSIZ-BICIM değer
 *     uygulamada ATILIR (kimlik olarak kullanılmaz; kaynakta günlüğe yazan satır görülmedi). Ret vektörleri yalnız GECERSIZ-BICIM
 *     taşır. Sondanın vektör listesindeki uçlarda başka bir etkisi kaynakta görülmedi (başlığı ayrıca okuyan üç yer aynı iç
 *     modüldedir — yinelenme anahtarı, bağlam ve iz kimliği; hiçbiri genel kayıtlı değildir ve o modülün ucu listede YOKTUR).
 *   · Beklenen: her ret vektörü 403. KENAR GEÇİRİRSE olası uygulama sonucu, her vektörde `ifPassed` alanındadır. Öne çıkanlar:
 *       - POST /api/auth/login (boş gövde): LoginRateLimitGuard DTO doğrulamasından ÖNCE çalışır → personel giriş hız sınırı
 *         sayacı (IP bazlı, 10/dk) +1, sonra DTO 400. Kimlik bilgisi gönderilmez; uygulama bu isteği YİNE DE giriş sayacına
 *         +1 yazar (uygulamanın kendi semantiğinde başarısız giriş denemesi sayılır). Tek istek blok üretmez.
 *       - POST /api/auth/register (boş gövde): guard yok; ValidationPipe (whitelist) `{}` → 400; yazma yok.
 *       - GET /api/auth/capabilities: guard yok → 200 (statik bayrak); yazma yok; personel API dışarıya açık = bulgu.
 *       - POST /api/auth/account-recovery/find-tenants SONDADA YOK (login ile AYNI sayacı paylaşır; yan etkiyi artırmamak için).
 *       - /api/portal/admin/* : JwtAuthGuard → 401 (token yok; yazma yok).
 *       - GET /api/auth/me · /api/cases · /api/users : 401 (token yok). GET /api/health : R27'de kök ucu yok → 404.
 *       - izinli yolda yanlış yöntem (POST /api/portal/cases, PUT/DELETE messages, …): rota yok → 404 (yazma yok).
 *       - personel sayfaları (/, /auth/login, /dashboard, …): Next sayfa 200/302 (yazma yok) — yüzey dışarıya AÇIK = bulgu.
 *       - HEAD (D8-E1): personel sayfası → Next 200/3xx gövdesiz; personel API/admin → Express HEAD'i GET işleyicisine
 *         yönlendirir → JwtAuthGuard 401 (token yok); DB/yazma/audit/giriş sayacı yok.
 *       - OPTIONS (D8-E1): personel API/admin → Nest enableCors ön uçuşu guard/rota'dan ÖNCE 204 (Content-Length 0; Origin
 *         başlığı yok → ACAO yansıtılmaz; giriş sayacı/yazma/audit YOK); personel sayfası → Next 405/404 (çalışma zamanıyla doğrulanmadı).
 *       - 18 kodlama/normalizasyon varyantı (D8-E2): kenar ham yolu normalize etmeden reddederse 403; geçer ve uygulama
 *         çözerse hedefe göre sayfa 200 / admin 401 / rota yok 404; yazma yok; varyant izin listesini aştı = bulgu.
 *   · "Kimliksiz istekte uygulama 403 üretmez" bir GENELLEME DEĞİLDİR: yalnız bu sondanın vektör listesindeki uçlar için kaynak
 *     okumasıdır (çalışma zamanında ölçülmedi). Uygulamanın ürettiği 403 bu yüzden varsayımla değil kimlik kanıtıyla sınıflanır.
 * YAPMAZ   : kimlik bilgisi göndermez; forgot-password/reset-password çağırmaz (e-posta); intake POST, belge yükleme, mesaj yazma yok;
 *            DB erişimi yok; yönlendirme izlemez; tekrar denemez. Pozitif listedeki POST/DELETE'ler token olmadan guard 401'de durur.
 * KANIT    : `design` alanı (credentialsSent / writesAttempted = false) betik TASARIM BEYANIDIR (ölçüm değil).
 *            `measured { requestCount, credentialHeaderRequests, nonEmptyBodyRequests, bodies }` istek döngüsünden TÜRETİLİR:
 *            gönderilen başlık adları, gövde, gönderilen istek kimliği ve biçimi her satırda `sent` alanındadır (kimlik başlığı yok;
 *            gövde ∈ {'', '{}'}). Yanıt başlığı DEĞERLERİ kanıta yazılmaz (yalnız ad / varlık / gözlem sınıfı).
 *            `vantage` owner'ın BEYAN ettiği konum etiketidir (ölçüm değil). `vectorSetId` vektör listesinden türetilir
 *            (sırayla "grup yöntem hamYol beklenenKodlar" satırlarının SHA-256'sı): adlar arasında aynı listenin koşulduğunu gösterir.
 * İKİ GÜVENCE (R09; owner talimatı 2026-10-07) — ÖLÇÜM ÇAĞRISINDA İKİSİ DE ZORUNLUDUR; biri yoksa / geçersizse sonda KOŞMAZ (kapı,
 *            çıkış 4, istek yok). ESKİ ÇAĞRILAR (R08 ve öncesinin `--max-total-ms` / `--cancel-file` vermeyen ölçüm çağrıları) bu
 *            yüzden artık ÇALIŞMAZ: iki güvence olmadan ölçüm yapılmaz. `--phone-list` ve `--finalize` istek atmaz; bu iki parametreyi
 *            ALMAZ (verilirse kapı).
 *   TOPLAM SÜRE SINIRI `--max-total-ms <1000–900000>`: çalıştırıcıdan BAĞIMSIZ, sondanın KENDİ sınırıdır. Bitiş anı süreç başında
 *            hesaplanır ve BÜTÜN dış istekleri + yerel karşılaştırma isteğini kapsar (kanıt yazımı kapsam DIŞIDIR: son istek
 *            sonuçlanınca sınır kalkar; kanıt yazımı yerel, eşzamanlı ve kısadır). Süre dolunca: devam eden istek ve bağlantısı
 *            KESİLİR (soket yok edilir; açık tutulan bağlantılar dahil), yeni dış ya da yerel istek BAŞLAMAZ, süreç açık KESİLME
 *            sonucuyla çıkar (çıkış 6). `D8_HTTP_TIMEOUT_MS` (varsayılan 15000) yalnız istek başına BOŞTA KALMA sınırıdır — sürekli
 *            veri damlatan bir yanıt onu hiç doldurmaz; toplam sınır o yanıtı da keser. Bu süre SONDANIN sınırıdır: sayaç okumaları /
 *            beklemeleri dahil bütün iş akışının süresi DEĞİLDİR.
 *   İPTAL DOSYASI `--cancel-file <yol>` (yolun DİZİNİ var olmalı): dosya süreç başında VARSA 0 istek atılır (kesilme sonucu). Koşum
 *            boyunca 200 ms aralıkla yoklanır — devam eden istek SIRASINDA da; ayrıca her istekten önce bakılır. Algılanınca aktif
 *            istek kesilir, yeni istek başlamaz, süreç kesilme sonucuyla çıkar. Dosya koşum boyunca yoksa hiçbir etkisi yoktur.
 *   KESİLME SONUCU: çıkış 6 + çıktıda `D8-KESILDI=TOPLAM-SURE-DOLDU | IPTAL-DOSYASI`. HAM KANIT ve ADSIZ ÖZET YAZILMAZ. Yerine AYRI
 *            türde asgari bir KESİNTİ KAYDI yazılır (`<out>.json` → `<out>.kesinti.json`; var olanın üzerine yazmaz; ana makine adı
 *            içermez): neden · başlangıç ve kesilme zamanı · `--max-total-ms` · yoklama aralığı · İSTEMCİ TARAFINDA başlatılan /
 *            sonuçlanan / kesilen istek sayıları (dış ve yerel ayrı). Bu sayılar İSTEMCİ sayılarıdır; SUNUCUNUN ALDIĞI ya da
 *            İŞLEDİĞİ istek sayısı DEĞİLDİR (başlatılan bir istek sunucuya ulaşmamış, kesilen bir istek sunucuda işlenmiş olabilir).
 *            Kesinti kaydında dört alan ve dar sınıf kararı YOKTUR: EKSİK KOŞUM PASS, owner istisnası ya da başka bir hüküm ÜRETMEZ;
 *            `--finalize` kesinti kaydını kabul etmez. Süreç ZORLA öldürülürse (sonlandırma, güç kesintisi) kayıt YAZILAMAZ — o
 *            durumda istek sayıları BİLİNMEZ (UNKNOWN); sıfır varsayılmaz.
 * KULLANIM : node d8-staff-surface-probe.js --alias AD-1 --vantage <etiket> --origin https://<public-host> --max-total-ms <ms> --cancel-file <yol> --out <kanit.json>
 *            node d8-staff-surface-probe.js --alias AD-<n> --scope-record <kayit.json> --vantage <etiket> --origin https://<host> --max-total-ms <ms> --cancel-file <yol> --out <kanit.json>
 *            node d8-staff-surface-probe.js --alias AD-<n> [--scope-record <kayit.json>] --origin https://<public-host> --phone-list
 *            --phone-list AYRI çağrıdır: owner'ın telefonda (mobil veri) açacağı 5 adresi yazar, İSTEK ATMAZ, kanıt yazmaz
 *            (beyan ayrı dosyadadır; makine ölçümü değildir). Kapsam yetkisi kapısı bu çağrıda da geçerlidir.
 *            İSTEĞE BAĞLI (dar kabul istisnası; yukarıda): ölçüm çağrısına `--local-edge http://127.0.0.1:<port>` (dış 68 istekten
 *            sonra yerel kenara +1 istek) ve `--offprobe-evidence KULLANILMIYOR | KULLANILACAK` eklenir. Verilmezlerse sonda R06 ile
 *            aynı 68 isteği atar ve istisna uygulanmaz.
 *            node d8-staff-surface-probe.js --alias AD-<n> --vantage <etiket> --origin https://<host> --finalize <kanit.json> --evidence-sha256 <KAYITLI ÖZET> --offprobe-result <SONUÇ> --out <kesinlestirme.json>
 *            --finalize AYRI çağrıdır: İSTEK ATMAZ; yalnız `KULLANILACAK` beyanlı kanıtı, verilen sonuçla kesinleştirir. Kanıt
 *            dosyasının SHA-256'sı koşum sonunda ayrı kayda alınmış değerle (`--evidence-sha256`) aynı değilse kesinleştirmez.
 * ÇIKIŞ    : dört alandan türer (TEK YER: `exitCodeOf`) — 2 herhangi bir alan FAIL (pozitif kontrol dahil) · 3 FAIL yok (ÖLÇÜLEMEYEN:
 *            kenar engelleme bu sondayla PASS olamaz — sağlıklı koşum da 3 verir) · 4 kapı — istek atılmaz (kapsam yetkisi
 *            doğrulanmadı · origin https değil ya da içinde kimlik / sorgu / parça var · TLS doğrulaması kapalı · ad kimliği / konum
 *            etiketi yok ya da geçersiz · parametre yinelenmiş · --out yok · --phone-list ile --out birlikte · kanıt ya da özet
 *            dosyası zaten var · konum etiketi ana makine adını ya da bir etiketini içeriyor · D8_HTTP_TIMEOUT_MS geçersiz · istek
 *            kimliği planı tutarsız · --local-edge geri döngü http adresi değil · --offprobe-evidence / --offprobe-result değeri
 *            tanınmıyor · --finalize ile ölçüm / telefon parametresi birlikte · --evidence-sha256 yok / 64 onaltılık hane değil / ölçüm
 *            çağrısında verilmiş · kanıtın özeti kayıtlı değerle aynı değil · kesinleştirilecek kanıt kabul edilmedi · (R09)
 *            ölçüm çağrısında --max-total-ms / --cancel-file yok ya da geçersiz · bu ikisi --phone-list / --finalize ile verilmiş ·
 *            kesinti kaydı dosyası zaten var) · 6 KESİLDİ — toplam süre sınırı doldu ya da iptal dosyası algılandı: koşum EKSİKTİR,
 *            ham kanıt / özet yazılmaz, yalnız kesinti kaydı yazılır; hüküm üretilmez (1'den AYRIDIR) · 7 kanıt /
 *            özet yazılamadı (ölçüm yapıldı; ham kanıtı olmayan özet kanıt sayılmaz) · 1 sonda beklenmeyen biçimde durdu
 *            (ÖLÇÜLEMEYEN sayılır; kapanış değildir). Kesinleştirme adımının çıkışı da aynı eşlemeyle (2 / 3) yeniden türetilen
 *            dört alandan gelir.
 *            ÖLÇÜM KOŞUMU ÇIKIŞ 0 ÜRETMEZ (owner kararı 2026-10-06: belirsizlik başarılı kenar engellemesi gibi sunulmaz). Çıkış 0
 *            yalnız `--phone-list` çağrısında görülür (istek atmaz, ölçüm değildir). Hiçbir çıkış kodu "D-8 kapandı" demek DEĞİLDİR
 *            (paket belgesi §3).
 */
const https = require('https'); const http = require('http'); const fs = require('fs'); const pathMod = require('path'); const crypto = require('crypto');
/** Süreç başı — toplam süre sınırının (`--max-total-ms`) başlangıç anı. */
const T_START_MS = Date.now();

const REVISION = 'R09';
/** API'nin istek kimliği başlığı (apps/api/src/common/request-id.middleware.ts REQUEST_ID_HEADER). */
const RID_HEADER = 'x-request-id';
/** API'nin KABUL ettiği biçim — ürün kaynağındaki SAFE_REQUEST_ID ile AYNI ifade (öz-test kaynak metniyle karşılaştırır). */
const RID_ACCEPTED_RX = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** API'nin kabul etmediği değerin yerine ÜRETTİĞİ kimliğin biçimi: `randomUUID()` (RFC 4122 sürüm 4, küçük harf). */
const RID_GENERATED_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALIAS_RX = /^AD-[1-9][0-9]{0,2}$/;
const VANTAGE_RX = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** Birincil ad kimliği: kapsam yetkisi kapısı YALNIZ bu kimlik için yoktur. */
const PRIMARY_ALIAS = 'AD-1';
/** Kapsam yetkisi doğrulanmadığında yazılan ileti — public satırdaki metinle BİREBİR aynıdır (paket belgesi §1b). */
const SCOPE_REFUSAL_TEXT = 'KOŞULMADI — kapsam yetkisi doğrulanmadı';
/** Kapsam yetkisi kaydı KABUL edildiğinde yazılan metin — public satırdaki metinle BİREBİR aynıdır (paket belgesi §1b). Sonda yalnız
 *  dosya bütünlüğünü ölçer; içerik incelemesi insan beyanıdır. "Sahiplik doğrulandı" anlamına gelen bir ifade YAZILMAZ. */
const SCOPE_ACCEPT_TEXT = 'kapsam yetkisi kaydı kabul edildi — dosya bütünlüğü ölçüldü; içerik incelemesi beyanı kayıt sahibinde';
const SCOPE_RECORD_KIND = 'EXTACC-D8-SCOPE-AUTHORIZATION';
/** Kanıt kalemi türleri. İlk ikisi ZORUNLUDUR; tünel kaydı tanınır ama tek başına yetmez. */
const SCOPE_REQUIRED_TYPES = ['SAGLAYICI-HESABI-KAYDI', 'DNS-ZINCIRI'];
const SCOPE_TUNNEL_TYPE = 'TUNEL-KAYDI';

// ─── DAR KABUL İSTİSNASI (owner kararı 2026-10-06; kural sürümü R07) — TEK TANIM ───────────────────────────────────────────
/** Kapsam satır numarasıyla DEĞİL, değişmez tanımla sabittir: vektör kimliği (= ret listesindeki vektör adı) + yöntem + HAM
 *  request-target. `examined` = incelenmiş hata yanıtının özellikleri (durum · içerik türü · gövde bayt sayısı · gövde SHA-256). Owner
 *  "incelenmiş hata yanıtı özellikleriyle uyum" dedi; içerik türü / bayt sayısı / özet DEĞERLERİ owner metninde yoktur — 2026-10-06
 *  teşhis ölçümünde incelenen yanıttan uygulayıcı tarafından sabitlenmiştir (ölçüm kısıtlı kayıttadır). Sınıf adı ve uyarı cümlesi
 *  owner metnidir (paket belgesi §3d bu metinleri AYNEN taşır; öz-test üçünü karşılaştırır). */
const NARROW = {
  ruleRevision: 'R07', // karar tarihi 2026-10-06 (paket belgesi §3d); tarih kanıta / özete / çıktıya YAZILMAZ — orada yalnız kural sürümü bulunur
  className: 'İzin verilen bozuk istek reddi — katman doğrulanmadı',
  notice: 'Bu bir owner kabul kuralıdır; uygulamaya hiç ulaşılmadığının teknik kanıtı değildir.',
  limits: '2xx yanıtları kapsamaz · başka vektörlere uygulanmaz · kenar engelleme veya katman doğrulamasına PASS vermez · başka bir bulguyu kapatmaz · genel D-8 kabulü üretmez · geçmiş koşuma geriye dönük uygulanmaz',
  vectorId: 'D8E2-BOS-BAYT-KODLU', vectorName: 'varyant boş bayt kodlu', method: 'GET', rawTarget: '/api/portal/cases%00/admin',
  examined: { status: 400, contentType: 'text/html', bodyBytes: 155, bodySha256: 'EFCA0895B4D88B27A94249F8E7AC0083EFF0A4FF3AC37C2841B3F6D7E11C1905' },
};
const NARROW_STATES = ['UYGULANDI', 'UYGULANMADI', 'KESINLESMEDI-EK-KANIT-SONUCU-YOK'];
/** Uygulanmama nedeni sınıfları — koşul sırasıyla (1)…(5); (5) üç ayrı sınıftır (beyan yok · sonuç yok · sonuç geçersiz). */
const NARROW_WHYS = ['TANIM-TEK-VEKTORLE-ESLESMIYOR', 'TANIMLI-VEKTOR-HTTP-400-DEGIL', 'INCELENMIS-YANIT-OZELLIKLERI-UYUSMUYOR', 'UYGULAMAYA-ULASMA-KANITI-VAR-YA-DA-CELISKILI', 'YEREL-KENAR-403-GOZLEMI-YOK', 'EK-KANIT-BEYANI-YOK', 'EK-KANIT-SONUCU-YOK', 'EK-KANIT-GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS'];
/** Sonda dışı ek kanıt (sayaç kanıtı) BEYANI — sonda bu kanıtı ölçmez ve nasıl elde edildiğini bilmez; yalnız beyanı kaydeder. */
const OFFPROBE_DECLARATIONS = ['KULLANILMIYOR', 'KULLANILACAK'];
const OFFPROBE_NOT_DECLARED = 'BEYAN-YOK';
/** Kesinleştirme adımında verilen sonuç: ilki koşul (5)'i sağlar; ikincisi istisnayı geçersiz kılar. */
const OFFPROBE_RESULTS = ['GECERLI-ACIKLANAMAYAN-ARTIS-YOK', 'GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS'];
/** Yerel kenar adresi: YALNIZ `http://127.0.0.1:<port>` — geri döngü ADRESİ (ad değil: `localhost` ad çözümlemesine bağlıdır ve kabul
 *  edilmez), YALNIZ http, port ZORUNLU, yol / sorgu / kimlik YOK. */
const LOCAL_EDGE_RX = /^http:\/\/(127\.0\.0\.1):([1-9][0-9]{0,4})$/;
/** (a) HTTP / ret alanının TEK ek değeri (owner şartı 2026-10-06): dar kabul istisnası uygulanan koşum `PASS` ALMAZ. Anlamı: istisna
 *  dışındaki bütün ret vektörleri 403 + TAM BİR satır owner istisnası sınıfında (gerçek HTTP kodu 400). 403 başarısı DEĞİLDİR; diğer
 *  üç alan bu değeri almaz. */
const HTTP_OWNER_EXCEPTION = 'OWNER-ISTISNASIYLA-UYGUN';
const HTTP_OWNER_EXCEPTION_TEXT = 'gerçek HTTP kodu 400 olan 1 ret satırı owner istisnası sınıfında; diğer bütün ret vektörleri 403 — bu değer 403 başarısı DEĞİLDİR, owner kabul kuralına dayanır; kenar engelleme ya da katman doğrulaması için PASS üretmez';
const LOCAL_EDGE_CLASS = 'YEREL-KENAR-GERI-DONGU';
const FINALIZATION_RECORD_KIND = 'EXTACC-D8-OFFPROBE-FINALIZATION';

// ─── ALAN DEĞERLERİ VE ÇIKIŞ KODU — TEK YER ───────────────────────────────────────────────────────────────────────────────
const FIELD_VALUES = ['PASS', 'FAIL', 'OLCULEMEYEN'];
/** Çıkış kodu eşlemesi (paket belgesi §1.1 bu metni AYNEN taşır; öz-test üçünü karşılaştırır). */
const EXIT_CODE_MAP = 'herhangi bir alan FAIL → 2 · FAIL yok → 3 (ölçüm koşumu 0 üretmez) · kapı → 4 · kesildi (toplam süre sınırı / iptal dosyası; koşum eksik, kanıt yazılmaz) → 6 · kanıt yazılamadı → 7 · beklenmeyen durma → 1';
/** KESİLME (R09) — tamamlanan koşumun çıkış kodlarından (2 / 3) ve "beklenmeyen durma"dan (1) AYRI kod. Dört alandan türemez. */
const EXIT_INTERRUPTED = 6;
const INTERRUPT_REASONS = ['TOPLAM-SURE-DOLDU', 'IPTAL-DOSYASI'];
const INTERRUPTION_RECORD_KIND = 'EXTACC-D8-PROBE-INTERRUPTION';
/** İptal dosyasının yoklama aralığı (ms) — devam eden istek sırasında da. */
const CANCEL_POLL_MS = 200;
const COUNTS_ARE_CLIENT_SIDE = 'Bu sayılar İSTEMCİ tarafındaki sayılardır (sondanın başlattığı / sonuçlandırdığı / kestiği istekler); sunucunun aldığı ya da işlediği istek sayısı DEĞİLDİR — başlatılan bir istek sunucuya ulaşmamış, kesilen bir istek sunucuda işlenmiş olabilir.';
/** Dört alandan çıkış kodu. Ölçüm koşumu 0 ÜRETMEZ: kenar engelleme bu sondayla PASS olamaz (kanıt sınırı), bu yüzden FAIL yoksa
 *  sonuç her zaman ölçülemeyendir (3) — tanınmayan bir alan değeri de dahil. */
function exitCodeOf(v) {
  const vals = [v.httpReject.value, v.edgeBlocking.value, v.layerVerification.value, v.positiveControl.value];
  return vals.includes('FAIL') ? 2 : 3;
}
/** Kenar engelleme alanının "temiz gözlem" neden sınıfı: başka hiçbir ölçülemeyen nedeni yokken yazılır. Sağlıklı kenar ile zincirde
 *  başlığı silinmiş bir API reddi bu sınıfta AYNI görünür — bu yüzden PASS değil OLCULEMEYEN'dir. */
const EDGE_NO_INDEPENDENT_EVIDENCE = 'ULASMAMA-BAGIMSIZ-KANITI-YOK';
/** Kenar engelleme kaydının eki — HER koşumda yazılır (kapsam + kanıt sınırı). */
const KANIT_SINIRI = 'YALNIZ bu istek profili (requestProfile), bu konum (vantage; beyan) ve bu vektör kümesi (vectorSetId) için. KANIT SINIRI: bu sonda kenar engelleme için PASS ÜRETMEZ. Elindeki tek katman kanıtı API\'nin yeni kimlik üretmesidir ve o yalnız isteğin API\'ye ULAŞTIĞINI gösterebilir (FAIL). İsteğin API\'ye ulaşMADIĞINI gösteren bağımsız kanıt sondada yoktur: kimlik başlığının bulunmaması bunu kanıtlamaz (zincirde yalnız API\'nin ret yanıtından başlığı silen bir katman dışarıdan ayırt edilemez) ve pozitif yolların kalibrasyonu ret yollarında başlığın korunacağını kanıtlamaz. FAIL yoksa alan OLCULEMEYEN\'dir; neden ' + EDGE_NO_INDEPENDENT_EVIDENCE + ' "gözlem temiz ama bağımsız kanıt yok" demektir ve başarılı kenar engellemesi DEĞİLDİR. İşaretsiz bir sınama yanıtı da bu sondayla ayırt edilemez. Kesin kenar kabulü sonda dışı bağımsız kanıt ve owner değerlendirmesi gerektirir';
/** Pozitif kontrol / durum kodu / kenar FAIL satırlarının adı: ölçüt ihlali ya da bulgu ADAYI — ürün güvenlik kusuru hükmü değildir. */
const FINDING_LABEL = 'ölçüt ihlali / bulgu adayı; nedeni ayrı değerlendirilir';
/** Sağlayıcının AZALTIM İŞARETİ (yanıt başlığı). Tanınan tek değer sınamadır (`challenge`). İşaret yalnız kenar engelleme alanına ayrı
 *  bir ölçülemeyen nedeni yazmak için okunur (bulgu adayını kaldırmaz); durum kodu ölçütüne ve katmana girmez. */
const MITIGATION_MARK = { header: 'cf-mitigated', challenge: /(^|[\s,])challenge([\s,]|$)/i };
/** Azaltım işareti SINIFI (başlığın değeri hiçbir yere yazılmaz): başlık YOKSA `YOK` · VAR ve değeri — virgül / boşlukla ayrılmış
 *  listenin bir ögesi olarak, harf duyarsız — tanınan sınama değerini taşıyorsa `SINAMA` · VAR ama değeri tanınmıyorsa (boş değer
 *  dahil) `TANINMAYAN`. Node aynı adlı iki başlık satırını ", " ile tek değere birleştirir (liste biçimi). */
function mitigationMarkOf(headers) {
  const v = (headers || {})[MITIGATION_MARK.header];
  if (v === undefined) return 'YOK';
  return MITIGATION_MARK.challenge.test(Array.isArray(v) ? v.join(', ') : String(v)) ? 'SINAMA' : 'TANINMAYAN';
}

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
function argCount(name) { return process.argv.filter((a) => a === name).length; }
function reject(msg) { console.error('REDDEDİLDİ: ' + msg); process.exit(4); }
const ORIGIN = arg('--origin'); const OUT = arg('--out'); const PHONE = process.argv.includes('--phone-list');
const ALIAS = arg('--alias'); const VANTAGE = arg('--vantage'); const SCOPE_RECORD = arg('--scope-record');
const LOCAL_EDGE = arg('--local-edge'); const OFFPROBE = arg('--offprobe-evidence'); const FINALIZE = arg('--finalize'); const OFFPROBE_RESULT = arg('--offprobe-result'); const EVIDENCE_SHA = arg('--evidence-sha256');
if (!ORIGIN || !/^https:\/\/[^/]+$/.test(ORIGIN)) reject('--origin https://<host> (yolsuz) gerekli');
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') reject('TLS doğrulaması kapalı');
if (['--origin', '--alias', '--out', '--vantage', '--scope-record', '--local-edge', '--offprobe-evidence', '--finalize', '--offprobe-result', '--evidence-sha256'].some((n) => argCount(n) > 1)) reject('BİR SÜREÇ = BİR AD = BİR KANIT: --origin / --alias / --out / --vantage / --scope-record / --local-edge / --offprobe-evidence / --finalize / --offprobe-result / --evidence-sha256 birer kez verilir (çok adlı koşum yok)');
// Dar kabul istisnasının girdileri (isteğe bağlı): değer tanınmıyorsa sonda KOŞMAZ — tanınmayan girdi sessizce "yok" sayılmaz.
const FINALIZING = argCount('--finalize') > 0;
if (argCount('--local-edge') > 0 && (!LOCAL_EDGE || !LOCAL_EDGE_RX.test(LOCAL_EDGE) || Number(LOCAL_EDGE_RX.exec(LOCAL_EDGE)[2]) > 65535)) reject('--local-edge yalnız http://127.0.0.1:<port> olabilir (yalnız geri döngü adresi; localhost dahil başka ad / adres, https, yol / sorgu / kimlik yok)');
if (argCount('--offprobe-evidence') > 0 && !OFFPROBE_DECLARATIONS.includes(OFFPROBE)) reject('--offprobe-evidence yalnız ' + OFFPROBE_DECLARATIONS.join(' | ') + ' olabilir (sonuç koşum anında verilemez; --finalize adımında --offprobe-result ile verilir)');
if (FINALIZING && (!FINALIZE || PHONE || argCount('--local-edge') > 0 || argCount('--offprobe-evidence') > 0)) reject('--finalize <kanit.json> AYRI çağrıdır (istek atmaz); --phone-list / --local-edge / --offprobe-evidence ile birlikte verilmez');
if (FINALIZING !== (argCount('--offprobe-result') > 0) || (FINALIZING && !OFFPROBE_RESULTS.includes(OFFPROBE_RESULT))) reject('--finalize ile --offprobe-result birlikte verilir; --offprobe-result yalnız ' + OFFPROBE_RESULTS.join(' | ') + ' olabilir');
// KAYITLI ÖZET KAPISI (R08): kesinleştirme, koşum SONUNDA ayrı kayda alınmış ham kanıt SHA-256'sı OLMADAN yapılmaz. Sonda bu değeri
// dosyadan türetip "beklenen" diye KULLANMAZ; yalnız VERİLEN değerle dosyanın gerçek özetini karşılaştırır (aşağıda, kesinleştirme adımı).
if (FINALIZING !== (argCount('--evidence-sha256') > 0) || (FINALIZING && (typeof EVIDENCE_SHA !== 'string' || !/^[0-9A-Fa-f]{64}$/.test(EVIDENCE_SHA)))) reject('--finalize ile --evidence-sha256 <64 onaltılık hane> birlikte verilir (koşum sonunda ayrı kayda alınmış ham kanıt SHA-256\'sı; ölçüm çağrısında verilmez)');
if (PHONE && (argCount('--local-edge') > 0 || argCount('--offprobe-evidence') > 0)) reject('--phone-list AYRI çağrıdır; --local-edge / --offprobe-evidence ile birlikte verilmez');
if (!ALIAS || !ALIAS_RX.test(ALIAS)) reject('--alias AD-<n> gerekli (ad kimliği; ana makine adı DEĞİL)');
let ORIGIN_URL = null; try { ORIGIN_URL = new URL(ORIGIN); } catch (e) { ORIGIN_URL = null; }
if (!ORIGIN_URL || ORIGIN_URL.username || ORIGIN_URL.password || ORIGIN_URL.search || ORIGIN_URL.hash) reject('--origin yalnız https://<host>[:port] olabilir (kimlik / sorgu / parça yok)');
if (PHONE && OUT) reject('--phone-list AYRI çağrıdır; --out ile birlikte verilmez');
if (!PHONE && !OUT) reject('--out <kanit.json> gerekli');
if (!PHONE && (!VANTAGE || !VANTAGE_RX.test(VANTAGE))) reject('--vantage <etiket> gerekli (beyan edilen koşum konumu; küçük harf / rakam / tire, 2–40 karakter)');
// İKİ GÜVENCE (R09): ölçüm çağrısı (istek atan tek çağrı) toplam süre sınırı VE iptal dosyası OLMADAN koşmaz. İstek atmayan iki çağrı
// (--phone-list, --finalize) bu parametreleri almaz — verilirse sessizce yok sayılmaz, kapıdır.
const MAX_TOTAL_RAW = arg('--max-total-ms'); const CANCEL_FILE = arg('--cancel-file'); const MEASURING = !PHONE && !FINALIZING;
if (['--max-total-ms', '--cancel-file'].some((n) => argCount(n) > 1)) reject('--max-total-ms / --cancel-file birer kez verilir');
if (!MEASURING && (argCount('--max-total-ms') > 0 || argCount('--cancel-file') > 0)) reject('--max-total-ms / --cancel-file yalnız ölçüm çağrısı içindir (--phone-list ve --finalize istek atmaz; bu parametreleri almaz)');
if (MEASURING && (typeof MAX_TOTAL_RAW !== 'string' || !/^\d{4,6}$/.test(MAX_TOTAL_RAW) || Number(MAX_TOTAL_RAW) < 1000 || Number(MAX_TOTAL_RAW) > 900000)) reject('--max-total-ms <1000–900000> gerekli (sondanın toplam süre sınırı, ms; bu güvence olmadan ölçüm çağrısı koşmaz)');
if (MEASURING && (typeof CANCEL_FILE !== 'string' || CANCEL_FILE.length === 0 || /^--/.test(CANCEL_FILE) || !fs.existsSync(pathMod.dirname(pathMod.resolve(CANCEL_FILE))))) reject('--cancel-file <yol> gerekli (iptal dosyası; yolun dizini var olmalı; bu güvence olmadan ölçüm çağrısı koşmaz)');
const MAX_TOTAL_MS = MEASURING ? Number(MAX_TOTAL_RAW) : null;
/** Toplam süre sınırının bitiş anı: süreç başı + `--max-total-ms`. Bütün dış istekleri ve yerel karşılaştırma isteğini kapsar. */
const DEADLINE_MS = MEASURING ? T_START_MS + MAX_TOTAL_MS : null;
const TIMEOUT_RAW = process.env.D8_HTTP_TIMEOUT_MS === undefined ? '15000' : String(process.env.D8_HTTP_TIMEOUT_MS);
if (!/^\d{3,6}$/.test(TIMEOUT_RAW) || Number(TIMEOUT_RAW) < 500 || Number(TIMEOUT_RAW) > 120000) reject('D8_HTTP_TIMEOUT_MS geçersiz (500–120000 ms tam sayı)');
const TIMEOUT_MS = Number(TIMEOUT_RAW);
const HOST = ORIGIN_URL.hostname; const PORT = Number(ORIGIN_URL.port || 443);
/** Yerel kenar (yalnız geri döngü; yukarıdaki kapıdan geçmiş değer) — verilmediyse null: yerel karşılaştırma isteği ATILMAZ. */
const LOCAL_EDGE_URL = LOCAL_EDGE ? new URL(LOCAL_EDGE) : null;
/** Sonda dışı ek kanıt beyanı (ölçüm çağrısında): verilmediyse BEYAN-YOK. Sonuç yalnız kesinleştirme adımında bulunur. */
const OFFPROBE_STATE = { declared: OFFPROBE || OFFPROBE_NOT_DECLARED, result: null };
const SUMMARY_OUT = OUT ? (/\.json$/i.test(OUT) ? OUT.replace(/\.json$/i, '.ozet.json') : OUT + '.ozet.json') : null;
/** Kesinti kaydının yolu (R09): yalnız koşum KESİLİRSE yazılır; ham kanıtın / özetin yerine geçmez. */
const INTERRUPT_OUT = (OUT && MEASURING) ? (/\.json$/i.test(OUT) ? OUT.replace(/\.json$/i, '.kesinti.json') : OUT + '.kesinti.json') : null;
/** Sondanın kendi SHA-256'sı. */
const SELF_SHA = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex').toUpperCase();

// ─── İSTEK KİMLİĞİ PLANI ──────────────────────────────────────────────────────────────────────────────────────────────────
const RID_FORMS = ['GECERLI-BICIM', 'GECERSIZ-BICIM'];
/** Tek kullanımlık istek kimliği. GECERLI-BICIM: API'nin kabul ettiği biçim (aynen geri yazar). GECERSIZ-BICIM: kabul desenindeki
 *  karakter kümesinde OLMAYAN bir karakter (`~`) taşır → API atar ve yeni kimlik üretir; yansıtan bir katman aynen geri döndürür. */
function newRequestId(form) { const hex = crypto.randomBytes(16).toString('hex'); return form === 'GECERLI-BICIM' ? 'd8r' + hex : 'd8r~' + hex; }
/** Hangi istekte hangi biçim: ret vektörlerinin hepsi GECERSIZ-BICIM; pozitifler kendi sınıfı (API / web) içindeki sırayla
 *  GECERLI-BICIM, GECERSIZ-BICIM, GECERLI-BICIM, … */
function ridFormOf(grp, ordinalInClass) { return grp === 'deny' ? 'GECERSIZ-BICIM' : (ordinalInClass % 2 === 0 ? 'GECERLI-BICIM' : 'GECERSIZ-BICIM'); }
// Plan kapısı: iki biçim gerçekten ayrışmıyorsa (kabul deseni değişmiş / üretim bozulmuş) kanıt kuralı anlamsızdır — istek atılmaz.
{ const g = newRequestId('GECERLI-BICIM'); const x = newRequestId('GECERSIZ-BICIM');
  if (!RID_ACCEPTED_RX.test(g) || RID_ACCEPTED_RX.test(x) || RID_GENERATED_RX.test(g) || RID_GENERATED_RX.test(x) || g === x) reject('istek kimliği planı tutarsız (GECERLI-BICIM kabul desenine uymalı, GECERSIZ-BICIM uymamalı; ikisi de API\'nin ürettiği biçimde olmamalı)'); }

// ─── KAPSAM YETKİSİ KAPISI ────────────────────────────────────────────────────────────────────────────────────────────────
/** Kapsam yetkisi doğrulanmadı: istek atılmaz. İleti SABİTTİR; ikinci satır yalnız neden SINIFINI ve — zorunlu bir kalem eksikse —
 *  eksik kalemin TÜRÜNÜ taşır (`eksik=<tür>[,<tür>]`; tür adları public belgededir). Ad / yol / özet değeri / tarih yazılmaz. */
function scopeRefuse(why, missingTypes) { console.error(SCOPE_REFUSAL_TEXT); console.error('D8-KAPSAM-YETKISI=RET neden=' + why + ((missingTypes && missingTypes.length) ? ' eksik=' + missingTypes.join(',') : '')); process.exit(4); }
/** Tarih: yalnız `YYYY-AA-GG` (takvimde var olan gün). "Gelecekte" denetimi UTC gününe göre BİR TAKVİM GÜNÜ payla yapılır: tarihin
 *  UTC gece yarısı ≤ şimdi + 24 saat (yani tarih ≤ UTC bugün + 1 gün). Yerel gün UTC gününden ilerideyken (TSİ = UTC+3 için yerel
 *  00:00–03:00) yerel bugünün tarihi bu payla KABUL edilir; karşılaştırma yerel saat dilimine bağlı DEĞİLDİR (öz-test SA-11). */
function validIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z'); if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return false;
  return t <= Date.now() + 24 * 3600 * 1000; // gelecekteki tarih kanıt tarihi olamaz (bir günlük saat dilimi payı)
}
/** AD-1 dışındaki ad için kapsam yetkisi kaydını ÖLÇER. Dönüş (kanıta yazılan tek şey budur): durum + DOSYA BÜTÜNLÜĞÜ (sondanın
 *  ölçtüğü) + İÇERİK İNCELEMESİ (yalnız "beyan var"; insan incelemesidir) + kalem türleri. Sonda sahipliği doğrulamaz. */
function verifyScopeAuthorization() {
  if (ALIAS === PRIMARY_ALIAS) {
    if (SCOPE_RECORD !== null) reject('--scope-record yalnız AD-1 dışındaki ad kimlikleri içindir (birincil ad için kapsam yetkisi kapısı yoktur; kayıt sessizce yok sayılmaz)');
    return { required: false, status: 'KAPI-YOK-BIRINCIL-AD', fileIntegrity: 'UYGULANMADI', contentReview: 'UYGULANMADI', itemTypes: [] };
  }
  if (!SCOPE_RECORD) scopeRefuse('KAYIT-YOK');
  let rec = null; try { rec = JSON.parse(fs.readFileSync(SCOPE_RECORD, 'utf8')); } catch (e) { scopeRefuse('KAYIT-OKUNAMADI'); }
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || rec.record !== SCOPE_RECORD_KIND || !Array.isArray(rec.items)) scopeRefuse('KAYIT-BICIMI-GECERSIZ');
  if (rec.nameAlias !== ALIAS) scopeRefuse('AD-KIMLIGI-UYUSMUYOR');
  if (typeof rec.originHost !== 'string' || rec.originHost.toLowerCase() !== HOST.toLowerCase()) scopeRefuse('ANA-MAKINE-UYUSMUYOR');
  const known = SCOPE_REQUIRED_TYPES.concat([SCOPE_TUNNEL_TYPE]);
  const shapeOk = (it) => it && typeof it === 'object' && !Array.isArray(it) && known.includes(it.type) && typeof it.file === 'string' && it.file.length > 0 && typeof it.sha256 === 'string' && /^[0-9A-Fa-f]{64}$/.test(it.sha256) && validIsoDate(it.date);
  if (rec.items.length === 0 || !rec.items.every(shapeOk)) scopeRefuse('KALEM-BICIMI-GECERSIZ');
  const missing = SCOPE_REQUIRED_TYPES.filter((t) => !rec.items.some((it) => it.type === t));
  // Eksik zorunlu kalem ADLANDIRILIR (yalnız TÜR; zorunlu kalem sırasıyla). Sunulan tek şey tünel kaydıysa neden sınıfı ayrıdır.
  if (missing.length > 0) scopeRefuse((missing.length === SCOPE_REQUIRED_TYPES.length && rec.items.some((it) => it.type === SCOPE_TUNNEL_TYPE)) ? 'YALNIZ-TUNEL-KAYDI' : 'KALEM-EKSIK', missing);
  // İÇERİK İNCELEMESİ BEYANI (insan incelemesi; sonda içeriği okumaz): kim · ne zaman · hangi kalem türleri (iki zorunlu türü de kapsar).
  // Sonda yalnız beyanın VAR ve tam olduğunu kaydeder; inceleyenin adı ve tarih hiçbir yere yazılmaz.
  const rv = rec.review;
  if (rv === undefined || rv === null) scopeRefuse('INCELEME-BEYANI-YOK');
  const rvOk = typeof rv === 'object' && !Array.isArray(rv) && typeof rv.reviewer === 'string' && rv.reviewer.trim().length > 0 && validIsoDate(rv.date)
    && Array.isArray(rv.itemTypes) && rv.itemTypes.every((t) => known.includes(t)) && SCOPE_REQUIRED_TYPES.every((t) => rv.itemTypes.includes(t));
  if (!rvOk) scopeRefuse('INCELEME-BEYANI-GECERSIZ');
  // DOSYA BÜTÜNLÜĞÜ (sondanın ölçtüğü): listelenen her kalemin dosyası var, boş değil, SHA-256'sı kayıttakiyle aynı. İki kalem AYNI
  // dosyayı gösterebilir (birleşik belge: sağlayıcı hesabı kaydı + DNS zinciri tek dosyada) — iki ayrı dosya zorunlu değildir.
  const base = pathMod.dirname(pathMod.resolve(SCOPE_RECORD)); const types = [];
  for (const it of rec.items) {
    const f = pathMod.resolve(base, it.file); let buf = null;
    try { if (!fs.statSync(f).isFile()) scopeRefuse('KANIT-DOSYASI-YOK'); buf = fs.readFileSync(f); } catch (e) { scopeRefuse('KANIT-DOSYASI-YOK'); }
    if (buf.length === 0) scopeRefuse('KANIT-DOSYASI-BOS');
    const got = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    if (got !== it.sha256.toUpperCase()) scopeRefuse('OZET-TUTMUYOR');
    types.push(it.type);
  }
  return { required: true, status: 'KAYIT-KABUL-EDILDI', fileIntegrity: 'OLCULDU', contentReview: 'BEYAN-VAR', itemTypes: Array.from(new Set(types)).sort() };
}
const SCOPE_AUTH = verifyScopeAuthorization();

// Kenar geçirirse olası uygulama sonucu (R27 kaynağından): kısa etiketler.
const FX = {
  page: 'Next sayfa 200/302; yazma yok; personel yüzeyi dışarıya açık = bulgu',
  jwt401: 'personel JwtAuthGuard → 401 (token yok); yazma yok; personel API dışarıya açık = bulgu',
  login: 'LoginRateLimitGuard sayacı +1 (IP bazlı, 10/dk; DTO doğrulamasından ÖNCE; uygulama semantiğinde başarısız giriş denemesi sayılır) → sonra DTO 400; kimlik bilgisi gönderilmez; sayaç +1 = yan etki + bulgu',
  register: 'POST /api/auth/register guard yok; ValidationPipe (whitelist) boş gövdeyi 400 ile keser; yazma yok; personel API dışarıya açık = bulgu',
  capabilities: 'GET /api/auth/capabilities guard yok → 200 (statik bayrak); yazma yok; personel API dışarıya açık = bulgu',
  health: 'R27 kök /api/health ucu yok → 404; yazma yok; izin listesi dışı = bulgu',
  admin: '/api/portal/admin/* JwtAuthGuard → 401 (token yok); yazma yok; admin yüzeyi dışarıya açık = bulgu',
  adminVar: 'normalizasyona göre admin rotası (→ 401) veya 404; yazma yok; varyant geçti = bulgu',
  noRoute: 'uygulamada bu (yöntem, yol) için rota yok → 404; yazma yok; yanlış yöntem geçti = bulgu',
  nextMethod: 'Next sayfa rotasına yazma yöntemi → 404/405; yazma yok; geçti = bulgu',
  notFound: 'Next/Nest 404; yazma yok; izin listesi dışı = bulgu',
  // D8-E1 — HEAD/OPTIONS. Kenar izin matcher'ları yöntem duyarlıdır (method GET/POST/DELETE); HEAD ve OPTIONS hiçbir izin
  // kuralına uymaz → varsayılan `respond 403`. "Kenar geçirirse" sonucu kaynak 1b758d29'den türetilir.
  headPage: 'HEAD personel sayfası: Next App Router HEAD = GET başlıkları (gövde yok) → 200/3xx; personel yüzeyi dışarıya açık = bulgu; yazma yok',
  headApi: 'HEAD personel API: Express HEAD isteğini GET işleyicisine yönlendirir → global SmokeAuthorizationGuard (Bearer yok → geçer) → JwtAuthGuard 401; gövde yok; DB/yazma/audit/giriş sayacı yok',
  headAdmin: 'HEAD admin: Express HEAD→GET işleyici → JwtAuthGuard 401 (token yok); gövde yok; yazma/audit yok',
  optionsPage: 'OPTIONS personel sayfası: Next App Router sayfası yalnız GET/HEAD → 405 (Allow: GET, HEAD) ya da 404 (çalışma zamanıyla doğrulanmadı); yazma yok',
  optionsApi: 'OPTIONS personel API: Nest enableCors ön uçuşu yönlendirme/guard öncesinde 204 (Content-Length 0); istek Origin başlığı yok → ACAO yansıtılmaz; guard/rota/DTO/giriş sayacı çalışmaz; yazma/audit/hata kaydı yok',
  optionsAdmin: 'OPTIONS admin: Nest CORS ön uçuşu @deny ve JwtAuthGuard öncesinde 204; admin işleyici çalışmaz; yazma yok',
  // D8-E2 — izole provadan taşınan 18 kodlama/normalizasyon varyantı (edge-allowlist-probe.js EVASION). Amaç: kenar ham yolu
  // normalize edip izin listesini aşmaya izin vermiyor mu. Kenar reddederse 403; geçer ve uygulama ham yolu çözerse hedefe göre.
  evasion: 'kodlama/normalizasyon varyantı: kenar ham yolu normalize etmeden reddederse 403; geçer ve uygulama çözerse hedefe göre personel sayfası 200 / admin JwtAuthGuard 401 / rota yok 404; yazma yok; varyant izin listesini aştı = bulgu',
};
// Kenar izin listesi (client-external-access-r01/templates/Caddyfile.template) DIŞI vektörler — hepsi 403 beklenir.
// [ad, yöntem, HAM yol, kenar geçirirse olası sonuç]
const DENY = [
  ['personel kök',                'GET',    '/',                                          FX.page],
  ['personel giriş sayfası',      'GET',    '/auth/login',                                FX.page],
  ['personel panel',              'GET',    '/dashboard',                                 FX.page],
  ['personel sıfırlama sayfası',  'GET',    '/auth/reset-password',                       FX.page],
  ['personel oturum',             'GET',    '/api/auth/me',                               FX.jwt401],
  ['personel giriş API (boş gövde, kimlik bilgisi yok)', 'POST', '/api/auth/login',       FX.login],
  ['personel kayıt API (boş gövde, kimlik bilgisi yok)', 'POST', '/api/auth/register',    FX.register],
  ['personel yetenek bayrağı',    'GET',    '/api/auth/capabilities',                     FX.capabilities],
  ['personel dosya listesi',      'GET',    '/api/cases',                                 FX.jwt401],
  ['personel kullanıcılar',       'GET',    '/api/users',                                 FX.jwt401],
  ['sağlık ucu',                  'GET',    '/api/health',                                FX.health],
  ['portal admin create (boş gövde)',  'POST', '/api/portal/admin/create-user',           FX.admin],
  ['portal admin disable (boş gövde)', 'POST', '/api/portal/admin/disable-user',          FX.admin],
  ['portal admin belgeler',       'GET',    '/api/portal/admin/documents/pending',        FX.admin],
  ['portal admin mesajlar',       'GET',    '/api/portal/admin/messages/clients',         FX.admin],
  ['portal admin kök',            'GET',    '/api/portal/admin',                          FX.adminVar],
  ['portal admin kodlanmış /',    'GET',    '/api/portal%2Fadmin/documents/pending',      FX.adminVar],
  ['portal admin sorgu ile',      'GET',    '/api/portal/admin/documents/pending?x=1',    FX.admin],
  // (portal admin büyük harf '/ADMIN/' ve nokta-segment '/./admin/' artık D8-E2 kodlama bloğundadır; tekrar istek yok)
  ['intake DELETE',               'DELETE', '/intake/d8probe',                            FX.nextMethod],
  ['intake API DELETE',           'DELETE', '/api/public/intake/d8probe',                 FX.noRoute],
  ['intake API PUT (boş gövde)',  'PUT',    '/api/public/intake/d8probe',                 FX.noRoute],
  ['intake API PATCH (boş gövde)', 'PATCH', '/api/public/intake/d8probe',                 FX.noRoute],
  ['portal login GET (yöntem)',   'GET',    '/api/portal/login',                          FX.noRoute],
  ['portal cases POST (boş gövde)', 'POST', '/api/portal/cases',                          FX.noRoute],
  ['portal cases DELETE',         'DELETE', '/api/portal/cases/d8probe',                  FX.noRoute],
  ['portal messages DELETE',      'DELETE', '/api/portal/messages',                       FX.noRoute],
  ['portal messages PUT (boş gövde)', 'PUT', '/api/portal/messages',                      FX.noRoute],
  ['portal documents PUT (boş gövde)', 'PUT', '/api/portal/documents/d8probe',            FX.noRoute],
  ['portal documents POST id (boş gövde)', 'POST', '/api/portal/documents/d8probe',       FX.noRoute],
  ['portal profile POST (web, boş gövde)', 'POST', '/portal/profile',                     FX.nextMethod],
  ['portal change-password GET',  'GET',    '/api/portal/change-password',                FX.noRoute],
  ['portal login sayfası POST (web, boş gövde)', 'POST', '/portal/login',                 FX.nextMethod],
  ['bilinmeyen kök yol',          'GET',    '/robots.txt',                                FX.notFound],
  ['api kök',                     'GET',    '/api',                                       FX.notFound],
  ['api kök slash',               'GET',    '/api/',                                      FX.notFound],
  // D8-E1 — HEAD / OPTIONS ret vektörleri (üç yüzey: personel sayfası · personel API · admin portal yolu). Gövdesiz.
  ['HEAD personel sayfası',       'HEAD',   '/',                                          FX.headPage],
  ['HEAD personel API',           'HEAD',   '/api/auth/me',                               FX.headApi],
  ['HEAD admin portal yolu',      'HEAD',   '/api/portal/admin/documents/pending',        FX.headAdmin],
  ['OPTIONS personel sayfası',    'OPTIONS','/',                                          FX.optionsPage],
  ['OPTIONS personel API',        'OPTIONS','/api/auth/me',                               FX.optionsApi],
  ['OPTIONS admin portal yolu',   'OPTIONS','/api/portal/admin/documents/pending',        FX.optionsAdmin],
  // D8-E2 — izole provadan (edge-allowlist-probe.js EVASION) taşınan 18 kodlama/normalizasyon varyantı. HAM yol korunur.
  ['varyant %61dmin',             'GET',    '/api/portal/%61dmin/documents/pending',      FX.evasion],
  ['varyant %61dmin POST (boş gövde)', 'POST', '/api/portal/%61dmin/create-user',         FX.evasion],
  ['varyant admin%2Fdocuments',   'GET',    '/api/portal/admin%2Fdocuments%2Fpending',    FX.evasion],
  ['varyant DELETE kodlu traversal', 'DELETE', '/api/portal/documents/x%2F..%2Fadmin%2Fdocuments%2Fpending', FX.evasion],
  ['varyant düz traversal',       'GET',    '/api/portal/cases/../admin/documents/pending', FX.evasion],
  ['varyant kodlu traversal ..%2Fadmin', 'GET', '/api/portal/documents/..%2Fadmin/documents/pending', FX.evasion],
  ['varyant çift slash',          'GET',    '//api/portal/admin/documents/pending',       FX.evasion],
  ['varyant nokta segment',       'GET',    '/api/portal/./admin/documents/pending',      FX.evasion],
  ['varyant büyük harf /API/',    'GET',    '/API/portal/cases',                          FX.evasion],
  ['varyant büyük harf /ADMIN/',  'GET',    '/api/portal/ADMIN/documents/pending',        FX.evasion],
  ['varyant sondaki slash',       'GET',    '/api/portal/cases/',                         FX.evasion],
  ['varyant noktalı virgül',      'GET',    '/api/portal/cases;x=1',                      FX.evasion],
  ['varyant web traversal intake', 'GET',   '/intake/abc/../../auth/login',               FX.evasion],
  ['varyant web traversal _next', 'GET',    '/_next/../auth/login',                       FX.evasion],
  ['varyant web kodlu traversal', 'GET',    '/_next/%2e%2e/auth/login',                   FX.evasion],
  ['varyant boş bayt kodlu',      'GET',    '/api/portal/cases%00/admin',                 FX.evasion],
  ['varyant çift kodlama',        'GET',    '/api/portal/documents/%252e%252e/admin',     FX.evasion],
  ['varyant unicode slash',       'GET',    '/api/portal/admin%c0%afdocuments/pending',   FX.evasion],
];
// Pozitifler — izinli çiftler uygulamaya ULAŞIR; hiçbiri yazma yapmaz (token yok → guard 401; sayfa GET → 200).
const ALLOW = [
  ['portal giriş sayfası',              'GET',  '/portal/login',                       [200]],
  ['şifremi unuttum sayfası',           'GET',  '/portal/forgot-password',             [200]],
  ['sıfırlama sayfası',                 'GET',  '/portal/reset-password',              [200]],
  ['portal dosyalar (token yok)',       'GET',  '/api/portal/cases',                   [401]],
  ['portal belgeler (token yok)',       'GET',  '/api/portal/documents',               [401]],
  ['portal mesajlar (token yok)',       'GET',  '/api/portal/messages',                [401]],
  ['portal mesaj gönder (token yok)',   'POST', '/api/portal/messages',                [401]],
  ['portal belge sil (token yok)',      'DELETE', '/api/portal/documents/d8probe',     [401]],
  ['portal parola değiştir (token yok)', 'POST', '/api/portal/change-password',        [401]],
];
/** Vektör kümesi kimliği: sırayla "grup yöntem hamYol beklenenKodlar" satırlarının SHA-256'sı (adlar arasında aynı liste mi?). */
const VECTOR_SET_ID = crypto.createHash('sha256').update(
  DENY.map((v) => `deny ${v[1]} ${v[2]} 403`).concat(ALLOW.map((v) => `allow ${v[1]} ${v[2]} ${v[3].join(',')}`)).join('\n'), 'utf8').digest('hex').toUpperCase();

// ─── SINIFLAR ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const OUTCOMES = ['RET-403', 'SINAMA-ISARETLI-403', 'TANINMAYAN-AZALTIM-ISARETLI-403', 'DORTYUZ-403-DISI', 'HIZ-SINIRI-429', 'REDDEDILMEDI-2XX', 'YONLENDIRME-3XX', 'SUNUCU-HATASI-5XX', 'SONUC-YOK', 'SINIFLANAMADI'];
/** Katman kimliği: "API yanıtladı" (kanıtlı) · ölçülemeyen · yanıt yok. "API DEĞİL" diye bir sınıf YOKTUR (kanıt sınırı). */
const LAYER_IDS = ['UYGULAMA-API', 'OLCULEMEYEN', 'SONUC-YOK'];
const LAYER_WHYS = ['DEGISTIRME-KANITI', 'BASLIK-YOKLUGU-KANIT-DEGIL', 'WEB-YOLU', 'ON-UCUS', 'YOL-BELIRSIZ', 'KALIBRASYON-YOK', 'KALIBRASYON-GECERSIZ', 'YANSIMA', 'YABANCI-KIMLIK', 'AYIRT-ETMEYEN-GOZLEM', 'KANIT-KULLANILAMAZ', 'YANITSIZ'];
/** Katman doğrulaması neden sınıfı: ret satırında "yeni kimlik" gözlendi ama koşumun kalibrasyonu API'nin bu davranışını HİÇ göstermedi
 *  (değiştirme 0 / N) — alan "API yanıtladı" kesinliği bildirmez (OLCULEMEYEN). Kenar engelleme alanındaki FAIL bundan etkilenmez. */
const LAYER_UNSUPPORTED = 'YENI-KIMLIK-GOZLEMI-KALIBRASYON-DEGISTIRMEYI-GOSTERMEDI';
const ID_OBS = ['YOK', 'AYNEN', 'YENI-KIMLIK', 'BASKA-DEGER', 'SONUC-YOK'];
const ID_SIGNALS = ['YOK', 'DEGISTIRME', 'AYNEN-GERI-YAZMA', 'YANSIMA', 'YABANCI-KIMLIK', 'SONUC-YOK'];
const ERROR_CLASSES = ['AD-COZULMEDI', 'BAGLANTI', 'TLS', 'ZAMAN-ASIMI', 'DIGER'];
const VECTOR_CLASSES = ['BES-YONTEM', 'HEAD', 'OPTIONS', 'VARYANT'];
/** Durum kodu sınıfı (katman bu alana GİRMEZ). Azaltım işareti taşıyan 403 ayrı sınıftır: durum kodu ölçütünde 403'tür, kenar
 *  engelleme hükmünde olağan ret SAYILMAZ (tanınan sınama ya da tanınmayan işaret; tanınmayan sınıf değeri de ret sayılmaz). */
function outcomeOf(status, mark) {
  if (status === 0) return 'SONUC-YOK';
  if (status === 403) return mark === 'YOK' ? 'RET-403' : (mark === 'SINAMA' ? 'SINAMA-ISARETLI-403' : 'TANINMAYAN-AZALTIM-ISARETLI-403');
  if (status === 429) return 'HIZ-SINIRI-429';
  if (status >= 200 && status < 300) return 'REDDEDILMEDI-2XX';
  if (status >= 300 && status < 400) return 'YONLENDIRME-3XX';
  if (status >= 400 && status < 500) return 'DORTYUZ-403-DISI';
  if (status >= 500 && status < 600) return 'SUNUCU-HATASI-5XX';
  return 'SINIFLANAMADI';
}
/** Taşıma hatası SINIFI — yalnız hata kodundan; ileti metni (ana makine adı içerebilir) hiçbir yere yazılmaz. */
function errorClassOf(e) {
  const c = String((e && e.code) || '');
  if (c === 'D8_TIMEOUT' || c === 'ETIMEDOUT' || c === 'ESOCKETTIMEDOUT') return 'ZAMAN-ASIMI';
  if (/^(ENOTFOUND|EAI_[A-Z]+)$/.test(c)) return 'AD-COZULMEDI';
  if (/^(ERR_TLS_|ERR_SSL_|ERR_OSSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|HOSTNAME_MISMATCH)/.test(c) || c === 'EPROTO') return 'TLS';
  if (/^(ECONNREFUSED|ECONNRESET|ECONNABORTED|EHOSTUNREACH|EHOSTDOWN|ENETUNREACH|ENETDOWN|EADDRNOTAVAIL|EPIPE)$/.test(c)) return 'BAGLANTI';
  return 'DIGER';
}
function looseForms(pathname) {
  const forms = [pathname]; let p = pathname;
  for (let i = 0; i < 3; i++) { let d; try { d = decodeURIComponent(p); } catch (e) { break; } if (d === p) break; p = d; forms.push(p); }
  for (const f of forms.slice()) {
    const out = []; for (const s of f.split('/')) { if (s === '' || s === '.') continue; if (s === '..') { out.pop(); continue; } out.push(s); }
    forms.push('/' + out.join('/'));
  }
  return forms;
}
/** Yol sınıfı (kaynak okuması; başlıktaki "YOL SINIFI"). API-KESIN yalnız normalleştirilecek bir yanı olmayan `/api` önekli ham yoldur. */
function pathClassOf(rawPath) {
  const pathname = String(rawPath).split('?')[0];
  if (/^\/api(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)*\/?$/.test(pathname)) return 'API-KESIN';
  return looseForms(pathname).some((f) => /^\/+api(?:$|[^a-z0-9_.~-])/i.test(f)) ? 'API-BELIRSIZ' : 'ONEK-DISI';
}
function vectorClassOf(grp, method, pathClass, ifPassed) {
  if (grp === 'allow') return pathClass === 'ONEK-DISI' ? 'POZITIF-WEB' : 'POZITIF-API';
  if (method === 'HEAD') return 'HEAD';
  if (method === 'OPTIONS') return 'OPTIONS';
  return ifPassed === FX.evasion ? 'VARYANT' : 'BES-YONTEM';
}
/** Kimlik GÖZLEMİ: yanıttaki başlık değeri gönderilenle karşılaştırılır; değerin kendisi hiçbir yere yazılmaz. */
function idObsOf(measuredRow, got, sentId) {
  if (!measuredRow) return 'SONUC-YOK';
  if (got === undefined) return 'YOK';
  if (got === sentId) return 'AYNEN';
  return (typeof got === 'string' && RID_GENERATED_RX.test(got)) ? 'YENI-KIMLIK' : 'BASKA-DEGER';
}
/** Gözlemin ANLAMI = gözlem × gönderilen biçim. API yalnız iki şey üretebilir: GECERLI-BICIM → AYNEN (AYNEN-GERI-YAZMA) ve
 *  GECERSIZ-BICIM → YENI-KIMLIK (DEGISTIRME). GECERSIZ-BICIM → AYNEN yansıtan katmandır; kalan her değer yabancı kimliktir. */
function idSignalOf(idObs, form) {
  if (idObs === 'SONUC-YOK' || idObs === 'YOK') return idObs;
  if (idObs === 'AYNEN') return form === 'GECERLI-BICIM' ? 'AYNEN-GERI-YAZMA' : 'YANSIMA';
  return (idObs === 'YENI-KIMLIK' && form === 'GECERSIZ-BICIM') ? 'DEGISTIRME' : 'YABANCI-KIMLIK';
}
/** Başlıksız bölge: API'nin kimlik başlığı yazamayacağı yanıtlar (kaynak okuması) — API öneki DIŞINDAKİ yol ya da ön uçuş. */
function inHeaderlessZone(x) { return x.pathClass === 'ONEK-DISI' || x.method === 'OPTIONS'; }
/** Kalibrasyon (aynı ad, aynı koşum). GECERSIZ: yansıma ya da yabancı kimlik göstergesi var. VAR: gösterge yok + API pozitiflerinde
 *  iki davranış da tam + web pozitiflerinin tamamı ölçülmüş + başlıksız bölgede ölçülen yanıt var. YOK: diğer her durum.
 *  `apiEvidenceUsable`: DEGISTIRME gözlemi API'ye özgü sayılabilir mi — koşumda HİÇ yabancı kimlik göstergesi yok VE başlıksız
 *  bölgede ölçülen en az bir yanıt var (damgalayan katmanın arandığı yer). Eksik kalibrasyon ve yansıma bunu düşürmez. */
function calibrationOf(rows) {
  const m = rows.filter((x) => x.status !== 0); const zone = m.filter(inHeaderlessZone);
  const api = rows.filter((x) => x.vectorClass === 'POZITIF-API'); const web = rows.filter((x) => x.vectorClass === 'POZITIF-WEB');
  const apiG = api.filter((x) => x.sent.requestIdForm === 'GECERLI-BICIM'); const apiX = api.filter((x) => x.sent.requestIdForm === 'GECERSIZ-BICIM');
  const c = { apiPositives: api.length,
    apiWriteBackOf: apiG.length, apiWriteBack: apiG.filter((x) => x.idSignal === 'AYNEN-GERI-YAZMA').length,
    apiReplaceOf: apiX.length, apiReplace: apiX.filter((x) => x.idSignal === 'DEGISTIRME').length,
    webPositives: web.length, webMeasured: web.filter((x) => x.status !== 0).length,
    zoneRows: rows.filter(inHeaderlessZone).length, zoneMeasured: zone.length, zoneHeaderRows: zone.filter((x) => x.idObs !== 'YOK').length,
    reflectionRows: m.filter((x) => x.idSignal === 'YANSIMA' || (inHeaderlessZone(x) && x.idObs === 'AYNEN')).length,
    foreignIdRows: m.filter((x) => x.idSignal === 'YABANCI-KIMLIK' || (inHeaderlessZone(x) && x.idObs !== 'YOK' && x.idObs !== 'AYNEN')).length };
  const positive = c.apiWriteBackOf > 0 && c.apiWriteBack === c.apiWriteBackOf && c.apiReplaceOf > 0 && c.apiReplace === c.apiReplaceOf && c.webPositives > 0 && c.webMeasured === c.webPositives && c.zoneMeasured > 0;
  c.result = (c.reflectionRows > 0 || c.foreignIdRows > 0) ? 'GECERSIZ' : (positive ? 'VAR' : 'YOK');
  c.apiEvidenceUsable = c.foreignIdRows === 0 && c.zoneMeasured > 0;
  return c;
}
/** Katman kimliği — YALNIZ kimlik protokolünden (durum kodu, kalibrasyon, yöntem, yol sınıfı, kimlik anlamı); ipuçları buraya GİRMEZ.
 *  Kanıtın desteklemediği her durumda OLCULEMEYEN. Kimlik başlığı taşımayan hiçbir satır "API değil" diye sınıflanmaz: başlığın
 *  bulunmaması isteğin API'ye ulaşmadığını kanıtlamaz (kalibrasyon VAR olsa da) — neden `BASLIK-YOKLUGU-KANIT-DEGIL`. Dönüş: { id, why }. */
function layerIdOf(x, cal) {
  if (x.status === 0) return { id: 'SONUC-YOK', why: 'YANITSIZ' };
  const zone = inHeaderlessZone(x);
  if (x.idSignal === 'DEGISTIRME' && !zone) return cal.apiEvidenceUsable ? { id: 'UYGULAMA-API', why: 'DEGISTIRME-KANITI' } : { id: 'OLCULEMEYEN', why: 'KANIT-KULLANILAMAZ' };
  if (x.idSignal === 'YANSIMA' || (zone && x.idObs === 'AYNEN')) return { id: 'OLCULEMEYEN', why: 'YANSIMA' };
  if (x.idSignal === 'YABANCI-KIMLIK' || (zone && x.idObs !== 'YOK')) return { id: 'OLCULEMEYEN', why: 'YABANCI-KIMLIK' };
  if (x.idSignal === 'AYNEN-GERI-YAZMA') return { id: 'OLCULEMEYEN', why: 'AYIRT-ETMEYEN-GOZLEM' };
  if (x.idObs !== 'YOK') return { id: 'OLCULEMEYEN', why: 'KANIT-KULLANILAMAZ' };
  if (x.pathClass === 'ONEK-DISI') return { id: 'OLCULEMEYEN', why: 'WEB-YOLU' };
  if (x.method === 'OPTIONS') return { id: 'OLCULEMEYEN', why: 'ON-UCUS' };
  if (x.pathClass !== 'API-KESIN') return { id: 'OLCULEMEYEN', why: 'YOL-BELIRSIZ' };
  if (cal.result !== 'VAR') return { id: 'OLCULEMEYEN', why: 'KALIBRASYON-' + cal.result };
  return { id: 'OLCULEMEYEN', why: 'BASLIK-YOKLUGU-KANIT-DEGIL' };
}
/** DAR KABUL İSTİSNASI KARARI (başlıktaki "DAR KABUL İSTİSNASI"; owner kabul kuralıdır — teknik kanıt DEĞİLDİR). Girdi: satırlar (katman
 *  kimliği atanmış), yerel kenar gözlemi, sonda dışı ek kanıt beyanı / sonucu. Tanımlı satır listede ADI + YÖNTEMİ + HAM HEDEFİ ile
 *  aranır (sıra numarası KULLANILMAZ); TAM BİR satır eşleşmiyorsa istisna yoktur. Beş koşul AYRI AYRI kaydedilir; HEPSİ tutarsa o TEK
 *  satırın `acceptedClass` alanına sınıfın tam adı yazılır; aksi halde hiçbir satır işaretlenmez (eksik / çelişkili kanıt = istisna yok).
 *  Dönüş: kayıt bloğu (ham yol, yöntem ve yerel adres İÇERMEZ — adsız özete aynen yazılır). */
function narrowClassOf(rows, localObs, offprobe) {
  for (const x of rows) x.acceptedClass = null;
  const match = rows.filter((x) => x.group === 'deny' && x.name === NARROW.vectorName && x.method === NARROW.method && x.path === NARROW.rawTarget);
  const x = match.length === 1 ? match[0] : null; const e = x ? x.examinedResponse : null; const want = NARROW.examined;
  const local = { requested: !!(localObs && localObs.requested === true), status: localObs && localObs.requested === true ? localObs.status : null, idObs: localObs && localObs.requested === true ? localObs.idObs : null };
  const conditions = {
    definedVectorAndStatus400: !!x && x.status === want.status,
    // Özet HAM değerle karşılaştırılır: kanıttaki türetilmiş `bodySha256Match` alanı karara GİRMEZ (kesinleştirmede elle çevrilemez).
    examinedResponseMatches: !!x && !!e && e.contentTypeMatch === true && e.bodyBytes === want.bodyBytes && typeof e.bodySha256 === 'string' && e.bodySha256 === want.bodySha256,
    noApplicationReachEvidence: !!x && x.status !== 0 && x.idObs === 'YOK' && x.layerId !== 'UYGULAMA-API',
    localEdge403Observed: local.requested && local.status === 403 && local.idObs === 'YOK',
    offprobeEvidenceAcceptable: offprobe.declared === OFFPROBE_DECLARATIONS[0] || (offprobe.declared === OFFPROBE_DECLARATIONS[1] && offprobe.result === OFFPROBE_RESULTS[0]),
  };
  const whyNot = [];
  if (!x) whyNot.push(NARROW_WHYS[0]);
  if (!conditions.definedVectorAndStatus400) whyNot.push(NARROW_WHYS[1]);
  if (!conditions.examinedResponseMatches) whyNot.push(NARROW_WHYS[2]);
  if (!conditions.noApplicationReachEvidence) whyNot.push(NARROW_WHYS[3]);
  if (!conditions.localEdge403Observed) whyNot.push(NARROW_WHYS[4]);
  if (!conditions.offprobeEvidenceAcceptable) whyNot.push(offprobe.declared !== OFFPROBE_DECLARATIONS[1] ? NARROW_WHYS[5] : (offprobe.result === null ? NARROW_WHYS[6] : NARROW_WHYS[7]));
  // KESİNLEŞMEDİ: eksik olan YALNIZ sonda dışı ek kanıtın sonucudur (beyan "kullanılacak", sonuç henüz verilmedi). Sınıf UYGULANMAZ.
  const state = whyNot.length === 0 ? NARROW_STATES[0] : ((whyNot.length === 1 && whyNot[0] === NARROW_WHYS[6]) ? NARROW_STATES[2] : NARROW_STATES[1]);
  if (state === NARROW_STATES[0]) x.acceptedClass = NARROW.className;
  return { className: NARROW.className, notice: NARROW.notice, limits: NARROW.limits, ruleRevision: NARROW.ruleRevision, vectorId: NARROW.vectorId,
    state, appliedRows: rows.filter((y) => y.acceptedClass !== null).length, conditions, whyNot, offprobeEvidence: { declared: offprobe.declared, result: offprobe.result }, localEdge: local };
}
const countBy = (list, keys, f) => { const m = {}; for (const k of keys) m[k] = 0; for (const x of list) { const k = f(x); if (k !== null && k !== undefined) m[k] = (m[k] || 0) + 1; } return m; };
/** Ad düzeyi DÖRT ALAN. Nedenler ayrı ayrı toplanır. PASS ÜRETEBİLEN iki alan (durum kodu ölçütü · pozitif kontrol; `close`): FAIL
 *  nedeni varsa FAIL · yoksa ve OLCULEMEYEN nedeni varsa ya da PASS koşulu birebir sağlanmıyorsa OLCULEMEYEN · aksi PASS. PASS
 *  ÜRETMEYEN iki alan (kenar engelleme · katman doğrulaması; `closeNoPass`): FAIL nedeni varsa FAIL · aksi HER ZAMAN OLCULEMEYEN —
 *  başka neden yoksa ve "temiz gözlem" koşulu sağlanıyorsa verilen neden sınıfıyla, sağlanmıyorsa SINIFLANAMAYAN-DURUM ile.
 *  Hiçbir belirsiz durum PASS'a düşmez. */
function verdictsOf(rows, cal) {
  const deny = rows.filter((x) => x.group === 'deny'); const allow = rows.filter((x) => x.group === 'allow');
  const complete = deny.length === DENY.length && allow.length === ALLOW.length;
  const proven = (x) => x.layerId === 'UYGULAMA-API';
  const field = () => { const R = []; return { R,
    add: (value, reason, list) => { if (list.length) R.push({ value, reason, count: list.length, rows: list.map((x) => rows.indexOf(x)) }); },
    flag: (value, reason) => R.push({ value, reason, count: 1, rows: [] }),
    close: (passCondition) => { if (R.some((r) => r.value === 'FAIL')) return 'FAIL'; if (R.length === 0 && !passCondition) R.push({ value: 'OLCULEMEYEN', reason: 'SINIFLANAMAYAN-DURUM', count: 1, rows: [] }); return R.length ? 'OLCULEMEYEN' : 'PASS'; },
    closeNoPass: (cleanCondition, cleanReason) => { if (R.some((r) => r.value === 'FAIL')) return 'FAIL'; if (R.length === 0) R.push({ value: 'OLCULEMEYEN', reason: (cleanCondition && cleanReason) ? cleanReason : 'SINIFLANAMAYAN-DURUM', count: 1, rows: [] }); return 'OLCULEMEYEN'; } }; };

  // (a) HTTP / RET SONUCU — yalnız durum kodu ölçütü. DAR KABUL İSTİSNASI (owner kabul kuralı; teknik kanıt değildir): `acceptedClass`
  // taşıyan satır — ve yalnız tanımla (ad + yöntem + ham hedef + HTTP 400) BİREBİR eşleşiyorsa, en çok BİR satır — bu alanı tek başına
  // FAIL yapmaz. O satır "403" SAYILMAZ (sayılar `counts` alanında ayrı). `strict403` = istisnasız ölçüt (bütün ret vektörleri 403):
  // kenar engelleme alanı YALNIZ onu okur — dar sınıf o alana ve katman doğrulamasına hiçbir şey vermez.
  const H = field();
  const narrowRow = (x) => x.acceptedClass === NARROW.className && x.group === 'deny' && x.name === NARROW.vectorName && x.method === NARROW.method && x.path === NARROW.rawTarget && x.status === NARROW.examined.status;
  const narrow = deny.filter(narrowRow).length === 1 ? deny.filter(narrowRow) : [];
  const strict403 = complete && deny.every((x) => x.status === 403);
  H.add('FAIL', 'RET-VEKTORUNE-403-DISI-YANIT', deny.filter((x) => x.status !== 0 && x.status !== 403 && !narrow.includes(x)));
  H.add('OLCULEMEYEN', 'RET-VEKTORU-YANITSIZ', deny.filter((x) => x.status === 0));
  // Kapatıcı "FAIL nedeni yok + ÖLÇÜLEMEYEN nedeni yok + koşul tutuyor" dediğinde ve TAM BİR satır dar sınıftaysa değer `PASS` DEĞİL,
  // bu alanın tek ek değeridir (owner şartı: istisna uygulanan HTTP 400 satırı "HTTP / ret PASS" diye sunulmaz; 403 başarısı değildir).
  const closedH = H.close(complete && deny.every((x) => x.status === 403 || narrow.includes(x)));
  const httpReject = { value: (closedH === 'PASS' && narrow.length === 1) ? HTTP_OWNER_EXCEPTION : closedH, reasons: H.R,
    counts: { denyRows: deny.length, status403: deny.filter((x) => x.status === 403).length, narrowClass: narrow.length, otherAnswered: deny.filter((x) => x.status !== 0 && x.status !== 403 && !narrow.includes(x)).length, unanswered: deny.filter((x) => x.status === 0).length } };

  // POZİTİF KONTROL — izin verilen yollar; ret kurallarına karıştırılmaz. TEK KURAL — yalnız durum kodundan; gönderilen kimlik biçimine
  // ve satırın katman kimliğine BAĞLI DEĞİL; 403 İSTİSNASI YOK (owner kararı 2026-10-06): beklenen kod → uygun · yanıt alınamadı →
  // OLCULEMEYEN · beklenen dışındaki DOĞRULANMIŞ HER yanıt (2xx · 3xx · 403 dahil her 4xx · 429 · 5xx · sınıflanamayan kod) → FAIL
  // (ölçüt ihlali / bulgu adayı; nedeni ayrı değerlendirilir — ürün güvenlik kusuru hükmü değildir).
  const P = field();
  P.add('FAIL', 'POZITIF-BEKLENMEYEN-YANIT', allow.filter((x) => x.status !== 0 && !x.statusExpected));
  P.add('OLCULEMEYEN', 'POZITIF-YANITSIZ', allow.filter((x) => x.status === 0));
  const positiveControl = { value: P.close(complete && allow.every((x) => x.statusExpected)), reasons: P.R };

  // (b) KENAR ENGELLEME SONUCU — bu sondayla PASS ÜRETMEZ (kanıt sınırı): FAIL yoksa her zaman OLCULEMEYEN.
  const E = field();
  E.add('FAIL', 'API-YE-ULASTI-KANITLI', deny.filter(proven)); // API'nin 403'ü dahil: kenarda engellenmesi gereken istek API'ye ulaşmıştır
  E.add('FAIL', 'RET-VEKTORU-REDDEDILMEDI-2XX', deny.filter((x) => x.outcome === 'REDDEDILMEDI-2XX'));
  if (cal.result !== 'VAR') E.flag('OLCULEMEYEN', 'KALIBRASYON-' + cal.result);
  E.add('OLCULEMEYEN', 'SINAMA-ISARETLI-403', deny.filter((x) => x.outcome === 'SINAMA-ISARETLI-403'));
  E.add('OLCULEMEYEN', 'TANINMAYAN-AZALTIM-ISARETLI-403', deny.filter((x) => x.outcome === 'TANINMAYAN-AZALTIM-ISARETLI-403'));
  E.add('OLCULEMEYEN', 'AZALTIM-ISARETI-RET-403-DISINDA', rows.filter((x) => x.status !== 0 && x.mitigationMark !== 'YOK' && !(x.group === 'deny' && x.status === 403)));
  E.add('OLCULEMEYEN', 'POZITIF-BEKLENDIGI-GIBI-DEGIL', allow.filter((x) => !x.statusExpected));
  if (rows.length > 0 && rows.every((x) => x.status === 403)) E.flag('OLCULEMEYEN', 'TEKDUZE-403');
  E.add('OLCULEMEYEN', 'YANITSIZ-VEKTOR', rows.filter((x) => x.status === 0));
  if (!strict403) E.flag('OLCULEMEYEN', 'DURUM-KODU-OLCUTU-PASS-DEGIL'); // istisnasız ölçüt: dar sınıf uygulanan satır 403 almamıştır → neden kalır
  E.add('OLCULEMEYEN', 'RET-YANITINDA-KATMANI-BELIRSIZ-KIMLIK-BASLIGI', deny.filter((x) => x.status !== 0 && x.idObs !== 'YOK' && !proven(x)));
  // "Temiz gözlem": başka hiçbir ölçülemeyen nedeni yok. Bu, isteğin API'ye ulaşmadığının kanıtı DEĞİLDİR (sağlıklı kenar ile zincirde
  // başlığı silinmiş bir API reddi aynı görünür) → değer OLCULEMEYEN, neden EDGE_NO_INDEPENDENT_EVIDENCE.
  const edgeClean = complete && deny.every((x) => x.outcome === 'RET-403' && x.idObs === 'YOK') && rows.every((x) => x.mitigationMark === 'YOK') && allow.every((x) => x.statusExpected) && cal.result === 'VAR' && strict403;
  const edgeBlocking = { value: E.closeNoPass(edgeClean, EDGE_NO_INDEPENDENT_EVIDENCE), reasons: E.R, scope: KANIT_SINIRI };

  // (c) KATMAN DOĞRULAMASI — kanıtın desteklemediği katman kesinliği reddedilir; bu sondayla PASS ÜRETMEZ ("yanıtlayan katman API
  // değil" hiçbir satırda gösterilemez). Ret satırındaki "yeni kimlik" gözlemi bu alanda YALNIZ koşumun kendi kalibrasyonu API'nin o
  // davranışını (kabul edilmeyen biçim → yeni kimlik) en az bir kez gösterdiyse "API yanıtladı" kesinliği taşır; hiç göstermediyse
  // (değiştirme 0 / N) alan OLCULEMEYEN kalır ve satır kapsam sayısında "ölçülemez" sayılır. Kenar engelleme alanındaki FAIL bundan
  // ETKİLENMEZ (somut olumsuz kanıt silinmez).
  const L = field();
  const replaceShown = cal.apiReplace > 0; const apiRows = deny.filter(proven);
  const layerProven = replaceShown ? apiRows : []; const layerUnsupported = replaceShown ? [] : apiRows;
  const unverifiable = deny.filter((x) => !proven(x));
  L.add('FAIL', 'RET-SATIRINI-API-YANITLADI-KANITLI', layerProven);
  L.add('OLCULEMEYEN', LAYER_UNSUPPORTED, layerUnsupported);
  L.add('OLCULEMEYEN', 'KATMANI-DOGRULANAMAYAN-RET-SATIRI', unverifiable);
  const byReason = countBy(unverifiable, [], (x) => x.layerWhy); if (layerUnsupported.length) byReason[LAYER_UNSUPPORTED] = layerUnsupported.length;
  const layerVerification = { value: L.closeNoPass(false, null), reasons: L.R,
    coverage: { denyRows: deny.length, provenApi: layerProven.length, unverifiable: unverifiable.length + layerUnsupported.length, unverifiableByReason: byReason } };

  return { httpReject, edgeBlocking, layerVerification, positiveControl };
}
/** Metinde ana makine adının TAM dizgisi geçiyor mu (özet ve sözlük denetimi; büyük/küçük harf duyarsız). Parça yakalamaz. */
function containsName(text) { const t = String(text).toLowerCase(); return [HOST, ORIGIN_URL.host].some((n) => n && t.includes(String(n).toLowerCase())); }
/** Owner'ın ELLE verdiği etikette adın tam dizgisi ya da nokta ile ayrılmış bir ETİKETİ geçiyor mu. Karşılaştırmadan önce iki
 *  tarafta harf / rakam dışı karakterler atılır (noktası tireye çevrilmiş türev de yakalanır); 3 karakterden kısa parça aranmaz. */
function labelLeaksName(label) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); const t = norm(label);
  return [HOST, ORIGIN_URL.host].concat(HOST.split('.')).map(norm).filter((p) => p.length >= 3).some((p) => t.includes(p));
}
// Ön denetim (istek atılmadan): owner etiketi adı ya da bir parçasını, özetin sabit sözlüğü adın tam dizgisini içeriyorsa sonda koşmaz.
if (labelLeaksName(VANTAGE || '') || containsName([REVISION, ALIAS, VANTAGE || '', KANIT_SINIRI, EXIT_CODE_MAP, RID_HEADER, 'EXTACC-D8-STAFF-SURFACE-SUMMARY', SCOPE_AUTH.status, SCOPE_AUTH.fileIntegrity, SCOPE_AUTH.contentReview, SCOPE_ACCEPT_TEXT].concat(OUTCOMES, LAYER_IDS, LAYER_WHYS, ID_OBS, ID_SIGNALS, RID_FORMS, ERROR_CLASSES, VECTOR_CLASSES, FIELD_VALUES, SCOPE_REQUIRED_TYPES, [SCOPE_TUNNEL_TYPE, LAYER_UNSUPPORTED, EDGE_NO_INDEPENDENT_EVIDENCE, NARROW.className, NARROW.notice, NARROW.limits, NARROW.vectorId, NARROW.ruleRevision, OFFPROBE_NOT_DECLARED, FINALIZATION_RECORD_KIND, HTTP_OWNER_EXCEPTION, HTTP_OWNER_EXCEPTION_TEXT], NARROW_STATES, NARROW_WHYS, OFFPROBE_DECLARATIONS, OFFPROBE_RESULTS).join(' '))) reject('konum etiketi ana makine adını ya da bir etiketini içeriyor (ya da özet sözlüğü adı içeriyor) — adsız özet yazılamaz');
if (!PHONE && (fs.existsSync(OUT) || fs.existsSync(SUMMARY_OUT))) reject('kanıt ya da özet dosyası zaten var — başka bir koşumun / adın kanıtının üzerine yazılmaz');
if (MEASURING && fs.existsSync(INTERRUPT_OUT)) reject('kesinti kaydı dosyası zaten var — başka bir koşumun kaydının üzerine yazılmaz');

// ─── İKİ GÜVENCE: toplam süre sınırı + iptal dosyası (R09) ───────────────────────────────────────────────────────────────
/** Koşum durumu. Sayılar İSTEMCİ tarafındadır: `started` = sondanın başlattığı · `completed` = sondada SONUÇLANAN (yanıt tamamen alındı
 *  ya da taşıma hatası / boşta kalma sınırıyla bitti) · `aborted` = kesilme anında AKTİF olup sondanın kestiği istek. Sunucunun aldığı
 *  ya da işlediği istek sayısı DEĞİLDİR. */
const RUN = { counts: { external: { started: 0, completed: 0, aborted: 0 }, localEdge: { started: 0, completed: 0, aborted: 0 } }, active: null, activeKind: null, interrupted: null, timer: null, poll: null };
function stopGuards() { if (RUN.timer) { clearTimeout(RUN.timer); RUN.timer = null; } if (RUN.poll) { clearInterval(RUN.poll); RUN.poll = null; } }
/** KESİLME: aktif istek ve bağlantısı kesilir (açık tutulan bağlantılar dahil), yeni istek başlamaz (çağıranlar `RUN.interrupted`'a
 *  bakar), kesinti kaydı yazılır, süreç çıkış 6 ile sonlanır. Ham kanıt / özet YAZILMAZ; dört alan ve dar sınıf kararı ÜRETİLMEZ. */
function interrupt(reason) {
  if (RUN.interrupted) return;
  RUN.interrupted = { reason, at: new Date().toISOString() }; stopGuards();
  if (RUN.active) { RUN.counts[RUN.activeKind].aborted++; try { RUN.active.destroy(Object.assign(new Error('kesildi'), { code: 'D8_INTERRUPTED' })); } catch (e) { /* zaten kapanmış */ } }
  try { https.globalAgent.destroy(); http.globalAgent.destroy(); } catch (e) { /* yok */ }
  const c = RUN.counts; const localPlanned = !!LOCAL_EDGE_URL;
  const rec = { record: INTERRUPTION_RECORD_KIND, revision: REVISION, nameAlias: ALIAS, vantage: VANTAGE, probeSha256: SELF_SHA, vectorSetId: VECTOR_SET_ID,
    reason, startedAt: new Date(T_START_MS).toISOString(), interruptedAt: RUN.interrupted.at, elapsedMs: Date.parse(RUN.interrupted.at) - T_START_MS, maxTotalMs: MAX_TOTAL_MS, cancelPollMs: CANCEL_POLL_MS,
    clientRequests: { external: { planned: DENY.length + ALLOW.length, started: c.external.started, completed: c.external.completed, aborted: c.external.aborted }, localEdge: { planned: localPlanned ? 1 : 0, started: c.localEdge.started, completed: c.localEdge.completed, aborted: c.localEdge.aborted } },
    complete: false, evidenceWritten: false, fieldsProduced: false, exitCode: EXIT_INTERRUPTED,
    note: 'KESİNTİ KAYDI — koşum EKSİKTİR: ham kanıt ve adsız özet yazılmadı; dört alan ve dar sınıf kararı ÜRETİLMEDİ (eksik koşum hüküm üretmez; bu kayıt kanıt değildir ve kesinleştirilemez). ' + COUNTS_ARE_CLIENT_SIDE + ' Toplam süre sınırı sondanın sınırıdır (bütün dış istekler + yerel karşılaştırma isteği); sayaç okumaları / beklemeleri dahil bütün iş akışının süresi değildir. Süreç zorla öldürülürse bu kayıt yazılamaz; o durumda sayılar BİLİNMEZ (UNKNOWN). KISITLIDIR.' };
  const text = JSON.stringify(rec, null, 1); let written = 'YAZILDI';
  if (containsName(text)) written = 'YAZILMADI-AD-ICERIYOR'; else { try { fs.writeFileSync(INTERRUPT_OUT, text, { flag: 'wx' }); } catch (e) { written = 'YAZILAMADI'; } }
  // Üst çalıştırıcı ölmüş ve çıktı borusu kapanmış olabilir: yazma hatası süreci "beklenmeyen durma"ya çevirmesin.
  process.stdout.on('error', () => {}); process.stderr.on('error', () => {});
  console.log(`\nD-8 SONDA ${REVISION} · ${ALIAS} · KOŞUM KESİLDİ (${reason}) — EKSİK KOŞUM: ham kanıt ve özet YAZILMADI; alan / sınıf üretilmedi`);
  console.log(`  istemci tarafında: dış istek başlatılan ${c.external.started} · sonuçlanan ${c.external.completed} · kesilen ${c.external.aborted} (planlanan ${DENY.length + ALLOW.length}) · yerel karşılaştırma başlatılan ${c.localEdge.started} · sonuçlanan ${c.localEdge.completed} · kesilen ${c.localEdge.aborted} (planlanan ${localPlanned ? 1 : 0})`);
  console.log('  ' + COUNTS_ARE_CLIENT_SIDE);
  console.log(`D8-AD=${ALIAS}\nD8-KESILDI=${reason}\nD8-KESINTI-KAYDI=${written}\nD8-ISTEMCI-DIS-BASLATILAN=${c.external.started}\nD8-ISTEMCI-DIS-SONUCLANAN=${c.external.completed}\nD8-ISTEMCI-YEREL-BASLATILAN=${c.localEdge.started}\nD8-CIKIS=${EXIT_INTERRUPTED}`);
  // Çıkış kodu olay döngüsü boşalınca verilir (son satırlar kesilmesin); bir tutamaç takılı kalırsa 500 ms sonra zorla çıkılır.
  process.exitCode = EXIT_INTERRUPTED; setTimeout(() => process.exit(EXIT_INTERRUPTED), 500).unref();
}
/** Her istekten ÖNCE: kesildiyse, süre dolduysa ya da iptal dosyası varsa yeni istek BAŞLAMAZ (true döner). */
function mustStop() {
  if (RUN.interrupted) return true;
  if (Date.now() >= DEADLINE_MS) { interrupt(INTERRUPT_REASONS[0]); return true; }
  if (fs.existsSync(CANCEL_FILE)) { interrupt(INTERRUPT_REASONS[1]); return true; }
  return false;
}
/** İki güvenceyi başlatır: toplam süre zamanlayıcısı (bitiş anı süreç başından) + iptal dosyası yoklaması (aktif istek sırasında da). */
function startGuards() {
  RUN.timer = setTimeout(() => interrupt(INTERRUPT_REASONS[0]), Math.max(0, DEADLINE_MS - Date.now()));
  RUN.poll = setInterval(() => { if (fs.existsSync(CANCEL_FILE)) interrupt(INTERRUPT_REASONS[1]); }, CANCEL_POLL_MS);
}

/** Kimlik taşıyabilecek istek başlıkları (ölçüm: gönderilen başlık adları bunlarla karşılaştırılır). */
const CREDENTIAL_HEADERS = /^(authorization|cookie|x-api-key|proxy-authorization)$/i;
/** Ham request-target korunur: URL string DEĞİL, seçenek nesnesi (path olduğu gibi gider).
 *  Dönüşte `sent` = gerçekten gönderilen başlık adları + gövde (POST/PUT/PATCH '{}', diğerleri '') + gönderilen istek kimliği ve biçimi;
 *  `bodyBytes` = alınan gövdenin TOPLAM bayt sayısı; `bodySha256` = gövdenin SHA-256'sı (yalnız gövdenin tamamı tutulduysa — 4096
 *  bayta kadar; aksi null). `localEdge` verilirse (yalnız yerel kenar karşılaştırması) AYNI başlıklar — Host = dış adın ana makinesi —
 *  ve AYNI ham yol, geri döngüdeki yerel kenara düz http ile gider; yeniden deneme / yönlendirme takibi yoktur. */
function req(method, path, form, localEdge) {
  const requestId = newRequestId(form);
  const headers = { host: ORIGIN_URL.host, 'user-agent': 'extacc-d8-probe', 'content-type': 'application/json', accept: '*/*', [RID_HEADER]: requestId };
  const body = (method === 'POST' || method === 'PUT' || method === 'PATCH') ? '{}' : '';
  const sent = { headerNames: Object.keys(headers), body, requestId, requestIdForm: form };
  const kind = localEdge ? 'localEdge' : 'external';
  return new Promise((resolve) => {
    // İstemci sayıları (R09): `started` istek nesnesi kurulurken · `completed` istek sondada SONUÇLANINCA (bir kez; kesilen istek sayılmaz).
    let settled = false; const settle = (v) => { if (settled) return; settled = true; if (RUN.active === r) { RUN.active = null; RUN.activeKind = null; } if (!RUN.interrupted) RUN.counts[kind].completed++; resolve(v); };
    const onResponse = (res) => {
      const kept = []; let keptBytes = 0; let total = 0; res.on('data', (c) => { total += c.length; if (keptBytes < 4096) { kept.push(c); keptBytes += c.length; } });
      const done = () => { const buf = Buffer.concat(kept); settle({ status: res.statusCode, body: buf.toString('utf8'), bodyBytes: total, bodySha256: buf.length === total ? crypto.createHash('sha256').update(buf).digest('hex').toUpperCase() : null, headers: res.headers, sent }); };
      res.on('end', done); res.on('close', done); res.on('error', done);
    };
    const r = localEdge ? http.request({ host: localEdge.hostname, port: Number(localEdge.port), path, method, headers, timeout: TIMEOUT_MS, agent: false }, onResponse)
      : https.request({ host: HOST, port: PORT, path, method, servername: HOST, headers, timeout: TIMEOUT_MS }, onResponse);
    RUN.counts[kind].started++; RUN.active = r; RUN.activeKind = kind; // kesilme anında bu istek ve bağlantısı yok edilir
    r.on('timeout', () => r.destroy(Object.assign(new Error('zaman aşımı'), { code: 'D8_TIMEOUT' })));
    r.on('error', (e) => settle({ status: 0, errorClass: errorClassOf(e), sent }));
    if (body) r.write(body);
    r.end();
  });
}
/** Server başlığından yalnız ürün ADI (sürüm/ek bilgi atılır): 'Caddy', 'cloudflare', 'nginx', ''. */
function serverName(h) { const v = String((h && h.server) || '').trim(); return v.split(/[\s/;,]/)[0].slice(0, 20); }
/** Katman ipuçları AYRI alanlarda; hiçbiri katman kimliği DEĞİLDİR (yalnız kısıtlı ham kanıtta; adsız özete girmez). */
function hintsOf(r) {
  const h = r.headers || {}; const body = String(r.body || '');
  return { bodyEmpty: body.trim() === '', providerSignature: /cloudflare|error code:\s*10\d\d|cf-error/i.test(body),
    edgeHeaderPresent: !!h['cf-ray'], serverHeaderValue: serverName(h), cfMitigatedPresent: h[MITIGATION_MARK.header] !== undefined };
}
/** Katman İPUCU (kanıt değil): Server 'Caddy' → 'caddy' · sağlayıcı gövde imzası + sağlayıcı Server → 'edge-provider' · aksi null. */
function layerHintOf(r, hints) {
  if (r.status !== 403) return null;
  const s = hints.serverHeaderValue.toLowerCase();
  if (s === 'caddy') return 'caddy';
  if (hints.providerSignature && s === 'cloudflare') return 'edge-provider';
  return null;
}
const row = (grp, name, method, path, r, expect, ifPassed) => {
  const measuredRow = r.status !== 0; const hints = measuredRow ? hintsOf(r) : null; const pathClass = pathClassOf(path);
  const idObs = idObsOf(measuredRow, measuredRow ? (r.headers || {})[RID_HEADER] : undefined, r.sent.requestId);
  const mitigationMark = measuredRow ? mitigationMarkOf(r.headers) : null; // sınıf (YOK / SINAMA / TANINMAYAN); başlığın değeri yazılmaz
  return { group: grp, vectorClass: vectorClassOf(grp, method, pathClass, ifPassed), name, method, path, pathClass, status: r.status, expected: expect,
    statusExpected: measuredRow && expect.includes(r.status), outcome: outcomeOf(r.status, mitigationMark), mitigationMark, errorClass: r.errorClass || null,
    idObs, idSignal: idSignalOf(idObs, r.sent.requestIdForm), layerId: null, layerWhy: null,
    // Dar kabul istisnası: `acceptedClass` yalnız `narrowClassOf` tarafından, yalnız tanımlı TEK satıra yazılır (aksi null);
    // `examinedResponse` yalnız tanımlı vektörün (ad + yöntem + ham hedef) ölçülen yanıtı için doldurulur.
    acceptedClass: null, examinedResponse: (measuredRow && grp === 'deny' && name === NARROW.vectorName && method === NARROW.method && path === NARROW.rawTarget) ? examinedResponseOf(r) : null,
    layerHint: hints ? layerHintOf(r, hints) : null, hints, ifPassed: grp === 'deny' ? ifPassed : null, sent: r.sent };
};
/** İncelenmiş hata yanıtıyla karşılaştırma (yalnız tanımlı vektörün yanıtı): içerik türü TAM olarak aynı mı · gövdenin toplam bayt
 *  sayısı · gövdenin SHA-256'sı aynı mı (gövdenin tamamı tutulamadıysa özet yoktur → eşleşme yok). Server başlığı / imza buraya GİRMEZ. */
function examinedResponseOf(r) {
  const ct = (r.headers || {})['content-type'];
  return { contentTypeMatch: typeof ct === 'string' && ct.trim().toLowerCase() === NARROW.examined.contentType, bodyBytes: r.bodyBytes, bodySha256: r.bodySha256, bodySha256Match: r.bodySha256 !== null && r.bodySha256 === NARROW.examined.bodySha256 };
}
/** Ölçümün ORTAK değerlendirmesi — ölçüm çağrısı ve kesinleştirme adımı AYNI işlevi kullanır (çıkış kodu tek yerde türer): kalibrasyon
 *  → satır katman kimlikleri → dar kabul istisnası kararı → dört alan → çıkış kodu. Hepsi satırlardan türetilir. */
function evaluate(rows, localObs, offprobe) {
  const calibration = calibrationOf(rows);
  for (const x of rows) { const l = layerIdOf(x, calibration); x.layerId = l.id; x.layerWhy = l.why; }
  const narrowClass = narrowClassOf(rows, localObs, offprobe);
  const verdict = verdictsOf(rows, calibration); const exitCode = exitCodeOf(verdict);
  return { calibration, narrowClass, verdict, exitCode };
}
const stripField = (f) => Object.assign({}, f, { reasons: f.reasons.map((r) => ({ value: r.value, reason: r.reason, count: r.count })) });
const stripVerdict = (v) => ({ httpReject: stripField(v.httpReject), edgeBlocking: stripField(v.edgeBlocking), layerVerification: stripField(v.layerVerification), positiveControl: stripField(v.positiveControl) });
/** Dar sınıfın çıktı satırları (ölçüm ve kesinleştirme aynı metni yazar): durum + nedenler; uygulandıysa sınıfın TAM adı ve uyarı cümlesi. */
function printNarrow(n) {
  console.log(`DAR SINIF (owner kabul kuralı ${n.ruleRevision}) : ${n.state}${n.whyNot.length ? ' — ' + n.whyNot.join(' · ') : ''} · vektör ${n.vectorId} · yerel kenar ${n.localEdge.requested ? 'HTTP ' + n.localEdge.status : 'gözlemi yok'} · sonda dışı ek kanıt beyanı ${n.offprobeEvidence.declared}${n.offprobeEvidence.result ? ' → ' + n.offprobeEvidence.result : ''}`);
  if (n.state === NARROW_STATES[0]) console.log(`  sınıf: "${n.className}" — ${n.notice} (${n.limits})\n  HTTP / ret alanı ${HTTP_OWNER_EXCEPTION}: ${HTTP_OWNER_EXCEPTION_TEXT}`);
  if (n.state === NARROW_STATES[2]) console.log('  sınıf UYGULANMADI: sonda dışı ek kanıtın sonucu verilmeden kesinleşmez (--finalize adımı); bu çıktıdaki alanlar istisnasız kuralla hesaplanmıştır');
}

(async () => {
  if (PHONE) {
    const list = ['/auth/login', '/', '/api/auth/me', '/api/portal/admin/documents/pending', '/api/cases'];
    console.log(`TELEFON — ${ALIAS} (Wi-Fi KAPALI, mobil veri, gizli sekme) — her adres için ne gördüğünüzü not edin (E = hata/erişim engellendi · S = sayfa/veri açıldı · ?):`);
    list.forEach((p, i) => console.log(`  ${i + 1}. ${ORIGIN}${p}`));
    console.log('Beyan makine ölçümü DEĞİLDİR ve yalnız bu ad içindir; koşucu kanıtı ayrı dosyadadır. Bu çağrı istek atmaz.');
    return;
  }
  if (FINALIZING) {
    // KESİNLEŞTİRME (çevrimdışı ikinci adım; İSTEK ATMAZ): `KULLANILACAK` beyanlı kanıt, owner'ın verdiği sonda dışı ek kanıt sonucuyla
    // yeniden değerlendirilir. Kanıttaki eski hükme güvenilmez: kalibrasyon, katman kimliği, dar sınıf kararı ve dört alan satırlardan
    // yeniden türetilir. Kaynak kanıtın üzerine yazılmaz; ayrı bir kayıt yazılır (ana makine adı İÇERMEZ).
    const refuse = (why) => reject('KESİNLEŞTİRME YAPILMADI — neden=' + why);
    let srcBuf = null; let ev = null; try { srcBuf = fs.readFileSync(FINALIZE); } catch (e) { refuse('KANIT-OKUNAMADI'); }
    // KAYITLI ÖZET KAPISI — içerik yorumlanmadan ÖNCE: dosyanın gerçek SHA-256'sı, koşum sonunda ayrı kayda alınmış ve bu çağrıya
    // VERİLEN değerle karşılaştırılır. "Beklenen" değer dosyadan türetilmez. GÜVEN SINIRI: dosya ile ayrı kayıt birlikte ve tutarlı
    // değiştirilirse bu karşılaştırma tutar ve sonda bunu ayırt edemez; korunma ayrı kaydın bağımsız bir yerde tutulmasındadır.
    const registeredSha = EVIDENCE_SHA.toUpperCase(); const computedSha = crypto.createHash('sha256').update(srcBuf).digest('hex').toUpperCase();
    if (computedSha !== registeredSha) refuse('KANIT-OZETI-KAYITLA-UYUSMUYOR');
    try { ev = JSON.parse(srcBuf.toString('utf8')); } catch (e) { refuse('KANIT-OKUNAMADI'); }
    const plan = DENY.map((v) => `deny|${v[0]}|${v[1]}|${v[2]}`).concat(ALLOW.map((v) => `allow|${v[0]}|${v[1]}|${v[2]}`));
    if (!ev || typeof ev !== 'object' || Array.isArray(ev) || ev.record !== 'EXTACC-D8-STAFF-SURFACE-PROBE' || !Array.isArray(ev.rows) || !ev.nameVerdict) refuse('KANIT-BICIMI-GECERSIZ');
    if (ev.revision !== REVISION || ev.probeSha256 !== SELF_SHA || ev.vectorSetId !== VECTOR_SET_ID) refuse('KANIT-BU-SONDA-BAYTLARIYLA-YAZILMAMIS'); // geçmiş koşuma geriye dönük uygulanmaz
    if (ev.nameAlias !== ALIAS || ev.originHost !== ORIGIN_URL.host || ev.vantage !== VANTAGE) refuse('KANIT-BU-AD-ICIN-DEGIL');
    if (ev.rows.length !== plan.length || !ev.rows.every((x, i) => x && typeof x === 'object' && `${x.group}|${x.name}|${x.method}|${x.path}` === plan[i])) refuse('KANIT-SATIRLARI-VEKTOR-LISTESIYLE-AYNI-DEGIL');
    const declared = ev.malformedRejectClass && ev.malformedRejectClass.offprobeEvidence;
    if (!declared || declared.declared !== OFFPROBE_DECLARATIONS[1] || declared.result !== null) refuse('KANITTA-KESINLESTIRILECEK-BEYAN-YOK');
    const valuesOf = (v) => [v.httpReject, v.edgeBlocking, v.layerVerification, v.positiveControl].map((f) => (f ? f.value : null)).join('/');
    const before = evaluate(ev.rows, ev.localEdgeComparison, { declared: OFFPROBE_DECLARATIONS[1], result: null });
    // TUTARLILIK: satırlardan yeniden türetilen dört alan, çıkış kodu VE beş koşul kanıttaki kayıtla aynı olmalı; tanımlı satırın
    // türetilmiş "özet eşleşti" alanı ham özetle çelişmemeli (yalnız türetilmiş alanı elle çevrilmiş kanıt kabul edilmez).
    const derivedOk = ev.rows.every((x) => !x.examinedResponse || x.examinedResponse.bodySha256Match === (typeof x.examinedResponse.bodySha256 === 'string' && x.examinedResponse.bodySha256 === NARROW.examined.bodySha256));
    if (valuesOf(before.verdict) !== valuesOf(ev.nameVerdict) || before.exitCode !== ev.exitCode || !derivedOk || JSON.stringify(before.narrowClass.conditions) !== JSON.stringify(ev.malformedRejectClass.conditions)) refuse('KANIT-KENDI-ICINDE-TUTARSIZ');
    const F = evaluate(ev.rows, ev.localEdgeComparison, { declared: OFFPROBE_DECLARATIONS[1], result: OFFPROBE_RESULT });
    const rec = { record: FINALIZATION_RECORD_KIND, revision: REVISION, nameAlias: ALIAS, vantage: VANTAGE, probeSha256: SELF_SHA, vectorSetId: VECTOR_SET_ID,
      registeredEvidenceSha256: registeredSha, sourceEvidenceSha256: computedSha, sourceNameVerdictValues: valuesOf(ev.nameVerdict), sourceExitCode: ev.exitCode, requestsSent: 0,
      malformedRejectClass: F.narrowClass, nameVerdict: stripVerdict(F.verdict), exitCodeMap: EXIT_CODE_MAP, exitCode: F.exitCode, finalizedAt: new Date().toISOString(),
      note: 'KESİNLEŞTİRME KAYDI (çevrimdışı; istek atılmadı). Sonda dışı ek kanıtın sonucu owner BEYANIDIR — sonda onu ölçmez. Dört alan kaynak kanıttaki satırlardan yeniden türetildi; dar sınıf yalnız beş koşulun hepsi tutuyorsa UYGULANDI; uygulandıysa nameVerdict.httpReject.value PASS DEĞİL ' + HTTP_OWNER_EXCEPTION + ' değerini alır (' + HTTP_OWNER_EXCEPTION_TEXT + '). ' + NARROW.notice + ' Sınıf: ' + NARROW.limits + '. Kenar engelleme ve katman doğrulaması alanları bu adımla değişmez; hiçbir çıkış kodu kapanış değildir. Bu kayıt kaynak kanıtın yerine geçmez; KISITLIDIR. KAYITLI ÖZET KAPISI: registeredEvidenceSha256 koşum sonunda ayrı kayda alınmış ve bu adıma VERİLEN değerdir; sourceEvidenceSha256 sondanın kanıt dosyasından hesapladığı değerdir; ikisi eşit olduğu için adım yürüdü (eşit değilse kesinleştirme yapılmaz). Güven sınırı: kanıt dosyası ile ayrı kayıt birlikte ve tutarlı değiştirilirse sonda bunu ayırt edemez; korunma ayrı kaydın kanıt dizininin dışında, bağımsız bir yerde tutulmasına dayanır.' };
    const text = JSON.stringify(rec, null, 1);
    if (containsName(text)) { console.error('KESİNLEŞTİRME KAYDI YAZILMADI: kayıt içinde ana makine adı geçiyor'); process.exit(7); }
    try { fs.writeFileSync(OUT, text, { flag: 'wx' }); } catch (e) { console.error('KESİNLEŞTİRME KAYDI YAZILAMADI'); process.exit(7); }
    console.log(`D-8 KESİNLEŞTİRME ${REVISION} · ${ALIAS} · istek ATILMADI · kaynak kanıtın alanları ${rec.sourceNameVerdictValues} (çıkış ${ev.exitCode})`);
    printNarrow(F.narrowClass);
    console.log(`D8-AD=${ALIAS}\nD8-KESINLESTIRME=YAPILDI\nD8-KANIT-OZETI=KAYITLI-DEGERLE-AYNI\nD8-DAR-SINIF=${F.narrowClass.state}\nD8-HTTP-RET=${F.verdict.httpReject.value}\nD8-KENAR-ENGELLEME=${F.verdict.edgeBlocking.value}\nD8-KATMAN-DOGRULAMA=${F.verdict.layerVerification.value}\nD8-POZITIF-KONTROL=${F.verdict.positiveControl.value}\nD8-CIKIS=${F.exitCode}`);
    process.exitCode = F.exitCode;
    return;
  }
  const t0 = new Date().toISOString(); const rows = [];
  // İKİ GÜVENCE (R09): önce bakılır (önceden var olan iptal dosyası → 0 istek), sonra zamanlayıcı ve yoklama başlar. Her istekten ÖNCE
  // `mustStop()`; her isteğin ARDINDAN `RUN.interrupted` — kesildiyse yeni istek başlamaz ve kanıt / özet YAZILMAZ (bu işlevden çıkılır).
  if (mustStop()) return;
  startGuards();
  for (const [name, method, path, fx] of DENY) { if (mustStop()) return; const r = await req(method, path, ridFormOf('deny', 0)); if (RUN.interrupted) return; rows.push(row('deny', name, method, path, r, [403], fx)); }
  const ordinal = { 'ONEK-DISI': 0, API: 0 }; // pozitifler: kendi sınıfı (web / API) içindeki sıra
  for (const [name, method, path, exp] of ALLOW) { if (mustStop()) return; const k = pathClassOf(path) === 'ONEK-DISI' ? 'ONEK-DISI' : 'API'; const r = await req(method, path, ridFormOf('allow', ordinal[k]++)); if (RUN.interrupted) return; rows.push(row('allow', name, method, path, r, exp, null)); }
  // YEREL KENAR KARŞILAŞTIRMASI (isteğe bağlı; dar kabul istisnasının 4. koşulu): dış isteklerin HEPSİNDEN SONRA, yalnız tanımlı TEK
  // vektör, AYNI ham yol ve AYNI Host başlığıyla, BİR kez. Tanım ret listesinde tam bir vektörle eşleşmiyorsa istek ATILMAZ.
  let localObs = { requested: false };
  if (LOCAL_EDGE_URL && DENY.filter((v) => v[0] === NARROW.vectorName && v[1] === NARROW.method && v[2] === NARROW.rawTarget).length === 1) {
    if (mustStop()) return; // süre dolduysa / iptal edildiyse yerel karşılaştırma isteği de BAŞLAMAZ
    const lr = await req(NARROW.method, NARROW.rawTarget, ridFormOf('deny', 0), LOCAL_EDGE_URL); if (RUN.interrupted) return; const lm = lr.status !== 0;
    localObs = { requested: true, targetClass: LOCAL_EDGE_CLASS, port: Number(LOCAL_EDGE_URL.port), vectorId: NARROW.vectorId, method: NARROW.method, rawTarget: NARROW.rawTarget, hostHeader: 'DIS-ADIN-ANA-MAKINESI',
      status: lr.status, errorClass: lr.errorClass || null, idObs: idObsOf(lm, lm ? (lr.headers || {})[RID_HEADER] : undefined, lr.sent.requestId), bodyBytes: lm ? lr.bodyBytes : null, sent: lr.sent };
  }
  // Son istek sonuçlandı: iki güvence burada KALKAR (toplam süre sınırı istekleri kapsar; kanıt yazımı kapsam dışıdır — yerel, eşzamanlı
  // ve kısadır). Bütün istekleri sonuçlanmış bir koşum eksik sayılmaz.
  stopGuards(); const requestPhaseMs = Date.now() - T_START_MS;
  const { calibration, narrowClass, verdict, exitCode } = evaluate(rows, localObs, OFFPROBE_STATE);
  const deny = rows.filter((x) => x.group === 'deny'); const allow = rows.filter((x) => x.group === 'allow');
  const coverage = {}; for (const k of VECTOR_CLASSES) { const v = deny.filter((x) => x.vectorClass === k); coverage[k] = { of: v.length, measured: v.filter((x) => x.status !== 0).length, rejected403: v.filter((x) => x.outcome === 'RET-403').length }; }
  const outcomeCounts = { deny: countBy(deny, OUTCOMES, (x) => x.outcome), allow: countBy(allow, OUTCOMES, (x) => x.outcome) };
  const idSignalCounts = { deny: countBy(deny, ID_SIGNALS, (x) => x.idSignal), allow: countBy(allow, ID_SIGNALS, (x) => x.idSignal) };
  const layerCounts = { deny: countBy(deny, LAYER_IDS, (x) => x.layerId), allow: countBy(allow, LAYER_IDS, (x) => x.layerId) };
  const errorClassCounts = countBy(rows.filter((x) => x.status === 0), ERROR_CLASSES, (x) => x.errorClass);
  // İPUCU dağılımları (kanıt değil; yalnız ham kanıtta): 403 ret satırlarında Server / gövde imzası ipucu + dolu gövdeli, sağlayıcı imzasız 403 sayısı.
  const denyLayerHints = deny.filter((x) => x.status === 403).reduce((m, x) => { const k = x.layerHint || 'none'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const hintFullBody403 = rows.filter((x) => x.status === 403 && x.hints && !x.hints.bodyEmpty && !x.hints.providerSignature).length;
  // ÖLÇÜM (istek döngüsünden türetilir): kimlik başlığı gönderilen istek sayısı; '' veya '{}' dışı gövdeli istek sayısı; gövde dağılımı.
  // Yerel kenar karşılaştırma isteği (atıldıysa) TOPLAM istek sayısına DAHİLDİR; dış ve yerel sayılar ayrıca ayrı yazılır.
  const sentAll = rows.map((x) => x.sent).concat(localObs.requested ? [localObs.sent] : []); const hasCredential = (s) => s.headerNames.some((h) => CREDENTIAL_HEADERS.test(h));
  const bodies = sentAll.reduce((m, s) => { const k = s.body === '' ? 'empty' : (s.body === '{}' ? 'emptyJson' : 'other'); m[k] = (m[k] || 0) + 1; return m; }, {});
  const measured = { requestCount: sentAll.length, externalRequests: rows.length, localEdgeRequests: sentAll.length - rows.length,
    credentialHeaderRequests: rows.filter((x) => hasCredential(x.sent)).length + (localObs.requested && hasCredential(localObs.sent) ? 1 : 0),
    nonEmptyBodyRequests: bodies.other || 0, bodies };
  const requestProfile = { headerNames: Array.from(new Set(sentAll.reduce((a, s) => a.concat(s.headerNames), []))), userAgentClass: 'extacc-d8-probe',
    requestCount: measured.requestCount, externalRequests: measured.externalRequests, localEdgeRequests: measured.localEdgeRequests, credentialHeaderRequests: measured.credentialHeaderRequests, nonEmptyBodyRequests: measured.nonEmptyBodyRequests,
    distinctRequestIds: new Set(sentAll.map((s) => s.requestId)).size,
    requestIdForms: { deny: countBy(deny, RID_FORMS, (x) => x.sent.requestIdForm), allowApi: countBy(allow.filter((x) => x.vectorClass === 'POZITIF-API'), RID_FORMS, (x) => x.sent.requestIdForm), allowWeb: countBy(allow.filter((x) => x.vectorClass === 'POZITIF-WEB'), RID_FORMS, (x) => x.sent.requestIdForm) } };
  const finishedAt = new Date().toISOString();
  // ADSIZ ÖZET (KISITLI; depoya konmaz). Ad, hata metni, yönlendirme hedefi, yol düzeyinde bulgu adayı, kanıt dosyası yolu / özeti, inceleyen İÇERMEZ.
  // Public satıra bu özetten YALNIZ dört alanın değeri ve ad kimliği aktarılır (paket belgesi §1b). Dar kabul istisnası kaydı
  // (`malformedRejectClass`) özete ham yol / yöntem / yerel adres OLMADAN yazılır (yalnız vektör kimliği, durum, koşullar, nedenler).
  const summary = { record: 'EXTACC-D8-STAFF-SURFACE-SUMMARY', revision: REVISION, nameAlias: ALIAS, vantage: VANTAGE, probeSha256: SELF_SHA, vectorSetId: VECTOR_SET_ID,
    scopeAuthorization: SCOPE_AUTH, vectorCounts: { deny: DENY.length, allow: ALLOW.length, total: DENY.length + ALLOW.length }, requestProfile, coverage, outcomeCounts, errorClassCounts, idSignalCounts, layerCounts, calibration,
    nameVerdict: stripVerdict(verdict), malformedRejectClass: narrowClass,
    exitCodeMap: EXIT_CODE_MAP, startedAt: t0, finishedAt, exitCode };
  const summaryText = JSON.stringify(summary, null, 1);
  const summaryRefused = containsName(summaryText);
  const summarySha256 = summaryRefused ? null : crypto.createHash('sha256').update(Buffer.from(summaryText, 'utf8')).digest('hex').toUpperCase();
  const failRows = new Set(); for (const f of [verdict.httpReject, verdict.edgeBlocking, verdict.layerVerification, verdict.positiveControl]) for (const r of f.reasons) if (r.value === 'FAIL') for (const i of r.rows) failRows.add(i);
  const findings = rows.filter((x, i) => failRows.has(i));
  const out = { record: 'EXTACC-D8-STAFF-SURFACE-PROBE', revision: REVISION, nameAlias: ALIAS, originHost: ORIGIN_URL.host, vantage: VANTAGE, probeSha256: SELF_SHA, vectorSetId: VECTOR_SET_ID,
    scopeAuthorization: SCOPE_AUTH, startedAt: t0, finishedAt, deny: DENY.length, allow: ALLOW.length, requestProfile, calibration, coverage, outcomeCounts, errorClassCounts, idSignalCounts, layerCounts,
    nameVerdict: verdict, exitCodeMap: EXIT_CODE_MAP, exitCode, summary: { written: false, sha256: null },
    // Dar kabul istisnası: özetteki kayıt + (yalnız ham kanıtta) tanım ve tanımlı satırın gözlemi. Yerel kenar isteği AYRI kayıttır.
    malformedRejectClass: Object.assign({}, narrowClass, { definition: { vectorName: NARROW.vectorName, method: NARROW.method, rawTarget: NARROW.rawTarget, examined: NARROW.examined },
      observed: rows.filter((x) => x.examinedResponse !== null).map((x) => ({ status: x.status, idObs: x.idObs, layerId: x.layerId, examinedResponse: x.examinedResponse }))[0] || null }),
    localEdgeComparison: localObs,
    findings: findings.map((x) => `${x.group} ${x.method} ${x.path} → HTTP ${x.status} [${x.outcome} · ${x.idSignal} · ${x.layerId}]`), unmeasured: rows.filter((x) => x.status === 0).length,
    hintsOnly: { denyLayerHints, fullBody403WithoutProviderSignature: hintFullBody403 }, rows,
    design: { credentialsSent: false, writesAttempted: false, note: 'betik TASARIM BEYANI (ölçüm değil): vektör listesinde kimlik bilgisi ve yazma verisi yoktur; ölçüm `measured` alanındadır' },
    measured,
    // İki güvence (R09; yalnız ham kanıtta): bu koşum toplam süre sınırı ve iptal dosyası yoklaması ALTINDA tamamlandı (kesilmedi).
    guards: { maxTotalMs: MAX_TOTAL_MS, cancelPollMs: CANCEL_POLL_MS, cancelFileWatched: true, interrupted: false, requestPhaseMs },
    note: 'ÜÇ AYRI ALAN + POZİTİF KONTROL: nameVerdict.httpReject (yalnız durum kodu ölçütü) · nameVerdict.edgeBlocking (kenar engelleme) · nameVerdict.layerVerification (katman doğrulaması; kapsam sayısıyla) · nameVerdict.positiveControl (izin verilen yollar). Her biri yalnız PASS / FAIL / OLCULEMEYEN alır; birleşik tek PASS yoktur. KANIT SINIRI: kenar engelleme ve katman doğrulaması bu sondayla PASS ÜRETMEZ (başlığın bulunmaması isteğin API\'ye ulaşmadığını kanıtlamaz; nameVerdict.edgeBlocking.scope); ölçüm koşumu çıkış 0 üretmez ve hiçbir çıkış kodu kapanış değildir. findings = FAIL nedeni taşıyan satırlar: ' + FINDING_LABEL + ' (ürün güvenlik kusuru hükmü değildir). API\'ye özgü kanıt YALNIZ istek kimliği protokolünden ve aynı koşumun kalibrasyonundan türer (rows[].idObs / idSignal / layerId / layerWhy): GECERSIZ-BICIM gönderilen istekte API\'nin ürettiği biçimde YENİ kimlik = DEGISTIRME; gönderilen değerin AYNEN dönmesi API kanıtı DEĞİLDİR (yansıtan katman göstergesi). Kenar / tünel / sağlayıcı adlandırılmaz. hintsOnly, rows[].hints ve rows[].layerHint İPUCUDUR (Server başlığı, gövde imzası, boş gövde) — kanıt değildir, hiçbir alana ve adsız özete girmez. vantage beyandır (ölçüm değil). Yanıt başlığı değerleri, hata iletileri ve yönlendirme hedefleri kanıta yazılmaz. scopeAuthorization yalnız durum + dosya bütünlüğü (sondanın ölçtüğü: dosya var · boş değil · SHA-256 tutuyor) + içerik incelemesi (yalnız "beyan var" — insan incelemesidir; sonda içeriği okumaz ve sahipliği doğrulamaz) + kalem türleridir (kayıt, yol, özet değeri, tarih, inceleyen yazılmaz). Bu dosya ana makine adını içerir (KISITLI); adsız özet de kısıtlıdır; public satıra yalnız dört alanın değeri ve ad kimliği yazılır. Ret listesindeki POST/PUT/PATCH gövdesi boş JSON, DELETE gövdesizdir; hiçbirinde kimlik bilgisi yoktur (measured.credentialHeaderRequests). Kenar geçirirse olası sonuç rows[].ifPassed alanındadır. Owner telefon beyanı ayrı dosyadadır. DAR KABUL İSTİSNASI (malformedRejectClass; owner kabul kuralı, kural sürümü ' + NARROW.ruleRevision + '): sınıf "' + NARROW.className + '" yalnız tanımlı TEK vektöre (vectorId; ad + yöntem + ham hedef — satır numarası değil) ve yalnız beş koşulun HEPSİ tutuyorsa uygulanır (state / conditions / whyNot); uygulandığında o satır rows[].acceptedClass alanında sınıfın tam adını taşır (rows[].status gerçek HTTP kodudur: 400), durum kodu ölçütünü tek başına FAIL yapmaz ama 403 SAYILMAZ (nameVerdict.httpReject.counts) ve nameVerdict.httpReject.value PASS OLMAZ: değer ' + HTTP_OWNER_EXCEPTION + ' olur (' + HTTP_OWNER_EXCEPTION_TEXT + ').' + NARROW.notice + ' Sınıf: ' + NARROW.limits + '. Yerel kenar karşılaştırma isteği localEdgeComparison alanında AYRI kayıttır ve measured.requestCount sayısına dahildir (measured.externalRequests + measured.localEdgeRequests). Sonda dışı ek kanıt beyanı owner beyanıdır (ölçüm değil); "kullanılacak" beyanında sınıf koşum anında kesinleşmez.' };
  // Önce adsız özet yazılır; ham kanıttaki `summary.written` özetin GERÇEKTEN yazıldığını gösterir (yazımdan sonra kesinleşir).
  let summaryFail = summaryRefused ? 'ÖZET ANA MAKİNE ADINI İÇERİYOR — yazılmadı' : null;
  if (!summaryRefused) { try { fs.writeFileSync(SUMMARY_OUT, summaryText, { flag: 'wx' }); out.summary.written = true; out.summary.sha256 = summarySha256; } catch (e) { summaryFail = 'ÖZET YAZILAMADI'; } }
  if (summaryFail) { out.exitCode = 7; out.summary.reason = summaryFail; }
  try { fs.writeFileSync(OUT, JSON.stringify(out, null, 1), { flag: 'wx' }); } catch (e) { console.error('KANIT YAZILAMADI'); process.exit(7); }
  if (summaryFail) { console.error(summaryRefused ? 'ADSIZ ÖZET YAZILMADI: özet içinde ana makine adı geçiyor' : 'ADSIZ ÖZET YAZILAMADI'); process.exit(7); }
  for (const x of rows) console.log(`${x.group.padEnd(5)} ${x.method.padEnd(7)} ${x.path.padEnd(45)} ${String(x.status).padEnd(3)} durum=${x.outcome}${x.errorClass ? '(' + x.errorClass + ')' : ''} kimlik=${x.idSignal} katman=${x.layerId}/${x.layerWhy}${x.layerHint ? ' (ipucu: ' + x.layerHint + ')' : ''}${x.acceptedClass ? ' sınıf="' + x.acceptedClass + '"' : ''}`);
  if (localObs.requested) console.log(`yerel ${localObs.method.padEnd(7)} ${localObs.rawTarget.padEnd(45)} ${String(localObs.status).padEnd(3)} ${LOCAL_EDGE_CLASS}${localObs.errorClass ? '(' + localObs.errorClass + ')' : ''} kimlik=${localObs.idObs} (ayrı kayıt: yerel kenar karşılaştırması; Host = dış adın ana makinesi)`);
  const why = (f) => (f.reasons.length ? ' — ' + f.reasons.map((r) => `${r.reason}×${r.count}`).join(' · ') : '');
  const cov = verdict.layerVerification.coverage;
  console.log(`\nD-8 SONDA ${REVISION} · ${ALIAS} · ${SCOPE_AUTH.required ? SCOPE_ACCEPT_TEXT : 'birincil ad — kapsam yetkisi kapısı yok'} · konum (beyan) ${VANTAGE} · vektör kümesi ${VECTOR_SET_ID.slice(0, 16)}… · ret ${DENY.length} + pozitif ${ALLOW.length}`);
  console.log(`  durum kodu (ret vektörleri): ${JSON.stringify(outcomeCounts.deny)}`);
  console.log(`  kalibrasyon: API aynen geri yazma ${calibration.apiWriteBack}/${calibration.apiWriteBackOf} · API değiştirme ${calibration.apiReplace}/${calibration.apiReplaceOf} · web ölçülen ${calibration.webMeasured}/${calibration.webPositives} · başlıksız bölgede ölçülen ${calibration.zoneMeasured}/${calibration.zoneRows}, başlıklı ${calibration.zoneHeaderRows} · yansıma göstergesi ${calibration.reflectionRows} · yabancı kimlik göstergesi ${calibration.foreignIdRows} → ${calibration.result} (API kanıtı ${calibration.apiEvidenceUsable ? 'kullanılabilir' : 'KULLANILAMAZ'})`);
  console.log(`  kimlik anlamı (ret vektörleri): ${JSON.stringify(idSignalCounts.deny)} · ipucu (kanıt değil) ${JSON.stringify(denyLayerHints)}`);
  console.log(`  kimlik bilgisi başlığı taşıyan istek ${measured.credentialHeaderRequests}/${measured.requestCount} · dolu gövde ${measured.nonEmptyBodyRequests} · sonuç yok ${out.unmeasured} · istek: dış ${measured.externalRequests} + yerel kenar ${measured.localEdgeRequests} · iki güvence altında tamamlandı (toplam süre sınırı ${MAX_TOTAL_MS} ms, istek aşaması ${requestPhaseMs} ms; iptal dosyası ${CANCEL_POLL_MS} ms aralıkla yoklandı)`);
  const hc = verdict.httpReject.counts;
  console.log(`HTTP / RET SONUCU  : ${verdict.httpReject.value}${why(verdict.httpReject)}${verdict.httpReject.value === HTTP_OWNER_EXCEPTION ? ' — ' + HTTP_OWNER_EXCEPTION_TEXT : ''} · sayılar: 403 ${hc.status403}/${hc.denyRows} · dar sınıf ${hc.narrowClass} (403 sayılmaz) · başka yanıt ${hc.otherAnswered} · yanıtsız ${hc.unanswered}`);
  printNarrow(narrowClass);
  console.log(`KENAR ENGELLEME    : ${verdict.edgeBlocking.value}${why(verdict.edgeBlocking)}`);
  console.log(`  kenar engelleme kaydının eki: ${KANIT_SINIRI}`);
  console.log(`KATMAN DOĞRULAMASI : ${verdict.layerVerification.value} — API kanıtlı ${cov.provenApi}/${cov.denyRows} · ölçülemeyen ${cov.unverifiable} ${JSON.stringify(cov.unverifiableByReason)}`);
  console.log(`POZİTİF KONTROL    : ${verdict.positiveControl.value}${why(verdict.positiveControl)}`);
  if (findings.length) console.log(`  FAIL nedeni taşıyan satır ${findings.length}: ${FINDING_LABEL}`);
  console.log(`D8-AD=${ALIAS}\nD8-KAPSAM-YETKISI=${SCOPE_AUTH.status}\nD8-DOSYA-BUTUNLUGU=${SCOPE_AUTH.fileIntegrity}\nD8-ICERIK-INCELEMESI=${SCOPE_AUTH.contentReview}\nD8-DAR-SINIF=${narrowClass.state}\nD8-HTTP-RET=${verdict.httpReject.value}\nD8-KENAR-ENGELLEME=${verdict.edgeBlocking.value}\nD8-KATMAN-DOGRULAMA=${verdict.layerVerification.value}\nD8-POZITIF-KONTROL=${verdict.positiveControl.value}\nD8-OZET-SHA256=${summarySha256}\nD8-CIKIS=${exitCode}`);
  // Çıkış kodu olay döngüsü boşalınca verilir (son satırlar kesilmesin); boşta bağlantılar kapatılır, takılırsa 3 sn sonra zorla çıkılır.
  process.exitCode = exitCode; https.globalAgent.destroy(); http.globalAgent.destroy(); setTimeout(() => process.exit(exitCode), 3000).unref();
})();
