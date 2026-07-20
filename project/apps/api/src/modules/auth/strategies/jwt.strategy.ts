import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  // OFFICE-AUTH-P01: eski (bu alandan önce imzalanmış) token'larda bu claim yok.
  // AuthService.validateUser() bunu backward-compat için 0 kabul eder.
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.authService.validateUser(payload.sub, payload.tokenVersion);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
