# W3 — Residual Risk Register

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


| # | Residual | Etki | Neden bu turda kapanmadi |
|---|---|---|---|
| R-01 | **32 cron job'un timezone'u process ortamina bagli** | Hukuki sure hesaplayan job'lar ortam TZ'si degisirse sessizce kayar | Hedef timezone bir owner politikasidir (§4.11) |
| R-02 | **Async etki tablolarinda tenant atfi yok** | Adli denetim izi tenant-kirilimli degildir | Sema degisikligi gerekir |
| R-03 | **`webhook` action tipi hicbir zaman basarili olamaz** | Bir rule-pack `action: webhook` tanimlarsa 8 deneme yanip dead-letter | Sema/urun karari gerekir |
| R-04 | **Handler'i olmayan action sonsuza kadar pending kalir** | Yanlis yazilmis tek action tipi kalici log gurultusu uretir | Poison-message politikasi owner karari |
| R-05 | **33 job'un 32'sinde uctan uca sertifikasyon YOK** | Yalniz `OutboxCronService` zinciri CERTIFIED; digerleri NOT_TESTED | Temsilci-set yontemi geregi; kalan job'lar ayri dalgalarda |
| R-06 | **Dormant alt agaclar (retry worker, playbook, icrabot)** | Kod ve testleri var, production'da hic baslamaz | Baglamak production activation'dir |
| R-07 | **Coklu-instance davranisi olculmedi** | Dagitik kilit yok; iki API instance'i ayni cron'u ayni anda calistirir | Coklu-instance dagitim manifesti repoda yok |
| R-08 | **14 cron metodunda try/catch yok** | Kalici hata ErrorLog'a dusmez | Duzeltme kapsami cok genis |
| R-09 | **`idempotencyKey` tenant bilesenli degil** | Izolasyon anahtarin icerigine bagli, semaya degil | Istismar edilebilir yol uretilemedi; sema degisikligi gerekir |
| R-10 | **W0/W1/W2 artefaktlari canonical dizinde bulunamadi** | `project/docs/governance/runtime-operability-certification-r01/` bu task oncesinde MEVCUT DEGILDI | Owner beyani (§1) kabul edildi; yol yoklugu kayit altina alindi |
| R-11 | **Stop-hook residual korundu** | `.claude/settings.json` eski yol kullaniyor | §3 geregi DOKUNULMADI; W3 araclarini engellemedi |

## Repository-wide durum

```
PARTIAL / OPERATIONALLY UNCERTIFIED
```

W3 sonunda repository-wide `PRODUCTION CERTIFIED` **ILAN EDILMEMISTIR** (§4.14).
