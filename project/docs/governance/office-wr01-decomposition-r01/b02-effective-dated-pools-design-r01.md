# OFFICE-WR01-B02 — EFFECTIVE-DATED POOLS: SCHEMA + MIGRATION CONTRACT DESIGN (R01 · CORRECTION R02)

```text
DOKÜMAN            b02-effective-dated-pools-design-r01.md
GÖREV              OFFICE-WR01-B02-EFFECTIVE-DATED-POOLS-DESIGN-R01
DÜZELTME GÖREVİ    OFFICE-WR01-B02-EFFECTIVE-DATED-POOLS-DESIGN-CORRECTION-R02
TAMAMLAMA GÖREVİ   OFFICE-WR01-B02-EFFECTIVE-DATED-POOLS-DESIGN-COMPLETENESS-R03
ÇALIŞMA SEVİYESİ   LEVEL 2 FULL (schema + migration sözleşmesi)
STATÜ              DESIGN_COMPLETE / OWNER_RATIFIED /
                   DETERMINISTIC_READY_FOR_IMPLEMENTATION /
                   IMPLEMENTATION_NOT_AUTHORIZED
BASE               origin/main @ 7e497cfa6ffbed1a4377a3d63b84712ad35cc1c2 (2026-08-16)
ÜRETİLEN AUTHORITY NONE — bu doküman implementation başlatmaz; ayrı ve açık owner
                   implementation GO'su zorunludur
ÜRÜN DİFF          YOK (schema / migration / kod / test / flag / runtime / DB: DOKUNULMADI)
```

## R02 — düzeltme ve ratifikasyon kaydı

| Kalem | Durum |
|---|---|
| `OD-B02-01` historical-start/backfill | **APPROVED: A** (owner, PAGE-O0, 2026-08-17) — §15.1 |
| `OD-B02-02` havuz kapsamı | **APPROVED: (a)** — yalnız üç alan; §15.2 |
| `OD-B02-03` okuma cutover'ı | **APPROVED: (a)** — altı yüzeyin tamamı; §15.3 |
| `OD-B02-04` yazma yüzeyi | **APPROVED: (a)** — immediate-effect; §15.4 |
| `CF-B02-01` boş havuz cutover anchor'ı | **DÜZELTİLDİ** — R01'in "cutoverAt'i membership `validFrom`'undan türet" sözleşmesi **GEÇERSİZDİR**; yerine üyelikten bağımsız `OfficeWorkPoolEpoch` anchor'ı; §6.6, §7.6, §8.4, §8.6, §9.5 |
| `CF-B02-02` replace-all concurrency | **DÜZELTİLDİ** — R01'in "partial unique index yarışı kapatır, version/CAS gereksizdir" sonucu **GEÇERSİZDİR**; yerine tenant-başına serialization noktası; §11.5 |

R01'in geçersiz kılınan iki sonucu bu dokümanda **silinmedi**, açıkça
`GEÇERSİZ (R01)` etiketiyle korunarak yerine geçen sözleşme yazıldı — böylece
düzeltmenin ne olduğu ve neyi değiştirdiği izlenebilir kalır.

## R03 — tamamlama kaydı (owner incelemesi sonrası)

Owner disposition: `CF-B02-01` **ACCEPTED** · `CF-B02-02` çekirdek çözümü
**ACCEPTED** · `OD-B02-01..04` **OWNER_RATIFIED** · implementation
**NOT_AUTHORIZED**.

| Kalem | İçerik |
|---|---|
| `CF-B02-02` tamamlaması | **Ortak mutation primitive'i + lock invariant** (§11.5.7) ve **zorunlu concurrency test matrisi T1–T5** (§11.5.8). Serialization artık admin endpoint'ine özgü değil, **tüm** membership yazma yollarını bağlar |
| `CF-B02-03` **YENİ** | **Serialize edilmiş `effectiveAt`** (§11.5.9). PostgreSQL `now()`/`CURRENT_TIMESTAMP` transaction başlangıcında donduğu için kilit beklemesi boyunca ilerlemez; zaman damgası kilit **alındıktan sonra** üretilmelidir. Yeni owner kararı **değildir** — teknik doğruluk koşuludur. İşlendiği yerler: §4 (T8), §7.3, §11.2, §11.3, §11.4, §11.5.2, §11.5.9, §14 (R-16), §16.1, §16 |
| Retry/idempotency | Mutlak *"tek transaction olduğu için gerekmez"* ifadesi **kaldırıldı**; yerine sınıflandırılmış + bounded retry sözleşmesi (§9.4a) |
| Terminal statü | `READY_FOR_IMPLEMENTATION_GO` → **`DETERMINISTIC_READY_FOR_IMPLEMENTATION / IMPLEMENTATION_NOT_AUTHORIZED`** |

---

## 0. Kaynağın sınırı ve bu dokümanın yetkisi

Bu doküman **yalnız tasarımdır**. Prisma modeli yazılmamış, migration dosyası
üretilmemiş, `schema.prisma` değiştirilmemiştir. §6'daki "önerilen sözleşme"
bölümü bile **taslak sözleşmedir**; alan adları rezerve edilmemiştir.

**Predecessor authority (owner-ratified, C8):** aşağıdaki altı bulgu bu
dokümanın asgari predecessor gerçeğidir ve yeniden yorumlanmamıştır:

1. B02'nin gereksinimi effective-dated havuz semantiğidir.
2. Mevcut düz listeler yalnız current-state taşır.
3. Gereksinimi current-state projeksiyonuna indirmek gereksinimin fiilen iptalidir.
4. Mevcut alanların tarihsel olarak ne zamandan beri geçerli olduğu bilinmemektedir.
5. Bu nedenle geçmiş tarih icat eden bir backfill kabul edilemez.
6. C8 implementasyona geçmeden `HARD STOP` vermiştir.

> **EVIDENCE LIMITATION.** C8'in tam raporu bu oturumda repository, branch, PR
> veya erişilebilir bir artifact içinde **bulunamamıştır**: `origin/main` üzerinde
> `office-wr01-decomposition-r01/` altında yalnız `wr01-decomposition-brief-r01.md`
> vardır (PR #2432, squash `25931406`), açık PR yoktur (`gh pr list --state open`
> → `[]`) ve `git log --grep=WR01` yalnız #2432/#2436/#2439/#2442'yi döner. C8
> raporunun erişilemez oluşu bu dokümanda **evidence limitation** olarak
> kaydedilir; yukarıdaki altı bulgu owner aktarımı olarak predecessor authority
> kabul edilmiş, terminal geçmişi varmış gibi gösterilmemiştir.

---

## 1. Executive decision

| Başlık | Karar |
|---|---|
| **Önerilen model** | **Alternatif 2** — normalize effective-dated **üyelik** tablosu (`OfficeWorkPoolMembership` çalışma adı), `poolKind` discriminator + ayrık üye taşıyıcıları (`memberLawyerId` XOR `memberStaffType`), CHECK ile zorlanmış; **artı** üyelikten bağımsız **knowledge-boundary anchor** tablosu (`OfficeWorkPoolEpoch`, `CF-B02-01`) |
| **Kalıcı source-of-truth** | Cutover'dan sonra **yeni effective-dated tablolar** (hem okuma hem yazma). `Office.opStaffTypes` / `escalationManagerLawyerIds` / `escalationFounderLawyerIds` **transition-only türetilmiş projeksiyon** hâline gelir ve ayrı bir retirement gate'inde düşer |
| **Geçiş yaklaşımı** | 7 aşama; dual-write **tek Prisma transaction'ında** (aynı DB, ACID) ve **süreli**; süresiz iki source-of-truth **yoktur**. Legacy→yeni yönü cutover'da tek noktada döner |
| **Backfill** | **Seçenek A — owner tarafından ratifiye edildi** (`OD-B02-01`): mevcut üyeler yalnız deterministik cutover timestamp'inden itibaren effective; cutover **öncesi** için sistem "boş havuz" değil **`UNKNOWN`** döner. Bilgi sınırı **anchor'dan** gelir, membership satırından **değil** (`CF-B02-01`) |
| **Concurrency** | Replace-all yazımı **tenant başına serialize edilir** (`SELECT … FOR UPDATE`, `CF-B02-02`). Kilit **tek ortak mutation primitive'inde** alınır ve **her** membership yazma yolunu bağlar (§11.5.7). Partial unique index yalnız defense-in-depth backstop'tur; tek başına yarışı **kapatmaz** |
| **Zaman üretimi** | `effectiveAt` **kilit alındıktan sonra** `clock_timestamp()` ile **tek kez** üretilir ve mutation'ın tüm tarihsel yazmalarında kullanılır (`CF-B02-03`). Transaction-start `now()` **kaynak olarak kullanılmaz** |
| **Owner kararları** | **4/4 RATIFIED** (2026-08-17): `OD-B02-01` A · `OD-B02-02` (a) · `OD-B02-03` (a) · `OD-B02-04` (a). Açık owner kararı **kalmamıştır** |
| **Terminal readiness** | **`DESIGN_COMPLETE / OWNER_RATIFIED / DETERMINISTIC_READY_FOR_IMPLEMENTATION / IMPLEMENTATION_NOT_AUTHORIZED`** — tasarım deterministiktir; eksik olan tek şey **implementation authority**'sidir (§16.1) |

**Owner'ın beş bağlayıcı koşuluna karşılık:**

| # | Koşul | Bu tasarımdaki karşılığı |
|---|---|---|
| 1 | Effective-dated kapsam korunur, current-state'e geri çekilme yok | §5, §6 — model tarihsel satır taşır; current-state yalnız `asOf = now` özel hâlidir (§7.1) |
| 2 | Geçmiş tarih icat edilmez | §8 — Seçenek A; `asOf < cutover` sorgusu `UNKNOWN` döner, `EMPTY` değil (§7.6) |
| 3 | Migration/backfill deterministik | §8.4 — tek transaction, tek snapshot timestamp, preflight RAISE, idempotency anahtarı, doğrulama sorguları |
| 4 | Kalıcı source-of-truth açık | §9 — yeni tablo; legacy alanlar süreli projeksiyon; retirement gate tanımlı |
| 5 | Geçiş + mevcut admin yazma yolu uyumu | §10, §11 — `PUT /office/escalation-settings` sözleşmesi **korunur**; replace-all payload'u fark hesabıyla effective-dated mutasyona çevrilir |

---

## 2. Mevcut durum (exact repository kanıtı)

Tüm satır referansları `origin/main @ 7e497cfa` üzerindedir.

### 2.1 Üç alanın model tanımı

`project/apps/api/prisma/schema.prisma` — hepsi **`Office` modelinin skaler
dizi kolonlarıdır**; ayrı tablo, ilişki, FK veya tarih taşıyıcısı yoktur:

```prisma
// schema.prisma:2402-2403
escalationManagerLawyerIds String[]    @default([])   // Yönetici avukat(lar)
escalationFounderLawyerIds String[]    @default([])   // Kurucu/ortak avukat(lar)
// schema.prisma:2411
opStaffTypes               StaffType[] @default([MUHASEBE, ADLI_KATIP, SEKRETER])
```

- `Office` modeli `schema.prisma:2343`; `tenantId String @unique`
  (`:2345`) — **tenant başına tek büro**; `tenant Tenant @relation(... onDelete: Cascade)` (`:2346`).
- `StaffType` enum'u `schema.prisma:4364-4372` (7 değer).
- İki lawyer-ID dizisi **çıplak `String[]`'tir**: FK yoktur, referans bütünlüğü
  yoktur, silinmiş/başka tenant'a ait bir `Lawyer` id'si dizide kalabilir.
- Yapısal olarak **aynı sınıfta** iki alan daha vardır ve B02'nin adlandırılmış
  kapsamı dışındadır: `escalationTeamLeadLawyerIds` (`:2415`),
  `poaExpiryRecipientLawyerIds` (`:2424`). Bkz. `OD-B02-02`.

### 2.2 Alanların yaratılış migration'ları — "tarihsel başlangıç bilinmiyor"un kanıtı

| Migration | İçerik |
|---|---|
| `20260615040000_add_office_op_staff_types` | `ALTER TABLE "Office" ADD COLUMN "opStaffTypes" "StaffType"[] NOT NULL DEFAULT ARRAY['MUHASEBE','ADLI_KATIP','SEKRETER']` |
| `20260615050000_escalation_manager_founder_multi` | İki dizi kolonu `DEFAULT ARRAY[]::TEXT[]` ile eklendi; **tekil** `escalationManagerLawyerId`/`escalationFounderLawyerId` değerleri dizilere kopyalandı; tekil kolonlar düşürüldü |

Bu iki dosya, C8'in 4. bulgusunu **repository kanıtıyla** güçlendirir:

1. `opStaffTypes` bir **DEFAULT** ile geldi. Bugün bir tenant'ta
   `[MUHASEBE, ADLI_KATIP, SEKRETER]` görülmesi, **owner'ın bunu seçtiği**
   anlamına gelmez — kolonun default'u olabilir. Veri, "seçim" ile "default"
   arasında ayrım **taşımaz**.
2. İki lawyer dizisinin içeriği 2026-06-15'te **tekil kolonlardan** taşındı;
   tekil kolonların ne zaman set edildiği kayıtlı **değildir**.
3. Hiçbir satırda "bu üyelik ne zaman başladı" bilgisi yoktur; `Office` tablosu
   yalnız `updatedAt` taşır ve o da **son herhangi bir alan güncellemesidir**,
   havuz üyeliğinin başlangıcı değildir.

**Sonuç (VERIFIED):** üç alanın hiçbiri için tarihsel başlangıç repository'den
türetilemez. Kolon yaratılış tarihi (2026-06-15) bir **üst sınırdır**, politika
başlangıcı **değildir**.

### 2.3 Okuma yüzeyleri — tam envanter (test-dışı, 6 yüzey)

`grep` ile tüm eşleşmeler taranmış, test dosyaları hariç tutulmuştur:

| # | Dosya:satır | Ne okur | Bounded context |
|---|---|---|---|
| 1 | `modules/escalation/operational-escalation.service.ts:218-256` | üçü de (`STAFF`→`opStaffTypes`, `MANAGER`, `FOUNDER`) | ESCALATION |
| 2 | `modules/escalation/case-task-escalation.service.ts:259-270` | manager + founder | ESCALATION (dosya görevi) |
| 3 | `modules/automation/poa-expiry-delivery.service.ts:331-333` | yalnız `escalationManagerLawyerIds` | AUTOMATION |
| 4 | `modules/client-notification/client-notification.service.ts:473-474` | yalnız **sayım** (manager+founder uzunluğu) | CLIENT-NOTIFICATION |
| 5 | `modules/office/office.service.ts:499-516` (`getEscalationSettings`) | üçü de — admin GET | OFFICE |
| 6 | `scripts/g6-backfill-dry-run.ts:58-66` | manager + founder | script |

Ayrıca `modules/office/office-f01-projection.ts:50` — `opStaffTypes`
`OFFICE_S1_FIELDS` allowlist'indedir; **iki lawyer-ID dizisi allowlist'te
DEĞİLDİR** (bkz. §11.4, bilinen tuzak).

**Tasarım açısından kritik:** üç alan **dört ayrı bounded context** tarafından
okunur ve bunların üçü WR01 dışıdır. B02 source-of-truth'u değiştirdiğinde bu
tüketicilerin davranışı etkilenir → `OD-B02-03`.

### 2.4 Admin yazma yolu (exact)

**Controller** — `modules/office/office.controller.ts`:

- `GET /office/escalation-settings` (`:276-279`) — guard **yok**, `tenantId`
  `@CurrentUser`'dan; `officeService.getEscalationSettings(tenantId)`.
- `PUT /office/escalation-settings` (`:281-308`) — `@UseGuards(OfficeF01AuthorizationGuard)`;
  gövde **inline TypeScript tipi** (`:288-302`), 12 opsiyonel alan.

**Guard** — `modules/office-approval/office-f01-authorization.guard.ts`:
`userId`+`tenantId` zorunlu; `officeApproval.isF01ActorAuthorized(userId, tenantId)`
false ise `ForbiddenException('OFFICE_F01_AUTHORIZATION_REQUIRED')`. Dosyanın kendi
şerhi: *"JWT authentication ve tenantId tek başına Office yönetim yetkisi değildir."*

**Service** — `modules/office/office.service.ts:518-546`:

```ts
const office = await this.getOrCreate(tenantId);           // :538
const updated = await this.prisma.office.update({          // :540-543
  where: { id: office.id },
  data,                                                    // ← gövde AYNEN
});
await this.logSettingsChange(tenantId, userId, "ESCALATION", office, data);  // :544
return this.projectForActor(tenantId, updated, actor);     // :545
```

Ölçülen semantik:

- **Replace-all.** Prisma skaler dizi `update`'i **tam ikamedir**; gönderilen
  dizi eskisinin yerine geçer. Merge, delta veya "ekle/çıkar" semantiği **yoktur**.
- **Transaction sınırı:** tek `office.update` çağrısı (implicit tek-ifade
  transaction). `logSettingsChange` **ayrı** bir yazmadır ve `audit.log` hatayı
  içeride yutar (`:84-86` şerhi) — audit yazımının başarısızlığı ayar
  güncellemesini geri **almaz**.
- **Tenant izolasyonu:** `getOrCreate(tenantId)` → `office.findUnique({ where: { tenantId } })`
  (`:115-127`); `where: { id: office.id }` bu yüzden tenant-güvenlidir.
- **Referans doğrulaması YOK.** Gönderilen lawyer id'lerinin var olduğu, aktif
  olduğu veya aynı tenant'a ait olduğu **hiçbir katmanda** kontrol edilmez.
  Geçersiz id sessizce saklanır; okuma tarafında `findMany({ id: { in: [...] } })`
  onu yalnız **sessizce düşürür** (§2.3'teki 1-3 numaralı tüketiciler).
- **Runtime alan doğrulaması YOK.** `main.ts:20-26` global
  `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
  tanımlar; ancak bu uçta `@Body()` bir **class DTO değil**, inline tip
  annotation'dır. Nest, class olmayan metatype için doğrulama/whitelist
  uygulamaz. Sonuç: bu uçta çalışan bir DTO katmanı **yoktur**.

**Frontend (admin paneli)** — `apps/web/src/app/(dashboard)/settings/office/page.tsx`:

- Yükleme (`:259-273`): `GET /office/escalation-settings` → `escalationForm`.
- Kaydetme (`:363-375`): `api.put("/office/escalation-settings", { ...escalationForm, ... })`
  — **tam form replace-all POST**. Fark payload'u yoktur.

### 2.5 Mevcut model neden yalnız current-state sunar

- Satır başına tek değer kümesi vardır; önceki kümenin nereye gittiği kayıtlı değildir.
- Zaman ekseni **hiç yoktur**: ne `validFrom`, ne `validUntil`, ne `revokedAt`.
- `AuditLog` (`logSettingsChange`) **eski/yeni değeri** yazar; bu bir
  **denetim izidir**, sorgulanabilir bir zaman ekseni değildir: `asOf` ile
  parametrik sorgulanamaz, tenant+havuz+üye bazında indekslenmez, ve
  `audit.log`'un hata yutan doğası nedeniyle **eksiksizliği garanti değildir**.
  Bu nedenle "geçmişi AuditLog'dan türetiriz" bir tasarım seçeneği **değildir**
  ve bu doküman onu seçenek olarak sunmaz.

**Sonuç:** effective-dated gereksinim mevcut modelde karşılanamaz; §6'daki
katman **mevcut alanların üstünde** yeni bir taşıyıcı ister.

---

## 3. B01 sözleşmesiyle ilişki

B01 çıktıları okundu (`modules/office-approval/office-work-routing.contract.ts`,
`office-work-routing-taxonomy.ts`):

- Her ikisi de **saf tip/sözleşme**; sıfır runtime, sıfır schema, sıfır servis.
- `OfficeWorkApprovalPolicy` (5 değer) ve `OfficeWorkActionCategory`
  (`FINANCIAL`/`JUDICIAL`/`ADMIN`) kapalı kümelerdir.
- B01 **havuz kavramı tanımlamaz**: `contract.ts` "havuz", "üyelik", "tarih"
  kelimelerini içermez; `KAPSAM DIŞI` bloğu persistence/entity/migration'ı açıkça
  dışlar.

**B02 için bağlayıcı sonuç:** B02'nin havuz taksonomisi (hangi havuzlar vardır)
B01'de **yoktur ve B01 tarafından üretilmemiştir**. B02 bunu kendi sözleşmesinde
tanımlamak zorundadır; bu, B01'i genişletmek değil, B01'in bilerek boş bıraktığı
bir yüzeyi doldurmaktır. Tasarım B01'in iki kalıbını **aynen** miras alır:

1. **Kapalı küme + `as const` + türetilmiş union** (serbest string yasak).
2. **Eksiksizlik kilidi**: `Record<PoolKind, …>` tipiyle, yeni bir havuz türü
   eklenip tablo güncellenmezse **typecheck kırılır** (B01'in
   `Record<ActionCode, …>` deseni).

`actionCode` kategorisi (D-WR-4) ile havuz kimliği **bağımsız eksenlerdir**;
B02 bunları birleştirmez.

---

## 4. Gereksinim semantiği — ayrıştırılmış zaman kavramları

Bu ayrım tasarımın omurgasıdır; karıştırılması C8'in HARD STOP'una yol açan
hatanın ta kendisidir.

| # | Kavram | Bu tasarımdaki karşılığı | Bilinirliği |
|---|---|---|---|
| T1 | **İş kuralının gerçek tarihsel başlangıcı** — "Fatma ne zamandan beri yönetici havuzunda?" | Hiçbir kolona yazılmaz | **BİLİNMİYOR** (§2.2) |
| T2 | **Sistemin bu kuralı ilk kez bildiği an** | `provenance = LEGACY_CUTOVER_IMPORT` etiketi + `recordedAt` | Cutover anı |
| T3 | **Migration/cutover zamanı** | `cutoverAt` — migration içinde **tek kez** hesaplanan deterministik snapshot | Kesin |
| T4 | **`validFrom`** — kaydın effective başlangıcı | Legacy satırlarda `= T3`; yeni admin yazımlarında `= yazma anı` (veya `OD-B02-04` ile future-dated) | Kesin |
| T5 | **Kayıt oluşturma zamanı** | `createdAt` (`@default(now())`) | Kesin |
| T6 | **İptal (revocation) anı** | `revokedAt` — irade beyanıyla sonlandırma | Kesin |
| T7 | **Planlı bitiş (scheduled expiry)** | `validUntil` — baştan planlanmış son | Kesin |
| T8 | **Serialization anı** — mutation'ın gerçekten sıraya girdiği an (`CF-B02-03`) | `effectiveAt` — `Office` satırı `FOR UPDATE` ile kilitlendikten **sonra** üretilir; mutation içindeki **tüm** tarihsel yazmaların tek kaynağıdır (§11.5.9) | Kesin |

**T8 ≠ transaction-start.** `effectiveAt`, transaction'ın *başladığı* an değil,
mutation'ın *serialize olduğu* andır. PostgreSQL'de `now()` transaction başlangıcını
dondurduğu için bu ikisi kilit beklemesi boyunca ayrışır; ayrışma tarihsel sırayı
gerçek sıradan koparır (§11.5.9 kök neden).

**Bağlayıcı kural:** `T3 ≠ T1`. Migration zamanı hiçbir yerde, hiçbir alan
adında, hiçbir rapor satırında "politikanın geçmişte gerçekten başladığı tarih"
olarak sunulamaz. Bu, alan adlandırmasına da yansır: legacy satırların
`validFrom` değeri **`provenance` etiketi olmadan okunamaz** (§7.6).

**T6 ≠ T7 (revocation ≠ expiry).** `PermissionGrant` bu ayrımı kaybeder
(§12); B02 kaybetmez:

- `validUntil` **plan**: "1 Eylül'e kadar yetkili" — süresi dolduğunda üyelik
  normal biçimde biter.
- `revokedAt` **irade**: "artık bu kişi havuzda olmasın" — geçmişe dönük
  gerçekliği değiştirmez, ileriye dönük keser.
- Yalnız `validUntil`'i geçmişe çekerek iptal etmek, "planlı bitti" ile "geri
  alındı"yı ayırt edilemez hâle getirir ve **denetlenemez** bir tarih tahrifidir.

---

## 5. Alternatif schema tasarımları

Değerlendirme eksenleri talimat §6.4'te sabittir. Puanlama yerine her eksende
**ölçülmüş sonuç** yazılmıştır.

### Alternatif 1 — Havuz türü başına ayrı effective-dated tablo

`OfficeOpStaffTypeMembership`, `OfficeEscalationManagerMembership`,
`OfficeEscalationFounderMembership`.

| Eksen | Sonuç |
|---|---|
| Type safety | **En yüksek** — staff-type tablosu `StaffType` enum kolonu, lawyer tabloları `String` + gerçek FK; nullable-pair yok |
| Referential integrity | **En yüksek** — her tabloda tek tip FK |
| Tenant isolation | Eşit (her tabloda `tenantId` + composite FK) |
| Sorgu karmaşıklığı | Havuz başına ayrı sorgu; birleşik "tüm havuzlar" görünümü 3 UNION ister |
| Admin yazma uyumu | 3 ayrı repository/servis yolu; replace-all fark hesabı **üç kez** yazılır |
| Aktif dönem çakışması | Her tabloda ayrı partial unique index (3 kopya) |
| Revocation | Her tabloda ayrı `revokedAt` (3 kopya) |
| Migration riski | 3 tablo + 3 index seti + 3 backfill bloğu; hata yüzeyi 3× |
| B01 uyumu | Nötr |
| **Genişleme** | **Zayıf** — `escalationTeamLeadLawyerIds`, `poaExpiryRecipientLawyerIds`, B03'ün round-robin aday havuzu, B05'in first-review havuzu → her yeni havuz **yeni tablo + yeni migration** |
| B09 emsali | Zayıf (desen tekrarlanabilir değil) |

### Alternatif 2 — Normalize effective-dated üyelik tablosu **(ÖNERİLEN)**

`OfficeWorkPoolMembership`: `poolKind` discriminator + `memberLawyerId` XOR
`memberStaffType`, CHECK ile zorlanmış.

> **R02 EKİ (`CF-B02-01`):** bu alternatif, üyelik tablosunun **yanına**
> üyelikten bağımsız bir knowledge-boundary anchor tablosu (`OfficeWorkPoolEpoch`)
> ekler (§6.6). Aşağıdaki karşılaştırma üyelik katmanına ilişkindir; anchor
> **her alternatifte gereklidir** — boş havuz sorunu Alternatif 1'de de,
> 2'de de aynı biçimde ortaya çıkar. Dolayısıyla anchor bir **seçim ekseni
> değil**, ortak bir ön koşuldur ve alternatifler arası tercihi değiştirmez.

| Eksen | Sonuç |
|---|---|
| Type safety | **Yüksek ama tam değil** — nullable-pair (`memberLawyerId?` / `memberStaffType?`) gerekir. Tip güvenliği **DB CHECK + uygulama katmanındaki discriminated union** ile telafi edilir. Repo emsali birebir mevcut: `ReportingLine.disposition ↔ managerUserId` nullability CHECK'i (`reporting_line_disposition_manager_ck`, migration `20260718120000`) |
| Referential integrity | `memberLawyerId` için tenant-safe composite FK kurulabilir (`Lawyer @@unique([id, tenantId])`, `schema.prisma:2565`). `memberStaffType` enum'dur, FK gerekmez |
| Tenant isolation | **En güçlü** — `tenantId` tek kolon; `Office.tenantId @unique` (`schema.prisma:2345`) olduğu için FK doğrudan `Office(tenantId)`'ye kurulur → tenant ile büro **diverge edemez** |
| Sorgu karmaşıklığı | **En düşük** — tek tablo, `WHERE tenantId=? AND poolKind IN (…) AND <asOf predikatı>`; tüm havuzlar tek sorguda |
| Admin yazma uyumu | Fark hesabı **tek** jenerik fonksiyon; 12 alanlı replace-all payload'u tek yolda ele alınır |
| Aktif dönem çakışması | **Tek** partial unique index tüm havuzları kapatır |
| Revocation | Tek `revokedAt` kolonu, tek resolver kuralı |
| Migration riski | Tek `CREATE TABLE` + tek index seti + tek backfill döngüsü (havuz başına `INSERT … SELECT unnest(...)`) |
| B01 uyumu | **Yüksek** — `Record<PoolKind, …>` eksiksizlik kilidi B01'in `Record<ActionCode, …>` deseninin birebir kardeşi |
| **Genişleme** | **En yüksek** — yeni havuz = yeni enum değeri (+ tip tablosunda bir satır); `escalationTeamLeadLawyerIds`, `poaExpiryRecipientLawyerIds`, B03/B05 havuzları **schema değişikliği olmadan** eklenebilir |
| B09 emsali | **En güçlü** — "düz liste → effective-dated normalize tablo" tek bir tekrarlanabilir desen olarak belgelenir |

### Alternatif 3 — Mevcut listeler + tarihsel shadow model

`Office` dizileri **kalır ve source-of-truth olmaya devam eder**; yanına yalnız
tarihsel gözlem yazan bir shadow tablo eklenir.

| Eksen | Sonuç |
|---|---|
| Type safety | Değişmez (mevcut kadar) |
| Tenant isolation | Eşit |
| Sorgu karmaşıklığı | Düşük — mevcut okuyucular hiç değişmez |
| Admin yazma uyumu | **En yüksek** — mevcut yol hiç dokunulmaz |
| Migration riski | **En düşük** |
| **Gereksinim karşılama** | **KARŞILAMAZ** — shadow tablo yalnız gözlemdir; `asOf` ile sorgulanan bir havuz **kararı** üretmez. Sistem hâlâ current-state ile çalışır, tarih yalnız "raporlanır" |
| C8 bulgusu | **Doğrudan ihlal** — bu, gereksinimi current-state projeksiyonuna indirmenin başka bir adıdır (C8 bulgusu 3) |
| Süreklilik | Kalıcı **iki** source-of-truth doğurur (owner'ın açıkça reddettiği yapı) |

### Alternatif 4 — `PermissionGrant` tablosuna bindirme (repository-native seçenek)

Mevcut, canlı, effective-dated bir tablo olduğu için değerlendirilmiştir.

| Eksen | Sonuç |
|---|---|
| Yeniden kullanım | Yüksek görünür (`validFrom`/`validUntil` hazır) |
| **Bounded-context ihlali** | **Diskalifiye edici** — tablo BANK, CLIENT-INTAKE ve UYAP tarafından okunur (brief §3.7, dört servis). OFFICE havuz üyeliğini `permissionKey` olarak yazmak, bu üç context'in `findMany` sonuç kümelerine **yeni satırlar sokar** |
| Semantik uyuşmazlık | `PermissionGrant` "kişi → izin" der; havuz "iş türü → aday kümesi" der. `memberStaffType` (enum) `subjectUserId`'ye **hiç** oturmaz |
| `revokedAt` | Yok (brief §3.7 VERIFIED) |
| Escalation-guard | Yok (brief §3.7 VERIFIED) |
| Sonuç | **REDDEDİLDİ** |

### Seçim ve gerekçe

**Alternatif 2 seçilmiştir.**

- **Alternatif 3 reddedildi:** gereksinimi karşılamıyor ve C8'in ratifiye
  bulgusuna aykırı. Kalıcı ikili source-of-truth üretiyor.
- **Alternatif 4 reddedildi:** bounded-context ihlali + semantik uyuşmazlık.
- **Alternatif 1 reddedildi (yakın rakip):** tek üstünlüğü nullable-pair'den
  kaçınmak. Bu üstünlük, repo'da zaten yürürlükte olan CHECK-constraint deseniyle
  (`ReportingLine`) telafi edilebilir. Buna karşılık genişleme maliyeti
  kabul edilemez: B02'nin adlandırılmış 3 alanı dışında **en az 2** yapısal
  ikizi (`escalationTeamLeadLawyerIds`, `poaExpiryRecipientLawyerIds`) ve
  gelecekte B03/B05 havuzları vardır. Alternatif 1 bunların her biri için yeni
  tablo + yeni migration ister; Alternatif 2 için bir enum değeri yeter.

**Kabul edilen bedel (açıkça):** Alternatif 2'de `memberLawyerId` ve
`memberStaffType` nullable'dır ve tutarlılık **DB CHECK + uygulama tipi** ile
sağlanır, kolon tipiyle değil. Bu bir zayıflıktır ve §14'te risk olarak
izlenmektedir.

---

## 6. Önerilen schema contract (taslak — Prisma/SQL YAZILMAMIŞTIR)

> Aşağıdaki adlar **çalışma adlarıdır**; hiçbiri rezerve edilmemiştir.
> Implementation GO'sunda kesinleşir.

### 6.1 Havuz taksonomisi

```text
PoolKind (kapalı küme, B01 deseni: as const + türetilmiş union)
  OP_STAFF_TYPE            üye taşıyıcısı: StaffType enum      ← Office.opStaffTypes
  ESCALATION_MANAGER       üye taşıyıcısı: Lawyer id           ← Office.escalationManagerLawyerIds
  ESCALATION_FOUNDER       üye taşıyıcısı: Lawyer id           ← Office.escalationFounderLawyerIds
```

`OD-B02-02` açılırsa `ESCALATION_TEAM_LEAD` ve `POA_EXPIRY_RECIPIENT` **schema
değişikliği olmadan** eklenir.

Her `PoolKind` için `Record<PoolKind, PoolMemberKind>` tipiyle üye taşıyıcı türü
sabitlenir (`LAWYER` | `STAFF_TYPE`) — eksiksizlik kilidi B01'den miras.

### 6.2 Tablo sözleşmesi

| Alan | Tip | Sözleşme |
|---|---|---|
| `id` | `String @id @default(cuid())` | Repo standardı |
| `tenantId` | `String` | **Tenant düzlemi + büro kimliği aynı kolon.** `Office.tenantId @unique` olduğu için FK doğrudan `Office(tenantId)`'ye kurulur → ayrı `officeId` kolonu **YOK**, diverge imkânsız |
| `poolKind` | enum | §6.1 |
| `memberLawyerId` | `String?` | `poolKind` LAWYER taşıyıcılıysa dolu; tenant-safe composite FK → `Lawyer(id, tenantId)` (`schema.prisma:2565`), `onDelete: Restrict` |
| `memberStaffType` | `StaffType?` | `poolKind` STAFF_TYPE taşıyıcılıysa dolu |
| `validFrom` | `DateTime @default(now())` | Effective başlangıç (inclusive) |
| `validUntil` | `DateTime?` | Planlı bitiş (**exclusive**); `null` = açık uçlu |
| `revokedAt` | `DateTime?` | İrade beyanıyla sonlandırma (exclusive); `validUntil`'den **ayrı** |
| `revokedByUserId` | `String?` | İptali yapan aktör |
| `provenance` | enum | `LEGACY_CUTOVER_IMPORT` \| `ADMIN_DECLARED` \| `OWNER_EVIDENCED_HISTORICAL` |
| `createdByUserId` | `String?` | Kaydı oluşturan aktör (`getOrCreate` kaynaklı satırlarda null) |
| `createdAt` / `updatedAt` | `DateTime` | Repo standardı |

**FK davranışları:**

- `tenantId → Office(tenantId)`: `onDelete: Cascade` (büro silinirse üyelikler düşer).
- `memberLawyerId → Lawyer(id, tenantId)`: **`onDelete: Restrict`** —
  `ReportingLine`'ın gerekçesiyle aynı (`schema.prisma:10068-10069`): havuzda
  referansı olan bir avukat silinemez; **sessiz yetki kaybı yerine açık hata**.
  Bu, mevcut çıplak `String[]` davranışına göre **sıkılaştırmadır** ve §8.3'teki
  orphan preflight'ın zorunlu olmasının sebebidir.

### 6.3 Uniqueness ve aktif dönem çakışması

Gereksinim: **aynı havuzda aynı üye için aynı anda birden fazla aktif satır olamaz.**

```sql
-- Partial unique index (RAW SQL — Prisma bunu model düzeyinde ifade EDEMEZ)
CREATE UNIQUE INDEX "office_work_pool_one_open_lawyer_membership"
  ON "OfficeWorkPoolMembership" ("tenantId", "poolKind", "memberLawyerId")
  WHERE "validUntil" IS NULL AND "revokedAt" IS NULL AND "memberLawyerId" IS NOT NULL;

CREATE UNIQUE INDEX "office_work_pool_one_open_stafftype_membership"
  ON "OfficeWorkPoolMembership" ("tenantId", "poolKind", "memberStaffType")
  WHERE "validUntil" IS NULL AND "revokedAt" IS NULL AND "memberStaffType" IS NOT NULL;
```

Repo-native emsal: `reporting_line_one_active_per_actor`
(`20260718120000`, `WHERE "validUntil" IS NULL`) ve
`Client_tenantId_tckn_active_unique` (`20260802190000`, çok koşullu partial
unique). Repository'de **47 dosyada `CREATE UNIQUE INDEX`, 9'unda partial
(`WHERE`) kullanımı** ölçülmüştür → desen repo-native'dir.

> **DÜRÜSTLÜK ŞERHİ — bu index'in kapatmadığı şey.** Partial unique index yalnız
> **açık uçlu** (`validUntil IS NULL AND revokedAt IS NULL`) satırlarda tekilliği
> garanti eder. **Kapalı aralıkların birbiriyle örtüşmesini engellemez**:
> `[Oca-Mar)` ve `[Şub-Nis)` iki kapalı satır olarak yan yana durabilir.
> Tam aralık-örtüşmesi engeli PostgreSQL'de yalnız
> `EXCLUDE USING gist (… WITH =, tstzrange(...) WITH &&)` ile kurulur; bu
> `btree_gist` extension'ı gerektirir ve **repository'de hiçbir migration
> `EXCLUDE USING` / `btree_gist` / `tstzrange` kullanmamaktadır** (tam tarama:
> 0 eşleşme). Yani bu, repo için **yeni bir altyapı bağımlılığıdır**.
>
> **Bu tasarımın seçimi:** GiST exclusion constraint **önerilmez**; kapalı-aralık
> örtüşmesi **uygulama katmanında** (fark hesaplayıcı, §11.2) engellenir ve
> **doğrulama sorgusuyla** (§8.6) izlenir. Bu bir **garanti değil, kontroldür**
> ve bilerek böyle yazılmıştır — uygulanamaz bir pseudo-constraint gerçek
> garanti gibi sunulmamıştır. Owner isterse `btree_gist` ayrı bir sertleştirme
> kalemi olarak açılabilir (§14, R-03).

**Ek DB-level CHECK'ler:**

```sql
-- 1) Üye taşıyıcısı XOR (ReportingLine disposition CHECK emsali)
CHECK (("memberLawyerId" IS NOT NULL) <> ("memberStaffType" IS NOT NULL))

-- 2) poolKind ↔ taşıyıcı tutarlılığı
CHECK (
  ("poolKind" = 'OP_STAFF_TYPE' AND "memberStaffType" IS NOT NULL)
  OR ("poolKind" IN ('ESCALATION_MANAGER','ESCALATION_FOUNDER') AND "memberLawyerId" IS NOT NULL)
)

-- 3) Tarih aralığı — SIFIR UZUNLUKLU ARALIK YASAK
CHECK ("validUntil" IS NULL OR "validFrom" < "validUntil")

-- 4) Revocation aralığı
CHECK ("revokedAt" IS NULL OR "revokedAt" >= "validFrom")

-- 5) revokedAt ↔ revokedByUserId birlikteliği
CHECK (("revokedAt" IS NULL) = ("revokedByUserId" IS NULL))
```

> **`ReportingLine`'dan bilinçli SAPMA.** `reporting_line_valid_date_range_ck`
> (`20260718140000`) `validFrom <= validUntil` der ve şerhi açıkça
> *"eşit (validFrom = validUntil) kayıtlar geçerlidir"* der. B02'de yarı-açık
> aralık `[validFrom, validUntil)` seçildiği için `validFrom = validUntil`
> **hiçbir zaman aktif olmayan** bir satırdır — yani sessiz çöp. Bu yüzden B02
> **strict `<`** kullanır. Bu, emsalin körlemesine kopyalanmadığının kanıtıdır.

### 6.4 Index'ler

```text
@@index([tenantId])                                  -- tenant taraması
@@index([tenantId, poolKind, validFrom])             -- resolver'ın birincil yolu
@@index([tenantId, poolKind, validUntil])            -- açık uçlu/kapanmış ayrımı
@@index([memberLawyerId])                            -- "bu avukat hangi havuzlarda"
+ §6.3'teki iki partial unique index
```

### 6.5 Davranış sözleşmeleri

| Senaryo | Sözleşme |
|---|---|
| **Aynı üyenin farklı dönemlerde yeniden eklenmesi** | Serbest ve **beklenen**. Eski satır kapanır (`validUntil` set), yeni satır açılır. Partial unique index yalnız *açık* satırları bağladığı için engel yoktur |
| **Future-dated kayıt** | Model düzeyinde **desteklenir** (`validFrom > now`). Yazma yüzeyinden erişilebilirliği `OD-B02-04`'e bağlıdır. Partial unique index future-dated açık satırı da bağlar → aynı üye için ikinci bir açık uçlu satır oluşturulamaz (istenen davranış) |
| **Revoke** | `revokedAt = now`, `revokedByUserId` set. `validUntil` **değiştirilmez** (planlanan bitiş kaydı korunur) |
| **Expire** | `validUntil` set. `revokedAt` null kalır |
| **Boş havuz** | İki ayrı hâl vardır ve **karıştırılmaz**: (a) `asOf >= anchor.knownFrom` ve aktif satır yok → `RESOLVED / EMPTY`; (b) `asOf < anchor.knownFrom` (veya anchor yok) → `UNKNOWN`. Ayrım **anchor'dan** gelir, membership varlığından **değil** — bkz. §6.6, §7.6 (`CF-B02-01`) |
| **Silme** | **Fiziksel DELETE yoktur.** Üyelik ancak kapanır veya iptal edilir. Bu, tarihsel modelin varlık sebebidir |

### 6.6 Knowledge-boundary anchor — `OfficeWorkPoolEpoch` (`CF-B02-01`)

> **GEÇERSİZ (R01).** R01 §7.6, `cutoverAt(tenant)` değerini
> *"`provenance = LEGACY_CUTOVER_IMPORT` olan satırların `validFrom` değeri"*
> olarak türetiyordu. **Bu sözleşme geçersizdir.**
>
> **Kök neden (owner tespiti, ratifiye):** bir tenant'ın migration anında üç
> havuzu da boş olabilir — mevcut şemada bu tamamen olağandır, çünkü iki lawyer
> dizisi `DEFAULT ARRAY[]::TEXT[]` ile gelir (`20260615050000`). O tenant için
> **hiçbir membership satırı oluşmaz**, dolayısıyla türetilecek bir `validFrom`
> yoktur ve sistem şu iki durumu **ayıramaz**:
> cutover **öncesi** `UNKNOWN` ile cutover **sonrası gerçek** `EMPTY`.
> Bilgi sınırının veri varlığına bağlanması, boş havuzda sınırı **yok eder**.

**Bağlayıcı kural:** knowledge boundary **membership satırlarının varlığından
bağımsız**, kalıcı ve birinci-sınıf bir kayıttır.

| Alan | Tip | Sözleşme |
|---|---|---|
| `id` | `String @id @default(cuid())` | Repo standardı |
| `tenantId` | `String` | FK → `Office(tenantId)` (`Office.tenantId @unique`, `schema.prisma:2345`), `onDelete: Cascade` |
| `poolKind` | enum | §6.1 ile **aynı** kapalı küme |
| `knownFrom` | `DateTime` | **Bilginin başladığı an.** Bu andan önce sistem o havuz hakkında hiçbir şey iddia etmez |
| `provenance` | enum | `LEGACY_CUTOVER_IMPORT` \| `TENANT_PROVISIONED` \| `OWNER_EVIDENCED_HISTORICAL` |
| `createdAt` / `updatedAt` | `DateTime` | Repo standardı |
| **unique** | `@@unique([tenantId, poolKind])` | Havuz başına **tam olarak bir** anchor |

**Neden ayrı tablo, neden sentinel membership değil:**

- Sentinel (sahte üye) satırı, üyelik tablosunun anlamını kirletir: her okuyucu
  ve her parite sorgusu "bu satır gerçek üye mi" filtresi taşımak zorunda kalır;
  bir yerde unutulması **hayalet üye** üretir (bildirim gönderilen sahte alıcı).
  Talimat da sentinel'i açıkça yasaklamıştır ve bu tasarım kullanmaz.
- `Office`'e kolon eklemek (`opStaffTypesKnownFrom` gibi) havuz başına ayrı kolon
  ister → `OD-B02-02`'nin gelecekte açılabilir bıraktığı iki havuz için **yeni
  migration** gerekir; anchor tablosu yeni satırla çözer.
- Ayrı tablo `provenance`'ı havuz bazında taşır; `OWNER_EVIDENCED_HISTORICAL`
  bir gün geldiğinde (`OD-B02-01`'in açık bıraktığı yol) sınır **havuz bazında**
  geriye çekilebilir.

**Anchor ile membership arasındaki ilişki (bağlayıcı):**

```text
knownFrom  <= her LEGACY_CUTOVER_IMPORT membership'in validFrom değeri
```

Migration bu ikisini **aynı snapshot değişkeninden** yazar (§8.4 ADIM 4), yani
eşit olurlar. Eşitlik bir **çıktıdır**, bir türetme kuralı **değildir**:
resolver `knownFrom`'u okur, membership'lerin minimumunu **hesaplamaz** (§7.6,
madde 7).

### 6.7 Anchor'ın yaşam döngüsü ve tenant provisioning

`OfficeService.getOrCreate` (`office.service.ts:115-127`, create `:136`)
`Office` satırını **tembel** yaratır: bir tenant'ın Office kaydı ilk okuma/yazma
anında oluşabilir. Dolayısıyla anchor **yalnız migration'da** üretilemez.

**Sözleşme:**

1. `getOrCreate`, `Office` satırını yarattığı **aynı `prisma.$transaction`
   içinde** o tenant için `PoolKind` kümesinin **tamamına** anchor satırı yazar.
   `Office` yaratımı ile anchor yaratımı **atomiktir**; biri olup diğeri
   olmayamaz.
2. Yeni anchor'ların `knownFrom` değeri **office yaratım anıdır** ve
   `provenance = TENANT_PROVISIONED` olur. Bu doğrudur ve bir iddia icat etmez:
   büro o an doğmuştur, öncesi hakkında bilgi **gerçekten** yoktur.
3. Anchor yazımı **idempotenttir**: `@@unique([tenantId, poolKind])` üzerinde
   `ON CONFLICT DO NOTHING`. `getOrCreate`'in eşzamanlı iki çağrısında
   `Office.tenantId @unique` zaten birini elerken, anchor tarafı da sessizce
   tekilleşir.
4. **Anchor yoksa `UNKNOWN`.** Resolver eksik anchor'ı asla "şimdi yarat" veya
   "boş kabul et" diye yorumlamaz; fail-closed davranır ve structured hata
   loglar. Gerekçe: anchor'ın yokluğu bir **bilgi yokluğudur**; onu `EMPTY`'ye
   çevirmek `CF-B02-01`'in düzelttiği hatanın ta kendisidir.
5. Bu davranışın tüketici etkisi **regresyon değildir**: bugün boş dizi →
   alıcı yok → `SKIPPED` (`operational-escalation.service.ts:275-278`). Yeni
   modelde `EMPTY` de `UNKNOWN` de alıcı üretmez → aynı `SKIPPED`; fark yalnız
   **log ayrımıdır**.

---

## 7. Effective-date resolver sözleşmesi

Resolver **saf ve IO-suz predikat + tek repository sorgusu** olarak tasarlanır
(B01'in ve `client-financial-disclosure-approval-eligibility.ts`'in "saf, tek
kaynak" deseni).

### 7.1 Temel predikat (deterministik)

```text
aktif(satır, asOf) ⟺
      satır.validFrom  <= asOf                                  (INCLUSIVE)
  AND (satır.validUntil IS NULL OR asOf <  satır.validUntil)     (EXCLUSIVE)
  AND (satır.revokedAt  IS NULL OR asOf <  satır.revokedAt)      (EXCLUSIVE)
  AND satır.tenantId = <çağıranın tenantId'si>                   (ZORUNLU)
```

Yarı-açık aralık `[validFrom, validUntil)` seçilmiştir: ardışık dönemler
sınırda **ne boşluk ne örtüşme** üretir (`[A,B)` + `[B,C)`).

`asOf = now` özel bir hâl değildir; current-state bu sözleşmenin bir çağrısıdır.

### 7.2 `revokedAt` etkisi

Etkin bitiş = `min(validUntil, revokedAt)` (null'lar sonsuz sayılır). `revokedAt`
geçmişteki aktifliği **değiştirmez**: `asOf < revokedAt` sorgusu üyeyi hâlâ
havuzda gösterir. Bu, `PermissionGrant`'ın `validUntil`-geri-çekme yönteminin
**kaybettiği** özelliktir (§12).

### 7.3 Timezone standardı

- Kolonlar Prisma varsayılanıyla **`TIMESTAMP(3)`** (timezone'suz) olur —
  `ReportingLine` foundation migration'ında (`20260716205716`) birebir bu tip
  kullanılmıştır; repository'de `timestamptz` yalnız baseline'da geçer.
- Prisma `DateTime` değerlerini **UTC instant** olarak yazar/okur. Bu nedenle
  sözleşme: **tüm karşılaştırmalar UTC instant üzerindedir**.
- `asOf` parametresi **daima bir instant'tır**, asla yerel bir tarih (`YYYY-MM-DD`)
  değildir. Yerel tarihten instant'a çevirme (Europe/Istanbul gün sınırı)
  **B02'nin kapsamı dışındadır**; bir tüketici gün-granülerliği isterse dönüşümü
  kendi katmanında yapar ve bunu açıkça belgeler.

**Yazma tarafındaki zaman kaynağı (`CF-B02-03`):** resolver'ın okuduğu tarihsel
eksen, yazma tarafında **serialization anıyla** (`effectiveAt`) üretilir —
transaction-start `now()` ile değil (§11.5.9). Resolver'ın predikatı bu ayrımdan
**etkilenmez** (aynı UTC instant ekseni), fakat predikatın verdiği cevabın
**doğru sıralı** olması yazma tarafının bu sözleşmeye uymasına bağlıdır:

```text
Sıra invariant'ı (§11.5.9 madde 8):
  önce serialize edilen mutation'ın effectiveAt'i, sonra serialize edilenin
  effectiveAt'inden BÜYÜK OLAMAZ.

İhlal edilirse resolver "kim ne zaman havuzdaydı" sorusuna, kendi mantığı doğru
olmasına rağmen, YANLIŞ cevap verir — çünkü veri yanlış sıralanmıştır.
```

### 7.4 Aynı anda birden fazla geçerli satır

- **Aynı (tenant, poolKind, üye)** için bu durum §6.3 partial unique index'i
  nedeniyle **açık uçlu satırlarda imkânsızdır**; kapalı aralık örtüşmesinde
  teorik olarak mümkündür (§6.3 dürüstlük şerhi).
- **Davranış:** resolver **küme semantiği** uygular — üye kimliğine göre
  tekilleştirir, **hata fırlatmaz**, ve yapısal ihlali `logger.warn` ile
  structured olarak bildirir.
- **Gerekçe (açık):** havuz bir *kümedir*; aynı üyenin iki satırdan gelmesi
  sonucu değiştirmez. Buna karşılık throw etmek, bildirim/eskalasyon motorlarını
  (§2.3'teki 1-3) veri anomalisi yüzünden **durdurur** — imkânsıza yakın bir
  durumu bir kesintiye çevirmek doğru takas değildir. Bu bilinçli bir
  "degrade + gözlemle" kararıdır, örtük bir ihmal değil.
- **Farklı üyelerin** aynı anda aktif olması normaldir (havuz çok üyelidir).

### 7.5 Tenant filtresi

`tenantId` her sorguda **zorunlu parametredir**; opsiyonel imza sunulmaz.
Composite FK (`Lawyer(id, tenantId)`) sayesinde cross-tenant üye DB düzeyinde
imkânsızdır — koruma yalnız servis katmanında kalmaz.

### 7.6 Boş sonuç, `UNKNOWN` ve knowledge boundary (`CF-B02-01` ile düzeltildi)

> **GEÇERSİZ (R01).** *"`cutoverAt(tenant)` = `LEGACY_CUTOVER_IMPORT` satırlarının
> `validFrom` değeri; ayrı bir konfigürasyon kolonu gerekmez."* — boş havuzda
> hiçbir satır olmadığı için bu türetme **tanımsızdır** (§6.6).

**Yürürlükteki sözleşme — bilgi sınırı anchor'dan okunur:**

```text
resolve(poolKind, asOf, tenantId) → { status, members }

anchor := OfficeWorkPoolEpoch(tenantId, poolKind)          -- §6.6

anchor YOK                        → UNKNOWN  + structured error log (fail-closed)
asOf <  anchor.knownFrom          → UNKNOWN  + members = []
asOf >= anchor.knownFrom          → RESOLVED + members = {aktif(satır, asOf)}
                                    members boş ise  → RESOLVED / EMPTY
```

Üç durum **birbirinden ayrıdır** ve hiçbiri diğerine indirgenmez:

| Durum | Anlamı | Bugünkü modelde karşılığı |
|---|---|---|
| `UNKNOWN` | Sistem o an hakkında bilgi taşımıyor | **YOK** — bugün ifade edilemez |
| `RESOLVED / EMPTY` | Sistem biliyor: havuz o an **gerçekten** boştu | Boş dizi (ama "bilmiyorum"dan ayırt edilemez) |
| `RESOLVED / members` | Sistem biliyor: bu üyeler vardı | Dolu dizi |

**Boş havuzlu tenant senaryosu (`CF-B02-01`'in kapattığı boşluk):**

```text
Tenant T: migration anında üç havuz da boş.
  membership satırı  : 0 adet
  anchor satırı      : 3 adet (poolKind başına bir), knownFrom = cutoverAt

resolve(ESCALATION_MANAGER, asOf = cutover - 1 gün) → UNKNOWN      ✔ doğru
resolve(ESCALATION_MANAGER, asOf = cutover + 1 gün) → RESOLVED/EMPTY ✔ doğru

R01 sözleşmesinde ikisi de ayırt edilemezdi — türetilecek validFrom yoktu.
```

**Madde 7 (bağlayıcı):** membership satırlarının `min(validFrom)` değeri
knowledge boundary olarak **kullanılmaz** — ne resolver'da, ne raporlamada, ne
de doğrulama sorgularında. Tek kaynak `anchor.knownFrom`'dur.

`OD-B02-01` **A olarak ratifiye edildiği** için bugün tüm anchor'lar
`LEGACY_CUTOVER_IMPORT` (mevcut tenant'lar) veya `TENANT_PROVISIONED` (sonradan
doğan tenant'lar) provenance'ı taşır. Owner ileride kanıtlanmış tarih sağlarsa
ilgili anchor `OWNER_EVIDENCED_HISTORICAL` provenance'ı ile geriye çekilir —
bu, **schema değişikliği gerektirmeyen** bir yol olarak açık bırakılmıştır.

### 7.7 Silinmiş / pasif kullanıcı davranışı

**Mevcut davranış korunur, değiştirilmez.** Bugün üç tüketici de
`isActive: true` filtresi uygular (`operational-escalation.service.ts:234,246`;
`case-task-escalation.service.ts:260,270`). Yani:

- Havuz üyeliği (**effective-dated**) ile kişinin aktifliği (**current-state**)
  **iki ayrı eksendir**. Resolver üyeliği döndürür; alıcı çözümü `isActive`
  filtresini **tüketici katmanında** uygulamaya devam eder.
- Pasifleşen bir avukat için üyelik **otomatik kapanmaz** — bu bilinçlidir:
  pasiflik geri alınabilir, üyelik kaydı ise bir irade beyanıdır.
- `onDelete: Restrict` (§6.2) nedeniyle üyeliği olan bir `Lawyer` **silinemez**;
  pasifleştirilebilir.

### 7.8 Staff-type havuzu ile lawyer-ID havuzları arasındaki tip farkı

Bu fark resolver imzasına **taşınır**, gizlenmez:

```text
resolveLawyerPool(poolKind: LAWYER taşıyıcılı, asOf, tenantId)     → string[]  (Lawyer id)
resolveStaffTypePool(poolKind: STAFF_TYPE taşıyıcılı, asOf, tenantId) → StaffType[]
```

Tek jenerik `resolve(): string[]` **kullanılmaz**: `StaffType` bir enum
değeridir, bir kimlik değildir; ikisini tek dizi tipinde birleştirmek
`operational-escalation.service.ts:221` ile `:234` arasındaki gerçek anlam
farkını (tür filtresi vs. kimlik filtresi) yok eder.

---

## 8. Backfill ve migration stratejisi

### 8.1 Değişmez ilke

> Mevcut düz listelerin geçmiş başlangıç tarihi bilinmemektedir (§2.2, VERIFIED).
> **Hiçbir backfill tarihsel gerçeklik üretemez.** Backfill yalnız
> "sistem bu üyeliği cutover anından itibaren effective kabul eder" diyebilir.

İki kavram **hiçbir yerde** karıştırılmaz:

| Meşru | Gayrimeşru |
|---|---|
| "Cutover anından itibaren effective" (T3'ten ileriye doğru bir sistem beyanı) | "Cutover öncesinde de geçerliydi" (T1 hakkında kanıtsız bir iddia) |

### 8.2 Seçenekler

#### Seçenek A — Cutover-only effective **(OWNER APPROVED — `OD-B02-01`)**

Tüm mevcut üyeler `validFrom = cutoverAt`, `provenance = LEGACY_CUTOVER_IMPORT`;
**her tenant × havuz için** `knownFrom = cutoverAt` anchor'ı yazılır — havuz boş
olsa bile (`CF-B02-01`).

| Eksen | Sonuç |
|---|---|
| Veri doğruluğu | **En yüksek** — hiçbir iddia uydurulmaz |
| Resolver davranışı | `asOf < cutoverAt` → `UNKNOWN` (§7.6) |
| Audit görünürlüğü | `provenance` etiketi her satırda; "bu tarih bir ithal tarihidir" makine-okur |
| Uygulama karmaşıklığı | **En düşük** — tek snapshot, tek INSERT bloğu |
| Geri dönüş | **En kolay** — legacy diziler dokunulmadan durur; tablo düşürülür |
| Admin uyumluluğu | Tam — mevcut endpoint semantiği değişmez (§11) |
| Geçmiş sorgular | `UNKNOWN` döner. **Zayıflık budur ve gizlenmez**: cutover öncesi hiçbir soru cevaplanamaz |
| İleri uyum | **B'yi engellemez** — owner sonradan kanıt sunarsa ilgili satırlar `OWNER_EVIDENCED_HISTORICAL` provenance'ıyla düzeltilebilir |

#### Seçenek B — Owner-kanıtlı tarihlerle kısmi backfill

Owner'ın kayıt/kanıt temelinde tarih sağladığı üyeler o tarihle; kalanlar cutover'dan.

| Eksen | Sonuç |
|---|---|
| Veri doğruluğu | **Kanıt kalitesine bağlı** — kanıt zayıfsa A'dan **kötü**dür (uydurma tarihi meşrulaştırır) |
| Resolver davranışı | Karışık eşik: satır bazında `UNKNOWN`/`RESOLVED` |
| Audit görünürlüğü | `OWNER_EVIDENCED_HISTORICAL` + kanıt referansı gerekir (yeni alan veya governance kaydı) |
| Uygulama karmaşıklığı | **En yüksek** — migration'a owner verisi girer; deterministik olmayan girdi |
| Geri dönüş | Zor — owner verisi migration'a gömülüdür |
| Admin uyumluluğu | Tam |
| Geçmiş sorgular | Kanıtlı üyeler için gerçek cevap, diğerleri `UNKNOWN` |
| **Ön koşul** | **Bu oturumda mevcut DEĞİL** — owner tarafından sağlanmış hiçbir tarih kaydı repository'de yoktur |

#### Seçenek C — Unknown-origin legacy provenance modeli

Legacy satırlar ayrı bir provenance semantiğiyle taşınır; `validFrom` "bilinmiyor"
anlamı taşır.

| Eksen | Sonuç |
|---|---|
| Veri doğruluğu | Yüksek |
| Resolver davranışı | A ile **aynı** (`UNKNOWN` eşiği) |
| Audit görünürlüğü | Yüksek |
| Uygulama karmaşıklığı | A'dan yüksek: `validFrom`'u nullable yapmak veya ayrı bir "bilinmiyor" işaretçisi tutmak gerekir; nullable `validFrom` **tüm resolver predikatını** kirletir (`validFrom IS NULL OR validFrom <= asOf`) ve partial index'leri karmaşıklaştırır |
| Geri dönüş | Orta |
| Geçmiş sorgular | `UNKNOWN` |
| Değerlendirme | C'nin **tek gerçek katkısı provenance etiketidir**; bu katkı **A'nın içine alınmıştır** (§6.2 `provenance` kolonu). C'yi ayrı seçmek, nullable `validFrom` maliyetini karşılıksız ödemek olur |

### 8.3 Seçim durumu

```text
ÖNERİ         : Seçenek A (provenance etiketiyle birlikte)
KİLİTLENDİ Mİ : EVET — OD-B02-01 APPROVED: A  (owner, PAGE-O0, 2026-08-17)
```

R01 bu satırda `HAYIR — owner kararıdır` diyordu. Owner kararı **verilmiştir**
(§15.1); A artık bir öneri değil, tasarımın **bağlayıcı** backfill politikasıdır.
B ve C karşılaştırma amacıyla korunmuştur; owner ileride kanıtlanmış tarih
sağlarsa B'ye geçiş yolu `OWNER_EVIDENCED_HISTORICAL` provenance'ı ile
**schema değişikliği gerektirmeden** açıktır.

### 8.4 Migration planı (dosya ÜRETİLMEDİ)

Repo-native desen: `20260718120000_office_reporting_line_disposition` ve
`20260802190000_client_identity_active_partial_unique`.

```text
ADIM 0  TEK TRANSACTION
        Tüm migration tek transaction'da koşar. Preflight anomali bulursa
        RAISE EXCEPTION → tam rollback. "Kısmi durum YOK, sessiz onarım YOK"
        (ReportingLine migration'larının literal ilkesi).

ADIM 1  PREFLIGHT / VALIDATION (constraint'lerden ÖNCE)
        a) DUPLICATE : aynı dizide tekrarlanan lawyer id / staff type
              SELECT "tenantId", unnest("escalationManagerLawyerIds") ...
              GROUP BY 1,2 HAVING COUNT(*) > 1
        b) ORPHAN    : Lawyer tablosunda karşılığı OLMAYAN id
        c) CROSS-TENANT : başka tenant'a ait Lawyer id
        d) INVALID   : boş string / whitespace / cuid olmayan değer
        e) ENUM      : opStaffTypes içinde geçersiz değer (DB enum'u zaten
                       engeller; tamlık için sayılır)
        Herhangi biri > 0 → RAISE EXCEPTION exact sayılarla.
        SESSİZ DÜŞÜRME / NORMALIZE / MERGE / DELETE YASAKTIR.

        > Bu adım ZORUNLUDUR çünkü mevcut çıplak String[] alanları bugüne kadar
        > FK'siz çalıştı; §6.2'deki FK bu tolere edilen çöpü fail-closed hâle
        > getirir. Anomali bulunursa çözüm owner'lı pre-clean kapısına aittir;
        > bu dosyaya politika GÖMÜLMEZ (Client partial-unique migration'ının
        > birebir ilkesi).

ADIM 2  CREATE TYPE  (PoolKind, MembershipProvenance, EpochProvenance)
ADIM 3  CREATE TABLE (§6.2 membership  +  §6.6 OfficeWorkPoolEpoch anchor)
ADIM 4  SNAPSHOT     cutoverAt := <migration içinde TEK KEZ hesaplanan
                     deterministik timestamp; her INSERT'te now() ÇAĞRILMAZ>

ADIM 5  ANCHOR SEED  ← CF-B02-01 (BACKFILL'DEN ÖNCE)
                     INSERT INTO "OfficeWorkPoolEpoch" (tenantId, poolKind,
                       knownFrom, provenance)
                     SELECT o."tenantId", k.kind, <cutoverAt>, 'LEGACY_CUTOVER_IMPORT'
                     FROM "Office" o
                     CROSS JOIN (VALUES ('OP_STAFF_TYPE'),('ESCALATION_MANAGER'),
                                        ('ESCALATION_FOUNDER')) AS k(kind);

                     → HER mevcut Office için 3 anchor. Havuzun BOŞ olması
                       anchor'ı ETKİLEMEZ. Beklenen satır sayısı:
                       count("Office") × 3  (ADIM 8 / V8 bunu doğrular)

ADIM 6  BACKFILL     havuz başına INSERT ... SELECT unnest(...)
                     validFrom = cutoverAt, validUntil = NULL, revokedAt = NULL,
                     provenance = 'LEGACY_CUTOVER_IMPORT'
                     Sıra: OP_STAFF_TYPE → ESCALATION_MANAGER → ESCALATION_FOUNDER
                     (sıra semantik taşımaz; determinizm için sabittir)
                     Boş dizide unnest 0 satır üretir → membership YOK, anchor VAR.

ADIM 7  CONSTRAINTS  §6.3 CHECK'leri  (veri girdikten SONRA — böylece backfill'in
                     kendisi de constraint tarafından doğrulanır)
ADIM 8  INDEXES      §6.3 partial unique + §6.4 index'ler + anchor unique
                     (tenantId, poolKind)
ADIM 9  VERIFICATION §8.6 sorguları; mismatch → RAISE EXCEPTION → rollback
```

**ADIM 5'in ADIM 6'dan önce olması bağlayıcıdır:** anchor'ın varlığı üyeliğe
bağlı olmadığı için sıra tersine çevrilirse boş havuzlu tenant'lar sessizce
anchor'sız kalabilir — `CF-B02-01`'in kapattığı boşluk yeniden açılır.

**Neden `now()` her satırda çağrılmaz:** aynı transaction içinde `now()` sabit
kalsa da, tek bir değişkene alınması niyeti açık kılar ve **anchor'ların
`knownFrom` değeri ile membership'lerin `validFrom` değerinin aynı kaynaktan**
yazılmasını garanti eder (§6.6 sınır ilişkisi, V10). Bu bir **eşitlik
çıktısıdır**; resolver hâlâ yalnız `anchor.knownFrom`'u okur, membership'lerden
**hiçbir eşik türetmez** (§7.6 madde 7).

### 8.5 Idempotency

- `CREATE TABLE` / `CREATE TYPE` doğası gereği tek seferliktir; ikinci koşum
  Prisma migration ledger'ı tarafından zaten engellenir.
- Backfill `INSERT`'i ayrıca **fail-safe**tir: §6.3'teki partial unique index
  ADIM 7'de kurulduğu için, aynı migration'ın elle yeniden koşturulması
  ikinci kez `23505` verir → sessiz çift-üyelik oluşamaz.
- Migration **hiçbir satırı UPDATE veya DELETE etmez** → legacy veri kaybı
  olasılığı **sıfırdır**.

### 8.6 Doğrulama sorguları (ADIM 8)

```text
V1  SAYIM PARİTESİ
    her tenant × havuz için:  count(yeni tablo, açık satır) == cardinality(legacy dizi)

V2  KÜME PARİTESİ
    her tenant × havuz için:  set(yeni tablo üyeleri) == set(legacy dizi)  (sıra önemsiz)

V3  TEKİLLİK
    açık uçlu satırlarda (tenantId, poolKind, üye) tekil  → 0 ihlal

V4  ARALIK TUTARLILIĞI
    validUntil IS NOT NULL AND validFrom >= validUntil     → 0 satır
    revokedAt IS NOT NULL AND revokedAt < validFrom        → 0 satır

V5  ÖRTÜŞME (kapalı aralıklar — index'in kapatmadığı yüzey, §6.3)
    aynı (tenantId, poolKind, üye) için aralık örtüşmesi   → 0 çift

V6  TENANT BÜTÜNLÜĞÜ
    memberLawyerId'nin Lawyer.tenantId'si satırın tenantId'sine eşit → 0 ihlal
    (FK zaten garanti eder; V6 FK'nin kurulduğunun kanıtıdır)

V7  PROVENANCE
    backfill satırlarının tamamı LEGACY_CUTOVER_IMPORT ve tek bir validFrom
    değerine sahip → distinct(validFrom) == 1 per tenant

V8  ANCHOR EKSİKSİZLİĞİ                                    ← CF-B02-01
    count("OfficeWorkPoolEpoch") == count("Office") × 3
    ve her (tenantId, poolKind) için TAM OLARAK 1 anchor
    → anchor'ı olmayan tenant/havuz: 0

V9  BOŞ HAVUZ PARİTESİ                                     ← CF-B02-01
    Legacy dizisi BOŞ olan her (tenant, havuz) için:
      membership satırı == 0   (doğru)
      anchor satırı     == 1   (ZORUNLU)

V10 ANCHOR ↔ MEMBERSHIP SINIRI                             ← CF-B02-01
    her LEGACY_CUTOVER_IMPORT membership için:
      anchor.knownFrom <= membership.validFrom  → 0 ihlal
```

> **V9 neden ayrı bir kalem:** parite sorguları doğaları gereği "iki taraf da
> boş" durumunda **sessizce geçer**. Boş havuzlu bir tenant'ta anchor hiç
> yazılmasaydı V1–V7'nin **hiçbiri** bunu yakalamazdı — `CF-B02-01`'in tarif
> ettiği hata tam olarak bu kör noktada yaşıyordu. V8+V9 kör noktayı kapatır.

Herhangi biri başarısızsa **RAISE EXCEPTION → tam rollback**.

### 8.7 Rollback / forward-fix yaklaşımı

- **Migration içi hata:** tek transaction → otomatik tam rollback. Repo'nun
  yerleşik yaklaşımı budur.
- **Merge sonrası hata (uygulanmış migration):** repo'da `DOWN` migration deseni
  **yoktur** → **forward-fix**. B02 için forward-fix ucuzdur, çünkü legacy
  diziler **hâlâ source-of-truth'tur** (§9 Aşama 1-5): yeni tablo düşürülür veya
  boşaltılır, sistem hiç kesintiye uğramaz.
- **Cutover sonrası hata (Aşama 6+):** forward-fix penceresi daralır; bu yüzden
  cutover'ın **kendi** gate'i vardır (§9).

### 8.8 Legacy alanların kaldırılması

Migration bu adımı **içermez**. Kaldırma, ayrı bir migration ve ayrı bir owner
gate'idir (§9 Aşama 7). Ön koşulları:

1. Cutover tamamlanmış ve `DRIFT = 0` gözlem penceresi kapanmış (§9 Aşama 5).
2. §2.3'teki **altı** okuma yüzeyinin tamamı resolver'a taşınmış
   (`OD-B02-03` kapsamı).
3. `office-f01-projection.ts` allowlist'i güncellenmiş (§11.4).
4. Admin paneli yeni sözleşmeyi tüketiyor (B08).

---

## 9. Source-of-truth kararı ve geçiş dönemi

### 9.1 Karar

| Soru | Cevap |
|---|---|
| **Kalıcı read source-of-truth** | Yeni effective-dated tablo (cutover'dan sonra) |
| **Kalıcı write source-of-truth** | Yeni effective-dated tablo (cutover'dan sonra) |
| **Legacy alanların rolü** | **Yalnız transition compatibility projection** — cutover'a kadar authoritative, cutover'dan sonra türetilmiş; Aşama 7'de düşer |
| **Süresiz dual-write** | **REDDEDİLDİ** — mimari değil, geçiş aracıdır |

Bu yön repository gerçekliğiyle test edilmiştir ve körü körüne kabul edilmemiştir:
`Office`'in tek satırlık, tenant-unique yapısı (§2.1) legacy alanları ucuz bir
projeksiyon hedefi kılar; dört bounded context'in okuması (§2.3) ise aşamalı
geçişi **zorunlu** kılar — tek seferlik "big-bang" cutover WR01 dışı üç modülü
aynı anda riske atar.

### 9.2 Yedi aşama

```text
AŞAMA 1  SCHEMA INTRODUCTION
         Tablo + constraint + index. Hiçbir okuyucu yok. Davranış değişikliği SIFIR.
         SOT: legacy.  Geri dönüş: tabloyu düşür.

AŞAMA 2  VALIDATED BACKFILL
         §8.4 ADIM 1-8. SOT: legacy.  Yeni tablo dolu ama okunmuyor.

AŞAMA 3  READ-PATH INTRODUCTION
         Resolver (§7) yazılır + testleri. Tüketiciler HENÜZ çağırmaz.
         Yalnız parity harness resolver'ı legacy ile karşılaştırır.
         SOT: legacy.

AŞAMA 4  ADMIN WRITE-PATH COMPATIBILITY (dual-write)
         updateEscalationSettings TEK prisma.$transaction içinde:
           (a) legacy dizileri günceller  [authoritative]
           (b) fark hesabından effective-dated mutasyonu uygular  [mirror]
         SOT: legacy.  Atomiklik: tek ACID transaction (aynı DB) → partial
         COMMIT İMKÂNSIZ. Retry/idempotency ise §9.4a'ya tabidir
         (sınıflandırılmış + bounded); "gerekmez" DENMEZ.

AŞAMA 5  DRIFT / MISMATCH OBSERVATION
         Sürekli parite kontrolü (§8.6 V2, current-state projeksiyonu üzerinde).
         Ölçülebilir çıkış koşulu: gözlem penceresi boyunca DRIFT = 0.
         SOT: legacy.

AŞAMA 6  CUTOVER  ← TEK YÖN DEĞİŞTİRME NOKTASI
         Okuyucular resolver'a geçer; yazma yönü döner:
           (a) effective-dated mutasyon  [authoritative]
           (b) legacy dizi projeksiyonu  [türetilmiş, aynı transaction]
         SOT: yeni tablo.

AŞAMA 7  LEGACY FIELD RETIREMENT
         (b) projeksiyonu kaldırılır, kolonlar düşürülür (§8.8 ön koşullarıyla).
         SOT: yeni tablo. Dual-write BİTER.
```

### 9.3 Feature flag gerekli mi?

**Aşama 3-4 için HAYIR. Aşama 6 için EVET (kısa ömürlü).**

- Aşama 1-2 davranış değiştirmez → flag anlamsız.
- Aşama 4 dual-write'ı **her zaman açık** olmalıdır; flag'li dual-write, flag
  kapalıyken drift üretir — yani flag'in kendisi bir risk kaynağı olur.
- **Aşama 6 okuma cutover'ı** WR01 dışı üç bounded context'in davranışını
  değiştirir (§2.3). Geri dönüş yolu kod deploy'una bağlı kalmamalıdır →
  **okuma kaynağı için tek bir flag** gerekçelidir. Flag, Aşama 7'de
  **kaldırılır**; kalıcı bir konfigürasyon değildir.

### 9.4 Dual-write sözleşmesi (Aşama 4 ve 6)

| Soru | Cevap |
|---|---|
| Hangi taraf authoritative | Aşama 4'te **legacy**; Aşama 6'da **yeni tablo**. Aynı anda ikisi asla değil |
| Transaction atomikliği | **Tek `prisma.$transaction`** — iki yazma aynı Postgres transaction'ında |
| Partial failure | **Partial commit** yapısal olarak imkânsız; ikisi birlikte commit veya birlikte rollback |
| Retry / idempotency | **Sınıflandırılmış ve bounded** — bkz. §9.4a. "Tek transaction olduğu için gerekmez" **denemez** |
| Drift tespiti | §8.6 V2 pariteliği + Aşama 5 gözlem penceresi |
| Sonlandırma koşulu | Aşama 7 tamamlandığında dual-write **kodu silinir** |

**Not (dürüstlük):** dual-write'ın tek gerçek drift kaynağı **out-of-band
yazmalardır** (elle SQL, seed script, başka bir servis). §2.3 taraması bugün
`Office` dizilerine yazan **tek** yolun `updateEscalationSettings` olduğunu
gösterir (`prisma.office.update` çağrıları içinde bu alanları set eden başka
yüzey yoktur) — bu, dual-write'ın kapsanabilir olduğunun ölçülmüş dayanağıdır.

### 9.4a Retry ve idempotency sözleşmesi (R03 düzeltmesi)

> **GEÇERSİZ (R01/R02).** *"Retry / idempotency: **Gerekmez** — dağıtık yazma
> yok."* Bu mutlak ifade kaldırılmıştır.

Atomicity ile dayanıklılık aynı şey değildir:

1. **Atomicity partial commit'i engeller.** Aynı transaction'daki iki yazma
   birlikte commit olur veya birlikte geri alınır — bu doğrudur ve korunur.
2. **Atomicity tek başına** deadlock, lock timeout, statement/idle timeout,
   serialization failure veya **belirsiz bağlantı sonucunu** (istemci commit
   cevabını alamadan bağlantının kopması) ortadan **kaldırmaz**. Bunların hepsi
   tek bir transaction'da da gerçekleşebilir.
3. **Target-state PUT semantik olarak yeniden uygulanabilirdir** — aynı hedef
   küme ikinci kez uygulandığında fark hesabı boş çıkar ve yeni satır üretilmez
   (§11.2 "değişmeyene dokunma" kuralı). Bu, yeniden denemeyi **güvenli** kılan
   yapısal özelliktir; ancak tek başına bir retry politikası **değildir**.
4. **Retry yalnız sınıflandırılmış ve bounded olabilir:**
   - retry'lenebilir hata kümesi **gerçek repository hata kodlarına** göre
     belirlenir (Prisma `P2034`, PostgreSQL `40001`/`40P01`, lock timeout
     `55P03`; emsal `bundle-seal.errors.ts:122` ve
     `password-reset.service.ts:138-142`);
   - **ilgisiz** bir hata (ör. `23514` CHECK ihlali, `23503` FK ihlali, doğrulama
     hatası) **asla** retry tetiklemez — bunlar veri/politika hatalarıdır ve
     retry ile düzelmez;
   - deneme sayısı **sabit bir üst sınırla** bağlanır (emsal:
     `REQUEST_TRANSACTION_MAX_ATTEMPTS`, `password-reset.service.ts`);
   - **kör/unbounded retry yasaktır.**
5. **Belirsiz sonuç için okuma-doğrulama:** bağlantı kopması gibi sonucu
   bilinmeyen durumlarda implementasyon körlemesine yeniden yazmaz; hedef
   durumu **okur** ve ancak farklıysa yeniden uygular. Target-state semantiği
   (madde 3) bunu güvenli kılar.
6. Bu kararlar **implementation aşamasında gerçek repository hata kodlarına
   göre** verilir; bu doküman kod yazmadan hata kodu listesi **dondurmaz** —
   yukarıdakiler emsal olarak verilmiştir, kapalı küme olarak değil.

### 9.5 Anchor'ın aşamalar boyunca durumu (`CF-B02-01`)

| Aşama | Anchor durumu |
|---|---|
| 1 (schema) | Anchor tablosu **membership ile birlikte** yaratılır; ikisi ayrı PR'a bölünmez |
| 2 (backfill) | ADIM 5 tüm mevcut Office'lere 3'er anchor yazar; V8/V9 doğrular |
| 3 (read-path) | Resolver anchor'ı **okur**; parity harness `UNKNOWN` durumunu legacy ile karşılaştırmaz (legacy'de karşılığı yoktur — bu beklenen asimetridir ve parite sorgusundan **dışlanır**) |
| 4 (dual-write) | `getOrCreate` §6.7'ye göre yeni tenant'a anchor yazar; bu **Aşama 4'te devreye girer**, çünkü ilk yazma yolu orasıdır |
| 5 (observation) | V8/V9 periyodik koşar: anchor'sız Office **sıfır** olmalı |
| 6 (cutover) | Okuyucular `UNKNOWN`/`EMPTY` ayrımını tüketmeye başlar |
| 7 (retirement) | Anchor **kalır** — legacy kolonlar düşer, bilgi sınırı kalıcıdır |

**Anchor asla retire edilmez.** Legacy diziler geçici, bilgi sınırı kalıcıdır:
"2026 öncesi hakkında bilgim yok" ifadesi legacy kolonlar silindikten sonra da
doğrudur ve sorgulanabilir kalmalıdır.

---

## 10. Sözleşmenin B09 ile ilişkisi

`B09` bu dokümanda **başlatılmamıştır**; status mutation yapılmamıştır.

**Repository kanıtıyla seçilen ilişki:**

```text
B02 migration contract'ı B09 için YALNIZ EMSAL/PATTERN sağlar.
```

Gerekçe (kanıt):

1. B09'un ön koşulu **cross-workstream** migration contract'tır
   (brief §2.3, `BLOCKED_DEPENDENCY`). B02'nin ürettiği sözleşme
   **tek workstream'e** (OFFICE/WR01) ve **tek tabloya** özgüdür.
2. Repository'de B09'un kapsamını tanımlayan başka bir kayıt yoktur:
   `grep "B09"` tüm governance ağacında **yalnız** brief'in altı satırını
   döner (`wr01-decomposition-brief-r01.md:146,257,261,280,548,614,639,675`).
   Yani B09'un "ihtiyacının belirli bir alt kümesi" repository'de **tanımlı
   değildir** → "B02 o alt kümeyi karşılar" iddiası kanıtlanamaz.
3. "Reusable contract yoktur" da doğru değildir: B02, tekrar kullanılabilir bir
   **desen** üretir (düz liste → effective-dated normalize tablo; preflight-RAISE;
   partial unique; parite doğrulaması).

**Bağlayıcı sonuç:** B02'nin tamamlanması B09'un `BLOCKED_DEPENDENCY`
durumunu **kapatmaz** ve kapatmış sayılamaz. B09 ayrı owner kararına tabidir
(brief Açık Soru 3).

---

## 11. Admin yazma yolu uyumluluğu

### 11.1 Mevcut API sözleşmesi korunabilir mi?

**EVET — ve korunmalıdır.** `PUT /office/escalation-settings` gövdesi 12 alanlı
kalır; 3 havuz alanı hâlâ **düz dizi** olarak kabul edilir. Admin paneli
(`page.tsx:363-375`) **hiç değişmeden** çalışmaya devam eder.

DTO backward compatibility: **evet** — mevcut alanlar aynı adla, aynı tiple,
aynı opsiyonellikle kalır. Yeni alanlar yalnız **eklenirse** eklenir
(`OD-B02-04`).

> **KAPSAM-DIŞI GÖZLEM (düzeltilmedi, önerilmedi):** bu uçta çalışan bir class
> DTO yoktur (§2.4), dolayısıyla global `ValidationPipe`'ın `whitelist` /
> `forbidNonWhitelisted` ayarları bu gövdeye **uygulanmaz**. B02 implementasyonu
> yeni alan eklerse (`OD-B02-04`), gerçek bir class DTO tanımlamak **zorunda**
> kalır — aksi hâlde yeni alanlar da doğrulanmadan geçer. Bu, B02'nin
> tasarımını kısıtlayan bir olgudur; mevcut durumun düzeltilmesi B02'nin
> kapsamında **değildir** ve bu doküman düzeltme önermez, yalnız kaydeder.

### 11.2 Replace-all payload'un effective-dated mutasyona çevrilmesi

Mevcut payload `[A, B, C]` biçiminde **hedef durumdur**. Fark hesabı:

```text
-- Office satırı FOR UPDATE ile kilitlenmiş ve effectiveAt üretilmiştir (§11.5.2)
mevcutAktif := resolve(poolKind, asOf = effectiveAt, tenantId)   -- küme
hedef       := payload[poolKind]                                  -- küme

eklenecek   := hedef \ mevcutAktif   → yeni satır: validFrom = effectiveAt
çıkarılacak := mevcutAktif \ hedef   → açık satır: revokedAt  = effectiveAt
değişmeyen  := kesişim               → DOKUNULMAZ  (satır KORUNUR)
```

Okuma da (`asOf = effectiveAt`) yazma da **aynı** `effectiveAt` değerini
kullanır: mutation'ın okuduğu durum ile yazdığı durum tek bir ana bağlanır,
"okuma anı ile yazma anı arasında kayan pencere" oluşmaz (`CF-B02-03` madde 5).

**"Değişmeyene dokunma" kuralı zorunludur:** naif bir "hepsini kapat, hepsini
yeniden aç" yaklaşımı her kaydetmede tüm üyeliklerin geçmişini parçalar ve
`validFrom`'u anlamsızlaştırır. Bu, replace-all payload'un effective-dated
modele en tehlikeli çevirisidir ve açıkça yasaklanmıştır.

### 11.3 Çıkarılan üye: expire mı, revoke mu?

**Kural:** admin panelinden listeden çıkarma = **`revokedAt = effectiveAt`**,
çünkü bu bir **irade beyanıdır** (T6), planlanmış bir bitiş değil (T7).
`validUntil` yalnız `OD-B02-04` ile açılırsa (future-dated/planlı bitiş)
kullanılır. Zaman kaynağı `now()` değil, kilit sonrası üretilen `effectiveAt`
değeridir (`CF-B02-03`).

Bu ayrım, `PermissionGrant`'ın kaybettiği bilginin B02'de **korunmasıdır** (§12).

### 11.4 Yeni üyenin `validFrom` değeri

`validFrom = effectiveAt` — yani **serialization anı** (`CF-B02-03`), naif bir
"yazma anı" değil. Future-dated değer mevcut endpoint ile **ifade edilemez** —
payload düz bir id dizisidir, tarih taşımaz.

Future-dated değişiklik için **yeni endpoint + yeni DTO gerekir**
(`POST /office/work-pools/:poolKind/memberships` gibi). Bu, `OD-B02-04`
kararına ve muhtemelen **B08**'in yüzeyine aittir; B02 bunu **tasarlar ama
açmaz**.

> **BİLİNEN TUZAK — allowlist projeksiyonu + tam-form POST.** Brief §2.4 bu
> riski B08 için işaretler; B02 açısından ölçülen gerçek şudur:
> `office-f01-projection.ts:24-58` `OFFICE_S1_FIELDS` listesinde `opStaffTypes`
> **vardır** (`:50`) ama `escalationManagerLawyerIds`,
> `escalationFounderLawyerIds`, `escalationTeamLeadLawyerIds`,
> `poaExpiryRecipientLawyerIds` **YOKTUR**. Bugün bu bir veri kaybı üretmez,
> çünkü admin formu okumasını **projeksiyonsuz** `getEscalationSettings`'ten
> yapar (`office.service.ts:499-516`; `page.tsx:259-273`) — `updateEscalationSettings`'in
> `projectForActor` dönüşü (`:545`) forma **beslenmez**.
> **Ancak:** B02/B08 okuma yolunu projeksiyonlu `office` nesnesine taşırsa,
> form boş liste gösterir, boş listeyi geri POST eder ve üyelikleri **gerçekten
> siler** — `office-f01-projection.ts:91-97`'de belgelenmiş PR-1.5 vakasının
> birebir tekrarı. **B02 tasarımı bu nedenle okuma yolunu değiştirmez** ve
> allowlist güncellemesini §8.8'in ön koşulu olarak kaydeder.

### 11.5 Race condition ve concurrency (`CF-B02-02` ile düzeltildi)

> **GEÇERSİZ (R01).** *"DB garantisi (birincil): partial unique index yarışı veri
> düzeyinde kapatır… `version` kolonu bu senaryo için gereksizdir."*
> **Bu sonuç geçersizdir.**
>
> **Kök neden (owner tespiti, ratifiye):** partial unique index yalnız **aynı
> üyeye** ait ikinci açık satırı engeller. **Farklı üyelerde** eşzamanlı
> replace-all isteklerini serialize **etmez**:
>
> ```text
> Başlangıç: {A}
>
> İstek 1 hedefi: {A, B}          İstek 2 hedefi: {A, C}
> İkisi de başlangıcı {A} okur.
> İstek 1 → B ekler               İstek 2 → C ekler
> Hiçbir index ihlali YOK (farklı üyeler, farklı satırlar).
>
> Sonuç: {A, B, C}  →  ne İstek 1'in hedefi, ne İstek 2'nin hedefi.
> ```
>
> Bu bir **lost update / non-serializable read-modify-write** anomalisidir ve
> unique index'in ilgi alanının **tamamen dışındadır**.

#### 11.5.1 Riskin kaynağı: anomali BU TASARIMLA doğuyor

Bugün böyle bir anomali **yoktur** ve bu ayrım dürüstçe kaydedilmelidir:

| | Bugün (legacy) | Effective-dated model |
|---|---|---|
| Yazma şekli | Tek `UPDATE`; tüm dizi **körlemesine** ikame edilir | **Oku → farkı hesapla → N satır yaz** |
| Eşzamanlılık sonucu | Son yazan kazanır; sonuç **her zaman** bir isteğin hedefidir (`{A,B}` **veya** `{A,C}`) | Serialize edilmezse sonuç **hiçbir isteğin hedefi olmayabilir** (`{A,B,C}`) |
| Anomali sınıfı | Yok (blind write) | Lost update |

Yani read-modify-write'a geçiş **yeni** bir concurrency yükümlülüğü doğurur.
Bu yükümlülüğü karşılamayan bir implementasyon, mevcut davranıştan **daha
kötüdür** — owner'ın 5. koşulu ("admin yazma yolu kontrolsüz kırılamaz") bu
nedenle burada da bağlayıcıdır.

#### 11.5.2 Yürürlükteki sözleşme — tenant başına serialization noktası

```text
prisma.$transaction(async (tx) => {
  // 1) SERIALIZATION NOKTASI — fark hesabından ÖNCE, transaction'ın İLK ifadesi
  await tx.$queryRaw`SELECT "id" FROM "Office" WHERE "tenantId" = ${tenantId} FOR UPDATE`;

  // 2) EFFECTIVE-AT — kilit ALINDIKTAN SONRA, TEK KEZ  (CF-B02-03, §11.5.9)
  //    now() / CURRENT_TIMESTAMP KULLANILMAZ (transaction-start'ta donar);
  //    uygulama katmanında önceden hesaplanmış new Date() de KULLANILMAZ.
  const [{ effective_at: effectiveAt }] =
    await tx.$queryRaw`SELECT clock_timestamp() AS effective_at`;

  // 3) mevcut aktif üyeler AYNI transaction içinde okunur (§11.2)
  // 4) fark hesabı  → ekle (validFrom = effectiveAt) / revoke (revokedAt = effectiveAt)
  // 5) legacy projeksiyon yazımı (Aşama 4/6 yönüne göre)
});
```

Adım 1 ve 2'nin **bu sırada ve bitişik** olması bağlayıcıdır: kilit alınmadan
üretilen bir zaman damgası serialization anını temsil etmez (§11.5.9 madde 7).

**Neden `Office` satırı kilitleniyor:** `Office.tenantId @unique`
(`schema.prisma:2345`) olduğu için tenant başına **tam olarak bir** satır
vardır — doğal ve tekil bir serialization anchor'ıdır. Ayrı bir "lock tablosu"
veya advisory lock icat edilmesine gerek yoktur.

**Sonuç:** İstek 2, İstek 1 commit edene kadar bekler; sonra `{A,B}` durumunu
okur ve `{A,C}` hedefine göre farkı hesaplar → `B` kapanır, `C` açılır.
Nihai sonuç `{A,C}` — **son yazanın hedefi**, yani bugünkü replace-all
semantiğinin birebir korunması.

#### 11.5.3 Repo-native emsal (VERIFIED)

| Desen | Repo kanıtı |
|---|---|
| `SELECT … FOR UPDATE` (bloklayan) | `bundle-seal/__tests__/bundle-seal.integration.spec.ts:222` |
| `FOR UPDATE NOWAIT` → deterministik 409/423 | `bundle-seal.repository.ts:48` (`lockBundleNowait`), hata kodu eşlemesi `bundle-seal.errors.ts:122` (`55P03`) |
| `FOR UPDATE SKIP LOCKED` (worker throughput) | `bundle-seal.repository.ts:81` |
| `Serializable` + `P2034` retry | `password-reset.service.ts:126` (izolasyon) + `:128-135` (retry döngüsü) + `:138-142` (yalnız P2034/ilgili P2002 retry'lenir şerhi) |

Yani **her iki çözüm ailesi de** repo-native'dir; icat edilen bir mekanizma
yoktur.

#### 11.5.4 Seçim ve reddedilenler

| Seçenek | Değerlendirme |
|---|---|
| **`SELECT … FOR UPDATE` (bloklayan) — SEÇİLDİ** | Admin UX **birebir korunur**: kullanıcı hiçbir hata görmez, ikinci kaydetme sıraya girer. Yazma frekansı büro ayar ekranında son derece düşüktür; bekleme pratikte ölçülemez. Yeni kolon, yeni migration, yeni hata kodu **gerektirmez** |
| `FOR UPDATE NOWAIT` → 409/423 | Deterministik ama **kullanıcıya yeni bir hata durumu** getirir → admin panelinde yeni UI davranışı ister (B08 kapsamı). Ayar ekranı için gereksiz sertlik |
| `Serializable` + P2034 retry | Doğru ama daha pahalı ve daha geniş etkili; retry döngüsü + hata sınıflandırma yükü getirir. `password-reset` gibi **enumeration-hassas** bir akışta gerekçeliydi; burada tek satırlık kilit yeterlidir |
| **`version`/CAS kolonu — REDDEDİLDİ** | `Office`'e sürüm kolonu eklemek **ayrı bir owner kapısıdır** (repo şerhi: `20260802190000` migration'ının `FIND-C4 (version/CAS)` notu). Ayrıca kullanıcıya 409 gösterir ve `OD-B02-04`'ün immediate-effect kararıyla gereksiz bir UX bedeli yaratır |
| Yalnız partial unique index | **YETERSİZ** — bu bölümün düzelttiği hata |

#### 11.5.5 Partial unique index'in yeni rolü

Index **kaldırılmaz**; rolü **birincil kontrolden defense-in-depth backstop'a**
indirilir:

- Serialization noktasını atlayan **herhangi bir** yazma yolu (elle SQL, gelecek
  bir servis, hatalı refactor) aynı üye için ikinci açık satır yazamaz → `23505`.
- Yani index bir **invariant sigortasıdır**, bir concurrency kontrolü değil.

#### 11.5.6 Implementation gate'i (zorunlu test)

`CF-B02-02` yalnız metinle kapanmaz. İmplementasyonda **gerçek PostgreSQL**
üzerinde bir db-gated eşzamanlılık testi zorunludur (repo emsali:
`password-reset.db-gated.integration.spec.ts`):

```text
Başlangıç {A}; iki eşzamanlı PUT: hedef {A,B} ve hedef {A,C}
BEKLENEN : nihai aktif küme {A,B} VEYA {A,C}  —  {A,B,C} ASLA
```

Mock'lu bir unit test bu garantiyi **kanıtlayamaz**; kilit davranışı gerçek
transaction gerektirir. Tam matris §11.5.8'dedir.

#### 11.5.7 Ortak mutation primitive'i ve lock invariant'ı (bağlayıcı)

Serialization sözleşmesi **mevcut admin endpoint'ine özgü değildir.**
`OfficeWorkPoolMembership` üzerinde mutation yapan **bütün** uygulama yolları
aynı sözleşmeyi kullanmak zorundadır.

```text
LOCK INVARIANT (bağlayıcı):
  Bir OfficeWorkPoolMembership satırını INSERT/UPDATE eden her yol, aynı
  transaction içinde ve YAZMADAN ÖNCE ilgili Office satırında FOR UPDATE
  kilidini almış olmak ZORUNDADIR.
```

1. **Tek primitive.** Havuz mutasyonu **tek bir repository/service primitive'i**
   üzerinden yapılır (çalışma adı: `OfficeWorkPoolMutationService.applyTargetState()`).
   Kilit alma, `effectiveAt` üretimi (§11.5.9), fark hesabı, membership yazımı ve
   legacy projeksiyon **bu primitive'in içindedir**; çağıranlar bu adımları
   kendileri kurgulamaz.
2. **Kilitsiz yazma yasaktır.** Primitive'i atlayarak doğrudan
   `prisma.officeWorkPoolMembership.create/update/updateMany` çağıran hiçbir yol
   kabul edilmez.
3. **Gelecekteki yollar da bağlıdır.** `OD-B02-04` ileride açılır ve future-dated
   endpoint eklenirse, o endpoint de **aynı primitive'i** kullanmak zorundadır.
   Aynı kural B03'ün atama motoru, B04'ün yeniden atama akışı, seed/script
   yolları ve olası bulk import için de geçerlidir.
4. **Index bir kontrol değildir.** Partial unique index farklı üyelerdeki
   lost-update'i **engellemez**; yalnız defense-in-depth backstop'tur (§11.5.5).
   Bu cümle, primitive'in gerekliliğini azaltan bir gerekçe olarak
   **kullanılamaz**.
5. **Zorunlu yapısal test.** Implementation'da bir mimari koruma testi bulunur:
   kaynak ağacında `officeWorkPoolMembership` üzerinde yazma çağrısı yapan
   dosyaların kümesi **yalnız** primitive dosyasıdır. Yeni bir yazıcı eklenirse
   test kırılır. (Emsal: repo'daki eksiksizlik-kilidi deseni — B01
   `Record<ActionCode, …>` ve `STAFF_PRIVILEGED_READ_FIELDS` alan listesi kilidi.)

#### 11.5.8 Zorunlu concurrency test matrisi (gerçek PostgreSQL)

**Genel invariant (bağlayıcı):**

```text
Başarıyla tamamlanan eşzamanlı replace-all isteklerinden sonra final aktif küme,
tamamlanan isteklerden BİRİNİN exact hedef kümesi olmalıdır.
```

"Birleşik", "ara" veya "kısmi" bir sonuç — yani hiçbir isteğin hedefi olmayan
küme — **her senaryoda ihlaldir**.

| # | Başlangıç | İstek 1 hedefi | İstek 2 hedefi | Kabul edilen final | Yasak sonuç |
|---|---|---|---|---|---|
| **T1** | `{A}` | `{A,B}` | `{A,C}` | `{A,B}` **veya** `{A,C}` | `{A,B,C}` |
| **T2** | `{A}` | `{}` | `{A,B}` | `{}` **veya** `{A,B}` | `{B}`, `{A}` gibi ara/birleşik hedef |
| **T3** | `{A}` | `{A,B}` | `{A,B}` | `{A,B}` | `B` için **birden fazla açık** membership satırı |
| **T4** | `{A,B}` | `{A}` | `{A,B,C}` | `{A}` **veya** `{A,B,C}` | "`B` revoke edilmiş **ama** `C` eklenmiş" (`{A,C}`) |

**T5 — kilit bekleme, abort ve retry sınıflandırması:**

- Kilit bekleyen isteğin davranışı ölçülür: bekler, kilidi alır, **taze** durumu
  okur ve farkı ona göre hesaplar.
- **Kör/unbounded retry yasaktır.** Retry yalnız **sınıflandırılmış** ve
  **bounded** olabilir (§9.4a).
- Retry'lenebilir hata kümesi **repository-native sınıflandırmayla** belirlenir;
  ilgisiz bir hata retry tetikleyemez. Emsal:
  `password-reset.service.ts:138-142` — *"YALNIZ (a) P2034 … veya (b) partial-index
  P2002 retry'e uygundur; `tokenHash` gibi İLGİSİZ bir P2002 asla retry
  tetiklemez"*.
- **Mock test lock garantisinin kanıtı sayılamaz.** T1–T5'in tamamı gerçek
  PostgreSQL üzerinde db-gated integration testi olarak koşar (emsal:
  `password-reset.db-gated.integration.spec.ts`,
  `bundle-seal.integration.spec.ts`).

**T3'ün ayrı bir kalem olma sebebi:** iki isteğin **aynı** hedefi vermesi,
naif bir implementasyonda "her ikisi de `B`'yi ekler" sonucunu doğurur. Burada
partial unique index gerçekten devreye girer (`23505`) — ama bu, index'in
concurrency kontrolü olduğu anlamına **gelmez**: T1/T2/T4'te index sessizdir.
T3, backstop'un çalıştığını **ayrıca** kanıtlar.

#### 11.5.9 `CF-B02-03` — serialize edilmiş `effectiveAt`

> **DÜZELTME (R03).** R02'de seçilen `FOR UPDATE` doğrudur, ancak **zaman
> üretimi ayrıca bağlanmalıdır**. Aksi hâlde kilit sırası ile tarihsel sıra
> birbirinden ayrışır.

**Kök neden (bağlayıcı teknik olgu):** PostgreSQL'de `now()` /
`CURRENT_TIMESTAMP` **transaction başlangıç anını** temsil eder ve transaction
boyunca **sabittir** — kilit beklerken **ilerlemez**.

```text
t0  İstek 2 transaction'ı BAŞLAR        → now() = t0 (donar)
t1  İstek 2, FOR UPDATE kilidinde BEKLER
t2  İstek 1 COMMIT eder                  → İstek 1'in yazdığı satırlar ~t2
t3  İstek 2 kilidi ALIR ve mutasyonu uygular
    now() hâlâ t0  →  effectiveAt = t0 < t2

SONUÇ: sonra serialize edilen mutation, ÖNCE serialize edilenden DAHA ERKEN
       bir effectiveAt taşır. Tarihsel sıra, gerçek serialization sırasıyla
       ÇELİŞİR: aynı üyenin revokedAt'i validFrom'undan önce görünebilir,
       "kim ne zaman havuzdaydı" sorusu yanlış cevaplanır.
```

**Bağlayıcı sözleşme:**

1. Transaction'ın **ilk işi** `Office` satırını `FOR UPDATE` ile kilitlemektir.
2. Kilit **başarıyla alındıktan hemen sonra** tek bir `effectiveAt` üretilir.
3. `effectiveAt` **transaction-start `now()` değerinden türetilmez** — ne
   doğrudan, ne `now() + interval`, ne de ona dayanan bir hesapla.
4. Gerçek duvar saati gereken yerde **`clock_timestamp()`** (veya repository
   tarafından doğrulanmış eşdeğer mekanizma) kullanılır. `clock_timestamp()`
   `now()`'un aksine **çağrı anını** döner; kilit sonrası ilk ifade olarak
   çağrıldığında serialization anını temsil eder.
5. **Aynı mutation içindeki bütün tarihsel yazmalar aynı `effectiveAt`
   değerini kullanır:**
   - yeni membership'lerin `validFrom`;
   - çıkarılan üyelerin `revokedAt`;
   - varsa audit/change metadata zamanı;
   - legacy projeksiyonla ilişkilendirilen zaman kanıtı.
6. **Satır başına ayrı saat çağrısı yapılmaz.** Tek mutation içinde iki farklı
   zaman damgası oluşması, aynı işlemin parçalarını farklı anlara dağıtır ve
   `[validFrom, validUntil)` sınırlarında yapay boşluk/örtüşme üretir.
7. `effectiveAt` **kilit alınmadan** uygulama katmanında önceden hesaplanmaz
   (`new Date()` ile servis başında üretmek **yasaktır**) — bu, `now()` hatasının
   uygulama katmanındaki eşdeğeridir.
8. **Tarihsel sıra invariant'ı:**

   ```text
   Önce serialize edilen mutation'ın effectiveAt değeri, sonra serialize edilen
   mutation'ın effectiveAt değerinden BÜYÜK OLAMAZ.
   ```

9. **Zorunlu gerçek PostgreSQL testi (T6):**

   ```text
   İstek 1 Office lock'unu tutar
   İstek 2 lock'ta bekler
   İstek 1 commit eder
   İstek 2 lock'u alır ve mutasyonu uygular
   DOĞRULA: İstek 2'nin effectiveAt değeri, İstek 1'in commit'inden SONRAKİ
            bir anı temsil eder  (effectiveAt_2 >= effectiveAt_1)
   DOĞRULA: oluşan membership/revocation aralıkları ters veya geçersiz DEĞİL
            (validFrom < validUntil; revokedAt >= validFrom — §6.3 CHECK'leri)
   ```

**Not — CHECK'lerle ilişki:** §6.3'teki `revokedAt >= validFrom` ve
`validFrom < validUntil` CHECK'leri bu hatanın bir kısmını **yakalar** (fail-closed
`23514`), ama hepsini değil: iki **farklı** üyenin satırları arasında sıra
bozulması hiçbir CHECK'i ihlal etmez. Yani CHECK'ler `CF-B02-03`'ün yerine
geçmez; onun **son savunma hattıdır**.

**`CF-B02-03` yeni bir owner kararı değildir** — effective-dated modelin teknik
doğruluk koşuludur ve §15'e yeni bir OD eklemez.

### 11.6 Authorization ve tenant isolation

**Değişmez.** `OfficeF01AuthorizationGuard` PUT ucunda kalır; `tenantId`
`@CurrentUser`'dan gelir; yeni tablo yazmaları aynı `tenantId` ile sınırlıdır ve
composite FK cross-tenant üyeyi DB düzeyinde engeller (§6.2). B02 yetki
modelini **genişletmez veya daraltmaz**.

### 11.7 Admin panelinin değişmesi gereken aşama

| Aşama | Panel |
|---|---|
| 1-5 | **Değişmez** |
| 6 (cutover) | **Değişmez** — API sözleşmesi korunduğu için |
| `OD-B02-04` EVET ise | Future-dated yüzey **B08**'de açılır (yeni ekran/alan) |
| 7 (retirement) | Değişmez (sözleşme aynı) |

**Backward compatibility'nin sınırı (açık):** mevcut düz-dizi sözleşmesi
**kalıcıdır**, geçici değil — çünkü "şu an kimler havuzda" sorusu kalıcı bir
kullanım hâlidir. Geçici olan **legacy kolonlardır**, legacy **API şekli**
değil.

---

## 12. `PermissionGrant` emsal analizi

Model: `schema.prisma:10021-10043`.

| Desen | Alınsın mı | Gerekçe |
|---|---|---|
| `validFrom` + nullable `validUntil` | **EVET** | Repo-native effective-dating; `@@index([validUntil])` dahil |
| `tenantId` ile tenant düzlemi | Kısmen | B02 daha ileri gider: `PermissionGrant`'ta `tenantId` **çıplak** kolondur, FK yoktur. B02 `Office(tenantId)` FK'si kurar |
| `grantedByUserId` / `reason` | **EVET (uyarlanmış)** | B02'de `createdByUserId` + `revokedByUserId`; `reason` opsiyonel |
| **`revokedAt` yokluğu** | **HAYIR — TEKRARLANMAYACAK** | Brief §3.7 VERIFIED: geri alma yalnız `validUntil`'i geçmişe çekerek yapılabiliyor; bu, "geri alındı" ile "süresi doldu" ayrımını **kaybettiriyor**. B02 `revokedAt` + `revokedByUserId` taşır (§4, §11.3) |
| **Escalation-guard yokluğu** | **HAYIR — TEKRARLANMAYACAK** | Brief §3.7 VERIFIED. B02'de karşılığı: havuz üyeliği **yetki üretmez**. Havuz "kim aday" der; "kim onaylayabilir" B06'nın eligibility katmanıdır. Bu ayrım sözleşmede **açıkça** yazılır ki bir üyelik satırı sessizce yetkiye dönüşmesin |
| Aktif dönem çakışma engeli | **YOK — EKLENECEK** | `PermissionGrant`'ta partial unique index yoktur; B02 ekler (§6.3) |
| Şema yorumunun bayatlaması | **UYARI** | `PermissionGrant`'ın *"HENÜZ hiçbir authorization consumer tarafından okunmuyor"* yorumu **yanlıştır** (brief §3.7: dört servis okur). B02 sözleşmesi tüketici listesini yoruma **gömmez**; tüketici envanteri bu governance dokümanında tutulur |

**Bağlayıcı şerh:** model benzerliği domain eşitliği **değildir**.
`PermissionGrant` "kişi → izin" taşır; B02 "iş türü → aday kümesi" taşır ve
üyelerinden biri **kimlik değil enum**dur (`StaffType`). Bu yüzden
`PermissionGrant`'ın satır şekli miras alınmaz; yalnız **tarih ekseni deseni**
alınır.

---

## 13. B01 uyum kontrolü

| B01 kuralı | B02'de karşılığı |
|---|---|
| Kapalı küme + `as const` | `PoolKind`, `PoolMemberKind`, `MembershipProvenance` |
| `Record<…>` eksiksizlik kilidi | `Record<PoolKind, PoolMemberKind>` — yeni havuz eklenip tablo güncellenmezse **typecheck kırılır** |
| Saf, IO-suz predikat | §7.1 `aktif(satır, asOf)` saf fonksiyon; IO yalnız repository katmanında |
| Karar ≠ bildirim ayrımı | B02 **hiçbirini** üretmez: havuz yalnız **aday kümesidir**. Karar B06'nın, bildirim B07'nin |
| `actionCode` kategorisi ile karıştırmama | `PoolKind` ile `OfficeWorkActionCategory` **bağımsız eksenlerdir**; B02 aralarında eşleme tanımlamaz |

---

## 14. Riskler ve doğrulama planı

| # | Risk | Etki | Implementation aşamasında zorunlu gate |
|---|---|---|---|
| R-01 | **Geçmiş tarih uydurulması** | Hukuki/denetsel yanlış beyan | Test: `asOf < anchor.knownFrom` → `status = UNKNOWN` (asla `EMPTY`) — **boş havuzlu tenant dahil** (`CF-B02-01`). Migration testi: tüm backfill satırları `LEGACY_CUTOVER_IMPORT` ve tek `validFrom` (V7, V10) |
| R-02 | **Tenant data leakage** | Kritik | Test: başka tenant'ın üyesi hiçbir `asOf`'ta görünmez. Migration V6. FK `Lawyer(id, tenantId)` |
| R-03 | **Interval overlap** (kapalı aralıklar — index kapatmaz) | Belirsiz havuz | Fark hesaplayıcı birim testleri + V5 sorgusu bir izleme kontrolü olarak periyodik koşar. `btree_gist`/EXCLUDE **ayrı** sertleştirme kalemi (repo-novel) |
| R-04 | **Dual-write drift** | İki gerçek | Aşama 5 gözlem penceresi; V2 pariteliği; çıkış koşulu `DRIFT = 0` |
| R-05 | **Partial migration** | Yarım şema | Tek transaction + preflight RAISE (§8.4). "Kısmi durum YOK" ilkesi |
| R-06 | **Invalid / orphan / cross-tenant member ID** | Migration fail veya sessiz kayıp | ADIM 1 preflight; **sessiz düşürme YASAK**; anomali → owner'lı pre-clean kapısı |
| R-07 | **Concurrent admin update — lost update** (`CF-B02-02`) | **Hiçbir isteğin hedefi olmayan havuz** (`{A,B,C}`) | Tenant başına `SELECT … FOR UPDATE` serialization noktası (§11.5.2); partial unique index yalnız backstop (§11.5.5); **zorunlu db-gated eşzamanlılık testi** (§11.5.6). R01'in "index yeterli" sonucu GEÇERSİZ |
| R-08 | **Timezone boundary** | Yanlış `asOf` | Sözleşme: yalnız UTC instant; yerel tarih→instant dönüşümü B02 kapsamı dışı (§7.3). Test: sınır anında (`validFrom` tam eşitliği) dahil, `validUntil` tam eşitliğinde hariç |
| R-09 | **Revocation/expiry karışıklığı** | Denetim kaybı | Ayrı kolonlar + §11.3 kuralı + test: revoke edilen üye `asOf < revokedAt`'ta **hâlâ** havuzda |
| R-10 | **Legacy reader'ın kaldırılmadan bozulması** | 4 bounded context'te bildirim kaybı | Aşama 6 flag'i; §2.3'teki **altı** yüzeyin her biri için ayrı taşıma kanıtı; `OD-B02-03` |
| R-11 | **Rollback sonrası iki modelin ayrışması** | Sessiz tutarsızlık | Aşama 1-5'te legacy authoritative olduğu için rollback ucuz. Aşama 6 sonrası rollback → önce projeksiyondan legacy'yi yeniden üret, sonra flag'i çevir (sıra bağlayıcıdır) |
| R-12 | **Allowlist projeksiyonu + tam-form POST veri silmesi** | **Veri kaybı** | §11.4 tuzağı: okuma yolu değiştirilmeden allowlist güncellenmez; değiştirilecekse allowlist **aynı PR'da** güncellenir + regresyon testi |
| R-13 | **Nullable üye çifti (Alternatif 2'nin kabul edilen bedeli)** | Geçersiz satır | 5 CHECK constraint (§6.3) + uygulama tarafında discriminated union |
| R-14 | **Anchor'sız tenant/havuz** (`CF-B02-01`) | `UNKNOWN` ile gerçek `EMPTY` ayrımı kaybolur — boş havuzda sessizce | Migration ADIM 5 (backfill'den ÖNCE) + V8/V9 doğrulaması + `getOrCreate` atomik anchor yazımı (§6.7) + resolver fail-closed `UNKNOWN` (§7.6). Parite sorguları boş havuzu **trivially** geçtiği için V9 ayrı kalem olarak zorunludur |
| R-15 | **Sentinel membership cazibesi** | Hayalet üye → sahte alıcıya bildirim | Anchor **ayrı tabloda**; sentinel satır tasarımda **yasaklıdır** (§6.6). Test: üyelik tablosunda "gerçek üye değil" anlamına gelen hiçbir satır tipi bulunmaz |
| R-16 | **Transaction-start `now()` ile üretilen zaman damgası** (`CF-B02-03`) | Tarihsel sıra gerçek serialization sırasıyla **çelişir**; "kim ne zaman havuzdaydı" yanlış cevaplanır; sınırda `revokedAt < validFrom` üretilebilir | `effectiveAt` **kilit alındıktan sonra**, `clock_timestamp()` (veya doğrulanmış eşdeğeri) ile **tek kez** üretilir (§11.5.9). Zorunlu test **T6**. §6.3 CHECK'leri yalnız **son savunma hattıdır**: aynı üyedeki ihlali yakalar, farklı üyeler arası sıra bozulmasını **yakalamaz** |
| R-17 | **Kilidi atlayan mutation yolu** (§11.5.7) | Lost update; T1/T2/T4 ihlali — hiçbir isteğin hedefi olmayan havuz | Tek `applyTargetState()` primitive'i + **lock invariant**; primitive dışında `officeWorkPoolMembership` yazımı **yasak**; bunu sabitleyen **yapısal test** (§11.5.7 madde 5). Gelecekteki future-dated endpoint, B03/B04 akışları ve script yolları da bağlıdır |
| R-18 | **Kör/unbounded retry** (§9.4a) | Deadlock fırtınası; ilgisiz hatanın maskelenmesi; veri değil ama **kullanılabilirlik** kaybı | Retry yalnız **sınıflandırılmış** (gerçek repository hata kodları) ve **bounded** (sabit üst sınır); belirsiz sonuçta körlemesine yazma yerine **oku-doğrula** (§9.4a madde 5) |

---

## 15. Owner kararları — **4/4 RATIFIED** (2026-08-17)

> R01'de bu bölüm **açık sorulardan** oluşuyordu. Owner PR #2444'ü inceledi ve
> dördünü de karara bağladı. Aşağıda her kalem için **owner kararı** ve
> **tasarımdaki bağlayıcı karşılığı** birlikte verilmiştir. Seçenek
> karşılaştırmaları, kararın hangi zemine oturduğu izlenebilsin diye
> korunmuştur.

### 15.1 `OD-B02-01` — Historical-start / backfill policy → **APPROVED: A**

```text
OWNER KARARI (2026-08-17):
  Mevcut üyeler yalnız deterministik cutover anından itibaren effective kabul
  edilir. Cutover öncesi geçmiş hakkında üyelik iddiası kurulmaz. Geçmiş tarih
  icat edilmez. Backfill provenance değeri LEGACY_CUTOVER_IMPORT olur. Owner
  tarafından ayrıca kanıtlanmış tarih sağlanmadıkça historical backfill YAPILMAZ.
```

**Tasarımdaki bağlayıcı karşılığı:** §8.4 ADIM 4-6 (tek snapshot + tek provenance
değeri) · §7.6 (`asOf < knownFrom` → `UNKNOWN`) · §6.6 (bilgi sınırı anchor'da) ·
V7/V10 doğrulamaları. `OWNER_EVIDENCED_HISTORICAL` provenance değeri şemada
**tanımlı kalır** ama migration onu **kullanmaz**; ileride kanıt gelirse schema
değişikliği gerekmez.

| Seçenek | Ne demek | Etkisi |
|---|---|---|
| **A (ÖNERİLEN)** | Tüm mevcut üyeler yalnız `cutoverAt`'ten itibaren effective; cutover öncesi için **iddia kurulmaz** | Veri doğruluğu en yüksek; `asOf < cutoverAt` sorguları `UNKNOWN`; uygulama en basit; geri dönüş en kolay; B'ye sonradan geçişi **engellemez** |
| **B** | Kanıtlanabilen üyeler owner tarihiyle, kalanlar cutover'dan | Kanıt kalitesine bağlı; migration'a deterministik olmayan girdi girer; **ön koşulu bu oturumda mevcut değil** (repository'de owner tarih kaydı yok) |
| **C** | Unknown-origin legacy provenance modeli | Resolver davranışı A ile aynı; ek maliyeti nullable `validFrom` (resolver + index karmaşıklığı). C'nin tek gerçek katkısı olan `provenance` etiketi **zaten A'nın içindedir** |

**Teknik öneri (R01):** **A** — owner tarafından **onaylandı**. Gerekçe: tek
kanıt-uyumlu seçenek olması, en düşük karmaşıklık, ve B'ye ileri uyum.

### 15.2 `OD-B02-02` — Havuz kapsamı → **APPROVED: (a)**

```text
OWNER KARARI (2026-08-17):
  B02 migration kapsamı YALNIZ üç alandır: opStaffTypes,
  escalationManagerLawyerIds, escalationFounderLawyerIds.
  escalationTeamLeadLawyerIds ve poaExpiryRecipientLawyerIds bu implementation
  kapsamına ALINMAZ. Normalize model bunları gelecekte schema değişikliği
  gerektirmeden destekleyebilir; fakat migration ve runtime taşıması AYRI
  authority gerektirir.
```

**Tasarımdaki bağlayıcı karşılığı:** §6.1 `PoolKind` kümesi **üç değerle**
başlar; §8.4 ADIM 5-6 yalnız bu üç havuzu tarar; V8'in beklenen sayısı
`count("Office") × 3`'tür. Dördüncü/beşinci havuz için enum'a değer eklemek
**tek başına yeterli değildir** — migration + runtime taşıması ayrı authority
ister ve bu doküman onu vermez.

Model, yapısal olarak **aynı** olan beş alanı taşıyabilir. B02'nin
adlandırılmış kapsamı üçtür.

- **(a)** Yalnız 3 alan taşınır; `escalationTeamLeadLawyerIds` (`schema.prisma:2415`)
  ve `poaExpiryRecipientLawyerIds` (`:2424`) düz liste olarak **kalır**
  → sistemde **iki farklı havuz modeli** aynı anda yaşar.
- **(b)** Beşi birlikte taşınır → tek model, tek desen; ancak kapsam WR01
  dışına (`AUTOMATION`, dosya görevi eskalasyonu) taşar.

**Teknik öneri (R01):** **(a)** — owner tarafından **onaylandı**. Kapsam
disiplini; model (b)'yi schema değişikliği olmadan destekler.

### 15.3 `OD-B02-03` — Okuma cutover'ı → **APPROVED: (a)**

```text
OWNER KARARI (2026-08-17):
  Ölçülen ALTI okuma yüzeyinin TAMAMI nihai cutover'da resolver'a geçecektir.
  Taşıma implementation sırasında küçük ve doğrulanabilir aşamalara bölünebilir.
  Nihai source-of-truth cutover, altı yüzeyin TAMAMINDA parity sağlanmadan
  YAPILAMAZ. Kısa ömürlü read-source flag kullanılabilir. Süresiz legacy
  okuyucu veya süresiz dual source-of-truth KABUL EDİLMEZ.
```

**Tasarımdaki bağlayıcı karşılığı:** §2.3'teki altı yüzey (dördü WR01 dışı) §9.2
Aşama 3-6'da taşınır. Owner'ın "küçük ve doğrulanabilir aşamalara bölünebilir"
izni **cutover'ı bölmez**: taşıma kademeli olabilir, **source-of-truth dönüşü
tektir ve altı yüzeyin tamamında parity ön koşuludur**. Aşama 6 flag'i §9.3'te
zaten kısa ömürlü olarak gerekçelendirilmiştir ve Aşama 7'de **kaldırılır**.

**Cutover ön koşulu (bağlayıcı kontrol listesi):**

```text
□ operational-escalation.service.ts:218-256      parity PASS
□ case-task-escalation.service.ts:259-270        parity PASS
□ poa-expiry-delivery.service.ts:331-333         parity PASS
□ client-notification.service.ts:473-474         parity PASS
□ office.service.ts:499-516  (admin GET)         parity PASS
□ scripts/g6-backfill-dry-run.ts:58-66           parity PASS
Altısı da PASS değilse cutover YAPILMAZ.
```

§2.3'te ölçülen **altı** okuma yüzeyinin **dördü WR01 dışıdır**
(`ESCALATION` ×2, `AUTOMATION`, `CLIENT-NOTIFICATION`).

- **(a)** Cutover'da **hepsi** resolver'a taşınır → tek gerçek; ama üç modülün
  davranışı aynı anda değişir.
- **(b)** Yalnız WR01 tüketicileri resolver'ı okur; diğerleri legacy
  projeksiyondan okumaya devam eder → legacy kolonlar **süresiz** yaşar ve §9.2
  Aşama 7 **hiç gelmez**.

**Teknik öneri (R01):** **(a)**, Aşama 6 flag'iyle — owner tarafından
**onaylandı**. (b) "süresiz iki source-of-truth" sonucunu doğururdu.

### 15.4 `OD-B02-04` — Yazma yüzeyi → **APPROVED: (a)**

```text
OWNER KARARI (2026-08-17):
  WR01 kapsamındaki mevcut admin yazma yüzeyi IMMEDIATE-EFFECT kalacaktır.
  Ekleme: validFrom = now.  Çıkarma: revokedAt = now.
  Future-dated model schema seviyesinde desteklenebilir.
  Future-dated admin endpoint/DTO/UI bu işin kapsamında DEĞİLDİR ve ayrı
  authority gerektirir. B08 bu kararla otomatik BAŞLAMAZ.
```

**Tasarımdaki bağlayıcı karşılığı:** §11.2 fark hesabı · §11.3 (çıkarma =
`revokedAt`, expire **değil**) · §11.4 (`validFrom = now`) · §6.5 (future-dated
satır **model düzeyinde** geçerli kalır ama yazma yüzeyinden erişilemez).
§11.1'deki class-DTO zorunluluğu şerhi bu kararla **tetiklenmez**: yeni alan
eklenmediği için mevcut gövde tipi olduğu gibi kalır.

Model future-dated kaydı **destekler** (§6.5). Soru, WR01'de **admin'in bunu
kullanabilecek olup olmadığıdır**.

- **(a)** Hayır — yazma yüzeyi immediate-effect kalır (`validFrom = now`),
  tarih ekseni yalnız **geçmiş biriktirir**. Mevcut endpoint/DTO/panel **hiç
  değişmez**.
- **(b)** Evet — yeni endpoint + yeni DTO (+ class DTO zorunluluğu, §11.1
  şerhi) + B08 ekran işi.

**Teknik öneri (R01):** **(a)** WR01 için — owner tarafından **onaylandı**.

### 15.5 Açık kalan owner kararı

```text
YOK. Dört kalemin dördü de ratifiye edilmiştir (2026-08-17).
```

`CF-B02-01`, `CF-B02-02` ve `CF-B02-03` düzeltmeleri **yeni owner kararı
doğurmamıştır**:
her ikisi de repository kanıtı ve repo-native emsallerle çözülmüştür (anchor
tablosu için `ReportingLine`/`Client` desenleri; serialization için
`bundle-seal` ve `password-reset` emsalleri). Özellikle `version`/CAS
kolonundan **bilinçli olarak kaçınılmıştır** (§11.5.4), çünkü o yol ayrı bir
owner kapısı açardı.

---

## 16. Terminal disposition

```text
STATÜ                     DESIGN_COMPLETE / OWNER_RATIFIED /
                          DETERMINISTIC_READY_FOR_IMPLEMENTATION /
                          IMPLEMENTATION_NOT_AUTHORIZED
ÖNERİLEN MODEL            Alternatif 2 — normalize effective-dated üyelik tablosu
                          + üyelikten bağımsız knowledge-boundary anchor (CF-B02-01)
KALICI SOURCE-OF-TRUTH    Yeni effective-dated tablolar (cutover sonrası okuma+yazma)
LEGACY ALANLARIN ROLÜ     Transition-only projection; Aşama 7'de retire
                          (anchor RETIRE EDİLMEZ — bilgi sınırı kalıcıdır)
GEÇİŞ MODELİ              7 aşama; dual-write tek ACID transaction'da ve SÜRELİ
BACKFILL SEÇENEKLERİ      A / B / C
RATIFIYE BACKFILL         A (LEGACY_CUTOVER_IMPORT provenance) — OD-B02-01 APPROVED
CONCURRENCY               Tenant başına SELECT … FOR UPDATE serialization noktası;
                          TEK ortak mutation primitive'i + lock invariant;
                          partial unique index yalnız backstop (CF-B02-02)
CONCURRENCY TEST MATRİSİ  T1-T5 zorunlu (gerçek PostgreSQL) + T6 (CF-B02-03)
EFFECTIVE-AT KAYNAĞI      Kilit SONRASI clock_timestamp() — tek kez, tüm tarihsel
                          yazmalarda ortak; transaction-start now() YASAK (CF-B02-03)
RETRY/IDEMPOTENCY         Sınıflandırılmış + bounded; "gerekmez" ifadesi KALDIRILDI (§9.4a)
AÇIK OWNER KARARLARI      YOK — 4/4 RATIFIED (2026-08-17)
DÜZELTMELER               CF-B02-01 (anchor) · CF-B02-02 (concurrency + ortak
                          primitive + test matrisi) · CF-B02-03 (effectiveAt) UYGULANDI
ADMIN YAZMA UYUMU         KORUNUR — PUT /office/escalation-settings sözleşmesi değişmez
B09 İLİŞKİSİ              YALNIZ EMSAL/PATTERN — dependency KAPANMADI, status mutation YOK
ÜRETİLEN SCHEMA           YOK — Prisma modeli/migration/SQL dosyası YAZILMADI
ÜRETİLEN KOD              YOK
DB / PRODUCTION MUTATION  YOK
```

### 16.1 Readiness'in sınırı — eksik olan tek şey authority'dir

R01'de terminal sonuç `OWNER_DECISION_REQUIRED` idi, çünkü dört karar açıktı.
**Bu engel kalkmıştır:** dördü de 2026-08-17'de ratifiye edildi ve üç zorunlu
düzeltme (`CF-B02-01/02/03`) uygulandı. Tasarım artık migration'ın gövdesini,
enum içeriğini, PR sınırını, DTO yüzeyini, concurrency sözleşmesini ve zaman
üretimini **belirsizlik bırakmadan** tarif eder.

Buna rağmen bu doküman implementation'ı **başlatmaz**:

```text
DESIGN READINESS     : DETERMINISTIC_READY_FOR_IMPLEMENTATION
IMPLEMENTATION GO    : YOK — IMPLEMENTATION_NOT_AUTHORIZED
                       (ayrı ve açık owner yetkisi gerekir)
```

Bu ayrım bilinçlidir: "tasarım deterministik" ile "yazmaya yetkiliyim" aynı şey
değildir. C10 sayfası implementation yetkisi vermediğini açıkça yazar.

**Implementation gate'i — kapanış kriterleri (hepsi zorunlu):**

| # | Kriter | Kaynak |
|---|---|---|
| G1 | Anchor tablosu **membership ile aynı** schema PR'ında | §9.5 Aşama 1 — ayrılırsa `CF-B02-01` boşluğu geçici olarak yeniden açılır |
| G2 | Migration'da **anchor seed (ADIM 5) backfill'den (ADIM 6) önce**; V8/V9/V10 doğrulaması olmadan merge yok | §8.4, §8.6 |
| G3 | **Tek** `applyTargetState()` mutation primitive'i + lock invariant + primitive dışı yazımı yasaklayan **yapısal test** | §11.5.7 |
| G4 | **Concurrency matrisi T1–T5** gerçek PostgreSQL üzerinde db-gated test olarak PASS | §11.5.8 |
| G5 | **`effectiveAt` testi T6**: kilit sonrası üretim + sıra invariant'ı + geçersiz aralık yok | §11.5.9 madde 9 |
| G6 | Kod tabanında havuz mutation yolunda **transaction-start `now()` / `CURRENT_TIMESTAMP` / önceden hesaplanmış `new Date()`** kullanılmadığı doğrulanır | §11.5.9 madde 3, 7 |
| G7 | Retry politikası **sınıflandırılmış + bounded**; kör retry yok | §9.4a |
| G8 | Cutover öncesi **altı okuma yüzeyinin tamamında** parity PASS | §15.3 kontrol listesi |

### 16.2 Sonraki adım

```text
PAGE-O0 → (1) PR #2444 owner review/merge
          (2) B02 implementation için AYRI ve AÇIK owner GO
Bu doküman implementation GO'su İÇERMEZ ve kendi kendine yetki üretmez.
```

---

## 17. Preflight kanıt kaydı

| Kontrol | Sonuç |
|---|---|
| `git fetch origin main` → SHA | `7e497cfa6ffbed1a4377a3d63b84712ad35cc1c2` VERIFIED |
| Local HEAD == origin/main | EVET (`7e497cfa`) VERIFIED |
| Çalışma izolasyonu | Fresh worktree, base `7e497cfa`, branch `claude/office-wr01-b02-effective-dated-pools-design-r01` |
| WR01 master register | `DECISION_RATIFIED / DECOMPOSITION_COMPLETE / OWNER_SOURCE_VERIFIED` (`product-backlog.md` §OFFICE-WR01; `OFFICE-DELIVERY-MANIFEST.md` §13.5; `decision-log.md` 2026-08-16 SA01) VERIFIED |
| B02 durumu | Brief §2.4: *"Alan ekleme B01 contract'ı kesinleşmeden değerlendirilemez"*; blok-özel ek ön-koşul saptanmamış VERIFIED |
| B09 durumu | `BLOCKED_DEPENDENCY` — brief §2.3; governance ağacında B09'a dair **başka kayıt yok** (tam grep) VERIFIED |
| B01 çıktıları | `office-work-routing.contract.ts` (77 satır) + `office-work-routing-taxonomy.ts` (135 satır) tam okundu; PR #2439 squash `b28a7f98` VERIFIED |
| C8 predecessor raporu | **ERİŞİLEMEDİ** — repository/PR/branch'te yok (§0 evidence limitation) |
| Üç alanın exact modeli | `schema.prisma:2402-2403, 2411`; `Office` `:2343-2346`; `StaffType` `:4364-4372` VERIFIED |
| `PermissionGrant` | `schema.prisma:10021-10043` tam okundu VERIFIED |
| Brief §3.7'nin iki eksiği | `revokedAt` kolonu **yok** ve escalation-guard **yok** → `PermissionGrant` gövdesinde doğrulandı; B02'de **tekrarlanmayacağı** §12'de karara bağlandı VERIFIED |
| `ReportingLine` emsali | `schema.prisma:10058-10086` + migration'lar `20260716205716`, `20260718120000`, `20260718140000` tam okundu VERIFIED |
| Admin yazma yolu | `office.service.ts:499-546` (+ `:49-70`, `:87-112`, `:115-127`), `office.controller.ts:276-308`, `office-f01-authorization.guard.ts`, `main.ts:20-26`, `page.tsx:259-273/363-375` VERIFIED |
| Okuma yüzeyi envanteri | 6 test-dışı yüzey (§2.3) — tam grep, TÜM eşleşmeler incelendi VERIFIED |
| Migration dizini | 125 migration; `20260615040000` + `20260615050000` (alanların doğuşu) ve partial-unique emsalleri okundu VERIFIED |
| `EXCLUDE USING` / `btree_gist` / `tstzrange` | Migration ağacında **0 eşleşme** → repo-novel VERIFIED |
| Partial unique index yaygınlığı | 47 dosyada `CREATE UNIQUE INDEX`, 9'unda `WHERE` → repo-native VERIFIED |
| Rakip writer / açık PR | `gh pr list --state open` → `[]` VERIFIED |
| Docs-only governance yolu | Mekanik emsal: PR #2432 (`25931406`) **tek dosya**, `office-wr01-decomposition-r01/` altında, coordination-v2 request/grant artifact'ı **olmadan** merge edilmiş; #2436 ise register yüzeylerine dokunduğu için `applyMechanicalOperation` + SA kaydı gerektirmiş. Bu doküman **register yüzeyine dokunmaz** → #2432 yolu geçerlidir VERIFIED |
| Yürürlükteki F04/F07 binding'leri | `governance-writer-coordination-contract.md:2414, 2488` — bu binding'ler **kendi** görevlerinin OFFICE-WR01 işi yapmasını yasaklar; başka bir lane'in WR01 docs işini **bloklamaz** VERIFIED |
| Dirty base / scope collision | Yok — worktree temiz (`git status --porcelain` → 0 satır) VERIFIED |

### 17.1 R02 düzeltme turu — ek preflight (2026-08-17)

| Kontrol | Sonuç |
|---|---|
| Branch/PR sürekliliği | Aynı branch `claude/office-wr01-b02-effective-dated-pools-design-r01`, aynı PR **#2444** (OPEN); yeni PR açılmadı VERIFIED |
| R01 teslim SHA | `a2afd581b8825c859dbb605f9cd4057e95c2b02c` (R01 içerik commit'i `47b82c97` + CI retrigger boş commit'i) VERIFIED |
| `origin/main` | `7e497cfa` — R01 turundan beri **değişmedi**; rebase gerekmedi VERIFIED |
| PR dosya kapsamı (server-side) | `gh pr view 2444 --json files` → yalnız `b02-effective-dated-pools-design-r01.md` VERIFIED |
| `Office` lazy creation | `office.service.ts:115-127` findUnique + `:136` create → anchor'ın `getOrCreate` içinde atomik yazılması zorunluluğu buradan türedi (§6.7) VERIFIED |
| Boş dizi default'u | `20260615050000` — `DEFAULT ARRAY[]::TEXT[]`; yani "boş havuzlu tenant" olağan bir durumdur, `CF-B02-01`'in senaryosu teoriden ibaret değildir VERIFIED |
| `FOR UPDATE` emsali | `bundle-seal.repository.ts:48` (NOWAIT), `:81` (SKIP LOCKED); `bundle-seal.integration.spec.ts:222` (düz `FOR UPDATE`); hata kodu `bundle-seal.errors.ts:122` = `55P03` VERIFIED |
| `Serializable` + P2034 emsali | `password-reset.service.ts:126` izolasyon, `:128-135` retry döngüsü, `:138-142` retry sınıflandırma şerhi VERIFIED |
| `version`/CAS'ın owner kapısı olduğu | `20260802190000_client_identity_active_partial_unique/migration.sql` — `FIND-C4 (version/CAS)` notu: *"atomik birlikte deploy KANITLANAMADI … ayrı iş"* VERIFIED |
| Ürün diff | R02 turunda da YOK — schema/migration/kod/test/config: dokunulmadı VERIFIED |

### 17.2 R03 tamamlama turu — ek preflight (2026-08-17)

| Kontrol | Sonuç |
|---|---|
| PR durumu | #2444 **OPEN**, draft değil, base `main` VERIFIED |
| Beklenen head | `10279afb1ed5519e1f5f3fd6b128c8f73fe299b4` — **eşleşti** (local == remote == PR head) VERIFIED |
| PR dosya kapsamı | `gh pr view --json files` → yalnız bu tasarım dokümanı VERIFIED |
| `origin/main` drift | `7e497cfa` — R01/R02 turlarından beri **değişmedi**; `git log 7e497cfa..origin/main` **boş** → rebase gerekmedi VERIFIED |
| Rakip writer / scope collision | `gh pr list --state open` → **yalnız #2444** (bu görevin PR'ı) VERIFIED |
| `reviewDecision` | boş (zorunlu approving review sayısı 0) VERIFIED |
| Worktree | `git status --porcelain` → 0 satır (temiz) VERIFIED |
| `now()` transaction-start semantiği | PostgreSQL sözleşmesi; `CF-B02-03` bu olguya dayanır. Repository'de havuz mutation kodu **henüz yoktur**, dolayısıyla düzeltilecek mevcut bir çağrı **yoktur** — hüküm önleyicidir (G6 gate'i implementation'da ölçer) OBSERVED |
| `clock_timestamp()` repo kullanımı | Mevcut migration/servis ağacında **kullanılmıyor** → B02 implementasyonunda ilk kullanım olacaktır; bu nedenle G6 gate'i ve T6 testi zorunlu kılındı VERIFIED |
