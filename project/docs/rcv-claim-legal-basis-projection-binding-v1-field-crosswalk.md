# PB01 V1 Field Classification Crosswalk

Every `AUTHORITY_IDENTITY`, `DECISION_PROJECTION` and authority-validity
`TEMPORAL_CONTEXT` field below is pinned at admission, included in the binding
checksum, recomputed/revalidated at finalization and copied into the immutable
snapshot. No field is inferred from a label or a latest/current lookup.

| Field | Source | Classification | Pinned at Admission | Checksum Included | Revalidated at Finalization | Stored in Snapshot | Mutable Source | Failure Disposition |
|---|---|---|---|---|---|---|---|---|
| releaseId | exact Legal Basis release | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | IDENTITY_MISMATCH |
| releaseVersion | exact Legal Basis release | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | IDENTITY_MISMATCH |
| releaseChecksum | exact Legal Basis release | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | IDENTITY_MISMATCH |
| legalBasisCode | exact release entry | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | IDENTITY_MISMATCH |
| legalBasisVersion | exact release entry | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | IDENTITY_MISMATCH |
| legalBasisChecksum | exact release entry | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | IDENTITY_MISMATCH |
| registryId | SR01 registry | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | REGISTRY_MISMATCH |
| registryVersion | SR01 registry | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | REGISTRY_MISMATCH |
| registryChecksum | SR01 registry | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | REGISTRY_MISMATCH |
| subtypeCode | SR01 entry | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | SUBTYPE_MISMATCH |
| subtypeVersion | SR01 entry | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | SUBTYPE_MISMATCH |
| subtypeChecksum | SR01 entry | AUTHORITY_IDENTITY | YES | YES | YES | YES | YES | SUBTYPE_MISMATCH |
| canonicalComponentCategory | exact eligibility result | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| legalCharacter | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| legalBasisBinding | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| requiredSourceTypes | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| requiredEvidenceTypes | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| liabilityCompatibility | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| interestEligibility | SR01 entry + exact eligibility | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| amountSemantics | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| currencySemantics | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| calculationSemantics | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| allowedFormationPaths | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| forbiddenFormationPaths | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| admissionRequirements | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| finalizationRequirements | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| snapshotRequirements | SR01 entry | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| claimItemProjection.itemType | exact projection | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| claimItemProjection.interestAccrualStatus | exact projection | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| claimItemProjection.interestType | exact projection | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| claimItemProjection.interestRate | exact projection | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| claimItemProjection.interestStartDate | exact projection | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| claimItemProjection.interestStartDateProvenance | exact projection | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| claimItemProjection.isAllDebtorsLiable | exact projection | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| claimItemProjection.liableDebtorIds | exact projection | DECISION_PROJECTION | YES | YES | YES | YES | YES | PROJECTION_MISMATCH |
| authorityEffectiveAt | exact release entry | TEMPORAL_CONTEXT | YES | YES | YES | YES | YES | NOT_EFFECTIVE / PROJECTION_MISMATCH |
| authorityEffectiveUntil | exact release entry | TEMPORAL_CONTEXT | YES | YES | YES | YES | YES | NOT_EFFECTIVE / PROJECTION_MISMATCH |
| admittedAt | immutable intent `createdAt` | OBSERVATIONAL_METADATA | YES | NO | Used for admission-time validity | Existing snapshot `formationAt` | NO | INTENT_INTEGRITY_MISMATCH |
| localized labels/descriptions | UI/docs only | DISPLAY_ONLY | NO | NO | NO | NO | YES | NONE — not consumed |
| row/trace/request/log identifiers | persistence/observability | OBSERVATIONAL_METADATA | NO | NO | NO | NO | YES | NONE — not consumed |
