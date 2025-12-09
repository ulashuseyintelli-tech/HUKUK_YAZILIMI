# Hukuk Platform

Modern, güvenli ve ölçeklenebilir icra takip yazılımı.

## 🚀 Teknolojiler

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend:** NestJS, TypeScript, Prisma
- **Database:** PostgreSQL
- **Cache:** Redis
- **Monorepo:** Turborepo, pnpm

## 📁 Proje Yapısı

```
project/
├── apps/
│   ├── web/          # Next.js Frontend
│   └── api/          # NestJS Backend
├── packages/
│   ├── ui/           # Shared UI components
│   └── types/        # Shared TypeScript types
└── docker/           # Docker configurations
```

## 🛠️ Kurulum

### Gereksinimler

- Node.js 20+
- pnpm 8+
- PostgreSQL 16+
- Redis (opsiyonel)

---

## 💻 Windows Local Kurulum (Docker Olmadan)

### 0. Gerekli Araçları Kontrol Et

```powershell
# Node.js versiyonunu kontrol et (20+ gerekli)
node -v

# pnpm versiyonunu kontrol et (8+ gerekli)
pnpm -v

# PostgreSQL bağlantısını kontrol et
psql -U postgres -c "SELECT version();"
```

### 1. PostgreSQL Kurulumu

1. [PostgreSQL Windows Installer](https://www.postgresql.org/download/windows/) indirin ve kurun
2. Kurulum sırasında şifre belirleyin
3. Port varsayılan `5432` olarak kalsın
4. pgAdmin ile veritabanı oluşturun:
   ```sql
   CREATE DATABASE hukuk_db;
   ```

### 2. Bağımlılıkları Yükle

```powershell
cd project
pnpm install
```

### 3. Environment Değişkenlerini Ayarla

```powershell
# API için .env dosyasını oluştur
copy apps\api\.env.example apps\api\.env
```

`apps/api/.env` dosyası:

```env
# Local PostgreSQL bağlantısı
DATABASE_URL="postgresql://postgres:1@localhost:5432/hukuk_db?schema=public"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# App
PORT=8080
NODE_ENV=development
```

### 4. Prisma Client Oluştur

```powershell
pnpm db:generate
```

### 5. Veritabanı Şemasını Uygula

```powershell
pnpm db:push
```

### 6. Geliştirme Sunucusunu Başlat

```powershell
pnpm dev
```

Bu komut Turborepo ile hem API hem Frontend'i paralel olarak başlatır:

- **Frontend:** http://localhost:3000
- **API:** http://localhost:8080

> 💡 Veritabanı bağlantısı ve tablolar uygulama başlatılırken otomatik kontrol edilir. Tablolar yoksa otomatik oluşturulur.

### 🔑 Varsayılan Kullanıcılar

Uygulama ilk başlatıldığında otomatik olarak oluşturulur:

| E-posta | Şifre | Rol |
|---------|-------|-----|
| admin@hukuk.com | admin123 | ADMIN |
| user@hukuk.com | user123 | USER |

---

## 🐧 Docker ile Kurulum (Alternatif)

### 1. Veritabanını Başlat

```bash
cd docker
docker-compose up -d postgres redis
```

### 2. Environment ve Şema 

```bash
cp apps/api/.env.example apps/api/.env
pnpm db:push
```

### 3. Geliştirme Sunucusunu Başlat

```bash
pnpm dev
```

- Frontend: http://localhost:3000
- API: http://localhost:8080

## 📝 Komutlar

| Komut | Açıklama |
|-------|----------|
| `pnpm dev` | Tüm uygulamaları geliştirme modunda başlat |
| `pnpm build` | Tüm uygulamaları derle |
| `pnpm lint` | Lint kontrolü |
| `pnpm type-check` | TypeScript tip kontrolü |
| `pnpm db:generate` | Prisma client oluştur |
| `pnpm db:push` | Veritabanı şemasını uygula |
| `pnpm db:studio` | Prisma Studio aç |

## 🔐 API Endpoints

### Auth
- `POST /api/auth/register` - Yeni hesap oluştur
- `POST /api/auth/login` - Giriş yap
- `GET /api/auth/me` - Mevcut kullanıcı bilgisi

### Cases (Takipler)
- `GET /api/cases` - Takip listesi
- `GET /api/cases/:id` - Takip detayı
- `POST /api/cases` - Yeni takip
- `PUT /api/cases/:id` - Takip güncelle
- `DELETE /api/cases/:id` - Takip sil

### Debtors (Borçlular)
- `GET /api/debtors` - Borçlu listesi
- `GET /api/debtors/:id` - Borçlu detayı
- `POST /api/debtors` - Yeni borçlu
- `PUT /api/debtors/:id` - Borçlu güncelle

### Tasks (Görevler)
- `GET /api/tasks` - Görev listesi
- `POST /api/tasks` - Yeni görev
- `PUT /api/tasks/:id` - Görev güncelle

## 🐳 Docker ile Production

```bash
cd docker
docker-compose -f docker-compose.prod.yml up -d
```

## 📄 Lisans

MIT
