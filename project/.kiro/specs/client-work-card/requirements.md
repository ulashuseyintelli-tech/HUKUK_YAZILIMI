# Müvekkil Çalışma Kartı (Client Work Card) v2

## Özet
Takip detay sayfasındaki müvekkil drawer'ını pasif bilgi kartından aktif bir "mini kontrol paneli"ne dönüştürme. Avukatın reflekslerini yöneten, karar aldıran panel.

## Panel Mantığı
1. **Durumu anla** - Kim bu müvekkil, ne durumda?
2. **Riski gör** - Kaçırdığım bir şey var mı?
3. **Aksiyon al** - Ne yapmalıyım?

## Kullanıcı Hikayeleri

### US-1: Header - Kim + Statü ✅
**Kabul Kriterleri:**
- [x] Müvekkil adı/ünvanı gösterilmeli
- [x] Otomatik statü badge'i: 🟢 Aktif / 🟡 Pasif / 🔴 Dikkat
- [x] Gerçek/Tüzel/Kamu tipi badge'i
- [x] TCKN veya VKN gösterilmeli
- [x] Telefon numarası gösterilmeli
- [x] Düzenle butonu

### US-2: Dosya Yoğunluğu ✅
**Kabul Kriterleri:**
- [x] Aktif Takip sayısı (tıklanabilir)
- [x] Toplam Takip sayısı (tıklanabilir)
- [x] Son 30 Gün İşlem sayısı

### US-3: Finansal Durum - GERÇEK RAKAMLAR ✅
**Kabul Kriterleri:**
- [x] Toplam Alacak: 500.000 ₺ formatında (K değil!)
- [x] Tahsil Edilen: yeşil renk
- [x] Masraf Toplamı: renk kodlu (kırmızı/turuncu/yeşil)
- [x] Tahsil Oranı: %24 formatında
- [x] Oran düşükse (<30%) sarı/kırmızı uyarı

### US-4: Riskler & Uyarılar - HER ZAMAN GÖRÜNÜR ✅
**Kabul Kriterleri:**
- [x] Zamanaşımı yaklaşan takip sayısı (< 60 gün)
- [x] Tebligat bekleyen dosya sayısı
- [x] 30+ gündür işlem yok sayısı
- [x] Risk yoksa bile blok görünmeli (0 değerleriyle)
- [x] Her satır tıklanabilir (filtreli liste)

### US-5: Hızlı Aksiyonlar - VURGULU ✅
**Kabul Kriterleri:**
- [x] Masraf Ekle - BİRİNCİL (turuncu, büyük)
- [x] Yeni Takip - BİRİNCİL (mor, büyük)
- [x] Dosyalar - ikincil (border)
- [x] Mesaj/Not - ikincil (border)

### US-6: İletişim Bilgileri ✅
**Kabul Kriterleri:**
- [x] Collapsible (varsayılan kapalı)
- [x] E-posta + kopyala/gönder butonları
- [x] Adres bilgisi

## Teknik Notlar

### Veri Kaynakları
- `selectedClient` state'i: temel müvekkil bilgileri
- `clientStats` state'i: aggregated istatistikler (API'den)

### Stats Hesaplama
```typescript
{
  activeCases: number;      // status === 'ACTIVE'
  totalCases: number;
  last30dActions: number;   // son 30 günde işlem yapılan
  totalReceivable: number;  // principalAmount toplamı
  totalCollected: number;   // totalCollected toplamı
  totalExpense: number;     // totalExpense toplamı
  expenseCollected: number; // expenseCollected toplamı
  nearExpiryCases: number;  // kalan gün < 60
  pendingNotifications: number;
  staleCases30d: number;    // 30+ gündür işlem yok
  suspendedCases: number;
}
```

### Statü Hesaplama Kuralı
- 🔴 Dikkat: `staleCases30d > 0 || nearExpiryCases > 0`
- 🟡 Pasif: `activeCases === 0`
- 🟢 Aktif: diğer durumlar

### Tahsil Oranı Renkleri
- ≥60%: yeşil (emerald)
- ≥30%: sarı (amber)
- <30%: kırmızı (red)

## Dosya Değişiklikleri
- `apps/api/src/modules/case/case.controller.ts`: clientId filtresi
- `apps/api/src/modules/case/case.service.ts`: clientId filtresi
- `apps/web/src/lib/api.ts`: getCases clientId parametresi
- `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`: Drawer UI

## Durum: ✅ TAMAMLANDI
