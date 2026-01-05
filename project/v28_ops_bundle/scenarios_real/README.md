# İlk 3 gerçek senaryo (Harness fixtures)

Her senaryo:
- events/*.json
- expected_timeline.json (boş -> --update-golden ile üret)
- expected_actions.json  (boş -> --update-golden ile üret)

Çalıştırma:
- python manage.py run_scenarios --dir scenarios_real --pack uyap_default --update-golden
- sonra:
  python manage.py run_scenarios --dir scenarios_real --pack uyap_default
