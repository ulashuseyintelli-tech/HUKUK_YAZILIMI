import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const cities = await prisma.executionOffice.findMany({
    select: { city: true },
    distinct: ['city'],
    orderBy: { city: 'asc' }
  });
  console.log('Şehirler:');
  cities.forEach(c => console.log(`  ${c.city}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
