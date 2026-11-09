import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_URL ?? 'http://localhost:3000'),
  title: { default: 'Greenscape Landscaping Services | Palawan', template: '%s | Greenscape Palawan' },
  description: 'Garden design, landscaping, garden maintenance and plants in Puerto Princesa, Palawan.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
