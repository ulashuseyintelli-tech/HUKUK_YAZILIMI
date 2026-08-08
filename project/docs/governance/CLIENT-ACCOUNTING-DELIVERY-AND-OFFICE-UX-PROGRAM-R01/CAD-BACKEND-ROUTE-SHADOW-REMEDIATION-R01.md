# CAD-BACKEND-ROUTE-SHADOW-REMEDIATION-R01 — TEK-KUSUR POST-CLOSURE ONARIMI

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    CAD-BACKEND-ROUTE-SHADOW-REMEDIATION-R01     LANE OWNER: CLAUDE
AUTHORIZATION: OWNER SCOPED GO (2026-08-08) — C1-B03 UAT blocker'ına bağlı, TEK dosya,
              TEK kusur; C3 programı BÜTÜNÜYLE YENİDEN AÇILMAZ.
TRIGGER:      C1-B03 UAT (route-shadow blocker) — bkz. bu dizin, UAT bulgusu.
SCOPE LOCK:   backend route precedence — başka HİÇBİR şey.

ALLOWED PATHS (exact):
  project/apps/api/src/modules/client/client.module.ts     (yalnız `controllers` dizi SIRASI)
  project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/  (bu sayfa)

FORBIDDEN:
  controller/service/DTO gövde değişikliği · route string/path değişikliği · şema/migration ·
  frontend (client-compliance/**) · listedeki üç dışında başka :id çakışmasına scope genişletme ·
  C2'nin yeniden açılması.
```

---

## 1. TEK KUSUR

`ClientController` (`@Controller('clients')`) modülde ([client.module.ts](../../../apps/api/src/modules/client/client.module.ts)) dedicated
compliance controller'larından **önce** kayıtlıydı. `ClientController`'ın
`@Get(':id')` catch-all'u ([client.controller.ts:325](../../../apps/api/src/modules/client/client.controller.ts)) her tek-segment
path'i yakalar. NestJS controller'ları `controllers` dizisi sırasıyla kaydettiğinden, **sonra**
kaydedilen üç tek-segment statik collection route'u gölgelenip erişilemez hale geliyordu:

- `GET /clients/disclosure-texts`        (client-kvkk-rights.controller.ts:114)
- `GET /clients/data-subject-requests`   (client-kvkk-rights.controller.ts:157)
- `GET /clients/legal-holds`             (client-legal-hold.controller.ts:81)

## 2. KANIT (canlı, çalışan API :8080, demo-firma admin token)

- Üç route da `404 {"message":"Müvekkil bulunamadı"}` döndürüyordu = `ClientController.findOne`
  (`@Get(':id')`) NotFoundException'ı → istek `:id` handler'ına düşüyordu, kendi handler'ına değil.
- Çok-segmentli dedicated route'lar ÇALIŞIYORDU: `GET /clients/:id/disclosure-deliveries`→`200 []`;
  `POST /clients/data-subject-requests/:id/start-review`→`404 "Başvuru bulunamadı"` (servis);
  `POST /clients/:id/legal-holds`→`400` DTO validation. → Controller'lar YÜKLÜ; kusur yalnız
  tek-segment collection GET precedence'ı.
- Frontend belgelenen yolları çağırıyor (client-compliance.ts:77/126/152) → **C2 kusursuz**,
  fail-closed doğru. Kusur %100 backend routing.
- Redeploy tek başına çözmez: gölge güncel kaynakta da yapısaldı (aynı modül sırası + `:id`).

## 3. FIX (uygulandı)

`client.module.ts` `controllers` dizisinde `ClientKvkkRightsController` + `ClientLegalHoldController`
`ClientController`'DAN ÖNCE kaydedildi. Route string'leri değişmedi. İki controller'ın bare
tek-segment `:param` GET'i yoktur (route'lar literal statik veya static-prefix'li multi-seg) →
`ClientController`'ın kendi route'larına (`GET /clients`, `GET /clients/:id`, `lifecycle-eligibility`,
timeline/action-catalog/operating-snapshot) yeni gölge GELMEZ; gerçek client id literal statiklere uymaz.

## 4. ACCEPTANCE GATE (hepsi zorunlu — karşılanmadan C1-B03'e KABUL VERİLMEZ)

1. **Canlı prob:** üç list GET'i kendi dizi şeklini `200` döndürür, `404 "Müvekkil bulunamadı"` DEĞİL.
2. **Regresyon:** `GET /clients`, `GET /clients/:id`, `GET /clients/lifecycle-eligibility`,
   `:id/timeline`, `:id/action-catalog`, `:id/operating-snapshot` değişmemiş.
3. **Kanonik:** fix main'e merge (PR + SHA) + güncel artifact redeploy (stale/mojibake dist de düzelir).
4. **C1-B03 UAT tekrar:** happy-path (DSAR `RECEIVED→IN_REVIEW→RESPONDED`; legal-hold
   `place→request-release→approve-release`; deletion-evaluation 8-koşullu gate) + fail-closed +
   tenant izolasyonu + rol sınırları → PASS.

**BLOCK RESULT:** `ENGINEERING_COMPLETE` (kod) → gate 1-4 sonrası C1-B03 `RUNTIME_VERIFIED`.
