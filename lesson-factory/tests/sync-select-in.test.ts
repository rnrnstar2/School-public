import type { PostgrestError } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { selectIn } from '../src/sync/repository.js'

type SelectResponse<TRow> = {
  data: TRow[] | null
  error: PostgrestError | null
}

type SelectInClient = Parameters<typeof selectIn>[0]

function createMockClient<TRow>(responses: Array<SelectResponse<TRow>>): {
  client: SelectInClient
  fromMock: ReturnType<typeof vi.fn>
  selectMock: ReturnType<typeof vi.fn>
  inMock: ReturnType<typeof vi.fn>
} {
  const inMock = vi.fn<(filterColumn: string, ids: string[]) => Promise<SelectResponse<TRow>>>()
  for (const response of responses) {
    inMock.mockResolvedValueOnce(response)
  }

  const selectMock = vi.fn<(selectClause: string) => { in: typeof inMock }>(() => ({
    in: inMock,
  }))
  const fromMock = vi.fn<(table: string) => { select: typeof selectMock }>(() => ({
    select: selectMock,
  }))

  return {
    client: { from: fromMock } as unknown as SelectInClient,
    fromMock,
    selectMock,
    inMock,
  }
}

describe('selectIn', () => {
  it('batches .in() calls, concatenates rows, and stops after the first batch error', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `atom-${index}`)
    const allRows = ids.map((id) => ({ atom_id: id }))

    const successMocks = createMockClient([
      { data: allRows.slice(0, 100), error: null },
      { data: allRows.slice(100, 200), error: null },
      { data: allRows.slice(200), error: null },
    ])

    const successResult = await selectIn<{ atom_id: string }>(
      successMocks.client,
      'lesson_atom_versions',
      'atom_id',
      'atom_id',
      ids,
      100,
    )

    expect(successResult).toEqual({ data: allRows, error: null })
    expect(successMocks.inMock).toHaveBeenCalledTimes(3)
    expect(successMocks.inMock).toHaveBeenNthCalledWith(1, 'atom_id', ids.slice(0, 100))
    expect(successMocks.inMock).toHaveBeenNthCalledWith(2, 'atom_id', ids.slice(100, 200))
    expect(successMocks.inMock).toHaveBeenNthCalledWith(3, 'atom_id', ids.slice(200))

    const batchError = Object.assign(new Error('Bad Request'), {
      code: '400',
      details: 'request URL too long',
      hint: '',
    }) as PostgrestError
    const failureMocks = createMockClient([
      { data: allRows.slice(0, 100), error: null },
      { data: null, error: batchError },
      { data: allRows.slice(200), error: null },
    ])

    const failureResult = await selectIn<{ atom_id: string }>(
      failureMocks.client,
      'lesson_atom_versions',
      'atom_id',
      'atom_id',
      ids,
      100,
    )

    expect(failureResult).toEqual({ data: [], error: batchError })
    expect(failureMocks.inMock).toHaveBeenCalledTimes(2)
  })
})
