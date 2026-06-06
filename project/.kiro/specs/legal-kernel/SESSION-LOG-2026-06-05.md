---
status: active
review-trigger: "Yeni oturum başında oku; iş ilerledikçe güncelle"
date: 2026-06-05
purpose: "Bu oturumun sürecini, kararlarını ve nerede kalındığını kalıcı kılar (Nothing disappears). Model belleği oturumlar arası taşınmaz; bilgi burada + repo'da yaşar."
---

# Session Log — 2026-06-05 (Security · CI · Migration Baseline)

> Yeni oturum başlangıç talimatı: **`92-architectural-memory.md` + bu belge + `16-prisma-migration-baseline.md`'yi oku.** Sıradaki iş: **klon prova (doc 16 §11).**

---

## A. Süreç (kronolojik kararlar)
1. **Genel analiz** → proje değerlendirildi: domain güçlü, ama (a) güvenlik açıkları, (b) Money float64, (c) cron dağıtık-kilit yok, (d) calc-preview şişkinliği, (e) tek-kaynak ihlalleri.
2. **legal-kernel okundu** → sistemin event-sourced çekirdeği zaten var ve kısmen üretimde; "formalize, not rewrite". Bayat audit'ler (PART-3/4, Yapilacaklar) gerçeği gizliyordu.
3. **Güvenlik bloğu (merged):** `payment-instruction` `x-tenant-id` header fallback'i kaldırıldı + `@UseGuards(JwtAuthGuard)`. Bayat audit'ler **SUPERSEDED** işaretlendi. (PR #1)
4. **Timeline tenant izolasyonu (merged):** `IcrabotTimelineEntry.tenantId` **nullable + forward-only** (Faz 1 kolon/index; Faz 2 writer'lar: A=header, B=v28 boundary+threading; bridge TODO'lu). **Faz 3 backfill / Faz 4 NOT NULL DÜŞÜRÜLDÜ** çünkü event log immutable (UPDATE trigger). Spec 13/14/15. (PR #1)
5. **sd-25 (merged):** CI'ı kıran pre-existing bayat test (REAL_MAPPER_UNAVAILABLE) → `ALL_SHADOW_ERROR_CODES` source-of-truth ile hizalandı. (PR #2)
6. **CI gate (PR #3, AÇIK-KIRMIZI):** test-suite'e postgres service + migrate + 3 legal-kernel integration suite (blocking) eklendi; push trigger `['*']→['**']` (slash'lı branch fix). **Blocked:** migrate deploy temiz DB'de patlıyor.
7. **Migration baseline (devam eden):** Kök neden = ~80-90 model (tüm 27 Icrabot dahil) `db push` ile kurulmuş, CREATE migration'ı yok → `migrate deploy` sıfırdan çalışmıyor. **Karar A1 (squash-baseline).** Proof PASSED (temp DB: 151 tablo/5 fn/8 trg/24 test). Cutover + klon prova planlandı (doc 16). **Sıradaki: klon prova.**

## B. Branch / PR durumu
| Branch | Durum |
|---|---|
| `main` | payment + sd-25 merged |
| `fix/payment-instruction-tenant-isolation` | ✅ PR #1 merged |
| `fix/sd-25-stale-closed-set` | ✅ PR #2 merged |
| `fix/ci-pr-gates` | 🔴 PR #3 **açık-kırmızı** (CI YAML + `docs/ci/pr-gates-impact-map.md`). migration baseline'ı bekliyor. |
| `fix/prisma-migration-baseline` | 🟡 **aktif çalışma branch'i**: deferred record + doc 16 (proof PASSED, cutover + klon prova planı). Henüz migration/cutover kodu YOK. |

## C. Yol haritası — nerede kaldık
1. **(SIRADAKİ) Klon prova** — doc 16 §11. Yalnız `hukuk_cutover_clone`; dev/prod + repo migrations dokunulmaz.
2. **Cutover execution** — doc 16 §10. Repo migrations red-line'ının gevşetilmesi + dev/prod resolve (klon-prova + yedek + checklist sonrası, ayrı onay).
3. **PR #3 rebase → CI yeşil → merge** (CI gate canlı). Cutover bunun önkoşulu.
4. **CI madde 2** (type-check 78-baseline gate) + **madde 3** (ci-7 security gate) — diff-first.
5. **Daha büyük backlog:** Money float64→bigint (determinizm), `@hukuk/legal-time` (temporal), doc 14 INTEREST_POLICY_ASSIGNED (Sprint 2C, case.service'te emit yok), CI'ın gerçek kapı olması.

## D. Meta-bulgular (kaybolmasın — bu oturumun sentezi)
- **legal-kernel bağımsızca yeniden türetildi** (sen+model, önceki ekip): mimari doğru = kararlı çekici. **Darboğaz tasarım değil, görünürlük + uygulama.**
- **Bayat-öncül tuzağı** tekrar ediyor (PART-3/4, Yapilacaklar). Kaynağı SUPERSEDED'lendi; her oturum önce `92-architectural-memory`'yi okumalı.
- **"Infrastructure/analysis became measurable progress"** = platform-tilt riski; çevre (calc-preview) aşırı-mühendislik, çekirdek kırılgan.
- **bus-factor = 1** (sen: ürün+hukuk+dev). Belgeler şematik/imzalanabilir olmalı.
- **CI'ın değeri kanıtlandı:** lokal dev'in gizlediği iki gerçek kusuru yakaladı — sd-25 bayat test + migration-completeness.
- **Disiplin tuttu:** "hack yok, düzgün yap" (A1 > db-push hack; forward-only > trigger-bypass; squash > pre-ALTER kurcalama).

## E. Açık debt (kayıt: `90-future-work/deferred/`)
- `v28-timeline-aggregate-version-gap.md` — v28 addEntry aggregateVersion sağlamıyor.
- `prisma-migration-completeness-gap.md` — bu işin kendisi (devam ediyor).
- Bridge kaldırma (v28 threading tamamlanınca) — spec 15.
- Money float→bigint, `@hukuk/legal-time` — büyük analiz çıktıları.

## F. Çalışma disiplini (bu oturumda uygulanan, sürdürülmeli)
- Koddan önce **etki alanı haritası** (CLAUDE.md).
- **Diff-first**: plan → onay → uygulama.
- **Klon/temp-önce**: dev/prod/gerçek-repo'ya dokunmadan prova.
- Her değişiklik **ayrı branch + scoped commit**; `git add .` yerine scoped add.
- Pre-existing kusurlar **ayrı branch/deferred** (scope karıştırma).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## G. Cutover execution checkpoint (2026-06-06, ek)
- **Klon prova ✅ PASSED** (doc 16 §12): `hukuk_cutover_clone`, 151/5/8, 24/24, rollback OK, dev untouched.
- **Cutover plan review ✅** (doc 17): A/B/C/D fazları + gate'ler. Arşiv hedefi `prisma/migrations-archive/` (root dışı, düzeltildi).
- **Faz A (repo cutover) ✅ COMMITTED + PUSHED** — `30a0e25`. 19 eski migration → `migrations-archive/` (git mv); yeni zincir baseline (151) + legal_kernel_triggers (5fn/8trg). schema.prisma & lock değişmedi.
- **Faz C (dev metadata) ✅ PASS** — `hukuk_db._prisma_migrations` 19 → 2 (resolve --applied + eski 19 DELETE). `migrate status` up to date. Şema/veri değişmedi (152/5/8). Yedek `_fazC_backup/20260606_203101/` (pm.before 19 INSERT + tam dump). Tek tek gate'li ilerlendi (C0→C1→C2→C3/C4).
- **Sıradaki:** Faz D (temiz DB deploy doğrulaması + PR #3 rebase/merge) — ayrı onay.

**Son commit (bu branch):** `docs/prisma(legal-kernel): squash prisma migrations into baseline` (`30a0e25`). **Sıradaki:** cutover Faz D (doc 17).
