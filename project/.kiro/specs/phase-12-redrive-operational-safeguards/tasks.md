# Tasks — Phase 12: Redrive Operational Safeguards

## Task List

- [x] 1. Metrik tanımları + resetAllMetrics güncellemesi
  - [x] 1.1 `carrier-lifecycle-metrics.ts`'ye `SimpleGauge` class ekle (name, help, set/get/reset)
  - [x] 1.2 `redriveTxDurationHistogram` tanımla — `carrier_redrive_tx_duration_seconds`, buckets: `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`, labels: none
  - [x] 1.3 `redriveKillSwitchGauge` tanımla — `carrier_redrive_kill_switch_active`, SimpleGauge
  - [x] 1.4 `redriveDisabledMetric` tanımla — `carrier_redrive_disabled_total`, SimpleCounter, labels: none
  - [x] 1.5 `resetAllMetrics()` fonksiyonuna 3 yeni metriği ekle
  - _Requirements: 1.2, 1.3, 1.6, 3.1, 3.2, 3.4, 5.2_

- [x] 2. Kill-switch implementasyonu
  - [x] 2.1 `redrive-kill-switch.ts` dosyası oluştur — `isRedriveDisabled()` fonksiyonu (`process.env.REDRIVE_DISABLED?.toLowerCase() === 'true'`)
  - [x] 2.2 Controller `redriveDlqEntry()` method'unun EN BAŞINA kill-switch check ekle — `isRedriveDisabled()` → 503 `ServiceUnavailableException` + `code: 'REDRIVE_DISABLED'`
  - [x] 2.3 Kill-switch 503 path'inde `redriveDisabledMetric.inc()` çağrısı ekle
  - [x] 2.4 Controller constructor veya `onModuleInit`'te `redriveKillSwitchGauge.set(isRedriveDisabled() ? 1 : 0)` ekle
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.4_

- [x] 3. TX duration observability implementasyonu
  - [x] 3.1 `atomicRedrive` çağrısını `try/finally` ile sar — `finally` bloğunda tek yerden `redriveTxDurationHistogram.observe((Date.now() - txStart) / 1000)` ekle
  - _Requirements: 1.1, 1.5, 5.3_

- [x] 4. Kill-switch testleri
  - [x] 4.1 Test: `REDRIVE_DISABLED=true` → 503 + `REDRIVE_DISABLED` code döner
  - [x] 4.2 Test: `REDRIVE_DISABLED=true` → `atomicRedrive` çağrılmaz (mock verify)
  - [x] 4.3 Test: `REDRIVE_DISABLED=true` → `carrier_redrive_disabled_total` counter artmış
  - [x] 4.4 Test: `REDRIVE_DISABLED` unset → mevcut davranış korunur (regression)
  - [x] 4.5 Test: Gauge init — flag on → gauge=1, flag off → gauge=0
  - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [x] 5. TX duration testleri
  - [x] 5.1 Test: Başarılı `atomicRedrive` sonrası histogram'da observe var (bucket count > 0)
  - [x] 5.2 Test: `atomicRedrive` hata fırlatınca histogram'da yine observe var
  - _Requirements: 4.1_

- [x] 6. Regression + spec tutarlılık kontrolü
  - [x] 6.1 Full regression: mevcut test suite'leri kırılmamış
  - [x] 6.2 Spec ↔ kod ↔ test üçgen kontrolü: metrik isimleri requirements ↔ design ↔ kod ↔ test'te birebir
  - _Requirements: 5.1_
