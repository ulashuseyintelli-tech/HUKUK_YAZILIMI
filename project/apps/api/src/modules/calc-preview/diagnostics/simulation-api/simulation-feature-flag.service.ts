/**
 * Simulation Feature Flag Service
 * 
 * Sprint 2F - Feature flag control for simulation endpoints
 * 
 * When SIMULATION_ENABLED=false:
 * - Mutation endpoints (POST) return 503 SIMULATION_DISABLED
 * - Read endpoints (GET) continue to work for observability
 */

import { Injectable } from '@nestjs/common';

// ============================================================================
// Feature Flag Constants
// ============================================================================

export const SIMULATION_FEATURE_FLAGS = {
  SIMULATION_ENABLED: 'SIMULATION_ENABLED',
} as const;

// ============================================================================
// Interface
// ============================================================================

export interface ISimulationFeatureFlagService {
  /**
   * Check if simulation feature is enabled
   * Returns false only when SIMULATION_ENABLED is explicitly set to 'false'
   */
  isSimulationEnabled(): boolean;
}

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class SimulationFeatureFlagService implements ISimulationFeatureFlagService {
  /**
   * Check if simulation feature is enabled
   * 
   * Default: enabled (true)
   * Disabled only when env var is explicitly 'false'
   */
  isSimulationEnabled(): boolean {
    const value = process.env[SIMULATION_FEATURE_FLAGS.SIMULATION_ENABLED];
    return value !== 'false';
  }
}

// ============================================================================
// Mock for Testing
// ============================================================================

export class MockSimulationFeatureFlagService implements ISimulationFeatureFlagService {
  private enabled = true;

  isSimulationEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
