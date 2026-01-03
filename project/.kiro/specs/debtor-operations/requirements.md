# Borçlu Operasyon Ekranı - MESAT/AT Seviyesi

## Paket Yapısı

### 🟢 TEMEL (Mevcut + Hızlı Eklemeler)
**Süre: 1-2 gün**

1. **Süre & Hak Takibi**
   - Kesinleşme tarihi hesaplama (tebliğ + 7 gün)
   - "Kesinleşmeye X gün kaldı" göstergesi
   - Otomatik FINALIZED status geçişi ✅ (mevcut)

2. **Haciz Uygunluk Skoru**
   - Mevcut asset verilerinden hesaplama
   - 🚗 Araç: +2, 🏠 Tapu: +3, 🏦 Banka: +1, 👔 SGK: +2
   - Yüksek/Orta/Düşük badge

3. **Çoklu Dosya Bilgisi**
   - Bu büroda kaç dosya
   - Profesyonel borçlu uyarısı (3+ dosya)

4. **Stratejik Not**
   - Hızlı nottan ayrı, borçluya bağlı kalıcı not
   - Dosya değişse de borçluda kalır

---

### 🟡 İLERİ (1-2 hafta)

5. **Davranış Profili**
   - Etiketler: Uyumlu / Oyalayıcı / Kaçınan / Profesyonel
   - Manuel seçim + kural bazlı otomatik
   - Kural örneği: 3 iade + 0 ödeme = Kaçınan

6. **Son İletişim & Aksiyon**
   - Son arama tarihi + sonucu
   - Son mesaj tarihi + durumu
   - Son tebligat özeti

7. **Ödeme & Vaat Takibi**
   - Vaat var mı? (E/H)
   - Vaat tarihi + tutar
   - Tutuldu/Tutulmadı durumu
   - Vaat geçerse otomatik görev

8. **Borçlu Bazlı Görevler**
   - Drawer'dan direkt görev açma
   - Kesinleşme kontrolü, haciz hazırlığı, adres araştırması

---

### 🔵 PREMIUM (2-4 hafta)

9. **Borçlu Zaman Çizelgesi**
   - Tüm aksiyonların kronolojik listesi
   - Tebligat, arama, mesaj, ödeme, haciz...
   - Dosya okuma ihtiyacını %50 azaltır

10. **Otomatik Bildirimler**
    - Kesinleşme bildirimi
    - Vaat tarihi geçti bildirimi
    - Profesyonel borçlu alarmı

11. **Cross-Tenant Borçlu Analizi**
    - Diğer bürolardaki dosya sayısı (anonim)
    - Sektörel risk skoru

---

## Backend Veri Gereksinimleri

### Mevcut Tablolar (Güncelleme)

```prisma
// CaseDebtor - mevcut, güncelleme gerekli
model CaseDebtor {
  // ... mevcut alanlar
  
  // YENİ: Haciz skoru (hesaplanmış, cache)
  seizureScore       Int?      // 0-10
  seizureScoreLevel  String?   // HIGH, MEDIUM, LOW
  
  // YENİ: Son iletişim
  lastContactAt      DateTime?
  lastContactType    String?   // CALL, SMS, EMAIL, VISIT
  lastContactResult  String?   // ANSWERED, NO_ANSWER, BUSY, LEFT_MESSAGE
  
  // YENİ: Ödeme vaadi
  paymentPromiseAt   DateTime?
  paymentPromiseAmount Decimal?
  paymentPromiseStatus String?  // PENDING, KEPT, BROKEN
}

// Debtor - mevcut, güncelleme gerekli
model Debtor {
  // ... mevcut alanlar
  
  // YENİ: Davranış profili
  behaviorProfile    String?   // COOPERATIVE, STALLING, EVASIVE, PROFESSIONAL
  behaviorUpdatedAt  DateTime?
  
  // YENİ: Stratejik not (borçluya bağlı, dosyadan bağımsız)
  strategyNote       String?   @db.Text
  strategyNoteAt     DateTime?
  strategyNoteBy     String?
  
  // YENİ: Çoklu dosya sayısı (cache)
  totalCaseCount     Int       @default(0)
}
```

### Yeni Tablolar

```prisma
// Borçlu iletişim geçmişi
model DebtorContact {
  id          String   @id @default(cuid())
  debtorId    String
  caseId      String?  // Hangi dosya için (opsiyonel)
  tenantId    String
  
  contactType String   // CALL, SMS, EMAIL, WHATSAPP, VISIT
  direction   String   // OUTBOUND, INBOUND
  result      String?  // ANSWERED, NO_ANSWER, BUSY, LEFT_MESSAGE, READ, DELIVERED
  notes       String?
  
  contactAt   DateTime
  createdBy   String
  createdAt   DateTime @default(now())
  
  debtor      Debtor   @relation(fields: [debtorId], references: [id])
  case        Case?    @relation(fields: [caseId], references: [id])
  
  @@index([debtorId, contactAt])
  @@index([tenantId, contactAt])
}

// Borçlu zaman çizelgesi (tüm aksiyonlar)
model DebtorTimeline {
  id          String   @id @default(cuid())
  debtorId    String
  caseId      String?
  tenantId    String
  
  eventType   String   // SERVICE_SENT, SERVICE_DELIVERED, CALL, PAYMENT, SEIZURE_PLANNED, etc.
  eventData   Json?    // Detay bilgisi
  description String
  
  eventAt     DateTime
  createdAt   DateTime @default(now())
  
  debtor      Debtor   @relation(fields: [debtorId], references: [id])
  
  @@index([debtorId, eventAt])
}
```

---

## API Endpoints

### Temel
- `GET /debtors/:id/seizure-score` - Haciz skoru hesapla
- `GET /debtors/:id/case-count` - Dosya sayısı
- `PATCH /debtors/:id/strategy-note` - Stratejik not güncelle

### İleri
- `GET /debtors/:id/contacts` - İletişim geçmişi
- `POST /debtors/:id/contacts` - İletişim ekle
- `PATCH /debtors/:id/behavior` - Davranış profili güncelle
- `POST /case-debtors/:id/payment-promise` - Ödeme vaadi ekle
- `PATCH /case-debtors/:id/payment-promise` - Vaat durumu güncelle

### Premium
- `GET /debtors/:id/timeline` - Zaman çizelgesi
- `GET /debtors/:id/cross-analysis` - Cross-tenant analiz

---

## UI Bileşenleri

### Temel
- `SeizureScoreBadge` - Haciz potansiyeli göstergesi
- `FinalizationCountdown` - Kesinleşme geri sayımı
- `MultiCaseWarning` - Çoklu dosya uyarısı
- `StrategyNoteSection` - Stratejik not alanı

### İleri
- `BehaviorProfileSelector` - Davranış profili seçici
- `LastContactInfo` - Son iletişim bilgisi
- `PaymentPromiseCard` - Ödeme vaadi kartı
- `QuickTaskButton` - Hızlı görev oluştur

### Premium
- `DebtorTimeline` - Tam zaman çizelgesi
- `NotificationBell` - Bildirim merkezi

---

## Öncelik Sırası

1. **Haciz Skoru** - Mevcut veriden hesaplanır, hemen yapılabilir
2. **Kesinleşme Geri Sayımı** - Tebliğ tarihi var, hesaplama basit
3. **Çoklu Dosya Sayısı** - Basit count query
4. **Stratejik Not** - Debtor tablosuna alan ekle
5. **Davranış Profili** - Enum + manuel seçim
6. **Son İletişim** - Yeni tablo gerekli
7. **Ödeme Vaadi** - CaseDebtor'a alanlar ekle
8. **Zaman Çizelgesi** - En kapsamlı, en son
