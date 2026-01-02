import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  // Eksik icra dairesi olan dosyaları kontrol et
  const casesWithoutOffice = await prisma.case.findMany({
    where: {
      executionOfficeId: null
    },
    select: {
      id: true,
      fileNumber: true,
      notes: true,
    }
  });
  
  console.log('📋 Eksik icra dairesi olan dosyalar:');
  for (const c of casesWithoutOffice) {
    console.log(`  - ${c.fileNumber}`);
  }
  
  // Mevcut icra dairelerini listele (İstanbul)
  const istanbulOffices = await prisma.executionOffice.findMany({
    where: { city: 'İstanbul' },
    take: 20,
    select: { id: true, name: true, city: true },
    orderBy: { name: 'asc' }
  });
  
  console.log('\n📍 İstanbul İcra Daireleri (ilk 20):');
  for (const o of istanbulOffices) {
    console.log(`  - ${o.name} (${o.id})`);
  }
  
  await prisma.$disconnect();
}

check();
