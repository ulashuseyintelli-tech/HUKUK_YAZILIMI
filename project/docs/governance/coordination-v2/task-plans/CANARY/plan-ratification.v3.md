# CANARY R03 plan ratification — CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R03

Bu kayit asagidaki plani degismez kimligiyle sabitler. Grant bu blogu birebir
alinti olarak tasir; plan degisirse hash degisir ve grant reddedilir.

```text
taskId               CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R03
taskSpecVersion      1
taskSpecSha256       60241f3a6708b58082d4c223d900e690fc823c53bb29c6c764fa15d5ce3c8c5b
declaredIntentSha256 017f91faf889b9df701d0d2840fb1f8fcbcc93d40040d47712dc7df263cf11fc
boundaryPolicySha256 c9ac5282b1051c18de48b9d43c72c0ce957447fc8652257c1e6abb1738d75b02
requiredTestsSha256  d7f6c55b8753b47e6b82c0b8fc7ee33ba9b4d96058915de3501153fe56b8530e
basePolicy           REFRESH_BEFORE_EXECUTION
baseSha              20b3dfde05070c9aa5c31d7bebaa61d5e9877341
planRef              project/docs/governance/coordination-v2/task-plans/CANARY/plan.v3.json
```

## R01 ile iliskisi

R01 canary'si **korunur** ve degistirilmez: kendi kuyruk kayitlari, task store
kaydi ve blocker'lari historical execution evidence olarak durur. R03 yeni bir
task ID, yeni idempotency key ve yeni plan hash ile bagimsiz bir denemedir.

R01 iki gercek kusur ortaya cikardi ve ikisi de kapandi: `completeAfterOwnerMerge`
zincire bagli degildi, ve digest'ler `specDigests()` yerine ham plandan
hesaplaniyordu. R03 bu duzeltmelerin uzerinde kosar.

## Executor lane

```text
CODEX_LOCAL   bu makinede mevcut ve dogrulanmis
CLAUDE_LOCAL  bu ortamda PATH'te YOK — bu gorev kapsaminda kurulmaz
```

## Bu bir OPERATIONAL CANARY

Amaci urun isi yapmak degil, su zincirin ucdan uca calistigini kanitlamaktir:

```text
request -> enqueue -> admission -> standing grant -> durable queue
        -> dispatch revalidation -> isolated worktree -> CODEX_LOCAL executor
        -> real diff -> commit -> push -> PR -> CI -> merge gate
        -> bounded auto-merge -> main sync -> cleanup -> CLOSED
```

Uretilen degisiklik gercektir ve kalicidir, ama is degeri kanitin kendisidir.
Rapor bunu OPERATIONAL CANARY olarak yazar; urun isi yapilmis gibi sunmaz.
