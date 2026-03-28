/**
 * Schedules Gemini Live output chunks (24 kHz mono PCM16 decoded to float32) on an AudioContext.
 */
export class PcmPlaybackScheduler {
  private readonly ctx: AudioContext;
  private readonly sampleRate: number;
  private nextPlayTime = 0;
  private readonly active: AudioBufferSourceNode[] = [];

  constructor(sampleRate = 24_000) {
    this.sampleRate = sampleRate;
    this.ctx = new AudioContext({ sampleRate });
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  playFloat32(mono: Float32Array): void {
    if (mono.length === 0) return;
    const buffer = this.ctx.createBuffer(1, mono.length, this.sampleRate);
    buffer.copyToChannel(Float32Array.from(mono), 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    if (this.nextPlayTime < now) this.nextPlayTime = now;
    src.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
    this.active.push(src);
    src.onended = () => {
      const i = this.active.indexOf(src);
      if (i >= 0) this.active.splice(i, 1);
    };
  }

  /** Stop queued playback (barge-in / new turn). */
  interrupt(): void {
    this.nextPlayTime = this.ctx.currentTime;
    for (const s of this.active) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.active.length = 0;
  }

  async close(): Promise<void> {
    this.interrupt();
    await this.ctx.close();
  }
}
