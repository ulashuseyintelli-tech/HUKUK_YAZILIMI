# Uygulama Planı: Phase 13.3 — p99 Eşik Kalibrasyonu & Deploy Öncesi Hazırlık

## Genel Bakış

Runbook §3'teki basit kalibrasyon prosedürünü formal bir prosedüre genişletme, alert kuralına kalibrasyon hedefi yorumları ekleme, post-kalibrasyon checklist'i oluşturma ve CI test güncellemeleri. Tüm değişiklikler pre-deploy niteliğindedir — alert kuralı değerleri değişmez.

## Görevler

- [x] 1. Runbook §3 kalibrasyon prosedürünü genişlet
  - [x] 1.1 Mevcut basit 5 adımlı kalibrasyon prosedürünü formal prosedürle değiştir
    - `docs/redrive-ops-runbook.md` §3 "Deep dive" altındaki "Kalibrasyon Prosedürü" bölümünü genişlet
    - Alt bölümler: Gözlem Penceresi Tanımı (7 gün), Baseline Çıkarma Yöntemi (p99 median-of-daily), Eşik Formülü (baseline × çarpan), Çarpan Karar Kriterleri (1.5–2.0 aralığı, karar matrisi), Gürültü Bastırma (ilk 24-48 saat hariç tutma)
    - Mevcut "baseline × 3" ifadesini 1.5–2.0 çarpan aralığıyla değiştir
    - Günlük p99 çıkarma ve median hesaplama için PromQL sorguları ekle
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 3.1, 3.2_
  - [x] 1.2 "Ne zaman kalibre edilmeli / Ne zaman kalibre edilmemeli" alt bölümünü ekle
    - Kalibrasyon tetikleyicileri: trafik pattern değişikliği, altyapı değişikliği, false positive artışı
    - Kalibrasyon yapılmaması gereken durumlar: aktif incident, bilinen trafik anomalisi, deploy sonrası ilk 48 saat
    - _Requirements: 2.2, 2.3, 3.3_
  - [x] 1.3 Min Sample Guard ayarlama rehberini ekle
    - Mevcut 0.1 req/s değerinin trafik hacmine göre ayarlanması gerektiğini açıkla
    - Düşük trafik (< 0.05 req/s) ve yüksek trafik (> 1 req/s) senaryoları
    - _Requirements: 3.4_

- [x] 2. Post-kalibrasyon güncelleme checklist'ini runbook §3'e ekle
  - [x] 2.1 Checklist'i kalibrasyon prosedürü sonrasına ekle
    - 10 adımlı checklist: eşik hesaplama, alert kuralı güncelleme, min sample guard değerlendirme, YAML yorum güncelleme, test güncelleme, CI çalıştırma, runbook güncelleme, PR oluşturma, deploy, rollback planı
    - Dosya yollarını açıkça belirt: `ops/prometheus/redrive-alerts.yml`, `redrive-ops-artifacts.spec.ts`
    - CI komutu: `npx jest --testPathPattern="redrive-ops-artifacts" --no-coverage`
    - Rollback prosedürü: false positive artarsa eski değerlere geri dönme adımları
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 3. Alert kuralına kalibrasyon hedefi yorumları ekle
  - [x] 3.1 `RedriveTxDurationHigh` alert bloğuna kalibrasyon hedefi YAML yorumları ekle
    - `ops/prometheus/redrive-alerts.yml` dosyasında `RedriveTxDurationHigh` yorum bloğunu genişlet
    - `p99_threshold = 2` ve `min_sample_guard = 0.1` kalibrasyon hedefi olarak işaretle
    - `LOCKED başlangıç` ifadesi ekle
    - Runbook §3 kalibrasyon prosedürüne referans ekle
    - Alert'in `expr`, `for`, `labels`, `annotations` değerlerini DEĞİŞTİRME
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Checkpoint — Doküman ve konfigürasyon değişikliklerini doğrula
  - Mevcut test'lerin hâlâ geçtiğini doğrula: `npx jest --testPathPattern="redrive-ops-artifacts" --no-coverage`
  - YAML parse hatası olmadığını doğrula
  - Runbook anchor link'lerinin kırılmadığını doğrula
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. CI test güncellemeleri
  - [x] 5.1 Kalibrasyon prosedürü tamlık test'lerini ekle
    - `redrive-ops-artifacts.spec.ts` dosyasına yeni `describe` bloğu ekle
    - Runbook §3'te formal kalibrasyon prosedürü alt bölümlerinin varlığını doğrula
    - Gözlem penceresi (7 gün), baseline yöntemi (median-of-daily), çarpan aralığı (1.5–2.0), gürültü bastırma (24-48 saat), kalibrasyon tetikleyicileri, "ne zaman yapılmamalı" bölümlerini kontrol et
    - Eski "× 3" çarpanının kaldırıldığını doğrula
    - PromQL sorgu bloklarının varlığını doğrula
    - **Property 2: Kalibrasyon Prosedürü Tamlık**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4**
    - _Requirements: 6.1_
  - [x] 5.2 Alert kalibrasyon yorumları test'lerini ekle
    - `RedriveTxDurationHigh` alert bloğunda kalibrasyon hedefi yorumlarının varlığını doğrula
    - `p99_threshold`, `min_sample_guard`, `LOCKED`, runbook referansı anahtar kelimelerini kontrol et
    - **Property 3: Alert Kalibrasyon Yorumları**
    - **Validates: Requirements 4.1, 4.2, 4.4**
    - _Requirements: 6.2_
  - [x] 5.3 Post-kalibrasyon checklist tamlık test'lerini ekle
    - Checklist'in runbook §3'te mevcut olduğunu doğrula
    - Alert kuralı güncelleme, test güncelleme, CI doğrulama, rollback adımlarının varlığını kontrol et
    - Dosya yolu referanslarını doğrula
    - **Property 4: Post-Kalibrasyon Checklist Tamlık**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - _Requirements: 6.3_
  - [ ]* 5.4 Alert kuralı LOCKED invariant test'ini ekle
    - 5 alert kuralının expr, for, labels, annotations değerlerinin bilinen LOCKED değerlerle eşleştiğini doğrula
    - Her alert için ayrı kontrol
    - **Property 1: Alert Kuralı Değerleri LOCKED İnvariantı**
    - **Validates: Requirements 4.3**

- [x] 6. Final checkpoint — Tüm test'lerin geçtiğini doğrula
  - `npx jest --testPathPattern="redrive-ops-artifacts" --no-coverage` çalıştır
  - Tüm test'ler (mevcut 76 + yeni) yeşil olmalı
  - Ensure all tests pass, ask the user if questions arise.

## Notlar

- `*` ile işaretli görevler opsiyoneldir ve hızlı MVP için atlanabilir
- Her görev belirli gereksinimlere referans verir (izlenebilirlik)
- Checkpoint'ler artımlı doğrulama sağlar
- Alert kuralı değerleri (expr, for, labels, annotations) LOCKED — yalnızca YAML yorumları eklenir
- Test'ler eşik değerlerinin kendisini doğrulamaz — değerler deploy sonrası değişecektir
- Test dosyası: mevcut `redrive-ops-artifacts.spec.ts` dosyasına ekleme yapılır
