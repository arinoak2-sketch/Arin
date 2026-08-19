import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  // The design system uses several weights of one family rather than a
  // display/body pairing — see docs/03-design-system.md.
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'Lumen — student opportunity intelligence',
    template: '%s · Lumen',
  },
  description:
    'Lumen finds scholarships, competitions, research programmes and more on the live web, works out what you are actually eligible for, and helps you finish the application before the deadline.',
  robots: {
    // Student pages are private by definition. Nothing under /dashboard,
    // /applications or /profile should ever reach a search index.
    index: true,
    follow: true,
    nocache: true,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0f0e' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ fontFamily: 'var(--font-inter), var(--font-sans)' }}>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  )
}
