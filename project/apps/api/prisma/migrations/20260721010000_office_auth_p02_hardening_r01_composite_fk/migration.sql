-- OFFICE-AUTH-P02-HARDENING-R01: PasswordResetToken.userId FK'yi tenant-scoped bileşik
-- anahtara (User.tenantId,id) baglar. Boylece cross-tenant bir userId atamasi artik
-- DB seviyesinde reddedilir (Case/Collection/LegalApplicationBatch ile ayni desen).

-- DropForeignKey
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_userId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_id_key" ON "User"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OFFICE-AUTH-P02-HARDENING-R01: "kullanici basina en fazla bir cozulmemis token" invariant'i.
-- Prisma schema.prisma DSL'i WHERE kosullu (partial) unique index ifade edemedigi icin bu
-- index elle eklenmistir; schema.prisma'da KASITLI olarak temsil edilmez (bkz. PasswordResetToken
-- model yorumu). consumedAt VE revokedAt ikisi de NULL olan (yani hala "acik/cozulmemis") token
-- sayisi (tenantId,userId) basina en fazla 1 ile sinirlanir; tuketilmis/iptal edilmis tokenlar
-- bu kisitlamanin disindadir.
CREATE UNIQUE INDEX "PasswordResetToken_one_unresolved_per_user" ON "PasswordResetToken"("tenantId", "userId") WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;
