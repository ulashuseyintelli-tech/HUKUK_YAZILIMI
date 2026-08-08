# C1-B03-AUTH-CONTINUITY-REMEDIATION-R01

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    C1-B03-AUTH-CONTINUITY-REMEDIATION-R01     LANE OWNER: CLAUDE
AUTHORIZATION: OWNER RATIFIED (2026-08-09) — C1-B03 premature-closure correction + narrowly-scoped
              auth-continuity fix. Tek-kaynak yaklaşımı owner tarafından seçildi.
STATUS:       C1-B03 REOPENED / AUTH-CONTINUITY RESIDUAL. Fix hazır; yeni RC + deploy + doğal UAT bekliyor.
```

## 1. NEDEN AÇILDI (premature closure)
#2307 `RUNTIME_VERIFIED` ilanı, portal UAT'de **token elle localStorage'a enjekte edilerek** yapıldı.
Bu yalnız backend + render kabiliyetini kanıtlar; **doğal oturum sürekliliğini kanıtlamaz.** Owner düzeltmesi:
`NATURAL BROWSER E2E = NOT VERIFIED` → C1-B03 OVERALL = OPEN / AUTH-CONTINUITY RESIDUAL. **#2307 tarihsel kayıt
olarak korunur; geriye dönük silinmez.**

## 2. DOĞAL E2E KANITI (enjeksiyon YOK, canlı RC)
Akış: `logout → login (form) → Müvekkiller (link) → client (satır) → KVKK/Uyum (link) → compliance`. Tümü soft-nav.
- Client-detail + dashboard çağrıları: **200** (`lib/api.ts` `api`).
- Compliance'ın 8 çağrısı: **401** (`lib/api/client.ts` `apiClient`) — `consents · disclosure-texts ·
  disclosure-deliveries · data-subject-requests · legal-holds · special-category-records ·
  effective-capabilities · action-catalog`.
- **Smoking gun:** aynı oturumda `/clients/:id/action-catalog` → **200** (api, client-detail) ↔ **401**
  (apiClient, compliance). Sorun token/endpoint değil, **ÇAĞIRAN client**.
- Owner acceptance ihlali: authenticated sayfa içinde **toplu 401** kabul edilmez.

## 3. KÖK NEDEN (OFFICE-AUTH-P01 kapsama boşluğu)
| Client | Kullanan | `getToken()` |
|---|---|---|
| `lib/api.ts` (`api`) | login + ana app | `this.token ?? sessionStorage ?? localStorage` (OFFICE-AUTH-P01) |
| `lib/api/client.ts` (`apiClient`) | client-compliance + diğer yeni yüzeyler | `this.token ?? localStorage` (**yalnız localStorage**) |

Login `api.setToken(token, rememberMe)`; **"Beni hatırla" KAPALI** → token **yalnız sessionStorage**. `apiClient`
sessionStorage okumadığından token'ı bulamaz → Bearer yok → 401. (Remember-me AÇIK olsaydı localStorage'a
yazılır ve tesadüfen çalışırdı — manuel localStorage enjeksiyonunun "çalışması" bu yüzdendi.)

## 4. FIX (tek-kaynak, owner seçimi) — dar kapsam
`lib/api/client.ts` `ApiClient` token metodları kanonik `api` (lib/api.ts) singleton'ına DELEGE eder:
`setToken/getToken/clearToken → api.*`. Ayrı localStorage-only depo kaldırıldı → **tek-kaynak**. Route string,
istek gövdesi, C2/compliance işlevi DEĞİŞMEZ. Circular import yok (`lib/api.ts`, client.ts'i import etmez).
Etki: apiClient tüm yüzeyleri (compliance + accounting + cases + calc-preview…) "Beni hatırla" KAPALIYKEN de çalışır.

**Regresyon testi:** `lib/api/__tests__/client-token-single-source.spec.ts` — session-only token'ı apiClient
çözer (eskiden null→401), localStorage token'ı çözer, set/clear delege. Lokal vitest: **4/4 + mevcut
api-token-storage 7/7 PASS** (regresyon yok).

## 5. KALAN (owner remediation R01 step 4-5)
Fix → PR → CI PASS → **yeni immutable RC** → kontrollü deploy (aynı GO-COMPLETE disiplini: PRESERVED runtime,
backup-gated, task-target cutover) → **doğal browser UAT tekrar** (login→soft-nav→compliance→refresh→new tab;
kabul: tüm compliance 200 veya tutarlı login-redirect; toplu 401 YOK) → PASS ise telafi governance kaydıyla
C1-B03 yeniden `RUNTIME_VERIFIED / CLOSED`. C2 açılmaz.
