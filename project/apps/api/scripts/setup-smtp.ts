import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Turhost SMTP Ayarları - tellihukuk.com
const SMTP_CONFIG = {
  smtpHost: 'srvc182.trwww.com',
  smtpPort: 465,
  smtpSecure: true, // SSL için true
  smtpUser: 'bilgi@tellihukuk.com',
  smtpPass: '***REMOVED***', // Şifre veritabanına kaydedildi
  smtpFromName: 'Telli Hukuk Bürosu',
  smtpFromEmail: 'bilgi@tellihukuk.com',
};

async function main() {
  console.log('SMTP ayarları güncelleniyor...\n');

  // Tüm tenant'ları al
  const tenants = await prisma.tenant.findMany();
  console.log(`${tenants.length} tenant bulundu.\n`);

  for (const tenant of tenants) {
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);

    // Office kaydını bul veya oluştur
    let office = await prisma.office.findFirst({
      where: { tenantId: tenant.id },
    });

    if (!office) {
      console.log('  Office kaydı yok, oluşturuluyor...');
      office = await prisma.office.create({
        data: {
          tenantId: tenant.id,
          name: tenant.name,
          ...SMTP_CONFIG,
        },
      });
      console.log('  ✅ Office oluşturuldu ve SMTP ayarları eklendi.');
    } else {
      console.log('  Office kaydı mevcut, SMTP ayarları güncelleniyor...');
      await prisma.office.update({
        where: { id: office.id },
        data: SMTP_CONFIG,
      });
      console.log('  ✅ SMTP ayarları güncellendi.');
    }
  }

  console.log('\n✅ Tüm SMTP ayarları tamamlandı!');
  console.log('\n⚠️  ÖNEMLİ: smtpPass değerini gerçek şifre ile değiştirmeyi unutmayın!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
