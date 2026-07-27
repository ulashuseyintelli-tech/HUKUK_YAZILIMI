# CANARY R02 plan ratification — CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R02

Bu kayit asagidaki plani degismez kimligiyle sabitler. Grant bu blogu birebir
alinti olarak tasir; plan degisirse hash degisir ve grant reddedilir.

```text
taskId               CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R02
taskSpecVersion      1
taskSpecSha256       afe35726fc2ebd358ed00ee2eb31ea68e98d41a9fa8baec603af701c6c10d95f
declaredIntentSha256 ecedcf856862302c7eb6a2bfde3400e07d47aed129efeac89c64cdfc8dc3dc99
boundaryPolicySha256 c9ac5282b1051c18de48b9d43c72c0ce957447fc8652257c1e6abb1738d75b02
requiredTestsSha256  d7f6c55b8753b47e6b82c0b8fc7ee33ba9b4d96058915de3501153fe56b8530e
basePolicy           REFRESH_BEFORE_EXECUTION
baseSha              89d406bec3ed58fcf9927fb39baba2ea58fca6d3
planRef              project/docs/governance/coordination-v2/task-plans/CANARY/plan.v2.json
```

## R01 ile iliskisi

R01 canary'si **korunur** ve degistirilmez: kendi kuyruk kayitlari, task store
kaydi ve blocker'lari historical execution evidence olarak durur. R02 yeni bir
task ID, yeni idempotency key ve yeni plan hash ile bagimsiz bir denemedir.

R01 iki gercek kusur ortaya cikardi ve ikisi de kapandi: `completeAfterOwnerMerge`
zincire bagli degildi, ve digest'ler `specDigests()` yerine ham plandan
hesaplaniyordu. R02 bu duzeltmelerin uzerinde kosar.

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
