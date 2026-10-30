import { readFileSync } from 'fs';
import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { AdminService } from '../admin.service';
import { ROLE_PERMISSIONS, type AdminRole } from '../../config/admin-panel.config';

/**
 * F02-D-2 dilim 4 (owner ek talimatı 30.10.2026) — icrabot/admin yazma yüzeyi VIEWER'a KAPALI (kanıtla kapatma; kod değişmez).
 *
 * Mevcut koruma: her yazma handler'ı girişte `adminService.checkPermission(req.user.role, '<izin>')` çağırır; izin haritası
 * (`ROLE_PERMISSIONS`) VIEWER için hiçbir izin tanımlamaz → VIEWER her yazma ucunda 403 (servis / DB'ye inmeden). Bu spec o
 * korumanın sürdüğünü fail-closed bekler: (1) controller kaynağında HER @Post/@Put/@Patch/@Delete handler'ının gövdesi
 * `checkPermission` ile başlar; (2) VIEWER rolü (büyük / küçük yazım) hiçbir yazma iznine sahip değildir ve `checkPermission`
 * fırlatır. Yeni bir yazma rotası `checkPermission` olmadan eklenirse ya da VIEWER'a yazma izni verilirse → KIRMIZI.
 *
 * KAYDA GEÇEN BULGU (davranış değiştirilmedi; owner kalemi): `AdminRole` değerleri küçük harf ('admin' | 'ops' | 'avukat'),
 * `req.user.role` ise UserRole ('ADMIN' | 'USER' | 'VIEWER') → harita ADMIN/USER için de boş döner; yüzey bugün fiilen herkese
 * kapalıdır. Bu spec yalnız VIEWER kapalılığını sözleşmeye bağlar; eşleme düzeltilirse (owner) test yine geçer.
 */
const controllerSrc = readFileSync(join(__dirname, '..', 'admin.controller.ts'), 'utf8');
const WRITE_PERMISSIONS = Object.values(ROLE_PERMISSIONS).flat().filter((p) => !/\.(read)$/.test(p));

describe('F02-D-2 dilim 4 — icrabot/admin yazma yüzeyi VIEWER için KAPALI (kanıt)', () => {
  it('her yazma handler\'ı girişte checkPermission çağırır (kaynak; kör değil: 12 rota)', () => {
    const lines = controllerSrc.split(/\r?\n/);
    const writes: Array<{ route: string; line: number; checked: boolean }> = [];
    lines.forEach((line, i) => {
      const m = line.match(/^\s*@(Post|Put|Patch|Delete)\(([^)]*)\)/);
      if (!m) return;
      // Handler gövdesi: dekoratörden sonraki ilk 14 satır içinde checkPermission; araya başka handler girmez.
      const window = lines.slice(i + 1, i + 15).join('\n');
      const nextRoute = window.search(/^\s*@(Post|Put|Patch|Delete|Get)\(/m);
      const body = nextRoute >= 0 ? window.slice(0, nextRoute) : window;
      writes.push({ route: `${m[1]} ${m[2]}`, line: i + 1, checked: /this\.adminService\.checkPermission\(req\.user\.role as AdminRole, '[a-z_.]+'\)/.test(body) });
    });
    expect(writes.length).toBe(12);
    expect(writes.filter((w) => !w.checked)).toEqual([]);
  });

  it('VIEWER (her iki yazım) hiçbir yazma iznine sahip değil; checkPermission fırlatır', () => {
    expect(WRITE_PERMISSIONS.length).toBeGreaterThan(10); // kör değil
    const svc = new AdminService({} as any);
    for (const role of ['VIEWER', 'viewer'] as unknown as AdminRole[]) {
      expect((ROLE_PERMISSIONS as Record<string, string[]>)[role as string] ?? []).toEqual([]);
      for (const permission of WRITE_PERMISSIONS) {
        expect(() => svc.checkPermission(role, permission)).toThrow(ForbiddenException);
      }
    }
  });

  it('izin haritası yazma izinlerini tanımlar (kanıt kör değil)', () => {
    expect(WRITE_PERMISSIONS).toEqual(expect.arrayContaining(['recipe.enable', 'params.write', 'job.retry', 'lock.override', 'audit.export']));
  });
});
