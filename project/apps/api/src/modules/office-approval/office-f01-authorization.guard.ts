import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { OfficeApprovalService } from './office-approval.service';
import { assertOfficeWriteRole } from './office-write-role.policy';

/** AK-1a: OKUMA fiilleri; bunların dışındaki her fiil (yöntemi bilinmeyen dahil) YAZMA sayılır — fail-closed. */
const F01_READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * F01 mutasyon kapısı.
 *
 * JWT authentication ve tenantId tek başına Office yönetim yetkisi değildir.
 * Bu guard yalnız mevcut canonical actor modelini (ADMIN veya aynı tenant'a
 * bağlı, personel olmayan PARTNER/MANAGER/delege Lawyer) uygular. Action-specific
 * servis kapıları bundan daha dar olabilir ve korunur.
 *
 * AK-1a (owner GO 2026-09-10): yazma fiillerinde (POST/PUT/PATCH/DELETE) VIEWER elenir — bağlı avukatı
 * PARTNER/MANAGER ya da delege olsa bile. Okuma fiillerinde davranış DEĞİŞMEZ.
 */
@Injectable()
export class OfficeF01AuthorizationGuard implements CanActivate {
  constructor(private readonly officeApproval: OfficeApprovalService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      user?: { id?: string; tenantId?: string; role?: string };
    }>();
    const userId = request.user?.id;
    const tenantId = request.user?.tenantId;

    if (!userId || !tenantId) {
      throw new ForbiddenException('OFFICE_F01_AUTHORIZATION_REQUIRED');
    }

    if (F01_READ_METHODS.has(String(request.method ?? '').toUpperCase())) {
      if (!(await this.officeApproval.isF01ActorAuthorized(userId, tenantId))) {
        throw new ForbiddenException('OFFICE_F01_AUTHORIZATION_REQUIRED');
      }
      return true;
    }

    // YAZMA: istek rolü yalnız anlaşılır ret kodu içindir; yetki kaynağı DB rolüdür (isF01WriteActorAuthorized).
    assertOfficeWriteRole(request.user?.role);
    if (!(await this.officeApproval.isF01WriteActorAuthorized(userId, tenantId))) {
      throw new ForbiddenException('OFFICE_F01_AUTHORIZATION_REQUIRED');
    }

    return true;
  }
}
