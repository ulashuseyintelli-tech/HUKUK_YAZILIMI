# Phase 5.3 - Chaos / Fault Injection

> **"Dayanıklılık ayini"** - Circuit breaker, cache, fallback gerçekten çalışıyor mu?

## Amaç

Circuit breaker, cache, fallback ve UX guidance gerçekten çalışıyor mu? 
Sadece unit test değil: "sistem davranışı" testi.

## Yaklaşım: 3 Katmanlı Chaos

### Katman A - Provider Adapter Fault Injection (en temiz)

Her dependency için bir "adapter" zaten var. Buraya test-only bir "FaultInjector" bağla.

```
RateProviderAdapter
├─ realClient
└─ faultInjector (optional)
```

FaultInjector şunları yapabilir:
- `delay`: +500ms / +2s
- `timeout`: request'i hiç döndürme
- `error`: 500/503 simülasyonu
- `invalid`: domain-level invalid payload
- `partial`: coverage gap

### Katman B - Network-level chaos (isteğe bağlı)

E2E ortamında: proxy ile gecikme/packet drop. (ileri seviye)

### Katman C - State chaos (breaker manipülasyonu)

Test başlangıcında breaker state'i OPEN'a zorlayıp fallback path'i doğrulama.

## Klasör Yapısı

```
chaos/
├── scenarios/           # Chaos scenario JSON dosyaları
│   ├── C01-rate-provider-timeout.json
│   ├── C02-tariff-provider-500.json
│   └── ...
├── runner/              # Chaos runner ve yardımcılar
│   ├── chaos-runner.ts
│   ├── fault-injector.ts
│   └── chaos.types.ts
└── README.md
```

## Chaos Scenario Formatı

```json
{
  "id": "C01",
  "name": "rate-provider-timeout-opens-breaker",
  "inject": {
    "dependency": "rate_provider",
    "mode": "TIMEOUT",
    "durationMs": 20000
  },
  "expect": {
    "result.status": "DEGRADED",
    "dependencies": {
      "rate_provider": { "outcome": "FALLBACK" }
    },
    "breaker": {
      "rate_provider": { "state": "OPEN" }
    },
    "trace": {
      "mustContainEvidence": true
    }
  }
}
```

## Test Akışı

1. `X-Force-Trace: true`
2. `POST /calc/chaos/inject` → injection ayarla
3. `POST /calc/preview` → gerçek request çalıştır
4. `GET /calc/trace/:id` → trace bundle al
5. Assert:
   - breaker state transition beklenen mi?
   - fallback evidence dolu mu?
   - degraded/unavailable status doğru mu?
   - metrics artmış mı?

## Test-only Endpoint'ler

> ⚠️ Sadece test harness + internal-ops için

- `POST /calc/chaos/inject` - Fault injection başlat
- `POST /calc/chaos/clear` - Tüm injection'ları temizle
- `GET /calc/chaos/status` - Aktif injection'ları listele

## Güvenlik

- Prod build'inde bu modül compile edilmesin
- `ENABLE_CHAOS_ENDPOINTS=true` env flag gerekli
- Module exclude ile production'dan çıkar

## Chaos Gate Stratejisi

| Ortam | Çalıştırılan Senaryolar |
|-------|------------------------|
| PR | Küçük subset (2-3 senaryo) |
| Nightly | Full chaos suite |
| Release Candidate | Full chaos + regression |

## Kullanım

```bash
# Chaos testlerini çalıştır
pnpm test:chaos

# Tek senaryo
pnpm test:chaos --scenario=C01

# Injection'ları temizle
curl -X POST http://localhost:3001/calc/chaos/clear
```
