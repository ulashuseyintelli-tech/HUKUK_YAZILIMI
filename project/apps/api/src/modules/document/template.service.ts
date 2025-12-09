import { Injectable } from "@nestjs/common";
import { TDocumentDefinitions, Content } from "pdfmake/interfaces";

export interface DocumentData {
  fileNumber: string;
  executionOffice?: string;
  // İcra Dairesi Detay Bilgileri
  executionOfficeDetails?: {
    name: string;
    uyapCode?: string;
    taxNumber?: string;
    bankName?: string;
    branchName?: string;
    iban?: string;
  };
  creditor: {
    name: string;
    identityNo?: string;
    address?: string;
  };
  debtor: {
    name: string;
    identityNo?: string;
    address?: string;
  };
  lawyer?: {
    name: string;
    barNumber?: string;
  };
  amounts: {
    principal: number;
    interest?: number;
    expenses?: number;
    total: number;
  };
  dates: {
    created: Date;
    dueDate?: Date;
  };
  formType?: string;
  notes?: string;
}

@Injectable()
export class TemplateService {
  // Ödeme Emri şablonu
  getPaymentOrderTemplate(data: DocumentData): TDocumentDefinitions {
    const today = new Date().toLocaleDateString("tr-TR");

    return {
      content: [
        { text: "T.C.", style: "header", alignment: "center" },
        { text: data.executionOffice || "İCRA DAİRESİ", style: "header", alignment: "center" },
        { text: "\n" },
        { text: `Dosya No: ${data.fileNumber}`, style: "subheader" },
        { text: `Tarih: ${today}`, alignment: "right" },
        { text: "\n\n" },
        { text: "ÖDEME EMRİ", style: "title", alignment: "center" },
        { text: "\n\n" },

        // Alacaklı bilgileri
        { text: "ALACAKLI:", style: "label" },
        {
          table: {
            widths: ["30%", "70%"],
            body: [
              ["Ad Soyad / Unvan:", data.creditor.name],
              ["TC/Vergi No:", data.creditor.identityNo || "-"],
              ["Adres:", data.creditor.address || "-"],
            ],
          },
          layout: "noBorders",
        },
        { text: "\n" },

        // Borçlu bilgileri
        { text: "BORÇLU:", style: "label" },
        {
          table: {
            widths: ["30%", "70%"],
            body: [
              ["Ad Soyad / Unvan:", data.debtor.name],
              ["TC/Vergi No:", data.debtor.identityNo || "-"],
              ["Adres:", data.debtor.address || "-"],
            ],
          },
          layout: "noBorders",
        },
        { text: "\n" },

        // Alacak bilgileri
        { text: "ALACAK BİLGİLERİ:", style: "label" },
        {
          table: {
            widths: ["50%", "50%"],
            body: [
              ["Asıl Alacak:", this.formatCurrency(data.amounts.principal)],
              ["İşlemiş Faiz:", this.formatCurrency(data.amounts.interest || 0)],
              ["Masraflar:", this.formatCurrency(data.amounts.expenses || 0)],
              [
                { text: "TOPLAM:", bold: true },
                { text: this.formatCurrency(data.amounts.total), bold: true },
              ],
            ],
          },
        },
        { text: "\n\n" },

        // Uyarı metni
        {
          text: [
            "İşbu ödeme emrinin tebliğinden itibaren ",
            { text: "10 GÜN", bold: true },
            " içinde yukarıda yazılı borcu ödemeniz, borcun tamamına veya bir kısmına ya da alacaklının takip hakkına itirazınız varsa ",
            { text: "7 GÜN", bold: true },
            " içinde icra dairesine bildirmeniz, aksi halde cebri icraya devam olunacağı ihtar olunur.",
          ],
          style: "warning",
        },
        { text: "\n\n" },

        // İcra Dairesi Hesap Bilgileri
        ...(data.executionOfficeDetails?.iban ? [
          { text: "\n" },
          { text: "İCRA DAİRESİ HESAP BİLGİLERİ:", style: "label" },
          {
            table: {
              widths: ["30%", "70%"],
              body: [
                ...(data.executionOfficeDetails.bankName ? [["Banka:", `${data.executionOfficeDetails.bankName}${data.executionOfficeDetails.branchName ? ` - ${data.executionOfficeDetails.branchName}` : ''}`]] : []),
                ...(data.executionOfficeDetails.iban ? [["IBAN:", data.executionOfficeDetails.iban]] : []),
                ...(data.executionOfficeDetails.taxNumber ? [["Vergi No:", data.executionOfficeDetails.taxNumber]] : []),
              ],
            },
            layout: "noBorders",
          },
        ] : []),
        { text: "\n\n" },

        // İmza
        {
          columns: [
            { text: "" },
            {
              text: [
                "İcra Müdürü\n\n\n",
                "İmza - Mühür",
              ],
              alignment: "center",
            },
          ],
        },
      ],
      styles: {
        header: { fontSize: 14, bold: true, margin: [0, 0, 0, 5] },
        subheader: { fontSize: 12, bold: true },
        title: { fontSize: 16, bold: true },
        label: { fontSize: 11, bold: true, margin: [0, 10, 0, 5] },
        warning: { fontSize: 10, italics: true, margin: [0, 10, 0, 10] },
      },
      defaultStyle: { fontSize: 10 },
    };
  }

  // Haciz Müzekkeresi şablonu
  getSeizureNoticeTemplate(
    data: DocumentData,
    targetType: string,
    targetDetails: any
  ): TDocumentDefinitions {
    const today = new Date().toLocaleDateString("tr-TR");

    let targetText = "";
    let recipientText = "";

    switch (targetType) {
      case "BANK":
        recipientText = targetDetails.bankName || "İLGİLİ BANKA";
        targetText = `Borçlu ${data.debtor.name}'ın bankanızdaki tüm hesaplarına haciz konulması`;
        break;
      case "VEHICLE":
        recipientText = "TRAFİK TESCİL ŞUBE MÜDÜRLÜĞÜ";
        targetText = `Borçlu ${data.debtor.name} adına kayıtlı ${targetDetails.plate || "araç"} üzerine haciz şerhi konulması`;
        break;
      case "PROPERTY":
        recipientText = "TAPU MÜDÜRLÜĞÜ";
        targetText = `Borçlu ${data.debtor.name} adına kayıtlı taşınmaz üzerine haciz şerhi konulması`;
        break;
      case "SALARY":
        recipientText = targetDetails.employer || "İŞVEREN";
        targetText = `Borçlu ${data.debtor.name}'ın maaşının 1/4'üne haciz konulması`;
        break;
    }

    return {
      content: [
        { text: "T.C.", style: "header", alignment: "center" },
        { text: data.executionOffice || "İCRA DAİRESİ", style: "header", alignment: "center" },
        { text: "\n" },
        { text: `Dosya No: ${data.fileNumber}`, style: "subheader" },
        { text: `Tarih: ${today}`, alignment: "right" },
        { text: "\n\n" },
        { text: "HACİZ MÜZEKKERESİ", style: "title", alignment: "center" },
        { text: "\n\n" },

        { text: `Sayın: ${recipientText}`, style: "label" },
        { text: "\n" },

        {
          text: `Dairemizin yukarıda numarası yazılı dosyasından alacaklı ${data.creditor.name} tarafından borçlu ${data.debtor.name} aleyhine başlatılan icra takibinde;`,
        },
        { text: "\n" },

        {
          text: `Borçlunun ${this.formatCurrency(data.amounts.total)} tutarındaki borcundan dolayı ${targetText} rica olunur.`,
        },
        { text: "\n\n" },

        // Borçlu bilgileri
        { text: "BORÇLU BİLGİLERİ:", style: "label" },
        {
          table: {
            widths: ["30%", "70%"],
            body: [
              ["Ad Soyad / Unvan:", data.debtor.name],
              ["TC/Vergi No:", data.debtor.identityNo || "-"],
            ],
          },
          layout: "noBorders",
        },
        { text: "\n\n" },

        // İcra Dairesi Hesap Bilgileri
        ...(data.executionOfficeDetails?.iban ? [
          { text: "\n" },
          { text: "İCRA DAİRESİ HESAP BİLGİLERİ:", style: "label" },
          {
            table: {
              widths: ["30%", "70%"],
              body: [
                ...(data.executionOfficeDetails.bankName ? [["Banka:", `${data.executionOfficeDetails.bankName}${data.executionOfficeDetails.branchName ? ` - ${data.executionOfficeDetails.branchName}` : ''}`]] : []),
                ...(data.executionOfficeDetails.iban ? [["IBAN:", data.executionOfficeDetails.iban]] : []),
                ...(data.executionOfficeDetails.taxNumber ? [["Vergi No:", data.executionOfficeDetails.taxNumber]] : []),
              ],
            },
            layout: "noBorders",
          },
        ] : []),
        { text: "\n\n" },

        // İmza
        {
          columns: [
            { text: "" },
            {
              text: ["İcra Müdürü\n\n\n", "İmza - Mühür"],
              alignment: "center",
            },
          ],
        },
      ],
      styles: {
        header: { fontSize: 14, bold: true, margin: [0, 0, 0, 5] },
        subheader: { fontSize: 12, bold: true },
        title: { fontSize: 16, bold: true },
        label: { fontSize: 11, bold: true, margin: [0, 10, 0, 5] },
      },
      defaultStyle: { fontSize: 10 },
    };
  }

  // Satış Talebi şablonu
  getSaleRequestTemplate(data: DocumentData, assetDetails: any): TDocumentDefinitions {
    const today = new Date().toLocaleDateString("tr-TR");

    return {
      content: [
        { text: "T.C.", style: "header", alignment: "center" },
        { text: data.executionOffice || "İCRA DAİRESİ", style: "header", alignment: "center" },
        { text: "\n" },
        { text: `Dosya No: ${data.fileNumber}`, style: "subheader" },
        { text: `Tarih: ${today}`, alignment: "right" },
        { text: "\n\n" },
        { text: "SATIŞ TALEBİ", style: "title", alignment: "center" },
        { text: "\n\n" },

        {
          text: `Dairenizin yukarıda numarası yazılı dosyasından alacaklı vekili olarak, borçlu ${data.debtor.name}'a ait aşağıda belirtilen hacizli malların satışını talep ediyorum.`,
        },
        { text: "\n\n" },

        { text: "HACİZLİ MALLAR:", style: "label" },
        {
          ul: assetDetails.items?.map((item: string) => item) || ["Hacizli mal bilgisi"],
        },
        { text: "\n" },

        { text: "ALACAK MİKTARI:", style: "label" },
        { text: this.formatCurrency(data.amounts.total) },
        { text: "\n\n" },

        { text: "Gereğini saygılarımla arz ederim.", margin: [0, 20, 0, 0] },
        { text: "\n\n" },

        // İmza
        {
          columns: [
            { text: "" },
            {
              text: [
                `${data.lawyer?.name || "Alacaklı Vekili"}\n`,
                data.lawyer?.barNumber ? `Baro Sicil No: ${data.lawyer.barNumber}` : "",
              ],
              alignment: "center",
            },
          ],
        },
      ],
      styles: {
        header: { fontSize: 14, bold: true, margin: [0, 0, 0, 5] },
        subheader: { fontSize: 12, bold: true },
        title: { fontSize: 16, bold: true },
        label: { fontSize: 11, bold: true, margin: [0, 10, 0, 5] },
      },
      defaultStyle: { fontSize: 10 },
    };
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
    }).format(amount);
  }
}
