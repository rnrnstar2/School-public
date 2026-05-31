async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'school-deploy-notifier',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Notification failed (${response.status}): ${body}`)
  }
}

const status = process.env.DEPLOYMENT_STATUS ?? 'unknown'
const target = process.env.DEPLOYMENT_TARGET ?? 'release'
const message = process.env.DEPLOYMENT_MESSAGE ?? ''
const runUrl = process.env.DEPLOYMENT_RUN_URL ?? ''
const previewUrl = process.env.DEPLOYMENT_PREVIEW_URL ?? ''
const productionUrl = process.env.DEPLOYMENT_PRODUCTION_URL ?? ''

const lines = [
  `[School deploy] ${target}: ${status}`,
  message,
  previewUrl ? `Preview: ${previewUrl}` : '',
  productionUrl ? `Production: ${productionUrl}` : '',
  runUrl ? `Run: ${runUrl}` : '',
].filter(Boolean)

const text = lines.join('\n')
const jobs = []

if (process.env.SLACK_WEBHOOK_URL) {
  jobs.push(postJson(process.env.SLACK_WEBHOOK_URL, { text }))
}

if (process.env.DISCORD_WEBHOOK_URL) {
  jobs.push(postJson(process.env.DISCORD_WEBHOOK_URL, { content: text }))
}

if (jobs.length === 0) {
  console.log('No notification webhook configured.')
  process.exit(0)
}

await Promise.all(jobs)
console.log('Deployment notifications sent.')
