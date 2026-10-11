import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isLoginableLifecycle } from "../tenant/tenant-lifecycle";

interface PortalTokenPayload {
  sub: string;
  clientId: string;
  tenantId: string;
  type: string;
  tokenVersion?: unknown;
}

/** Oturum doğrulaması neden tamamlanamadı? Üç sınıf da erişimi KAPALI tutar; yalnız yanıt kodu ayrışır. */
export type PortalAuthFailureKind =
  /** Kimlik doğrulama hatası: kapının kendi verdiği ret (imza / süre / tür / sürüm / kapatılmış hesap) → 401. */
  | "AUTH"
  /** TANINAN veritabanı erişim / bağlantı hatası: doğrulama yapılamadı → 503. */
  | "DATABASE_UNAVAILABLE"
  /** Bunların dışındaki her şey: önceki kapalı davranış korunur → 401. */
  | "UNEXPECTED";

/** Yanıta yazılan TEK metin; veritabanı ya da altyapı ayrıntısı taşımaz. */
export const PORTAL_AUTH_UNAVAILABLE_MESSAGE = "Hizmet geçici olarak kullanılamıyor";

/**
 * Veritabanına ERİŞİLEMEDİĞİNİ bildiren Prisma hata kodları: veritabanı sunucusu kimliği reddetti (P1000),
 * sunucuya ulaşılamadı (P1001), zaman aşımı (P1002, P1008), veritabanı bulunamadı (P1003), erişim reddedildi
 * (P1010), güvenli bağlantı açılamadı (P1011), bağlantı kapandı (P1017), havuzdan bağlantı alınamadı (P2024),
 * veritabanı yeni bağlantı kabul etmiyor (P2037). Aynı koşullar bağlantı kurulurken
 * `PrismaClientInitializationError` olarak gelir ve o sınıf kodundan bağımsız 503'tür; küme iki yolu tutarlı kılar.
 * Liste bilerek dardır: sorgu, kısıt, şema ya da işlem (transaction) hataları burada YOKTUR — onlar "beklenmeyen"
 * sınıfında kalır.
 */
const DATABASE_UNAVAILABLE_PRISMA_CODES: ReadonlySet<string> = new Set([
  "P1000", "P1001", "P1002", "P1003", "P1008", "P1010", "P1011", "P1017", "P2024", "P2037",
]);

/**
 * Yalnız hata SINIFINA bakar; `name` ya da `code` benzerliğine güvenmez. İşaret doğrulama hataları buraya ham
 * hâlleriyle gelmez: kapı onları doğrulama adımında 401'e çevirir (bkz. `canActivate`).
 */
export function classifyPortalAuthFailure(error: unknown): PortalAuthFailureKind {
  if (error instanceof UnauthorizedException) return "AUTH";
  if (error instanceof Prisma.PrismaClientInitializationError) return "DATABASE_UNAVAILABLE";
  if (error instanceof Prisma.PrismaClientKnownRequestError && DATABASE_UNAVAILABLE_PRISMA_CODES.has(error.code)) {
    return "DATABASE_UNAVAILABLE";
  }
  return "UNEXPECTED";
}

@Injectable()
export class PortalAuthGuard implements CanActivate {
  private readonly logger = new Logger(PortalAuthGuard.name);

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
  ) {}

  /**
   * CLIENT-P2-U02: imza/type doğrulamasından sonra credential-state'i database'den
   * doğrular (fail-closed) — ham JWT claim'i downstream authority olarak bırakılmaz.
   * Tüm OTURUM RETLERİ kasıtlı olarak AYNI genel 401 mesajına düşer (disabled/stale/not-found
   * ayrımı response'ta açıklanmaz).
   *
   * Doğrulama TAMAMLANAMAZSA da erişim kapalıdır (korunan işlem çalışmaz, `request.portalUser`
   * yazılmaz); yalnız yanıt kodu ayrışır (bkz. `classifyPortalAuthFailure`):
   *  - TANINAN veritabanı erişim hatası → 503, genel metin. Bu bir oturum reddi DEĞİLDİR: istemci
   *    oturumu silmemeli, kullanıcıyı çıkışa atmamalıdır.
   *  - Beklenmeyen hata → önceki kapalı davranış (401, genel metin).
   * Hiçbir durumda veritabanı / altyapı ayrıntısı yanıta yazılmaz.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException("Token bulunamadı");
    }

    try {
      // İşaret doğrulanamadıysa (imza, süre, biçim, çözülemeyen gövde …) bu HER ZAMAN oturum reddidir: işaret
      // çağıranın gönderdiği veridir; kimliği doğrulanmamış bir istek "beklenmeyen hata" günlüğü üretememelidir.
      const payload: PortalTokenPayload = await this.jwtService.verifyAsync(token).catch(() => {
        throw new UnauthorizedException("Geçersiz token");
      });

      if (payload.type !== "portal") {
        throw new UnauthorizedException("Geçersiz token türü");
      }

      const claimedVersion = this.normalizeTokenVersion(payload.tokenVersion);
      if (claimedVersion === null) {
        throw new UnauthorizedException("Geçersiz token sürümü");
      }

      const portalUser = await this.prisma.clientPortalUser.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          clientId: true,
          isActive: true,
          tokenVersion: true,
          client: { select: { tenantId: true, tenant: { select: { lifecycle: true } } } },
        },
      });

      if (!portalUser || !portalUser.client || !portalUser.isActive) {
        throw new UnauthorizedException("Geçersiz token");
      }

      if (portalUser.clientId !== payload.clientId || portalUser.client.tenantId !== payload.tenantId) {
        throw new UnauthorizedException("Geçersiz token");
      }

      if (claimedVersion !== portalUser.tokenVersion) {
        throw new UnauthorizedException("Geçersiz token");
      }

      // CLIENT-PSUS (owner kararı 2026-09-19): tenant ACTIVE değilse (QUIESCING/SUSPENDED/RETIRED/PROVISIONING)
      // portal erişimi KAPALIDIR; önceden üretilmiş geçerli token bir SONRAKİ istekte reddedilir. Personel tarafındaki
      // `validateUser` ile AYNI yüklem (`isLoginableLifecycle`) kullanılır; kontrol kullanıcı değil TENANT düzeyindedir,
      // bu yüzden ClientPortalUser satırına YAZILMAZ — yeniden etkinleştirme, ayrıca kapatılmış kullanıcıyı açmaz.
      // Ret nedeni diğerleriyle AYNI genel mesaja düşer (yaşam döngüsü yanıta yansımaz). Lifecycle okunamazsa fail-closed.
      if (!isLoginableLifecycle(portalUser.client.tenant?.lifecycle)) {
        throw new UnauthorizedException("Geçersiz token");
      }

      // Yalnız database ile doğrulanmış identity request'e yazılır.
      request.portalUser = {
        id: portalUser.id,
        sub: portalUser.id,
        clientId: portalUser.clientId,
        tenantId: portalUser.client.tenantId,
        tokenVersion: portalUser.tokenVersion,
      };
    } catch (error) {
      const kind = classifyPortalAuthFailure(error);
      if (kind === "DATABASE_UNAVAILABLE") {
        // Günlüğe yalnız hata sınıfı / kodu yazılır (ileti metni bağlantı ayrıntısı taşıyabilir).
        this.logger.warn(`portal oturum doğrulaması: veritabanına erişilemedi (${describeErrorClass(error)})`);
        throw new ServiceUnavailableException(PORTAL_AUTH_UNAVAILABLE_MESSAGE);
      }
      if (kind === "UNEXPECTED") {
        this.logger.error(`portal oturum doğrulaması: beklenmeyen hata (${describeErrorClass(error)}) — erişim reddedildi`);
      }
      throw new UnauthorizedException("Geçersiz token");
    }

    return true;
  }

  /**
   * Claim yoksa 0 kabul edilir (legacy cutover). Sayı olmayan/negatif/tam-sayı-olmayan
   * claim geçersiz sayılır (null → guard reddeder).
   */
  private normalizeTokenVersion(claim: unknown): number | null {
    if (claim === undefined) {
      return 0;
    }
    if (typeof claim !== "number" || !Number.isInteger(claim) || claim < 0) {
      return null;
    }
    return claim;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}

/** Günlük için: hata sınıfı adı (+ varsa Prisma kodu; başlatma hatasında `errorCode`). İleti metni BİLEREK alınmaz. */
function describeErrorClass(error: unknown): string {
  const name = (error as { constructor?: { name?: unknown } } | null | undefined)?.constructor?.name;
  const fields = error as { code?: unknown; errorCode?: unknown } | null | undefined;
  const code = fields?.code ?? fields?.errorCode;
  const safeName = typeof name === "string" && name ? name : typeof error;
  return typeof code === "string" && /^[A-Z]\d{4}$/.test(code) ? `${safeName} ${code}` : safeName;
}
