import { Resend } from 'resend'

let _resend: Resend | null = null

export function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

export const EMAIL_FROM =
  process.env.NOTIFICATION_EMAIL_FROM ?? 'School <noreply@school.example.com>'
