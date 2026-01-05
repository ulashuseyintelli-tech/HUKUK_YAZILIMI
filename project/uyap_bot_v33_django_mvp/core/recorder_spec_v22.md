# Recorder Mode (v22) – UiMap Selector Collector Spec

Amaç: UiMap locator_bindings üretimini hızlandırmak.

MVP yaklaşımı:
- Playwright ile sayfada hover/click ile element seçilir
- Elementin:
  - css selector (best-effort)
  - text
  - role
  - attributes (id/name/class)
  kaydedilir
- Kullanıcı bu elementi bir logical key ile etiketler (örn BTN_SORGULA)
- Çıktı: YAML snippet
  locator_bindings:
    buttons:
      BTN_SORGULA: "css=..."
- "Screens" kısmı için nav_path + menu_clicks da üretilebilir.

Not:
- UYAP gibi dinamik sistemlerde 'stable' selector bulmak zor.
- Recorder 'suggests', son karar insanda.
