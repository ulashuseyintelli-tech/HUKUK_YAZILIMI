# UYAP Bot Blueprint (v2)

v2 yenilikleri:
1) İcra türüne göre parametre override
   - rules_params_v2.yaml içinde kesinleşme/itiraz süreleri icra_type bazında override edilebilir.

2) Borçlu bazlı paralel işleme (debtor-scoped tasks)
   - recipes_v2.yaml içinde scope: debtor olan görevler, her borçlu için ayrı job olarak çalışır.
   - parallelism parametreleri: debtor_concurrency, per_case_concurrency

Dosya yapısı:
- recipes_v2.yaml
- rules_params_v2.yaml
- ui_map_v2.yaml
