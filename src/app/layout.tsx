import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Under CLIP Factory — AI Video Clip Engine',
  description:
    'Extrae clips verticales con subtítulos dinámicos de vídeos largos usando IA. Procesamiento local ultra-optimizado.',
  keywords: ['video clips', 'subtitles', 'AI', 'vertical video', 'short form content'],
  authors: [{ name: 'Under_CLIP_FACTORY' }],
  openGraph: {
    title: 'Under CLIP Factory',
    description: 'AI-powered vertical clip extraction engine',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-surface-900 text-gray-100 min-h-screen`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
