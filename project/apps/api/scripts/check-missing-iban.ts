import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

async function check() {
  // IBAN eksik olanları bul
  const missing = await prisma.executionOffice.findMany({
    where: { 
      tenantId: TENANT_ID,
      OR: [
        { iban: null },
        { iban: '' }
      ]
    },
    select: { id: true, name: true, city: true, uyapCode: true },
    orderBy: { city: 'asc' }
  });
  
  console.log(`IBAN eksik olan icra daireleri: ${missing.length}\n`);
  
  // İl bazında grupla
  const byCity: Record<string, number> = {};
  missing.forEach(m => {
    byCity[m.city] = (byCity[m.city] || 0) + 1;
  });
  
  console.log('İl bazında eksikler:');
  Object.entries(byCity)
    .sort((a, b) => b[1] - a[1])
    .forEach(([city, count]) => {
      console.log(`  ${city}: ${count}`);
    });
  
  // İlk 30'u listele
  console.log('\nÖrnek kayıtlar (ilk 30):');
  missing.slice(0, 30).forEach(m => {
    console.log(`  ${m.uyapCode} | ${m.name} | ${m.city}`);
  });
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
