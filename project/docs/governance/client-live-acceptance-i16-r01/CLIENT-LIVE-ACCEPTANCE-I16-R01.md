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
