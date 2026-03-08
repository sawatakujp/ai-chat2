import { Hono } from 'hono'
import { GoogleAuth } from 'google-auth-library'

const CLAUDE_MODELS = [
  { provider: 'claude' as const, label: 'Claude Sonnet 4.6', model: 'claude-sonnet-4-6' },
  { provider: 'claude' as const, label: 'Claude Opus 4.6', model: 'claude-opus-4-6' },
  { provider: 'claude' as const, label: 'Claude Haiku 4.5', model: 'claude-haiku-4-5-20251001' },
]

const CANDIDATE_GEMINI_MODELS = [
  { provider: 'gemini' as const, label: 'Gemini 2.5 Pro', model: 'gemini-2.5-pro-preview-06-05' },
  { provider: 'gemini' as const, label: 'Gemini 2.0 Flash', model: 'gemini-2.0-flash-001' },
  { provider: 'gemini' as const, label: 'Gemini 2.0 Flash Lite', model: 'gemini-2.0-flash-lite-001' },
  { provider: 'gemini' as const, label: 'Gemini 1.5 Pro', model: 'gemini-1.5-pro-002' },
  { provider: 'gemini' as const, label: 'Gemini 1.5 Flash', model: 'gemini-1.5-flash-002' },
]

async function getAvailableGeminiModels(project: string, location: string) {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const token = await auth.getAccessToken()
    if (!token) return []

    const base = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models`
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { maxOutputTokens: 1 },
    })

    const results = await Promise.all(
      CANDIDATE_GEMINI_MODELS.map(async (m) => {
        try {
          const res = await fetch(`${base}/${m.model}:generateContent`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body,
            signal: AbortSignal.timeout(8000),
          })
          return res.status === 200 ? m : null
        } catch {
          return null
        }
      }),
    )

    return results.filter((m): m is (typeof CANDIDATE_GEMINI_MODELS)[number] => m !== null)
  } catch {
    return []
  }
}

export const modelsRoute = new Hono()

modelsRoute.get('/', async (c) => {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'

  const geminiModels = project ? await getAvailableGeminiModels(project, location) : []
  return c.json([...CLAUDE_MODELS, ...geminiModels])
})
