# W3 — Karar Gunlugu

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


| # | Karar | Gerekce |
|---|---|---|
| K-01 | Audit base olarak **guncel** `origin/main` (`c537cb3a`) alindi | PHASE 0 sirasinda `0d9b81e8` idi; PR #1943 merge oldu. §7: fresh main ilerlemisse current descendant base kaydedilir. #1943 yalniz CLIENT/ClientAddress + governance dokunur — async runtime ile **cakisma YOK** |
| K-02 | Implementasyon canonical root'ta DEGIL, izole worktree'de yapildi | Canonical root `docs/post-phase-5-residual-hygiene-closure-r01` branch'indeydi (SHA main ile ayni); §7 canonical root'ta implementasyonu yasaklar |
| K-03 | Statik analiz **uc kez** revize edildi | v1 yorumlanmis `IcrabotModule` importunu BAGLI saydi; v2 barrel re-export'lari kacirdi; v3 her ikisini de cozdu. Ilk iki surumun ciktisi **kullanilmadi** |
| K-04 | Rate-limit guard'lari "UNBOUND" olarak raporlanmadi | `@UseGuards` Nest enhancer'i ile DI uzerinden baglanir; provider dizisinde olmamak baglanmamak demek DEGILDIR |
| K-05 | Runtime kaniti disposable Postgres uzerinde alindi | Ikinci bir app-context'i gercek `hukuk_db`'ye baglamak cron'lari **cift** calistirir ve duplicate domain etkisi uretebilirdi. §22 zaten production DB mutation'i yasaklar |
| K-06 | `webhook` handler'i duzeltilmedi | Sema/migration veya urun karari gerekir (§27). Yerine KNOWN_GAP kaydi + regression guard |
| K-07 | Dormant alt agaclar baglanmadi | Baglamak = production activation. §4.12 ile yetki VERILMEMISTIR |
| K-08 | Timezone bildirimleri eklenmedi | §4.11 yeni scheduler politikasi tasarlanmasini yasaklar; hedef TZ owner karari |
| K-09 | Matrix M bilincli olarak FAIL olarak raporlandi | Guvenli davranis "red" olurdu; gozlenen "kabul". Sonucu PASS gostermek yanlis sertifikasyon olurdu |
| K-10 | W3-D02 "kanitlanmis exploit" olarak siniflandirilmadi | Tutarsiz `(tenantId, caseId)` cifti yazan uretici bulunamadi; OBSERVED_GAP kalibrasyonu kullanildi |
| K-11 | Terminal durum **CLOSED / PARTIAL CERTIFICATION** secildi | Envanter ve temsilci matris tamam; ancak 8 defect defer edildi ve 32 job NOT_TESTED. `CLOSED / CERTIFIED` iddiasi desteklenmiyor |
