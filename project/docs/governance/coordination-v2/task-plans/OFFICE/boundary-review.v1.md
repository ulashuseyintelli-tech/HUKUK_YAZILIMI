# OFFICE — Boundary Review v1 (adversarial)

```text
Plan            : task-plans/OFFICE/plan.v1.json
taskId          : OFFICE-CAP-09A-CONSUMER-01-R01
Base            : 64d54732ffffc3246ac03af242e0ec9611fc0222
Planner         : CLAUDE
Reviewer        : bağımsız ajan, salt-okunur, "çürüt" talimatıyla — planner DEĞİL
                  (COLLECTION reviewer'ından da AYRI ajan)
Tur sayısı      : 3
FINAL VERDICT   : PASS
BOUNDARY TOO WIDE: NO
```

## 1. Tur özeti

| Tur | Verdict | Ne değişti |
|---|---|---|
| 1 | **FAIL** — boundary too wide: YES | 7 blocking bulgu; boundary yeniden şekillendirildi |
| 2 | **PASS** — boundary too wide: NO | — |
| 3 | **PASS** — boundary too wide: NO | prerequisite prefix'i eklendi, boundary dokunulmadı |

Round 1 planner'ın iki ayrı hatasını çürüttü ve ikisi de kabul edildi.

## 2. Planner'ın çürütülen iki iddiası

**Ç1 — "4 staff spec'i kırılır" aritmetiği yanlıştı.** Planner, `AuditService`
constructor parametresi eklemenin dört spec'i birden kıracağını varsaymıştı.
Gerçek: `jest.config.js:13` `ts-jest`'i `{ diagnostics: false }` ile koşuyor,
yani TS2554 raporlanmıyor; `tsconfig.prod.json` da spec'leri `exclude`
ediyor ve `ci.yml:106` tek API type-check adımı odur. Dolayısıyla
`new StaffService(prisma)` çalışmaya devam eder, `this.audit` yalnız
`undefined` olur. Gerçekten değişmesi gereken tek spec `remove()` çağırandır.

**Ç2 — Boundary yanlış eksende dardı.** Bu daha ciddiydi. Referans davranış
aktörü controller'dan alıyor:

```text
lawyer.controller.ts:175-180   @CurrentUser("id") userId → delete(tenantId, id, { userId }, …)
lawyer.service.ts:642          userId: actor?.userId
staff.controller.ts:64-67      @Request() req → remove(id, tenantId)   ← aktör GEÇMİYOR
```

Repoda genel request-scoped actor context yok. Yani `staff.controller.ts`
değişmeden attribution **ulaşılamaz**. Planner'ın ilk daraltması onu boundary
dışında bırakmıştı — bu, "attribution'sız audit" dejenere sonucunu zorlardı,
ki declaredIntent tam olarak onu engellemek için var.

Planner her ikisini de kendi kanıtıyla doğruladı ve boundary'yi yeniden
şekillendirdi.

## 3. Nihai boundary ve neden bu

```text
IÇERIDE (4)
  staff/staff.service.ts                      remove()'a audit eklenir
  staff/staff.controller.ts                   aktör aktarımı — ZORUNLU (Ç2)
  staff/__tests__/staff-deactivate-lifecycle.spec.ts   remove()'u çağıran tek spec
  audit/__tests__/audit.service.attribution.spec.ts    owner-designated, CI-kapsamlı

DIŞARIDA — ama requiredTests İÇİNDE (bağımsız koruyucu)
  staff-list-masking.spec.ts          ratifiye CANDIDATE-F1 maskelemesinin TEK koruyucusu
  staff-duplicate-guard.spec.ts
  staff-update-duplicate-guard.spec.ts
  audit-metadata-builder.spec.ts

DIŞARIDA
  staff.module.ts        AuditModule @Global — DI değişikliği gerekmiyor
  audit.service.ts       tüketici dilimi audit modülüne yazmaz
  audit-safe-projection.spec.ts · audit.service.safe-projection.spec.ts
  audit-confirm-token-replay.spec.ts    üç korumasız güvenlik spec'i
```

Reviewer'ın ölçümü: *"Sınırdaki 4 dosyanın hiçbiri gereksiz değil; sınır
dışındaki hiçbir dosya gerekli değil. `exactTargets` BOUNDED_CODE_TASK'ta
uygulanmadığı için bu, kontratın ifade edebildiği en dar hâldir."*

Round-1'in somut istismar yolları mekanik olarak kapandı:

```text
staff-list-masking.spec.ts'e dokunma      OUTSIDE_PERMITTED_BOUNDARY
audit-safe-projection.spec.ts'e dokunma   OUTSIDE_PERMITTED_BOUNDARY
audit.service.ts'e dokunma                OUTSIDE_PERMITTED_BOUNDARY
staff.module.ts eklenmesi (5 dosya)       OUTSIDE_PERMITTED_BOUNDARY + MAX_CHANGED_FILES_EXCEEDED
4 dosyalık meşru değişim                  within=true
```

Reviewer beşinci dosya gerektirebilecek üç adayı ayrıca eledi:
`staff.module.ts` gerekmiyor (`audit.module.ts:6` `@Global()`);
controller aktörü dosya içinde alabiliyor (`jwt.strategy.ts:35` tam user
kaydını döndürüyor, `staff.controller.ts:65` zaten `req.user.tenantId`
kullanıyor); actor tipi için yeni dosya gerekmiyor.

## 4. Taksonomi pini

Owner'ın yasak listesi "yeni audit taksonomisi üretmek" diyor, ama repoda
**hiç STAFF action string'i yok** — yani görev kaçınılmaz olarak bir tane
üretiyor. Planner bunu executor'a bırakmak yerine `declaredIntent`'e
pinledi:

```text
LAWYER_DEACTIVATE / LAWYER   (ratifiye, lawyer.service.ts:638-641)
STAFF_DEACTIVATE  / STAFF    (birebir ayna — icat DEĞİL)
```

Böylece owner'ın hash ile ratifiye ettiği metnin içinde. Bu, kararın
itiraz edilebileceği tek kalemdir.

## 5. Prerequisite prefix'i — round 3

`requiredTests` iki ortam girdisiyle açılıyor; gerekçesi COLLECTION review
kaydı §2 B3/B4 ile aynı. OFFICE'e özgü olan: bu plan sayesinde
`requiredTests[1]`'in **baz'da zaten kırmızı** olduğu ortaya çıktı
(`Cannot find module '.prisma/client/default'`, 4 suite / 0 test).

Reviewer prefix'i üç açıdan denetledi ve temiz buldu:

```text
SIRA        canonicalRequiredTests .map() kullanır — dizi sırası KORUNUR
            (canonicalPathList sıralar, ama requiredTests ondan geçmez)
KAPI SIRASI extractChanges :373 → validate :378 → verdict DONAR
            → requiredTests :400 → PR_OPEN :419
            prerequisite'ler verdict dondurulduktan SONRA çalışır
IGNORE      git check-ignore -v: project/.gitignore:2 → node_modules
            schema.prisma generator'da custom output YOK → yalnız node_modules
            tracked package.json'larda postinstall/prepare/preinstall SIFIR
```

Maskeleme yolu yok: `:402-418` sıralı döngü, `if (r.status !== 0)` → anında
`REQUIRED_TEST_FAILED`, toplama veya continue-on-error yok.

## 6. Uçtan uca yürütme kanıtı

```text
[0] pnpm install --frozen-lockfile                cwd=project           1.7s exit=0
[1] pnpm --filter @hukuk/api exec prisma generate cwd=project           3.6s exit=0
[2] pnpm exec jest … audit-metadata-builder + audit.service.attribution
                                                  cwd=project/apps/api  7.3s exit=0  26/26
[3] pnpm exec jest … 4 staff spec                 cwd=project/apps/api  7.8s exit=0  30/30
```

**Okuma uyarısı:** "requiredTests 4/4 PASS" ifadesi **2 ortam girdisi + 2 test
girdisi** demektir, 4 test suite değil. Gerçek test sayısı 26 + 30 = 56.

## 7. Kalan residual'lar — owner gate'i

```text
R1  Hiçbir required test staff.controller.ts'in AKTÖR AKTARIMINI kanıtlamıyor,
    oysa declaredIntent bunu açıkça iddia ediyor. Attribution spec'i
    StaffService'i doğrudan kurup aktörü parametre geçecek. Reviewer block
    ETMEDİ. 4 dosya bütçesi içinde çözülebilir (staff-deactivate-lifecycle
    içinde new StaffController(svc)); owner bir tur daha isterse eklenecek
    TEK şey budur ve hash yeniden üretilir.

R2  staff-deactivate-lifecycle.spec.ts hem sınır içinde hem değişmesi zorunlu
    — ratifiye CANDIDATE-A kontratını (count!==1 → tam rollback,
    "best-effort YASAK", OFF/OD-14) koruyan tek testtir. Executor audit
    eklerken assertion'ları gevşetebilir. KAÇINILMAZ; owner merge checklist
    maddesi.

R3  StaffService.updateOrder() hiçbir testte yok; tenant scoping'i sınır
    içinde yazılabilir ve otomatik yakalanmaz. staff.service.ts zorunlu
    sınır içi olduğu için daraltılamaz.

R4  staff.controller.ts'in tamamı korumasız — hiçbir test controller'ı
    kurmuyor. Ratifiye HttpException re-throw davranışı (PR-S / PR-U3)
    yazılabilir. Tek kontrol manualMergeRequired: true. R1 çözülürse kısmen
    kapanır.

R5  ci.yml:1830-1835 yorumu audit adımını SLICE 2 foundation'a scope'luyor;
    SLICE 3 tüketici assertion'ı bunu sessizce yeniden kapsamlandırır ve
    ci.yml IMMUTABLE_FORBIDDEN olduğu için yorum düzeltilemez, bayat kalır.

R6  Yetki kaydı (OFFICE-RISK-REGISTER.md:190-192) planın varsaydığını
    söylüyor, AMA kendi metniyle bağımsız ratifikasyon kanıtı olmadığını
    beyan ediyor; decision-log.md hâlâ "yalnız SLICE 1" diyor. Owner'ın
    ownerRatificationEvidence alanlarını doldurmasıyla kapanır.

R7  exactTargets BOUNDED_CODE_TASK'ta uygulanmıyor (authority.cjs:172,207
    normalize eder, boundary.cjs hiç okumaz). Dosya-seviyesi pinleme yalnız
    tek-dosya allowedRoots hilesiyle mümkün. Kontrol düzlemi işi.

R8  DIR-SHADOW (kozmetik): underAnyRoot'un prefix dalı nedeniyle
    ".../staff.service.ts/x.ts" sınır içi sayılır. Sömürülebilir değil —
    dosyayı silip aynı adda dizin açmak gerekir, import çözülemez,
    requiredTests FAIL.
```

## 8. Pinlenen hash'ler

```text
taskSpecSha256       c337cae59c0a28da4018d7666e64701881bc4fc5892098428fd572eea3af3b27
declaredIntentSha256 f6e51c9b7b15427e7a283c5bcdbc703967c9ed8632cb0e1bdd003ff6733ce187
boundaryPolicySha256 aab953f983981e9dfff765d87e26cce5ad6d60c3e7c65e2db1bc7956bd683835
requiredTestsSha256  383610b727863c82c6b1939b5cff74b351b1cfca3c389a192f51c0b1e4c7892a
```

`boundaryPolicySha256` round-2'de PASS alan değerle **aynıdır** — reviewer
bunu bağımsız olarak yeniden türetip doğruladı. Dördü de
`grant.template.json` pinleriyle eşleşiyor.

---

**AUTHORITY: NONE.** Bu kayıt bir plan ratifikasyonu değildir ve hiçbir
execution grant üretmez.
