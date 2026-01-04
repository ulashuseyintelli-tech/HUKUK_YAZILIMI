# UYAP Bot Blueprint (v6)

v6 ekleri:
- recipes_v6_extensions.yaml
  - ComputeOurLienRank_Vehicle
  - CheckPriorLiensActive_Vehicle
  - AnalyzeIK100ParticipationRisk
  - PlaceLien_Vehicle (haciz koyma)
  - DecideYakalamaAvansiFlow (rank=1 ise avans akışı, rank>1 ise iştirak riski)

- ui_map_v6.yaml: araç haciz ekleme form anahtarları

Not:
- PlaceLien_Vehicle yüksek etkili aksiyon olduğu için gate/lock şartlarına bağlı çalışır.
- Bu aşamada form alanları örnek verilmiştir; UYAP ekranındaki alan adlarına göre ui_map'te mapping yapılır.

Tarih: 2026-01-04
