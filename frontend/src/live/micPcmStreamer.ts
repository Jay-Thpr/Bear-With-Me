import {
  arrayBufferToBase64,
  float32ToPcm16Le,
  resampleFloat32,
} from './pcmUtils'

const CAPTURE_WORKLET = `
class GeminiMicCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch0 = inputs[0]?.[0];
    if (ch0 && ch0.length > 0) {
      const copy = new Float32Array(ch0.length);
      copy.set(ch0);
      this.port.postMessage(copy);
    }
    return true;
  }
}
registerProcessor('gemini-mic-capture', GeminiMicCapture);
`

const TARGET_RATE = 16_000

export type MicPcmStreamerOptions = {
  onChunkBase64: (pcm16Base64: string) => void
}

/**
 * Pulls mono PCM from a MediaStream's audio track, resamples to 16 kHz, emits base64 PCM16 LE chunks.
 */
export class MicPcmStreamer {
  private options: MicPcmStreamerOptions
  private context: AudioContext | null = null
  private worklet: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private actualRate = TARGET_RATE

  constructor(options: MicPcmStreamerOptions) {
    this.options = options
  }

  async start(stream: MediaStream): Promise<void> {
    await this.stop()
    const track = stream.getAudioTracks()[0]
    if (!track) {
      throw new Error('MediaStream has no audio track')
    }
    this.context = new AudioContext()
    this.actualRate = this.context.sampleRate

    const blob = new Blob([CAPTURE_WORKLET], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    try {
      await this.context.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }

    this.worklet = new AudioWorkletNode(this.context, 'gemini-mic-capture')
    this.worklet.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const chunk = ev.data
      if (!chunk?.length) {
        return
      }
      const mono =
        this.actualRate === TARGET_RATE
          ? chunk
          : resampleFloat32(chunk, this.actualRate, TARGET_RATE)
      const pcm = float32ToPcm16Le(mono)
      this.options.onChunkBase64(arrayBufferToBase64(pcm))
    }

    this.source = this.context.createMediaStreamSource(stream)
    this.source.connect(this.worklet)
    const mute = this.context.createGain()
    mute.gain.value = 0
    this.worklet.connect(mute)
    mute.connect(this.context.destination)

    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
  }

  async stop(): Promise<void> {
    if (this.worklet) {
      this.worklet.disconnect()
      this.worklet.port.onmessage = null
      this.worklet = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.context) {
      await this.context.close()
      this.context = null
    }
  }
}
