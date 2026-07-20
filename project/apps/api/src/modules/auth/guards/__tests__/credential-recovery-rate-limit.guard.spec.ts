/**
 * CLIENT-P2-CREDENTIAL-RECOVERY-P01 — CredentialRecoveryRateLimitGuard.
 *
 * Mandatory correction: login ve credential-recovery bucket'ları AYRI olmalı
 * (LoginRateLimitGuard'ın module-scope store'u paylaşılmaz). Bu dosya, her iki
 * guard'ın BAĞIMSIZ store'lara sahip olduğunu ve limitin aşılmasının diğer
 * guard'ı ETKİLEMEDİĞİNİ doğrular.
 */
import { HttpException } from '@nestjs/common';
import { CredentialRecoveryRateLimitGuard } from '../credential-recovery-rate-limit.guard';
import { LoginRateLimitGuard } from '../login-rate-limit.guard';

function ctxFor(ip: string): any {
  return { switchToHttp: () => ({ getRequest: () => ({ ip }) }) };
}

describe('CredentialRecoveryRateLimitGuard', () => {
  it('[1] limit altında istekler geçer', () => {
    const guard = new CredentialRecoveryRateLimitGuard();
    const ip = 'ip-test-1';
    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(ctxFor(ip))).toBe(true);
    }
  });

  it('[2] limit aşılınca 429 fırlatılır', () => {
    const guard = new CredentialRecoveryRateLimitGuard();
    const ip = 'ip-test-2';
    for (let i = 0; i < 10; i++) {
      guard.canActivate(ctxFor(ip));
    }
    expect(() => guard.canActivate(ctxFor(ip))).toThrow(HttpException);
  });

  it('[3] credential-recovery bucket dolması login bucket\'ını ETKİLEMEZ (bağımsız store)', () => {
    const recoveryGuard = new CredentialRecoveryRateLimitGuard();
    const loginGuard = new LoginRateLimitGuard();
    const ip = 'ip-test-3';

    // credential-recovery bucket'ını doldur (aynı IP)
    for (let i = 0; i < 10; i++) {
      recoveryGuard.canActivate(ctxFor(ip));
    }
    expect(() => recoveryGuard.canActivate(ctxFor(ip))).toThrow(HttpException);

    // AYNI IP login guard'da hâlâ serbest olmalı (paylaşımlı store DEĞİL)
    expect(loginGuard.canActivate(ctxFor(ip))).toBe(true);
  });
});
