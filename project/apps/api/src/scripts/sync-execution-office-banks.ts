/**
 * İcra dairelerinin banka bilgilerini seed dosyasındaki verilerle senkronize et
 * Bu script, seed dosyasındaki banka bilgilerini veritabanındaki icra dairelerine uygular
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Seed dosyasından alınan banka bilgileri (şehir + isim bazlı eşleştirme)
const seedBankData: Array<{
  city: string;
  district?: string;
  name: string;
  bankName: string;
  iban?: string;
  ibanHarc?: string;
  ibanCezaevi?: string;
}> = [
  // KARABÜK (78)
  { city: "KARABÜK", district: "Eskipazar", name: "Eskipazar İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O.", iban: "TR350001500158007300569385", ibanHarc: "TR710001500158007300569319", ibanCezaevi: "TR210001500158007300569346" },
  { city: "KARABÜK", name: "Karabük İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O.", iban: "TR280001500158007290500135", ibanHarc: "TR710001500158007299388538", ibanCezaevi: "TR840001500158007285051995" },
  { city: "KARABÜK", district: "Safranbolu", name: "Safranbolu İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O.", iban: "TR670001500158007290501373", ibanHarc: "TR850001500158007299439696", ibanCezaevi: "TR760001500158007290501502" },
  { city: "KARABÜK", district: "Yenice", name: "Yenice(Karabük) İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O.", iban: "TR680001500158007300578006", ibanHarc: "TR930001500158007300578041", ibanCezaevi: "TR280001500158007300578047" },
  
  // İSTANBUL - BAKIRKÖY
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 1. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O.", iban: "TR580001500158007290500135" },
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 2. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O." },
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 3. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O." },
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 4. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O." },
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 5. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O." },
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 6. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O." },
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 7. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O." },
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 8. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O." },
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 9. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O." },
  { city: "İSTANBUL", district: "Bakırköy", name: "Bakırköy 10. İcra Dairesi", bankName: "T. Vakıflar Bankası T.A.O." },
];

async function main() {
  console.log('=== İcra Dairesi Banka Bilgilerini Seed ile Senkronize Et ===\n');

  // Önce mevcut durumu kontrol et
  const karabukOffice = await prisma.executionOffice.findFirst({
    where: { name: { contains: 'Karabük İcra Dairesi' } },
  });
  
  if (karabukOffice) {
    console.log('Karabük İcra Dairesi mevcut durumu:');
    console.log(`  - ID: ${karabukOffice.id}`);
    console.log(`  - Banka: ${karabukOffice.bankName || '(boş)'}`);
    console.log(`  - IBAN: ${karabukOffice.iban || '(boş)'}`);
    console.log('');
  }

  let updated = 0;
  let notFound = 0;

  for (const seedData of seedBankData) {
    // İsme göre icra dairesini bul
    const office = await prisma.executionOffice.findFirst({
      where: {
        name: { contains: seedData.name.replace(/\(.*\)/, '').trim() },
      },
    });

    if (!office) {
      // Alternatif arama - şehir + isim parçası
      const altOffice = await prisma.executionOffice.findFirst({
        where: {
          AND: [
            { city: { contains: seedData.city, mode: 'insensitive' } },
            { name: { contains: seedData.name.split(' ')[0], mode: 'insensitive' } },
          ],
        },
      });

      if (altOffice) {
        await prisma.executionOffice.update({
          where: { id: altOffice.id },
          data: {
            bankName: seedData.bankName,
            ...(seedData.iban && { iban: seedData.iban }),
          },
        });
        console.log(`✓ ${altOffice.name}: ${seedData.bankName}`);
        updated++;
      } else {
        console.log(`✗ Bulunamadı: ${seedData.name}`);
        notFound++;
      }
      continue;
    }

    // Güncelle - sadece bankName ve iban (ibanHarc/ibanCezaevi schema'da yok)
    await prisma.executionOffice.update({
      where: { id: office.id },
      data: {
        bankName: seedData.bankName,
        ...(seedData.iban && { iban: seedData.iban }),
      },
    });
    console.log(`✓ ${office.name}: ${seedData.bankName}`);
    updated++;
  }

  console.log(`\n📊 Sonuç: ${updated} güncellendi, ${notFound} bulunamadı`);

  // Güncellemeden sonra Karabük'ü tekrar kontrol et
  const karabukAfter = await prisma.executionOffice.findFirst({
    where: { name: { contains: 'Karabük İcra Dairesi' } },
  });
  
  if (karabukAfter) {
    console.log('\nKarabük İcra Dairesi güncellenmiş durumu:');
    console.log(`  - Banka: ${karabukAfter.bankName || '(boş)'}`);
    console.log(`  - IBAN: ${karabukAfter.iban || '(boş)'}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
