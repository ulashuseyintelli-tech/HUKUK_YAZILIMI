# GOV-COORD-DTV-DOGFOOD-SEMANTIC-R03

```text
Record   : GOV-COORD-DTV-DOGFOOD-SEMANTIC-R03
Kind     : SEMANTIC_AUTHORITY
Program  : ORCHESTRA-DELIVERY-TRUTH-R01
Owner    : OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01
```

Bu kayit, GOV-COORD-DTV-DOGFOOD-CERTIFICATION-R03 icin semantik otoriteyi tasir.

R02 zinciri gercek kosumla tamamlandi ve yolun kendisinde uc defect buldu.
R03, #1813 sonrasi onarilmis delivery-truth zincirini tek bir kayit uzerinde
bastan sona sertifikalandirmak icindir. Urun-domain semantigi degismez.

Task'in bounded degisikligi olculmus bir boslugu kapatir: verifier'in URETTIGI
kanit kaydinin alan kumesi ile successor kapisinin OKUDUGU alan kumesi iki
bagimsiz listedir ve hicbir test onlari birbirine baglamaz. Bu boslugun bedeli
olculmustur — kalici kayit merge commit'ini `expectedMergeSha` diye adlandirdi,
kapi `mergeSha` istedi, ve gecerli bir PASS kaniti kapiya STALE gorundu.

OWNER-DECISION-GOV-COORD-DELIVERY-TRUTH-R01 dogfood certification R03 is authorized to run through the canonical service path with task-bounded auto-merge.
