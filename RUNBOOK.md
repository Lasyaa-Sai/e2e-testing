# SPARK AAC Phase 2 Runbook

This repo contains one end-to-end sample for Windows:
- `app/` = React chat UI + websocket backend
- `harness/` = Playwright runner
- `tests/` = YAML/JSON cases and generated audio assets
- `report.json` = machine-readable results

## What This Demo Proves
- Text turns go through the app and backend.
- Voice turns use Chromium fake mic audio from a real `.wav` file.
- The app forwards voice bytes over websocket to the backend.
- Voice tests provide `input_transcript` as fixture metadata. No STT/voice model is used.
- The backend uses that transcript metadata to produce response text.
- Break mode intentionally returns bad output so regression detection is visible.

## Windows Setup
1. Run `setup.bat` from the repo root.
2. It checks Node.js, Python, and FFmpeg.
3. It installs `app/` and `harness/` dependencies.
4. It installs Chromium for Playwright.
5. It generates sample WAV files in `tests/audio_assets/`.

## Manual Start
Open two terminals:

1. Backend:
```bat
cd app
node server.js
```

2. Frontend:
```bat
cd app
npm start
```

Backend health:
```text
http://localhost:5000/health
```

App URL:
```text
http://localhost:3000
```

## Run The Harness
From the repo root:
```bat
cd harness
node cli.js --config ..\tests\test_cases.yaml --output ..\report.json
```

Or use the wrapper:
```bat
run-tests.bat
```

Expected artifacts:
- `report.json`
- `output.wav`
- `output.capture.webm`

## Test Case Authoring
Edit `tests/test_cases.yaml` or `tests/test_cases.json`.

Supported fields:
- `test_id`
- `type` (`text` or `voice`)
- `input` for text tests
- `input_audio` for voice tests
- `input_transcript` for voice tests
- `scenario` for deterministic sample-app routing
- `expected_intent`
- `latency_threshold_ms`
- `should_enable_break_mode`
- `expected_fail`

Example voice case:
```yaml
- test_id: voice_pizza_order
  type: voice
  input_audio: ./tests/audio_assets/order_pizza.wav
  input_transcript: order pizza
  scenario: voice_pizza_order
  expected_intent: The agent should help the user order a pepperoni pizza
  latency_threshold_ms: 5000
```

## How Voice Works
1. Playwright launches Chromium with:
   - `--use-fake-device-for-media-stream`
   - `--use-fake-ui-for-media-stream`
   - `--use-file-for-fake-audio-capture=...`
2. The React app calls `getUserMedia()`.
3. MediaRecorder collects the injected mic audio bytes.
4. The app sends those bytes over websocket to `app/server.js`.
5. The harness-provided `input_transcript` is sent as metadata with the voice turn.
6. The backend uses that transcript metadata for deterministic response routing.
7. Synthetic response audio is disabled by default.

## Semantic Verification
- No voice model is used in this sample.
- Voice audio is never transcribed by the sample app.
- The backend reply text is judged against `expected_intent`.
- `brain/judge.js` returns:
  - `pass`
  - `reason`
  - `similarity_score`

## Regression Demo
Use `regression_break_mode` in the test cases.
- The app toggles break mode.
- The backend returns deliberate gibberish.
- The judge fails it.
- Because the case is marked `expected_fail: true`, the harness reports the regression as successfully detected.

## Output Format
`report.json` contains:
- summary counts
- pass rate
- per-test latency
- transcript text
- similarity score
- output paths

## Troubleshooting
- If Chromium does not launch, rerun `setup.bat`.
- If the app does not connect, check the websocket backend is running on port `5000`.
- If mic capture fails, verify the Chromium flags are present and the fake audio file exists.
- If a voice test fails unexpectedly, inspect `output.wav` and `output.capture.webm`.
