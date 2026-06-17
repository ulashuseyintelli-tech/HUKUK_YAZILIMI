# Faz 4 — Client Intake Link / Secure External Form / Review Queue — Tasarım (DESIGN-ONLY)

> **Ana cümle:** Müvekkilden güvenli dış-form linkiyle bilgi topla; gelen hiçbir şey **doğrudan** dosya verisi olmaz — önce **inceleme kuyruğuna** (`CLIENT_SUBMITTED`) düşer, personel onaylayınca kanonik modele yazılır.
> **Durum:** Tasarım taslağı — **KOD YOK, MIGRATION YOK, ENDPOINT YOK.** İnceleme + onay sonrası alt-faz alt-faz uygulanır.
> **İlgili:** [client-intel-form-design.md](client-intel-form-design.md) (Faz 1 — bu, onun **dışa-açık toplama katmanı**) · [client-finance-phase3-mail-plan.md](client-finance-phase3-mail-plan.md) (link teslimi mail dispatcher ile)

## 0. EN KRİTİK KURAL — dış veri ≠ kanonik veri
**Dış formdan gelen bilgi doğrudan kesin dosya verisi olmaz.** Her gönderim önce **`CLIENT_SUBMITTED`** statüsünde **inceleme kuyruğuna** düşer. Personel **tek tek** inceleyip onaylar → ancak o zaman kanonik modele (Faz 1 yönlendirmesi: `ClientIntelStatement` / `DebtorAddress(source=CLIENT)` / `Asset` / iletişim) yazılır. Onaylanmayan veri **kanonik tarafa sızmaz**. Bu ayrım bozulursa müvekkilin (veya kötü niyetli birinin) girdiği ham metin doğrudan "doğrulanmış dosya verisi" gibi davranır → felaket.

## 1. DO-NOW / HOLD sınırı
```
Güvenli link + dış form + inceleme kuyruğu + onaylı promosyon   =  DO-NOW
Cross-case yayma / Party / otomatik kimlik eşleştirme / oto-merge =  HOLD
```
- **YAPILIR:** tokenli link üret, dış formu doldur, `ClientIntakeSubmission` (CLIENT_SUBMITTED) yaz, personel review → approve/reject → onaylıyı Faz 1 kanonik hedefe promote et.
- **YAPILMAZ:** gönderimi otomatik onaylama · başka dosyalara yayma · MERNİS/SGK ile birleştirme · Party kimlik kartı · borçluya otomatik bağlama. (Hepsi [client-intel-form-design.md](client-intel-form-design.md) HOLD'u ile aynı.)

## 2. Akış (kavramsal)
```
Personel "intake linki oluştur" (case+client kapsamlı, süreli token)
   → mail dispatcher (Faz 3, yeni şablon INTAKE_LINK) ile müvekkile gönder
       → Müvekkil linke girer (AUTH YOK; yalnız token), formu doldurur
           → ClientIntakeSubmission (status=CLIENT_SUBMITTED) + ham alanlar
               → REVIEW QUEUE (personel görür)
                   → personel alan alan onaylar/reddeder
                       → onaylı → Faz 1 kanonik hedefe PROMOTE (ClientIntelStatement/DebtorAddress/Asset/iletişim)
                       → reddedilen → REJECTED (silinmez, denetim izi)
```
**Hiçbir adım kanoniğe otomatik yazmaz.** Promote = açık personel aksiyonu.

## 3. Ana modeller (taslak — alanlar alt-faz planında kesinleşir)
```
ClientIntakeLink {
  id, tenantId, caseId, clientId,
  tokenHash,              // opak token'ın HASH'i (ham token DB'de tutulmaz — §5)
  status,                 // ACTIVE | USED | EXPIRED | REVOKED
  scope,                  // hangi kategoriler isteniyor (intel/adres/varlık/iletişim)
  expiresAt, maxUses, useCount,
  createdById, createdAt
}
ClientIntakeSubmission {
  id, tenantId, intakeLinkId, caseId, clientId,
  status,                 // CLIENT_SUBMITTED | IN_REVIEW | PARTIALLY_PROMOTED | COMPLETED | REJECTED
  submittedAt, reviewedById, reviewedAt,
  sourceMeta,             // ip/ua özet (güvenlik/denetim; PII-min)
  createdAt
}
ClientIntakeField {          // gönderimin tek alanı — immutable ham beyan
  id, submissionId,
  category,               // INCOME_SOURCE | ADDRESS | ASSET | CONTACT | ... (Faz 1 kategorileri)
  label, value, note,
  reviewStatus,           // PENDING | APPROVED | REJECTED
  reviewNote, promotedRefType, promotedRefId,   // onaylanınca yazıldığı kanonik kayıt
  createdAt
}
```
- Tümü `tenantId` taşır. `ClientIntakeField` ham beyan **immutable** (Faz 1 append-only ilkesi); review yalnız `reviewStatus`/`promotedRef` lifecycle damgası.

## 4. Kanonik promosyon (Faz 1 yönlendirmesi — anti-tekrar)
Onaylanan alan, kategorisine göre **mevcut kanonik modele** yazılır (yeni paralel depo yok):
- ADDRESS → `DebtorAddress(source=CLIENT)` *(mevcut)*
- ASSET → `Asset` *(mevcut)*
- CONTACT → `Debtor`/`DebtorCommunication` veya client iletişim *(mevcut)*
- Yumuşak istihbarat (gelir/ticari/aile/dijital/strateji) → `ClientIntelStatement` *(Faz 1 — henüz kodlanmadıysa ÖN KOŞUL; §7)*
- `source=CLIENT_DECLARATION`, `confidence=DECLARED` (Faz 1 ile birebir).

## 5. Güvenlik (dış-açık yüzey — kritik)
- **Token:** opak, yüksek-entropi; DB'de **yalnız hash** (tokenHash) saklanır, ham token tek sefer linkte. Sızıntıda DB'den token çıkarılamaz.
- **Kapsam + süre:** link tek case+client'a bağlı, `expiresAt` + `maxUses`. Süre/limit dolunca form kapanır.
- **AUTH YOK ama yetkisiz veri YOK:** form endpoint'i public (müvekkil login olmaz) ama yalnız geçerli token'ın case+client'ına yazar; başka veri okunmaz/yazılmaz.
- **Rate-limit + abuse koruması:** submit hızına sınır; bot/spam'e karşı (captcha kararı §8).
- **PII minimizasyonu:** sourceMeta'da ham IP yerine özet/hash; form sadece istenen kategorileri sorar.
- **Denetim izi:** link oluşturma/gönderim/submit/review hepsi loglanır; reddedilen submission silinmez.
- **Promote guard:** yalnız tenant personeli, yalnız kendi tenant'ının submission'ını promote eder.

## 6. Mevcutla ilişki (reuse, paralel sistem yok)
- **Link teslimi:** Faz 3 `NotificationDispatcherService` + yeni `INTAKE_LINK` şablonu (mevcut mail hattı; best-effort, dedupeKey).
- **Portal:** mevcut `ClientPortalUser`/`PortalNotification` **AUTH'lu portal**; bu ise **tokenli dış form** (login yok). Karışmaz; portal entegrasyonu HOLD/sonraki (§8 kararı).
- **Promote hedefi:** Faz 1 `ClientIntelStatement` + mevcut DebtorAddress/Asset.

## 7. Ön koşullar
- **Faz 1 `ClientIntelStatement` kodlanmış olmalı** (promote'un yumuşak-istihbarat hedefi). Faz 1 şu an yalnız TASARIM (kod yok). → Faz 4'ten ÖNCE veya birlikte Faz 1 backend (ClientIntelStatement) gerekir. Bu, alt-faz sıralamasında ele alınır (§9).
- Adres/varlık/iletişim hedefleri zaten mevcut.

## 8. Açık kararlar (alt-faz planlarından önce)
| # | Karar | Not |
|---|---|---|
| F4-K1 | Submission **alan-bazlı** mı onaylanır (her field ayrı), gönderim-bazlı mı toptan? | Öneri: **alan-bazlı** (kısmi promote; PARTIALLY_PROMOTED) |
| F4-K2 | Link **tek-kullanım** mı, çok-kullanım mı (maxUses)? | Öneri: çok-kullanım + expiry; tek-kullanım opsiyon |
| F4-K3 | Bot koruması: captcha/turnstile gerekli mi? | Öneri: rate-limit + basit honeypot; captcha sonraki |
| F4-K4 | Dış form **frontend** nerede (ayrı public route)? | Tasarımda yer tutulur; frontend ayrı alt-faz |
| F4-K5 | `ClientIntelStatement` (Faz 1) bu hat için önce mi kodlanır? | Öneri: **evet** — Faz 4.0 = Faz 1 backend |
| F4-K6 | Promote işlemi mevcut DebtorAddress/Asset yazımını mı çağırır (servis reuse)? | Öneri: mevcut servisleri reuse (anti-tekrar) |

## 9. Faz planı (Faz 4 içi — her biri ayrı plan→onay→kod)
| Alt-faz | İçerik |
|---|---|
| 4.0 | (ön koşul) Faz 1 `ClientIntelStatement` backend (promote hedefi) |
| 4.1 | **Bu tasarım** (kod yok) |
| 4.2 | Backend model + migration: `ClientIntakeLink`/`Submission`/`Field` (additive) |
| 4.3 | Link üretimi + tokenHash + `INTAKE_LINK` mail (Faz 3 dispatcher) |
| 4.4 | Public submit endpoint (tokenli, rate-limit, CLIENT_SUBMITTED yazımı) |
| 4.5 | Review queue API (personel: list/review/approve/reject) |
| 4.6 | Promote: onaylı alanı kanonik modele yaz (servis reuse, alan-bazlı) |
| 4.7 | Dış form frontend (public route) + review UI |
| 4.8 | HOLD: cross-case yayma · Party · captcha · portal entegrasyonu |

## 10. Özet
- **Omurga:** dış veri kanoniğe doğrudan yazmaz → `CLIENT_SUBMITTED` review queue → personel onayı → promote.
- **Anti-tekrar:** promote mevcut kanonik modellere (DebtorAddress/Asset/ClientIntelStatement) yazar; paralel depo yok.
- **Güvenlik:** tokenHash + expiry + scope + rate-limit + denetim izi; public ama yetkisiz veri yok.
- **Ön koşul:** Faz 1 ClientIntelStatement backend (4.0).
- **Sonraki adım:** Bu doküman onaylanınca **4.0/4.2** için ayrı plan + onay. **Bu fazda kod yok.**
