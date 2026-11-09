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

/** Minimal, accessible HTML email: brand green header, readable body, every value escaped. */
export function emailHtml(title: string, paragraphs: string[], rows: [string, string][] = [], cta?: { label: string; href: string }) {
  const table = rows.length
    ? `<table role="presentation" style="border-collapse:collapse;margin:16px 0;width:100%">${rows
        .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#4b5d45;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#14280f;white-space:pre-wrap">${esc(v)}</td></tr>`)
        .join('')}</table>`
    : '';
  const button = cta ? `<p style="margin:24px 0"><a href="${esc(cta.href)}" style="background:#163d08;color:#f3eedf;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">${esc(cta.label)}</a></p>` : '';
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f6f3ea;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#14280f">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-family:Georgia,serif;font-size:22px;color:#163d08;margin:0 0 24px">Greenscape</p>
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join('')}${table}${button}
<p style="margin:32px 0 0;color:#4b5d45;font-size:13px">Greenscape Landscaping Services, Tian Suy Go, San Jose, Puerto Princesa City, Palawan. 0917 844 3330</p>
</div></body></html>`;
}

export function emailText(title: string, paragraphs: string[], rows: [string, string][] = [], cta?: { label: string; href: string }) {
  return [title, '', ...paragraphs, '', ...rows.map(([k, v]) => `${k}: ${v}`), ...(cta ? ['', `${cta.label}: ${cta.href}`] : [])].join('\n');
}
