import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const tenantId = "cmj4m2jek0000mvu2om5rcjv2";

// Eksik iller - 81 ilin tamamı
const eksikIller = [
  // A
  { city: "ADIYAMAN", code: "02", count: 3 },
  { city: "AFYONKARAHİSAR", code: "03", count: 3 },
  { city: "AĞRI", code: "04", count: 2 },
  { city: "AKSARAY", code: "68", count: 2 },
  { city: "AMASYA", code: "05", count: 2 },
  { city: "ARDAHAN", code: "75", count: 1 },
  { city: "ARTVİN", code: "08", count: 2 },
  // B
  { city: "BARTIN", code: "74", count: 1 },
  { city: "BATMAN", code: "72", count: 3 },
  { city: "BAYBURT", code: "69", count: 1 },
  { city: "BİLECİK", code: "11", count: 2 },
  { city: "BİNGÖL", code: "12", count: 2 },
  { city: "BİTLİS", code: "13", count: 2 },
  { city: "BOLU", code: "14", count: 3 },
  { city: "BURDUR", code: "15", count: 2 },
  // C-Ç
  { city: "ÇANAKKALE", code: "17", count: 3 },
  { city: "ÇANKIRI", code: "18", count: 2 },
  { city: "ÇORUM", code: "19", count: 3 },
  // D
  { city: "DÜZCE", code: "81", count: 3 },
  // E
  { city: "EDİRNE", code: "22", count: 3 },
  { city: "ERZİNCAN", code: "24", count: 2 },
  // G
  { city: "GİRESUN", code: "28", count: 3 },
  { city: "GÜMÜŞHANE", code: "29", count: 1 },
  // H
  { city: "HAKKARİ", code: "30", count: 1 },
  // I-İ
  { city: "IĞDIR", code: "76", count: 1 },
  { city: "ISPARTA", code: "32", count: 3 },
  // K
  { city: "KARABÜK", code: "78", count: 2 },
  { city: "KARAMAN", code: "70", count: 2 },
  { city: "KARS", code: "36", count: 2 },
  { city: "KASTAMONU", code: "37", count: 2 },
  { city: "KIRIKKALE", code: "71", count: 2 },
  { city: "KIRKLARELİ", code: "39", count: 2 },
  { city: "KIRŞEHİR", code: "40", count: 2 },
  { city: "KİLİS", code: "79", count: 1 },
  { city: "KÜTAHYA", code: "43", count: 3 },
  // M
  { city: "MARDİN", code: "47", count: 3 },
  { city: "MUŞ", code: "49", count: 2 },
  // N
  { city: "NEVŞEHİR", code: "50", count: 2 },
  { city: "NİĞDE", code: "51", count: 2 },
  // O-Ö
  { city: "ORDU", code: "52", count: 3 },
  { city: "OSMANİYE", code: "80", count: 2 },
  // R
  { city: "RİZE", code: "53", count: 2 },
  // S-Ş
  { city: "SİİRT", code: "56", count: 2 },
  { city: "SİNOP", code: "57", count: 2 },
  { city: "ŞIRNAK", code: "73", count: 2 },
  // T
  { city: "TOKAT", code: "60", count: 3 },
  { city: "TUNCELİ", code: "62", count: 1 },
  // U-Ü
  { city: "UŞAK", code: "64", count: 2 },
  // Y
  { city: "YALOVA", code: "77", count: 2 },
  { city: "YOZGAT", code: "66", count: 2 },
  // Z
  { city: "ZONGULDAK", code: "67", count: 3 },
];

async function main() {
  console.log("Eksik iller ekleniyor...\n");
  
  let totalAdded = 0;
  
  for (const il of eksikIller) {
    for (let i = 1; i <= il.count; i++) {
      const name = il.count === 1 
        ? `${il.city} İcra Dairesi`
        : `${il.city} ${i}. İcra Dairesi`;
      
      await prisma.executionOffice.create({
        data: {
          tenantId,
          name,
          city: il.city,
          district: "Merkez",
          uyapCode: `${il.code}00${String(i).padStart(3, '0')}`,
          bankName: "Vakıfbank",
          branchName: `${il.city} Adliye`,
          isActive: true,
        },
      });
      totalAdded++;
    }
    console.log(`${il.city}: ${il.count} daire eklendi`);
  }
  
  console.log(`\n✅ Toplam ${totalAdded} yeni icra müdürlüğü eklendi!`);
  
  // Genel toplam
  const total = await prisma.executionOffice.count();
  console.log(`\n📊 Veritabanında toplam ${total} icra müdürlüğü var.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
