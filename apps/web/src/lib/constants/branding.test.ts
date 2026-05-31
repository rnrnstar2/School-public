import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BRAND_BADGE,
  BRAND_DESCRIPTION,
  BRAND_NAME,
  BRAND_TAGLINE,
  HOMEPAGE_FEATURES,
  HOMEPAGE_FLOW_STEPS,
  HOMEPAGE_PRIMARY_CTA,
  HOMEPAGE_SECONDARY_CTA,
} from './branding'

test('branding constants match the TQ-174 positioning snapshot', () => {
  assert.equal(
    JSON.stringify(
      {
        brandName: BRAND_NAME,
        badge: BRAND_BADGE,
        tagline: BRAND_TAGLINE,
        description: BRAND_DESCRIPTION,
        flowSteps: HOMEPAGE_FLOW_STEPS,
        primaryCta: HOMEPAGE_PRIMARY_CTA,
        secondaryCta: HOMEPAGE_SECONDARY_CTA,
        featureNames: HOMEPAGE_FEATURES.map((feature) => feature.name),
      },
      null,
      2,
    ),
    `{
  "brandName": "School",
  "badge": "Goal-first mentor workspace",
  "tagline": "AI で実現したい人が、迷わず前進する mentor workspace",
  "description": "School は Goal を共有すると、chat で前提を整え、plan と次の action まで mentor workspace にまとめる goal-first workspace です。",
  "flowSteps": [
    "Goal",
    "Chat",
    "Plan",
    "Action"
  ],
  "primaryCta": {
    "label": "Goal を共有する",
    "href": "/plan/onboarding",
    "eyebrow": "Onboarding intake",
    "title": "最初の Goal を mentor workspace に入れる",
    "description": "やりたいことを一言で共有すると、AI が chat で前提を整え、次の plan と action まで onboarding でつなぎます。"
  },
  "secondaryCta": {
    "label": "補助レッスンを見る",
    "href": "/lessons",
    "eyebrow": "Lesson system",
    "title": "必要なレッスンだけ後から開く",
    "description": "Goal-first の進行に必要な教材を、lesson system から補助的に参照できます。"
  },
  "featureNames": [
    "Goal Tree",
    "Ask2Action",
    "Speak2Action",
    "Agent2Action",
    "Context Panel"
  ]
}`,
  )
})
