/**
 * Avukatların lawyerRank ve defaultPermissions değerlerini kontrol et
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Avukat Rank ve Yetki Kontrolü ===\n');

  const lawyers = await prisma.lawyer.findMany({
    select: {
      id: true,
      name: true,
      surname: true,
      lawyerRank: true,
      defaultPermissions: true,
      role: true,
    },
    orderBy: { name: 'asc' },
  });

  console.log(`Toplam ${lawyers.length} avukat bulundu:\n`);

  for (const lawyer of lawyers) {
    console.log(`📌 ${lawyer.name} ${lawyer.surname}`);
    console.log(`   ID: ${lawyer.id}`);
    console.log(`   lawyerRank: ${lawyer.lawyerRank || 'NULL'}`);
    console.log(`   role (eski): ${lawyer.role}`);
    console.log(`   defaultPermissions: ${lawyer.defaultPermissions ? JSON.stringify(lawyer.defaultPermissions) : 'NULL'}`);
    console.log('');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
