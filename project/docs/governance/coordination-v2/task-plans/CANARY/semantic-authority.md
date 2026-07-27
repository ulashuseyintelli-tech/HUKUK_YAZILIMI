# CANARY semantic authority — CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R01-AUTHORITY

<!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R01-AUTHORITY -->

```text
recordId : CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R01-AUTHORITY
kind     : SEMANTIC_AUTHORITY
program  : OFFICE
scope    : TEST_ONLY_CHARACTERIZATION
```

## Ne yetkilendirilir

Yalniz su dosyanin **eklenmesi**:

```text
project/apps/api/src/modules/office/__tests__/office-credential-encryption.characterization.spec.ts
```

Bu test mevcut davranisi **tarif eder**, degistirmez. `office-credential-encryption.util.ts`
dosyasina dokunulmaz; production semantigi uretilmez.

## Ne yetkilendirilmez

```text
util dosyasinin kendisi          DOKUNULMAZ
yeni sifreleme semantigi          YOK
anahtar yonetimi degisikligi      YOK
schema / migration                YOK
baska modul                       YOK
```

Bu kayit `OWNER-GRANT-ORCHESTRA-E2E-ALL-PROGRAMS-R02` envelope'u altinda,
OFFICE standing grant'inin izinli koklerinde uretilmistir.
