---
status: observed
review-trigger: "Gate 3 (legal-time adoption decision record) öncesi; veya production runtime TZ'nin +03:00 dışı olduğu doğrulanırsa derhal"
phase: 2
date: 2026-06-07
purpose: "day-count-calculator native Date davranışının server-timezone'a duyarlılığının sistematik gözlemi (Gate 2). legal-time adoption gerekçesinin kanıt tabanı. Fix/adoption/runtime değişikliği İÇERMEZ — yalnız gözlem."
---

# 19 — legal-time Timezone Observation Record (Gate 2)

**Durum:** observed
**Mod:** read-only harness gözlemi (gerçek fonksiyon importu, replikasyon yok)
**Kaynak:** `apps/api/src/modules/interest-engine/segments/day-count-calculator.ts`
**Önkoşul referansı:** Gate 1 karakterizasyon (PR #13, `day-count-calculator.characterization.spec.ts`) + doc inventory.

> Bu belge yalnız GÖZLEMDİR. Fix, runtime TZ değişikliği, legal-time paketi veya kod **bu belgeyle başlamaz.** Karar ve implementation ayrıdır (Gate 3).

---

## 1. Gözlem yöntemi
- Geçici harness (`__tmp_gate2_probe.ts`, oluştur→çalıştır→sil) gerçek `day-count-calculator` fonksiyonlarını import etti.
- İki TZ ayrı process'te çalıştırıldı: `Europe/Istanbul` (+03:00) ve `UTC` (00:00).
- Harness koşu sonrası silindi; üretim koduna ve git'e kalıcı değişiklik yapılmadı.
- Not: IANA zone adlarını inline env ile geçirme Windows-bash'te tutarsız (harness-tooling kuyruğu); istenen iki TZ temiz yakalandı.

## 2. Kanıtlar — Istanbul (+03:00) vs UTC (00:00)

### 2.1 `addDays` — 🔴 TZ-duyarlı (−1 gün, çağrı başına birikir)
| Girdi | Istanbul | UTC | Δ |
|---|---|---|---|
| `2025-01-01` +5 | `2025-01-06` | `2025-01-05` | −1 |
| `2025-01-30` +5 (ay taşması) | `2025-02-04` | `2025-02-03` | −1 |
| `2024-02-28` +1 (artık) | `2024-02-29` | `2024-02-28` | −1 (29 Şubat atlanıyor) |
| `2025-12-31` +1 (yıl taşması) | `2026-01-01` | `2025-12-31` | −1 (yıl değişmiyor) |
| `2025-03-30` +1 | `2025-03-31` | `2025-03-30` | −1 |
| `2025-10-26` +1 | `2025-10-27` | `2025-10-26` | −1 |
| `2025-06-15` round-trip (+10,−10) | `2025-06-15` | `2025-06-13` | **−2 (hata her çağrıda birikiyor)** |

### 2.2 `formatIstanbulDate(parseIstanbulDate(x))` — 🔴 TZ-duyarlı (−1 gün)
| Girdi | Istanbul | UTC | Δ |
|---|---|---|---|
| `2025-01-15` | `2025-01-15` | `2025-01-14` | −1 |
| `2025-06-15` | `2025-06-15` | `2025-06-14` | −1 |
| `2024-02-29` | `2024-02-29` | `2024-02-28` | −1 (artık gün kayboluyor) |
| `2025-12-31` | `2025-12-31` | `2025-12-30` | −1 |

### 2.3 `adjustEndDateForPayment(x, END_OF_DAY)` — 🔴 TZ-duyarlı (−1 gün)
| Girdi | Istanbul | UTC | Δ |
|---|---|---|---|
| `2025-01-15` | `2025-01-16` | `2025-01-15` | −1 (+1 gün çöküyor → ödeme günü faiz kaybı) |
| `2025-06-15` | `2025-06-16` | `2025-06-15` | −1 |
| `2025-12-31` | `2026-01-01` | `2025-12-31` | −1 |

### 2.4 Kontroller — ✅ TZ-kararlı (her iki TZ'de birebir aynı)
| Fonksiyon | Sonuç (UTC = Istanbul) |
|---|---|
| `adjustEndDateForPayment START_OF_DAY` | `2025-01-15` (no-op) |
| `calculateDays` (0101→0105 / leapFeb2024 / DST2015spring) | `4` / `29` / `2` |
| `determinePhase` (endsAtEnf / startsAtEnf) | `PRE_ENFORCEMENT` / `POST_ENFORCEMENT` |
| `parseIstanbulDate('2025-01-15').toISOString()` | `2025-01-14T21:00:00.000Z` (TZ-değişmez) |

## 3. Kök neden
```
parseIstanbulDate(d)  -> `dT00:00:00+03:00` = (d-1)T21:00:00Z   (mutlak an, TZ-değişmez, DOĞRU)
addDays / formatIstanbulDate -> getDate()/setDate()/getFullYear/getMonth/getDate (server-local takvim okur)
```
- Server offset **≥ +03:00** → an `d` gününde → kayma yok (Istanbul).
- Server offset **< +03:00** (UTC, Amerika, kışın Batı Avrupa) → an `(d-1)` gününün 21:00'ı → **−1 gün**.
- **Sınır:** tek işlemde en fazla −1 gün (an gece yarısından 3 saat önce; 2 gün için offset < −21h gerekir, imkânsız). **Ama her `addDays` çağrısında birikir** (round-trip −2).
- **"DST" değil:** Türkiye 2016'dan beri kalıcı +03:00 (DST yok); parse sabit `+03:00` string kullanıyor → tarihsel pre-2016 dahil kararlı (DST2015 kontrolü kanıt). Sorun bir **server-timezone-varsayımı** sorunudur, DST değil.

## 4. Etki
- Toplam gün hesabı (`calculateDays`) çoğu durumda **doğru kalabilir** — sabit `[start,end)` üzerindeki toplam TZ-değişmez.
- **Ancak segment sınırları kayabilir:** `adjustEndDateForPayment` (→ `timeline-generator` ödeme sınırları) ve `addDays` ile hesaplanan sınır tarihleri yanlış güne kayarsa **segment bölünmesi yanlış olur**.
- Bu nedenle **faiz dağılımı ve segment-bazlı hesaplar etkilenebilir** (segment başına oran/gün → tutar).

## 5. Açık soru (Gate 3'ün ilk sorusu)
```
Production runtime timezone nedir?
  - UTC ise           -> bug CANLI (segment sınırları kayar).
  - Europe/Istanbul   -> latent (parse offset ile server offset eşleşir).
```
Doğrulama yeri: deploy env / Dockerfile / k8s / process.env.TZ. **Bu turda araştırılmadı** (fix/adoption kapsam dışı).

## 6. Karar
```
No fix.
No adoption.
No runtime change.
Gate 3 decision record öncesi observation only.
```

## 7. Sonraki adım
- **Gate 3 — legal-time adoption decision record** (doc-18 tarzı): scope, paket API'si (lightweight helper vs VO), tier sırası, legal-impact, açık "devam" onayı. §5 açık sorusu Gate 3'ün girdisidir.

---
**Observation Status:** observed. No fix, no adoption, no runtime change.
