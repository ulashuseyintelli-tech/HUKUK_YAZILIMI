# OWNER-DECISION-COORD-V2-MECHANICAL-SUCCESSOR-DEFAULT-POLICY-R01 — Parent Authorization Envelope

<!-- GOV-COORD-AUTHORITY kind=PROGRAM_AUTHORIZATION recordId=OWNER-DECISION-COORD-V2-MECHANICAL-SUCCESSOR-DEFAULT-POLICY-R01 -->

```text
Authorization ID : OWNER-DECISION-COORD-V2-MECHANICAL-SUCCESSOR-DEFAULT-POLICY-R01
Owner            : Ulas Huseyin Telli
payloadSha256    : 910dbeaef6e2ab86d95edb0a9e1d9bba9600dedc6d8f1686c4ec88ec3d4421f8
Payload          : mechanical-successor-default-policy-authorization-payload.r01.json
Decision class   : MECHANICAL_SUCCESSOR_DEFAULT_POLICY
Scope            : sekiz program (asagida) · W3 KAPSAM DISI
Auto-merge       : URETILMEZ
Standing grant   : URETILMEZ
```

Bu belge owner'in daha once ratifiye ettigi semantic karar'in **transkripsiyonudur**.
Yeni bir owner karari uretmez; mevcut karari normalize edip hash'e baglar.

`payloadSha256`, payload dosyasinin RFC 8785 canonical formunun SHA-256'sidir ve
`authority.digest()` ile bu kayit yazilirken uretilmistir. Payload degisirse hash
degisir ve ona dayanan her turetilmis kayit gecersizlesir.

## Semantic tuple (owner-ratified)

```text
1  Deterministik ve mekanik successor, gerekli predecessor/terminal kosullari
   saglandiginda varsayilan olarak yalniz ELIGIBLE / DISPATCH_CANDIDATE olabilir.
2  ELIGIBLE veya DISPATCH_CANDIDATE olmak semantic authority, mutation authority,
   execution grant veya merge authority URETMEZ.
3  Her successor mutation'i icin ayri, exact task-bound ve non-reusable
   SEMANTIC_AUTHORITY + EXECUTION_GRANT zorunludur.
4  Stage 1 ve Stage 2 ayri task, branch, PR, merge ve execution grant kullanir;
   Stage 2, Stage 1 grant'ini kullanamaz.
5  Semantic tuple degismiyorsa yeniden semantic ratification istenmez.
6  Owner checkpoint yeniden acilir: semantic tuple · program · task identity ·
   stage · path/scope · writer ownership · production activation ·
   schema/migration · irreversible operation.
7  Reusable, cross-task, cross-program, repository-wide veya unattended
   mutation/merge authority URETILEMEZ.
8  DELIVERY_TRUTH mevcut task-bounded modelini korur.
9  ORCHESTRA_OPERATIONAL_CANARY standing grant'a cevrilmez; one-shot task-scoped
   grant modelini korur.
```

## Kapsanan sekiz program

```text
CLIENT
COLLECTION
DEBTOR
RECEIVABLE
UYAP_CONNECTOR
OFFICE
DELIVERY_TRUTH
ORCHESTRA_OPERATIONAL_CANARY
```

Bu sekiz programin disinda hicbir program kapsanmaz. **W3 kapsam disidir**; bu
envelope W3 icin hicbir eligibility, authority, grant veya scope uretmez.

Tek bir cross-program mutation grant olusturulmaz. Her program kendi ayri,
task-bound authority zincirini kullanmaya devam eder.

## Bu envelope NE URETMEZ

```text
program-specific SEMANTIC_AUTHORITY   URETMEZ
program-specific EXECUTION_GRANT      URETMEZ
program-specific mutation authority   URETMEZ
cross-program mutation grant          URETMEZ
standing grant                        URETMEZ
one-shot canary grant                 URETMEZ
program eligibility mutation          URETMEZ
merge authority                       URETMEZ
```

Envelope yalniz politikayi kanonik ve hash'e bagli bicimde tasir. Her mutation
kendi exact, task-bound ve non-reusable SEMANTIC_AUTHORITY + EXECUTION_GRANT
cifti altinda ayrica yetkilendirilir. Bu belgenin varligi hicbir gorevin
dispatch, mutation veya merge edilebilecegi anlamina gelmez.

## PHASE 2 SOURCE EVIDENCE EXCERPT (EXACT)

Asagidaki blok sabit ve birebir alintilanabilir kaynak kanittir. Turetilmis
kayitlar bunu `sourcePath` + `exactExcerpt` + `excerptSha256` ucluyle pinler.

```text
mekanik successor varsayilan olarak yalniz ELIGIBLE / DISPATCH_CANDIDATE olur
ELIGIBLE veya DISPATCH_CANDIDATE semantic authority, mutation authority, execution grant veya merge authority URETMEZ
her successor mutation'i ayri, exact task-bound ve non-reusable SEMANTIC_AUTHORITY + EXECUTION_GRANT ister
Stage 1 ve Stage 2 ayri task, branch, PR, merge ve execution grant kullanir; Stage 2 Stage 1 grant'ini kullanamaz
bu politika CLIENT, COLLECTION, DEBTOR, RECEIVABLE, UYAP_CONNECTOR, OFFICE, DELIVERY_TRUTH ve ORCHESTRA_OPERATIONAL_CANARY programlarini kapsar; W3 kapsam disidir
```

```text
sourcePath     : project/docs/governance/coordination-v2/activation/MECHANICAL-SUCCESSOR-DEFAULT-POLICY-PARENT-AUTHORIZATION-ENVELOPE-R01.md
excerptSha256  : a50dbaf9876e0344db0175c29e2867e88e5dd494d27b49152feac52c5ced99c3
```

## Gecerlilik

```text
owner acikca iptal edene kadar
semantic tuple degisene kadar
scope ihlali olusana kadar
```

Yetki baska programa, baska repository'ye veya baska owner isine **tasinamaz**.

---

**IMPLEMENTATION AUTHORITY: NONE.** Bu envelope hicbir task, grant, dispatch,
migration, runtime veya merge yetkisi uretmez.
