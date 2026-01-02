# Hukuk Yazılımı - Proje Bağlamı

Bu dosya projenin mevcut durumunu ve yapılacakları içerir. Her oturumda bu bilgileri kullan.

## Veritabanı Bilgileri

- **PostgreSQL**: `postgresql://postgres:postgres123@localhost:5432/hukuk_db`
- **Tenant ID**: `cmj4m2jek0000mvu2om5rcjv2`
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8080
- **Prisma Studio**: http://localhost:5555

## Mevcut Veri Durumu (31 Aralık 2025)

| Modül | Kayıt Sayısı | Notlar |
|-------|--------------|--------|
| İcra Daireleri | 820 | UYAP kodları 7 haneli, 517'si IBAN'lı (303 eksik) |
| Mahkemeler | 14.582 | UYAP kodları 7 haneli |
| Avukatlar | 8 | 2'si TCKN'li |
| Müvekkiller | 11 | Duplicate temizlendi |
| Vekaletler | 1 | Aktif (FUAT ATAHAN -> Ulaş+Fatma) |
| Davalar | 16 | Aktif, sonraki no: 2025/1017 |
| Borçlular | 1.804 | - |
| UYAP İstekleri | 4 | Test istekleri |

## UYAP Kod Formatları

- **UYAP Kodu**: 7 haneli (örn: 1048808, 1001773)
- **Organizasyon Kodu**: Noktalı format (örn: 1.04.021.000.6003)
- İcra dairelerinde: `uyapCode` = 7 haneli, `officeCode` = noktalı
- Mahkemelerde: `uyapCode` = 7 haneli, `courtCode` = noktalı

## Tamamlanan İşler

### Veri Import
- [x] 820 icra dairesi (Türkiye geneli) - `icra_daireleri.txt`
- [x] 517 icra dairesine IBAN/Vergi No - Excel'den
- [x] 14.582 mahkeme (81 il) - `Ek-5_Birim_Kodlari_Tablosu.xlsx`
- [x] UYAP kodları düzeltildi (7 haneli format)

### Kod Düzeltmeleri
- [x] Duplicate müvekkil önleme (`ClientService.create` - TCKN kontrolü)
- [x] Vekalet kontrolü (birden fazla avukat için `checkValidPoaForLawyers`)
- [x] Vekaletname tarama sonucu UI (adres, vekiller gösterimi)
- [x] PDF oluşturma hatası düzeltildi (pdfmake import)
- [x] Faiz hesaplama endpoint'i eklendi

### Belge Oluşturma (31.12.2025 TEST BAŞARILI)
- [x] Takip Talebi (Örnek 1) - Çalışıyor
- [x] Ödeme Emri (Örnek 7) - Çalışıyor
- [x] PDF/Word/UDF oluşturma - Çalışıyor

### UYAP Entegrasyonu (STUB Modu)
- [x] Ödeme emri gönderme - STUB hazır
- [x] Haciz talebi gönderme - STUB hazır
- [x] Vekalet kontrolü entegre edildi

## Yapılacaklar Listesi

### 1. Kısa Vadeli (Tamamlandı)
- [x] İcra dairesi IBAN güncelleme (517/820 tamamlandı, 303 eksik - Excel'de karşılık yok)
- [x] Test avukatları temizlendi
- [x] Dosya oluşturma sistemi test edildi - HAZIR
- [x] Ödeme emri oluşturma - HAZIR
- [x] Haciz talebi oluşturma - STUB HAZIR
- [x] Faiz hesaplama modülü - HAZIR

### 2. Orta Vadeli
- [ ] Toplu işlem paneli
- [ ] Raporlama modülü
- [ ] Tebligat takip sistemi

### 3. Uzun Vadeli
- [ ] UYAP gerçek entegrasyonu (SOAP implementasyonu)
- [ ] Dashboard istatistikleri
- [ ] Bildirim sistemi
- [ ] Takvim entegrasyonu

## Önemli Dosya Konumları

### Veri Kaynakları (Kullanıcı Masaüstü)
- İcra daireleri: `C:\Users\ulas.htelli\Desktop\WORD MASA ÜSTÜ\icra_daireleri.txt`
- İcra IBAN/Vergi: `C:\Users\ulas.htelli\Desktop\excel icra müd\icra daireleri vergi no ve ıban bilgileri.xlsx`
- Mahkemeler: `C:\Users\ulas.htelli\Desktop\Ek-5_Birim_Kodlari_Tablosu.xlsx`

### Import Scriptleri
- `project/apps/api/scripts/import-icra-from-txt.ts`
- `project/apps/api/scripts/update-icra-bank-info-v2.ts`
- `project/apps/api/scripts/import-courts.ts`
- `project/apps/api/scripts/fix-uyap-codes.ts`
- `project/apps/api/scripts/fix-icra-uyap-codes.ts`
- `project/apps/api/scripts/cleanup-duplicate-clients.ts`
- `project/apps/api/scripts/full-system-test.ts`

## Kurallar

1. Sadece `project/` klasöründe çalış, `_archive/` klasörüne dokunma
2. Türkçe yanıt ver
3. Vekaletlerde baro sicil numarası olmaz, TC yeterlidir
4. Uygulama `pnpm dev` ile çalışır
5. Test için `npx ts-node scripts/full-system-test.ts` kullan

## Faiz Hesaplama Notları

- **Varsayılan**: Takip tarihi (güvenli yol)
- **Opsiyon**: Vade tarihi (ispat külfeti alacaklıda)
- Sistem uyarı göstermeli: "Vade tarihi seçildi, itiraz halinde takip tarihine revize gerekebilir"
- Ticari işlerde: Ticari temerrüt faizi
- Diğer: Yasal faiz
