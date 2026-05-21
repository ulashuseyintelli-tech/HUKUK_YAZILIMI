---
status: pending
created: 2026-05-19
timeout: 2026-06-02
owner: ulas
investigation-needed: "policy-engine FactStoreService writeFactToDb metodlarını v28-engine'in factstore.write'ına nasıl delege edeceğiz, in-memory cache nasıl invalidate olacak"
---

# Policy → Runtime Write Delegation Pattern

## Why Pending

ADR-0002 (policy vs runtime split) "yazma tek noktadan: v28 yolu" diyor. Ama mevcut kod:

- `policy-engine/fact-store/fact-store.service.ts:265+` `writeFactToDb` direkt yazıyor
- `icrabot/v28-engine/factstore.service.ts` `write()` direkt yazıyor

İkisi de **aynı tabloya** yazıyor (`IcrabotCaseFact`).

Karar verilmeli:
- Policy `writeFact*` metodlarını **silsin** mi (yazma yetkisi tamamen kalksın)?
- Yoksa policy `writeFact*` v28'in `factStore.write()`'ına **delege** mi etsin?
- Veya policy tek bir özel write yapabilsin mi (decision log dışında, örn computed fact cache)?

In-memory cache nasıl davranacak:
- v28 yazınca policy'nin cache'i otomatik invalidate olmalı (event-driven cache invalidation)
- Veya policy her okumada cache TTL kontrol etsin

## Investigation Plan

1. `policy-engine/FactStoreService.writeFact*` çağrılarının tümünü bul (kim hangi amaçla yazıyor?)
2. Her birinin gerçek niyeti analiz et:
   - Decision log mu? (kalsın)
   - Computed metric cache mi? (yeni pattern: read-time computed, no write)
   - Genuine domain fact yazımı mı? (v28'e delege)
3. Kararı ADR-0005 olarak yaz

## Possible Resolutions

- **Active'e dönerse:** Implementation Faz 1 vocabulary unification içinde yapılır, ADR-0005 yazılır
- **Deferred'a dönerse:** Faz 2 işine kalır, mevcut dual-write disiplinle sürdürülür (CI gate eklemeyi geciktir)
- **Rejected'a dönerse:** Mevcut dual-write kalıcı kabul edilir, sınıf adları ayrışır ama yazma da ayrışır

## Timeout

2026-06-02 (created + 14 gün, bir review cycle).

Aşılırsa default: `deferred` (Faz 2'ye düşür).
