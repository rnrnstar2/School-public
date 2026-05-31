'use client'

import { Button } from '@school/ui/button'
import { useFormStatus } from 'react-dom'

export function SubmitButton({
  idleLabel,
  pendingLabel,
}: {
  idleLabel: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-auto rounded-full px-5 py-3 text-sm font-semibold"
    >
      {pending ? pendingLabel : idleLabel}
    </Button>
  )
}
