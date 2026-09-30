# EXTACC D-7 — PORTAL MESAJ AKIŞI CANLI KABUL PAKETİ (R01)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** Canlı Run/Recover ve yayın bu paketle yetkilendirilmez; GO biçimi `OWNER-GO-CLIENT-EXTACC-D7-YYYYMMDD-RNN`
> (D-4/D-5 GO'ları kabul **edilmez**). Tanım: `client-extacc-d8-staff-surface-r01` §5 (D-7) ve §6 (birleşik D-9); şablon: D-5 paketi + D-4 koşucusu (R03).
> **ÖN KOŞUL:** canlı API dist'i **R27** (`E28A6863…5134`; D-5 ile aynı pin). Owner bloğunun salt okuma kapıları (paket pinleri, dist pini,
> `.env` pini) **tüm modlarda** — Preflight, QrTest, Run **ve Recover** — mod dalından önce koşar; canlı dist R27 değilse blok **her modda DUR** verir
> (Recover dahil; bkz. §9 ve §10 K-4). Hizmet kabulü H1–H8 **0/8** değişmez.
> **R01 inceleme düzeltmeleri (2026-09-29):** iki bağımsız incelemenin bulguları uygulandı — §11.

## 1. Ne ölçer ve ne yapmaz

Uçtan uca: sentetik müvekkile yetkili personelle portal hesabı (gönderimsiz) → koşucu kendi portal oturumuyla **dış HTTPS** üzerinden mesaj
gönderir/listeler/okundu işaretler, personel yanıtını **yerel API**'den gönderir → owner **telefondan** (mobil veri) giriş yapar, mesaj
sayfasında bu koşumun mesajlarını görür, isterse bir mesaj gönderir; giriş algılanınca koşucu **ikinci** personel yanıtını gönderir (owner
rozeti/yeni mesajı görür) → kapanış (D-4 R03 kuralları). Koşucu **e-posta/SMS üretmez ve çağırmaz** (forgot/reset/change-password ve belge
uçları yasak; kaynak taraması T-1), **dış admin uçlarını çağırmaz** (D7-5 = D-8 kapsamı), **mesaj/bildirim silmez** (ürünte silme ucu yok),
telefondan gönderilen mesajın **içeriğini kanıta yazmaz** (yalnız sayı). Parola/token/GO/DB URL hiçbir kanıta yazılmaz.

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

## 4. Owner bloğu (`scripts/d7-owner-live-block.ps1`) — modlar

Preflight (salt okuma; main senkron, paket pinleri, **R27 dist pini**, `.env` sha, `PUBLIC_PORTAL_BASE_URL` **biçim kapısı** (https + yalnız alan adı;
yol/port/IP/localhost DUR) — adres canlı `.env`'den okunur, blokta host literali **yoktur**; R05 eşleşmesi Run/QrTest'te owner'ın konsola yazdığı
adresle ölçülür (eşleşmezse GO sorulmadan DUR), 8080 tek dinleyici, yabancı kabul
süreci yok, DB kimliği, dış zincir: 8081 yalnız loopback = HY-Caddy, Cloudflared Running) · QrTest (canlı veri yok; **`d7-qr-test.js`** ile
`/portal/messages` — `extacc-qr-test.js` yalnız `/portal/login` kabul ettiğinden kullanılmaz) · **Run**: konsol → bağımsız pencere teyidi → canlı
veri işleme "EVET" → GO (yerel) → defter (sha256) → koşum → ekran temizliği → owner beyanı (8 soru, ayrı dosya) → manifest · **Recover**: `-ReceiptFile`;
soru/GO yok. `owner-block.json`: `emailSendsPlanned=0`, `messageRowsDeleted=false`. Canlı süreler bloğun içinden zorlanır (20 dk bekleme · 5 sn yoklama ·
120 sn inceleme · 120 sn geç oluşma). Kanıt JSON'ları **UTF-8** olarak okunur (WinPS 5.1 varsayılanı ANSI; kalıntı metni bozulmasın).

## 5. Owner adımları (telefon: Wi-Fi KAPALI, mobil veri, gizli sekme)

1. Bağımsız PowerShell penceresi. `-Mode Preflight` → "PREFLIGHT GEÇTİ" değilse durun.
2. `-Mode QrTest` → R05 kararındaki public portal adresini yazın (canlı `.env` değeriyle eşleşmeli) → QR'ı okutun; portal sayfası (giriş sayfasına yönlenir) açılırsa **E**; giriş yapmayın.
3. `-Mode Run`: pencere teyidi, R05 public portal adresi (https://…), EVET, GO ref. Koşucu önce makine ölçümlerini yapar (D7-1…D7-3F); konsolda QR + giriş bilgisi görünür.
4. Telefonda giriş yapın; mesaj sayfasında **üç** mesaj görünmeli (ekrandaki `D7-…` metinleri). İsterseniz kısa bir mesaj gönderin (kişisel veri yazmayın).
5. Giriş algılanınca ikinci personel yanıtı gelir; rozet/okunmamış sayacını ve yeni mesajı izleyin. 120 sn sonra ekran temizlenir, kapatma çalışır.
6. Beyan sorularını (8) yanıtlayın; sayfayı yenileyip gördüğünüzü bildirin. Pencereyi kapatın. Mesaj satırları DB'de **kalır** (kanıt); silme beklemeyin.
7. Çıkış 5/6 ise `-Mode Recover -ReceiptFile <d7-setup-receipt.json>` BİR KEZ; kabul tekrarlanmaz.

## 6. Öz-testler (canlıya dokunmadan; 2026-09-29; disposable DB `5449/d67_test`, sahte API 8200/8459, gerçek TLS)

| Test | Sonuç |
|---|---|
| `d7-selftest.js`: Z1 normal 0 (tüm ölçütler PASS; telefon: sayfa 200 · giriş 201 · 3 mesaj · mark-read · gönderim 201 · 2. yanıt görüldü; kalıntı 5 mesaj + 2 bildirim "yerinde=4/4 … SİLİNMEDİ"; **Z1-g** D7-3G `gövde={client,messages} · listede=3/3`, D7-4S 400 + satır yok, D7-3B `satır=true`, makbuz `runnerMessageIds` 4; admin yalnız yerel; kapanış sonrası telefon oturumu 401) · Z2 liste sızıntısı → D7-2 FAIL, 2 · Z3 kapsam dışı caseId kabul → D7-4N/**4S**/4U FAIL, 2 (kalıntı 8) · Z4-a send 500 → 2 · Z4-b send 500 + kapatma 500 → **6** · Z5 yarım (kapatma 500) 6 → Recover 3 (C4 ölçülemeyen; kalıntı makbuz id'leriyle **gerçek sayım** `yerinde=4/4`) · Z6 mark-read etkisiz → D7-3U FAIL 2 · Z7 bildirim yok → D7-3N FAIL 2 · Z8 guard kusuru → C4 200, ÜRÜN BULGUSU, 6 · **Z14-a** personel yanıtı yanıtsız → D7-3/3N/3U/3F **ÖLÇÜLEMEYEN** (FAIL 0), 3 · **Z14-b** unread-count yanıtsız → D7-3U ÖLÇÜLEMEYEN, 3 · Z9 kapılar (onay 3 · D-5 GO 3 · none+canlı DB 4 · TLS 1 · slug 4 · http 4) · Z10 create 500 → 6, P7-MSG-KEPT **ÖLÇÜLEMEYEN** (boş-doğrulama yok) · **Z10-r** Recover (id listesi yok) → P7-MSG-KEPT ÖLÇÜLEMEYEN · Z10-b geç oluşma görülüp kapatıldı · Z11 konsolsuz 4 · Z12 makbuz 1 · Z13 telefon yok → 3 (`yerinde=3/3`) · S-1 sır sızıntısı (parolalar/JWT/DB URL/GO/**telefon mesajı içeriği**/tuzak içerik) yok · T-1…T-8, P-1/P-2 statik | **41/41 PASS** (üçüncü koşum, inceleme düzeltmeleri sonrası; önceki: 37/37 — §6.1) |
| `d7-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; K-1..K-5 + **K-6/K-6b R05 owner girdisi, K-7 adres biçim kapısı, K-8 çözülmemiş adres**; R-1..R-9; V-1..V-5; L-1/L-2 6 süre; O-1..O-3; M-1 kalıntı metni; Z; Q (+Q-U `/portal/messages` + `d7-qr-test.js`, **+Q-R05**); S-1..S-4 + **S-5 topoloji literali yok**) | **52/52 PASS** WinPS 5.1 ve pwsh 7.6.6 (inceleme düzeltmesi; `d7-owner-block-selftest-fix-*.log`) · **kapanış düzeltmesi (6 yeni test): 58/58 PASS WinPS 5.1.26100 ve 58/58 pwsh 7.6.6**, çıkış 0 (`kapanis-duzeltme\d7-block-selftest-winps.log` / `-pwsh.log`; ilk koşum 57/58: K-7 IPv4 kabulü → kapı düzeltildi) · koşucu öz-testi blok değişikliğinden sonra yeniden: **41/41 PASS** (`kapanis-duzeltme\d7-selftest.log`) |

### 6.1 Koşucu öz-testi sonucu

İlk koşum 34/37: Z3 (kabul edilen kusurlu satırlar liste ölçümünde "yabancı" sayılıyordu → koşucu bunları kendi satırı sayar, D7-4N/4U yine FAIL), Z5-b (test `=== null` yerine `== null`), Z10-b (create zaman aşımı 1,5 sn < geç yazım 3 sn). İkinci koşum **37/37 PASS**, çıkış 0. Kanıt: `HY_R27_AGENT_EVIDENCE\extacc-d7-r01\d7-selftest-run1.log`, `d7-selftest-run2.log`, `selftest-run2-artifacts\` (log/makbuz/kanıt; sink ve sertifika dosyaları kopyalanmadı).
**Üçüncü koşum (inceleme düzeltmeleri, §11): 41/41 PASS, çıkış 0** — `d7-selftest-run3-fix.log`, `selftest-run3-fix-artifacts\`, blok öz-testleri `d7-owner-block-selftest-fix-winps51.log` / `-pwsh7.log`, özet `SUMMARY-FIX-R01.txt`.
Not: 37/37 sonucu D7-3G'deki ürün-sözleşmesi kusurunu yakalayamamıştı (sahte API de çıplak dizi döndürüyordu); düzeltme sonrası koşucu `{ client, messages }` ister ve çıplak dizi FAIL olur.

## 7. Pinler

| Dosya | sha256 |
|---|---|
| `d7-portal-messages-live-run.js` | `E752DA1EFCA9B8C7529CC0EC66B4F90530025FBF9918F4A9B56DBB3A6916D2B6` (R01 düzeltme; önceki `3A58DF7C…4D55`) |
| `d7-qr-test.js` | `15E6431396E978423BAE72F3B7511F3972F12847EF96AA02C12937E0F2233E15` |
| `d7-owner-live-block.ps1` | `EDDF7BF39231B67726528061654E2B668CABE48104059D9ACCB5D83B0C36CA5D` (kapanış düzeltmesi: host/kullanıcı yolu literali kaldırıldı, R05 owner girdisi + adres biçim kapısı; önceki `2F62C6C9…26DE8`, ondan önce `881ABCB0…1427`) |
| `d7-fake-portal-api.js` | `7B9D32388A34E91088B316147BCCE6E7AC66EC30AEDFFA4C8F841FE9461EBD7D` |
| `d7-selftest.js` | `D5E12B00D1F708D056F1949CAE9EC76519DF3B71F4CBCDC0C67473CE630345DB` |
| `d7-owner-block-selftest.ps1` | `9A5A31F0AA208EC85434C72D7F9C91E910C8DF34E61E29A13F6BC3516B1470B3` (kapanış düzeltmesi: 6 yeni test; önceki `6574F027…D26E0`) |

Paket digest (blok içinde `$ExpPackage`): `7C42FCCD6349F95E42128F78CA1A86DF36EB20E246FD0D9936A8B1098DBA7BDD` (önceki `ABA91BAA…320E` geçersiz) —
bağımsız yeniden hesaplama ile **eşit** (`kapanis-duzeltme\pin-dogrulama.txt`: 9 pin, uyuşmazlık 0; blok dosyası PkgPins'te değildir, blok
değişince digest değişmez); `ExpLiveDist` = R27 `E28A6863…5134`; `ExpEnvSha` = EXTACC bloğuyla aynı.

## 8. Canlıda oluşacak kayıtlar ve kapanış

Yeni sentetik tenant + yabancı sentetik tenant (`ah-<runId>`, `ah-<runId>-x`): personel, iki sentetik müvekkil, dosya, borçlu, yabancı tenantta bir dosya
(`I3-<runId>-xf`, yalnız D7-4N için), aynı tenantta ikinci sentetik müvekkile bağlı bir dosya (`I3-<runId>-s`, yalnız D7-4S için; kapanışta CLOSED);
sentetik müvekkile bir portal hesabı (`.invalid`); **PortalMessage**: koşucu 4 (müvekkil ×2, personel ×2) +
telefondan gönderilirse +1; **PortalNotification**: 2 (personel yanıtı başına 1); portal erişim açma/kapatma audit'i; giriş sayacı; API günlüğünde
"Portal mesajı gönderildi" satırları (clientId). **E-posta/SMS yok.** Kapanış sonrası portal pasif + sürüm artmış, erişim kapalı, personel pasif,
dosya CLOSED; **mesaj/bildirim satırları yerinde kalır** ve kanıtta "saklandı" olarak raporlanır (silinmiş gibi DEĞİL).

## 9. Sınırlar

- Sahte API ürünün kendisi değildir: ürünün gerçek guard/rol davranışı, `resolveCaseReference` 400'ü, bildirim üretimi ve tenant yaşam döngüsü
  yalnız canlıda ölçülür. Öz-testte "telefon" bir istemci taklididir.
- D7-5 (dış admin uçları 403) bu pakette ölçülmez; D-8 sondasının kaydıyla birlikte değerlendirilir.
- Okunmamış sayacının telefonda görünen değeri owner beyanıdır; web sayfası açılışta mark-read çağırdığından koşucu 2. yanıt sonrası sayacı yalnız raporlar.
- Recover'da mevcut oturum reddi ölçülemez (oturum saklanmaz) → Recover çıkışı en iyi 3.
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
  (c) CLIENT kararıyla kapanışı ayrı bir yolla doğrulamak. Bu paket hiçbirini kendiliğinden yapmaz.
- Bilgi: `EXTACC-D5` bloğunun QrTest'i `extacc-qr-test.js` ile `/portal/forgot-password` ister; o betik yalnız `/portal/login` kabul eder (çıkış 4) —
  D-5 paketi bu iş kapsamında DEĞİŞTİRİLMEDİ; ayrı düzeltme.
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
