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

  console.log('Phase 2 harness');
  console.log(`Config: ${args.config}`);
  console.log(`App:    ${args.appUrl}`);
  console.log(`WS:     ${args.wsUrl}`);
  console.log('');

  for (const testCase of testCases) {
    const caseStart = Date.now();
    const isMultiTurn = Array.isArray(testCase.turns);
    const turns = isMultiTurn ? testCase.turns : [testCase];

    const harness = new AudioHarness({
      appUrl: args.appUrl,
      wsUrl: args.wsUrl,
      headless: args.headless,
      audioInputPath: turns[0].type === 'voice' ? path.resolve(path.dirname(args.config), '..', turns[0].input_audio) : null,
    });

    let status = 'error';
    let reason = 'Unknown error';

    try {
      await harness.launch();
      await harness.openApp({
        scenario: testCase.scenario || testCase.test_id,
        transcript: turns[0].input_transcript || '',
        context: testCase.context || '',
        breakMode: false,
      });

      if (testCase.should_enable_break_mode) {
        await harness.enableBreakMode(true);
      }

      const turnResults = [];
      let allPassed = true;
      let lastReason = '';

      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const beforeCount = await harness.getAssistantMessageCount();
        await harness.startSpeakerCapture();

        if (turn.type === 'text') {
          await harness.sendText(turn.input);
        } else if (turn.type === 'voice') {
          await harness.sendVoice();
        } else {
          throw new Error(`Unsupported test type: ${turn.type}`);
        }

        await harness.waitForAssistantMessage(beforeCount, turn.latency_threshold_ms || 15000);
        const transcript = await harness.getLastAssistantMessage();
        const payload = await harness.getLastAssistantPayload();

        const capturePath = path.resolve(__dirname, `../output.capture.turn${i}.webm`);
        await harness.stopSpeakerCapture(capturePath);

        let audioPath = '';
        if (payload?.audio?.base64) {
          audioPath = path.resolve(__dirname, `../output.turn${i}.wav`);
          fs.writeFileSync(audioPath, Buffer.from(payload.audio.base64, 'base64'));
        }

        const judgement = judgeResponse(transcript, turn.expected_intent || '');
        const turnStatus = classifyStatus(judgement.pass ? 'pass' : 'fail', Boolean(turn.expected_fail));
        reason = judgement.reason;
        lastReason = reason;

        if (turnStatus !== 'pass') {
          allPassed = false;
        }

        turnResults.push({
          turn_index: i,
          type: turn.type,
          status: turnStatus,
          reason,
          expected_intent: turn.expected_intent || '',
          transcript,
          similarity_score: judgement.similarity_score,
          audio_output_path: audioPath,
          speaker_capture_path: capturePath,
          audio_bytes_received: payload?.received_audio_bytes || 0,
        });
      }

      status = allPassed ? 'pass' : 'fail';

      results.push({
        test_id: testCase.test_id,
        type: isMultiTurn ? 'conversation' : testCase.type,
        status,
        latency_ms: Date.now() - caseStart,
        turns: turnResults,
        context: testCase.context || '',
      });

      const icon = status === 'pass' ? 'PASS' : 'FAIL';
      console.log(`${icon} ${testCase.test_id} (${Date.now() - caseStart}ms)`);
      if (status !== 'pass') {
        console.log(`  Failed at one or more turns: ${lastReason}`);
      }
    } catch (error) {
      status = 'error';
      reason = error.message;
      results.push({
        test_id: testCase.test_id,
        type: Array.isArray(testCase.turns) ? 'conversation' : testCase.type,
        status,
        reason,
        latency_ms: Date.now() - caseStart,
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
