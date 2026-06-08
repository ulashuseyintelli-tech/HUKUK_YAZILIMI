---
status: policy-implemented-pending-deployment-gate
review-trigger: "(P) policy correction PR-2 (#23, 2026-06-08) ile UYGULANDI: default START_OF_DAY production-kodda. Kalan: (D) determinizm PR-3 (opsiyonel hijyen) + deployment gate (ilk prod deploy öncesi runtime TZ doğrulaması). END_OF_DAY enum korunur."
phase: 2
date: 2026-06-07
purpose: "legal-time düzeltme kararı. doc 23 ile yön kesinleşti: ödeme günü faiz işlemez → END_OF_DAY HATALI, default START_OF_DAY'e değişecek (HESAP POLİTİKASI DÜZELTMESİ) + day-count determinizm. Production deploy EDİLMEMİŞ → geçmiş remediation YOK; pre-deployment düzeltme. Implementation ayrı onayla; deployment gate açık."
---

# 20 — legal-time Adoption — Decision Record (Gate 3)

**Karar durumu:** policy-implemented-pending-deployment-gate ((P) ✅ PR-2 #23; (D) PR-3 opsiyonel; deployment gate açık)
**Seçilen yön:** Yaklaşım **A**, doc 23 sonrası YENİDEN TANIMLANDI → **(P) policy correction (END_OF_DAY → START_OF_DAY)** ✅ + **(D) determinizm hijyeni** ⏭ (onay: ulas, 2026-06-07; hukuki yön: doc 23; uygulama: PR-2 2026-06-08)
**Kırmızı çizgi:** *Bu belge yalnız KARARDIR. Kod, test, config, runtime değişikliği bu belgeyle başlamaz. Implementation ayrı, açık "devam" onayıyla.*

> **PR B reframe (2026-06-07):** Bu belge başlangıçta "END_OF_DAY doğruluk restorasyonu / remediation" çerçevesindeydi. doc 23 (Q1-Q7 resolved) bunu çevirdi: **END_OF_DAY hukuken HATALI**, doğru politika **START_OF_DAY**. Ayrıca **production deploy edilmemiş** → geçmiş etki/remediation YOK. Konu artık **pre-deployment policy correction + determinizm**.

---

## 1. Girdi belgeleri
- **doc 19** (`19-legal-time-timezone-observation.md`, status: observed) — TZ davranış kanıt tabanı.
- **Gate 1 characterization** (`day-count-calculator.characterization.spec.ts`, PR #13) — mevcut davranış kilidi.
- **Gate 1 inventory** — risk tier'ları (T0 = `day-count-calculator.ts`, en yüksek; 1090 prod `new Date(`, 0 tarih kütüphanesi).
- **doc 21** (forensic evidence) — bug ana faiz path'inde + audit etkisi.
- **doc 23** (legal sign-off, Q1-Q7 resolved) — **START_OF_DAY doğru; END_OF_DAY hatalı; prod yok.**

## 2. Bağlam — production TZ ve deployment durumu (Gate 3 + doc 23)
| Kanıt | Değer | Sonuç |
|---|---|---|
| `docker/Dockerfile.api` | `FROM node:20-alpine`, TZ yok, tzdata kurulu değil | Alpine default **UTC** |
| `docker/docker-compose.prod.yml` api `environment` | yalnız `NODE_ENV/DATABASE_URL/JWT_SECRET/PORT` — **TZ yok** | TZ override yok |
| `apps/api/.env` + `.env.example` | TZ/TIMEZONE yok | runtime pin yok |
| `.github/workflows/ci.yml` | `runs-on: ubuntu-latest` | test ortamı da UTC |

→ **Production DEPLOY EDİLMEMİŞ (doc 23 Q7).** "prod≈UTC" çıkarımı yalnız **gelecek** deploy için risk işaretidir; hiçbir gerçek hesabı etkilememiştir (canlı veri yok). doc 19 §3 mekanizması geçerli ama canlı veriye uygulanmaz. → İlk deploy ÖNCESİ runtime TZ/date doğrulaması (Q7 planı: Node resolvedTZ/offsetMinutes + adjustEndDateForPayment davranışı) zorunlu **deployment gate** olarak saklanır.

## 3. legal-time API seçenekleri ve karar (doc 23 sonrası yeniden tanımlı)
| Seç. | Yaklaşım | Blast radius | Durum |
|---|---|---|---|
| **A — Pre-deployment policy correction + determinizm** | **(P)** default `END_OF_DAY → START_OF_DAY` (Zod default + 5/5 strateji) — asıl hukuki düzeltme (doc 23 Q5). **(D)** `day-count-calculator.ts` TZ-değişmez — determinizm hijyeni. | Küçük-orta | ✅ **SEÇİLDİ** |
| **B — `@hukuk/legal-time` paketi** | Vetted lib (Luxon/Temporal) sarmalı, tier-tier adopsiyon. | Büyük (1090 call-site) | ⏸ ertelendi — şu an gereksiz geniş, hata üretir |
| **C — Bootstrap TZ pin** | App başlangıcında `process.env.TZ='Europe/Istanbul'`. | Global runtime | ⚠️ "acil mitigasyon" gerekçesi DÜŞTÜ (canlı prod yok, doc 23 Q6); en fazla deploy-zamanı determinizm garantisi olarak opsiyonel |

**Gerekçe (A):** `calculateDays`/`determinePhase` zaten TZ-kararlı. Asıl düzeltme **(P) policy default** (hukuki — doc 23). **(D) determinizm** ikincil: START_OF_DAY seçilince `adjustEndDateForPayment` no-op olur → `addDays`/`format` faiz yolunda devre dışı kalır → TZ-fix büyük ölçüde gereksizleşir; yalnız gelecekteki başka kullanımlar için hijyen. B'nin 1090 call-site'ı ROI'siz. C kök kırılganlığı maskeler.

## 4. T0 pilot scope (Yaklaşım A — P + D)
- **(P) Policy default (asıl iş):** `END_OF_DAY → START_OF_DAY`. Dokunulacak: `interest-engine/types/calculation.types.ts` (Zod `.default`) + `interest-engine/strategy/case-type-strategy.registry.ts` (5 strateji `sameDayPaymentRule`). **Kapsam tespiti: bu, eski "yalnız day-count internals" daralmasından DAHA GENİŞ** — bilinçle yazıldı.
- **(D) Determinizm (ikincil):** `interest-engine/segments/day-count-calculator.ts` internals TZ-değişmez (`addDays`/`formatIstanbulDate`/`parseIstanbulDate` takvim okuması/`adjustEndDateForPayment`).
- **Değişmeyecek:** public API şekli, string in/out kontratı, `calculateDays`/`determinePhase` semantiği.
- Gate 1 characterization expected değerleri politika + determinizm sonucuna göre **bilinçle yeniden pinlenir** (kademe-2, gerçek koddan).
- **Guardrails:** no schema · no migration · no DB · no event payload · no public API shape change · no new package · no global runtime TZ change.

## 5. §5 — Forensic gate (✅ COMPLETED — bkz. doc 21)
**Durum: ✅ completed (2026-06-07).** Çıktı kalıcılaştırıldı → `21-legal-time-forensic-impact-analysis.md` (status: forensic-evidence).

**Bulgu (teknik, değişmedi):** `adjustEndDateForPayment(END_OF_DAY)` ana hesap path'inde (`interest-engine.service.ts:284 buildAllSegments` → `paymentDates` dolu → `generateTimeline` → `adjustEndDateForPayment` → `addDays` → `parse/format`). END_OF_DAY evrensel default (Zod + 5/5 strateji). `formatIstanbulDate` dış çağrı = 0; `calculateDays`/`determinePhase` TZ-kararlı.

> **doc 23 sonrası okuma:** Forensic'in tespit ettiği "UTC'de END_OF_DAY → START_OF_DAY çöküşü" artık **kazara hukuken-doğru sonuç** demektir (ödeme günü hariç). Asıl düzeltme TZ değil, **policy default'un START_OF_DAY'e çekilmesi**. Prod olmadığı için canlı etki yok.

## 6. Legal impact + risk-gate (doc 23 ile güncellendi)
- Bu bir **HESAP POLİTİKASI DÜZELTMESİDİR** (doc 23 Q5: END_OF_DAY hatalı, START_OF_DAY doğru) — eski "doğruluk restorasyonu" çerçevesi DÜŞTÜ. TBK100 (doc 18) sınıfı bir politika kararı.
- **ANCAK** production deploy edilmemiş (doc 23 Q1) → geçmiş hesap çıktısı yok → **remediation/yeniden-hesap YOK** → temiz pre-deployment değişiklik, historical baggage'sız.
- Legal awareness: doc 22'de tamamlandı; sign-off Q1-Q7: doc 23'te resolved.

### Onay zinciri (sıra kilitli)
- [x] Yaklaşım A prensip onayı (ulas, 2026-06-07) — doc 23 sonrası P+D olarak yeniden tanımlı
- [x] Decision record (bu belge) + PR B reframe
- [x] **§5 forensic gate** → ✅ completed, doc 21
- [x] **Legal awareness** → ✅ doc 22
- [x] **Legal sign-off (Q1-Q7)** → ✅ doc 23 (START_OF_DAY benimsendi; prod yok)
- [x] **ulas açık "devam" onayı** → ✅ (PR-1 + PR-2, 2026-06-08)
- [x] **Characterization kademe-2** → ✅ PR-1 (#22, payment-boundary characterization)
- [x] **(P) Policy default END_OF_DAY → START_OF_DAY** → ✅ PR-2 (#23) — production-kodda uygulandı; END_OF_DAY explicit option korundu
- [ ] **(D) Determinizm** (day-count TZ-invariant) → PR-3, **opsiyonel hijyen** (START_OF_DAY default'ta adjustEndDateForPayment no-op → faiz-path'inde aciliyetsiz)
- [ ] **Deployment gate:** ilk prod deploy öncesi runtime TZ doğrulaması (AÇIK)

## 7. Karar durumu
```
(P) policy correction UYGULANDI (PR-2 #23, 2026-06-08). No package. No DB/schema/migration. No runtime TZ change. No enum removal.
Yön: Yaklaşım A → (P) policy END_OF_DAY→START_OF_DAY ✅ · (D) determinizm ⏭ opsiyonel hijyen (PR-3).
Bağlam: prod yok → remediation yok → pre-deployment correction (geçmiş etki yok).
Sıra: doc 23 ✅ → PR B ✅ → PR-1 characterization ✅ → PR-2 policy ✅ → PR-3 determinizm (opsiyonel) → deployment gate (AÇIK).
```

---
**Decision Status:** (P) policy correction IMPLEMENTED (PR-2 #23). Pre-deployment; geçmiş etki yok. Kalan: (D) determinizm (PR-3 opsiyonel hijyen) + deployment gate (ilk deploy öncesi runtime TZ doğrulaması, AÇIK).
