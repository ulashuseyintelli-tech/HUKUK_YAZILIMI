# CLIENT İ16 — H7 PORTAL CANLI KABUL PAKETİ (R01 — düzenek + disposable prova; CANLI KOŞULMADI)

**Kanonik bağ:** owner kararı İ4 = **DAHİL** (#2711 @ `3d927a55`) → R02 §9: İ16 kritik yola geçer.
- **R02 §3.3 İ16 tanımı:** "İ2'de yazılan portal ölçütleri PASS (erişim kapısı, kendi verisiyle sınırlılık, personel yetkisinden bağımsızlık)".
- **Owner eki:** personelin belge inceleme ve mesajlaşma uçları **mevcut rol/tenant politikasına** göre ölçüte bağlanır.
  - Personele yönelik her işleme kendiliğinden onaylayıcı şartı **eklenmez**.
  - Yalnız somut bir yetki ya da izolasyon kusuru dar bir patch ile düzeltilir.

**Bu belge canlı kabul VERMEZ.** Canlı koşum ayrı owner GO'su ister (§6).

---

## 1. Kaynak incelemesi (006c4dd2 — canlı R24 kaynağı) · ürün değişikliği YOK

Personel uçlarının hepsinde yalnız `JwtAuthGuard` var: aktif kullanıcı + tenant yaşam döngüsü + `tokenVersion`. Rol kapısı yok. Tenant kapsamı her uçta `req.user.tenantId`'den geliyor.

| Uç | Mevcut politika | Kapsam |
|---|---|---|
| `GET portal/admin/documents/pending` | tenant'ın her aktif personeli, **VIEWER dahil** | `{tenantId, status:PENDING}` açık |
| `POST portal/admin/documents/:id/approve\|reject` | aynı | `findFirst {id, tenantId}`; başka tenant **404** |
| `GET portal/admin/messages/clients` · `GET\|POST portal/admin/messages/:clientId` | aynı | `client.findFirst {id, tenantId}`; başka tenant **404** |
| müvekkil `messages*`, `documents*`, `cases*` | `PortalAuthGuard` (kimlik DB'den) | `clientId` ve `tenantId` portal kimliğinden; gövdeden asla alınmaz |

**Somut yetki/izolasyon kusuru: YOK.** Bu yüzden **ürün patch'i yapılmadı.** İncelenenler:
- her `update`/`delete` öncesindeki kapsamlı `findFirst`,
- `updateMany` yüklemleri,
- portal tarafında gövde kaynaklı kapsam,
- Prisma ara katmanı (yok).

**Gözlemler — kusur değil, kapsamı genişletmez, karar owner'ındır:**
- **K-1 · `caseId` doğrulanmıyor.** Portal belge ve mesaj kayıtlarında gövdeden gelen `caseId` doğrulanmıyor ve şemada FK yok.
  - Sonuç: müvekkil kendi kaydına yabancı bir dosya id'si yazabilir.
  - Sızıntı yok: bu alanı okuyan bir tüketici bulunamadı.
- **Askıdaki tenant'ın portalı açık kalıyor.** Portal girişi ve `PortalAuthGuard` tenant yaşam döngüsüne bakmıyor. Charter §18.6'da bu konu "PARTIAL/OPEN" olarak duruyor.
- **`reviewDocument` durum geçişini kontrol etmiyor.** Sonuçlanmış belge yeniden incelenebiliyor.
- **`GET admin/messages/:clientId` yazma yapıyor.** Müvekkil mesajlarını okundu olarak işaretliyor.
- **Yükleme hatasında diskte artık dosya kalabiliyor.**

**İ2 §7 dayanak düzeltmeleri (006c4dd2):**
- `portal-auth.guard.ts:36-38` → **37-39**
- `portal.service.ts:244-246` → **244-251** (409 çakışması)
- `portal.service.ts:669-682` → **669-695** (audit 684-694; transaction 695'te kapanıyor)
- §7 yüzeyi `portal.controller.ts:64-362` → **64-513**. İnceleme uçları 381-419, mesajlaşma uçları 421-512'de. İ2 yüzeyi bunları içermiyordu, bu yüzden aşağıdaki H7-06…H7-08 eklendi.

## 2. Ölçüt haritası

| Kimlik | Gözlem |
|---|---|
| I16-00 | ölçüm geçerliliği: `user` ile `elev1` aynı rolde; fark yalnız PARTNER bağı |
| **H7-00** | erişim açma: elevated olmayan kullanıcıya 403, yazma yok (`ClientPortalUser` ve `hasPortalAccess` değişmez). Elevated kullanıcı erişimi açar. Aktif e-posta çakışmasında 409; ikinci hesap oluşmaz. |
| **H7-03** | personel JWT'si `GET /portal/cases` üzerinde 401 alır |
| **H7-01** | K1: liste yalnız kendi müvekkilinin kayıtlarını döner; sorgudaki `clientId` yok sayılır (dosyalar ve belgeler) |
| **H7-02** | K2: başka müvekkile ve başka tenant'a ait dosya ile belge indirme **ayrı ayrı** 404 döner. Belge yolunun tenant bağı dolaylı olduğu için ayrıca koşulur. |
| **H7-06** *(owner eki)* | inceleme: bekleyen liste yalnız kendi tenant'ını gösterir. Başka tenant belgesi 404 döner ve **değişmez**. Kendi tenant belgesi mevcut politikaya göre incelenir (VIEWER dahil). |
| **H7-07** *(owner eki)* | personel mesajlaşması: kendi tenant müvekkiline yazılır. Başka tenant müvekkiline gönderme ve okuma 404 döner, satır oluşmaz. Müvekkil listesi yalnız kendi tenant'ını içerir. |
| **H7-08** *(owner eki)* | müvekkil mesajları yalnız kendi müvekkiline ait olanlardır; aynı tenant'ta başka müvekkile yazılan mesaj görünmez |
| **H7-04** | sonlandırma: elevated olmayan kullanıcıya 403; yazma ve audit yok. Elevated kullanıcı kapatınca `isActive=false`, `tokenVersion+1` ve audit yazılır. Eski token 401, yeni login 401 alır. Müvekkil verisi silinmez. |
| **H7-05a** | canlıda kurulabilen iki ret nedeni (devre dışı ve eski `tokenVersion`) aynı kodu ve aynı mesajı verir |
| **H7-05b** | dört ret nedeninin tamamı — **yalnız disposable** (§4) |
| I16-CLOSE / I16-ISO | personel ve **portal** kullanıcıları pasif, Case CLOSED; personel login 401, eski token 401, portal login 401 · sentetik olmayan tenant dağılımı değişmez |

## 3. CANLI YAZMA ENVANTERİ — yalnız `ah-<runId>` ve `ah-<runId>-x`

- **Kurulum:** İ13 ile aynı (Tenant 2 · User 9 · Lawyer 3 · StaffMember 5 · PermissionGrant 1 · Client 3 · Case 1 · CaseClient 1 · Debtor 1). Ek karşı kayıtlar:
  - Case 2 + CaseClient 2 (başka müvekkil, başka tenant)
  - **PortalDocument 3**: DB satırı olarak kurulur, `filePath` var olmayan bir yolu gösterir. **Diske dosya yazılmaz; yükleme ucu çağrılmaz.**
- **Ürün yolundan:**
  - ClientPortalUser 1 (açma, kapatma, yeniden açma)
  - `Client.hasPortalAccess`
  - PortalDocument 1 reddedildi (inceleme)
  - PortalNotification (inceleme ve mesaj bildirimleri)
  - PortalMessage 2
  - AuditLog `CLIENT_PORTAL_ACCESS_*`
- **Kapanış (UPDATE):**
  - personel kullanıcıları pasif, `tokenVersion+1`
  - **portal kullanıcıları** pasif, `tokenVersion+1`, `hasPortalAccess=false`
  - ACTIVE Case → CLOSED
- **DELETE yok. Gönderim yok:** `forgot-password` çağrılmaz, e-posta adresleri `.invalid`.

## 4. DISPOSABLE PROVA (2026-09-18) — CANLI KABUL DEĞİL

Ortam İ13/İ14/İ15 provasıyla aynı: canlı R24 dist `:8113`, API yalnız disposable DB'ye bağlı, sentetik olmayan komşu tenant var.

| Senaryo | Sonuç |
|---|---|
| **N1** normal akış | **12/12 PASS**. Öne çıkanlar: H7-00 (USER→403, elev1→201, çakışma→409) · H7-02 dört yol 404 · H7-06 yabancı onay 404, durum değişmedi; kendi ret 201, inceleyen viewer · H7-07 yabancı gönderme/okuma 404, satır 0→0 · H7-04 tokenVersion 0→1, audit +1, eski token 401 · H7-05a iki neden `401 "Geçersiz token"` · I16-ISO eşit (29 tenant) |
| **H7-05b** dört neden (`scripts/i16-prova-h705.js`, yalnız disposable) | **PASS**: devre dışı · eski sürüm · **bulunamayan** (satır silindi) · **DB hatası** (konteyner durdurulup yeniden başlatıldı) → dördü de `401 "Geçersiz token"`. İlk denemede `docker pause` kullanıldı; bağlantı askıda kalıp zaman aşımına düştü. Yanıt belirsiz olduğundan bu **ÖLÇÜLEMEYEN** sayılır, FAIL değil. Yöntem `stop/start` olarak düzeltildi. |
| NC1a–c kapılar | onay yok → 3 · İ15 biçimli GO ref → 3 · beklenen DB farklı → 4 · tenant sayısı değişmedi |
| NC2 kurulumdan sonra çöküş | çıkış 1 · aktif personel 0 · ACTIVE case 0 |
| NC3 bağımsız kurtarma | portal kullanıcısı elle yeniden açıldı → `i16-live-recover` kapattı (0) |
| NC4 gerçek tenant'ı gösteren sahte makbuz | kimlik bağı yok, çıkış 4, sıfır yazma |

Negatif kontroller 11/11 OK.

**Kanıt:** `Documents\CLIENT-EVIDENCE-20260911\i16-prova-20260918T204012Z\`
- `i16-h705.json` `48FB677C…B21F`
- `i16-n1.json` `B07FF3E0…68C9`
- `i16-nc2.json` `AF5B4F87…4108`

## 5. Paket

**Digest:** `94069A31B3EEE74546E2EF73FA2BEF25EEF61248071C4E3E147B8DCDD3813644`

| Dosya | sha256 |
|---|---|
| `i16-live-run.js` | `40275A59…03EB` |
| `i16-live-recover.js` | `F7BBF57D…AB3C` |
| `i13-lib.js` | `59BA7360…D385` |
| `i3-lib.js` | `56F3788E…74A3` |
| `ah-lib.js` | `DF882DB7…BFD7` |
| `i12-live-identity.js` | `9516E462…774F` |

`i16-prova-h705.js` yalnız disposable'dır ve pakete dahil değildir. Canlıda şu durumlarda reddeder: `I16_DISPOSABLE=1` yoksa, DB adı test sınıfından değilse ya da konteyner adı `hy-` önekli değilse.

## 6. CANLI KOŞUM — AYRI OWNER GO

**Owner eylemi:**
- Yeni GO ref: `OWNER-GO-CLIENT-I16-YYYYMMDD-RNN`.
- `scripts/i16-owner-live-block.ps1` **normal** PowerShell'de çalıştırılır.

Blok sırası:
1. Kapılar: main · paket digest · dist `1524EDC1…4D4E` (R25B) · tek API · açık pencere yok · DB kimliği.
2. GO ref yerel olarak girilir.
3. `i16-live-run.js` koşar.
4. GO tüketimi sha256 olarak kaydedilir ve manifest yazılır.

**İ16 KAPANIŞ ÖLÇÜTÜ:**
- Canlıda I16-00 · H7-00…H7-04 · H7-05a · H7-06…H7-08 · I16-CLOSE · I16-ISO **12/12 PASS**.
- H7-05b disposable kanıtı (§4, sha pinli) kayıtlı.
- CLIENT bağımsız doğrulama PASS.
- Kayıt PR'ı → CI → merge → post-merge CI SUCCESS.

**Hizmet kabulü (H7) owner kabulü olmadan değişmez.**

## R25 bağı (2026-09-19, R02) — canlı dist pini R25B'ye değişti

Owner kararıyla R25 yalnız onaylı K-1 (#2720) ve PSUS (#2721) portal düzeltmeleriyle sınırlandı. #2716'nın 3 replay adapter dosyası bu yayına **dahil değil**. Owner bloğunun canlı dist kapısı **R25B** artefaktına bağlandı: `1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E` (3867 dosya).

R25B **birleşik bir artefakttır**: tabanı canlı R24 dist'i (`87712E0E…5453`), üzerine yalnız 7 portal dosyası `ebbe1ae8` derlemesinden kopyalandı. Aynı digest, `ebbe1ae8` kaynağında yalnız adapter kaynağı `006c4dd2` hâline döndürülerek alınan bağımsız bir derlemeyle bit bit yeniden üretildi. Paket digest'i değişmedi. Blok R24 dist'inde ve 10 dosyalı R25 adayında (`EB3D854F…71FC`) **DURUR**; bu kasıtlıdır, fail-closed davranış.

- **Yürütme sırası:** R25B yayını (ayrı owner onayı; yükseltilmiş pencere) → İ13 → İ14 → İ15 → İ16. Her blok bir öncekinin kapanışından sonra ve kendi GO ref'iyle koşulur.
- **R25B disposable regresyonu (aday dist `dist-r25b`, API `:8113`, yalnız disposable DB):** İ16 12/12 + H7-05 dört neden PASS PASS. Bunlar canlı kabul değildir. 10 dosyalı R25 adayının sonuçları R25B'nin kanıtı SAYILMAZ; bu koşum yenidir.
- **R24 → R25B farkı:** 7 portal dosyası. Eklenen 0, silinen 0, migration 0.
- **Düzeltme notu (dış bağlantı):** Disposable provadaki API, TCMB kur servisine (`185.98.252.10:443`, ExchangeRateService, salt okuma) dışa bağlandı. Bu bir gönderim değildir. Önceki "API'nin tek uzak bağlantısı disposable DB" ölçümü yalnız o anın görüntüsüdür, sürekli bir garanti değildir.

**İ16'ya özgü:** K-1 ve CLIENT-PSUS düzeltmeleri yalnız R25B artefaktında vardır. R25B disposable provasında sonuçlar:
- K-1 matrisi 12/12: 4 senaryo × 3 uç; geçersiz referansta ret cevabı özdeş, diske yazılan dosya 0, DB'ye yazılan geçersiz referans 0.
- PSUS 7/7 PASS.

Bunlar **canlı kanıt değildir**. İ16, R25B canlıda doğrulanıp bu blok canlıda PASS verene kadar **kapanmaz**. Ret cevaplarının aynı olması zamanlama eşitliği anlamına gelmez; zamanlama ölçülmedi.

**Canlı yayın ve canlı koşum AYRI owner onayı ister; bu bölüm onları başlatmaz.**

## 7. CANLI KOŞUM SONUCU — İ16 KAPANDI (2026-09-21)

Owner İ16 canlı kabul GO'sunu verdi ve bloğu kendisi koşturdu. Blok ayrı bir
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File` sürecinde çalıştı; kalıcı execution policy değişikliği yapılmadı.
GO ref yerel kaldı. Owner çıktısı: **RUNID `6b883b16` · koşum çıkışı 0**. Kanıt dizini:
`C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911\i16-live-6b883b16-20260921-000229`.

**Bağlam (`owner-block.json`):**

| Alan | Değer |
|---|---|
| Main | `8327421f1635f066935e2bf0a1555bbc4f5a0f2c` |
| Paket | `94069A31…3644` |
| Canlı dist | `1524EDC1…4D4E` (R25B) |
| API pid | 33248 |
| Başlangıç | 2026-09-20T21:02:29Z |

### 7.1 CANLI ölçütler — 12/12 PASS (FAIL 0 · ÖLÇÜLEMEYEN 0)

| Ölçüt | Gözlem |
|---|---|
| I16-00 | Rol kurulumu: viewer VIEWER, user USER, elev1 USER (ADMIN yolu kapalı) |
| H7-00 | Portal hesabı açma: USER 403 (portalUser 0→0, `hasPortalAccess` false→false) · elev1 201 · çakışma 409, başka müvekkilde hesap 0 |
| H7-01 | Portal listeleri 200; yalnız kendi kayıtları görünür (başka ve yabancı müvekkil false) |
| H7-02 | Başka ve yabancı müvekkil kaynaklarına doğrudan erişim: case 404/404, belge 404/404 |
| H7-03 | Kimliksiz portal erişimi 401 |
| H7-04 | Portal erişimini kapatma: USER 403 (değişim yok, audit 0→0) · elev1 201 (`isActive=false`, tokenVersion 0→1, audit 1) · eski token 401 · giriş 401 · belge korunur |
| H7-05a | Ret cevabı biçimi: devre dışı hesap 401 "Geçersiz token" = eski sürüm token 401 "Geçersiz token"; eşit |
| H7-06 | Onay akışı: kendi bekleyenleri 200 · yabancı onay 404 (durum PENDING→PENDING) · kendi ret 201 (REJECTED, inceleyen viewer) |
| H7-07 | Mesajlaşma: kendi 201 · aynı tenant başka müvekkil 201 · yabancı gönder 404, oku 404 (satır 0→0) · liste yalnız kendi |
| H7-08 | Büro tarafı okuma 200, mesaj 1, yalnız kendi müvekkili |
| I16-CLOSE | `closure.ok=true` · hedef ve yabancı tenant'ta aktif kullanıcı 0, case CLOSED · aktif portal kullanıcısı 0 · personel girişi 401 · `/auth/me` 401 · portal girişi 401 |
| I16-ISO | İzolasyon parmak izi `65fbbaf9bb5bb0ee`/21 önce ve sonra aynı |

### 7.2 DISPOSABLE kanıtlar — canlı PASS DEĞİLDİR

Aşağıdakiler yalnız disposable ortamda (`:5443` test DB, API `:8113`) ölçüldü. Canlı koşumda yeniden koşulmadılar ve
canlı sonuç olarak sunulmazlar:

| Kanıt | Kapsam | Sonuç | Neden canlıda koşulmadı |
|---|---|---|---|
| H7-05 dört neden provası (`i16-prova-h705.js`) | Devre dışı hesap, eski sürüm token, askıya alınmış tenant ve DB erişilemez durumunda ret cevabının aynı olması | PASS (disposable) | Tenant askıya alma ve DB'yi erişilemez kılma canlıda yapılamaz. Canlıda yalnız **H7-05a** ölçüldü (iki neden) |
| K-1 matrisi | 4 senaryo × 3 uç; geçersiz `caseId` referansının yazılmaması, diske dosya bırakmaması, ret cevabının özdeş olması | 12/12 PASS (disposable) | Canlıda portal belge YÜKLEME yapılmaz; blok diske dosya bırakmaz |
| CLIENT-PSUS probu | Askıya alınmış tenant'ta portal girişi, oturum, sıfırlama talebi ve token kullanımı | 7/7 PASS (disposable) | Canlı tenant askıya alınmaz |

**K-1 yazma doğrulaması canlıda yapılmamıştır.** H7-02'deki 404 sonuçları **okuma kapsamı** kanıtıdır ve K-1'in yazma
tarafındaki (`caseId` gövde referansının doğrulanması) kanıtının yerine geçmez. K-1'in canlı artefaktı R25B içindedir
(`portal.controller.js`, `portal.service.js`); canlı davranış kanıtı disposable matristir.

### 7.3 CLIENT bağımsız kapanış doğrulaması — PASS (6/6)

Betik `i16-closure-verify.js`, sha256 `6C3C3763A06FCB6A6708141A2B83D3BE60DF17DF7A5DB2BFDCC84B844EDFA1F1`. Koşum
betiklerini kullanmaz; ayrı süreçte ve `hukuk_db` üzerinde READ ONLY transaction içinde çalışır. Çıktı
`i16-closure-verify-6b883b16.json`, sha256 `1BE3F1879860607852367900B8198A9D32D298F7C8A05F2A0F329A03478637A8`.

| Denetim | Sonuç |
|---|---|
| V1 kanıt | 12 zorunlu satırın hepsi PASS · runId eşit · portal girişi 401, personel girişi 401, `/auth/me` 401 |
| V2 manifest | 5 satır eşit · manifest dışı dosya 0 (`SHA256-MANIFEST.txt` `96918BA2…E71B`) |
| V3 erişim — hedef `ah-6b883b16` | aktif/toplam kullanıcı 0/9 · ACTIVE case 0 · **aktif portal kullanıcısı 0** |
| V3 erişim — yabancı `ah-6b883b16-x` | aktif/toplam kullanıcı 0/0 · ACTIVE case 0 · aktif portal kullanıcısı 0 |
| V4 gerçek tenant izolasyonu | şimdi `65fbbaf9bb5bb0ee`/21 = koşum öncesi |
| V5 GO ref | yalnız sha256 (`literalWritten=false`) · literal içeren dosya 0 |

Doğrulayıcının ret yolu disposable ortamda ayrıca sınandı: GO ref literali eklenince V5 FAIL verdi.

**Kanıt dosyaları (sha256):**

| Dosya | sha256 |
|---|---|
| `i16-evidence.json` | `94277004312FCC18890A6AAB708ABA00F6AA0B504FE9ED52F9C01E28AAE23600` |
| `i16-setup-receipt.json` | `74B118B02BBFB53922A8FAFA7954F715BB70FEBA1A1AAA903BBB7F718B057C60` |
| `i16-run.log` | `DF7C3F2F1CCDE7D1355884D6E204328648E23BCBC6B9EF462A004318DAA8E4CB` |
| `goref-consumed.json` | `7AC483CE5D4ACD98AD3385351425C8BC10D6D8761D6365A60D9C4A0A9E86DC88` |
| `owner-block.json` | `8B5F4FB84A2CA2D1F5B60F411D113897AECBEC48DC2DC035DB9BB5E7FBDE01E4` |

**Pencere.** Dört yürütücü açık teyit verdi. Pencere boyunca kesinti, Docker işlemi ve temizlik yapılmadı; canlı `:8080`
tek dinleyici (pid 33248) ve DB kimliği `127.0.0.1:5432/hukuk_db` korundu.

**Sonuç: İ16 KAPANDI.** Teknik sayaç **18/18**. Kanıt satırları silinmez; sentetik tenant'lar ve portal hesapları kapalı kalır.
**Teknik tamamlanma hizmet kabulü değildir; hizmet kabulü 0/8 ve owner kararına bağlıdır.**
