# Phase 9B.5 Integration Test Runbook

**Amaç:** Snapshot idempotency'nin PostgreSQL'de kanıtlanması  
**Tarih:** 2026-01-22

---

## Ön Koşullar

- Docker Desktop çalışıyor
- Node.js 20+ kurulu
- pnpm kurulu

---

## Seçenek A: Mevcut Docker Compose (Önerilen)

### Adım 1: Postgres'i Başlat

```powershell
cd HUKUK_YAZILIMI/project
docker compose -f docker/docker-compose.yml up -d postgres
```

### Adım 2: Test DB Oluştur

```powershell
# Mevcut container'a bağlan ve test DB oluştur
docker exec -it hukuk-postgres psql -U postgres -c "CREATE DATABASE truthlayer_test;"
```

### Adım 3: Prisma Schema'yı Push Et

```powershell
cd apps/api

# Test DB için DATABASE_URL ayarla (PORT: 5432 - mevcut compose)
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/truthlayer_test?schema=public"

# ⚠️ SAFETY CHECK: Yanlış DB'ye force-reset atmayı engelle
if ($env:DATABASE_URL -notmatch "truthlayer_test") { 
  throw "ABORT: Refusing to run --force-reset on non-test DB! DATABASE_URL must contain 'truthlayer_test'" 
}

# Schema'yı push et (migration dosyası oluşturmaz)
npx prisma db push --force-reset
```

### Adım 4: Idempotency Index'i Oluştur

```powershell
# Index'i manuel oluştur (test ortamında CONCURRENTLY gerekmez)
docker exec -it hukuk-postgres psql -U postgres -d truthlayer_test -c "
CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_snap_idempotency 
ON simulation_snapshots (
  tenant_id,
  incident_id,
  COALESCE(run_id, '__NO_RUN__'),
  calc_hash
);"
```

### Adım 5: Integration Testleri Koş

```powershell
cd HUKUK_YAZILIMI/project

# Environment variables
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/truthlayer_test?schema=public"
$env:RUN_INTEGRATION_TESTS="true"
$env:APP_ENV="test"

# Testleri koş
pnpm --filter @hukuk/api run test -- --testPathPattern="snapshot-idempotency.integration.spec.ts" --verbose
```

---

## Seçenek B: Ayrı Test Container (Port 5433)

```powershell
# Ayrı port'ta test container (prod ile çakışmaz)
docker run --name tb-postgres-test `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_DB=truthlayer_test `
  -p 5433:5432 `
  -d postgres:16-alpine

# ⚠️ DATABASE_URL'i 5433 ile kullan - 5432 DEĞİL!
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/truthlayer_test?schema=public"
```

---

## ⚠️ SAFETY CHECKS (Her Adımda Uygula)

### A) DB Adı Doğrulama (force-reset öncesi ZORUNLU)

```powershell
# Bu satırı her force-reset/migrate öncesi çalıştır
if ($env:DATABASE_URL -notmatch "truthlayer_test") { 
  throw "ABORT: Refusing destructive operation on non-test DB!" 
}
```

### B) Bağlantı Doğrulama (Test öncesi)

```powershell
# Doğru DB'ye bağlandığını kanıtla
docker exec -it hukuk-postgres psql -U postgres -d truthlayer_test -c "SELECT current_database();"
# Beklenen çıktı: truthlayer_test
```

### C) Port Doğrulama

```powershell
# Seçenek A kullanıyorsan: 5432
# Seçenek B kullanıyorsan: 5433
# DATABASE_URL'deki port ile container port'u eşleşmeli!

# Kontrol:
echo $env:DATABASE_URL
# postgresql://...@localhost:5432/truthlayer_test  ← Seçenek A
# postgresql://...@localhost:5433/truthlayer_test  ← Seçenek B
```

---

## Kanıt Checklist

### 1. Test Çıktısı (7 test PASS)

Beklenen output:
```
 PASS  src/modules/calc-preview/diagnostics/persistence/__tests__/snapshot-idempotency.integration.spec.ts
  Snapshot Idempotency Integration Tests
    PK idempotency (snapshotId)
      ✓ returns existing snapshot when snapshotId already exists
    Content-based idempotency
      ✓ returns existing snapshot when content matches
    Different content allowed
      ✓ allows different hash for same tenant/incident/run
    Tenant isolation
      ✓ allows same content for different tenants
    NULL runId handling (COALESCE)
      ✓ handles NULL runId idempotency via COALESCE sentinel
      ✓ allows NULL and non-NULL runId for same content
    Concurrent insert handling
      ✓ handles concurrent inserts correctly - single row created

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

### 2. Index Doğrulama Query

```powershell
docker exec -it hukuk-postgres psql -U postgres -d truthlayer_test -c "
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'simulation_snapshots' 
  AND indexname = 'uq_sim_snap_idempotency';"
```

Beklenen:
```
       indexname          |                                    indexdef
--------------------------+--------------------------------------------------------------------------------
 uq_sim_snap_idempotency  | CREATE UNIQUE INDEX uq_sim_snap_idempotency ON public.simulation_snapshots ...
(1 row)
```

### 3. Duplicate Pre-Check (0 satır)

```powershell
docker exec -it hukuk-postgres psql -U postgres -d truthlayer_test -c "
SELECT tenant_id, incident_id, 
       COALESCE(run_id, '__NO_RUN__') AS run_key, 
       calc_hash, COUNT(*) 
FROM simulation_snapshots 
GROUP BY 1,2,3,4 
HAVING COUNT(*) > 1;"
```

Beklenen:
```
 tenant_id | incident_id | run_key | calc_hash | count
-----------+-------------+---------+-----------+-------
(0 rows)
```

### 4. DB Bağlantı Doğrulama

```powershell
docker exec -it hukuk-postgres psql -U postgres -d truthlayer_test -c "
SELECT current_database(), current_user, version();"
```

---

## Cleanup (Test Sonrası)

```powershell
# Test DB'yi sil (opsiyonel)
docker exec -it hukuk-postgres psql -U postgres -c "DROP DATABASE truthlayer_test;"

# Veya container'ı durdur
docker compose -f docker/docker-compose.yml down
```

---

## Hata Durumları

### P2002 Hatası Alınırsa
Index çalışıyor demektir. Test'in bunu handle ettiğini doğrula.

### Connection Refused
```powershell
# Container çalışıyor mu?
docker ps | findstr postgres

# Port açık mı?
Test-NetConnection -ComputerName localhost -Port 5432
```

### Schema Mismatch
```powershell
# Schema'yı sıfırla
npx prisma db push --force-reset
```

---

## Sign-Off Template

Test sonuçlarını yapıştırdıktan sonra PHASE-9B5-LOCK.md'ye eklenecek:

```markdown
## Production Ready ✅

**Integration Test Execution:** 2026-01-22
**Executed By:** [İsim]
**Environment:** Docker PostgreSQL 16-alpine

### Test Results
- 7/7 tests PASS
- Execution time: X.XXs
- Concurrent test (5 parallel inserts): Single row verified
- NULL vs non-NULL runId differentiation: Verified

### Index Verification
- Index `uq_sim_snap_idempotency` EXISTS
- COALESCE sentinel `__NO_RUN__` in index definition

### Duplicate Check
- Pre-existing duplicates: 0

**Phase 9B.5 is PRODUCTION READY.**
```
