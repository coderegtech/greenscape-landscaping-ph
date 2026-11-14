import { LazyToaster as Toaster } from '@greenscape/ui/components/lazy-toaster';
import { TooltipProvider } from '@greenscape/ui/components/tooltip';
import { fontVariables } from '@greenscape/ui/fonts';
import { PWA } from '@greenscape/ui/pwa/app';
import { OfflineBanner, PwaRegistration } from '@greenscape/ui/pwa/client';
import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Greenscape Admin', template: '%s · Greenscape Admin' },
  applicationName: PWA.admin.name,
  // iOS: opens from the Home Screen without browser bars, under its own name.
  appleWebApp: { capable: true, title: PWA.admin.shortName, statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: PWA.admin.theme, colorScheme: 'light', viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // render per request: the CSP nonce (proxy.ts) is new on every request
  return (
    <html lang="en" data-theme="admin" className={fontVariables}>
      <body>
        <TooltipProvider delayDuration={800}>
          {children}
          <Toaster />
          <OfflineBanner>Changes cannot be saved until you are back online.</OfflineBanner>
          <PwaRegistration />
        </TooltipProvider>
      </body>
    </html>
  );
}
