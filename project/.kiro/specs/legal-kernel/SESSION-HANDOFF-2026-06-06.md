---
status: active
review-trigger: "Yeni oturum başında ilk okunacak belge (kısa kart)"
date: 2026-06-06
purpose: "Start-here özeti. TEKRAR ETMEZ; detay için SESSION-LOG-2026-06-05.md ve 16-prisma-migration-baseline.md'ye referans verir."
---

# SESSION HANDOFF — Start Here

## Yeni oturum başlangıç prompt'u
> **"`92-architectural-memory.md` + `SESSION-HANDOFF-2026-06-06.md` + `16-prisma-migration-baseline.md` oku. Sıradaki iş: cutover execution planı (doc 16 §10). Kırmızı çizgi: gerçek dev/prod DB'ye dokunmadan plan göster; gerçek `prisma/migrations` değişmeden diff göster; CI PR #3 merge etme; db push hack yok."**

## Aktif branch & açık PR
- **Aktif:** `fix/prisma-migration-baseline` — origin'e push edildi, **HEAD `a6d62b6`'da senkron** (local == origin). Yalnızca belge commit'leri; migration/cutover kodu YOK.
- **Açık & KIRMIZI:** PR #3 `fix/ci-pr-gates` — `migrate deploy` temiz DB'de patlıyor; **migration baseline önkoşul.**

## Merge edilen işler
- PR #1 — payment tenant isolation (x-tenant-id fallback kaldırıldı + timeline tenantId forward-only).
- PR #2 — sd-25 bayat test düzeltmesi.
- (Detay: `SESSION-LOG-2026-06-05.md` §A.)

## Doc 16 özeti
- **A1 squash-baseline.** Proof **PASSED** (temp DB: 151 tablo / 5 fn / 8 trg / 24 integration).
- **Clone rehearsal PASSED** (doc 16 §12, 2026-06-06, klon `hukuk_cutover_clone`): 151/5/8, 24/24 integration, rollback metadata restore OK, dev DB untouched, temp temizlendi.
- Cutover planı §10; klon prova planı §11; klon prova sonucu §12.
- **SIRADAKİ ADIM: cutover execution (doc 16 §10) — ilk kez gerçek `prisma/migrations` + gerçek dev DB metadata teması, AYRI explicit onay gerektirir.**

## Kırmızı çizgiler
- Gerçek dev/prod DB yok (yalnız klon/temp) · repo `prisma/migrations`'a dokunma (cutover onayına kadar) · CI PR #3 merge yok · db push hack yok · `migrate deploy` hedefinden sapma yok.

## Detay nerede (tek kaynak)
- Kronoloji + kararlar + meta-bulgular + açık debt → **`SESSION-LOG-2026-06-05.md`**
- Tam migration baseline + cutover + klon prova planı → **`16-prisma-migration-baseline.md`**
- Mimari hafıza ilkeleri → **`92-architectural-memory.md`**
- Ertelenen işler → **`90-future-work/deferred/`**
