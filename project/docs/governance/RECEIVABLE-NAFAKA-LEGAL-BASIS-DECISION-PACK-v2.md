# Receivable Nafaka Legal Basis Decision Pack v2

This file is the immutable semantic preimage for the claim-level nafaka Legal Basis
decision. It does not activate a runtime, create a production signature, authorize
historical reclassification, or authorize a UYAP implementation.

The former `DECISION-PACK-v1` reference and its reported SHA-256 are
`UNVERIFIABLE / NOT USABLE`: the exact preimage is not present in the canonical
repository. This v2 pack is a new decision, not a reconstruction of v1.

## Authority boundary

- `Receivable` owns claim-formation semantics and the exact Legal Basis release.
- `UYAP` is a future consumer only.
- Every entry below forms only a claim-level nafaka principal.
- Interest, fees, costs, enforcement expenses and attorney fees require their own
  independently ratified Legal Basis/component authority.
- `CaseSubCategory.NAFAKA`, `DueType.NAFAKA`, legacy labels and caller-supplied codes
  are not Legal Basis authority.
- Runtime remains dormant and default-off.

## Official-source method

The Turkish Civil Code article text was checked against the official TBMM accepted-law
text and the legal meaning was cross-checked against official Constitutional Court
decisions where an applicable decision was available. The TBMM accepted-law text is
retained as the primary statutory source but is not treated as proof of later amendment
history by itself. Formation therefore remains fail-closed on exact source-document,
effective-date and enforceability evidence.

<!-- DECISION_PACK_JSON_BEGIN -->
```json
{
  "authorityBoundary": {
    "collectionAuthority": "NONE",
    "runtimeActivation": "NOT_AUTHORIZED",
    "uyapRole": "FUTURE_CONSUMER_ONLY"
  },
  "decisionPackId": "RECEIVABLE-NAFAKA-LEGAL-BASIS-DECISION-PACK",
  "decisionPackVersion": 2,
  "effectiveAt": "2026-08-01T00:00:00Z",
  "entries": [
    {
      "admissionRequirements": [
        "Exact enforceable interim court order source identity version and fingerprint",
        "Exact order-effective interval and installment due date",
        "Exact claimant debtor and case scope",
        "Exact liability type and opaque liable-debtor references",
        "Positive principal amount in integer minor units"
      ],
      "allowedFormationPaths": [
        "CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION"
      ],
      "amountSemantics": {
        "installmentGrain": "ONE_CLAIM_ITEM_PER_EXACT_DUE_INSTALLMENT",
        "minorUnitRepresentation": "POSITIVE_INTEGER_STRING",
        "periodAggregation": "ONLY_CHECKSUMMED_REPRODUCIBLE_SCHEDULE",
        "semanticAuthority": "EXACT_ENFORCEABLE_SOURCE_AMOUNT"
      },
      "calculationSemantics": {
        "indexationFallback": "PROHIBITED",
        "prorationFallback": "PROHIBITED",
        "rule": "NO_AMOUNT_INFERENCE_OR_RECALCULATION",
        "sourceAmountDerivation": "EXACT_INTERIM_ORDER_AND_INSTALLMENT_SCHEDULE"
      },
      "canonicalComponentCategory": "PRINCIPAL",
      "currencySemantics": {
        "conversion": "PROHIBITED",
        "currencyAuthority": "EXACT_ENFORCEABLE_SOURCE",
        "minorUnitAuthority": "ISO_CURRENCY_MINOR_UNIT"
      },
      "displayName": "Tedbir Nafakası Asıl Alacağı",
      "effectiveFrom": "2026-08-01T00:00:00Z",
      "effectiveUntil": null,
      "finalRatifier": {
        "identity": "Av. Ulaş Hüseyin Telli",
        "ratifierCode": "TELLI-FINAL-LEGAL-RATIFIER-01",
        "role": "OWNER / FINAL LEGAL RATIFIER"
      },
      "finalizationRequirements": [
        "Revalidate exact Legal Basis release version entry checksum and effective interval",
        "Revalidate exact interim-order source version fingerprint enforceability and due installment",
        "Revalidate tenant case claimant debtor and liability-context hash",
        "Persist ClaimItem immutable formation snapshot audit and outbox atomically"
      ],
      "forbiddenFormationPaths": [
        "CASE_SUBCATEGORY_NAFAKA_AUTHORITY",
        "CURRENT_LATEST_OR_DEFAULT_RESOLUTION",
        "DIRECT_CLAIM_ITEM_WRITE",
        "DUETYPE_NAFAKA_AUTHORITY",
        "GENERIC_PRINCIPAL_FALLBACK",
        "HISTORICAL_RECLASSIFICATION",
        "INTEREST_OR_COST_INFERENCE",
        "LEGACY_CODE_AUTHORITY"
      ],
      "interestEligibility": {
        "automaticInterest": false,
        "formationProjection": "UNKNOWN",
        "rule": "SEPARATE_EXACT_LEGAL_BASIS_AND_INTEREST_POLICY_REQUIRED"
      },
      "legalBasisBindings": {
        "allowedLegalBasisCodes": [
          "TMK_169"
        ],
        "bindingMode": "EXACTLY_ONE",
        "requiredLegalBasisCodes": [
          "TMK_169"
        ]
      },
      "legalCharacter": "INTERIM_MAINTENANCE_PRINCIPAL",
      "legalMeaning": "A fixed and due principal installment created only by an exact enforceable interim measure under TMK 169; it does not include interest or costs.",
      "liabilityCompatibility": {
        "allowedLiabilityTypes": [
          "KISMI",
          "SINIRLI",
          "TAM"
        ],
        "implicitAllDebtors": "PROHIBITED",
        "scope": "EXACT_SOURCE_BOUND_DEBTOR_RELATIONSHIP"
      },
      "lifecycleStatus": "RATIFIED_DORMANT",
      "productionSigner": {
        "signatureStatus": "PENDING_NOT_EXECUTED",
        "signerId": "TELLI-PROD-LEGAL-01",
        "role": "PRODUCTION_RELEASE_SIGNER"
      },
      "requiredEvidenceTypes": [
        "CLAIMANT_IDENTITY_EVIDENCE",
        "DEBTOR_IDENTITY_EVIDENCE",
        "EXACT_DUE_DATE_EVIDENCE",
        "EXACT_INSTALLMENT_AMOUNT_EVIDENCE",
        "INTERIM_ORDER_ENFORCEABILITY_EVIDENCE",
        "LIABILITY_CONTEXT_HASH",
        "SOURCE_EFFECTIVE_INTERVAL_EVIDENCE"
      ],
      "requiredSourceTypes": [
        "INTERIM_COURT_ORDER"
      ],
      "reviewer": {
        "identity": "Av. Fatma Uluca Telli",
        "ratifierCode": "TELLI-LEGAL-REVIEWER-01",
        "role": "LEGAL DOMAIN OFFICER / LEGAL REVIEWER",
        "signatureStatus": "PENDING_NOT_EXECUTED"
      },
      "snapshotRequirements": [
        "Decision-pack identity version and checksum",
        "Exact Legal Basis release identity version entry checksum and source references",
        "Exact document source identity version fingerprint enforceability and effective interval",
        "Exact amount currency due date claimant debtor case and liability-context hash"
      ],
      "subtypeCode": "INTERIM_MAINTENANCE",
      "subtypeVersion": 1,
      "supersededBy": null,
      "supersedes": []
    },
    {
      "admissionRequirements": [
        "Exact enforceable judgment or agreement source identity version and fingerprint",
        "Exact child-beneficiary and liable-parent identities",
        "Exact installment amount currency and due date",
        "Exact liability type and opaque liable-debtor references",
        "Positive principal amount in integer minor units"
      ],
      "allowedFormationPaths": [
        "CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION"
      ],
      "amountSemantics": {
        "installmentGrain": "ONE_CLAIM_ITEM_PER_EXACT_DUE_INSTALLMENT",
        "minorUnitRepresentation": "POSITIVE_INTEGER_STRING",
        "periodAggregation": "ONLY_CHECKSUMMED_REPRODUCIBLE_SCHEDULE",
        "semanticAuthority": "EXACT_ENFORCEABLE_SOURCE_AMOUNT"
      },
      "calculationSemantics": {
        "indexationFallback": "PROHIBITED",
        "prorationFallback": "PROHIBITED",
        "rule": "NO_AMOUNT_INFERENCE_OR_RECALCULATION",
        "sourceAmountDerivation": "EXACT_JUDGMENT_OR_ENFORCEABLE_AGREEMENT_SCHEDULE"
      },
      "canonicalComponentCategory": "PRINCIPAL",
      "currencySemantics": {
        "conversion": "PROHIBITED",
        "currencyAuthority": "EXACT_ENFORCEABLE_SOURCE",
        "minorUnitAuthority": "ISO_CURRENCY_MINOR_UNIT"
      },
      "displayName": "İştirak Nafakası Asıl Alacağı",
      "effectiveFrom": "2026-08-01T00:00:00Z",
      "effectiveUntil": null,
      "finalRatifier": {
        "identity": "Av. Ulaş Hüseyin Telli",
        "ratifierCode": "TELLI-FINAL-LEGAL-RATIFIER-01",
        "role": "OWNER / FINAL LEGAL RATIFIER"
      },
      "finalizationRequirements": [
        "Revalidate exact Legal Basis release version entry checksum and effective interval",
        "Revalidate exact source version fingerprint beneficiary debtor enforceability and due installment",
        "Revalidate tenant case object scope and liability-context hash",
        "Persist ClaimItem immutable formation snapshot audit and outbox atomically"
      ],
      "forbiddenFormationPaths": [
        "CASE_SUBCATEGORY_NAFAKA_AUTHORITY",
        "CURRENT_LATEST_OR_DEFAULT_RESOLUTION",
        "DIRECT_CLAIM_ITEM_WRITE",
        "DUETYPE_NAFAKA_AUTHORITY",
        "GENERIC_PRINCIPAL_FALLBACK",
        "HISTORICAL_RECLASSIFICATION",
        "INTEREST_OR_COST_INFERENCE",
        "LEGACY_CODE_AUTHORITY"
      ],
      "interestEligibility": {
        "automaticInterest": false,
        "formationProjection": "UNKNOWN",
        "rule": "SEPARATE_EXACT_LEGAL_BASIS_AND_INTEREST_POLICY_REQUIRED"
      },
      "legalBasisBindings": {
        "allowedLegalBasisCodes": [
          "TMK_182_2",
          "TMK_327_330"
        ],
        "bindingMode": "EXACTLY_ONE_OF",
        "requiredLegalBasisCodes": []
      },
      "legalCharacter": "MINOR_CHILD_MAINTENANCE_PRINCIPAL",
      "legalMeaning": "A fixed and due child-maintenance principal installment under an exact enforceable source compatible with TMK 182/2 or TMK 327-330; it does not include interest or costs.",
      "liabilityCompatibility": {
        "allowedLiabilityTypes": [
          "KISMI",
          "SINIRLI",
          "TAM"
        ],
        "implicitAllDebtors": "PROHIBITED",
        "scope": "EXACT_SOURCE_BOUND_PARENTAL_LIABILITY"
      },
      "lifecycleStatus": "RATIFIED_DORMANT",
      "productionSigner": {
        "signatureStatus": "PENDING_NOT_EXECUTED",
        "signerId": "TELLI-PROD-LEGAL-01",
        "role": "PRODUCTION_RELEASE_SIGNER"
      },
      "requiredEvidenceTypes": [
        "CHILD_BENEFICIARY_IDENTITY_EVIDENCE",
        "CLAIMANT_CAPACITY_EVIDENCE",
        "DEBTOR_IDENTITY_EVIDENCE",
        "EXACT_DUE_DATE_EVIDENCE",
        "EXACT_INSTALLMENT_AMOUNT_EVIDENCE",
        "LIABILITY_CONTEXT_HASH",
        "SOURCE_ENFORCEABILITY_EVIDENCE"
      ],
      "requiredSourceTypes": [
        "COURT_JUDGMENT",
        "ENFORCEABLE_AGREEMENT_OR_PROTOCOL"
      ],
      "reviewer": {
        "identity": "Av. Fatma Uluca Telli",
        "ratifierCode": "TELLI-LEGAL-REVIEWER-01",
        "role": "LEGAL DOMAIN OFFICER / LEGAL REVIEWER",
        "signatureStatus": "PENDING_NOT_EXECUTED"
      },
      "snapshotRequirements": [
        "Decision-pack identity version and checksum",
        "Exact Legal Basis release identity version entry checksum and source references",
        "Exact document source identity version fingerprint beneficiary enforceability and effective interval",
        "Exact amount currency due date claimant debtor case and liability-context hash"
      ],
      "subtypeCode": "MINOR_CHILD_MAINTENANCE",
      "subtypeVersion": 1,
      "supersededBy": null,
      "supersedes": []
    },
    {
      "admissionRequirements": [
        "Exact enforceable judgment or agreement source identity version and fingerprint",
        "Exact adult-child education continuation evidence",
        "Exact installment amount currency and due date",
        "Exact liability type and opaque liable-debtor references",
        "Positive principal amount in integer minor units"
      ],
      "allowedFormationPaths": [
        "CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION"
      ],
      "amountSemantics": {
        "installmentGrain": "ONE_CLAIM_ITEM_PER_EXACT_DUE_INSTALLMENT",
        "minorUnitRepresentation": "POSITIVE_INTEGER_STRING",
        "periodAggregation": "ONLY_CHECKSUMMED_REPRODUCIBLE_SCHEDULE",
        "semanticAuthority": "EXACT_ENFORCEABLE_SOURCE_AMOUNT"
      },
      "calculationSemantics": {
        "indexationFallback": "PROHIBITED",
        "prorationFallback": "PROHIBITED",
        "rule": "NO_EDUCATION_STATUS_OR_AMOUNT_INFERENCE",
        "sourceAmountDerivation": "EXACT_JUDGMENT_OR_ENFORCEABLE_AGREEMENT_SCHEDULE"
      },
      "canonicalComponentCategory": "PRINCIPAL",
      "currencySemantics": {
        "conversion": "PROHIBITED",
        "currencyAuthority": "EXACT_ENFORCEABLE_SOURCE",
        "minorUnitAuthority": "ISO_CURRENCY_MINOR_UNIT"
      },
      "displayName": "Ergin Çocuğun Eğitim Nafakası Asıl Alacağı",
      "effectiveFrom": "2026-08-01T00:00:00Z",
      "effectiveUntil": null,
      "finalRatifier": {
        "identity": "Av. Ulaş Hüseyin Telli",
        "ratifierCode": "TELLI-FINAL-LEGAL-RATIFIER-01",
        "role": "OWNER / FINAL LEGAL RATIFIER"
      },
      "finalizationRequirements": [
        "Revalidate exact Legal Basis release version entry checksum and effective interval",
        "Revalidate exact source version fingerprint education evidence enforceability and due installment",
        "Revalidate tenant case object scope and liability-context hash",
        "Persist ClaimItem immutable formation snapshot audit and outbox atomically"
      ],
      "forbiddenFormationPaths": [
        "CASE_SUBCATEGORY_NAFAKA_AUTHORITY",
        "CURRENT_LATEST_OR_DEFAULT_RESOLUTION",
        "DIRECT_CLAIM_ITEM_WRITE",
        "DUETYPE_NAFAKA_AUTHORITY",
        "EDUCATION_STATUS_INFERENCE",
        "GENERIC_PRINCIPAL_FALLBACK",
        "HISTORICAL_RECLASSIFICATION",
        "INTEREST_OR_COST_INFERENCE",
        "LEGACY_CODE_AUTHORITY"
      ],
      "interestEligibility": {
        "automaticInterest": false,
        "formationProjection": "UNKNOWN",
        "rule": "SEPARATE_EXACT_LEGAL_BASIS_AND_INTEREST_POLICY_REQUIRED"
      },
      "legalBasisBindings": {
        "allowedLegalBasisCodes": [
          "TMK_328_2"
        ],
        "bindingMode": "EXACTLY_ONE",
        "requiredLegalBasisCodes": [
          "TMK_328_2"
        ]
      },
      "legalCharacter": "ADULT_CHILD_EDUCATION_MAINTENANCE_PRINCIPAL",
      "legalMeaning": "A fixed and due principal installment for education continuing after majority under an exact enforceable source compatible with TMK 328/2; it does not include interest or costs.",
      "liabilityCompatibility": {
        "allowedLiabilityTypes": [
          "KISMI",
          "SINIRLI",
          "TAM"
        ],
        "implicitAllDebtors": "PROHIBITED",
        "scope": "EXACT_SOURCE_BOUND_PARENTAL_LIABILITY"
      },
      "lifecycleStatus": "RATIFIED_DORMANT",
      "productionSigner": {
        "signatureStatus": "PENDING_NOT_EXECUTED",
        "signerId": "TELLI-PROD-LEGAL-01",
        "role": "PRODUCTION_RELEASE_SIGNER"
      },
      "requiredEvidenceTypes": [
        "ADULT_CHILD_IDENTITY_EVIDENCE",
        "CONTINUING_EDUCATION_EVIDENCE",
        "DEBTOR_IDENTITY_EVIDENCE",
        "EXACT_DUE_DATE_EVIDENCE",
        "EXACT_INSTALLMENT_AMOUNT_EVIDENCE",
        "LIABILITY_CONTEXT_HASH",
        "SOURCE_ENFORCEABILITY_EVIDENCE"
      ],
      "requiredSourceTypes": [
        "COURT_JUDGMENT",
        "ENFORCEABLE_AGREEMENT_OR_PROTOCOL"
      ],
      "reviewer": {
        "identity": "Av. Fatma Uluca Telli",
        "ratifierCode": "TELLI-LEGAL-REVIEWER-01",
        "role": "LEGAL DOMAIN OFFICER / LEGAL REVIEWER",
        "signatureStatus": "PENDING_NOT_EXECUTED"
      },
      "snapshotRequirements": [
        "Decision-pack identity version and checksum",
        "Exact Legal Basis release identity version entry checksum and source references",
        "Exact document source identity version fingerprint education evidence and effective interval",
        "Exact amount currency due date claimant debtor case and liability-context hash"
      ],
      "subtypeCode": "ADULT_CHILD_EDUCATION_MAINTENANCE",
      "subtypeVersion": 1,
      "supersededBy": null,
      "supersedes": []
    },
    {
      "admissionRequirements": [
        "Exact enforceable judgment or agreement source identity version and fingerprint",
        "Exact former-spouse beneficiary debtor and case scope",
        "Exact installment amount currency and due date",
        "Exact liability type and opaque liable-debtor references",
        "Positive principal amount in integer minor units"
      ],
      "allowedFormationPaths": [
        "CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION"
      ],
      "amountSemantics": {
        "installmentGrain": "ONE_CLAIM_ITEM_PER_EXACT_DUE_INSTALLMENT",
        "minorUnitRepresentation": "POSITIVE_INTEGER_STRING",
        "periodAggregation": "ONLY_CHECKSUMMED_REPRODUCIBLE_SCHEDULE",
        "semanticAuthority": "EXACT_ENFORCEABLE_SOURCE_AMOUNT"
      },
      "calculationSemantics": {
        "indexationFallback": "PROHIBITED",
        "prorationFallback": "PROHIBITED",
        "rule": "NO_POVERTY_OR_AMOUNT_INFERENCE",
        "sourceAmountDerivation": "EXACT_JUDGMENT_OR_ENFORCEABLE_AGREEMENT_SCHEDULE"
      },
      "canonicalComponentCategory": "PRINCIPAL",
      "currencySemantics": {
        "conversion": "PROHIBITED",
        "currencyAuthority": "EXACT_ENFORCEABLE_SOURCE",
        "minorUnitAuthority": "ISO_CURRENCY_MINOR_UNIT"
      },
      "displayName": "Yoksulluk Nafakası Asıl Alacağı",
      "effectiveFrom": "2026-08-01T00:00:00Z",
      "effectiveUntil": null,
      "finalRatifier": {
        "identity": "Av. Ulaş Hüseyin Telli",
        "ratifierCode": "TELLI-FINAL-LEGAL-RATIFIER-01",
        "role": "OWNER / FINAL LEGAL RATIFIER"
      },
      "finalizationRequirements": [
        "Revalidate exact Legal Basis release version entry checksum and effective interval",
        "Revalidate exact source version fingerprint enforceability beneficiary and due installment",
        "Revalidate tenant case object scope and liability-context hash",
        "Persist ClaimItem immutable formation snapshot audit and outbox atomically"
      ],
      "forbiddenFormationPaths": [
        "CASE_SUBCATEGORY_NAFAKA_AUTHORITY",
        "CURRENT_LATEST_OR_DEFAULT_RESOLUTION",
        "DIRECT_CLAIM_ITEM_WRITE",
        "DUETYPE_NAFAKA_AUTHORITY",
        "GENERIC_PRINCIPAL_FALLBACK",
        "HISTORICAL_RECLASSIFICATION",
        "INTEREST_OR_COST_INFERENCE",
        "LEGACY_CODE_AUTHORITY",
        "POVERTY_STATUS_INFERENCE"
      ],
      "interestEligibility": {
        "automaticInterest": false,
        "formationProjection": "UNKNOWN",
        "rule": "SEPARATE_EXACT_LEGAL_BASIS_AND_INTEREST_POLICY_REQUIRED"
      },
      "legalBasisBindings": {
        "allowedLegalBasisCodes": [
          "TMK_175_176"
        ],
        "bindingMode": "EXACTLY_ONE",
        "requiredLegalBasisCodes": [
          "TMK_175_176"
        ]
      },
      "legalCharacter": "POVERTY_MAINTENANCE_PRINCIPAL",
      "legalMeaning": "A fixed and due poverty-maintenance principal installment under an exact enforceable source compatible with TMK 175-176; it does not include interest or costs.",
      "liabilityCompatibility": {
        "allowedLiabilityTypes": [
          "KISMI",
          "SINIRLI",
          "TAM"
        ],
        "implicitAllDebtors": "PROHIBITED",
        "scope": "EXACT_SOURCE_BOUND_FORMER_SPOUSE_LIABILITY"
      },
      "lifecycleStatus": "RATIFIED_DORMANT",
      "productionSigner": {
        "signatureStatus": "PENDING_NOT_EXECUTED",
        "signerId": "TELLI-PROD-LEGAL-01",
        "role": "PRODUCTION_RELEASE_SIGNER"
      },
      "requiredEvidenceTypes": [
        "BENEFICIARY_IDENTITY_EVIDENCE",
        "DEBTOR_IDENTITY_EVIDENCE",
        "EXACT_DUE_DATE_EVIDENCE",
        "EXACT_INSTALLMENT_AMOUNT_EVIDENCE",
        "LIABILITY_CONTEXT_HASH",
        "SOURCE_ENFORCEABILITY_EVIDENCE",
        "SOURCE_POVERTY_MAINTENANCE_DISPOSITION_EVIDENCE"
      ],
      "requiredSourceTypes": [
        "COURT_JUDGMENT",
        "ENFORCEABLE_AGREEMENT_OR_PROTOCOL"
      ],
      "reviewer": {
        "identity": "Av. Fatma Uluca Telli",
        "ratifierCode": "TELLI-LEGAL-REVIEWER-01",
        "role": "LEGAL DOMAIN OFFICER / LEGAL REVIEWER",
        "signatureStatus": "PENDING_NOT_EXECUTED"
      },
      "snapshotRequirements": [
        "Decision-pack identity version and checksum",
        "Exact Legal Basis release identity version entry checksum and source references",
        "Exact document source identity version fingerprint beneficiary enforceability and effective interval",
        "Exact amount currency due date claimant debtor case and liability-context hash"
      ],
      "subtypeCode": "POVERTY_MAINTENANCE",
      "subtypeVersion": 1,
      "supersededBy": null,
      "supersedes": []
    },
    {
      "admissionRequirements": [
        "Exact enforceable judgment or interim order source identity version and fingerprint",
        "Exact spouse beneficiary debtor and separate-living scope",
        "Exact installment amount currency and due date",
        "Exact liability type and opaque liable-debtor references",
        "Positive principal amount in integer minor units"
      ],
      "allowedFormationPaths": [
        "CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION"
      ],
      "amountSemantics": {
        "installmentGrain": "ONE_CLAIM_ITEM_PER_EXACT_DUE_INSTALLMENT",
        "minorUnitRepresentation": "POSITIVE_INTEGER_STRING",
        "periodAggregation": "ONLY_CHECKSUMMED_REPRODUCIBLE_SCHEDULE",
        "semanticAuthority": "EXACT_ENFORCEABLE_SOURCE_AMOUNT"
      },
      "calculationSemantics": {
        "indexationFallback": "PROHIBITED",
        "prorationFallback": "PROHIBITED",
        "rule": "NO_SEPARATE_LIVING_OR_AMOUNT_INFERENCE",
        "sourceAmountDerivation": "EXACT_JUDGMENT_OR_INTERIM_ORDER_SCHEDULE"
      },
      "canonicalComponentCategory": "PRINCIPAL",
      "currencySemantics": {
        "conversion": "PROHIBITED",
        "currencyAuthority": "EXACT_ENFORCEABLE_SOURCE",
        "minorUnitAuthority": "ISO_CURRENCY_MINOR_UNIT"
      },
      "displayName": "Ayrı Yaşama Nafakası Asıl Alacağı",
      "effectiveFrom": "2026-08-01T00:00:00Z",
      "effectiveUntil": null,
      "finalRatifier": {
        "identity": "Av. Ulaş Hüseyin Telli",
        "ratifierCode": "TELLI-FINAL-LEGAL-RATIFIER-01",
        "role": "OWNER / FINAL LEGAL RATIFIER"
      },
      "finalizationRequirements": [
        "Revalidate exact Legal Basis release version entry checksum and effective interval",
        "Revalidate exact source version fingerprint separate-living disposition and due installment",
        "Revalidate tenant case object scope and liability-context hash",
        "Persist ClaimItem immutable formation snapshot audit and outbox atomically"
      ],
      "forbiddenFormationPaths": [
        "CASE_SUBCATEGORY_NAFAKA_AUTHORITY",
        "CURRENT_LATEST_OR_DEFAULT_RESOLUTION",
        "DIRECT_CLAIM_ITEM_WRITE",
        "DUETYPE_NAFAKA_AUTHORITY",
        "GENERIC_PRINCIPAL_FALLBACK",
        "HISTORICAL_RECLASSIFICATION",
        "INTEREST_OR_COST_INFERENCE",
        "LEGACY_CODE_AUTHORITY",
        "SEPARATE_LIVING_STATUS_INFERENCE"
      ],
      "interestEligibility": {
        "automaticInterest": false,
        "formationProjection": "UNKNOWN",
        "rule": "SEPARATE_EXACT_LEGAL_BASIS_AND_INTEREST_POLICY_REQUIRED"
      },
      "legalBasisBindings": {
        "allowedLegalBasisCodes": [
          "TMK_197"
        ],
        "bindingMode": "EXACTLY_ONE",
        "requiredLegalBasisCodes": [
          "TMK_197"
        ]
      },
      "legalCharacter": "SEPARATE_LIVING_SPOUSAL_MAINTENANCE_PRINCIPAL",
      "legalMeaning": "A fixed and due spouse-maintenance principal installment under an exact enforceable source compatible with TMK 197; it does not include interest or costs.",
      "liabilityCompatibility": {
        "allowedLiabilityTypes": [
          "KISMI",
          "SINIRLI",
          "TAM"
        ],
        "implicitAllDebtors": "PROHIBITED",
        "scope": "EXACT_SOURCE_BOUND_SPOUSE_LIABILITY"
      },
      "lifecycleStatus": "RATIFIED_DORMANT",
      "productionSigner": {
        "signatureStatus": "PENDING_NOT_EXECUTED",
        "signerId": "TELLI-PROD-LEGAL-01",
        "role": "PRODUCTION_RELEASE_SIGNER"
      },
      "requiredEvidenceTypes": [
        "BENEFICIARY_IDENTITY_EVIDENCE",
        "DEBTOR_IDENTITY_EVIDENCE",
        "EXACT_DUE_DATE_EVIDENCE",
        "EXACT_INSTALLMENT_AMOUNT_EVIDENCE",
        "LIABILITY_CONTEXT_HASH",
        "SOURCE_ENFORCEABILITY_EVIDENCE",
        "SOURCE_SEPARATE_LIVING_DISPOSITION_EVIDENCE"
      ],
      "requiredSourceTypes": [
        "COURT_JUDGMENT",
        "INTERIM_COURT_ORDER"
      ],
      "reviewer": {
        "identity": "Av. Fatma Uluca Telli",
        "ratifierCode": "TELLI-LEGAL-REVIEWER-01",
        "role": "LEGAL DOMAIN OFFICER / LEGAL REVIEWER",
        "signatureStatus": "PENDING_NOT_EXECUTED"
      },
      "snapshotRequirements": [
        "Decision-pack identity version and checksum",
        "Exact Legal Basis release identity version entry checksum and source references",
        "Exact document source identity version fingerprint separate-living disposition and effective interval",
        "Exact amount currency due date claimant debtor case and liability-context hash"
      ],
      "subtypeCode": "SEPARATE_LIVING_SPOUSAL_MAINTENANCE",
      "subtypeVersion": 1,
      "supersededBy": null,
      "supersedes": []
    },
    {
      "admissionRequirements": [
        "Exact enforceable judgment source identity version and fingerprint",
        "Exact kinship claimant debtor and poverty-condition scope",
        "Exact installment amount currency and due date",
        "Exact liability type and opaque liable-debtor references",
        "Positive principal amount in integer minor units"
      ],
      "allowedFormationPaths": [
        "CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION"
      ],
      "amountSemantics": {
        "installmentGrain": "ONE_CLAIM_ITEM_PER_EXACT_DUE_INSTALLMENT",
        "minorUnitRepresentation": "POSITIVE_INTEGER_STRING",
        "periodAggregation": "ONLY_CHECKSUMMED_REPRODUCIBLE_SCHEDULE",
        "semanticAuthority": "EXACT_ENFORCEABLE_SOURCE_AMOUNT"
      },
      "calculationSemantics": {
        "indexationFallback": "PROHIBITED",
        "prorationFallback": "PROHIBITED",
        "rule": "NO_KINSHIP_POVERTY_OR_AMOUNT_INFERENCE",
        "sourceAmountDerivation": "EXACT_JUDGMENT_SCHEDULE"
      },
      "canonicalComponentCategory": "PRINCIPAL",
      "currencySemantics": {
        "conversion": "PROHIBITED",
        "currencyAuthority": "EXACT_ENFORCEABLE_SOURCE",
        "minorUnitAuthority": "ISO_CURRENCY_MINOR_UNIT"
      },
      "displayName": "Yardım Nafakası Asıl Alacağı",
      "effectiveFrom": "2026-08-01T00:00:00Z",
      "effectiveUntil": null,
      "finalRatifier": {
        "identity": "Av. Ulaş Hüseyin Telli",
        "ratifierCode": "TELLI-FINAL-LEGAL-RATIFIER-01",
        "role": "OWNER / FINAL LEGAL RATIFIER"
      },
      "finalizationRequirements": [
        "Revalidate exact Legal Basis release version entry checksum and effective interval",
        "Revalidate exact source version fingerprint kinship poverty-condition and due installment",
        "Revalidate tenant case object scope and liability-context hash",
        "Persist ClaimItem immutable formation snapshot audit and outbox atomically"
      ],
      "forbiddenFormationPaths": [
        "CASE_SUBCATEGORY_NAFAKA_AUTHORITY",
        "CURRENT_LATEST_OR_DEFAULT_RESOLUTION",
        "DIRECT_CLAIM_ITEM_WRITE",
        "DUETYPE_NAFAKA_AUTHORITY",
        "GENERIC_PRINCIPAL_FALLBACK",
        "HISTORICAL_RECLASSIFICATION",
        "INTEREST_OR_COST_INFERENCE",
        "KINSHIP_OR_POVERTY_STATUS_INFERENCE",
        "LEGACY_CODE_AUTHORITY"
      ],
      "interestEligibility": {
        "automaticInterest": false,
        "formationProjection": "UNKNOWN",
        "rule": "SEPARATE_EXACT_LEGAL_BASIS_AND_INTEREST_POLICY_REQUIRED"
      },
      "legalBasisBindings": {
        "allowedLegalBasisCodes": [
          "TMK_364_366"
        ],
        "bindingMode": "EXACTLY_ONE",
        "requiredLegalBasisCodes": [
          "TMK_364_366"
        ]
      },
      "legalCharacter": "FAMILY_SUPPORT_MAINTENANCE_PRINCIPAL",
      "legalMeaning": "A fixed and due family-support principal installment under an exact enforceable judgment compatible with TMK 364-366; it does not include interest or costs.",
      "liabilityCompatibility": {
        "allowedLiabilityTypes": [
          "KISMI",
          "SINIRLI",
          "TAM"
        ],
        "implicitAllDebtors": "PROHIBITED",
        "scope": "EXACT_SOURCE_BOUND_KINSHIP_LIABILITY"
      },
      "lifecycleStatus": "RATIFIED_DORMANT",
      "productionSigner": {
        "signatureStatus": "PENDING_NOT_EXECUTED",
        "signerId": "TELLI-PROD-LEGAL-01",
        "role": "PRODUCTION_RELEASE_SIGNER"
      },
      "requiredEvidenceTypes": [
        "CLAIMANT_IDENTITY_EVIDENCE",
        "DEBTOR_IDENTITY_EVIDENCE",
        "EXACT_DUE_DATE_EVIDENCE",
        "EXACT_INSTALLMENT_AMOUNT_EVIDENCE",
        "KINSHIP_EVIDENCE",
        "LIABILITY_CONTEXT_HASH",
        "SOURCE_ENFORCEABILITY_EVIDENCE",
        "SOURCE_POVERTY_CONDITION_EVIDENCE"
      ],
      "requiredSourceTypes": [
        "COURT_JUDGMENT"
      ],
      "reviewer": {
        "identity": "Av. Fatma Uluca Telli",
        "ratifierCode": "TELLI-LEGAL-REVIEWER-01",
        "role": "LEGAL DOMAIN OFFICER / LEGAL REVIEWER",
        "signatureStatus": "PENDING_NOT_EXECUTED"
      },
      "snapshotRequirements": [
        "Decision-pack identity version and checksum",
        "Exact Legal Basis release identity version entry checksum and source references",
        "Exact document source identity version fingerprint kinship poverty-condition and effective interval",
        "Exact amount currency due date claimant debtor case and liability-context hash"
      ],
      "subtypeCode": "FAMILY_SUPPORT_MAINTENANCE",
      "subtypeVersion": 1,
      "supersededBy": null,
      "supersedes": []
    }
  ],
  "legacyDecisionPackV1Status": "UNVERIFIABLE_NOT_USABLE",
  "masterTaskId": "RECEIVABLE-NAFAKA-LEGAL-BASIS-TERMINAL-CLOSURE-R01",
  "modelSufficiency": {
    "migrationRequired": false,
    "schemaChangeRequired": false,
    "verdict": "EXISTING_FORMATION_INTENT_AND_SNAPSHOT_MODEL_SUFFICIENT"
  },
  "officialSources": [
    {
      "authority": "Türkiye Büyük Millet Meclisi",
      "scope": "4721 sayılı Türk Medeni Kanunu accepted-law text; amendment history is not inferred from this source alone",
      "url": "https://cdn.tbmm.gov.tr/KKBSPublicFile/D21/Y2/T1/KanunMetni/1cbadba3-a22d-43fd-a5e4-dfb3b69b962b.html"
    },
    {
      "authority": "Anayasa Mahkemesi",
      "scope": "TMK 169 interim maintenance application",
      "url": "https://kararlarbilgibankasi.anayasa.gov.tr/BB/2018/6904"
    },
    {
      "authority": "Anayasa Mahkemesi",
      "scope": "TMK 175-176 poverty maintenance legal character",
      "url": "https://normkararlarbilgibankasi.anayasa.gov.tr/ND/2009/94"
    },
    {
      "authority": "Anayasa Mahkemesi",
      "scope": "TMK 176, 182 and 330 maintenance amount and child support context",
      "url": "https://kararlarbilgibankasi.anayasa.gov.tr/BB/2016/3140"
    },
    {
      "authority": "Anayasa Mahkemesi",
      "scope": "TMK 197 separate-living maintenance and enforceability context",
      "url": "https://kararlarbilgibankasi.anayasa.gov.tr/BB/2013/6616"
    },
    {
      "authority": "Anayasa Mahkemesi",
      "scope": "TMK 364 family-support maintenance conditions",
      "url": "https://kararlarbilgibankasi.anayasa.gov.tr/BB/2014/10261"
    }
  ],
  "programId": "RECEIVABLE-LEGAL-BASIS-MODEL-COMPLETION",
  "ratification": {
    "finalRatifier": {
      "disposition": "RATIFIED_BY_OWNER_EX_ANTE_CONDITIONS_SATISFIED",
      "identity": "Av. Ulaş Hüseyin Telli",
      "ratifierCode": "TELLI-FINAL-LEGAL-RATIFIER-01",
      "role": "OWNER / FINAL LEGAL RATIFIER",
      "signatureStatus": "PENDING_NOT_EXECUTED"
    },
    "legalReviewer": {
      "identity": "Av. Fatma Uluca Telli",
      "ratifierCode": "TELLI-LEGAL-REVIEWER-01",
      "role": "LEGAL DOMAIN OFFICER / LEGAL REVIEWER",
      "signatureStatus": "PENDING_NOT_EXECUTED"
    },
    "materializedAt": "2026-07-31T08:32:14Z",
    "productionSigner": {
      "signerId": "TELLI-PROD-LEGAL-01",
      "role": "PRODUCTION_RELEASE_SIGNER",
      "signatureStatus": "PENDING_NOT_EXECUTED"
    }
  },
  "runtimeStatus": "DORMANT_DEFAULT_OFF",
  "schemaVersion": "RECEIVABLE_NAFAKA_LEGAL_BASIS_DECISION_PACK_V2",
  "status": "OWNER_RATIFIED_HASH_BOUND"
}
```
<!-- DECISION_PACK_JSON_END -->

## Legal provision crosswalk

| Legal Basis code | Narrow release title | Official provision scope | Binding |
|---|---|---|---|
| `TMK_169` | Divorce-proceeding interim maintenance measure | Temporary measures for spouse/child maintenance during the proceeding | `INTERIM_MAINTENANCE` |
| `TMK_182_2` | Child-maintenance contribution after divorce | Parent's contribution to the child's care and education expenses | `MINOR_CHILD_MAINTENANCE` |
| `TMK_327_330` | Child care/education maintenance | Parents' maintenance duty and amount assessment for the child | `MINOR_CHILD_MAINTENANCE` |
| `TMK_328_2` | Education continuing after majority | Continued parental maintenance while education continues, within circumstances | `ADULT_CHILD_EDUCATION_MAINTENANCE` |
| `TMK_175_176` | Poverty maintenance and payment form | Conditions and payment/lifecycle rules for poverty maintenance | `POVERTY_MAINTENANCE` |
| `TMK_197` | Separate-living monetary contribution | Monetary contribution ordered while separate living is justified | `SEPARATE_LIVING_SPOUSAL_MAINTENANCE` |
| `TMK_364_366` | Family-support maintenance | Maintenance among specified relatives and action/order boundaries | `FAMILY_SUPPORT_MAINTENANCE` |

## Ratification and signature precision

The owner/final legal ratifier's ex-ante conditional authority is satisfied by the
official-source, no-invention, principal-only, exact-source/evidence/liability and
model-sufficiency validations encoded here. The named legal-reviewer identity is bound,
but no cryptographic reviewer signature is claimed. The production signer identity is
also pinned, but no production signature has been executed. Those pending signatures
must never be represented as runtime activation or production readiness.
