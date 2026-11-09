import { LazyToaster as Toaster } from '@greenscape/ui/components/lazy-toaster';
import { TooltipProvider } from '@greenscape/ui/components/tooltip';
import { fontVariables } from '@greenscape/ui/fonts';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Greenscape Admin', template: '%s · Greenscape Admin' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#f6f3ea', colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
