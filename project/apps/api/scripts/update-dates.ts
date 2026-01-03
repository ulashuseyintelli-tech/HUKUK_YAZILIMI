import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:1@localhost:5432/hukuk_db?schema=public'
    }
  }
});

async function main() {
  // startDate'i caseDate ile eşitle (tutarlılık için)
  const result = await prisma.$executeRaw`
    UPDATE "Case" 
    SET "startDate" = "caseDate"
    WHERE "caseDate" IS NOT NULL
  `;
  
  console.log(`Updated ${result} cases - startDate synced with caseDate`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
