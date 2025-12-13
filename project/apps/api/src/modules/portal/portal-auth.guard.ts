import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException("Token bulunamadı");
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      
      // Portal token'ı mı kontrol et
      if (payload.type !== "portal") {
        throw new UnauthorizedException("Geçersiz token türü");
      }

      request.portalUser = payload;
    } catch {
      throw new UnauthorizedException("Geçersiz token");
    }

    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
