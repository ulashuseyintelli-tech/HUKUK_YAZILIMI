import { UiMapRecorderService } from '../recorder/uimap-recorder.service';

describe('UiMapRecorderService prototype pollution boundary', () => {
  afterEach(() => {
    delete (Object.prototype as { polluted?: string }).polluted;
  });

  const createService = (content: Record<string, unknown>, label: string) => {
    const prisma = {
      icrabotUiMapRecording: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'recording-1',
          label,
          selector: 'css=#submit',
          alternatives: [],
          selectorKind: 'button',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      selectorHealthLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      icrabotBundle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'bundle-1',
          content,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const service = new UiMapRecorderService(prisma as any, {} as any);
    return { prisma, service };
  };

  it('stores a __proto__ section as own JSON data without mutating Object.prototype', async () => {
    const { prisma, service } = createService({ locator_bindings: {} }, 'polluted');

    await service.approveRecording(
      'tenant-1',
      'recording-1',
      '__proto__',
      undefined,
      false,
    );

    const updatedContent = prisma.icrabotBundle.update.mock.calls[0][0].data.content;
    const bindings = updatedContent.locator_bindings;
    const section = bindings.__proto__;

    expect(Object.prototype.hasOwnProperty.call(bindings, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(section, 'polluted')).toBe(true);
    expect(section.polluted).toBe('css=#submit');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('stores a __proto__ label as an own binding without changing the section prototype', async () => {
    const { prisma, service } = createService({ locator_bindings: {} }, '__proto__');

    await service.approveRecording(
      'tenant-1',
      'recording-1',
      'buttons',
      undefined,
      false,
    );

    const updatedContent = prisma.icrabotBundle.update.mock.calls[0][0].data.content;
    const section = updatedContent.locator_bindings.buttons;
    expect(Object.prototype.hasOwnProperty.call(section, '__proto__')).toBe(true);
    expect(section.__proto__).toBe('css=#submit');
    expect(Object.getPrototypeOf(section)).toBe(Object.prototype);
  });

  it('preserves existing normal bindings while adding the approved selector', async () => {
    const { prisma, service } = createService(
      {
        locator_bindings: {
          buttons: { BTN_EXISTING: 'css=#existing' },
        },
      },
      'BTN_NEW',
    );

    await service.approveRecording(
      'tenant-1',
      'recording-1',
      'buttons',
      undefined,
      false,
    );

    const updatedContent = prisma.icrabotBundle.update.mock.calls[0][0].data.content;
    expect(updatedContent.locator_bindings).toEqual({
      buttons: {
        BTN_EXISTING: 'css=#existing',
        BTN_NEW: 'css=#submit',
      },
    });
  });
});
