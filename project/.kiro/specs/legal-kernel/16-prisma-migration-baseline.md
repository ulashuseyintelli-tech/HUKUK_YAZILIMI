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

## 9. Proof Result (2026-06-05) — PASSED
Temp DB `hukuk_baseline_proof`, geçici dizin (`prisma-proof-tmp/`), gerçek repo/dev/prod dokunulmadı.
- baseline DDL: 151 CREATE TABLE ✅ · triggers: 5 fn + 8 trg + worker singleton ✅
- `migrate deploy` (baseline + triggers) temiz DB'de: **applied** ✅
- Doğrulama: **151 tablo / 5 function / 8 trigger** ✅
- 3 legal-kernel integration suite: **24/24** ✅
- Temp DB + geçici dosyalar temizlendi; `git status` temiz.

## 10. Cutover Plan (karar kaydı — execution ayrı onayla)

**(1) Eski migration arşivi:** ~18 eski klasör `prisma/migrations/` dışına `git mv` ile `_archive/`'a (silme yok — tarihsel + trigger kaynağı). Prisma kökü taramaz.

**(2) Yeni zincir:** `00000000000000_baseline` + `00000000000001_legal_kernel_triggers` (lexikografik sıra; tüm eski zincir arşivli).

**(3) Baseline içeriği:** `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` → gerçek `migrations/00000000000000_baseline/migration.sql`.

**(4) Trigger içeriği:** proof'ta birleştirilen 5 fn + 8 trg (+ worker singleton), ALTER'sız → `00000000000001_legal_kernel_triggers/`.

**(5) Mevcut DB klon prova (önce klon, dev/prod'a dokunmadan):** pg_dump→clone DB→ repo geçici cutover layout → `migrate resolve --applied baseline` + `--applied triggers` (DDL yok, sadece metadata) → gerekiyorsa `DELETE FROM _prisma_migrations WHERE migration_name NOT IN (baseline, triggers)` → `migrate status` temiz → şema/veri aynı → app yeşil → klon drop.

**(6) Temiz DB deploy doğrulaması:** sıfır DB → `migrate deploy` → 151 tablo + 8 trg + 24 test (DR/yeni-ortam çalışıyor kanıtı).

**(7) CI PR #3:** cutover main'e merge → `fix/ci-pr-gates` rebase → PR #3 re-run (`migrate deploy` artık geçer) → integration yeşil → merge. (Cutover, PR #3'ün önkoşulu.)

**(8) Rollback:** Repo: `git revert` (arşivden geri). DB: cutover şema/veriye dokunmaz (resolve = DDL yok) → yalnız `_prisma_migrations` metadata; dev/prod'dan önce `pg_dump -t _prisma_migrations` + tam DB yedeği → rollback = metadata restore.

**(9) Dev/prod öncesi checklist:** proof ✅ · klon prova ✅ · `_prisma_migrations` yedeği (dev+prod) · prod tam yedek · baseline/triggers review · rollback klonda prova · PR #3 rebase hazır · maintenance penceresi.

## 11. Clone Rehearsal Plan (dev/prod'a + repo migrations'a dokunmadan)
Hedef DB **yalnız `hukuk_cutover_clone`**; repo simülasyonu **`prisma-cutover-tmp/`**.
1. **Clone:** `CREATE DATABASE hukuk_cutover_clone` → `pg_dump --format=custom --no-owner hukuk_db` → `pg_restore -d hukuk_cutover_clone` (şema+veri+`_prisma_migrations`). Ön gereksinim: `pg_dump/pg_restore` PATH'te.
2. **Temp layout:** `prisma-cutover-tmp/` = schema kopyası + migrations/{baseline, triggers} + lock (cutover-sonrası simülasyon; gerçek klasör dokunulmaz).
3. **Metadata yedeği:** `pg_dump -t _prisma_migrations hukuk_cutover_clone > clone_pm.before.sql` (rollback provası için).
4. **resolve:** `migrate resolve --applied 00000000000000_baseline` + `--applied 00000000000001_legal_kernel_triggers` (clone'a, temp schema ile; DDL yok).
5. **Eski kayıt temizliği:** `DELETE FROM "_prisma_migrations" WHERE migration_name NOT IN ('00000000000000_baseline','00000000000001_legal_kernel_triggers');`
6. **status beklentisi:** `migrate status` → "up to date" (divergence yok) + 151 tablo/5 fn/8 trg korunmuş + 24/24 integration clone'a karşı.
7. **Rollback provası:** `_prisma_migrations` temizle + `clone_pm.before.sql` restore → eski metadata geri (şema/veri hiç değişmedi → kanıt).
8. **Dev dokunulmadı teyidi:** `hukuk_db._prisma_migrations`'ta baseline/triggers YOK (read-only). `git status` temiz.
9. **Temizlik:** `dropdb hukuk_cutover_clone` + `rm -rf prisma-cutover-tmp /tmp/*.dump /tmp/*.sql`.

## 12. Clone Rehearsal Result (2026-06-06) — PASSED
Hedef DB **yalnız `hukuk_cutover_clone`** (PG 18.1), temp layout `.cutover-tmp/`; gerçek dev/prod DB + gerçek `prisma/migrations` + gerçek `schema.prisma` **dokunulmadı**. Hata oluşmadı (hiçbir adımda durulmadı).

| # | Adım | Sonuç |
|---|---|---|
| 1 | pg_dump/restore | `hukuk_db` → `hukuk_cutover_clone` (640 KB custom dump). Klon: 152 base tablo + 19 migration kaydı (dev ile birebir). Dev'e yalnız okuma. |
| 2 | Temp layout | `.cutover-tmp/prisma/` = schema kopyası + lock + `{00000000000000_baseline, 00000000000001_legal_kernel_triggers}`. Gerçek migrations elle değişmedi. |
| 3 | Baseline + trigger üretimi | baseline = `migrate diff --from-empty` → **151 CREATE TABLE**; triggers = 3 kaynaktan **5 fn + 8 trg + 1 worker singleton**, yasak statement (ALTER/CREATE TABLE/backfill/INDEX) = 0. |
| 4 | resolve --applied | baseline + triggers metadata-only applied (DDL yok) → 19→21 kayıt. Önce orijinal metadata yedeği (`clone_pm.before.sql`, 19 kayıt). |
| 5 | Eski metadata temizliği | `DELETE … NOT IN (baseline, triggers)` → 19 silindi, 2 kaldı (ikisi finished + not rolled-back). |
| 6 | migrate status | **"Database schema is up to date!"** — 2 migration, divergence yok. |
| 7 | Yapı doğrulama | **151 tablo / 5 function / 8 trigger** + worker singleton row korunmuş. |
| 8 | Integration | `collection-payment-received` + `domain-event-ingest` + `uyap-event-ingest.boundary` → **3 suite, 24/24 PASSED** (klona karşı). |
| 9 | Rollback provası | 2 kayıt sil → `clone_pm.before.sql` restore → 19 kayıt geri, baseline/triggers gitti (0), **şema değişmedi (151/5/8)** = rollback saf metadata kanıtı. |
| 10 | Dev DB dokunulmadı | `hukuk_db`: 19 kayıt / 0 baseline-triggers / 152 tablo (değişmemiş). Gerçek repo migrations: 19 klasör, baseline/triggers yok. |
| 11 | Temizlik | `dropdb hukuk_cutover_clone` (0 kaldı) + `.cutover-tmp` silindi. Final `git status` temiz. |

**Çıktı:** A1 squash-baseline cutover akışı klonda uçtan uca doğrulandı — resolve metadata akışı temiz, şema/veri/trigger korunuyor, rollback metadata-restore ile geri alınabilir, dev tamamen izole kaldı.

## DoD
- [x] A1 kararı + envanter + proof planı
- [x] Proof: temp DB'de squash zinciri yeşil (§9 — 151/5/8, 24/24)
- [x] Cutover planı (§10)
- [x] **Klon prova (dev/prod'a dokunmadan) — COMPLETED (§12, 2026-06-06: 151/5/8, 24/24, rollback OK, dev untouched)**
- [ ] Cutover execution onayı (repo migrations red-line gevşetme)
- [ ] **ulas onayı**

---
**Decision Status:** Plan accepted (A1). Proof PASSED. Clone rehearsal PASSED (§12). Cutover execution pending — ilk kez gerçek `prisma/migrations` + gerçek dev DB metadata ile temas edecek; **ayrı explicit onay gerektirir.**
