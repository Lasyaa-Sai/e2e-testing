const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function getWavDurationMs(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    return 1500;
  }

  const byteRate = buffer.readUInt32LE(28);
  const dataSize = buffer.readUInt32LE(40);
  if (!byteRate || !dataSize) {
    return 1500;
  }

  return Math.ceil((dataSize / byteRate) * 1000);
}

class AudioHarness {
  constructor(options = {}) {
    this.appUrl = options.appUrl || 'http://localhost:3000';
    this.wsUrl = options.wsUrl || 'ws://localhost:5000/ws';
    this.headless = options.headless ?? true;
    this.audioInputPath = options.audioInputPath || null;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async launch() {
    const launchArgs = [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ];

    if (this.audioInputPath) {
      const resolvedAudioPath = path.resolve(this.audioInputPath);
      if (!fs.existsSync(resolvedAudioPath)) {
        throw new Error(`Audio input file not found: ${resolvedAudioPath}`);
      }
      launchArgs.push(`--use-file-for-fake-audio-capture=${resolvedAudioPath}`);
    }

    this.browser = await chromium.launch({
      headless: this.headless,
      args: launchArgs,
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 1024 },
    });

    await this.context.grantPermissions(['microphone'], {
      origin: new URL(this.appUrl).origin,
    });

    this.page = await this.context.newPage();
    await this.page.goto('about:blank');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async openApp({ scenario = '', breakMode = false, transcript = '', context = '' } = {}) {
    const url = new URL(this.appUrl);
    if (scenario) {
      url.searchParams.set('scenario', scenario);
    }
    if (transcript) {
      url.searchParams.set('transcript', transcript);
    }
    if (context) {
      url.searchParams.set('context', context);
    }
    url.searchParams.set('breakMode', breakMode ? '1' : '0');
    await this.page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await this.page.waitForFunction(() => window.__e2eAppReady === true, null, { timeout: 15000 });
  }

  async enableBreakMode(enabled) {
    await this.page.click('[data-testid="break-toggle"]');
    await this.page.waitForFunction(
      (expected) => window.__breakModeEnabled === expected,
      enabled,
      { timeout: 5000 }
    );
  }

  async sendText(message) {
    await this.page.fill('[data-testid="message-input"]', message);
    await this.page.click('[data-testid="send-button"]');
  }

  async sendVoice() {
    await this.page.click('[data-testid="voice-button"]');
    if (!this.audioInputPath) {
      return;
    }

    const recordingMs = Math.min(
      Math.max(getWavDurationMs(path.resolve(this.audioInputPath)) + 500, 1200),
      4000
    );
    await this.page.waitForTimeout(recordingMs);
    await this.page.click('[data-testid="voice-button"]');
  }

  async waitForAssistantMessage(previousCount, timeoutMs = 10000) {
    await this.page.waitForFunction(
      (count) => document.querySelectorAll('[data-role="assistant-message"], .bubble.agent').length > count,
      previousCount,
      { timeout: timeoutMs }
    );
  }

  async getAssistantMessageCount() {
    return this.page.locator('.bubble.agent').count();
  }

  async getLastAssistantMessage() {
    const messages = this.page.locator('.bubble.agent');
    const count = await messages.count();
    if (count === 0) {
      return '';
    }

    return messages.nth(count - 1).locator('.bubble-body p').textContent();
  }

  async getLastAssistantPayload() {
    return this.page.evaluate(() => window.__lastAssistantPayload || null);
  }

  async startSpeakerCapture() {
    await this.page.waitForFunction(() => window.__responseCaptureReady === true, null, {
      timeout: 10000,
    });

    await this.page.evaluate(() => {
      window.__speakerCapture = {
        chunks: [],
        recorder: null,
        startedAt: Date.now(),
      };

      const stream = window.__responseCaptureStream;
      if (!stream) {
        throw new Error('Response capture stream is not available');
      }

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          window.__speakerCapture.chunks.push(event.data);
        }
      };

      recorder.start(250);
      window.__speakerCapture.recorder = recorder;
    });
  }

  async stopSpeakerCapture(outputPath) {
    const base64 = await this.page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const capture = window.__speakerCapture;
        if (!capture || !capture.recorder) {
          resolve(null);
          return;
        }

        capture.recorder.onstop = async () => {
          try {
            const blob = new Blob(capture.chunks, { type: capture.chunks[0]?.type || 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let index = 0; index < bytes.length; index += 1) {
              binary += String.fromCharCode(bytes[index]);
            }
            resolve(window.btoa(binary));
          } catch (error) {
            reject(error);
          }
        };

        capture.recorder.stop();
      });
    });

    if (base64 && outputPath) {
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(outputPath, buffer);
    }

    return base64 ? Buffer.from(base64, 'base64') : null;
  }

  async takeScreenshot(filename) {
    await this.page.screenshot({ path: filename, fullPage: true });
  }
}

module.exports = AudioHarness;
