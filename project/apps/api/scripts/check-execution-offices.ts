import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const offices = await prisma.executionOffice.findMany({
    where: { city: 'İstanbul' },
    orderBy: { name: 'asc' },
  });
  
  console.log(`İstanbul'da ${offices.length} icra müdürlüğü var:\n`);
  for (const o of offices) {
    console.log(`- ${o.name}`);
    console.log(`  UYAP: ${o.uyapCode || 'YOK'}, Banka: ${o.bankName || 'YOK'}, IBAN: ${o.iban || 'YOK'}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
