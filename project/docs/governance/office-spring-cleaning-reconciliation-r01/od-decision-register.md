# OFFICE Open-Decision Register

All records below remain `OWNER_DECISION_REQUIRED`. The recommendations reproduce the
safe defaults in `OFFICE-OWNER-DECISIONS.md`; this document does not select or ratify an
option.

| OD | Current question | Current implementation state / dependent capability | Options and recommendation | Principal impact | Execution order |
|---|---|---|---|---|---:|
| OFF/OD-02 | Can one UserAccount hold multiple tenant/org memberships? | target membership model not canonical; OFF-CAP-15 | A single tenant; B tenant-local multiple; C shared global role. **Recommend B** | security low; N:N data/migration low | 1 |
| OFF/OD-03 | Can one Person hold multiple Employments concurrently? | employment lifecycle incomplete; OFF-CAP-16 | A single; B one active per org, historical many; C unrestricted concurrent. **Recommend B** | HR/data medium; migration medium | 2 |
| OFF/OD-04 | Is external counsel/contractor a separate lifecycle? | deferred until business demand; OFF-CAP-16 | A same employment; B typed/scope-limited; C separate entity. **Recommend defer; if opened, B** | security medium; schema/runtime TBD | 3 |
| OFF/OD-06 | Is FoundingLawyer only a historical attribute? | bypass semantics not selected; OFF-CAP-17 | A active bypass role; B historical attribute/no bypass; C remove. **Recommend B** | security medium; migration low | 4 |
| OFF/OD-07 | Tenant to Organization/LawFirm cardinality? | org migration model not canonical; OFF-CAP-15 | A 1:1; B 1:N-capable initial model; C N:1. **Recommend B** | security/data/migration high | 5 |
| OFF/OD-12 | May one Person complete multiple approval levels? | multi-level separation not canonical; OFF-CAP-18 | A allow; B different Person absent exception; C founder/partner exception. **Recommend B** | security high; runtime medium | 6 |
| OFF/OD-13 | Which authority types can delegation cover? | delegation boundary not canonical; OFF-CAP-19 | A may expand; B never expands, approval delegation separate; C full transfer. **Recommend B** | security high; data/migration medium | 7 |
| OFF/OD-16 | Offboarding: revoke or reassignment first? | orchestration not canonical; OFF-CAP-20 | A reassign then revoke; B immediate privileged freeze/revoke then controlled reassignment; C parallel. **Recommend B** | security high; operational continuity medium | 8 |
| OFF/OD-19 | What may workload metrics be used for? | workload V2 purpose not canonical; OFF-CAP-23 | A direct performance evaluation; B planning only, never sole personnel evaluation; C remove. **Recommend B** | legal/HR/product policy; migration none | 9 |

## Decision grouping

```text
GROUP 1  Identity / organization cardinality       OD-02, OD-03, OD-04, OD-07
GROUP 2  Authority / delegation / offboarding      OD-06, OD-12, OD-13, OD-16
GROUP 3  Workload purpose                          OD-19
```

The owner may decide these in a dedicated pack, but implementation remains a separate
task and authority gate. No default above is executable authority.
