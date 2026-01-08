/**
 * v28 Expression Evaluator Service
 * 
 * Kural ifadelerini değerlendiren servis.
 * Python v28_engine_runner/engine_v28/engine_runner/expressions.py'den port edildi.
 * 
 * Desteklenen ifadeler:
 * - fact.case.status == "finalized"
 * - compute.risk.score >= 80
 * - flags.HIGH_RISK == true
 * - get('compute.risk.score') >= 80
 */
import { Injectable, Logger } from '@nestjs/common';

export interface EvaluationContext {
  fact: Record<string, any>;
  flags: Record<string, boolean>;
  compute: Record<string, any>;
  event?: Record<string, any>;
}

export interface WhenClause {
  all?: WhenCondition[];
  any?: WhenCondition[];
  expr?: string;
}

export interface WhenCondition {
  fact?: string;
  op?: '==' | '!=' | '>' | '>=' | '<' | '<=';
  value?: any;
  expr?: string;
}

@Injectable()
export class ExpressionEvaluatorService {
  private readonly logger = new Logger(ExpressionEvaluatorService.name);

  /**
   * Path'ten değer alır (fact.case.status -> ctx.fact.case.status)
   */
  get(path: string, ctx: EvaluationContext): any {
    const parts = path.split('.');
    let current: any = ctx;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = typeof current === 'object' ? current[part] : undefined;
    }

    return current;
  }

  /**
   * Basit ifadeyi değerlendirir
   * Güvenlik: eval kullanmıyoruz, manuel parse ediyoruz
   */
  evalExpr(expr: string, ctx: EvaluationContext): any {
    const trimmed = expr.trim();

    // get('path') pattern
    const getMatch = trimmed.match(/^get\(['"]([^'"]+)['"]\)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
    if (getMatch) {
      const [, path, op, valueStr] = getMatch;
      const left = this.get(path, ctx);
      const right = this.parseValue(valueStr.trim());
      return this.compare(left, op, right);
    }

    // Direct comparison: fact.path op value
    const directMatch = trimmed.match(/^([a-zA-Z_.]+)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
    if (directMatch) {
      const [, path, op, valueStr] = directMatch;
      const left = this.get(path, ctx);
      const right = this.parseValue(valueStr.trim());
      return this.compare(left, op, right);
    }

    // AND expression: expr1 and expr2
    if (trimmed.includes(' and ')) {
      const parts = trimmed.split(' and ').map(p => p.trim());
      return parts.every(p => this.evalExpr(p, ctx));
    }

    // OR expression: expr1 or expr2
    if (trimmed.includes(' or ')) {
      const parts = trimmed.split(' or ').map(p => p.trim());
      return parts.some(p => this.evalExpr(p, ctx));
    }

    // Boolean literal
    if (trimmed === 'true' || trimmed === 'True') return true;
    if (trimmed === 'false' || trimmed === 'False') return false;

    // Number literal
    const num = Number(trimmed);
    if (!isNaN(num)) return num;

    // Path lookup
    return this.get(trimmed, ctx);
  }

  /**
   * When clause'u değerlendirir
   */
  checkWhen(when: WhenClause | undefined, ctx: EvaluationContext): boolean {
    if (!when || Object.keys(when).length === 0) return true;

    if (when.all) {
      return when.all.every(clause => this.checkCondition(clause, ctx));
    }

    if (when.any) {
      return when.any.some(clause => this.checkCondition(clause, ctx));
    }

    if (when.expr) {
      return Boolean(this.evalExpr(when.expr, ctx));
    }

    return true;
  }

  /**
   * Tek bir condition'ı değerlendirir
   */
  private checkCondition(condition: WhenCondition, ctx: EvaluationContext): boolean {
    if (condition.expr) {
      return Boolean(this.evalExpr(condition.expr, ctx));
    }

    if (condition.fact && condition.op !== undefined) {
      const left = this.get(`fact.${condition.fact}`, ctx);
      return this.compare(left, condition.op, condition.value);
    }

    return true;
  }

  /**
   * İki değeri karşılaştırır
   */
  private compare(left: any, op: string, right: any): boolean {
    switch (op) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '>': return left > right;
      case '>=': return left >= right;
      case '<': return left < right;
      case '<=': return left <= right;
      default: return false;
    }
  }

  /**
   * String değeri parse eder
   */
  private parseValue(valueStr: string): any {
    // String literal
    if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
        (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
      return valueStr.slice(1, -1);
    }

    // Boolean
    if (valueStr === 'true' || valueStr === 'True') return true;
    if (valueStr === 'false' || valueStr === 'False') return false;
    if (valueStr === 'null' || valueStr === 'None') return null;

    // Number
    const num = Number(valueStr);
    if (!isNaN(num)) return num;

    return valueStr;
  }

  /**
   * Template string'i render eder ({{fact.case.id}} -> actual value)
   */
  renderTemplate(template: any, ctx: EvaluationContext): any {
    if (typeof template === 'string') {
      // {{path}} pattern
      return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const value = this.get(path.trim(), ctx);
        return value !== undefined ? String(value) : '';
      });
    }

    if (Array.isArray(template)) {
      return template.map(item => this.renderTemplate(item, ctx));
    }

    if (typeof template === 'object' && template !== null) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.renderTemplate(value, ctx);
      }
      return result;
    }

    return template;
  }

  /**
   * Karar açıklaması oluşturur (explainability)
   * Python v28_explainability_rollback/engine_v28/explain/because.py'den port edildi.
   */
  explainDecision(condition: string, ctx: EvaluationContext): string[] {
    const expr = condition.trim().replace(/^\{+|\}+$/g, '').trim();
    const { mode, parts } = this.splitBool(expr);

    const because: string[] = [];

    for (const part of parts) {
      const cleaned = part.trim().replace(/^\(+|\)+$/g, '').trim();
      
      // Try to match comparison pattern
      const cmpMatch = cleaned.match(/(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)/);
      
      if (!cmpMatch) {
        // Fallback: try to resolve get() or path
        const path = this.extractPath(cleaned);
        if (path) {
          const val = this.get(path, ctx);
          because.push(`${this.prettyPath(path)} = ${val}`);
        } else {
          because.push(cleaned);
        }
        continue;
      }

      const [, leftStr, op, rightStr] = cmpMatch;
      const leftPath = this.extractPath(leftStr);
      const rightPath = this.extractPath(rightStr);

      const leftVal = leftPath ? this.get(leftPath, ctx) : this.parseLiteral(leftStr);
      const rightVal = rightPath ? this.get(rightPath, ctx) : this.parseLiteral(rightStr);

      const leftLabel = leftPath ? this.prettyPath(leftPath) : leftStr.trim();
      const rightLabel = rightPath ? this.prettyPath(rightPath) : rightStr.trim();

      // Show both comparison and actual values
      if (leftPath) {
        because.push(`${leftLabel} (${leftVal}) ${op} ${rightLabel} (${rightVal})`);
      } else {
        because.push(`${leftLabel} ${op} ${rightLabel}`);
      }
    }

    // If mode is OR, make it explicit
    if (mode === 'or' && because.length > 1) {
      return because.map(b => `(OR) ${b}`);
    }

    return because;
  }

  /**
   * Boolean operatörlerine göre ifadeyi böler
   */
  private splitBool(expr: string): { mode: 'and' | 'or' | 'atom'; parts: string[] } {
    // Normalize operators
    const e = expr
      .replace(/AND/g, 'and')
      .replace(/OR/g, 'or')
      .replace(/&&/g, 'and')
      .replace(/\|\|/g, 'or');

    if (e.includes(' and ')) {
      return { mode: 'and', parts: e.split(' and ').map(p => p.trim()).filter(Boolean) };
    }
    if (e.includes(' or ')) {
      return { mode: 'or', parts: e.split(' or ').map(p => p.trim()).filter(Boolean) };
    }
    return { mode: 'atom', parts: [e.trim()] };
  }

  /**
   * Path'i çıkarır (get('path') veya fact.xxx)
   */
  private extractPath(side: string): string | null {
    const s = side.trim();
    
    // get('path') or get("path")
    const getMatch = s.match(/get\(\s*['"]([^'"]+)['"]\s*\)/);
    if (getMatch) return getMatch[1];

    // Direct path: fact.xxx, compute.xxx, flags.xxx
    if (s.startsWith('fact.') || s.startsWith('compute.') || s.startsWith('flags.')) {
      return s;
    }

    return null;
  }

  /**
   * Path'i okunabilir Türkçe'ye çevirir
   */
  private prettyPath(path: string): string {
    const mapping: Record<string, string> = {
      'compute.risk.score': 'Risk skoru',
      'compute.risk.band': 'Risk bandı',
      'compute.expected_recovery.p50': 'Tahsilat p50',
      'compute.expected_recovery.expected': 'Beklenen tahsilat',
      'compute.expected_recovery.eta_days': 'Tahmini süre (gün)',
      'compute.lien_rank.rank': 'Haciz sırası',
      'compute.lien_rank.isFirstRank': 'Birinci sıra mı',
      'compute.valuation.estimatedValue': 'Tahmini değer',
      'compute.debtor_behavior.score': 'Borçlu davranış skoru',
      'compute.debtor_behavior.category': 'Borçlu kategorisi',
      'fact.case.status': 'Dosya durumu',
      'fact.case.id': 'Dosya ID',
      'fact.case.total_debt': 'Toplam borç',
      'fact.lien.rank': 'Haciz sırası',
      'fact.debtor.id': 'Borçlu ID',
      'fact.payment.received': 'Ödeme alındı',
      'fact.payment.total_collected': 'Toplam tahsilat',
      'fact.assets.vehicle.found': 'Araç bulundu',
      'fact.assets.vehicle.estimated_value': 'Araç tahmini değeri',
      'fact.haciz.type': 'Haciz türü',
      'flags.HIGH_RISK': 'Yüksek risk',
      'flags.TEBLIGAT_COMPLETED': 'Tebligat tamamlandı',
      'flags.HACIZ_ACTIVE': 'Haciz aktif',
    };
    return mapping[path] || path;
  }

  /**
   * Literal değeri parse eder
   */
  private parseLiteral(val: string): any {
    const v = val.trim();
    
    // Quoted string
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      return v.slice(1, -1);
    }
    
    // Boolean
    if (v === 'true' || v === 'True') return true;
    if (v === 'false' || v === 'False') return false;
    if (v === 'null' || v === 'None') return null;
    
    // Number
    const num = Number(v);
    if (!isNaN(num)) return num;
    
    return v;
  }
}
