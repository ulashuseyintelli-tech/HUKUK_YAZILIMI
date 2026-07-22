import { MAX_CANONICAL_JSON_DEPTH } from './validation-constants';

export type StrictJsonPrimitive = string | number | boolean | null;

export interface StrictJsonObject {
  readonly [key: string]: StrictJsonValue;
}

export type StrictJsonValue =
  | StrictJsonPrimitive
  | StrictJsonObject
  | readonly StrictJsonValue[];

export type StrictJsonParseFailure =
  | { readonly kind: 'SYNTAX' }
  | { readonly kind: 'DUPLICATE_MEMBER'; readonly path: '$' }
  | { readonly kind: 'MAX_DEPTH'; readonly actual: number };

export type StrictJsonParseResult =
  | { readonly ok: true; readonly value: StrictJsonValue }
  | { readonly ok: false; readonly failure: StrictJsonParseFailure };

interface JsonContainerFrame {
  readonly type: 'object' | 'array';
  readonly keys?: Set<string>;
}

interface JsonStructureInspection {
  readonly duplicateMember: boolean;
  readonly maximumDepth: number;
}

function skipJsonString(raw: string, start: number): number {
  let escaped = false;

  for (let index = start + 1; index < raw.length; index += 1) {
    const character = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '"') {
      return index + 1;
    }
  }

  return raw.length;
}

function nextNonWhitespace(raw: string, start: number): string | undefined {
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (character !== ' ' && character !== '\n' && character !== '\r' && character !== '\t') {
      return character;
    }
  }

  return undefined;
}

function decodeJsonString(rawToken: string): string | undefined {
  try {
    const decoded = JSON.parse(rawToken) as unknown;
    return typeof decoded === 'string' ? decoded : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Runs only after JSON syntax has been accepted. It independently inspects raw member tokens,
 * so JSON.parse's last-member-wins behaviour can never cross the trust boundary.
 */
function inspectJsonStructure(raw: string): JsonStructureInspection | undefined {
  const stack: JsonContainerFrame[] = [];
  let maximumDepth = 0;
  let duplicateMember = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];

    if (character === '"') {
      const end = skipJsonString(raw, index);
      const currentFrame = stack[stack.length - 1];
      if (nextNonWhitespace(raw, end) === ':' && currentFrame?.type === 'object') {
        const key = decodeJsonString(raw.slice(index, end));
        if (key === undefined) {
          return undefined;
        }

        const keys = currentFrame.keys;
        if (keys?.has(key) === true) {
          duplicateMember = true;
        } else {
          keys?.add(key);
        }
      }

      index = end - 1;
      continue;
    }

    if (character === '{') {
      stack.push({ type: 'object', keys: new Set<string>() });
      maximumDepth = Math.max(maximumDepth, stack.length);
      continue;
    }

    if (character === '[') {
      stack.push({ type: 'array' });
      maximumDepth = Math.max(maximumDepth, stack.length);
      continue;
    }

    if (character === '}' || character === ']') {
      stack.pop();
    }
  }

  return { duplicateMember, maximumDepth };
}

export function parseStrictJson(raw: string): StrictJsonParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, failure: { kind: 'SYNTAX' } };
  }

  const inspection = inspectJsonStructure(raw);
  if (inspection === undefined) {
    return { ok: false, failure: { kind: 'SYNTAX' } };
  }

  if (inspection.duplicateMember) {
    return { ok: false, failure: { kind: 'DUPLICATE_MEMBER', path: '$' } };
  }

  if (inspection.maximumDepth > MAX_CANONICAL_JSON_DEPTH) {
    return {
      ok: false,
      failure: { kind: 'MAX_DEPTH', actual: inspection.maximumDepth },
    };
  }

  return { ok: true, value: parsed as StrictJsonValue };
}
