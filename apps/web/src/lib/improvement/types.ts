export type ImprovementJobType =
  | 'confusion_miner'
  | 'freshness_miner'
  | 'gap_miner'
  | 'proposal_report'

export type ImprovementJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'

export type ImprovementFindingType = 'confusion' | 'freshness' | 'gap'
export type ImprovementSeverity = 'low' | 'medium' | 'high'
export type ImprovementFindingStatus = 'open' | 'reported' | 'dismissed' | 'addressed'
export type ImprovementDeliveryChannel = 'discord' | 'email'

export interface ImprovementJobRecord {
  job_id: string
  job_type: ImprovementJobType
  status: ImprovementJobStatus
  scheduled_for: string
  started_at: string | null
  completed_at: string | null
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
}

export interface ImprovementFindingDraft {
  finding_type: ImprovementFindingType
  atom_id: string | null
  persona_id: string | null
  capability: string | null
  severity: ImprovementSeverity
  evidence: Record<string, unknown>
}

export interface ImprovementFindingRecord extends ImprovementFindingDraft {
  finding_id: string
  source_job: string | null
  detected_at: string
  status: ImprovementFindingStatus
}

export interface ImprovementProposalRecord {
  proposal_id: string
  generated_at: string
  summary: string
  detailed_markdown: string
  finding_ids: string[]
  delivered_at: string | null
  delivery_channel: ImprovementDeliveryChannel | null
  acknowledged: boolean
  source_job: string | null
}

export interface ImprovementTelemetryEvent {
  event_name: string
  atom_id: string | null
  plan_id: string | null
  occurred_at: string
  properties: Record<string, unknown> | null
}

export interface ImprovementCurrentAtomVersion {
  atom_id: string
  version_id: string
  imported_at: string
}

export interface ImprovementCompiledPlan {
  plan_id: string
  persona_id: string | null
  unsupported_capabilities: string[]
  created_at: string
}

export interface ImprovementScheduleSlot {
  windowKey: string
  scheduledFor: string
  last24hStart: string
  last7dStart: string
  last14dStart: string
  last30dStart: string
  now: string
}

export interface ImprovementLoopResult {
  scheduled_for: string
  proposal_id: string
  finding_counts: {
    confusion: number
    freshness: number
    gap: number
    total: number
  }
  delivery: {
    delivered: boolean
    channel: ImprovementDeliveryChannel | null
  }
}

export interface ImprovementDeliveryResult {
  delivered: boolean
  channel: ImprovementDeliveryChannel | null
}
