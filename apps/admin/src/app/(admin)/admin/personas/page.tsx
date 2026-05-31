import { LibraryBig } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { ResourceTable } from '@/components/admin/resource-table'
import { getPersonas } from '@/lib/admin-data'
import { formatDate } from '@/lib/format'

export default async function PersonasPage() {
  const personas = await getPersonas()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Lesson Model"
        title="Personas"
        description="Read-only persona snapshots used to anchor lesson sequencing and future personalization."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <LibraryBig className="h-5 w-5 text-emerald-700" />
          <p className="mt-4 text-2xl font-semibold text-slate-950">{personas.length}</p>
          <p className="mt-1 text-sm text-slate-600">Imported personas</p>
        </article>
      </div>

      <ResourceTable
        columns={['Persona', 'Current Version', 'Source']}
        rows={personas.map((persona) => [
          <div key={`${persona.persona_id}-persona`} id={persona.persona_id} className="space-y-1 scroll-mt-24">
            <p className="font-semibold text-slate-900">{persona.persona_id}</p>
            <p className="text-sm text-slate-600">
              Updated {formatDate(persona.updated_at)}
            </p>
          </div>,
          <p key={`${persona.persona_id}-version`} className="text-sm text-slate-600">
            {persona.current_version?.imported_at
              ? formatDate(persona.current_version.imported_at)
              : 'No current version'}
          </p>,
          <p key={`${persona.persona_id}-source`} className="text-sm text-slate-700">
            {persona.source_path}
          </p>,
        ])}
        emptyTitle="No personas cached yet"
        emptyDescription="Persona YAML imports will appear here after the Supabase sync pipeline runs."
      />
    </div>
  )
}
