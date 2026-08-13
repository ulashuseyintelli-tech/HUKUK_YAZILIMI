# P5-B05 — Password-Recovery Closure (kayıt + disposition)

Kanıt etiketleri: `VERIFIED` (bu oturumda komutla), `OBSERVED` (dosya içeriği).
Bağlayıcı terminoloji: closure ≠ activation. Bu belge bir KAPANIŞ KAYDIDIR;
hiçbir flag açılmamış, hiçbir production activation yapılmamıştır.

## 1. Canonical gerçek (base `e6a22c7f` üzeri PHASE B dalı)

| Soru | Durum | Kanıt |
|---|---|---|
| Kod default durumu | **OFF — fail-closed** | `password-reset.service.ts:39-41` (`OFFICE_PASSWORD_RECOVERY_ENABLED` yalnız açıkça `"true"` ise açık); forgot/reset uçları bu kapıdan geçer (`OBSERVED`) |
| Web görünürlüğü | Flag'e bağlı | `GET /api/auth/capabilities` (`auth.controller.ts:21-24`) — statik feature-flag durumu, hassas veri yok |
| Sertifikasyon durumu | **LOCAL_CERTIFIED / PRODUCTION_UNCERTIFIED** | Program kaydı (OFFICE Password Recovery Activation R01); production claim: **NONE** |
| CI kapsamı | Var | `password-reset.service.spec.ts` → `ci-manifests/pure/office-auth-user.txt:46` (`OBSERVED`) |
| Runtime dist durumu | `PRESENT_IN_DIST` (hem RUNTIME kökü hem canlı RELEASE10) | P5-B01 scanner koşumları (`VERIFIED`, bkz. b01 belgesi §3-4) |
| DB kanıtı (hukuk_db) | **1 token / 1 tüketilmiş / 0 iptal** — tek tamamlanmış reset akışı | `SELECT count(*) ... FROM "PasswordResetToken"` (`VERIFIED`, 2026-08-13) |

## 2. Disposition

```
P5-B05 STATUS        : CLOSED (kayıt + disposition tamam)
FLAG                 : OFFICE_PASSWORD_RECOVERY_ENABLED — AÇILMADI (default OFF korunur)
PRODUCTION ACTIVATION: NONE — ayrı owner kapısıdır (GO-OPERATE), bu lane'in kapsamı dışında
RESIDUAL             : Aktivasyon istenirse gereken zincir bilinir: flag + SMTP secret'ları
                       (CREDENTIAL_ENCRYPTION_KEY yapılandırılmış olmalı — fail-closed yazma,
                       bkz. b01 §5) + owner GO. Bu belge o kapıyı AÇMAZ.
```

## 3. PHASE B kesişimi

F-B01-01 düzeltmesi (`/auth/me` projeksiyonu) password-reset akışına dokunmaz: reset akışı
`tokenVersion`'ı DB üzerinden yönetir (session revocation), `/auth/me` yanıtındaki alan
varlığından bağımsızdır. Reset sonrası eski token'ların reddi mevcut spec'lerle kilitlidir
(`auth-tokenversion-revocation.spec.ts`, manifest `:43`).
