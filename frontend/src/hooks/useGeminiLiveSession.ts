import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { requestFormCorrection } from '../api/annotations'
import { fetchLiveEphemeralToken } from '../api/live'
import { uploadPhotoToGooglePhotos } from '../api/photos'
import { captureVideoFrameAsJpegBase64 } from '../live/captureVideoFrame'
import {
  GeminiLiveClient,
  LIVE_FORM_CORRECTION_TOOL,
} from '../live/geminiLiveClient'
import { MicPcmStreamer } from '../live/micPcmStreamer'
import { base64ToFloat32Pcm16Le } from '../live/pcmUtils'
import { PcmPlaybackScheduler } from '../live/pcmPlayback'
import { isWalkthroughMode } from '../walkthrough/mode'

/** Live tool args may be camelCase or snake_case depending on the API. */
function coachingTextFromToolArgs(
  args: Record<string, unknown>,
): string | undefined {
  const keys = [
    'coachingSuggestions',
    'coaching_suggestions',
    'suggestions',
  ] as const
  for (const k of keys) {
    const v = args[k]
    if (typeof v === 'string' && v.trim()) {
      return v.trim()
    }
  }
  return undefined
}

const FORM_CORRECTION_COOLDOWN_MS = 30_000

export type ConnectCoachOptions = {
  /** When set, the backend specializes the Live system instruction to this skill. */
  skillId?: string
  skillTitle?: string
}

export function useGeminiLiveSession(
  videoRef: RefObject<HTMLVideoElement | null>,
  sessionSkill?: ConnectCoachOptions,
) {
  const clientRef = useRef<GeminiLiveClient | null>(null)
  const micRef = useRef<MicPcmStreamer | null>(null)
  const playbackRef = useRef<PcmPlaybackScheduler | null>(null)
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const walkthroughTimerRef = useRef<number | null>(null)
  const walkthroughCaptionIntervalRef = useRef<number | null>(null)
  const userCaptionRef = useRef('')
  const modelCaptionRef = useRef('')
  const formCorrectionCooldownUntilRef = useRef(0)
  /** Blocks overlapping annotation HTTP calls (parallel onToolCall or manual + tool). */
  const formCorrectionInFlightRef = useRef(false)
  const activeSkillIdRef = useRef<string | undefined>(undefined)
  const activeSkillTitleRef = useRef<string | undefined>(undefined)

  const [coachPhase, setCoachPhase] = useState<'off' | 'connecting' | 'live' | 'error'>('off')
  const [coachError, setCoachError] = useState<string | null>(null)
  const [userCaption, setUserCaption] = useState('')
  const [modelCaption, setModelCaption] = useState('')
  const [correctionImageUrl, setCorrectionImageUrl] = useState<string | null>(null)
  const [correctionNotes, setCorrectionNotes] = useState('')
  const [annotationBusy, setAnnotationBusy] = useState(false)
  const [formCorrectionCooldownEndsAt, setFormCorrectionCooldownEndsAt] = useState(0)

  const peekFormCorrectionCooldownError = useCallback((): string | null => {
    const until = formCorrectionCooldownUntilRef.current
    if (until === 0 || Date.now() >= until) {
      return null
    }
    const s = Math.max(1, Math.ceil((until - Date.now()) / 1000))
    return `Annotated form is limited to once every 30 seconds. Try again in ${s}s.`
  }, [])

  const beginFormCorrectionCooldown = useCallback(() => {
    const until = Date.now() + FORM_CORRECTION_COOLDOWN_MS
    formCorrectionCooldownUntilRef.current = until
    setFormCorrectionCooldownEndsAt(until)
  }, [])

  const clearFormCorrectionCooldown = useCallback(() => {
    formCorrectionCooldownUntilRef.current = 0
    setFormCorrectionCooldownEndsAt(0)
  }, [])

  const releaseFormCorrectionInFlight = useCallback(() => {
    formCorrectionInFlightRef.current = false
  }, [])

  /** Returns null if the slot was reserved; otherwise an error message (do not call release). */
  const tryBeginFormCorrection = useCallback((): string | null => {
    if (formCorrectionInFlightRef.current) {
      return 'An annotation is already in progress. Wait for it to finish.'
    }
    const cooldownErr = peekFormCorrectionCooldownError()
    if (cooldownErr) {
      return cooldownErr
    }
    formCorrectionInFlightRef.current = true
    return null
  }, [peekFormCorrectionCooldownError])

  useEffect(() => {
    if (sessionSkill?.skillId) {
      activeSkillIdRef.current = sessionSkill.skillId
    }
    if (sessionSkill?.skillTitle) {
      activeSkillTitleRef.current = sessionSkill.skillTitle
    }
  }, [sessionSkill?.skillId, sessionSkill?.skillTitle])

  useEffect(() => {
    if (formCorrectionCooldownEndsAt === 0) {
      return
    }
    const id = window.setInterval(() => {
      if (Date.now() >= formCorrectionCooldownEndsAt) {
        formCorrectionCooldownUntilRef.current = 0
        setFormCorrectionCooldownEndsAt(0)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [formCorrectionCooldownEndsAt])

  const formCorrectionCooldownSec = Math.max(
    0,
    Math.ceil((formCorrectionCooldownEndsAt - Date.now()) / 1000),
  )

  const stopMedia = useCallback(async () => {
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current)
      videoTimerRef.current = null
    }
    if (walkthroughTimerRef.current) {
      clearTimeout(walkthroughTimerRef.current)
      walkthroughTimerRef.current = null
    }
    if (walkthroughCaptionIntervalRef.current) {
      clearInterval(walkthroughCaptionIntervalRef.current)
      walkthroughCaptionIntervalRef.current = null
    }
    await micRef.current?.stop()
    micRef.current = null
    await playbackRef.current?.close()
    playbackRef.current = null
  }, [])

  const closeWebSocket = useCallback(() => {
    const c = clientRef.current
    clientRef.current = null
    c?.close()
  }, [])

  const disconnectCoach = useCallback(async () => {
    await stopMedia()
    closeWebSocket()
    setCoachPhase('off')
    setCoachError(null)
    setCorrectionImageUrl(null)
    setCorrectionNotes('')
    clearFormCorrectionCooldown()
    releaseFormCorrectionInFlight()
  }, [stopMedia, closeWebSocket, clearFormCorrectionCooldown, releaseFormCorrectionInFlight])

  const applyFormCorrection = useCallback(
    async (focus: string | undefined, coachingHint: string | undefined) => {
      const b64 = captureVideoFrameAsJpegBase64(videoRef.current)
      if (!b64) {
        throw new Error('No camera frame — is the video playing?')
      }
      return requestFormCorrection({
        imageBase64: b64,
        focus,
        coachingHint,
      })
    },
    [videoRef],
  )

  const uploadAnnotatedStillIfPossible = useCallback(
    (params: { imageBase64: string; mimeType: string; label: string; description?: string }) => {
      const skillId = activeSkillIdRef.current
      if (!skillId) {
        return
      }
      void uploadPhotoToGooglePhotos({
        skillId,
        imageBase64: params.imageBase64,
        mimeType: params.mimeType,
        label: params.label,
        kind: 'annotation',
        description: params.description,
      }).catch((err) => {
        console.warn('Google Photos upload skipped:', err)
      })
    },
    [],
  )

  const runManualFormCorrection = useCallback(
    async (focus?: string) => {
      const blocked = tryBeginFormCorrection()
      if (blocked) {
        setCoachError(blocked)
        return
      }
      setAnnotationBusy(true)
      setCoachError(null)
      try {
        const res = await applyFormCorrection(
          focus,
          modelCaptionRef.current || userCaptionRef.current || undefined,
        )
        beginFormCorrectionCooldown()
        setCorrectionImageUrl(`data:${res.mimeType};base64,${res.imageBase64}`)
        setCorrectionNotes(res.notes)
        uploadAnnotatedStillIfPossible({
          imageBase64: res.imageBase64,
          mimeType: res.mimeType,
          label: `${activeSkillTitleRef.current || 'Skill'} manual form check`,
          description: res.notes || undefined,
        })
      } catch (e) {
        setCoachError(e instanceof Error ? e.message : String(e))
      } finally {
        releaseFormCorrectionInFlight()
        setAnnotationBusy(false)
      }
    },
    [
      applyFormCorrection,
      beginFormCorrectionCooldown,
      uploadAnnotatedStillIfPossible,
      tryBeginFormCorrection,
      releaseFormCorrectionInFlight,
    ],
  )

  const clearCorrection = useCallback(() => {
    setCorrectionImageUrl(null)
    setCorrectionNotes('')
  }, [])

  const connectCoach = useCallback(
    async (
      stream: MediaStream,
      videoEl: HTMLVideoElement | null,
      options?: ConnectCoachOptions,
    ) => {
      await disconnectCoach()

      setUserCaption('')
      setModelCaption('')
      userCaptionRef.current = ''
      modelCaptionRef.current = ''
      setCoachPhase('connecting')
      setCoachError(null)
      activeSkillIdRef.current = options?.skillId
      activeSkillTitleRef.current = options?.skillTitle

      if (isWalkthroughMode()) {
        const skillLabel = options?.skillTitle || 'your skill'
        const messages = [
          `Walkthrough coach online. We are starting with the setup for ${skillLabel}. Show me your ready position.`,
          'Good. Hold that setup for one more beat and keep the movement slow and repeatable.',
          'Now do one clean repetition. I want control first, then consistency.',
          'Nice. Repeat it three times with the same rhythm and keep one correction in mind.',
        ]
        walkthroughTimerRef.current = window.setTimeout(() => {
          setCoachPhase('live')
          modelCaptionRef.current = messages[0]
          setModelCaption(messages[0])
          let index = 1
          walkthroughCaptionIntervalRef.current = window.setInterval(() => {
            if (index >= messages.length) {
              if (walkthroughCaptionIntervalRef.current) {
                clearInterval(walkthroughCaptionIntervalRef.current)
                walkthroughCaptionIntervalRef.current = null
              }
              return
            }
            modelCaptionRef.current = messages[index]
            setModelCaption(messages[index])
            index += 1
          }, 4500)
        }, 700)
        return
      }

      let accessToken: string
      let liveModel: string
      let systemInstruction: string
      try {
        console.log('[GeminiLive] Fetching ephemeral token...')
        const tokenRes = await fetchLiveEphemeralToken(options?.skillId)
        accessToken = tokenRes.accessToken
        liveModel = tokenRes.liveModel
        systemInstruction = tokenRes.systemInstruction
        console.log('[GeminiLive] Token received:', { liveModel, tokenLength: accessToken.length })
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : 'Could not get Live token from the API. Is the backend running with GEMINI_API_KEY?'
        console.error('[GeminiLive] Token fetch error:', e)
        setCoachError(msg)
        setCoachPhase('error')
        return
      }

      const playback = new PcmPlaybackScheduler(24_000)
      playbackRef.current = playback

      const client = new GeminiLiveClient()
      clientRef.current = client

      console.log('[GeminiLive] Connecting WebSocket...')
      client.connect(
        accessToken,
        liveModel,
        systemInstruction,
        {
          onSetupComplete: () => {
            console.log('[GeminiLive] Setup complete, session is live')
            setCoachPhase('live')
            void (async () => {
              try {
                const mic = new MicPcmStreamer({
                  onChunkBase64: (b64) => {
                    clientRef.current?.sendAudioPcmBase64(b64)
                  },
                })
                micRef.current = mic
                await mic.start(stream)

                if (!videoEl) {
                  return
                }
                const canvas = document.createElement('canvas')
                const vw = videoEl.videoWidth || 640
                const vh = videoEl.videoHeight || 480
                const maxW = 640
                const scale = vw > maxW ? maxW / vw : 1
                canvas.width = Math.max(1, Math.round(vw * scale))
                canvas.height = Math.max(1, Math.round(vh * scale))
                const ctx = canvas.getContext('2d')
                if (!ctx) {
                  return
                }

                videoTimerRef.current = setInterval(() => {
                  if (!clientRef.current?.isReady || !videoEl.videoWidth) {
                    return
                  }
                  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
                  canvas.toBlob(
                    (blob) => {
                      if (!blob) {
                        return
                      }
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        const dataUrl = reader.result as string
                        const comma = dataUrl.indexOf(',')
                        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
                        clientRef.current?.sendVideoJpegBase64(b64)
                      }
                      reader.readAsDataURL(blob)
                    },
                    'image/jpeg',
                    0.65,
                  )
                }, 1000)
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                setCoachError(msg)
                setCoachPhase('error')
                await stopMedia()
                closeWebSocket()
              }
            })()
          },
          onAudioBase64: (b64) => {
            const f32 = base64ToFloat32Pcm16Le(b64)
            const pb = playbackRef.current
            if (!pb) {
              return
            }
            void pb.resume().then(() => {
              pb.playFloat32(f32)
            })
          },
          onInterrupted: () => {
            playbackRef.current?.interrupt()
          },
          onInputTranscript: (text, finished) => {
            void finished
            userCaptionRef.current = text
            setUserCaption(text)
          },
          onOutputTranscript: (text, finished) => {
            void finished
            modelCaptionRef.current = text
            setModelCaption(text)
          },
          onToolCall: async (calls) => {
            const liveClient = clientRef.current
            if (!liveClient) {
              return
            }
            const functionResponses: Array<{
              name: string
              id: string
              response: Record<string, unknown>
            }> = []

            let sawFormCorrectionInBatch = false

            setAnnotationBusy(true)
            try {
              for (const fc of calls) {
                if (fc.name !== 'request_form_correction') {
                  functionResponses.push({
                    name: fc.name,
                    id: fc.id,
                    response: { error: `unknown_tool:${fc.name}` },
                  })
                  continue
                }
                if (sawFormCorrectionInBatch) {
                  functionResponses.push({
                    name: fc.name,
                    id: fc.id,
                    response: {
                      ok: false,
                      error:
                        'Only one form correction per tool message; duplicate ignored.',
                    },
                  })
                  continue
                }
                sawFormCorrectionInBatch = true

                const focus =
                  typeof fc.args.focus === 'string' ? fc.args.focus : undefined
                const fromTool = coachingTextFromToolArgs(fc.args)
                const transcriptFallback =
                  modelCaptionRef.current.trim() ||
                  userCaptionRef.current.trim() ||
                  undefined
                const hint = fromTool ?? transcriptFallback

                const gateErr = tryBeginFormCorrection()
                if (gateErr) {
                  functionResponses.push({
                    name: fc.name,
                    id: fc.id,
                    response: { ok: false, error: gateErr },
                  })
                  continue
                }
                try {
                  const res = await applyFormCorrection(focus, hint)
                  beginFormCorrectionCooldown()
                  setCorrectionImageUrl(
                    `data:${res.mimeType};base64,${res.imageBase64}`,
                  )
                  setCorrectionNotes(res.notes)
                  uploadAnnotatedStillIfPossible({
                    imageBase64: res.imageBase64,
                    mimeType: res.mimeType,
                    label: `${activeSkillTitleRef.current || 'Skill'} AI correction still`,
                    description: res.notes || hint,
                  })
                  functionResponses.push({
                    name: fc.name,
                    id: fc.id,
                    response: {
                      ok: true,
                      notesPreview: (res.notes ?? '').slice(0, 800),
                    },
                  })
                } catch (e) {
                  const err = e instanceof Error ? e.message : String(e)
                  functionResponses.push({
                    name: fc.name,
                    id: fc.id,
                    response: { ok: false, error: err },
                  })
                } finally {
                  releaseFormCorrectionInFlight()
                }
              }
              if (functionResponses.length) {
                liveClient.sendToolResponse(functionResponses)
              }
            } finally {
              setAnnotationBusy(false)
            }
          },
          onError: (msg) => {
            console.error('[GeminiLive] Error:', msg)
            setCoachError(msg)
            setCoachPhase('error')
            void stopMedia()
            closeWebSocket()
          },
          onClose: (info) => {
            console.log('[GeminiLive] WebSocket closed:', info)
            clientRef.current = null
            void stopMedia()
            setCoachPhase((prev) => {
              if (prev === 'error') {
                return 'error'
              }
              return info.code === 1000 && info.wasClean ? 'off' : 'error'
            })
            setCoachError((prevErr) => {
              if (prevErr) {
                return prevErr
              }
              if (info.code === 1000 && info.wasClean) {
                return null
              }
              const r = info.reason?.trim()
              return r || `Live WebSocket closed (code ${info.code}).`
            })
          },
        },
        { enableTranscription: true, functionDeclarations: [LIVE_FORM_CORRECTION_TOOL] },
      )
    },
    [
      applyFormCorrection,
      beginFormCorrectionCooldown,
      closeWebSocket,
      disconnectCoach,
      releaseFormCorrectionInFlight,
      stopMedia,
      tryBeginFormCorrection,
      uploadAnnotatedStillIfPossible,
    ],
  )

  useEffect(() => {
    return () => {
      void disconnectCoach()
    }
  }, [disconnectCoach])

  return {
    coachPhase,
    coachError,
    userCaption,
    modelCaption,
    connectCoach,
    disconnectCoach,
    correctionImageUrl,
    correctionNotes,
    annotationBusy,
    runManualFormCorrection,
    clearCorrection,
    formCorrectionCooldownSec,
  }
}
