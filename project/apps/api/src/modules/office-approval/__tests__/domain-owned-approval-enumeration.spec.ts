import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import {
  DOMAIN_OWNED_APPROVAL_ACTION_CODES,
  isDomainOwnedApprovalActionCode,
  assertGenericDecisionAllowed,
  DomainActionRequiredError,
} from '../office-approval-domain-ownership';
import {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
  CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE,
} from '../../client-financial-disclosure/client-financial-disclosure-approval.contract';

/**
 * PR-1.3 — DOMAIN-OWNED KÜME EKSİKSİZLİK KİLİDİ.
 *
 * Amaç: `DOMAIN_OWNED_APPROVAL_ACTION_CODES` bugünkü tek koda göre HARD-CODE
 * kalmasın. FD yaşam döngüsüne YENİ bir approval-request aşaması eklenirse bu test
 * KIRILIR ve kodun kümeye eklenmesi zorunlu olur.
 *
 * Yöntem AST'dir: FD modülündeki her `officeApprovalRequest.create({...})` çağrısı
 * bulunur ve `actionCode` özelliğinin çözümlenen değeri kümeye karşı doğrulanır.
 * Satır numarası veya düz metin eşleşmesi KULLANILMAZ (kırılgan olurdu).
 */

const FD_MODULE_DIR = path.resolve(__dirname, '..', '..', 'client-financial-disclosure');

/** FD modülündeki üretim kaynak dosyaları (testler hariç). */
function fdSourceFiles(): string[] {
  return fs
    .readdirSync(FD_MODULE_DIR)
    .filter((f) => /\.ts$/.test(f) && !/\.spec\.ts$/.test(f))
    .sort()
    .map((f) => path.join(FD_MODULE_DIR, f));
}

/** `officeApprovalRequest.create({ data: { actionCode: X } })` çağrılarından X'i çıkarır. */
function collectCreatedActionCodes(): { file: string; expression: string }[] {
  const found: { file: string; expression: string }[] = [];

  for (const file of fdSourceFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'create' &&
        /officeApprovalRequest$/.test(node.expression.expression.getText(sf))
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const dataProp = arg.properties.find(
            (p) => ts.isPropertyAssignment(p) && p.name?.getText(sf) === 'data',
          ) as ts.PropertyAssignment | undefined;
          const dataObj = dataProp?.initializer;
          if (dataObj && ts.isObjectLiteralExpression(dataObj)) {
            const codeProp = dataObj.properties.find(
              (p) => ts.isPropertyAssignment(p) && p.name?.getText(sf) === 'actionCode',
            ) as ts.PropertyAssignment | undefined;
            if (codeProp) {
              found.push({
                file: path.basename(file),
                expression: codeProp.initializer.getText(sf).trim(),
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}

/** Kaynakta sabit ismiyle yazılan actionCode ifadelerini gerçek değere çözer. */
const RESOLVABLE: Record<string, string> = {
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE: CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE,
};

function resolveActionCode(expression: string): string | null {
  if (/^['"].*['"]$/.test(expression)) return expression.slice(1, -1);
  return RESOLVABLE[expression] ?? null;
}

describe('PR-1.3 — domain-owned approval kümesi eksiksizliği', () => {
  it('FD office approval kodu domain-owned kümededir', () => {
    expect(isDomainOwnedApprovalActionCode(CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE)).toBe(true);
  });

  it('FD hedef türü sabiti korunur (kümenin bağlandığı aggregate)', () => {
    expect(CLIENT_FINANCIAL_DISCLOSURE_APPROVAL_TARGET_TYPE).toBe('ClientFinancialDisclosureVersion');
  });

  it('FD modülünde ÜRETİLEN her approval actionCode domain-owned kümededir (AST)', () => {
    const created = collectCreatedActionCodes();

    // Bugün tam olarak bir üretim noktası var. Yeni bir aşama eklenirse bu sayı artar
    // ve aşağıdaki kapsama kontrolü onu kümeye eklemeye ZORLAR.
    expect(created.length).toBeGreaterThan(0);

    const unresolved: string[] = [];
    const uncovered: string[] = [];

    for (const entry of created) {
      const value = resolveActionCode(entry.expression);
      if (value === null) {
        // Bilinmeyen ifade → sessizce geçilmez; testin güncellenmesi zorunlu.
        unresolved.push(`${entry.file}: ${entry.expression}`);
        continue;
      }
      if (!isDomainOwnedApprovalActionCode(value)) {
        uncovered.push(`${entry.file}: ${value}`);
      }
    }

    expect({ unresolved, uncovered }).toEqual({ unresolved: [], uncovered: [] });
  });

  it('domain-owned olmayan kodlar generic karar yolunu ENGELLEMEZ', () => {
    expect(isDomainOwnedApprovalActionCode('COLLECTION_DISPOSITION_POST')).toBe(false);
    expect(isDomainOwnedApprovalActionCode('CHANGE_STATUS')).toBe(false);
    expect(isDomainOwnedApprovalActionCode(null)).toBe(false);
    expect(() => assertGenericDecisionAllowed('CHANGE_STATUS')).not.toThrow();
  });

  it('domain-owned kod generic kararda typed DOMAIN_ACTION_REQUIRED üretir', () => {
    expect(() =>
      assertGenericDecisionAllowed(CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE),
    ).toThrow(DomainActionRequiredError);

    try {
      assertGenericDecisionAllowed(CLIENT_FINANCIAL_DISCLOSURE_APPROVE_ACTION_CODE);
      throw new Error('beklenen hata atılmadı');
    } catch (error) {
      const body = (error as DomainActionRequiredError).getResponse() as Record<string, unknown>;
      expect(body.code).toBe('DOMAIN_ACTION_REQUIRED');
      expect(body.domainSurface).toBe('CLIENT_FINANCIAL_DISCLOSURE_WORKSPACE');
      // Ham hedef/iç kimlik SIZDIRILMAZ.
      expect(JSON.stringify(body)).not.toMatch(/cms[a-z0-9]{20,}/);
    }
  });

  it('küme salt-okunur ve tekil kayıtlardan oluşur', () => {
    const unique = new Set<string>(DOMAIN_OWNED_APPROVAL_ACTION_CODES);
    expect(unique.size).toBe(DOMAIN_OWNED_APPROVAL_ACTION_CODES.length);
  });
});
