/**
 * PORTAL-RESET-FORM-01 — müvekkil portalı giriş / şifremi unuttum formlarının e-posta ön denetimi.
 *
 * Yalnız girdinin BİÇİMİNE bakar; hesabın var olup olmadığına dair hiçbir bilgi üretmez ve sunucu yanıtını
 * değiştirmez (hesap var / yok ayrımı yapan yeni mesaj yoktur). Amaç, boş ya da biçimsiz adresin hiç istek
 * üretmeden açık bir uyarıyla durdurulmasıdır: ölçülen kusurda boş `{ email: "" }` gövdesi API'den 201
 * `{ success: true }` alıyor, kullanıcı "E-posta Gönderildi" görüyordu.
 *
 * Tarayıcının kendi alan denetimi (`required`, `type="email"`) yerinde kalır; bu denetim onun
 * çalışmadığı / atlandığı durum için ikinci savunmadır. Biçim deseni bilerek tarayıcının `type="email"`
 * kuralı kadar gevşektir (alan adında nokta İSTENMEZ): portal hesabı açılırken adresin biçimine bakılmaz,
 * daha katı bir desen o biçimde açılmış bir hesabın giriş ve sıfırlama isteğini kesebilirdi.
 */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+$/;

export const PORTAL_EMAIL_REQUIRED_MESSAGE = "E-posta adresinizi girin.";
export const PORTAL_EMAIL_FORMAT_MESSAGE = "Geçerli bir e-posta adresi girin.";

/**
 * Alanın gönderim anındaki değerini okur. E-posta alanında baştaki / sondaki boşluk atılır (tarayıcı
 * `type="email"` alanında bunu zaten yapar); parola alanları için KULLANILMAZ — parola olduğu gibi gider.
 */
export function readPortalEmailField(input: HTMLInputElement | null): string {
  return (input?.value ?? "").trim();
}

/** Boşsa ya da biçimsizse kullanıcıya gösterilecek uyarı; geçerliyse `null`. */
export function portalEmailInputProblem(email: string): string | null {
  if (!email) return PORTAL_EMAIL_REQUIRED_MESSAGE;
  if (!EMAIL_FORMAT.test(email)) return PORTAL_EMAIL_FORMAT_MESSAGE;
  return null;
}
