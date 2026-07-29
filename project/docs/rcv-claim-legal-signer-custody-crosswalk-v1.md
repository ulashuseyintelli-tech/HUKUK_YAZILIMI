# Legal Signer Custody Crosswalk V1

| Role | Signer ID | Subject | Custody assignment | Legal authority | Current signing access |
|---|---|---|---|---|---|
| `LEGAL_REVIEWER` | `TELLI-LEGAL-REVIEWER-01` | Av. Fatma Uluca Telli | Separate AWS KMS non-exportable key | Legal review only; does not replace final ratification | `NONE / PENDING TR01` |
| `FINAL_LEGAL_RATIFIER` | `TELLI-FINAL-LEGAL-RATIFIER-01` | Av. Ulaş Hüseyin Telli | Separate AWS KMS non-exportable key | Final Legal Basis ratification | `NONE / PENDING TR01` |
| `PRODUCTION_RELEASE_SIGNER` | `TELLI-PROD-LEGAL-01` | Service | Separate AWS KMS non-exportable key | Operational publication authenticity only; no legal authority | `NONE / PENDING TR01` |

The three roles, aliases, key objects, public keys and fingerprints are distinct. A legal reviewer,
final ratifier or production service principal cannot substitute for another role. OfficeApproval,
developer, staff, administrator and ceremony operator do not create legal authority.

The temporary bootstrap identity exercised only non-authoritative possession signing. That signing
grant was removed after verification. Exact permanent principals, validity intervals,
authority-evidence references and raw production trust-root identities remain TR01 inputs.
