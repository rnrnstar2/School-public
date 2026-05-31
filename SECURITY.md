# Security Policy

## Reporting

Do not open a public issue for suspected vulnerabilities, leaked credentials, or data exposure.

Report privately to the maintainer with:

- affected files, routes, or workflows
- reproduction steps
- impact assessment
- any logs or screenshots with secrets redacted

## Secrets

School must not store real credentials in Git. This includes:

- `.env.local`
- Supabase service-role keys
- provider API keys
- Vercel tokens
- Sentry auth tokens
- Redis tokens
- production database dumps

Use `.env.example` for variable names only.

## Supported Versions

School is pre-1.0. Security fixes target the default branch until a release line is established.

## AI and BYOK Notes

Learner-supplied provider keys are intended to be encrypted at rest before storage. Treat all model output and user-provided content as untrusted input. Do not log raw provider keys, full prompts containing private user data, or decrypted BYOK material.
