# GOVERNANCE INDEX — Okuma Sırası ve Belge Haritası

```text
Belge yolu : project/docs/governance/GOVERNANCE-INDEX.md
Durum      : PROPOSED — owner talimatıyla oluşturuldu (2026-07-12).
             Taşıyan PR #1139 MERGED (squash 413890dd, 2026-07-12, CI 4/4 PASS), ancak
             PR merge'i belge metnini ratifiye ETMEZ; RATIFIED yalnız owner'ın bu belgenin
             metnini ayrıca onaylamasıyla (ayrı governance PR ile) gerçekleşir.
Rol        : Yeni bir göreve başlayan ajanın hangi belgeyi hangi sırayla okuyacağını tanımlar.
```

## RELATED DOCUMENTS

- Üst çatı: `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Ajan baseline: `AGENTS.md` (repo kökü) + `CLAUDE.md` (Claude supplement)

## 1. Zorunlu okuma sırası (her yeni görev)

```text
Yeni görev
→ AGENTS.md                                   (ajan baseline; CLAUDE.md supplement)
→ SYSTEM-CONSTITUTION.md                      (governance çatısı)
→ İlgili domain governance                    (borçlu hattı: DEBTOR-GOVERNANCE.md
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
| `AGENTS.md` (repo kökü) | tüm ajanlar için zorunlu baseline | AKTİF |
| `project/docs/governance/SYSTEM-CONSTITUTION.md` | governance çatısı ve hiyerarşi | PROPOSED (metin ratifikasyonu bekliyor; PR #1139 MERGED) |
| `project/docs/governance/GOVERNANCE-INDEX.md` | okuma sırası + belge haritası | PROPOSED (metin ratifikasyonu bekliyor; PR #1139 MERGED) |
| `project/docs/governance/DEBTOR-GOVERNANCE.md` | borçlu hattı kanonik operasyonel referans | RATIFIED v1.0 (2026-07-12; PR #1139 MERGED) |
| `project/docs/governance/README.md` | governance klasör tanımı ve dosya listesi | AKTİF |
| `project/docs/governance/decision-log.md` | kronolojik karar kaydı | AKTİF |
| `project/docs/governance/architecture-index.md` | repo ADR kütüğü indeksi | AKTİF |
| `project/docs/governance/product-backlog.md` | Product Backlog / Master Register | AKTİF |
| `project/docs/governance/master-triage-register.md` | triage/verification register | AKTİF |
| `project/docs/governance/active-roadmap.md` | aktif fazlar | AKTİF |
| `project/docs/governance/dbind-financial-authority-decisions.md` | finansal otorite kararları | AKTİF |
| `project/docs/analysis/debtor-master-synthesis-v2.md` | borçlu hattı kanıt/gerekçe katmanı (operasyonel değil) | KANIT — SUPERSEDED BY governance |
| Receivable Governance / Collection Governance | gelecek domain governance belgeleri | REZERVE (henüz yazılmadı) |

## 3. "Neden bu kural var?" zinciri

Bir governance kuralının gerekçesi arandığında iz şudur:

```text
DEBTOR-GOVERNANCE (kural, örn. INV-07)
→ Master Synthesis (project/docs/analysis/debtor-master-synthesis-v2.md — MS/DEC, MS/ADR, MS/FND kanıtı)
→ decision-log.md (ratifikasyon ve sonraki değişiklik kayıtları)
```
