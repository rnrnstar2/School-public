import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  fetchMock: vi.fn(),
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: mocks.sendEmailMock,
}))

describe('deliverImprovementProposal', () => {
  const originalFetch = global.fetch
  const originalAdminEmails = process.env.ADMIN_EMAILS
  const originalResendKey = process.env.RESEND_API_KEY
  const originalWebhook = process.env.OWNER_DISCORD_WEBHOOK_URL

  beforeEach(() => {
    mocks.sendEmailMock.mockReset()
    mocks.fetchMock.mockReset()
    global.fetch = mocks.fetchMock as unknown as typeof fetch
    process.env.ADMIN_EMAILS = 'owner@example.com'
    delete process.env.RESEND_API_KEY
    delete process.env.OWNER_DISCORD_WEBHOOK_URL
  })

  afterAll(() => {
    global.fetch = originalFetch
    process.env.ADMIN_EMAILS = originalAdminEmails
    process.env.RESEND_API_KEY = originalResendKey
    process.env.OWNER_DISCORD_WEBHOOK_URL = originalWebhook
  })

  it('prefers email delivery when Resend is configured', async () => {
    process.env.RESEND_API_KEY = 'resend-key'
    mocks.sendEmailMock.mockResolvedValue(true)

    const { deliverImprovementProposal } = await import('./delivery')
    const result = await deliverImprovementProposal({
      proposal_id: 'proposal-1',
      generated_at: '2026-04-08T00:00:00.000Z',
      summary: '2 improvement findings',
      detailed_markdown: '# Proposal',
      finding_ids: [],
      delivered_at: null,
      delivery_channel: null,
      acknowledged: false,
      source_job: 'job-1',
    })

    expect(result).toEqual({ delivered: true, channel: 'email' })
    expect(mocks.sendEmailMock).toHaveBeenCalledTimes(1)
    expect(mocks.fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to discord webhook when email is unavailable', async () => {
    process.env.OWNER_DISCORD_WEBHOOK_URL = 'https://discord.example/webhook'
    mocks.fetchMock.mockResolvedValue({ ok: true })

    const { deliverImprovementProposal } = await import('./delivery')
    const result = await deliverImprovementProposal({
      proposal_id: 'proposal-1',
      generated_at: '2026-04-08T00:00:00.000Z',
      summary: '2 improvement findings',
      detailed_markdown: '# Proposal',
      finding_ids: [],
      delivered_at: null,
      delivery_channel: null,
      acknowledged: false,
      source_job: 'job-1',
    })

    expect(result).toEqual({ delivered: true, channel: 'discord' })
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1)
  })
})
