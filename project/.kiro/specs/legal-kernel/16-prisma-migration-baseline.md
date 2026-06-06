---
status: active
review-trigger: "Proof onaylanmadan baseline migration üretilmez; cutover ayrı onay"
phase: 2
sprint: 2D
---

# 16 — Prisma Migration Baseline (A1: squash-baseline)

**Tarih:** 2026-06-05
**Bağlam:** CI integration gate (PR #3) `migrate deploy` temiz DB'de patladı. Kök neden:
~80-90 model (tüm 27 `Icrabot*` dahil) `db push` ile kurulmuş, CREATE migration'ı yok →
migration zinciri sıfırdan deploy edilemiyor. Detay: `90-future-work/deferred/prisma-migration-completeness-gap.md`.

## 0. Karar: A1 — squash-baseline
- `schema.prisma` final şema **tek doğruluk kaynağı.**
- Trigger/function SQL **ayrı migration olarak korunur** (schema.prisma trigger taşımaz).
- Mevcut DB'de **deploy yok → `migrate resolve --applied`.**
- Temiz DB'de **`migrate deploy` zorunlu doğrulama.**
- CI PR #3 merge edilmez; baseline sonrası yeniden yeşillenecek.
- (A2 keep-history reddedildi: pre-ALTER şemayı elle kurmak kırılgan; mevcut history zaten güvenilmez.)

## 1. Eksik tablolar
- 151 model − 61 migration CREATE ≈ **~80-90 tablo** eksik (14 `@@map` → liste yaklaşık).
- **Otoritatif liste (tooling):** `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` → tam DDL; `@@map`'i otomatik doğru çözer. (`migrate diff --from-migrations` KULLANILAMAZ — migration'lar temiz replay edilemiyor.)

## 2. Korunacak trigger/function envanteri (5 fn + 8 trg, 3 kaynak migration)
| Kaynak migration | Function | Trigger |
|---|---|---|
| `20260202110000_phase9c_task2_evidence_bundles` | `trg_bundle_seal_event_guard`, `trg_evidence_object_insert_guard` | `bundle_seal_event_guard`, `evidence_object_insert_guard` |
| `20260203150000_phase10_2_worker_state` | `update_manifest_worker_state_timestamp` | (timestamp trg) |
| `20260520100000_phase2_sprint1_ordering_immutability` | `raise_immutable_error`, `validate_aggregate_version` | `enforce_aggregate_version_gap_free`, `prevent_timeline_update`, `prevent_timeline_delete`, `prevent_fact_audit_update`, `prevent_fact_audit_delete` |

→ Bunlar yeni `..._legal_kernel_triggers` migration'ına **fonksiyon+trigger olarak** taşınır;
**ALTER/backfill statement'ları taşınmaz** (kolonlar/indeksler baseline'da zaten var).

## 3. Yeni temiz zincir (squash sonrası)
```
00000000000000_baseline                  → tüm 151 tablo + kolon + indeks (schema.prisma'dan)
00000000000001_legal_kernel_triggers      → 5 function + 8 trigger (§2)
```

## 4. Baseline PROOF planı (klon/temp DB — gerçek repo/dev/prod'a DOKUNMAZ)
Geçici DB: **`hukuk_baseline_proof`**. Tüm üretim geçici dizinde; **`prisma/migrations` gerçek klasörü değiştirilmez.**
```
# (a) Baseline DDL üret (geçici dizine)
prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  > <temp>/migrations/00000000000000_baseline/migration.sql
# (b) Triggers migration'ını 3 kaynaktan el ile birleştir (sadece fn+trigger, ALTER yok)
#     -> <temp>/migrations/00000000000001_legal_kernel_triggers/migration.sql
# (c) Temiz DB oluştur
createdb hukuk_baseline_proof
# (d) 2-migration zincirini temp DB'ye deploy (temp prisma dizini + DATABASE_URL ile)
DATABASE_URL=...hukuk_baseline_proof prisma migrate deploy
# (e) Doğrula: 151 tablo (information_schema), 8 trigger + 5 fn (pg_trigger/pg_proc)
# (f) 3 legal-kernel integration suite'i (24 test) bu DB'ye karşı koştur
# (g) Temp DB drop
```
**Çıktı:** temiz DB'de zincir geçiyor + trigger'lar var + integration testler yeşil → squash doğru.

## 5. Cutover (proof geçince, AYRI onayla — bu adım eski klasörleri değiştirir)
> ⚠️ A1 squash, gerçek `prisma/migrations`'taki eski klasörlerin baseline+triggers ile **değiştirilmesini** gerektirir (eski CREATE migration'ları baseline ile çakışır — ikisi bir arada temiz deploy edilemez). Bu, "eski klasör silme/taşıma yok" kırmızı çizgisiyle kesişir → **cutover ayrı, explicit onay gerektirir.** Proof aşamasında gerçek klasörler değişmez.

Cutover adımları (onay sonrası):
1. Gerçek `prisma/migrations`'ı baseline+triggers ile değiştir (eski klasörler arşive).
2. **Mevcut dev/prod'da deploy DEĞİL** → `migrate resolve --applied 00000000000000_baseline` + `..._legal_kernel_triggers`.
3. `_prisma_migrations` tutarsızlığı (eski applied kayıtlar) → önce **DB klonunda** tüm akış denenir.

## 6. Doğrulama (clean-DB zorunlu)
Temiz DB'de `migrate deploy` → 151 tablo + 8 trigger → 3 integration suite yeşil → CI `migrate deploy` adımı da geçer → PR #3 yeşillenir.

## 7. Riskler
- `migrate diff --from-migrations` replay edilemez → `--from-empty`/`--to-url` kullan.
- **Trigger kaybı** → §2 envanteri eksiksiz taşınmalı (5 fn + 8 trg).
- Mevcut DB'de duplicate-table → `resolve --applied` (deploy değil); önce klon.
- `_prisma_migrations` eski kayıtları → klonda doğrula.
- Prisma **shadow DB** (dev workflow için) → oluşturulabilir postgres + yetki.
- `@@map` 14 tablo → `migrate diff` otomatik çözer (yaklaşık bash listesi değil, tooling otoritatif).

## 8. Kırmızı çizgiler
- Dev/prod DB'ye dokunma (proof tamamen temp DB'de).
- Eski migration klasörlerini silme/taşıma **proof'ta yok** (cutover'da, ayrı onayla).
- Baseline migration üretmeden önce doc + proof planı (bu belge).
- `migrate resolve` gerçek DB'de yok; önce klon.

## DoD
- [x] A1 kararı + envanter + proof planı (bu belge)
- [ ] Proof: temp DB'de squash zinciri yeşil (komutlar §4)
- [ ] Cutover onayı (ayrı)
- [ ] **ulas onayı**

---
**Decision Status:** Plan accepted (A1). Proof execution pending approval.
