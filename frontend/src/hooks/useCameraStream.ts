import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStreamStatus = 'off' | 'starting' | 'live' | 'error'

export type UseCameraStreamOptions = {
  /** Request microphone as well (needed later for Gemini Live). Default true. */
  audio?: boolean
}

function humanizeGetUserMediaError(err: unknown): string {
  if (!(err instanceof DOMException) && !(err instanceof Error)) {
    return 'Could not open camera.'
  }
  const name = 'name' in err ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permission denied. Allow camera (and mic) for this site in your browser settings.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera found.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera is in use by another app or not readable.'
    case 'OverconstrainedError':
      return 'Camera does not support the requested settings.'
    case 'SecurityError':
      return 'Camera requires a secure context (HTTPS or localhost).'
    default:
      return err.message || 'Could not open camera.'
  }
}

export function useCameraStream(options: UseCameraStreamOptions = {}) {
  const { audio = true } = options
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStreamStatus>('off')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setMediaStream(null)
    const el = videoRef.current
    if (el) {
      el.srcObject = null
    }
    setStatus('off')
    setErrorMessage(null)
  }, [])

  const start = useCallback(async () => {
    setErrorMessage(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setErrorMessage(
        'This browser does not expose getUserMedia. Use a modern browser over HTTPS or localhost.',
      )
      return
    }

    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio,
      })
      streamRef.current = stream
      setMediaStream(stream)
      const el = videoRef.current
      if (el) {
        el.srcObject = stream
        await el.play()
      }
      setStatus('live')
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setMediaStream(null)
      setStatus('error')
      setErrorMessage(humanizeGetUserMediaError(e))
    }
  }, [audio])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setMediaStream(null)
    }
  }, [])

  return {
    videoRef,
    mediaStream,
    status,
    errorMessage,
    start,
    stop,
    isLive: status === 'live',
  }
}
