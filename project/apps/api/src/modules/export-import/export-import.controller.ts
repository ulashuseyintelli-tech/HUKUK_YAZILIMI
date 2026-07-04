import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { ExportImportService } from "./export-import.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

/**
 * "id1,id2,id3" virgüllü query paramını temizlenmiş ID dizisine çevirir.
 * Boş/whitespace girdiler atılır; hiç geçerli ID yoksa undefined (= "ID filtresi yok").
 */
export function parseIdsParam(ids?: string): string[] | undefined {
  if (!ids) return undefined;
  const list = ids
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

@Controller("export-import")
@UseGuards(JwtAuthGuard)
export class ExportImportController {
  constructor(private exportImportService: ExportImportService) {}

  // ==================== MÜVEKKİL EXPORT ====================

  // Müvekkilleri Excel'e aktar
  @Get("clients/excel")
  async exportClientsExcel(
    @CurrentUser("tenantId") tenantId: string,
    @Query("type") type?: string,
    @Query("search") search?: string,
    @Res() res?: Response
  ) {
    const buffer = await this.exportImportService.exportClientsToExcel(tenantId, { type, search });
    const filename = `muvekkilller_${new Date().toISOString().split("T")[0]}.xlsx`;

    res!.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res!.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res!.send(buffer);
  }

  // Müvekkilleri PDF'e aktar
  @Get("clients/pdf")
  async exportClientsPdf(
    @CurrentUser("tenantId") tenantId: string,
    @Query("type") type?: string,
    @Query("search") search?: string,
    @Res() res?: Response
  ) {
    const buffer = await this.exportImportService.exportClientsToPdf(tenantId, { type, search });
    const filename = `muvekkilller_${new Date().toISOString().split("T")[0]}.pdf`;

    res!.setHeader("Content-Type", "application/pdf");
    res!.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res!.send(buffer);
  }

  // ==================== BORÇLU EXPORT (PR-D5-e) ====================

  @Get("debtors/excel")
  async exportDebtorsExcel(
    @CurrentUser("tenantId") tenantId: string,
    @Query("search") search?: string,
    @Query("type") type?: string,
    @Query("riskLevel") riskLevel?: string,
    @Query("city") city?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Res() res?: Response
  ) {
    const buffer = await this.exportImportService.exportDebtorsToExcel(tenantId, { search, type, riskLevel, city, sortBy, sortOrder });
    const filename = `borclular_${new Date().toISOString().split("T")[0]}.xlsx`;
    res!.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res!.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res!.send(buffer);
  }

  @Get("debtors/pdf")
  async exportDebtorsPdf(
    @CurrentUser("tenantId") tenantId: string,
    @Query("search") search?: string,
    @Query("type") type?: string,
    @Query("riskLevel") riskLevel?: string,
    @Query("city") city?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Res() res?: Response
  ) {
    const buffer = await this.exportImportService.exportDebtorsToPdf(tenantId, { search, type, riskLevel, city, sortBy, sortOrder });
    const filename = `borclular_${new Date().toISOString().split("T")[0]}.pdf`;
    res!.setHeader("Content-Type", "application/pdf");
    res!.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res!.send(buffer);
  }

  // ==================== TAKİP EXPORT ====================

  // Takipleri Excel'e aktar
  @Get("cases/excel")
  async exportCasesExcel(
    @CurrentUser("tenantId") tenantId: string,
    @Query("status") status?: string,
    @Query("clientId") clientId?: string,
    @Query("ids") ids?: string,
    @Res() res?: Response
  ) {
    const idList = parseIdsParam(ids);
    const buffer = await this.exportImportService.exportCasesToExcel(tenantId, { status, clientId, ids: idList });
    const filename = `takipler_${new Date().toISOString().split("T")[0]}.xlsx`;

    res!.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res!.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res!.send(buffer);
  }

  // Takipleri PDF'e aktar
  @Get("cases/pdf")
  async exportCasesPdf(
    @CurrentUser("tenantId") tenantId: string,
    @Query("status") status?: string,
    @Query("clientId") clientId?: string,
    @Query("ids") ids?: string,
    @Res() res?: Response
  ) {
    const idList = parseIdsParam(ids);
    const buffer = await this.exportImportService.exportCasesToPdf(tenantId, { status, clientId, ids: idList });
    const filename = `takipler_${new Date().toISOString().split("T")[0]}.pdf`;

    res!.setHeader("Content-Type", "application/pdf");
    res!.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res!.send(buffer);
  }

  // ==================== MÜVEKKİL IMPORT ====================

  // İçe aktarma şablonu indir (public - auth gerekmez)
  @Get("clients/template")
  async getClientTemplate(@Res() res: Response) {
    try {
      const buffer = await this.exportImportService.getClientImportTemplate();

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="muvekkil_sablonu.xlsx"');
      res.setHeader("Content-Length", buffer.length.toString());
      res.send(buffer);
    } catch (error) {
      console.error("Template download error:", error);
      res.status(500).json({ message: "Şablon oluşturulamadı" });
    }
  }

  // Excel'den müvekkil içe aktar
  @Post("clients/import")
  @UseInterceptors(FileInterceptor("file"))
  async importClients(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") actorUserId: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("Dosya yüklenmedi");
    }

    if (!file.originalname.endsWith(".xlsx") && !file.originalname.endsWith(".xls")) {
      throw new BadRequestException("Sadece Excel dosyaları (.xlsx, .xls) desteklenir");
    }

    const result = await this.exportImportService.importClientsFromExcel(tenantId, file.buffer, actorUserId);

    return {
      message: `${result.success} müvekkil başarıyla içe aktarıldı`,
      success: result.success,
      errors: result.errors,
      hasErrors: result.errors.length > 0,
    };
  }
}
