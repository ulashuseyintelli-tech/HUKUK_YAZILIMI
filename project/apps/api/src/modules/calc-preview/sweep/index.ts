/**
 * Phase 5.7 - Sweep Module Index
 * 
 * Compile/Lint/Integration Sweep araçları:
 * - env-flags: Merkezi env flag registry
 * - module-boundary-sweep: Import grafiği analizi
 * - build-artifact-sweep: Prod build temizlik kontrolü
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.7
 */

// Environment flags
export {
  ENV_FLAG_REGISTRY,
  EnvFlagDefinition,
  EnvConfig,
  loadEnvConfig,
  getEnvConfig,
  resetEnvConfig,
  validateEnvConfig,
  generateEnvFlagTable,
} from './env-flags';

// Module boundary sweep
export {
  ModuleBoundaryViolation,
  ModuleBoundarySweepResult,
  runModuleBoundarySweep,
  formatViolations,
} from './module-boundary-sweep';

// Build artifact sweep
export {
  BuildArtifactViolation,
  BuildArtifactSweepResult,
  runBuildArtifactSweep,
  formatBuildSweepResult,
} from './build-artifact-sweep';
