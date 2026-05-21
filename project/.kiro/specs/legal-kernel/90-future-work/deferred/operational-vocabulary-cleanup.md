---
status: deferred
owner: ulas
review-trigger: "Faz 2 başlangıcı, ya da workflow/tebligat aggregate design başladığında"
depends-on: "Critical-path vocabulary canonicalize edilmeli (Faz 1)"
---

# Operational Vocabulary Cleanup

## Why deferred

Vocabulary Priority Rule (`03-vocabulary-unification.md`):

> Kernel-critical vocabulary must be canonicalized before aggregate design.  
> Operational vocabulary may remain provisional until later phases.

Operational vocabulary Money Truth Kernel'in başarı kriterini etkilemez. Faz 1'de cleanup bekletilir.

## Scope

Faz 2'de canonical source seçilecek concept'ler:

- `TaskStatus` + `Priority` (UI workflow, sorting)
- `UserRole` + `Plan` (auth/RBAC, billing)
- `ServiceStatus` / `ServiceChannel` / `ServiceReturnReason` (tebligat domain — Faz 2'de sealed artifacts pattern ile birlikte)
- `AddressType` / `DebtorRiskLevel` / `PublicInstitutionType` / `ThirdPartyType` (operational metadata)
- `EnforcementType` / `EnforcementStatus` (haciz domain — Faz 2)
- `WorkflowStage` (workflow orchestration — Faz 2)

## Trigger to start

- Faz 1 (critical-path vocabulary + aggregate boundaries + event taxonomy) tamamlandığında
- Veya: tebligat aggregate design başladığında (ServiceStatus o noktada kritik olur)
- Veya: workflow orchestration spec yazıldığında (WorkflowStage o noktada kritik olur)

## Risk if delayed

- Düşük (operasyonel concept'ler kernel'i etkilemiyor)
- Orta düzeyde "label drift" riski sürer (frontend her component'te local label map yazmaya devam edebilir) — CI gate yine de yeni eklenmeleri engeller

## What's NOT in scope

Bu cleanup **rename değil**, **canonical source** seçimi. Mevcut tanımlar yerlerinde kalır, sadece `@hukuk/domain`'den re-export edilirler.
