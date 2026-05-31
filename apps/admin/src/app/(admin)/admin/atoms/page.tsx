import { BookOpen } from 'lucide-react'

import { PageHeader } from '@/components/admin/page-header'
import { ResourceTable } from '@/components/admin/resource-table'
import { getLessonAtoms } from '@/lib/admin-data'
import { formatDate } from '@/lib/format'

export default async function AtomsPage() {
  const atoms = await getLessonAtoms()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Lesson Model"
        title="Lesson Atoms"
        description="Read-only cache of atom records synced from Git. This surface is for inspection only until the sync pipeline lands."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
          <BookOpen className="h-5 w-5 text-cyan-700" />
          <p className="mt-4 text-2xl font-semibold text-slate-950">{atoms.length}</p>
          <p className="mt-1 text-sm text-slate-600">Cached atoms</p>
        </article>
      </div>

      <ResourceTable
        columns={['Atom', 'Version', 'Capabilities', 'Source']}
        rows={atoms.map((atom) => [
          <div key={`${atom.atom_id}-atom`} id={atom.atom_id} className="space-y-1 scroll-mt-24">
            <p className="font-semibold text-slate-900">{atom.atom_id}</p>
            <p className="text-sm text-slate-600">
              Updated {formatDate(atom.updated_at)}
            </p>
          </div>,
          <div key={`${atom.atom_id}-version`} className="space-y-1 text-sm text-slate-600">
            <p>Status: {atom.current_version?.status ?? 'No current version'}</p>
            <p>
              Imported: {atom.current_version?.imported_at ? formatDate(atom.current_version.imported_at) : 'n/a'}
            </p>
          </div>,
          <div key={`${atom.atom_id}-capabilities`} className="space-y-1 text-sm text-slate-600">
            {atom.capabilities.length > 0 ? (
              atom.capabilities.map((capability) => (
                <p key={`${atom.atom_id}-${capability.direction}-${capability.capability}`}>
                  {capability.direction}: {capability.capability}
                </p>
              ))
            ) : (
              <p>No capabilities</p>
            )}
          </div>,
          <p key={`${atom.atom_id}-source`} className="text-sm text-slate-700">
            {atom.source_path}
          </p>,
        ])}
        emptyTitle="No atom cache rows yet"
        emptyDescription="Run the lesson-factory sync in Phase 6 to populate lesson_atoms and related tables."
      />
    </div>
  )
}
