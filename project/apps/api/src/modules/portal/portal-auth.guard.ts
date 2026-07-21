import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../prisma/prisma.service";

interface PortalTokenPayload {
  sub: string;
  clientId: string;
  tenantId: string;
  type: string;
  tokenVersion?: unknown;
}

@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService
  ) {}

  /**
   * CLIENT-P2-U02: imza/type doğrulamasından sonra credential-state'i database'den
   * doğrular (fail-closed) — ham JWT claim'i downstream authority olarak bırakılmaz.
   * Tüm ret nedenleri kasıtlı olarak AYNI genel mesaja düşer (disabled/stale/not-found/
   * DB-hatası ayrımı response'ta açıklanmaz).
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException("Token bulunamadı");
    }

    try {
      const payload: PortalTokenPayload = await this.jwtService.verifyAsync(token);

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
          client: { select: { tenantId: true } },
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

      // Yalnız database ile doğrulanmış identity request'e yazılır.
      request.portalUser = {
        id: portalUser.id,
        sub: portalUser.id,
        clientId: portalUser.clientId,
        tenantId: portalUser.client.tenantId,
        tokenVersion: portalUser.tokenVersion,
      };
    } catch {
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
