import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const offices = await prisma.executionOffice.findMany({
    where: { name: { contains: 'Adalar' } }
  });
  console.log('Adalar icra daireleri:');
  offices.forEach(o => console.log(JSON.stringify(o, null, 2)));
}

main().catch(console.error).finally(() => prisma.$disconnect());
