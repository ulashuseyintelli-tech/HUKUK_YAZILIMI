# Runbook — ADR-014 Local Baseline + Shadow Evidence Runner

**Durum:** IMPLEMENTED / READY FOR OWNER REVIEW — çalıştırma yetkisi owner-local'dir.
**Kaynak:** `project/apps/api/src/scripts/adr014-local-shadow-evidence-runner.ts` (+ saf çekirdek `adr014-shadow-evidence.core.ts`).
**Kanonik yetki:** `docs/design/adr-014-cutover-authorization-policy.md` §10 (LOCAL owner/office evidence).
**Sözleşme:** `docs/design/adr-014-zero-cent-discrepancy-monitoring-contract.md` (ADR014-PE-01).

> **Sınır.** Bu araç bir SALT-OKUMA shadow kanıt toplayıcısıdır. `PR-11`, feature flag,
> consumer switch, runtime cutover, harici veri transferi YAPMAZ ve YETKİLENDİRMEZ. Ürettiği
> kanıt üç kapıdan yalnız ikisini (ölçülmüş yerel baseline + temsili kanıt) besler; üçüncü
> kapı — açık owner `APPROVED` — hâlâ ayrı ve bağlayıcıdır.

---

## 1. Ne yapar

Owner tarafından seçilen GERÇEK yerel case kümesi üzerinde, mevcut
`BalanceDisplayShadowDiffService.compare()` boru hattını (legacy `getCalculationSummary` ↔
canonical `computeCaseBalance → display`) case başına çalıştırır ve şunları ölçer:

- **Parity (0-cent):** her finansal alan (principal/interest/cost/expense/fee/paid/outstanding/
  total + bucket'lar) için legacy↔canonical kuruş farkı. **Sıfırdan farklı her kuruş =
  FINANCIAL_DISCREPANCY** (contract §4; shadow servisinin `<%1` MINOR_DELTA gevşemesi burada
  KABUL TOLERANSI DEĞİLDİR).
- **Latency:** `compare()` çağrısının wall-clock süresi (monotonik); SUCCESS koşumları üzerinden
  p50/p95/p99.
- **Error / timeout:** başarısız/timeout koşum sayımı.
- **Blocker dağılımı:** readiness + comparability + diagnostics blocker kodlarının histogramı.
- **Kapsam:** owner-etiketli scenarioClass / currencyGroup / caseSizeBucket dağılımı.

Karşılaştırmayı **yeniden yazmaz** — yalnız `compare()`'in ürettiği alanları sınıflandırıp toplar
(REC-AUTH-000: ikinci hesaplama otoritesi yok).

---

## 2. Ön koşullar

1. Çalışan yerel Postgres + `project/apps/api/.env` içinde `DATABASE_URL` (yerel ofis DB'si).
2. `project/apps/api` altında bağımlılıklar kurulu (`pnpm install`).
3. (Öneri) Çalıştırma öncesi yerel yedek: `pg_dump` — salt-okuma zaten bozulmayı imkânsız kılar,
   bu yalnız "yanlış klasör/DB" güvenlik ağıdır.

---

## 3. Girdi manifesti (owner GERÇEK case seti sağlar — runner veri ÜRETMEZ)

Varsayılan yol: `project/apps/api/evidence/adr014/input/representative-cases.json` (`.gitignore`'lu).
Bu dosya **owner tarafından** doldurulur; runner sentetik veri icat etmez.

```json
{
  "datasetVersion": "2026-07-ofis-temsili-v1",
  "asOfDefault": "2026-07-12",
  "cases": [
    {
      "tenantId": "<gerçek-tenant-id>",
      "caseId": "<gerçek-case-id>",
      "asOfDate": "2026-07-12",
      "scenarioClass": "SINGLE_CURRENCY",
      "currencyGroup": "TRY",
      "caseSizeBucket": "SMALL"
    }
  ]
}
```

`scenarioClass` / `currencyGroup` / `caseSizeBucket` owner-sağlanan temsililik etiketleridir
(runner üretmez, yalnız kapsam raporunda toplar). Önerilen scenarioClass kapsamı: SINGLE_CURRENCY,
MULTI_CURRENCY, REVERSAL, OVERPAYMENT, NAFAKA, RESTRICTED_PAYMENT, INTEREST_STUB,
ENFORCEMENT_PRE_POST, FEE_PRESENT, HIGH_PAYMENT_COUNT, ZERO_INTEREST.

---

## 4. Çalıştırma

```bash
cd project/apps/api
ADR014_CANONICAL_SHA=$(git rev-parse HEAD) \
  npx tsx src/scripts/adr014-local-shadow-evidence-runner.ts \
    --input evidence/adr014/input/representative-cases.json \
    [--out evidence/adr014/run-<etiket>] \
    [--timeout-ms 30000]
```

Girdi dosyası yoksa runner temiz çıkar (fabrikasyon yok).

---

## 5. Salt-okuma garantisi (owner decision 4)

Dört katman:

1. **Bağlantı:** `DATABASE_URL`'e `-c default_transaction_read_only=on -c
   default_transaction_isolation=repeatable read` options'ı eklenir → Postgres motoru her non-temp
   write'ı reddeder.
2. **Fail-closed doğrulama:** bootstrap sonrası `SELECT current_setting('transaction_read_only')`
   `'on'` değilse runner HİÇBİR case çalıştırmadan durur.
3. **Uygulama:** `compare()` zaten `mode: SHADOW_ONLY` / `primaryDisplayUnchanged: true`.
4. **Statik guard:** `__tests__/adr014-local-shadow-evidence-runner.static-purity.spec.ts` kaynakta
   hiçbir mutation çağrısı/yazma bayrağı olmadığını ve read-only enforcement'ın mevcut olduğunu
   kilitler.

> Not: PostgreSQL read-only transaction'ı geçici (TEMP) tablo yazımına izin verir; runner statik
> guard'ı hiç TEMP yazımı yapmadığını da kanıtlar, dolayısıyla tek dayanak connection default'u
> değildir.

---

## 6. Çıktı yapısı (`--out` dizini) — iki katmanlı PII modeli

| Dosya | İçerik | Hassasiyet |
|---|---|---|
| `manifest.json` | canonical SHA, DB kimliği (credential YOK), dataset version, sayımlar, engine/policy/contract version, run start/end, yetki durumu | düşük |
| `summary.json` | KİMLİKSİZ agregat: alan-bazlı parity sayımları, latency p50/p95/p99, outcome/blocker/kapsam dağılımı | PII-safe (contract §5.2) |
| `detail.json` | opak-Id + kuruş delta (sayısal finansal kanıt) — ham kimlik YOK | erişim-kısıtlı |
| `correlation.map.json` | opak-Id → gerçek (tenantId, caseId) | **en kısıtlı** |
| `manifest.sha256` | üstteki 4 dosyanın SHA-256 bütünlük manifesti | — |

`summary.json` ham `tenantId/caseId` içermez (statik test bunu doğrular). Gerçek kimlikler yalnız
`correlation.map.json`'da, ayrı ve en kısıtlı katmanda tutulur.

---

## 7. Kanıt işleme (owner decision 2)

- Tüm çıktı `project/apps/api/evidence/` altındadır ve **`.gitignore`'ludur — asla commit edilmez**.
- Kanıt YEREL kalır; cloud/harici/e-posta ile paylaşılmaz.
- Runner recursive silme yapmaz; her koşum timestamp'li ayrı dizindir, üzerine yazılmaz.
- Yanlışlıkla dış gönderim veya yanlış DB'ye bağlanma koruması: banner çalıştırma öncesi hedef DB
  kimliğini (credential'sız) yazdırır; onaylamadan devam etmeyin.

---

## 8. Yorumlama

- `zeroCent.overallClean = true` → hiçbir SUCCESS case'inde finansal discrepancy yok (0-cent temiz).
- `caseVerdict`: `EXACT` (tam parity, blocker yok) · `DISCREPANCY` (≥1 kuruş fark) · `FAIL_CLOSED`
  (blocker/unknown var, finansal fark yok) · `UNAVAILABLE` (koşum başarısız/timeout).
- Latency ceilings (policy §9): p95 ≤ +%20, p99 ≤ +%30 — bu runner ölçümü SAĞLAR; yorum owner/ops
  kararıdır.

---

## 9. Bu araç YETKİLENDİRMEZ

```text
PR-11 implementation        : NO
Feature flag activation     : NO
Consumer switch             : NO
Runtime cutover             : NO
External data transfer      : NO
İkinci hesaplama otoritesi  : NO
```

Üç kapı: (1) ölçülmüş yerel baseline, (2) temsili kanıt, (3) açık owner `APPROVED`. Bu runner
(1) ve (2)'yi besler; (3) ayrı ve bağlayıcıdır. Kanıt görüldükten sonra PR-11 için ayrı owner GO
gerekir.
