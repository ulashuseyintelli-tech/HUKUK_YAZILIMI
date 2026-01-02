import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, name: true, isActive: true },
  });
  console.log('Kullanıcılar:', JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}

main();
