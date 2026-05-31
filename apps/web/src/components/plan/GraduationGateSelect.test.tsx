import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GraduationGateSelect } from './GraduationGateSelect'

// TQ-240 / W45 / W52 — 動的卒業ゲート選択 UI のスモークテスト。
// W52 で options 計算が calcGraduationOptions に切替わったことの整合確認。

describe('GraduationGateSelect — persona only path (legacy `personaId` 互換)', () => {
  it('persona.web-builder では Vercel/GitHub/Lovable/その他 の選択肢が表示される', () => {
    render(<GraduationGateSelect personaId="persona.web-builder" />)
    const kindSelect = screen.getByTestId('graduation-gate-kind') as HTMLSelectElement
    const optionLabels = Array.from(kindSelect.options).map((o) => o.value)
    expect(optionLabels).toContain('vercel_url')
    expect(optionLabels).toContain('github_repo')
    expect(optionLabels).toContain('lovable_url')
    expect(optionLabels).toContain('other_artifact')
  })

  it('persona.designer では figma_publish が表示され vercel_url は出ない', () => {
    render(<GraduationGateSelect personaId="persona.designer" />)
    const kindSelect = screen.getByTestId('graduation-gate-kind') as HTMLSelectElement
    const optionValues = Array.from(kindSelect.options).map((o) => o.value)
    expect(optionValues).toContain('figma_publish')
    expect(optionValues).not.toContain('vercel_url')
  })

  it('persona.nonengineer-marketer では campaign_lp が表示される', () => {
    render(<GraduationGateSelect personaId="persona.nonengineer-marketer" />)
    const kindSelect = screen.getByTestId('graduation-gate-kind') as HTMLSelectElement
    const optionValues = Array.from(kindSelect.options).map((o) => o.value)
    expect(optionValues).toContain('campaign_lp')
  })

  it('未知 persona / null は web-builder にフォールバックする', () => {
    render(<GraduationGateSelect personaId={null} />)
    const kindSelect = screen.getByTestId('graduation-gate-kind') as HTMLSelectElement
    const optionValues = Array.from(kindSelect.options).map((o) => o.value)
    expect(optionValues).toContain('vercel_url')
  })
})

describe('GraduationGateSelect — new calc path (W52: personaSlug + goalSlug)', () => {
  it('persona.noneng-webapp + goalSlug=web-builder で vercel_url を含む options が出る', () => {
    render(
      <GraduationGateSelect
        personaSlug="persona.noneng-webapp"
        goalSlug="web-builder"
      />,
    )
    const kindSelect = screen.getByTestId('graduation-gate-kind') as HTMLSelectElement
    const optionValues = Array.from(kindSelect.options).map((o) => o.value)
    expect(optionValues).toContain('vercel_url')
    expect(optionValues).toContain('github_repo')
    expect(optionValues).toContain('lovable_url')
  })

  it('persona.noneng-webapp + goalSlug=ai-content では workflow_recording が含まれ vercel_url が外れる (CR-2 解消)', () => {
    render(
      <GraduationGateSelect
        personaSlug="persona.noneng-webapp"
        goalSlug="ai-content"
      />,
    )
    const kindSelect = screen.getByTestId('graduation-gate-kind') as HTMLSelectElement
    const optionValues = Array.from(kindSelect.options).map((o) => o.value)
    expect(optionValues).toContain('workflow_recording')
    expect(optionValues).not.toContain('vercel_url')
  })

  it('persona.noneng-webapp + goalSlug=marketer では campaign_lp が最初の選択肢になる', () => {
    render(
      <GraduationGateSelect
        personaSlug="persona.noneng-webapp"
        goalSlug="marketer"
      />,
    )
    const kindSelect = screen.getByTestId('graduation-gate-kind') as HTMLSelectElement
    const optionValues = Array.from(kindSelect.options).map((o) => o.value)
    expect(optionValues[0]).toBe('campaign_lp')
  })

  it('showSourceTag={true} で source tag が表示される', () => {
    render(
      <GraduationGateSelect
        personaSlug="persona.noneng-webapp"
        goalSlug="web-builder"
        showSourceTag
      />,
    )
    const sourceTag = screen.getByTestId('graduation-gate-source')
    expect(sourceTag.textContent).toContain('exact_persona_goal_match')
    expect(sourceTag.textContent).toContain('persona.noneng-webapp')
  })

  it('personaSlug と personaId が両方指定された場合 personaSlug を優先する', () => {
    render(
      <GraduationGateSelect
        personaSlug="persona.designer"
        personaId="persona.web-builder"
      />,
    )
    const kindSelect = screen.getByTestId('graduation-gate-kind') as HTMLSelectElement
    const optionValues = Array.from(kindSelect.options).map((o) => o.value)
    expect(optionValues).toContain('figma_publish')
    expect(optionValues).not.toContain('vercel_url')
  })
})

describe('GraduationGateSelect — submit / validation', () => {
  it('正規 URL を入力して送信すると onSubmit が呼ばれる', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<GraduationGateSelect personaSlug="persona.web-builder" onSubmit={onSubmit} />)

    const artifactInput = screen.getByTestId('graduation-gate-artifact') as HTMLInputElement
    await user.clear(artifactInput)
    await user.type(artifactInput, 'https://my-app.vercel.app/portfolio')

    const submit = screen.getByTestId('graduation-gate-submit')
    await user.click(submit)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]?.[0] as {
      option: { kind: string }
      artifactValue: string
    }
    expect(payload.option.kind).toBe('vercel_url')
    expect(payload.artifactValue).toBe('https://my-app.vercel.app/portfolio')
  })

  it('pattern 不一致の URL ではエラーが表示され onSubmit は呼ばれない', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<GraduationGateSelect personaSlug="persona.web-builder" onSubmit={onSubmit} />)

    const artifactInput = screen.getByTestId('graduation-gate-artifact')
    await user.clear(artifactInput)
    await user.type(artifactInput, 'https://example.com/not-vercel')

    const submit = screen.getByTestId('graduation-gate-submit')
    await user.click(submit)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('graduation-gate-error')).toBeInTheDocument()
  })

  it('other_artifact 選択時は説明欄が表示され、空だとエラー', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<GraduationGateSelect personaSlug="persona.web-builder" onSubmit={onSubmit} />)

    const kindSelect = screen.getByTestId('graduation-gate-kind') as HTMLSelectElement
    await user.selectOptions(kindSelect, 'other_artifact')

    const explanation = screen.getByTestId('graduation-gate-explanation')
    expect(explanation).toBeInTheDocument()

    const artifactInput = screen.getByTestId('graduation-gate-artifact')
    await user.type(artifactInput, 'https://my-portfolio.example.org')

    const submit = screen.getByTestId('graduation-gate-submit')
    await user.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('graduation-gate-error')).toBeInTheDocument()
  })
})
