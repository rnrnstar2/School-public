import type {
  ImprovementFindingRecord,
  ImprovementFindingType,
} from './types'

function countByType(findings: ImprovementFindingRecord[], type: ImprovementFindingType) {
  return findings.filter((finding) => finding.finding_type === type).length
}

function escapeMarkdownTable(value: string | null | undefined): string {
  return (value ?? 'n/a').replaceAll('|', '\\|')
}

function formatRecommendation(finding: ImprovementFindingRecord): string {
  switch (finding.finding_type) {
    case 'confusion':
      return `Improve atom \`${finding.atom_id}\` with clearer steps, checks, and blocker guidance.`
    case 'freshness':
      return `Refresh atom \`${finding.atom_id}\` evidence criteria and examples.`
    case 'gap':
      return finding.persona_id
        ? `Consider a new atom for capability \`${finding.capability}\` and extend persona \`${finding.persona_id}\`.`
        : `Consider a new atom for capability \`${finding.capability}\`.`
    default:
      return 'Review the finding and decide whether to improve an atom or add new coverage.'
  }
}

function renderSection(
  title: string,
  findings: ImprovementFindingRecord[],
) {
  if (findings.length === 0) {
    return `## ${title}\n\nNo findings.\n`
  }

  const rows = findings.map((finding) => {
    const subject = finding.atom_id ?? finding.capability ?? 'n/a'
    const related = finding.persona_id ?? 'n/a'
    const evidence = Object.entries(finding.evidence)
      .slice(0, 3)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join('; ')

    return `| ${escapeMarkdownTable(subject)} | ${escapeMarkdownTable(related)} | ${finding.severity} | ${escapeMarkdownTable(evidence)} | ${escapeMarkdownTable(formatRecommendation(finding))} |`
  })

  return [
    `## ${title}`,
    '',
    '| Subject | Persona | Severity | Evidence | Recommended action |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}

export function buildProposalSummary(findings: ImprovementFindingRecord[]): string {
  return [
    `${findings.length} improvement findings`,
    `${countByType(findings, 'confusion')} confusion`,
    `${countByType(findings, 'freshness')} freshness`,
    `${countByType(findings, 'gap')} gap`,
  ].join(' / ')
}

export function generateImprovementProposalMarkdown({
  findings,
  generatedAt,
}: {
  findings: ImprovementFindingRecord[]
  generatedAt: string
}): string {
  const sorted = findings.slice().sort((left, right) => {
    if (left.finding_type !== right.finding_type) {
      return left.finding_type.localeCompare(right.finding_type)
    }

    return (left.atom_id ?? left.capability ?? '').localeCompare(
      right.atom_id ?? right.capability ?? '',
    )
  })

  return [
    '# Nightly Improvement Proposal',
    '',
    `Generated at: ${generatedAt}`,
    '',
    '## Snapshot',
    '',
    `- Total findings: ${sorted.length}`,
    `- Confusion findings: ${countByType(sorted, 'confusion')}`,
    `- Freshness findings: ${countByType(sorted, 'freshness')}`,
    `- Gap findings: ${countByType(sorted, 'gap')}`,
    '',
    renderSection('Confusion Miner', sorted.filter((finding) => finding.finding_type === 'confusion')),
    renderSection('Freshness Miner', sorted.filter((finding) => finding.finding_type === 'freshness')),
    renderSection('Gap Miner', sorted.filter((finding) => finding.finding_type === 'gap')),
  ].join('\n')
}
