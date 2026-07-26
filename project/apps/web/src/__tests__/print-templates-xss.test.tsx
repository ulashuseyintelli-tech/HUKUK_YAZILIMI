import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrintTemplates } from '@/components/case/print-templates';

const maliciousTemplate = {
  id: 'stored-template',
  name: '</title><script>globalThis.__printTemplateXss = true</script>',
  type: 'custom',
  showLogo: false,
  showHeader: true,
  headerText: '<img src=x onerror="globalThis.__printTemplateXss = true">',
  footerText: '<svg onload="globalThis.__printTemplateXss = true"></svg>',
  pageSize: 'A4; } body { background: url(javascript:alert(1))',
  orientation: 'portrait; color: red',
  margins: {
    top: '0; } body { display: none',
    right: 15,
    bottom: 20,
    left: 15,
  },
  fontSize: '12; } body { color: red',
  isDefault: false,
};

describe('PrintTemplates preview XSS boundary', () => {
  beforeEach(() => {
    localStorage.setItem('printTemplates', JSON.stringify([maliciousTemplate]));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete (globalThis as { __printTemplateXss?: boolean }).__printTemplateXss;
  });

  it('renders stored template data as text and constrains dynamic CSS values', async () => {
    const previewDocument = document.implementation.createHTMLDocument('');
    const print = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({
      document: previewDocument,
      print,
    } as unknown as Window);

    render(<PrintTemplates />);

    fireEvent.click(await screen.findByRole('button', { name: 'Önizle' }));

    expect(previewDocument.title).toBe(`${maliciousTemplate.name} - Önizleme`);
    expect(previewDocument.querySelector('.header')?.textContent).toBe(maliciousTemplate.headerText);
    expect(previewDocument.querySelector('.footer')?.textContent).toBe(maliciousTemplate.footerText);
    expect(previewDocument.querySelector('script')).toBeNull();
    expect(previewDocument.querySelector('img')).toBeNull();
    expect(previewDocument.querySelector('svg')).toBeNull();
    expect((globalThis as { __printTemplateXss?: boolean }).__printTemplateXss).toBeUndefined();

    const stylesheet = previewDocument.querySelector('style')?.textContent ?? '';
    expect(stylesheet).toContain('@page { size: A4 portrait; margin: 20mm 15mm 20mm 15mm; }');
    expect(stylesheet).toContain('font-size: 12pt');
    expect(stylesheet).not.toContain('javascript:');
    expect(stylesheet).not.toContain('display: none');
    expect(print).toHaveBeenCalledOnce();
  });
});
