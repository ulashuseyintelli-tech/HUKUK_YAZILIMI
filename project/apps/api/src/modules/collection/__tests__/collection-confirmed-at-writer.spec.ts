import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import {
  assertCollectionConfirmedAtInvariant,
  resolveCollectionConfirmedAt,
} from '../collection-safety.helper';

const apiRoot = process.cwd();

function productionTypeScriptFiles(root: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test') continue;
      results.push(...productionTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function propertyName(property: ts.ObjectLiteralElementLike): string | undefined {
  if (!property.name) return undefined;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) return property.name.text;
  return undefined;
}

function objectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | ts.ShorthandPropertyAssignment | undefined {
  return object.properties.find((property): property is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
      && propertyName(property) === name,
  );
}

function collectionCalls(file: string, method: string): ts.CallExpression[] {
  const source = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const calls: ts.CallExpression[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === method
      && ts.isPropertyAccessExpression(node.expression.expression)
      && node.expression.expression.name.text === 'collection') {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return calls;
}

function dataObject(call: ts.CallExpression): ts.ObjectLiteralExpression | undefined {
  const input = call.arguments[0];
  if (!input || !ts.isObjectLiteralExpression(input)) return undefined;
  const data = objectProperty(input, 'data');
  return data && ts.isPropertyAssignment(data) && ts.isObjectLiteralExpression(data.initializer)
    ? data.initializer
    : undefined;
}

describe('RC-COL-W2.2D-2 Collection confirmedAt lifecycle contract', () => {
  const firstConfirmation = new Date('2026-07-30T09:10:11.123Z');

  it('CONFIRMED için yalnız verilen server zamanını üretir', () => {
    const result = resolveCollectionConfirmedAt({
      currentConfirmedAt: null,
      nextStatus: 'CONFIRMED',
      serverNow: firstConfirmation,
    });

    expect(result).toEqual(firstConfirmation);
    expect(result).not.toBe(firstConfirmation);
  });

  it.each(['PENDING', 'REJECTED'])(
    '%s ilk kayıt için confirmedAt üretmez',
    (nextStatus) => {
      expect(resolveCollectionConfirmedAt({
        currentConfirmedAt: null,
        nextStatus,
        serverNow: firstConfirmation,
      })).toBeNull();
    },
  );

  it.each(['CONFIRMED', 'CANCELLED', 'REFUNDED', 'REVERSED'])(
    '%s geçişinde mevcut confirmation fact değişmeden korunur',
    (nextStatus) => {
      const replayTime = new Date('2026-07-30T10:11:12.456Z');
      expect(resolveCollectionConfirmedAt({
        currentConfirmedAt: firstConfirmation,
        nextStatus,
        serverNow: replayTime,
      })).toEqual(firstConfirmation);
    },
  );

  it('geçersiz server timestamp ile CONFIRMED yazmayı fail-closed reddeder', () => {
    expect(() => resolveCollectionConfirmedAt({
      currentConfirmedAt: null,
      nextStatus: 'CONFIRMED',
      serverNow: new Date(Number.NaN),
    })).toThrow('COLLECTION_CONFIRMATION_TIME_INVALID');
  });

  it('geçersiz mevcut confirmation fact ile ilerlemeyi fail-closed reddeder', () => {
    expect(() => resolveCollectionConfirmedAt({
      currentConfirmedAt: new Date(Number.NaN),
      nextStatus: 'CANCELLED',
      serverNow: firstConfirmation,
    })).toThrow('COLLECTION_CONFIRMED_AT_INVALID');
  });

  it('persisted CONFIRMED + null sonucunu finansal yan etkilerden önce fail-closed reddeder', () => {
    expect(() => assertCollectionConfirmedAtInvariant('CONFIRMED', null))
      .toThrow('COLLECTION_CONFIRMED_AT_REQUIRED');
    expect(assertCollectionConfirmedAtInvariant('PENDING', null)).toBeNull();
  });
});

describe('RC-COL-W2.2D-2 production writer inventory guard', () => {
  const productionFiles = productionTypeScriptFiles(path.join(apiRoot, 'src'));

  it('bütün direct Collection create writerları status ve confirmedAt değerini açıkça yazar', () => {
    const writers: string[] = [];

    for (const file of productionFiles) {
      for (const call of collectionCalls(file, 'create')) {
        const data = dataObject(call);
        expect(data).toBeDefined();
        expect(objectProperty(data!, 'status')).toBeDefined();
        expect(objectProperty(data!, 'confirmedAt')).toBeDefined();
        writers.push(path.relative(apiRoot, file).replaceAll('\\', '/'));
      }
    }

    expect(writers.sort()).toEqual([
      'src/modules/collection/collection.service.ts',
      'src/modules/interest-engine/scenario-materializer/scenario-materializer.ts',
      'src/scripts/tm47d-happy-path-seed.ts',
    ]);
  });

  it('status transition ve raw SQL yüzeyleri confirmedAt invariantını dolanamaz', () => {
    const unsafeStatusUpdates: string[] = [];
    const rawSqlWrites: string[] = [];

    for (const file of productionFiles) {
      const source = fs.readFileSync(file, 'utf8');
      for (const method of ['update', 'updateMany', 'upsert']) {
        for (const call of collectionCalls(file, method)) {
          const data = dataObject(call);
          const status = data && objectProperty(data, 'status');
          if (!status || !ts.isPropertyAssignment(status)) continue;
          if (!status.initializer.getText().includes('CONFIRMED')) continue;
          if (!objectProperty(data!, 'confirmedAt')) {
            unsafeStatusUpdates.push(path.relative(apiRoot, file).replaceAll('\\', '/'));
          }
        }
      }
      if (/\b(?:INSERT\s+INTO|UPDATE)\s+["'`]?Collection["'`]?/i.test(source)) {
        rawSqlWrites.push(path.relative(apiRoot, file).replaceAll('\\', '/'));
      }
    }

    expect(unsafeStatusUpdates).toEqual([]);
    expect(rawSqlWrites).toEqual([]);
  });

  it('public create DTO confirmedAt veya status mass-assignment yüzeyi açmaz', () => {
    const dto = fs.readFileSync(
      path.join(apiRoot, 'src/modules/collection/dto/collection.dto.ts'),
      'utf8',
    );
    const start = dto.indexOf('export class CreateCollectionDto');
    const end = dto.indexOf('export class UpdateCollectionDto', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const createDto = dto.slice(start, end);
    expect(createDto).not.toMatch(/\bconfirmedAt\s*[?!]?:/);
    expect(createDto).not.toMatch(/\bstatus\s*[?!]?:/);
  });

  it('legacy nullable schema korunur; bu task guessed backfill veya NOT NULL açmaz', () => {
    const schema = fs.readFileSync(path.join(apiRoot, 'prisma/schema.prisma'), 'utf8');
    const collectionStart = schema.indexOf('model Collection {');
    const collectionEnd = schema.indexOf('\n}', collectionStart);
    const collectionModel = schema.slice(collectionStart, collectionEnd);
    expect(collectionModel).toMatch(/confirmedAt\s+DateTime\?/);

    const migrations = fs.readdirSync(path.join(apiRoot, 'prisma/migrations'), { recursive: true })
      .filter((entry) => String(entry).endsWith('migration.sql'))
      .map((entry) => fs.readFileSync(path.join(apiRoot, 'prisma/migrations', String(entry)), 'utf8'))
      .join('\n');
    expect(migrations).not.toMatch(/confirmedAt[^;]*(?:SET\s+NOT\s+NULL|UPDATE\s+"Collection")/i);
  });
});
