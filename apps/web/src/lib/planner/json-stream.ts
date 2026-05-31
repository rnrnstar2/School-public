export function extractJsonCandidate(rawText: string) {
  const startIndex = rawText.indexOf('{')

  if (startIndex < 0) {
    return rawText
  }

  let depth = 0
  let inString = false
  let escaping = false

  for (let index = startIndex; index < rawText.length; index += 1) {
    const char = rawText[index]

    if (inString) {
      if (escaping) {
        escaping = false
        continue
      }

      if (char === '\\') {
        escaping = true
        continue
      }

      if (char === '"') {
        inString = false
      }

      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1

      if (depth === 0) {
        return rawText.slice(startIndex, index + 1)
      }
    }
  }

  return rawText
}

export function decodePartialJsonString(rawValue: string) {
  let candidate = rawValue

  while (candidate.length > 0) {
    try {
      return JSON.parse(`"${candidate}"`) as string
    } catch {
      candidate = candidate.slice(0, -1)
    }
  }

  return ''
}

export function extractStreamingJsonFieldPreview(rawText: string, fieldNames: string[]) {
  for (const fieldName of fieldNames) {
    const marker = `"${fieldName}"`
    const markerIndex = rawText.indexOf(marker)

    if (markerIndex < 0) {
      continue
    }

    let index = markerIndex + marker.length

    while (index < rawText.length && /\s/.test(rawText[index] ?? '')) {
      index += 1
    }

    if (rawText[index] !== ':') {
      continue
    }

    index += 1

    while (index < rawText.length && /\s/.test(rawText[index] ?? '')) {
      index += 1
    }

    if (rawText[index] !== '"') {
      continue
    }

    index += 1
    let escaped = false
    let value = ''

    for (; index < rawText.length; index += 1) {
      const char = rawText[index]

      if (escaped) {
        value += `\\${char}`
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === '"') {
        return decodePartialJsonString(value)
      }

      value += char
    }

    if (escaped) {
      value = value.slice(0, -1)
    }

    return decodePartialJsonString(value)
  }

  return ''
}
