# OFFICE-WR01-B02 — EFFECTIVE-DATED POOLS: SCHEMA + MIGRATION CONTRACT DESIGN (R01)

```text
DOKÜMAN            b02-effective-dated-pools-design-r01.md
GÖREV              OFFICE-WR01-B02-EFFECTIVE-DATED-POOLS-DESIGN-R01
ÇALIŞMA SEVİYESİ   LEVEL 2 FULL (schema + migration sözleşmesi)
STATÜ              DESIGN_COMPLETE / OWNER_DECISION_REQUIRED
BASE               origin/main @ 7e497cfa6ffbed1a4377a3d63b84712ad35cc1c2 (2026-08-16)
ÜRETİLEN AUTHORITY NONE — bu doküman implementation başlatmaz, owner kararı vermez
ÜRÜN DİFF          YOK (schema / migration / kod / test / flag / runtime / DB: DOKUNULMADI)
```

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
| **Önerilen model** | **Alternatif 2** — tek normalize effective-dated üyelik tablosu (`OfficeWorkPoolMembership` çalışma adı), `poolKind` discriminator + ayrık üye taşıyıcıları (`memberLawyerId` XOR `memberStaffType`), CHECK ile zorlanmış |
| **Kalıcı source-of-truth** | Cutover'dan sonra **yeni effective-dated tablo** (hem okuma hem yazma). `Office.opStaffTypes` / `escalationManagerLawyerIds` / `escalationFounderLawyerIds` **transition-only türetilmiş projeksiyon** hâline gelir ve ayrı bir retirement gate'inde düşer |
| **Geçiş yaklaşımı** | 7 aşama; dual-write **tek Prisma transaction'ında** (aynı DB, ACID) ve **süreli**; süresiz iki source-of-truth **yoktur**. Legacy→yeni yönü cutover'da tek noktada döner |
| **Backfill** | Seçenek **A** önerilir: mevcut üyeler yalnız deterministik cutover timestamp'inden itibaren effective; cutover **öncesi** için sistem "boş havuz" değil **`UNKNOWN` (kayıt yok)** döner. Bu, C'nin provenance etiketiyle birlikte uygulanır |
| **Unresolved owner decisions** | **4 adet** — `OD-B02-01` (historical-start/backfill politikası), `OD-B02-02` (havuz kapsamı: 3 alan mı, yapısal olarak aynı 5 alan mı), `OD-B02-03` (WR01 dışı 4 tüketicinin okuma cutover'ı), `OD-B02-04` (future-dated yazma yüzeyi WR01 kapsamında mı) |
| **Terminal readiness** | **`DESIGN_COMPLETE / OWNER_DECISION_REQUIRED`** — `DETERMINISTIC_READY_FOR_IMPLEMENTATION` **DEĞİLDİR** |

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

### Alternatif 2 — Tek normalize effective-dated üyelik tablosu **(ÖNERİLEN)**

`OfficeWorkPoolMembership`: `poolKind` discriminator + `memberLawyerId` XOR
`memberStaffType`, CHECK ile zorlanmış.

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
| **Boş havuz** | İki ayrı hâl vardır ve **karıştırılmaz**: (a) `asOf`'ta hiç aktif satır yok ama tenant için kayıt var → `EMPTY`; (b) `asOf < cutoverAt` ve satırların tümü `LEGACY_CUTOVER_IMPORT` → `UNKNOWN`. Bkz. §7.6 |
| **Silme** | **Fiziksel DELETE yoktur.** Üyelik ancak kapanır veya iptal edilir. Bu, tarihsel modelin varlık sebebidir |

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

### 7.6 Boş sonuç, `UNKNOWN` ve provenance

```text
resolve(poolKind, asOf, tenantId) → { status, members }

status = RESOLVED  : asOf >= cutoverAt(tenant)  → members (boş olabilir → EMPTY)
status = UNKNOWN   : asOf <  cutoverAt(tenant)  → members = []  +  "kayıt yok"
```

**Bu ayrım tasarımın merkezidir.** `asOf < cutoverAt` için sistem "havuz boştu"
**diyemez** — çünkü bilmiyor (§2.2). `UNKNOWN` dönmek, C8 bulgusu 5'in
("geçmiş tarih icat eden backfill kabul edilemez") doğrudan teknik karşılığıdır.

`cutoverAt(tenant)` türetimi: o tenant'ta `provenance = LEGACY_CUTOVER_IMPORT`
olan satırların `validFrom` değeri (tek snapshot olduğu için tekildir). Ayrı bir
konfigürasyon kolonu gerekmez.

`OD-B02-01` seçenek B veya C'ye giderse bu eşik satır-bazlı olur
(`provenance = OWNER_EVIDENCED_HISTORICAL` satırları için `UNKNOWN` yoktur).

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

#### Seçenek A — Cutover-only effective (ÖNERİLEN)

Tüm mevcut üyeler `validFrom = cutoverAt`, `provenance = LEGACY_CUTOVER_IMPORT`.

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
KİLİTLENDİ Mİ : HAYIR — OD-B02-01 owner kararıdır (§15)
```

Bu doküman A'yı **teknik gerekçesiyle önerir**; owner kararı verilmeden hiçbir
seçenek "karar" olarak kaydedilmemiştir.

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

ADIM 2  CREATE TYPE  (PoolKind, MembershipProvenance)
ADIM 3  CREATE TABLE (§6.2)
ADIM 4  SNAPSHOT     cutoverAt := <migration içinde TEK KEZ hesaplanan
                     deterministik timestamp; her INSERT'te now() ÇAĞRILMAZ>
ADIM 5  BACKFILL     havuz başına INSERT ... SELECT unnest(...)
                     validFrom = cutoverAt, validUntil = NULL, revokedAt = NULL,
                     provenance = 'LEGACY_CUTOVER_IMPORT'
                     Sıra: OP_STAFF_TYPE → ESCALATION_MANAGER → ESCALATION_FOUNDER
                     (sıra semantik taşımaz; determinizm için sabittir)
ADIM 6  CONSTRAINTS  §6.3 CHECK'leri  (veri girdikten SONRA — böylece backfill'in
                     kendisi de constraint tarafından doğrulanır)
ADIM 7  INDEXES      §6.3 partial unique + §6.4 index'ler
ADIM 8  VERIFICATION §8.6 sorguları; mismatch → RAISE EXCEPTION → rollback
```

**Neden `now()` her satırda çağrılmaz:** aynı transaction içinde `now()` sabit
kalsa da, tek bir değişkene alınması niyeti açık kılar ve `cutoverAt`'ın
§7.6'daki eşik türetimi için **tekil** olmasını garanti eder.

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
```

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
         failure İMKÂNSIZ, retry/idempotency katmanı GEREKMEZ.

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
| Partial failure | **Yapısal olarak imkânsız**; ikisi birlikte commit veya birlikte rollback |
| Retry / idempotency | **Gerekmez** — dağıtık yazma yok. (Karşı örnek: outbox/webhook desenleri gereklidir; burada değil) |
| Drift tespiti | §8.6 V2 pariteliği + Aşama 5 gözlem penceresi |
| Sonlandırma koşulu | Aşama 7 tamamlandığında dual-write **kodu silinir** |

**Not (dürüstlük):** dual-write'ın tek gerçek drift kaynağı **out-of-band
yazmalardır** (elle SQL, seed script, başka bir servis). §2.3 taraması bugün
`Office` dizilerine yazan **tek** yolun `updateEscalationSettings` olduğunu
gösterir (`prisma.office.update` çağrıları içinde bu alanları set eden başka
yüzey yoktur) — bu, dual-write'ın kapsanabilir olduğunun ölçülmüş dayanağıdır.

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
mevcutAktif := resolve(poolKind, asOf = now, tenantId)     -- küme
hedef       := payload[poolKind]                            -- küme

eklenecek := hedef \ mevcutAktif   → yeni satır: validFrom = now
çıkarılacak := mevcutAktif \ hedef → mevcut açık satır KAPATILIR
değişmeyen := kesişim              → DOKUNULMAZ  (satır KORUNUR)
```

**"Değişmeyene dokunma" kuralı zorunludur:** naif bir "hepsini kapat, hepsini
yeniden aç" yaklaşımı her kaydetmede tüm üyeliklerin geçmişini parçalar ve
`validFrom`'u anlamsızlaştırır. Bu, replace-all payload'un effective-dated
modele en tehlikeli çevirisidir ve açıkça yasaklanmıştır.

### 11.3 Çıkarılan üye: expire mı, revoke mu?

**Kural:** admin panelinden listeden çıkarma = **`revokedAt = now`**, çünkü bu
bir **irade beyanıdır** (T6), planlanmış bir bitiş değil (T7). `validUntil`
yalnız `OD-B02-04` ile açılırsa (future-dated/planlı bitiş) kullanılır.

Bu ayrım, `PermissionGrant`'ın kaybettiği bilginin B02'de **korunmasıdır** (§12).

### 11.4 Yeni üyenin `validFrom` değeri

`validFrom = now` (yazma anı). Future-dated değer mevcut endpoint ile **ifade
edilemez** — payload düz bir id dizisidir, tarih taşımaz.

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

### 11.5 Race condition ve concurrency

**Mevcut risk (bugün de var):** iki admin aynı anda kaydederse son yazan kazanır;
`Office.updatedAt` dışında bir sürüm kontrolü yoktur.

**Effective-dated modelde risk DEĞİŞİR:** fark hesabı "oku → hesapla → yaz"
olduğu için, iki eşzamanlı istek aynı üyeyi iki kez açabilir.

**Bu tasarımın cevabı — üç katmanlı:**

1. **DB garantisi (birincil):** §6.3 partial unique index, aynı üye için ikinci
   açık satırı `23505` ile reddeder. Yarış **veri düzeyinde kapanır**; uygulama
   bunu tipli bir çakışma hatasına çevirir.
2. **Transaction:** fark hesabı + tüm mutasyonlar **tek** `prisma.$transaction`
   içinde; okuma da aynı transaction içinde yapılır.
3. **Optimistic concurrency (opsiyonel, önerilmez):** `Office`'e `version`
   kolonu eklemek bu senaryo için **gereksizdir**, çünkü (1) zaten kapatıyor.
   Ayrıca repo emsali (`20260802190000` migration şerhi) `version`/CAS eklemenin
   ayrı bir owner kapısı olduğunu kaydeder. **B02 version kolonu önermez.**

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
| R-01 | **Geçmiş tarih uydurulması** | Hukuki/denetsel yanlış beyan | Test: `asOf < cutoverAt` → `status = UNKNOWN` (asla `EMPTY`). Migration testi: tüm backfill satırları `LEGACY_CUTOVER_IMPORT` ve tek `validFrom` (V7) |
| R-02 | **Tenant data leakage** | Kritik | Test: başka tenant'ın üyesi hiçbir `asOf`'ta görünmez. Migration V6. FK `Lawyer(id, tenantId)` |
| R-03 | **Interval overlap** (kapalı aralıklar — index kapatmaz) | Belirsiz havuz | Fark hesaplayıcı birim testleri + V5 sorgusu bir izleme kontrolü olarak periyodik koşar. `btree_gist`/EXCLUDE **ayrı** sertleştirme kalemi (repo-novel) |
| R-04 | **Dual-write drift** | İki gerçek | Aşama 5 gözlem penceresi; V2 pariteliği; çıkış koşulu `DRIFT = 0` |
| R-05 | **Partial migration** | Yarım şema | Tek transaction + preflight RAISE (§8.4). "Kısmi durum YOK" ilkesi |
| R-06 | **Invalid / orphan / cross-tenant member ID** | Migration fail veya sessiz kayıp | ADIM 1 preflight; **sessiz düşürme YASAK**; anomali → owner'lı pre-clean kapısı |
| R-07 | **Concurrent admin update** | Çift üyelik | Partial unique index (`23505`) + tek transaction; tipli çakışma hatası (§11.5) |
| R-08 | **Timezone boundary** | Yanlış `asOf` | Sözleşme: yalnız UTC instant; yerel tarih→instant dönüşümü B02 kapsamı dışı (§7.3). Test: sınır anında (`validFrom` tam eşitliği) dahil, `validUntil` tam eşitliğinde hariç |
| R-09 | **Revocation/expiry karışıklığı** | Denetim kaybı | Ayrı kolonlar + §11.3 kuralı + test: revoke edilen üye `asOf < revokedAt`'ta **hâlâ** havuzda |
| R-10 | **Legacy reader'ın kaldırılmadan bozulması** | 4 bounded context'te bildirim kaybı | Aşama 6 flag'i; §2.3'teki **altı** yüzeyin her biri için ayrı taşıma kanıtı; `OD-B02-03` |
| R-11 | **Rollback sonrası iki modelin ayrışması** | Sessiz tutarsızlık | Aşama 1-5'te legacy authoritative olduğu için rollback ucuz. Aşama 6 sonrası rollback → önce projeksiyondan legacy'yi yeniden üret, sonra flag'i çevir (sıra bağlayıcıdır) |
| R-12 | **Allowlist projeksiyonu + tam-form POST veri silmesi** | **Veri kaybı** | §11.4 tuzağı: okuma yolu değiştirilmeden allowlist güncellenmez; değiştirilecekse allowlist **aynı PR'da** güncellenir + regresyon testi |
| R-13 | **Nullable üye çifti (Alternatif 2'nin kabul edilen bedeli)** | Geçersiz satır | 5 CHECK constraint (§6.3) + uygulama tarafında discriminated union |

---

## 15. Owner'a açık kararlar

### `OD-B02-01` — Historical-start / backfill policy **(ZORUNLU)**

| Seçenek | Ne demek | Etkisi |
|---|---|---|
| **A (ÖNERİLEN)** | Tüm mevcut üyeler yalnız `cutoverAt`'ten itibaren effective; cutover öncesi için **iddia kurulmaz** | Veri doğruluğu en yüksek; `asOf < cutoverAt` sorguları `UNKNOWN`; uygulama en basit; geri dönüş en kolay; B'ye sonradan geçişi **engellemez** |
| **B** | Kanıtlanabilen üyeler owner tarihiyle, kalanlar cutover'dan | Kanıt kalitesine bağlı; migration'a deterministik olmayan girdi girer; **ön koşulu bu oturumda mevcut değil** (repository'de owner tarih kaydı yok) |
| **C** | Unknown-origin legacy provenance modeli | Resolver davranışı A ile aynı; ek maliyeti nullable `validFrom` (resolver + index karmaşıklığı). C'nin tek gerçek katkısı olan `provenance` etiketi **zaten A'nın içindedir** |

**Teknik öneri:** **A**. Gerekçe: tek kanıt-uyumlu seçenek olması, en düşük
karmaşıklık, ve B'ye ileri uyum.

### `OD-B02-02` — Havuz kapsamı

Model, yapısal olarak **aynı** olan beş alanı taşıyabilir. B02'nin
adlandırılmış kapsamı üçtür.

- **(a)** Yalnız 3 alan taşınır; `escalationTeamLeadLawyerIds` (`schema.prisma:2415`)
  ve `poaExpiryRecipientLawyerIds` (`:2424`) düz liste olarak **kalır**
  → sistemde **iki farklı havuz modeli** aynı anda yaşar.
- **(b)** Beşi birlikte taşınır → tek model, tek desen; ancak kapsam WR01
  dışına (`AUTOMATION`, dosya görevi eskalasyonu) taşar.

**Teknik öneri:** **(a)** — kapsam disiplini. Model (b)'yi schema değişikliği
olmadan destekler; ikinci taşıma ayrı ve ucuz bir iş olur.

### `OD-B02-03` — WR01 dışı tüketicilerin okuma cutover'ı

§2.3'te ölçülen **altı** okuma yüzeyinin **dördü WR01 dışıdır**
(`ESCALATION` ×2, `AUTOMATION`, `CLIENT-NOTIFICATION`).

- **(a)** Cutover'da **hepsi** resolver'a taşınır → tek gerçek; ama üç modülün
  davranışı aynı anda değişir.
- **(b)** Yalnız WR01 tüketicileri resolver'ı okur; diğerleri legacy
  projeksiyondan okumaya devam eder → legacy kolonlar **süresiz** yaşar ve §9.2
  Aşama 7 **hiç gelmez**.

**Teknik öneri:** **(a)**, Aşama 6 flag'iyle. (b) "süresiz iki source-of-truth"
sonucunu doğurur ve owner'ın 4. koşuluyla çelişir.

### `OD-B02-04` — Future-dated yazma yüzeyi WR01 kapsamında mı?

Model future-dated kaydı **destekler** (§6.5). Soru, WR01'de **admin'in bunu
kullanabilecek olup olmadığıdır**.

- **(a)** Hayır — yazma yüzeyi immediate-effect kalır (`validFrom = now`),
  tarih ekseni yalnız **geçmiş biriktirir**. Mevcut endpoint/DTO/panel **hiç
  değişmez**.
- **(b)** Evet — yeni endpoint + yeni DTO (+ class DTO zorunluluğu, §11.1
  şerhi) + B08 ekran işi.

**Teknik öneri:** **(a)** WR01 için; (b) ayrı bir blok/karar olarak
kaydedilir. Gerekçe: (b), B02'yi B08 UI işine bağımlı kılar ve blok sınırını
bulanıklaştırır.

> Repository incelemesinde owner kararı gerektiren **başka** bir nokta
> saptanmamıştır. Teknik olarak belirlenebilir olan konular (revocation kolonu,
> aralık semantiği, index stratejisi, transaction sınırı, resolver imzası,
> silinmiş/pasif kullanıcı davranışı, concurrency yanıtı) **bu dokümanda
> karara bağlanmış**, owner'a sorulmamıştır.

---

## 16. Terminal disposition

```text
STATÜ                     DESIGN_COMPLETE / OWNER_DECISION_REQUIRED
ÖNERİLEN MODEL            Alternatif 2 — tek normalize effective-dated üyelik tablosu
KALICI SOURCE-OF-TRUTH    Yeni effective-dated tablo (cutover sonrası okuma+yazma)
LEGACY ALANLARIN ROLÜ     Transition-only projection; Aşama 7'de retire
GEÇİŞ MODELİ              7 aşama; dual-write tek ACID transaction'da ve SÜRELİ
BACKFILL SEÇENEKLERİ      A / B / C
ÖNERİLEN BACKFILL         A (provenance etiketiyle)
AÇIK OWNER KARARLARI      OD-B02-01 · OD-B02-02 · OD-B02-03 · OD-B02-04
ADMIN YAZMA UYUMU         KORUNUR — PUT /office/escalation-settings sözleşmesi değişmez
B09 İLİŞKİSİ              YALNIZ EMSAL/PATTERN — dependency KAPANMADI, status mutation YOK
ÜRETİLEN SCHEMA           YOK — Prisma modeli/migration/SQL dosyası YAZILMADI
ÜRETİLEN KOD              YOK
DB / PRODUCTION MUTATION  YOK
```

### 16.1 Neden `DETERMINISTIC_READY_FOR_IMPLEMENTATION` değil

`OD-B02-01` (historical-start/backfill politikası) bu sayfada **owner'a açık
bırakılmıştır** ve repository'de bu kararı veren ratifiye edilmiş bir kayıt
**yoktur** (`decision-log.md` WR01 kaydı `EXECUTION AUTHORITY: NONE` der;
D-WR-1..6 havuz tarihçesi hakkında hüküm içermez). `OD-B02-02/03/04` ise kapsam
ve cross-program etki kararlarıdır.

Karar alınmadan implementasyona geçilemez, çünkü:

- `OD-B02-01` **migration'ın gövdesini** belirler (backfill'in `validFrom`
  değeri ve `provenance` dağılımı);
- `OD-B02-02` **enum içeriğini** ve migration'ın taradığı kolon kümesini belirler;
- `OD-B02-03` **hangi modüllerin** değiştiğini ve dolayısıyla PR sınırını belirler;
- `OD-B02-04` **DTO ve endpoint yüzeyini** belirler.

### 16.2 Sonraki adım

```text
PAGE-O0 → §15'teki dört kararın owner tarafından ratifiye edilmesi.
Implementation için AYRI ve AÇIK owner GO zorunludur.
Bu doküman implementation GO'su İÇERMEZ.
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
