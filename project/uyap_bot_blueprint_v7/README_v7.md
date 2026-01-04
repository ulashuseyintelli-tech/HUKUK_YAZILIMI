# UYAP Bot Blueprint (v7)

v7 ekleri:
1) Lien sonrası tahsilat stratejisi (DecidePostLienStrategy_Vehicle)
   - rank, risk, expected_net ile "yakalama+satış / satış / bekle" kararını üretir.

2) Pasif haciz temizliği (DetectInactivePriorLiens_Vehicle + PruneInactiveLienFacts)
   - Ön hacizler pasif olduysa fact'leri pasife çeker, risk hesabını iyileştirir.

3) Ön haciz tutarı çıkarımı (InferPriorLienAmounts_Heuristic)
   - Tutar bilinmiyorsa değer mid üzerinden kaba tahmin üretir (confidence düşük).
   - Ardından risk/net getiri hesaplarını yeniden tazeler.

Dosyalar:
- recipes_v7_extensions.yaml
- ui_map_v7.yaml

Tarih: 2026-01-04
