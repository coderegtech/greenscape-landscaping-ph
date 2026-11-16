import nodemailer from 'nodemailer';
import type { Logger } from './logger.ts';

export interface Mail {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

/**
 * SMTP mailer. Without SMTP_URL it logs instead of sending (so a missing mail server never breaks a form).
 * Sending never throws to the caller: a failed email is logged and reported to Sentry by the logger, the
 * submission itself is already stored.
 */
export function createMailer(smtpUrl: string | undefined, from: string, log: Logger) {
  const transport = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
  return {
    async send(mail: Mail) {
      const to = [mail.to].flat().filter(Boolean);
      if (!to.length) return false;
      if (!transport) {
        log.info({ to, subject: mail.subject }, 'mail (not sent: SMTP_URL unset)');
        return false;
      }
      try {
        await transport.sendMail({ from, to, subject: mail.subject, text: mail.text, html: mail.html, replyTo: mail.replyTo });
        return true;
      } catch (err) {
        log.error({ err, to, subject: mail.subject }, 'mail send failed');
        return false;
      }
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * The one HTML email every notification uses: green header, white card, details panel, button, footer.
 * Tables and inline styles only (Gmail and Outlook drop most layout CSS); colours follow the site theme; every value escaped.
 */
export function emailHtml(title: string, paragraphs: string[], rows: [string, string][] = [], cta?: { label: string; href: string }) {
  const cell = (i: number) => `padding:12px 16px;vertical-align:top;font-size:14px;line-height:1.5;${i ? 'border-top:1px solid #e5ebe3;' : ''}`;
  const table = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:#f8faf7;border:1px solid #e5ebe3;border-radius:10px">${rows
        .map(([k, v], i) => `<tr><td style="${cell(i)}color:#6b756d;white-space:nowrap">${esc(k)}</td><td style="${cell(i)}color:#202820;font-weight:bold;white-space:pre-wrap">${esc(v)}</td></tr>`)
        .join('')}</table>`
    : '';
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0"><tr><td bgcolor="#315c3b" style="border-radius:999px"><a href="${esc(cta.href)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:999px">${esc(cta.label)}</a></td></tr></table>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f8faf7;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#3a453c">
<div style="display:none;max-height:0;overflow:hidden">${esc(paragraphs[0] ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5ebe3;border-radius:14px;overflow:hidden">
<tr><td bgcolor="#315c3b" style="padding:22px 28px;border-bottom:4px solid #c9e64a">
<p style="margin:0;font-family:Georgia,serif;font-size:24px;line-height:1.2;color:#ffffff">Greenscape</p>
<p style="margin:4px 0 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#d5e3d3">Landscaping Services, Palawan</p>
</td></tr>
<tr><td style="padding:32px 28px">
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:normal;font-size:26px;line-height:1.25;color:#202820">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;white-space:pre-wrap">${esc(p)}</p>`).join('')}${table}${button}
</td></tr>
<tr><td style="padding:20px 28px;background:#f8faf7;border-top:1px solid #e5ebe3;font-size:13px;line-height:1.6;color:#6b756d">
<strong style="color:#3a453c">Greenscape Landscaping Services</strong><br>Tian Suy Go, San Jose, Puerto Princesa City, Palawan<br>0917 844 3330
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function emailText(title: string, paragraphs: string[], rows: [string, string][] = [], cta?: { label: string; href: string }) {
  return [title, '', ...paragraphs, '', ...rows.map(([k, v]) => `${k}: ${v}`), ...(cta ? ['', `${cta.label}: ${cta.href}`] : [])].join('\n');
}
