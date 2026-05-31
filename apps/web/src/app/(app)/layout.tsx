import Header from '@/components/navigation/header'
import { OfflineBanner } from '@school/ui/offline-banner'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        メインコンテンツへスキップ
      </a>
      <OfflineBanner />
      <Header />
      <main id="main-content" className="pt-16">{children}</main>
    </>
  )
}
