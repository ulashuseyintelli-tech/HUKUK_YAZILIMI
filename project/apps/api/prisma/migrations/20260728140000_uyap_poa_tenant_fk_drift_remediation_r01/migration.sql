-- UYAP-POA-TENANT-FK-DRIFT-REMEDIATION-R01
--
-- Amac: `schema.prisma` icinde TANIMLI fakat migration zincirinde HIC URETILMEMIS iki
-- Tenant foreign key'ini additive olarak olusturmak.
--
-- Drift kaniti: `20260726210000_uyap_poa_tenant_safety_i01` migration'i
-- `ClientPowerOfAttorney` ve `PoaLawyer` tablolarina `tenantId` kolonunu ve composite
-- tenant-safe FK'leri ekler, fakat asagidaki iki constraint'i HIC uretmez (SQL'de 0 kez).
-- Bu nedenle canli veritabaninda bu iki `tenantId` kolonu `Tenant`'a referential
-- integrity TASIMIYORDU: var olmayan bir tenantId yazilabiliyordu.
--
-- Canonical sozlesme (fresh main `schema.prisma`, DEGISTIRILMEDI):
--   ClientPowerOfAttorney.tenant  Tenant @relation("ClientPoaTenant",  fields: [tenantId], references: [id], onDelete: Cascade)
--   PoaLawyer.tenant              Tenant @relation("PoaLawyerTenant",  fields: [tenantId], references: [id], onDelete: Cascade)
-- `onUpdate` acikca yazilmadigi icin Prisma default'u (Cascade) gecerlidir; repository
-- emsali de `_tenantId_fkey` icin `ON DELETE CASCADE ON UPDATE CASCADE`dir (24 ornek).
--
-- Veri butunlugu kapisi (uygulama oncesi salt-okuma ile dogrulandi, hepsi 0):
--   ClientPowerOfAttorney.tenantId NULL            : 0
--   PoaLawyer.tenantId NULL                        : 0
--   ClientPowerOfAttorney orphan tenantId          : 0
--   PoaLawyer orphan tenantId                      : 0
--   POA tenantId vs Client tenant uyumsuzlugu      : 0
--   PoaLawyer tenantId vs POA tenant uyumsuzlugu   : 0
--   PoaLawyer tenantId vs Lawyer tenant uyumsuzlugu: 0
-- Bu nedenle dogrudan `ADD CONSTRAINT` guvenlidir; `NOT VALID` + `VALIDATE` asamali
-- yaklasimina gerek yoktur (ilgili tablolar kucuktur, table rewrite olusmaz).
--
-- Kapsam: YALNIZ iki eksik FK. Tablo/kolon SILINMEZ, veri DEGISTIRILMEZ,
-- historical migration DEGISTIRILMEZ, `schema.prisma` DEGISTIRILMEZ.

-- AddForeignKey
ALTER TABLE "ClientPowerOfAttorney" ADD CONSTRAINT "ClientPowerOfAttorney_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoaLawyer" ADD CONSTRAINT "PoaLawyer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
