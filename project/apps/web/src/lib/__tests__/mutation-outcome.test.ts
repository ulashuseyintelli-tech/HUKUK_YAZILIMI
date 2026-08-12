import { describe, it, expect, vi, afterEach } from 'vitest';
import { runMutation, runRefreshOnly, REFRESH_STALE_NOTICE } from '../mutation-outcome';

/**
 * PR-2A1 — mutation ile ikincil tazelemenin AYRILMASI.
 *
 * Kapatılan iki karşıt risk:
 *  1. Mutation hatası "başarı" gibi görünmesin (sessiz mutasyon).
 *  2. Tazeleme hatası "kaydedilemedi" gibi görünmesin — kullanıcı tekrar deneyip
 *     ÇİFT KAYIT üretir. Kayıt YAPILDIYSA sonuç geri çevrilmez.
 */
describe('runMutation — faz ayrımı', () => {
  it('mutation başarısızsa refresh HİÇ çağrılmaz ve FAILED döner', async () => {
    const refresh = vi.fn(async () => undefined);
    const outcome = await runMutation({
      mutate: async () => {
        throw { body: { message: 'Bu tarihte başka duruşma var.' } };
      },
      refresh,
      failureMessage: 'Duruşma kaydedilemedi.',
    });

    expect(outcome.status).toBe('FAILED');
    expect(refresh).not.toHaveBeenCalled();
    if (outcome.status === 'FAILED') {
      expect(outcome.error.message).toBe('Bu tarihte başka duruşma var.');
    }
  });

  it('mutation + refresh başarılıysa SUCCESS döner', async () => {
    const outcome = await runMutation({
      mutate: async () => ({ id: 'h-1' }),
      refresh: async () => undefined,
      failureMessage: 'olmadi',
    });

    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status === 'SUCCESS') {
      expect(outcome.data).toEqual({ id: 'h-1' });
      expect(outcome.stale).toBeNull();
    }
  });

  it('mutation başarılı + refresh başarısız → SUCCESS_STALE (başarı GERİ ÇEVRİLMEZ)', async () => {
    const outcome = await runMutation({
      mutate: async () => ({ id: 'h-1' }),
      refresh: async () => {
        throw new Error('liste okunamadi');
      },
      failureMessage: 'Duruşma kaydedilemedi.',
    });

    expect(outcome.status).toBe('SUCCESS_STALE');
    if (outcome.status === 'SUCCESS_STALE') {
      expect(outcome.stale).toBe(REFRESH_STALE_NOTICE);
      // Sunucudan dönen kararlı kimlik stale durumunda SAKLANIR.
      expect(outcome.data).toEqual({ id: 'h-1' });
    }
  });

  it('stale mesajı çağıran tarafından özelleştirilebilir', async () => {
    const outcome = await runMutation({
      mutate: async () => 'ok',
      refresh: async () => {
        throw new Error('x');
      },
      failureMessage: 'olmadi',
      staleMessage: 'Duruşma SİLİNDİ, liste yenilenemedi.',
    });
    expect(outcome.status === 'SUCCESS_STALE' && outcome.stale).toBe(
      'Duruşma SİLİNDİ, liste yenilenemedi.',
    );
  });

  it('refresh verilmezse SUCCESS döner (tazeleme zorunlu değil)', async () => {
    const outcome = await runMutation({ mutate: async () => 1, failureMessage: 'olmadi' });
    expect(outcome.status).toBe('SUCCESS');
  });

  it('SUCCESS_STALE sonrası refresh-only retry mutation’ı TEKRAR ÇAĞIRMAZ', async () => {
    const mutate = vi.fn(async () => ({ id: 'h-1' }));
    const refresh = vi.fn<() => Promise<void>>(async () => {
      throw new Error('ilk tazeleme basarisiz');
    });

    const first = await runMutation({ mutate, refresh, failureMessage: 'olmadi' });
    expect(first.status).toBe('SUCCESS_STALE');
    expect(mutate).toHaveBeenCalledTimes(1);

    // Kullanıcı "Listeyi yenile" der: YALNIZ refresh çalışır, mutation'a dokunulmaz.
    refresh.mockImplementationOnce(async () => undefined);
    await refresh();

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('dönüş tipi korunur (Promise<void>’a indirgenmez)', async () => {
    const outcome = await runMutation({
      mutate: async () => ({ id: 'x-9', createdAt: '2026-08-11' }),
      failureMessage: 'olmadi',
    });
    if (outcome.status === 'SUCCESS') {
      expect(outcome.data.id).toBe('x-9');
      expect(outcome.data.createdAt).toBe('2026-08-11');
    } else {
      throw new Error('SUCCESS bekleniyordu');
    }
  });
});

describe('runMutation — gözlemci (onObserve)', () => {
  it('mutation ve refresh hataları AYRI fazlarla bildirilir', async () => {
    const onObserve = vi.fn();

    await runMutation({
      mutate: async () => {
        throw new Error('m');
      },
      refresh: async () => undefined,
      failureMessage: 'olmadi',
      onObserve,
    });
    expect(onObserve).toHaveBeenCalledWith('MUTATION', expect.any(Error));

    onObserve.mockClear();
    await runMutation({
      mutate: async () => 'ok',
      refresh: async () => {
        throw new Error('r');
      },
      failureMessage: 'olmadi',
      onObserve,
    });
    expect(onObserve).toHaveBeenCalledWith('REFRESH', expect.any(Error));
  });

  it('gözlemci HATA ATARSA outcome DEĞİŞMEZ (reporter arızası akışı bozmaz)', async () => {
    const boom = () => {
      throw new Error('reporter cokti');
    };

    const failed = await runMutation({
      mutate: async () => {
        throw new Error('m');
      },
      failureMessage: 'Kaydedilemedi.',
      onObserve: boom,
    });
    expect(failed.status).toBe('FAILED');

    const stale = await runMutation({
      mutate: async () => 'ok',
      refresh: async () => {
        throw new Error('r');
      },
      failureMessage: 'olmadi',
      onObserve: boom,
    });
    expect(stale.status).toBe('SUCCESS_STALE');
  });

  it('başarı yolunda gözlemci ÇAĞRILMAZ', async () => {
    const onObserve = vi.fn();
    await runMutation({
      mutate: async () => 'ok',
      refresh: async () => undefined,
      failureMessage: 'olmadi',
      onObserve,
    });
    expect(onObserve).not.toHaveBeenCalled();
  });
});

describe('REPORTER_FAILURE — payload redaction', () => {
  const original = globalThis.__clientErrorFallback__;
  afterEach(() => {
    globalThis.__clientErrorFallback__ = original;
    vi.restoreAllMocks();
  });

  /** Sizinti tasiyan gercekci bir hata: gövde, token, SQL, stack, PII. */
  function leakyError() {
    const e = new TypeError('insert into users values ($1) -- 5551234567');
    Object.assign(e, {
      code: 'RATE_LIMITED',
      correlationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      requestBody: { iban: 'TR330006100519786457841326', tckn: '11111111110' },
      token: 'Bearer secret-token',
      config: { url: 'https://api.internal/cases/1/hearings' },
    });
    e.stack = 'TypeError: boom\n    at handleSave (case-hearings.tsx:102)';
    return e;
  }

  it('merkezi fallback SANITIZE EDILMIS payload alir — ham hata GITMEZ', async () => {
    const seen: unknown[] = [];
    globalThis.__clientErrorFallback__ = (p) => {
      seen.push(p);
    };

    await runMutation({
      mutate: async () => {
        throw new Error('m');
      },
      failureMessage: 'olmadi',
      onObserve: () => {
        throw leakyError();
      },
    });

    expect(seen).toHaveLength(1);
    const payload = seen[0] as Record<string, unknown>;
    expect(payload).toEqual({
      reason: 'REPORTER_FAILURE',
      phase: 'MUTATION',
      errorName: 'TypeError',
      code: 'RATE_LIMITED',
      correlationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });

    const serialized = JSON.stringify(payload);
    for (const secret of [
      'TR330006100519786457841326',
      '11111111110',
      'secret-token',
      'api.internal',
      'insert into',
      'case-hearings.tsx',
      '5551234567',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('console yolu da ham hata BASMAZ', async () => {
    globalThis.__clientErrorFallback__ = undefined;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runMutation({
      mutate: async () => 'ok',
      refresh: async () => {
        throw new Error('r');
      },
      failureMessage: 'olmadi',
      onObserve: () => {
        throw leakyError();
      },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [tag, payload] = spy.mock.calls[0];
    expect(tag).toBe('REPORTER_FAILURE');
    expect(JSON.stringify(payload)).not.toMatch(/TR3300|11111111110|secret-token|api\.internal/);
    expect((payload as Record<string, unknown>).phase).toBe('REFRESH');
  });

  it('guvenli desene uymayan code/correlationId TASINMAZ', async () => {
    const seen: Record<string, unknown>[] = [];
    globalThis.__clientErrorFallback__ = (p) => {
      seen.push(p as unknown as Record<string, unknown>);
    };

    await runMutation({
      mutate: async () => {
        throw new Error('m');
      },
      failureMessage: 'olmadi',
      onObserve: () => {
        throw Object.assign(new Error('x'), {
          code: 'https://leak/path?token=abc',
          correlationId: 'a'.repeat(200),
        });
      },
    });

    expect(seen[0].code).toBeUndefined();
    expect(seen[0].correlationId).toBeUndefined();
    expect(seen[0].errorName).toBe('Error');
  });

  it('fallback kanali HATA ATARSA outcome degismez ve console devreye girer', async () => {
    globalThis.__clientErrorFallback__ = () => {
      throw new Error('fallback cokti');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const outcome = await runMutation({
      mutate: async () => 'ok',
      refresh: async () => {
        throw new Error('r');
      },
      failureMessage: 'olmadi',
      onObserve: () => {
        throw new Error('reporter cokti');
      },
    });

    expect(outcome.status).toBe('SUCCESS_STALE');
    expect(spy).toHaveBeenCalledWith('REPORTER_FAILURE', expect.objectContaining({ phase: 'REFRESH' }));
  });

  it('runRefreshOnly de sanitize edilmis payload kullanir', async () => {
    const seen: Record<string, unknown>[] = [];
    globalThis.__clientErrorFallback__ = (p) => {
      seen.push(p as unknown as Record<string, unknown>);
    };

    const ok = await runRefreshOnly(
      async () => {
        throw new Error('liste okunamadi');
      },
      () => {
        throw leakyError();
      },
    );

    expect(ok).toBe(false);
    expect(seen[0]).toEqual({
      reason: 'REPORTER_FAILURE',
      phase: 'REFRESH',
      errorName: 'TypeError',
      code: 'RATE_LIMITED',
      correlationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });
  });
});

describe('REPORTER_FAILURE — hassas deger negatif testleri', () => {
  const original = globalThis.__clientErrorFallback__;
  afterEach(() => {
    globalThis.__clientErrorFallback__ = original;
    vi.restoreAllMocks();
  });

  async function capture(extra: Record<string, unknown>) {
    const seen: Record<string, unknown>[] = [];
    globalThis.__clientErrorFallback__ = (p) => {
      seen.push(p as unknown as Record<string, unknown>);
    };
    await runMutation({
      mutate: async () => {
        throw new Error('m');
      },
      failureMessage: 'olmadi',
      onObserve: () => {
        throw Object.assign(new Error('x'), extra);
      },
    });
    return seen[0];
  }

  // Bu degerler yanlislikla code/correlationId alanina ATANMIS olabilir.
  const sensitive: [string, string][] = [
    ['TCKN', '12345678901'],
    ['telefon', '05551234567'],
    ['telefon (uluslararasi)', '905551234567'],
    ['IBAN', 'TR330006100519786457841326'],
    ['kart', '4111111111111111'],
    ['11 basamak duz sayi', '11111111111'],
    ['16 basamak duz sayi', '1111111111111111'],
  ];

  it.each(sensitive)('%s degeri `code` alanindan TASINMAZ', async (_l, value) => {
    const p = await capture({ code: value });
    expect(p.code).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain(value);
  });

  it.each(sensitive)('%s degeri `correlationId` alanindan TASINMAZ', async (_l, value) => {
    const p = await capture({ correlationId: value });
    expect(p.correlationId).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain(value);
  });

  it.each(sensitive)('%s degeri `requestId` alanindan da TASINMAZ', async (_l, value) => {
    const p = await capture({ requestId: value });
    expect(p.correlationId).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain(value);
  });

  it('gecerli uygulama hata kodu TASINIR', async () => {
    expect((await capture({ code: 'RATE_LIMITED' })).code).toBe('RATE_LIMITED');
    expect((await capture({ code: 'HEARING_CONFLICT' })).code).toBe('HEARING_CONFLICT');
    expect((await capture({ code: 'P2002_LIKE' })).code).toBe('P2002_LIKE');
  });

  it('SCREAMING_SNAKE olmayan kod TASINMAZ', async () => {
    for (const bad of ['rate_limited', 'Rate-Limited', 'AB', '_LEADING', 'TRAILING_', 'A__B']) {
      expect((await capture({ code: bad })).code).toBeUndefined();
    }
  });

  it('correlationId YALNIZ UUID formatinda tasinir', async () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect((await capture({ correlationId: uuid })).correlationId).toBe(uuid);
    for (const bad of ['req-abc-123', 'abc', '3f2504e0-4f89-41d3-9a0c', 'x'.repeat(36)]) {
      expect((await capture({ correlationId: bad })).correlationId).toBeUndefined();
    }
  });

  it('gecersiz errorName degeri TASINMAZ; guvenli constructor adina dusulur', async () => {
    expect((await capture({})).errorName).toBe('Error');

    // Hassas/gecersiz `name` degeri ASLA tasinmaz; sinif adi guvenli yedektir.
    for (const bad of ['05551234567', 'Type Error', '12345678901']) {
      const p = await capture({ name: bad });
      expect(p.errorName).toBe('Error');
      expect(JSON.stringify(p)).not.toContain(bad);
    }
  });

  it('ne `name` ne sinif adi guvenliyse `UnknownError` olur', async () => {
    const seen: Record<string, unknown>[] = [];
    globalThis.__clientErrorFallback__ = (p) => {
      seen.push(p as unknown as Record<string, unknown>);
    };
    // Prototipsiz nesne: `constructor` yok, `name` hassas.
    const naked = Object.create(null) as Record<string, unknown>;
    naked.name = '12345678901';
    await runMutation({
      mutate: async () => {
        throw new Error('m');
      },
      failureMessage: 'olmadi',
      onObserve: () => {
        throw naked;
      },
    });
    expect(seen[0].errorName).toBe('UnknownError');
    expect(JSON.stringify(seen[0])).not.toContain('12345678901');
  });

  it('payload YALNIZ bilinen anahtarlari tasir', async () => {
    const p = await capture({ code: 'RATE_LIMITED', secret: 'x', iban: 'TR33' });
    expect(Object.keys(p).sort()).toEqual(['code', 'errorName', 'phase', 'reason']);
  });
});
