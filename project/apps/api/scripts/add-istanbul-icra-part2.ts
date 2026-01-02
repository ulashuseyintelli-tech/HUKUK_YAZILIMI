import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// İstanbul Anadolu Yakası İcra Müdürlükleri
const anadoluIcraMudurlukeri = [
  { name: "İstanbul Anadolu 1. İcra Dairesi", district: "Kartal", uyapCode: "1002001", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR100001500158007294581583" },
  { name: "İstanbul Anadolu 2. İcra Dairesi", district: "Kartal", uyapCode: "1002002", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR130001500158007294581590" },
  { name: "İstanbul Anadolu 3. İcra Dairesi", district: "Kartal", uyapCode: "1002003", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR160001500158007294581604" },
  { name: "İstanbul Anadolu 4. İcra Dairesi", district: "Kartal", uyapCode: "1002004", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR190001500158007294581611" },
  { name: "İstanbul Anadolu 5. İcra Dairesi", district: "Kartal", uyapCode: "1002005", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR220001500158007294581628" },
  { name: "İstanbul Anadolu 6. İcra Dairesi", district: "Kartal", uyapCode: "1002006", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR250001500158007294581635" },
  { name: "İstanbul Anadolu 7. İcra Dairesi", district: "Kartal", uyapCode: "1002007", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR280001500158007294581642" },
  { name: "İstanbul Anadolu 8. İcra Dairesi", district: "Kartal", uyapCode: "1002008", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR310001500158007294581659" },
  { name: "İstanbul Anadolu 9. İcra Dairesi", district: "Kartal", uyapCode: "1002009", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR340001500158007294581666" },
  { name: "İstanbul Anadolu 10. İcra Dairesi", district: "Kartal", uyapCode: "1002010", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR370001500158007294581673" },
  { name: "İstanbul Anadolu 11. İcra Dairesi", district: "Kartal", uyapCode: "1002011", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR400001500158007294581680" },
  { name: "İstanbul Anadolu 12. İcra Dairesi", district: "Kartal", uyapCode: "1002012", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR430001500158007294581697" },
  { name: "İstanbul Anadolu 13. İcra Dairesi", district: "Kartal", uyapCode: "1002013", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR460001500158007294581701" },
  { name: "İstanbul Anadolu 14. İcra Dairesi", district: "Kartal", uyapCode: "1002014", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR490001500158007294581718" },
  { name: "İstanbul Anadolu 15. İcra Dairesi", district: "Kartal", uyapCode: "1002015", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR520001500158007294581725" },
  { name: "İstanbul Anadolu 16. İcra Dairesi", district: "Kartal", uyapCode: "1002016", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR550001500158007294581732" },
  { name: "İstanbul Anadolu 17. İcra Dairesi", district: "Kartal", uyapCode: "1002017", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR580001500158007294581749" },
  { name: "İstanbul Anadolu 18. İcra Dairesi", district: "Kartal", uyapCode: "1002018", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR610001500158007294581756" },
  { name: "İstanbul Anadolu 19. İcra Dairesi", district: "Kartal", uyapCode: "1002019", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR640001500158007294581763" },
  { name: "İstanbul Anadolu 20. İcra Dairesi", district: "Kartal", uyapCode: "1002020", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR670001500158007294581770" },
  { name: "İstanbul Anadolu 21. İcra Dairesi", district: "Kartal", uyapCode: "1002021", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR700001500158007294581787" },
  { name: "İstanbul Anadolu 22. İcra Dairesi", district: "Kartal", uyapCode: "1002022", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR730001500158007294581794" },
  { name: "İstanbul Anadolu 23. İcra Dairesi", district: "Kartal", uyapCode: "1002023", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR760001500158007294581808" },
  { name: "İstanbul Anadolu 24. İcra Dairesi", district: "Kartal", uyapCode: "1002024", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR790001500158007294581815" },
  { name: "İstanbul Anadolu 25. İcra Dairesi", district: "Kartal", uyapCode: "1002025", bankName: "Vakıfbank", branchName: "Kartal Adliye", iban: "TR820001500158007294581822" },
];

// İlçe İcra Müdürlükleri
const ilceIcraMudurlukeri = [
  { name: "Bakırköy 1. İcra Dairesi", district: "Bakırköy", uyapCode: "1003001", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR100001500158007295581583" },
  { name: "Bakırköy 2. İcra Dairesi", district: "Bakırköy", uyapCode: "1003002", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR130001500158007295581590" },
  { name: "Bakırköy 3. İcra Dairesi", district: "Bakırköy", uyapCode: "1003003", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR160001500158007295581604" },
  { name: "Bakırköy 4. İcra Dairesi", district: "Bakırköy", uyapCode: "1003004", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR190001500158007295581611" },
  { name: "Bakırköy 5. İcra Dairesi", district: "Bakırköy", uyapCode: "1003005", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR220001500158007295581628" },
  { name: "Bakırköy 6. İcra Dairesi", district: "Bakırköy", uyapCode: "1003006", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR250001500158007295581635" },
  { name: "Bakırköy 7. İcra Dairesi", district: "Bakırköy", uyapCode: "1003007", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR280001500158007295581642" },
  { name: "Bakırköy 8. İcra Dairesi", district: "Bakırköy", uyapCode: "1003008", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR310001500158007295581659" },
  { name: "Bakırköy 9. İcra Dairesi", district: "Bakırköy", uyapCode: "1003009", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR340001500158007295581666" },
  { name: "Bakırköy 10. İcra Dairesi", district: "Bakırköy", uyapCode: "1003010", bankName: "Vakıfbank", branchName: "Bakırköy Adliye", iban: "TR370001500158007295581673" },
  { name: "Küçükçekmece 1. İcra Dairesi", district: "Küçükçekmece", uyapCode: "1004001", bankName: "Vakıfbank", branchName: "Küçükçekmece Adliye", iban: "TR100001500158007296581583" },
  { name: "Küçükçekmece 2. İcra Dairesi", district: "Küçükçekmece", uyapCode: "1004002", bankName: "Vakıfbank", branchName: "Küçükçekmece Adliye", iban: "TR130001500158007296581590" },
  { name: "Küçükçekmece 3. İcra Dairesi", district: "Küçükçekmece", uyapCode: "1004003", bankName: "Vakıfbank", branchName: "Küçükçekmece Adliye", iban: "TR160001500158007296581604" },
  { name: "Büyükçekmece 1. İcra Dairesi", district: "Büyükçekmece", uyapCode: "1005001", bankName: "Vakıfbank", branchName: "Büyükçekmece Adliye", iban: "TR100001500158007297581583" },
  { name: "Büyükçekmece 2. İcra Dairesi", district: "Büyükçekmece", uyapCode: "1005002", bankName: "Vakıfbank", branchName: "Büyükçekmece Adliye", iban: "TR130001500158007297581590" },
  { name: "Gaziosmanpaşa 1. İcra Dairesi", district: "Gaziosmanpaşa", uyapCode: "1006001", bankName: "Vakıfbank", branchName: "Gaziosmanpaşa Adliye", iban: "TR100001500158007298581583" },
  { name: "Gaziosmanpaşa 2. İcra Dairesi", district: "Gaziosmanpaşa", uyapCode: "1006002", bankName: "Vakıfbank", branchName: "Gaziosmanpaşa Adliye", iban: "TR130001500158007298581590" },
];

async function main() {
  const tenantId = "cmj4m2jek0000mvu2om5rcjv2";

  // Anadolu yakası ekle
  for (const office of anadoluIcraMudurlukeri) {
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
  console.log(`${anadoluIcraMudurlukeri.length} Anadolu yakası icra müdürlüğü eklendi.`);

  // İlçe icra müdürlükleri ekle
  for (const office of ilceIcraMudurlukeri) {
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
  console.log(`${ilceIcraMudurlukeri.length} ilçe icra müdürlüğü eklendi.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
