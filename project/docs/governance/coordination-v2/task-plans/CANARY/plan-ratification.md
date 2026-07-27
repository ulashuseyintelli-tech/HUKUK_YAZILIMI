# CANARY plan ratification — CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R01

Bu kayit, asagidaki plani **degismez kimligiyle** sabitler. Grant bu blogu
birebir alinti olarak tasir; plan degisirse hash degisir ve grant reddedilir.

```text
taskId               CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R01
taskSpecVersion      1
taskSpecSha256       e2f3c6128a057215761f0f9db1b13f3882d1f632e9426f5241ee98d13ddfada3
declaredIntentSha256 9c073204c158fa6bc6a9daea0f6b99488613439ee91cbecdab443599f1fa46ed
boundaryPolicySha256 c9ac5282b1051c18de48b9d43c72c0ce957447fc8652257c1e6abb1738d75b02
requiredTestsSha256  d7f6c55b8753b47e6b82c0b8fc7ee33ba9b4d96058915de3501153fe56b8530e
basePolicy           REFRESH_BEFORE_EXECUTION
baseSha              8d4bc9dea45da7a88b1b4fae5f9f30ad7761c0f6
planRef              project/docs/governance/coordination-v2/task-plans/CANARY/plan.v1.json
```

## Bu bir OPERATIONAL CANARY

Amaci urun isi yapmak degil, su zincirin ucdan uca calistigini kanitlamaktir:

```text
request -> enqueue -> admission -> standing grant -> durable queue
        -> dispatch revalidation -> gercek executor -> PR -> CI
        -> merge gate -> auto-merge -> cleanup -> CLOSED
```

Uretilen degisiklik gercektir ve kalicidir (bir characterization testi), ama
is degeri kanitin kendisidir. Rapor bunu **OPERATIONAL CANARY** olarak yazar;
urun isi yapilmis gibi sunmaz.
