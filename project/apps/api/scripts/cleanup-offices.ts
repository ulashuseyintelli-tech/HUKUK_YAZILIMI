import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // UYAP kodu olmayan eski kayıtları sil
  const deleted = await prisma.executionOffice.deleteMany({
    where: { uyapCode: null }
  });
  console.log(`${deleted.count} adet UYAP kodsuz kayıt silindi.`);
  
  // Kalan kayıtları kontrol et
  const remaining = await prisma.executionOffice.count();
  console.log(`Kalan kayıt sayısı: ${remaining}`);
  
  // Örnek kayıtlar
  const samples = await prisma.executionOffice.findMany({ take: 5 });
  console.log('\nÖrnek kayıtlar:');
  samples.forEach(o => console.log(`  ${o.name} | ${o.city} | uyapCode: ${o.uyapCode}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
