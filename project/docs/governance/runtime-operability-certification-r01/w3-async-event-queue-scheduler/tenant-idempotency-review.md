# W3 — Tenant Siniri ve Idempotency Incelemesi

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


## 1. Tenant siniri — outbox kuyrugu

| Kontrol | Sonuc | Kanit |
|---|---|---|
| tenant kimden cozuluyor? | **outbox satirindan** (`action.tenantId`), cagirandan degil | `dispatch` `effectiveTenantId = action.tenantId` |
| payload tenantId tasiyor mu? | Satir tasiyor; `tenantId` **NOT NULL** | schema.prisma `IcrabotOutboxAction.tenantId String` |
| tenantId authoritative kaynaktan mi? | **EVET** — write-time capture, `createAction` fail-closed guard | `outbox_tenant_required` throw |
| consumer yeniden authorization yapiyor mu? | **KISMEN** — satir-seviyesi kapsam kontrolu VAR, case sahipligi kontrolu **YOK** | matrix G (PASS) vs matrix M (**W3-D02**) |
| cross-tenant lookup mumkun mu? | Okuma yollarinda **HAYIR** | matrix G: `visibleToB=false`, `getByB=null` |
| idempotency tenant-scoped mi? | **HAYIR** — `idempotencyKey` GLOBAL unique | schema `@unique` (tenant bilesenli degil) |
| retry sirasinda tenant korunuyor mu? | **EVET** | matrix H: `tenantKorundu=true` |

### Global idempotencyKey degerlendirmesi

`idempotencyKey` tenant bilesenli DEGILDIR. Uretilen anahtarlar caseId/ruleId icerir
(`${actionType}:${caseId}:${rule_id}:${idx}:${actionIdx}`) ve caseId zaten tenant'a ozgudur,
bu nedenle pratikte carpisma GOZLENMEDI. Ancak sozlesme seviyesinde tenant izolasyonu
**anahtarin icerigine** bagimlidir, semaya degil. Kayit altina alinmistir; bu turda
istismar edilebilir bir yol uretilemedi.

## 2. Idempotency — kontrollu duplicate delivery testi

| Test | Beklenen | Gozlenen |
|---|---|---|
| Ayni `idempotencyKey` ile ikinci `createAction` | `null` doner, ikinci satir olusmaz | **null** |
| Ayni action'in ikinci `dispatch`'i | claim CAS reddeder, `skipped` | **skipped=true** |
| Yan etki sayisi | 1 (tekrarlanmaz) | **0 -> 1 -> 1** |

"Sadece transaction var" idempotency kaniti sayilmadi; gercek duplicate delivery yurutuldu.

## 3. Etki tablolarinda tenant atfi — BULGU (W3-D02)

`information_schema` ile dogrulandi. `tenantId` kolonu **TASIYAN** icrabot tablolari:
`IcrabotOutboxAction`, `IcrabotTimelineEntry`, `IcrabotAuditLog`, `IcrabotLock`,
`IcrabotFact`, `IcrabotBundle`, `IcrabotEvidence`, `IcrabotEvidenceExport`,
`IcrabotJobRun`, `IcrabotApprovalRequest`, `IcrabotRecipePause`, `IcrabotUiMapRecording`.

`tenantId` kolonu **TASIMAYAN** async etki tablolari:
`IcrabotNotification`, `IcrabotSmsLog`, `IcrabotEmailLog`, `IcrabotTask`,
`IcrabotUyapSubmission` — hepsi yalniz `caseId` tasir ve FK YOKTUR.

**Kalibrasyon:** OBSERVED_GAP. Tutarsiz `(tenantId, caseId)` cifti yazan bir uretici
BULUNAMADI; kanitlanmis exploit DEGILDIR. `CROSS_TENANT_ASYNC_EXECUTION_RISK` etiketi
**savunma derinligi** seviyesinde kullanilmistir, aktif sizinti iddiasi olarak degil.

Tenant siniri FAIL eden hicbir capability bu turda default-on hale GETIRILMEMISTIR.
