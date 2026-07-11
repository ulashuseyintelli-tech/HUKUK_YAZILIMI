# PR-A4-0 Rich Interest / UYAP Readiness Inventory

Bu araç, bir tenant içindeki `ClaimItem` rich-faiz bütünlüğünü ve mevcut iki UYAP exporter karşısındaki readiness durumunu ölçen salt-okunur diagnostiktir. Mapping otoritesi, export/submit yetkisi, backfill veya cutover yetkisi üretmez.

## Güvenlik sözleşmesi

- `--tenant` ve `--mode` zorunludur; all-tenant modu yoktur.
- Tek transaction `READ ONLY` ve `REPEATABLE READ` olarak açılır.
- SQL yüzeyi yalnız `SELECT`/CTE kullanır; mutation/apply/rollback modu yoktur.
- Detaylı çıktı açıklama veya ham metadata içermez.
- Sayfalama `ClaimItem.id` keyset'iyle bounded ve deterministiktir.
- Gerçek tenant çalıştırması ayrı owner/operasyon yetkisi gerektirir.

## Çalıştırma

Özet JSON:

```text
pnpm --filter @hukuk/api inventory:rich-interest-uyap -- --tenant <tenantId> --mode summary
```

Sanitize edilmiş NDJSON bulguları ve son özet:

```text
pnpm --filter @hukuk/api inventory:rich-interest-uyap -- --tenant <tenantId> --mode detailed --page-size 250
```

`page-size` 1–1000 aralığındadır. Çıktı yalnız stdout'a yazılır.

## Yorumlama sınırları

`UYAP_READY_EXACT`, yalnız mevcut iki exporter'ın gözlenen legacy projection sonucunun eşdeğer olduğunu gösterir. Owner tarafından kabul edilmiş exact rich-code → UYAP-code tablosu anlamına gelmez. Mevduat vadesi yalnız açık metadata provenance işaretlerinden raporlanır; tarih, oran veya vade süresinden türetilmez.

PR-A4 bu envanter ve exact mapping kabulü tamamlanana kadar blocked kalır. PR-A5, backfill ve cutover bu araç tarafından yetkilendirilmez.

## Bu teslimde operasyonel durum

Gerçek tenant inventory çalıştırması yapılmadı. Araç yalnız sentetik testlerle doğrulandı; canlı sonuç, kayıt sayısı veya dağılım iddiası yoktur.
