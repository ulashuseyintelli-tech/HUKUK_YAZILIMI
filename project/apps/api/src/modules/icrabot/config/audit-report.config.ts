/**
 * AUDIT REPORT CONFIG (v12)
 * 
 * Audit kanıt paketi şeması ve konfigürasyonlar.
 */

// Audit package header
export interface AuditPackageHeader {
  caseId: string;
  uyapDosyaNo: string;
  generatedAt: Date;
  generatedBy: string;
  tenantId: string;
}

// Event item
export interface AuditEventItem {
  eventId: string;
  ts: Date;
  type: string;
  payloadHash: string;
}

// Fact item
export interface AuditFactItem {
  factType: string;
  key: string;
  valueHash: string;
  snapshotId: string;
}

// Decision item
export interface AuditDecisionItem {
  ruleId: string;
  inputHash: string;
  outputHash: string;
  ts: Date;
}

// Job item
export interface AuditJobItem {
  jobId: string;
  recipeId: string;
  status: string;
  startedAt: Date;
  finishedAt?: Date;
}

// Evidence item
export interface AuditEvidenceItem {
  snapshotId: string;
  snapshotHash: string;
  screenshotPath?: string;
  documentRefs: string[];
}

// Audit package sections
export interface AuditPackageSections {
  events: AuditEventItem[];
  facts: AuditFactItem[];
  decisions: AuditDecisionItem[];
  jobs: AuditJobItem[];
  evidence: AuditEvidenceItem[];
}

// Audit package integrity
export interface AuditPackageIntegrity {
  packageHash: string;
  signature?: string;
}

// Full audit package
export interface AuditPackage {
  header: AuditPackageHeader;
  sections: AuditPackageSections;
  integrity: AuditPackageIntegrity;
}

// Audit report config
export const AUDIT_REPORT_CONFIG = {
  retentionDays: 3650, // 10 years
  hashAlgorithm: 'sha256',
  includeScreenshots: true,
  maxScreenshotSizeKb: 500,
  exportFormats: ['json', 'pdf', 'zip'] as const,
  piiMaskingEnabled: true,
  piiFields: ['tckn', 'telefon', 'email', 'adres'],
};

// Audit export options
export interface AuditExportOptions {
  format: 'json' | 'pdf' | 'zip';
  includeScreenshots: boolean;
  maskPii: boolean;
  dateRange?: {
    from: Date;
    to: Date;
  };
}

// Audit filter
export interface AuditFilter {
  caseId: string;
  eventTypes?: string[];
  factTypes?: string[];
  recipeIds?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  tenantId: string;
}

// Audit timeline entry (for UI)
export interface AuditTimelineEntry {
  id: string;
  ts: Date;
  type: 'event' | 'fact' | 'decision' | 'job';
  title: string;
  description: string;
  snapshotHash?: string;
  proofRefs?: string[];
  relatedJobIds?: string[];
}

// PII masking rules
export const PII_MASKING_RULES = {
  tckn: (value: string) => value.replace(/(\d{3})\d{5}(\d{3})/, '$1*****$2'),
  telefon: (value: string) => value.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2'),
  email: (value: string) => {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  },
  adres: (value: string) => {
    const parts = value.split(' ');
    if (parts.length > 3) {
      return `${parts[0]} ${parts[1]} ***`;
    }
    return '***';
  },
};

// Hash utility
export function computeHash(data: unknown): string {
  const crypto = require('crypto');
  const json = JSON.stringify(data);
  return crypto.createHash(AUDIT_REPORT_CONFIG.hashAlgorithm).update(json).digest('hex');
}
