const args = process.argv.slice(2)

function readArg(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`)
  if (index === -1) {
    return fallback
  }

  return args[index + 1]
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'school-ci-smoke-test',
    },
  })

  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  }
}

const baseUrl = readArg('base-url')

if (!baseUrl) {
  console.error('Missing required argument: --base-url')
  process.exit(1)
}

const stage = readArg('stage', 'deployment')
const timeoutMs = Number(readArg('timeout-ms', '300000'))
const intervalMs = Number(readArg('interval-ms', '5000'))
const deadline = Date.now() + timeoutMs
let lastFailure = 'smoke test did not run'

while (Date.now() < deadline) {
  try {
    const healthUrl = new URL('/api/health', baseUrl)
    const smokeUrl = new URL('/api/smoke', baseUrl)

    const [health, smoke] = await Promise.all([
      fetchJson(healthUrl),
      fetchJson(smokeUrl),
    ])

    const healthOk = health.ok && health.body?.status === 'healthy'
    const smokeOk = smoke.ok && smoke.body?.status === 'healthy'

    if (healthOk && smokeOk) {
      console.log(JSON.stringify({
        stage,
        baseUrl,
        status: 'healthy',
        health: health.body,
        smoke: smoke.body,
      }))
      process.exit(0)
    }

    lastFailure = JSON.stringify({
      stage,
      baseUrl,
      health,
      smoke,
    })
  } catch (error) {
    lastFailure = error instanceof Error ? error.stack ?? error.message : String(error)
  }

  await sleep(intervalMs)
}

console.error(`Smoke test failed for ${stage}: ${lastFailure}`)
process.exit(1)
