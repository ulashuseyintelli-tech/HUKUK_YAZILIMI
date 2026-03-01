# İcra Dosyası Toplu Import — Excel Sütun Şablonu

> Mevcut icra programından Excel rapor alıp bu şablona uyarlayarak toplu giriş yapılabilir.
> Her satır = 1 icra dosyası. Aynı dosyada birden fazla borçlu varsa, her borçlu için ayrı satır.

---

## SÜTUNLAR

### A) DOSYA BİLGİLERİ (Zorunlu)

| Sütun | Açıklama | Örnek | Zorunlu |
|-------|----------|-------|---------|
| `dosya_no` | Büro dosya numarası | 2024/1234 | ✅ |
| `icra_dosya_no` | İcra dairesi dosya numarası | 2024/56789 | ❌ |
| `icra_dairesi` | İcra dairesi adı (sistemdeki 860 daireden eşleşir) | İstanbul 5. İcra Dairesi | ❌ |
| `takip_tarihi` | Takip başlangıç tarihi (GG.AA.YYYY) | 15.03.2024 | ❌ |
| `takip_turu` | GENERAL_EXECUTION, CHECK, BOND, RENTAL, MORTGAGE, OTHER | GENERAL_EXECUTION | ✅ |
| `takip_yolu` | HACIZ, IFLAS, REHIN | HACIZ | ❌ |
| `alt_kategori` | GENEL, NAFAKA, DOVIZ, KIRA | GENEL | ❌ |
| `para_birimi` | TRY, USD, EUR, GBP | TRY | ❌ |
| `dosya_durumu` | DERDEST, HITAM, INFAZ, ACIZ, vb. | DERDEST | ❌ |

### B) ALACAKLI / MÜVEKKİL BİLGİLERİ

| Sütun | Açıklama | Örnek | Zorunlu |
|-------|----------|-------|---------|
| `alacakli_tipi` | PERSON veya COMPANY | PERSON | ✅ |
| `alacakli_ad` | Şahıs adı | Ahmet | ❌ (şahıs için) |
| `alacakli_soyad` | Şahıs soyadı | Yılmaz | ❌ (şahıs için) |
| `alacakli_tckn` | TC Kimlik No (11 hane) | 12345678901 | ❌ |
| `alacakli_unvan` | Şirket adı (tüzel kişi için) | ABC Ltd. Şti. | ❌ (şirket için) |
| `alacakli_vkn` | Vergi Kimlik No (10 hane) | 1234567890 | ❌ |
| `alacakli_vergi_dairesi` | Vergi dairesi | Kadıköy | ❌ |
| `alacakli_telefon` | Telefon | 05321234567 | ❌ |
| `alacakli_email` | E-posta | ornek@mail.com | ❌ |
| `alacakli_adres` | Adres | Atatürk Cad. No:1 | ❌ |
| `alacakli_il` | İl | İstanbul | ❌ |
| `alacakli_ilce` | İlçe | Kadıköy | ❌ |

### C) BORÇLU BİLGİLERİ

| Sütun | Açıklama | Örnek | Zorunlu |
|-------|----------|-------|---------|
| `borclu_tipi` | INDIVIDUAL, COMPANY, PUBLIC_INSTITUTION, ESTATE | INDIVIDUAL | ✅ |
| `borclu_ad` | Şahıs adı | Mehmet | ❌ (şahıs için) |
| `borclu_soyad` | Şahıs soyadı | Demir | ❌ (şahıs için) |
| `borclu_tckn` | TC Kimlik No | 98765432109 | ❌ |
| `borclu_unvan` | Şirket adı (tüzel kişi için) | XYZ A.Ş. | ❌ (şirket için) |
| `borclu_vkn` | Vergi Kimlik No | 9876543210 | ❌ |
| `borclu_vergi_dairesi` | Vergi dairesi | Beşiktaş | ❌ |
| `borclu_telefon` | Telefon | 05559876543 | ❌ |
| `borclu_email` | E-posta | borclu@mail.com | ❌ |
| `borclu_adres` | Adres | İnönü Cad. No:5 | ❌ |
| `borclu_il` | İl | İstanbul | ❌ |
| `borclu_ilce` | İlçe | Beşiktaş | ❌ |

### D) AVUKAT BİLGİLERİ

| Sütun | Açıklama | Örnek | Zorunlu |
|-------|----------|-------|---------|
| `avukat_ad` | Avukat adı | Ali | ❌ |
| `avukat_soyad` | Avukat soyadı | Kaya | ❌ |
| `avukat_tckn` | TC Kimlik No | 11122233344 | ❌ |
| `avukat_baro_no` | Baro sicil no | 12345 | ❌ |
| `avukat_baro_il` | Baro ili | İstanbul | ❌ |

### E) ALACAK BİLGİLERİ

| Sütun | Açıklama | Örnek | Zorunlu |
|-------|----------|-------|---------|
| `asil_alacak` | Ana para tutarı | 50000.00 | ❌ |
| `faiz_turu` | YASAL, TICARI, AVANS, TEMERRUT | YASAL | ❌ |
| `faiz_baslangic` | Faiz başlangıç tarihi (GG.AA.YYYY) | 01.01.2024 | ❌ |
| `faiz_aciklama` | Faiz açıklaması | Takip tarihinden itibaren yasal faiz | ❌ |

### F) NAFAKA (Alt kategori NAFAKA ise)

| Sütun | Açıklama | Örnek | Zorunlu |
|-------|----------|-------|---------|
| `nafaka_baslangic` | Nafaka başlangıç tarihi | 01.06.2023 | ❌ |
| `aylik_nafaka` | Aylık nafaka tutarı | 5000.00 | ❌ |

### G) DÖVİZ (Alt kategori DOVIZ ise)

| Sütun | Açıklama | Örnek | Zorunlu |
|-------|----------|-------|---------|
| `doviz_kur_tarihi` | Kur tarihi | 15.03.2024 | ❌ |
| `kur_tipi` | TAKIP_TARIHI veya ODEME_TARIHI | TAKIP_TARIHI | ❌ |

### H) NOTLAR

| Sütun | Açıklama | Örnek | Zorunlu |
|-------|----------|-------|---------|
| `notlar` | Dosya notu | Tebligat bekleniyor | ❌ |

---

## KURALLAR

1. Her satır bir dosya-borçlu çiftidir. Aynı dosyada 3 borçlu varsa → 3 satır (dosya bilgileri tekrar eder)
2. Aynı TCKN/VKN ile müvekkil veya borçlu tekrar gelirse, mevcut kayıt kullanılır (duplicate oluşmaz)
3. İcra dairesi adı sistemdeki 860 kayıtla fuzzy match edilir
4. Tarihler GG.AA.YYYY formatında
5. Tutarlar ondalıklı (nokta ile: 50000.00)
6. Boş bırakılan opsiyonel alanlar varsayılan değerle doldurulur

---

## TOPLAM: 42 sütun (9 zorunlu, 33 opsiyonel)

Minimum çalışan satır için sadece şunlar yeterli:
- `dosya_no` + `takip_turu` + `alacakli_tipi` + `borclu_tipi`
- Ve en az bir isim: alacaklı için ad/soyad veya ünvan, borçlu için ad/soyad veya ünvan
