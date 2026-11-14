import { LazyToaster as Toaster } from '@greenscape/ui/components/lazy-toaster';
import { TooltipProvider } from '@greenscape/ui/components/tooltip';
import { fontVariables } from '@greenscape/ui/fonts';
import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Greenscape Admin', template: '%s · Greenscape Admin' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#f5f8f5', colorScheme: 'light' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // render per request: the CSP nonce (proxy.ts) is new on every request
  return (
    <html lang="en" data-theme="admin" className={fontVariables}>
      <body>
        <TooltipProvider delayDuration={800}>
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
