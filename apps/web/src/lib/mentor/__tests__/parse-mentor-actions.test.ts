import { describe, expect, it } from 'vitest'

import { parseMentorActions, stripMentorActionTags } from '@/lib/mentor/parse-mentor-actions'

describe('parseMentorActions — simple tag (TQ-211 expanded set)', () => {
  it('returns no actions and untouched text when no tags present', () => {
    const text = 'こんにちは。プランは順調ですね。'
    const result = parseMentorActions(text)

    expect(result.actions).toHaveLength(0)
    expect(result.cleanText).toBe(text)
  })

  it('parses recompile_plan tag', () => {
    const text = '進捗を見るとプランの再生成が良さそうです。\n[MENTOR_ACTION:recompile_plan]ブロッカーが3件たまった[/MENTOR_ACTION]'
    const result = parseMentorActions(text)

    expect(result.actions).toEqual([
      { type: 'recompile_plan', reason: 'ブロッカーが3件たまった' },
    ])
    expect(result.cleanText).toBe('進捗を見るとプランの再生成が良さそうです。')
  })

  it('parses skip_lesson with full payload', () => {
    const text = 'これはスキップして良いと思います。[MENTOR_ACTION:skip_lesson]atom-foo|Foo の基礎|もう実務で使っているため[/MENTOR_ACTION]'
    const result = parseMentorActions(text)

    expect(result.actions).toEqual([
      {
        type: 'skip_lesson',
        targetLessonId: 'atom-foo',
        targetLessonTitle: 'Foo の基礎',
        reason: 'もう実務で使っているため',
      },
    ])
  })

  it('parses focus_lesson with full payload', () => {
    const text = '[MENTOR_ACTION:focus_lesson]atom-bar|Bar 入門|まずはここに集中[/MENTOR_ACTION]'
    const result = parseMentorActions(text)

    expect(result.actions).toEqual([
      {
        type: 'focus_lesson',
        targetLessonId: 'atom-bar',
        targetLessonTitle: 'Bar 入門',
        reason: 'まずはここに集中',
      },
    ])
  })

  it('parses adjust_difficulty easier/harder', () => {
    const text = '[MENTOR_ACTION:adjust_difficulty]easier|今のレベルに合わせて簡単めに[/MENTOR_ACTION]'
    const result = parseMentorActions(text)

    expect(result.actions).toEqual([
      {
        type: 'adjust_difficulty',
        direction: 'easier',
        reason: '今のレベルに合わせて簡単めに',
      },
    ])
  })

  describe('change_next_lesson (newly added in TQ-211)', () => {
    it('parses with id, title, reason', () => {
      const text = '[MENTOR_ACTION:change_next_lesson]atom-next|次の一歩|前提が揃っていないので入れ替え[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toEqual([
        {
          type: 'change_next_lesson',
          targetLessonId: 'atom-next',
          targetLessonTitle: '次の一歩',
          reason: '前提が揃っていないので入れ替え',
        },
      ])
    })

    it('returns null when lessonId missing', () => {
      const text = '[MENTOR_ACTION:change_next_lesson]|タイトルだけ|理由[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toHaveLength(0)
    })
  })

  describe('add_lesson (newly added in TQ-211)', () => {
    it('parses with explicit beforeLessonId', () => {
      const text = '[MENTOR_ACTION:add_lesson]atom-new|新しいレッスン|atom-existing|前提として挟みます[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toEqual([
        {
          type: 'add_lesson',
          targetLessonId: 'atom-new',
          targetLessonTitle: '新しいレッスン',
          beforeLessonId: 'atom-existing',
          reason: '前提として挟みます',
        },
      ])
    })

    it('parses without beforeLessonId (append at end)', () => {
      const text = '[MENTOR_ACTION:add_lesson]atom-new|新しいレッスン||末尾に追加します[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toHaveLength(1)
      const action = result.actions[0]
      expect(action.type).toBe('add_lesson')
      if (action.type === 'add_lesson') {
        expect(action.targetLessonId).toBe('atom-new')
        expect(action.beforeLessonId).toBeUndefined()
        expect(action.reason).toBe('末尾に追加します')
      }
    })
  })

  describe('reorder_schedule (newly added in TQ-211)', () => {
    it('parses ordered list with reason', () => {
      const text = '[MENTOR_ACTION:reorder_schedule]atom-a:Aの基本,atom-b:Bの応用,atom-c:Cの実装|順序を入れ替えると詰まりません[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toEqual([
        {
          type: 'reorder_schedule',
          newOrder: [
            { lessonId: 'atom-a', lessonTitle: 'Aの基本' },
            { lessonId: 'atom-b', lessonTitle: 'Bの応用' },
            { lessonId: 'atom-c', lessonTitle: 'Cの実装' },
          ],
          reason: '順序を入れ替えると詰まりません',
        },
      ])
    })

    it('returns null when newOrder is empty', () => {
      const text = '[MENTOR_ACTION:reorder_schedule]|理由のみ[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toHaveLength(0)
    })
  })

  it('parses multiple tags in a single response', () => {
    const text = `承知しました。プランをこう調整します。

[MENTOR_ACTION:reorder_schedule]a:Aの基本,b:Bの応用|順序入れ替え[/MENTOR_ACTION]
[MENTOR_ACTION:add_lesson]c|新しい補習|b|間に挟みます[/MENTOR_ACTION]`
    const result = parseMentorActions(text)

    expect(result.actions).toHaveLength(2)
    expect(result.actions[0].type).toBe('reorder_schedule')
    expect(result.actions[1].type).toBe('add_lesson')
  })

  it('falls back to JSON block format when no simple tags present', () => {
    const text = '[MENTOR_ACTION]{"type":"recompile_plan","reason":"自動経路"}[/MENTOR_ACTION]'
    const result = parseMentorActions(text)

    expect(result.actions).toEqual([
      { type: 'recompile_plan', reason: '自動経路' },
    ])
  })

  it('strips all tags from cleanText', () => {
    const text = '提案: [MENTOR_ACTION:recompile_plan]再生成[/MENTOR_ACTION] 詳細は次ページ。'
    expect(stripMentorActionTags(text)).toBe('提案:  詳細は次ページ。')
  })

  describe('recommend_tool (newly added in TQ-221)', () => {
    it('parses with stepId, toolId, reason', () => {
      const text = '[MENTOR_ACTION:recommend_tool]step-001|v0|UIの叩き台にはv0が早いです[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toEqual([
        {
          type: 'recommend_tool',
          stepId: 'step-001',
          toolId: 'v0',
          reason: 'UIの叩き台にはv0が早いです',
        },
      ])
    })

    it('returns null when stepId / toolId / reason missing', () => {
      const text = '[MENTOR_ACTION:recommend_tool]step-001|v0|[/MENTOR_ACTION]'
      const result = parseMentorActions(text)
      expect(result.actions).toHaveLength(0)
    })
  })

  describe('delegate_to_tool (newly added in TQ-221)', () => {
    it('parses with stepId, toolId, brief, reason', () => {
      const text = '[MENTOR_ACTION:delegate_to_tool]step-002|claude-code|レスポンシブ対応のヘッダーを作って|長いリファクタはClaude Codeが得意です[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toEqual([
        {
          type: 'delegate_to_tool',
          stepId: 'step-002',
          toolId: 'claude-code',
          delegationBrief: 'レスポンシブ対応のヘッダーを作って',
          reason: '長いリファクタはClaude Codeが得意です',
        },
      ])
    })

    it('returns null when fields are missing', () => {
      const text = '[MENTOR_ACTION:delegate_to_tool]step-002|claude-code||理由[/MENTOR_ACTION]'
      const result = parseMentorActions(text)
      expect(result.actions).toHaveLength(0)
    })
  })

  describe('switch_tool (newly added in TQ-221)', () => {
    it('parses with stepId, fromToolId, toToolId, reason', () => {
      const text = '[MENTOR_ACTION:switch_tool]step-003|claude-code|v0|UIの試行錯誤はv0の方が速いです[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toEqual([
        {
          type: 'switch_tool',
          stepId: 'step-003',
          fromToolId: 'claude-code',
          toToolId: 'v0',
          reason: 'UIの試行錯誤はv0の方が速いです',
        },
      ])
    })

    it('parses when fromToolId is empty (no prior tool assigned)', () => {
      const text = '[MENTOR_ACTION:switch_tool]step-004||v0|まずはv0で試してみましょう[/MENTOR_ACTION]'
      const result = parseMentorActions(text)

      expect(result.actions).toHaveLength(1)
      const action = result.actions[0]
      expect(action.type).toBe('switch_tool')
      if (action.type === 'switch_tool') {
        expect(action.stepId).toBe('step-004')
        expect(action.fromToolId).toBeNull()
        expect(action.toToolId).toBe('v0')
        expect(action.reason).toBe('まずはv0で試してみましょう')
      }
    })

    it('returns null when toToolId is missing', () => {
      const text = '[MENTOR_ACTION:switch_tool]step-005|claude-code||理由[/MENTOR_ACTION]'
      const result = parseMentorActions(text)
      expect(result.actions).toHaveLength(0)
    })
  })
})
