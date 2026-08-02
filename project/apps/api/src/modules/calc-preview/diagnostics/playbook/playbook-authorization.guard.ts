import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionHardGuardService } from '../../../permission-diagnostics/permission-hard-guard.service';
import { TenantContext } from '../../tenant-context/tenant-context.types';

export const PLAYBOOK_ACTION_METADATA = 'playbook:action';

export const PlaybookAction = (action: string): MethodDecorator =>
  SetMetadata(PLAYBOOK_ACTION_METADATA, action);

/**
 * Bounded authorization bridge for the dormant Playbook controller.
 * Authentication and tenant resolution are deliberately delegated to the
 * canonical guards; this guard only invokes the existing action gate.
 */
@Injectable()
export class PlaybookAuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionGuard: PermissionHardGuardService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const tenantContext = request.tenantContext as TenantContext | undefined;
    if (!tenantContext?.tenantId || !tenantContext.actor?.id) {
      throw new UnauthorizedException('Authenticated tenant context is required');
    }

    const action = this.reflector.getAllAndOverride<string>(
      PLAYBOOK_ACTION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!action) {
      throw new UnauthorizedException('Playbook action metadata is required');
    }

    request.playbookAction = action;
    await this.permissionGuard.assertBridgeAdmin(action, {
      tenantId: tenantContext.tenantId,
      actorUserId: tenantContext.actor.id,
      role: request.user?.role,
      entityId: request.params?.id ?? action,
      requestPath: request.originalUrl ?? request.url ?? action,
    });

    return true;
  }
}
