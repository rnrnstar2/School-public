'use client'

import type { AtomListViewModel } from '@/lib/atoms/atom-view-model'
import { AtomsBrowserGrid, buildAtomsBrowserMeta } from './atoms-browser-grid'
import { AtomsBrowserShell } from './atoms-browser-shell'

export function AtomsBrowser({ atoms }: { atoms: AtomListViewModel[] }) {
  return (
    <AtomsBrowserShell initialMeta={buildAtomsBrowserMeta(atoms)}>
      <AtomsBrowserGrid atoms={atoms} />
    </AtomsBrowserShell>
  )
}
