# Faz 4.4 — Public Submit (tokenli dış form) — Uygulama Planı (PLAN-ONLY)

> **Durum:** Uygulama planı. **KOD YOK.** **Önkoşul: #162 (4.2 modelleri) + 4.3 (link üretimi/token) MERGED olmadan bu PR'ın koduna GEÇİLMEZ.** Beklerken hazırlanır.
> **Kaynak:** [client-intake-link-design.md](client-intake-link-design.md) · [client-intake-phase43-link-mail-plan.md](client-intake-phase43-link-mail-plan.md)
> **Kapsam:** İlk **PUBLIC (AUTH'suz)** uç. Müvekkil token'lı linke girer → form → `ClientIntakeSubmission`/`Field` (CLIENT_SUBMITTED) → review queue. Review (4.5) / promote (4.6) DEĞİL.

## 0. Sınır (Faz 4 omurgası)
- **Dış veri DOĞRUDAN kanonik OLMAZ:** submit yalnız `CLIENT_SUBMITTED` yazar. Promote = 4.6 (personel onayı).
- **Public uç hiçbir mevcut veriyi OKUTMAZ** (case/debtor/borç detayı sızmaz). Yalnız link.scope kategorilerini sorar, yalnız o link'in case+client'ına YAZAR.
- **AUTH yok ama tenant token'dan:** tenantId/caseId/clientId **link kaydından** alınır, asla istemci girdisinden.

## 1. Public endpoint'ler (JWT YOK)
| Method | Path | İş |
|---|---|---|
| GET | `/public/intake/:token` | token doğrula (ACTIVE+süre+limit) → **form şeması** döndür (yalnız scope kategorileri + jenerik başlık). PII YOK. |
| POST | `/public/intake/:token` | token doğrula → **atomik** limit kontrol → `ClientIntakeSubmission`(CLIENT_SUBMITTED)+`Field`'lar yaz → link useCount++/USED. Yanıt: sade başarı (veri yok). |
> Bu uçlar global JWT guard'ın **dışında** (public route). Ayrı `@Public()`/route prefix; mevcut korumalı API'ye karışmaz.

## 2. Token doğrulama
- Gelen token → `sha256` → `ClientIntakeLink` where `tokenHash` (index'li). Bulunamazsa **404 generic** (enumerasyon'a ipucu verme).
- Geçerlilik: `status=ACTIVE` **ve** (`expiresAt` null veya gelecekte) **ve** `useCount < maxUses`. Aksi → generic "link geçersiz/süresi dolmuş".
- Bulunan link'in `tenantId/caseId/clientId`'si **otoriter** (istemci bunları göndermez/değiştiremez).

## 3. Submit akışı (atomik, replay-safe)
```
1) token→tokenHash→link (ACTIVE/süre/limit guard)
2) ATOMİK: UPDATE ClientIntakeLink
     SET useCount=useCount+1,
         status = CASE WHEN useCount+1 >= maxUses THEN 'USED' ELSE status END
     WHERE id=? AND status='ACTIVE' AND useCount<maxUses
     → etkilenen satır 0 ise: yarış/aşım → reddet (409/410 generic)
3) ClientIntakeSubmission (CLIENT_SUBMITTED, sourceMeta) + Field[] (tek transaction)
4) yanıt: { ok:true } (id bile opsiyonel; veri yok)
```
- Adım 2'deki **koşullu UPDATE** replay/çift-submit'i `maxUses` ile DB seviyesinde kapatır (race yok).

## 4. Girdi doğrulama / sertleştirme
- Her field.category **link.scope içinde olmalı** (değilse reddet) — scope dışı kategori yazılamaz.
- `value` uzunluk limiti (örn. ≤4000 char), submission başına **max field** (örn. ≤50). Aşım → reddet.
- `label`/`note` opsiyonel, uzunluk limiti.
- Değerler **ham metin** olarak saklanır; XSS frontend escape ile (depo katmanı çalıştırmaz). HTML/script işlenmez.
- **Honeypot** gizli alan dolu ise sessiz drop (bot). (44-5)

## 5. Rate-limit / abuse
- Public uçlara **rate-limit** (IP + token bazlı): GET ve POST için ayrı eşik. Başarısız token denemesi **agresif throttle** (brute-force/enumerasyon savunması).
- Mekanizma 44-2 (mevcut throttler varsa reuse).
- Captcha → **4.8 HOLD**; bu fazda honeypot + rate-limit.

## 6. Güvenlik / PII
- **Ham token hiçbir app log'una yazılmaz** (maskeli). Path'te token var → uygulama logger'ında maskelenir; reverse-proxy access-log'u için not (44-6).
- `sourceMeta`: IP **hash** + UA özeti (ham IP YOK) — denetim/abuse analizi için.
- Yanıtlar **generic** (link var/yok ayrımını sızdırmadan): geçersiz token / süre / limit hepsi benzer mesaj.
- Public uç hiçbir mevcut kaydı dönmez; yalnız yazar.

## 7. Endpoint güvenlik notu (mevcut API'ye etki)
- Public route, global `AuthGuard('jwt')`'ın dışında olacak şekilde izole (ayrı controller + `@Public` veya guard'sız). **Mevcut korumalı uçlar etkilenmez.**
- `trust proxy` zaten ayarlı (CI-4 gate) → gerçek IP için.

## 8. Test planı
**Unit:** token geçerli→form şeması (yalnız scope, PII yok) · geçersiz/expired/limit-dolu token→generic red · submit scope-dışı kategori reddi · value/field limit aşımı reddi · honeypot→drop · atomik limit (maxUses aşımı 2. submit reddi).
**E2e (canlı DB):** link(4.3'le ya da raw) → GET form → POST submit → `ClientIntakeSubmission`=CLIENT_SUBMITTED + Field'lar yazıldı + useCount++ · maxUses dolunca link USED + sonraki submit reddi (atomik) · **submit hiçbir kanonik tabloya yazmadı** (DebtorAddress/Asset/ClientIntelStatement değişmedi) · sourceMeta ham IP içermiyor · cross: başka token'ın case'ine yazılamıyor. Temizlenir.
**Negatif:** public uç mevcut korumalı veriyi DÖNMÜYOR; token app-log'una düşmüyor.

## 9. Bu PR'da YOK
review queue API (4.5) · promote (4.6) · frontend formun kendisi (4.7; bu PR yalnız form ŞEMASI + submit API) · captcha (4.8) · kanonik yazım · cross-case/Party.

## 10. Micro-kararlar — ✅ ONAYLANDI (Ulaş, 2026-06-17; kodlama #162+4.3 merge'e bağlı)
| # | Karar | Sonuç |
|---|---|---|
| 44-1 | GET form PII? | ✅ **Hayır** — jenerik başlık + scope kategorileri; PII yok |
| 44-2 | Rate-limit | ✅ mevcut throttler reuse / yoksa minimal custom, **IP+token bazlı** |
| 44-3 | caps | ✅ value ≤4000 char, ≤50 field/submission |
| 44-4 | limit atomikliği | ✅ **koşullu UPDATE** (uygulama-seviyesi kontrol YETMEZ) |
| 44-5 | honeypot | ✅ bu fazda; captcha HOLD (4.8) |
| 44-6 | token path → log | ✅ **app-log maskele** + proxy/access-log için ayrı **ops notu** |

> **DURUM:** Plan + kararlar prensipte onaylı AMA **#162 + 4.3 MERGED olmadan 4.4 KODUNA GEÇİLMEZ.** Kararlar kayıtlı; kodlama merge sonrasına ertelendi.
