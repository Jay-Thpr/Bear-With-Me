import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLiveEphemeralToken } from '../api/live'
import { GeminiLiveClient } from '../live/geminiLiveClient'
import { MicPcmStreamer } from '../live/micPcmStreamer'
import { base64ToFloat32Pcm16Le } from '../live/pcmUtils'
import { PcmPlaybackScheduler } from '../live/pcmPlayback'

const COACH_SYSTEM = `You are a concise, encouraging real-time skills coach. The learner is on camera and microphone. Give short, specific spoken feedback. Ask brief questions when you need clarity.`

export function useGeminiLiveSession() {
  const clientRef = useRef<GeminiLiveClient | null>(null)
  const micRef = useRef<MicPcmStreamer | null>(null)
  const playbackRef = useRef<PcmPlaybackScheduler | null>(null)
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [coachPhase, setCoachPhase] = useState<'off' | 'connecting' | 'live' | 'error'>('off')
  const [coachError, setCoachError] = useState<string | null>(null)
  const [userCaption, setUserCaption] = useState('')
  const [modelCaption, setModelCaption] = useState('')

  const stopMedia = useCallback(async () => {
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current)
      videoTimerRef.current = null
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
  }, [stopMedia, closeWebSocket])

  const connectCoach = useCallback(
    async (stream: MediaStream, videoEl: HTMLVideoElement | null) => {
      await disconnectCoach()

      setUserCaption('')
      setModelCaption('')
      setCoachPhase('connecting')
      setCoachError(null)

      let accessToken: string
      let liveModel: string
      try {
        const tokenRes = await fetchLiveEphemeralToken()
        accessToken = tokenRes.accessToken
        liveModel = tokenRes.liveModel
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : 'Could not get Live token from the API. Is the backend running with GEMINI_API_KEY?'
        setCoachError(msg)
        setCoachPhase('error')
        return
      }

      const playback = new PcmPlaybackScheduler(24_000)
      playbackRef.current = playback

      const client = new GeminiLiveClient()
      clientRef.current = client

      client.connect(accessToken, liveModel, COACH_SYSTEM, {
        onSetupComplete: () => {
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
        onInputTranscript: (text) => {
          setUserCaption(text)
        },
        onOutputTranscript: (text) => {
          setModelCaption(text)
        },
        onError: (msg) => {
          setCoachError(msg)
          setCoachPhase('error')
          void stopMedia()
          closeWebSocket()
        },
        onClose: (info) => {
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
      })
    },
    [closeWebSocket, disconnectCoach, stopMedia],
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
  }
}
