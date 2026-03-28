import { requestMockAnnotation } from '../walkthrough/mockBackend'
import { isWalkthroughMode } from '../walkthrough/mode'

const apiBase = import.meta.env.VITE_API_URL ?? ''

export type FormCorrectionRequest = {
  imageBase64: string
  mimeType?: string
  coachingHint?: string
  focus?: string
}

export type FormCorrectionResponse = {
  imageBase64: string
  mimeType: string
  notes: string
}

export async function requestFormCorrection(
  body: FormCorrectionRequest,
): Promise<FormCorrectionResponse> {
  if (isWalkthroughMode()) {
    return requestMockAnnotation(body)
  }
  const res = await fetch(`${apiBase}/api/annotations/form-correction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType ?? 'image/jpeg',
      coachingHint: body.coachingHint,
      focus: body.focus,
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text
    try {
      const j = JSON.parse(text) as { detail?: unknown }
      if (typeof j.detail === 'string') {
        detail = j.detail
      }
    } catch {
      /* raw */
    }
    throw new Error(detail || `Form correction failed (${res.status})`)
  }
  return JSON.parse(text) as FormCorrectionResponse
}
