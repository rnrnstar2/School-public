export interface JourneyPersona {
  id: string
  name?: string
  lane_color?: string
}

export interface JourneyNode {
  id: string
  label?: string
  describe?: string
  spec_file?: string
  parent?: string | null
  critical_path?: boolean
  db_mode?: string
  status?: string
  persona?: string | null
}

export interface JourneyManifest {
  version: string | number | null
  updated_at: string | null
  critical_path: string[]
  nodes: JourneyNode[]
  personas: JourneyPersona[]
}

type ManifestBucket = JourneyManifest['nodes'] | JourneyManifest['personas']

function parseScalar(value: string) {
  const trimmed = value.trim()

  if (trimmed === 'null') {
    return null
  }

  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed)
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

/** Fixed-schema parser for docs/swarmops/journey-manifest.yaml. */
export function parseManifest(text: string): JourneyManifest {
  const lines = text.replace(/\r/g, '').split('\n')
  const manifest: JourneyManifest = {
    version: null,
    updated_at: null,
    critical_path: [],
    nodes: [],
    personas: [],
  }

  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index] ?? ''
    const line = rawLine.replace(/#.*$/, '').trimEnd()

    if (!line.trim()) {
      index += 1
      continue
    }

    const topMatch = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!topMatch) {
      index += 1
      continue
    }

    const [, key, value = ''] = topMatch

    if (key === 'critical_path' && value === '') {
      index += 1
      while (index < lines.length) {
        const listLine = lines[index] ?? ''
        if (!listLine.trim() || /^\s*#/.test(listLine)) {
          index += 1
          continue
        }

        if (!/^\s+-\s/.test(listLine)) {
          break
        }

        manifest.critical_path.push(
          listLine.replace(/^\s*-\s*/, '').replace(/#.*$/, '').trim(),
        )
        index += 1
      }
      continue
    }

    if ((key === 'nodes' || key === 'personas') && value === '') {
      const bucket: ManifestBucket = key === 'nodes' ? manifest.nodes : manifest.personas
      index += 1
      let current: Record<string, unknown> | null = null

      while (index < lines.length) {
        const bucketLine = lines[index] ?? ''

        if (/^\s*-\s+id:/.test(bucketLine)) {
          if (current) {
            bucket.push(current as unknown as JourneyNode & JourneyPersona)
          }
          current = { id: String(parseScalar(bucketLine.split(':').slice(1).join(':'))) }
          index += 1
          continue
        }

        const kv = bucketLine.match(/^\s+([a-z_]+):\s*(.*)$/)
        if (kv && current) {
          current[kv[1]] = parseScalar(kv[2] ?? '')
          index += 1
          continue
        }

        if (!bucketLine.trim() || /^\s*#/.test(bucketLine)) {
          index += 1
          continue
        }

        break
      }

      if (current) {
        bucket.push(current as unknown as JourneyNode & JourneyPersona)
      }
      continue
    }

    if (key === 'version') {
      manifest.version = parseScalar(value) as string | number | null
    } else if (key === 'updated_at') {
      manifest.updated_at = String(parseScalar(value) ?? '')
    }

    index += 1
  }

  return manifest
}
