import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

export function parseEmailSender(value: string): { email: string; name?: string } {
  const formatted = value.trim().match(/^(.+?)\s*<([^<>]+)>$/);
  const name = formatted?.[1].trim().replace(/^"(.*)"$/, '$1');
  const email = (formatted?.[2] ?? value).trim();

  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
    throw new Error('Email sender configuration is invalid');
  }

  return name ? { email, name } : { email };
}

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  async send(to: string, kind: 'VERIFY' | 'RESET', token: string) {
    const path =
      kind === 'VERIFY' ? '/auth/verify-email' : '/auth/reset-password';
    const link = `${this.config.getOrThrow<string>('FRONTEND_URL')}${path}#token=${token}`;
    try {
      const result = await fetch(BREVO_SEND_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          accept: 'application/json',
          'api-key': this.config.getOrThrow<string>('BREVO_API_KEY'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: parseEmailSender(this.config.getOrThrow<string>('EMAIL_FROM')),
          to: [{ email: to }],
          subject:
            kind === 'VERIFY'
              ? 'Verificá tu email en Falta Gente'
              : 'Restablecé tu contraseña',
          textContent: `Para continuar, abrí este enlace: ${link}. Si no solicitaste esta acción, ignorá este mensaje.`,
        }),
      });
      if (!result.ok) throw new Error('Email delivery unavailable');
    } catch {
      throw new Error('Email delivery unavailable');
    }
  }
}
