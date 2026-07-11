import type {
  RichInterestUyapFinding,
  RichInterestUyapInventorySummary,
} from './rich-interest-uyap-readiness.core';

export type RichInterestInventoryOutputMode = 'summary' | 'detailed';

export interface RichInterestInventoryCliOptions {
  tenantId: string;
  mode: RichInterestInventoryOutputMode;
  pageSize: number;
}

const FORBIDDEN_FLAGS = new Set([
  '--apply',
  '--rollback',
  '--all-tenants',
  '--output',
  '--output-file',
]);

export function parseRichInterestInventoryArgs(argv: string[]): RichInterestInventoryCliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (FORBIDDEN_FLAGS.has(flag)) {
      throw new Error(`${flag} desteklenmez; inventory yalnız READ-ONLY ve stdout çıktılıdır.`);
    }
    if (!['--tenant', '--mode', '--page-size'].includes(flag) || !value?.trim()) {
      throw new Error('Kullanım: --tenant <tenantId> --mode <summary|detailed> [--page-size <1..1000>]');
    }
    if (values.has(flag)) {
      throw new Error(`${flag} birden fazla kez verilemez.`);
    }
    values.set(flag, value.trim());
  }

  const tenantId = values.get('--tenant');
  const mode = values.get('--mode');
  const pageSizeText = values.get('--page-size') ?? '250';
  const pageSize = Number(pageSizeText);

  if (!tenantId) throw new Error('--tenant <tenantId> zorunludur.');
  if (mode !== 'summary' && mode !== 'detailed') {
    throw new Error('--mode yalnız summary veya detailed olabilir.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('--page-size 1 ile 1000 arasında bir tam sayı olmalıdır.');
  }

  return { tenantId, mode, pageSize };
}

export function formatDetailedFinding(finding: RichInterestUyapFinding): string {
  return JSON.stringify({ type: 'finding', data: finding });
}

export function formatInventorySummary(summary: RichInterestUyapInventorySummary): string {
  return JSON.stringify({ type: 'summary', data: summary });
}
