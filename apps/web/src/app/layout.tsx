import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_JP } from 'next/font/google'
import { ThemeProvider } from '@school/ui/theme-provider'
import { AnalyticsIdentify } from '@/components/analytics/analytics-identify'
import { BlockedClickTracker } from '@/components/analytics/blocked-click-tracker'
import { WebVitals } from '@/components/analytics/web-vitals'
import { PostHogProvider } from '@/components/analytics/posthog-provider'
import {
  BRAND_DESCRIPTION,
  BRAND_NAME,
  BRAND_TAGLINE,
} from '@/lib/constants/branding'
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://school.vercel.app'
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})
const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: `${BRAND_NAME} | ${BRAND_TAGLINE}`,
    template: `%s | ${BRAND_NAME}`,
  },
  description: BRAND_DESCRIPTION,
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: `${BRAND_NAME} | ${BRAND_TAGLINE}`,
    description: BRAND_DESCRIPTION,
    url: siteUrl,
    siteName: BRAND_NAME,
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} | ${BRAND_TAGLINE}`,
    description: BRAND_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${notoSansJP.variable} antialiased`}>
        <ThemeProvider>
          <PostHogProvider />
          <AnalyticsIdentify />
          <BlockedClickTracker />
          <WebVitals />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
