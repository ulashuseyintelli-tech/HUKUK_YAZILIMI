/**
 * BreakGlassKillSwitchGuard
 * 
 * GATE 3: Kill switch functionality.
 * When BREAK_GLASS_ENABLED=false, all internal-ops endpoints return 503.
 * 
 * This guard must be the FIRST guard in the chain for all internal-ops routes.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { BreakGlassConfigService } from '../break-glass.config';

@Injectable()
export class BreakGlassKillSwitchGuard implements CanActivate {
  private readonly logger = new Logger(BreakGlassKillSwitchGuard.name);

  constructor(private readonly config: BreakGlassConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (!this.config.isEnabled()) {
      this.logger.warn('Break-glass kill switch is active - rejecting request');
      
      throw new ServiceUnavailableException({
        error: 'BREAK_GLASS_DISABLED',
        message: 'Internal ops access is disabled',
      });
    }

    return true;
  }
}
