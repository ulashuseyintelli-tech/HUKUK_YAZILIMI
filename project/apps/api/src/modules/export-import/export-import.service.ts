import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import * as ExcelJS from "exceljs";
import * as PDFDocument from "pdfkit";

// ── Müvekkil PDF export yardımcıları (saf/test-edilebilir) ──
// NOT: PDFKit varsayılan fontu (Helvetica/WinAnsi) Türkçe ş/ğ/İ/ı gibi karakterleri
// tam render etmeyebilir; etiketler bu yüzden ASCII-güvenli tutulur (mevcut Excel/PDF deseniyle aynı).

export function formatClientTypeLabel(type?: string | null): string {
  switch (type) {
    case "PERSON":
      return "Sahis";
    case "COMPANY":
      return "Kurum";
    case "PUBLIC":
      return "Kamu";
    default:
      return type || "-";
  }
}

export function formatDateTR(value?: Date | string | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function buildShortAddress(
  client: { address?: string | null; district?: string | null; city?: string | null },
  maxLen = 70
): string {
  const parts = [client.address, client.district, client.city]
    .map((p) => (p || "").trim())
    .filter(Boolean);
  let s = parts.join(" / ");
  if (s.length > maxLen) s = s.slice(0, maxLen - 3).trimEnd() + "...";
  return s;
}

/** Başlıkta gösterilecek filtre alt-başlığı; filtre yoksa boş string. */
export function buildPdfFilterSubtitle(filters?: { type?: string; search?: string }): string {
  const parts: string[] = [];
  if (filters?.type && filters.type !== "ALL") parts.push(`Tur: ${formatClientTypeLabel(filters.type)}`);
  if (filters?.search && filters.search.trim()) parts.push(`Arama: "${filters.search.trim()}"`);
  return parts.length ? `Filtre - ${parts.join("  |  ")}` : "";
}

/** Müvekkil görünen adını türetir (displayName → companyName → ad soyad → "-"). */
export function clientDisplayName(client: {
  displayName?: string | null;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return (
    client.displayName ||
    client.companyName ||
    `${client.firstName || ""} ${client.lastName || ""}`.trim() ||
    "-"
  );
}

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
      { header: "Telefon", key: "phone", width: 15 },
      { header: "Email", key: "email", width: 25 },
    ];
    sheet.getRow(1).font = { bold: true };
    const typeLabels: Record<string, string> = { PERSON: "Sahis", COMPANY: "Kurum", PUBLIC: "Kamu" };
    for (const client of clients) {
      sheet.addRow({
        type: typeLabels[client.type] || client.type,
        name: client.displayName || client.name || "",
        identityNo: client.tckn || client.vkn || "",
        phone: client.phone || "",
        email: client.email || "",
      });
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

      // Başlık
      doc.fontSize(16).fillColor("#000").text("Muvekkil Listesi", { align: "center" });
      doc.moveDown(0.3);

      // Filtre + meta (oluşturulma tarihi, toplam)
      const subtitle = buildPdfFilterSubtitle(filters);
      doc.fontSize(9).fillColor("#666");
      if (subtitle) doc.text(subtitle, { align: "center" });
      doc.text(
        `Olusturulma: ${formatDateTR(new Date())}  |  Toplam: ${clients.length} muvekkil`,
        { align: "center" }
      );
      doc.fillColor("#000").moveDown(0.8);

      if (clients.length === 0) {
        doc.fontSize(11).text("Kayit bulunamadi.", { align: "center" });
        doc.end();
        return;
      }

      // Her müvekkil için zengin blok
      clients.forEach((client: any, idx: number) => {
        const name = clientDisplayName(client);
        const typeLabel = formatClientTypeLabel(client.type);
        const identityNo = client.tckn || client.vkn || "-";
        const phone = client.phone || "-";
        const email = client.email || "-";
        const address = buildShortAddress(client);
        const created = formatDateTR(client.createdAt);

        doc.fontSize(11).fillColor("#000").text(`${idx + 1}. ${name}  [${typeLabel}]`);
        doc.fontSize(9).fillColor("#333");
        doc.text(`TCKN/VKN: ${identityNo}     Tel: ${phone}     E-posta: ${email}`);
        if (address) doc.text(`Adres: ${address}`);
        doc.text(`Kayit: ${created}`);
        doc.fillColor("#000").moveDown(0.5);
      });

      doc.end();
    });
  }

  async exportCasesToExcel(tenantId: string, filters?: { status?: string; clientId?: string }): Promise<Buffer> {
    const cases = await this.getCases(tenantId, filters);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Takipler");
    sheet.columns = [
      { header: "Dosya No", key: "fileNumber", width: 15 },
      { header: "Muvekkil", key: "client", width: 25 },
      { header: "Durum", key: "status", width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const c of cases) {
      sheet.addRow({
        fileNumber: c.fileNumber,
        client: c.client?.name || "",
        status: c.caseStatus,
      });
    }
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
      doc.fontSize(10);
      for (const c of cases) {
        doc.text(c.fileNumber + " - " + (c.client?.name || "-"));
      }
      doc.end();
    });
  }

  async getClientImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Muvekkilller");
    
    // Tüm müvekkil alanları
    sheet.columns = [
      // Temel
      { header: "Tur*", key: "type", width: 10 },
      // Şahıs bilgileri
      { header: "Ad", key: "firstName", width: 15 },
      { header: "Soyad", key: "lastName", width: 15 },
      { header: "TCKN", key: "tckn", width: 14 },
      { header: "Cinsiyet", key: "gender", width: 10 },
      { header: "Dogum Tarihi", key: "birthDate", width: 14 },
      { header: "Yabanci", key: "isForeigner", width: 10 },
      { header: "Uyruk", key: "nationality", width: 12 },
      // Kurum bilgileri
      { header: "Kurum Adi", key: "companyName", width: 25 },
      { header: "VKN", key: "vkn", width: 12 },
      { header: "Vergi Dairesi", key: "taxOffice", width: 18 },
      { header: "Kurum Turu", key: "companyType", width: 12 },
      { header: "MERSIS No", key: "mersisNo", width: 18 },
      { header: "Ticaret Sicil No", key: "ticaretSicilNo", width: 16 },
      { header: "Kurulus Tarihi", key: "foundingDate", width: 14 },
      // İletişim
      { header: "Telefon", key: "phone", width: 15 },
      { header: "E-posta", key: "email", width: 25 },
      // Adres
      { header: "Adres", key: "address", width: 35 },
      { header: "Il", key: "city", width: 15 },
      { header: "Ilce", key: "district", width: 15 },
      { header: "Posta Kodu", key: "postalCode", width: 12 },
      // Yetkiler
      { header: "Ahzu Kabza", key: "canCollect", width: 12 },
      { header: "Feragat", key: "canWaive", width: 10 },
      { header: "Sulh", key: "canSettle", width: 10 },
      { header: "Ibra", key: "canRelease", width: 10 },
      // Notlar
      { header: "Notlar", key: "notes", width: 30 },
    ];
    
    // Başlık satırı stili
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    
    // Örnek veriler
    sheet.addRow({
      type: "PERSON",
      firstName: "Ahmet",
      lastName: "Yilmaz",
      tckn: "12345678901",
      gender: "E",
      birthDate: "1985-05-15",
      phone: "05321234567",
      email: "ahmet@email.com",
      address: "Ataturk Cad. No:10",
      city: "Istanbul",
      district: "Kadikoy",
      canCollect: "EVET",
      canWaive: "HAYIR",
      canSettle: "HAYIR",
      canRelease: "HAYIR",
    });
    
    sheet.addRow({
      type: "COMPANY",
      companyName: "ABC Ticaret Ltd. Sti.",
      vkn: "1234567890",
      taxOffice: "Kadikoy",
      companyType: "Limited",
      phone: "02161234567",
      email: "info@abc.com",
      address: "Sanayi Mah. 123 Sok. No:5",
      city: "Istanbul",
      district: "Atasehir",
      canCollect: "EVET",
    });
    
    sheet.addRow({
      type: "PUBLIC",
      companyName: "Belediye Baskanligi",
      vkn: "9876543210",
      taxOffice: "Merkez",
      phone: "03121234567",
      city: "Ankara",
    });
    
    // Açıklama satırı ekle
    const infoSheet = workbook.addWorksheet("Aciklama");
    infoSheet.columns = [{ header: "Alan", width: 20 }, { header: "Aciklama", width: 50 }];
    infoSheet.getRow(1).font = { bold: true };
    infoSheet.addRow(["Tur*", "PERSON (Sahis), COMPANY (Kurum), PUBLIC (Kamu) - Zorunlu"]);
    infoSheet.addRow(["Ad/Soyad", "Sahis icin zorunlu"]);
    infoSheet.addRow(["TCKN", "11 haneli TC Kimlik No (Sahis icin)"]);
    infoSheet.addRow(["Kurum Adi", "Kurum/Kamu icin zorunlu"]);
    infoSheet.addRow(["VKN", "10 haneli Vergi Kimlik No (Kurum/Kamu icin)"]);
    infoSheet.addRow(["Cinsiyet", "E (Erkek) veya K (Kadin)"]);
    infoSheet.addRow(["Tarihler", "YYYY-AA-GG formatinda (ornek: 1985-05-15)"]);
    infoSheet.addRow(["Yetkiler", "EVET veya HAYIR (bos = HAYIR, Ahzu Kabza icin bos = EVET)"]);
    infoSheet.addRow(["Yabanci", "EVET veya HAYIR"]);
    
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
    
    // Yardımcı fonksiyonlar
    const getCellValue = (row: ExcelJS.Row, col: number): string | null => {
      const val = row.getCell(col).value;
      if (val === null || val === undefined) return null;
      return String(val).trim() || null;
    };
    
    const parseDate = (val: string | null): Date | null => {
      if (!val) return null;
      const date = new Date(val);
      return isNaN(date.getTime()) ? null : date;
    };
    
    const parseBoolean = (val: string | null, defaultVal: boolean = false): boolean => {
      if (!val) return defaultVal;
      const upper = val.toUpperCase();
      return upper === "EVET" || upper === "TRUE" || upper === "1" || upper === "E";
    };
    
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const type = getCellValue(row, 1)?.toUpperCase();
      if (!type || !["PERSON", "COMPANY", "PUBLIC"].includes(type)) continue;
      
      try {
        const data: any = {
          tenantId,
          type,
          // Şahıs bilgileri
          firstName: getCellValue(row, 2),
          lastName: getCellValue(row, 3),
          tckn: getCellValue(row, 4),
          gender: getCellValue(row, 5),
          birthDate: parseDate(getCellValue(row, 6)),
          isForeigner: parseBoolean(getCellValue(row, 7)),
          nationality: getCellValue(row, 8),
          // Kurum bilgileri
          companyName: getCellValue(row, 9),
          vkn: getCellValue(row, 10),
          taxOffice: getCellValue(row, 11),
          companyType: getCellValue(row, 12),
          mersisNo: getCellValue(row, 13),
          ticaretSicilNo: getCellValue(row, 14),
          foundingDate: parseDate(getCellValue(row, 15)),
          // İletişim
          phone: getCellValue(row, 16),
          email: getCellValue(row, 17),
          // Adres
          address: getCellValue(row, 18),
          city: getCellValue(row, 19),
          district: getCellValue(row, 20),
          postalCode: getCellValue(row, 21),
          // Yetkiler
          canCollect: parseBoolean(getCellValue(row, 22), true), // Varsayılan: true
          canWaive: parseBoolean(getCellValue(row, 23)),
          canSettle: parseBoolean(getCellValue(row, 24)),
          canRelease: parseBoolean(getCellValue(row, 25)),
          // Notlar
          notes: getCellValue(row, 26),
        };
        
        // Validasyon ve displayName
        if (type === "PERSON") {
          if (!data.firstName || !data.lastName) {
            errors.push({ row: i, message: "Ad ve Soyad zorunlu" });
            continue;
          }
          data.displayName = `${data.firstName} ${data.lastName}`;
          data.name = data.displayName;
          data.identityNo = data.tckn;
        } else {
          if (!data.companyName) {
            errors.push({ row: i, message: "Kurum Adi zorunlu" });
            continue;
          }
          data.displayName = data.companyName;
          data.name = data.companyName;
          data.identityNo = data.vkn;
        }
        
        await this.prisma.client.create({ data });
        success++;
      } catch (e: any) {
        errors.push({ row: i, message: e.message || "Hata" });
      }
    }
    return { success, errors };
  }

  private async getClients(tenantId: string, filters?: { type?: string; search?: string }) {
    const where: any = { tenantId, isActive: true };
    if (filters?.type && filters.type !== "ALL") where.type = filters.type;
    // Arama: frontend export'ta search gönderiyordu ama uygulanmıyordu → çıktı arama kutusunu
    // yok sayıyordu. Artık hem Excel hem PDF export arama terimini dikkate alır.
    const search = filters?.search?.trim();
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { companyName: { contains: search, mode: "insensitive" } },
        { tckn: { contains: search } },
        { vkn: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    return this.prisma.client.findMany({ where, include: { _count: { select: { cases: true } } }, orderBy: { createdAt: "desc" } });
  }

  private async getCases(tenantId: string, filters?: { status?: string; clientId?: string }) {
    const where: any = { tenantId };
    if (filters?.status) where.caseStatus = filters.status;
    return this.prisma.case.findMany({ where, include: { client: true, debtors: { include: { debtor: true }, take: 1 } }, orderBy: { createdAt: "desc" } });
  }
}
