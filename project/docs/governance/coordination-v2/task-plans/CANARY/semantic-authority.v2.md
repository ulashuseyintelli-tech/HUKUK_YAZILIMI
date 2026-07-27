# CANARY R02 semantic authority — CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R02-AUTHORITY

<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R02-AUTHORITY -->

```text
recordId : CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R02-AUTHORITY
kind     : SEMANTIC_AUTHORITY
program  : OFFICE
scope    : TEST_ONLY_CHARACTERIZATION
executor : CODEX_LOCAL
```

## Ne yetkilendirilir

Yalniz su dosyanin eklenmesi:

```text
project/apps/api/src/modules/office/__tests__/office-credential-encryption.characterization.spec.ts
```

Bu test mevcut davranisi **tarif eder**, degistirmez.

## Ne yetkilendirilmez

```text
util dosyasinin kendisi       DOKUNULMAZ
yeni sifreleme semantigi      YOK
anahtar yonetimi degisikligi  YOK
schema / migration            YOK
baska modul                   YOK
```
