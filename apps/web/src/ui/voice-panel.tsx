import { useRef, useState } from "react";

type VoiceStatus = "idle" | "recording" | "transcribing" | "error";

export function VoicePanel(props: { readonly apiUrl: string; readonly token: string }) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setError(null);
    setTranscript("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone API not available in this browser");
      setStatus("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void finalize(recorder.mimeType || "audio/webm");
      };
      recorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "microphone permission denied");
      setStatus("error");
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    setStatus("transcribing");
    recorder.stop();
  }

  async function finalize(mimeType: string) {
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      const audioBase64 = bytesToBase64(new Uint8Array(buffer));
      const response = await fetch(new URL("/api/voice/stt", props.apiUrl).toString(), {
        body: JSON.stringify({ audioBase64, mimeType }),
        headers: {
          "content-type": "application/json",
          ...(props.token ? { authorization: `Bearer ${props.token}` } : {})
        },
        method: "POST"
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const body = await response.json() as { text?: string };
      setTranscript(typeof body.text === "string" ? body.text : "");
      setStatus("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "transcription failed");
      setStatus("error");
    }
  }

  return (
    <section className="tool-surface" aria-label="Voice input">
      <div className="surface-heading">
        <h2>Voice</h2>
        <span>{status}</span>
      </div>
      <div className="voice-controls">
        {status === "recording" ? (
          <button type="button" onClick={stop}>Stop</button>
        ) : (
          <button
            type="button"
            disabled={status === "transcribing"}
            onClick={() => { void start(); }}
          >
            {status === "transcribing" ? "Transcribing..." : "Record"}
          </button>
        )}
      </div>
      {transcript && (
        <output className="voice-output">
          Heard: {transcript}
        </output>
      )}
      {error && (
        <output className="voice-output voice-error">
          Error: {error}
        </output>
      )}
    </section>
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  // Browser-only: this is reached from the MediaRecorder onstop handler,
  // which is gated by `navigator.mediaDevices.getUserMedia`. SSR never
  // runs it. `btoa` is the standard browser global.
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
