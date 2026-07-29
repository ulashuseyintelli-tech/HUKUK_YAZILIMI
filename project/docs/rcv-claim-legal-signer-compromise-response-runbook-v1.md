# Legal Signer Compromise-Response Runbook V1

1. Declare the affected signer ID, alias and observed time without publishing account, ARN or
   credential material.
2. Remove all signing principals from the affected key policy and reject new release operations.
3. Disable the KMS key when continued verification access is not required for containment.
4. Preserve CloudTrail, policy, public-key, signature and release evidence in the private register.
5. Mark the exact trust-root record `COMPROMISED` or `REVOKED`; never rewrite prior lifecycle facts.
6. Identify releases signed in the affected interval and require explicit legal and technical
   review. Do not auto-resign or backfill them.
7. Create a distinct replacement KMS key under the rotation policy and repeat possession evidence.
8. Onboard the replacement through a new owner-authorized trust-root task.

If exact scope, audit continuity or signer identity cannot be established, release publication
stays fail-closed. KMS key deletion, legal-content amendment and production cutover are separate
owner-gated actions.
