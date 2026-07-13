# MPB-028(a) PR-3 — Legal Time Shadow Evidence Activation Runbook

**Durum:** Aktivasyon prosedürü (yalnız local/ofis ortamı)
**Varsayılan:** `LEGAL_TIME_SHADOW_ENABLED` kapalı — production/staging davranışı değişmez

## Amaç

PR-3 ile merge edilmiş shadow-diff altyapısını (`LegalTimeShadowService`,
`LegalTimeShadowController`, `LegalTimeShadowDiff` tablosu) yalnız local/ofis
ortamında, gerçek büro verisiyle çalıştırıp delta evidence
(`legacyDate`/`canonicalDate`/`deltaDays`/`reasonCode`/`calculationVersion`/
`createdAt`) üretmek içindir. Bu prosedür hiçbir production/staging ortamını
hedeflemez ve hiçbir consumer/workflow/scheduler/UI davranışını değiştirmez.

## Ön koşullar

- Yerel API (`project/apps/api`) çalıştırılabiliyor olmalı.
- API sürecinin okuduğu `.env` dosyasında:
  ```
  LEGAL_TIME_SHADOW_ENABLED=true
  ```
  Bu satır **yalnız local/ofis ortamının kendi `.env` dosyasında** eklenir;
  commit edilmez, `.env.example`'a taşınmaz, production/staging konfigürasyonuna
  eklenmez.
- Geçerli bir JWT (mevcut login akışıyla alınan, ilgili tenant'a ait kullanıcı).
- Local Postgres veritabanı gerçek büro verisiyle dolu (bu prosedür veritabanını
  değiştirmez; yalnız `LegalTimeShadowDiff` tablosuna INSERT yapar).

## Adım 1 — Flag'i aç ve API'yi yeniden başlat

`.env` dosyasına `LEGAL_TIME_SHADOW_ENABLED=true` satırını ekleyip API sürecini
yeniden başlat. `LegalTimeShadowService.isShadowEnabled()` yalnız bu ortam
değişkenini okur; başka hiçbir kod yolu (WorkflowEngine, Scheduler,
NotificationQueue, UI, Automation) bu değişkenden etkilenmez.

## Adım 2 — Değerlendirilecek tebligat ID'lerini belirle (salt-okuma)

Legacy hesap yalnız `PAYMENT_ORDER`/`WAITING_RESPONSE` aşamasındaki case'lerin
tebligatları için anlamlıdır (bkz. `legal-time-shadow.service.ts` —
`LEGACY_APPLICABLE_STAGES`). Örnek salt-okuma SQL sorgusu (hiçbir veri
değiştirmez, yalnız Adım 3'te kullanılacak `tebligatId` listesini üretir):

```sql
SELECT t.id AS tebligat_id, t."caseId", c."workflowStage"
FROM "Tebligat" t
JOIN "Case" c ON c.id = t."caseId"
WHERE c."tenantId" = '<tenantId>'
  AND c."workflowStage" IN ('PAYMENT_ORDER', 'WAITING_RESPONSE')
ORDER BY t."createdAt" DESC;
```

## Adım 3 — Her tebligat için shadow-diff'i tetikle

Her `tebligatId` için ayrı ayrı çağır (varsayılan API portu `8080`, `.env`'deki
`PORT` değişkenine göre değişebilir; global prefix `/api` — main.ts'in mevcut
`setGlobalPrefix` ayarı, bu PR'a özgü değildir):

```bash
curl -X POST "http://localhost:8080/api/legal-time-shadow/tebligat/<tebligatId>/compute" \
  -H "Authorization: Bearer <JWT>"
```

Beklenen yanıt (flag açıkken): `{"triggered": true, "diff": { "id": "...",
"legacyDate": "...", "canonicalDate": "...", "deltaDays": ..., "reasonCode": "...",
"calculationVersion": "legal-time-shadow-v1", "createdAt": "..." } }`

Flag kapalıyken (bu prosedürün dışında, örn. yanlışlıkla production'da
çağrılırsa): `{"triggered": false, "diff": null}` — hiçbir satır yazılmaz.

**Bilinçli tasarım:** toplu/otomatik "tüm tebligatları tara" endpoint'i
YOKTUR. Her çağrı tek bir tebligat için, gözlemlenebilir ve owner'ın kapsam
dışı bıraktığı backfill/toplu-otomasyon mekanizmasından ayrıdır — Adım 2'nin
ürettiği liste üzerinde manuel/betik destekli tek tek çağrı yapılır, sistem
kendiliğinden geçmişe dönük taramaz.

## Adım 4 — Evidence Report'u oku

```bash
curl "http://localhost:8080/api/legal-time-shadow/evidence-report" \
  -H "Authorization: Bearer <JWT>"
```

Yanıt: `{"totalCount", "zeroDeltaCount", "nonZeroDeltaCount", "unresolvedCount",
"records": [...] }` — `records` alanı tenant'a ait TÜM kayıtları içerir (Owner
Decision 8: sayfalama/ilk-N limiti yok). `deltaDays` alanı ham sayıdır; hiçbir
severity/kategori etiketi taşımaz (Owner Decision 7) — "bu delta önemli mi"
değerlendirmesi bu raporun dışında, owner/hukuk kararına aittir.

## Adım 5 — Kapat / geri al

`.env` dosyasından `LEGAL_TIME_SHADOW_ENABLED` satırını kaldır (veya `false`
yap) ve API'yi yeniden başlat. `LegalTimeShadowDiff` tablosundaki birikmiş
kayıtlar evidence olarak veritabanında kalır (silinmez); hiçbir legacy
tablo/consumer bu prosedürden etkilenmediği için ayrıca geri alınacak bir
davranış değişikliği yoktur.

## Kapsam dışı (bu prosedürün açıkça YAPMADIĞI şeyler)

- Hiçbir consumer (`WorkflowEngine`, Scheduler, `NotificationQueue`, UI,
  `AutomationPanel`) cutover'ı yapmaz — bkz. PR-4/PR-5.
- Hiçbir sabit +7 gün hesabını (`debtor.service.ts` `finalizationDate`,
  `FinalizationCountdown`) değiştirmez.
- Hiçbir backfill veya toplu-otomatik-tarama script'i içermez.
- Hiçbir production/staging ortamını hedeflemez veya bu ortamlara flag
  taşımaz.
- `objectionPeriodDays` tahmin etmez; yalnız `LegalDeadlineService`'in
  kanıtlı/caller-supplied girdiden ürettiği sonucu okur.
