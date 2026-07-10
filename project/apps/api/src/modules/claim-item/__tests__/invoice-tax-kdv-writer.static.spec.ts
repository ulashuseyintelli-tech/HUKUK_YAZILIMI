import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_SRC = join(process.cwd(), 'src', 'modules');
const INVOICE_TAX_KDV_LITERAL = new RegExp(
  [
    String.raw`itemType\s*:\s*(?:ClaimItemType\.)?TAX_KDV[\s\S]{0,500}sourceDocumentType\s*:\s*(?:DocumentSourceType\.)?FATURA`,
    String.raw`sourceDocumentType\s*:\s*(?:DocumentSourceType\.)?FATURA[\s\S]{0,500}itemType\s*:\s*(?:ClaimItemType\.)?TAX_KDV`,
  ].join('|'),
);

function productionTypeScriptFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const fullPath = join(path, entry);
    if (entry === '__tests__') return [];
    if (statSync(fullPath).isDirectory()) return productionTypeScriptFiles(fullPath);
    return entry.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('VER-05 PR-1C invoice TAX_KDV static regression', () => {
  it('contains no production writer with a literal FATURA + TAX_KDV shape', () => {
    const violations = productionTypeScriptFiles(API_SRC)
      .filter((file) => INVOICE_TAX_KDV_LITERAL.test(readFileSync(file, 'utf8')));

    expect(violations).toEqual([]);
  });
});
