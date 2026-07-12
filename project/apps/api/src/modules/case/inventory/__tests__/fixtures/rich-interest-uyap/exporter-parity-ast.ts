import * as fs from 'node:fs';
import * as ts from 'typescript';

export interface ExtractedExporterMapping {
  entries: Record<string, string>;
  fallback: string;
}

export interface ExtractedNumericProjectionActivation {
  authorityChain: readonly ['UyapXmlService', 'numeric-interest-projection.adapter', 'UYAP_INTEREST_CROSSWALK'];
  serviceAdapterCallCount: number;
  adapterCrosswalkCallCount: number;
  crosswalkRegistryCount: number;
  legacyMapperPresent: boolean;
  silent99Present: boolean;
  dueDateInterestFallbackPresent: boolean;
}

function propertyName(node: ts.PropertyName): string {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  throw new Error(`Unsupported mapping key AST: ${ts.SyntaxKind[node.kind]}`);
}

function findMethod(root: ts.Node, name: string): ts.MethodDeclaration {
  let match: ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name && propertyName(node.name) === name) {
      if (match) throw new Error(`Duplicate method: ${name}`);
      match = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  if (!match?.body) throw new Error(`Mapping method not found: ${name}`);
  return match;
}

function findObjectLiteral(method: ts.MethodDeclaration, variable: string): ts.ObjectLiteralExpression {
  for (const statement of method.body!.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === variable &&
          declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
        return declaration.initializer;
      }
    }
  }
  throw new Error(`Literal mapping object not found: ${variable}`);
}

function literalString(node: ts.Expression): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  throw new Error(`Non-literal mapping value: ${node.getText()}`);
}

function parseLiteralMap(object: ts.ObjectLiteralExpression): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) throw new Error(`Unsupported mapping member: ${property.getText()}`);
    const key = propertyName(property.name);
    if (Object.prototype.hasOwnProperty.call(entries, key)) throw new Error(`Duplicate mapping key: ${key}`);
    entries[key] = literalString(property.initializer);
  }
  return entries;
}

function returnExpression(method: ts.MethodDeclaration): ts.Expression {
  const returns = method.body!.statements.filter(ts.isReturnStatement);
  if (returns.length !== 1 || !returns[0].expression) throw new Error('Exactly one explicit return is required.');
  return returns[0].expression;
}

export function extractFaiztMapping(sourcePath: string): ExtractedExporterMapping {
  const source = ts.createSourceFile(sourcePath, fs.readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true);
  const method = findMethod(source, 'mapInterestTypeToCode');
  const entries = parseLiteralMap(findObjectLiteral(method, 'codeMap'));
  const expression = returnExpression(method);
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.BarBarToken) {
    throw new Error('FAIZT fallback must remain an explicit || expression.');
  }
  return { entries, fallback: literalString(expression.right) };
}

function countIdentifierCalls(root: ts.Node, name: string): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) count++;
    ts.forEachChild(node, visit);
  };
  visit(root);
  return count;
}

function countNamedDeclarations(root: ts.Node, name: string): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
      node.name && ts.isIdentifier(node.name) && node.name.text === name
    ) count++;
    ts.forEachChild(node, visit);
  };
  visit(root);
  return count;
}

export function extractNumericProjectionActivation(
  servicePath: string,
  adapterPath: string,
  crosswalkPath: string,
): ExtractedNumericProjectionActivation {
  const serviceText = fs.readFileSync(servicePath, 'utf8');
  const adapterText = fs.readFileSync(adapterPath, 'utf8');
  const crosswalkText = fs.readFileSync(crosswalkPath, 'utf8');
  const service = ts.createSourceFile(servicePath, serviceText, ts.ScriptTarget.Latest, true);
  const adapter = ts.createSourceFile(adapterPath, adapterText, ts.ScriptTarget.Latest, true);
  const crosswalk = ts.createSourceFile(crosswalkPath, crosswalkText, ts.ScriptTarget.Latest, true);

  return {
    authorityChain: ['UyapXmlService', 'numeric-interest-projection.adapter', 'UYAP_INTEREST_CROSSWALK'],
    serviceAdapterCallCount: countIdentifierCalls(service, 'resolveDormantNumericInterestProjection'),
    adapterCrosswalkCallCount: countIdentifierCalls(adapter, 'resolveUyapInterestProjection'),
    crosswalkRegistryCount: countNamedDeclarations(crosswalk, 'UYAP_INTEREST_CROSSWALK'),
    legacyMapperPresent: countNamedDeclarations(service, 'mapInterestTypeToUyapKod') > 0,
    silent99Present: /(?:kod:\s*['"]99['"]|\|\|\s*['"]99['"]|\?\?\s*['"]99['"])/.test(serviceText),
    dueDateInterestFallbackPresent:
      /baslangicTarihi\s*:\s*[^\n]*dueDate/.test(serviceText) ||
      /interestStartDate[^\n]*(?:\|\||\?\?)[^\n]*dueDate/.test(serviceText),
  };
}
