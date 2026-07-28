-- OFFICE-P2-CAP02-REPORTINGLINE-USER-FK-HARDENING-I01 (CAP-02 STEP 0)
--
-- ReportingLine.actorUserId / managerUserId bugüne kadar çıplak String kolonlardı: hiçbir
-- foreign key yoktu, dolayısıyla var olmayan veya BAŞKA TENANT'a ait bir User id'si
-- veritabanı seviyesinde kabul ediliyordu. Cross-tenant koruması yalnız servis
-- katmanındaydı; doğrudan SQL yazan her yol bu korumayı atlıyordu.
--
-- Bu migration tenant-safe COMPOSITE foreign key ekler. Referans anahtarı User(tenantId, id)
-- olduğu için satırın tenantId'si ile actor/manager'ın tenantId'si aynı olmak ZORUNDADIR —
-- cross-tenant ilişki artık DB seviyesinde imkânsızdır.
--
-- ON DELETE RESTRICT: hiyerarşide referansı bulunan bir authorization principal'ı silinemez.
-- Sessizce yetki kaybetmek yerine açık hata alınır.
--
-- managerUserId NULLABLE'dır ve PostgreSQL varsayılan MATCH SIMPLE semantiği gereği
-- kolonlardan biri NULL olduğunda FK denetlenmez. TOP_LEVEL satırları (manager = NULL)
-- bu yüzden serbesttir; MANAGED/TOP_LEVEL ile manager tutarlılığı zaten mevcut
-- reporting_line_disposition_manager_ck CHECK constraint'i tarafından garanti edilir.
--
-- VERİ ETKİSİ: YOK. Bu migration hiçbir satırı okumaz, yazmaz veya silmez; yalnız iki
-- constraint ekler. Rollback = ALTER TABLE ... DROP CONSTRAINT (veri kaybı yok).

-- AddForeignKey
ALTER TABLE "ReportingLine" ADD CONSTRAINT "ReportingLine_tenantId_actorUserId_fkey" FOREIGN KEY ("tenantId", "actorUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingLine" ADD CONSTRAINT "ReportingLine_tenantId_managerUserId_fkey" FOREIGN KEY ("tenantId", "managerUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
