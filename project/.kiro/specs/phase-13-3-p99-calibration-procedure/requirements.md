# Gereksinimler Dokümanı — Phase 13.3: p99 Eşik Kalibrasyonu & Deploy Öncesi Hazırlık

## Giriş

Phase 13.3, `RedriveTxDurationHigh` alert'inin p99 eşik değerini production verisine dayalı olarak kalibre etmek için formal bir prosedür tanımlar. Mevcut runbook §3'teki basit 5 adımlı kalibrasyon prosedürü, kapsamlı bir formal prosedüre genişletilir. Alert kuralındaki eşik değerleri (`> 2` ve `> 0.1`) kalibrasyon hedefleri olarak işaretlenir ancak değiştirilmez. Deploy sonrası uygulanacak adımlar bir checklist olarak dokümante edilir.

**Kapsam:** Pre-deploy hazırlık — production verisi gerektirmez.
**Kapsam dışı:** Gerçek eşik değişikliği (post-deploy), SLO/SLA bağlama, yeni uygulama kodu, mevcut alert kurallarını değiştirme.

## Sözlük

- **Kalibrasyon_Prosedürü**: Production verisine dayalı olarak alert eşik değerlerini belirleme ve güncelleme süreci
- **Baseline**: 7 günlük gözlem penceresinden çıkarılan p99 medyan-of-daily değeri — eşik hesaplamasının temel girdisi
- **Çarpan**: Baseline değerine uygulanan güvenlik marjı katsayısı (1.5–2.0 aralığı)
- **Min_Sample_Guard**: Düşük trafik hacminde false positive önlemek için alert expr'ında kullanılan minimum gözlem sayısı kontrolü (`> 0.1` req/s)
- **Gözlem_Penceresi**: Baseline çıkarmak için kullanılan veri toplama süresi (7 gün — hafta içi/hafta sonu pattern'lerini kapsar)
- **Gürültü_Bastırma**: Deploy sonrası ilk 24-48 saatin baseline hesaplamasından hariç tutulması (cold start, cache warming etkileri)
- **Kalibrasyon_Hedefi**: Alert kuralındaki parametrik değerler (`p99_threshold = 2s`, `min_sample_guard = 0.1 req/s`) — deploy sonrası kalibrasyonla güncellenecek
- **Runbook**: `docs/redrive-ops-runbook.md` — DLQ redrive operasyonel prosedürleri dokümanı
- **Alert_Kuralı**: `ops/prometheus/redrive-alerts.yml` — Prometheus alert tanımları (5 alert, LOCKED)

## Gereksinimler

### Gereksinim 1: Formal Kalibrasyon Prosedürü

**Kullanıcı Hikayesi:** Bir operatör olarak, p99 eşik değerini production verisine dayalı olarak sistematik şekilde kalibre etmek istiyorum, böylece false positive ve false negative alert oranını minimize edebilirim.

#### Kabul Kriterleri

1. THE Runbook §3 SHALL contain a formal calibration procedure with the following sub-sections: observation window definition, baseline extraction method, threshold formula, multiplier decision criteria, and noise suppression rules
2. THE Kalibrasyon_Prosedürü SHALL specify a 7-day Gözlem_Penceresi that captures weekday and weekend traffic patterns
3. THE Kalibrasyon_Prosedürü SHALL define the Baseline extraction method as p99 median-of-daily — computing daily p99 values for each of the 7 days, then taking the median of those 7 values
4. THE Kalibrasyon_Prosedürü SHALL define the threshold formula as: `threshold = Baseline × Çarpan`
5. THE Kalibrasyon_Prosedürü SHALL specify the Çarpan range as 1.5–2.0 with explicit decision criteria for choosing within the range
6. THE Kalibrasyon_Prosedürü SHALL include PromQL queries for extracting daily p99 values and computing the Baseline

### Gereksinim 2: Gürültü Bastırma ve Kalibrasyon Tetikleyicileri

**Kullanıcı Hikayesi:** Bir operatör olarak, deploy sonrası geçici anomalilerin baseline'ı bozmasını önlemek ve ne zaman yeniden kalibrasyon yapılması gerektiğini bilmek istiyorum, böylece eşik değerleri her zaman güncel ve güvenilir kalır.

#### Kabul Kriterleri

1. THE Kalibrasyon_Prosedürü SHALL specify that the first 24-48 hours post-deploy are excluded from Baseline calculation due to cold start and cache warming effects
2. THE Kalibrasyon_Prosedürü SHALL define explicit re-calibration triggers: traffic pattern change, infrastructure change, and false positive spike
3. THE Kalibrasyon_Prosedürü SHALL define "when NOT to calibrate" criteria: during active incidents, during known traffic anomalies, and within the first 48 hours post-deploy

### Gereksinim 3: Runbook §3 Genişletme

**Kullanıcı Hikayesi:** Bir operatör olarak, runbook §3'ün mevcut basit kalibrasyon prosedürünün kapsamlı bir formal prosedüre genişletilmesini istiyorum, böylece kalibrasyon süreci tekrarlanabilir ve tutarlı olur.

#### Kabul Kriterleri

1. THE Runbook §3 SHALL replace the existing 5-step basic calibration procedure with the expanded formal Kalibrasyon_Prosedürü
2. THE Runbook §3 SHALL revise the multiplier from the current "baseline × 3" to the 1.5–2.0 Çarpan range with decision criteria
3. THE Runbook §3 SHALL include a "Ne zaman kalibre edilmeli / Ne zaman kalibre edilmemeli" sub-section
4. THE Runbook §3 SHALL include a Min_Sample_Guard tuning guidance sub-section explaining that the current 0.1 req/s value may need adjustment based on actual traffic volume

### Gereksinim 4: Alert Parametrizasyonu

**Kullanıcı Hikayesi:** Bir operatör olarak, alert kuralındaki kalibrasyon hedeflerinin açıkça işaretlenmesini istiyorum, böylece hangi değerlerin deploy sonrası kalibrasyonla değişeceği net olur.

#### Kabul Kriterleri

1. THE Alert_Kuralı SHALL contain YAML comments on the `RedriveTxDurationHigh` alert indicating that `> 2` (p99_threshold) and `> 0.1` (min_sample_guard) are Kalibrasyon_Hedefi values
2. THE Alert_Kuralı SHALL contain a comment indicating the default values (2s, 0.1 req/s) are LOCKED starting values pending post-deploy calibration
3. THE Alert_Kuralı SHALL NOT change the actual `expr`, `for`, `labels`, or `annotations` values of any alert rule — only YAML comments are added
4. IF a comment is added to the Alert_Kuralı, THEN the comment SHALL reference the Runbook §3 calibration procedure section

### Gereksinim 5: Post-Kalibrasyon Güncelleme Checklist'i

**Kullanıcı Hikayesi:** Bir operatör olarak, kalibrasyon sonrası yapılması gereken tüm güncelleme adımlarını bir checklist olarak görmek istiyorum, böylece hiçbir adım atlanmaz.

#### Kabul Kriterleri

1. THE Runbook §3 SHALL contain a post-calibration update checklist with the following steps: alert rule change, test update, runbook revision, and approval/rollback
2. THE post-calibration checklist SHALL specify the exact file paths to update: `ops/prometheus/redrive-alerts.yml` for alert rules and `redrive-ops-artifacts.spec.ts` for tests
3. THE post-calibration checklist SHALL include a CI validation step requiring all tests to pass before deploying threshold changes
4. THE post-calibration checklist SHALL include a rollback procedure for reverting threshold changes if false positive rate increases

### Gereksinim 6: Test Güncellemeleri

**Kullanıcı Hikayesi:** Bir geliştirici olarak, kalibrasyon prosedürünün varlığını ve tutarlılığını CI'da doğrulamak istiyorum, böylece prosedür bozulduğunda veya eksik kaldığında otomatik olarak tespit edilir.

#### Kabul Kriterleri

1. THE test suite SHALL validate that Runbook §3 contains the formal calibration procedure with all required sub-sections
2. THE test suite SHALL validate that the Alert_Kuralı contains calibration target comments on the `RedriveTxDurationHigh` alert
3. THE test suite SHALL validate that the post-calibration checklist exists in Runbook §3 and contains all required steps
4. THE test suite SHALL NOT validate specific threshold values — threshold values are expected to change post-deploy
5. THE test suite SHALL be appended to the existing `redrive-ops-artifacts.spec.ts` file
