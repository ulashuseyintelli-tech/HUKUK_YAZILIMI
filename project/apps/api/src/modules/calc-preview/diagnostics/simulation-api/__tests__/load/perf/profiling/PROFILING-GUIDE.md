# Profiling Analiz Rehberi

## Ön Koşullar

1. `clinic-runner.ts` ile komut üret (`generateClinicCommand()`)
2. Staging ortamında üretilen komutu çalıştır
3. `.clinic/` dizininde HTML çıktıyı tarayıcıda aç

> **Windows notu:** `--on-port` argümanındaki `$PORT` placeholder'ı clinic
> tarafından shell üzerinden çalıştırılır (POSIX shell). Windows'ta bu
> doğrudan çalışmayabilir. WSL veya Git Bash kullanın, ya da `%PORT%`
> ile değiştirip cmd'de deneyin. Clinic'in `--on-port` davranışı shell
> delegasyonuna dayandığı için Linux/macOS staging ortamı önerilir.

## Flame Graph Analizi (CPU Hotspot)

1. HTML'i tarayıcıda aç
2. En geniş 3 bar'ı tespit et (= en çok CPU süren fonksiyonlar)
3. Her biri için aşağıdaki şablonu doldur

### Hotspot Şablonu

| # | Fonksiyon | Dosya:Satır | CPU % | Aksiyon |
|---|-----------|-------------|-------|---------|
| 1 |           |             |       |         |
| 2 |           |             |       |         |
| 3 |           |             |       |         |

## Bubbleprof Analizi (Async Bottleneck)

1. HTML'i tarayıcıda aç
2. En büyük 2 "bubble"ı tespit et (= en çok async bekleme)
3. Her biri için aşağıdaki şablonu doldur

### Async Bottleneck Şablonu

| # | Operasyon | Kaynak (DB/IO/Timer) | Bekleme ms (p99) | Aksiyon |
|---|-----------|----------------------|-------------------|---------|
| 1 |           |                      |                   |         |
| 2 |           |                      |                   |         |

## Sonuç Formatı

Analiz sonuçlarını composite rapor'un `tuningBacklog` alanına ekle:

- `id`: `profile-hotspot-{N}` veya `profile-bottleneck-{N}`
- `impact`: flame %'sine göre (>%20 = high, >%5 = medium, <=%5 = low)
- `effort`: fonksiyon karmaşıklığına göre (high/medium/low)
- `evidence`: `M1_sustainable_rps-65_runkey-a1b2c3d4_flame.html#functionName`

## Impact Sınıflandırma

| CPU % | Impact | Gerekçe |
|-------|--------|---------|
| > %20 | high   | Tek fonksiyon toplam CPU'nun %20'sinden fazlasını tüketiyor |
| > %5  | medium | Anlamlı katkı, optimizasyon planlanmalı |
| <= %5 | low    | Marjinal katkı, ertelenebilir |
