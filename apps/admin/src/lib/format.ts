function parseDate(value: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date
}

export function formatDate(value: string | null) {
  const date = parseDate(value)

  if (!date) {
    return 'No due date'
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function formatDateForInput(value: string | null) {
  const date = parseDate(value)

  if (!date) {
    return ''
  }

  return date.toISOString().slice(0, 16)
}
