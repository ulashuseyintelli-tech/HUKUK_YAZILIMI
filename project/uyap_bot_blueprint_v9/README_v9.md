# UYAP Bot Blueprint (v9)

v9 ekleri:
1) Tahsilat dağıtım simülatörü (tahsilat_distribution_v9.yaml)
   - Ön haciz/rehin + sıra + masraf -> "bizim dosya ne görür?" hesaplar.

2) Satış sonrası akış
   - MonitorSaleToCompletion (sale completed event)
   - SimulateTahsilatDistributionAfterSale
   - MonitorTahsilatAfterSale

3) Borçlu davranış skoru (debtor_behavior_score_v9.yaml)
   - tebligat açma, kısmi ödeme, varlık sinyali vb. ile sınıflandırma.

Dosyalar:
- recipes_v9_extensions.yaml
- tahsilat_distribution_v9.yaml
- debtor_behavior_score_v9.yaml
- ui_map_v9.yaml

Tarih: 2026-01-04
