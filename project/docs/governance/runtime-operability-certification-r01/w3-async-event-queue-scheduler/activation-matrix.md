# W3 — Aktivasyon / Konfigurasyon Matrisi

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


## 1. Yontem siniri

Deger veya secret YAZDIRILMADI. Yalniz `PRESENT/ABSENT`, `ENABLED/DISABLED`,
`DEFAULT/OVERRIDDEN` metadata'si kullanildi. Production ortamina erisim YOKTUR;
asagidaki gozlem yerel RUNTIME worktree'sinin `.env` dosyasindandir.

## 2. Aktivasyon kaynaklari

| Kaynak | Durum |
|---|---|
| env degiskenleri | KULLANILIYOR (`ConfigModule.forRoot({isGlobal:true})`) |
| konfigurasyon dosyalari | async aktivasyonu icin YOK |
| feature flag | env-tabanli, kod icinde `process.env.X === 'true'` |
| process komutlari | `node dist/apps/api/src/main.js` (tek process) |
| package script'leri | ayri worker/scheduler script'i YOK |
| Docker/compose servisleri | repoda YOK |
| deployment manifesti | repoda YOK |
| hosting cron | KANIT YOK |
| GitHub Actions schedule | YOK |

## 3. Async ile ilgili anahtarlar (yerel RUNTIME `.env`, 15 anahtar)

| Anahtar | Durum | Kod varsayilani | Sonuc |
|---|---|---|---|
| `ICRABOT_OUTBOX_CRON_ENABLED` | ABSENT | `=== 'true'` -> false | outbox cron **DORMANT** (job kayitli, govde hemen doner) |
| `ICRABOT_OUTBOX_BATCH_SIZE` | ABSENT | 50 | DEFAULT |
| `ICRABOT_OUTBOX_MAX_ATTEMPTS` | ABSENT | 8 | DEFAULT |
| `ICRABOT_OUTBOX_RETRY_BASE_MS` | ABSENT | 60000 | DEFAULT |
| `ICRABOT_OUTBOX_STALE_CLAIM_MS` | ABSENT | 600000 | DEFAULT |
| `ICRABOT_V28_*_ENABLED` | ABSENT | false | DORMANT |
| `SIMULATION_API_ENABLED` | ABSENT | `!== "false"` -> **true** | **SimulationApiModule YUKLU** |
| `OFFICE_APPROVAL_EXECUTOR_CRON_ENABLED` | ABSENT | — | cron job KAYITLI (`officeApprovalExecutor`) |
| `LEGAL_TIME_SHADOW_ENABLED` | ABSENT | false | DORMANT |

## 4. Aktivasyon siniflandirmasi

| Sinif | Sayi | Ornek |
|---|---|---|
| DEFAULT_ON (cron kayitli, gate yok) | 30 bildirim | `SchedulerService`, `AutomationService`, `AddressTaskSchedulerService` |
| CONFIG_GATED | 3 bildirim | `OutboxCronService`, `CaseTaskEscalationService`, `AutomationService.sendExpiringPoaNotifications` |
| NOT_STARTED (UNBOUND) | 2 bildirim + 5 alt agac | `IcrabotModule`, `manifest-retry`, `playbook` |
| CONFIG_GATED_SIMULATION_API | 2 modul | `SimulationApiModule`, `TruthLayerModule` |

**Uyari:** DEFAULT_ON cron'lar bu ortamda GERCEKTEN calisiyor; ancak bu, is mantiklarinin
dogru calistigi anlamina GELMEZ — 33 job'un yalniz 1'i (`OutboxCronService`) bu turda
uctan uca sertifikalandi.
