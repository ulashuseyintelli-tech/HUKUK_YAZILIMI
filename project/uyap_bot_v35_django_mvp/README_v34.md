# UYAP Bot v34 – Recorder v2 (multi-selector + auto-section + click-test)

Yeni:
1) UiMapRecording.alternatives (liste) eklendi.
2) Recorder artık birkaç selector adayı üretir:
   - text=...
   - css=#id
   - css=[name='...']
   - css=.class (ilk sınıf)

3) Approve API iyileşti:
   - section otomatik tahmin (BTN_/FIELD_/TABLE_ öneklerine göre)
   - alt_index ile alternatif seçimi

4) Click test API:
   - POST /api/recorder-test/click_test/ {selector, base_url}
   - selector tıklanabilir mi test eder ve SelectorHealthLog'a yazar.

Not:
- alternatives alanı için migrate gerekir.

Tarih: 2026-01-05
