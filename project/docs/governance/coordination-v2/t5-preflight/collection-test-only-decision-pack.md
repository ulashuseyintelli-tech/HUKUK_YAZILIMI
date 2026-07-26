# COLLECTION — Test-Only Characterization Sub-Slice: OWNER DECISION PACK

```text
Task            : GOV-COORD-V2-T5-PREFLIGHT-RECONCILIATION-R01, kapsam 4
Base            : origin/main @ 7fcd3b98
Amaç            : mevcut Collection davranışını KARAKTERİZE etmek
                  yeni confirmation lifecycle semantiği ÜRETMEMEK
plan.draft.json : ÜRETİLMEDİ (brief gereği — önce owner seçimi)
Planner         : CLAUDE · Gelecek executor : CODEX
HARD PRECONDITION: PR #1415 reconciliation (bkz. collection-pr1415-reconciliation.md)
```

## 1. Karakterize edilecek mevcut davranış

Beşi de bugün doğrudur ve hiçbiri bir semantik karar gerektirmez:

```text
B1  "Confirmed" kararı YALNIZ status üzerinden verilir.
    isConfirmedCollection(c) === (c.status === CollectionStatus.CONFIRMED)
    confirmedAt bu karara HİÇ girmez.

B2  Collection admission confirmedAt yazmaz.
    collection.service.ts:601 tek admission yoludur; confirmedAt set edilmez,
    dolayısıyla kolon null kalır.

B3  status @default(CONFIRMED) + confirmedAt null birlikte var olabilir.
    schema.prisma:2410-2411. Bu, COL-RISK-G03'ün adlandırdığı örtük-eşitlik
    belirsizliğinin ta kendisidir.

B4  confirmedAt her yerde null olarak tel üstündedir.
    case.service.ts:1049 (...c) ve :3866 (...collection) tüm Collection
    objesini yayar; alan client'a always-null gider.

B5  confirmedAt effective-date authority DEĞİLDİR.
    payment-mapper.spec.ts:86-100 bunu zaten iddia eder (W2.1A / PR #1315).
```

Doğrulama (7fcd3b98): `confirmedAt` `apps/api/src`, `apps/web/src` ve `packages`
altında test/fixture hariç **hiç okunmuyor ve hiç yazılmıyor**.

## 2. Okunacak üretim dosyaları — hiçbiri DEĞİŞTİRİLMEZ

```text
apps/api/src/common/collection-confirmed.util.ts        kanonik "confirmed" tanımı
apps/api/src/modules/collection/collection.service.ts   admission (:601)
apps/api/src/modules/case/case.service.ts               tel üstü yayılım (:1049, :3866)
apps/api/prisma/schema.prisma                           yalnız kanıt (:2410-2411)
```

Yedi üretim tüketicisi (yalnız okuma):

```text
modules/ai/ai.service.ts
modules/automation/automation.service.ts
modules/risk/risk.service.ts
modules/policy-engine/fact-store/fact-store.service.ts
modules/debtor-scoring/inputs/case-signal-input.adapter.ts
modules/debtor-scoring/inputs/financial-input.adapter.ts
```

> **Owner dikkatine:** `collection-confirmed.util.ts` içindeki
> `<remarks> Çağrıldığı yerler` listesi **dört** tüketici sayıyor; gerçekte
> **altı** var — iki `debtor-scoring` adapter'ı listede yok. Bu CLAUDE.md §5
> gereğinin ihlalidir (metot değişince çağıran listesi güncellenir). Bu görevde
> düzeltmedim; ayrı bir mekanik iştir.

## 3. Production code mutation gerekiyor mu — HAYIR

```text
production kod mutation : GEREKMİYOR
schema değişikliği      : GEREKMİYOR
migration               : GEREKMİYOR
runtime davranış değişimi: YOK
yeni endpoint/DTO/event : YOK
```

B1-B5'in beşi de mevcut kod üzerinden gözlemlenebilir. Karakterizasyon tanım
gereği davranışı değiştirmez, mevcut davranışı çiviler.

## 4. YAPISAL KISIT — CI görünürlüğü (owner kararını doğrudan etkiler)

Bu, karar paketinin en önemli maddesidir ve gözden kaçarsa owner CI'ın hiç
koşmadığı bir test yetkilendirmiş olur.

`.github/workflows/ci.yml` içindeki her jest adımı elle küratörlü bir
allowlist'tir: her `npx jest` çağrısı ya `--runTestsByPath <açık dosya listesi>`
ya `--testPathPattern <regex>` ile sınırlıdır. **Catch-all yoktur.**

```text
collection-confirmed.util.spec.ts   ci.yml'de HİÇ GEÇMİYOR
                                    → mevcut 8 testi CI'da HİÇ KOŞMUYOR
payment-mapper.spec.ts              ci.yml:548-549'da allowlist'te
                                    → dosya-varlık pre-check'i de var
```

W2.1A emsalinin (PR #1315, +22/−0, tek dosya) işe yaramasının nedeni tam olarak
budur: allowlist'te olan bir spec'i genişletti.

Ve kritik ikinci kısıt: `.github/workflows/ci.yml`,
`coordinationControlPlane` listesinin **ilk girişidir**, dolayısıyla V2 §1
immutable global forbidden'dır. **Hiçbir orkestre edilmiş task'ın boundary'si
ci.yml'i içeremez** — bu bu oturumda PR #1605'te `CONTROL_PLANE_SCOPE_FORBIDDEN`
ile fiilen doğrulandı. Yani "yeni spec + onu CI'a bağlayan adım" tek bir bounded
task olarak **paketlenemez**.

## 5. İki şekil — owner seçmeli

### ŞEKİL 1 — Allowlist'te olan spec'i genişlet (CI-görünür, bugün plannable)

```text
Positive boundary (en dar):
  project/apps/api/src/modules/interest-engine/calc-prep/__tests__/payment-mapper.spec.ts

Kapsanan davranış : B5 (+ B1'in bir kısmı, mapper girdisi üzerinden)
CI görünürlüğü    : VAR — ci.yml:549 zaten bu dosyayı koşuyor
Emsal             : birebir W2.1A / PR #1315 deseni
Sınır             : B2/B3/B4'ü kapsamaz — admission ve projection davranışı
                    bu spec'in konusu değildir; oraya sokmak spec'in amacını bozar
```

### ŞEKİL 2 — Kanonik util spec'ini genişlet (gerçek invariant, CI-görünür DEĞİL)

```text
Positive boundary (en dar):
  project/apps/api/src/common/__tests__/collection-confirmed.util.spec.ts

Kapsanan davranış : B1 tam + B3 (status/confirmedAt bağımsızlığı)
CI görünürlüğü    : YOK — ayrı bir owner işlemi ci.yml'e adım eklemeden
                    testler CI'da koşmaz
Sınır             : mevcut spec confirmedAt'i hiç anmıyor; eklenecek asıl
                    iddia "confirmed kararı confirmedAt'ten BAĞIMSIZDIR"
```

Öneri: **ŞEKİL 1 + ayrı bir owner işlemi olarak ci.yml adımı**. Şekil 1 bugün
bounded, CI-görünür ve emsalli; ci.yml adımı ise owner'ın kendi eliyle veya
ayrı bir control-plane görevi olarak eklenmeli. Şekil 2'yi ci.yml adımı
olmadan yetkilendirmek, koşulmayan test üretir.

## 6. Required tests (argv nesneleri — shell string DEĞİL, §12)

ŞEKİL 1 için:

```json
[
  { "cwd": "project",
    "argv": ["npx","jest","--ci","--forceExit","--runInBand",
             "--testPathPattern",
             "src/modules/interest-engine/calc-prep/__tests__/payment-mapper\\.spec\\.ts$"] }
]
```

ŞEKİL 2 için:

```json
[
  { "cwd": "project",
    "argv": ["npx","jest","--ci","--forceExit","--runInBand",
             "--testPathPattern",
             "src/common/__tests__/collection-confirmed\\.util\\.spec\\.ts$"] }
]
```

`--testPathPattern` **tekil** yazılmalıdır: bu repodaki Jest 29.7.0 çoğul
`--testPathPatterns`'i sessizce yok sayar ve tüm suite'i koşar.

## 7. Predecessor / successor ilişkisi

```text
PREDECESSORS (hepsi CLOSED / CANONICAL — doğrulandı)
  W2.1 · W2.2A · W2.2B · W2.2C-0..C-5 · W2.2D-0
  COL/OD-06A · COL/OD-21 : RECORDED

BU İŞİN KONUMU
  W2.2D-1'in bir alt-dilimi olur. W2.2D-1'in PREDECESSOR'ı DEĞİLDİR ve onun
  yerine geçmez; W2.2D-1'in semantik kapsamı açık kalır.

SUCCESSOR
  W2.2D-1 proper (confirmedAt lifecycle semantiği) — hâlâ owner gate'inde,
  hâlâ COL-RISK-G03'ün çözümünü bekliyor. Bu alt-dilim onu ÇÖZMEZ; yalnız
  mevcut davranışı çivileyerek gelecekteki değişimin sessiz olmamasını sağlar.

HARD PRECONDITION
  PR #1415 / 80a11c2a tescili. Contract §15.4: hesabı verilmemiş bir merge'in
  üzerine plan pinlenemez. #1415 zaten bu alt-dilimin dokunacağı kolonu
  eklemiştir.
```

## 8. outOfScope[] — zorunlu, açık

```text
confirmedAt'e herhangi bir runtime yazıcı eklemek
status=CONFIRMED ile confirmedAt=null'ın ne anlama geldiğine karar vermek
unapplied remainder / overpayment ile confirmation etkileşimini tanımlamak
projection'ların confirmedAt'i nasıl açacağına karar vermek
schema.prisma veya migrations altında herhangi bir değişiklik
COL-RISK-G03'ü kapatmak veya statüsünü değiştirmek
W2.2D-1'in kendisini kapatmak veya kapsamını yeniden tanımlamak
W2.2E / W2.3 kapsamına dokunmak
collection-confirmed.util.ts <remarks> listesini düzeltmek (ayrı mekanik iş)
.github/workflows/ci.yml (control plane — hiçbir task boundary'sinde olamaz)
herhangi bir governance register / decision-log değişikliği
```

## 9. Owner'ın karar vermesi gerekenler

```text
1. #1415 tescili yapıldı mı? (hard precondition — yapılmadan bu iş plannable değil)
2. ŞEKİL 1 mi ŞEKİL 2 mi? (öneri: ŞEKİL 1)
3. ŞEKİL 2 seçilirse: ci.yml adımı kim/nasıl ekleyecek?
4. Bu alt-dilime bir ID veriliyor mu? Yeni ID minting bir owner decomposition
   işlemidir (§15.5); planner öneremez. Bu programdaki her önceki bölme
   (W2.2C-0..C-5, W2.2D-0) owner kararıyla yapılmıştır.
```

---

**AUTHORITY: NONE.** Bu belge bir plan değildir, bir ID atamaz, bir slice
yetkilendirmez ve hiçbir execution grant üretmez.
