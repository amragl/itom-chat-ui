import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppLayout } from '@/components/layout';
import { AuthSessionProvider } from '@/components/providers';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ITOM Chat',
  description: 'Conversational interface for ITOM agents',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <AuthSessionProvider>
          <AppLayout>{children}</AppLayout>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
