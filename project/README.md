# Hukuk Platform - Tam Otomatik İcra-İflas Sistemi

Modern, güvenli ve ölçeklenebilir icra takip yazılımı. **Tam otomatik** icra-iflas takip sistemi vizyonuyla geliştirilmektedir.

## 🎯 Proje Durumu

### ✅ Tamamlanan Modüller

| # | Modül | Durum | Açıklama |
|---|-------|-------|----------|
| 1 | Form Seçim Ekranı | ✅ | Akıllı sihirbaz, kategori filtreleri, sık kullanılanlar |
| 2 | Form Metadata Sistemi | ✅ | 11 form + 8 alt form, veritabanı tabanlı |
| 3 | Model Genişletme | ✅ | Otomasyon modelleri (Lifecycle, Enforcement, Risk, Decision) |
| 4 | Otomasyon Motoru | ✅ | Rule Engine, Workflow Engine, Cron Jobs |
| 5 | Tebligat Sistemi | ✅ | E-Tebligat, SMS, Email, 10 gün takibi |
| 6 | Doküman Üretimi | ✅ | PDF şablonları, UYAP XML |
| 7 | Risk Analizi | ✅ | 5 faktörlü skor, tahsilat olasılığı |
| 8 | AI Karar Modülü | ✅ | OpenAI entegrasyonu, öneri ve tahmin sistemi |
| 9 | Frontend Revizyonu | ✅ | Dashboard, timeline, risk görselleştirme, auto mode toggle |
| 10 | Entegrasyon Testleri | ✅ | 47 test, form validation, automation, AI tests, onboarding |

### 📋 Yapılacaklar Listesi
Detaylı liste için: `Yapilacaklar.txt`

---

## 🚀 Teknolojiler

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend:** NestJS, TypeScript, Prisma
- **Database:** PostgreSQL
- **AI:** OpenAI GPT-4 (opsiyonel)
- **Monorepo:** Turborepo, pnpm

## 📁 Proje Yapısı

```
project/
├── apps/
│   ├── web/                    # Next.js Frontend
│   │   └── src/
│   │       ├── app/            # App Router sayfaları
│   │       ├── components/     # React bileşenleri
│   │       │   └── case/       # Takip bileşenleri (FormWizard, FormCard, vb.)
│   │       ├── hooks/          # Custom hooks
│   │       ├── lib/            # Yardımcı fonksiyonlar
│   │       ├── types/          # TypeScript tipleri
│   │       └── config/         # Konfigürasyon dosyaları
│   └── api/                    # NestJS Backend
│       └── src/
│           ├── modules/
│           │   ├── auth/       # Kimlik doğrulama
│           │   ├── case/       # Takip yönetimi
│           │   ├── automation/ # Otomasyon motoru
│           │   ├── notification/ # Tebligat sistemi
│           │   ├── document/   # Doküman üretimi
│           │   ├── risk/       # Risk analizi
│           │   ├── ai/         # AI karar modülü
│           │   └── form-type/  # Form metadata
│           └── prisma/         # Veritabanı
├── packages/
│   ├── ui/                     # Shared UI components
│   └── types/                  # Shared TypeScript types
└── docker/                     # Docker configurations
```

---

## 💻 Windows Local Kurulum

### Gereksinimler
- Node.js 20+
- pnpm 8+
- PostgreSQL 16+

### 1. PostgreSQL Kurulumu
```sql
CREATE DATABASE hukuk_db;
```

### 2. Bağımlılıkları Yükle
```powershell
pnpm install
```

### 3. Environment Ayarla
`apps/api/.env`:
```env
DATABASE_URL="postgresql://postgres:1@localhost:5432/hukuk_db?schema=public"
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
PORT=8080
NODE_ENV=development

# OpenAI (AI modülü için - opsiyonel)
OPENAI_API_KEY="sk-your-openai-api-key"
```

### 4. Veritabanı Kurulumu
```powershell
pnpm db:generate
pnpm db:push
```

### 5. Geliştirme Sunucusu
```powershell
pnpm dev
```
- **Frontend:** http://localhost:3000
- **API:** http://localhost:8080

### 🔑 Varsayılan Kullanıcılar
| E-posta | Şifre | Rol |
|---------|-------|-----|
| admin@hukuk.com | admin123 | ADMIN |
| user@hukuk.com | user123 | USER |

---

## 🔌 API Endpoints

### Auth
- `POST /api/auth/login` - Giriş
- `POST /api/auth/register` - Kayıt
- `GET /api/auth/me` - Kullanıcı bilgisi

### Cases (Takipler)
- `GET /api/cases` - Liste
- `GET /api/cases/:id` - Detay
- `POST /api/cases` - Oluştur
- `PUT /api/cases/:id` - Güncelle

### Form Types
- `GET /api/form-types` - Tüm form tipleri
- `GET /api/form-types/:code` - Form detayı
- `GET /api/form-types/categories` - Kategoriler

### Automation
- `GET /api/automation/stats` - İstatistikler
- `POST /api/automation/cases/:id/toggle-auto` - Otomatik mod
- `POST /api/automation/cases/:id/process` - Manuel işle

### Notifications (Tebligat)
- `GET /api/notifications/case/:caseId` - Dosya tebligatları
- `POST /api/notifications/case/:caseId/payment-order` - Ödeme emri
- `GET /api/notifications/case/:caseId/payment-deadline` - Süre bilgisi

### Documents
- `GET /api/documents/types` - Belge türleri
- `GET /api/documents/case/:caseId/payment-order` - Ödeme emri PDF
- `POST /api/documents/case/:caseId/seizure-notice` - Haciz müzekkeresi
- `GET /api/documents/case/:caseId/uyap-xml` - UYAP XML

### Risk
- `POST /api/risk/case/:caseId/analyze` - Risk analizi
- `GET /api/risk/high-risk` - Yüksek riskli dosyalar
- `GET /api/risk/stats` - Risk istatistikleri

### AI (Opsiyonel)
- `GET /api/ai/case/:caseId/suggest` - AI önerisi
- `GET /api/ai/case/:caseId/predict` - Tahsilat tahmini
- `GET /api/ai/stats` - AI istatistikleri
- `POST /api/ai/batch-suggest` - Toplu öneri

---

## 🤖 Otomasyon Kuralları

Sistem aşağıdaki kuralları otomatik uygular:

| Kural | Tetikleyici | Aksiyon |
|-------|-------------|---------|
| Ödeme emri süresi | Tebligattan 10 gün sonra | Haciz aşamasına geç |
| Kambiyo takibi | Tebligattan 5 gün sonra | Haciz aşamasına geç |
| Kira takibi | 30 gün ödeme yok | Tahliye talebi |
| Tam ödeme | Borç kapandı | Dosya kapat |
| Haciz sonrası | Varlık bulundu | Satış talebi |

---

## 📊 Risk Skoru Hesaplama

| Faktör | Ağırlık | Açıklama |
|--------|---------|----------|
| Borçlu Varlıkları | 0-25 | Taşınmaz, araç, banka, maaş |
| Tahsilat Geçmişi | 0-25 | Önceki tahsilat oranı |
| Dosya Yaşı | 0-20 | Açık kalma süresi |
| Aşama İlerlemesi | 0-15 | Mevcut workflow aşaması |
| Borçlu Davranışı | 0-15 | İtiraz, ödeme geçmişi |

**Risk Seviyeleri:**
- 0-24: Düşük (Yeşil)
- 25-49: Orta (Sarı)
- 50-74: Yüksek (Turuncu)
- 75-100: Kritik (Kırmızı)

---

## � Komutlar

| Komut | Açıklama |
|-------|----------|
| `pnpm dev` | Geliştirme sunucusu |
| `pnpm build` | Production build |
| `pnpm test` | Testleri çalıştır |
| `pnpm db:generate` | Prisma client |
| `pnpm db:push` | Şema uygula |
| `pnpm db:studio` | Prisma Studio |
| `pnpm --filter @hukuk/api test` | API testlerini çalıştır |

---

## 📄 Lisans

MIT
