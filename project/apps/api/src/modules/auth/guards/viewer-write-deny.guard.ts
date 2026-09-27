import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isOfficeWriteDeniedForRole } from '../../office-approval/office-write-role.policy';

/**
 * B4/B6 (owner GO 2026-09-27) — VIEWER için DOSYA ve MALİ YÜRÜTME alanlarında SALT-OKUMA sınırı.
 *
 * `UserRole.VIEWER` bu guard'ın takıldığı controller'larda yazma fiili (POST/PUT/PATCH/DELETE ve yöntemi
 * bilinmeyen her fiil — fail-closed) çağıramaz; bağlı avukatı PARTNER/MANAGER ya da delege olsa bile. Okuma
 * fiilleri (GET/HEAD/OPTIONS) ve `@AllowViewerReadOnlyPost()` ile işaretlenmiş, YAZMA YAPMADIĞI doğrulanmış
 * hesap/önizleme POST'ları değişmez. ADMIN/USER bu guard'dan etkilenmez; mevcut kapılarına tabi kalır.
 *
 * Yüklem OFFICE AK-1a ile AYNIDIR (`isOfficeWriteDeniedForRole`); rol `req.user`'dan gelir ve `req.user`
 * her istekte DB'den yüklenir (JwtStrategy → AuthService.validateUser) — token iddiası DEĞİL.
 * Guard `JwtAuthGuard`'dan SONRA çalışacak sırada eklenmelidir.
 *
 * /// <remarks>
 * /// Kullanıldığı yerler (sınıf düzeyi): case, case-debtor, claim-item, collection, client-payout,
 * /// collection-disposition, client-offset, client-payout-manual-reversal, case-fee-agreement,
 * /// client-financial-disclosure (+office command), expense-request controller'ları.
 * /// </remarks>
 */
export const VIEWER_WRITE_DENIED = 'VIEWER_WRITE_DENIED';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOW_VIEWER_READ_ONLY_POST = 'allowViewerReadOnlyPost';

/** Yalnız YAZMA YAPMADIĞI kaynaktan doğrulanmış hesap/önizleme POST'ları için. */
export const AllowViewerReadOnlyPost = () => SetMetadata(ALLOW_VIEWER_READ_ONLY_POST, true);

@Injectable()
export class ViewerWriteDenyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string; user?: { role?: string } }>();
    if (READ_METHODS.has(String(request.method ?? '').toUpperCase())) return true;
    if (!isOfficeWriteDeniedForRole(request.user?.role)) return true;
    if (this.reflector.get<boolean>(ALLOW_VIEWER_READ_ONLY_POST, context.getHandler()) === true) return true;
    throw new ForbiddenException({
      code: VIEWER_WRITE_DENIED,
      message: 'Görüntüleyici (VIEWER) rolü bu alanda yazma veya yürütme işlemi yapamaz.',
    });
  }
}
