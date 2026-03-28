import { isWalkthroughMode } from '../walkthrough/mode'

const apiBase = import.meta.env.VITE_API_URL ?? ''

export type UploadPhotoRequest = {
  skillId: string
  imageBase64: string
  mimeType?: string
  label?: string
  kind?: string
  description?: string
}

export async function uploadPhotoToGooglePhotos(
  body: UploadPhotoRequest,
): Promise<void> {
  if (isWalkthroughMode()) {
    void body
    return
  }
  const res = await fetch(`${apiBase}/api/photos/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skillId: body.skillId,
      imageBase64: body.imageBase64,
      mimeType: body.mimeType ?? 'image/png',
      label: body.label,
      kind: body.kind ?? 'annotation',
      description: body.description,
    }),
  })
  if (res.ok) {
    return
  }
  const text = await res.text()
  let detail = text
  try {
    const parsed = JSON.parse(text) as { detail?: unknown }
    if (typeof parsed.detail === 'string') {
      detail = parsed.detail
    }
  } catch {
    /* raw */
  }
  throw new Error(detail || `Photo upload failed (${res.status})`)
}
