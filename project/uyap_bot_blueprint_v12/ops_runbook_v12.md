# ops_runbook_v12.md
## 1) Günlük kontrol
- Job Monitor: failed/quarantined işlere bak
- Locks Dashboard: açık kilitleri temizle (avukat onayı/ödeme teyidi vs.)
- UI Map health: element bulunma oranı düşmüşse degradated mode aç

## 2) Sık Hata Senaryoları
### Element bulunamadı (UI değişmiş olabilir)
- UI Map registry -> ilgili screen -> locator düzelt
- 1 dosyada dry-run validate
- sonra recipe enable

### Mazbata gecikmesi
- FetchPreparedETebligatlar_Debtor snapshot kontrol
- MazbataSorgula retry
- 3 gün üstü: avukat onayı iste (manuel kontrol)

### Tahsilat net negatif
- ComputeRealDistribution çıktısını incele
- Muhasebe kayıtları / reddiyat kontrol
- Anomali A1 tetiklenir; InvestigateAccounting task açılır

## 3) Degraded Mode
- write tasks disabled
- read-only sync devam
- kullanıcıya banner: "UYAP ekran değişmiş olabilir"

## 4) Rollback
- Recipe registry -> önceki version -> rollback
- Params registry -> active bundle -> önceki -> promote
