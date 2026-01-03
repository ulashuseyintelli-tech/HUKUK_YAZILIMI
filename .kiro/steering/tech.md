# Teknoloji Stack ve Build Sistemi

## Monorepo Yapısı
- **Paket Yöneticisi**: pnpm 8+ (workspace protokolü)
- **Build Orchestration**: Turborepo 2.x
- **Node.js**: 20+

## Frontend (apps/web)
- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, TypeScript 5.3+
- **Styling**: Tailwind CSS 3.4
- **State**: Zustand, React Query (TanStack)
- **Forms**: React Hook Form + Zod validation
- **Icons**: Lucide React
- **Test**: Vitest + Testing Library

## Backend (apps/api)
- **Framework**: NestJS 10
- **ORM**: Prisma 5.8 (PostgreSQL)
- **Auth**: Passport JWT
- **Validation**: class-validator, class-transformer
- **Scheduling**: @nestjs/schedule
- **PDF**: pdfkit, pdfmake
- **Word**: docx
- **AI**: OpenAI SDK (opsiyonel)
- **Test**: Jest

## Shared Packages
- `@hukuk/types`: Ortak TypeScript tipleri ve enum'lar
- `@hukuk/ui`: Paylaşılan UI bileşenleri (Button, Input, Card, Badge, Spinner)

## Veritabanı
- PostgreSQL 16+
- Prisma migrations

## Komutlar

```bash
# Geliştirme
pnpm dev              # Tüm uygulamaları başlat (web:3000, api:8080)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm type-check       # TypeScript kontrolü

# Veritabanı
pnpm db:generate      # Prisma client oluştur
pnpm db:push          # Schema'yı DB'ye uygula
pnpm db:studio        # Prisma Studio aç

# Test
pnpm --filter @hukuk/api test      # API testleri (Jest)
pnpm --filter @hukuk/web test      # Web testleri (Vitest)

# Temizlik
pnpm clean            # Build artifacts ve node_modules temizle
```

## Environment Variables
- `apps/api/.env`: DATABASE_URL, JWT_SECRET, OPENAI_API_KEY (opsiyonel)
- `apps/web/.env.local`: NEXT_PUBLIC_API_URL

## Docker
- `docker/docker-compose.yml`: Development
- `docker/docker-compose.prod.yml`: Production
- `docker/Dockerfile.api`, `docker/Dockerfile.web`: Container images
