# C1-B03 — RC2 RELEASE-PROVENANCE FINALIZATION (R01)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    C1-B03-RC2-RELEASE-PROVENANCE-R01     LANE OWNER: CLAUDE
AUTHORIZATION: OWNER DIRECTIVE (2026-08-09) — release-provenance finalization; işlevsel kapanış
              (#2317) DEĞİŞMEZ, yalnız runtime artifact'ının provenance'ı temizlenir.
VERDICT:      C1-B03 = CLOSED / RUNTIME_VERIFIED / CLEAN IMMUTABLE RC (RC2)
```

## 1. NEDEN (provenance residual)
Doğal-E2E-PASS veren canlı Web (`rc-authfix`) **dirty** worktree'ydi: base `1488063d` + auth-fix
`client.ts` **uncommitted** working-tree değişikliği (`git checkout bb0471b1 -- client.ts` ile).
İçerik kanonik #2315 ile birebir doğrulandı ama commit'siz durum immutable/terminal ilan edilemez.

## 2. RC2 — TEK TEMİZ COMMIT (pinned)
| Alan | Değer |
|---|---|
| **commit SHA** | `45b24a0cefec806399db81cba32fd3ad85ff5e95` (branch `rc2/c1b03-authfix`, origin'e push'lu) |
| **tree SHA** | `41baed0b0805e6efe6fc4b7588df72522a83f38d` |
| base | `1488063d` (#2303 X3 şemaları + 3 migration DIŞI) |
| exact diff | YALNIZ `lib/api/client.ts` (auth-fix, bb0471b1 ile birebir) + inert `client-token-single-source.spec.ts` |
| client.ts blob SHA-256 | `26a380c48af151e75a2b3f4247b93e499c0394fc1c189f9abc2328cd4ebc5555` (dirty rc-authfix canlısıyla AYNI) |
| migration count | **121** (0 pending) |
| worktree | `.worktrees/rc2-authfix` — `git status` CLEAN |
| web build | PASS (exit 0, 46s) — **BUILD_ID `nM4tkPijau_XpQSKBL5xd`** |

## 3. CUTOVER + SMOKE (doğal, enjeksiyon YOK)
- `HukukPlatform-Web` → `.worktrees/rc2-authfix/project/apps/web`; 3002 UP ~3s, **RC2 BUILD_ID servis** doğrulandı.
- API (`rc-1488063d`) ve DB'ye DOKUNULMADI.
- Smoke: doğal login ("Beni hatırla" KAPALI → sessionStorage token) → soft-nav → compliance **8 çağrı 200** →
  refresh **200** → console **0 hata**. PASS.

## 4. RUNTIME / ROLLBACK ZİNCİRİ (SİLME)
| Dizin | Rol |
|---|---|
| `.worktrees/rc2-authfix` | **CANLI Web** (RC2, clean+pinned `45b24a0c`) |
| `.worktrees/rc-authfix` | Web rollback-1 (dirty ama içerik-eşdeğer, BUILD_ID `1Oj9kJFN`) |
| `.worktrees/rc-1488063d` | **CANLI API** (`1488063d`) + Web rollback-2 (`G9Wu00pk`) |
| `.worktrees/w5-artifact` | deep rollback (#2261 + route-hotfix) |

## 5. VERDICT
Kabul (madde 3) karşılandı: clean worktree · exact yetkili diff · migration 121 · build PASS ·
commit/tree SHA + BUILD_ID kayıtlı · doğal smoke PASS. **C1-B03 = CLOSED / RUNTIME_VERIFIED / CLEAN
IMMUTABLE RC.** Tarihsel kayıtlar DEĞİŞTİRİLMEDİ: #2307 (erken) · #2315 (fix+reopen) · #2317 (re-verify).
C2 açılmadı; #2303 X3 şemaları hâlâ RC-dışı (ayrı deploy kararı).
