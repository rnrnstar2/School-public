import Link from 'next/link'
import { FileCheck2 } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { ResourceTable } from '@/components/admin/resource-table'
import { getLessonAnchors } from '@/lib/admin-data'

export default async function AnchorsPage() {
  const anchors = await getLessonAnchors()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Lesson Model"
        title="Anchor Flows"
        description="Ordered atom flows per persona. This view is read-only until editor support is introduced."
        actions={
          <Link
            href="/admin/atom-versions"
            className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
          >
            Review atom versions
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <FileCheck2 className="h-5 w-5 text-amber-700" />
          <p className="mt-4 text-2xl font-semibold text-slate-950">{anchors.length}</p>
          <p className="mt-1 text-sm text-slate-600">Anchor definitions</p>
        </article>
      </div>

      <ResourceTable
        columns={['Anchor', 'Persona', 'Ordered Atoms', 'Required Capabilities']}
        rows={anchors.map((anchor) => [
          <div key={`${anchor.anchor_id}-anchor`} className="space-y-1">
            <p className="font-semibold text-slate-900">{anchor.anchor_id}</p>
            <p className="text-sm text-slate-600">
              {anchor.description || 'No description'}
            </p>
          </div>,
          <p key={`${anchor.anchor_id}-persona`} className="text-sm text-slate-700">
            {anchor.persona_id}
          </p>,
          <div key={`${anchor.anchor_id}-ordered`} className="space-y-1 text-sm text-slate-600">
            <p>{anchor.ordered_atom_ids.length} atoms</p>
            <p>{anchor.ordered_atom_ids.slice(0, 4).join(', ') || 'No atoms'}</p>
          </div>,
          <div key={`${anchor.anchor_id}-required`} className="space-y-1 text-sm text-slate-600">
            <p>{anchor.required_capabilities.length} capabilities</p>
            <p>{anchor.required_capabilities.slice(0, 4).join(', ') || 'No capabilities'}</p>
          </div>,
        ])}
        emptyTitle="No anchors cached yet"
        emptyDescription="Anchor flows will appear here after lesson atom and persona imports are synced from Git."
      />
    </div>
  )
}
