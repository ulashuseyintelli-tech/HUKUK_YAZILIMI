import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ICRABOT_V28_DEV_SURFACE_ENABLED,
  ICRABOT_V28_EXTERNAL_INGEST_ENABLED,
  ICRABOT_V28_UNSAFE_MUTATION_ENABLED,
  IcrabotV28SurfaceFlag,
  isIcrabotV28SurfaceEnabled,
} from '../outbox.constants';

abstract class IcrabotV28SurfaceGuard implements CanActivate {
  protected abstract readonly flag: IcrabotV28SurfaceFlag;

  canActivate(_context: ExecutionContext): boolean {
    if (!isIcrabotV28SurfaceEnabled(this.flag)) {
      throw new ForbiddenException();
    }

    return true;
  }
}

@Injectable()
export class IcrabotV28DevSurfaceGuard extends IcrabotV28SurfaceGuard {
  protected readonly flag = ICRABOT_V28_DEV_SURFACE_ENABLED;
}

@Injectable()
export class IcrabotV28UnsafeMutationGuard extends IcrabotV28SurfaceGuard {
  protected readonly flag = ICRABOT_V28_UNSAFE_MUTATION_ENABLED;
}

@Injectable()
export class IcrabotV28ExternalIngestGuard extends IcrabotV28SurfaceGuard {
  protected readonly flag = ICRABOT_V28_EXTERNAL_INGEST_ENABLED;
}
