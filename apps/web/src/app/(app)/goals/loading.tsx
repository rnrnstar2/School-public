export default function GoalsLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div aria-busy="true" className="space-y-6">
          <div className="h-4 w-24 rounded-full bg-muted" />
          <div className="h-8 w-48 rounded-full bg-muted" />
          <div className="rounded-[28px] border border-border bg-card/80 p-6 shadow-sm">
            <div className="h-4 w-24 rounded-full bg-muted" />
            <div className="mt-3 h-8 w-2/3 rounded-full bg-muted" />
            <div className="mt-6 space-y-3">
              <div className="h-28 rounded-2xl bg-muted/80" />
              <div className="h-28 rounded-2xl bg-muted/80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
