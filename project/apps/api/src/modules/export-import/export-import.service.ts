import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import * as ExcelJS from "exceljs";
import * as PDFDocument from "pdfkit";

@Injectable()
export class ExportImportService {
  constructor(private prisma: PrismaService) {}

  async exportClientsToExcel(tenantId: string, filters?: { type?: string; search?: string }): Promise<Buffer> {
    const clients = await this.getClients(tenantId, filters);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Muvekkilller");
    sheet.columns = [
      { header: "Tur", key: "type", width: 12 },
      { header: "Ad", key: "name", width: 30 },
      { header: "TCKN", key: "identityNo", width: 15 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const client of clients) {
      sheet.addRow({ type: client.type, name: client.displayName || client.name || "", identityNo: client.tckn || client.vkn || "" });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportClientsToPdf(tenantId: string, filters?: { type?: string; search?: string }): Promise<Buffer> {
    const clients = await this.getClients(tenantId, filters);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.fontSize(16).text("Muvekkil Listesi", { align: "center" });
      doc.moveDown();
      for (const client of clients) { doc.fontSize(10).text("- " + (client.displayName || client.name || "")); }
      doc.end();
    });
  }

  async exportCasesToExcel(tenantId: string, filters?: { status?: string; clientId?: string }): Promise<Buffer> {
    const cases = await this.getCases(tenantId, filters);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Takipler");
    sheet.columns = [{ header: "Dosya No", key: "fileNumber", width: 15 }, { header: "Muvekkil", key: "client", width: 25 }];
    sheet.getRow(1).font = { bold: true };
    for (const c of cases) { sheet.addRow({ fileNumber: c.fileNumber, client: c.client?.name || "" }); }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportCasesToPdf(tenantId: string, filters?: { status?: string; clientId?: string }): Promise<Buffer> {
    const cases = await this.getCases(tenantId, filters);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.fontSize(16).text("Takip Listesi", { align: "center" });
      doc.moveDown();
      for (const c of cases) { doc.fontSize(10).text(c.fileNumber + " - " + (c.client?.name || "-")); }
      doc.end();
    });
  }

  async getClientImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Muvekkilller");
    sheet.columns = [{ header: "Tur", key: "type", width: 12 }, { header: "Ad", key: "firstName", width: 15 }, { header: "Soyad", key: "lastName", width: 15 }, { header: "TCKN", key: "tckn", width: 15 }, { header: "Kurum Adi", key: "companyName", width: 25 }, { header: "VKN", key: "vkn", width: 12 }];
    sheet.getRow(1).font = { bold: true };
    sheet.addRow({ type: "PERSON", firstName: "Ahmet", lastName: "Yilmaz", tckn: "12345678901" });
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importClientsFromExcel(tenantId: string, fileBuffer: Buffer): Promise<{ success: number; errors: { row: number; message: string }[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("Sayfa bulunamadi");
    const errors: { row: number; message: string }[] = [];
    let success = 0;
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const type = String(row.getCell(1).value || "").toUpperCase();
      if (!["PERSON", "COMPANY", "PUBLIC"].includes(type)) continue;
      try {
        const data: any = { tenantId, type, firstName: row.getCell(2).value?.toString() || null, lastName: row.getCell(3).value?.toString() || null, tckn: row.getCell(4).value?.toString() || null, companyName: row.getCell(5).value?.toString() || null, vkn: row.getCell(6).value?.toString() || null };
        if (type === "PERSON") { if (!data.firstName || !data.lastName) { errors.push({ row: i, message: "Ad ve Soyad zorunlu" }); continue; } data.displayName = data.firstName + " " + data.lastName; data.name = data.displayName; }
        else { if (!data.companyName) { errors.push({ row: i, message: "Kurum Adi zorunlu" }); continue; } data.displayName = data.companyName; data.name = data.companyName; }
        await this.prisma.client.create({ data });
        success++;
      } catch (e: any) { errors.push({ row: i, message: e.message || "Hata" }); }
    }
    return { success, errors };
  }

  private async getClients(tenantId: string, filters?: { type?: string; search?: string }) {
    const where: any = { tenantId, isActive: true };
    if (filters?.type && filters.type !== "ALL") where.type = filters.type;
    return this.prisma.client.findMany({ where, include: { _count: { select: { cases: true } } }, orderBy: { createdAt: "desc" } });
  }

  private async getCases(tenantId: string, filters?: { status?: string; clientId?: string }) {
    const where: any = { tenantId };
    if (filters?.status) where.caseStatus = filters.status;
    return this.prisma.case.findMany({ where, include: { client: true, debtors: { include: { debtor: true }, take: 1 } }, orderBy: { createdAt: "desc" } });
  }
}
