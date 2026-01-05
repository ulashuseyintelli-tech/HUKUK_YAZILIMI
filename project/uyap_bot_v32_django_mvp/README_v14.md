# UYAP Bot v14 – DB-backed Bundles + Audit Export

Yeni:
- RecipeBundle/ParamBundle/UiMapBundle modelleri (Admin'den düzenlenebilir)
- /api/bundles/* endpoint'leri + promote (ACTIVE yapma)
- Audit export: /api/audit-export/{case_id}/export/ -> zip üretir (exports klasörüne)

Hızlı test akışı:
1) migrate
2) Admin'den 3 bundle oluştur:
   - recipe: örn v2 recipes (ensure/sync vs.)
   - params: rules_params_v2
   - uimap: ui_map_v2
3) Her birini POST /api/bundles/.../{id}/promote ile ACTIVE yap
4) Case oluştur
5) /api/audit-export/{case_id}/export/ çağır -> zip path + hash döner

Tarih: 2026-01-04
