/**
 * Phase 5.3 - Chaos Controller
 * 
 * Test-only endpoint'ler için controller
 * 
 * ⚠️ SADECE TEST ORTAMINDA AKTİF
 * Production'da bu endpoint'ler devre dışı
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { FaultInjectorService } from './fault-injector.service';
import { FaultInjectionConfig, ActiveInjection } from './chaos.types';

// ============================================================================
// CHAOS CONTROLLER
// ============================================================================

@Controller('calc/chaos')
export class ChaosController {
  constructor(private readonly faultInjector: FaultInjectorService) {}

  /**
   * POST /calc/chaos/inject
   * 
   * Fault injection başlat
   */
  @Post('inject')
  @HttpCode(HttpStatus.CREATED)
  inject(@Body() config: FaultInjectionConfig): ActiveInjection | { error: string } {
    this.checkEnabled();
    
    const injection = this.faultInjector.inject(config);
    
    if (!injection) {
      return { error: 'Chaos endpoints are disabled' };
    }
    
    return injection;
  }

  /**
   * DELETE /calc/chaos/inject/:id
   * 
   * Tek injection kaldır
   */
  @Delete('inject/:id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string): { success: boolean } {
    this.checkEnabled();
    
    const success = this.faultInjector.remove(id);
    return { success };
  }

  /**
   * POST /calc/chaos/clear
   * 
   * Tüm injection'ları temizle
   */
  @Post('clear')
  @HttpCode(HttpStatus.OK)
  clearAll(): { cleared: number } {
    this.checkEnabled();
    
    const cleared = this.faultInjector.clearAll();
    return { cleared };
  }

  /**
   * GET /calc/chaos/status
   * 
   * Aktif injection'ları listele
   */
  @Get('status')
  getStatus(): {
    enabled: boolean;
    activeInjections: ActiveInjection[];
    totalTriggers: number;
  } {
    const injections = this.faultInjector.getActiveInjections();
    const totalTriggers = injections.reduce((sum, i) => sum + i.triggerCount, 0);
    
    return {
      enabled: this.faultInjector.isEnabled(),
      activeInjections: injections,
      totalTriggers,
    };
  }

  /**
   * Check if chaos endpoints are enabled
   */
  private checkEnabled(): void {
    if (!this.faultInjector.isEnabled()) {
      throw new ForbiddenException('Chaos endpoints are disabled in this environment');
    }
  }
}
