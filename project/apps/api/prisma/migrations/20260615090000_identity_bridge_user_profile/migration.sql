-- K1 kimlik köprüsü: StaffMember/Lawyer = gerçek kişi profili, User = login/hesap kimliği.
-- Opsiyonel userId (zorunlu User yok) → Task.completedByUserId → User → StaffMember/Lawyer
-- zinciri kurulabilir (K3 raporu kullanacak; bu PR'da OKUMA/RAPOR YOK). User silinirse köprü
-- kopar (SET NULL), kişi profili korunur. @unique (nullable) → bir User en fazla bir profile.
-- ADDITIVE: kolonlar nullable, mevcut satırlar etkilenmez. NOT: migrate deploy ayrı; prod N/A.

-- Kolonlar
ALTER TABLE "StaffMember" ADD COLUMN "userId" TEXT;
ALTER TABLE "Lawyer" ADD COLUMN "userId" TEXT;

-- Unique (nullable → Postgres çoklu-NULL'a izin verir; mevcut satırlar çakışmaz)
CREATE UNIQUE INDEX "StaffMember_userId_key" ON "StaffMember"("userId");
CREATE UNIQUE INDEX "Lawyer_userId_key" ON "Lawyer"("userId");

-- FK: profil.userId → User.id (User silinirse SET NULL = kişi profili kalır)
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lawyer" ADD CONSTRAINT "Lawyer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
