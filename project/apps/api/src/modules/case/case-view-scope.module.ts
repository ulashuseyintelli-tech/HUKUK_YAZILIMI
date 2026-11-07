import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { WorkScopePermissionModule } from "../work-scope-permission/work-scope-permission.module";
import { CaseViewScopeService } from "./case-view-scope.service";

/**
 * F02 P3-D1 / P3-D2 — dosya görünüm kapsamı servisi. CaseModule ve belge modülleri (Document, TemplateEngine, Pdf) bunu
 * içe aktarır; CaseModule'ün kendisi içe AKTARILMAZ (modül döngüsü yok).
 */
@Module({
  imports: [PrismaModule, WorkScopePermissionModule],
  providers: [CaseViewScopeService],
  exports: [CaseViewScopeService],
})
export class CaseViewScopeModule {}
