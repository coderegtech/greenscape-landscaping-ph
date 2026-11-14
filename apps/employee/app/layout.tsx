import { LazyToaster as Toaster } from '@greenscape/ui/components/lazy-toaster';
import { fontVariables } from '@greenscape/ui/fonts';
import { NotificationsProvider } from '@greenscape/ui/notifications/provider';
import { PWA } from '@greenscape/ui/pwa/app';
import { OfflineBanner, PwaRegistration } from '@greenscape/ui/pwa/client';
import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Greenscape Employee Portal', template: '%s · Greenscape Employees' },
  applicationName: PWA.employee.name,
  // iOS: opens from the Home Screen without browser bars, under its own name.
  appleWebApp: { capable: true, title: PWA.employee.shortName, statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: PWA.employee.theme, colorScheme: 'light', viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // render per request: the CSP nonce (proxy.ts) is new on every request
  return (
    <html lang="en" data-theme="employee" className={fontVariables}>
      <body>
        <NotificationsProvider app="employee" apiUrl={process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}>
          {children}
        </NotificationsProvider>
        <Toaster />
        <OfflineBanner>Internet connection is required to record attendance.</OfflineBanner>
        <PwaRegistration />
      </body>
    </html>
  );
}
