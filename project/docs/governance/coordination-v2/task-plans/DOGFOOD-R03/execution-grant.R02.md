# GOV-COORD-DTV-DOGFOOD-EXEC-GRANT-R03-REVISION-R02

<!-- GOV-COORD-AUTHORITY kind=EXECUTION_GRANT recordId=GOV-COORD-DTV-DOGFOOD-EXEC-GRANT-R03-REVISION-R02 -->

```text
Record        : GOV-COORD-DTV-DOGFOOD-EXEC-GRANT-R03-REVISION-R02
Task          : GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R03
Revision      : 2
Task spec     : 2
Revision of   : 1
Successor     : GOV-COORD-DTV-DOGFOOD-SUCCESSOR-R03
Program       : DELIVERY_TRUTH
Standing grant: STANDING-GRANT-DELIVERY-TRUTH-DOGFOOD-R01
Executor lane : CODEX_LOCAL
Merge         : SQUASH, task-bounded auto-merge
Owner         : OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01
Ratified at   : 6daac3c6e8763f84fe6c21f47b689e0a10918b0d
```

Execution grant. Yetki yalniz R03 task identity'sinin immutable revision 2
planina aittir. `taskSpecVersion: 2`, runtime plan/grant validator'un digest'e
dahil ettigi revision pinidir ve semantic authority'deki `revisionId: 2` ile
birebir eslesir. Eski v3 plan/grant/request ve terminal task-store kaydi bu
grant tarafindan degistirilmez veya yeniden kullanilmaz.

Successor kaydi execution talebi degildir. Grant icindeki successor satiri
yalniz declared-successor kimligini ve full digest kumesini successor gate icin
pinler; successor request'i uretilmez ve successor dispatch edilmez.

Predecessor revision 2 pinned digests:

```text
taskSpecSha256          : 2087832b2d33ec7589073391d1e82ca88811c2ca4471f80b91bbf44b6ae29d51
declaredIntentSha256    : 7b45dfa3183da81990ff2895edc5b05223401490640633b5bf216816b59b6e9e
boundaryPolicySha256    : 737dc6a9fe402153da40d0fb3d26231c8925b36066fae294f242593b0ce1c142
requiredTestsSha256     : 1197e821eb7f8c6b7f996c7ca1f1c813a3b82634a68a3462599b9ffecfc1effc
deliveryContractSha256  : 327d6eb5da97099959c2832350be4a6c527a635f6750c7a913c1e3dda32ca809
```

Successor pinned digests:

```text
taskId                  : GOV-COORD-DTV-DOGFOOD-SUCCESSOR-R03
taskSpecSha256          : 5f5e20643ed12d619a3702cb1bae611c93513824fa354ec10aaa61e978bb771d
declaredIntentSha256    : 46d635e1d50e8dd28ff5b52a5d9f36589012a02443bb274f37387054bf213efc
boundaryPolicySha256    : 737dc6a9fe402153da40d0fb3d26231c8925b36066fae294f242593b0ce1c142
requiredTestsSha256     : 1197e821eb7f8c6b7f996c7ca1f1c813a3b82634a68a3462599b9ffecfc1effc
deliveryContractSha256  : 327d6eb5da97099959c2832350be4a6c527a635f6750c7a913c1e3dda32ca809
predecessorTaskIds      : GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R03
```
