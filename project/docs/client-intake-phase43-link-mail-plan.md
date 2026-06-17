# Faz 4.3 — Link Üretimi + tokenHash + INTAKE_LINK Mail — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** **Önkoşul: #162 (Faz 4.2 modelleri) MERGE EDİLMEDEN bu PR'ın koduna GEÇİLMEZ** (modeller main'de olmalı). Bu doküman beklerken hazırlanır.
> **Kaynak:** [client-intake-link-design.md](client-intake-link-design.md) · [client-intake-phase42-models-plan.md](client-intake-phase42-models-plan.md)
> **Kapsam:** Yalnız **personel-tarafı link üretimi + token + mail**. Public submit (4.4), review (4.5), promote (4.6) bu PR'da YOK.

## 0. Sınır
- Bu PR **public/dışa-açık endpoint AÇMAZ** — yalnız personel (JWT) link üretir + mail tetikler. Müvekkilin formu doldurması **4.4**.
- Migration **gerekmez** (4.2 modelleri yeterli). Tek olası küçük ek: `INTAKE_LINK` mail şablonu seed (kategori kararı 43-2).
- Mevcut hatta dokunmaz; mail = Faz 3 dispatcher reuse (best-effort, state değiştirmez).

## 1. Token üretimi + tokenHash (güvenlik çekirdeği)
- **Ham token:** kriptografik rastgele, yüksek entropi (≥256-bit; `crypto.randomBytes(32)` → base64url ≈ 43 char). 43-1.
- **DB'ye yalnız HASH:** `tokenHash = sha256(rawToken)` (hex). Ham token **asla** DB'de tutulmaz (4.2 şeması bunu zorluyor: yalnız `tokenHash` kolonu var).
- **Ham token tek sefer:** create yanıtında **bir kez** döner (link URL'i için) + maile gömülür. Sonra erişilemez (kaybolursa yeni link üretilir).
- **Submit doğrulaması (4.4'te):** gelen token `sha256`'lanır, `tokenHash` ile eşleştirilir (index'li sorgu). Sabit-zaman karşılaştırma gerekmez (hash eşitliği yeterli; ham token DB'de yok).
- **Loglama:** ham token / link URL **maskeli** (PII/secret); CI-2 PII gate'ine takılmayacak şekilde logger'a yazılmaz.

## 2. Link URL
- Biçim: `{PUBLIC_INTAKE_BASE_URL}/intake/{rawToken}` (frontend public route — 4.7). Base = env/config (43-3).
- Bu PR URL'i **üretir + maile koyar**; frontend route 4.7'de.

## 3. Servis (yeni `ClientIntakeLinkService`)
| Metod | İş |
|---|---|
| `createLink(tenantId, caseId, clientId, { scope, expiresAt?, maxUses? }, userId)` | token üret → tokenHash hesapla → `ClientIntakeLink` (status ACTIVE) yaz → `{ link, rawTokenOnce }` döndür (+ best-effort INTAKE_LINK mail) |
| `revoke(tenantId, id, userId)` | ACTIVE → REVOKED (link iptal; submit kapanır) |
| `listByCase(tenantId, caseId, status?)` | personel görünümü (tokenHash/ham token DÖNMEZ) |
| `findOne(tenantId, id)` | detay (ham token YOK) |
- `useCount`/`USED`/`EXPIRED` geçişleri **submit anında (4.4)** işlenir; bu PR yalnız ACTIVE üretir + REVOKED.
- **Listeleme/detay ham token veya tokenHash'i DIŞA VERMEZ** (yalnız metadata).

## 4. INTAKE_LINK maili (Faz 3 dispatcher reuse)
- Yeni sistem şablonu `INTAKE_LINK` (seed): "Sayın {{clientName}}, dosyanız için bilgi formu: {{intakeUrl}} (son geçerlilik: {{expiresAt}})".
- Kategori (43-2): **reuse `CLIENT_INFO`** (bilgilendirme maili) — yeni enum değeri açmamak için; ya da `CLIENT_APPROVAL` benzeri yeni `CLIENT_INTAKE`. Öneri: CLIENT_INFO + kod `INTAKE_LINK`.
- Dispatch: `NotificationDispatcherService.dispatch(... templateCode='INTAKE_LINK', type='CLIENT_INFO', tokens={clientName, intakeUrl, expiresAt}, refType='ClientIntakeLink', refId=link.id)`.
- **Best-effort:** mail başarısız olsa da link ACTIVE kalır (state mail'e bağlı değil — Faz 3 omurgası). Personel link URL'ini yanıttan da kopyalayabilir.
- dedupeKey ödeme/onay gibi: `INTAKE_LINK:ClientIntakeLink:{id}:1` → tek mail; tekrar gönderim manuel resend.

## 5. Endpoint'ler (TARİF — kod yok; hepsi JWT/personel)
| Method | Path | Not |
|---|---|---|
| POST | `/client-intake-links/case/:caseId` | `{ clientId, scope[], expiresAt?, maxUses? }` → link üret + mail; yanıt: link metadata + **rawToken (tek sefer)** + intakeUrl |
| POST | `/client-intake-links/:id/revoke` | ACTIVE → REVOKED |
| GET | `/client-intake-links/case/:caseId` | liste (token YOK) |
| GET | `/client-intake-links/:id` | detay (token YOK) |
> **Public submit endpoint YOK** (4.4). Token yalnız create yanıtında + mailde.

## 6. 4.4 public-form RİSKLERİ (şimdi tasarlanır, kodu 4.4'te)
Bu PR'ın token tasarımı 4.4 risklerini karşılayacak şekilde kurulur:
- **Token tahmini/enumerasyon:** ≥256-bit entropi → brute-force infeasible. tokenHash index'li tek sorgu.
- **Rate-limit / brute-force:** submit endpoint (4.4) IP+token bazlı rate-limit; başarısız token denemesine throttle.
- **Replay / çok-kullanım:** `maxUses`+`useCount`+`expiresAt`; submit anında atomik kontrol (USED/EXPIRED).
- **Yetkisiz veri okuma:** token yalnız kendi case+client'ına YAZAR; hiçbir mevcut veriyi OKUTMAZ (form boş gelir, yalnız scope kategorileri sorulur).
- **Spam/bot:** rate-limit + honeypot (captcha 4.8 HOLD).
- **PII sızıntısı:** sourceMeta ham IP değil hash; token loglanmaz.
- **Kanonik kirlilik:** submit yalnız `CLIENT_SUBMITTED` yazar; kanoniğe ASLA dokunmaz (promote 4.6, personel onayı).

## 7. Test planı
**Unit:** createLink token üretir + tokenHash=sha256(raw) DB'ye yazılır + ham token DB'de YOK + yanıt rawToken'ı bir kez döner · listeleme/detay token/tokenHash DÖNMEZ · revoke ACTIVE→REVOKED · mail best-effort (dispatch fail→link yine ACTIVE) · cross-tenant case/client reddi.
**E2e (canlı DB, stub dispatcher):** createLink → DB'de tokenHash var, ham token yok · sha256(yanıttaki rawToken)==DB.tokenHash · INTAKE_LINK dispatch çağrıldı · revoke · tenant izolasyonu. Temizlenir.

## 8. Bu PR'da YOK
public submit (4.4) · review (4.5) · promote (4.6) · frontend (4.7) · captcha/portal (4.8) · token DB'de saklama (yasak) · kanonik yazım.

## 9. Micro-kararlar — ✅ ONAYLANDI (Ulaş, 2026-06-17; kodlama #162 merge'e bağlı)
| # | Karar | Sonuç |
|---|---|---|
| 43-1 | token üretimi | ✅ **32 byte random → base64url + sha256 tokenHash; ham token DB'de YOK** |
| 43-2 | INTAKE_LINK şablonu kategorisi | ✅ **CLIENT_INFO** (yeni enum churn yok) |
| 43-3 | link base URL kaynağı | ✅ **env `PUBLIC_INTAKE_BASE_URL`** |
| 43-4 | rawToken görünürlüğü | ✅ **yalnız create response + mail, TEK sefer**; sonradan gösterme yok, kaybolursa yeni link |

> **KIRMIZI ÇİZGİ (Ulaş):** DB'de ham token ASLA yok. Token sızarsa link yenilenir; **DB sızarsa token üretilememeli** (yalnız sha256 hash saklanır).
>
> **DURUM:** Plan + kararlar prensipte onaylı AMA **#162 (Faz 4.2 modelleri) gerçek-yeşil CI alıp MERGE edilmeden 4.3 KODUNA GEÇİLMEZ.** Kod merge sonrasına ertelendi.
