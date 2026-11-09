import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Greenscape Admin', template: '%s · Greenscape Admin' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-50">{children}</body>
    </html>
  );
}
