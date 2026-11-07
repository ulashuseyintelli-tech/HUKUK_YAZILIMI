import { MessageTemplateCategory, MessageTemplateChannel, type Prisma } from '@prisma/client';

/** Shared by normal bureau creation and the existing explicit default-template seed. */
export function defaultMessageTemplateTokens(category: MessageTemplateCategory): string[] {
    const commonTokens = ['clientName', 'caseFileNumber', 'executionFileNumber', 'executionOfficeName', 'lawyerName', 'officeName', 'officePhone'];
    
    switch (category) {
      case 'EXPENSE_REQUEST':
        // W4-ACT02A/B içerik sözleşmesi: hesap sahibi/unvan + ödeme açıklaması referansı da taşınır.
        return [...commonTokens, 'totalAmount', 'dueDate', 'items', 'officeIban', 'accountHolder', 'paymentReference'];
      case 'EXPENSE_REMINDER':
        return [...commonTokens, 'totalAmount', 'dueDate', 'items', 'officeIban'];
      case 'COLLECTION_INFO':
        return [...commonTokens, 'totalAmount', 'collectionAmount', 'remainingAmount'];
      case 'CLIENT_INFO':
        return [...commonTokens, 'debtorName', 'status'];
      case 'DEBTOR_NOTICE':
        return ['debtorName', 'caseFileNumber', 'executionFileNumber', 'totalAmount', 'dueDate'];
      case 'PAYMENT_INFO':
        return [...commonTokens, 'totalAmount', 'paidAmount', 'remainingAmount'];
      case 'CLIENT_APPROVAL':
        return [...commonTokens, 'subjectLabel', 'decision'];
      case 'STATEMENT_READY':
        return [...commonTokens, 'periodStart', 'periodEnd', 'closingBalance'];
      case 'EXPENSE_ACTUAL':
        // C1-B05-B: gerçekleşen masraf — insan-okur dosya referansı + tarih + açıklama + tr-TR tutar.
        return [...commonTokens, 'expenseDate', 'description', 'amount', 'currency'];
      default:
        return commonTokens;
    }
  }

/** Both callers supply their own tenant; register supplies its current creation transaction. */
export async function seedDefaultMessageTemplates(
  db: Pick<Prisma.TransactionClient, 'messageTemplate'>,
  tenantId: string,
): Promise<void> {
    const templates = [
      {
        // C1-B05-B: gerçekleşen masraf bildirimi (ayrı template/event — owner kararı).
        // Raw iç ID YOK; yalnız insan-okur dosya referansı; fail-closed render tüm token'ları ister.
        code: 'EXPENSE_ACTUAL_POSTED',
        name: 'Gerçekleşen Masraf Bildirimi',
        category: 'EXPENSE_ACTUAL' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Gerçekleşen Masraf Bildirimi',
        body: `Sayın {{clientName}},

{{caseFileNumber}} numaralı dosyanızda aşağıdaki masraf gerçekleşmiş ve masraf avansı bakiyenizden karşılanmıştır:

Masraf Tarihi: {{expenseDate}}
Açıklama: {{description}}
Tutar: {{amount}} {{currency}}

Bu bildirim bilgilendirme amaçlıdır; ayrıca bir ödeme talep edilmemektedir.

Saygılarımızla,
{{officeName}}
{{officePhone}}`,
      },
      {
        code: 'EXPENSE_REQUEST',
        name: 'Masraf Talebi',
        category: 'EXPENSE_REQUEST' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        // W4-ACT02A/B içerik sözleşmesi (owner): açık amaç cümlesi + kalem türü/açıklaması/tutarı
        // (request kayıtlarından render edilir; hardcoded kategori listesi YOK) + hesap sahibi +
        // ödeme açıklaması referansı + gerçekleşen-masraf bilgilendirme cümlesi. Raw iç-ID YOK.
        subject: '{{caseFileNumber}} - Masraf Talebi',
        body: `Sayın {{clientName}},

{{caseFileNumber}} sayılı dosyanız kapsamındaki işlemlerin yürütülebilmesi için aşağıda dökümü verilen {{totalAmount}} TL masraf avansının {{dueDate}} tarihine kadar belirtilen hesaba ödenmesini rica ederiz.

Masraf Kalemleri:
{{items}}

Genel Toplam: {{totalAmount}} TL
Son Ödeme Tarihi: {{dueDate}}

Ödeme Bilgileri:
Hesap Sahibi: {{accountHolder}}
IBAN: {{officeIban}}
Ödeme Açıklaması: {{paymentReference}}

Ödemeniz alındıktan sonra bu avans kullanılarak karşılanan masrafların her biri ayrıca tarafınıza bildirilecektir.

Dekontunuzu bu e-postaya yanıt olarak iletebilirsiniz.

Saygılarımızla,
{{officeName}}
{{officePhone}}`,
      },
      {
        code: 'EXPENSE_REMINDER',
        name: 'Masraf Hatırlatma',
        category: 'EXPENSE_REMINDER' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Masraf Hatırlatma',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı icra dosyası için daha önce talep edilen masrafların henüz karşılanmadığını hatırlatmak isteriz.

Toplam Tutar: {{totalAmount}} TL
Son Ödeme Tarihi: {{dueDate}}

Ödeme Bilgileri:
{{officeIban}}

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'CASE_OPENED',
        name: 'Dosya Açıldı Bildirimi',
        category: 'CLIENT_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Dosya Açıldı',
        body: `Sayın {{clientName}},

{{debtorName}} aleyhine açılan icra takibi dosyası oluşturulmuştur.

Dosya No: {{caseFileNumber}}
İcra Dosya No: {{executionFileNumber}}
İcra Dairesi: {{executionOfficeName}}

Dosyanızla ilgili gelişmeleri size bildireceğiz.

Saygılarımızla,
{{officeName}}
{{officePhone}}`,
      },
      {
        code: 'COLLECTION_INFO',
        name: 'Tahsilat Bildirimi',
        category: 'COLLECTION_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Tahsilat Bildirimi',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı icra dosyasında tahsilat gerçekleşmiştir.

Tahsil Edilen: {{collectionAmount}} TL
Kalan Borç: {{remainingAmount}} TL

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'EXPENSE_REQUEST_SMS',
        name: 'Masraf Talebi (SMS)',
        category: 'EXPENSE_REQUEST' as MessageTemplateCategory,
        channel: 'SMS' as MessageTemplateChannel,
        subject: null,
        body: `{{caseFileNumber}} dosyası için {{totalAmount}} TL masraf talebi. Son tarih: {{dueDate}}. {{officeName}}`,
      },
      // ===== Faz 3 (mail merkezi) — yeni sistem şablonları =====
      {
        code: 'PARTIAL_PAYMENT_BALANCE',
        name: 'Kısmi Ödeme Sonrası Bakiye',
        category: 'PAYMENT_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Kısmi Ödeme Alındı',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyada kısmi ödemeniz alınmıştır.

Ödenen Tutar: {{paidAmount}} TL
Kalan Tutar: {{remainingAmount}} TL

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'PAYMENT_RECEIVED',
        name: 'Ödeme Alındı Teyidi',
        category: 'PAYMENT_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Ödeme Alındı',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyada {{totalAmount}} TL tutarındaki ödemeniz tam olarak alınmıştır. Teşekkür ederiz.

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'APPROVAL_REQUEST',
        name: 'Müvekkil İşlem Onayı Talebi',
        category: 'CLIENT_APPROVAL' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Onayınız Gerekiyor',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyada aşağıdaki işlem için onayınızı rica ederiz:

{{subjectLabel}}

Onayınızı bürumuza iletebilirsiniz.

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'APPROVAL_RESULT',
        name: 'Onay Sonucu Teyidi',
        category: 'CLIENT_APPROVAL' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Onay Sonucu',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyadaki şu işlem için kararınız kaydedilmiştir:

İşlem: {{subjectLabel}}
Karar: {{decision}}

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'STATEMENT_READY',
        name: 'Müvekkil Ekstresi Hazır',
        category: 'STATEMENT_READY' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        // caseFileSuffix: client-level "" (temiz), case-level " — {insan-okur no}". Ham {{}} kalmaz.
        subject: 'Hesap Ekstreniz Hazır{{caseFileSuffix}}',
        // fileReferenceClause: client-level "" (dosya cümlesi YOK), case-level "{no} sayılı dosyanız için ".
        // closingBalanceLine: nötr etiketli, mutlak tutar (owner kararı). Tarih Europe/Istanbul, para tr-TR.
        body: `Sayın {{clientName}},

{{fileReferenceClause}}{{periodStart}} - {{periodEnd}} dönemine ait hesap ekstreniz hazırlanmıştır.

{{closingBalanceLine}}

Ayrıntılı bilgi için büromuzla iletişime geçebilirsiniz.

Saygılarımızla,
{{officeName}}`,
      },
      // ===== Faz 4.3 (intake link) =====
      {
        code: 'INTAKE_LINK',
        name: 'Müvekkil Bilgi Formu Linki',
        category: 'CLIENT_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Bilgi Formu',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyanız için bazı bilgilere ihtiyacımız var. Aşağıdaki güvenli bağlantıdan formu doldurabilirsiniz:

{{intakeUrl}}

Son geçerlilik: {{expiresAt}}

Saygılarımızla,
{{officeName}}`,
      },
    ];

    // Existing tenant/code rows, including disabled custom copies, are never updated.
    await db.messageTemplate.createMany({
      data: templates.map(template => ({
        tenantId, ...template, isActive: true, isSystem: true,
        availableTokens: defaultMessageTemplateTokens(template.category),
      })),
      skipDuplicates: true,
    });
}
