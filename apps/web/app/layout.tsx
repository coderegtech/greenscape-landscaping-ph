import { Toaster } from '@greenscape/ui/components/sonner';
import { TooltipProvider } from '@greenscape/ui/components/tooltip';
import { fontVariables } from '@greenscape/ui/fonts';
import { SiteFooter } from '@greenscape/ui/layout/site-footer';
import { SiteHeader } from '@greenscape/ui/layout/site-header';
import { JS_FLAG_SCRIPT } from '@greenscape/ui/motion/reveal';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { contact, footerColumns, mainNav, socials } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_URL ?? 'http://localhost:3000'),
  title: { default: 'Greenscape Landscaping Services | Palawan', template: '%s | Greenscape Palawan' },
  description: 'Garden design, landscaping, garden maintenance and plants in Puerto Princesa, Palawan.',
};

export const viewport: Viewport = { themeColor: '#14280f', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG_SCRIPT }} />
      </head>
      <body>
        <TooltipProvider delayDuration={800}>
          <SiteHeader items={mainNav} />
          {children}
          <SiteFooter
            columns={footerColumns}
            contact={contact}
            socials={socials}
            legal={<>© {new Date().getFullYear()} Greenscape Palawan</>}
            credits={<Link href="/privacy" className="text-muted">Privacy notice</Link>}
          />
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
