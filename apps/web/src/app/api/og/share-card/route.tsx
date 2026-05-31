import { ImageResponse } from '@vercel/og'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

const TRACK_LABELS: Record<string, string> = {
  'web-builder-ai': 'Web制作',
  'ai-automation': '業務自動化',
  'ai-content-creator': 'コンテンツ制作',
  'ai-app-builder': 'アプリ制作',
}

/**
 * GET /api/og/share-card?id=<certificateId>
 * Generates a dynamic OGP share card image for a shared certificate.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return new Response('Missing certificate id', { status: 400 })
  }

  // Fetch certificate data
  const supabase = await createClient()
  const { data: cert } = await supabase
    .from('certificates')
    .select('id, learner_name, goal_summary, plan_title, track_id, completed_at, milestone_count, criteria_count, criteria_labels, shared_at')
    .eq('id', id)
    .single()

  if (!cert || !cert.shared_at) {
    return new Response('Certificate not found or not shared', { status: 404 })
  }

  const trackLabel = cert.track_id ? (TRACK_LABELS[cert.track_id] ?? cert.track_id) : ''
  const completedDate = cert.completed_at
    ? new Date(cert.completed_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''
  const criteriaLabels = (cert.criteria_labels ?? []).slice(0, 4)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 40%, #fde68a 100%)',
          fontFamily: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif',
          padding: '48px 56px',
          position: 'relative',
        }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '24px',
              fontWeight: 700,
            }}
          >
            🎓
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', color: '#92400e', fontWeight: 600, letterSpacing: '0.15em' }}>
              CERTIFICATE OF COMPLETION
            </span>
            <span style={{ fontSize: '12px', color: '#b45309' }}>
              School — AI を使う、次世代スクール
            </span>
          </div>
          {trackLabel && (
            <div
              style={{
                marginLeft: 'auto',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '9999px',
                padding: '6px 20px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#92400e',
              }}
            >
              {trackLabel}
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', flex: 1 }}>
          {cert.learner_name && (
            <p style={{ fontSize: '18px', color: '#92400e', fontWeight: 600, margin: '0 0 8px 0' }}>
              {cert.learner_name}
            </p>
          )}
          <h1
            style={{
              fontSize: '36px',
              fontWeight: 800,
              color: '#1e293b',
              lineHeight: 1.3,
              margin: '0 0 16px 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxHeight: '140px',
            }}
          >
            {cert.goal_summary}
          </h1>

          {cert.plan_title && (
            <p style={{ fontSize: '16px', color: '#64748b', margin: '0 0 24px 0' }}>
              プラン: {cert.plan_title}
            </p>
          )}

          {/* Achievement badges */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: 'auto' }}>
            {criteriaLabels.map((label: string, i: number) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '12px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  color: '#065f46',
                  fontWeight: 500,
                }}
              >
                ✓ {label}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom stats */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '32px',
            borderTop: '1px solid rgba(245, 158, 11, 0.3)',
            paddingTop: '20px',
            marginTop: '24px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600, letterSpacing: '0.1em' }}>
              マイルストーン
            </span>
            <span style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b' }}>
              {cert.milestone_count ?? 0}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600, letterSpacing: '0.1em' }}>
              卒業基準達成
            </span>
            <span style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b' }}>
              {cert.criteria_count ?? 0}
            </span>
          </div>
          {completedDate && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600, letterSpacing: '0.1em' }}>
                達成日
              </span>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
                {completedDate}
              </span>
            </div>
          )}
          <div
            style={{
              marginLeft: 'auto',
              fontSize: '12px',
              color: '#b45309',
              fontWeight: 500,
            }}
          >
            school.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}
