import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const offices = await prisma.executionOffice.findMany({
    where: { name: { contains: 'Adalar' } },
    take: 10
  });
  console.log('Adalar icra daireleri:');
  offices.forEach(o => console.log(`  ${o.id} | ${o.name} | ${o.city} | uyapCode: ${o.uyapCode}`));
  
  // Toplam kayıt sayısı
  const total = await prisma.executionOffice.count();
  const withUyap = await prisma.executionOffice.count({ where: { uyapCode: { not: null } } });
  console.log(`\nToplam: ${total}, UYAP kodlu: ${withUyap}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
