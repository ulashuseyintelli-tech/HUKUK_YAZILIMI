/**
 * Portal oturum reddi — ortak kural.
 *
 * Sorun: kapatılmış / geçersiz oturumla açılan portal sayfaları giriş sayfasına dönmek yerine
 * hata metni gösteriyordu ("Geçersiz token", "Mesajlar yüklenemedi"). Portal çerçevesi yalnız
 * oturum işaretinin VARLIĞINA bakar; geçerliliğini ancak sunucunun yanıtı söyler.
 *
 * Kural:
 *  - OTURUM REDDİ yalnız HTTP 401'dir ve yalnız 401'i sadece portal oturum kapısının
 *    üretebildiği uçlarda bu yardımcıya verilir. Giriş ve şifre değiştirme uçları 401'i başka
 *    anlamda da döndürür ("mevcut şifre yanlış") — o çağrılar bu yardımcıyı KULLANMAZ.
 *  - Ağ hatası, 5xx, 403, 404 ve bozuk gövde oturum reddi DEĞİLDİR; oturum korunur.
 *  - SUNUCU AYRIMI: portal oturum kapısı, oturumu doğrularken TANINAN bir veritabanı erişim
 *    hatası alırsa 503 döner (oturum reddi değil) — bu istemci onu "oturum korunur" sınıfında
 *    işler. SÜRÜM EŞLEŞMESİ: bu ayrımı yapmayan ESKİ bir sunucu aynı durumu 401 ile yanıtlar;
 *    istemci onu gerçek oturum reddinden AYIRAMAZ ve kullanıcı girişe yönlendirilir.
 *  - GECİKMİŞ RET: istek hangi işaretle gönderildiyse ret yalnız o işaret hâlâ
 *    tarayıcıdaysa işlenir. Bu arada yeni oturum açıldıysa (işaret değiştiyse) ya da oturum
 *    zaten temizlendiyse ret BAYATTIR: hiçbir şey silinmez, yönlendirme yapılmaz.
 *  - TEK YÖNLENDİRME: işlenen ilk ret işareti siler; aynı oturumun öteki istekleri reddedildiğinde
 *    işaret artık olmadığı için bayat sayılır. Yönlendirmeyi portal çerçevesi yapar (aşağıdaki
 *    olayı dinler) — bu yardımcıyı kullanan sayfalar kendi başına yönlendirme üretmez. (Ana sayfa
 *    ve Dosyalarım bu yardımcıdan ÖNCE yazılmış kendi 401 işleyicilerini kullanır; değişmedi.)
 */

export const PORTAL_TOKEN_STORAGE_KEY = "portal_token";
export const PORTAL_USER_STORAGE_KEY = "portal_user";
export const PORTAL_LOGIN_PATH = "/portal/login";
export const PORTAL_SESSION_REJECTED_EVENT = "portal:session-rejected";

export type PortalSessionRejectionOutcome =
  /** 401 değil — çağıran kendi hata / başarı akışına devam eder. */
  | "NOT_REJECTED"
  /** Bu oturum reddedildi: işaret + kullanıcı bilgisi silindi, çerçeveye haber verildi. */
  | "REJECTED"
  /** 401, ama istek başka (eski / temizlenmiş) bir oturumla gitmişti: hiçbir şey değişmedi. */
  | "STALE";

/**
 * Bayat retten sonra: isteğin gönderildiği işaretten FARKLI, geçerli bir oturum işareti varsa onu
 * döndürür (çağıran okumayı o oturumla bir kez yineler); yoksa null (oturum zaten temizlendi —
 * yönlendirme başlamıştır).
 */
export function newerPortalSessionToken(sentToken: string | null | undefined): string | null {
  const current = window.localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY);
  return current && current !== sentToken ? current : null;
}

export function handlePortalSessionRejection(args: {
  status: number;
  /** İsteğin GÖNDERİLDİĞİ işaret (yanıt geldiği andaki işaret değil). */
  sentToken: string | null | undefined;
}): PortalSessionRejectionOutcome {
  if (args.status !== 401) return "NOT_REJECTED";
  // İşaretsiz gönderilmiş isteğin reddi yönlendirme üretmez; işaret yokken çerçevenin kendi
  // "işaret yoksa girişe git" kuralı geçerlidir.
  if (!args.sentToken) return "STALE";
  if (window.localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY) !== args.sentToken) return "STALE";
  window.localStorage.removeItem(PORTAL_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(PORTAL_USER_STORAGE_KEY);
  window.dispatchEvent(new Event(PORTAL_SESSION_REJECTED_EVENT));
  return "REJECTED";
}
