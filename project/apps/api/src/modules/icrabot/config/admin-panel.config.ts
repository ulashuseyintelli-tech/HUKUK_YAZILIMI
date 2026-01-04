/**
 * ADMIN PANEL CONFIG (v12)
 * 
 * Recipe/rule parametrelerini yönetmek için konfigürasyonlar.
 */

// User roles
export type AdminRole = 'admin' | 'ops' | 'avukat';

// Role permissions
export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  admin: [
    'recipe.read', 'recipe.write', 'recipe.enable', 'recipe.disable', 'recipe.rollback',
    'params.read', 'params.write', 'params.approve',
    'ui_map.read', 'ui_map.write',
    'job.read', 'job.retry', 'job.quarantine', 'job.unquarantine',
    'audit.read', 'audit.export',
    'lock.read', 'lock.override',
    'system.settings',
  ],
  ops: [
    'recipe.read',
    'params.read',
    'ui_map.read', 'ui_map.write',
    'job.read', 'job.retry', 'job.quarantine',
    'audit.read',
    'lock.read', 'lock.request_override',
  ],
  avukat: [
    'recipe.read',
    'params.read',
    'job.read',
    'audit.read', 'audit.export',
    'lock.read', 'lock.approve_override',
    'case.approve', 'case.override',
  ],
};

// Publishing model states
export type PublishState = 'draft' | 'approved' | 'active';

// Recipe registry entry
export interface RecipeRegistryEntry {
  recipeId: string;
  version: number;
  stageTags: string[];
  scope: 'case' | 'debtor';
  triggerType: string;
  riskLevel: string;
  enabled: boolean;
  publishState: PublishState;
  yamlContent: string;
  createdAt: Date;
  createdBy: string;
  approvedAt?: Date;
  approvedBy?: string;
  activatedAt?: Date;
  activatedBy?: string;
  tenantId: string;
}

// Params registry entry
export interface ParamsRegistryEntry {
  bundleId: string;
  bundleType: 'rules_params' | 'risk_scoring' | 'recovery' | 'installment' | 'settlement';
  version: number;
  publishState: PublishState;
  content: Record<string, unknown>;
  overrides?: Record<string, Record<string, unknown>>; // icra_type -> params
  createdAt: Date;
  createdBy: string;
  approvedAt?: Date;
  approvedBy?: string;
  activatedAt?: Date;
  activatedBy?: string;
  tenantId: string;
}

// UI Map registry entry
export interface UIMapRegistryEntry {
  screenId: string;
  navPath: string[];
  fields: UIMapField[];
  actions: UIMapAction[];
  tables: UIMapTable[];
  healthScore: number; // 0-100, element bulunma oranı
  lastHealthCheck?: Date;
  version: number;
  tenantId: string;
}

export interface UIMapField {
  name: string;
  locator: string;
  type: 'text' | 'date' | 'number' | 'select' | 'checkbox';
  required: boolean;
}

export interface UIMapAction {
  name: string;
  locator: string;
  type: 'button' | 'link' | 'submit';
}

export interface UIMapTable {
  name: string;
  locator: string;
  columns: string[];
}

// Lock override request
export interface LockOverrideRequest {
  requestId: string;
  lockType: string;
  caseId: string;
  reason: string;
  requestedBy: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNote?: string;
  tenantId: string;
}

// Admin panel screens
export const ADMIN_SCREENS = {
  recipeRegistry: {
    path: '/admin/recipes',
    title: 'Recipe Registry',
    permissions: ['recipe.read'],
  },
  paramsRegistry: {
    path: '/admin/params',
    title: 'Params Registry',
    permissions: ['params.read'],
  },
  uiMapRegistry: {
    path: '/admin/ui-map',
    title: 'UI Map Registry',
    permissions: ['ui_map.read'],
  },
  jobMonitor: {
    path: '/admin/jobs',
    title: 'Job Monitor',
    permissions: ['job.read'],
  },
  caseTimeline: {
    path: '/admin/cases/:id/timeline',
    title: 'Case Timeline',
    permissions: ['audit.read'],
  },
  locksDashboard: {
    path: '/admin/locks',
    title: 'Locks & Gates Dashboard',
    permissions: ['lock.read'],
  },
  auditViewer: {
    path: '/admin/audit/:caseId',
    title: 'Audit & Evidence Viewer',
    permissions: ['audit.read'],
  },
};

// Change log entry
export interface ChangeLogEntry {
  changeId: string;
  entityType: 'recipe' | 'params' | 'ui_map' | 'lock';
  entityId: string;
  action: 'create' | 'update' | 'enable' | 'disable' | 'rollback' | 'approve' | 'activate';
  previousValue?: string; // JSON
  newValue?: string; // JSON
  diff?: string;
  performedBy: string;
  performedAt: Date;
  tenantId: string;
}

// Approval workflow
export interface ApprovalWorkflow {
  entityType: 'recipe' | 'params';
  entityId: string;
  version: number;
  requiredApprovals: number;
  currentApprovals: ApprovalEntry[];
  status: 'pending' | 'approved' | 'rejected';
  tenantId: string;
}

export interface ApprovalEntry {
  approvedBy: string;
  approvedAt: Date;
  role: AdminRole;
  note?: string;
}

// Admin API endpoints
export const ADMIN_API_ENDPOINTS = {
  // Recipes
  getRecipes: 'GET /admin/recipes',
  getRecipe: 'GET /admin/recipes/:id',
  updateRecipe: 'PUT /admin/recipes/:id',
  enableRecipe: 'POST /admin/recipes/:id/enable',
  disableRecipe: 'POST /admin/recipes/:id/disable',
  rollbackRecipe: 'POST /admin/recipes/:id/rollback',
  cloneRecipe: 'POST /admin/recipes/:id/clone',
  validateRecipe: 'POST /admin/recipes/:id/validate',
  
  // Params
  getParamsBundles: 'GET /admin/params',
  getParamsBundle: 'GET /admin/params/:bundle',
  updateParamsBundle: 'PUT /admin/params/:bundle',
  approveParamsBundle: 'POST /admin/params/:bundle/approve',
  activateParamsBundle: 'POST /admin/params/:bundle/activate',
  
  // UI Map
  getUIMap: 'GET /admin/ui-map',
  updateUIMapScreen: 'PUT /admin/ui-map/:screenId',
  healthCheckUIMap: 'POST /admin/ui-map/:screenId/health-check',
  
  // Jobs
  getJobs: 'GET /jobs',
  getJob: 'GET /jobs/:id',
  retryJob: 'POST /jobs/:id/retry',
  quarantineCase: 'POST /cases/:id/quarantine',
  unquarantineCase: 'POST /cases/:id/unquarantine',
  
  // Audit
  getAudit: 'GET /audit/:caseId',
  exportAudit: 'POST /audit/:caseId/export',
  
  // Locks
  getLocks: 'GET /admin/locks',
  requestOverride: 'POST /admin/locks/:lockType/request-override',
  approveOverride: 'POST /admin/locks/requests/:requestId/approve',
  rejectOverride: 'POST /admin/locks/requests/:requestId/reject',
};
