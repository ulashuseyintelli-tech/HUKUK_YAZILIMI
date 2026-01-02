import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const lawyers = await prisma.lawyer.findMany({
    select: { id: true, name: true, surname: true, barNumber: true, tckn: true },
    orderBy: { sortOrder: 'asc' },
  });
  
  console.log('=== AVUKATLAR ===');
  for (const l of lawyers) {
    console.log(`${l.name} ${l.surname}`);
    console.log(`  - ID: ${l.id}`);
    console.log(`  - Baro Sicil: ${l.barNumber || 'YOK'}`);
    console.log(`  - TCKN: ${l.tckn || 'YOK'}`);
    console.log('');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
