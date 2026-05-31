import Link from 'next/link'

/**
 * Custom 404 page displayed when a route is not found.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold text-gray-500 dark:text-gray-700">404</p>
        <h1 className="mt-4 text-lg font-bold text-gray-800 dark:text-gray-200">
          ページが見つかりません
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-gray-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
        >
          トップページに戻る
        </Link>
      </div>
    </div>
  )
}
