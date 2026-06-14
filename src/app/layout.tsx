import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layout/Navbar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Fahi Video Downloader & Editing',
  description:
    'Download YouTube videos and edit videos & images for free. No signup required.',
  keywords: ['youtube downloader', 'video editor', 'image editor', 'free', 'online'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased bg-background text-foreground`}>
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <footer className="border-t border-border mt-16 py-8 text-center text-muted-foreground text-sm">
          <p>
            © 2024 <span className="text-accent font-semibold">Fahi Video</span> — Free forever
          </p>
          <p className="mt-1 text-xs opacity-60">
            For personal use only. Respect copyright laws.
          </p>
        </footer>
      </body>
    </html>
  );
}
