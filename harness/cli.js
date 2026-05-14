#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const AudioHarness = require('./AudioHarness');
const { judgeResponse } = require('../brain/judge');

function parseArgs(argv) {
  const result = {
    config: path.resolve(__dirname, '../tests/test_cases.yaml'),
    headless: process.env.HEADLESS !== 'false',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    wsUrl: process.env.WS_URL || 'ws://localhost:5000/ws',
    output: path.resolve(__dirname, '../report.json'),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--config' && next) {
      result.config = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--headless' && next) {
      result.headless = next !== 'false';
      index += 1;
    } else if (arg === '--app-url' && next) {
      result.appUrl = next;
      index += 1;
    } else if (arg === '--ws-url' && next) {
      result.wsUrl = next;
      index += 1;
    } else if (arg === '--output' && next) {
      result.output = path.resolve(process.cwd(), next);
      index += 1;
    }
  }

  return result;
}

function loadPlan(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
    return JSON.parse(raw);
  }

  return yaml.load(raw);
}

function normalizePlan(plan) {
  if (Array.isArray(plan)) {
    return { test_cases: plan };
  }

  return plan;
}

function classifyStatus(rawStatus, expectedFail) {
  if (expectedFail) {
    return rawStatus === 'fail' ? 'pass' : 'fail';
  }

  return rawStatus;
}

async function run() {
  const args = parseArgs(process.argv);
  const plan = normalizePlan(loadPlan(args.config));
  const testCases = plan.test_cases || [];

  if (testCases.length === 0) {
    throw new Error(`No test cases found in ${args.config}`);
  }

  const startTime = Date.now();
  const results = [];

  console.log('SPARK AAC Phase 2 harness');
  console.log(`Config: ${args.config}`);
  console.log(`App:    ${args.appUrl}`);
  console.log(`WS:     ${args.wsUrl}`);
  console.log('');

  for (const testCase of testCases) {
    const caseStart = Date.now();
    const harness = new AudioHarness({
      appUrl: args.appUrl,
      wsUrl: args.wsUrl,
      headless: args.headless,
      audioInputPath: testCase.type === 'voice' ? testCase.input_audio : null,
    });

    let status = 'error';
    let reason = 'Unknown error';
    let transcript = '';
    let audioPath = '';
    let payload = null;

    try {
      await harness.launch();
      await harness.openApp({
        scenario: testCase.scenario || testCase.test_id,
        transcript: testCase.input_transcript || '',
        breakMode: false,
      });

      if (testCase.should_enable_break_mode) {
        await harness.enableBreakMode(true);
      }

      const beforeCount = await harness.getAssistantMessageCount();
      await harness.startSpeakerCapture();

      if (testCase.type === 'text') {
        await harness.sendText(testCase.input);
      } else if (testCase.type === 'voice') {
        await harness.sendVoice();
      } else {
        throw new Error(`Unsupported test type: ${testCase.type}`);
      }

      await harness.waitForAssistantMessage(beforeCount, testCase.latency_threshold_ms || 10000);
      transcript = await harness.getLastAssistantMessage();
      payload = await harness.getLastAssistantPayload();
      const capturePath = path.resolve(__dirname, '../output.capture.webm');
      await harness.stopSpeakerCapture(capturePath);
      audioPath = path.resolve(__dirname, '../output.wav');
      if (payload?.audio?.base64) {
        fs.writeFileSync(audioPath, Buffer.from(payload.audio.base64, 'base64'));
      } else {
        audioPath = '';
      }

      const judgement = judgeResponse(transcript, testCase.expected_intent || '');
      status = classifyStatus(judgement.pass ? 'pass' : 'fail', Boolean(testCase.expected_fail));
      reason = judgement.reason;

      results.push({
        test_id: testCase.test_id,
        type: testCase.type,
        status,
        reason,
        expected_intent: testCase.expected_intent || '',
        transcript,
        input_transcript: payload?.input_transcript || testCase.input_transcript || '',
        similarity_score: judgement.similarity_score,
        latency_ms: Date.now() - caseStart,
        audio_output_path: audioPath,
        speaker_capture_path: capturePath,
        audio_bytes_received: payload?.received_audio_bytes || 0,
        response_mode: payload?.mode || testCase.type,
      });

      const icon = status === 'pass' ? 'PASS' : 'FAIL';
      console.log(`${icon} ${testCase.test_id} (${Date.now() - caseStart}ms)`);
      console.log(`  ${reason}`);
    } catch (error) {
      status = 'error';
      reason = error.message;
      results.push({
        test_id: testCase.test_id,
        type: testCase.type,
        status,
        reason,
        expected_intent: testCase.expected_intent || '',
        transcript,
        input_transcript: testCase.input_transcript || '',
        similarity_score: 0,
        latency_ms: Date.now() - caseStart,
        audio_output_path: audioPath,
        speaker_capture_path: path.resolve(__dirname, '../output.capture.webm'),
      });
      console.log(`ERROR ${testCase.test_id}`);
      console.log(`  ${reason}`);
    } finally {
      await harness.close();
      console.log('');
    }
  }

  const summary = {
    total_tests: results.length,
    passed: results.filter((entry) => entry.status === 'pass').length,
    failed: results.filter((entry) => entry.status === 'fail').length,
    errors: results.filter((entry) => entry.status === 'error').length,
    duration_ms: Date.now() - startTime,
  };

  summary.pass_rate = summary.total_tests === 0
    ? '0.00%'
    : `${((summary.passed / summary.total_tests) * 100).toFixed(2)}%`;

  const report = {
    summary,
    generated_at: new Date().toISOString(),
    results,
  };

  fs.writeFileSync(args.output, JSON.stringify(report, null, 2));

  console.log('Summary');
  console.log(`  Total:   ${summary.total_tests}`);
  console.log(`  Passed:  ${summary.passed}`);
  console.log(`  Failed:  ${summary.failed}`);
  console.log(`  Errors:  ${summary.errors}`);
  console.log(`  Rate:    ${summary.pass_rate}`);
  console.log(`  Output:  ${args.output}`);

  process.exit(summary.failed > 0 || summary.errors > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
