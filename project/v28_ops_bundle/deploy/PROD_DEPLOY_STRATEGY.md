# Prod Deploy Stratejisi (v28)

Tarih: 2026-01-05 (Europe/Istanbul)

Amaç
----
Otomasyonun "fayda" üretirken "zarar" üretmemesi. Bu yüzden aksiyonları 3 sınıfa ayırıyoruz:

- AUTO: otomatik çalışabilir (low risk, low impact, reversible)
- MANUAL: insan onayı / kilit zorunlu (high risk, high impact, irreversible)
- CONDITIONAL: şartlara bağlı (policy gate + risk band + müvekkil tercihleri)

## 1) Aksiyon sınıfları (önerilen)

### AUTO (otomatik)
- enqueue: uyap_sorgu (SGK/tapu/araç) — sadece okuma
- enqueue: adres_teyit (MERNIS/tebligat hazırlık) — taslak
- enqueue: bilgilendirme_mesaji — para talebi yok
- send_email: müvekkil no-email değilse ve KVKK-safe (maskeli)

### CONDITIONAL
- send_email: avans/masraf talebi
  - AUTO: risk < 60, onay var, saat 09:00–19:00
  - MANUAL: risk >= 60 veya KVKK_HOLD veya müvekkil tercihleri
- enqueue: haciz_adimi
  - AUTO: hazırlık
  - MANUAL: gerçek uyap gönderim / icra müdürlüğü işlemi

### MANUAL
- open_lock: manual_review
- enqueue: uyap_submit / haciz_submit / icra_mudurlugu_submit (geri dönüşü zor)
- send_email: üçüncü kişilere/kurumlara giden yazışmalar
- ödeme/tahsilat yöneten işlemler

## 2) Risk band önerisi
- 0–39 LOW
- 40–69 MED
- 70+ HIGH -> manual varsayılan

## 3) KVKK pratik
- Timeline/FactStore: PII maskeli
- Full PII: ayrı güvenli alan
- Email içerikleri: kısmi maskeleme, ham belge otomatik ek yok

## 4) Rollout planı
1) Shadow mode
2) Limited AUTO
3) Conditional
4) Full (sadece low risk otomatik)

## 5) Metrikler
- created/denied/manualized actions
- success rate
- time-to-resolution

## 6) Kill switch
- rule disable / pin
- policy global deny
- stop dispatcher
