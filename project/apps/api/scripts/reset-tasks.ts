import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Mevcut PENDING görevleri DONE olarak işaretle
  const result = await prisma.addressTask.updateMany({
    where: { status: 'PENDING' },
    data: { 
      status: 'DONE', 
      completedAt: new Date(),
      resolutionNotes: 'Test için sıfırlandı'
    }
  });
  
  console.log(`${result.count} görev tamamlandı olarak işaretlendi.`);
  console.log('Şimdi "Adres İş Akışını Başlat" butonuna tekrar tıklayabilirsiniz.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
