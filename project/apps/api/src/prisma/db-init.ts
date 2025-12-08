import { exec } from "child_process";
import { promisify } from "util";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const execAsync = promisify(exec);

// Varsayılan kullanıcılar
const DEFAULT_USERS = [
  {
    email: "admin@hukuk.com",
    password: "admin123",
    name: "Admin",
    surname: "Kullanıcı",
    role: "ADMIN" as const,
  },
  {
    email: "user@hukuk.com",
    password: "user123",
    name: "Test",
    surname: "Kullanıcı",
    role: "USER" as const,
  },
];

async function seedDefaultUsers(prisma: PrismaClient): Promise<void> {
  // Varsayılan tenant var mı kontrol et
  let tenant = await prisma.tenant.findUnique({
    where: { slug: "demo-firma" },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Demo Firma",
        slug: "demo-firma",
        plan: "PRO",
      },
    });
    console.log("✅ Demo tenant oluşturuldu");
  }

  // Kullanıcıları oluştur
  for (const userData of DEFAULT_USERS) {
    const existingUser = await prisma.user.findFirst({
      where: { email: userData.email },
    });

    if (!existingUser) {
      const passwordHash = await bcrypt.hash(userData.password, 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: userData.email,
          passwordHash,
          name: userData.name,
          surname: userData.surname,
          role: userData.role,
        },
      });
      console.log(`✅ Kullanıcı oluşturuldu: ${userData.email}`);
    }
  }
}

export async function initializeDatabase(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // Veritabanı bağlantısını test et
    await prisma.$connect();
    console.log("✅ Veritabanı bağlantısı başarılı");

    // Tabloları kontrol et (User tablosu var mı?)
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;

    if (tables.length === 0) {
      console.log("📦 Tablolar bulunamadı, şema oluşturuluyor...");
      await execAsync("npx prisma db push", { cwd: process.cwd() });
      console.log("✅ Veritabanı şeması oluşturuldu");
    } else {
      console.log(`✅ Veritabanı hazır (${tables.length} tablo mevcut)`);
    }

    // Varsayılan kullanıcıları oluştur
    await seedDefaultUsers(prisma);
  } catch (error: any) {
    if (error.code === "P1001" || error.code === "ECONNREFUSED") {
      console.error("❌ PostgreSQL bağlantısı başarısız!");
      console.error("   PostgreSQL servisinin çalıştığından emin olun.");
      process.exit(1);
    }

    if (error.code === "P1003") {
      console.log("📦 Veritabanı bulunamadı, oluşturuluyor...");
      await execAsync("npx prisma db push", { cwd: process.cwd() });
      console.log("✅ Veritabanı oluşturuldu");
    } else {
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}
