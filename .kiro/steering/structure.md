# Proje Yapısı

```
project/
├── apps/
│   ├── api/                      # NestJS Backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # Veritabanı şeması (4000+ satır)
│   │   │   └── migrations/       # DB migrations
│   │   ├── src/
│   │   │   ├── main.ts           # Entry point
│   │   │   ├── app.module.ts     # Root module
│   │   │   ├── config/           # Konfigürasyon
│   │   │   ├── prisma/           # Prisma service
│   │   │   └── modules/          # Feature modülleri
│   │   │       ├── auth/         # JWT authentication
│   │   │       ├── case/         # Takip yönetimi (ana modül)
│   │   │       ├── case-status/  # Statü yönetimi
│   │   │       ├── client/       # Müvekkil yönetimi
│   │   │       ├── debtor/       # Borçlu yönetimi
│   │   │       ├── lawyer/       # Avukat yönetimi
│   │   │       ├── automation/   # Otomasyon motoru
│   │   │       ├── notification/ # Tebligat sistemi
│   │   │       ├── document/     # Doküman üretimi
│   │   │       ├── template-engine/ # Şablon motoru
│   │   │       ├── risk/         # Risk analizi
│   │   │       ├── ai/           # AI karar modülü
│   │   │       ├── form-type/    # Form metadata
│   │   │       ├── validation-gate/ # Validasyon kapıları
│   │   │       ├── ocr/          # Belge tarama
│   │   │       └── audit/        # Audit logging
│   │   └── scripts/              # Utility scripts
│   │
│   └── web/                      # Next.js Frontend
│       └── src/
│           ├── app/              # App Router
│           │   ├── (auth)/       # Login/Register sayfaları
│           │   ├── (dashboard)/  # Ana uygulama
│           │   │   ├── cases/    # Takip listesi ve detay
│           │   │   ├── clients/  # Müvekkiller
│           │   │   ├── debtors/  # Borçlular
│           │   │   └── settings/ # Ayarlar
│           │   └── layout.tsx
│           ├── components/       # React bileşenleri
│           │   ├── case/         # Takip bileşenleri
│           │   ├── expense/      # Masraf yönetimi
│           │   ├── payment/      # Ödeme bileşenleri
│           │   └── ui/           # Genel UI
│           ├── hooks/            # Custom React hooks
│           ├── lib/
│           │   └── api.ts        # API client (2700+ satır)
│           ├── types/            # TypeScript tipleri
│           └── config/           # Frontend config
│
├── packages/
│   ├── types/                    # Paylaşılan tipler (@hukuk/types)
│   │   └── src/index.ts          # Enum ve interface'ler
│   └── ui/                       # Paylaşılan UI (@hukuk/ui)
│       └── src/
│           ├── components/       # Button, Input, Card, Badge, Spinner
│           └── lib/utils.ts      # cn() helper
│
├── docker/                       # Docker konfigürasyonları
├── _archive/                     # Eski proje (referans)
│   ├── hukuk-api-master/         # Eski Express.js API
│   └── hukuk-web-master/         # Eski Next.js (Pages Router)
│
├── turbo.json                    # Turborepo config
├── pnpm-workspace.yaml           # Workspace tanımı
└── package.json                  # Root package
```

## Modül Yapısı (NestJS)
Her modül şu dosyaları içerir:
- `*.module.ts` - NestJS module tanımı
- `*.controller.ts` - HTTP endpoints
- `*.service.ts` - İş mantığı
- `dto/*.dto.ts` - Data Transfer Objects

## Önemli Dosyalar
- `prisma/schema.prisma`: Tüm veritabanı modelleri
- `apps/web/src/lib/api.ts`: Frontend API client
- `apps/api/src/modules/case/`: Ana takip modülü
