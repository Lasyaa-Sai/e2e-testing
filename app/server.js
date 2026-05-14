const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { buildResponseAudioBase64 } = require('./audio-utils');

const PORT = Number(process.env.PORT || 5000);
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || '';
const LLM_API_BASE = process.env.LLM_API_BASE
  || process.env.OPENAI_API_BASE_URL
  || (LLM_API_KEY.startsWith('sk-or-') ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const textResponses = {
  hello: {
    intent_key: 'greeting',
    response_text: 'Hello! How can I help you today?',
  },
  hi: {
    intent_key: 'greeting',
    response_text: 'Hi there. I am ready to help.',
  },
  'what is your name': {
    intent_key: 'identity',
    response_text: 'I am the SPARK AAC sample assistant.',
  },
  'who are you': {
    intent_key: 'identity',
    response_text: 'I am the SPARK AAC sample assistant.',
  },
  'order pizza': {
    intent_key: 'pizza_order',
    response_text: 'I can help you order a pepperoni pizza.',
  },
  pizza: {
    intent_key: 'pizza_order',
    response_text: 'I can help you order a pepperoni pizza.',
  },
};

const voiceResponses = {
  voice_greeting: {
    intent_key: 'greeting',
    response_text: 'Hello! I heard the voice request and I am ready to help.',
  },
  voice_pizza_order: {
    intent_key: 'pizza_order',
    response_text: 'I can help you order a pepperoni pizza from the voice flow.',
  },
  voice_who_are_you: {
    intent_key: 'identity',
    response_text: 'I am the SPARK AAC sample assistant and I respond over websocket.',
  },
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function selectCannedResponse(message, scenario) {
  const rawScenario = String(scenario || '').toLowerCase().trim();
  const normalizedScenario = normalizeText(scenario);
  const normalizedMessage = normalizeText(message);

  for (const [key, value] of Object.entries(textResponses)) {
    if (normalizedMessage.includes(key)) {
      return value;
    }
  }

  if (rawScenario && voiceResponses[rawScenario]) {
    return voiceResponses[rawScenario];
  }

  if (normalizedScenario && voiceResponses[normalizedScenario]) {
    return voiceResponses[normalizedScenario];
  }

  return {
    intent_key: 'fallback',
    response_text: '',
  };
}

async function generateLlmResponse(message) {
  const prompt = String(message || '').trim();
  if (!LLM_API_KEY || !LLM_MODEL || !prompt) {
    return null;
  }

  try {
    const response = await fetch(`${LLM_API_BASE.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'SPARK AAC E2E Harness',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a concise, helpful AAC assistant. Answer the user directly in one or two short paragraphs.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      console.error(`LLM request failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const payload = await response.json();
    return String(payload?.choices?.[0]?.message?.content || '').trim() || null;
  } catch (error) {
    console.error(`LLM request error: ${error.message}`);
    return null;
  }
}

async function selectResponse(message, scenario) {
  const canned = selectCannedResponse(message, scenario);
  if (canned.response_text) {
    return canned;
  }

  const llmText = await generateLlmResponse(message);
  if (llmText) {
    return {
      intent_key: 'llm_fallback',
      response_text: llmText,
    };
  }

  return {
    intent_key: 'fallback',
    response_text: `I heard: ${message}. Tell me a little more.`,
  };
}

function brokenResponse() {
  return {
    intent_key: 'broken',
    response_text: 'salve mundo corvo delta delta una frase senza senso',
  };
}

async function createAssistantPayload({ mode, message, scenario, breakMode, receivedAudioBytes }) {
  const start = Date.now();
  const selected = breakMode ? brokenResponse() : await selectResponse(message, scenario);
  const includeSyntheticAudio = process.env.PLAY_SYNTHETIC_AUDIO === 'true';
  const audioBase64 = includeSyntheticAudio ? buildResponseAudioBase64(selected.response_text) : null;

  return {
    type: 'assistant_reply',
    mode,
    intent_key: selected.intent_key,
    response_text: selected.response_text,
    audio: audioBase64
      ? {
        mime_type: 'audio/wav',
        base64: audioBase64,
        synthetic: true,
      }
      : null,
    received_audio_bytes: receivedAudioBytes || 0,
    latency_ms: Date.now() - start,
    timestamp: new Date().toISOString(),
  };
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'spark-aac-voice-text-sample',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  const session = {
    breakMode: false,
    scenario: '',
    pendingVoice: false,
    voiceChunks: [],
    voiceTranscript: '',
    voiceStartedAt: 0,
  };

  socket.send(JSON.stringify({
    type: 'hello',
    timestamp: new Date().toISOString(),
  }));

  socket.on('message', async (payload, isBinary) => {
    if (isBinary) {
      session.voiceChunks.push(Buffer.from(payload));
      return;
    }

    let data;
    try {
      data = JSON.parse(payload.toString());
    } catch (error) {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON payload',
      }));
      return;
    }

    if (data.type === 'session') {
      session.breakMode = Boolean(data.breakMode);
      session.scenario = data.scenario || '';
      return;
    }

    if (data.type === 'break_mode') {
      session.breakMode = Boolean(data.enabled);
      return;
    }

    if (data.type === 'text') {
      const response = await createAssistantPayload({
        mode: 'text',
        message: data.text,
        scenario: data.scenario,
        breakMode: Boolean(data.breakMode ?? session.breakMode),
      });

      socket.send(JSON.stringify(response));
      return;
    }

    if (data.type === 'voice_start') {
      session.pendingVoice = true;
      session.voiceChunks = [];
      session.voiceTranscript = String(data.transcript || '').trim();
      session.voiceStartedAt = Date.now();
      session.breakMode = Boolean(data.breakMode ?? session.breakMode);
      session.scenario = data.scenario || session.scenario;
      return;
    }

    if (data.type === 'voice_stop') {
      const receivedAudioBytes = session.voiceChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const voiceTranscript = String(data.transcript || session.voiceTranscript || '').trim();
      const response = voiceTranscript
        ? await createAssistantPayload({
          mode: 'voice',
          message: voiceTranscript,
          scenario: data.scenario || session.scenario,
          breakMode: Boolean(data.breakMode ?? session.breakMode),
          receivedAudioBytes,
        })
        : {
          type: 'assistant_reply',
          mode: 'voice',
          intent_key: 'missing_voice_transcript',
          response_text: `Received ${receivedAudioBytes} voice audio bytes over WebSocket. No transcript fixture was provided, so the backend cannot infer the spoken content without a voice model.`,
          audio: null,
          received_audio_bytes: receivedAudioBytes,
          latency_ms: 0,
          timestamp: new Date().toISOString(),
        };

      response.voice_capture_ms = session.voiceStartedAt ? Date.now() - session.voiceStartedAt : 0;
      response.input_transcript = voiceTranscript;
      socket.send(JSON.stringify(response));

      session.pendingVoice = false;
      session.voiceChunks = [];
      session.voiceTranscript = '';
      session.voiceStartedAt = 0;
      return;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Voice/text sample backend running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint available at ws://localhost:${PORT}/ws`);
});
