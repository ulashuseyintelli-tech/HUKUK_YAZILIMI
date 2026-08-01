import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { OfficeApprovalService } from './office-approval.service';

/**
 * F01 mutasyon kapısı.
 *
 * JWT authentication ve tenantId tek başına Office yönetim yetkisi değildir.
 * Bu guard yalnız mevcut canonical actor modelini (ADMIN veya aynı tenant'a
 * bağlı, personel olmayan PARTNER/MANAGER/delege Lawyer) uygular. Action-specific
 * servis kapıları bundan daha dar olabilir ve korunur.
 */
@Injectable()
export class OfficeF01AuthorizationGuard implements CanActivate {
  constructor(private readonly officeApproval: OfficeApprovalService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { id?: string; tenantId?: string };
    }>();
    const userId = request.user?.id;
    const tenantId = request.user?.tenantId;

    if (!userId || !tenantId) {
      throw new ForbiddenException('OFFICE_F01_AUTHORIZATION_REQUIRED');
    }

    if (!(await this.officeApproval.isF01ActorAuthorized(userId, tenantId))) {
      throw new ForbiddenException('OFFICE_F01_AUTHORIZATION_REQUIRED');
    }

    return true;
  }
}
