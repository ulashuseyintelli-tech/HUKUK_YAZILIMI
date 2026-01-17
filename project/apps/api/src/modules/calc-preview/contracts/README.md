# Phase 5.6 - Contract Tests (Provider Schema Koruması)

> "Provider response'ları bilinçsizce değiştirilemez."

## Amaç

- Breaking change → CI fail
- Non-breaking change → allowlist/versiyon bump ile kontrollü geçiş
- Sadece JSON shape değil, domain semantiği de korunur

## 2 Katmanlı Sözleşme

### Katman A — JSON Schema (Shape)
- Zod ile doğrulama
- "field renamed/removed", "type changed" gibi kırılmaları yakalar

### Katman B — Semantic Contract (Domain Invariants)
- Rate: overlap yok, gap raporlanıyor, tarih aralıkları canonical
- Tariff: fee components negatif olamaz, currency seti sınırlı
- Policy: outcome enum + reasons code seti stabil

## Yapı

```
contracts/
├── README.md
├── providers/
│   ├── rate-provider/
│   │   ├── schema.ts           # Zod schema
│   │   ├── semantic.ts         # Domain invariants
│   │   ├── fixtures/
│   │   │   ├── ok-minimal.json
│   │   │   ├── ok-multi-segment.json
│   │   │   ├── bad-overlap.json
│   │   │   └── bad-gap-silent.json
│   │   └── contract.spec.ts
│   ├── tariff-provider/
│   │   ├── schema.ts
│   │   ├── semantic.ts
│   │   ├── fixtures/...
│   │   └── contract.spec.ts
│   └── policy-engine/
│       ├── schema.ts
│       ├── semantic.ts
│       ├── fixtures/...
│       └── contract.spec.ts
├── tools/
│   ├── validate-schema.ts
│   └── validate-semantic.ts
└── allowlists/
    ├── optional-fields.json
    └── known-extensions.json
```

## Çalıştırma

```bash
# Tüm contract testleri
pnpm --filter api test:contracts

# Tek provider
pnpm --filter api test -- --testPathPattern=rate-provider/contract
```

## CI Entegrasyonu

```yaml
contract-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install
    - run: pnpm --filter api test:contracts
```

## Versiyonlama

- `schema.v1.ts` donmuş kalır
- Breaking change → `schema.v2.ts` eklenir
- Client: v1'i desteklemeye devam eder, v2'ye geçiş feature flag ile

## Semantic Kurallar

### Rate Provider
- Segment tarihleri: `start < end`, canonical `[start, end)`
- Overlap yok: `next.start >= current.end`
- Rate: 0-100 arası, null/NaN yok
- Coverage: gap varsa explicit `hasGaps=true`

### Tariff Provider
- Fee components: negatif yok
- Toplam = bileşenlerin toplamı (toleransla)
- Currency: allowed set (TRY, USD, EUR)
- Version: boş olamaz

### Policy Engine
- Outcome enum: PASS/WARN/BLOCK
- Reasons: code whitelist
- BLOCK ise `reasons.length > 0` zorunlu
