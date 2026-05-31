import type { ActionStack } from './schema'
import { ACTION_STACKS } from './schema'
import { normalizeForMatch } from './synonyms'

const STACK_PATTERNS = {
  'JavaScript': ['JavaScript', 'JS', 'vanilla js'],
  'LangChain': ['LangChain'],
  'Next.js': ['Next.js', 'Nextjs'],
  'Node.js': ['Node.js', 'Nodejs'],
  'OpenAI': ['OpenAI', 'ChatGPT', 'GPT-4', 'Responses API'],
  'PostgreSQL': ['PostgreSQL', 'Postgres'],
  'Python': ['Python', 'Python3'],
  'React': ['React'],
  'Shopify': ['Shopify'],
  'Supabase': ['Supabase'],
  'Tailwind CSS': ['Tailwind', 'Tailwind CSS'],
  'TypeScript': ['TypeScript', 'TS'],
  'Vercel': ['Vercel'],
  'YouTube': ['YouTube', 'YouTube Shorts'],
} as const satisfies Record<ActionStack, readonly string[]>

export function extractStacks(values: readonly string[]) {
  const joinedText = normalizeForMatch(values.join(' '))

  return ACTION_STACKS
    .filter((stack) =>
      STACK_PATTERNS[stack].some((pattern) => joinedText.includes(normalizeForMatch(pattern))),
    )
    .sort((left, right) => left.localeCompare(right, 'en'))
}
