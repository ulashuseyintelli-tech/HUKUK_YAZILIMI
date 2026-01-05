/**
 * PREDICATE EVALUATOR SERVICE (v25)
 * 
 * Decision rules predicate desteği:
 * - fact:Type(field=='value')
 * - fact:Type(field!='value')
 * - fact:Type(field in ['a','b'])
 * - nested field: attributes.plate
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ParsedWhen {
  factType: string | null;
  predicate: string | null;
}

@Injectable()
export class PredicateEvaluatorService {
  private readonly logger = new Logger(PredicateEvaluatorService.name);

  // Regex: fact:TYPE or fact:TYPE(predicate)
  private readonly WHEN_REGEX = /^fact:(?<ft>\w+)(\((?<pred>.*)\))?$/;

  /**
   * Parse "when" clause into fact type and predicate
   */
  parseWhen(when: string): ParsedWhen {
    const trimmed = (when || '').trim();
    
    if (!trimmed.startsWith('fact:')) {
      return { factType: null, predicate: null };
    }

    const match = this.WHEN_REGEX.exec(trimmed);
    if (!match || !match.groups) {
      return { factType: null, predicate: null };
    }

    return {
      factType: match.groups.ft || null,
      predicate: match.groups.pred || null,
    };
  }

  /**
   * Evaluate predicate against fact value
   */
  evaluatePredicate(predicate: string | null, factValue: Record<string, any>): boolean {
    if (!predicate) {
      return true;
    }

    const pred = predicate.trim();

    // Check for "in" operator: field in ['a','b']
    const inMatch = pred.match(/^(?<field>[\w.]+)\s+in\s+\[(?<vals>.*)\]$/);
    if (inMatch && inMatch.groups) {
      const field = inMatch.groups.field;
      const valsRaw = inMatch.groups.vals;
      const vals = valsRaw
        .split(',')
        .map(v => v.trim().replace(/^['"]|['"]$/g, ''))
        .filter(v => v);
      
      const got = this.getNestedField(factValue, field);
      return vals.includes(String(got));
    }

    // Check for == or != operator
    const eqMatch = pred.match(/^(?<field>[\w.]+)\s*(?<op>==|!=)\s*(?<val>.*)$/);
    if (eqMatch && eqMatch.groups) {
      const field = eqMatch.groups.field;
      const op = eqMatch.groups.op;
      const val = eqMatch.groups.val.trim().replace(/^['"]|['"]$/g, '');
      
      const got = this.getNestedField(factValue, field);
      
      if (op === '==') {
        return String(got) === val;
      }
      return String(got) !== val;
    }

    // Check for comparison operators: >, <, >=, <=
    const cmpMatch = pred.match(/^(?<field>[\w.]+)\s*(?<op>>=|<=|>|<)\s*(?<val>.*)$/);
    if (cmpMatch && cmpMatch.groups) {
      const field = cmpMatch.groups.field;
      const op = cmpMatch.groups.op;
      const val = parseFloat(cmpMatch.groups.val.trim());
      
      const got = parseFloat(String(this.getNestedField(factValue, field)));
      
      switch (op) {
        case '>': return got > val;
        case '<': return got < val;
        case '>=': return got >= val;
        case '<=': return got <= val;
      }
    }

    // Unknown predicate format - default to false
    this.logger.warn(`Unknown predicate format: ${pred}`);
    return false;
  }

  /**
   * Get nested field value using dot notation
   * e.g., "attributes.plate" -> factValue.attributes.plate
   */
  private getNestedField(obj: Record<string, any>, path: string): any {
    let current: any = obj;
    
    for (const part of path.split('.')) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }
    
    return current;
  }
}
