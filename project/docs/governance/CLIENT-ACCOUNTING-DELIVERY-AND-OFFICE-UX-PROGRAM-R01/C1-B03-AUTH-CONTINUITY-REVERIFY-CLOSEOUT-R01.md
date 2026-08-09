# C1-B03 — AUTH-CONTINUITY RE-VERIFY CLOSEOUT (R01)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    C1-B03-AUTH-CONTINUITY-REVERIFY-CLOSEOUT-R01     LANE OWNER: CLAUDE
AUTHORIZATION: OWNER RATIFIED — remediation R01 step 5 (doğal UAT PASS → re-close).
VERDICT:      C1-B03 = RUNTIME_VERIFIED (compensating — auth-continuity residual GİDERİLDİ, doğal browser E2E PASS).
```

## 1. NE DEĞİŞTİ
- **Fix (#2315, `bb0471b1`):** apiClient token çözümlemesi kanonik `api` (lib/api.ts) singleton'ına delege
  (tek-kaynak: `this.token ?? sessionStorage ?? localStorage`). Kök neden: apiClient yalnız localStorage
  okuyordu; "Beni hatırla" KAPALIYKEN token yalnız sessionStorage'a yazılır → compliance 401. Detay:
  `C1-B03-AUTH-CONTINUITY-REMEDIATION-R01.md`.
- **Yeni minimal immutable RC (constraint-8 re-preflight):** hedef SHA değişince migration/diff preflight
  baştan koşuldu. `bb0471b1` **3 yeni migration** (#2303 X3) içerdiğinden RC'ye ALINMADI. RC = **`1488063d` +
  web auth-fix** (yalnız `client.ts`, bb0471b1'den checkout), **121 migration (0 pending), code-only**.

## 2. RUNTIME (cutover)
| Task | Hedef | Not |
|---|---|---|
| HukukPlatform-Web | `.worktrees/rc-authfix/project/apps/web` (BUILD_ID `1Oj9kJFN`) | web build PASS (44s); cutover UP ~3s |
| HukukPlatform-API | `.worktrees/rc-1488063d/project/apps/api` (`1488063d`) | **DEĞİŞMEDİ** (auth-fix web-only; API/DB/şema dokunulmadı) |

Deploy web-only → **DB backup gereksiz** (DB modifiye edilmedi, 0 migration).

## 3. DOĞAL BROWSER UAT (enjeksiyon YOK; "Beni hatırla" KAPALI → token sessionStorage)
| Aşama | Sonuç |
|---|---|
| login (form) → dashboard | token sessionStorage'da (localStorage boş) — bug senaryosu birebir |
| soft-nav (Müvekkiller→client→KVKK/Uyum) → compliance | **8 API çağrısı 200** (consents · disclosure-texts · disclosure-deliveries · data-subject-requests · legal-holds · special-category · effective-capabilities · action-catalog); yüzeyler empty-state render; **console 0 hata** |
| refresh (hard-reload) | compliance **200** (sessionStorage in-tab persist; apiClient artık okur) |
| new tab (sessionStorage boş) | tutarlı **`/auth/login` redirect** — authenticated sayfada toplu 401 YOK |

Smoking-gun kapanışı: `action-catalog` artık api (client-detail) VE apiClient (compliance) tarafında **200**.
Owner acceptance: "tüm compliance 200 veya tutarlı login-redirect; authenticated sayfada toplu 401 kabul edilmez" → **KARŞILANDI**.

## 4. KORUNAN RUNTIME/ROLLBACK DİZİNLERİ (SİLME)
- `.worktrees/rc-authfix` — YENİ canlı Web (1488063d+authfix).
- `.worktrees/rc-1488063d` — canlı API + Web rollback (BUILD_ID `G9Wu00pk`).
- `.worktrees/w5-artifact` — deep rollback (#2261 + route-hotfix).

## 5. VERDICT + TARİHSEL KAYITLAR
**C1-B03 = RUNTIME_VERIFIED / CLOSED** (auth-continuity residual giderildi; doğal E2E PASS). Tarihsel kayıtlar
KORUNUR (geriye dönük silinmez): **#2307** (ilk — enjeksiyonlu, erken), **#2315** (fix + REOPENED),
bu kayıt (re-verify). C2 açılmadı. #2303 X3 şemaları RC-DIŞI (ayrı deploy kararı). C1-B04/B05 ayrı bloklar.
