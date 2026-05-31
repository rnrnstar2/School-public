'use client'

export default function GoalsError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="mx-auto flex w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="w-full rounded-[28px] border border-rose-200 bg-rose-50/80 p-6 dark:border-rose-900/60 dark:bg-rose-950/30">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-200">
            Error
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            goal tree を読み込めませんでした
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            ゴールツリーの読み込みに失敗しました。時間をおいてお試しください。
          </p>
          {props.error.digest && (
            <p className="mt-2 text-xs text-muted-foreground/80">
              エラーID: {props.error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={props.reset}
            className="touch-target mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            再読み込み
          </button>
        </div>
      </div>
    </div>
  )
}
