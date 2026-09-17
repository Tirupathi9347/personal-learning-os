import type { Metadata } from 'next';
import { Manrope, Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/theme-provider';
// CRITICAL ARCHITECTURAL SAFEGUARD:
// globals.css MUST be imported here in the root layout.
// All sub-layouts and dashboard routes inherit the global Tailwind, CSS variables, and design tokens from this root.
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['monospace'],
});

export const metadata: Metadata = {
  title: 'Personal Learning OS - Executive Command Center',
  description: 'Private single-user intelligent learning & knowledge operating system',
};

const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('theme');
      var darkQuery = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (saved === 'dark' || (!saved && darkQuery)) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`light ${manrope.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning className="bg-[var(--exec-bg)] text-[var(--exec-text)] font-sans min-h-screen antialiased selection:bg-sky-500/20 selection:text-sky-400">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
