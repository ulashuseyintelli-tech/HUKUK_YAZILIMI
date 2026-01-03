import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:1@localhost:5432/hukuk_db?schema=public'
    }
  }
});

async function main() {
  const cases = await prisma.case.findMany({
    take: 5,
    select: {
      fileNumber: true,
      caseDate: true,
      startDate: true,
      createdAt: true
    }
  });
  
  console.log('Sample cases with dates:');
  cases.forEach(c => {
    console.log(`${c.fileNumber}: caseDate=${c.caseDate?.toISOString().split('T')[0]}, startDate=${c.startDate?.toISOString().split('T')[0]}, createdAt=${c.createdAt.toISOString().split('T')[0]}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
