# Process Rules

Bu dosya `AGENTS.md`'nin **açıklama, örnek ve şablon katmanıdır**. Normatif authority
üretmez ve `AGENTS.md`'yi override edemez.

Bir hüküm doğrudan ajan davranışını veya authority sınırını belirliyorsa canonical evi
`AGENTS.md`'dir ve burada yeniden kurulmaz; yalnız ilgili bölüme referans verilir.
Çelişki halinde `AGENTS.md` uygulanır ve çelişen kayıt düzeltilmek üzere raporlanır.

| Konu | Canonical ev |
|---|---|
| Otorite zinciri, operational/semantic authority ayrımı | `AGENTS.md` §1 |
| Modül routing | `AGENTS.md` §2 |
| Ground-truth, temel ilkeler, Session Initialization zorunluluğu | `AGENTS.md` §3 |
| Çalışma modları, `IF IMPLEMENT`, merge authority, scope expansion, backlog akışı | `AGENTS.md` §4 |
| CI takip ve merge disiplini | `AGENTS.md` §5 |
| Worktree izolasyonu (developer workstation policy) | `AGENTS.md` §6 |
| Uygulama kuralları ve ön analiz | `AGENTS.md` §9 |
| Validation | `AGENTS.md` §10 |
| Raporlama ve `Onay Bekleniyor` semantiği | `AGENTS.md` §13 |
| Stop condition'lar | `AGENTS.md` §14 |
| Worktree/branch cleanup mekaniği | `project/docs/runbooks/worktree-cleanup.md` |
| Claude'a özgü delta (dil, çalışma seviyesi önerisi, slider) | `CLAUDE.md` |

Aşağıdaki bölümler yalnız şablon, örnek ve rehberlik sağlar.

## Session Initialization şablonu

`AGENTS.md` §3 büyük veya uzun ömürlü workstream'lerde Session Initialization özetini
zorunlu kılar. Kullanılacak şablon:

```text
SESSION INITIALIZATION

Workspace Module(s):

Repository State:
- Branch:
- HEAD:
- Working tree:
- Main / origin-main:

Execution Context:
- Requested mode:
- Bounded context:
- Allowed scope:

Context Drift:
- Conversation assumptions re-verified:
- Concurrent commits:
- Relevant upstream/local changes:
- Requires re-analysis:

Concurrent Activity:
- Untracked/user WIP:
- Other active branch/worktree signal:
- PR/CI state if relevant:

Readiness:
- Ready / Not Ready:
- Reason:
```

Bu özet tam rapor değildir; işe başlamadan önce repository-first durumunu hızlı görünür
kılan kısa güvenlik kontrolüdür.

## Çalışma modları — okuma notu

Modların normatif tanımı, gate'leri ve merge authority semantiği `AGENTS.md` §4'tedir.
Aşağıdaki not yalnız hatırlatmadır ve yeni hüküm kurmaz.

`GO-ANALYZE` Explicit read-only moddur; dosya değişikliği, commit, PR veya merge yoktur.
`GO-IMPLEMENT` local patch + validation ile sınırlıdır. `GO-COMPLETE — ANALYZE-FIRST
CONDITIONAL EXECUTION` implementation-eligible görevlerde tercih edilen tam yürütme
modelidir ve analiz ayrı bir owner turu değildir.

Merge authority yalnız `AGENTS.md` §4'te tanımlanan explicit task-bounded owner closeout
authority'sidir. "devam", "uygula", kapsam seçimi, tasarım onayı veya commit/push/PR izni
tek başına merge authority üretmez.

## Lane Ownership: Analysis Owner ≠ Implementation Owner

Analiz/review sahipliği ile implementation/execution sahipliği farklı kavramlardır; biri
diğerini ima etmez. Bir workstream'in analizini bir ajanın yapmış olması implementation
lane'inin de o ajanda olduğu anlamına gelmez; tersi de geçerlidir (ör. Analysis: Claude /
Implementation: Codex veya Analysis: Codex / Implementation: Claude).

- Her workstream, lane kararı ve execution-lane governance kaydında iki sahiplik ayrı ve
  açık yazılır:

```text
Analysis / Review Owner : <ajan>
Implementation Owner    : <ajan>
```

- Lane devri normaldir ve ayrı owner kararıyla kaydedilir; devredilen eski kayıt gerçekleşmiş
  owner kararı olarak silinmez, `SUPERSEDED BY <yeni kayıt>` işaretlenir.

Kaynak: COL/OD-18A (`decision-log.md` § `2026-07-15 — RC-COL / COL/OD-18A`).

## Waiting & Progress Policy

Bir görev dışsal bir bağımlılıkla (CI, başka worktree'nin WIP'i, PR review, owner
deploy/karar bekleyişi) bloklandığında ajan doğrudan pasif beklemeye geçmez; önce onaylı
kapsam içinde güvenli ilerlemeyi maksimize eder. Tam politika ve üç katmanlı model
(Active Progress / Parallel Preparation / Passive Wait) için bkz.
`project/docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md`.

ADR-012 yalnız "beklerken ne yapılır"ı tanımlar; "ne zaman durulur" `AGENTS.md` §5 ve
§14'te kalır.

## Backlog Review

Her faz sonunda Backlog Review zorunludur. Bağımlılığı tamamlanan maddeler için
`BACKLOG → READY` önerisi raporlanır. Akışın kendisi `AGENTS.md` §4'tedir.

## Required Report Ending

```text
══════════════════════════════

NEXT RECOMMENDED STEP

Aktif Faz:

Önerilen Sonraki İş:

Backlog Review Gerekli mi?
YES / NO

READY Durumuna Geçen Maddeler:

Yeni Eklenen Product Backlog Maddeleri:

Bekleyen Mimari Kararlar:

══════════════════════════════
```

## Çağrılma listesi yorum şablonu

`AGENTS.md` §9 yeni servis metodu veya controller action yazarken çağrılma listesinin
yorumda tutulmasını zorunlu kılar. Kullanılacak biçim:

```ts
/**
 * Cagrildigi yerler:
 * - {Controller/Servis}.{Metod}() -> {HTTP METHOD} {endpoint} ({aciklama})
 * - {Servis}.{Metod}() -> {aciklama}
 */
```

Mevcut bir metot değiştirilirken liste kontrol edilip güncellenir.

## DB-gated integration test prosedürü

`AGENTS.md` §10 production veya local development veritabanına karşı test koşulmasını
yasaklar. İzlenecek sıra:

```text
disposable Docker PostgreSQL container ayaga kaldir
migration bu container uzerinde calistir
integration test bu container uzerinde kos
PASS olmadan PR acma
test tamamlaninca container istege bagli silinebilir
```

Container imajı repository'nin pinlediği PostgreSQL sürümüyle aynı olmalıdır.

## Worktree / Branch Cleanup

Normatif çekirdek `AGENTS.md` §6'dadır: canonical root'ta mutation yasağı, isolated
worktree zorunluluğu, fiziksel recursive silme yasağı, `ORPHANED_WORKTREE_DIR` fail-safe
davranışı ve branch silmeden önce `gh` ile PR merge doğrulaması.

Bağlayıcı mekanik prosedür — junction/hardlink riski, worktree sınıflandırma tablosu,
`remove`/`prune` sırası, canonical integrity checklist, `.git/config` torn-write recovery
ve incident geçmişi — canonical runbook'tadır:
`project/docs/runbooks/worktree-cleanup.md`.
