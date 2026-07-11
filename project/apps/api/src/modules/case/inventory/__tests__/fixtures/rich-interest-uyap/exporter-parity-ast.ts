import * as fs from 'node:fs';
import * as ts from 'typescript';

export interface ExtractedExporterMapping {
  entries: Record<string, string>;
  fallback: string;
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

function findConstObject(root: ts.SourceFile, name: string): ts.ObjectLiteralExpression {
  for (const statement of root.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || !declaration.initializer) continue;
      const initializer = ts.isAsExpression(declaration.initializer) ? declaration.initializer.expression : declaration.initializer;
      if (ts.isObjectLiteralExpression(initializer)) return initializer;
    }
  }
  throw new Error(`Const object not found: ${name}`);
}

function extractKodTable(object: ts.ObjectLiteralExpression): Record<string, string> {
  const result: Record<string, string> = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
      throw new Error(`Unsupported numeric code table member: ${property.getText()}`);
    }
    const key = propertyName(property.name);
    const kod = property.initializer.properties.find((candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) && propertyName(candidate.name) === 'kod');
    if (!kod) throw new Error(`Missing kod for ${key}`);
    result[key] = literalString(kod.initializer);
  }
  return result;
}

function propertyAccessPath(node: ts.Expression): string[] {
  const parts: string[] = [];
  let cursor: ts.Expression = node;
  while (ts.isPropertyAccessExpression(cursor)) {
    parts.unshift(cursor.name.text);
    cursor = cursor.expression;
  }
  if (!ts.isIdentifier(cursor)) throw new Error(`Unsupported property access: ${node.getText()}`);
  parts.unshift(cursor.text);
  return parts;
}

export function extractNumericMapping(sourcePath: string): ExtractedExporterMapping {
  const source = ts.createSourceFile(sourcePath, fs.readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true);
  const codeTable = extractKodTable(findConstObject(source, 'UYAP_FAIZ_KODLARI'));
  const method = findMethod(source, 'mapInterestTypeToUyapKod');
  const object = findObjectLiteral(method, 'mapping');
  const entries: Record<string, string> = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) throw new Error(`Unsupported numeric mapping member: ${property.getText()}`);
    const key = propertyName(property.name);
    if (Object.prototype.hasOwnProperty.call(entries, key)) throw new Error(`Duplicate mapping key: ${key}`);
    const path = propertyAccessPath(property.initializer);
    if (path.length !== 3 || path[0] !== 'UYAP_FAIZ_KODLARI' || path[2] !== 'kod' || !codeTable[path[1]]) {
      throw new Error(`Unsupported numeric mapping value: ${property.initializer.getText()}`);
    }
    entries[key] = codeTable[path[1]];
  }
  const expression = returnExpression(method);
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.BarBarToken) {
    throw new Error('Numeric fallback must remain an explicit || expression.');
  }
  const fallbackPath = propertyAccessPath(expression.right);
  if (fallbackPath.join('.') !== 'UYAP_FAIZ_KODLARI.DIGER.kod') throw new Error('Numeric fallback changed.');
  return { entries, fallback: codeTable.DIGER };
}
