# W4-ACT02B — PRODUCTION ACTIVATION EVIDENCE (R01)

```text
PROGRAM:        CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01 (LANE C1)
WAVE:           WAVE 4 — CLIENT_STATEMENT_MONTHLY_DELIVERY ACTIVATION
AUTHORIZATION:  OWNER GO-COMPLETE — W4-ACT02B TAM SAYFA (2026-08-10)
STATUS:         W4-ACT02B = PRODUCTION_ACTIVE / COMPLETE
TIMESTAMP:      2026-08-10 10:13:08 Europe/Istanbul (bayraklı API task start)
```

Bu dosya W4 aktivasyon zincirinin yetkili kapanış kaydıdır. Secret/env değeri içermez;
e-posta adresleri maskelidir.

## 1. Zincir Durumu

```text
W4-ACT01  (FOUNDATION CUTOVER)   = COMPLETE   (backup + 121→125 migration + release cutover +
                                               stable CREDENTIAL_ENCRYPTION_KEY + SMTP re-provision +
                                               allowlist template 9/3/0)
W4-ACT02A (SINGLE CANARY)        = CLOSED / ACCEPTED
                                   transport+attachment+içerik owner kabulü; final PDF v3
                                   SHA-256 55541291a60af85c39b6af578a2c6388e17e20c3a7d796cf1bb6d1f0595cc166
W4-ACT02B (GLOBAL ACTIVATION)    = PRODUCTION_ACTIVE / COMPLETE (bu kayıt)
```

## 2. Production Runtime

```text
API RELEASE:        HY_W4_RELEASE5 @ ecf32001 (provenance korunmuş; task-köklü TEK zincir, port 8080)
WEB RELEASE:        HY_W4_RELEASE3 @ c59a7cbe (dokunulmadı; BUILD_ID probe 200)
MONTHLY FLAG:       CLIENT_STATEMENT_MONTHLY_DELIVERY=true — RELEASE5 runtime env'inde KALICI
CRON:               '0 3 1 * *' · timezone Europe/Istanbul · registry adı client-statement-monthly-delivery
NEXT RUN:           2026-09-01T03:00:00+03:00 (davranışsal kanıt: aynı kod+env diagnostik boot,
                    SchedulerRegistry nextDate çıktısı)
CRON ENVANTERİ:     33 → 34 (yalnız aylık ekstre job'ı eklendi)
MIGRATION FRONTIER: 125/125 · unfinished=0 · rolled_back=0
BOOT-TIME DELIVERY: 0 (restart sonrası yeni ClientNotification=0; ledger değişmedi)
AUTH:               token'sız client route = 401 (fail-closed)
```

## 3. Fresh Preflight (12/12 PASS, salt-okuma)

```text
 1. Listener 8080 task-köklü tek zincir (svchost←cmd←node[shim]←cmd←node)      PASS
 2. API provenance = ecf32001 (task action HY_W4_RELEASE5 + worktree HEAD)     PASS
 3. Web = c59a7cbe, değiştirilmedi                                             PASS
 4. Migration 125/125, failed=0                                               PASS
 5. Flag başlangıçta OFF                                                      PASS
 6. CREDENTIAL_ENCRYPTION_KEY configured=true (değer okunmadı/yazılmadı)       PASS
 7. Telli SMTP: encPrefix=true, decryptRoundTrip=true (değer çıktılanmadı)     PASS
 8. STATEMENT_READY ×3 tenant: aktif, tek hash (b43fc0f9fdd3), kanonik token
    seti {caseFileSuffix, clientName, closingBalanceLine, fileReferenceClause,
    officeName, periodEnd, periodStart}; executionFileNumber YOK               PASS
 9. QUEUED=0 / PENDING=0 / FAILED=0                                           PASS
10. ACT02A kanıt zinciri intakt (aşağıda §4)                                   PASS
11. W4 kabul edilmiş gerçek e-posta = 1. Not: dedupeKey'li SENT toplamı 2'dir —
    ikinci satır 2026-06-15 tarihli W4-öncesi DB-içi smoke kaydı
    (CLIENT_TIMELINE_SMOKE, provider gönderimi değil). Son-24h SENT=1 = canary. PASS
12. Sonraki schedule = 2026-09-01 03:00 Europe/Istanbul                        PASS
```

## 4. ACT02A Dedupe Reconciliation (yeni provider çağrısı YOK)

```text
NOTIFICATION:  cmsm6kale… · STATEMENT_READY · EMAIL · status=SENT · canary client
LEDGER:        cmsm6kai6… · status=SENT · attempts=1 · alıcı ula***@l***
DEDUPE KEY:    STATEMENT_MONTHLY:ClientStatement:cmsm66gk8…:2026-08
STATEMENT:     cmsm66gk8… · status artık ACTIVE DEĞİL (içerik düzeltme zincirinde yenisiyle
               değiştirildi; kanıt olarak KORUNUYOR) · canary client'a ait · dönem 2026-08
CANARY CLIENT: isActive=false → production taramalarının DIŞINDA
SONUÇ:         Aynı dedupeKey'i üreten her koşu, teslim servisindeki SENT-notification
               kontrolü üzerinden SKIPPED_ALREADY_DELIVERED döndürür (deterministik kod yolu);
               ikinci teslim mümkün değil. Yeni notification/ledger satırı ÜRETİLMEDİ,
               fixture/audit/evidence TEMİZLENMEDİ.
```

## 5. Bounded Tenant Impact Gate (PLAN_ONLY / NO-SEND — salt-okuma)

Ölçüm, 1 Eylül koşusunun birebir predikatlarıyla yapıldı: release dist'inden
`resolvePreviousMonthPeriod(2026-09-01T03:00 TRT)` → dönem 2026-08;
`resolveRecipientEmail` + `collectClientLevel` (persistence'sız snapshot üretici).

```text
TARANAN AKTİF MÜVEKKİL: 8 (telli-hukuk)
  SKIPPED_NO_RECIPIENT: 7 (e-posta yok)
  SKIPPED_EMPTY_PERIOD: 1 (adm***@t*** · dönem 2026-08 satırı 0)
  WOULD_DELIVER:        0
BEKLENEN GERÇEK E-POSTA: 0 · BEKLENEN PDF: 0
AYNI ALICIYA DÜŞEN MÜVEKKİL: adm***@t*** ×1
ACT02B SIRASINDA GERÇEK PROVIDER ÇAĞRISI: 0 / üst sınır 0 — İHLAL YOK
```

Canlı bounded koşu BİLİNÇLİ olarak yürütülmedi (kanıtlı gerekçe): teslim pipeline'ı
statement'ı boş-dönem kontrolünden ÖNCE persist eder; bugünkü `now` ile koşu yanlış dönemi
(2026-07) ölçer, ileri-tarihli `now` ile koşu ise Ağustos bitmeden erken snapshot üretir ve
1 Eylül cron'u bu bayat snapshot'ı yeniden kullanırdı — aktivasyon olayının kendisini bozar.
Sıfır sonucu, aynı release kodunun kendi fonksiyonlarıyla salt-okuma kanıtlandı.

## 6. Aktivasyon Uygulaması

```text
1. RELEASE5 runtime env'ine kalıcı satır eklendi (tam 1 kez; PRE=yok, POST=1) — 10:12:49 TRT
2. API ScheduledTask kontrollü restart: tam ağaç kapatıldı → PORT_FREE=true →
   task start 10:13:08 TRT → yeni svchost-köklü tek zincir
3. Web task'a DOKUNULMADI
4. Boot sırasında geçmiş dönem teslimi ÇALIŞMADI (yeni notification=0; cron yalnız KAYIT edildi)
5. Secret/env değerleri stdout/PR/evidence'a YAZILMADI
```

## 7. Rollback

```text
ROLLBACK STATUS: NOT_REQUIRED — tüm gate'ler PASS.
Hazır prosedür: flag satırını kaldır → API task restart → RELEASE5 flag-OFF doğrula;
runtime bozulursa pointer sırası RELEASE4 → RELEASE3 → RELEASE2 → rc-*.
DB restore YOK (migrations additive; production yazımı başladı).
Template/SMTP credential DEĞİŞTİRİLMEZ.
```

## 8. Korunan Kanıt ve Artefaktlar

```text
W4_ACT01_BACKUP\  : hukuk_db dump (SHA 4DD34EF2…AE017) · task XML'leri ·
                    template-rollback-manifest.json · act02a-fixture-manifest.json ·
                    kabul edilen final-B-statement-v3.pdf (SHA 55541291…c166) + tüm capture'lar
DB KANITLARI      : SENT notification + delivery-ledger + kanıt statement + audit kayıtları KORUNDU
RELEASE POINTERS  : HY_W4_RELEASE5 (aktif API) · HY_W4_RELEASE4 · HY_W4_RELEASE3 (aktif Web) ·
                    HY_W4_RELEASE2 · HY_W4_RELEASE · rc-1488063d · rc2-authfix — SİLİNMEZ
SENTETİK FIXTURE  : canary client isActive=false (kimlik kayıtları cascade-audit koruması için
                    duruyor; nihai imha owner kararı)
```

## 9. Sonuç

```text
W4-ACT02B                    = PRODUCTION_ACTIVE / COMPLETE
C1 ACTIVATION DEBT           = CLOSED (CEK ✓ ACT01 · C3 schedule ✓ ACT02B · şablon seed ✓ ACT01 9/3/0)
IMMEDIATE REAL EMAIL         = 0 (ilk koşu 2026-09-01; bugünkü veriyle beklenen teslim 0)
HISTORICAL ACCEPTED REAL     = 1 (ACT02A canary)
OWNER AUTHORIZATION REQUIRED = NO (aylık teslim artık kanonik uygunluk koşullarıyla otomatik)
NEXT ELIGIBLE                = CLIENT PROGRAM TERMINAL CONSOLIDATION
```
