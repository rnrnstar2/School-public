'use client'

import {
  createContext,
  useContext,
  useDeferredValue,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { AtomListViewModel } from '@/lib/atoms/atom-view-model'

export type AtomStatusFilter = 'all' | AtomListViewModel['status']

/**
 * Content-type filter vocabulary for the `/lessons` UI selector.
 *
 * W62 / G3 #3: previous iterations exposed `video / text / interactive`
 * which do not appear anywhere in the live `media_slots` / `evidence` /
 * `deliverable.type` columns. Selecting any of them silently produced
 * zero matches and tripped the empty-state CTA. The values below are
 * sourced from a full DB scan (576 atoms): `media_slots = diagram (372)
 * / screen_capture (124) / icon (1)`. Adding more values should track
 * `media_slots` cardinality, not aspirational catalog plans.
 */
export type AtomContentTypeFilter = 'all' | 'diagram' | 'screen_capture' | 'icon'

export const ATOM_CONTENT_TYPE_OPTIONS: ReadonlyArray<{
  value: AtomContentTypeFilter
  label: string
}> = [
  { value: 'all', label: 'すべて' },
  { value: 'diagram', label: '図 (diagram)' },
  { value: 'screen_capture', label: '画面キャプチャ (screen_capture)' },
  { value: 'icon', label: 'アイコン (icon)' },
]

export type AtomsBrowserMeta = {
  personaOptions: string[]
  goalOptions: string[]
  totalCount: number | null
  filteredCount: number | null
}

type AtomsFilterContextValue = {
  searchQuery: string
  deferredSearchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  personaTag: string
  setPersonaTag: Dispatch<SetStateAction<string>>
  goalTag: string
  setGoalTag: Dispatch<SetStateAction<string>>
  status: AtomStatusFilter
  setStatus: Dispatch<SetStateAction<AtomStatusFilter>>
  contentType: AtomContentTypeFilter
  setContentType: Dispatch<SetStateAction<AtomContentTypeFilter>>
  browserMeta: AtomsBrowserMeta
  setBrowserMeta: Dispatch<SetStateAction<AtomsBrowserMeta>>
}

const EMPTY_BROWSER_META: AtomsBrowserMeta = {
  personaOptions: [],
  goalOptions: [],
  totalCount: null,
  filteredCount: null,
}

const AtomsFilterContext = createContext<AtomsFilterContextValue | null>(null)

export function AtomsFilterProvider({
  children,
  initialMeta,
}: {
  children: ReactNode
  initialMeta?: Partial<AtomsBrowserMeta>
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [personaTag, setPersonaTag] = useState('all')
  const [goalTag, setGoalTag] = useState('all')
  const [status, setStatus] = useState<AtomStatusFilter>('all')
  const [contentType, setContentType] = useState<AtomContentTypeFilter>('all')
  const [browserMeta, setBrowserMeta] = useState<AtomsBrowserMeta>({
    ...EMPTY_BROWSER_META,
    ...initialMeta,
    personaOptions: initialMeta?.personaOptions ?? EMPTY_BROWSER_META.personaOptions,
    goalOptions: initialMeta?.goalOptions ?? EMPTY_BROWSER_META.goalOptions,
  })
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const value = useMemo(
    () => ({
      searchQuery,
      deferredSearchQuery,
      setSearchQuery,
      personaTag,
      setPersonaTag,
      goalTag,
      setGoalTag,
      status,
      setStatus,
      contentType,
      setContentType,
      browserMeta,
      setBrowserMeta,
    }),
    [browserMeta, contentType, deferredSearchQuery, goalTag, personaTag, searchQuery, status],
  )

  return <AtomsFilterContext.Provider value={value}>{children}</AtomsFilterContext.Provider>
}

export function useAtomsFilterContext() {
  const context = useContext(AtomsFilterContext)

  if (!context) {
    throw new Error('useAtomsFilterContext must be used within AtomsFilterProvider')
  }

  return context
}
