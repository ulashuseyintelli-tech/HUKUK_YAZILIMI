# ADR-012: Waiting & Progress Policy (DX-005)

**Status:** Accepted
**Date:** 2026-07-09
**Deciders:** Ulaş Hüseyin Telli (owner)
**Related:** `process-rules.md` (CI WAIT / POLLING RULE), `AGENTS.md` §8 (bounded-context / scope discipline)

## Context

Bugüne kadar ajan davranışı, dışsal bir bağımlılıkla (CI, başka bir worktree'nin WIP'i, PR review, owner deploy/karar bekleyişi) karşılaştığında tek bir kalıba düşüyordu: durup pasif olarak beklemek. Bu, iki ayrı sorunu birbirine karıştırıyordu:

1. **Ne zaman durulacağı** — bu zaten `process-rules.md`'deki CI WAIT / POLLING RULE ile kodlanmış durumda (60 sn polling, 20 dk max bekleme, `FAIL`/timeout/`mergeStateStatus` stop condition'ları). Bu ADR'nin kapsamı **dışındadır**, değiştirilmez.
2. **Beklerken ne yapılacağı** — bu hiç kodlanmamıştı. Ajan bloklandığında, aynı görev kapsamında yapılabilecek güvenli hazırlık işleri varken bile "bekliyorum" diyip pasif kalıyordu.

İkinci sorunu çözerken ortaya yeni bir risk çıktı: "zaten bloklandım" gerekçesi, ajanın kendi inisiyatifiyle **farklı, ilgisiz bir workstream** başlatmasına kapı aralayabilir (ör. "başka worktree'de WIP var, ben de bağımsız bir DX işi başlatayım"). Bu, `AGENTS.md`'nin bounded-context/scope disiplinini (yeni fikir → triage → Product Backlog → READY → Active Roadmap → Implementation) doğrudan ihlal eder. Bu ADR, "beklerken üretken ol" ilkesini bu ihlale izin vermeyecek şekilde sınırlar.

## Decision

**Temel ilke:** Bloklandığında, ajan pasif beklemeyi önermeden önce onaylı kapsam içinde güvenli ilerlemeyi maksimize eder.

```text
When blocked, maximize useful progress within the approved scope
before recommending passive waiting.

Passive waiting is the last option.
An external blocker never authorizes scope expansion.
```

Politika üç katmandan oluşur:

### 1. Active Progress (Serbest — owner onayı gerekmez)

Mevcut görevin doğal uzantısı olan hazırlık işleri, blocker sürerken **doğrudan yapılır**, önerilmez. Örnekler:

- CI çalışırken PR açıklamasını / decision-log taslağını hazırlamak.
- Review beklenirken validation checklist'ini hazırlamak.
- Merge beklenirken Master Register diff'ini hazırlamak.
- Deploy beklenirken post-deploy doğrulama planını hazırlamak.
- Nihai raporu taslak olarak yazmak.

Kural: iş, mevcut görevin bounded context'i içinde kalıyorsa serbesttir.

### 2. Parallel Preparation (Öner — owner kararına bırakılır)

Ajan kendisi **başlatmaz**, yalnızca önerir. Örnekler:

- "Bu sırada Product Backlog'daki X maddesi üzerinde çalışılabilir."
- "Bağımsız bir governance işi açılabilir."
- "İstersen ayrı bir worktree'de backlog maddesi Y'ye başlayabiliriz."

Kural: bu, mevcut görevin kapsamı dışında farklı bir iştir; blocker bunu **meşrulaştırmaz**, yalnız görünür kılar. Başlatma kararı owner'a aittir.

### 3. Passive Wait (Son çare)

Katman 1 ve 2 tükendiğinde — yani hem yapılabilecek in-scope hazırlık kalmamış hem de owner bir paralel iş başlatmayı onaylamamışsa — ajan pasif beklemeye geçer ve mevcut CI WAIT / POLLING RULE (`process-rules.md`) uygulanır.

### Raporlama şekli

Ajan bir blocker'ı raporlarken "BLOCKED, bekliyorum" değil, **NEXT BEST ACTION** formatını kullanır: "X şu an mümkün değil çünkü Y. Bu sırada Z'yi yapabilirim/önerebilirim."

## Rejected Alternatives

### "Progress Maximization" — tek katmanlı, koşulsuz ilerleme

Reddedildi: "her koşulda ilerle" çerçevesi, ajana blokajı gerekçe göstererek scope genişletme baskısı yaratır. Üç katmanlı ayrım (özellikle Active Progress / Parallel Preparation farkı) bu riski kapatır.

### Politikayı AGENTS.md içine tam metin olarak yazmak

Reddedildi: `AGENTS.md` kısa/anayasa niteliğinde tutulmak isteniyor. Bunun yerine `AGENTS.md`'ye tek satır pointer eklenir, tam metin bu ADR'de kalır — `architecture-index.md`'nin zaten kullandığı pointer modeliyle tutarlı.

### Yeni bir "AI Development Playbook" dosya türü açmak

Reddedildi (şimdilik): Repo'da zaten kararlar için ADR + `architecture-index.md` pointer mekanizması var; yeni bir doküman kategorisi açmak mevcut governance modelini gereksiz yere çoğaltır. Playbook fikri kapsam dışı bırakıldı; ayrı triage/Product Backlog girişi bu ADR'nin kapsamında yapılmadı (bkz. Open Questions).

## Out of Scope

Bu ADR şunları **değiştirmez**:

- `process-rules.md` CI WAIT / POLLING RULE (60 sn / 20 dk / stop condition'lar) — aynen geçerli.
- Bounded-context / scope-genişletme disiplini (`AGENTS.md` §8) — bu ADR onu güçlendirir, gevşetmez.
- "Repository-native AI Architecture" (AGENTS.md/CLAUDE.md authority chain, `.agents/skills`, `.codex/` rolü, skill/hook lifecycle) — bu ayrı, daha büyük bir mimari eksen; bu ADR'nin kapsamına alınmadı, ayrı triage/Product Backlog maddesi olarak açıldı.
- Schema, migration, runtime, authorization, finansal davranış — hiçbiri etkilenmez (docs-only karar).

## Reconciliation Note

Bu ADR'nin ilk taslağı hazırlanırken, aynı fikrin bağımsız/paralel bir uygulaması zaten `main`'e merge edilmiş olduğu ortaya çıktı: PR #998 (commit `8d0de5cd`, 2026-07-09), `AGENTS.md`'ye "DX-005 / Progress Maximization Policy" adıyla, üç katmanlı ayrım olmadan, tam metin olarak eklenmişti. Bu ADR o eklemeyi ortadan kaldırmaz; onu **kanonikleştirir** — `AGENTS.md`'deki tam metin kısa bir pointer'a indirgenir, tam politika burada, üç katmanlı model ve yeniden adlandırmayla ("Progress Maximization" → "Waiting & Progress Policy") toplanır.

Bu, yeni bir mimari yetenek tanıtımı değildir; aynı kavramın iki paralel implementasyonunun tek kanonik çözüme indirgenmesidir. Repo metodolojisine eklenen ek ilke:

```text
Canonical reconciliation is not scope expansion.
```

İki paralel implementasyon aynı kavrama aitse, bunları tek otoriteye indirmek mevcut işin doğal kapsamıdır — yeni bir Product Backlog triage'ı gerektirmez.

## Open Questions

- "Repository-native AI Architecture" (AGENTS/CLAUDE.md authority chain, `.agents/skills`, `.codex/`, skill/hook lifecycle) ayrı bir workstream olarak kalır; bu ADR'nin veya bu reconciliation'ın kapsamına dahil edilmedi, Product Backlog triage'ı bu görevin dışında.
