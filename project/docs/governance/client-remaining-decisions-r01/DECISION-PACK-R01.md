# CLIENT — KALAN KARARLAR TEK PAKET (R01)

OWN-10 · OWN-12 · OWN-15 · diğer POA rotaları rol politikası · legacy upload `filePath` · MR-063 · yayın (RELEASE20) kapsamı

```text
STATUS            : ANALYSIS_DELIVERED / WAITING_FOR_OWNER_DECISION (D-1 … D-10)
KAYNAK            : owner GO "CLIENT KALAN KARARLAR → UYGULAMA → CANLI KABUL" (2026-09-06)
ANALİZ BASELINE   : main 93ceeedb877eab5f509b643e4895ccbfaf9c7371 (#2518)
KORUNAN KAPANIŞLAR: OWN-13 CLOSED (#2517/#2518) · F04 (#2512/#2513) · F02 (#2515/#2516) — bu paket bunları YENİDEN AÇMAZ
BU TURDA          : kod/şema/migration/deploy DEĞİŞMEDİ; production yazması 0; yalnız salt-okuma ölçüm
IMPLEMENTATION AUTHORITY: NONE — bu belge yetki üretmez; her D-n kalemi owner cevabıyla ayrı uygulanır
```

Bu paket **hiçbir kalemi listeyi boşaltmak için ertelemez veya kapatmaz**: her kalemde mevcut davranış, kullanıcıya etkisi,
ölçülmüş kanıt, önerilen karar, kabul ölçütü ve **ZORUNLU (bu sürüm) / İSTEĞE BAĞLI** sınıfı ayrı yazılmıştır.

---

## 1. Doğrulanmış zemin (yerel salt-okuma ölçüm, 2026-09-06)

### 1.1 Canlı runtime ve yayın sorumlusu

| Öğe | Ölçülen |
|---|---|
| Canlı API / Web | RELEASE18 `b53385527c47075918338289fac9f06afd97e525` — `HY_W4_RELEASE18`; API pid 3704 (`:::8080`), Web pid 49748 (`:::3002`), her ikisi 2026-09-05 14:56'dan beri; görevler `HukukPlatform-API` / `HukukPlatform-Web` Running |
| Altyapı | postgres 5432 / redis 6379 / minio 9000 / meilisearch 7700 yalnız 127.0.0.1 (Docker) |
| Canlı DB | `hukuk_db` (172.18.0.3, primary), `_prisma_migrations` 129 |
| RELEASE19 adayı | `a60d772b` (#2514'e kadar) — `HY_C33_RELEASE19_CANDIDATE` mühürlü (candidateDigest `63F760C4…`, son mühür 7, 2026-09-06 12:34); zincir 11/11, qualification 26/26; **cutover YAPILMADI** |
| RELEASE19 cutover paketi | `HY_C33_RELEASE19_CUTOVER_R23` mühürsüz (unsealedDigest `B4069132…`), 89/89 qualification; owner preflight PASS **YOK**; owner kararları K-12..K-18 açık |
| Yayın sorumlusu | C33 hattı (Office/C33 sayfası): aday zinciri + R22 deseni cutover motoru; **cutover yalnız owner-command ile, yükseltilmiş owner koşumu**. Bu sayfa (CLIENT) deploy ETMEZ; yalnız paket kapsamına girdi verir |
| Eşzamanlılık | Canlıda değişiklik yok (pid/bin sabit); iki sayfanın aynı ortama eşzamanlı deployment riski yalnız **tek mühürlü paket + tek owner-command** kuralıyla kapatılır (bkz. §3.6) |

### 1.2 CLIENT teslimlerinin yayın paketindeki durumu (KANIT: git ancestry)

| Commit | İçerik | RELEASE18 (canlı) | RELEASE19 adayı `a60d772b` | Not |
|---|---|---|---|---|
| `da636990` #2512 | F04 posting/reversal yarışı (CLIENT/COLLECTION) | YOK | **VAR** | canlı yazma-yolu kanıtı F-6 owner kararı (C33 K-4) |
| `70ca446e` #2513 | F04 docs | — | VAR | docs |
| `a60d772b` #2514 | OFFICE F-B01-03 | YOK | VAR (aday = bu commit) | OFFICE |
| `1a626e79` #2515 | F02 manuel scheduler yetki + tenant kapsamı | YOK | **YOK** | CLIENT/SCHEDULER |
| `2a9c3c33` #2516 | F02 manuel/global cron çakışması (WAIT) | YOK | **YOK** | CLIENT/SCHEDULER |
| `a401d64e` #2517 | OWN-13 R6 legacy POA upload servis-giriş kapısı | YOK | **YOK** | CLIENT |
| `93ceeedb` #2518 | OWN-13 kapanış docs | — | YOK | docs-only, runtime etkisi yok |

**Sonuç:** hazır Office paketi (RELEASE19) son CLIENT düzeltmelerini (#2515, #2516, #2517) **İÇERMİYOR**. CLIENT sürümünü canlıya
almak için ya RELEASE19 üstüne ikinci bir cutover ya da tek bir RELEASE20 gerekir (§3, D-7).

Canlı → main deltası (b5338552..93ceeedb): 7 commit, 39 dosya (+3734/−74); ürün dosyası 16 (scheduler 4, poa 2, client-settlement 2,
office 3, common 1, web office sayfası 1, CI manifest 4); **migration 0** (129 = 129), **env anahtarı 0**, **lockfile/package.json 0**,
**CI workflow 0**.

---

## 2. Karar kalemleri

### 2.1 OWN-10 — geçersiz kimlik/checksum taşıyan pasif kayıtlar

**Mevcut davranış (kod):** `assertCreateIdentityChecksum` yalnız GERÇEKTEN YENİ kayıtta çalışır (Faz 1, owner-locked 2026-06-30);
dedup/reactivate yolu ve `update()` checksum doğrulamaz (Faz 4 açılmadı). Reactivate-via-create elevated ister (R1A) ama kimlik
doğrulamaz. Seed `fix-clients` geçersiz satırı `failed` sayar, veriye dokunmaz.

**Ölçüm (canlı `hukuk_db`, READ ONLY, 2026-09-06T11:11Z; PII yazılmadı):**

| Sayım | Değer |
|---|---|
| Client toplam / aktif / pasif | 18 / 10 / 8 |
| Geçersiz TCKN / geçersiz VKN | 7 / 0 |
| Geçersiz olanlarda aktif / pasif | **0 / 7** |
| Geçersiz olanlardan dosyaya (`CaseClient`) bağlı | **0** |
| Kimliği boş | 4 |
| Geçersiz kayıtların tenant'ı | tek tenant: `telli-hukuk` (gerçek ofis; demo değil) |

**Kullanıcıya etkisi:** aktif kullanımda görünür etki YOK (aktif geçersiz 0). Riskler: (r1) elevated kullanıcı 7 pasif kaydı kimlik
düzeltmeden reaktive edebilir; (r2) pasif kayıt düzenlemesi geçersiz TCKN'yi yeniden kaydeder (update doğrulamaz).

**Önerilen karar (D-1):**
- (a) **Veri düzeltmesi YOK** — güvenilir kaynak (kimlik belgesi/UYAP kaydı) olmadan kimlik verisi düzeltilmez; 7 kayıt pasif kalır.
- (b) **Faz-4 koruması (küçük, geriye uyumlu):** `update()` yalnız `tckn`/`vkn` DEĞERİ değişiyorsa checksum doğrular (değişmeyen
  legacy değer geçer); her `isActive:false→true` geçişi (explicit reactivate, update, create-dedup) geçerli checksum ister
  (`400` + stabil `CLIENT_IDENTITY_CHECKSUM_INVALID`; düzeltme = elevated kullanıcı kaynak belgeyle geçerli kimliği girer, sonra
  reaktive eder).
- (c) 7 kaydın ID listesi owner isterse salt-okuma ile **ayrı** teslim edilir (repo'ya yazılmaz); düzeltme UI üzerinden, kişi başına.
- Geri dönüş: (b) kod-only, PR revert; veri değişmediği için veri geri alma yok.

**Kabul ölçütü:** birim/entegrasyon: değişen geçersiz `tckn` ile update → 400; değişmeyen legacy değerle update → geçer; geçersiz
kimlikli pasif kaydı reaktive → 400; geçerli kimlik → izin; seed `fix-clients` davranışı aynı. Canlı: `invalidActive = 0` korunur
(salt-okuma sayım). **Sınıf:** (a)(c) karar; (b) **İSTEĞE BAĞLI** (öneri: RELEASE20'ye dahil — küçük, davranış kırmaz).

### 2.2 OWN-12 — API istemcisi / cevap zarfı / modal birleştirme (RISKY Fork A–D)

**Mevcut davranış (ölçüm, web):** `lib/api.ts` 5 855 satır, **255** dosya tüketiyor; `lib/api/client.ts` 138 satır, **6** dosya
tüketiyor (token kaynağı CAD-C1-B03 ile `api` singleton'ına bağlandı → çift token deposu sorunu zaten kapalı). Zarf: `lib` içinde
23 `data.data`/unwrap noktası; sayfalar `res.data?.data || res.data` deseniyle her iki biçimi tolere ediyor. Müvekkil formu 3 uygulama:
`NewClientModal` (`cases/new`), `ClientModal` (`settings/clients`), `ClientForm` bileşeni (`/clients/new`, `/clients/:id/edit`).

**Kullanıcıya etkisi:** işlevsel kusur YOK; etki bakım maliyeti ve üç formun sürüklenme riski (OWN-13 capability görünürlüğü üç yerde
ayrı tutuluyor).

**Önerilen karar (D-2):** Bu sürüm için **ZORUNLU DEĞİL**; kalem **AÇIK** kalır (kapatılmaz), sınıfı İSTEĞE BAĞLI mühendislik.
Uygulanacaksa sıra: **D → B → A → C** = (D) backend zarf sözleşmesi additive (`{ data }` her yerde, eski biçim geçiş süresi) →
(B) frontend tek `unwrapEnvelope` yardımcı → (A) `lib/api/client.ts` 6 tüketicisini `api`'ye katla → (C) üç formu `ClientForm`
üzerinde birleştir. Gerekçe (erteleme değil): 255 tüketici ile yüksek blast-radius, sürüm kabulüne katkısı yok, kullanıcı kusuru yok.

**Kabul ölçütü (uygulanırsa):** sıfır davranış değişikliği; web vitest tamamı; her adım ayrı PR; capability görünürlüğü (OWN-13)
regresyon testi. **Sınıf:** İSTEĞE BAĞLI.

### 2.3 OWN-15 — ClientInfoRequest ↔ ClientIntake bağlantısı ("Yol1") + Intel/Intake yetki ve audit sınırı

**Mevcut davranış (kod):**
- `POST /address-discovery/client-info-request` müvekkile **GERÇEK e-posta** gönderir (`EmailProviderService`), `POST …/:id/reminder`
  hatırlatma e-postası gönderir; `PUT …/:id/respond` ve `…/:id/no-response` durum işaretler. Dört uçta yalnız `JwtAuthGuard`:
  **VIEWER dahil her kimlikli kullanıcı müvekkile e-posta gönderebilir**; AuditLog YOK (yalnız maskeli log).
- Dosya oluşturmada otomatik talep (`sendAutoRequestOnCaseCreate`, tenant ayarı `autoClientInfoRequest`) — sistem yolu, aktörsüz.
- E-posta şablonunda intake bağlantısı YOK (serbest metin yanıt); ClientIntake (token'lı, yapılandırılmış) ayrı akış.
- `client-intel-statements`: retract/false-positive/supersede elevated (I1A, owner-locked 2026-07-02); create kapsam dışı (owner).

**Kullanıcıya etkisi:** müvekkile giden e-posta yetkisiz/izsiz gönderilebilir (itibar + KVKK izlenebilirlik); yanıtlar yapılandırılmadığı
için manuel işlenir.

**Önerilen karar (D-3):**
- (a) **ZORUNLU (RELEASE20):** e-posta gönderen iki uç (`create`, `reminder`) C2'nin frozen WORKSPACE primitive'inden geçer
  (yeni komut tipleri `INFO_REQUEST_SEND`, `INFO_REQUEST_REMINDER_SEND`; eşik §13/11 madde 6 "gerçek mail/SMS gönderimi": ADMIN VEYA
  elevated; VIEWER/tanımsız rol fail-closed; başarılı gönderim `CLIENT_WORKSPACE_COMMAND` audit — requestId + status, e-posta içeriği
  YOK). Durum işaretleri (`respond`, `no-response`): D01 coarse kuralı (VIEWER DENY, USER/ADMIN izin) + audit. Otomatik sistem yolu
  değişmez (aktör yok; audit `actor: SYSTEM` isteğe bağlı). Kapı SERVİS girişinde, actor zorunlu (R1 deseni).
- (b) **"Yol1" adaptörü** (talep e-postasına tek kullanımlık intake bağlantısı + yanıtların intake review kuyruğuna düşmesi) = ürün
  özelliği; **İSTEĞE BAĞLI**, ayrı bounded görev (X3 intake sözleşmeleri ve CR-1 review≠promote korunarak).
- (c) `client-intel-statements` create: owner-locked kapsam dışı kararı **korunur** (değişiklik önerilmez).

**Kabul ölçütü (a):** VIEWER → 403, e-posta sağlayıcı çağrılmaz, kayıt yazılmaz; USER (elevated değil) → 403; ADMIN/elevated → 201 +
e-posta gönderildi + audit satırı; otomatik yol aynı; sahte e-posta sağlayıcı ile testler; CI manifestine tam adla bağ.
**Sınıf:** (a) ZORUNLU · (b) İSTEĞE BAĞLI · (c) değişmez.

### 2.4 Diğer POA rotalarının rol politikası

**Mevcut davranış (kod + web):** `POST /poa` (create), `PUT /poa/:id`, `POST /poa/:id/lawyers`, `DELETE /poa/:id/lawyers/:lawyerId`,
`DELETE /poa/:id/file` yalnız `JwtAuthGuard` — **VIEWER bile vekalet oluşturabilir/değiştirebilir**; `status` varsayılanı `ACTIVE`
olduğundan ve K9 (§13/9) capability bağı `isActive + ACTIVE + validUntil` ile çalıştığından yetkisiz oluşturulan vekalet
`canCollect/canSettle/canWaive/canRelease` yetkilerini **etkin kılar**. `DELETE /poa/:id` (revoke) elevated-only
(`assertCanManagePoaLifecycle`, P1A); `POST /poa/:id/upload` R6 ile kapılı. Web: `settings/clients` (create/delete/upload/download/
file-delete), `cases/new` sihirbazı inline POA create (iki yol; biri hata mesajı verir, diğeri hatayı sessizce yutar ve müvekkili
vekaletsiz bırakır).

**Kullanıcıya etkisi:** yetki sınırı yok → temsil yetkisi kayıtları herkes tarafından değiştirilebilir (K9 bütünlüğü). Politika
uygulanınca elevated olmayan USER sihirbazda vekalet ekleyemez (vekalet, yetkili kullanıcıca sonradan eklenir).

**Önerilen karar (D-4):**
- (a) **ÖNERİLEN — ADMIN VEYA elevated:** create/update/addLawyers/removeLawyer/deleteFile için eşik D02 "vekalet/temsil yetkisi
  niteliğindeki alanlar = HASSAS" ve §13/11 ile aynı (ADMIN VEYA `isApproverEligible`); VIEWER DENY; revoke elevated-only olarak
  **değişmez** (daha sıkı kalır). Uygulama: frozen primitive + additive komut tipleri (`POA_CREATE`, `POA_UPDATE`, `POA_LAWYERS_ADD`,
  `POA_LAWYER_REMOVE`, `POA_FILE_DELETE`) — public shape genişlemesi **owner ratifikasyonuyla** (C2 kapalı); kapı `PoaService`
  girişinde, actor zorunlu; başarılı mutasyon audit.
- (b) Hepsi elevated-only (D07 deseni) — sihirbazda vekalet kaydı yalnız PARTNER/onaylayıcı; operasyonel yük.
- (c) Statüko — ÖNERİLMEZ (K9 bütünlüğü açık).
- UI (isteğe bağlı takip): sihirbazın sessiz yol için "Vekalet için yetkili onay gerekir" mesajı.

**Kabul ölçütü:** rol matrisi (VIEWER 403/yazma yok · USER elevated değil 403 · ADMIN/elevated 201 + audit) beş uç için; K9: VIEWER
ACTIVE vekalet oluşturamaz (capability etkinleşmez); mevcut revoke davranışı aynen; web akışları (settings/clients, cases/new) yetkili
kullanıcıda değişmez; CI'da koşan spec'ler. **Sınıf: ZORUNLU** (güvenlik + K9 bütünlüğü).

### 2.5 Legacy upload yanıtındaki ham `filePath`

**Mevcut:** `POST /poa/:id/upload` yanıtı `{ success, filePath, fileSize, mimeType }` — sunucu dosya yolu istemciye döner. Web yanıtı
kullanmaz (`loadPoas()` ile yeniler). **Öneri (D-5):** yanıtı `{ success, hasFile: true, fileSize, mimeType }` yap (workspace yanıtıyla
hizalı); geriye uyumlu (tek tüketici yolu kullanmıyor). **Kabul:** yanıtta `filePath` yok; web upload akışı aynı; spec.
**Sınıf:** İSTEĞE BAĞLI (D-4 ile aynı PR'da paketlenmesi önerilir).

### 2.6 MR-063 — `HY_WT/OWN13_R46` orphan worktree dizini

**Ölçülen:** git kaydı yok, branch yok, WIP yok; top-level `node_modules` reparse-point değil; 4 793 reparse point'in tamamı dizin içine
hedefli (kanonik `node_modules` bağı yok); silme girişimi "Filename too long". **Öneri (D-6):** (a) owner manuel siler; veya
(b) owner MR-062'deki register-kanıtlı mekanizmayı (`[System.IO.Directory]::Delete("\\?\<abs>", $true)` + anında kanonik integrity
check) **açıkça** yetkilendirir; (c) kalıcı tutulur. Ajan mevcut korumayı dolanmaz. **Kabul:** dizin yok + kanonik `.bin` sayımı
değişmedi → MR-063 CLOSED. **Sınıf:** bakım (sürüme etkisi yok).

---

## 3. Yayın kararı — CLIENT sürümünü canlıya alma

### 3.1 Kapsam seçenekleri (D-7)

| Seçenek | İçerik | Artı | Eksi |
|---|---|---|---|
| **(a) ÖNERİLEN: RELEASE20 tek cutover** | Faz 2 (D-1b, D-3a, D-4, D-5, D-10) merge edildikten sonra main HEAD'inden yeni aday; RELEASE19 paketi SUPERSEDED / NOT_REUSABLE | tek kesinti (~1–3 dk), tek qualification, CLIENT + OFFICE + F02 birlikte | RELEASE19 zinciri/qualification yeniden koşulur (~1–2 saat makine); cutover paketi R23 → R24 forku |
| (b) RELEASE19 şimdi + RELEASE20 sonra | Office F-B01-03 + F04 hemen; F02/R6/Faz 2 ikinci cutover | Office kusuru daha erken kapanır | iki kesinti, iki kabul turu |
| (c) Yalnız RELEASE19 | CLIENT F02/R6 canlıya alınmaz | — | CLIENT sürümü sonuçlanmaz (bu GO'nun hedefine aykırı) |

### 3.2 Paket kimliği planı (RELEASE20, seçenek a)

Kaynak commit = Faz 2 PR'larının squash SHA'sı sonrası `origin/main`; `HY_W4_RELEASE20` detached worktree; aday zinciri RELEASE19
tooling forku (`fork-r19-to-r20`), build 3/3 + manifest + defter + R09 bağlama + qualification; cutover paketi R23 forku (R24; pins R20
ileri / R18 geri; 89+ negatif kontrol; owner preflight; `-RatificationRef`). Kimlikler (candidateDigest, BUILD_ID, dist marker'ları:
`scheduler.service.js` WAIT, `poa.service.js` `persistPoaFile`, F-B01-03/F04 marker'ları) paket makbuzunda pinlenir.

### 3.3 Diğer modüllere etki / migration / veri

OFFICE (F-B01-03: settings GET yetkisi, S2 omit — UI alıcı listeleri devre dışı), SCHEDULER (manuel tetikleme yetki eşiği I02-R3;
manuel/global çakışmada bekleme — cron davranışı: aynı iş sıralanır), COLLECTION/CLIENT (F04 posting kilidi FOR NO KEY UPDATE, reversal
CAS), CLIENT (R6, Faz 2). **Migration 0, şema 0, env anahtarı 0, veri değişikliği 0** (Faz 2 de migration üretmez; D-1 veri
düzeltmez).

### 3.4 Yedek / geri dönüş

R22 deseni: RELEASE18 generation kopyaları byte-özdeş (`generations/R18/`), DB backup R07 makbuzu; rollback Web→API, veri geri alma
gerekmez. **Açık uyarı:** rollback RELEASE18'e dönüş = F-B01-03 kusuru, F04 yarış riski, F02 manuel tetik yetki boşluğu ve iş kaybı,
R6 legacy upload boşluğu ve Faz 2 kapıları **geri gelir**.

### 3.5 Sınırlı canlı kabul (cutover sonrası; salt-okuma önce, yazma yalnız sentetik tenant'ta)

| Alan | Salt-okuma (gerçek tenant, onaysız) | Yazma gerektiren (D-8 onayı; yalnız `demo-firma` sentetik tenant) |
|---|---|---|
| OFFICE F-B01-03 | O-1..O-7, O-9 (C33 paketi) | O-8 UI Kaydet |
| F04 | F-1..F-5 | F-6(a) disposable replay (production dışı) veya F-6(b) production kontrollü yazma |
| F02 | VIEWER/USER manuel tetik → 403 (yazma yok); `GET /scheduler/status` 200 | PARTNER manuel tetik → 201 + `outcome` (Due/DecisionLog yazar → yalnız demo tenant) |
| R6 / D-4 / D-5 | VIEWER legacy upload/POA create → 403 (yazma yok) | elevated upload/create → audit satırı |
| D-3a | VIEWER info-request → 403, e-posta yok | ADMIN gönderim → **gerçek e-posta** → yalnız demo tenant + demo alıcı adresi |

**Gerçek kullanıcıya mesaj gönderen veya gerçek kayıt değiştiren adımlar:** F-6(b), F02 PARTNER tetik (gerçek tenant), D-3a gönderim,
POA create/update/delete (gerçek tenant), O-8 — hepsi **önceden açık onay** ister (D-8); onaysız hiçbiri yapılmaz.

### 3.6 Eşzamanlılık ve yetki

- Aynı ortama iki sayfa deployment yapmaz: tek mühürlü paket (RELEASE20) + tek owner-command; RELEASE19 paketi seçenek (a)'da
  SUPERSEDED olarak kaydedilir; C33 hattı motor/komut sahibi kalır.
- Mevcut yayın yetkisi (RELEASE19 hazırlığı) RELEASE20 paketini **kapsamaz** → mühür sonrası **yalnız canlı geçiş için son onay**
  ayrıca istenecek (D-9); bu paket onu istemez.

---

## 4. Karar formu (owner cevabı: `D-n: seçenek` — önerilen varsayılanlar işaretli)

| # | Karar | Seçenekler | Öneri | Sınıf |
|---|---|---|---|---|
| D-1 | OWN-10 | (a) veri düzeltmesi yok · (b) Faz-4 koruması (değişen/reaktive kimlikte checksum) · (c) ID listesi ayrı teslim | **a + b (+c isteğe bağlı)** | b: İSTEĞE BAĞLI (RELEASE20'ye dahil önerilir) |
| D-2 | OWN-12 | (a) açık kalır, İSTEĞE BAĞLI; sıra D→B→A→C · (b) şimdi uygula | **a** | İSTEĞE BAĞLI |
| D-3 | OWN-15 | (a) info-request gönderim kapısı + audit · (b) Yol1 adaptörü · (c) intel create kapsam dışı korunur | **a + c; b ayrı görev** | a: ZORUNLU |
| D-4 | POA rotaları | (a) ADMIN VEYA elevated (revoke elevated-only kalır) · (b) hepsi elevated-only · (c) statüko | **a** | ZORUNLU |
| D-5 | legacy `filePath` | (a) yanıttan çıkar · (b) koru | **a** | İSTEĞE BAĞLI |
| D-6 | MR-063 | (a) owner manuel · (b) ajan MR-062 mekanizmasına açık yetki · (c) kalıcı | **a veya b** | bakım |
| D-7 | Yayın kapsamı | (a) RELEASE20 tek cutover · (b) RELEASE19 + RELEASE20 · (c) yalnız RELEASE19 | **a** | ZORUNLU |
| D-8 | Yazma gerektiren kabul adımları | yalnız `demo-firma` sentetik tenant'ta izin · gerçek tenant'ta yasak | **demo-only** | kabul |
| D-9 | Canlı geçiş son onayı | RELEASE20 mühürlendikten sonra ayrı owner-command | **ayrı istenecek** | cutover |
| D-10 | F04 birim spec'leri CI manifest boşluğu (C33 K-12) | (a) Faz 2'de manifest bağı · (b) ayrı | **a** | test kapsamı |

Faz 2 kapsamı (öneri kabul edilirse): D-1b + D-3a + D-4 + D-5 + D-10 → izole worktree, küçük geriye uyumlu PR'lar, odaklı testler,
CI'da gerçek koşum kanıtı, kapanış kayıtları aynı PR'da; IF GO-COMPLETE.

---

## 5. Bu turda yapılmayanlar

Uygulama kodu, şema, migration, deploy/cutover, production yazması, gerçek kullanıcıya e-posta, RELEASE20 build/paket, owner-command,
MR-063 silme. Önceden onaylanmış bağımsız iş kalmadı (K-12 ve K-13..K-18 C33 hattında owner kararı bekliyor). Salt-okuma ölçüm
betikleri repo dışında (scratchpad), `.env` değeri okunmadı/yazılmadı, PII çıktıya girmedi.
