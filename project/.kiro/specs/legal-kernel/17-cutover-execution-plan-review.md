---
status: active
review-trigger: "Cutover execution onayı verilince Faz A'dan başlanır; her fazın kendi gate'i var"
phase: 2
sprint: 2D
date: 2026-06-06
purpose: "A1 squash-baseline'ı gerçek repo + dev DB'ye taşımanın faz faz planı (REVIEW artefaktı). Proof (doc 16 §9) + clone rehearsal (doc 16 §12) PASSED sonrası karar deposu. Execution AYRI explicit onay gerektirir."
---

# 17 — Cutover Execution Plan Review

**Branch:** `fix/prisma-migration-baseline` @ `67c13ae`
**Hedef:** A1 squash-baseline'ı gerçek `prisma/migrations` + gerçek dev DB metadata'sına taşı.
**Durum:** REVIEW — execution YOK. Önkoşullar ✅: Proof (doc 16 §9), Clone Rehearsal (doc 16 §12).
**Bağlam:** Cutover ilk kez (a) gerçek `prisma/migrations` ve (b) gerçek dev DB metadata ile temas eder → AYRI explicit onay gerektirir.

---

## Phase A — Migration Inventory

**Arşivlenecek (19 klasör → `prisma/migrations/_archive/`, `git mv` ile — SİLME YOK, tarihsel + trigger kaynağı):**
```
20251208174752_add_form_metadata
20251208175623_add_automation_models
20251213181002_add_limited_poa_fields
20260118000000_phase_9b_truth_layer
20260121000000_phase_9b5_idempotency_index
20260202110000_phase9c_task2_evidence_bundles            ★ trigger kaynağı
20260202230000_phase10_manifest_retry_queue
20260203100000_phase10_2_audit_log
20260203100001_phase10_2_dlq_extensions
20260203150000_phase10_2_worker_state                    ★ trigger kaynağı
20260203200000_phase10_2_admin_actions
20260203200000_phase10_3_pr4_audit_enrichment
20260203210000_phase10_3_idempotency_hardening
20260206100000_phase11_dlq_carrier_columns
20260207100000_phase11_3_dlq_poison_columns
20260208100000_phase11_4_dlq_redrive_rate_limit_columns
20260210100000_sprint3_promote_escalation_state
20260520100000_phase2_sprint1_ordering_immutability      ★ trigger kaynağı
20260605120000_phase2_sprint2d_timeline_tenant_id_nullable
```
★ = 3 trigger kaynağı. Fn+trigger içeriği yeni triggers migration'ında yaşar; klasörler arşivde tarihsel kayıt + kaynak olarak korunur.

**Yeni 2'li zincir (gerçek `prisma/migrations/`):**
```
00000000000000_baseline                 → 151 CREATE TABLE (schema.prisma'dan, migrate diff --from-empty)
00000000000001_legal_kernel_triggers     → 5 function + 8 trigger + worker singleton
migration_lock.toml                      → değişmez (provider=postgresql)
```

**Mevcut durum teyidi (salt-okuma, 2026-06-06):** 19 gerçek klasör + `_prisma_migrations`'ta 19 kayıt (birebir). `schema.prisma` git'te temiz.

---

## Phase B — Prisma Diff Review (gerçek migrations değişMEDEN gösterilir)

- **Repo diff'i = saf dosya hareketi:** 19 klasör `git mv → _archive/` + 2 yeni klasör eklenir.
- **`schema.prisma` diff = BOŞ** — baseline ondan türetildiği için şema dosyası hiç değişmez. (Kırmızı-çizgi dostu kritik nokta.)
- Baseline + triggers içeriği **clone rehearsal'da bit-bit doğrulandı** (151 tablo, 5fn/8trg, yasak statement [ALTER/CREATE TABLE/backfill/INDEX] = 0). Cutover'da aynı üretim komutları kullanılır:
  - `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` → baseline
  - 3 kaynaktan fn+trigger+singleton (doc 16 §2) → triggers
- **GATE B:** Gerçek `git mv` + yeni dosya commit'inden önce, üretilecek diff (`git status` + yeni dosya içerikleri) sana gösterilir → onay → sonra commit.

---

## Phase C — Dev Metadata Update (ilk gerçek dev DB teması)

**Sıra (doc 16 §10(5)/(8) — önce yedek):**
1. `pg_dump -t _prisma_migrations hukuk_db > pm.before.sql`  (metadata yedeği)
2. `pg_dump --format=custom hukuk_db > hukuk_db.full.dump`   (tam DB yedeği — rollback güvencesi)
3. `prisma migrate resolve --applied 00000000000000_baseline`
   `prisma migrate resolve --applied 00000000000001_legal_kernel_triggers`  (DDL YOK, metadata-only)
4. `DELETE FROM "_prisma_migrations" WHERE migration_name NOT IN ('00000000000000_baseline','00000000000001_legal_kernel_triggers');`  (19→2)
5. `prisma migrate status` → "up to date"

- Şema/veriye **DOKUNULMAZ** (resolve = metadata; clone rehearsal'da kanıtlandı).
- Dev'de `migrate deploy` **YOK** (duplicate-table riski → resolve kullanılır).
- **GATE C:** Yedekler alınmadan ve sen onaylamadan hiçbir resolve/delete çalıştırılmaz.

---

## Phase D — Verification

1. Temiz DB → `migrate deploy` → 151 tablo + 8 trg → **24/24 integration** (DR / yeni-ortam kanıtı).
2. `fix/ci-pr-gates` (PR #3) bu branch'e/main'e rebase → CI'da `migrate deploy` artık geçer → integration yeşil.
3. PR #3 **review + onay sonrası** merge. (Cutover, PR #3'ün önkoşulu.)

---

## ⛔ STOP POINT — explicit approval required

Bu Review hiçbir şey değiştirmez. Onaysız yapılmaz:
- **Faz A/B:** gerçek `prisma/migrations` `git mv` + yeni dosya commit'i
- **Faz C:** gerçek `hukuk_db` resolve/delete
- **Faz D:** PR #3 merge

Her fazın kendi gate'i vardır; fazlar tek seferde değil, onaylı adımlarla ilerler.

---

## Kırmızı çizgiler (cutover boyunca)
- Gerçek DB'ye dokunmadan önce plan (bu doküman).
- Gerçek `prisma/migrations` değişmeden önce diff (GATE B).
- Gerçek dev DB resolve/delete'ten önce tam yedek + diff (GATE C).
- CI PR #3 merge yok (Faz D, ayrı onay).
- `db push` hack yok · dev'de `migrate deploy` yok · `migrate deploy` hedefinden sapma yok.
- Önce klon → yedek → dev sırası (clone rehearsal zaten ✅).

---

## Açık riskler / rollback
- **R1 — `_archive/` taranır mı?** Prisma yalnız `migrations/` kökündeki tarih-prefixli klasörleri okur; `_archive/` alt-klasör güvenli. GATE B'de `migrate status` ile teyit.
- **R2 — Eski 19 kayıt silinince başka ortam etkilenir mi?** bus-factor=1, tek dev DB, prod yok. Yine de tam yedek (C.2) zorunlu.
- **R3 — Rollback:**
  - Repo: `git revert` (arşivden geri) — eski zincir tekrar `migrations/` köküne.
  - DB: `pm.before.sql` restore (yalnız `_prisma_migrations` metadata; şema/veri hiç değişmedi) — clone rehearsal'da kanıtlandı.

---

## DoD
- [x] Cutover plan review dokümante edildi (bu belge)
- [ ] Faz A execution onayı (repo migrations red-line gevşetme)
- [ ] Faz B diff onayı (GATE B)
- [ ] Faz C dev metadata onayı + yedekler (GATE C)
- [ ] Faz D verification + PR #3 merge onayı
- [ ] **ulas onayı (her gate ayrı)**

---
**Decision Status:** Review accepted as artefact. Execution NOT started — Faz A explicit onay bekliyor. İlgili: doc 16 §9 (proof), §10 (cutover plan), §12 (clone rehearsal).
