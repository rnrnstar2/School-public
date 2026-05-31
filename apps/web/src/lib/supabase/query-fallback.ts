type SupabaseErrorLike =
  | {
      message?: string | null
      details?: string | null
      hint?: string | null
      code?: string | null
    }
  | string
  | null
  | undefined

export function getSupabaseErrorMessage(error: SupabaseErrorLike) {
  if (!error) {
    return ''
  }

  if (typeof error === 'string') {
    return error
  }

  return [error.message, error.details, error.hint].filter(Boolean).join(' ').trim()
}

function normalizeErrorMessage(error: SupabaseErrorLike) {
  return getSupabaseErrorMessage(error).toLowerCase()
}

export function isMissingSupabaseTableError(error: SupabaseErrorLike, tableName: string) {
  const message = normalizeErrorMessage(error)
  const normalizedTable = tableName.toLowerCase()

  return (
    message.includes(`could not find the table 'public.${normalizedTable}'`) ||
    message.includes(`relation "public.${normalizedTable}" does not exist`) ||
    message.includes(`relation "${normalizedTable}" does not exist`)
  )
}

export function isMissingSupabaseColumnError(
  error: SupabaseErrorLike,
  columnName: string,
  tableName?: string,
) {
  const message = normalizeErrorMessage(error)
  const normalizedColumn = columnName.toLowerCase()
  const normalizedTable = tableName?.toLowerCase()

  if (normalizedTable) {
    return (
      message.includes(`could not find the '${normalizedColumn}' column of '${normalizedTable}'`) ||
      message.includes(`column ${normalizedTable}.${normalizedColumn} does not exist`) ||
      message.includes(`column "${normalizedColumn}" does not exist`)
    )
  }

  return message.includes(`column "${normalizedColumn}" does not exist`)
}

export function isSupabaseRelationshipCacheError(
  error: SupabaseErrorLike,
  fromTable: string,
  toTable: string,
) {
  const message = normalizeErrorMessage(error)

  return (
    message.includes('schema cache') &&
    message.includes(fromTable.toLowerCase()) &&
    message.includes(toTable.toLowerCase())
  )
}
