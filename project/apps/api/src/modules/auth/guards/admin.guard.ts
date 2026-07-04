// K1-7: ADMIN rol kapısı. JwtAuthGuard'DAN SONRA kullanılır (request.user set olmuş olur).
// Mevcut kodda rol-bazlı guard yoktu; bu yalnız admin provisioning uçları için eklendi.
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.user?.role !== "ADMIN") {
      throw new ForbiddenException("Bu işlem için ADMIN yetkisi gerekir");
    }
    return true;
  }
}
