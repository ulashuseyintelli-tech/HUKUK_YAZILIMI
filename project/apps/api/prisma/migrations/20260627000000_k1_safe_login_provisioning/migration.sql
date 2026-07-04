-- K1-7: Safe login provisioning altyapısı.
-- Bu migration CANLI olarak UYGULANMADI; owner onayıyla `prisma migrate deploy` ile uygulanır.

-- AlterTable: User.passwordHash NOT NULL -> nullable (pending/davetli kullanıcı parolasız var olabilir)
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable: UserInvite (tek-kullanımlık hashed davet token'ı; ham token saklanmaz)
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_tokenHash_key" ON "UserInvite"("tokenHash");
CREATE INDEX "UserInvite_tenantId_userId_idx" ON "UserInvite"("tenantId", "userId");
CREATE INDEX "UserInvite_tenantId_email_idx" ON "UserInvite"("tenantId", "email");
CREATE INDEX "UserInvite_expiresAt_idx" ON "UserInvite"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
