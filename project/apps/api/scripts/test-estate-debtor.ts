/**
 * Tereke (Miras Ortaklığı) Borçlu Test Script
 * 
 * Bu script tereke borçlusu oluşturma ve listeleme işlemlerini test eder.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_ID = "cmj4m2jek0000mvu2om5rcjv2";

async function testEstateDebtor() {
  console.log("🏛️ Tereke Borçlu Test Başlıyor...\n");

  try {
    // 1. Tereke borçlusu oluştur
    console.log("1️⃣ Tereke borçlusu oluşturuluyor...");
    
    const estateDebtor = await prisma.debtor.create({
      data: {
        tenantId: TENANT_ID,
        type: "ESTATE",
        name: "Ahmet Yılmaz Mirasçıları",
        identityNo: "12345678901",
        deceasedName: "Ahmet Yılmaz",
        deceasedTckn: "12345678901",
        deathDate: new Date("2024-06-15"),
        estateHeirs: {
          create: [
            {
              name: "Mehmet Yılmaz",
              tckn: "11111111111",
              address: "Atatürk Mah. Cumhuriyet Cad. No:15/3",
              city: "İstanbul",
              district: "Kadıköy",
              shareRatio: "1/3",
              phone: "05321234567",
              email: "mehmet@example.com",
            },
            {
              name: "Ayşe Yılmaz Demir",
              tckn: "22222222222",
              address: "Bahçelievler Mah. İnönü Sok. No:8/5",
              city: "Ankara",
              district: "Çankaya",
              shareRatio: "1/3",
              phone: "05339876543",
              email: "ayse@example.com",
            },
            {
              name: "Fatma Yılmaz",
              tckn: "33333333333",
              address: "Alsancak Mah. Kordon Cad. No:22/1",
              city: "İzmir",
              district: "Konak",
              shareRatio: "1/3",
              phone: "05551112233",
              email: "fatma@example.com",
            },
          ],
        },
      },
      include: {
        estateHeirs: true,
      },
    });

    console.log("✅ Tereke borçlusu oluşturuldu:");
    console.log(`   ID: ${estateDebtor.id}`);
    console.log(`   Ad: ${estateDebtor.name}`);
    console.log(`   Muris: ${estateDebtor.deceasedName}`);
    console.log(`   Muris TCKN: ${estateDebtor.deceasedTckn}`);
    console.log(`   Ölüm Tarihi: ${estateDebtor.deathDate?.toLocaleDateString("tr-TR")}`);
    console.log(`   Mirasçı Sayısı: ${estateDebtor.estateHeirs.length}`);
    console.log("\n   Mirasçılar:");
    estateDebtor.estateHeirs.forEach((heir, idx) => {
      console.log(`   ${idx + 1}. ${heir.name} (${heir.shareRatio}) - ${heir.city}/${heir.district}`);
      console.log(`      Tel: ${heir.phone}, E-posta: ${heir.email}`);
    });

    // 2. Tüm tereke borçlularını listele
    console.log("\n2️⃣ Tüm tereke borçluları listeleniyor...");
    
    const allEstates = await prisma.debtor.findMany({
      where: {
        tenantId: TENANT_ID,
        type: "ESTATE",
      },
      include: {
        estateHeirs: true,
      },
    });

    console.log(`✅ Toplam ${allEstates.length} tereke borçlusu bulundu:`);
    allEstates.forEach((estate, idx) => {
      console.log(`   ${idx + 1}. ${estate.name} (${estate.estateHeirs.length} mirasçı)`);
    });

    // 3. Borçlu istatistikleri
    console.log("\n3️⃣ Borçlu istatistikleri:");
    
    const stats = await prisma.debtor.groupBy({
      by: ["type"],
      where: { tenantId: TENANT_ID },
      _count: true,
    });

    stats.forEach((stat) => {
      const typeLabels: Record<string, string> = {
        INDIVIDUAL: "Gerçek Kişi",
        COMPANY: "Tüzel Kişi",
        PUBLIC_INSTITUTION: "Kamu Kurumu",
        ESTATE: "Tereke",
      };
      console.log(`   ${typeLabels[stat.type] || stat.type}: ${stat._count}`);
    });

    console.log("\n✅ Test başarıyla tamamlandı!");

  } catch (error) {
    console.error("❌ Hata:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testEstateDebtor();
