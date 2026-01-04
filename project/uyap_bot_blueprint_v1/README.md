# UYAP Bot Blueprint (v1)

Bu klasörde 3 şey var:

1) recipes_v1.yaml
   - Botun "ne zaman, hangi ekrana gidip, ne okuyup, ne yapacağı" tarifleri (recipe).

2) rules_params.yaml
   - Süreler, eşikler, periyotlar. Mevzuat/iş kuralı değişince burada güncellersin.

3) ui_map.yaml
   - Botun ekran elementlerini bulması için mantıksal anahtarlar (locators).
   - Gerçek selector/locator bağlama işi RPA katmanında.

Çalışma prensibi:
- Orchestrator recipes_v1.yaml okur, trigger koşullarına göre görev kuyruğu üretir.
- UI Worker ui_map.yaml üzerinden UYAP ekranlarını açar/okur/aksiyon alır.
- Rules params ile tarih/threshold hesaplar.
- Her adım audit log üretir (kanıt + hata görüntüsü).

Not:
- e-tebligat için 5 gün "tebliğ sayılma" kuralı recipes/rules içinde parametreli verildi.
