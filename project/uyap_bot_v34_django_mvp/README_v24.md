# UYAP Bot v24 – Decision Rules Bundle (DB-backed)

Yeni:
- decision_rules artık hardcode mapping değil.
- ParamBundle içinde `bundle_kind='decision_rules'` olan ACTIVE içerik kullanılır.
- core/decision_rules_loader.py: ACTIVE decision_rules yükler
- core/decision_engine.py: çok basit evaluator (fact:TYPE -> enqueue recipes)
- runner: extractor Fact ürettiğinde decision engine çağırır.

Kurulum:
1) python manage.py migrate (ParamBundle'da bundle_kind alanı için migrate gerekir)
2) Admin'den ParamBundle oluştur:
   - name: decision_rules_v1
   - bundle_kind: decision_rules
   - content: core/example_decision_rules.yaml içeriği
   - status: active (veya promote)
3) Artık Fact üretilince kurallara göre job enqueue olur.

Tarih: 2026-01-04
