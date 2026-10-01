# EXTACC D-7 — PORTAL MESAJ AKIŞI CANLI KABUL PAKETİ (R01 · owner bloğu metni R02)

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
| **P7-MSG-KEPT** | koşucunun yazdığı `PortalMessage` satırlarının **tamamı yerinde** (`yerinde=k/k`) ve `PortalMessage`/`PortalNotification` **SİLİNMEDİ**; kanıt `yerinde=k/k · saklandı: n mesaj (koşucu k · telefon t) + m bildirim satırı (sentetik tenant CLOSED; portal pasif) — SİLİNMEDİ`; `messageResidue.deleted=false`. Koşucu **hiç mesaj yazmadıysa** (ya da Recover makbuzunda `runnerMessageIds` yoksa) boş-doğrulama PASS **verilmez**: **ÖLÇÜLEMEYEN** + yalnız rapor. Koşucu mesaj id'leri makbuza `runnerMessageIds` olarak yazılır; Recover bunlarla gerçek sayım yapar | DB |
| U-CLOSE / U-ISO / P7-D9 | personel/dosya kapanışı · izolasyon (yalnız sayı) · birleşik | DB |

Gösterim kapısı: `P7-03L, P7-04D, D7-1, D7-2, D7-3, D7-3U` PASS değilse giriş bilgisi gösterilmez, telefon beklenmez (D7-4N/4S/4U/3N kapı dışı: kusur
FAIL olur, akış sürer). Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 5 PERSONEL/DOSYA · 6 PORTAL KAPANIŞI DOĞRULANMADI ·
7 KANIT YAZILAMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0); owner bloğu 90 kapı · 91 node. Recover ölçülemeyeni 0 yapmaz (C4 Recover'da hep ÖLÇÜLEMEYEN → 3).

**Not (R02) — "sentetik tenant CLOSED" ifadesi:** P7-MSG-KEPT kanıt metnindeki "(sentetik tenant CLOSED; portal pasif)" ve `messageResidue.note`
içindeki "sentetik tenant kapanışı" ifadeleri koşucunun (pinli, bu revizyonda DEĞİŞMEDİ) ürettiği sabit metindir ve şu anlama gelir:
**dosyalar CLOSED, personel pasif, portal pasif**. Tenant kaydı kapatılmaz; **tenant yaşam döngüsü değişmez** (kaynaktan okundu: kapanışta
yazılanlar `User`, `Case`, portal hesabı, müvekkil erişim bayrağı ve kapatma audit satırıdır; `Tenant` satırına yazma yoktur).
Owner bloğu bu açıklamayı onay metninde ve kalıntı satırının altında gösterir.
**Not (R02) — Recover çıkışı:** "C4 Recover'da hep ÖLÇÜLEMEYEN" portal hesabı varken geçerlidir; hesap hiç oluşmadıysa C3/C4 satırları üretilmez (§9).

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
yeni bir Recover için yetki değildir.
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
   adımı metni ("Owner bloğu `-Mode Recover -ReceiptFile <makbuz>` ile BİR KEZ" — koşucu pinli, değişmedi) bir **öneridir**, yetki değildir.
   Recover (`-Mode Recover -ReceiptFile <kanıt dizinindeki d7-setup-receipt.json>`) yalnız bu inceleme sonrası **AYRI owner onayıyla**, **BİR
   KEZ** koşulur; canlıya ne yazdığı §8.1'dedir; ürün bulgusu varsa Recover onu düzeltmez; kabul tekrarlanmaz. "BİR KEZ" kodla zorlanmaz:
   ikinci bir Recover'ı blok da koşucu da engellemez — tekrar gerekiyorsa yeni kanıt incelemesi ve yeni AYRI owner onayı gerekir.

## 6. Öz-testler (canlıya dokunmadan; 2026-09-29; disposable DB `5449/d67_test`, sahte API 8200/8459, gerçek TLS)

> **Hangi baytlar (R02):** bu tablo ve §6.1 **R01 kayıtlarıdır** (2026-09-29; blok `EDDF7BF3…CA5D`, blok öz-testi `9A5A31F0…70B3`) ve tarihsel
> olarak korunur. Blok ve blok öz-testi R02'de değişti; **son dosya baytlarının sonuçları §6.2'dedir** — güncel durum için §6.2 okunur.

| Test | Sonuç |
|---|---|
| `d7-selftest.js`: Z1 normal 0 (tüm ölçütler PASS; telefon: sayfa 200 · giriş 201 · 3 mesaj · mark-read · gönderim 201 · 2. yanıt görüldü; kalıntı 5 mesaj + 2 bildirim "yerinde=4/4 … SİLİNMEDİ"; **Z1-g** D7-3G `gövde={client,messages} · listede=3/3`, D7-4S 400 + satır yok, D7-3B `satır=true`, makbuz `runnerMessageIds` 4; admin yalnız yerel; kapanış sonrası telefon oturumu 401) · Z2 liste sızıntısı → D7-2 FAIL, 2 · Z3 kapsam dışı caseId kabul → D7-4N/**4S**/4U FAIL, 2 (kalıntı 8) · Z4-a send 500 → 2 · Z4-b send 500 + kapatma 500 → **6** · Z5 yarım (kapatma 500) 6 → Recover 3 (C4 ölçülemeyen; kalıntı makbuz id'leriyle **gerçek sayım** `yerinde=4/4`) · Z6 mark-read etkisiz → D7-3U FAIL 2 · Z7 bildirim yok → D7-3N FAIL 2 · Z8 guard kusuru → C4 200, ÜRÜN BULGUSU, 6 · **Z14-a** personel yanıtı yanıtsız → D7-3/3N/3U/3F **ÖLÇÜLEMEYEN** (FAIL 0), 3 · **Z14-b** unread-count yanıtsız → D7-3U ÖLÇÜLEMEYEN, 3 · Z9 kapılar (onay 3 · D-5 GO 3 · none+canlı DB 4 · TLS 1 · slug 4 · http 4) · Z10 create 500 → 6, P7-MSG-KEPT **ÖLÇÜLEMEYEN** (boş-doğrulama yok) · **Z10-r** Recover (id listesi yok) → P7-MSG-KEPT ÖLÇÜLEMEYEN · Z10-b geç oluşma görülüp kapatıldı · Z11 konsolsuz 4 · Z12 makbuz 1 · Z13 telefon yok → 3 (`yerinde=3/3`) · S-1 sır sızıntısı (parolalar/JWT/DB URL/GO/**telefon mesajı içeriği**/tuzak içerik) yok · T-1…T-8, P-1/P-2 statik | **41/41 PASS** (üçüncü koşum, inceleme düzeltmeleri sonrası; önceki: 37/37 — §6.1) |
| `d7-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; K-1..K-5 + **K-6/K-6b R05 owner girdisi, K-7 adres biçim kapısı, K-8 çözülmemiş adres**; R-1..R-9; V-1..V-5; L-1/L-2 6 süre; O-1..O-3; M-1 kalıntı metni; Z; Q (+Q-U `/portal/messages` + `d7-qr-test.js`, **+Q-R05**); S-1..S-4 + **S-5 topoloji literali yok**) | **52/52 PASS** WinPS 5.1 ve pwsh 7.6.6 (inceleme düzeltmesi; `d7-owner-block-selftest-fix-*.log`) · **kapanış düzeltmesi (6 yeni test): 58/58 PASS WinPS 5.1.26100 ve 58/58 pwsh 7.6.6**, çıkış 0 (`kapanis-duzeltme\d7-block-selftest-winps.log` / `-pwsh.log`; ilk koşum 57/58: K-7 IPv4 kabulü → kapı düzeltildi) · koşucu öz-testi blok değişikliğinden sonra yeniden: **41/41 PASS** (`kapanis-duzeltme\d7-selftest.log`) |

### 6.1 Koşucu öz-testi sonucu

İlk koşum 34/37: Z3 (kabul edilen kusurlu satırlar liste ölçümünde "yabancı" sayılıyordu → koşucu bunları kendi satırı sayar, D7-4N/4U yine FAIL), Z5-b (test `=== null` yerine `== null`), Z10-b (create zaman aşımı 1,5 sn < geç yazım 3 sn). İkinci koşum **37/37 PASS**, çıkış 0. Kanıt: `HY_R27_AGENT_EVIDENCE\extacc-d7-r01\d7-selftest-run1.log`, `d7-selftest-run2.log`, `selftest-run2-artifacts\` (log/makbuz/kanıt; sink ve sertifika dosyaları kopyalanmadı).
**Üçüncü koşum (inceleme düzeltmeleri, §11): 41/41 PASS, çıkış 0** — `d7-selftest-run3-fix.log`, `selftest-run3-fix-artifacts\`, blok öz-testleri `d7-owner-block-selftest-fix-winps51.log` / `-pwsh7.log`, özet `SUMMARY-FIX-R01.txt`.
Not: 37/37 sonucu D7-3G'deki ürün-sözleşmesi kusurunu yakalayamamıştı (sahte API de çıplak dizi döndürüyordu); düzeltme sonrası koşucu `{ client, messages }` ister ve çıplak dizi FAIL olur.

### 6.2 R02 (2026-10-01) — son dosya baytlarıyla

Test edilen baytlar: blok `09935375…0BFF`, blok öz-testi `0720672D…8BFE` (tam değerler §7; her log ve status dosyası koşum öncesi/sonrası sha256
taşır). Koşucu, sahte API, QR betiği ve pinli 9 dosya R01 baytlarıdır (değişmedi). Canlı DB, canlı API, canlı yayın dizini ve canlı günlükler
kullanılmadı.

| Test | Sonuç (R02) |
|---|---|
| `d7-owner-block-selftest.ps1` — önceki 58 ölçüt + **G-1** blok kaynağında (yorumlar dahil) "hiçbir … dosya/log/günlük/kanıt/rapor … yazılmaz" türü kapsamsız mutlak iddia yok (451 satır tarandı; desen 4 bilinen mutlak cümleyi yakalar, kapsamı adlandırılmış ve ilgisiz 2 cümleyi yakalamaz) · **G-2** owner'a GÖSTERİLEN canlı veri onayı metni (Write-Host yakalaması): koşucunun yazdıkları → ürünün kendi yazdıkları (kaynaktan okundu; API günlüğü içeriği ölçülmez) → kapanış ("dosyalar CLOSED + personel pasif + portal pasif"; tenant yaşam döngüsü değişmez) → diğer tenantlar için yalnız U-ISO (sayı) sırasıyla; eski "Gerçek müvekkil verisine dokunulmaz" / tek başına "(sentetik tenant CLOSED)" yok; 10 kalem §8'de de geçer · **G-3** Recover başlarken gösterilen bilgi metni: ayrı canlı yazma işlemi, AYRI owner onayı (blok sormaz/ölçmez), "BİR KEZ" kodla zorlanmaz, canlı yazma kümesi; metin node çağrısından önce; yeni soru yok (AST soru komutu 0; kuyruktaki 2 yanıt tüketilmedi); tek node çağrısı (mod `recover`); GO defteri değişmez · **G-4** Run çıkış 5/6 metni Run'ın kendi kapanışını Recover'dan ayırır, "Recover yetkisi değildir / blok başlatmaz / önce kanıt / AYRI owner onayı, BİR KEZ" der; tek node çağrısı (mod `run`); çıkış 0'da Recover metni yok; AST: `Invoke-RunMode` içinde tek `Invoke-Node`, `Invoke-RecoverMode` yalnız akıştaki mod dalında | **62/62 PASS** Windows PowerShell 5.1.26100.9549 ve **62/62 PASS** pwsh 7.6.6 (çıkış 0). Önceki 58 ölçüt değişmeden PASS |
| Negatif kontrol + mutasyon (repo dışı geçici kopya; yeni öz-test + yeni belge): **eski blok baytları** `EDDF7BF3…CA5D`; 6 metin bozması (yoruma mutlak iddia · onay metninden tenant yaşam döngüsü cümlesi silindi · Recover bilgi metninden personelin geçici yeniden aktifleştirilmesi silindi · 5/6 metni eski emre döndü · çıkış 0'da görünen satıra Recover önerisi eklendi · Recover bitişindeki "yeni Recover için yetki değildir" satırı silindi); 1 mantık bozması (Run 5/6 dalına otomatik `Invoke-RecoverMode` çağrısı); bozulmamış kopya | **27/27 beklenenle uyumlu** (9 varyant × WinPS 5.1 + pwsh 7 + mantık eşitliği): eski blok **58/62, çıkış 1, FAIL = tam olarak G-1..G-4**; her metin bozması yalnız hedef ölçütü FAIL ettirdi (61/62); otomatik Recover bozması G-4'ü (ve R-2.5, R-2.6, O-1'i) FAIL ettirdi; bozulmamış kopya 62/62 |
| Mantık eşitliği (AST; yorumlar, Write-Host komutları ve Read-Answer/Read-Host istem metinleri çıkarılır, boşluk normalize) | eski ve yeni blokta kalan kod **birebir eşit** (18304/18304 karakter; 28/28 fonksiyon, fonksiyon başına fark 0; istem 13/13; Write-Host 37 → 65, fonksiyon içi 34 → 62; yorum 39 → 53) WinPS 5.1 + pwsh 7. **İstisna yok** (metin seçen ifade dahil hiçbir kod değişmedi). Negatif kontrol: otomatik Recover çağrısı eklenmiş kopya FARK verir |
| `d7-selftest.js` (bloğu T-3..T-8'de statik okur) | **41/41 PASS**, çıkış 0 — **ayna kopyada**: öz-test Prisma/bcrypt'i sabit olarak canlı yayın dizininden yüklediği ve o dizin bu işte yasak olduğu için, gereken `scripts` dizinleri repo dışına bayt bayt kopyalandı (65 dosya; 64'ü kaynakla sha eşit) ve **yalnız aynadaki `d7-selftest.js` içinde tek satır** (`REL` sabiti) canlı olmayan kütüphane köküne (R27 aday worktree'si) çevrildi. Blok, koşucu, sahte API ve QR betiği aynada **son baytlarla** (sha log/status içinde). Disposable DB `5449/d67_test` (yerel; 130 migration = R27 şeması), sahte API 8200/8459, gerçek TLS. Repodaki `d7-selftest.js` DEĞİŞMEDİ ve **değiştirilmemiş hâliyle bu turda KOŞULMADI** (neden: canlı yayın dizininden kütüphane yükler) |
| Ayrıştırma + kodlama | iki `.ps1` dosyası WinPS 5.1 ve pwsh 7'de parse hatası 0; UTF-8 BOM korunur; satır sonu LF (CR 0); katı UTF-8 çözümü geçerli; kontrol karakteri (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) 0 — belge dahil üç dosyada |
| Paket digest | pinli 9 dosyadan bloktan bağımsız betikle yeniden hesaplandı: `7C42FCCD…7BDD` = bloktaki `$ExpPackage` (değişmedi); pin listesi eski blokla aynı; pin uyuşmazlığı yok; `ExpLiveDist` / `ExpEnvSha` değişmedi; blok kendi pin listesinde değildir |

Çalışma sırasındaki koşumlar (son koşumdan ayrı): §8 güncellenmeden önceki ilk koşumda G-2 belge eşleşmesi FAIL verdi (61/62; beklenen, log
saklanmadı). `d7-r02\deneme\` altındaki iki deneme koşumu (62/62 ×2 kabuk) ve deneme negatif kontrolü son baytlardan ÖNCEKİ ara baytlara aittir ve
korunur; ikinci denemede öz-test çıktısına gözlem dökümü eklendi (uzun ölçüt adları tablo genişliğinde gözlem sütununu düşürüyordu). Kanıt (repo dışı; loglar PR/belge/public repoya yapıştırılmaz): `HY_R27_AGENT_EVIDENCE\d7-r02\` — `test\` (son koşum logları,
status dosyaları: komut, çıkış kodu, koşum öncesi/sonrası sha256), `negatif\` (varyantlar ve sonuç tablosu), `js-oz-test\` (ayna, manifest, log),
`onceki\` (R01 baytları). Loglar yerel kullanıcı adından arındırılarak yazılır.

## 7. Pinler

| Dosya | sha256 |
|---|---|
| `d7-portal-messages-live-run.js` | `E752DA1EFCA9B8C7529CC0EC66B4F90530025FBF9918F4A9B56DBB3A6916D2B6` (R01 düzeltme; önceki `3A58DF7C…4D55`) |
| `d7-qr-test.js` | `15E6431396E978423BAE72F3B7511F3972F12847EF96AA02C12937E0F2233E15` |
| `d7-owner-live-block.ps1` **R02** (yalnız metin; paket digest değişmedi) | `0993537584078789A9B199B8DA3BA9B40DFB31055C8517C2F974B5E66F7E0BFF` |
| `d7-owner-block-selftest.ps1` **R02** (G-1..G-4 + gözlem dökümü) | `0720672D86217990B19D4C3C4D7F53972DA999200DBEB9CADBFF7998A0988BFE` |
| önceki (R01 kapanış düzeltmesi): `d7-owner-live-block.ps1` | `EDDF7BF39231B67726528061654E2B668CABE48104059D9ACCB5D83B0C36CA5D` (host/kullanıcı yolu literali kaldırıldı, R05 owner girdisi + adres biçim kapısı; ondan önce `2F62C6C9…26DE8`, `881ABCB0…1427`) |
| önceki (R01 kapanış düzeltmesi): `d7-owner-block-selftest.ps1` | `9A5A31F0AA208EC85434C72D7F9C91E910C8DF34E61E29A13F6BC3516B1470B3` (6 yeni test; ondan önce `6574F027…D26E0`) |
| `d7-fake-portal-api.js` (R02'de değişmedi) | `7B9D32388A34E91088B316147BCCE6E7AC66EC30AEDFFA4C8F841FE9461EBD7D` |
| `d7-selftest.js` (R02'de değişmedi) | `D5E12B00D1F708D056F1949CAE9EC76519DF3B71F4CBCDC0C67473CE630345DB` |

Paket digest (blok içinde `$ExpPackage`): `7C42FCCD6349F95E42128F78CA1A86DF36EB20E246FD0D9936A8B1098DBA7BDD` (önceki `ABA91BAA…320E` geçersiz) —
bağımsız yeniden hesaplama ile **eşit** (`kapanis-duzeltme\pin-dogrulama.txt`: 9 pin, uyuşmazlık 0; blok dosyası PkgPins'te değildir, blok
değişince digest değişmez); `ExpLiveDist` = R27 `E28A6863…5134`; `ExpEnvSha` = EXTACC bloğuyla aynı.
R02'de değişen yalnız blok (metin) ve blok öz-testidir; ikisi de pin listesinde değildir. Paket digest R02 baytlarıyla bloktan bağımsız betikle
yeniden hesaplandı ve `7C42FCCD…7BDD` ile eşit bulundu (`d7-r02\test\paket-digest.log`). Blok sha'sı değiştiği için R01 baytlarıyla yapılmış bir
Preflight/QrTest sonucu (varsa) R02 baytlarını kapsamaz; bloğun `$Repo` yolu ana checkout olduğundan Preflight paket/senkron kapısı ancak bu
dosyalar main'e merge edilip main senkron olduğunda geçer. İlk iki satırdaki sha256 değerleri dosyaların ham baytlarından ölçülmüştür
(UTF-8 BOM dahil, satır sonu LF).

## 8. Canlıda oluşacak kayıtlar ve kapanış

Bu liste owner bloğunun canlı veri onay metniyle **aynı kalemleri** taşır (R02; öz-test G-2 onay metnindeki kalemlerin bu bölümde de geçtiğini
ölçer). Kaynak: koşucu `E752DA1E…D2B6` + `i3-lib.js` `setupI3` + R27 aday commit'indeki `portal.service.ts` — **kaynaktan okundu, canlıda koşulmadı**.

**Koşucunun yazdıkları (Run).** Bu koşum için İKİ yeni sentetik tenant: hedef `ah-<runId>` ve yabancı `ah-<runId>-x`. Hedef tenantta sentetik
personel kullanıcıları (9 kullanıcı; avukat/personel profilleri ve bir yetki kaydıyla), iki sentetik müvekkil, iki dosya (`I3-<runId>` ve ikinci
müvekkile bağlı `I3-<runId>-s`, yalnız D7-4S için) ve bir borçlu (+ dosya bağları); yabancı tenantta bir sentetik müvekkil ve bir dosya
(`I3-<runId>-xf`, yalnız D7-4N için). Sentetik müvekkile BİR portal hesabı (`.invalid` adres; e-posta yok). **PortalMessage**: koşucu 4 (müvekkil
×2, personel ×2) + telefondan gönderilirse +1; **PortalNotification**: 2 (personel yanıtı başına 1).

**Ürünün kendi yazdıkları (kaynaktan okundu).** Portal erişimi açma/kapatma **audit** satırları (`CLIENT_PORTAL_ACCESS_ENABLE` / `…_DISABLE`);
portal **giriş sayacı** ve son giriş zamanı (her başarılı portal girişinde); okundu bayrakları (`mark-read`, personel listesi); canlı API
**uygulama günlüğü**nde portal hesabı / portal girişi / mesaj gönderimi satırları (maskeli sentetik adres ya da müvekkil kimliği ile).
**E-posta/SMS yok** (mesaj akışı kaynakta gönderim üretmez — §2). API günlüğünün tam içeriği bu paketle **ölçülmez**; blok günlükleri okumaz,
değiştirmez, silmez.

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
Recover'ın çıkış kodu (3/5/6 dahil) yeni bir Recover için yetki değildir.

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
- **K-4 Recover ve dist değişimi:** Run 5/6 ile bittikten sonra canlı dist değişmişse Recover bu bloktan çalışmaz (her modda dist pini). Seçenekler:
  (a) canlı dist'i R27'ye geri getirip Recover'ı bu blokla koşmak; (b) yeni dist pinli bir blok sürümü (R02) hazırlatıp Recover'ı onunla koşmak;
  (c) CLIENT kararıyla kapanışı ayrı bir yolla doğrulamak. Bu paket hiçbirini kendiliğinden yapmaz. Dist dışındaki kapı bağımlılıkları §9'dadır.
- **K-5 Recover yetkisi (R02; owner kuralı 2026-10-01):** Run çıkış 5/6 otomatik Recover yetkisi DEĞİLDİR. Run'ın koşucu içindeki kapanış
  adımları Run'ın parçasıdır; ayrıca başlatılan Recover ayrı bir canlı yazma işlemidir (§8.1) ve kanıt incelemesi + açık kalan kaynakların
  bildirilmesi sonrasında **AYRI owner onayı** gerektirir; BİR KEZ başlatılır; blok ve ajan Recover'ı otomatik başlatmaz (§5 adım 7; öz-test
  G-3/G-4). Koşucunun kanıttaki kurtarma adımı metni (pinli, değişmedi) bir öneridir. "BİR KEZ" kodla zorlanmaz (§8.1).
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
| D7-E7 — canlı veri onay metni §8 kayıt listesiyle eşleşmiyordu | düzeltildi | onay metni ve §8 aynı kalemleri taşır (ikinci sentetik müvekkil ve `-s` dosyası, ürünün kendi yazdıkları, API günlüğü satırları, U-ISO sınırı); "Gerçek müvekkil verisine dokunulmaz" mutlak ifadesi kaldırıldı; öz-test G-2 kalemleri hem gösterilen metinde hem §8'de ölçer |
| D7-E8 — öz-test atıfları eski baytlara bağlıydı | düzeltildi | §6 başına "hangi baytlar" notu; §6.2 son baytların koşumu; §7 pinler |
| D7-E9 — U-ISO'nun neyi ölçmediği yazılmamıştı | belgelendi | §9 "U-ISO sınırı"; blok onay metninde "yalnız SAYI; içerik karşılaştırılmaz" |
| D7-E10 — Recover'ın kapı bağımlılıkları ve web derlemesinin ölçülmediği yazılmamıştı | belgelendi | §9 "Recover'ın kapı bağımlılıkları", "Web derlemesi ölçülmez"; §10 K-4 atfı |
| Bayat satır — "D-5 bloğunun QrTest'i çıkış 4" | düzeltildi | §10: D-5 R03 ile giderildiği yazıldı |
| Kapsamsız mutlak ifadeler ("… hiçbir dosyaya/kanıta yazılmaz") | düzeltildi | blok SIR yorumu ve §1: "blok ve koşucu kendi kanıt/log dosyalarına yazmaz" + ölçülen kapsam; canlı DB'deki parola özetleri ve canlı API günlüğü ayrı yazıldı; öz-test G-1 |

**Bu revizyonda yapılmayanlar / açık kalanlar.**
- D7-E11 (üç kısa belge notu): notların içeriği bu işe verilen bulgu listesinde ve kanıt kayıtlarında bulunamadı; içerik uydurulmadı, **uygulanmadı**.
- Koşucunun kanıt metinleri ("sentetik tenant CLOSED", "Owner bloğu `-Mode Recover …` ile BİR KEZ") pinli dosyadadır ve değişmedi; düzeltilmeleri
  koşucu sha'sını ve paket digest'i değiştirir — ayrı iş.
- "Recover BİR KEZ" ve "AYRI owner onayı" kodla zorlanmaz/ölçülmez (blok mantığı bu revizyonda değiştirilemez); kural belge + gösterilen metindir.
- `owner-block.json` `revision` alanı `R01` kalır (§4).
- Repodaki `d7-selftest.js` kütüphaneleri canlı yayın dizininden yükler; bu turda yalnız ayna kopyada koşuldu (§6.2). Öz-testin kütüphane kökünün
  canlı yayın dizinine bağlı olması ayrı bir düzeltme konusudur (bu işin kapsamı dışında: yalnız blok, blok öz-testi ve belge değişebilir).
- Blok öz-testinin çıktısı yerel kullanıcı adını maskelemez (yalnız gözlem dökümü ve geçici dizin satırı maskelidir); kanıt logları yazılırken
  maskelendi. D-5 öz-testindeki tam maske (M-1) D-7'ye taşınmadı.
- Web arayüzü tarifleri (ana sayfa, Mesajlar sekmesi, zil rozeti) kaynak okumasıdır; canlı web derlemesi ölçülmedi (§9).
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu revizyon hiçbiri için yetki değildir.
