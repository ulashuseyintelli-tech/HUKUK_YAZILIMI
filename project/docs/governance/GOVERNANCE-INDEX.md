# GOVERNANCE INDEX — Okuma Sırası ve Belge Haritası

```text
Belge yolu : project/docs/governance/GOVERNANCE-INDEX.md
Durum      : RATIFIED / CANONICAL
Rol        : Routing/discovery katmanıdır; semantic veya execution authority üretmeden
             görev için hangi canonical kaynağın hangi sırayla okunacağını gösterir.
```

## RELATED DOCUMENTS

- Üst çatı: `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Ajan baseline: `AGENTS.md` (repo kökü) + `CLAUDE.md` (Claude supplement)
- Ratifiye domain governance: `project/docs/governance/DEBTOR-GOVERNANCE.md` ve
  `project/docs/governance/RECEIVABLE-GOVERNANCE.md`

## 1. Zorunlu okuma sırası (her yeni görev)

```text
Yeni görev
→ AGENTS.md                                   (execution ve repository-safety authority)
→ GOVERNANCE-INDEX.md                         (routing/discovery; authority değildir)
→ SYSTEM-CONSTITUTION.md                      (system-wide semantic authority)
→ İlgili TÜM RATIFIED / CANONICAL             (cross-domain görevde tek belge seçilmez;
  Domain Law / domain governance               ilgili bütün domain belgeleri okunur)
→ İlgili contract / standard                  (varsa; domain belgesinin RELATED DOCUMENTS listesinden)
→ Architecture Index → ilgili ADR             (architecture-index.md → project/docs/adr/)
→ Canonical split plan                        (varsa)
→ decision-log.md                             (son owner kararları ve supersession kayıtları)
→ Master Register                             (product-backlog.md, master-triage-register.md,
                                               active-roadmap.md — görev ID/durum kontrolü)
→ Pre-implementation consistency check        (scope, authority, invariant, status ve gate kontrolü)
→ Implementation                              (yalnız GO yetkisi + izole worktree ile)
```

`GOVERNANCE-INDEX.md` yalnız routing/discovery katmanıdır; Constitution, Domain Governance,
ADR, owner kararı veya execution izni yerine geçmez. Belge haritasında statüsü açıkça
`RATIFIED` / `CANONICAL` olan domain governance belgeleri binding seçim yüzeyidir.
`PROPOSED`, `DRAFT` veya `OWNER REVIEW` belgeleri kendiliğinden authority üretmez.

Kural: Sıradaki bir belge görev alanıyla ilgisizse atlanabilir. Cross-domain görevde ilgili
tek domain belgesi seçilemez; görevle ilişkili bütün ratified/canonical domain governance
belgeleri ve Master Register birlikte doğrulanır. Yeni domain governance belgesi ratifiye
edilip canonical belge haritasına alındığında aynı discovery kuralına otomatik olarak dahil olur.

Decision Log son owner kararlarını ve supersession kayıtlarını taşır; kayıt tarihi tek başına
üstün norm üretmez. Daha yeni bir Decision Log kaydı açık amendment, ratification veya
supersession olmadan System Constitution'ı ya da ratifiye Domain Governance'ı sessizce
override edemez.

Canonical kaynaklar arasında normatif çelişki tespit edilirse implementation durur ve yalnız
Governance Reconciliation önerilir. Çelişki tespiti tek başına doküman değiştirme, execution,
commit, merge, release veya runtime authority yetkisi oluşturmaz.

## 2. Belge haritası

| Belge | Rol | Durum |
|---|---|---|
| `AGENTS.md` (repo kökü) | agent execution ve repository-safety authority | AKTİF |
| `project/docs/governance/SYSTEM-CONSTITUTION.md` | system-wide semantic authority | RATIFIED / BINDING / CANONICAL |
| `project/docs/governance/GOVERNANCE-INDEX.md` | routing/discovery ve okuma sırası; authority değildir | RATIFIED / CANONICAL |
| `project/docs/governance/DEBTOR-GOVERNANCE.md` | ratifiye Debtor Domain Law | RATIFIED / BINDING / CANONICAL v1.0 (2026-07-12; PR #1139 MERGED) |
| `project/docs/governance/RECEIVABLE-GOVERNANCE.md` | ratifiye Receivable Domain Governance ve tek domain giriş noktası | RATIFIED / BINDING / CANONICAL v1.0 (2026-07-12; PR #1145 MERGED) |
| `project/docs/adr/` + `architecture-index.md` | teknik/mimari kararlar ve gerekçeleri | KAYITLI STATÜYE GÖRE |
| Implementation standards | code/API/test/deployment/operation conventions | BELGE STATÜSÜNE GÖRE |
| Roadmap / Master Register | work sequencing, owner gates ve closure state | AKTİF; authority/implementation izni üretmez |
| `project/docs/governance/README.md` | governance klasör tanımı ve dosya listesi | AKTİF |
| `project/docs/governance/decision-log.md` | kronolojik karar kaydı | AKTİF |
| `project/docs/governance/architecture-index.md` | repo ADR kütüğü indeksi | AKTİF |
| `project/docs/governance/product-backlog.md` | Product Backlog / Master Register | AKTİF |
| `project/docs/governance/master-triage-register.md` | triage/verification register | AKTİF |
| `project/docs/governance/active-roadmap.md` | aktif fazlar | AKTİF |
| `project/docs/governance/dbind-financial-authority-decisions.md` | finansal otorite kararları | AKTİF |
| `project/docs/analysis/debtor-master-synthesis-v2.md` | borçlu hattı kanıt/gerekçe katmanı (operasyonel değil) | KANIT — SUPERSEDED BY governance |
| Collection Governance | gelecek domain governance belgesi | REZERVE (henüz yazılmadı) |

## 3. Authority eksenleri

```text
Semantic authority:
SYSTEM-CONSTITUTION → Domain Law → ADR → Implementation

Execution and safety authority:
AGENTS.md + repository policies + task authorization + environment/tool restrictions
```

Bu eksenler tek doğrusal üstünlük sırası değildir. Semantic authority execution izni
vermez; execution authority domain semantiğini değiştirmez. Her görev iki eksene aynı
anda uymalıdır.

## 4. "Neden bu kural var?" zinciri

Bir governance kuralının gerekçesi arandığında iz şudur:

```text
DEBTOR-GOVERNANCE (kural, örn. INV-07)
→ Master Synthesis (project/docs/analysis/debtor-master-synthesis-v2.md — MS/DEC, MS/ADR, MS/FND kanıtı)
→ decision-log.md (ratifikasyon ve sonraki değişiklik kayıtları)

RECEIVABLE-GOVERNANCE (kural, örn. REC-INV-001)
→ İlgili ADR ve authority kayıtları (ADR-010, ADR-013, ADR-014 ve Master Register)
→ decision-log.md (ratifikasyon ve sonraki değişiklik kayıtları)
```
