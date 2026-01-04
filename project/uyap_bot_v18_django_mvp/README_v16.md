# UYAP Bot v16 – Minimal Recipe Runner Loop

Yeni:
- core/recipe_runner.py:
  - ACTIVE bundles (recipe/params/uimap) yükler
  - job.recipe_id -> recipe bulur
  - recipe_meta snapshot + actions listesi için step log üretir
  - şu an UI yok: actions 'stub_executed' olarak kayıt altına alınır

- core/tasks.py:
  - run_job artık runner'ı çağırıyor

Test:
1) ACTIVE RecipeBundle içine 'recipes' listesi olan bir YAML koy
   Örn:
   recipes:
     - recipe_id: EnsureUYAPSession
       version: 1
       uyap_nav_path: ["(session)"]
       actions:
         - type: query
           input: {}
2) schedule tick çalışınca job yaratır ve runner step'leri yazdırır.

Tarih: 2026-01-04
