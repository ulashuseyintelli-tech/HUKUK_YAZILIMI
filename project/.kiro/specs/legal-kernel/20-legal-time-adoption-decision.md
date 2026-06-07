---
status: draft-pending-approval
review-trigger: "§5 forensic gate + legal awareness + ulas açık 'devam' onayı — üçü tamamlanmadan implementation YOK"
phase: 2
date: 2026-06-07
purpose: "legal-time strand'inin adoption/düzeltme kararı. Prod=UTC kanıtı ile day-count TZ bug'ı CANLI tespit edildi. İLK davranış-değiştiren adım (UTC'de hesap çıktısı değişir); onay + legal awareness + forensic doğrulama olmadan implementation BAŞLAMAZ."
---

# 20 — legal-time Adoption — Decision Record (Gate 3)

**Karar durumu:** draft-pending-approval
**Seçilen yön:** Yaklaşım **A** — String-native T0 fix (onay: ulas, 2026-06-07)
**Kırmızı çizgi:** *Bu belge yalnız KARARDIR. Kod, test, config, runtime değişikliği bu belgeyle başlamaz. Implementation ayrı, açık onayla ve §5/§6 ön-koşulları sonrası.*

---

## 1. Girdi belgeleri
- **doc 19** (`19-legal-time-timezone-observation.md`, status: observed) — TZ davranış kanıt tabanı.
- **Gate 1 characterization** (`day-count-calculator.characterization.spec.ts`, PR #13) — mevcut davranış kilidi.
- **Gate 1 inventory** — risk tier'ları (T0 = `day-count-calculator.ts`, en yüksek; 1090 prod `new Date(`, 0 tarih kütüphanesi).

## 2. 🔴 Kritik bulgu — production TZ kanıtı (Gate 3, read-only)
| Kanıt | Değer | Sonuç |
|---|---|---|
| `docker/Dockerfile.api` | `FROM node:20-alpine`, TZ yok, tzdata kurulu değil | Alpine default **UTC** |
| `docker/docker-compose.prod.yml` api `environment` | yalnız `NODE_ENV/DATABASE_URL/JWT_SECRET/PORT` — **TZ yok** | TZ override yok |
| `apps/api/.env` + `.env.example` | TZ/TIMEZONE yok | runtime pin yok |
| `.github/workflows/ci.yml` | `runs-on: ubuntu-latest` | test ortamı da UTC |

→ **Production runtime ≈ UTC.** doc 19 §3 mekanizmasına göre `addDays` / `formatIstanbulDate` / `parseIstanbulDate` (takvim okuma) / `adjustEndDateForPayment(END_OF_DAY)` üretimde **−1 gün kayar.** Bug **latent değil, CANLI.** (Kesin teyit: çalışan prod container'da `TZ`/`/etc/localtime` — deploy ortamına erişimle doğrulanmalı; repo kanıtı UTC'yi güçlü gösteriyor.)

## 3. legal-time API seçenekleri ve karar
| Seç. | Yaklaşım | Blast radius | Durum |
|---|---|---|---|
| **A — String-native fix (paket YOK)** | `addDays`/`format`/`parse`/`adjust`'ı Date-calendar yerine TZ-değişmez aritmetikle düzelt. Yalnız `day-count-calculator.ts` internals. Public API + string in/out aynı. | En küçük | ✅ **SEÇİLDİ** |
| **B — `@hukuk/legal-time` paketi** | Vetted lib (Luxon/Temporal) sarmalı, tier-tier adopsiyon. | Büyük (1090 call-site) | ⏸ ertelendi — şu an gereksiz geniş, hata üretir |
| **C — Bootstrap TZ pin** | App başlangıcında `process.env.TZ='Europe/Istanbul'`. | Global runtime | ⚠️ yalnız **acil mitigasyon** opsiyonu; ana çözüm değil (global yan etki riski) |

**Gerekçe (A):** `calculateDays`/`determinePhase` zaten TZ-kararlı; sorun yalnız 3-4 fonksiyonda izole. B'nin 1090 call-site'ı şu an ROI'siz ve riskli. C kök kırılganlığı maskeler.

## 4. T0 pilot scope (Yaklaşım A)
- **Yalnız** `apps/api/src/modules/interest-engine/segments/day-count-calculator.ts` internals.
- TZ-değişmez hale getirilecek: `addDays`, `formatIstanbulDate`, `parseIstanbulDate` (takvim alanı okuması), `adjustEndDateForPayment`.
- **Değişmeyecek:** public API şekli, string in/out kontratı, `calculateDays`/`determinePhase` semantiği.
- Gate 1 characterization expected değerleri **Istanbul = doğru** olarak yeniden pinlenir; UTC artık aynı sonucu vereceği için **spec-içi TZ kapsülleme gereksizleşir** (bilinçle kaldırılır/güncellenir).
- **Guardrails:** no schema · no migration · no DB · no event payload · no public API shape change · no new package · no global runtime TZ change.

## 5. §5 — Forensic gate (✅ COMPLETED — bkz. doc 21)
**Durum: ✅ completed (2026-06-07).** Çıktı kalıcılaştırıldı → `21-legal-time-forensic-impact-analysis.md` (status: forensic-evidence).

**Bulgu:** Bug **canlı görünmekle kalmıyor, production ANA FAİZ PATH'ine bağlanıyor.**
- `adjustEndDateForPayment(END_OF_DAY)` ana hesap path'inde: `interest-engine.service.ts:284 buildAllSegments` → `paymentDates` dolu (satır 290) → `generateTimeline` → `adjustEndDateForPayment` → `addDays` → `parse/format` (TZ-kırılgan zincir).
- END_OF_DAY **evrensel default** (Zod `.default(END_OF_DAY)` + 5/5 case-type stratejisi).
- UTC altında END_OF_DAY sessizce START_OF_DAY'e çöküyor → ödeme sınırı 1 gün erkene kayıyor → `allocatePayments` üzerinden **ödeme başına ~1 günlük faiz farkı** → **legal-material, sistematik.**
- `formatIstanbulDate` dış çağrı = 0; `addDays`/`parseIstanbulDate` prod'a yalnız bu zincirle ulaşıyor. `calculateDays`/`determinePhase` TZ-kararlı (güvenli).
- Açık teyit: çalışan prod container TZ + `allocatePayments` nihai-TL deltası (karakterizasyon kademe-2 ile pinlenecek). Ayrıntı + güven seviyeleri: doc 21.

## 6. Legal impact + risk-gate
- Bu bir **politika değişikliği DEĞİL, doğruluk restorasyonu**: kod zaten `parseIstanbulDate`/`+03:00` ile Istanbul semantiğini amaçlıyor; UTC kayması istenmeyen bug. **TBK100 (doc 18) ile farkı:** orada kasıtlı hesap politikası değişikliği, burada niyetlenen davranışa dönüş.
- **Ama** UTC-prod'da geçmiş hesap çıktıları değişebilir (boundary kayması düzelir) → **legal awareness ZORUNLU**: hangi case'ler etkilendi, yeniden-hesap gerekiyor mu.

### Onay zinciri (sıra kilitli)
- [x] Yaklaşım A + T0 pilot prensip onayı (ulas, 2026-06-07)
- [x] Decision record taslağı (bu belge)
- [x] **§5 forensic gate** (prod faiz path etkisi — read-only) → ✅ completed, doc 21 (bug ana faiz path'ine bağlı + legal-material doğrulandı)
- [ ] **Legal awareness** (geçmiş sonuç kayması bildirimi)
- [ ] **ulas açık "devam" onayı** (implementation başlatma)
- [ ] Implementation + characterization kademe-2 re-pin (ayrı PR)

## 7. Karar durumu
```
draft-pending-approval. No implementation. No package. No runtime change.
Yön: Yaklaşım A (T0 string-native fix).
Sıra: doc 20 → §5 forensic gate → legal awareness + explicit devam → implementation.
```

---
**Decision Status:** Draft, pending forensic gate + legal awareness + explicit go. Implementation NOT started.
