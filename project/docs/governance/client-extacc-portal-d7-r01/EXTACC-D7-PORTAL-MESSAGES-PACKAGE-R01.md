# EXTACC D-7 — PORTAL MESAJ AKIŞI CANLI KABUL PAKETİ (R01 · owner bloğu metni R02 · koşucu kapanışı R03)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** Canlı Run/Recover ve yayın bu paketle yetkilendirilmez; GO biçimi `OWNER-GO-CLIENT-EXTACC-D7-YYYYMMDD-RNN`
> (D-4/D-5 GO'ları kabul **edilmez**). Tanım: `client-extacc-d8-staff-surface-r01` §5 (D-7) ve §6 (birleşik D-9); şablon: D-5 paketi + D-4 koşucusu (R03).
> **ÖN KOŞUL:** canlı API dist'i **R27** (`E28A6863…5134`; D-5 ile aynı pin). Owner bloğunun salt okuma kapıları (paket pinleri, dist pini,
> `.env` pini) **tüm modlarda** — Preflight, QrTest, Run **ve Recover** — mod dalından önce koşar; canlı dist R27 değilse blok **her modda DUR** verir
> (Recover dahil; bkz. §9 ve §10 K-4). Hizmet kabulü H1–H8 **0/8** değişmez.
> **R01 inceleme düzeltmeleri (2026-09-29):** iki bağımsız incelemenin bulguları uygulandı — §11.
> **R02 (2026-10-01) — owner bloğu metni ve Recover yetkisi (yalnız metin; kod/akış/pinler DEĞİŞMEDİ) — §12:** Run çıkış 5/6 **Recover yetkisi
> DEĞİLDİR**: Run'ın koşucu içindeki kendi kapanış adımları ile ayrıca başlatılan Recover ayrıdır; Recover yalnız kanıt incelendikten sonra
> AYRI owner onayıyla, BİR KEZ başlatılır; blok Recover'ı otomatik başlatmaz ("BİR KEZ" kodla zorlanmaz — §8.1). Recover'ın **canlı yazma
> kümesi** belgeye (§8.1) ve bloğun Recover girişine (yalnız bilgi metni; yeni soru/akış yok) yazıldı. Canlı veri onay metni §8 kayıt listesiyle
> eşleştirildi; "sentetik tenant CLOSED" ifadesi "dosyalar CLOSED, personel pasif, portal pasif; tenant yaşam döngüsü değişmez" olarak düzeltildi
> (koşucunun kanıt metni pinlidir, değişmedi — §3 notu). Owner adımına "Mesajlar sekmesine geçin" eklendi; beyan seçenekleri ana sayfa/özeti
> hata sayfasından ayırır (harfler ve kod aynı). "Hiçbir dosyaya yazılmaz" türü kapsamsız ifadeler ölçülen kapsama daraltıldı. Blok öz-testine
> G-1..G-4 eklendi. Koşucu, sahte API, QR betiği, pinli 9 dosya ve paket digest **DEĞİŞMEDİ**. Bu revizyon D-7 canlı koşumu ya da Recover için
> yetki DEĞİLDİR; **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.**
> **R02 inceleme düzeltmeleri (2026-10-01; yalnız metin ve belge; blok mantığı, pinli 9 dosya ve paket digest DEĞİŞMEDİ) — §12.1:** kalıntı
> satırının altındaki not kanıttaki "sentetik tenant CLOSED" ifadesinin koşucunun sabit metni olduğunu ve kapanışın doğrulandığını göstermediğini
> söyler (§3 notu); Recover'ın çıkış kodu yeni bir Recover için yetki değildir ve **ikinci bir Recover bu paketle tanımlı değildir, owner kararı
> gerektirir** (§5 adım 7, §8.1, §10 K-6); blok öz-testine G-5 ve G-6 eklendi; §9'a üç sınır notu (D7-E11) ve Recover yetkisinin ölçülmediği
> yazıldı. Blok ve blok öz-testi sha256 değerleri değişti (§7; önceki değerler "R02 ilk tur" olarak korunur).
> **R02 koşucu öz-testi kütüphane kökü (2026-10-03; yalnız `d7-selftest.js` + bu belge) — §6.4, §12.2:** koşucu öz-testi artık Prisma istemcisi
> ve bcrypt için canlı yayın ağacını **varsaymaz**; kütüphane kökü `D7T_LIB_ROOT` ortam değişkeniyle verilir (verilmezse betiğin kendi checkout'u),
> kök canlı yayın ağacının altındaysa test **koşmaz**, modül bulunamazsa açık hatayla durur. Repodaki dosyanın kendisi (ayna değil) canlı olmayan
> kütüphane köküyle koşuldu: **41/41 PASS**. Öz-testin ölçtükleri (41 ölçüt), koşucu, blok, blok öz-testi, sahte API, QR betiği, pinli 9 dosya ve
> paket digest **DEĞİŞMEDİ**; `d7-selftest.js` sha256 değeri değişti (§7; önceki değer korunur). Canlı Run kapıları ve pin denetimi aynıdır.
> **R02-b ek sınırlar (2026-10-03; yalnız bu belge) — §12.3:** Run / normal kapanış / AYRI Recover sınırlarına dört ek yazıldı: pencere açma
> tuzağı (§5 adım 1, §9), kurulum ile makbuz arasındaki pencere (§9; açık owner sorusu §10 K-7), Recover'ın 1 ve 2 çıkış kodları (§3 notu),
> koşucu öz-testinde uzun yol önekli kök (§6.4). Dördü de kaynaktan okundu; canlıda **ölçülmedi**. Owner bloğu, koşucu, iki öz-test, QR betiği,
> sahte API, pinli 9 dosya ve paket digest **DEĞİŞMEDİ**; hiçbir blok / koşucu / öz-test bu turda çalıştırılmadı. Bu ek hiçbir canlı koşum ya da
> Recover için yetki DEĞİLDİR.
> **R03 (2026-10-03) — koşucu kapanış eksikleri (koşucu, sahte API, iki öz-test, owner bloğu ve bu belge değişti; koşucu pini ve paket digest
> değişti) — §13:** (a) makbuz artık kurulumdan **hemen sonra** atanır ve dosyaya yazılır; iki ek dosya yazmasından biri hata verse de Run kendi
> kapanışını koşar ve Recover makbuzu bulur (önceki baytlarda bu pencerede sentetik kullanıcılar **aktif**, dosyalar **ACTIVE** kalıyordu — izole
> senaryoda ölçüldü, §13.1); kanıttaki `setup` alanı yarım kurulumu `fatal` + makbuz durumundan ayırır. (b) Run'ın kendi kapanışında personel
> oturumu 401/403 ile reddedilirse **bir kez** yeniden giriş + **bir kez** yeniden deneme; başka 4xx'te yeniden giriş yok; Recover değişmedi
> (§13.2; canlı etkisi kaynaktan okundu, canlıda ölçülmedi; kabulü açık owner kararı **K-8**). (c) "ürün bulgusu" yalnız DB kapanışı
> ölçülmüşken yazılır; kurtarma adımı "ÖNERİ (yetki DEĞİL)" biçimindedir ve ikinci Recover'a yol tarif etmez; kalıntı metnindeki kapanış özeti
> ölçülenden kurulur; bloğun Run kapanış satırı parçaları kanıttaki verdict'lerden kurulur; bloğun Recover bitiş satırı 0 / 1 / 2 / 3'ü yalnız
> ölçüleni söyleyerek açıklar (§13.3). Çıkış kodu fonksiyonları ve öncelik **değişmedi**. Canlı Run / Recover **koşulmadı**, owner bloğu
> çalıştırılmadı (yalnız blok öz-testi); bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
> **R03-c (2026-10-03) — kapanış / Recover doğruluğu (owner talimatı madde 2; koşucu, sahte API, iki öz-test, owner bloğu ve bu belge değişti;
> koşucu pini ve paket digest değişti) — §14:** (a) bloğun Recover bitiş satırı, mevcut oturum reddinin Recover'da **her zaman** ölçülemediğini ve
> yeni giriş reddinin P7-C3L/D satırlarından okunduğunu kodlardan önce yazar; 2 ve 1 neyin doğrulandığını adlandırır (portal DB kapanışı ya da hesap
> yok + personel/dosya kapanışı). (b) Makbuz bellekte var ama dosyası yazılamamışsa ya da okunamıyorsa kanıttaki kurtarma adımı ve bloğun Run 5/6
> metni uygulanamayan `-Mode Recover -ReceiptFile <makbuz>` önerisini **yazmaz**; kanıttaki `receipt` nesnesinden yeni makbuz dosyası yolu (öz-testte
> uçtan uca ölçüldü) ya da kanıtta da yoksa **somut engel** yazılır. (c) Tarama: koşucu oturumunun 200'ü yalnız P7-C2 PASS **ve** P7-C5 PASS iken ürün
> bulgusudur (hesap ölçüm sırasında yeniden açılırsa "ürün bulgusu adayı DEĞİL"); hesap yokken P7-C1 günlük satırı "kapatıldı" demez. Çıkış kodları
> **değişmedi**. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
> **R03-d (2026-10-04) — R03-c bağımsız doğrulamasının bulguları (koşucu, sahte API, iki öz-test, owner bloğu ve bu belge değişti; koşucu pini ve
> paket digest değişti) — §14.5:** R03-c (c)'deki **"ürün bulgusu adayı DEĞİL" sınıflaması YANLIŞTI**: ürünün guard'ı eski oturumu sürüm farkıyla
> `isActive`'ten bağımsız reddeder ve yeniden açma sürümü artırır — P7-C2 PASS + P7-C5 FAIL iken 200 artık sürüme bağlı sınıflanır ("ÜRÜN BULGUSU ADAYI"
> + ayrı "yeniden AÇILDI … (Recover kapatabilir)" satırı; "adayı DEĞİL" yalnız sürüm verilme değerine eşit ve hesap açıkken). R03-c (b)'deki "receipt
> nesnesini yeni JSON dosyasına yazın" yolu ölçülmemişti ve WinPS 5.1'de kullanılamıyordu; yerine iki kabukta ölçülmüş TEK komut. Bloğun Recover kod
> açıklamaları yalnız okunabilir kanıt varken; bayat makbuz önerilmez. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için
> yetki DEĞİLDİR.

## 1. Ne ölçer ve ne yapmaz

Uçtan uca: sentetik müvekkile yetkili personelle portal hesabı (gönderimsiz) → koşucu kendi portal oturumuyla **dış HTTPS** üzerinden mesaj
gönderir/listeler/okundu işaretler, personel yanıtını **yerel API**'den gönderir → owner **telefondan** (mobil veri) giriş yapar (girişten
sonra portal **ana sayfası** açılır; **Mesajlar sekmesine** geçer — §5 adım 4), mesaj sayfasında bu koşumun mesajlarını görür, isterse bir
mesaj gönderir; giriş algılanınca koşucu **ikinci** personel yanıtını gönderir (owner yeni mesajı ve zil simgesindeki bildirim rozetini görür
— §9) → kapanış (D-4 R03 kuralları). Koşucu **e-posta/SMS üretmez ve çağırmaz** (forgot/reset/change-password ve belge
uçları yasak; kaynak taraması T-1), **dış admin uçlarını çağırmaz** (D7-5 = D-8 kapsamı), **mesaj/bildirim silmez** (ürünte silme ucu yok),
telefondan gönderilen mesajın **içeriğini kendi kanıtına yazmaz** (yalnız sayı; mesaj satırının kendisi canlı DB'de kalır). Parola/token/GO/DB
URL'yi blok ve koşucu **kendi kanıt/log dosyalarına yazmaz** (öz-test ortamında ölçülen kapsam: blok öz-testi R-9, koşucu öz-testi S-1); parola
**özetleri** canlı DB'de sentetik hesaplarda durur, canlı API'nin kendi uygulama günlüğü AYRIDIR ve içeriği bu paketle ölçülmez (§8, §9; R02).

## 2. Kaynak yan etki bulgusu (HY_WT_R27 `portal.controller.ts` / `portal.service.ts`; koşucu yazımından ÖNCE ölçüldü)

| Uç | Guard | Yazdığı | Bildirim | E-posta/outbox | Audit |
|---|---|---|---|---|---|
| `POST /api/portal/messages` (`sendMessageFromClient`) | `PortalAuthGuard` (DB doğrulamalı) | **yalnız** `PortalMessage` (senderType `CLIENT`, senderId = clientId, senderName sabit "Müvekkil") | **yok** | **yok** | **yok** (yalnız `logger.log` clientId) |
| `GET /api/portal/messages` · `messages/unread-count` · `POST messages/mark-read` | `PortalAuthGuard` | mark-read: `OFFICE` satırlarını `isRead=true` | — | — | yok |
| `POST /api/portal/admin/messages/:clientId` (`sendMessageFromOffice`) | personel oturumu | `PortalMessage` (`OFFICE`, senderId = user.id) **+ `PortalNotification`** (type `MESAJ`, "Yeni Mesaj", linkUrl `/portal/messages`) | **1 satır / yanıt** (DB) | **yok** | **yok** |
| `GET /api/portal/admin/messages/:clientId` (`getClientMessages`) | personel oturumu | müvekkil (`CLIENT`) mesajlarını **okundu işaretler** (yan etki); **dönüş gövdesi `{ client, messages }`** (müvekkil tenantta değilse 404; çıplak dizi DEĞİL — koşucu D7-3G ve sahte API bu sözleşmeyi kullanır) | — | — | yok |
| `GET /api/portal/admin/messages/clients` | personel oturumu | — | — | — | yok |

- `EmailProviderService` `portal.service.ts` içinde yalnız `sendResetEmail` (D-5) tarafından kullanılır; `PortalMessage`/`PortalNotification`
  tablolarına `apps/api/src` altında başka yazıcı/okuyucu (cron, outbox, e-posta) **yok**. **Sonuç: ne müvekkil mesajı ne personel yanıtı
  herhangi bir adrese (gerçek/sentetik `.invalid`) gönderim denemesi üretir** → gönderim için ayrı owner kararı GEREKMEZ (SMTP dokunulmaz).
- **Kapsam dışı `caseId`:** `resolveCaseReference` (CLIENT-K1) yabancı tenant / aynı tenant başka müvekkil / bulunmayan / biçimsiz id için
  **400 "Geçersiz dosya referansı"** döner ve satır yazılmaz (varlık sızdırılmaz). D-8 §5 tanımındaki **404 değil**; koşucu **400 ölçer**
  (`FOREIGN_CASE_EXPECT = 400`); canlı 404 verirse satır FAIL olur (canlı dist ≠ kaynak işareti). Üç varyantın üçü de **ölçülür**: yabancı tenant
  dosyası (D7-4N), **aynı sentetik tenantta ikinci sentetik müvekkile bağlı, `showToClient=true` dosya (D7-4S; tek kapsam dışılık müvekkil bağı)**,
  bulunmayan id (D7-4U). Biçimsiz id (uzunluk > 64 / dize değil) yalnız kaynaktan okundu, canlıda **ölçülmez**.
- **Personel (büro) mesaj uçları:** bu paket bu uçları yalnız **yerel API'den, sentetik elev1 personelle** çağırır (D7-3, D7-3N, D7-3U, D7-3G,
  D7-3F, D7-3B) ve personel yetki modelini **ölçmez**. Bu uçlara ilişkin bir güvenlik kaydı owner-yerel kısıtlı kayıtta izlenir
  (**SEC-PORTAL-ADMIN-MSG-01**, AÇIK; ayrıntı public repoya yazılmaz). Dışarıdan kapalı olması **kenar** (D-8) kararıdır. → owner notu §10 K-2.
- Şema: tanımdaki "ClientMessage" modeli yok; gerçek model **`PortalMessage`** (`clientId, tenantId, caseId?, content, senderType, senderId,
  senderName, isRead, readAt`) ve **`PortalNotification`** (`clientId, caseId?, type, title, message, isRead, linkUrl`). Silme ucu yok.
- Kenar izin listesi (Caddyfile şablonu: `client-external-access-r01/templates/Caddyfile.template` — `@deny path_regexp ^/api/portal/admin(/|$)`,
  `web` regexp'inde `portal/messages`, `aget` regexp'inde `messages|messages/unread-count`, `apost` regexp'inde `messages|messages/mark-read`):
  `GET/POST /api/portal/messages`, `GET messages/unread-count`, `POST messages/mark-read`, `GET /portal/messages` **izinli**; `/api/portal/admin/*` **403**
  → koşucu admin uçlarını yalnız yerel API'den (8080) çağırır. Canlı Caddy yapılandırmasının şablonla aynı olduğu bu pakette **ölçülmez** (D-8 sondası).
- Web `/portal/messages` sayfası açılışta `mark-read` çağırır ve 10 sn'de bir listeyi yeniler → telefon, 2. personel yanıtını okundu işaretleyebilir;
  koşucu bunu **yargılamaz**, yalnız `phoneObservation.office2ReadByPhone` olarak raporlar.

## 3. Ölçütler

| ID | Ölçüt | Kaynak |
|---|---|---|
| P7-00 / P7-01 / P7-02 | elev1 ADMIN değil · gönderimsiz portal hesabı (`.invalid`) · DB aktif+erişim+e-posta | D-4 kalıbı |
| P7-03L / P7-04D | koşucu portal girişi yerel 201 · dosya listesi dış 200 yalnız `I3-<runId>` | HTTP |
| **D7-1** | dış `POST /api/portal/messages {content:'D7-<runId>'}` **201** + DB satırı (clientId/tenantId/senderType=CLIENT/isRead=false/caseId=null) | HTTP+DB |
| **D7-2** | dış `GET /api/portal/messages` **200** ve **yalnız bu koşumun** mesajları (id kümesi; en az 1 kendi mesajı — boş doğrulama yok) | HTTP |
| **D7-4N / D7-4S / D7-4U / D7-4P** | yabancı tenant dosyası / **aynı tenant başka müvekkil dosyası** / bulunmayan id ile POST → **400** ve satır yok (üçü aynı cevap) · kendi dosyası → 201 + caseId doğru | HTTP+DB |
| **D7-3 / D7-3N** | personel yanıtı **yerel** `POST /portal/admin/messages/:clientId` (elev1) 201 + OFFICE satırı → dış GET'te görünür · `PortalNotification` **+1** (MESAJ, `/portal/messages`). Personel yanıtı **yanıtsız** kalırsa ikisi de **ÖLÇÜLEMEYEN** (FAIL değil) | HTTP+DB |
| **D7-3U** | dış `unread-count` **1** → `mark-read` 2xx → **0**; DB OFFICE satırı `isRead=true` + `readAt`. Personel yanıtı / ilk `unread-count` / `mark-read` **yanıtsız** kalırsa **ÖLÇÜLEMEYEN** (FAIL değil) | HTTP+DB |
| D7-3G / D7-3F | personel yerel GET 200, **gövde `{ client, messages }`** (ürün sözleşmesi; çıplak dizi FAIL) ve tüm koşum mesajları `messages` içinde; müvekkil mesajları okundu işaretlenir · yabancı tenant müvekkiline personel mesajı **404**, satır yok | HTTP+DB |
| P7-DISP / P7-WAIT | QR `/portal/messages` + giriş bilgisi yalnız konsol · koşucu dışından giriş (DB loginCount; cihaz/ağ owner beyanı) | konsol/DB |
| **D7-3B** | telefon girişinden SONRA 2. personel yanıtı 201 **+ DB OFFICE satırı (clientId/tenantId/senderId/content)**; okunmamış sayacı **raporlanır**, yargılanmaz | HTTP+DB |
| D7-5 | dış admin uçları 403 — **bu koşucuda ÇAĞRILMAZ/ÖLÇÜLMEZ** (kanıtta `d75Note`; D-8 sondası ölçer) | not |
| P7-C1 … P7-C5, P7-C2V | kapanış (D-4 R03 kuralları; korumalı uç **`GET /api/portal/messages`**) | DB+HTTP |
| **P7-MSG-KEPT** | koşucunun yazdığı `PortalMessage` satırlarının **tamamı yerinde** (`yerinde=k/k`) ve `PortalMessage`/`PortalNotification` **SİLİNMEDİ**; kanıt `yerinde=k/k · saklandı: n mesaj (koşucu k · telefon t) + m bildirim satırı (kapanış, ölçülen: <U-CLOSE ve portal DB ölçümü>) — SİLİNMEDİ` (R03; R01/R02 baytlarında parantez SABİT "(sentetik tenant CLOSED; portal pasif)" idi); `messageResidue.deleted=false`. Koşucu **hiç mesaj yazmadıysa** (ya da Recover makbuzunda `runnerMessageIds` yoksa) boş-doğrulama PASS **verilmez**: **ÖLÇÜLEMEYEN** + yalnız rapor. Koşucu mesaj id'leri makbuza `runnerMessageIds` olarak yazılır; Recover bunlarla gerçek sayım yapar | DB |
| U-CLOSE / U-ISO / P7-D9 | personel/dosya kapanışı · izolasyon (yalnız sayı) · birleşik | DB |

Gösterim kapısı: `P7-03L, P7-04D, D7-1, D7-2, D7-3, D7-3U` PASS değilse giriş bilgisi gösterilmez, telefon beklenmez (D7-4N/4S/4U/3N kapı dışı: kusur
FAIL olur, akış sürer). Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 5 PERSONEL/DOSYA · 6 PORTAL KAPANIŞI DOĞRULANMADI ·
7 KANIT YAZILAMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0); owner bloğu 90 kapı · 91 node. Recover ölçülemeyeni 0 yapmaz (C4 Recover'da hep ÖLÇÜLEMEYEN → 3).

**Not (R02) — "sentetik tenant CLOSED" ifadesi:** P7-MSG-KEPT kanıt metnindeki "(sentetik tenant CLOSED; portal pasif)" (Recover kanıtında
"(sentetik tenant CLOSED)") ve `messageResidue.note` içindeki "sentetik tenant kapanışı" ifadeleri koşucunun (pinli, bu revizyonda DEĞİŞMEDİ)
**SABİT** metnidir: koşucu bu metni kapanış sonucuna bakmadan, kapanış doğrulanmadığında da (çıkış 5/6) aynen yazar (kaynaktan okundu: metin
şablonu `out.portalClose` / `out.closure` değerine bağlı değildir). Kanıt metnindeki "sentetik tenant CLOSED" koşucunun SABİT ifadesidir;
kapanışın doğrulandığını **GÖSTERMEZ** — kapanış durumu DOĞRULANDI / DOĞRULANAMADI satırındadır (Run: bloğun "Portal erişim kapanışı …" satırı
ve kanıttaki P7-D9; Recover'da böyle bir satır gösterilmez, durum çıkış kodu satırındadır); anlamı: hedeflenen kapanış = **dosyalar CLOSED +
personel pasif + portal pasif**; tenant yaşam döngüsü değişmez. Tenant kaydı kapatılmaz (kaynaktan okundu: kapanışta yazılanlar `User`, `Case`,
portal hesabı, müvekkil erişim bayrağı ve kapatma audit satırıdır; `Tenant` satırına yazma yoktur).
Owner bloğu bu açıklamayı kalıntı satırının altında (Run ve Recover bitişi) gösterir; onay metni kapanışı ve tenant yaşam döngüsünü ayrıca yazar.
**R03 güncellemesi (bu notun yukarısı R01/R02 koşucu baytlarının kaydıdır):** koşucu bu sabit ifadeyi artık **yazmaz**. Parantez içindeki kapanış
özeti ölçülenden kurulur (`closureTag`): personel/dosya için U-CLOSE ile aynı kaynak — "personel pasif + dosyalar CLOSED (U-CLOSE PASS)" ya da
"personel/dosya kapanışı DOĞRULANMADI (U-CLOSE PASS değil)"; portal için "portal hesabı YOK" · "portal DB'de pasif ölçüldü (P7-C2 PASS)" · "portal DB
kapanışı DOĞRULANMADI". `messageResidue.note` artık "sentetik tenant kapanışıyla erişilemez" demez; erişimin kapanıp kapanmadığını P7-C* ve U-CLOSE
satırlarına bırakır. Bloğun kalıntı notu bu yeni metni anlatır (blok öz-testi G-5); onay metni koşucunun eski ifadesine atıf yapmaz (G-2). Öz-test
C-1 bu öz-testin tüm kanıtlarında parantezin U-CLOSE / P7-C2 verdict'iyle tutarlı olduğunu ölçer.
**Not (R02) — Recover çıkışı:** "C4 Recover'da hep ÖLÇÜLEMEYEN" portal hesabı varken geçerlidir; hesap hiç oluşmadıysa C3/C4 satırları üretilmez (§9).
**Not (R02-b) — Recover'da 1 ve 2 (kaynaktan okundu: koşucu `recoverExitCode` + `recoverMode`; canlıda ölçülmedi; koşucu öz-testinin iki Recover
senaryosu — Z5, Z10-r — bu iki kodu üretmez).** Yukarıdaki çıkış listesi Run içindir. Bloğun Recover bitiş satırı 0 / 3 / 6 / 5 / 4 / 7 / 91
kodlarını açıklar; **1 ve 2'yi açıklamaz** (blok metni bu turda değiştirilmedi). Koşucu Recover'da bu iki kodu da döndürebilir ve blok node
kodunu değiştirmeden taşır. Recover'da öncelik 6 > 5 > 1 > 2 > 3 > 0'dır (kanıt yazılamazsa 7; 5/6 korunur):
- **Recover 1 (DURDU):** portal DB kapanışı ve personel/dosya kapanışı doğrulanmıştır (6 ve 5 koşulları yoktur), ama Recover'ın hazırlık
  adımında (portal durumunun okunması ya da makbuzdaki sentetik personelin geçici oturumunun açılması) beklenmeyen bir hata oluşmuştur; hata
  özeti kanıttaki `fatal` alanındadır. 1, hem 2'den hem 3'ten önce gelir: aynı kanıtta FAIL ya da ÖLÇÜLEMEYEN satır da bulunabilir — satırlar
  (P7-C3L/C3D, P7-C4L/C4D, P7-MSG-KEPT) ayrıca okunur; 1 "HTTP reddi doğrulandı" anlamına **gelmez**. Koşucu süreci kanıt yazmadan
  yakalanmamış bir hatayla biterse (ör. kütüphane yüklenemedi) node'un kendi çıkış kodu da 1 olur; blok yalnız "0 + kanıt yok" durumunu 7'ye
  çevirir, 1'i olduğu gibi taşır — 1'de önce kanıt dosyasının var olup olmadığına bakılır (bu cümle Run için de geçerlidir). **R03-d:** Node
  davranışı artık ölçüldü — geçersiz `AH_PRISMA_ROOT` ile koşucu Recover'da kanıt YAZMADAN **1** ile çıkar (R03-d koşucusunda da;
  `r04\recover-dogrulugu\r2\dogrulama-ortak\crash-probe\crash-probe.log`); blok Recover bitiş satırı kod açıklamalarını artık yalnız okunabilir kanıt
  varken yazar, kanıt yoksa kırmızı "KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi" (§14.5).
- **Recover 2 (FAIL):** kapanışlar doğrulanmış ve hazırlık hatası yoktur, ama en az bir satır FAIL'dir. Koşucu mantığında Recover'da bu
  yalnız **P7-MSG-KEPT** ile oluşur: makbuzdaki koşucu mesaj satırlarından (`runnerMessageIds`) en az biri DB'de yerinde değildir
  (`yerinde=k/n`, k < n). Diğer satırların FAIL'i 2 üretmez: P7-C1 / C2 / C2V / C5 ve P7-C3L / C3D FAIL'i **6**, U-CLOSE FAIL'i **5**
  verir; P7-C4L / C4D Recover'da FAIL olamaz (portal hesabı varken hep ÖLÇÜLEMEYEN). Bu paket mesaj satırı silmez; 2'nin nedeni
  CLIENT/owner tarafından incelenir, paket bunun için bir adım tanımlamaz.
- Koşucunun kapı düzeyindeki aynı sayılar (1 = TLS doğrulaması kapalı ya da bilinmeyen mod · 2 = zorunlu ortam değişkeni eksik · 3 =
  `D7_RECOVER_CONFIRM` yok) blok üzerinden başlatılan Recover'da beklenmez: bu değerleri blok kurar ve TLS değişkeni ortamda tanımlıysa
  kapıda (90) durur (kaynaktan okundu).
- 1 ve 2 dahil hiçbir Recover çıkış kodu yeni bir Recover için yetki değildir; sonuç CLIENT'a/owner'a bildirilir (§5 adım 7, §8.1, §10 K-6).
- **R03:** bloğun Recover bitiş satırı artık **1 ve 2'yi de açıklar** ve 0'ı "FAIL ve ÖLÇÜLEMEYEN satır yok — koşucu mantığında fiilen beklenmez"
  diye yazar (eski "0 kapanış + HTTP reddi doğrulandı" kaldırıldı); 3'ü "portal DB kapanışı ölçüldü ya da portal hesabı yok, FAIL yok, en az bir
  ölçüt ÖLÇÜLEMEYEN — yeni giriş reddinin ölçülüp ölçülmediği P7-C3L/D satırlarından okunur" diye yazar (§13.3; blok öz-testi O-6). Yukarıdaki
  anlamlar ve koşucunun `recoverExitCode` kuralı **değişmedi**.

## 4. Owner bloğu (`scripts/d7-owner-live-block.ps1`) — modlar

Preflight (salt okuma; main senkron, paket pinleri, **R27 dist pini**, `.env` sha, `PUBLIC_PORTAL_BASE_URL` **biçim kapısı** (https + yalnız alan adı;
yol/port/IP/localhost DUR) — adres canlı `.env`'den okunur, blokta host literali **yoktur**; R05 eşleşmesi Run/QrTest'te owner'ın konsola yazdığı
adresle ölçülür (eşleşmezse GO sorulmadan DUR), 8080 tek dinleyici, yabancı kabul
süreci yok, DB kimliği, dış zincir: 8081 yalnız loopback = HY-Caddy, Cloudflared Running) · QrTest (canlı veri yok; **`d7-qr-test.js`** ile
`/portal/messages` — `extacc-qr-test.js` yalnız `/portal/login` kabul ettiğinden kullanılmaz) · **Run**: konsol → bağımsız pencere teyidi → canlı
veri işleme "EVET" → GO (yerel) → defter (sha256) → koşum → ekran temizliği → owner beyanı (8 soru, ayrı dosya) → manifest · **Recover**: `-ReceiptFile`;
soru/GO yok. `owner-block.json`: `emailSendsPlanned=0`, `messageRowsDeleted=false`. Canlı süreler bloğun içinden zorlanır (20 dk bekleme · 5 sn yoklama ·
120 sn inceleme · 120 sn geç oluşma). Kanıt JSON'ları **UTF-8** olarak okunur (WinPS 5.1 varsayılanı ANSI; kalıntı metni bozulmasın).

**R02 — Recover (yalnız metin).** Recover, Run'ın koşucu içindeki kendi kapanış adımlarından AYRI bir canlı yazma işlemidir; otomatik değildir,
blok onu Run'dan sonra kendiliğinden başlatmaz (öz-test G-4: Run çıkış 5/6'da tek node çağrısı, mod `run`; AST: `Invoke-RecoverMode` yalnız
akıştaki mod dalında). Recover başlarken blok, canlı yazma kümesini (§8.1) ve yetki kuralını konsola yazar (yalnız bilgi: soru sorulmaz, akış
değişmez — öz-test G-3). Blok AYRI owner onayını **sormaz ve ölçmez**; "BİR KEZ" kuralı **kodla zorlanmaz** (§8.1). Recover'ın çıkış kodu
yeni bir Recover için yetki değildir; ikinci bir Recover bu paketle tanımlı değildir, owner kararı gerektirir (§8.1, §10 K-6; öz-test G-6).
**R02 — beyan seçenekleri (yalnız istem metni; harfler ve kod aynı).** "Girişten sonra ne gördünüz?" sorusunda **M** artık "portal açıldı: ana
sayfa/özet ya da Mesajlar sekmesindeki mesaj sayfası", **D** "hata sayfası ya da portal dışı başka sayfa" olarak yazılır (önceki metinde ana
sayfa "D = başka/hata sayfası" altına düşüyordu). "Yeniledikten sonra" sorusunda **M** "portal içeriği hâlâ açık: mesaj sayfası ya da ana
sayfa/özet"tir. Kabul edilen harf kümesi (M/G/D/Y/?) ve bu yanıtları okuyan kod (`-ceq 'M'` karşılaştırmaları) DEĞİŞMEDİ; ana sayfa ile mesaj
sayfası ayrımı harfle yapılmaz, "mesaj sayfasında kaç mesaj vardı" ve "ikinci yanıtı mesaj sayfasında gördünüz mü" sorularıyla izlenir.
Rozet sorusu "zil simgesindeki rozet (okunmamış BİLDİRİM sayacı; mesaj sayacı değildir)" olarak yazılır (§9).
**R02 — kayıt alanı.** `owner-block.json` içindeki `revision` alanı kodda sabittir ve **`R01` kalır** (R02 yalnız metin revizyonudur; alan
değiştirilirse mantık eşitliği bozulurdu). Koşumun hangi blok baytlarıyla yapıldığı blok sha256'sıyla (§7) izlenir, bu alanla değil.

## 5. Owner adımları (telefon: Wi-Fi KAPALI, mobil veri, gizli sekme)

1. Bağımsız PowerShell penceresi. `-Mode Preflight` → "PREFLIGHT GEÇTİ" değilse durun.
   **R02-b — pencereyi owner doğrudan açar** (Başlat menüsü → Windows PowerShell). Ajan pencereyi PowerShell 7 içinden `Start-Process` ile
   açarsa çocuk Windows PowerShell 5.1 süreci PS7 modül yolunu (`PSModulePath`) devralır ve `Get-FileHash` **bulunamaz** (aynı not D-6
   belgesinin R02 sürümünde — PR #2880; bu dalda ve `main`'de henüz yok — §4 adım 1'de kayıtlıdır; D-5 paket belgesinde kaydı yoktur. Bu paket
   için 2026-10-03'te yerel olarak ölçüldü, PowerShell 7.6.6 → Windows PowerShell 5.1.26100: `Start-Process` → `Get-FileHash=False`; PowerShell 7
   içinden çağrı işleciyle doğrudan çağrı → `True`; ölçüm yalnız komut aramasıdır, blok çalıştırılmadı. Başlat menüsünden açılan pencere bu
   turda **ölçülmedi**; kalıcı `PSModulePath` değerinde PowerShell 7 parçası olmadığı bağımsız doğrulamada ölçüldü).
   Bu bloğun `Sha` fonksiyonu `Get-FileHash` kullanır (paket pinleri, canlı dist pini, `.env` pini, kanıt manifesti); bulunamazsa pin kapıları
   ölçüm yapamaz ve blok **her modda** ilk pin ölçümünde "DUR - beklenmeyen hata" ile çıkış 90 verir (kaynaktan okundu; blok bu koşulda
   çalıştırılmadı). Bu 90 bir pin uyuşmazlığı değildir (uyuşmazlıkta mesaj "DOSYA PİNİ uyuşmuyor" olur); ölçümün yapılamadığını gösterir. Blok
   bu durumu kendisi düzeltmez. Bu yol kullanılacaksa çocuk süreç için modül yolu önce düzeltilmelidir (ölçülen düzeltme: `Start-Process`
   öncesinde ebeveyn ortamından `PSModulePath` geçici olarak kaldırılır → çocuk kendi varsayılanını kurar → `Get-FileHash=True`).
2. `-Mode QrTest` → R05 kararındaki public portal adresini yazın (canlı `.env` değeriyle eşleşmeli) → QR'ı okutun; portal sayfası (giriş sayfasına yönlenir) açılırsa **E**; giriş yapmayın.
3. `-Mode Run`: pencere teyidi, R05 public portal adresi (https://…), EVET, GO ref. Koşucu önce makine ölçümlerini yapar (D7-1…D7-3F); konsolda QR + giriş bilgisi görünür.
4. Telefonda giriş yapın. Girişten sonra açılan sayfa mesaj sayfası **değildir**: portal **ana sayfası (özet)** açılır (kaynak: giriş sayfası
   `/portal`'a yönlendirir). Üst menüden **Mesajlar sekmesine geçin**; mesaj sayfasında **üç** mesaj görünmeli (ekrandaki `D7-…` metinleri).
   İsterseniz kısa bir mesaj gönderin (kişisel veri yazmayın).
5. Giriş algılanınca ikinci personel yanıtı gelir; mesaj sayfasında yeni mesajı (sayfa listeyi 10 sn'de bir yeniler) ve üst çubuktaki **zil
   simgesinin rozetini** izleyin. Rozet **okunmamış bildirim sayacıdır** (mesaj sayacı değildir; açıklama §9). 120 sn sonra ekran temizlenir, kapatma çalışır.
6. Beyan sorularını (8) yanıtlayın; sayfayı yenileyip gördüğünüzü bildirin. Girişten sonra ana sayfa ya da mesaj sayfası açıldıysa **M**, yine
   giriş sayfası geldiyse **G**, hata sayfası ya da portal dışı bir sayfa geldiyse **D** yazın (§4, R02). Pencereyi kapatın. Mesaj satırları
   DB'de **kalır** (kanıt); silme beklemeyin.
7. **Çıkış 5/6 Recover yetkisi DEĞİLDİR (R02; owner kuralı 2026-10-01).** Run kendi kapanış adımlarını (portal kapatma, personel/dosya kapanışı)
   koşucu İÇİNDE zaten denedi; 5/6 bu adımların doğrulanamadığını söyler. Blok Recover başlatmaz; ajan da otomatik başlatmaz. Önce kanıt dizini
   incelenir (`d7-evidence.json` içindeki `recovery.neden` ve açık kalan kaynaklar) ve sonuç CLIENT'a/owner'a bildirilir; kanıttaki kurtarma
   adımı metni bir **öneridir**, yetki değildir (R03 koşucusu bunu metnin başında yazar: "ÖNERİ (yetki DEĞİL): çıkış kodu Recover yetkisi
   değildir; önce kanıt incelenir. …"; R01/R02 baytlarındaki "… ile BİR KEZ" önerisi kaldırıldı — §13.3).
   Recover (`-Mode Recover -ReceiptFile <kanıt dizinindeki d7-setup-receipt.json>`) yalnız bu inceleme sonrası **AYRI owner onayıyla**, **BİR
   KEZ** koşulur; canlıya ne yazdığı §8.1'dedir; ürün bulgusu varsa Recover onu düzeltmez; kabul tekrarlanmaz. "BİR KEZ" kodla zorlanmaz:
   ikinci bir Recover'ı blok da koşucu da engellemez. Recover'ın çıkış kodu (3/5/6 dahil) yeni bir Recover için yetki değildir; **ikinci bir
   Recover bu paketle tanımlı değildir; owner kararı gerektirir** (§8.1, §10 K-6). Recover sonucu CLIENT'a/owner'a bildirilir.

## 6. Öz-testler (canlıya dokunmadan; 2026-09-29; disposable DB `5449/d67_test`, sahte API 8200/8459, gerçek TLS)

> **Hangi baytlar (R02):** bu tablo ve §6.1 **R01 kayıtlarıdır** (2026-09-29; blok `EDDF7BF3…CA5D`, blok öz-testi `9A5A31F0…70B3`) ve tarihsel
> olarak korunur. Blok ve blok öz-testi R02'de (iki turda) değişti; **son dosya baytlarının sonuçları §6.3'tedir** — güncel durum için §6.3
> okunur. §6.2 "R02 ilk tur" kaydıdır (o turun baytlarıyla) ve tarihsel olarak korunur. `d7-selftest.js` 2026-10-03'de değişti (yalnız kütüphane
> kökü); onun son baytları ve repodaki dosyanın kendisiyle yapılan koşum **§6.4**'tedir.
> **R03 notu (2026-10-03):** koşucu, sahte API, koşucu öz-testi, blok ve blok öz-testi R03'te değişti; **son baytların sonuçları §13.4'tedir**
> (koşucu öz-testi 56/56, blok öz-testi 69/69 iki kabukta). §6.1–§6.4 tarihsel kayıttır.

| Test | Sonuç |
|---|---|
| `d7-selftest.js`: Z1 normal 0 (tüm ölçütler PASS; telefon: sayfa 200 · giriş 201 · 3 mesaj · mark-read · gönderim 201 · 2. yanıt görüldü; kalıntı 5 mesaj + 2 bildirim "yerinde=4/4 … SİLİNMEDİ"; **Z1-g** D7-3G `gövde={client,messages} · listede=3/3`, D7-4S 400 + satır yok, D7-3B `satır=true`, makbuz `runnerMessageIds` 4; admin yalnız yerel; kapanış sonrası telefon oturumu 401) · Z2 liste sızıntısı → D7-2 FAIL, 2 · Z3 kapsam dışı caseId kabul → D7-4N/**4S**/4U FAIL, 2 (kalıntı 8) · Z4-a send 500 → 2 · Z4-b send 500 + kapatma 500 → **6** · Z5 yarım (kapatma 500) 6 → Recover 3 (C4 ölçülemeyen; kalıntı makbuz id'leriyle **gerçek sayım** `yerinde=4/4`) · Z6 mark-read etkisiz → D7-3U FAIL 2 · Z7 bildirim yok → D7-3N FAIL 2 · Z8 guard kusuru → C4 200, ÜRÜN BULGUSU, 6 · **Z14-a** personel yanıtı yanıtsız → D7-3/3N/3U/3F **ÖLÇÜLEMEYEN** (FAIL 0), 3 · **Z14-b** unread-count yanıtsız → D7-3U ÖLÇÜLEMEYEN, 3 · Z9 kapılar (onay 3 · D-5 GO 3 · none+canlı DB 4 · TLS 1 · slug 4 · http 4) · Z10 create 500 → 6, P7-MSG-KEPT **ÖLÇÜLEMEYEN** (boş-doğrulama yok) · **Z10-r** Recover (id listesi yok) → P7-MSG-KEPT ÖLÇÜLEMEYEN · Z10-b geç oluşma görülüp kapatıldı · Z11 konsolsuz 4 · Z12 makbuz 1 · Z13 telefon yok → 3 (`yerinde=3/3`) · S-1 sır sızıntısı (parolalar/JWT/DB URL/GO/**telefon mesajı içeriği**/tuzak içerik) yok · T-1…T-8, P-1/P-2 statik | **41/41 PASS** (üçüncü koşum, inceleme düzeltmeleri sonrası; önceki: 37/37 — §6.1) |
| `d7-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; K-1..K-5 + **K-6/K-6b R05 owner girdisi, K-7 adres biçim kapısı, K-8 çözülmemiş adres**; R-1..R-9; V-1..V-5; L-1/L-2 6 süre; O-1..O-3; M-1 kalıntı metni; Z; Q (+Q-U `/portal/messages` + `d7-qr-test.js`, **+Q-R05**); S-1..S-4 + **S-5 topoloji literali yok**) | **52/52 PASS** WinPS 5.1 ve pwsh 7.6.6 (inceleme düzeltmesi; `d7-owner-block-selftest-fix-*.log`) · **kapanış düzeltmesi (6 yeni test): 58/58 PASS WinPS 5.1.26100 ve 58/58 pwsh 7.6.6**, çıkış 0 (`kapanis-duzeltme\d7-block-selftest-winps.log` / `-pwsh.log`; ilk koşum 57/58: K-7 IPv4 kabulü → kapı düzeltildi) · koşucu öz-testi blok değişikliğinden sonra yeniden: **41/41 PASS** (`kapanis-duzeltme\d7-selftest.log`) |

### 6.1 Koşucu öz-testi sonucu

İlk koşum 34/37: Z3 (kabul edilen kusurlu satırlar liste ölçümünde "yabancı" sayılıyordu → koşucu bunları kendi satırı sayar, D7-4N/4U yine FAIL), Z5-b (test `=== null` yerine `== null`), Z10-b (create zaman aşımı 1,5 sn < geç yazım 3 sn). İkinci koşum **37/37 PASS**, çıkış 0. Kanıt: `HY_R27_AGENT_EVIDENCE\extacc-d7-r01\d7-selftest-run1.log`, `d7-selftest-run2.log`, `selftest-run2-artifacts\` (log/makbuz/kanıt; sink ve sertifika dosyaları kopyalanmadı).
**Üçüncü koşum (inceleme düzeltmeleri, §11): 41/41 PASS, çıkış 0** — `d7-selftest-run3-fix.log`, `selftest-run3-fix-artifacts\`, blok öz-testleri `d7-owner-block-selftest-fix-winps51.log` / `-pwsh7.log`, özet `SUMMARY-FIX-R01.txt`.
Not: 37/37 sonucu D7-3G'deki ürün-sözleşmesi kusurunu yakalayamamıştı (sahte API de çıplak dizi döndürüyordu); düzeltme sonrası koşucu `{ client, messages }` ister ve çıplak dizi FAIL olur.

### 6.2 R02 ilk tur (2026-10-01) — o turun dosya baytlarıyla (tarihsel; son baytların sonuçları §6.3)

Test edilen baytlar (**R02 ilk tur**): blok `09935375…0BFF`, blok öz-testi `0720672D…8BFE` (tam değerler §7; her log ve status dosyası koşum
öncesi/sonrası sha256 taşır). Koşucu, sahte API, QR betiği ve pinli 9 dosya R01 baytlarıdır (değişmedi). Canlı DB, canlı API, canlı yayın dizini ve
canlı günlükler kullanılmadı. Bu bölümdeki "son dosya baytları / son koşum" ifadeleri R02 ilk turunun son baytlarını anlatır; inceleme
düzeltmelerinden sonraki baytlar için §6.3 geçerlidir.

| Test | Sonuç (R02) |
|---|---|
| `d7-owner-block-selftest.ps1` — önceki 58 ölçüt + **G-1** blok kaynağında (yorumlar dahil) "hiçbir … dosya/log/günlük/kanıt/rapor … yazılmaz" türü kapsamsız mutlak iddia yok (451 satır tarandı; desen 4 bilinen mutlak cümleyi yakalar, kapsamı adlandırılmış ve ilgisiz 2 cümleyi yakalamaz) · **G-2** owner'a GÖSTERİLEN canlı veri onayı metni (Write-Host yakalaması): koşucunun yazdıkları → ürünün kendi yazdıkları (kaynaktan okundu; API günlüğü içeriği ölçülmez) → kapanış ("dosyalar CLOSED + personel pasif + portal pasif"; tenant yaşam döngüsü değişmez) → diğer tenantlar için yalnız U-ISO (sayı) sırasıyla; eski "Gerçek müvekkil verisine dokunulmaz" / tek başına "(sentetik tenant CLOSED)" yok; 10 kalem §8'de de geçer · **G-3** Recover başlarken gösterilen bilgi metni: ayrı canlı yazma işlemi, AYRI owner onayı (blok sormaz/ölçmez), "BİR KEZ" kodla zorlanmaz, canlı yazma kümesi; metin node çağrısından önce; yeni soru yok (AST soru komutu 0; kuyruktaki 2 yanıt tüketilmedi); tek node çağrısı (mod `recover`); GO defteri değişmez · **G-4** Run çıkış 5/6 metni Run'ın kendi kapanışını Recover'dan ayırır, "Recover yetkisi değildir / blok başlatmaz / önce kanıt / AYRI owner onayı, BİR KEZ" der; tek node çağrısı (mod `run`); çıkış 0'da Recover metni yok; AST: `Invoke-RunMode` içinde tek `Invoke-Node`, `Invoke-RecoverMode` yalnız akıştaki mod dalında | **62/62 PASS** Windows PowerShell 5.1.26100.9549 ve **62/62 PASS** pwsh 7.6.6 (çıkış 0). Önceki 58 ölçüt değişmeden PASS |
| Negatif kontrol + mutasyon (repo dışı geçici kopya; yeni öz-test + yeni belge): **eski blok baytları** `EDDF7BF3…CA5D`; 6 metin bozması (yoruma mutlak iddia · onay metninden tenant yaşam döngüsü cümlesi silindi · Recover bilgi metninden personelin geçici yeniden aktifleştirilmesi silindi · 5/6 metni eski emre döndü · çıkış 0'da görünen satıra Recover önerisi eklendi · Recover bitişindeki "yeni Recover için yetki değildir" satırı silindi); 1 mantık bozması (Run 5/6 dalına otomatik `Invoke-RecoverMode` çağrısı); bozulmamış kopya | **27/27 beklenenle uyumlu** (9 varyant × WinPS 5.1 + pwsh 7 + mantık eşitliği): eski blok **58/62, çıkış 1, FAIL = tam olarak G-1..G-4**; her metin bozması yalnız hedef ölçütü FAIL ettirdi (61/62); otomatik Recover bozması G-4'ü (ve R-2.5, R-2.6, O-1'i) FAIL ettirdi; bozulmamış kopya 62/62 |
| Mantık eşitliği (AST; yorumlar, Write-Host komutları ve Read-Answer/Read-Host istem metinleri çıkarılır, boşluk normalize) | eski ve yeni blokta kalan kod **birebir eşit** (18304/18304 karakter; 28/28 fonksiyon, fonksiyon başına fark 0; istem 13/13; Write-Host 37 → 65, fonksiyon içi 34 → 62; yorum 39 → 53) WinPS 5.1 + pwsh 7. **İstisna yok** (metin seçen ifade dahil hiçbir kod değişmedi). Negatif kontrol: otomatik Recover çağrısı eklenmiş kopya FARK verir |
| `d7-selftest.js` (bloğu T-3..T-8'de statik okur) | **41/41 PASS**, çıkış 0 — **ayna kopyada**: öz-test Prisma/bcrypt'i sabit olarak canlı yayın dizininden yüklediği ve o dizin bu işte yasak olduğu için, gereken `scripts` dizinleri repo dışına bayt bayt kopyalandı (65 dosya; 64'ü kaynakla sha eşit) ve **yalnız aynadaki `d7-selftest.js` içinde tek satır** (`REL` sabiti) canlı olmayan kütüphane köküne (R27 aday worktree'si) çevrildi. Blok, koşucu, sahte API ve QR betiği aynada **son baytlarla** (sha log/status içinde). Disposable DB `5449/d67_test` (yerel; 130 migration = R27 şeması), sahte API 8200/8459, gerçek TLS. Repodaki `d7-selftest.js` DEĞİŞMEDİ ve **değiştirilmemiş hâliyle bu turda KOŞULMADI** (neden: canlı yayın dizininden kütüphane yükler) — *bu cümle R02 ilk turunun tarihsel kaydıdır; **güncel durum (2026-10-03):** repodaki dosya düzeltildi ve kendisi koşuldu, 41/41 PASS (§6.4); ayna kopya sonucu tarihsel kanıttır* |
| Ayrıştırma + kodlama | iki `.ps1` dosyası WinPS 5.1 ve pwsh 7'de parse hatası 0; UTF-8 BOM korunur; satır sonu LF (CR 0); katı UTF-8 çözümü geçerli; kontrol karakteri (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) 0 — belge dahil üç dosyada |
| Paket digest | pinli 9 dosyadan bloktan bağımsız betikle yeniden hesaplandı: `7C42FCCD…7BDD` = bloktaki `$ExpPackage` (değişmedi); pin listesi eski blokla aynı; pin uyuşmazlığı yok; `ExpLiveDist` / `ExpEnvSha` değişmedi; blok kendi pin listesinde değildir |

**G-1'in sınırı (R02 inceleme).** G-1 yalnız "hiçbir … dosya/log/günlük/kanıt/rapor … yazılmaz" kalıbını (aynı satırda; "hiçbir" → en çok
40 karakter → bu adlardan biri → en çok 40 karakter → "yazılmaz/yazmaz") ölçer; başka biçimli bir mutlak iddiayı (ör. "asla", "hiçbir zaman",
"tüm … silinir", iki satıra bölünmüş cümle) yakalamaz. G-1 PASS, blok kaynağında kapsamsız mutlak iddia bulunmadığının genel kanıtı değildir;
yalnız bu kalıbın bulunmadığını söyler.

Çalışma sırasındaki koşumlar (son koşumdan ayrı): §8 güncellenmeden önceki ilk koşumda G-2 belge eşleşmesi FAIL verdi (61/62; beklenen, log
saklanmadı). `d7-r02\deneme\` altındaki iki deneme koşumu (62/62 ×2 kabuk) ve deneme negatif kontrolü son baytlardan ÖNCEKİ ara baytlara aittir ve
korunur; ikinci denemede öz-test çıktısına gözlem dökümü eklendi (uzun ölçüt adları tablo genişliğinde gözlem sütununu düşürüyordu). Kanıt (repo dışı; loglar PR/belge/public repoya yapıştırılmaz): `HY_R27_AGENT_EVIDENCE\d7-r02\` — `test\` (son koşum logları,
status dosyaları: komut, çıkış kodu, koşum öncesi/sonrası sha256), `negatif\` (varyantlar ve sonuç tablosu), `js-oz-test\` (ayna, manifest, log),
`onceki\` (R01 baytları). Loglar yerel kullanıcı adından arındırılarak yazılır.

### 6.3 R02 inceleme düzeltmeleri (2026-10-01) — SON dosya baytlarıyla

Test edilen baytlar: blok `8B3B22C0…25AE`, blok öz-testi `1BB152D8…7B21` (tam değerler §7; her log ve status dosyası koşum öncesi/sonrası sha256
taşır). Bu turda değişen yalnız blok METNİ (yorum + konsol çıktısı; istem metinleri ve kod değişmedi), blok öz-testi (yalnız yeni metni ölçen G-5 ve
G-6 + başlık yorumu) ve bu belgedir. Koşucu, sahte API, QR betiği, `d7-selftest.js` ve pinli 9 dosya değişmedi. Canlı DB, canlı API, canlı yayın
dizini ve canlı günlükler kullanılmadı; owner bloğu, koşucu ya da sonda **canlıya karşı çalıştırılmadı** (blok öz-testi bloğun yalnız
fonksiyonlarını AST ile yükler; `d7-selftest.js` ayna kopyası koşucuyu yalnız tek kullanımlık test veritabanı ve sahte API'ye karşı başlatır).
**2026-10-03 notu:** bu bölüm blok ve blok öz-testi için hâlâ son baytları anlatır (ikisi de değişmedi). `d7-selftest.js` 2026-10-03'de değişti;
onun son baytları ve repodaki dosyanın kendisiyle yapılan koşum §6.4'tedir. Bu bölümdeki ayna kopya sonucu tarihsel kanıttır.

| Test | Sonuç (son baytlar) |
|---|---|
| `d7-owner-block-selftest.ps1` — önceki 62 ölçüt + **G-5** kalıntı satırının altındaki not (owner'a GÖSTERİLEN metin; Run kapanış doğrulanmadı çıkış 6 · Run çıkış 0 · Recover çıkış 6): "sentetik tenant CLOSED" koşucunun SABİT ifadesidir ve kapanışın doğrulandığını GÖSTERMEZ; kapanış durumu Run'da "Portal erişim kapanışı … DOĞRULANDI / DOĞRULANAMADI" satırındadır (satır kalıntı satırından önce gösterilir), Recover'da çıkış kodu satırındadır; hedeflenen kapanış = dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü DEĞİŞMEZ; eski eşitlik ("sentetik tenant CLOSED" = …) bitiş metninde yok · **G-6** ikinci Recover için yol tanımlanmaz: Recover bitiş metni (taklit betik çıkış 0/3/5/6) "bu çıkış kodu yeni bir Recover için yetki DEĞİLDİR; Recover BİR KEZ koşulur (kodla zorlanmaz); sonuç CLIENT'a bildirilir" ve "ikinci bir Recover bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir" der; Run 5/6 metni aynı kuralı taşır; gösterilen metinlerde ve blok kaynağında (yorumlar dahil; 460 satır tarandı) "tekrar ancak … onayıyla / yeni onayla tekrar edilebilir" türü tekrar yolu yok (desen 4 bilinen tekrar-yolu cümlesini yakalar, 5 ilgisiz cümleyi yakalamaz); bu belgenin §5, §8 ve §10 bölümleri "bu paketle tanımlı değildir" der ve tekrar yolu tanımlamaz | **64/64 PASS** Windows PowerShell 5.1.26100.9549 ve **64/64 PASS** pwsh 7.6.6 (çıkış 0). Önceki 62 ölçüt değişmeden PASS |
| Negatif kontrol + mutasyon (repo dışı geçici kopya; son öz-test): **R01 blok baytları** `EDDF7BF3…CA5D`; **R02 ilk tur blok baytları** `09935375…0BFF`; bozulmamış kopya; 11 blok metin bozması (R02 ilk turdaki 6 bozma + Run kalıntı notu eski eşitliğe döndü · Recover kalıntı notundan "GÖSTERMEZ" silindi · Recover bitişine "tekrar ancak AYRI owner onayıyla" geri kondu · "ikinci bir Recover … TANIMLI DEĞİLDİR" satırı silindi · başlık yorumuna "yeni onayla tekrar edilebilir" eklendi); 1 mantık bozması (Run 5/6 dalına otomatik `Invoke-RecoverMode` çağrısı); 2 belge bozması (§5 adım 7'ye tekrar yolu geri kondu · §8.1'den "tanımlı değildir" cümlesi silindi) | **51/51 beklenenle uyumlu** (17 varyant × WinPS 5.1 + pwsh 7 + mantık eşitliği): R01 bloğu **58/64, çıkış 1, FAIL = tam olarak G-1..G-6**; R02 ilk tur bloğu **62/64, çıkış 1, FAIL = tam olarak G-5, G-6**; her metin/belge bozması yalnız hedef ölçüt(ler)i FAIL ettirdi (Recover bitişindeki yetki cümlesinin silinmesi G-3 ve G-6'yı; diğerleri tek ölçütü, 63/64); otomatik Recover bozması G-4'ü (ve G-5, G-6, R-2.5, R-2.6, O-1'i) FAIL ettirdi; bozulmamış kopya 64/64 |
| Mantık eşitliği (AST; yorumlar, Write-Host komutları ve Read-Answer/Read-Host istem metinleri çıkarılır, boşluk normalize) | **R02 ilk tur bloğu → son blok:** kalan kod **birebir eşit** (18304/18304 karakter; 28/28 fonksiyon, fonksiyon başına fark 0; istem 13/13; Write-Host 65 → 71, fonksiyon içi 62 → 68; yorum 53 → 56). **R01 bloğu → son blok:** yine birebir eşit (18304/18304; Write-Host 37 → 71; yorum 39 → 56). WinPS 5.1 + pwsh 7. İstisna yok. Negatif kontrol: otomatik Recover çağrısı eklenmiş kopya FARK verir |
| `d7-selftest.js` (bloğu T-3..T-8'de statik okur) | **41/41 PASS**, çıkış 0 — yine **ayna kopyada** (yöntem §6.2 ile aynı: 65 dosya bayt bayt kopya, 64'ü kaynakla sha eşit; yalnız aynadaki `d7-selftest.js` içinde tek satır `REL` canlı olmayan kütüphane köküne çevrildi). Blok aynada **son baytlarla** (sha status dosyasında). Disposable DB `5449/d67_test`, sahte API 8200/8459, gerçek TLS. Repodaki `d7-selftest.js` DEĞİŞMEDİ ve değiştirilmemiş hâliyle bu turda da KOŞULMADI — *bu cümle o turun tarihsel kaydıdır; **güncel durum (2026-10-03):** repodaki dosya düzeltildi ve kendisi koşuldu, 41/41 PASS (§6.4); ayna kopya sonucu tarihsel kanıttır* |
| Ayrıştırma + kodlama | iki `.ps1` dosyası WinPS 5.1 ve pwsh 7'de parse hatası 0; UTF-8 BOM korunur; satır sonu LF (CR 0); katı UTF-8 çözümü geçerli; kontrol karakteri (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) 0 — belge dahil üç dosyada |
| Paket digest | pinli 9 dosyadan bloktan bağımsız betikle yeniden hesaplandı: `7C42FCCD…7BDD` = bloktaki `$ExpPackage` (değişmedi); pin listesi R02 ilk tur bloğuyla aynı; pin uyuşmazlığı yok; `ExpLiveDist` / `ExpEnvSha` değişmedi |

Öz-testin ölçmediği: G-5 ve G-6 owner'a gösterilen METNİ (ve G-6 ayrıca blok kaynağını + bu belgenin üç bölümünü) ölçer; kapanışın gerçekten
doğrulanıp doğrulanmadığını, owner onayının verilip verilmediğini ya da ikinci bir Recover'ın engellendiğini ölçmez (blok engellemez — §8.1, §9).
Recover senaryoları koşucunun yerine konan taklit betikle üretilir. G-6'nın tekrar-yolu deseni yalnız dört kalıbı arar ("tekrar ancak", "tekrar
edilebilir", "tekrar gerekiyorsa", "yeni … onayla/onayıyla … tekrar"); başka sözcüklerle yazılmış bir tekrar yolunu yakalamaz.
Kanıt (repo dışı): `HY_R27_AGENT_EVIDENCE\d7-r02\tur2\` — `test\` (son koşum logları + status: komut, çıkış kodu, sha256 önce/sonra),
`negatif\` (varyant üreticisi, koşucu, `son\` sonuç tablosu), `js-oz-test\` (ayna, manifest, log, status), `r02-ilk-tur\` (commit `a71cd2c8`
baytları), `deneme\` (son baytlardan önceki deneme koşumu). Loglar yerel kullanıcı adından ve test DB parolasından arındırılarak yazılır.

### 6.4 R02 koşucu öz-testi kütüphane kökü (2026-10-03) — `d7-selftest.js` SON baytlarıyla, repodaki dosyanın KENDİSİYLE

**Sorun.** `d7-selftest.js` Prisma istemcisini ve bcrypt'i sabit bir yoldan, canlı yayın ağacının `node_modules` dizininden yüklüyordu. Bu yüzden
repodaki dosya canlı ağaca dokunmadan koşulamıyordu; §6.2 ve §6.3 sonuçları yalnız o tek satırı değiştirilmiş **ayna kopyada** üretilmişti.

**Düzeltme (yalnız `d7-selftest.js`; sha256 `2867FBC5…A1E3`, tam değer §7).** Değişen yalnız kütüphane kökü çözümü, ret denetimi ve bir çıktı
satırıdır; öz-testin ölçtüğü 41 ölçütün hiçbiri (T-3..T-8 statik ölçütleri dahil) değişmedi. Koşucu, blok, blok öz-testi, sahte API, QR betiği ve
pinli 9 dosya değişmedi; paket digest aynıdır.

- **Kök nereden gelir.** `D7T_LIB_ROOT` ortam değişkeni verilirse o; verilmezse betiğin bulunduğu checkout'un proje kökü (betik konumundan göreli
  çözülür). Modüller kökün altında eskisiyle aynı göreli yolda aranır (`node_modules\.pnpm\…` — Prisma istemcisi 5.22.0, bcrypt 5.1.1).
- **Canlı ağaç reddi.** Kök canlı yayın ağacının altındaysa test **koşmaz** (çıkış 2). Bu ret, kökte hiçbir dosya yoklanmadan ve hiçbir modül
  yüklenmeden **önce**, yalnız yol karşılaştırmasıyla yapılır (büyük/küçük harf, düz/ters bölü, `..` parçaları normalize edilir). Kök ya da iki modül
  dizini bir bağlantı (junction / symlink) üzerinden canlı ağaca çözülüyorsa test yine koşmaz (gerçek yol okunur; modül yüklenmez).
  *R02-b düzeltme notu: "kökte hiçbir dosya yoklanmadan önce" ifadesi yalnız ad karşılaştırmasının tanıdığı yol yazımları için geçerlidir
  (aşağıdaki Negatif (b) satırında ölçülen dört biçim). Uzun yol önekiyle (`\\?\C:\…`) verilen bir canlı kök ad karşılaştırmasından geçer ve
  ancak dosya yoklamasından **sonraki** gerçek yol denetiminde reddedilir — ayrıntı bu bölümün "Sınırlar" listesinde.*
- **Canlı ağaç yolu dosyada literal değildir.** Yol owner bloğunun `$Rel` sabitinden okunur (blok yalnız metin olarak okunur, çalıştırılmaz). Blok
  canlı ağaç değiştiğinde ret denetimi kendiliğinden onu izler. `$Rel` okunamazsa ret denetimi yapılamayacağı için test başlamaz (çıkış 2).
- **Sessiz geri düşüş yok.** Kök yoksa ya da modüllerden biri kökte bulunamazsa test açık bir mesajla ve çıkış 2 ile durur; canlı ağaca düşmez.
- **Çıktı.** Kullanılan kök ve kaynağı (`D7T_LIB_ROOT` / betik konumu) koşumun ilk satırında yazılır; yerel kullanıcı adı maskelenir.

**Repodaki dosyanın koşum komutu** (ayna/kopya değil; parola ve bağlantı dizesi belgeye yazılmaz):

```powershell
$env:D7T_LIB_ROOT = '<bağımlılıkları kurulu, canlı OLMAYAN bir checkout>\project'
$env:D7T_DB_URL   = '<tek kullanımlık test Postgres bağlantı dizesi; yerel 5449/d67_test olmak zorunda>'
node project\docs\governance\client-extacc-portal-d7-r01\scripts\d7-selftest.js
```

*R03 notu:* DB kapısı genelleştirildi — `D7T_DB_URL` yalnız `127.0.0.1`, 5432 dışı bir port ve `_test` ile biten (`hukuk_db` olmayan) bir
veritabanı adı ister (port sabit değil; kendi tek kullanımlık konteyneriniz); `%TEMP%\d67-test-pg.url` artık okunmaz; koşucuya beklenen DB adı bu
addan verilir. Yukarıdaki "5449/d67_test olmak zorunda" ifadesi R02 baytlarının kaydıdır (§13.4).

Bu turda kullanılan kök: R27 aday çalışma ağacının proje kökü (`HY_WT_R27\project`; canlı yayın ağacı değildir, `node_modules` gerçek dizindir —
bağlantı değil). Ortam önceki ayna koşumlarıyla aynıdır: tek kullanımlık test Postgres `5449/d67_test` (yerel), sahte API 8200/8459, gerçek TLS.

| Ölçüm (2026-10-03) | Sonuç |
|---|---|
| `d7-selftest.js` — **repodaki dosyanın kendisi**, `D7T_LIB_ROOT` = canlı olmayan kök | **41/41 PASS**, çıkış 0 (önceki ayna koşumlarıyla aynı sayı). İlk çıktı satırı kullanılan kökü yazar. Status dosyası: komut, çıkış kodu, koşum öncesi/sonrası sha256 (değişmedi), git blob kimliği |
| Negatif (a) — `D7T_LIB_ROOT` verilmedi; betiğin checkout'unda `node_modules` yok | çıkış 2, "kütüphane kökünde modül bulunamadı: @prisma/client, bcrypt … test BAŞLAMADI"; hiçbir ölçüt koşmadı |
| Negatif (b) — kök canlı yayın ağacının altında (dört biçim: bloğun `$Rel` değeri · ağaç kökü, küçük harf + düz bölü · bir alt dizin · `..` parçalı) | dördünde de çıkış 2, "kütüphane kökü canlı yayın ağacının altında … test BAŞLAMADI". Ön yükleme sondası (aşağıda): canlı ağaç altında **modül yükleme 0, modül çözümü 0, fs çağrısı 0**; alt süreç 0 — ret, `require`'dan ve dosya yoklamasından önce |
| Negatif (c) — var olmayan kök | çıkış 2, "kütüphane kökü yok … test BAŞLAMADI" |
| Negatif (d) — var ama `node_modules` içermeyen kök | çıkış 2, "kütüphane kökünde modül bulunamadı …" |
| Ek (yalnız bu dallar için **ayna**, ana sonuç değildir): kök bağlantı üzerinden "canlı" ağaca çözülüyor · yalnız `node_modules` bağlantı · blok yok | 4/4 beklenen: bağlantılı iki durumda çıkış 2, "bağlantı üzerinden canlı yayın ağacına çözülüyor"; blok yokken çıkış 2, "`$Rel` okunamadı". Bu dallar repodaki konumda canlı ağaca dokunmadan üretilemez; öz-test dosyası bayt bayt kopyalandı (sha eşit), yalnız aynadaki blok kopyasında `$Rel` satırı kanıt dizinindeki **sahte** bir ağaca çevrildi (gerçek canlı ağaç kullanılmadı) |
| `d7-owner-block-selftest.ps1` (blok ve blok öz-testi baytları değişmedi; belge son baytlarla) | **64/64 PASS** Windows PowerShell 5.1.26100.9549 ve **64/64 PASS** pwsh 7.6.6 (çıkış 0). Blok `8B3B22C0…25AE` ve blok öz-testi `1BB152D8…7B21` koşum öncesi/sonrası aynı. *R02-b notu: "belge son baytlarla" bu turun (kütüphane kökü) belge baytlarını anlatır; R02-b eklerinden (§12.3) ve bağımsız doğrulama düzeltmelerinden sonra blok öz-testi belgenin son hâliyle **yeniden koşuldu** (2026-10-03, tur 5): 64/64 ve 64/64, çıkış 0; blok ve öz-test özetleri aynı — G-2 ve G-6 bu belgeyi okur* |
| Paket digest | pinli 9 dosyadan bloktan bağımsız betikle yeniden hesaplandı: `7C42FCCD…7BDD` = bloktaki `$ExpPackage` (değişmedi); `d7-selftest.js` pin listesinde değildir |

**Sondanın ölçtüğü ve ölçmediği.** Sonda (`node -r` ile yüklenen, kanıt dizinindeki ölçüm betiği) öz-test sürecinin canlı ağaç ön eki altındaki
bir yola yaptığı modül yüklemelerini (`Module._load`, `Module._resolveFilename`), eşzamanlı `fs` çağrılarını ve alt süreç başlatmalarını sayar.
Pozitif kontrol: aynı sonda canlı olmayan kök için fs çağrısı 3, modül yükleme 1 saydı (kör değil). Sonda yalnız öz-testin kendi sürecini ölçer;
ret durumlarında alt süreç başlamadığı için (sayı 0) kapsam tamdır. Bu ölçümlerde canlı yayın ağacı yoklanmadı: yol yalnız ortam değişkeni değeri
olarak verildi.

**Sınırlar.**
- Blok dosyası yoksa öz-test artık başlamaz (çıkış 2); önceki baytlarda dinamik senaryolar koşar, T-3 FAIL ile çıkış 1 verirdi. Blok mevcutken
  ölçülen hiçbir şey değişmedi.
- Yol karşılaştırması UNC biçimli (`\\sunucu\paylaşım\…`) bir kökü canlı ağaçla eşleştirmez; bağlantılar gerçek yol okunarak yakalanır, ağ
  paylaşımı üzerinden verilen bir kök yakalanmaz. Denetim yanlışlıkla canlı ağaçtan yüklemeyi önler; kasıtlı atlatmaya karşı bir güvenlik sınırı
  değildir.
- **Uzun yol önekli kök (R02-b; kaynaktan okundu + ifade kopyasıyla ölçüldü; öz-testin kendisi bu biçimle koşulmadı).** Kök, uzun yol
  önekiyle (`\\?\C:\…` biçimi) canlı yayın ağacını gösterecek şekilde verilirse ad karşılaştırması onu **yakalamaz**: karşılaştırma önekli
  yazımı, sürücü harfiyle başlayan ağaç yoluyla eşleştirmez. Öz-test bu durumda kökün varlığını ve iki modül dizinindeki `package.json`
  dosyalarını **yoklar** (dosya sistemi çağrıları canlı ağaca gider); ardından gerçek yol denetimi öneksiz yolu okur ve test "bağlantı
  üzerinden canlı yayın ağacına çözülüyor ya da gerçek yolu okunamadı" mesajıyla, çıkış 2 ile **başlamaz**; modül yüklenmez. Bu ret, bloğun
  `$Rel` yazımı kendi gerçek yoluyla aynıysa geçerlidir (yolda bağlantı ya da 8.3 kısa ad bileşeni yoksa; **ölçülmedi** — canlı ağaç
  yoklanmadı). 8.3 kısa adlı yazım da ad karşılaştırmasının tanımadığı aynı sınıftadır. Yani bu biçimde
  ret, dosya yoklamasından **önce değil sonra** gelir; "Canlı ağaç reddi" maddesindeki cümle ve Negatif (b) satırındaki "fs çağrısı 0" ölçümü
  yalnız orada sayılan dört biçim için geçerlidir. Önekli kök var olmayan bir yolu ya da modül taşımayan bir alt dizini gösteriyorsa ret,
  gerçek yol denetimine gelmeden "kütüphane kökü yok" ya da "modül bulunamadı" mesajıyla verilir (yine çıkış 2; modül yüklenmez; yoklama
  yine yapılmıştır).
  Ölçüm (2026-10-03): öz-testteki iki ifade (`underLive`, `realOf`) birebir kopyalanıp canlı ağaç yerine geçici bir **vekil** dizinle
  çalıştırıldı (node v24.18.0): önekli yazımda ad karşılaştırması `false`, varlık yoklaması `true`, gerçek yol öneksiz, gerçek yol
  karşılaştırması `true`; aygıt önekli yazım (`\\.\C:\…`) aynı sonucu verdi. Bu bir ifade kopyası ölçümüdür, öz-test koşumu değildir; canlı
  yayın ağacı yoklanmadı. UNC maddesindeki kayıt burada da geçerlidir: denetim yanlışlıkla canlı ağaçtan yüklemeyi önler; kasıtlı atlatmaya
  karşı bir güvenlik sınırı değildir.
- Ret yalnız kütüphane kökünü kapsar; öz-test betiğinin kendisinin hangi dizinden çalıştırıldığı denetlenmez.
- Kök, tek kullanımlık test veritabanının şemasıyla uyumlu bir Prisma istemcisi taşımalıdır (bu turda R27 aday ağacı; test veritabanı R27 şeması).
  Şeması farklı bir kök verilirse senaryolar FAIL ya da ölçülemedi verebilir — bu, kökün yanlış seçildiğini gösterir, ürün bulgusu değildir.
- D-4, D-5 ve EXTACC paketlerinin öz-testleri aynı sabit kütüphane kökünü taşır; bu düzeltme yalnız D-7 öz-testini kapsar.
- Öz-test önceki gibi disposable DB'de satır ve `%TEMP%\d7-selftest-*` dizini bırakır (§9).

**Ayna kopya sonucu tarihsel kanıttır.** §6.2 ve §6.3'teki ayna koşumları (`d7-r02\js-oz-test\`, `d7-r02\tur2\js-oz-test\`) o turların kaydı olarak
korunur; güncel sonuç bu bölümdeki, repodaki dosyanın kendisiyle yapılan koşumdur.
Kanıt (repo dışı): `HY_R27_AGENT_EVIDENCE\d7-r02\tur4\` — öz-test logu + status (komut, çıkış kodu, sha256 önce/sonra), negatif ölçüm logları ve
sonda çıktıları, ek ayna ölçümü, blok öz-testi logları (iki kabuk), paket digest ve ayrıştırma/kodlama logları, kullanılan betikler. Loglar yerel
kullanıcı adından ve test DB parolasından arındırılarak yazılır.

## 7. Pinler

| Dosya | sha256 |
|---|---|
| `d7-portal-messages-live-run.js` **R03-d** (son baytlar; §14.5; bloğun PkgPins'inde) | `27BFE5CE5427EA7BB0C68B86064972994513DBCA373155EDC38092A3F74326AA` |
| `d7-owner-live-block.ps1` **R03-d** (son baytlar; koşucu pini + `$ExpPackage` + Recover bitiş satırı kanıt ölçümü (`Get-RecoverEvidenceState`) ve 3'ün metni + Run 5/6 bayat makbuz / TEK komut + ürün bulgusu ADAYI gösterimi; §14.5) | `9B409218FCB48532DDF56A72071A1D186CDE714200AD4F80A0B97C025F5DB63B` |
| `d7-owner-block-selftest.ps1` **R03-d** (son baytlar; O-6, O-8 değişti + O-9, O-10 yeni; sahte koşucu kanıta record + exitCode + makbuzJson yazar; 72 ölçüt) | `66FE3BFC0954C0CDA59BFE1945256E65060305EB58367DFEB69E0A5982147034` |
| `d7-fake-portal-api.js` **R03-d** (son baytlar; `reopen afterDisable` sürümü ürün gibi artırır + `afterDisableRevert`) | `30B29115311EBF4663DA24F0A1A8748E968DD04AEC3EC16171B403AB524FD122` |
| `d7-selftest.js` **R03-d** (son baytlar; Z20-a..d yeni; Z18, Z19-a, Z19-b, C-1 değişti; 63 ölçüt) | `3EA4AAAC35D94E77FFB311A5ABBB53BFC044A25C6D9FA2D6EA3B473FBD27C203` |
| `d7-qr-test.js` (değişmedi) | `15E6431396E978423BAE72F3B7511F3972F12847EF96AA02C12937E0F2233E15` |
| önceki (**R03-c** son baytlar): koşucu · blok · blok öz-testi · sahte API · koşucu öz-testi | `08B5CA7A…E501` · `75B5E8E6…0DF6` · `A63945DE…2247` · `387A923B…2920` · `8AC501B7…8B1E` |
| önceki (**R03** son baytlar): koşucu · blok · blok öz-testi · sahte API · koşucu öz-testi | `F4B9BE18…22D3` · `4BAE9DE0…964D` · `A2EE5703…906D` · `CA4BDA3D…637B` · `120049AC…09B5` |
| önceki (R01 düzeltme; R02'de değişmedi): `d7-portal-messages-live-run.js` | `E752DA1EFCA9B8C7529CC0EC66B4F90530025FBF9918F4A9B56DBB3A6916D2B6` (ondan önce `3A58DF7C…4D55`) |
| önceki (**R02** son baytlar; inceleme düzeltmeleri dahil; yalnız metin): `d7-owner-live-block.ps1` | `8B3B22C0FD9A08DE61C58EEEE8423A7FA5884B43FE680363F96FCFCDA50C25AE` |
| önceki (**R02** son baytlar; G-1..G-6 + gözlem dökümü): `d7-owner-block-selftest.ps1` | `1BB152D876A264BC91F3262AB40BAC25C326F563B6506E374427C0ADAB557B21` |
| önceki (**R02 ilk tur**, commit `a71cd2c8`): `d7-owner-live-block.ps1` | `0993537584078789A9B199B8DA3BA9B40DFB31055C8517C2F974B5E66F7E0BFF` (yalnız metin farkı; mantık eşitliği §6.3) |
| önceki (**R02 ilk tur**, commit `a71cd2c8`): `d7-owner-block-selftest.ps1` | `0720672D86217990B19D4C3C4D7F53972DA999200DBEB9CADBFF7998A0988BFE` (G-1..G-4 + gözlem dökümü; 62 ölçüt) |
| önceki (R01 kapanış düzeltmesi): `d7-owner-live-block.ps1` | `EDDF7BF39231B67726528061654E2B668CABE48104059D9ACCB5D83B0C36CA5D` (host/kullanıcı yolu literali kaldırıldı, R05 owner girdisi + adres biçim kapısı; ondan önce `2F62C6C9…26DE8`, `881ABCB0…1427`) |
| önceki (R01 kapanış düzeltmesi): `d7-owner-block-selftest.ps1` | `9A5A31F0AA208EC85434C72D7F9C91E910C8DF34E61E29A13F6BC3516B1470B3` (6 yeni test; ondan önce `6574F027…D26E0`) |
| önceki (R01/R02; R02'de değişmedi): `d7-fake-portal-api.js` | `7B9D32388A34E91088B316147BCCE6E7AC66EC30AEDFFA4C8F841FE9461EBD7D` |
| önceki (**R02 kütüphane kökü düzeltmesi**; 2026-10-03; §6.4): `d7-selftest.js` | `2867FBC58282982F79218F2A468884677626B89D34BE91F963FB58FEAD32A1E3` |
| önceki (R01 düzeltme baytları; R02'nin ilk iki turunda değişmedi): `d7-selftest.js` | `D5E12B00D1F708D056F1949CAE9EC76519DF3B71F4CBCDC0C67473CE630345DB` (kütüphane kökü sabit olarak canlı yayın dizini; yalnız ayna kopyada koşuldu) |

**Paket digest (R03-d; blok içinde `$ExpPackage`): `1E046F24A1443081908F2040791C6891D895F57C31FF33CDE4CD20C8D8D6C89D`** — pin listesindeki 9 dosyadan
bloktan bağımsız betikle yeniden hesaplandı (9 pin, uyuşmazlık 0; R03-d'de pin listesinde değişen yalnız koşucu satırı;
`r04\recover-dogrulugu\r2\d7\test\pin-dogrulama-son.log`). Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer. Aşağıdaki paragraf R03-c kaydıdır.

**Paket digest (R03-c; R03-d'de geçersiz): `97C9F56AE550FF0048CBB606071109E2C8F33158714482C48B25ECC46E528CE3`** — pin listesindeki 9 dosyadan
bloktan bağımsız betikle yeniden hesaplandı (9 pin, uyuşmazlık 0; R03-c'de pin listesinde değişen yalnız koşucu satırı;
`r04\recover-dogrulugu\d7\test\pin-dogrulama-yeni.log`). Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer. Aşağıdaki paragraf R03 kaydıdır.

**Paket digest (R03; R03-c'de geçersiz): `3CF44049643447DED5F925F11DADCE67ECFBCD8D213B107E9E96AB6C5F96EA59`** — pin listesindeki 9 dosyadan bloktan
bağımsız betikle yeniden hesaplandı (9 pin, uyuşmazlık 0; R03'te pin listesinde değişen yalnız koşucu satırı). Yöntem doğrulaması: aynı betik
`origin/main` aynasında (R02 baytları) `7C42FCCD…7BDD` = eski `$ExpPackage` verdi. Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer.
`ExpLiveDist` (R27 `E28A6863…5134`) ve `ExpEnvSha` **değişmedi**. Canlı Preflight'ın paket/senkron kapısı ancak bu dosyalar main'e merge edilip ana
checkout senkron olduğunda geçer (bloğun `$Repo` yolu ana checkout'tur). Bu bölümün aşağısı R01/R02 kaydıdır.

Önceki paket digest (R01/R02; R03'te **geçersiz**): `7C42FCCD6349F95E42128F78CA1A86DF36EB20E246FD0D9936A8B1098DBA7BDD` (ondan önce `ABA91BAA…320E`) —
bağımsız yeniden hesaplama ile **eşit** (`kapanis-duzeltme\pin-dogrulama.txt`: 9 pin, uyuşmazlık 0; blok dosyası PkgPins'te değildir, blok
değişince digest değişmez); `ExpLiveDist` = R27 `E28A6863…5134`; `ExpEnvSha` = EXTACC bloğuyla aynı.
R02'de değişen yalnız blok (metin) ve blok öz-testidir; ikisi de pin listesinde değildir. Paket digest R02 baytlarıyla bloktan bağımsız betikle
yeniden hesaplandı ve `7C42FCCD…7BDD` ile eşit bulundu (R02 ilk tur: `d7-r02\test\paket-digest.log`; son baytlar: `d7-r02\tur2\test\paket-digest.log`).
Blok sha'sı değiştiği için R01 ya da R02 ilk tur baytlarıyla yapılmış bir Preflight/QrTest sonucu (varsa) son baytları kapsamaz; bloğun `$Repo` yolu
ana checkout olduğundan Preflight paket/senkron kapısı ancak bu dosyalar main'e merge edilip main senkron olduğunda geçer. R02 satırlarındaki
(blok ve blok öz-testi; son baytlar ve "R02 ilk tur") sha256 değerleri dosyaların ham baytlarından ölçülmüştür (UTF-8 BOM dahil, satır sonu LF).
2026-10-03 düzeltmesinde değişen yalnız `d7-selftest.js` ve bu belgedir; `d7-selftest.js` pin listesinde değildir (blok onu okumaz ve çalıştırmaz).
Paket digest o baytlarla yeniden hesaplandı ve `7C42FCCD…7BDD` ile eşit bulundu (`d7-r02\tur4\paket-digest.log`); blok ve blok öz-testi sha256
değerleri değişmedi. `d7-selftest.js` satırındaki değer dosyanın ham baytlarından ölçülmüştür (BOM yok, satır sonu LF).

## 8. Canlıda oluşacak kayıtlar ve kapanış

Bu liste owner bloğunun canlı veri onay metnindeki kalemleri **kapsar** (R02; öz-test G-2: 10 kalem iki yerde de geçer); §8 ek ayrıntı taşır
(ör. kullanıcı sayısı, dosya numaraları, audit eylem adları, okundu bayrakları — bunlar onay metninde yoktur). Kaynak: koşucu `E752DA1E…D2B6` + `i3-lib.js` `setupI3` + R27 aday commit'indeki `portal.service.ts` — **kaynaktan okundu, canlıda koşulmadı**.
**R03 notu:** koşucu R03'te (`F4B9BE18…22D3`) yazılan kayıt kümesi **aynıdır**; değişen sıradır — makbuz kurulumdan hemen sonra, iki ek dosyadan
**önce** yazılır (§13.1). Run'ın kapanışındaki tek yeniden giriş (§13.2) DB'ye yazmaz (kaynaktan okundu); yeniden deneme başarılıysa yazma kümesi
normal kapanışla aynıdır.

**Koşucunun yazdıkları (Run).** Bu koşum için İKİ yeni sentetik tenant: hedef `ah-<runId>` ve yabancı `ah-<runId>-x`. Hedef tenantta sentetik
personel kullanıcıları (9 kullanıcı; avukat/personel profilleri ve bir yetki kaydıyla), iki sentetik müvekkil, iki dosya (`I3-<runId>` ve ikinci
müvekkile bağlı `I3-<runId>-s`, yalnız D7-4S için) ve bir borçlu (+ dosya bağları); yabancı tenantta bir sentetik müvekkil ve bir dosya
(`I3-<runId>-xf`, yalnız D7-4N için). Sentetik müvekkile BİR portal hesabı (`.invalid` adres; e-posta yok). **PortalMessage**: koşucu 4 (müvekkil
×2, personel ×2) + telefondan gönderilirse +1; **PortalNotification**: 2 (personel yanıtı başına 1).

**Ürünün kendi yazdıkları (kaynaktan okundu).** Portal erişimi açma/kapatma **audit** satırları (`CLIENT_PORTAL_ACCESS_ENABLE` / `…_DISABLE`);
portal **giriş sayacı** ve son giriş zamanı (her başarılı portal girişinde); okundu bayrakları (`mark-read`, personel listesi); canlı API
**uygulama günlüğü**nde portal hesabı / portal girişi / mesaj gönderimi satırları (maskeli sentetik adres ya da müvekkil kimliği ile).
**E-posta/SMS yok** (mesaj akışı kaynakta gönderim üretmez — §2). API günlüğünün tam içeriği bu paketle **ölçülmez**; blok canlı API uygulama
günlüğünün içeriğini ölçmez, değiştirmez, silmez; yalnız başlatıcı günlüğündeki DB kimliği satırını okur (salt okuma kapısı).

**Kapanış sonrası durum.** Portal hesabı pasif + sürüm artmış, müvekkil portal erişimi kapalı, **personel pasif** (iki sentetik tenantın tüm
kullanıcıları; sürüm artmış), **dosyalar CLOSED**. Tenant kaydı kapatılmaz: **tenant yaşam döngüsü değişmez** (§3 notu). **Mesaj/bildirim
satırları yerinde kalır** ve kanıtta "saklandı" olarak raporlanır (silinmiş gibi DEĞİL).

**Diğer tenantlar.** Koşucunun yazma hedefleri kimlik bağı kapısıyla bu iki sentetik tenanta bağlıdır (kaynak); diğer tenantlar için **ölçülen**
yalnız **U-ISO**'dur: tenant başına kullanıcı ve müvekkil SAYISI önce/sonra aynı — içerik karşılaştırılmaz (sınırları §9).

### 8.1 Recover ne yazar (R02) — Run'ın kendi kapanışından AYRI bir canlı yazma işlemi

Recover kabul ölçütlerini koşmaz; yalnız kapanışı yeniden dener ve **canlıya yazar**. Yazma kümesi (koşucu `recoverMode` + `closePortal` +
`i13-lib.js` `closeAccess` kaynağından okundu; canlıda koşulmadı; öz-testte sahte API ile Z5 senaryosunda koşulur):

1. **Portal hâlâ açıksa** (hesap aktif ya da müvekkil erişim bayrağı açık): makbuzdaki sentetik personel (elev1) **geçici olarak yeniden
   aktifleştirilir ve parola özeti yeniden yazılır** (`User.isActive=true` + yeni `passwordHash`; parola bloğun o Recover koşumu için ürettiği rastgele
   değerdir; blok ve koşucu onu kendi kanıt/log dosyalarına yazmaz); o personelle yerel API'de oturum açılır ve yetkili uç çağrılır (`POST /portal/admin/disable-user`, en çok 2
   deneme): portal hesabı pasif + sürüm artışı (+ bekleyen sıfırlama alanları temizlenir), müvekkil portal erişimi kapalı, **kapatma audit
   satırı** (`CLIENT_PORTAL_ACCESS_DISABLE`; aktör: sentetik personel).
2. **Portal DB'de kapalı durumdaysa** (1. adımla ya da önceden): pasif portal hesabına **yalnız ölçüm için yeni rastgele parola özeti**
   yazılır (`ClientPortalUser.passwordHash`; hesap pasif kalır) ve bu parolayla yerel + dış adresten giriş **denenir** (401 beklenir; P7-C3L/C3D).
3. **Personel/dosya kapanışı (`closeAccess`)**: iki sentetik tenantın TÜM kullanıcıları pasif + sürüm artışı (her çağrıda yeniden artar), açık
   dosyalar CLOSED. 1. adımda aktifleştirilen personel burada yeniden pasifleştirilir; bu adım doğrulanmazsa personel **aktif kalmış olabilir**
   (çıkış 5; portal da doğrulanmadıysa 6).
4. Makbuzun yanında yeni bir `recover-<zaman>-<id>` kanıt dizini (`d7-evidence.json`, `d7-recover.log`, `SHA256-MANIFEST.txt`).

Recover'ın **yazmadıkları**: GO defteri değişmez, GO sorulmaz; mesaj/bildirim satırları silinmez; `Tenant` satırına yazma yoktur; kimlik bağı
(makbuz ↔ tenant/slug/runId) doğrulanmazsa koşucu canlı DB'ye yazmadan durur (çıkış 4). Recover **U-ISO ölçmez**. Canlı API uygulama günlüğüne
düşen satırlar (personel/portal girişi denemeleri) bu paketle ölçülmez.

**"Recover BİR KEZ" kuralı kodla zorlanmaz.** Blok Recover'da GO sormaz, defter tutmaz ve aynı makbuzla ikinci bir Recover'ı engellemez; koşucu
da engellemez. İkinci bir Recover yukarıdaki yazmaları **yeniden** yapar (ör. kullanıcı sürümleri yeniden artar, pasif portal hesabına yeniden
ölçüm parolası özeti yazılır). Kural owner disiplinidir: Recover yalnız kanıt incelendikten sonra, AYRI owner onayıyla, bir kez başlatılır;
Recover'ın çıkış kodu (3/5/6 dahil) yeni bir Recover için yetki değildir. **İkinci bir Recover bu paketle tanımlı değildir; owner kararı
gerektirir** (§10 K-6) — bu belge ve blok metni ikinci bir Recover için koşul ya da yol tanımlamaz (öz-test G-6).
Koşucunun Recover kanıtındaki kurtarma adımı (R03; `recoveryAdvice` + `recoverStepText`): Recover kurtarma gerektiren bir sonuçla biterse
`recovery.adim` "ÖNERİ (yetki DEĞİL): kanıt incelenir ve sonuç CLIENT'a bildirilir. Bu çıkış kodu yeni bir Recover için yetki değildir; İKİNCİ bir
Recover bu paketle TANIMLI DEĞİLDİR, owner kararı gerektirir." der; çıkış 3'te metin kanıttaki verdict'lerden kurulur ("ÖNERİ (yetki DEĞİL): Recover
TEKRARLANMAZ — kanıttaki portal DB ölçütleri: P7-C2=… · P7-C5=…; ÖLÇÜLEMEYEN satırlar (…) Run kanıtıyla değerlendirilir"). R01/R02 baytlarındaki
"Owner bloğu `-Mode Recover -ReceiptFile <makbuz>` ile BİR KEZ" önerisi ve çıkış 3'teki sabit "DB kapalı" iddiası **kaldırıldı** (öz-test C-1, Z17).
Bu metin bir öneridir; yetki değildir ve ikinci bir Recover'ı tanımlamaz. R03 makbuzu ayrıca `setupComplete` alanını taşır; Recover bunu kanıtta
`setupEvidence` olarak raporlar (makbuz yarım kurulumdan geldiyse "Run kurulumu YARIM kalmıştı").

## 9. Sınırlar

- Sahte API ürünün kendisi değildir: ürünün gerçek guard/rol davranışı, `resolveCaseReference` 400'ü, bildirim üretimi ve tenant yaşam döngüsü
  yalnız canlıda ölçülür. Öz-testte "telefon" bir istemci taklididir.
- D7-5 (dış admin uçları 403) bu pakette ölçülmez; D-8 sondasının kaydıyla birlikte değerlendirilir.
- Okunmamış sayacının telefonda görünen değeri owner beyanıdır; web sayfası açılışta mark-read çağırdığından koşucu 2. yanıt sonrası sayacı yalnız raporlar.
- **Rozet = bildirim sayacı (R02).** Telefonda görülen rozet, üst çubuktaki zil simgesinin üzerindeki sayıdır ve **okunmamış `PortalNotification`**
  sayısını gösterir (`GET /api/portal/notifications/unread-count`; 30 sn'de bir yenilenir; 9'dan büyükse "9+"). **Mesaj** okunmamış sayacı
  (`GET /api/portal/messages/unread-count`, D7-3U'nun ölçtüğü API değeri) web arayüzünde bir rozet olarak **gösterilmez** (web kaynağında bu uca
  çağrı yok). Koşum iki personel yanıtı için iki bildirim satırı yazar; mesaj sayfasını açmak bildirimleri okundu yapmaz, bu yüzden rozet
  koşucunun raporladığı mesaj sayacından farklı bir değer gösterebilir. Rozet değeri yalnız owner beyanıdır ve yargılanmaz. Kaynak: R27 aday
  commit'indeki `apps/web/src/app/portal/layout.tsx`, `login/page.tsx`, `messages/page.tsx` (main ile fark 0); canlı web derlemesi ölçülmez (aşağıda).
- **Web derlemesi ölçülmez (R02).** Blok canlı **API** dist'ini pinler; canlı **web** derlemesi (`.next`) pinlenmez ve bu paketle ölçülmez.
  Giriş sonrası açılan sayfa (ana sayfa), Mesajlar sekmesi, mesaj sayfasının 10 sn'lik yenilemesi ve rozet davranışı **kaynak okumasına**
  dayanır; canlıdaki davranış yalnız owner beyanıyla gözlenir. Canlı web derlemesi kaynakla aynı değilse §5 adımlarındaki ekran tarifleri tutmayabilir.
- **U-ISO sınırı (R02).** U-ISO yalnız **sayı** ölçer: bu koşumun iki sentetik tenantı dışındaki tenantlarda tenant başına `User` ve `Client`
  satır sayılarının önce/sonra özetini karşılaştırır. İçerik değişikliğini, başka tabloları (dosya, mesaj, audit vb.) ve iki ölçüm arasında
  birbirini götüren ekleme+silmeyi **görmez**; PASS "başka tenanta dokunulmadı" kanıtı değildir, yalnız "bu iki sayım değişmedi" demektir.
  Koşum sırasında (20 dk'lık telefon beklemesi dahil) canlıda başka bir tenantta kullanıcı ya da müvekkil eklenir/silinirse U-ISO **FAIL** olur
  (koşumdan bağımsız değişiklik; koşucu ayırt edemez) — bu durumda sonuç CLIENT tarafından incelenir. Recover U-ISO ölçmez.
- Recover'da mevcut oturum reddi ölçülemez (oturum saklanmaz) → portal hesabı varken Recover çıkışı en iyi 3 (hesap hiç oluşmadıysa C3/C4 satırı üretilmez).
- **Recover çıkış 0, koşucu mantığında fiilen ulaşılamaz (R02 inceleme, D7-E11 b; kaynaktan okundu, canlıda koşulmadı).** Bloğun Recover
  özetindeki "0 kapanış + HTTP reddi doğrulandı" ifadesi çıkış kodu açıklamasıdır; koşucunun `recoverExitCode` kuralında 0 yalnız hiç
  ÖLÇÜLEMEYEN satır yoksa döner. Portal hesabı **varsa** mevcut oturum reddi (P7-C4L/C4D) Recover'da ÖLÇÜLEMEYEN'dir (oturum saklanmaz). Hesap
  **yoksa** Run'da mesaj ölçümleri koşmamıştır, makbuzda `runnerMessageIds` bulunmaz ve mesaj kalıntısı (P7-MSG-KEPT) ÖLÇÜLEMEYEN olur. İki
  durumda da en iyi çıkış **3**'tür (PASS sayılmaz). Dayanak: portal hesabı satırının koşucu dışında silinmediği varsayımı (koşucu ve ürünün
  kapatma ucu hesabı silmez; API kaynağında hesabı doğrudan silen bir çağrı bulunmadı; şema düzeyinde zincirleme silme incelenmedi). Blok
  öz-testindeki Recover çıkış 0 senaryoları (V-1, Z-8, G-3, G-6) koşucunun yerine konan taklit betikle üretilir; koşucunun Recover mantığını
  ölçmez. Blok metnindeki açıklama bu turda değiştirilmedi. **R03: blok metni düzeltildi** — Recover bitiş satırı 0'ı "FAIL ve ÖLÇÜLEMEYEN satır
  yok — koşucu mantığında fiilen beklenmez" diye yazar (§13.3; blok öz-testi O-6). Koşucunun Recover mantığı değişmedi; dayanak varsayımı aynı.
- **"DOĞRULANDI" satırının sınırı (R02 bağımsız ölçüm; kaynaktan okundu, koşumla üretilmedi).** Run sonunda gösterilen "Portal erişim
  kapanışı … DOĞRULANDI (DB + yeni giriş + mevcut oturum mesaj ucunda reddi)" metni sabittir ve P7-D9 PASS olduğunda yazılır. Koşucuda
  P7-D9, bu parçaların bir kısmı ölçülmeden de PASS olabilir: portal hesabı hiç oluşmadıysa kapanış C2…C5 satırlarını üretmeden tamam
  sayılır; koşucunun portal oturumu yoksa mevcut oturum reddi (P7-C4) gerekli sayılmaz. Bu iki durumda satır ölçülmemiş parçayı
  doğrulanmış gibi gösterir; hangi parçaların gerçekten ölçüldüğü kanıttaki ölçüt satırlarından (P7-C2…P7-C5) okunur. Metin R01'den
  beri aynıdır; düzeltmesi blok mantığına dokunur (D-6 R02'de beyanlı istisnayla yapıldı) ve bu revizyonda **yapılmadı** — sıradaki
  blok revizyonunun işidir. **R03: KAPANDI** — satır artık sabit değildir: "P7-D9 PASS — DOĞRULANDI yalnız bu satırın devamında PASS yazan
  parçalar içindir (kanıttan): DB kapalı + sürüm arttı [P7-C2/C2V/C5]: … · yeni giriş reddi [P7-C3L/D]: … · mevcut oturum reddi, koşucunun kendi
  portal oturumu [P7-C4L/D]: … · personel/dosya kapanışı [U-CLOSE]: …"; her parça kanıttaki verdict'lerden PASS / FAIL / ÖLÇÜLMEDİ (D-6 R02
  kalıbı; §13.3; blok öz-testi O-4/O-5). Satır rengi yine yalnız P7-D9'a bağlıdır ve bu, owner'a ayrı bir not satırıyla söylenir.
- **Run kapanışında personel oturumu yenilenmez (R02 inceleme, D7-E11 a; kaynaktan okundu, canlıda ölçülmedi).** Run'ın kapanış çağrısı
  (`POST /portal/admin/disable-user`) koşumun başında alınan personel (elev1) token'ını kullanır; Run'da oturumu yenileyen bir yol yoktur
  (yeniden oturum açma yalnız Recover'da vardır — §8.1 adım 1). Token kapanış anında geçersizse yetkili uç isteği 4xx ile reddeder
  (`JwtAuthGuard`; beklenen 401), koşucu 4xx yanıtta ikinci denemeyi yapmaz, portal erişimi açık kalır ve koşum **çıkış 6** ile biter
  (personel/dosya kapanışı yine denenir). Koşum, telefon beklemesi (en çok 20 dk) ve inceleme süresi (120 sn) boyunca sürer. Personel token
  süresi kaynakta `JWT_EXPIRES_IN` ile belirlenir (kaynak varsayılanı `7d`; R27 aday commit'inde aynı); canlıdaki değer ve canlıdaki token
  süresi **ölçülmedi**. **R03: DEĞİŞTİ** — Run'ın kendi kapanışında kapatma ucu 401/403 dönerse koşucu bir kez yeniden giriş + bir kez yeniden
  deneme yapar (§13.2; öz-test Z16-a: 401 → çıkış 0). Başka 4xx'te (ör. 404), yeniden giriş reddedilirse ya da 429 alınırsa yeniden deneme yoktur
  ve kapanış yine doğrulanmaz (çıkış 6). Canlı token süresi bu revizyonda da ölçülmedi.
- **Recover yetkisi ölçülmez ve zorlanmaz (R02 inceleme).** Blok AYRI owner onayını sormaz ve ölçmez; "BİR KEZ" kuralını kodla zorlamaz (GO
  sorulmaz, defter tutulmaz; ikinci bir Recover'ı blok da koşucu da engellemez). Run çıkış 5/6 Recover yetkisi değildir (§5 adım 7, §8.1,
  K-5); ikinci bir Recover bu paketle tanımlı değildir (K-6). Öz-test G-3/G-4/G-6 yalnız owner'a gösterilen METNİ ve node çağrı sayısını
  ölçer; onayın verilip verilmediğini ölçmez.
- **Recover'ın kapı bağımlılıkları (R02).** Recover bu bloktan ancak **tüm salt okuma kapıları** geçerse başlar: main = origin/main ve takipli
  dosyalar temiz, paket pinleri + digest, canlı API dist pini (R27), canlı `.env` pini ve adres biçimi, 8080'de tek dinleyici (canlı API ayakta),
  başka kabul süreci yok, başlatıcı günlüğünde DB kimliği, `node` çözülebilir. Biri sağlanmazsa blok çıkış 90 ile durur ve Recover **başlamaz**
  (ör. Run'dan sonra main'e commit gelmiş ve checkout senkron değil; `.env` ya da dist değişmiş; API kapalı) → K-4. Dış zincir (Caddy/Cloudflared)
  ve yerel konsol kapıları Recover'da **aranmaz** (öz-test Z-8); zincir bozukken dış adresten giriş reddi (P7-C3D) ölçülemeyen kalabilir.
  Koşucunun kendi kapıları: TLS doğrulaması açık, beklenen DB = bağlı DB, API adresi beyanı, origin biçimi, `D7_RECOVER_CONFIRM`, makbuz
  biçimi + runId eşleşmesi + kimlik bağı. Portal hâlâ açıksa kapatma için canlı API'ye personel girişi gerekir (§8.1 adım 1).
- Owner bloğu **her modda** (Recover dahil) paket/dist/.env pinlerini ister. Run 5/6 ile bittikten sonra canlı dist değişirse (ör. R26'ya geri
  dönüş) Recover bu bloktan **çalışmaz**; kapanış bloktan tamamlanamaz → §10 K-4. Koşucu (`d7-portal-messages-live-run.js`) dist pini ölçmez;
  yalnız DB/API/origin kapılarına bakar — ama GO'suz/bloksuz koşum bu paketle yetkilendirilmez.
- **Kurulum ile makbuz arasındaki pencere (R02-b; kaynaktan okundu, canlıda ölçülmedi; koşucu öz-testinde bu yol için senaryo yok).** Koşucu
  Run'da önce kurulumu yapar (`setupI3`; tek veritabanı işlemidir — kendi içinde hata verirse geri alınır), ardından **makbuz atanmadan
  önce** iki ek dosyayı ayrı ayrı yazar (yabancı tenantta `I3-<runId>-xf`, hedef tenantta `I3-<runId>-s`; §8). Makbuz nesnesi ancak bu iki
  yazmadan sonra kurulur ve dosyaya yazılır. Bu iki yazmadan biri hata verirse:
  - makbuz **oluşmaz**: kanıt dizininde `d7-setup-receipt.json` yoktur, kanıtta `receipt` alanı yoktur;
  - Run'ın koşucu içindeki kendi kapanışı makbuza bağlıdır: makbuz yokken portal kapanışı da personel/dosya kapanışı da **çalıştırılmaz**;
    kanıta "kapatılacak bir şey yok" yazılır (`portalClose.nothingCreated`, `closure.nothingToClose`), U-CLOSE / P7-MSG-KEPT / P7-D9 satırları
    üretilmez, U-ISO ÖLÇÜLEMEYEN olur, `recovery.gerekli=false` yazılır ve koşum **çıkış 1** ile biter (5 ya da 6 **değil**; hata özeti
    `fatal` alanındadır);
  - oysa kurulum işlemi tamamlanmıştır: iki sentetik tenant, hedef tenanttaki sentetik kullanıcılar (profil ve yetki kayıtları dahil — §8; **aktif** — şema varsayılanı; parola
    özeti bloğun o koşum için ürettiği rastgele paroladan, blok ve koşucu parolayı kendi kanıt/log dosyalarına yazmaz), müvekkiller, borçlu
    ve ana dosya (**ACTIVE** — şema varsayılanı; dosya bağlarıyla birlikte) canlı DB'de **kalır**; ikinci yazma hata verdiyse yabancı tenanttaki ek dosya da kalır.
    Kullanıcılar pasifleştirilmez, sürümleri artırılmaz, dosyalar CLOSED yapılmaz. Portal hesabı ve mesaj satırı bu noktada henüz yoktur
    (oluşturma isteği gönderilmemiştir);
  - blok Run bitişinde "Portal erişim kapanışı DOĞRULANAMADI (çıkış 1)" satırını gösterir (kanıtta P7-D9 yoktur), beyan sorularını yine
    sorar (giriş bilgisi hiç gösterilmediği halde), 5/6 metnini **göstermez**; GO tüketilmiştir (defter satırı koşucudan önce yazılır);
  - **Recover bu durumda bu bloktan koşulamaz:** Recover makbuz dosyası ister; blok `-ReceiptFile` verilmediğinde ya da dosya yokken çıkış
    90 ile durur, koşucu makbuzu okuyamazsa çıkış 4 verir. Bu paket makbuzsuz bir kapanış yolu tanımlamaz.

  Çıkış 1 tek başına bu durumu ayırt etmez: makbuz **dosyası yazılamadığında** da çıkış 1 olur, ama o yolda makbuz nesnesi atanmıştır ve
  Run kendi kapanışını koşar (öz-test Z12: aktif kullanıcı 0). Ayrım kanıttaki `closure` alanından okunur (`nothingToClose` = kapanış hiç
  çalışmadı). **Aynı kanıt biçimi** (çıkış 1, `receipt` yok, `nothingCreated` / `nothingToClose`) kurulumun **kendisi** hata verip geri alındığında
  ve ilk izolasyon sayımı hata verdiğinde de oluşur; o iki durumda canlı DB'de kalıntı **yoktur**. `closure` alanı bu üç durumu ayırmaz; ayrım
  `fatal` metninden ve sentetik tenantın DB'de bulunup bulunmadığından okunur (DB'ye bakma owner/CLIENT kararıdır — K-7). Kalan iki sentetik
  tenant, kanıt dizinindeki runId'den türeyen **slug** değerleriyle (`ah-<runId>`, `ah-<runId>-x`) tanınır (tenant adları farklıdır). Bu pencerede
  hata olasılığı ölçülmedi; kurulum işleminin onayı sırasında bağlantı kopması gibi sonucu belirsiz durumlar ayrıca incelenmedi. **Bu
  durumda yapılacak iş owner/CLIENT kararıdır** (§10 K-7); bu belge bir çözüm tanımlamaz. Koşucudaki sıranın değiştirilmesi pinli dosyaya
  dokunur (koşucu sha256'sı ve paket digest değişir) ve bu turda **yapılmadı**.

  **R03: kusur giderildi (koşucu sırası değişti; §13.1).** Makbuz artık `setupI3`'ten hemen sonra atanır ve dosyaya yazılır; iki ek dosyanın
  kimlikleri yazıldıkça makbuza eklenir (`foreignCaseId`, `sameTenantOtherCaseId`, `setupComplete`). İki ek yazmadan biri hata verirse makbuz
  **vardır**, Run'ın kendi kapanışı **koşar** (portal hesabı henüz yoktur → P7-C1 PASS; `closeAccess` → kullanıcılar pasif + sürüm artışı, açık
  dosyalar CLOSED; U-CLOSE, P7-D9 PASS), çıkış 1'dir (fatal) ve Recover makbuzu bulur. Ölçüldü (öz-test, disposable DB'de geçici tetikleyiciyle
  verilen yazma hatası): ikinci ek yazma hatasında yeni baytlar hedef tenantta 9/9 kullanıcıyı pasif, dosyaları CLOSED bırakır; eski baytlar aynı
  senaryoda **9 kullanıcı AKTİF, 1 dosya ACTIVE** (yabancı tenantta 1 dosya ACTIVE) bırakıp `closure.nothingToClose` yazdı (§13.4). Yukarıdaki
  maddelerin anlattığı makbuzsuz kalıntı bu iki yazma için **artık oluşmaz**. Kalan pencere: kurulumun **kendisi** (`setupI3`, tek işlem) — hata
  verirse işlem geri alınır (kaynaktan okundu; öz-test Z15-c'de ölçüldü: sentetik tenant sayısı 0/0) ve makbuz yoktur; işlemin onayı sırasında
  sonucu belirsiz bir kopma bu revizyonda da **incelenmedi** (K-7). Kanıttaki `setup` alanı bu durumları ayırır (§13.1).
- **Pencere açma yolu (R02-b).** Ajanın PowerShell 7'den `Start-Process` ile açtığı Windows PowerShell 5.1 penceresinde `Get-FileHash`
  bulunamaz; blok pin kapılarını ölçemez ve çıkış 90 ile durur (§5 adım 1). Blok bu durumu kendisi tespit etmez ve düzeltmez.
- **Recover'ın 1 ve 2 çıkış kodları (R02-b).** Bloğun Recover bitiş satırı bu iki kodu açıklamaz; koşucu Recover'da ikisini de
  döndürebilir. Anlamları §3'teki "Recover'da 1 ve 2" notundadır. **R03:** bloğun Recover bitiş satırı artık ikisini de açıklar (§13.3; O-6).
- Canlı Caddy yapılandırmasının repo şablonuyla aynı olduğu ölçülmez (D-8).
- Öz-test disposable DB'de satır bırakır (sentetik tenantlar; silme yok) ve `%TEMP%\d7-selftest-*` dizinlerinde giriş bilgisi taşıyan `*.sink`
  dosyaları + kendinden imzalı TLS anahtarı bırakır (yalnız disposable DB'deki artık pasif hesaplara ait; silinmez). Canlı DB'ye dokunulmadı.

## 10. Owner kararları ve notlar (teknik olarak tamamlanmış; karar gerektirenler)

- **K-1 Mesaj kalıntısı:** canlı koşum sonrası sentetik tenantta kalan PortalMessage/PortalNotification satırlarının "saklandı" kaydıyla kabulü
  (ürünte silme ucu yok; koşucu silmez). Alternatif (DB'den elle silme) bu paketin kapsamı dışıdır ve önerilmez.
- **K-2 SEC-PORTAL-ADMIN-MSG-01** (kısıtlı kayıt; AÇIK): D-7 kabulü için engel **değil** — D-7 müvekkil yüzeyini ölçer; etkilenen adımlar
  (D7-3/3N/3U/3G/3F/3B) yalnız personel yanıtını **üretmek** için yerel API'yi kullanır. Kayıt bu paketle **giderilmez**; ürün değişikliği ayrı iş ve
  owner kararıdır. Kayıt giderilirken personel yetki kuralı değişirse bu koşucunun personel aktörü (elev1) yeni kurala göre yeniden doğrulanır.
- **K-3 Tanım sapması:** D-8 §5 "kapsam dışı caseId → 404" yerine kaynak **400**; paket 400'ü kabul ölçütü sayar. Tanımın güncellenmesi owner/CLIENT kararı.
  **Karar durumu iki belgede farklı yazıyor (R02 inceleme, D7-E11 c; iki belge okunarak doğrulandı):** bu madde "owner/CLIENT kararı" der; R27 paketi
  (`client-release-r27-r01` §10, "Karar gerektirmeyenler") "ürün 400 döner ve tanım buna göre güncellendi" der; D-8 paketi §5 tablosu tanım
  sütununda 404'ü korur ve 400'ü "sapma" olarak kaydeder. Hangisinin geçerli olduğu **owner teyidi ister**; bu paket teyit gelene kadar K-3'ü
  açık sayar (ölçüt değişmez: koşucu 400 ölçer).
- **K-4 Recover ve dist değişimi:** Run 5/6 ile bittikten sonra canlı dist değişmişse Recover bu bloktan çalışmaz (her modda dist pini). Seçenekler:
  (a) canlı dist'i R27'ye geri getirip Recover'ı bu blokla koşmak; (b) yeni dist pinli bir blok sürümü (sıradaki revizyon; R02 yalnız metindir, dist pini aynı) hazırlatıp Recover'ı onunla koşmak;
  (c) CLIENT kararıyla kapanışı ayrı bir yolla doğrulamak. Bu paket hiçbirini kendiliğinden yapmaz. Dist dışındaki kapı bağımlılıkları §9'dadır.
  **R03 durumu: AÇIK (değişmedi).** R03 dist pinini değiştirmedi; değişen paket digest'idir (§7). R03 baytları main'e girmeden canlı Preflight
  paket kapısı geçmez (bloğun `$Repo` yolu ana checkout'tur).
- **K-5 Recover yetkisi (R02; owner kuralı 2026-10-01):** Run çıkış 5/6 otomatik Recover yetkisi DEĞİLDİR. Run'ın koşucu içindeki kapanış
  adımları Run'ın parçasıdır; ayrıca başlatılan Recover ayrı bir canlı yazma işlemidir (§8.1) ve kanıt incelemesi + açık kalan kaynakların
  bildirilmesi sonrasında **AYRI owner onayı** gerektirir; BİR KEZ başlatılır; blok ve ajan Recover'ı otomatik başlatmaz (§5 adım 7; öz-test
  G-3/G-4). Koşucunun kanıttaki kurtarma adımı metni (pinli, değişmedi) bir öneridir. "BİR KEZ" kodla zorlanmaz (§8.1).
  Bilgi (R02 inceleme; belge okunarak doğrulandı): R27 paketi (`client-release-r27-r01` §11 uygulama sırası tablosu) D-6/D-7 ve D-5 satırlarının
  "Durma" sütununda "5/6 → Recover" kısaltmasını taşır; bu kısaltma K-5 kuralını (kanıt incelemesi + AYRI owner onayı) yazmaz. R27 belgesi bu
  işin kapsamı dışındadır ve **değiştirilmedi**; D-7 için geçerli kural bu maddedir.
  **R03 durumu:** kural aynı. Koşucunun kanıttaki kurtarma adımı artık bu kuralı kendisi yazar ("ÖNERİ (yetki DEĞİL): çıkış kodu Recover yetkisi
  değildir; önce kanıt incelenir. Recover yalnız AYRI owner onayıyla başlatılır …"; öz-test C-1). Run'ın kapanışındaki tek yeniden giriş (§13.2)
  Run'ın **kendi** kapanışının parçasıdır; Recover değildir ve Recover yetkisi doğurmaz.
- **K-6 İkinci Recover (AÇIK owner sorusu; R02 inceleme):** owner kuralı Recover'ı BİR KEZ tanımlar. **İkinci bir Recover bu paketle tanımlı
  değildir; owner kararı gerektirir.** Bu belge ve blok metni ikinci bir Recover için koşul, onay biçimi ya da adım tanımlamaz; Recover'ın çıkış
  kodu (3/5/6 dahil) yeni bir Recover için yetki değildir. Recover'dan sonra kapanış hâlâ doğrulanmamışsa (ör. Recover çıkış 5/6) ne
  yapılacağı — ikinci Recover'a izin verilip verilmeyeceği, hangi kanıtla ve hangi onay biçimiyle, ya da kapanışın başka bir yolla
  tamamlanacağı — owner'ın vereceği karardır; bu paketle ikinci bir Recover başlatılmaz. Teknik durum: blok ve koşucu ikinci bir
  Recover'ı engellemez (§8.1); kural kodda değil, bu maddede ve gösterilen metindedir (öz-test G-6 yalnız metni ölçer).
  **R03 durumu: AÇIK (değişmedi).** Koşucunun Recover kanıtındaki adım metni de bu kuralı yazar ("İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR,
  owner kararı gerektirir"; öz-test C-1); R01/R02 koşucusunun Recover 5/6'da yazdığı "… ile BİR KEZ" önerisi kaldırıldı.
- **K-7 Makbuzsuz yarım kurulum (AÇIK owner sorusu; R02-b):** Run, kurulum tamamlandıktan sonra ve makbuz atanmadan önce hata verirse (§9
  "Kurulum ile makbuz arasındaki pencere"; kaynaktan okundu, canlıda ölçülmedi) sentetik kullanıcılar aktif ve dosya(lar) ACTIVE kalabilir,
  Run'ın koşucu içindeki kendi kapanışı çalışmaz, koşum çıkış 1 ile biter ve makbuz dosyası oluşmadığı için Recover bu bloktan koşulamaz.
  Bu durumda ne yapılacağı — kapanışın tamamlanıp tamamlanmayacağı, hangi yolla, hangi kanıtla ve hangi onay biçimiyle — **owner/CLIENT
  kararıdır**. Bu paket bu durum için bir adım, onay biçimi ya da makbuzsuz kapanış yolu tanımlamaz ve kendiliğinden hiçbir şey yapmaz;
  DB'ye elle yazma bu paketin kapsamı dışıdır. Çıkış 1 de tek başına Recover yetkisi değildir: Recover yalnız kanıt incelemesinden sonra,
  AYRI owner onayıyla başlatılır (K-5).
  **R03 durumu: kusurun ana yolu GİDERİLDİ, madde DARALARAK AÇIK.** İki ek dosya yazmasından biri hata verirse artık makbuz vardır, Run'ın kendi
  kapanışı koşar (kullanıcılar pasif, dosyalar CLOSED) ve Recover makbuzu bulur (§9, §13.1; öz-test Z15-a/b/r). Açık kalan dar durum: kurulumun
  **kendisi** (`setupI3`, tek işlem) sonucu belirsiz biterse (ör. işlem onayı sırasında bağlantı kopması; incelenmedi) makbuz yoktur. Bu durumda
  koşucu yalnız **ölçer ve bildirir**: kanıttaki `setup` alanı (aşama `kurulum`, durum `KURULUM_HATASI`, makbuz dosyası yok) ve sentetik tenant
  slug'larının DB'deki sayısı (salt okuma); sayı 0'dan büyükse kurtarma nedenine "KURULUM: makbuz YOK ama sentetik tenant slug'ı DB'de VAR …" satırı
  yazılır (tenantın bu koşumun kurulumundan mı, önceden var olan bir slug'dan mı geldiği `fatal` metninden okunur). Makbuzsuz kapanış yolu bu
  pakette **tanımlı değildir**; ne yapılacağı owner/CLIENT kararıdır.
- **K-8 Run kapanışında tek yeniden giriş kabulü (AÇIK owner kararı; R03):** R03 (b) Run'ın kendi kapanışına canlı API'ye en çok **bir** ek personel
  girişi (`POST /auth/login`) ve en çok **bir** ek kapatma çağrısı ekler (§13.2). Canlıya ek etkisi **kaynaktan okundu, canlıda ölçülmedi**: DB yazması
  yok; personel giriş hız sınırının bellek içi sayacı +1; HTTP metrikleri ve API uygulama günlüğü satırları. Bu davranışın canlı koşumda kabul edilip
  edilmediği owner kararıdır; bu belge onu kabul edilmiş saymaz. Reddedilirse R02 davranışına (yeniden giriş yok; portal açık kalır, çıkış 6) dönmek
  koşucu değişikliğidir (koşucu pini + paket digest değişir). Aynı karar D-6 paketinde (R03, PR #2904; main'de henüz yok) OK-6 olarak açıktır.
- Bilgi (R02'de güncellendi): bu maddenin R01 metni "`EXTACC-D5` bloğunun QrTest'i `extacc-qr-test.js` ile `/portal/forgot-password` ister; o
  betik yalnız `/portal/login` kabul eder (çıkış 4)" diyordu. Bu durum **D-5 R03 ile giderildi**: D-5 bloğunun QrTest'i artık kendi
  `d5-qr-test.js` betiğini çağırır (`/portal/forgot-password`; D-5 paket belgesi R03 notu ve §6 pin tablosu). D-7 QrTest'i baştan beri
  `d7-qr-test.js` kullanır; bu notun D-7'ye etkisi yoktur.
- Bilgi (kapanış düzeltmesi, 2026-09-29): owner bloğundan public host ve yerel kullanıcı yolu literalleri **kaldırıldı** — portal adresi canlı `.env`
  `PUBLIC_PORTAL_BASE_URL`'den okunur (biçim kapısı) ve Run/QrTest'te owner'ın konsola yazdığı R05 adresiyle doğrulanır; kanıt kökü `$env:USERPROFILE`'a
  görelidir. Canlı kök, launcher günlüğü yolu ve DB kimlik dizesi (R26/D-4/D-5 ile aynı, betiğin çalışması için gerekli) yerinde kaldı. D-4/D-5/EXTACC
  bloklarında aynı sertleştirme **ayrı iş** (R27 belgesi §9; eski paketler bu turda değiştirilmez).

## 11. R01 inceleme düzeltmeleri (2026-09-29; iki bağımsız inceleme)

| Bulga | Karar | Değişiklik |
|---|---|---|
| ÖNEMLİ — D7-3G ürün gövdesi `{ client, messages }` iken koşucu çıplak dizi bekliyordu (canlıda sahte FAIL); sahte API de diziyi taklit ediyordu | **doğrulandı, düzeltildi** | koşucu `ag.body.messages` (nesne şart; çıplak dizi FAIL) + gözleme `gövde=`; sahte API `{ client, messages }`; öz-test Z1-g `gövde={client,messages} · listede=3/3`; §2/§3 |
| Belge "Preflight/Run DUR" derken blok tüm modlarda durur | doğrulandı, düzeltildi | §1 ön koşul, blok başlığı, §9, §10 K-4 |
| D7-3B "+DB satırı" ölçütte değildi | doğrulandı, düzeltildi | `o2` satırı (clientId/tenantId/senderType/senderId/content) ölçütte; gözlem `satır=` |
| D7-3N/D7-3U yanıtsız çağrıda FAIL üretiyordu | doğrulandı, düzeltildi | `o1`/`u1`/`mr` yanıtsız → ÖLÇÜLEMEYEN; sahte API `reply=hang`, `unread=hang`; öz-test Z14-a/Z14-b |
| "aynı tenant başka müvekkil → 400" ölçülmüyordu | doğrulandı, düzeltildi (ölçüm eklendi) | kurulumda ikinci sentetik müvekkile bağlı `showToClient=true` dosya; **D7-4S**; makbuz `sameTenantOtherCaseId`; Z1-e/Z1-g/Z3 |
| P7-MSG-KEPT boş ownIds ile 0===0 PASS; Recover'da sabit koşul | doğrulandı, düzeltildi | Run: mesaj yoksa ÖLÇÜLEMEYEN; makbuza `runnerMessageIds`; Recover gerçek sayım / id listesi yoksa ÖLÇÜLEMEYEN; Z10, Z10-r, Z5-b, Z13 |
| Owner bloğunda canlı topoloji literalleri (emsal) | ilk incelemede "değişiklik yok" denmişti; **kapanış düzeltmesinde (2026-09-29) düzeltildi** (ortak kural: canlı topoloji ayrıntısı public repoya yazılmaz) | `$ExpBaseUrl` `.env`'den + `Assert-PortalBaseUrl` + `Confirm-PortalBaseUrlR05` (Run/QrTest); `$EvRoot` `$env:USERPROFILE`; blok öz-testi K-6/K-6b/K-7/K-8/Q-R05/S-5 (58/58 ×2 kabuk); §4, §5, §7, §10 |
| (kapanış) §2/§10 admin uçlarının yetki modeli ayrıntısı public belgede | doğrulandı, **düzeltildi** | ayrıntı public repodan çıkarıldı (`product-backlog.md`'ye eklenen satır R02'de **geri alındı**); owner-yerel kısıtlı kayıt **SEC-PORTAL-ADMIN-MSG-01**; §2 ve K-2 yalnız ID taşır |
| Caddyfile şablonunun repo yolu belgede yoktu | doğrulandı, düzeltildi | §2 yol + ilgili regexp satırları; canlı Caddy eşitliği ölçülmez (§9) |
| `%TEMP%` altında üç `d7-selftest-*` dizini (üçüncüsü belgelenmemiş) | doğrulandı; silme yok | kanıt dizinine `SUMMARY-FIX-R01.txt` notu; §9 sınır |
| P-1'de sentetik canlı DB URL literali (emsal) | doğrulandı, **değişiklik yok** (D-4/D-5 ile aynı; sahte kullanıcı/parola) | — |

## 12. R02 (2026-10-01) — owner bloğu metni ve Recover yetkisi

**Kapsam.** Yalnız owner bloğunun METNİ (yorumlar, konsol çıktısı, istem metinleri), blok öz-testi ve bu belge değişti. Koşucu
(`d7-portal-messages-live-run.js`), sahte API, QR betiği, `d7-selftest.js` ve bloğun pin listesindeki 9 dosya **değişmedi**; paket digest aynıdır.
Blok mantığı değişmedi (§6.2 mantık eşitliği: istisna yok). Örnek alınan düzeltme: D-5 paketi R04. Owner kuralı (2026-10-01): Run çıkış 5/6
otomatik Recover yetkisi değildir; Recover yalnız kanıt incelendikten sonra AYRI owner onayıyla, bir kez başlatılır; blok Recover'ı otomatik
başlatmaz; kapsamsız mutlak ifade kullanılmaz; metin yalnız ölçüleni iddia eder.

| Bulgu | Karar | Değişiklik |
|---|---|---|
| D7-E1 — blok ve §5 adım 7, çıkış 5/6'da Recover'ı doğrudan talimat gibi yazıyordu | düzeltildi | blok: 5/6 metni Run'ın kendi kapanışını Recover'dan ayırır ("Recover YETKİSİ DEĞİLDİR / blok BAŞLATMAZ / önce kanıt / AYRI owner onayı, BİR KEZ"; kanıttaki kurtarma adımı öneridir); başlık yorumu; §5 adım 7; §10 K-5; öz-test G-4 |
| D7-E2 — Recover'ın canlı yazma kümesi belgede/blokta yoktu | düzeltildi | §8.1 "Recover ne yazar"; blok Recover girişinde bilgi metni (yalnız Write-Host; soru/akış yok) + başlık yorumu + 5/6 metninde özet; öz-test G-3 |
| D7-E3 — "Recover BİR KEZ" kodla zorlanmaz | belgelendi (kod değişmedi) | §8.1 son paragraf, §5 adım 7, §10 K-5; blok metinleri "kodla ZORLANMAZ" der |
| D7-E4 — girişten sonra açılan sayfa mesaj sayfası değil; beyan seçeneği ana sayfayı hata sayfasıyla aynı harfe düşürüyordu | düzeltildi (yalnız metin) | §5 adım 4 "Mesajlar sekmesine geçin"; beyan istemleri: M = portal açıldı (ana sayfa/özet ya da mesaj sayfası), D = hata/portal dışı sayfa; harf kümesi ve `-ceq 'M'` kodu aynı (§4 R02 notu) |
| D7-E5 — rozetin neyi saydığı yazılmamıştı | belgelendi | §9 "Rozet = bildirim sayacı"; §5 adım 5; beyan istemi "zil simgesindeki rozet (okunmamış BİLDİRİM sayacı; mesaj sayacı değildir)" |
| D7-E6 — "sentetik tenant CLOSED" ifadesi tenant yaşam döngüsünün değiştiği izlenimini veriyordu | düzeltildi (blok metni + belge) | blok onay metni ve kalıntı satırı notu: "dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü DEĞİŞMEZ"; §3 notu, §8. Koşucunun kanıt metni pinlidir, **değişmedi** (aynı ifadeyi üretmeye devam eder; §3 notu anlamını sabitler) |
| D7-E7 — canlı veri onay metni §8 kayıt listesiyle eşleşmiyordu | düzeltildi | onay metnindeki kalemler §8'de de geçer; §8 ek ayrıntı taşır (ikinci sentetik müvekkil ve `-s` dosyası, ürünün kendi yazdıkları, API günlüğü satırları, U-ISO sınırı); "Gerçek müvekkil verisine dokunulmaz" mutlak ifadesi kaldırıldı; öz-test G-2 kalemleri hem gösterilen metinde hem §8'de ölçer |
| D7-E8 — öz-test atıfları eski baytlara bağlıydı | düzeltildi | §6 başına "hangi baytlar" notu; §6.3 son baytların koşumu (§6.2 = R02 ilk tur); §7 pinler |
| D7-E9 — U-ISO'nun neyi ölçmediği yazılmamıştı | belgelendi | §9 "U-ISO sınırı"; blok onay metninde "yalnız SAYI; içerik karşılaştırılmaz" |
| D7-E10 — Recover'ın kapı bağımlılıkları ve web derlemesinin ölçülmediği yazılmamıştı | belgelendi | §9 "Recover'ın kapı bağımlılıkları", "Web derlemesi ölçülmez"; §10 K-4 atfı |
| Bayat satır — "D-5 bloğunun QrTest'i çıkış 4" | düzeltildi | §10: D-5 R03 ile giderildiği yazıldı |
| Kapsamsız mutlak ifadeler ("… hiçbir dosyaya/kanıta yazılmaz") | düzeltildi | blok SIR yorumu ve §1: "blok ve koşucu kendi kanıt/log dosyalarına yazmaz" + ölçülen kapsam; canlı DB'deki parola özetleri ve canlı API günlüğü ayrı yazıldı; öz-test G-1 |

**Bu revizyonda yapılmayanlar / açık kalanlar.**
- D7-E11 (üç kısa belge notu): R02 ilk turunda notların içeriği verilmediği için uygulanmamıştı; içerik inceleme düzeltmeleri turunda verildi ve
  kaynak okunarak doğrulanıp **uygulandı** (§12.1).
- Koşucunun kanıt metinleri ("sentetik tenant CLOSED", "Owner bloğu `-Mode Recover …` ile BİR KEZ") pinli dosyadadır ve değişmedi; düzeltilmeleri
  koşucu sha'sını ve paket digest'i değiştirir — ayrı iş. *R03: yapıldı (§13.3; koşucu pini ve paket digest değişti — §7).*
- "Recover BİR KEZ" ve "AYRI owner onayı" kodla zorlanmaz/ölçülmez (blok mantığı bu revizyonda değiştirilemez); kural belge + gösterilen metindir.
- `owner-block.json` `revision` alanı `R01` kalır (§4).
- Repodaki `d7-selftest.js` kütüphaneleri canlı yayın dizininden yükler; bu turda yalnız ayna kopyada koşuldu (§6.2). Öz-testin kütüphane kökünün
  canlı yayın dizinine bağlı olması ayrı bir düzeltme konusudur (bu işin kapsamı dışında: yalnız blok, blok öz-testi ve belge değişebilir).
  *Bu madde R02 ilk turunun tarihsel kaydıdır. **Güncel durum (2026-10-03): KAPANDI** — kütüphane kökü ortamdan verilir, canlı yayın ağacı
  reddedilir; repodaki dosyanın kendisi koşuldu, 41/41 PASS (§6.4, §12.2). Ayna kopya sonucu tarihsel kanıttır.*
- Blok öz-testinin çıktısı yerel kullanıcı adını maskelemez (yalnız gözlem dökümü ve geçici dizin satırı maskelidir); kanıt logları yazılırken
  maskelendi. D-5 öz-testindeki tam maske (M-1) D-7'ye taşınmadı.
- Web arayüzü tarifleri (ana sayfa, Mesajlar sekmesi, zil rozeti) kaynak okumasıdır; canlı web derlemesi ölçülmedi (§9).
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu revizyon hiçbiri için yetki değildir.

### 12.1 R02 inceleme düzeltmeleri (2026-10-01; yalnız metin ve belge)

**Kapsam.** R02 ilk turu (commit `a71cd2c8`) bağımsız incelendi; engelleyici ya da önemli bulgu çıkmadı. Aşağıdaki küçük bulgular **yalnız metin
ve belge** düzeltmesiyle kapatıldı: blok METNİ (yorum + konsol çıktısı), blok öz-testi (yalnız yeni metni ölçen G-5/G-6) ve bu belge. Blok
mantığı değişmedi (§6.3 mantık eşitliği: R02 ilk tur bloğu → son blok birebir eşit, istisna yok); koşucu, sahte API, QR betiği, `d7-selftest.js`
ve pinli 9 dosya değişmedi; paket digest aynıdır. Owner kuralı: Run çıkış 5/6 Recover yetkisi değildir; Recover yalnız kanıt incelendikten sonra
AYRI owner onayıyla, BİR KEZ başlatılır; blok başlatmaz; **ikinci bir Recover bu kuralda tanımlı değildir** — metin bir tekrar yolu tanımlamaz.

| Bulgu | Karar | Değişiklik |
|---|---|---|
| D7V-1 — kalıntı satırının altındaki açıklama ("sentetik tenant CLOSED" = dosyalar CLOSED + …) kapanış doğrulanmadığında da durum iddiası gibi okunuyordu | düzeltildi (blok metni + belge) | Run ve Recover bitişindeki not yeniden yazıldı: ifade koşucunun SABİT metnidir, kapanışın doğrulandığını GÖSTERMEZ; kapanış durumu Run'da "Portal erişim kapanışı … DOĞRULANDI / DOĞRULANAMADI" satırındadır; anlamı: hedeflenen kapanış = dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü değişmez. §3 notu aynı cümleyi taşır. Öz-test G-5 |
| D7V-2 — Recover bitiş metni "tekrar ancak AYRI owner onayıyla" diyerek ikinci Recover için yol tanımlıyordu | düzeltildi (blok metni + belge) | bitiş metni: "Bu çıkış kodu yeni bir Recover için yetki DEĞİLDİR; Recover BİR KEZ koşulur (kodla zorlanmaz); sonuç CLIENT'a bildirilir." + "İkinci bir Recover bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir."; Run 5/6 metni ve başlık yorumu aynı kuralı taşır; §4, §5 adım 7, §8.1; §10'a açık owner sorusu **K-6**. Öz-test G-6 |
| D7V-3 — §8 "blok günlükleri okumaz, değiştirmez, silmez" (blok başlatıcı günlüğünden DB kimliği satırını okur) | düzeltildi | §8: "blok canlı API uygulama günlüğünün içeriğini ölçmez, değiştirmez, silmez; yalnız başlatıcı günlüğündeki DB kimliği satırını okur (salt okuma kapısı)" |
| D7V-4 — §7 "İlk iki satırdaki sha256" (R02 satırları tablonun ilk iki satırı değil) | düzeltildi | §7: "R02 satırlarındaki (blok ve blok öz-testi …) sha256 değerleri …" |
| D7V-5 — §10 K-4(b) "(R02)" (R02 zaten bu metin revizyonunun adı) | düzeltildi | "(sıradaki revizyon; R02 yalnız metindir, dist pini aynı)" |
| D7V-6 — §9'da Recover yetkisinin ölçülmediği/zorlanmadığı yazılmamıştı | belgelendi | §9 "Recover yetkisi ölçülmez ve zorlanmaz" |
| D7V-7 — §8 "onay metniyle AYNI kalemleri taşır" (§8 daha ayrıntılı; ölçülen yalnız 10 kalemin iki yerde geçmesi) | düzeltildi | §8: "onay metnindeki kalemleri kapsar (G-2: 10 kalem iki yerde de geçer); §8 ek ayrıntı taşır"; blok yorumu, öz-test başlık yorumu ve §12 D7-E7 satırı aynı ifadeye çekildi |
| D7V-8 — G-1'in neyi yakalamadığı yazılmamıştı | belgelendi | §6.2 "G-1'in sınırı" |
| D7-E11 a — Run kapanışında personel oturumu yenilenmez | doğrulandı (koşucu kaynağı: Run `closePortal` çağrısına oturum yenileyici verilmez; 4xx yanıtta ikinci deneme yok; portal açık kalırsa çıkış 6), belgelendi | §9. Token süresi kaynakta `JWT_EXPIRES_IN` (varsayılan `7d`); canlıda ölçülmedi |
| D7-E11 b — bloğun Recover özetindeki "0 = kapanış + HTTP reddi doğrulandı" koşucu mantığında fiilen ulaşılamaz | doğrulandı (koşucu kaynağı: `recoverExitCode` + `closePortal` + kalıntı ölçümü; hesap satırının koşucu dışında silinmediği varsayımıyla), belgelendi | §9. Blok metnindeki açıklama değiştirilmedi |
| D7-E11 c — K-3 karar durumu iki belgede farklı | doğrulandı (bu belge §10 K-3 ↔ R27 paketi §10 "Karar gerektirmeyenler"; D-8 paketi §5 tablosu), belgelendi | §10 K-3: owner teyidi ister. R27 ve D-8 belgeleri değiştirilmedi |

**Bu turda yapılmayanlar / sınırlar.**
- **Recover bitişindeki not, istenen cümleden bir yerde ayrılır:** Recover'da owner'a "DOĞRULANDI / DOĞRULANAMADI" satırı **gösterilmez** (blok bu
  satırı yalnız Run'da, owner beyanından önce yazar). Satır Recover'a metin olarak da eklenmedi: bloğun kapanış metni kanıttaki P7-D9 satırından
  üretilir ve Recover kanıtında P7-D9 yoktur — eklenen satır her Recover'da "DOĞRULANAMADI" derdi; doğru bir satır metin değil mantık değişikliği
  ister. Bu yüzden Recover notu kapanış durumu için "yukarıdaki çıkış kodu satırındadır" der ve böyle bir satırın gösterilmediğini açıkça yazar;
  Run notu istenen cümleyi aynen taşır.
- Canlı veri onay metnindeki açıklama ("… kanıt metnindeki "sentetik tenant CLOSED" = dosyalar CLOSED + personel pasif + portal pasif") koşumdan
  ÖNCE gösterilen bir tanımdır, durum bildirimi değildir; bu turda değiştirilmedi (D7V-1 yalnız kalıntı satırının altındaki notu kapsar).
- Bloğun Recover özetindeki "0 kapanış + HTTP reddi doğrulandı" açıklaması değiştirilmedi (D7-E11 b yalnız belge notudur).
- R27 paketi §11 tablosundaki "5/6 → Recover" kısaltması ve R27 §10'daki K-3 ifadesi bu işin kapsamı dışındadır; değiştirilmedi (K-3, K-5 notları).
- İkinci Recover kodla engellenmez; K-6 açık owner sorusudur. Koşucunun Recover kanıtındaki `recovery.adim` metni (pinli) 5/6'da yine "Recover …
  BİR KEZ" önerir (§8.1); koşucu değiştirilmediği için bu metin durur. *R03: koşucu metni düzeltildi ("ÖNERİ (yetki DEĞİL) … İKİNCİ bir Recover bu
  paketle TANIMLI DEĞİLDİR"); bloğun Recover özetindeki "0 kapanış + HTTP reddi doğrulandı" açıklaması da düzeltildi (§13.3).*
- Repodaki `d7-selftest.js` bu turda da yalnız ayna kopyada koşuldu (§6.3). *Bu madde o turun tarihsel kaydıdır. **Güncel durum (2026-10-03):**
  repodaki dosya düzeltildi ve kendisi koşuldu, 41/41 PASS (§6.4, §12.2).*
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu tur hiçbiri için yetki değildir.

### 12.2 R02 koşucu öz-testi kütüphane kökü (2026-10-03; yalnız `d7-selftest.js` ve belge)

**Kapsam.** Değişen iki dosya: `scripts/d7-selftest.js` (yalnız kütüphane kökü çözümü + canlı ağaç reddi + bir çıktı satırı) ve bu belge. Koşucu
(`d7-portal-messages-live-run.js`), owner bloğu, blok öz-testi, QR betiği, sahte API ve bloğun pin listesindeki 9 dosya **değişmedi**; paket digest
aynıdır (`7C42FCCD…7BDD`). Canlı Run kapıları ve pin denetimi blokta durur ve bu düzeltmeyle gevşetilmedi (bloğa dokunulmadı). Öz-testin ölçtüğü
41 ölçüt aynıdır. Ayrıntı, komut, sonuç ve sınırlar §6.4'tedir.

**Bu turda yapılmayanlar / sınırlar.**
- Canlı yayın ağacı, canlı DB, canlı API ve canlı günlükler kullanılmadı ve okunmadı; ret ölçümlerinde canlı ağaç yolu yalnız ortam değişkeni
  değeri olarak verildi (§6.4 sonda ölçümü).
- D-4, D-5 ve EXTACC paketlerinin öz-testleri aynı sabit kütüphane kökünü taşır; değiştirilmedi (ayrı iş).
- Öz-testin bıraktığı disposable DB satırları ve `%TEMP%\d7-selftest-*` dizinleri silinmedi (önceki turlarla aynı davranış; §9).
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu tur hiçbiri için yetki değildir.

### 12.3 R02-b ek sınırlar (2026-10-03; yalnız belge)

**Kapsam.** Değişen tek dosya bu belgedir. Owner bloğu, koşucu (`d7-portal-messages-live-run.js`), blok öz-testi, koşucu öz-testi, QR betiği,
sahte API ve bloğun pin listesindeki 9 dosya **değişmedi**; §7'deki sha256 değerlerine dokunulmadı. Bu turda çalışma ağacında yeniden ölçülen:
paket dizinindeki altı betiğin sha256'sı §7 ile eşit; pin listesindeki 9 dosyanın sha256'sı bloktaki pin satırlarıyla eşit (9/9). Paket digest
yeniden **hesaplanmadı** (girdisi olan 9 dosya değişmedi). Hiçbir blok, koşucu ya da öz-test **çalıştırılmadı**; canlı ortama, konteynerlere ve
`.env` dosyasına dokunulmadı. Konu: D-6/D-7 kabul koşumunun "Run / normal kapanış / AYRI Recover" sınırları için yapılan salt okuma
araştırmasının bu belgede eksik ya da çelişkili bulduğu kalemler; her kalem belgeye yazılmadan önce kaynakta yeniden okunarak doğrulandı.

| Kalem | Kaynakta doğrulama | Belgede |
|---|---|---|
| R02B-1 — pencere açma tuzağı bu belgede yoktu (D-6 belgesinin R02 sürümünde — PR #2880; bu dalda ve `main`'de henüz yok — §4 adım 1'de kayıtlı) | doğrulandı: bloğun `Sha` fonksiyonu `Get-FileHash` çağırır (paket pinleri, canlı dist, `.env`, kanıt manifesti); komut bulunamazsa hata akıştaki genel yakalayıcıya düşer (çıkış 90). Yerel ölçüm 2026-10-03: PowerShell 7.6.6'dan `Start-Process` ile açılan Windows PowerShell 5.1.26100 çocuğunda `Get-FileHash=False`, PowerShell 7 içinden çağrı işleciyle doğrudan çağrıda `True`, ebeveyn `PSModulePath` geçici kaldırılınca `True` | §5 adım 1, §9 "Pencere açma yolu" |
| R02B-2 — kurulum ile makbuz arasındaki pencere belgede yoktu | doğrulandı: koşucu Run'da `setupI3` çağrısından sonra iki `case.create` yazması makbuz nesnesi atanmadan önce gelir; makbuz yokken kapanış dalları `nothingCreated` / `nothingToClose` döner ve `closePortal` / `closeAccess` çağrılmaz; çıkış kuralı bu durumda 1 verir; `setupI3` tek işlemdir; `User.isActive` ve `Case.status` şema varsayılanları aktif / ACTIVE (çalışma ağacındaki şema ve R27 aday commit'indeki şema; aynı); blok Recover'da makbuz dosyası ister (yoksa 90), koşucu makbuzu okuyamazsa 4 | §9 "Kurulum ile makbuz arasındaki pencere", §10 **K-7** (açık owner sorusu) |
| R02B-3 — Recover'ın 1 ve 2 çıkış kodlarının anlamı belgede yoktu | doğrulandı: koşucu `recoverExitCode` sırası 6 → 5 → 1 → 2 → 3 → 0; `fatal` yalnız hazırlık adımındaki yakalayıcıda atanır; Recover'da FAIL verip 6 ya da 5 üretmeyen tek satır P7-MSG-KEPT'tir; bloğun Recover bitiş satırı 1 ve 2'yi saymaz; koşucu öz-testinde iki Recover senaryosu vardır (Z5 → 3, Z10-r → 0 değil) | §3 "Not (R02-b) — Recover'da 1 ve 2", §9 kısa atıf |
| R02B-4 — blok ↔ koşucu metin farkları: (a) Recover özetindeki "0 kapanış + HTTP reddi doğrulandı", (b) Run kapanış satırının sabit metin oluşu | belgede **zaten kayıtlı**: (a) §9 "Recover çıkış 0, koşucu mantığında fiilen ulaşılamaz" maddesi ve §12.1 D7-E11 b; (b) §9 "DOĞRULANDI satırının sınırı" maddesi | değişiklik yok |
| R02B-5 — koşucu öz-testinde uzun yol önekli kök | doğrulandı: `d7-selftest.js` kök denetimi sırası — ad karşılaştırması (`underLive`) → kök varlığı → iki `package.json` yoklaması → gerçek yol (`realOf`) karşılaştırması → modül yükleme; önekli yazım ilk adımdan geçer, dördüncü adımda reddedilir. İfade kopyası ölçümü 2026-10-03 (vekil dizin; node v24.18.0) | §6.4 "Canlı ağaç reddi" düzeltme notu + "Sınırlar" yeni madde |

**Bu turda yapılmayanlar / sınırlar.**
- Blok metni değiştirilmedi: Recover bitiş satırı 1 ve 2 kodlarını açıklamaz; blok pencere açma tuzağını tespit etmez ve düzeltmez.
- Koşucu değiştirilmedi (pinli): kurulum → iki ek dosya → makbuz sırası aynıdır; K-7 açık owner sorusudur.
- Koşucu öz-testi değiştirilmedi: uzun yol önekli kök yine dosya yoklamasından sonra reddedilir; kurulum ile makbuz arasındaki pencere için
  senaryo yoktur.
- **Blok öz-testi bu belgeyi okur ve bu turda KOŞULMADI.** G-2 §8'deki on kalemi, G-6 §5, §8 ve §10'da "bu paketle tanımlı değildir"
  cümlesinin bulunmasını ve dört tekrar-yolu kalıbının bulunmamasını ölçer. §8'e dokunulmadı; §5 ve §10'a eklenen metin bu kalıpları içermez
  (aynı bölüm sınırları ve aynı desenle yapılan statik denetim; bu bir öz-test koşumu **değildir**). §6.4'teki 64/64 sonucu belgenin bu
  turdan **önceki** baytlarıyla alınmıştır; belgenin son baytlarıyla blok öz-testi koşumu sıradaki işin parçasıdır.
- Yerel ölçümler (pencere açma yolu; ifade kopyası) oturum içi ölçümdür: çıktıları repoya ya da kanıt dizinine **yazılmadı**; yalnız komut
  araması ve geçici vekil dizin kullanıldı, canlı yayın ağacı yoklanmadı.
- D-6 belgesi ve diğer paketler bu işin kapsamı dışındadır; değiştirilmedi.
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu tur hiçbiri için yetki değildir.
- *R03 notu:* bu listedeki "koşucu değiştirilmedi", "blok metni 1 ve 2'yi açıklamaz" ve "pencere için senaryo yoktur" maddeleri R02-b turunun
  kaydıdır; R03'te üçü de değişti (§13).

## 13. R03 — koşucu kapanış eksikleri (2026-10-03)

**Kapsam.** Owner talimatı: geçmiş testler tekrarlanmadan, açık kalan kaynakların güvenle belirlenip kapatılmasını engelleyen kusurlar için dar
koşucu düzeltmesi + izole hata senaryosu; yalnız uyarı metni eklemek çözüm sayılmaz. Normal Run kapanışı ile AYRI Recover yetkisi ayrı kalır
(çıkış 5/6 Recover yetkisi değildir). Emsal: D-6 R03 / R03-b (PR #2904; `main`'de henüz yok — o dala yazılmadı, yalnız okundu). Bu turda canlı
Run / Recover **koşulmadı**; owner bloğu **çalıştırılmadı** (yalnız blok öz-testi); canlı yayın ağacı, canlı DB, canlı `.env`, canlı API / portlar ve
canlı günlükler okunmadı / kullanılmadı. Ürün kaynağı okumaları R27 aday çalışma ağacı (`HY_WT_R27`, commit `1b758d29`) üzerindendir.

| Dosya | Değişiklik |
|---|---|
| `d7-portal-messages-live-run.js` (koşucu) | (a) makbuz `setupI3`'ten hemen sonra atanır + yazılır; ek dosya kimlikleri yazıldıkça eklenir (`setupComplete`); kanıtta `setup`; Recover kanıtında `setupEvidence` · (b) `closePortal`'da 401/403'te tek yeniden giriş + tek yeniden deneme; Run `staffReauth` verir, Recover vermez; kanıtta `portalClose.staffReauth` · (c) `productFinding` yalnız P7-C2 PASS iken; `recoveryAdvice` (portal satırı bağımsız, `adim` "ÖNERİ (yetki DEĞİL)", makbuzsuz kurulum satırı), `recoverStepText` (Recover 3 adımı verdict'lerden), `closureTag` (kalıntı parantezi ölçülenden), `messageResidue.note`, Recover `temporaryAccess` + ölçülen `temporaryAccessClosed`; `revision` alanı `R03`. Çıkış kodu fonksiyonları (`exitCodeOf`, `recoverExitCode`) ve öncelik **değişmedi** |
| `d7-fake-portal-api.js` (sahte API) | benzersiz personel token'ı (sıra no); senaryolar `staffAuth: expireOnDisable`, `disable: forbidden \| notFound`, `relogin: reject \| rateLimit` |
| `d7-selftest.js` (koşucu öz-testi) | DB kapısı kendi tek kullanımlık konteyner için genelleştirildi (§6.4 R03 notu); Z15-a/b/c/r, Z16-a..f, Z17, Z18, C-1, T-9, T-10 (41 → 56 ölçüt) |
| `d7-owner-live-block.ps1` (owner bloğu) | `PkgPins` koşucu pini + `$ExpPackage`; Run kapanış satırı parçaları verdict'lerden + satır rengi notu; kalıntı notu; onay metnindeki koşucu ifadesi atfı; Recover bitiş satırı 0/1/2/3; kurulum yarım bilgi satırı; başlık notu. Kapılar, mod sırası, node çağrısı, çıkış kodları **değişmedi**; `owner-block.json` `revision` alanı `R01` kalır |
| `d7-owner-block-selftest.ps1` (blok öz-testi) | PIN-1, O-4, O-5, O-6, O-7 (64 → 69 ölçüt); G-2 ve G-5 yeni metne göre güncellendi |

### 13.1 (a) Kurulum ile makbuz arasındaki pencere (§9, K-7)

**Kusur (R02 baytları; izole senaryoda ölçüldü).** Run önce kurulumu (`setupI3`, tek işlem), ardından **makbuz atanmadan önce** iki ek dosyayı
(yabancı tenant `I3-<runId>-xf`, hedef tenant `I3-<runId>-s`) ayrı ayrı yazıyordu. Bu iki yazmadan biri hata verirse makbuz yoktu; Run'ın kendi
kapanışı "kapatılacak bir şey yok" sayılıyordu (`closePortal` / `closeAccess` çağrılmıyordu) ve Recover makbuz dosyası olmadığı için koşulamıyordu.
Eski baytlarla ölçülen (öz-test Z15-a negatif kontrolü): ikinci ek yazma hata verdiğinde hedef tenantta **9 kullanıcının 9'u AKTİF**, 1 dosya
**ACTIVE**, yabancı tenantta 1 dosya **ACTIVE** kaldı; kanıt `closure = {ok:true, nothingToClose:true}`, makbuz dosyası yok, çıkış 1.

**Düzeltme.** Makbuz `setupI3` döner dönmez atanır (`setupComplete: false`) ve dosyaya yazılır (yazılamazsa önceki gibi portal hesabı açılmadan
durulur). Ek dosya kimlikleri yazıldıkça makbuza eklenir ve dosya yeniden yazılır (`foreignCaseId`; `sameTenantOtherCaseId` + `setupComplete: true`).
Recover makbuzdan yalnız kimlik bağı alanlarını ve personel/portal alanlarını kullanır; ek dosya kimlikleri Recover için gerekmez (kaynaktan okundu:
`closeAccess` iki sentetik tenanttaki tüm ACTIVE dosyaları kapatır).

**Bulunması — kanıttaki `setup` alanı** (`asama` = son başlayan adım · `tamamlanan` · `durum` · `makbuzDosyasi` (ölçüldü) · makbuz yoksa
`sentetikTenantDB = { hedef, yabanci }` — `ah-<runId>` / `ah-<runId>-x` slug'larının DB'deki sayısı, salt okuma):

| `setup.durum` | Ne zaman | Makbuz | Run'ın kendi kapanışı |
|---|---|---|---|
| `TAMAM` | beş adım tamam (izolasyon sayımı, kurulum, makbuz, iki ek dosya) | var | koşar |
| `YARIM_MAKBUZ_VAR` | ek dosya yazmalarından biri hata verdi | var (`setupComplete=false`) | **koşar**; Recover makbuzu bulur |
| `YARIM_MAKBUZ_DOSYASI_YAZILAMADI` | makbuz dosyası yazılamadı | bellekte var, dosya yok | koşar (öz-test Z12); makbuz dosyası olmadığı için Recover bloktan koşulamaz |
| `KURULUM_HATASI` | `setupI3` hata verdi (tek işlem; kaynaktan okundu: geri alınır) | yok | "kapatılacak bir şey yok"; sentetik tenant sayısı ölçülür (Z15-c: 0/0) |
| `KURULUM_BASLAMADI` | ilk izolasyon sayımı hata verdi | yok | aynı; koşucu yazma yapmamıştır |

Makbuz yokken sentetik tenant sayısı 0'dan büyük ölçülürse kurtarma nedenine "KURULUM: makbuz YOK … ama sentetik tenant slug'ı DB'de VAR …" satırı
yazılır ve adım "makbuz YOK: Recover bu kanıtla başlatılamaz; makbuzsuz kapanış yolu bu pakette tanımlı değildir (owner/CLIENT kararı; K-7)" der
(birim ölçümü Z18; gerçek bir belirsiz işlem onayı senaryosu koşulmadı). Bloğun Run bitişi `setup.durum` TAMAM değilse "KURULUM YARIM KALDI …"
bilgi satırı gösterir (O-7); bu satır Recover yetkisi değildir. Recover kanıtı makbuzdaki `setupComplete` alanını `setupEvidence` olarak raporlar.

**İzole senaryolar** (arıza disposable DB'ye senaryonun runId'sine bağlı geçici bir BEFORE INSERT tetikleyicisiyle verilir; koşucuya test kancası
**eklenmedi** — koşucu canlıdakiyle aynı kodu koşar; tetikleyici senaryodan sonra kaldırılır):
- **Z15-a** ikinci ek yazma (`-s`) hata verir → makbuz VAR (`setupComplete=false`, `foreignCaseId` var, `sameTenantOtherCaseId` yok); Run kapanışı
  koştu (`closure.ok`, `nothingToClose` yok; P7-C1 / U-CLOSE / P7-D9 PASS); hedef tenantta 9/9 kullanıcı pasif, dosyalar CLOSED; yabancı `-xf` CLOSED;
  API çağrısı 0; `setup.asama=ek-dosya-ayni-tenant`, `durum=YARIM_MAKBUZ_VAR`; P7-MSG-KEPT ÖLÇÜLEMEYEN, kapanış özeti "personel pasif + dosyalar CLOSED
  (U-CLOSE PASS); portal hesabı YOK"; çıkış 1.
- **Z15-r** aynı makbuzla Recover makbuzu bulur ve koşar (çıkış 4 değil): P7-C1 PASS (portal hesabı yok; kapatma ucu çağrılmaz), U-CLOSE PASS,
  `setupEvidence.setupComplete=false`; mesaj id listesi yok → P7-MSG-KEPT ÖLÇÜLEMEYEN → çıkış 3.
- **Z15-b** birinci ek yazma (`-xf`) hata verir → makbuz VAR (`foreignCaseId` yok), kapanış koştu, kullanıcılar pasif, `asama=ek-dosya-yabanci`; çıkış 1.
- **Z15-c** kurulumun kendisi hata verir (yabancı tenant yazması reddedilir) → işlem geri alındı: makbuz YOK, `asama=kurulum`, `durum=KURULUM_HATASI`,
  `sentetikTenantDB = {hedef: 0, yabanci: 0}`; kurtarma gerekmez; çıkış 1.
- **T-10** (statik) kaynak sırası: `setupI3` → makbuz ataması → makbuz yazımı → iki ek dosya yazması.

### 13.2 (b) Run kapanışında personel oturumu reddi — tek yeniden giriş + tek yeniden deneme (§9, K-8)

**Kusur (R02 baytları).** Run'ın `closePortal` çağrısına oturum yenileyici verilmiyordu; personel token'ı kapanış anında geçersizse (ör. 20 dk'ya
varan telefon beklemesi + 120 sn inceleme sonrası) kapatma ucu 401 verir, koşucu 4xx'te ikinci denemeyi yapmaz, **portal hesabı açık kalır**, koşum
çıkış 6 ile biter. Eski baytlarla ölçülen (Z16-a negatif kontrolü): kapatma çağrısı 1, personel girişi 1, P7-C2 FAIL, çıkış 6.

**Düzeltme ve sınır.** Kapatma ucu **401 ya da 403** dönerse ve DB'de portal hâlâ açıksa koşucu makbuzdaki sentetik personelle **bir kez** yeniden
giriş yapar (koşum başında kullanılan aynı kimlik bilgisi: makbuzdaki personel e-postası + tenant slug'ı + bu koşumun parolası; yeni token sır
listesine eklenir) ve kapatmayı **bir kez** yeniden dener. Başka 4xx (ör. 404) → yeniden giriş yok; ikinci 401/403 → yeniden giriş yok (döngü yok);
yeniden giriş reddedilir ya da 429 alınırsa yeniden deneme yok; 5xx / belirsiz yanıt için en çok iki adım kuralı değişmedi. Toplam: yeniden giriş ≤ 1,
kapatma çağrısı ≤ 3. Yeniden giriş fonksiyonu DB'ye yazmaz (Prisma çağrısı yok; statik ölçüt T-9); Recover'ın geçici erişim yolu (personeli aktif
yapıp parola özeti yazmak) Run'da **kullanılmaz** — personel pasifse yeniden giriş reddedilir ve yeniden deneme yapılmaz. Recover değişmedi (oturumu
Recover başında açar; 401/403'te yeniden giriş yapmaz). Yeniden giriş Run'ın **kendi** kapanışının parçasıdır; Recover değildir, Recover yetkisi doğurmaz.

**Canlıya ek etkisi — kaynaktan okundu, canlıda ölçülmedi** (`HY_WT_R27` `apps/api/src/modules/auth/auth.controller.ts` `POST /auth/login` +
`guards/login-rate-limit.guard.ts`, `auth.service.ts` `login()`, `auth.module.ts`, `portal/portal.controller.ts` + `portal.service.ts` `disablePortalUser`):
- **DB:** personel girişi (`AuthService.login`) yalnız **okur** (`user.findFirst` + tenant + bcrypt karşılaştırması + token üretimi); `lastLoginAt`,
  giriş sayacı ya da audit satırı **yazmaz**. Portal hesabının giriş sayacı (`ClientPortalUser.loginCount`) personel girişinden etkilenmez.
- **Hız sınırı:** `LoginRateLimitGuard` (personel kovası, portal kovasından ayrı; anahtar `request.ip`) her girişte — başarılı olanlar dahil — bellek
  içi sayacı 1 artırır; 60 sn pencerede 10 deneme → 5 dk blok (429). Sayaç DB'ye yazılmaz. Koşucu yerel API'ye loopback'ten bağlanır; aynı anahtarı
  paylaşan başka personel girişleri o pencerede aynı kovayı kullanır. 429 alınırsa yeniden deneme yapılmaz → çıkış 6 (öz-test Z16-d).
- **Reddin yeri:** `admin/disable-user` `JwtAuthGuard` arkasındadır (geçersiz / süresi dolmuş token → 401); `disablePortalUser` müvekkil bulunamazsa
  404, yetki denetimi (`assertCanManagePortalAccess`) başarısızsa 403 verir — üçü de **yazmadan önce** döner. Reddedilen ilk çağrı yazmamıştır;
  yeniden deneme çift yazma üretmez. Personel token süresi kaynakta `JWT_EXPIRES_IN` (varsayılan `7d`); canlı değer **ölçülmedi**.
- **Diğer:** bellek içi HTTP metrikleri (+1 giriş, +1 kapatma isteği) ve canlı API uygulama günlüğü satırları — **ölçülmedi**. Yeniden deneme başarılıysa
  yazma kümesi normal kapanışla **aynıdır** (portal pasif + sürüm artışı + bekleyen sıfırlama alanları temiz + müvekkil erişimi kapalı + kapatma audit
  satırı; aktör sentetik personel).
- **Kanıt:** `portalClose.staffReauth = { neden, giris, yenidenDeneme }` (yalnız HTTP kodları; token yok), P7-C1 gözlemindeki çağrı listesi
  ("personel oturumu YENİLENDİ (tek yeniden giriş)"), `calledEndpoints`'te `POST <API>/auth/login (kapanış: personel oturumu yenileme)`; kapanış yine
  doğrulanmazsa kurtarma nedeni "PERSONEL OTURUMU kapanışta reddedildi …" satırını taşır.

**İzole senaryolar:** **Z16-a** ilk kapatma çağrısında personel token'ları geçersizleşir (401) → tek yeniden giriş (201) + tek yeniden deneme (201) →
portal kapandı, kapanış ölçütlerinin tamamı PASS, **çıkış 0 (6 değil)**; kapatma çağrısı 2, personel girişi 2. **Z16-b** kapatma ucu her çağrıda 403
→ yeniden giriş 1, yeniden deneme 1, sonra durur (kapatma 2, giriş 2) → çıkış 6. **Z16-c** 404 → yeniden giriş yok (kapatma 1, giriş 1) → çıkış 6.
**Z16-d** 401 + yeniden giriş 429 → yeniden deneme yok (kapatma 1, giriş 2) → çıkış 6. **Z16-f** (Z5 koşumu) iki kez 500 → yeniden giriş yok
(kapatma 2, giriş 1) → çıkış 6.

### 13.3 (c) Kapanış metinleri yalnız ölçüleni söyler

**Koşucu (kanıt).**
- **Ürün bulgusu:** koşucunun portal oturumunun kapanış sonrası 200 dönmesi **yalnız DB kapanışı ölçülmüşken** (P7-C2 PASS) ürün bulgusudur ve dayanağını
  adlandırır ("… DB kapanışı ölçüldükten sonra (P7-C2 PASS) …"). DB'de portal hâlâ açıksa P7-C4L/D yine FAIL'dir ama gözlem "portal hesabı DB'de hâlâ
  AÇIK (P7-C2 FAIL …) — kapatma YAPILMADI; oturumun erişmesi bu durumda ürün bulgusu SAYILMADI" der, `productFinding` yazılmaz. Eski baytlar 403 / 404
  / 401 + 429 / iki kez 500 / süre dolumu yollarının hepsinde portal AÇIK iken "ÜRÜN BULGUSU … Recover bunu düzeltemez; token 7 gün geçerli" yazıyordu
  (Z16-a..d, Z16-f negatif kontrolü) — açık kalan portal hesabını kapatmaktan alıkoyabilecek yanlış çıkarım. Gerçek ürün bulgusu korunur (Z16-e, Z8
  guard bayat koşumu).
- **Kurtarma nedeni:** portal erişim satırı ürün bulgusu satırından **bağımsızdır** (ölçüt `portalDbClosed` = P7-C2 PASS + P7-C2V FAIL değil + P7-C5
  PASS); DB'de açık ölçüldüyse satır değerleriyle ve kapatma çağrılarıyla yazılır; DB kapalıyken doğrulanmayan ölçütler adıyla yazılır; süre iddiası
  ("token 7 gün") yerine "portal oturumunun geçerlilik süresi bu koşumda ÖLÇÜLMEDİ"; geç oluşma satırı "birkaç dakika sonra Recover BİR KEZ" yerine
  "hesap sonradan oluşmuş olabilir" der.
- **Kurtarma adımı:** "ÖNERİ (yetki DEĞİL)" ile başlar. Run: "çıkış kodu Recover yetkisi değildir; önce kanıt incelenir. Recover yalnız AYRI owner
  onayıyla başlatılır (owner bloğu `-Mode Recover -ReceiptFile <makbuz>`); kabul ölçütleri tekrarlanmaz." Recover: "kanıt incelenir ve sonuç CLIENT'a
  bildirilir. Bu çıkış kodu yeni bir Recover için yetki değildir; İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR, owner kararı gerektirir." Recover
  çıkış 3: kanıttaki P7-C2 / P7-C5 verdict'lerinden ("… P7-C2=PASS · P7-C5=PASS" ya da hesap yokken "P7-C2=ÜRETİLMEDİ · P7-C5=ÜRETİLMEDİ (portal hesabı
  YOK …)") — önceki sabit "Recover TEKRARLANMAZ: DB kapalı …" kaldırıldı (Z17).
- **Kalıntı metni:** "(sentetik tenant CLOSED; portal pasif)" yerine "(kapanış, ölçülen: …)" (§3 notu); `messageResidue.note` ölçülmeyen erişim
  iddiasını taşımaz. **Recover geçici erişimi:** "kapanışta yeniden kapatıldı" sabit iddiası (U-CLOSE'dan önce yazılıyordu) kaldırıldı; yerine ölçülen
  `temporaryAccessClosed` (U-CLOSE ile aynı kaynak).

**Owner bloğu.**
- **Run kapanış satırı:** SABİT "Portal erişim kapanışı koşucu tarafından DOĞRULANDI (DB + yeni giriş + mevcut oturum mesaj ucunda reddi)." yerine
  "Portal erişim kapanışı: koşucunun birleşik ölçütü P7-D9 PASS — DOĞRULANDI yalnız bu satırın devamında PASS yazan parçalar içindir (kanıttan): DB
  kapalı + sürüm arttı [P7-C2/C2V/C5]: … · yeni giriş reddi, yerel + dış [P7-C3L/D]: … · mevcut oturum reddi, koşucunun kendi portal oturumu, mesaj
  ucunda, yerel + dış [P7-C4L/D]: … · personel/dosya kapanışı [U-CLOSE]: … . Telefondaki oturumun reddini koşucu ÖLÇMEZ (yenileme sorusu beyandır)."
  Her parça PASS / FAIL / ÖLÇÜLMEDİ (D-6 R02 kalıbı). Gerekçe ölçüldü: P7-D9 PASS iken portal hesabı hiç açılmamış olabilir (yarım kurulum Z15-a:
  P7-C2..C5 satırı yok) ya da koşucunun portal oturumu olmayabilir. Satır rengi yine yalnız P7-D9'a bağlıdır; bu, ayrı bir not satırıyla söylenir.
- **Kalıntı notu:** "koşucunun SABİT ifadesidir" yerine "Parantez içindeki kapanış özeti koşucunun kanıttaki U-CLOSE ve portal DB ölçümünden kurulur
  (R03; sabit ifade değildir) …". Onay metni koşucunun eski ifadesine atıf yapmaz ("hedeflenen kapanış = …; sonuç kanıttaki U-CLOSE ve P7-C* satırlarından
  okunur").
- **Recover bitiş satırı:** "0 kapanış + HTTP reddi doğrulandı" (koşucu mantığında fiilen ulaşılamaz — §9) ve "3 DB kapalı ama bazı HTTP kontrolleri
  ÖLÇÜLEMEDİ" kaldırıldı; 0 / 3 / 2 / 1 koşucunun `recoverExitCode` kuralına göre yazılır (§3 R03 notu).
- **Kurulum bilgisi:** Run bitişinde `setup.durum` TAMAM değilse "KURULUM YARIM KALDI (kanıttaki setup alanı): durum=… · son aşama=… · makbuz dosyası=…"
  bilgi satırı; "Bu bilgi Recover yetkisi DEĞİLDİR".
- Run 5/6 metni (Recover yetkisi değildir; blok başlatmaz; önce kanıt; AYRI owner onayı) **değişmedi**.

### 13.4 Öz-testler, negatif kontroller, pinler (ölçülen)

Kanıt kökü (repo dışı): `HY_R27_AGENT_EVIDENCE\r04\d7-closure-r03\` (`test\`, `neg\`, `onceki\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık
konteynerinde (`postgres:16-alpine`, loopback, 5432 dışı port, `_test` adlı veritabanı; şema `D7T_LIB_ROOT`'taki üretilmiş Prisma istemcisinin şemasından
`prisma db push` ile; iş sonunda kaldırıldı) ve `D7T_LIB_ROOT` = canlı olmayan R27 aday çalışma ağacı proje kökü ile koşuldu; `d5-reset-pg` /
`d67-test-pg` / `seca-test-pg` kullanılmadı. Sahte API 8200 / dış 8459, gerçek TLS. Negatif kontroller `git archive` aynasında (çalışma ağacı bozulmadı).
Dalın tabanı `7ae481e3`; `origin/main` bu iş sırasında bir commit ilerledi (`9898e05e`, OFFICE banka hesapları) — D-7 paketine ve pinli 9 dosyaya
dokunmuyor.

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-selftest.js` — **SON BAYTLAR** (koşucu `F4B9BE18…`, sahte API `CA4BDA3D…`, öz-test `120049AC…`, blok `4BAE9DE0…`; 6 betiğin sha256'sı koşum öncesi = sonrası) | **56/56 PASS**, çıkış 0 (yeni 15: Z15-a/b/c/r, Z16-a..f, Z17, Z18, C-1, T-9, T-10; önceki 41 aynen PASS; C-1: 25 kanıt, 9'unda kurtarma gerekli, sorun yok; S-1: 77 dosya, sızıntı yok) | `test\d7-selftest-son.log`, `test\son-kosum-sha-once.txt` / `-sonra.txt`, `test\son-kosum-artifaktlar\` (giriş bilgisi taşıyan sink ve anahtar dosyaları kopyalanmadı) |
| **Negatif — koşucu:** eski koşucu baytları (`E752DA1E…`, `7ae481e3`) + R03 öz-test / sahte API / blok (ayna) | **41/56**, çıkış 1 — FAIL = **tam olarak yeni 15 ölçüt**; önceki 41 ölçüt eski baytlarda da PASS. Eski davranış ölçüldü: Z15-a/b'de makbuz yok, kapanış `nothingToClose`, hedef tenantta 9/9 kullanıcı AKTİF + dosya ACTIVE; Z16-a'da tek 401 → yeniden giriş yok → portal AÇIK → çıkış 6; Z16-a..d/f'de portal AÇIK iken "ÜRÜN BULGUSU … token 7 gün"; Z17'de Recover 3 adımı sabit "DB kapalı"; T-10'da makbuz ek dosyalardan sonra | `neg\neg-eski-kosucu.log`, `neg\neg-eski-kosucu-gozlem.txt`, `neg\ayna-eski-kosucu-kurulum.txt` |
| `d7-owner-block-selftest.ps1` — **SON BAYTLAR** (blok `4BAE9DE0…`, öz-test `A2EE5703…`; belge son hâliyle) | **69/69 PASS** Windows PowerShell 5.1 · **69/69 PASS** PowerShell 7, çıkış 0 (PIN-1: 9/9 dosya, digest `3CF44049…` = `$ExpPackage`) | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log` |
| **Negatif — blok:** eski blok baytları (`8B3B22C0…`, `origin/main`) + R03 blok öz-testi + R03 koşucu, pinli dosyalar ve belge (ayna) | **62/69**, çıkış 1, iki kabukta da — FAIL = tam olarak yeni 5 ölçüt + güncellenen 2 ölçüt: **PIN-1** (koşucu `F4B9BE18` ≠ eski pin `E752DA1E`; digest `3CF44049` ≠ `7C42FCCD`), **O-4 / O-5** (eski sabit "DOĞRULANDI (DB + yeni giriş …)" cümlesi; parça yok), **O-6** (eski "0 kapanış + HTTP reddi doğrulandı"), **O-7** (kurulum bilgi satırı yok), **G-5** (eski "koşucunun SABİT ifadesidir" notu), **G-2** (onay metninde koşucunun eski "sentetik tenant CLOSED" ifadesine atıf); kalan 62 ölçüt eski blokta da PASS | `neg\neg-eski-blok-winps51.log`, `neg\neg-eski-blok-pwsh7.log`, `neg\ayna-eski-blok-kurulum.txt` |
| Pin hesabı (yöntem doğrulaması + yeni pinler) | `origin/main` aynasında 9 pin uyuşmazlık 0, digest `7C42FCCD…` = eski `$ExpPackage`; R03 baytlarında 9 pin uyuşmazlık 0, digest `3CF44049…` = `$ExpPackage` | `onceki\pin-dogrulama-main.log`, `test\pin-dogrulama-yeni.log` |
| Ayrıştırma | iki ps1: parse hatası 0 (WinPS 5.1 ve pwsh 7); `Get-FileHash` iki kabukta bulunuyor; `node --check` (koşucu, sahte API, öz-test) 0 | `test\parse-iki-kabuk.log` |

Birim ölçümleri (koşucu öz-testi): **Z17** `recoverStepText` — hesap yokken metinde "PASS" yok ("P7-C2=ÜRETİLMEDİ · P7-C5=ÜRETİLMEDİ (portal hesabı YOK
…)"); DB kapalıyken "P7-C2=PASS · P7-C5=PASS" + ÖLÇÜLEMEYEN satırlar adıyla; Z5 Recover kanıtında (çıkış 3) adım kanıttaki verdict'i yazar. **Z18**
`recoveryAdvice` — (i) portal DB'de açık → portal satırı değerleriyle + "ürün bulgusu SAYILMADI"; (ii) ürün bulgusu + HTTP sonrası DB açık (P7-C5 FAIL) →
iki satır da; (iii) makbuz yok + sentetik tenant VAR → KURULUM satırı + "makbuz YOK: Recover bu kanıtla başlatılamaz"; (iv) Recover adımı ikinci Recover
kuralını yazar, "BİR KEZ" yok; `closureTag` U-CLOSE PASS ↔ DOĞRULANMADI. **C-1** bu öz-testin tüm Run / Recover kanıtlarında: `revision=R03`; sabit
iddia yok ("sentetik tenant CLOSED", "… kapanışıyla erişilemez", "token 7 gün", "birkaç dakika sonra Recover", "Recover BİR KEZ", "ile BİR KEZ",
"kapanışta yeniden kapatıldı", "TEKRARLANMAZ: DB kapalı"); kalıntı parantezi U-CLOSE / P7-C2 verdict'iyle tutarlı; ürün bulgusu yalnız P7-C2 PASS iken;
her Run kanıtında `setup.durum`.
Blok öz-testi: **PIN-1** pin + digest eşitliği · **O-4** tüm parçalar PASS + eski sabit cümle gösterilen metinde ve kaynakta yok + parçalar "Koşum bitti."
satırında + satır rengi notu + renk mantığı aynı · **O-5** parça varyantları (hesap yok → ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/PASS; oturum yok; C2V
ÖLÇÜLEMEYEN; FAIL yumuşatılmaz; P7-D9 FAIL → DOĞRULANAMADI) · **O-6** Recover bitiş satırı 0/1/2/3 (taklit betik) · **O-7** kurulum yarım bilgi satırı ·
**G-5** yeni kalıntı notu · **G-2** onay metninde koşucunun eski ifadesine atıf yok.

### 13.5 Durum

- **Kapalı:** kurulum ile makbuz arasındaki pencerede makbuzsuz kalıntı (iki ek dosya yazması için; K-7'nin ana yolu); Run kapanışında personel oturumu
  süre dolumu / tek seferlik 401-403 reddi nedeniyle portalın açık kalması (§9 D7-E11 a); açık portal hesabında yanlış "ürün bulgusu" ve portal açık
  satırının bastırılması; kanıttaki kurtarma adımının Recover'a yol tarif etmesi ("… ile BİR KEZ"; K-6 ile çelişki); Recover çıkış 3 adımının sabit
  "DB kapalı" iddiası; kalıntı metnindeki sabit "(sentetik tenant CLOSED; portal pasif)"; bloğun Run kapanış satırının sabit metni (§9); bloğun Recover
  bitiş satırındaki "0 kapanış + HTTP reddi doğrulandı" ve 1 / 2 kodlarının açıklanmaması.
- **Açık owner kararları:** K-1, K-2 aynen; **K-3** (400 ↔ 404 tanım teyidi) aynen; **K-4** (Recover ve dist değişimi) aynen; **K-5** kural aynen (çıkış
  5/6 Recover yetkisi değildir); **K-6** (ikinci Recover) aynen; **K-7** daraldı (yalnız kurulumun kendisinin sonucu belirsiz bitmesi; makbuzsuz kapanış
  yolu tanımlı değil); **K-8** yeni (Run kapanışında tek yeniden giriş kabulü).
- **Ölçülmeyenler:** yeniden girişin canlı etkisi (DB yazmaması, hız sınırı sayacı, metrik / günlük) yalnız kaynaktan okundu; canlı personel token
  süresi (`JWT_EXPIRES_IN`) ve canlı hız sınırı anahtarı ölçülmedi; sahte API ürünün kendisi değildir (ürünün gerçek JWT süresi / yetki reddi / hız
  sınırı davranışı canlıda ölçülmedi); kurulum işleminin onayı sırasında sonucu belirsiz bir kopma (`setupI3` için) üretilmedi ve incelenmedi; makbuzsuz
  durumda "sentetik tenant VAR" kurtarma satırı yalnız birim ölçümüyle (Z18) sınandı; ek dosya yazma hatası gerçek bir DB arızasıyla değil, tetikleyiciyle
  üretildi; R03 dalı main'e girmedi ve canlı Preflight bu baytlarla koşulmadı.
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu revizyon hiçbiri için yetki değildir; canlı koşum ayrı owner GO'su
  (`OWNER-GO-CLIENT-EXTACC-D7-YYYYMMDD-RNN`) ister.
- **R03-c notu:** §13.4'teki "(ii) ürün bulgusu + HTTP sonrası DB açık (P7-C5 FAIL) → iki satır da" ölçümü R03 içindir; R03-c'de bu dal **değişti**
  (§14). §13'ün tabloları R03 baytlarının tarihsel kanıtıdır.

## 14. R03-c — kapanış / Recover doğruluğu (2026-10-03; owner talimatı madde 2)

Kapsam: owner talimatı madde 2 — "kapanış veya Recover hakkında kanıtın desteklemediği başarı ifadesi bulunmasın; ölçülemeyen mevcut oturum
reddi açıkça belirtilsin; makbuz yazılamadığında uygulanamayacak bir Recover komutu önerilmesin, gerçekten kullanılabilir kurtarma yolu ya da
somut engel gösterilsin". Önceki bağımsız doğrulamanın açık bıraktığı maddeler **kaynakta doğrulandı** (R03 baytları `e35f6ac6`) ve dar düzeltildi;
ek tarama (7c) iki kalem daha buldu. Canlı Run / Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi); canlı ağaç, canlı DB,
canlı `.env`, canlı API/portlar kullanılmadı. Çıkış kodu fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` alanı `R03` kalır.

### 14.1 Kaynakta doğrulanan açıklar (R03 baytları)

| No | Açık (R03) | Etki |
|---|---|---|
| 7a | Bloğun Recover bitiş satırında "mevcut oturum reddi Recover'da ÖLÇÜLEMEZ" yalnız 3'ün açıklamasındaydı; "2 = kapanışlar doğrulandı …" ve "1 = DURDU: kapanışlar doğrulandı …" hangi kapanışların doğrulandığını söylemiyordu (HTTP reddi değil: portal DB kapanışı ya da hesap yok + personel/dosya) | 2 / 1 okunurken mevcut oturum reddinin de doğrulandığı sanılabilirdi |
| 7b | Run'ın kurtarma adımı (`recoveryAdvice`) yalnız makbuz **yolu** var mı diye bakıp `-Mode Recover -ReceiptFile <makbuz>` öneriyordu: makbuz bellekte var ama ilk yazımı başarısızsa (`setup.durum = YARIM_MAKBUZ_DOSYASI_YAZILAMADI`, `makbuzDiskte = false`) ya da sonraki yazımlar başarısız / dosya okunamıyorsa da aynı komut yazılıyordu. Bloğun Run 5/6 metni dosyaya hiç bakmadan aynı komutu öneriyordu | uygulanamayan Recover komutu önerisi |
| 7c-1 | Tarama: `closePortal` koşucu oturumunun 200'ünü yalnız P7-C2 PASS ile ürün bulgusu sayıyordu; P7-C5 (HTTP ölçümlerinden **sonraki** DB) yargıdan sonra okunuyordu. Hesap P7-C2 ile P7-C5 arasında yeniden açılırsa (P7-C5 FAIL) "ÜRÜN BULGUSU … Recover düzeltemez" yazılıyor, portal satırı açık değerleri göstermiyordu (D-6 6a ile aynı kusur) | ölçülmemiş ürün bulgusu; açık hesap kurtarma nedeninde görünmüyordu |
| 7c-2 | Tarama: portal hesabı **yokken** (ör. yarım kurulum) Run ve Recover günlüğündeki satır "OK P7-C1 portal erişimi yetkili uçla kapatıldı" diyordu — kapatma yapılmamıştı, ölçülen yalnız "hesap yok" (kanıttaki gözlem doğruydu; satır açıklaması günlükte) | kanıtın desteklemediği kapanış ifadesi |

**Recover makbuzu nasıl okur (kaynaktan):** blok `-ReceiptFile` yolunda dosya var + JSON + `record = EXTACC-D7-SETUP-RECEIPT` + `runId` 8 hex; koşucu
`record` + `elevUserId` + `elevEmail` + `runId` eşleşmesi + DB kimlik bağı (doğrulanmazsa yazmadan çıkış 4). Run kanıtındaki `receipt` alanı koşucunun
bellekteki makbuz nesnesidir (`runnerMessageIds` dahil; parola / token içermez). Dosya yoksa ya da okunamıyorsa bu nesneden yazılan yeni bir dosya
Recover'ın iki kapısını da geçebilir — öz-testte **uçtan uca ölçüldü** (Z19-b). Makbuz hiç oluşmadıysa (kurulum yarıda) önceki metin kalır: "makbuz
YOK: Recover bu kanıtla başlatılamaz; makbuzsuz kapanış yolu bu pakette tanımlı değildir (owner/CLIENT kararı; K-7)".

### 14.2 Değişiklik

- **Koşucu (7b):** yeni `receiptFileState` (salt okuma: dosya var + JSON + kayıt türü + runId + personel alanları; bellekteki makbuzla eşitlik). Run
  adımı: makbuz kullanılabilirse komut önerilir (diskteki makbuz bellektekinden farklıysa "FARKLI" + yazma hatası); bellekte var ama dosya yok /
  okunamıyorsa komut **önerilmez**: "makbuz dosyası YOK|OKUNAMIYOR (neden · yazma hatası · setup.durum=…): bu makbuz yoluyla bloktan Recover
  BAŞLATILAMAZ … Kullanılabilir yol: bu kanıttaki `receipt` nesnesi … yeni bir JSON dosyasına yazılır ve Recover yalnız AYRI owner onayıyla
  `-ReceiptFile <o dosya>` ile başlatılır". Kanıtta yeni alan `recovery.makbuzDurumu`; `makbuzDiskte` (dosya var mı) aynen.
- **Koşucu (7c-1):** P7-C5 DB okuması oturum yargısından önce (satır sırası aynı); `productFinding` yalnız P7-C2 PASS + P7-C5 PASS; P7-C5 FAIL'de gözlem
  "ürün bulgusu adayı DEĞİL — hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL …)"; `recoveryAdvice` ürün bulgusu satırını yalnız P7-C2 + P7-C5 PASS
  iken yazar, portal satırı HTTP sonrası değerlerle "yeniden AÇILDI … açık erişim kapatılmalıdır" der.
- **Koşucu (7c-2):** hesap yok dalında P7-C1 açıklaması "portal hesabı YOK (DB'de ölçüldü) — kapatılacak portal erişimi yok; kapatma çağrısı
  YAPILMADI"; verdict değişmedi.
- **Blok (7a, yalnız METİN):** Recover bitiş satırı "HER KODDA: mevcut oturum reddi Recover'da ÖLÇÜLEMEZ — HER ZAMAN (P7-C4L/D; …); yeni giriş
  reddinin ölçülüp ölçülmediği kanıttaki P7-C3L/D satırlarından okunur · 0 = … · 3 = …; personel/dosya kapanışı doğrulandı · 2 = portal DB kapanışı
  (ya da portal hesabı yok) ve personel/dosya kapanışı doğrulandı, hazırlık hatası yok, en az bir satır FAIL (Recover'da yalnız P7-MSG-KEPT …) ·
  1 = DURDU: portal DB kapanışı (ya da portal hesabı yok) ve personel/dosya kapanışı doğrulandı ama hazırlık adımında hata (…) · 6 · 5 · 4 · 7 · 91".
- **Blok (7b, yalnız METİN):** yeni `Get-ReceiptFileState`; Run 5/6: makbuz okunabiliyorsa önceki öneri + "Makbuz dosyası: VAR"; değilse "MAKBUZ
  DOSYASI YOK|OKUNAMIYOR …: bu makbuzla bloktan Recover BAŞLATILAMAZ" + kanıttaki receipt yolu ya da "SOMUT ENGEL (K-7)". Recover'ın canlı yazma
  kümesini ve ikinci Recover kuralını anlatan satırlar aynen. `PkgPins` koşucu pini + `$ExpPackage`. Kapılar, sıra, Recover okuma kapısı, çıkış
  kodları değişmedi.
- **Sahte API:** `reopen normal|afterDisable` (başarılı kapatmadan sonraki ilk yerel mesaj listesi isteğinde hesap DB'de yeniden açılır).

### 14.3 Öz-testler, negatif kontroller (ölçülen)

Kanıt kökü (repo dışı): `HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\d7\` (`test\`, `neg\`, `onceki\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık
konteynerinde (`postgres:16-alpine`, loopback, 5432 dışı port, `_test` adlı veritabanı; şema `D7T_LIB_ROOT`'taki üretilmiş Prisma istemcisinin
şemasından `prisma db push`; iş sonunda kaldırıldı); `D7T_LIB_ROOT` = canlı olmayan R27 aday çalışma ağacı proje kökü; sahte API 8200 / dış 8459.
Negatif kontroller `git archive e35f6ac6` aynasında (çalışma ağacı bozulmadı).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-selftest.js` — **SON BAYTLAR** (koşucu `08B5CA7A…`, sahte API `387A923B…`, öz-test `8AC501B7…`, blok `75B5E8E6…`; 6 betiğin sha256'sı koşum öncesi = sonrası) | **59/59 PASS**, çıkış 0 (yeni 3: Z15-d, Z19-a, Z19-b; değişen 3: Z16-e, Z18, C-1; önceki 53 aynen) | `test\d7-selftest-son.log`, `test\son-kosum-sha.txt`; ara koşumlar `test\d7-selftest-ilk*.log` |
| `d7-owner-block-selftest.ps1` — **SON BAYTLAR** (blok `75B5E8E6…`, öz-test `A63945DE…`; belge son hâliyle) | **70/70 PASS** Windows PowerShell 5.1 · **70/70 PASS** PowerShell 7, çıkış 0 (PIN-1: 9/9, digest `97C9F56A…` = `$ExpPackage`) | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log` |
| **Negatif — koşucu:** R03 baytları (`e35f6ac6` aynası: koşucu `F4B9BE18…`, blok `4BAE9DE0…`, belge) + R03-c öz-test / sahte API | **53/59**, çıkış 1 — FAIL = tam olarak yeni / değişen 6 kalem (Z15-d, Z16-e, Z18, Z19-a, Z19-b, C-1). Eski davranış ölçüldü: hesap ölçüm sırasında yeniden açılmışken `productFinding` + "… Recover düzeltemez", portal satırı açık değerleri yazmıyor; makbuz yolu klasör olup yazma EISDIR ile başarısızken adım `-Mode Recover -ReceiptFile <makbuz>` öneriyor; hesap yokken günlükte "OK P7-C1 portal erişimi yetkili uçla kapatıldı". Kanıttaki `receipt` nesnesinden yazılan dosyayla Recover eski baytlarda da koştu (çıkış 3, kimlik OK) — yol koşucu değişikliğine bağlı değildir | `neg\neg-eski-kosucu.log`, `neg\neg-eski-kosucu-gozlem.txt`, `neg\ayna-kurulum.txt` (Z15-d eklenmeden önceki ara negatif: `neg\neg-eski-kosucu-ilk.log`, 53/58) |
| **Negatif — blok:** aynı ayna (R03 bloğu + R03 belgesi) + R03-c blok öz-testi | **68/70**, çıkış 1 — FAIL = **O-6**, **O-8** (iki kabukta da; PIN-1 aynada eski koşucu + eski pinle tutarlı → PASS) | `neg\neg-eski-blok-winps51.log`, `neg\neg-eski-blok-pwsh7.log` |
| Pin hesabı | 9 pin uyuşmazlık 0, digest `97C9F56A…` = `$ExpPackage` | `test\pin-dogrulama-yeni.log` |
| Ayrıştırma | iki ps1: parse hatası 0 (WinPS 5.1 ve pwsh 7); `node --check` (koşucu, sahte API, öz-test) 0 | `test\parse-iki-kabuk.log` |

Yeni / değişen ölçütler:
- **Z19-a** (yeni senaryo `guard: stale` + `reopen: afterDisable`): kapatma 201 → P7-C2 PASS; hesap ölçüm sırasında yeniden açıldı → P7-C5 FAIL; oturum
  200 → P7-C4L/D FAIL + "ürün bulgusu adayı DEĞİL — hesap ölçüm sırasında yeniden AÇILDI …"; `productFinding` yok; "Recover düzeltemez" yok; portal
  satırı HTTP sonrası değerlerle; DB'de hesap açık; çıkış 6.
- **Z19-b** (uçtan uca): gösterimden sonra makbuz yolu klasör yapılır (sonraki makbuz yazımı EISDIR); kapatma 500 → portal açık, çıkış 6; kanıtta
  `receiptWriteError` + `makbuzDurumu=OKUNAMADI`; adım komut önermez + kanıttaki `receipt` yolu; o nesne (`runnerMessageIds` dahil) değiştirilmeden
  dosyaya yazılıp Recover'a verilir → kayıt `EXTACC-D7-RECOVER`, kimlik bağı OK, disable-user çağrıldı, portal pasif + erişim kapalı, yeni giriş 401,
  P7-MSG-KEPT PASS, personel pasif, çıkış 3.
- **Z15-d** (yeni, uçtan uca): hesap yokken (Z15-a Run, Z15-r Recover) P7-C1 günlük satırı "portal hesabı YOK (DB'de ölçüldü) — kapatılacak portal
  erişimi yok; kapatma çağrısı YAPILMADI"; "kapatıldı" yok; disable-user çağrısı 0.
- **Z18 (v)** (birim; değişen Z18'in yeni kolu): `setup.durum = YARIM_MAKBUZ_DOSYASI_YAZILAMADI`, makbuz bellekte, dosya yok → komut yok, "makbuz
  dosyası YOK (dosya yok (ENOENT) · makbuz yazma hatası: … · setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI): … BAŞLATILAMAZ" + kanıttaki receipt
  yolu; yol klasörse "OKUNAMIYOR (EISDIR)"; makbuz okunabiliyorsa komut önerilir; `receiptFileState` beş durum. **Z18 (ii)** (değişti): P7-C5 FAIL
  iken ürün bulgusu satırı yok, portal satırı "yeniden AÇILDI". **Z16-e** (değişti): gerçek ürün bulgusunun dayanağı "(P7-C2 PASS + P7-C5 PASS)".
  **C-1** (değişti): ürün bulgusu yalnız P7-C2 + P7-C5 PASS iken; makbuz dosyası kullanılamıyorken Run adımı komut önermez.
- **O-6** (blok, değişti): genel cümle kodlardan önce; 2 / 1 doğrulananı adlandırır; eski "2 = kapanışlar doğrulandı" / "1 = DURDU: kapanışlar
  doğrulandı" yok. **O-8** (blok, yeni): Run çıkış 5/6 metni dört makbuz durumunda (var · yok · bozuk · kanıtta da yok); ikinci Recover kuralı dördünde de.

### 14.4 Durum

- **Kapalı:** 7a, 7b (kanıtta ve blokta), 7c-1, 7c-2. **R03-d: 7c-1'in kapanışı GERİ ALINDI** (R03-c'nin "adayı DEĞİL" sınıflaması yanlıştı) ve 7a /
  7b R03-c bağımsız doğrulamasında eksik bulundu (kanıtsız 1; BOM'lu makbuz; bayat makbuz) — düzeltmeler §14.5.
- **Açık owner kararları:** K-1 … K-8 aynen. Kanıttaki `receipt` nesnesinden makbuz dosyası yazmak (7b kullanılabilir yolu) Recover'dan önceki bir
  dosya işlemidir: kim yazar ve Run kanıt dizini dışında mı yazılır — owner / CLIENT kararıdır; bu paket onu kendiliğinden yapmaz. Makbuz hiç
  oluşmadıysa makbuzsuz kapanış yolu tanımlı değildir (K-7).
- **Ölçülmeyenler:** canlıda hiçbiri koşulmadı; sahte API ürünün kendisi değildir (hesabın ölçüm sırasında yeniden açılması dış müdahale taklididir).
  `YARIM_MAKBUZ_DOSYASI_YAZILAMADI` durumu uçtan uca üretilmedi (ilk makbuz yazımı başarısızsa Run kendi kapanışını koşar ve kapanış doğrulanırsa
  kurtarma gerekmez — Z12); bu durumun adım metni birim ölçümüyle (Z18 v) sınandı; uçtan uca ölçülen, sonraki yazımların başarısız olduğu durumdur
  (Z19-b). Bloğun Recover okuma kapısı kanıttaki `receipt` kopyasıyla ayrıca koşulmadı (kapı yalnız dosya + JSON + kayıt türü + runId biçimine bakar —
  kaynaktan; koşucunun kapısı ve kimlik bağı Z19-b'de koşuldu). Mevcut oturum reddi Recover'da yapısal olarak ölçülemez; Run kanıtındaki P7-C4 satırları
  tek kaynaktır.
- Bu revizyon canlı Run / Recover'ı yetkilendirmez; canlı koşum ayrı owner GO'su ister.

### 14.5 R03-d — R03-c bağımsız doğrulamasının bulguları (2026-10-04)

Kapsam: owner ölçütü — kapanış veya Recover hakkında kanıtın desteklemediği ifade YOK; Recover'da ölçülemeyen mevcut oturum reddi açık; makbuz
yazılamadığında uygulanamayan Recover komutu YOK, gerçekten kullanılabilir yol ya da somut engel. Bulgular önce **kaynakta doğrulandı** (R03-c yerel ucu
`0692b678`; ürün kaynağı `HY_WT_R27` salt okuma), sonra D-6 R03-d ile aynı ilkeyle dar düzeltildi. Canlı Run/Recover **koşulmadı**, owner bloğu
**çalıştırılmadı** (yalnız blok öz-testi). Çıkış kodu fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` `R03` kalır.

**Önceki turun hatası (açıkça):** R03-c §14.2 / §14.3'teki "P7-C2 PASS + P7-C5 FAIL (hesap ölçüm sırasında yeniden açıldı) iken koşucu oturumunun
200'ü **ürün bulgusu adayı DEĞİL**" sınıflaması ve Z19-a beklentisi **yanlıştı**. Kaynak (`HY_WT_R27`): `portal-auth.guard.ts` 66-68 — claim sürümü DB
sürümünden farklı eski token `isActive`'ten **bağımsız** reddedilir (pasif hesap da 58-60'ta); `portal.service.ts` 307-316 — yeniden açma
`tokenVersion`'ı **artırır** (kapatma da 763-769'da). Hesap ürün yoluyla yeniden açılsa bile eski oturumun reddedilmesi beklenir; 200 bir oturum iptali
**ürün bulgusu adayıdır**. R03-c sahte API'si yeniden açmada sürümü değiştirmediği için hata öz-testte görünmedi.

| No | Bulgu | Kaynakta doğrulama (0692b678) | Düzeltme |
|---|---|---|---|
| M1 | P7-C2 PASS + P7-C5 FAIL iken 200 → "adayı DEĞİL", productFinding / "Recover düzeltemez" düşüyor | `closePortal` `if (flags)` dalı sürüme bakmıyor; sahte API `reopen` sürümü değiştirmiyor — **doğrulandı** | D-6 ile aynı `sessionClassDuringChange` (metin "mesaj ucuna"): sürüm farkı → "ÜRÜN BULGUSU ADAYI — eski oturum sürüm reddine rağmen erişti" (`productFinding`, "oturum reddi ürün tarafıdır, Recover düzeltemez", `sessionVersion.sinif=ADAY`) + AYRI "yeniden AÇILDI (P7-C5 FAIL …): açık erişim kapatılmalıdır (Recover kapatabilir)"; eşit + hesap açık → "adayı DEĞİL"; eşit + pasif → ADAY; bilinmiyor → "ayrıştırılamadı (ÖLÇÜLEMEDİ)". Blok ADAY'ı "ADAYIDIR (CLIENT doğrular)" gösterir. Sahte API `afterDisable` sürümü artırır, `afterDisableRevert` geri döndürür |
| M2 (minör) | Blok Recover 1'i "… doğrulandı" diye açıklıyor; kanıtsız 1 mümkün | blok satırı yalnız "kanıt dosyası yoksa … bitmiş olabilir" diye çekince taşıyordu, kanıtı ölçmüyordu — **doğrulandı**; R03-d koşucusunda kanıtsız 1 **ölçüldü** (`dogrulama-ortak\crash-probe\crash-probe.log`) | `Get-RecoverEvidenceState` (dosya + `EXTACC-D7-RECOVER` + `exitCode` = süreç kodu); değilse kırmızı "KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi" / "… EŞİT DEĞİL"; kod açıklamaları yalnız okunabilir kanıt varken; çekince cümlesi kaldırıldı |
| m3 | 3 "portal DB kapanışı ölçüldü" (P7-C2V ÖLÇÜLEMEYEN olabilir) | `portalDbClosed` C2V için yalnız "FAIL değil" — **doğrulandı** | "3 = FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN — P7-C2 / P7-C5 ölçüldü; P7-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir — kanıttaki satır) ya da portal hesabı yok …"; 2 / 1 "3'teki portal ölçütleri" |
| m4 | "receipt nesnesini yeni JSON dosyasına yazın" kullanılamıyor (BOM; PS 7 tarih dönüşümü; 5.1 derinlik) | koşucu Recover okuması BOM atmıyor — **doğrulandı**; PS 7 `receipt.createdAt` → DateTime **ölçüldü** (O-9) | `readReceiptForRecover` (BOM atılır, tek kaynak); Run kanıtı `recovery.makbuzJson` = `JSON.stringify(receipt, null, 1)`; adım ve blok TEK komut: `(Get-Content -Raw -Encoding UTF8 -LiteralPath '<kanıt>' \| ConvertFrom-Json).recovery.makbuzJson \| Set-Content -Encoding UTF8 -NoNewline -LiteralPath '<kanıt dizini>\d7-setup-receipt-kanittan.json'` + AYRI owner onayıyla `-Mode Recover -ReceiptFile '<o dosya>'` (gerekçe: dizge taşımak gidiş-dönüş dönüşümlerini dışlar) |
| m5 | (D-6'ya özgü) | D-7'de yabancı satır temizliği ve "temizlendi" açıklaması **yok** (kaynak taraması) | — |
| m6 | `makbuzDiskte` `existsSync` → klasörde true | **doğrulandı** (negatifte ölçüldü); `setup.makbuzDosyasi` da `existsSync` | ikisi de `statSync().isFile()` (setup'ta ENOENT → false, başka hata → null) |
| m7 | Bayat makbuzda blok "VAR" deyip öneriyor | **doğrulandı** (bayat makbuz runnerMessageIds'i içermeyebilir → P7-MSG-KEPT eksik sayım) | koşucu: bayatta öneri yok + TEK komut ("farklı alan(lar): runnerMessageIds …"); blok: makbuzJson metin eşitliği, eşit değilse "BAYAT … ÖNERİLMEZ" + TEK komut |

**Öz-testler ve negatif kontroller (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\r2\` (`d7\test\`,
`d7\neg\`, `dogrulama-ortak\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık konteynerinde (`postgres:16-alpine`, loopback, yüksek port, `_test`
adlı veritabanı; şema `HY_WT_R27` `apps/api/prisma/schema.prisma` kopyasından `prisma db push --skip-generate`; iş sonunda kaldırıldı);
`D7T_LIB_ROOT` = `HY_WT_R27\project`; ortak ağır koşu kilidi alındı / bırakıldı; koşumdan önce kullanılabilir commit ölçüldü (≥ 4 GB).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-selftest.js` — son baytlar | **63/63 PASS**, çıkış 0 (yeni 4: Z20-a..d; değişen 4: Z18, Z19-a, Z19-b, C-1; S-1 PASS) | `d7\test\d7-selftest-son.log` (+ `.sha-once` / `.sha-sonra`) |
| `d7-owner-block-selftest.ps1` — son baytlar (belge son hâliyle) | **72/72 PASS** Windows PowerShell 5.1 · **72/72 PASS** PowerShell 7 (PIN-1 9/9, digest = `$ExpPackage`) | `d7\test\blok-oz-test-son-winps51.log`, `d7\test\blok-oz-test-son-pwsh7.log` |
| **Negatif — koşucu:** `0692b678` aynası + R03-d öz-test / sahte API | **55/63**, çıkış 1 — FAIL = tam olarak Z18, Z19-a, Z19-b, Z20-a, Z20-b, Z20-c, Z20-d, C-1. Eski davranış ölçüldü: yeniden açılan hesapta (sürüm 1→2) "adayı DEĞİL"; sürüm geri dönüşünde de aynı; makbuz okunamazken TEK komut yok; bayat makbuzda `-ReceiptFile <makbuz>`; klasörde `makbuzDiskte=true`; Run kanıtlarında `recovery.makbuzJson` yok | `d7\neg\neg-eski-kosucu.log`, `d7\neg\neg-eski-gozlem.txt`, `d7\neg\ayna-kurulum.txt` |
| **Negatif — blok:** aynı ayna + R03-d blok öz-testi | iki kabukta **68/72**, çıkış 1 — FAIL = tam olarak O-6, O-8, O-9, O-10 | `d7\neg\neg-eski-blok-winps51.log`, `d7\neg\neg-eski-blok-pwsh7.log` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `1E046F24…` = `$ExpPackage`; iki ps1 parse hatası 0 (iki kabuk), `node --check` 0, iki ps1 UTF-8 BOM | `d7\test\pin-dogrulama-son.log`, `d7\test\parse-iki-kabuk.log` |

Yeni / değişen ölçütler: **Z19-a** (guard kusur taklidi + yeniden açma → ADAY + ayrı satır; "adayı DEĞİL" / "SAYILMADI" yok) · **Z20-a** (guard normal →
401, P7-C4 PASS) · **Z20-b** (sürüm geri dönüşü → "adayı DEĞİL") · **Z20-c** (sınıflama + kurtarma nedeni birim) · **Z20-d** (bayat makbuz; klasör
`makbuzDiskte=false`; BOM'lu makbuz) · **Z18 (v)** (TEK komut metni) · **Z19-b** (komut WinPS 5.1 ve PS 7 ile **gerçekten** koşuldu: 5.1 BOM'lu, 7
BOM'suz, ikisi `makbuzJson`'a birebir, koşucu kapısı ok; iki Recover kimlik bağı OK, P7-MSG-KEPT makbuzdaki koşucu id'leriyle PASS, çıkış 3) · **C-1**
(ürün bulgusu yalnız P7-C2 + P7-C5 PASS ya da ADAY; Run kanıtında `makbuzJson` birebir; bayatta komut yok) · **O-6** (3 metni + "1 + kanıt yok" + "kod
farklı") · **O-8** (bayat + TEK komut somut yollarla) · **O-9** (bloğun gösterdiği TEK komut iki kabukta; bloğun ve GERÇEK koşucunun Recover kapısı) ·
**O-10** (ADAY gösterimi).

**Ölçülmeyenler / sınır:** canlıda hiçbiri koşulmadı. Sahte API ürün değildir (yeniden açma bir dış müdahale taklididir); ADAY bir **aday**dır (kaynak +
sahte API); canlı guard'ın 200 verdiği bir durum gözlenmedi. "Sürüm eşit ama hesap pasif → ADAY" dalı yalnız birim ölçümüyle (Z20-c). Gerçek bir
makbuz yazma hatası izin / disk ile uçtan uca koşulmadı (Z19-b: yol klasör → EISDIR; bayatlık birim ile). Blok Recover'ının koşucuyu gerçek veriyle
çağırması ölçülmedi (blok öz-testinde koşucu sahte, kapı fonksiyonu gerçek; koşucu tarafı Z19-b'de gerçek DB ile). `-ReceiptFile` için yazılan yeni
dosyanın kim tarafından ve nereye yazılacağı owner / CLIENT kararıdır. Bu revizyon canlı Run / Recover'ı yetkilendirmez.
