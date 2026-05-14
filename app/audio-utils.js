const SAMPLE_RATE = 22050;

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function writeWavBuffer(samples, sampleRate = SAMPLE_RATE) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.round(clampSample(samples[index]) * 32767);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }

  return buffer;
}

function phraseToSamples(text, sampleRate = SAMPLE_RATE) {
  const normalized = String(text || '').trim();
  const safeText = normalized.length > 0 ? normalized : 'assistant response';
  const samples = [];
  const charDurationSeconds = 0.085;
  const silenceDurationSeconds = 0.03;
  const charFrames = Math.max(1, Math.floor(sampleRate * charDurationSeconds));
  const silenceFrames = Math.floor(sampleRate * silenceDurationSeconds);
  let phase = 0;

  for (let index = 0; index < safeText.length; index += 1) {
    const char = safeText[index];
    if (char === ' ') {
      for (let i = 0; i < silenceFrames * 2; i += 1) {
        samples.push(0);
      }
      continue;
    }

    const frequency = 180 + (char.toLowerCase().charCodeAt(0) % 24) * 18;
    for (let frame = 0; frame < charFrames; frame += 1) {
      const envelope = Math.sin(Math.PI * (frame / charFrames));
      const value = Math.sin(phase) * 0.28 * envelope;
      samples.push(value);
      phase += (2 * Math.PI * frequency) / sampleRate;
    }

    for (let i = 0; i < silenceFrames; i += 1) {
      samples.push(0);
    }
  }

  const tailFrames = Math.floor(sampleRate * 0.12);
  for (let i = 0; i < tailFrames; i += 1) {
    samples.push(0);
  }

  return samples;
}

function buildResponseAudioBase64(text) {
  const samples = phraseToSamples(text);
  const wavBuffer = writeWavBuffer(samples);
  return wavBuffer.toString('base64');
}

module.exports = {
  SAMPLE_RATE,
  buildResponseAudioBase64,
  phraseToSamples,
  writeWavBuffer,
};
