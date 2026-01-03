/**
 * Müvekkil Bilgi Talebi E-posta Şablonu
 * 
 * Dosya açıldığında müvekkile otomatik gönderilen e-posta.
 * Borçlu adres/telefon/e-posta bilgilerini talep eder.
 */

export interface ClientInfoEmailData {
  clientName: string;
  debtorName: string;
  debtorIdentityNo?: string;
  caseNumber: string;
  lawyerName: string;
  firmName: string;
  firmPhone?: string;
  firmEmail?: string;
}

/**
 * E-posta konusu oluştur
 */
export function generateClientInfoEmailSubject(data: ClientInfoEmailData): string {
  return `Borçlu Bilgi Talebi - ${data.debtorName} - Dosya No: ${data.caseNumber}`;
}

/**
 * E-posta içeriği oluştur (düz metin)
 */
export function generateClientInfoEmailText(data: ClientInfoEmailData): string {
  return `Sayın ${data.clientName},

Tarafınız adına başlatılan icra dosyasında yer alan borçluya ilişkin elinizde bulunan adres, telefon, e-posta ve diğer iletişim bilgilerini tarafımıza iletmenizi rica ederiz.

Borçlu: ${data.debtorName}${data.debtorIdentityNo ? ` (${data.debtorIdentityNo})` : ''}
Dosya No: ${data.caseNumber}

Bu bilgiler, tebligat işlemlerinin sağlıklı yürütülmesi için gereklidir.

Bilgilerinizi bu e-postaya yanıt olarak iletebilirsiniz.

Saygılarımızla,
${data.lawyerName}
${data.firmName}${data.firmPhone ? `\nTel: ${data.firmPhone}` : ''}${data.firmEmail ? `\nE-posta: ${data.firmEmail}` : ''}`;
}

/**
 * E-posta içeriği oluştur (HTML)
 */
export function generateClientInfoEmailHtml(data: ClientInfoEmailData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px; }
    .info-box { background: #f8fafc; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; color: #1e40af;">Borçlu Bilgi Talebi</h2>
    </div>
    
    <p>Sayın <strong>${data.clientName}</strong>,</p>
    
    <p>Tarafınız adına başlatılan icra dosyasında yer alan borçluya ilişkin <strong>elinizde bulunan adres, telefon, e-posta ve diğer iletişim bilgilerini</strong> tarafımıza iletmenizi rica ederiz.</p>
    
    <div class="info-box">
      <p style="margin: 0;"><strong>Borçlu:</strong> ${data.debtorName}${data.debtorIdentityNo ? ` (${data.debtorIdentityNo})` : ''}</p>
      <p style="margin: 5px 0 0 0;"><strong>Dosya No:</strong> ${data.caseNumber}</p>
    </div>
    
    <p>Bu bilgiler, tebligat işlemlerinin sağlıklı yürütülmesi için gereklidir.</p>
    
    <p><em>Bilgilerinizi bu e-postaya yanıt olarak iletebilirsiniz.</em></p>
    
    <div class="footer">
      <p style="margin: 0;">Saygılarımızla,</p>
      <p style="margin: 5px 0;"><strong>${data.lawyerName}</strong></p>
      <p style="margin: 0;">${data.firmName}</p>
      ${data.firmPhone ? `<p style="margin: 0;">Tel: ${data.firmPhone}</p>` : ''}
      ${data.firmEmail ? `<p style="margin: 0;">E-posta: ${data.firmEmail}</p>` : ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Hatırlatma e-postası konusu
 */
export function generateReminderEmailSubject(data: ClientInfoEmailData, reminderCount: number): string {
  return `[Hatırlatma ${reminderCount}] Borçlu Bilgi Talebi - ${data.debtorName}`;
}

/**
 * Hatırlatma e-postası içeriği (düz metin)
 */
export function generateReminderEmailText(data: ClientInfoEmailData): string {
  return `Sayın ${data.clientName},

Daha önce tarafınıza gönderdiğimiz borçlu bilgi talebine henüz yanıt alamadık.

Borçlu: ${data.debtorName}${data.debtorIdentityNo ? ` (${data.debtorIdentityNo})` : ''}
Dosya No: ${data.caseNumber}

Tebligat işlemlerinin aksamadan yürütülebilmesi için borçluya ait adres, telefon ve e-posta bilgilerini en kısa sürede iletmenizi rica ederiz.

Saygılarımızla,
${data.lawyerName}
${data.firmName}`;
}
