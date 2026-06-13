# Legal-Time Prod Deployment Verification Runbook

**Amaç:** İlk production deploy öncesi/sırasında legal-time (faiz tarih hesabı) determinizminin
runtime'da doğrulanması. Bu bir DOĞRULAMA prosedürüdür — faiz doğruluğu için TZ config GEREKMEZ.

**Bağlam (koddan, main):**
- Faiz gün-matematiği **TZ-invariant**: `interest-engine/segments/day-count-calculator.ts` UTC-anchored
  (PR-3): `parseIstanbulDate → ${d}T00:00:00Z`, `addDays → setUTCDate`, `formatIstanbulDate → getUTC*`,
  `calculateDays → iki UTC-anchor farkı`, `isDateInRange`/`determinePhase → saf string-compare`.
  → Server TZ ne olursa olsun faiz çıktısı IDENTICAL (Istanbul == UTC, iki-TZ test yeşil).
- Same-day payment kuralı default **START_OF_DAY** (PR-2): ödeme günü faiz İŞLEMEZ.
- Production HENÜZ deploy EDİLMEDİ → legally-relied geçmiş hesap YOK → remediation N/A (doc 23).

> **Önemli:** `TZ=UTC` (Dockerfile.api + compose) bir **hijyen kilidi**dir, correctness koşulu değil.
> node:20-alpine zaten UTC default; bu pin varsayımı açık yapar ve gelecekte base-image/host TZ
> kaymasının sessizce sızmasını önler. TZ'yi değiştirmek faiz sonucunu DEĞİŞTİRMEZ.

---

## Deploy Verification Gates

### G1 — Migration deploy + doğrulama  (risk: ORTA — dev'de drift yaşandı)
```
# Prod DB'de tüm migration zinciri uygulanmalı (dev'de add_outbox + NOT NULL drift'i yaşandı).
prisma migrate deploy
# Doğrula:
#  - _prisma_migrations tam zincir (baseline … outbox_tenant_id_not_null)
#  - SELECT count(*) FROM "IcrabotOutboxAction" WHERE "tenantId" IS NULL;  -> 0
#  - kritik kolon/constraint'ler mevcut
```

### G2 — Runtime TZ smoke
```
# Çalışan api container'ında:
docker exec hukuk-api node -e "console.log(new Date().getTimezoneOffset())"
# Beklenen: 0  (UTC).  TZ=UTC pin + alpine default ile garanti.
```

### G3 — Two-TZ identical-interest smoke (determinizm kanıtı)
```
# Aynı faiz request'i iki TZ'de koş, çıktı IDENTICAL olmalı (PR-3 invariance runtime teyidi).
# CI/local job (deploy değil); mevcut characterization suite'i iki TZ'de:
TZ=UTC            npx jest --testPathPattern="interest-engine"
TZ=Europe/Istanbul npx jest --testPathPattern="interest-engine"
# İki koşu da YEŞİL + aynı pinlenmiş değerler.
```

### G4 — START_OF_DAY default smoke
```
# Deployed config'te same-day payment default = START_OF_DAY (PR-2).
# Bir preview/calc isteğinde ödeme günü faiz İŞLEMEDİĞİ teyit edilir
# (ödeme günü segment sınırına dahil edilmez).
```

---

## Compose / Image TZ pin (B — bu PR)
- `docker/Dockerfile.api` → `ENV TZ=UTC` (image-level; tüm deployment'lara taşınır).
- `docker/docker-compose.prod.yml` → `api.environment.TZ: UTC` (ops görünürlüğü).
- `docker/docker-compose.staging.yml` → `api.environment.TZ: UTC` (prod paritesi).
- alpine'de UTC için `tzdata` paketi gerekmez (UTC built-in).

Config doğrulama (deploy öncesi):
```
docker compose -f docker/docker-compose.prod.yml config     # YAML geçerli + TZ=UTC resolved
docker compose -f docker/docker-compose.staging.yml config
```

---

## Deferred / kapsam dışı
- **C (display):** `payment-allocation.service.ts:214` `toLocaleDateString('tr-TR')` server-TZ'ye bağlı
  GÖSTERİM — legal sayı değil, characterization'dan hariç. TZ=UTC ile zaten UTC'de formatlanır;
  `timeZone` opsiyonu ekleme ayrı/küçük iş olarak ertelendi.
- **D4 (outbox consistency trigger):** outbox-tenancy defense-in-depth, ayrı deferred.

## Geçmiş etki
Prod ilk deploy → legally-relied geçmiş hesap yok → recalculation N/A.
Staging/demo legally-relied bir hesap ürettiyse doc 22/23 §Q1 yeniden değerlendirilir.
