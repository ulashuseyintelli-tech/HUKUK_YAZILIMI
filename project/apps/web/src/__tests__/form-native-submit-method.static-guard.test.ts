/**
 * STATİK GUARD — parola taşıyan ya da girişsiz (auth / portal) yüzeydeki her `<form>` `method="post"` taşır.
 *
 * NEDEN: `method` yoksa tarayıcının yerel gönderimi GET'tir ve `name` taşıyan alanlar ADRESE yazılır. React
 * işleyicisi (`onSubmit` + preventDefault) bunu yalnız (a) hidrasyon bittikten sonra ve (b) gönderim olay
 * üzerinden geldiğinde engeller; `form.submit()` olayı hiç üretmez. Ölçüldü (2026-10-01, başsız Edge):
 * `/auth/login?tenantSlug=…&email=…&password=…`, `/settings/security?currentPassword=…&newPassword=…`.
 *
 * Davranış testi (`form-native-submit-prehydration.test.tsx`) bugünkü formları ölçer; bu guard YARIN eklenecek
 * bir parola formunun aynı kusurla gelmesini engeller. Kaynak metni TypeScript AST'iyle okunur (regex JSX
 * iç içeliğini ayıramaz).
 *
 * SINIR: parola alanı forma başka bir bileşenin İÇİNDEN geliyorsa (form JSX'inde görünmüyorsa) bu guard
 * göremez; `app/auth` ve `app/portal` altındaki formlar ise alan türünden bağımsız denetlenir.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const WEB_SRC = join(__dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (entry.name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

type FormFinding = { file: string; line: number; method: string | null; hasPasswordField: boolean };

const tagName = (node: ts.JsxOpeningLikeElement) => node.tagName.getText();

function attribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

function isPasswordField(node: ts.JsxOpeningLikeElement): boolean {
  if (tagName(node) === 'PasswordInput') return true;
  if (tagName(node) !== 'input') return false;
  // `type="password"` ya da `type={goster ? "text" : "password"}` — ifade metninde "password" geçmesi yeter.
  const type = attribute(node, 'type');
  return !!type?.initializer && /password/.test(type.initializer.getText());
}

function containsPasswordField(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && isPasswordField(n)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function formsIn(file: string): FormFinding[] {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('<form')) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: FormFinding[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && tagName(node.openingElement) === 'form') {
      const method = attribute(node.openingElement, 'method')?.initializer;
      findings.push({
        file: relative(WEB_SRC, file).split(sep).join('/'),
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        // Yalnız düz dize kabul edilir: `method={degisken}` denetlenemez, bu yüzden geçersiz sayılır.
        method: method && ts.isStringLiteral(method) ? method.text.toLowerCase() : null,
        hasPasswordField: containsPasswordField(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

const ALL_FORMS = sourceFiles(WEB_SRC).flatMap(formsIn);
const where = (f: FormFinding) => `${f.file}:${f.line}`;

describe('statik guard — yerel form gönderimi yöntemi', () => {
  it('tarayıcı gerçekten baktı: web kaynağında formlar bulundu', () => {
    // 0 = guard kör (dizin / ayrıştırma hatası). Sayı bilerek alt sınırdır; yeni form eklemek testi kırmaz.
    expect(ALL_FORMS.length).toBeGreaterThanOrEqual(40);
  });

  it('parola alanı içeren her form method="post" taşır', () => {
    const passwordForms = ALL_FORMS.filter((f) => f.hasPasswordField);

    // Bilinen parola formları bulunmalı — bulunamıyorsa tespit kuralı bozulmuştur.
    expect(passwordForms.map((f) => f.file).sort()).toEqual(
      expect.arrayContaining([
        'app/(dashboard)/settings/security/page.tsx',
        'app/auth/accept-invite/page.tsx',
        'app/auth/login/page.tsx',
        'app/auth/reset-password/page.tsx',
        'app/portal/login/page.tsx',
        'app/portal/profile/page.tsx',
        'app/portal/reset-password/page.tsx',
        'components/client/client-portal-tab.tsx',
      ]),
    );

    expect(passwordForms.filter((f) => f.method !== 'post').map(where)).toEqual([]);
  });

  it('girişsiz yüzeydeki (app/auth, app/portal) her form method="post" taşır', () => {
    const publicForms = ALL_FORMS.filter((f) => f.file.startsWith('app/auth/') || f.file.startsWith('app/portal/'));

    expect(publicForms.map((f) => f.file).sort()).toEqual(
      expect.arrayContaining([
        'app/auth/accept-invite/page.tsx',
        'app/auth/account-recovery/page.tsx',
        'app/auth/forgot-password/page.tsx',
        'app/auth/login/page.tsx',
        'app/auth/reset-password/page.tsx',
        'app/portal/forgot-password/page.tsx',
        'app/portal/login/page.tsx',
        'app/portal/profile/page.tsx',
        'app/portal/reset-password/page.tsx',
      ]),
    );

    expect(publicForms.filter((f) => f.method !== 'post').map(where)).toEqual([]);
  });
});
