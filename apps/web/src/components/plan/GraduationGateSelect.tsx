'use client'

import { useMemo, useState } from 'react'

import { Button } from '@school/ui/button'
import { Card, CardContent } from '@school/ui/card'
import { cn } from '@/lib/utils'
import {
  type GraduationOption,
  type GraduationOptionKind,
  validateGraduationGateSubmission,
} from '@/lib/planner/graduation'
import { calcGraduationOptions } from '@/lib/planner/graduation/calc'

// TQ-240 / W45 / W52 — 動的卒業ゲート選択 UI。
//
// Owner Vision「卒業ゲートはペルソナによって違うし、固定的な卒業ゲートは良くない」
// を満たすため、persona × goal で options を動的決定し、学習者が選択できる UI。
//
// W52 で options 計算経路を旧 `getGraduationOptions(personaId, goalDomain)` から W45
// 新設の `calcGraduationOptions({ personaSlug, goalSlug })` に切替。これにより
// /api/planner/graduation の server validation (calc 経由) と UI 表示が一致するように
// なり、persona × goal matrix エントリ全てで `400 invalid_decision_kind` を踏まなくなる。

export interface GraduationGateSelectProps {
  /**
   * persona slug (例: `persona.web-builder`)。null/undef は web-builder にフォールバック
   * (calc.ts の `fallback_web_builder`)。
   *
   * NOTE: 旧 prop 名 `personaId` の互換 alias は出口で吸収する (下記 `personaId` フィールド)。
   */
  personaSlug?: string | null
  /**
   * goal slug (例: `web-builder`, `ai-content`, `automation`, `marketer`, `designer`,
   * `freelancer`)。persona と組み合わせて卒業ゲート選択肢を絞り込む (W45)。
   */
  goalSlug?: string | null
  /**
   * 旧 prop 名互換。`personaSlug` が無いときに参照する fallback。
   * 既存呼出 (`<GraduationGateSelect personaId={...} />`) を即破壊しないために残す。
   * Phase 2 で全 caller を `personaSlug` に揃えたら削除する。
   * @deprecated personaSlug を使ってください。
   */
  personaId?: string | null
  /**
   * 旧 prop 名互換 (`goalDomain`)。`goalSlug` が無いときに参照する fallback。
   * @deprecated goalSlug を使ってください。
   */
  goalDomain?: string | null
  /** 学習者が提出を確定したときに呼ばれる。Conductor COMMIT 等から渡す。 */
  onSubmit?: (payload: {
    option: GraduationOption
    artifactValue: string
    explanation?: string
  }) => void
  /** 表示用ラベル上書き (任意) */
  heading?: string
  className?: string
  /**
   * options 解決元の source tag を表示するか。debug 用 (default: false)。
   */
  showSourceTag?: boolean
}

export function GraduationGateSelect(props: GraduationGateSelectProps) {
  const {
    personaSlug,
    goalSlug,
    personaId,
    goalDomain,
    onSubmit,
    heading,
    className,
    showSourceTag = false,
  } = props

  const resolvedPersona = personaSlug ?? personaId ?? null
  const resolvedGoal = goalSlug ?? goalDomain ?? null

  const calcResult = useMemo(
    () =>
      calcGraduationOptions({
        personaSlug: resolvedPersona,
        goalSlug: resolvedGoal,
      }),
    [resolvedPersona, resolvedGoal],
  )
  const options = calcResult.options

  const [selectedKind, setSelectedKind] = useState<GraduationOptionKind>(
    options[0]?.kind ?? 'other_artifact',
  )
  const [artifactValue, setArtifactValue] = useState('')
  const [explanation, setExplanation] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const selectedOption = useMemo(
    () => options.find((opt) => opt.kind === selectedKind) ?? options[0],
    [options, selectedKind],
  )

  const handleSubmit = () => {
    if (!selectedOption) return
    const result = validateGraduationGateSubmission({
      option: selectedOption,
      artifactValue,
      explanation: selectedOption.requires_explanation ? explanation : undefined,
    })
    if (!result.ok) {
      setErrorMessage(buildReasonMessage(result.reason))
      return
    }
    setErrorMessage(null)
    onSubmit?.({
      option: selectedOption,
      artifactValue: artifactValue.trim(),
      explanation: selectedOption.requires_explanation ? explanation.trim() : undefined,
    })
  }

  return (
    <Card className={cn('w-full', className)} data-testid="graduation-gate-select">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            {heading ?? '卒業ゲートを選ぶ'}
          </h2>
          <p className="text-sm text-muted-foreground">
            あなたが「ゴール達成」とみなす成果物を選んでください。ペルソナごとに合った
            選択肢が用意されています。
          </p>
          {showSourceTag ? (
            <p
              className="text-[11px] text-muted-foreground"
              data-testid="graduation-gate-source"
            >
              source: {calcResult.source} / persona: {calcResult.personaSlug}
              {calcResult.goalSlug ? ` / goal: ${calcResult.goalSlug}` : ''}
            </p>
          ) : null}
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">成果物の種類</span>
          <select
            data-testid="graduation-gate-kind"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedKind}
            onChange={(event) =>
              setSelectedKind(event.target.value as GraduationOptionKind)
            }
          >
            {options.map((opt) => (
              <option key={opt.kind} value={opt.kind}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">URL / 成果物の参照</span>
          <input
            data-testid="graduation-gate-artifact"
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={artifactPlaceholder(selectedOption?.kind)}
            value={artifactValue}
            onChange={(event) => setArtifactValue(event.target.value)}
          />
        </label>

        {selectedOption?.requires_explanation ? (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">補足説明 (なぜ卒業ゲートとして妥当か)</span>
            <textarea
              data-testid="graduation-gate-explanation"
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="例: 自宅サーバでホスティングしているため Vercel 等に該当しないが、SSL + 公開済みで第三者がアクセスできる"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
            />
          </label>
        ) : null}

        {errorMessage ? (
          <p className="text-sm text-destructive" data-testid="graduation-gate-error">
            {errorMessage}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleSubmit} data-testid="graduation-gate-submit">
            卒業ゲートを確定する
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function artifactPlaceholder(kind: GraduationOptionKind | undefined): string {
  switch (kind) {
    case 'vercel_url':
      return 'https://my-app.vercel.app/'
    case 'github_repo':
      return 'https://github.com/<owner>/<repo>'
    case 'lovable_url':
      return 'https://your-app.lovable.app/'
    case 'campaign_lp':
      return 'https://your-campaign.example.com/'
    case 'figma_publish':
      return 'https://www.figma.com/file/<key>/...'
    case 'workflow_recording':
      return 'https://www.loom.com/share/... (動画 URL)'
    case 'other_artifact':
    default:
      return 'https://...'
  }
}

function buildReasonMessage(reason: ReturnType<typeof validateGraduationGateSubmission>['reason']): string {
  switch (reason) {
    case 'empty_value':
      return 'URL または参照を入力してください。'
    case 'pattern_mismatch':
      return '選択した種類の URL パターンと一致しません。URL を確認してください。'
    case 'explanation_required':
      return '「その他の公開アーティファクト」を選んだ場合は補足説明が必須です。'
    case 'ok':
    default:
      return ''
  }
}

export default GraduationGateSelect
