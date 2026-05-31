import { sendEmail } from '@/lib/email/send'

import type {
  ImprovementDeliveryResult,
  ImprovementProposalRecord,
} from './types'

function resolveOwnerEmail(): string | null {
  const direct = process.env.OWNER_EMAIL?.trim()
  if (direct) {
    return direct
  }

  const fromAdminList = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)[0]

  return fromAdminList ?? null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function markdownToHtml(markdown: string): string {
  return `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap;">${escapeHtml(markdown)}</pre>`
}

export async function deliverImprovementProposal(
  proposal: ImprovementProposalRecord,
): Promise<ImprovementDeliveryResult> {
  const ownerEmail = resolveOwnerEmail()

  if (ownerEmail && process.env.RESEND_API_KEY) {
    const delivered = await sendEmail({
      to: ownerEmail,
      subject: `[School Improvement] ${proposal.summary}`,
      html: markdownToHtml(proposal.detailed_markdown),
    })

    if (delivered) {
      return {
        delivered: true,
        channel: 'email',
      }
    }
  }

  const webhookUrl = process.env.OWNER_DISCORD_WEBHOOK_URL?.trim()
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: [
          `**${proposal.summary}**`,
          '',
          proposal.detailed_markdown.slice(0, 1800),
        ].join('\n'),
      }),
    })

    if (response.ok) {
      return {
        delivered: true,
        channel: 'discord',
      }
    }

    console.warn('[improvement-delivery] Discord webhook delivery failed', response.status)
  }

  return {
    delivered: false,
    channel: null,
  }
}
