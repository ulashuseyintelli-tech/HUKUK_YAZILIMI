/**
 * Break-Glass Guards
 * 
 * Guard chain for internal-ops endpoints:
 * 1. BreakGlassKillSwitchGuard - Kill switch (Gate 3)
 * 2. NetworkAllowlistGuard - Network boundary (INV-4)
 * 3. InternalOpsGuard - Role check
 * 4. BreakGlassGrantGuard - Token validation (Gate 2)
 */

export { BreakGlassKillSwitchGuard } from './kill-switch.guard';
export { NetworkAllowlistGuard } from './network-allowlist.guard';
export { InternalOpsGuard, BreakGlassApproverGuard, APPROVER_ROLES } from './internal-ops.guard';
export { BreakGlassGrantGuard, RequestWithBreakGlass } from './break-glass-grant.guard';
