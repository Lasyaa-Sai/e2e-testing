import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const MAX_VOICE_RECORD_MS = 15000;
const MIN_VOICE_RECORD_MS = 900;
const SILENCE_STOP_MS = 2500;
const SILENCE_VOLUME_THRESHOLD = 0.018;

function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

function App() {
  const params = useMemo(() => getQueryParams(), []);
  const initialScenario = params.get('scenario') || '';
  const initialBreakMode = params.get('breakMode') === '1' || params.get('breakMode') === 'true';
  const initialVoiceTranscript = params.get('transcript') || '';

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [breakMode, setBreakMode] = useState(initialBreakMode);
  const [status, setStatus] = useState('Connecting to backend...');
  const [lastResponse, setLastResponse] = useState('');
  const [scenario] = useState(initialScenario);

  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const voiceCleanupRef = useRef(null);
  const voiceStartTimeRef = useRef(0);
  const voiceMaxTimerRef = useRef(null);
  const voiceTranscriptRef = useRef(initialVoiceTranscript);
  const audioContextRef = useRef(null);
  const playbackDestinationRef = useRef(null);

  useEffect(() => {
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:5000/ws';
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setStatus('Connected');
      ws.send(JSON.stringify({
        type: 'session',
        scenario,
        breakMode: initialBreakMode,
      }));
    };

    ws.onmessage = async (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      if (payload.type === 'assistant_reply') {
        const agentMessage = {
          role: 'agent',
          content: payload.response_text,
          meta: payload,
          timestamp: new Date(),
        };

        setMessages((previous) => [...previous, agentMessage]);
        setLastResponse(payload.response_text);
        window.__lastAssistantMessage = payload.response_text;
        window.__lastAssistantPayload = payload;

        window.__lastAssistantAudio = payload.audio || null;
      }
    };

    ws.onerror = () => {
      setStatus('Websocket error');
    };

    ws.onclose = () => {
      setConnected(false);
      setStatus('Disconnected');
    };

    return () => {
      ws.close();
      stopVoiceInput();
    };
  }, [initialBreakMode, scenario]);

  useEffect(() => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const playbackDestination = audioContext.createMediaStreamDestination();
    audioContextRef.current = audioContext;
    playbackDestinationRef.current = playbackDestination;
    window.__responseCaptureStream = playbackDestination.stream;
    window.__responseCaptureReady = true;

    return () => {
      window.__responseCaptureStream = null;
      window.__responseCaptureReady = false;
      audioContext.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    window.__breakModeEnabled = breakMode;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'break_mode',
        enabled: breakMode,
      }));
    }
  }, [breakMode]);

  useEffect(() => {
    window.__e2eAppReady = connected;
    window.__scenario = scenario;
  }, [connected, scenario]);

  function pushMessage(role, content) {
    setMessages((previous) => [
      ...previous,
      {
        role,
        content,
        timestamp: new Date(),
      },
    ]);
  }

  function sendText(text) {
    const message = String(text || '').trim();
    if (!message || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    pushMessage('user', message);
    setInput('');
    setIsSending(true);
    setStatus('Sending text...');
    audioContextRef.current?.resume().catch(() => {});

    wsRef.current.send(JSON.stringify({
      type: 'text',
      text: message,
      breakMode,
      scenario,
    }));

    setTimeout(() => {
      setIsSending(false);
      setStatus('Connected');
    }, 250);
  }

  function stopVoiceInput() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      return;
    }

    voiceCleanupRef.current?.();
  }

  function monitorVoiceSilence(mediaStream, recorder) {
    const SpeechAudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new SpeechAudioContext();
    const source = context.createMediaStreamSource(mediaStream);
    const analyser = context.createAnalyser();
    const samples = new Uint8Array(analyser.fftSize);
    let silenceStartedAt = 0;
    let frameId = 0;

    analyser.fftSize = 2048;
    source.connect(analyser);

    const cleanup = () => {
      window.cancelAnimationFrame(frameId);
      source.disconnect();
      context.close().catch(() => {});
      if (voiceMaxTimerRef.current) {
        window.clearTimeout(voiceMaxTimerRef.current);
        voiceMaxTimerRef.current = null;
      }
      voiceCleanupRef.current = null;
    };

    const checkVolume = () => {
      if (recorder.state === 'inactive') {
        cleanup();
        return;
      }

      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const centered = (samples[index] - 128) / 128;
        sumSquares += centered * centered;
      }

      const volume = Math.sqrt(sumSquares / samples.length);
      const now = Date.now();
      const elapsed = now - voiceStartTimeRef.current;

      if (volume < SILENCE_VOLUME_THRESHOLD) {
        silenceStartedAt = silenceStartedAt || now;
        if (elapsed >= MIN_VOICE_RECORD_MS && now - silenceStartedAt >= SILENCE_STOP_MS) {
          recorder.stop();
          cleanup();
          return;
        }
      } else {
        silenceStartedAt = 0;
      }

      frameId = window.requestAnimationFrame(checkVolume);
    };

    voiceCleanupRef.current = cleanup;
    frameId = window.requestAnimationFrame(checkVolume);
  }

  async function startVoiceInput() {
    if (isListening || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const voiceTranscript = (initialVoiceTranscript || input).trim();
    if (!voiceTranscript) {
      setStatus('Type the transcript text first, then start voice.');
      return;
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContextRef.current?.resume().catch(() => {});
    const recorder = new MediaRecorder(mediaStream);
    const chunks = [];
    recorderRef.current = recorder;
    streamRef.current = mediaStream;
    voiceTranscriptRef.current = voiceTranscript;
    voiceStartTimeRef.current = Date.now();
    setIsListening(true);
    setIsSending(true);
    setStatus('Recording voice bytes...');

    wsRef.current.send(JSON.stringify({
      type: 'voice_start',
      breakMode,
      scenario,
      transcript: voiceTranscript,
    }));

    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) {
        return;
      }

      chunks.push(event.data);
      const arrayBuffer = await event.data.arrayBuffer();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(arrayBuffer);
      }
    };

    recorder.onstop = () => {
      voiceCleanupRef.current?.();

      const transcript = voiceTranscriptRef.current.trim();
      const displayText = transcript
        ? `Voice audio sent: ${transcript}`
        : 'Voice audio bytes sent (no transcript fixture)';
      pushMessage('user', displayText);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'voice_stop',
          breakMode,
          scenario,
          transcript,
          chunkCount: chunks.length,
        }));
      }

      mediaStream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      streamRef.current = null;
      if (!initialVoiceTranscript) {
        setInput('');
      }
      setIsListening(false);
      setIsSending(false);
      setStatus('Waiting for voice response...');
    };

    recorder.start(250);
    monitorVoiceSilence(mediaStream, recorder);
    voiceMaxTimerRef.current = window.setTimeout(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, MAX_VOICE_RECORD_MS);
  }

  function toggleBreakMode() {
    setBreakMode((previous) => !previous);
  }

  const lastMessage = messages[messages.length - 1];

  return (
    <div className="shell">
      <div className="backdrop backdrop-a" />
      <div className="backdrop backdrop-b" />

      <main className="panel">
        <section className="hero">
          <div>
            <p className="eyebrow">SPARK AAC</p>
            <h1>Voice and text harness sample</h1>
            <p className="lede">
              The app sends mic bytes over websocket, plays backend audio with Web Audio API,
              and exposes a break mode for regression checks.
            </p>
          </div>

          <div className="status-card">
            <span className={`pill ${connected ? 'ready' : 'offline'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
            <span className="pill muted">{status}</span>
            {scenario ? <span className="pill muted">Scenario: {scenario}</span> : null}
          </div>
        </section>

        <section className="toolbar">
          <button
            type="button"
            className={`break-toggle ${breakMode ? 'active' : ''}`}
            onClick={toggleBreakMode}
            data-testid="break-toggle"
          >
            {breakMode ? 'Break Mode On' : 'Break Mode Off'}
          </button>
        </section>

        <section className="conversation" aria-label="Conversation log">
          {messages.length === 0 ? (
            <div className="empty">
              <p>Use text chat or click Start Voice to send mic audio to the backend.</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`bubble ${message.role}`}
                data-role={`${message.role}-message`}
              >
                <div className="bubble-label">{message.role === 'user' ? 'You' : 'Agent'}</div>
                <div className="bubble-body">
                  <p>{message.content}</p>
                  <small>{message.timestamp.toLocaleTimeString()}</small>
                </div>
              </article>
            ))
          )}
        </section>

        <section className="composer">
          <input
            data-testid="message-input"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                sendText(input);
              }
            }}
            placeholder="Type a message or voice transcript"
            disabled={isSending}
          />
          <button
            type="button"
            data-testid="send-button"
            onClick={() => sendText(input)}
            disabled={isSending || !input.trim()}
          >
            Send
          </button>
          <button
            type="button"
            data-testid="voice-button"
            className={isListening ? 'listening' : ''}
            onClick={isListening ? stopVoiceInput : startVoiceInput}
            disabled={!isListening && isSending}
          >
            {isListening ? 'Stop Voice' : 'Start Voice'}
          </button>
        </section>

        <footer className="footer">
          <span>Last response: {lastResponse || 'none yet'}</span>
          <span>{lastMessage ? `Messages: ${messages.length}` : 'Waiting for first turn'}</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
