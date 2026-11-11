import { LazyToaster as Toaster } from '@greenscape/ui/components/lazy-toaster';
import { fontVariables } from '@greenscape/ui/fonts';
import { SiteFooter } from '@greenscape/ui/layout/site-footer';
import { SiteHeader } from '@greenscape/ui/layout/site-header';
import { JS_FLAG_SCRIPT } from '@greenscape/ui/motion/reveal';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { CursorFollower } from '@/components/cursor';
import { Accents } from '@/components/decorations/accents';
import { AuthProvider } from '@/components/auth/auth-context';
import { ChatLauncher } from '@/components/chat/chat-launcher';
import { draftMode } from 'next/headers';
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

export const viewport: Viewport = { themeColor: '#ffffff', colorScheme: 'light' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [site, preview] = await Promise.all([cms.site(), draftMode().then((d) => d.isEnabled)]);
  const c = site?.config;
  return (
    <html lang="en" className={fontVariables} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          {preview && (
            <div role="status" className="band-cream sticky top-0 z-[400] flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm">
              <strong>Preview:</strong> you are seeing unpublished drafts.
              <a href="/api/preview/exit" className="font-bold">Exit preview</a>
            </div>
          )}
          <SiteHeader items={site?.nav.main ?? []} cartCountUrl="/api/cart/count" />
          {children}
          <SiteFooter
            decor={<Accents set="footer" />}
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
          <CursorFollower />
          <Toaster />
          <ChatLauncher />
        </AuthProvider>
      </body>
    </html>
  );
}
