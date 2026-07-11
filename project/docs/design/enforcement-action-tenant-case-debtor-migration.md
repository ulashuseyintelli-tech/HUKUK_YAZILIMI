# EnforcementAction Tenant + CaseDebtor Migration — Design Specification

**Tarih:** 2026-07-11 · **Statü:** GO-DOCS (design-only; schema/migration/runtime/test/veri değişikliği yok) · **Soy:** MPB-028 kapanışında (PR #1027, decision-log 2026-07-10) ID'siz PROPOSED bırakılan takip maddesi (c) — "`EnforcementAction.caseDebtorId`+`tenantId` migration". GO-ANALYZE (2026-07-11) bu maddenin tam kapsamını çıkardı; bu belge o analizin kalıcı tasarım kaydıdır.

**Bu belge implementasyon başlatmaz.** Yalnız `PR-EA-1 — Design / Governance` halkası için GO-COMPLETE yetkisi taşır (Bölüm 15). `PR-EA-2` ve sonrası her biri ayrı, açık owner GO-IMPLEMENT gerektirir.

---

## 1. Problem Statement

Bugünkü model şu soruyu güvenilir şekilde yanıtlayamaz: **"Bu icra/haciz aksiyonu dosyadaki hangi borçluya karşı uygulandı?"** Çok borçlulu (co-borçlu) dosyalarda hukuki/finansal aksiyon geçmişi yalnız dosya (Case) seviyesinde tutulur, borçlu (CaseDebtor) seviyesinde değil. Bu eksiklik: (a) çok borçlulu dosyalarda yanlış hukuki ilişkilendirme riski taşır, (b) gelecekteki borçlu-seviyesi scoring/digital-twin tüketicilerinde (örn. DEBTOR-SCORING-CANON'un olası ileri fazları) hatalı veri kullanımına açık kapı bırakır, (c) tenant güvenliğini yalnız parent `Case` ilişkisi üzerinden dolaylı bırakır.

## 2. Current Ground Truth

`EnforcementAction` (`schema.prisma:2469-2489`, fiziksel migration SQL'de birebir doğrulandı — baseline + `20251208175623_add_automation_models` archive): `id, caseId → Case (Cascade), type (EnforcementType), status (EnforcementStatus), targetType, targetDetails (Json?), requestDate, responseDate, responseDetails, amount, notes, documentPath, timestamps`.

```text
caseId içeriyor
tenantId içermiyor
caseDebtorId içermiyor
```

Doğrudan bir tenant veya belirli bir `CaseDebtor` ilişkisi bulunmuyor. `CaseDebtor`'un kendisi de doğrudan `tenantId` taşımıyor — tenant yalnız `CaseDebtor.caseId → Case.tenantId` üzerinden iki-adımlı erişilir (`schema.prisma:1289-1385`). `Case` doğrudan `tenantId` taşır (`schema.prisma:979-982`).

**2026-07-11 taze doğrulama (bu GO-DOCS turunda tekrar kontrol edildi, SC-1/SC-2/SC-3):** Model bloğu değişmedi; `apps/api/src` genelinde `enforcementAction.create/createMany/upsert` için tek eşleşme hâlâ `workflow-engine.service.ts:317`; `apps/api/prisma/seed*.ts`, `apps/api/scripts/seed-*.ts`, `apps/api/src/modules/seed/`, `apps/api/src/scripts/*-seed.ts` dosyalarının HİÇBİRİ `enforcementAction`/`EnforcementAction` referansı içermiyor (grep, sıfır eşleşme). Alternatif üretici bulunmadı.

## 3. Producer / Consumer Map

**Tek doğrulanmış üretici (tüm repo):** `WorkflowEngine.createEnforcementAction(caseId, type)` (`workflow-engine.service.ts:317`). Write-path yalnız şunu yazar:

```text
caseId
type
status
requestDate
```

`tenantId`, `caseDebtorId` ve `targetDetails` üzerinden borçlu ilişkisi üretmiyor. Önündeki `.findFirst` duplicate-guard'ı (satır 309, RFA-007) yalnız `caseId+type+status.in([PENDING,REQUESTED,IN_PROGRESS,PARTIAL])` kullanıyor; `@@unique([caseId,type])` bilinçli olarak yok (kod yorumu: CANCELLED/FAILED sonrası meşru tekrar mümkün). Çağrı zinciri: `executeRule` (233) → `processCase` (119) → `AutomationController.processCase` endpoint'i + iki cron (`processPendingCases` 5-dk, `checkNotificationExpiries` saatlik). **Hiçbir `.update/.delete/.upsert` yok** — model append-only bir olay geçmişi.

**Doğrulanmış tüketiciler:**

| Tüketici | Parent Case tenant-scoped mi | Fiilen kullanılıyor mu |
|---|---|---|
| `AiService.getCaseWithDetails` → `buildSuggestionPrompt` | EVET (`where:{id,tenantId}`) | EVET — `type:status` LLM prompt'una render ediliyor |
| `RiskService.analyzeCase` | EVET (`where:{id,tenantId}`) | **HAYIR — dead read** (tüm scoring fonksiyonları taranmış, hiçbiri `enforcementActions` okumuyor) |
| `WorkflowEngine.buildContext` | **HAYIR — `where:{id}` yalnız** | **HAYIR — dönen `RuleContext`'e taşınmıyor** (dead read) |

Kanonik yorum: AI ve Risk tüketicileri parent `Case` üzerinden tenant-scoped çalışıyor. `WorkflowEngine.buildContext` yalnız `id` ile Case okuyor ve tenant guard içermiyor; `GET /automation/cases/:id/context` endpoint'i bu tenant'sız yolu doğrudan çağırıyor. **Bu tenant guard açığı yalnız `EnforcementAction`'a özgü değildir** — `buildContext`'in okuduğu HER alan aynı boşluğu taşır; ayrı bir güvenlik workstream'i olarak kaydedilmelidir (Bölüm 5, OD-3).

**Collection/asset-query tüketicisi:** VERIFIED YOK — bu servislerin hiçbiri `EnforcementAction` okumuyor.

**Raporlama/FE:** `report.service.ts` `enforcementActions` include etmiyor (VERIFIED). FE tarafında gerçek bir `enforcementActions` dizisi hiçbir yerde render edilmiyor; FE yalnız var olmayan bir alanı (`lastEnforcementActionAt`, 4 dosyada) okuyor — bu alan ne `schema.prisma`'da ne `case.service.ts`'in `findOne` include'unda ne başka hiçbir backend yanıtında mevcut (phantom/dead field, bu migration'ın kapsamı dışı — Bölüm 5, OD-5).

## 4. Tenant Isolation Analysis

Bugün fiili sızıntı **YOK** (VERIFIED): AI/Risk tüketicileri zaten parent `Case`'i `tenantId` ile sorguluyor, `enforcementActions` include'u bu tenant-scoped Case'in alt-satırı olarak transitif güvenlik kazanıyor. **Yapısal risk VAR:** `WorkflowEngine.buildContext`'in tenant'sız deseni, ileride bir `EnforcementAction`-özel endpoint/servis bu deseni kopyalarsa IDOR riski taşır. Bu migration doğrudan `tenantId` kolonunu ekler ama **tenant sınırını yalnız kolon varlığına indirgemez** — her read/write path `tenantId`+`caseId`+`caseDebtorId` üçlüsünü birlikte doğrulamalıdır (Bölüm 9.1).

## 5. CaseDebtor Attribution Risk

`EnforcementAction`'dan `CaseDebtor`'a **hiçbir FK/join yolu yok** — ne doğrudan ne dolaylı (Collection/Tebligat'ın aksine, ikisi de `caseDebtorId` taşır). `targetDetails: Json?` teorik olarak borçlu bilgisi taşıyabilirdi ama tek üretici bu alanı hiç doldurmuyor (`data`'da yok) — bugüne kadarki her satırda muhtemelen `null`. Gerçek içerik yalnız PR-EA-3'ün veri profillemesiyle doğrulanır (Bölüm 7, SC-3).

Çok borçlulu dosyalarda ayırt edici sinyal (tek ACTIVE, tek ASIL_BORCLU) yalnız **INFERABLE** düzeyde güven taşır, hukuki kesinlik SAĞLAMAZ — bkz. Bölüm 7 ve İlke 9.7.

## 6. Target Schema

```prisma
model EnforcementAction {
  id             String      @id @default(cuid())
  tenantId       String
  tenant         Tenant      @relation(
    fields: [tenantId],
    references: [id],
    onDelete: Cascade
  )
  caseId         String
  case           Case        @relation(
    fields: [caseId],
    references: [id],
    onDelete: Cascade
  )
  caseDebtorId   String?
  caseDebtor     CaseDebtor? @relation(
    fields: [caseDebtorId],
    references: [id],
    onDelete: Restrict
  )
  type            EnforcementType
  status          EnforcementStatus @default(PENDING)
  targetType      String?
  targetDetails   Json?
  requestDate     DateTime?
  responseDate    DateTime?
  responseDetails Json?
  amount          Decimal?          @db.Decimal(15, 2)
  notes           String?
  documentPath    String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@index([tenantId])
  @@index([caseId])
  @@index([caseDebtorId])
  @@index([tenantId, caseId])
  @@index([type])
  @@index([status])
}
```

**Bu nihai hedef şemadır.** İlk additive migration'da `tenantId` nullable başlayabilir (Bölüm 8, D2). Desen `Collection.caseDebtorId`/`Tebligat.caseDebtorId` (DBND-D5B/D5C) emsaliyle birebir tutarlıdır: nullable + `onDelete: Restrict` — finansal/hukuki iz kaydı sessizce bağ koparmasın/silinmesin. **Unique constraint EKLENMEZ** (Bölüm 8, D11).

## 7. Backfill Classification

| Sınıf | Tanım | Otomatik yazım |
|---|---|---|
| `TENANT_DETERMINISTIC` | `Case.tenantId` üzerinden çıkarılabilir | Evet |
| `CASE_DEBTOR_DETERMINISTIC` | Case üzerinde tek `CaseDebtor` var | Evet |
| `INFERABLE` | Tek ACTIVE veya tek ASIL_BORCLU gibi dolaylı sinyal var | Hayır |
| `AMBIGUOUS` | Birden fazla hukuken makul aday var | Hayır |
| `ORPHAN` | Case var, CaseDebtor yok | Hayır |
| `INTEGRITY_FAILURE` | Case FK veya tenant zinciri bozuk | Hard stop |

`INFERABLE`, hiçbir dokümanda `DETERMINISTIC` olarak adlandırılmaz (Bölüm 9.2, D5/D6).

## 8. Migration Phases (Frozen Decisions D1-D12)

**D1 — Migration gereklidir.** `tenantId: REQUIRED` (alan olarak), `caseDebtorId: REQUIRED AS A FIELD` — ancak kolonun varlığı zorunlu olmakla birlikte her eski kayıt için değerinin doldurulması zorunlu değildir.

**D2 — Additive-first.** İlk runtime migration: `tenantId String?`, `caseDebtorId String?` — nullable, backward-compatible. Doğrudan ilk migration'da destructive veya NOT NULL hardening yapılmaz.

**D3 — tenantId backfill'i deterministiktir.** `EnforcementAction.caseId → Case.id → Case.tenantId` zinciriyle **%100 deterministic**. Dangling Case FK tespit edilirse migration durur (`INTEGRITY_FAILURE`).

**D4 — caseDebtorId yalnız deterministik kayıtlarda otomatik yazılır.** Otomatik backfill yalnız Case üzerinde tam olarak 1 `CaseDebtor` bulunduğunda yapılır (`CASE_DEBTOR_DETERMINISTIC`).

**D5 — Inferable, deterministic değildir.** Tek ACTIVE CaseDebtor / tek ASIL_BORCLU / tek aktif görünen borçlu yalnız `INFERABLE` sinyalidir; owner/hukuki inceleme olmadan `caseDebtorId`'ye otomatik yazılamaz.

**D6 — Ambiguous kayıtlarda guess yasaktır.** Birden fazla hukuken makul aday varsa `caseDebtorId = NULL` kalır. Tahmin, ilk kayıt, en eski kayıt, ASIL_BORCLU önceliği veya ACTIVE önceliği ile otomatik seçim yapılamaz.

**D7 — Orphan kayıtlar ayrı veri bütünlüğü konusudur.** Case var fakat hiçbir CaseDebtor yoksa `ORPHAN` olarak raporlanır; bu migration kapsamında sentetik CaseDebtor üretilmez.

**D8 — caseDebtorId kalıcı olarak nullable kalabilir.** Mevcut veride ambiguous/orphan kayıt ihtimali nedeniyle `caseDebtorId NOT NULL` hedefi bu workstream için zorunlu değildir.

**D9 — tenantId sonradan NOT NULL yapılacaktır.** Backfill ve doğrulama tamamlandıktan sonra ayrı bir hardening PR'ında (`PR-EA-5`) uygulanabilir. Bu docs PR'ı hardening yetkisi vermez.

**D10 — FK delete davranışı Restrict olacaktır.** `caseDebtorId` ilişkisi `onDelete: Restrict` — hukuki aksiyon geçmişi, CaseDebtor silinmesi nedeniyle sessizce koparılamaz veya silinemez.

**D11 — Unique constraint eklenmeyecektir.** `caseId+type`, `caseDebtorId+type`, `tenantId+caseId+type` türü unique constraint yasaktır — CANCELLED/FAILED sonrası aynı aksiyonun yeniden oluşturulması meşru olabilir.

**D12 — Consumer switch yoktur.** Bu migration AI davranışını değiştirmez, Risk skorunu değiştirmez, scoring engine'e EnforcementAction eklemez, otomatik aksiyon üretmez, DEBTOR-SCORING Phase 3 consumer-switch yetkisi vermez.

**Faz sırası:**

```text
Adım 1 — Additive (D2):            tenantId?, caseDebtorId? + FK'ler + index'ler
Adım 2 — Backfill (D3/D4/D6/D7):    TENANT_DETERMINISTIC + CASE_DEBTOR_DETERMINISTIC otomatik;
                                    INFERABLE/AMBIGUOUS/ORPHAN NULL kalır + rapor
Adım 3 — Guarded write-path (D10):  yeni yazımlar tenantId + doğrulanmış caseDebtorId taşır
Adım 4 — Constraint hardening (D9): tenantId NOT NULL (yalnız backfill %100 + yeni yazım
                                    garantisi sonrası); caseDebtorId KALICI nullable (D8)
```

## 9. Write-Path Validation

`WorkflowEngine.createEnforcementAction` (PR-EA-4): `tenantId` yazmalı; `caseDebtorId` verildiyse bunun **aynı tenant ve aynı Case altında** olduğunu doğrulamalı; cross-case veya cross-tenant ilişkiyi reddetmelidir. Mevcut satırların (`caseDebtorId=null`) okunabilirliği korunmalıdır.

## 10. Read Compatibility

Mevcut 3 tüketici (`AiService`, `RiskService`, `WorkflowEngine.buildContext`) yeni alanlar eklendikten sonra **değişmeden** çalışmaya devam eder — `caseDebtorId`/`tenantId` opsiyonel alanlardır, mevcut include şekli bozulmaz. `caseDebtorId=null` satırlar backward-compatible okunabilir kalır.

## 11. Delete Semantics

Hukuki aksiyon geçmişi `CaseDebtor` silinince sessizce `SetNull` olmamalı, `Cascade` ile silinmemelidir — bu nedenle `Restrict` tercih edilir (D10). `Case` silinirse `EnforcementAction` zaten `Cascade` ile silinir (mevcut davranış, değişmez).

## 12. Testing Strategy

**Schema testleri:** FK oluşumu, index doğrulaması, nullable compatibility, `Restrict` delete davranışı.

**Write-path testleri:** doğru tenant + doğru CaseDebtor; cross-tenant CaseDebtor reddi; başka Case'e ait CaseDebtor reddi; `caseDebtorId=null` backward compatibility; `tenantId`'nin producer tarafından zorunlu yazılması.

**Backfill testleri:** tek CaseDebtor → `CASE_DEBTOR_DETERMINISTIC`; tek ACTIVE ama çok kayıt → `INFERABLE`, yazılmaz; tek ASIL_BORCLU ama çok kayıt → `INFERABLE`, yazılmaz; iki ACTIVE → `AMBIGUOUS`; sıfır CaseDebtor → `ORPHAN`; dangling Case → `INTEGRITY_FAILURE`.

**Consumer regresyonu:** AI mevcut davranışını korur; Risk mevcut davranışını korur; eski `caseDebtorId=null` kayıtlar okunabilir; consumer switch oluşmaz.

## 13. Operational Verification

Backfill öncesi zorunlu doğrulama: (a) dangling-FK integrity check (`LEFT JOIN Case ... WHERE Case.id IS NULL` → beklenen 0), (b) `targetDetails` gerçek içeriğinin veri profillemesi (SC-3). Hardening (`PR-EA-5`) öncesi zorunlu koşullar: `tenantId null count = 0`, dangling tenant reference = 0, yeni write-path her zaman `tenantId` yazıyor, CI PASS.

## 14. Stop Conditions

**SC-1 — Analizle çelişen schema ground truth.** Mevcut modelde sonradan eklenmiş `tenantId`/`caseDebtorId`/eşdeğer debtor relation bulunursa docs yazımı durur, fresh analysis gerekir. *(2026-07-11'de tekrar kontrol edildi — VERIFIED, çelişki yok.)*

**SC-2 — Alternatif üretici tespiti.** `WorkflowEngine` dışında raw SQL/seed/import/script/admin tool/background job ile EnforcementAction üreten aktif bir yol bulunursa tasarım yeniden değerlendirilmeden devam edilmez. *(2026-07-11'de tekrar kontrol edildi — VERIFIED, bulunamadı.)*

**SC-3 — targetDetails içinde gerçek debtor kimliği.** Mevcut kayıtlarda güvenilir/standartlaştırılmış debtor identifier bulunduğu kanıtlanırsa backfill sınıflandırması yeniden açılır; bu veri görülmeden inferable kayıt deterministic sayılamaz. *(Kod-düzeyinde hiçbir üretici bu alanı doldurmuyor — VERIFIED; gerçek DB içeriği PR-EA-3'ün kendi kapsamıdır, bu GO-DOCS turunda DB'ye erişilmedi.)*

**SC-4 — Governance conflict.** decision-log/product-backlog ID çakışması, Master Register semantic conflict, mevcut owner kararıyla çelişki durumunda owner kararı olmadan çözüm yapılmaz. *(2026-07-11'de tekrar kontrol edildi — VERIFIED, çakışma yok; `EnforcementAction` migration'ı hiçbir yerde ayrı ID almamış, yalnız MPB-028 prose follow-up (c) olarak duruyordu.)*

**SC-5 — Scope expansion.** Docs turunda schema/migration/runtime/test/frontend değişikliği gerekirse durulur. *(Bu tur boyunca tetiklenmedi.)*

## 15. Owner Decisions (NİHAİ)

**OD-1 — INFERABLE politikası:** INFERABLE kayıtlar otomatik yazılmayacak; owner/legal review listesine alınacak; inceleme yapılmazsa NULL kalacak.

**OD-2 — Ambiguous oranı:** Sabit yüzde eşiği governance kararı olarak dondurulmayacak. Backfill öncesi gerçek veri profili çıkarılacak; rapor en az şunları içerecek: `total records`, `deterministic count`, `inferable count`, `ambiguous count`, `orphan count`, `percentage by class`. Ambiguous/orphan kayıt bulunması tek başına hard stop değildir; ancak gerçek veri profili owner'a sunulmadan backfill merge edilemez.

**OD-3 — WorkflowEngine tenant guard:** `WorkflowEngine.buildContext`'in tenant guard boşluğu ayrı bir security workstream olarak açılacak; bu migration docs PR'ına runtime düzeltmesi eklenmeyecek; bulgu MPB-028(c) altında gizlenmeyecek, ayrı takip kaydı açılacak.

**OD-4 — RiskService dead include:** `RiskService`'teki kullanılmayan `enforcementActions` include'u bu migration kapsamında kaldırılmayacak; ayrı küçük maintenance cleanup adayı olarak kaydedilecek.

**OD-5 — FE phantom field:** `lastEnforcementActionAt` phantom field bu migration kapsamında düzeltilmeyecek; backend field üretimi veya FE cleanup kararı ayrı workstream'de ele alınacak.

## 16. PR Sequence

```text
PR-EA-1 (Design / Governance)         — bu görev; design spec + owner decisions +
                                         product-backlog/decision-log linkage
PR-EA-2 (Additive Schema Migration)   — tenantId?/caseDebtorId? + Tenant FK + CaseDebtor FK
                                         (Restrict) + index'ler. YASAK: backfill, NOT NULL,
                                         consumer behavior change
PR-EA-3 (Data Profiling + Backfill)   — tenantId deterministic backfill + tek-CaseDebtor
                                         deterministic backfill + class distribution report +
                                         inferable/ambiguous/orphan export. YASAK: guess,
                                         inferable auto-write, synthetic CaseDebtor creation
PR-EA-4 (Dual Write / Guarded Write)  — WorkflowEngine.createEnforcementAction tenantId yazar +
                                         caseDebtorId doğrulanır (aynı tenant/Case); eski
                                         kayıtlar okunabilir kalır
PR-EA-5 (Tenant Constraint Hardening) — yalnız tenantId null count=0 + dangling tenant
                                         reference=0 + yeni write-path her zaman tenantId
                                         yazıyor + CI PASS sonrasında tenantId NOT NULL
PR-EA-6 (Cleanup / Follow-Up)         — WorkflowEngine.buildContext tenant guard (OD-3),
                                         RiskService dead include (OD-4), FE phantom field
                                         (OD-5) — ayrı işler, tek PR'a zorunlu birleştirilmez
```

## 17. Out-of-Scope Findings

- `WorkflowEngine.buildContext`'in tenant'sız `Case.findUnique({id})` deseni — yalnız EnforcementAction'a özgü değil, buildContext'in okuduğu HER alanı etkiler; `GET /automation/cases/:id/context` bu yolu doğrudan çağırıyor (OD-3).
- `RiskService.analyzeCase`'in `enforcementActions` include'u fiilen hiçbir scoring fonksiyonunda kullanılmıyor (dead read, OD-4).
- FE `lastEnforcementActionAt` alanı backend'de hiçbir yerde üretilmiyor (phantom/dead field, 4 dosyada: `cases/[id]/page.tsx`, `page-v2.tsx`, `v2/page.tsx`, `CaseHeader.tsx`, ayrıca `packages/types/src/case.ts`) (OD-5).

## 18. Final Verdict

```text
ENFORCEMENT-ACTION MIGRATION VERDICT:
- Migration required: YES (caseDebtorId + tenantId, her ikisi de bugün eksik)
- Additive first: YES (D2)
- Backfill deterministic: PARTIAL — tenantId %100 deterministik (D3); caseDebtorId yalnız
  tek-CaseDebtor'lu dosyalarda deterministik (D4), çok-borçlulularda INFERABLE/AMBIGUOUS
- Ambiguous records possible: YES (targetDetails hiçbir üretici tarafından doldurulmuyor)
- Tenant isolation risk: TODAY NONE (AI/Risk zaten parent Case'i tenant-scoped okuyor);
  YAPISAL RİSK VAR (WorkflowEngine.buildContext, OD-3 — ayrı workstream)
- GO-DOCS ready: YES
- GO-IMPLEMENT ready: NO — additive migration (PR-EA-2) için ayrı owner GO gerekir; backfill
  (PR-EA-3) daha sonraki, ayrı bir owner GO ister
- Owner decisions: OD-1 — OD-5 (Bölüm 15)
```

**Tek cümlelik kanonik sonuç:** EnforcementAction'ın tenant ve dosya borçlusu bağları additive-first bir migration hattıyla kurulacak; tenant ilişkisi deterministik olarak backfill edilecek, CaseDebtor ilişkisi ise yalnız hukuken kesin kayıtlarda yazılacak ve hiçbir ambiguous kayıt tahminle bağlanmayacaktır.

---

**İlgili kayıtlar:** MPB-028 (P0 security fix, PR #1027 — follow-up (c) soyu) · `debtor-scoring-canonicalization.md` (Case-level v1 kararı, aynı "guess yerine DATA_GAP" ilkesi) · `legal-time-authority-rebase.md` (additive-first + backfill ayrı owner onayı deseni) · `Collection`/`Tebligat` modelleri (DBND-D5B/D5C — `caseDebtorId String?` + `onDelete: Restrict` emsali).
