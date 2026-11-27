import { ConfigService } from '@nestjs/config';
import { EmailService, parseEmailSender } from './email.service.js';

describe('Brevo transactional email', () => {
  afterEach(() => vi.unstubAllGlobals());

  const service = (emailFrom = 'Falta Gente <noreply@example.test>') =>
    new EmailService(
      new ConfigService({
        FRONTEND_URL: 'https://app.falta-gente.test',
        BREVO_API_KEY: 'test-only-key',
        EMAIL_FROM: emailFrom,
      }),
    );

  it('sends verification through the Brevo API with the expected payload and headers', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', transport);

    await service().send('player@example.test', 'VERIFY', 'test-only-token');

    expect(transport).toHaveBeenCalledOnce();
    const [url, request] = transport.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({
      accept: 'application/json',
      'api-key': 'test-only-key',
      'content-type': 'application/json',
    });
    const payload = JSON.parse(request.body);
    expect(payload.sender).toEqual({
      name: 'Falta Gente',
      email: 'noreply@example.test',
    });
    expect(payload.subject).toBe('Verificá tu email en Falta Gente');
    expect(payload.textContent).toContain(
      'https://app.falta-gente.test/auth/verify-email#token=test-only-token',
    );
    expect(payload.to).toEqual([{ email: 'player@example.test' }]);
    expect(payload).not.toHaveProperty('text');
  });

  it('keeps a simple EMAIL_FROM address compatible and sends reset emails', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', transport);

    await service('noreply@example.test').send(
      'player@example.test',
      'RESET',
      'reset-token',
    );

    const payload = JSON.parse(transport.mock.calls[0][1].body);
    expect(payload.sender).toEqual({ email: 'noreply@example.test' });
    expect(payload.subject).toBe('Restablecé tu contraseña');
    expect(payload.textContent).toContain(
      '/auth/reset-password#token=reset-token',
    );
  });

  it('parses a quoted display name and rejects a malformed sender', () => {
    expect(parseEmailSender('"Falta Gente" <noreply@example.test>')).toEqual({
      name: 'Falta Gente',
      email: 'noreply@example.test',
    });
    expect(() => parseEmailSender('not-an-email')).toThrow(
      'Email sender configuration is invalid',
    );
  });

  it('hides provider response details when Brevo rejects a request', async () => {
    const transport = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid secret test-only-key',
    });
    vi.stubGlobal('fetch', transport);

    await expect(
      service().send('player@example.test', 'VERIFY', 'token'),
    ).rejects.toThrow('Email delivery unavailable');
    await expect(
      service().send('player@example.test', 'VERIFY', 'token'),
    ).rejects.not.toThrow('test-only-key');
  });

  it('hides network errors and credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket test-only-key')));

    await expect(
      service().send('player@example.test', 'VERIFY', 'token'),
    ).rejects.toThrow('Email delivery unavailable');
    await expect(
      service().send('player@example.test', 'VERIFY', 'token'),
    ).rejects.not.toThrow('test-only-key');
  });
});
