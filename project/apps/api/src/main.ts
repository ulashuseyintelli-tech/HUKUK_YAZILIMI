import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  // BOOT SAFLIĞI: API boot'u DB'ye YAZMAZ (seed/db push yok). Veri kurulumu artık
  // explicit komutla: `pnpm db:seed` (prisma/seed.ts) veya `pnpm db:bootstrap` (push+seed).
  const app = await NestFactory.create(AppModule);

  // PF-005: Reverse proxy arkasında gerçek client IP'si için
  // Değer 1 = tek hop (uygulama → nginx/ALB → client)
  // Hop sayısı değişirse bu değer güncellenmelidir
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.setGlobalPrefix("api");

  const port = process.env.PORT || 8080;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}`);
}

bootstrap();
