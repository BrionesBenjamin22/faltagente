import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service.js';

describe('transactional email identity', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses Falta Gente in verification emails and preserves the verification link', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', transport);
    const service = new EmailService(new ConfigService({
      FRONTEND_URL: 'https://app.falta-gente.test',
      RESEND_API_KEY: 'test-only-key',
      EMAIL_FROM: 'Falta Gente <noreply@example.test>',
    }));

    await service.send('player@example.test', 'VERIFY', 'test-only-token');

    const payload = JSON.parse(transport.mock.calls[0][1].body);
    expect(payload.subject).toBe('Verificá tu email en Falta Gente');
    expect(payload.text).toContain('https://app.falta-gente.test/auth/verify-email#token=test-only-token');
    expect(payload.to).toEqual(['player@example.test']);
  });
});
