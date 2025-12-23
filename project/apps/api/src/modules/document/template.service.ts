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

  // 89/1 Haciz İhbarnamesi (Birinci Haciz İhbarnamesi)
  getIhbarname89_1Template(
    data: DocumentData,
    thirdPartyDetails: {
      name: string;
      type: "BANKA" | "ISVEREN" | "KIRACI" | "DIGER";
      identityNo?: string;
      address?: string;
    }
  ): TDocumentDefinitions {
    const today = new Date().toLocaleDateString("tr-TR");

    let relationText = "";
    switch (thirdPartyDetails.type) {
      case "BANKA":
        relationText = "nezdinde bulunan mevduat, hak ve alacakları";
        break;
      case "ISVEREN":
        relationText = "nezdinde bulunan maaş ve ücret alacakları";
        break;
      case "KIRACI":
        relationText = "nezdinde bulunan kira alacakları";
        break;
      default:
        relationText = "nezdinde bulunan hak ve alacakları";
    }

    return {
      content: [
        { text: "T.C.", style: "header", alignment: "center" },
        { text: data.executionOffice || "İCRA DAİRESİ", style: "header", alignment: "center" },
        { text: "\n" },
        { text: `Dosya No: ${data.fileNumber}`, style: "subheader" },
        { text: `Tarih: ${today}`, alignment: "right" },
        { text: "\n\n" },
        { text: "BİRİNCİ HACİZ İHBARNAMESİ (89/1)", style: "title", alignment: "center" },
        { text: "(İİK m. 89/1)", style: "subtitle", alignment: "center" },
        { text: "\n\n" },

        { text: `Sayın: ${thirdPartyDetails.name}`, style: "label" },
        { text: thirdPartyDetails.address || "", fontSize: 9 },
        { text: "\n\n" },

        {
          text: [
            `Dairemizin yukarıda numarası yazılı dosyasından alacaklı `,
            { text: data.creditor.name, bold: true },
            ` tarafından borçlu `,
            { text: data.debtor.name, bold: true },
            ` aleyhine başlatılan icra takibinde;`,
          ],
        },
        { text: "\n" },

        {
          text: [
            `Borçlunun `,
            { text: this.formatCurrency(data.amounts.total), bold: true },
            ` tutarındaki borcundan dolayı, borçlunun tarafınız ${relationText} üzerine haciz konulmuştur.`,
          ],
        },
        { text: "\n\n" },

        {
          text: "İşbu ihbarnamenin tebliğinden itibaren 7 (yedi) gün içinde:",
          style: "label",
        },
        {
          ol: [
            "Borçlunun nezdinizdeki hak ve alacaklarını icra dairesine bildirmeniz,",
            "Borçluya ait hak ve alacakları icra dairesine ödemeniz veya icra dairesi adına bloke etmeniz,",
            "Borçlunun nezdinizdeki hak ve alacağı yoksa bu durumu yazılı olarak bildirmeniz,",
          ],
          margin: [20, 5, 0, 10],
        },
        { text: "\n" },

        {
          text: "gerekmektedir. Aksi halde İİK m. 89/4 gereğince borçlunun nezdinizdeki hak ve alacakları oranında sorumlu tutulacağınız ve cezai yaptırımlarla karşılaşabileceğiniz ihtar olunur.",
          style: "warning",
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
        { text: "\n" },

        // İcra Dairesi Hesap Bilgileri
        ...(data.executionOfficeDetails?.iban ? [
          { text: "İCRA DAİRESİ HESAP BİLGİLERİ:", style: "label" },
          {
            table: {
              widths: ["30%", "70%"],
              body: [
                ...(data.executionOfficeDetails.bankName ? [["Banka:", `${data.executionOfficeDetails.bankName}${data.executionOfficeDetails.branchName ? ` - ${data.executionOfficeDetails.branchName}` : ''}`]] : []),
                ...(data.executionOfficeDetails.iban ? [["IBAN:", data.executionOfficeDetails.iban]] : []),
              ],
            },
            layout: "noBorders",
          },
        ] as Content[] : []),
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
        subtitle: { fontSize: 10, italics: true },
        label: { fontSize: 11, bold: true, margin: [0, 10, 0, 5] },
        warning: { fontSize: 10, italics: true, color: "#8B0000" },
      },
      defaultStyle: { fontSize: 10 },
    };
  }

  // 89/2 Haciz İhbarnamesi (İkinci Haciz İhbarnamesi)
  getIhbarname89_2Template(
    data: DocumentData,
    thirdPartyDetails: {
      name: string;
      type: "BANKA" | "ISVEREN" | "KIRACI" | "DIGER";
      identityNo?: string;
      address?: string;
      firstIhbarnameDate: string;
    }
  ): TDocumentDefinitions {
    const today = new Date().toLocaleDateString("tr-TR");

    return {
      content: [
        { text: "T.C.", style: "header", alignment: "center" },
        { text: data.executionOffice || "İCRA DAİRESİ", style: "header", alignment: "center" },
        { text: "\n" },
        { text: `Dosya No: ${data.fileNumber}`, style: "subheader" },
        { text: `Tarih: ${today}`, alignment: "right" },
        { text: "\n\n" },
        { text: "İKİNCİ HACİZ İHBARNAMESİ (89/2)", style: "title", alignment: "center" },
        { text: "(İİK m. 89/2)", style: "subtitle", alignment: "center" },
        { text: "\n\n" },

        { text: `Sayın: ${thirdPartyDetails.name}`, style: "label" },
        { text: thirdPartyDetails.address || "", fontSize: 9 },
        { text: "\n\n" },

        {
          text: [
            `Dairemizin yukarıda numarası yazılı dosyasından `,
            { text: thirdPartyDetails.firstIhbarnameDate, bold: true },
            ` tarihinde tarafınıza gönderilen Birinci Haciz İhbarnamesine (89/1) yasal süre içinde cevap verilmediği tespit edilmiştir.`,
          ],
        },
        { text: "\n\n" },

        {
          text: "İşbu İkinci Haciz İhbarnamesinin tebliğinden itibaren 7 (yedi) gün içinde:",
          style: "label",
        },
        {
          ol: [
            "Borçlunun nezdinizdeki hak ve alacaklarını icra dairesine bildirmeniz,",
            "Borçluya ait hak ve alacakları icra dairesine ödemeniz,",
            "Borçlunun nezdinizdeki hak ve alacağı yoksa bu durumu yazılı olarak bildirmeniz,",
          ],
          margin: [20, 5, 0, 10],
        },
        { text: "\n" },

        {
          text: [
            { text: "UYARI: ", bold: true, color: "#8B0000" },
            "Bu ihbarnameye de süresinde cevap verilmemesi halinde, İİK m. 89/3 gereğince Üçüncü Haciz İhbarnamesi gönderilecek ve borçlunun nezdinizdeki hak ve alacakları oranında ",
            { text: "kesin olarak sorumlu tutulacaksınız.", bold: true },
          ],
          style: "warning",
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
        subtitle: { fontSize: 10, italics: true },
        label: { fontSize: 11, bold: true, margin: [0, 10, 0, 5] },
        warning: { fontSize: 10, italics: true },
      },
      defaultStyle: { fontSize: 10 },
    };
  }

  // 89/3 Haciz İhbarnamesi (Üçüncü Haciz İhbarnamesi)
  getIhbarname89_3Template(
    data: DocumentData,
    thirdPartyDetails: {
      name: string;
      type: "BANKA" | "ISVEREN" | "KIRACI" | "DIGER";
      identityNo?: string;
      address?: string;
      firstIhbarnameDate: string;
      secondIhbarnameDate: string;
    }
  ): TDocumentDefinitions {
    const today = new Date().toLocaleDateString("tr-TR");

    return {
      content: [
        { text: "T.C.", style: "header", alignment: "center" },
        { text: data.executionOffice || "İCRA DAİRESİ", style: "header", alignment: "center" },
        { text: "\n" },
        { text: `Dosya No: ${data.fileNumber}`, style: "subheader" },
        { text: `Tarih: ${today}`, alignment: "right" },
        { text: "\n\n" },
        { text: "ÜÇÜNCÜ HACİZ İHBARNAMESİ (89/3)", style: "title", alignment: "center" },
        { text: "(İİK m. 89/3)", style: "subtitle", alignment: "center" },
        { text: "\n\n" },

        { text: `Sayın: ${thirdPartyDetails.name}`, style: "label" },
        { text: thirdPartyDetails.address || "", fontSize: 9 },
        { text: "\n\n" },

        {
          text: [
            `Dairemizin yukarıda numarası yazılı dosyasından `,
            { text: thirdPartyDetails.firstIhbarnameDate, bold: true },
            ` tarihli Birinci ve `,
            { text: thirdPartyDetails.secondIhbarnameDate, bold: true },
            ` tarihli İkinci Haciz İhbarnamelerine yasal süre içinde cevap verilmediği tespit edilmiştir.`,
          ],
        },
        { text: "\n\n" },

        {
          text: [
            { text: "KESİN İHTAR: ", bold: true, color: "#8B0000" },
            "İşbu Üçüncü Haciz İhbarnamesinin tebliğinden itibaren ",
            { text: "15 (onbeş) gün", bold: true },
            " içinde menfi tespit davası açmamanız halinde, borçlunun nezdinizdeki hak ve alacakları oranında ",
            { text: "KESİN OLARAK SORUMLU TUTULACAKSINIZ", bold: true, color: "#8B0000" },
            " ve hakkınızda haciz işlemi yapılacaktır.",
          ],
        },
        { text: "\n\n" },

        {
          text: "Menfi tespit davası açmanız halinde, dava açtığınıza dair belgeyi 15 gün içinde icra dairesine ibraz etmeniz gerekmektedir.",
          style: "warning",
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
              ["Talep Edilen Tutar:", this.formatCurrency(data.amounts.total)],
            ],
          },
          layout: "noBorders",
        },
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
        subtitle: { fontSize: 10, italics: true },
        label: { fontSize: 11, bold: true, margin: [0, 10, 0, 5] },
        warning: { fontSize: 10, italics: true },
      },
      defaultStyle: { fontSize: 10 },
    };
  }

  // Alacak Haczi Talebi (Dosya Haczi)
  getAlacakHacziTalebiTemplate(
    data: DocumentData,
    externalCaseDetails: {
      externalOffice: string;
      externalCaseNo: string;
      counterpartyName: string;
      claimAmount: number;
    }
  ): TDocumentDefinitions {
    const today = new Date().toLocaleDateString("tr-TR");

    return {
      content: [
        { text: "T.C.", style: "header", alignment: "center" },
        { text: data.executionOffice || "İCRA DAİRESİ", style: "header", alignment: "center" },
        { text: "\n" },
        { text: `Dosya No: ${data.fileNumber}`, style: "subheader" },
        { text: `Tarih: ${today}`, alignment: "right" },
        { text: "\n\n" },
        { text: "ALACAK HACZİ TALEBİ", style: "title", alignment: "center" },
        { text: "(Dosya Haczi - İİK m. 89)", style: "subtitle", alignment: "center" },
        { text: "\n\n" },

        { text: `Sayın: ${externalCaseDetails.externalOffice}`, style: "label" },
        { text: "\n" },

        {
          text: [
            `Dairemizin yukarıda numarası yazılı dosyasından alacaklı `,
            { text: data.creditor.name, bold: true },
            ` tarafından borçlu `,
            { text: data.debtor.name, bold: true },
            ` aleyhine başlatılan icra takibinde;`,
          ],
        },
        { text: "\n\n" },

        {
          text: [
            `Borçlumuz `,
            { text: data.debtor.name, bold: true },
            `'ın, dairenizin `,
            { text: externalCaseDetails.externalCaseNo, bold: true },
            ` sayılı dosyasında `,
            { text: "ALACAKLI", bold: true },
            ` sıfatıyla kayıtlı olduğu ve `,
            { text: externalCaseDetails.counterpartyName, bold: true },
            `'dan `,
            { text: this.formatCurrency(externalCaseDetails.claimAmount), bold: true },
            ` tutarında alacağı bulunduğu tespit edilmiştir.`,
          ],
        },
        { text: "\n\n" },

        {
          text: [
            `Borçlumuzun `,
            { text: this.formatCurrency(data.amounts.total), bold: true },
            ` tutarındaki borcundan dolayı, yukarıda belirtilen dosyadaki alacağı üzerine `,
            { text: "HACİZ KONULMASINI", bold: true },
            ` ve tahsil edilecek paranın dairemize gönderilmesini talep ederiz.`,
          ],
        },
        { text: "\n\n" },

        // Haciz Konulacak Dosya Bilgileri
        { text: "HACİZ KONULACAK DOSYA BİLGİLERİ:", style: "label" },
        {
          table: {
            widths: ["35%", "65%"],
            body: [
              ["İcra Dairesi:", externalCaseDetails.externalOffice],
              ["Dosya No:", externalCaseDetails.externalCaseNo],
              ["Borçlumuzun Sıfatı:", "ALACAKLI"],
              ["Karşı Borçlu:", externalCaseDetails.counterpartyName],
              ["Alacak Tutarı:", this.formatCurrency(externalCaseDetails.claimAmount)],
            ],
          },
        },
        { text: "\n" },

        // Bizim Dosya Bilgileri
        { text: "BİZİM DOSYA BİLGİLERİ:", style: "label" },
        {
          table: {
            widths: ["35%", "65%"],
            body: [
              ["Alacaklı:", data.creditor.name],
              ["Borçlu:", data.debtor.name],
              ["Takip Tutarı:", this.formatCurrency(data.amounts.total)],
            ],
          },
        },
        { text: "\n\n" },

        // İcra Dairesi Hesap Bilgileri
        ...(data.executionOfficeDetails?.iban ? [
          { text: "PARANIN GÖNDERİLECEĞİ HESAP:", style: "label" },
          {
            table: {
              widths: ["30%", "70%"],
              body: [
                ["İcra Dairesi:", data.executionOffice || "-"],
                ["Dosya No:", data.fileNumber],
                ...(data.executionOfficeDetails.bankName ? [["Banka:", `${data.executionOfficeDetails.bankName}${data.executionOfficeDetails.branchName ? ` - ${data.executionOfficeDetails.branchName}` : ''}`]] : []),
                ...(data.executionOfficeDetails.iban ? [["IBAN:", data.executionOfficeDetails.iban]] : []),
              ],
            },
            layout: "noBorders",
          },
        ] as Content[] : []),
        { text: "\n\n" },

        { text: "Gereğini saygılarımla arz ederim.", margin: [0, 10, 0, 0] },
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
        subtitle: { fontSize: 10, italics: true },
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
