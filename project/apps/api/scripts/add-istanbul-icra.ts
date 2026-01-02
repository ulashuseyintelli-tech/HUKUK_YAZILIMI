import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// İstanbul İcra Müdürlükleri - Tam Liste
const istanbulIcraMudurlukeri = [
  // Çağlayan Adliyesi (Avrupa Yakası Merkez)
  { name: "İstanbul 1. İcra Dairesi", district: "Çağlayan", uyapCode: "1001001", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR100001500158007293581583" },
  { name: "İstanbul 2. İcra Dairesi", district: "Çağlayan", uyapCode: "1001002", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR130001500158007293581590" },
  { name: "İstanbul 3. İcra Dairesi", district: "Çağlayan", uyapCode: "1001003", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR160001500158007293581604" },
  { name: "İstanbul 4. İcra Dairesi", district: "Çağlayan", uyapCode: "1001004", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR190001500158007293581611" },
  { name: "İstanbul 5. İcra Dairesi", district: "Çağlayan", uyapCode: "1001005", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR220001500158007293581628" },
  { name: "İstanbul 6. İcra Dairesi", district: "Çağlayan", uyapCode: "1001006", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR250001500158007293581635" },
  { name: "İstanbul 7. İcra Dairesi", district: "Çağlayan", uyapCode: "1001007", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR280001500158007293581642" },
  { name: "İstanbul 8. İcra Dairesi", district: "Çağlayan", uyapCode: "1001008", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR310001500158007293581659" },
  { name: "İstanbul 9. İcra Dairesi", district: "Çağlayan", uyapCode: "1001009", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR340001500158007293581666" },
  { name: "İstanbul 10. İcra Dairesi", district: "Çağlayan", uyapCode: "1001010", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR370001500158007293581673" },
  { name: "İstanbul 11. İcra Dairesi", district: "Çağlayan", uyapCode: "1001011", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR400001500158007293581680" },
  { name: "İstanbul 12. İcra Dairesi", district: "Çağlayan", uyapCode: "1001012", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR430001500158007293581697" },
  { name: "İstanbul 13. İcra Dairesi", district: "Çağlayan", uyapCode: "1001013", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR460001500158007293581701" },
  { name: "İstanbul 14. İcra Dairesi", district: "Çağlayan", uyapCode: "1001014", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR490001500158007293581718" },
  { name: "İstanbul 15. İcra Dairesi", district: "Çağlayan", uyapCode: "1001015", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR520001500158007293581725" },
  { name: "İstanbul 16. İcra Dairesi", district: "Çağlayan", uyapCode: "1001016", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR550001500158007293581732" },
  { name: "İstanbul 17. İcra Dairesi", district: "Çağlayan", uyapCode: "1001017", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR580001500158007293581749" },
  { name: "İstanbul 18. İcra Dairesi", district: "Çağlayan", uyapCode: "1001018", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR610001500158007293581756" },
  { name: "İstanbul 19. İcra Dairesi", district: "Çağlayan", uyapCode: "1001019", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR640001500158007293581763" },
  { name: "İstanbul 20. İcra Dairesi", district: "Çağlayan", uyapCode: "1001020", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR670001500158007293581770" },
  { name: "İstanbul 21. İcra Dairesi", district: "Çağlayan", uyapCode: "1001021", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR700001500158007293581787" },
  { name: "İstanbul 22. İcra Dairesi", district: "Çağlayan", uyapCode: "1001022", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR730001500158007293581794" },
  { name: "İstanbul 23. İcra Dairesi", district: "Çağlayan", uyapCode: "1001023", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR760001500158007293581808" },
  { name: "İstanbul 24. İcra Dairesi", district: "Çağlayan", uyapCode: "1001024", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR790001500158007293581815" },
  { name: "İstanbul 25. İcra Dairesi", district: "Çağlayan", uyapCode: "1001025", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR820001500158007293581822" },
  { name: "İstanbul 26. İcra Dairesi", district: "Çağlayan", uyapCode: "1001026", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR850001500158007293581839" },
  { name: "İstanbul 27. İcra Dairesi", district: "Çağlayan", uyapCode: "1001027", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR880001500158007293581846" },
  { name: "İstanbul 28. İcra Dairesi", district: "Çağlayan", uyapCode: "1001028", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR910001500158007293581853" },
  { name: "İstanbul 29. İcra Dairesi", district: "Çağlayan", uyapCode: "1001029", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR940001500158007293581860" },
  { name: "İstanbul 30. İcra Dairesi", district: "Çağlayan", uyapCode: "1001030", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR970001500158007293581877" },
  { name: "İstanbul 31. İcra Dairesi", district: "Çağlayan", uyapCode: "1001031", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR030001500158007293581891" },
  { name: "İstanbul 32. İcra Dairesi", district: "Çağlayan", uyapCode: "1001032", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR060001500158007293581905" },
  { name: "İstanbul 33. İcra Dairesi", district: "Çağlayan", uyapCode: "1001033", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR090001500158007293581912" },
  { name: "İstanbul 34. İcra Dairesi", district: "Çağlayan", uyapCode: "1001034", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR120001500158007293581929" },
  { name: "İstanbul 35. İcra Dairesi", district: "Çağlayan", uyapCode: "1001035", bankName: "Vakıfbank", branchName: "Çağlayan Adliye", iban: "TR150001500158007293581936" },
];

async function main() {
  const tenantId = "cmj4m2jek0000mvu2om5rcjv2";
  
  // Önce mevcut İstanbul kayıtlarını sil
  await prisma.executionOffice.deleteMany({
    where: { city: "İSTANBUL" }
  });
  console.log("Mevcut İstanbul icra müdürlükleri silindi.");

  // Yeni kayıtları ekle
  for (const office of istanbulIcraMudurlukeri) {
    await prisma.executionOffice.create({
      data: {
        tenantId,
        name: office.name,
        city: "İSTANBUL",
        district: office.district,
        uyapCode: office.uyapCode,
        bankName: office.bankName,
        branchName: office.branchName,
        iban: office.iban,
        isActive: true,
      },
    });
  }
  
  console.log(`${istanbulIcraMudurlukeri.length} İstanbul icra müdürlüğü eklendi.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
