import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const offices = await prisma.executionOffice.findMany({
    orderBy: { name: 'asc' },
  });
  
  console.log(`Toplam ${offices.length} icra müdürlüğü var:\n`);
  for (const o of offices) {
    console.log(`- ${o.name} (${o.city})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
