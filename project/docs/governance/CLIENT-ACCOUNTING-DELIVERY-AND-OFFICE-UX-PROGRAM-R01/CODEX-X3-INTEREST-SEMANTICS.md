# X3 — FAİZ SEMANTİĞİ (P7)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    CODEX-X3         LANE OWNER: CODEX
PREDECESSOR:  C1-B01 (B01 analiz için)  ·  C3 (B02+ uygulama için — XL-C)
SUCCESSOR:    C1-B03 (UAT)
MUTATION:     B01 docs-only · B02+ ŞEMA + BACKEND
MIGRATION OWNER: X3 — programda TEK aktif migration görevi

ALLOWED PATHS:
  B01: project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/
  B02+: project/apps/api/prisma/                              (yalnız X3 migration paketi)
        project/apps/api/src/modules/client-statement/**      (C3 MERGE EDİLDİKTEN SONRA)

FORBIDDEN PATHS:
  apps/api/src/modules/client-financial-disclosure/**         (X2)
  apps/web/**                                                 (C1 · C2 · X1)
  project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/

BLOCK ORDER (DEĞİŞTİRİLEMEZ):
  X3-B01 → X3-B02 → X3-B03
BLOCKS TOTAL: 3   COMPLETED: 3   REMAINING: NONE
ACTIVATION DEBT: X3 migration production APPLY · CLIENT_STATEMENT_MONTHLY_DELIVERY activation · real DB/runtime UAT
CURRENT DISPOSITION: ENGINEERING_COMPLETE / ACTIVATION_PENDING
NEXT ELIGIBLE: NONE WITHIN X3 — C1-B03 fresh main'de RUNTIME_VERIFIED; program devamı ayrı lane sırasından türetilir
PROGRAM LOCK: CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## CROSS-LANE BAĞ — XL-C (neden X3 uygulaması C3'ün ardılı)

X3'ün ürün etkisi `client-statement` servisine ve ekstre PDF renderer'ına satır tipi
eklemektir — **C3 ile aynı dosyalar**. Paralel açılırsa gerçek same-file competing
writer doğar.

```text
X3-B01  docs-only  → C3 ile PARALEL yürür (kesişim yok)
X3-B02  şema       → C3 canonical ENGINEERING_COMPLETE / ACTIVATION_PENDING;
                     terminal handoff doğrulandı, migration paketi tamamlandı
X3-B03  entegrasyon→ C3 writer handoff sonrası sıradaki eligible blok
```

---

## OWNER POLİTİKASI (bu hattın çekirdeği)

```text
POL-2  Tahakkuk etmiş fakat TAHSİL EDİLMEMİŞ faiz:
       INFORMATIONAL / NON-CASH. Açılış ve kapanış bakiyesini DEĞİŞTİRMEZ.

POL-3  TAHSİL EDİLMİŞ faiz:
       Yalnız gerçek POSTED Collection/Disposition zincirinden sonra ve gerçek
       allocation oranında müvekkil bakiyesine yansır.
```

Bu iki kural birlikte **çift-sayımı yapısal olarak imkânsızlaştırır**. Şemada emsali
zaten var: `COLLECTION_OFFSET_ADVANCE` yorumu — *"BİLGİ; bakiye etkisi
BalanceLedger'dan, çift-sayım yok"*. X3 aynı deseni faize uygular.

---

## X3-B01 — FAİZ SEMANTİĞİ ANALİZİ VE MEVCUT AUTHORITY TESPİTİ  *(docs-only)*

**Tespit edilecekler**

```text
1. Başka modülde MEVCUT bir faiz authority'si var mı?
   Varsa CLIENT YENİDEN HESAPLAMAZ — yalnız canonical sonucu PROJEKTE EDER.
   Bu tespit exact dosya/fonksiyon referansıyla yapılır.
2. Faiz hangi olaydan doğuyor (temerrüt / avans / gecikme) — repository kanıtıyla.
3. Tahsil edilmiş faizin POSTED zincirdeki taşıyıcısı hangi kayıt?
4. Mevcut enum'lardaki boşluğun teyidi:
   ClientStatementLineType (17 üye) ve CollectionDispositionLineType (7 üye) —
   ikisinde de faiz YOK (baseline c867c18a).
```

**Kural:** faiz hesaplama politikası **UYDURULMAZ**. Kanonik kaynak bulunamazsa
exact teknik boşluk raporlanır ve blok `WAITING_FOR_OWNER_DECISION` olur —
diğer hatlar durmaz (master plan §8-A).

**BLOCK RESULT:** `ANALYSIS_DELIVERED`

Fresh code-evidence sonucu:

- Canonical hesap authority'si RECEIVABLE `interest-engine` zinciridir; CLIENT yalnız
  sonucunu projekte eder.
- Canonical faiz başlangıcı tek bir varsayılan olay değil, explicit
  `ClaimItem.interestAccrualStatus + interestTypeCode +
  interestStartDateProvenance + interestStartDate` sözleşmesidir.
- Tahsil edilmiş faizin hukuki taşıyıcısı interest-type `ClaimItem`a bağlı confirmed
  `LedgerAllocation`; müvekkil entitlement kapısı `POSTED CollectionDisposition` ve
  `CLIENT_PAYABLE(caseClientId)` satırıdır.
- Fresh main'de `ClientStatementLineType` **16**, `CollectionDispositionLineType`
  **7** üyedir; ikisinde de faiz üyesi ve iki zinciri allocation düzeyinde bağlayan
  explicit model yoktur.

Exact kanıt ve B02 tasarım sınırı:
[`X3-B01-INTEREST-AUTHORITY-AND-POSTED-CARRIER-ANALYSIS-R01.md`](./X3-B01-INTEREST-AUTHORITY-AND-POSTED-CARRIER-ANALYSIS-R01.md).

**NEXT:** C3 canonical engineering terminal koşulu `#2297/a9e2c6dd` ile karşılandı;
writer handoff X3'e geçti. X3-B01 yeniden çalışılmaz.

---

## X3-B02 — EN KÜÇÜK ŞEMA/ENUM DEĞİŞİKLİĞİ

```text
- İki kavram AYRI temsil edilir:
    INFORMATIONAL ACCRUED INTEREST   (tahakkuk — bilgi satırı)
    COLLECTED CLIENT INTEREST        (tahsil edilmiş — nakit etkili)
- Şema etkisi B01'in fresh analizinden sonra EN KÜÇÜK migration ile SINIRLANIR.
- Tahakkuk satırı debit=0 / credit=0 olarak modellenir; runningBalance'ı OYNATMAZ.
- Tahsil edilmiş faiz yalnız POSTED finansal kaynağa BAĞLI olur (POL-3).
- Migration üretilir; production APPLY YAPILMAZ → ACTIVATION DEBT olarak kaydedilir.
  APPLY yalnız taze backup/restore kapısı ve owner'ın mevcut production mutation
  disipliniyle yapılır (D-7).
```

Uygulanan en küçük explicit bağ:

```text
ClientStatementLineType += INFORMATIONAL_ACCRUED_INTEREST
                         + COLLECTED_CLIENT_INTEREST
ClientStatementLine     += interestAmount
                         + sourceLedgerAllocationId
                         + sourceDispositionLineId

INFORMATIONAL: debit=0, credit=0, kaynak-allocation alanları NULL
COLLECTED:     interestAmount=credit>0 ve iki exact kaynak kimliği zorunlu
UNIQUE:        statementId + sourceLedgerAllocationId + sourceDispositionLineId
```

Bu yapı yeni faiz hesabı üretmez. Bilgi tutarı RECEIVABLE interest-engine sonucunu,
nakit etkili satır ise confirmed `LedgerAllocation` ile POSTED
`CollectionDispositionLine(CLIENT_PAYABLE)` kesişimini immutable statement snapshot'ında
taşır. Migration CHECK'i non-cash ve kaynak şekillerini; composite unique aynı exact
faizin aynı statement içinde ikinci kez yazılmamasını kilitler.

C3 kalıcı teslim defteri faiz migration zincirinden mantıksal ve timestamp olarak ayrıdır.
PostgreSQL'in yeni enum değerini CHECK içinde kullanmadan önce commit etme zorunluluğu
nedeniyle faiz paketi de ardışık `enum` + `projection shape` migration'larıdır.
Teslim modeli `ClientStatementDeliveryLedger`; tenant/client/statement composite FK
kapsamı, `dedupeKey @unique`, `PENDING|SENT|FAILED`, attempts ve
reservation/retry/sent/error damgalarını taşır. PDF/Buffer/body alanı yoktur. Runtime
sabitleri C3 sözleşmesindeki
`MAX_ATTEMPTS=3`, `RETRY_MINUTES=60`, `LOCK_TIMEOUT_MINUTES=15` olarak korunur; adapter
X3-B03'te bağlanır.

```text
EXACT WRITE MANIFEST — X3-B02
project/apps/api/prisma/schema.prisma
project/apps/api/prisma/migrations/20260809090000_client_statement_interest_projection/migration.sql
project/apps/api/prisma/migrations/20260809090100_client_statement_interest_projection_shape/migration.sql
project/apps/api/prisma/migrations/20260809090500_client_statement_delivery_ledger/migration.sql
project/apps/api/src/modules/client-statement/client-statement-pdf.document.ts
project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/CODEX-X3-INTEREST-SEMANTICS.md
project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/MASTER-PLAN.md
```

Yerel doğrulama (production/local-development DB kullanılmadı):

```text
Prisma validate / generate                              PASS
postgres:16-alpine clean DB, canonical 124 migration    PASS
existing-data rehearsal, baseline 121 + X3 3 migration PASS
schema ↔ applied migration diff                         EMPTY
existing statement/line preservation                    PASS
interest CHECK + exact-source duplicate guard           PASS
delivery dedupe + tenant/client/statement FK scope      PASS
API production build                                    PASS
focused client-statement PDF regression                 13/13 PASS
```

Repository tam `type-check` komutu fresh main'de de kırmızı olan X3 dışı test
diagnostic'leri nedeniyle PASS değildir; bu blok bu mevcut baseline borcunu düzeltmez.
X3 enum'undan doğan production-build diagnostic'i exhaustive Türkçe label girdileriyle
kapatılmış, production build temizlenmiştir.

**BLOCK RESULT:** `ENGINEERING_COMPLETE` + `ACTIVATION_PENDING`

**NEXT ELIGIBLE:** `X3-B03` — fresh main writer kontrolünden sonra otomatik devam;
owner onayı gerekmez.

---

## X3-B03 — EKSTRE ENTEGRASYONU  ⟵ XL-C

**ÖNCÜL:** C3 MERGED (aynı dosya writer'ı devralınır).

```text
- Faiz satırları ekstre okumasına ve PDF render'ına eklenir.
- Tahakkuk satırının bakiyeyi OYNATMADIĞI görsel olarak da anlaşılır olur
  (POL-2'nin kullanıcıya görünen karşılığı).
- C3'ün kurduğu render sözleşmesi ve client-safe referans kullanımı KORUNUR;
  X3 kendi kopyasını ÜRETMEZ.

KİLİTLENECEK REGRESYONLAR:
  (1) tahakkuk satırı açılış/kapanış bakiyesini DEĞİŞTİRMEZ
  (2) tahsil edilmiş faiz POSTED kaynak olmadan bakiyeye GİREMEZ
  (3) aynı faiz iki kez sayılamaz (çift-sayım kilidi)
  (4) tenant izolasyonu korunur
```

Uygulanan runtime bağı:

- Tahakkuk faizi yalnız RECEIVABLE `CaseBalanceService` sonucundaki
  `finalDebtStates[].accruedInterest` alanından projekte edilir; CLIENT formül veya
  fallback hesap üretmez. Satır debit/credit sıfır ve sabit running balance taşır.
- Tahsil edilmiş faiz yalnız aynı tenant/case/currency/collection kapsamındaki confirmed
  PAYMENT `LedgerAllocation` + interest-type `ClaimItem` ile POSTED
  `CollectionDisposition/CLIENT_PAYABLE(caseClientId)` kesişiminden üretilir. Allocation
  tutarı gerçek CLIENT_PAYABLE/disposition oranında cent-exact bölünür; faiz payı generic
  payable satırından düşülerek toplam iki kez sayılmaz.
- C3 render allowlist'i korunur: raw faiz ve source kimlikleri belgeye girmez; yalnız
  `informationalAmount` kullanıcı-güvenli alanı PDF'te `Bilgi tutarı` olarak görünür.
- `ClientStatementPrismaDeliveryLedgerAdapter`, C3 portuna bağlandı. Unique yarışı
  kaybeden claim `null` alır; SENT tekrar gönderilmez; retry 3 deneme / 60 dakika ve
  stale-lock 15 dakika sınırlarıyla koşullu `updateMany` üzerinden yürür. PDF/Buffer/body
  teslim defterine yazılmaz.

```text
EXACT WRITE MANIFEST — X3-B03
project/apps/api/src/modules/client-statement/client-statement-interest-projection.ts
project/apps/api/src/modules/client-statement/client-statement-prisma-delivery-ledger.adapter.ts
project/apps/api/src/modules/client-statement/client-statement.service.ts
project/apps/api/src/modules/client-statement/client-statement.module.ts
project/apps/api/src/modules/client-statement/client-statement-delivery-ledger.contract.ts
project/apps/api/src/modules/client-statement/client-statement-monthly-delivery.service.ts
project/apps/api/src/modules/client-statement/client-statement-render.contract.ts
project/apps/api/src/modules/client-statement/client-statement-render.mapper.ts
project/apps/api/src/modules/client-statement/client-statement-pdf.document.ts
project/apps/api/src/modules/client-statement/client-statement.service.spec.ts
project/apps/api/src/modules/client-statement/__tests__/client-statement-data-contract-c3b01.spec.ts
project/apps/api/src/modules/client-statement/__tests__/client-statement-pdf-c3b02.spec.ts
project/apps/api/src/modules/client-statement/__tests__/client-statement-delivery-ledger-c3b05.spec.ts
project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/CODEX-X3-INTEREST-SEMANTICS.md
project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/MASTER-PLAN.md
```

Yerel doğrulama production/local-development DB ve gerçek SMTP kullanmadan tamamlandı:

```text
Prisma validate / generate                              PASS
API production build                                    PASS
changed-path ESLint                                     PASS
client-statement tam regresyon                          154/154 PASS
odaklı interest/render/ledger sözleşmesi                101/101 PASS
```

Repository tam `type-check` komutu, X3 dışındaki mevcut test/contract borçları nedeniyle
PASS değildir; production build ve X3 changed-path lint temizdir. X3 kapsamındaki
diagnostic için scope genişletilmedi.

**BLOCK RESULT:** `ENGINEERING_COMPLETE` + `ACTIVATION_PENDING`

```text
X3 STATUS:                    ENGINEERING_COMPLETE / ACTIVATION_PENDING
BLOCKS:                       3/3 COMPLETED
REMAINING ENGINEERING BLOCK:  NONE
PRODUCTION DEBT:              migration APPLY · monthly-delivery flag · real DB/runtime UAT
NEXT ELIGIBLE:                NONE WITHIN X3 — C1-B03 fresh main'de RUNTIME_VERIFIED
OWNER AUTHORIZATION REQUIRED: NO — engineering kapanışı için
```

---

## ÇÖZÜM DAYATMASI YASAĞI

Faizin taşıyıcısı (yeni `ClientStatementLineType` üyeleri / mevcut tipin metadata ile
ayrıştırılması / ayrı kaynak tablo) **peşinen belirlenmemiştir**; B01'in bulgusuna
göre, en küçük şema etkisi ilkesiyle kanıta dayanarak seçilir.

## GERÇEK DURMA KOŞULLARI (bu hatta)

**D-1** owner politikasıyla gerçek çelişki · **D-7** production migration için
backup/restore kapısının sağlanamaması.
