# P5-B03 — Staff Authorization Compatibility Matrisi

Kanıt etiketleri: `VERIFIED` (komut çıktısı), `OBSERVED` (dosya içeriği), `INFERRED`, `ASSUMED`.
Tüm dosya referansları base `271e81d3` içindir. Aktör verileri `hukuk_db` canlı SELECT'leridir
(2026-08-13; yalnız okuma).

## 1. ÖNCÜL ÇELİŞKİSİ — önce bunun kaydı (F-B03-01)

Handoff öncülü: "StaffController yalnız class-level JwtAuthGuard taşır — ROL KAPISI YOKTUR.
Herhangi bir authenticated tenant kullanıcısı staff create/update/delete edebilir."

Repo kanıtı (`OBSERVED`, `staff.controller.ts`): **dört mutasyon ucu da method-level
`OfficeF01AuthorizationGuard` taşıyor** (PR #2076 `fix(office): enforce F01 authorization and projections`,
squash `2cae1fb1…`, satırlar `:35, :51, :67, :80`). Rol kapısı olmayan uçlar yalnız iki GET'tir.

Öncülün doğru kaldığı iki bağlam: (a) **GET yüzeyi** — aşağıda §5; (b) **bayat RUNTIME kökü dist'i**
(`C:\Development\HY_WT\RUNTIME`): orada F01 guard dist'te hiç yok (`staff.controller.js` F01 referansı 0) —
ancak o kök canlı tüketici değil (B01 §2). **Canlı kökte (RELEASE10) F01 kapısı fiilen mevcut**
(guard.js VAR + controller referansları VAR + #2076 ancestry EVET; B01 §4).

Bu çelişki karar değiştirir: B04 "rol kapısı ekle" hedefinin mutasyon ayağı canonical'da ZATEN
karşılanmıştır; B04'ün gerçek kalan yüzeyi §7'dedir. Sessizce ilerlemek yerine kayıt altına alındı.

## 2. Endpoint envanteri (`OBSERVED`)

Global prefix `api` (`main.ts:28`); class `@Controller('staff')` + `@UseGuards(JwtAuthGuard)` (`staff.controller.ts:7-8`).

| # | Metot | Path | Ek guard | Servis | Not |
|---|---|---|---|---|---|
| E1 | GET | `/api/staff` (+`?type=`) | — | `findAll`/`findByType` | tckn **maskeli** liste; TÜM yetki bayrakları dahil |
| E2 | GET | `/api/staff/:id` | — | `findOne` | **tckn HAM** (`staff.service.ts:30-35`) — F-B03-02 |
| E3 | POST | `/api/staff` | `OfficeF01AuthorizationGuard` (`:35`) | `create` | `body: any` — DTO yok |
| E4 | PUT | `/api/staff/:id` | `OfficeF01AuthorizationGuard` (`:51`) | `update` | `body: any`; allow-map 19 alan |
| E5 | DELETE | `/api/staff/:id` | `OfficeF01AuthorizationGuard` (`:67`) | `remove` | bağlı User'ı tx içinde deaktive eder |
| E6 | PUT | `/api/staff/order/update` | `OfficeF01AuthorizationGuard` (`:80`) | `updateOrder` | yalnız `sortOrder` |

- Finans bayrakları (`canSeeFinance`, `canApproveFinance`) yalnız E3/E4'ten yazılır
  (`staff.service.ts:106-107, 176-177`) — ikisi de F01 kapılı.
- `body: any` → global `ValidationPipe({whitelist, forbidNonWhitelisted})` metatype `Object` olduğundan
  **doğrulama uygulamaz** (F-B03-03); alan filtresini yalnız servis allow-map'i yapar
  (`staff.service.ts:164-182`: kişisel alanlar + 9 bayrak + `isActive` + `sortOrder`; `userId` allow-map'te
  **YOK** → kimlik köprüsü bu uçlardan değiştirilemez, `OBSERVED`).
- Route çakışması yok; `@Put(':id')`'nin `@Put('order/update')`'ten önce tanımlı olması bugün zararsız
  ama kırılgan sıralama (tek-segment eşleşme kuralına yaslanıyor).

## 3. Guard semantiği (`OBSERVED`)

- `JwtAuthGuard` = saf `AuthGuard("jwt")` — rol kontrolü yok.
- `OfficeF01AuthorizationGuard` → `isF01ActorAuthorized(userId, tenantId)`
  (`office-approval.service.ts:474-512`): kullanıcının `staffMember` bağı varsa **daima RED** (`:496`);
  `role === 'ADMIN'` → KABUL (`:503`); değilse bağlı Lawyer için `lawyerRank ∈ {PARTNER, MANAGER}` **veya**
  `canApproveOfficeActions === true` → KABUL (`:507-511`); aksi RED (403 `OFFICE_F01_AUTHORIZATION_REQUIRED`).
- `AdminGuard` (`auth/guards/admin.guard.ts:7-13`): yalnız `req.user.role === 'ADMIN'`; staff
  controller'da **kullanılmıyor**.

## 4. Aktör × endpoint matrisi — TELLİ HUKUK canlı verisiyle (`VERIFIED`)

DB gerçeği: 3 tenant; TELLİ HUKUK'ta 9 kullanıcı (8 aktif): 2 ADMIN, 7 USER, 0 VIEWER.
StaffMember: 10 satır, 3 aktif ve üçü de User'a bağlı (C1 P2-B03 pilotları); üçünde de
`canSeeFinance = canApproveFinance = true`. Avukat bağları: ULAŞ HÜSEYİN (PARTNER↔ADMIN),
FATMA (PARTNER↔USER), EGE (AUTHORIZED + `canApproveOfficeActions=true` ↔USER).

| Kullanıcı (rol · bağ) | E1/E2 GET (bugün) | E3–E6 mutasyon (bugün, F01) | E3–E6 `AdminGuard` olsaydı |
|---|---|---|---|
| Admin (ADMIN · bağsız) | İZİN | **İZİN** (ADMIN) | İZİN |
| ULAŞ HÜSEYİN TELLİ (ADMIN · PARTNER avukat) | İZİN | **İZİN** (ADMIN) | İZİN |
| FATMA (USER · PARTNER avukat) | İZİN | **İZİN** (rank PARTNER) | **RED — kırılır** |
| EGE (USER · AUTHORIZED avukat, canApproveOfficeActions=t) | İZİN | **İZİN** (delegasyon bayrağı) | **RED — kırılır** |
| Fatih (USER · staff-bağlı, MUHASEBE) | İZİN | RED (`staffMember` kuralı) | RED (değişmez) |
| Aysu (USER · staff-bağlı, STAJYER_AVUKAT) | İZİN | RED | RED |
| Büşra (USER · staff-bağlı, SEKRETER) | İZİN | RED | RED |
| Test (USER · bağsız) | İZİN | RED (rol/bağ yok) | RED |
| EGE-pasif (USER, isActive=f) | oturum yok | — | — |

Handoff'un kritik girdisi doğrulandı ve güncellendi: **C1'in bağladığı 3 personel USER rolündedir ve
mevcut F01 kapısı onları staff yönetiminden ZATEN dışlar** (hem rol hem `staffMember` kuralıyla, çifte).
Rol-gate'e geçiş onlar için davranış değiştirmez; değiştirdiği kişiler avukat-aktörlerdir (FATMA, EGE).

## 5. Tüketici envanteri — bu uçları bugün fiilen kim çağırıyor? (`OBSERVED`; statik ölçüm — HTTP erişim logu yok)

### apps/web (11 çağrı sitesi; hiçbirinde frontend rol kontrolü yok)

| Site | Endpoint | Akış |
|---|---|---|
| `settings/office/page.tsx:140` | GET /staff | Büro Ayarları — personel listesi |
| `settings/office/page.tsx:461` | PUT /staff/:id | varsayılan-personel yıldız toggle |
| `settings/office/page.tsx:554/556` | PUT /staff/:id · POST /staff | StaffModal düzenle/yeni |
| `settings/office/page.tsx:584` | DELETE /staff/:id | personel silme |
| `settings/office/page.tsx:1077` | PUT /staff/order/update | sürükle-bırak sıralama |
| `cases/new/page.tsx:599` | GET /staff | Yeni Takip sihirbazı — personel seçici |
| `cases/new/page.tsx:3316` | PUT /staff/:id | **StaffDetailModal** — aşağıdaki hazard |
| `cases/page.tsx:1003` | GET /staff | takip listesi filtre lookup'ı |
| `cases/[id]/page.tsx:1459` (`api.ts:912`) | GET /staff?search= | dosya ekip modalı |
| `lib/api/lawyers.ts:38` | GET /staff?search= | tüketicisi yok (ölü sarmalayıcı) |

- Sidebar "Büro Ayarları" `adminOnly` bayrağı TAŞIMAZ (`sidebar.tsx:67`; karşılaştırma: `:64-65` adminOnly örnekleri);
  dashboard layout yalnız `isAuthenticated` kontrol eder. Yetki tamamen backend'e bırakılmış.
- Sessiz 403: `submitStaff` hata dalı yalnız `console.error` (`settings/office/page.tsx:561-570`) —
  F01 reddi kullanıcıya görünmez. Delete/toggle yolları hatayı gösterir.
- **StaffDetailModal hazard'ı** (`cases/new/page.tsx:3310-3323`): `GET /staff`'tan gelen satırın
  TAMAMI (`{...staff}`) PUT edilir → maskeli `tckn` (`123****01`) geri yazılabilir ve
  `DUPLICATE_IDENTITY`/`SIMILAR_NAME_REVIEW` akışları işlenmez (`alert` ile düşer). Bugün bu yol yalnız
  F01-yetkili 4 aktör için erişilebilir (matris §4); veri-bütünlüğü riski o aktörlerle sınırlı ama gerçek.

### apps/api içi

- `StaffService` başka modülce enjekte edilmiyor (`VERIFIED` grep).
- **Seed (F-B03-04, B02 girdisi):** `POST /api/seed/staff` yalnız `JwtAuthGuard` (`seed.controller.ts:56-60`);
  `seed.service.ts:187-209` `StaffService`'i DEĞİL doğrudan `prisma.staffMember.create({... } as any)`
  (`:204`) kullanır → duplicate/similar-name guard'ları bypass; dedup yalnız email. `seedAll` da çağırır
  (`:50`). Seed modülü koşullu: production'da kapalı, `test`'te açık, aksi halde
  `CLIENT_SEED_ENDPOINTS_ENABLED=true` ister (`app.module.ts:148-153`, `seed-runtime-gate.ts:14-19`).
- Rapor/policy-engine/claim-item yolları tabloyu Prisma'dan doğrudan okur (HTTP değil).

### Testler

- HTTP düzeyi: yalnız `office-e2e.db-gated.integration.spec.ts` — hepsi **ADMIN token'lı** happy-path
  (POST/GET/DELETE). **Boşluklar:** E2 ve E4 ve E6 için hiç HTTP testi yok; hiçbir uçta negatif-aktör
  (personel-bağlı / düz USER / cross-tenant) testi yok; StaffController guard-metadata spec'i yok
  (SeedController'ınki var). Unit testler servis semantiğini kapsar (duplicate, maskeleme, lifecycle).

### Dış tüketici

- İz bulunamadı (e2e/orchestration/script taraması).

## 6. Bayrakların bugünkü yaptırım gerçeği (`OBSERVED`)

- `canApproveFinance`: **hiçbir yerde enforce edilmiyor** — yalnız persist (schema `:4398` ACT-21 notu;
  UI "şu an uygulanmıyor" etiketi `settings/office/page.tsx:1837-1843`). Staff final-approver olamaz (kilitli politika).
- `canSeeFinance`: gerçek tüketici var — `claim-item-write-gate.service.ts:80, 211, 231`.
- Sonuç: bayrak-mutasyonunun bugünkü fiili etki yüzeyi dar; ancak P4 approval-engine bayrakları
  yaptırıma bağladığı gün bu uçlar yetki-yükseltme primitifi olur — kapının bugünden doğru olması bu yüzden önemli.

## 7. "Rol kapısı" değişiklik senaryoları — kırılma analizi

**S1 — Mutasyonlara `AdminGuard` (F01 yerine):** FATMA ve EGE personel yönetimi yetkisini kaybeder
(avukat-ortak/delegasyon akışı kırılır); personel-bağlılar zaten dışlı. Kırılma: GERÇEK ve ölçülü (2 aktör).
F01'in `staffMember→RED` kuralı ADMIN'e uygulanmaz oluru da not: bugün staff-bağlı ADMIN yok (`VERIFIED`).

**S2 — GET'lere F01/Admin kapısı:** dört web akışı personel ve düz-USER aktörlerde kırılır
(`cases/new` sihirbaz seçicisi, takip listesi lookup'ı, dosya ekip modalı, Büro Ayarları listesi) —
tüketici tablosu §5. Kırılma: YÜKSEK; önerilmez (önce web koşullandırması gerekir).

**S3 — GET projeksiyonu (kapı değil, alan daraltma):** liste/`findOne` yanıtından yetki bayraklarını ve
`tckn`'yi F01-yetkisiz aktörler için düşürmek; isim/tür/aktiflik kalır → §5'teki seçici akışları KIRILMAZ
(hepsi ad-görüntüleme amaçlı). Kırılma: ~0 (statik ölçümle; onay owner'da).

**S4 — Statüko + telemetri:** F01 zaten mutasyonları kapattığı için düşük kazanım; yalnız GET-ifşası sürer.

## 8. Geçiş planı ÖNERİSİ (karar owner'ın — hiçbiri bu lane'de uygulanmadı)

B04'ün mutasyon-kapısı hedefi #2076 ile karşılanmış durumda. Önerilen B04 kapsamı (S3 ekseni):

1. `GET /api/staff/:id` → liste ile aynı `tckn` maskesi (F-B03-02) + F01-yetkisiz aktörler için
   bayrak-projeksiyonu (S3) — davranış değişikliği owner onayı + web etki listesi §5 ile.
2. DTO whitelist (E3/E4 `body: any` → sınıf-DTO; F-B03-03) — allow-map davranışını değiştirmeden tip kapısı.
3. StaffController guard-metadata spec'i + negatif-aktör HTTP testleri (personel-bağlı USER → 403;
   cross-tenant → 404/403; credential/bayrak alanlarının yanıt projeksiyonu assertion'ları).
4. Route-order sabitleme notu (E6'yı E4'ün üstüne taşımak — davranış-nötr).
5. (Ayrı birim) StaffDetailModal tam-form PUT hazard'ı — web tarafı; fark-payload'a geçiş
   (bkz. bilinen allowlist-projection + tam-form POST deseni). Owner scope kararı ister.

Telemetri-önce (S4) yalnız S3 reddedilirse anlamlı. S1 (AdminGuard'a geçiş) önerilmez: ölçülü kırılma
(FATMA/EGE) + F01 zaten daha ince taneli.

## 9. B04 ön koşulu

Bu matris, D5'in "B04'ü B03 matrisi olmadan açma" şartını karşılamak üzere üretilmiştir:
aktör × endpoint × mevcut-rol matrisi (§4), tüketici envanteri (§5), kırılma analizi (§7) ve
geçiş önerisi (§8) tamamdır. **B04 PHASE B'de, X3 terminal + PAGE-O0 lease + owner'ın §8 kapsam
onayı ile açılabilir.**
