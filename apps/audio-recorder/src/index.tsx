import { useEffect, useRef, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText } from "@slap/ui";

type MicState = "idle" | "ready" | "recording" | "error";
type RecordingTake = {
  id: string;
  label: string;
  url: string;
};
type PersistedState = {
  takes: RecordingTake[];
};

const STORAGE_PATH = "audio-recorder-state.json";

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Audio Recorder</strong>
    <p>Record audio, play it back, and monitor room loudness.</p>
  </article>
);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert recording data."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to convert recording data."));
    reader.readAsDataURL(blob);
  });

const isPersistedState = (value: unknown): value is PersistedState => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.takes)) return false;

  return candidate.takes.every((take) => {
    if (typeof take !== "object" || take === null) return false;
    const t = take as Record<string, unknown>;
    return typeof t.id === "string" && typeof t.label === "string" && typeof t.url === "string";
  });
};

const AudioRecorderApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [micState, setMicState] = useState<MicState>("idle");
  const [statusText, setStatusText] = useState("Enable microphone to monitor room loudness.");
  const [loudness, setLoudness] = useState(0);
  const [takes, setTakes] = useState<RecordingTake[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopMeter = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const startMeter = () => {
    stopMeter();

    const analyser = analyserRef.current;
    if (!analyser) return;

    const buffer = new Uint8Array(analyser.fftSize);

    const tick = () => {
      const isRecording = recorderRef.current?.state === "recording";
      if (isRecording) {
        setLoudness(0);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      analyser.getByteTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const centered = (buffer[i] - 128) / 128;
        sumSquares += centered * centered;
      }

      const rms = Math.sqrt(sumSquares / buffer.length);
      const scaled = clamp(Math.round(rms * 180), 0, 100);
      setLoudness((current) => Math.round(current * 0.7 + scaled * 0.3));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const ensureMicrophone = async () => {
    if (streamRef.current) return streamRef.current;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicState("error");
      setStatusText("Microphone API is not available in this browser.");
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const context = new AudioContext();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      setMicState("ready");
      setStatusText("Microphone ready. Loudness meter is active.");
      startMeter();
      return stream;
    } catch {
      setMicState("error");
      setStatusText("Microphone permission denied or unavailable.");
      return null;
    }
  };

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined") {
      setMicState("error");
      setStatusText("Recording is not supported in this browser.");
      return;
    }

    const stream = await ensureMicrophone();
    if (!stream) return;

    if (recorderRef.current?.state === "recording") return;

    try {
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = chunksRef.current[0]?.type || recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });

        void (async () => {
          try {
            const url = await blobToDataUrl(blob);
            const createdAt = new Date();

            setTakes((current) => [
              {
                id: `${createdAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
                label: `Take ${current.length + 1} (${createdAt.toLocaleTimeString()})`,
                url
              },
              ...current
            ]);
            setStatusText("Recording saved.");
          } catch {
            setStatusText("Recording finished, but save failed.");
          } finally {
            setMicState("ready");
            startMeter();
          }
        })();
      };

      recorder.start(200);
      setMicState("recording");
      setStatusText("Recording...");
    } catch {
      setMicState("error");
      setStatusText("Unable to start recording.");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
  };

  const deleteTake = (id: string) => {
    setTakes((current) => current.filter((take) => take.id !== id));
  };

  const clearTakes = () => {
    setTakes([]);
  };

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) {
        setHasLoaded(true);
        return;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (isPersistedState(parsed)) {
          setTakes(parsed.takes);
          if (parsed.takes.length > 0) {
            setStatusText(`Loaded ${parsed.takes.length} recording(s).`);
          }
        } else {
          setStatusText("Saved recordings were invalid. Starting fresh.");
        }
      } catch {
        setStatusText("Saved recordings were invalid. Starting fresh.");
      } finally {
        setHasLoaded(true);
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    if (!hasLoaded) return;
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify({ takes }));
  }, [ctx.vfs, hasLoaded, takes]);

  useEffect(() => {
    return () => {
      stopMeter();

      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <SlapApplicationShell title="Audio Recorder">
      <SlapInlineText>{statusText}</SlapInlineText>

      <div
        style={{
          display: "grid",
          gap: "8px",
          marginBottom: "8px"
        }}
      >
        <SlapInlineText>Loudness (when not recording): {loudness}%</SlapInlineText>
        <div
          style={{
            height: "12px",
            borderRadius: "999px",
            border: "1px solid rgba(0,0,0,0.2)",
            background: "#ece8dd",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              width: `${loudness}%`,
              height: "100%",
              background: "linear-gradient(90deg, #3e8f5a 0%, #cfb247 60%, #bb4d3b 100%)",
              transition: "width 80ms linear"
            }}
          />
        </div>
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="Enable Mic" onClick={() => void ensureMicrophone()} disabled={micState === "recording"} />
        <SlapActionButton title="Start Recording" onClick={() => void startRecording()} disabled={micState === "recording"} />
        <SlapActionButton title="Stop" onClick={stopRecording} disabled={micState !== "recording"} />
        <SlapActionButton title="Clear Takes" onClick={clearTakes} disabled={takes.length === 0 || micState === "recording"} />
      </div>

      {takes.length > 0 ? (
        <div style={{ marginTop: "8px" }}>
          <SlapInlineText>Recordings ({takes.length})</SlapInlineText>
          <div style={{ display: "grid", gap: "10px" }}>
            {takes.map((take) => (
              <article
                key={take.id}
                style={{
                  border: "1px solid rgba(0, 0, 0, 0.15)",
                  borderRadius: "10px",
                  padding: "8px",
                  background: "#f6f3ea"
                }}
              >
                <SlapInlineText>{take.label}</SlapInlineText>
                <audio controls src={take.url} style={{ width: "100%" }} />
                <div className="slap-button-row">
                  <SlapActionButton title="Delete" onClick={() => deleteTake(take.id)} disabled={micState === "recording"} />
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </SlapApplicationShell>
  );
};

export const audioRecorderManifest: SlapApplicationManifest = {
  id: "audio-recorder",
  title: "Audio Recorder",
  author: "Joel",
  description: "Record audio, play back takes, and monitor room loudness.",
  icon: "🎙️",
  Preview,
  Application: AudioRecorderApp
};
