import { getResendClient, EMAIL_FROM } from './client'

export type EmailType = 'streak_reminder' | 'milestone' | 'graduation'

interface SendEmailParams {
  to: string
  subject: string
  html: string
}

/**
 * Send an email via Resend. Returns true on success.
 * Gracefully returns false if RESEND_API_KEY is not configured.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const resend = getResendClient()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured, skipping email send')
    return false
  }

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })

    if (error) {
      console.error('[email] Resend API error:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('[email] Failed to send email:', err)
    return false
  }
}
