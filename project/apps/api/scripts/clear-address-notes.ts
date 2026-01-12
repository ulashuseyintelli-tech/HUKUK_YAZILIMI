import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('AddressAuditLog kayitlari siliniyor...');
  
  // Tum AddressAuditLog kayitlarini sil
  const result = await prisma.addressAuditLog.deleteMany({});
  
  console.log(`${result.count} adet kayit silindi.`);
  
  // AddressTask kayitlarini da sil (opsiyonel)
  const taskResult = await prisma.addressTask.deleteMany({});
  console.log(`${taskResult.count} adet AddressTask silindi.`);
}

main()
  .catch((e) => {
    console.error('Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
