import { cn } from '../lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-slate-200/60 dark:bg-slate-700/40', className)}
      {...props}
    />
  )
}

export { Skeleton }
