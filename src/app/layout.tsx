import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SoleIndex — sneaker resale market intelligence',
    template: '%s · SoleIndex',
  },
  description:
    'Track resale prices, supply and trend momentum across 240 sneaker silhouettes: interactive dashboards, colourway and material trend radar, analyst observations and market reports.',
  applicationName: 'SoleIndex',
  keywords: [
    'sneaker resale',
    'market intelligence',
    'price history',
    'trend analysis',
    'analytics dashboard',
  ],
};

export const viewport = {
  themeColor: '#08090b',
  colorScheme: 'dark' as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
