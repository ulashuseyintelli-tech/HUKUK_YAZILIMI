import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Tüm tenant'ları listele
  const tenants = await prisma.tenant.findMany();
  console.log('Tenant\'lar:');
  tenants.forEach(t => console.log(`  ${t.id} | ${t.name}`));
  
  // Her tenant için icra dairesi sayısı
  for (const t of tenants) {
    const count = await prisma.executionOffice.count({ where: { tenantId: t.id } });
    console.log(`  ${t.name}: ${count} icra dairesi`);
  }
  
  // Admin kullanıcısının tenant'ı
  const admin = await prisma.user.findFirst({ where: { email: 'admin@hukuk.com' } });
  if (admin) {
    console.log(`\nAdmin tenant: ${admin.tenantId}`);
    const adminOffices = await prisma.executionOffice.count({ where: { tenantId: admin.tenantId } });
    console.log(`Admin tenant icra dairesi sayısı: ${adminOffices}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
