/**
 * İcra dairelerinin banka bilgilerini kontrol et
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== İcra Dairesi Banka Bilgileri Kontrolü ===\n');

  // Bakırköy icra dairelerini kontrol et
  const offices = await prisma.executionOffice.findMany({
    where: {
      name: { contains: 'Bakırköy' }
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Bakırköy'de ${offices.length} icra dairesi bulundu:\n`);

  for (const office of offices) {
    console.log(`📌 ${office.name}`);
    console.log(`   ID: ${office.id}`);
    console.log(`   UYAP Kodu: ${office.uyapCode || 'YOK'}`);
    console.log(`   Banka: ${office.bankName || 'BOŞ'}`);
    console.log(`   Şube: ${office.branchName || 'BOŞ'}`);
    console.log(`   IBAN: ${office.iban || 'BOŞ'}`);
    console.log('');
  }

  // Banka bilgisi eksik olan icra dairelerini say
  const missingBank = await prisma.executionOffice.count({
    where: {
      OR: [
        { bankName: null },
        { bankName: '' },
      ]
    }
  });

  const total = await prisma.executionOffice.count();
  console.log(`\n📊 Özet: ${total} icra dairesinden ${missingBank} tanesinde banka adı eksik`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
