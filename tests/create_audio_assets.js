const fs = require('fs');
const path = require('path');

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function writeWav(filePath, samples, sampleRate = 22050) {
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
    const sample = Math.round(clamp(samples[index]) * 32767);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

function buildSamples(seedText, sampleRate = 22050) {
  const samples = [];
  const chars = String(seedText).trim().split('');
  const framesPerChar = Math.floor(sampleRate * 0.12);
  const gapFrames = Math.floor(sampleRate * 0.035);
  let phase = 0;

  chars.forEach((char) => {
    const frequency = 180 + (char.toLowerCase().charCodeAt(0) % 16) * 24;
    if (char === ' ') {
      for (let i = 0; i < gapFrames * 2; i += 1) {
        samples.push(0);
      }
      return;
    }

    for (let frame = 0; frame < framesPerChar; frame += 1) {
      const envelope = Math.sin(Math.PI * (frame / framesPerChar));
      samples.push(Math.sin(phase) * 0.34 * envelope);
      phase += (2 * Math.PI * frequency) / sampleRate;
    }

    for (let i = 0; i < gapFrames; i += 1) {
      samples.push(0);
    }
  });

  for (let i = 0; i < sampleRate * 0.1; i += 1) {
    samples.push(0);
  }

  return samples;
}

function main() {
  const root = path.resolve(__dirname, 'audio_assets');
  fs.mkdirSync(root, { recursive: true });

  const assets = [
    ['hello.wav', 'hello'],
    ['order_pizza.wav', 'order pizza'],
    ['who_are_you.wav', 'who are you'],
    ['break_mode.wav', 'gibberish'],
  ];

  assets.forEach(([filename, phrase]) => {
    const filePath = path.join(root, filename);
    writeWav(filePath, buildSamples(phrase));
  });

  console.log(`Generated ${assets.length} audio assets in ${root}`);
}

main();
