import { LazyToaster as Toaster } from '@greenscape/ui/components/lazy-toaster';
import { fontVariables } from '@greenscape/ui/fonts';
import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Greenscape Employee Portal', template: '%s · Greenscape Employees' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#ffffff', colorScheme: 'light' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // render per request: the CSP nonce (proxy.ts) is new on every request
  return (
    <html lang="en" className={fontVariables}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
