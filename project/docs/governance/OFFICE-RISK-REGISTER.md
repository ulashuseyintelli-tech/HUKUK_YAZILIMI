# OFFICE Risk Register — Domain Risk Dossier and Traceability Source

```text
Belge yolu : project/docs/governance/OFFICE-RISK-REGISTER.md
Durum      : DRAFT — NOT YET TRIAGED
Rol        : DOMAIN RISK DOSSIER AND TRACEABILITY SOURCE
             GLOBAL TRIAGE / EXECUTION STATUS SOURCE OF TRUTH DEĞİL
```

**Statü otoritesi ayrımı:** Risklerin global triage/çalışma durumu yalnız `project/docs/governance/master-triage-register.md`'den türetilir. Bu belgedeki `DOMAIN STATUS` alanı **`CANDIDATE / NOT YET TRIAGED`** veya **`TRIAGED (cross-ref)`** olabilir; `OPEN`/`CLOSED` yürütme statüsü bu belgede **hiçbir zaman** birincil kaynak değildir. Bu dosya hiçbir riski kendiliğinden global backlog'a eklemez, yetkilendirmez veya kapatmaz.

## RELATED DOCUMENTS

- Domain Law: `project/docs/governance/OFFICE-GOVERNANCE.md`
- Evidence/senaryo: `project/docs/governance/OFFICE-MASTER-SYNTHESIS.md`
- Owner decision dossier: `project/docs/governance/OFFICE-OWNER-DECISIONS.md`
- Global triage otoritesi: `project/docs/governance/master-triage-register.md`
- Yetkili iş sırası: `project/docs/governance/product-backlog.md`

**Evidence Status Legend** (`SYS-COMP-002`): `CONFIRMED` · `REVALIDATION_REQUIRED` · `UNVERIFIABLE` · `REFUTED`.

| RISK ID | TITLE | SEVERITY | DOMAIN STATUS | EVIDENCE STATUS | CURRENT CANONICAL EVIDENCE | TARGET CONTROL / DESIRED OUTCOME | RELATED OFF-INV | RELATED OFF/OD | GLOBAL TRIAGE REGISTER ID | PRODUCT BACKLOG ID | IMPLEMENTATION WORKSTREAM | LAST VERIFIED SHA | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| STF-PRD-BOLA-001 | Anonim/tenant-scope dışı takip-talebi PDF erişimi | P1 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok — bu workstream'de re-verify edilmedi | Object-scope evaluation tüm dosya erişim yollarında zorunlu | OFF-INV-05 | OFF/OD-08, OFF/OD-09 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | PR #1147 ile ilişkili olabilir; PR #1147 kendisi OFFICE kapsamı dışı (bkz. Master Synthesis §11) |
| STF-PRD-SES-001 | Offboarding sonrası login/session sürmesi | P1 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | Offboarding'de session/membership derhal kapanır | OFF-INV-06, OFF-INV-07 | OFF/OD-14, OFF/OD-15 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | SES-002 ile birlikte triage edilmeli |
| STF-PRD-RBAC-001 | Dekoratif/tutarsız role-permission enforcement | P2 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | Title/SystemRole/PermissionGrant ayrımı tutarlı uygulanır | OFF-INV-03 | OFF/OD-05, OFF/OD-09 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | — |
| STF-PRD-SCP-001 | Tenant içi object-level scope düz/eksik | P2 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | Object-scope evaluation manager/team kapsamını uygular | OFF-INV-05 | OFF/OD-08 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | — |
| STF-PRD-CFG-001 | Office configuration endpoint gate yetersizliği | P2 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | §13/§14 authorization zinciri office config'e tam uygulanır | OFF-INV-05 | — | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | Safe default available (candidate rapor) |
| STF-PRD-LIFE-001 | Lifecycle residue / kontrolsüz reactivation | P2 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | Reactivation grants otomatik restore etmez; rehire ayrı | OFF-INV-07 | OFF/OD-16, OFF/OD-17 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | — |
| STF-PRD-PRIV-001 | TCKN/IBAN maskesiz gösterim | P2 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | Maskeli varsayılan + field-level permission + export allowlist | OFF-INV-10 | OFF/OD-18 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | Owner policy required |
| STF-PRD-OPS-001 | Mock/bağlamsız metriklerin karar ekranında gösterimi | P2 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | Read model kaynağını açıklar, mock'u gerçek gibi sunmaz | OFF-INV-09 | OFF/OD-19 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | Safe default: remove/empty |
| STF-PRD-PERF-001 | getPersonelReport N+1 sorgu riski | P3 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | Sorgu performansı — mühendislik iyileştirmesi | OFF-INV-09 | — | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | Mühendislik/performans; domain invariant ihlali değil |
| STF-PRD-BOLA-002 | Task assignee uygunluk/scope doğrulama eksikliği | P3 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | Assignment/access ayrımı + eligibility kontrolü | OFF-INV-04 | OFF/OD-10 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | — |
| STF-PRD-DATA-001 | Uniqueness/cardinality yalnız application-check | P3 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | DB-level constraint (cardinality kararına bağımlı) | — | OFF/OD-01, OFF/OD-03 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | Cardinality kararına bağımlı |
| STF-PRD-SES-002 | JWT stale-authority penceresi | P3 | CANDIDATE / NOT YET TRIAGED | REVALIDATION_REQUIRED | Yok | Session/token revocation stratejisi uygulanır | OFF-INV-06 | OFF/OD-15 | NOT YET ASSIGNED | NOT YET ASSIGNED | NOT YET ASSIGNED | NONE | SES-001 ile birlikte ele alınmalı |

**STF-PRD-* toplam: 12.** Bu dosya hiçbir riski kendiliğinden global backlog'a eklemez, yetkilendirmez veya kapatmaz.
