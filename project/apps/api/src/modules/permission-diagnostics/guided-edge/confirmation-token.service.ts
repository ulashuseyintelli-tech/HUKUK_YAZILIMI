// P3-1b — Confirmation Token Service (server-verified confirm protocol; substrate-only).
//
// P3-1a Option C: STATELESS HMAC-SHA256 token + AuditLog ISSUE/CONSUME korelasyon +
// best-effort replay tespiti. YENİ TABLO YOK; ŞEMA DEĞİŞİKLİĞİ YOK; credential SAKLANMAZ.
//
// Token formatı:  go.confirm.v1.<base64url(canonicalPayload)>.<base64url(hmacSha256)>
// İmza, "go.confirm.v1.<payloadB64>" üzerinden hesaplanır (JWT tarzı) → payload değişirse imza bozulur.
//
// KESİN SINIRLAR:
//  - Hiçbir route'a bağlı DEĞİL (enforcement YOK). Çağıran yok → uygulama davranışı değişmez.
//  - Ham token / ham request body AUDIT'E YAZILMAZ (yalnız nonce + hash'ler).
//  - Audit aktörü = kimliği doğrulanmış GERÇEK kullanıcı (asla 'system'/'unknown').
//  - Secret yoksa UYGULAMA AÇILIŞINI bozmaz; yalnız issue/verify çağrılınca throw eder.
//  - Geçerlilik (AXIS-V/CPE) ile ALAKASIZ; PolicyDecision'ı okumaz/yazmaz.

import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/audit.service';
import { canonicalJsonStringify, stableJsonHash } from './canonical-json';

const TOKEN_PREFIX = 'go.confirm.v1';
const TOKEN_VERSION = 'go.confirm.v1';
const DEFAULT_TTL_SECONDS = 300;

/** İstek bağlamı — token'ı bağlayan alanlar (issue + verify aynı kümeyi kullanır). */
export interface ConfirmTokenBinding {
  tenantId: string;
  actorUserId: string;
  actionCode: string;
  surface: string;
  targetRef: string;
  payloadHash: string;
}

/** Token gövdesi (imzalanan kanonik payload). Ham request body İÇERMEZ. */
export interface ConfirmTokenPayload extends ConfirmTokenBinding {
  version: string;
  issuedAt: number; // epoch ms
  expiresAt: number; // epoch ms
  nonce: string;
}

/** issue() çıktısı. */
export interface IssuedConfirmToken {
  token: string;
  expiresAt: string; // ISO
  bindingHash: string;
  nonce: string;
  auditRef: string; // = nonce (issue↔consume korelasyonu)
}

/** verify() sonucu (SAF; I/O yok). */
export type VerifyResultCode = 'VALID' | 'EXPIRED' | 'MISMATCH' | 'FORGED';
export interface VerifyResult {
  result: VerifyResultCode;
  payload?: ConfirmTokenPayload;
}

/** consume() sonucu (audit yazar; replay kontrol eder). */
export type ConsumeResultCode = 'CONSUMED' | 'EXPIRED' | 'MISMATCH' | 'REPLAY' | 'FORGED';
export interface ConsumeResult {
  ok: boolean;
  result: ConsumeResultCode;
  payload?: ConfirmTokenPayload;
}

@Injectable()
export class ConfirmationTokenService {
  private readonly logger = new Logger(ConfirmationTokenService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Confirm-required outcome için token üretir + CONFIRM_TOKEN_ISSUED audit'i yazar.
   * Çağrıldığı yerler: (henüz YOK) — substrate-only.
   */
  async issue(
    binding: ConfirmTokenBinding,
    opts?: { atMs?: number; decisionSource?: string; outcome?: string },
  ): Promise<IssuedConfirmToken> {
    const secret = this.secret(); // secret yoksa burada throw (açılışta değil)
    const now = opts?.atMs ?? Date.now();
    const expiresAtMs = now + this.ttlSeconds() * 1000;
    const nonce = crypto.randomBytes(16).toString('hex');

    const payload: ConfirmTokenPayload = {
      version: TOKEN_VERSION,
      tenantId: binding.tenantId,
      actorUserId: binding.actorUserId,
      actionCode: binding.actionCode,
      surface: binding.surface,
      targetRef: binding.targetRef,
      payloadHash: binding.payloadHash,
      issuedAt: now,
      expiresAt: expiresAtMs,
      nonce,
    };

    const token = this.sign(payload, secret);
    const bindingHash = stableJsonHash(this.bindingTuple(binding));
    const expiresAt = new Date(expiresAtMs).toISOString();

    // best-effort audit (AuditService.log zaten throw etmez)
    await this.audit.log({
      tenantId: binding.tenantId,
      action: 'CONFIRM_TOKEN_ISSUED',
      entityType: 'GUIDED_OPEN_CONFIRM',
      entityId: binding.targetRef,
      userId: binding.actorUserId, // truthful actor
      metadata: {
        nonce,
        actionCode: binding.actionCode,
        surface: binding.surface,
        targetRef: binding.targetRef,
        payloadHash: binding.payloadHash,
        expiresAt,
        ...(opts?.decisionSource !== undefined ? { decisionSource: opts.decisionSource } : {}),
        outcome: opts?.outcome ?? 'ISSUED',
        // NOT: ham token + ham body SAKLANMAZ.
      },
    });

    return { token, expiresAt, bindingHash, nonce, auditRef: nonce };
  }

  /**
   * Token'ı imza + bağlama + süre yönünden DOĞRULAR. SAF: I/O yok, audit yok, replay yok.
   *  - imza geçersiz/biçimsiz → FORGED
   *  - imza geçerli ama bağlam (tenant/actor/action/surface/target/payloadHash) farklı → MISMATCH
   *  - bağlam uyar ama süresi geçmiş → EXPIRED
   *  - hepsi tamam → VALID
   * Secret yoksa throw (verify çağrısında).
   */
  verify(token: string, expected: ConfirmTokenBinding, opts?: { atMs?: number }): VerifyResult {
    const secret = this.secret();
    const now = opts?.atMs ?? Date.now();

    const payload = this.parseAndAuthenticate(token, secret);
    if (!payload) return { result: 'FORGED' };

    if (
      payload.tenantId !== expected.tenantId ||
      payload.actorUserId !== expected.actorUserId ||
      payload.actionCode !== expected.actionCode ||
      payload.surface !== expected.surface ||
      payload.targetRef !== expected.targetRef ||
      payload.payloadHash !== expected.payloadHash
    ) {
      return { result: 'MISMATCH', payload };
    }

    if (now >= payload.expiresAt) {
      return { result: 'EXPIRED', payload };
    }

    return { result: 'VALID', payload };
  }

  /**
   * Token'ı TÜKETİR: verify → (best-effort) replay kontrol → CONFIRM_TOKEN_CONSUMED audit.
   * Mutasyon YAPMAZ; yalnız "bu token bu istek için kullanılabilir mi" kararını + audit'i üretir.
   * Audit aktörü daima expected.actorUserId (gerçek, doğrulanmış kullanıcı).
   * Çağrıldığı yerler: (henüz YOK) — substrate-only.
   */
  async consume(
    token: string,
    expected: ConfirmTokenBinding,
    opts?: { atMs?: number },
  ): Promise<ConsumeResult> {
    const v = this.verify(token, expected, opts);
    if (v.result !== 'VALID') {
      await this.auditConsume(expected, v.payload, v.result);
      return { ok: false, result: v.result };
    }

    const replayed = await this.audit.hasPriorConfirmTokenConsumption({
      tenantId: expected.tenantId,
      targetRef: expected.targetRef,
      nonce: v.payload!.nonce,
      actionCode: expected.actionCode,
    });
    if (replayed) {
      await this.auditConsume(expected, v.payload, 'REPLAY');
      return { ok: false, result: 'REPLAY' };
    }

    await this.auditConsume(expected, v.payload, 'CONSUMED');
    return { ok: true, result: 'CONSUMED', payload: v.payload };
  }

  // ───────────────────────── internals ─────────────────────────

  private async auditConsume(
    expected: ConfirmTokenBinding,
    payload: ConfirmTokenPayload | undefined,
    result: ConsumeResultCode,
  ): Promise<void> {
    await this.audit.log({
      tenantId: expected.tenantId,
      action: 'CONFIRM_TOKEN_CONSUMED',
      entityType: 'GUIDED_OPEN_CONFIRM',
      entityId: expected.targetRef,
      userId: expected.actorUserId, // truthful actor; asla system/unknown
      metadata: {
        nonce: payload?.nonce ?? null,
        actionCode: expected.actionCode,
        surface: expected.surface,
        targetRef: expected.targetRef,
        payloadHash: expected.payloadHash,
        result,
        // NOT: ham token + ham body SAKLANMAZ.
      },
    });
  }

  private sign(payload: ConfirmTokenPayload, secret: string): string {
    const payloadB64 = toBase64Url(Buffer.from(canonicalJsonStringify(payload), 'utf8'));
    const sig = this.hmac(`${TOKEN_PREFIX}.${payloadB64}`, secret);
    return `${TOKEN_PREFIX}.${payloadB64}.${sig}`;
  }

  /** İmzayı doğrula + payload'ı çöz. Başarısızsa null (FORGED/biçimsiz/imza-uyumsuz). */
  private parseAndAuthenticate(token: string, secret: string): ConfirmTokenPayload | null {
    if (typeof token !== 'string') return null;
    const head = `${TOKEN_PREFIX}.`;
    if (!token.startsWith(head)) return null;
    const rest = token.slice(head.length);
    const parts = rest.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    if (!payloadB64 || !sig) return null;

    const expectedSig = this.hmac(`${TOKEN_PREFIX}.${payloadB64}`, secret);
    if (!timingSafeEqualStr(sig, expectedSig)) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(fromBase64Url(payloadB64).toString('utf8'));
    } catch {
      return null;
    }
    if (!isConfirmTokenPayload(parsed)) return null;
    return parsed;
  }

  private hmac(data: string, secret: string): string {
    return toBase64Url(crypto.createHmac('sha256', secret).update(data, 'utf8').digest());
  }

  private bindingTuple(b: ConfirmTokenBinding): Record<string, string> {
    return {
      tenantId: b.tenantId,
      actorUserId: b.actorUserId,
      actionCode: b.actionCode,
      surface: b.surface,
      targetRef: b.targetRef,
      payloadHash: b.payloadHash,
    };
  }

  /**
   * P3-2D-0 (enable preflight): secret (GUIDED_OPEN_CONFIRM_TOKEN_SECRET → JWT_SECRET fallback) yapılandırılmış mı?
   * THROW ETMEZ; yalnız boolean. Caller (gate) eksikse typed 503 üretir (plain 500 yerine).
   * Secret DEĞERİ döndürülmez/loglanmaz.
   */
  isSecretConfigured(): boolean {
    const s =
      this.config.get<string>('GUIDED_OPEN_CONFIRM_TOKEN_SECRET') ??
      this.config.get<string>('JWT_SECRET');
    return typeof s === 'string' && s.trim().length > 0;
  }

  /** Secret kaynağı: tercihen GUIDED_OPEN_CONFIRM_TOKEN_SECRET, geri-düşüş JWT_SECRET. */
  private secret(): string {
    const s =
      this.config.get<string>('GUIDED_OPEN_CONFIRM_TOKEN_SECRET') ??
      this.config.get<string>('JWT_SECRET');
    if (!s || !String(s).trim()) {
      throw new Error(
        'Confirm-token secret yapılandırılmamış (GUIDED_OPEN_CONFIRM_TOKEN_SECRET veya JWT_SECRET).',
      );
    }
    return s;
  }

  private ttlSeconds(): number {
    const raw = this.config.get<string>('GUIDED_OPEN_CONFIRM_TOKEN_TTL_SECONDS');
    const n = raw === undefined || raw === null ? NaN : Number.parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_SECONDS;
  }
}

// ───────────────────────── module-private helpers ─────────────────────────

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/** Sabit-zamanlı string karşılaştırma (uzunluk farkı → false). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function isConfirmTokenPayload(value: unknown): value is ConfirmTokenPayload {
  if (value === null || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.version === 'string' &&
    typeof p.tenantId === 'string' &&
    typeof p.actorUserId === 'string' &&
    typeof p.actionCode === 'string' &&
    typeof p.surface === 'string' &&
    typeof p.targetRef === 'string' &&
    typeof p.payloadHash === 'string' &&
    typeof p.issuedAt === 'number' &&
    typeof p.expiresAt === 'number' &&
    typeof p.nonce === 'string'
  );
}
