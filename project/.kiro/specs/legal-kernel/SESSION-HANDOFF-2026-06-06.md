---
status: active
review-trigger: "Yeni oturum başında ilk okunacak belge (kısa kart)"
date: 2026-06-06
purpose: "Start-here özeti. TEKRAR ETMEZ; detay için SESSION-LOG-2026-06-05.md ve 16-prisma-migration-baseline.md'ye referans verir."
---

# SESSION HANDOFF — Start Here

## Yeni oturum başlangıç prompt'u
> **"`92-architectural-memory.md` + `SESSION-HANDOFF-2026-06-06.md` + `16-prisma-migration-baseline.md` oku. **Prisma cutover TAMAMLANDI** (main `08f9af7`). Sıradaki iş: açık backlog'dan seçim (aşağıdaki "Açık backlog" bölümü). Kırmızı çizgi: db push hack yok; her DB/migration işi önce klon/temp prova + plan-review + ayrı onay."**

## Aktif branch & açık PR
- **main `08f9af7`** — Prisma cutover + CI gate canlı. Açık bloklayıcı PR YOK.
- **Cutover branch'leri merge & kapandı:** `fix/prisma-migration-baseline` (PR #4) + `fix/ci-pr-gates` (PR #3).

## Cutover durumu (doc 17) — ✅ TAMAMLANDI (2026-06-06)
- **Faz A (repo cutover) ✅** — `30a0e25`. 19 eski migration → `prisma/migrations-archive/` (git mv, içerik korundu); yeni zincir `00000000000000_baseline` (151 tablo) + `00000000000001_legal_kernel_triggers` (5fn/8trg). schema.prisma & migration_lock.toml değişmedi.
- **Faz C (dev metadata) ✅** — `hukuk_db._prisma_migrations`: 19 → **2 kayıt** (resolve --applied + eski 19 DELETE). `migrate status` = up to date. Şema/veri DEĞİŞMEDİ: **152 tablo / 5 fn / 8 trg**. Yedek: `_fazC_backup/20260606_203101/`.
- **Faz D Blok 1 (DR kanıtı) ✅** — geçici DB'de gerçek committed migrations ile `migrate deploy` sıfırdan geçti; 151/5/8 + 24/24; `hukuk_db` dokunulmadı.
- **Faz D Blok 2 (merge & PR #3) ✅** — **D4** cutover → main merged (`889363d`, PR #4) · **D5** PR #3 rebase + force-with-lease push (`99a0ffb`) · **D6** CI yeşil (migrate deploy ✅ + integration 24/24 ✅) · **D7** PR #3 merged (`08f9af7`).
- **Sonuç:** Repo ↔ dev DB ↔ CI hizalı; `migrate deploy` sıfırdan çalışıyor (DR/yeni-ortam hazır). PR #3'ün kırmızı kök nedeni çözüldü.
- **Rollback (gerekirse):** main'de cutover merge commit'i `git revert`; dev metadata `pm.before.20260606_203101.sql` restore; tam DB `hukuk_db.full.20260606_203101.dump`. (Repo geri alınırsa dev de geri alınmalı — hizayı koru.)

## Açık backlog (cutover sonrası — sıradaki işler)
- **Money float64 → bigint** (determinizm; analiz çıktısı).
- **`@hukuk/legal-time` paketi** (temporal semantics).
- **INTEREST_POLICY_ASSIGNED emit** (doc 14, Sprint 2C — `case.service`'te emit yok).
- **Bridge kaldırma** (v28 threading tamamlanınca — spec 15).
- **aggregate-version gap** (`v28-timeline-aggregate-version-gap` — v28 addEntry aggregateVersion sağlamıyor).
- Detay/öncelik: `SESSION-LOG-2026-06-05.md` §C + §E; ertelenenler `90-future-work/deferred/`.

## Merge edilen işler
- PR #1 — payment tenant isolation (x-tenant-id fallback kaldırıldı + timeline tenantId forward-only).
- PR #2 — sd-25 bayat test düzeltmesi.
- (Detay: `SESSION-LOG-2026-06-05.md` §A.)

## Doc 16 özeti
- **A1 squash-baseline.** Proof **PASSED** (temp DB: 151 tablo / 5 fn / 8 trg / 24 integration).
- **Clone rehearsal PASSED** (doc 16 §12, 2026-06-06, klon `hukuk_cutover_clone`): 151/5/8, 24/24 integration, rollback metadata restore OK, dev DB untouched, temp temizlendi.
- Cutover planı §10; klon prova planı §11; klon prova sonucu §12.
- **Cutover TÜM FAZLAR TAMAMLANDI (A → C → D Blok 1 → D Blok 2). main `08f9af7`. SIRADAKİ ADIM: açık backlog (yukarıda).**

## Kırmızı çizgiler (kalıcı disiplin)
- Gerçek prod DB yok · DB/migration işi önce klon/temp prova → plan-review → ayrı onay · db push hack yok · `migrate deploy` hedefinden sapma yok · dev'de `migrate dev` yok (resolve kullanılır) · gate'li ilerle (her riskli adım ayrı onay).

## Detay nerede (tek kaynak)
- Kronoloji + kararlar + meta-bulgular + açık debt → **`SESSION-LOG-2026-06-05.md`**
- Tam migration baseline + cutover + klon prova planı → **`16-prisma-migration-baseline.md`**
- Cutover execution faz planı (A/B/C/D + gate'ler) → **`17-cutover-execution-plan-review.md`**
- Mimari hafıza ilkeleri → **`92-architectural-memory.md`**
- Ertelenen işler → **`90-future-work/deferred/`**
