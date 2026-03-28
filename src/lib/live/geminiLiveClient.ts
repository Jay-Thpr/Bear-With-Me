/**
 * Ephemeral-token Gemini Live client (v1alpha BidiGenerateContentConstrained).
 * Browser connects directly to Gemini — API key stays on the server.
 */
const EPHEMERAL_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

export type FunctionCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type GeminiLiveHandlers = {
  onSetupComplete: () => void;
  onAudioBase64: (base64: string) => void;
  onOutputTranscript?: (text: string, finished: boolean) => void;
  onInputTranscript?: (text: string, finished: boolean) => void;
  onInterrupted: () => void;
  onToolCall?: (calls: FunctionCall[]) => void;
  onError: (message: string) => void;
  onClose: (info: { code: number; reason: string; wasClean: boolean }) => void;
};

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function buildSetupPayload(
  modelId: string,
  systemInstruction: string,
  functionDeclarations: unknown[],
  options: { enableTranscription: boolean },
) {
  const setup: Record<string, unknown> = {
    model: `models/${modelId}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      temperature: 1,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
      },
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations }],
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        silenceDurationMs: 2000,
        prefixPaddingMs: 500,
        endOfSpeechSensitivity: "END_SENSITIVITY_UNSPECIFIED",
        startOfSpeechSensitivity: "START_SENSITIVITY_UNSPECIFIED",
      },
      activityHandling: "ACTIVITY_HANDLING_UNSPECIFIED",
      turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
    },
  };

  if (options.enableTranscription) {
    setup.inputAudioTranscription = {};
    setup.outputAudioTranscription = {};
  }

  return { setup };
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private ready = false;

  get isReady(): boolean {
    return this.ready;
  }

  connect(
    accessToken: string,
    modelId: string,
    systemInstruction: string,
    functionDeclarations: unknown[],
    handlers: GeminiLiveHandlers,
    options: { enableTranscription?: boolean } = {},
  ): void {
    this.close();
    const url = `${EPHEMERAL_WS_URL}?access_token=${encodeURIComponent(accessToken)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      const payload = buildSetupPayload(modelId, systemInstruction, functionDeclarations, {
        enableTranscription: options.enableTranscription ?? true,
      });
      this.ws?.send(JSON.stringify(payload));
    };

    this.ws.onmessage = async (event: MessageEvent<string | Blob | ArrayBuffer>) => {
      let text: string;
      if (event.data instanceof Blob) {
        text = await event.data.text();
      } else if (event.data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(event.data);
      } else {
        text = event.data;
      }

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(text) as Record<string, unknown>;
      } catch {
        handlers.onError("Invalid JSON from Gemini Live");
        return;
      }

      if (msg.error) {
        handlers.onError(JSON.stringify(msg.error));
        return;
      }

      if (msg.setupComplete != null || msg.setup_complete != null) {
        this.ready = true;
        handlers.onSetupComplete();
        return;
      }

      // Function calls from Gemini
      const toolCall = asRecord(msg.toolCall ?? msg.tool_call);
      if (toolCall && handlers.onToolCall) {
        const rawCalls =
          (toolCall.functionCalls as unknown[]) ??
          (toolCall.function_calls as unknown[]) ??
          [];
        const calls: FunctionCall[] = rawCalls
          .map((c) => asRecord(c))
          .filter(Boolean)
          .map((c) => ({
            id: String(c!.id ?? ""),
            name: String(c!.name ?? ""),
            args: (asRecord(c!.args) ?? {}) as Record<string, unknown>,
          }));
        if (calls.length > 0) handlers.onToolCall(calls);
        return;
      }

      const serverContent = asRecord(msg.serverContent ?? msg.server_content);
      if (!serverContent) return;

      if (serverContent.interrupted === true) handlers.onInterrupted();

      const modelTurn = asRecord(serverContent.modelTurn ?? serverContent.model_turn);
      const parts = modelTurn?.parts as Array<Record<string, unknown>> | undefined;
      if (parts?.length) {
        for (const part of parts) {
          const inline = asRecord(part.inlineData ?? part.inline_data);
          const data = inline?.data;
          if (typeof data === "string") handlers.onAudioBase64(data);
        }
      }

      const out = asRecord(serverContent.outputTranscription ?? serverContent.output_transcription);
      if (out && handlers.onOutputTranscript) {
        const t = out.text;
        handlers.onOutputTranscript(typeof t === "string" ? t : "", Boolean(out.finished));
      }

      const inp = asRecord(serverContent.inputTranscription ?? serverContent.input_transcription);
      if (inp && handlers.onInputTranscript) {
        const t = inp.text;
        handlers.onInputTranscript(typeof t === "string" ? t : "", Boolean(inp.finished));
      }
    };

    this.ws.onerror = () => handlers.onError("WebSocket connection error");

    this.ws.onclose = (event: CloseEvent) => {
      this.ready = false;
      this.ws = null;
      handlers.onClose({ code: event.code, reason: event.reason || "", wasClean: event.wasClean });
    };
  }

  sendAudioPcmBase64(base64: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.ready) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: base64 } },
      }),
    );
  }

  sendVideoJpegBase64(base64: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.ready) return;
    this.ws.send(
      JSON.stringify({
        realtimeInput: { video: { mimeType: "image/jpeg", data: base64 } },
      }),
    );
  }

  sendToolResponse(calls: FunctionCall[], result: unknown = "ok"): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        tool_response: {
          function_responses: calls.map((c) => ({
            id: c.id,
            name: c.name,
            response: { result },
          })),
        },
      }),
    );
  }

  close(): void {
    this.ready = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    this.ws = null;
  }
}
