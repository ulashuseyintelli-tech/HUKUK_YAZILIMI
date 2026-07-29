# Legal Signer Access-Control Matrix V1

| Capability | Restricted recovery | Temporary ceremony operator | Legal reviewer principal | Final ratifier principal | Production service principal |
|---|---:|---:|---:|---:|---:|
| `GetKeyPolicy` | Allowed | Removed at final cleanup | Not bound | Not bound | Not bound |
| `PutKeyPolicy` | Allowed | Removed at final cleanup | Not bound | Not bound | Not bound |
| `DescribeKey` | Allowed | Removed at final cleanup | Not bound | Not bound | Not bound |
| `GetPublicKey` | No routine root use | Removed at final cleanup | Not bound | Not bound | Not bound |
| `Sign` | Denied | Removed after ceremony | Not bound | Not bound | Not bound |
| `Verify` | Denied | Removed after ceremony | Not bound | Not bound | Not bound |
| `ScheduleKeyDeletion` | Denied | Denied | Denied | Denied | Denied |

During possession testing only, `Sign` and `Verify` were restricted to
`ED25519_SHA_512` and `RAW`. Their removal is proven by three `AccessDenied` results.

The recovery principal is limited to policy recovery and key description; routine root operation
is prohibited. No wildcard `kms:*`, automatic deletion authority or standing production signer is
part of the final KC01 state. TR01 must bind exact, role-specific principals and cannot reuse the
ceremony grant.
