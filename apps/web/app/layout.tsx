import { Toaster } from '@greenscape/ui/components/sonner';
import { TooltipProvider } from '@greenscape/ui/components/tooltip';
import { fontVariables } from '@greenscape/ui/fonts';
import { SiteFooter } from '@greenscape/ui/layout/site-footer';
import { SiteHeader } from '@greenscape/ui/layout/site-header';
import { JS_FLAG_SCRIPT } from '@greenscape/ui/motion/reveal';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { cms } from '@/lib/cms';
import './globals.css';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

export async function generateMetadata(): Promise<Metadata> {
  const site = await cms.site();
  const seo = site?.config ? { title: 'Greenscape Landscaping Services | Palawan', description: 'Garden design, landscaping, garden maintenance and plants in Puerto Princesa, Palawan.' } : {};
  return {
    metadataBase: new URL(WEB_URL),
    title: { default: seo.title ?? 'Greenscape Palawan', template: '%s | Greenscape Palawan' },
    description: seo.description,
    openGraph: { siteName: 'Greenscape Landscaping Services', locale: 'en_PH', type: 'website' },
    alternates: { canonical: './' },
  };
}

export const viewport: Viewport = { themeColor: '#14280f', colorScheme: 'dark' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await cms.site();
  const c = site?.config;
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG_SCRIPT }} />
      </head>
      <body>
        <TooltipProvider delayDuration={800}>
          <SiteHeader items={site?.nav.main ?? []} />
          {children}
          <SiteFooter
            columns={(site?.nav.footer ?? []).map((n) => ({ title: n.label, links: n.children ?? [] }))}
            contact={{ address: c?.address, phone: c?.phone, email: c?.email, hours: c?.hours }}
            socials={[
              ...(c?.socials.facebook ? [{ label: 'Facebook', href: c.socials.facebook }] : []),
              ...(c?.socials.instagram ? [{ label: 'Instagram', href: c.socials.instagram }] : []),
            ]}
            legal={<>© {new Date().getFullYear()} Greenscape Palawan</>}
            credits={
              <Link href="/privacy" className="text-muted">
                Privacy notice
              </Link>
            }
          />
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
