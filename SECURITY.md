# Security Policy

## Supported surface

Security fixes target the current `main` branch. Historical branches, old commits,
local worktrees, archived prototypes, and unmerged pull requests are not supported
release surfaces unless a report shows that the same issue remains reachable from
the current default branch.

## Report vulnerabilities privately

Use [GitHub Private Vulnerability Reporting](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/security/advisories/new)
for vulnerabilities, exploit details, credentials, secrets, personally identifiable
information, client data, or confidential legal information.

Do not open a public issue, pull request, discussion, or commit containing sensitive
details. Do not paste a real credential or production payload into logs, screenshots,
artifacts, or chat messages.

If a credential may have been exposed, revoke or rotate it in the external provider
before treating repository cleanup as incident closure. Removing a value from the
current tree does not invalidate a credential that exists in Git history.

## Include safe evidence

When it can be shared without disclosing sensitive information, include:

- the affected component and current default-branch commit;
- the security impact and affected trust boundary;
- tenant, authorization, PII, or legal-data implications;
- sanitized reproduction conditions;
- existing mitigations;
- a proposed validation or closure signal.

Use synthetic data. Minimize evidence to what is required to reproduce and triage the
issue safely.

## Coordinated handling

The repository owner will validate scope, determine severity, separate duplicate root
causes, and coordinate a bounded remediation. A report is not considered closed merely
because code changed or an alert disappeared; relevant validation and, where applicable,
credential revocation, deployment, or external-provider evidence are also required.

Do not disclose the issue publicly until the repository owner confirms that coordinated
disclosure is appropriate.

## Out of scope

Public security issues are not a channel for product support, general feature requests,
real client files, legal advice, or production credentials. Use the appropriate bounded
task process for non-security work.
