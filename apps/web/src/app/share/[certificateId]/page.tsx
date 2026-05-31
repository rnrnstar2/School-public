import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShareCardView } from '@/components/share/share-card-view'

const TRACK_LABELS: Record<string, string> = {
  'web-builder-ai': 'Web Builder AI',
  'ai-automation': 'AI業務自動化',
}

interface Props {
  params: Promise<{ certificateId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { certificateId } = await params
  const supabase = await createClient()
  const { data: cert } = await supabase
    .from('certificates')
    .select('id, learner_name, goal_summary, track_id, shared_at')
    .eq('id', certificateId)
    .single()

  if (!cert || !cert.shared_at) {
    return { title: '学習進捗シェアカード | School' }
  }

  const trackLabel = cert.track_id ? (TRACK_LABELS[cert.track_id] ?? cert.track_id) : ''
  const title = cert.learner_name
    ? `${cert.learner_name}の学習達成 | School`
    : '学習達成シェアカード | School'
  const description = `${trackLabel ? `${trackLabel} — ` : ''}${cert.goal_summary}`

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://school.vercel.app'
  const ogImageUrl = `${siteUrl}/api/og/share-card?id=${cert.id}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${siteUrl}/share/${cert.id}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default async function SharePage({ params }: Props) {
  const { certificateId } = await params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(certificateId)) {
    notFound()
  }

  const supabase = await createClient()
  const { data: cert } = await supabase
    .from('certificates')
    .select('id, learner_name, goal_summary, plan_title, track_id, completed_at, milestone_count, criteria_count, criteria_labels, shared_at')
    .eq('id', certificateId)
    .single()

  if (!cert || !cert.shared_at) {
    notFound()
  }

  return <ShareCardView certificate={cert} />
}
