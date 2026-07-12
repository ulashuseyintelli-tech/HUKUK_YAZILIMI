# GOVERNANCE INDEX — Okuma Sırası ve Belge Haritası

```text
Belge yolu : project/docs/governance/GOVERNANCE-INDEX.md
Durum      : RATIFIED — repository effect approved merge ile başlar.
Rol        : Yeni bir göreve başlayan ajanın hangi belgeyi hangi sırayla okuyacağını tanımlar.
```

## RELATED DOCUMENTS

- Üst çatı: `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Ajan baseline: `AGENTS.md` (repo kökü) + `CLAUDE.md` (Claude supplement)

## 1. Zorunlu okuma sırası (her yeni görev)

```text
Yeni görev
→ AGENTS.md                                   (execution ve repository-safety authority)
→ SYSTEM-CONSTITUTION.md                      (system-wide semantic authority)
→ İlgili Domain Law / domain governance       (borçlu hattı: DEBTOR-GOVERNANCE.md
                                               + Mandatory Pre-Task Checklist doldurulur)
→ İlgili contract / standard                  (varsa; domain belgesinin RELATED DOCUMENTS listesinden)
→ İlgili ADR                                  (architecture-index.md → project/docs/adr/)
→ decision-log.md                             (görev alanına dokunan son kararlar)
→ Master Register                             (product-backlog.md, master-triage-register.md,
                                               active-roadmap.md — görev ID/durum kontrolü)
→ Implementation                              (yalnız GO yetkisi + izole worktree ile)
```

Kural: Sıradaki bir belge görev alanıyla ilgisizse atlanabilir; domain governance belgesi ve
Master Register kontrolü hiçbir borçlu-hattı görevinde atlanamaz.

## 2. Belge haritası

| Belge | Rol | Durum |
|---|---|---|
| `AGENTS.md` (repo kökü) | agent execution ve repository-safety authority | AKTİF |
| `project/docs/governance/SYSTEM-CONSTITUTION.md` | system-wide semantic authority | RATIFIED — BINDING; repository-canonical upon approved merge |
| `project/docs/governance/GOVERNANCE-INDEX.md` | okuma sırası + belge/authority haritası | RATIFIED; repository effect approved merge ile başlar |
| `project/docs/governance/DEBTOR-GOVERNANCE.md` | ratifiye Debtor Domain Law | RATIFIED v1.0 (2026-07-12; PR #1139 MERGED) |
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
| Receivable Governance / Collection Governance | gelecek domain governance belgeleri | REZERVE (henüz yazılmadı) |

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
```
