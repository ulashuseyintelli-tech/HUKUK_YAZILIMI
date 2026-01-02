import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Ortak bilgiler
  const commonData = {
    address: "Mecidiyeköy Yolu Cd. Karsuyu Sokak No:2 Trump Towers Kule 1 Kat:4 D:401 Şişli/İstanbul",
    city: "İstanbul",
    district: "Şişli",
    phone: "0212 230 89 10",
    fax: "0212 247 52 04",
    bankName: "Türkiye Vakıflar Bankası",
    branchName: "Çağlayan",
    iban: "TR170001500158007300656815",
    barCity: "İstanbul",
  };

  // Tenant ID'yi bul
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.log("Tenant bulunamadı!");
    return;
  }
  console.log("Tenant:", tenant.id);

  // Mevcut avukatları güncelle
  const existingLawyers = await prisma.lawyer.findMany({ where: { tenantId: tenant.id } });
  console.log("Mevcut avukat sayısı:", existingLawyers.length);

  for (const lawyer of existingLawyers) {
    await prisma.lawyer.update({
      where: { id: lawyer.id },
      data: commonData,
    });
    console.log(`Güncellendi: ${lawyer.name} ${lawyer.surname}`);
  }

  // Yeni avukatları ekle
  const newLawyers = [
    {
      name: "Fatma",
      surname: "Uluca Telli",
      tckn: "45706890548",
      ...commonData,
      tenantId: tenant.id,
      role: "PARTNER" as const,
      canSign: true,
      canAppearInUyap: true,
      isDefaultForNewCases: false,
      isActive: true,
    },
    {
      name: "Ulaş Hüseyin",
      surname: "Telli",
      tckn: "37405957684",
      ...commonData,
      tenantId: tenant.id,
      role: "PARTNER" as const,
      canSign: true,
      canAppearInUyap: true,
      isDefaultForNewCases: true,
      isActive: true,
    },
  ];

  for (const lawyerData of newLawyers) {
    // Aynı isimde avukat var mı kontrol et
    const existing = await prisma.lawyer.findFirst({
      where: {
        tenantId: tenant.id,
        name: lawyerData.name,
        surname: lawyerData.surname,
      },
    });

    if (existing) {
      await prisma.lawyer.update({
        where: { id: existing.id },
        data: lawyerData,
      });
      console.log(`Güncellendi: ${lawyerData.name} ${lawyerData.surname}`);
    } else {
      await prisma.lawyer.create({ data: lawyerData });
      console.log(`Eklendi: ${lawyerData.name} ${lawyerData.surname}`);
    }
  }

  // Sonuçları göster
  const allLawyers = await prisma.lawyer.findMany({ where: { tenantId: tenant.id } });
  console.log("\n=== Tüm Avukatlar ===");
  for (const l of allLawyers) {
    console.log(`- ${l.name} ${l.surname} | Tel: ${l.phone} | Faks: ${l.fax} | Banka: ${l.bankName} ${l.branchName} | IBAN: ${l.iban}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
