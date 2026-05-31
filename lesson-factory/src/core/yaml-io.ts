import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import YAML from 'yaml'

export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8')
}

export async function readYamlFile<T>(filePath: string): Promise<T> {
  const raw = await readTextFile(filePath)
  return parseYaml<T>(raw)
}

export function parseYaml<T>(source: string): T {
  return YAML.parse(source) as T
}

export function stringifyYaml(value: unknown): string {
  return YAML.stringify(value, {
    lineWidth: 0,
    minContentWidth: 0,
  })
}

export async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  const contents = typeof value === 'string' ? value : stringifyYaml(value)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')
}
