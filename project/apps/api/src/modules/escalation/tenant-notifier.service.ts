import { Injectable, Logger } from "@nestjs/common";
import { OfficeService } from "../office/office.service";
import { fetchWithTimeout } from "../../common/fetch-with-timeout.util";
import { normalizeTrPhone } from "./escalation-logic";
import * as nodemailer from "nodemailer";

/**
 * Gönderim sonucu (PR-3b.2 retry-safety):
 *  - SENT: en az bir kanal gerçekten teslim etti → guard ilerler.
 *  - FAILED: sağlayıcı hatası/exception (geçici) → guard ilerlemez, sonraki tick retry.
 *  - SKIPPED: gönderecek kimse/yapılandırma yok (benign) → guard ilerlemez (self-heal).
 */
export type DispatchResult = "SENT" | "FAILED" | "SKIPPED";

/**
 * Tenant-bazlı ham e-posta/SMS gönderici (D-G1: OperationalEscalationService'ten DAVRANIŞ-KORUYAN
 * extraction). Birden çok eskalasyon motoru (operasyonel + dosya görevi) AYNI dispatch yolunu paylaşır
 * (duplikasyon yok). SENT/FAILED/SKIPPED semantiği + SMTP/SMS-provider ayrımı + config-yoksa sessiz skip
 * davranışı BİREBİR korunmuştur — characterization test ile kilitli.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - OperationalEscalationService.dispatch() → operasyonel eksik-görev bildirimi
 * - (D-G3) CaseTaskEscalationService.dispatch() → dosya görevi owner-first bildirimi
 * </remarks>
 */
@Injectable()
export class TenantNotifier {
  private readonly logger = new Logger(TenantNotifier.name);

  constructor(private officeService: OfficeService) {}

  /**
   * Tenant SMTP ile ham e-posta gönderir (PR-3b.2).
   * SKIPPED: SMTP yapılandırılmamış. FAILED: gönderim exception'ı (retry). SENT: başarılı.
   */
  async sendEmail(tenantId: string, to: string, subject: string, html: string): Promise<DispatchResult> {
    const s = await this.officeService.getFullSmtpSettings(tenantId).catch(() => null);
    if (!s || !s.smtpHost || !s.smtpUser) {
      this.logger.warn(`E-posta skipped (SMTP yapılandırılmamış): tenant ${tenantId}`);
      return "SKIPPED";
    }
    try {
      const transporter = nodemailer.createTransport({
        host: s.smtpHost,
        port: s.smtpPort || 587,
        secure: s.smtpSecure || false,
        auth: { user: s.smtpUser, pass: s.smtpPass },
      } as nodemailer.TransportOptions);
      const from = `"${s.smtpFromName || "Hukuk Bürosu"}" <${s.smtpFromEmail || s.smtpUser}>`;
      await transporter.sendMail({ from, to, subject, html });
      return "SENT";
    } catch (e: any) {
      this.logger.error(`Eskalasyon e-posta hatası (${to}): ${e?.message}`);
      return "FAILED";
    }
  }

  /**
   * Tenant SMS sağlayıcısı ile ham SMS gönderir (PR-3b.2).
   * SKIPPED: sağlayıcı yok / numara geçersiz / desteklenmeyen sağlayıcı.
   * FAILED: sağlayıcı hata yanıtı veya exception (retry). SENT: başarılı.
   */
  async sendSms(tenantId: string, to: string, message: string): Promise<DispatchResult> {
    const s = await this.officeService.getFullSmsSettings(tenantId).catch(() => null);
    if (!s || !s.smsProvider || !s.smsApiKey) {
      this.logger.warn(`SMS skipped (sağlayıcı yapılandırılmamış): tenant ${tenantId}`);
      return "SKIPPED";
    }
    const phone = normalizeTrPhone(to);
    if (!phone) {
      this.logger.warn(`SMS skipped (geçersiz cep numarası): ${to}`);
      return "SKIPPED";
    }
    try {
      if (s.smsProvider === "NETGSM") {
        const params = new URLSearchParams({
          usercode: s.smsApiKey || "",
          password: s.smsApiSecret || "",
          gsmno: phone,
          message,
          msgheader: s.smsSender || "HUKUKBURO",
          filter: "0",
        });
        const res = await fetchWithTimeout(`https://api.netgsm.com.tr/sms/send/get?${params.toString()}`, undefined, 10_000);
        const text = await res.text();
        if (text.split(" ")[0] !== "00" && !text.startsWith("00")) {
          this.logger.error(`NetGSM eskalasyon SMS hatası: ${text}`);
          return "FAILED";
        }
        return "SENT";
      }
      if (s.smsProvider === "ILETI_MERKEZI") {
        const params = new URLSearchParams({
          username: s.smsApiKey || "",
          password: s.smsApiSecret || "",
          text: message,
          receipents: phone,
          sender: s.smsSender || "HUKUKBURO",
        });
        const res = await fetchWithTimeout(`https://api.iletimerkezi.com/v1/send-sms/get?${params.toString()}`, undefined, 10_000);
        const text = await res.text();
        if (/error/i.test(text)) {
          this.logger.error(`İleti Merkezi eskalasyon SMS hatası: ${text}`);
          return "FAILED";
        }
        return "SENT";
      }
      this.logger.warn(`SMS skipped (desteklenmeyen sağlayıcı ${s.smsProvider})`);
      return "SKIPPED";
    } catch (e: any) {
      this.logger.error(`Eskalasyon SMS hatası (${to}): ${e?.message}`);
      return "FAILED";
    }
  }
}
