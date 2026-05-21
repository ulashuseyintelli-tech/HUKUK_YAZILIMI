---
status: accepted
date: 2026-05-19
deciders: [ulas]
---

# ADR-0003: Frontend May Not Infer Legal Truth

## Status

`Accepted` (2026-05-19)

## Context

Frontend seam scan (`02-frontend-seam-scan.md`) tespit etti ki frontend kodunda hukuki yorum mantığı var:

- `apps/web/src/lib/interest-type-resolver.ts` (400+ satır) — "Çek için her zaman ticari (TTK gereği)", "İpotek + akdi oran var → AKDI", "Aidat → KMK m.20 aylık %5", "Tacir kira → ticari, konut kirası → yasal"
- `apps/web/src/lib/form-validator.ts` — İİK madde referanslarıyla form seçim mantığı
- `apps/web/src/components/case-detail/CaseHeader.tsx` `calculateDays()` — İİK 78 referansıyla süre hesabı

Bu **anayasal ilke ihlali**: "Legal facts are immutable, interpretations are rebuildable." Frontend hukuki yorum yaparsa:
- Yorum versiyonlanmaz
- Mahkemede "bu hesabı neden böyle yaptınız" sorusunun cevabı yok
- Hesaplar render time'da çalışır → deterministik replay edilemiyor
- Backend ile frontend farklı sonuç üretebilir → drift riski

## Decision

**Frontend hukuki sonuç (legal truth) çıkaramaz.**

| Yasak (frontend yapamaz) | Serbest (frontend yapar) |
|---|---|
| Faiz türü inference | Input formatting |
| Mahsup hesaplama (TBK 100) | Optimistic UI |
| Hukuki status determination | Projection rendering (read backend) |
| Süre hesabı (İİK madde referanslı) | UX validation (required field, format) |
| Legal branching (ipotek varsa şu form) | Local interaction state |
| Allocation logic | Display formatting |

Mevcut legal inference iki dosyada toplanmış (`interest-type-resolver.ts`, `form-validator.ts`) — kontrollü extract seam. Backend'e taşınır:
- `interest-type-resolver.ts` → backend `InterestPolicyResolver` calculator
- `form-validator.ts` → backend `FormSelector` calculator

Frontend bu calculator'ı API üzerinden çağırır, sonucu gösterir.

## Alternatives Considered

| Alternatif | Pros | Cons | Reddedildi mi? |
|---|---|---|---|
| Frontend'i olduğu gibi bırak | İmmediate consistency, network roundtrip yok | Anayasa ihlali, replay imkansız, drift riski | ✅ Reddedildi |
| Frontend ve backend ortak `@hukuk/calc` paketi | Tek kod, drift riski düşük | Frontend hâlâ inference yapıyor sayılır | ⚠️ Faz 2 değerlendirme |
| **Frontend inference yapamaz, backend calculator API** | Anayasa korunur, deterministik replay mümkün, audit trail tek noktadan | Network roundtrip artar, preview UX'i etkiler | ✅ **Seçildi** |

`@hukuk/calc` ortak paket fikri Faz 2'ye bırakıldı. Önce yorum mantığı backend'de tek noktada olsun, sonra ortak pakete çekilebilir.

## Consequences

**İyi yönde:**
- Anayasal ilke (immutability of legal interpretation) korunur
- Mahkeme savunulabilirliği güçlenir (replay = deterministik)
- Frontend basitleşir (state management daha az karmaşık)

**Kötü yönde:**
- Faiz türü preview ekranı network roundtrip içerir (UX latency artar, ~100-300ms)
- Mevcut `interest-type-resolver.ts` (400+ satır) backend'e taşınır → migration eforu

**Riskler:**
- "Frontend hızlı response için inference yapsın" baskısı gelirse
- Çözüm: bu ADR + Hard Rule #13 + CI gate (frontend'de legal computation pattern detection)

**Geri dönüş yolu:**
- ADR-0003 superseded olabilir, ama her geri dönüş anayasal ilke ihlali olur — kolayca yapılmaz

## Implementation Path (Faz 1)

1. Backend `InterestPolicyResolver` calculator yazılır (frontend resolver'ın aynısı, pure function)
2. Frontend resolver `@deprecated` alias kalır, içerik backend'e API üzerinden çevrilir
3. Sunset (vocabulary unification + 4 hafta) → frontend resolver silinir
4. Aynı pattern `form-validator.ts` için tekrarlanır

## References

- `02-frontend-seam-scan.md` §6 (Business Logic Leakage)
- `00-architecture.md v2` Hard Rule #13
- `03-vocabulary-unification.md` CI Gate #4

## Review Trigger

Bu karar şu durumda yeniden gözden geçirilmeli:

- Network roundtrip UX problemi production'da somut olarak çıkar ve preview kalitesi düşerse
- Frontend için offline calc kritik bir özellik haline gelirse (mobile veya disconnected mode)
