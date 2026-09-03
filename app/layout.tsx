import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'], display: 'swap' });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'WebMCPify — give any website an agent interface',
  description:
    'Paste a URL. Get a version of that site that agents can use — same UI, real WebMCP tools.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-brand-fg"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-20 border-b bg-bg/85 backdrop-blur-md">
          <nav className="mx-auto flex w-full max-w-6xl items-center gap-5 px-4 py-3 text-sm">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-fg">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-brand text-brand-fg" aria-hidden>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m8 6 6 6-6 6" />
                  <path d="M17 18h2" />
                </svg>
              </span>
              WebMCPify
            </Link>
            <Link href="/sites/demo" className="py-1.5 text-fg-muted transition-colors hover:text-fg">
              Demo
            </Link>
            <a
              href="https://github.com/dineshisdev/WebMCPify"
              target="_blank"
              rel="noreferrer"
              className="ml-auto py-1.5 text-fg-muted transition-colors hover:text-fg"
            >
              GitHub
            </a>
          </nav>
        </header>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
        <footer className="mt-auto border-t py-6 text-center text-xs text-fg-subtle">
          Built for the OpenAI WebMCP Challenge 2026
        </footer>
      </body>
    </html>
  );
}
