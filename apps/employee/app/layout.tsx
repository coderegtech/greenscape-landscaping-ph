import { LazyToaster as Toaster } from '@greenscape/ui/components/lazy-toaster';
import { fontVariables } from '@greenscape/ui/fonts';
import { NotificationsProvider } from '@greenscape/ui/notifications/provider';
import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Greenscape Employee Portal', template: '%s · Greenscape Employees' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#f7faf7', colorScheme: 'light' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // render per request: the CSP nonce (proxy.ts) is new on every request
  return (
    <html lang="en" data-theme="employee" className={fontVariables}>
      <body>
        <NotificationsProvider app="employee" apiUrl={process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}>
          {children}
        </NotificationsProvider>
        <Toaster />
      </body>
    </html>
  );
}
