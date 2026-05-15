# SPARK AAC End-to-End Testing Harness

## 📖 Overview
The SPARK AAC E2E Testing Harness is designed to automate the verification of **Voice and Text conversational flows** against a real client. It replaces slow, inconsistent manual smoke testing, ensuring that both text and voice functions are intact before a release goes out. 

The harness focuses on handling **real audio paths** (mic input and speaker output) rather than just simulating voice workflows with text. It also uses robust **semantic verification** to assert outcomes against non-deterministic LLM responses.

---

## 🏗️ Architecture & Core Components

This repository is divided into distinct, modular parts to ensure flexibility, maintainability, and clean separation of concerns:

1. **`app/` (The Application under Test)**
   - Includes a React-based Chat UI and an Express/WebSocket backend (`server.js`).
   - The React UI captures mic inputs via `getUserMedia()` and streams bytes over WebSockets, demonstrating a real-time event-driven architecture.
   - The backend uses metadata (`input_transcript`) coupled with audio data to deliver conversational responses, falling back to an LLM provider if needed.
   
2. **`harness/` (The E2E Test Runner)**
   - Built on **Node.js + Playwright** (`cli.js`, `AudioHarness.js`). 
   - Uses Playwright to drive headless Chromium instances, taking advantage of Chromium-specific flags to inject real raw audio (`.wav`) directly into the browser's mic stream.

3. **`tests/` (Data & Scenarios)**
   - YAML and JSON formatted test cases allow low-friction authoring for non-technical stakeholders. 
   - Stores pre-baked audio `.wav` files (`audio_assets`) safely.

4. **`python-voice/` & `brain/` (Verification Engine)**
   - Houses the evaluation scripts built for logic and semantics (`verification.py`, `judge.js`).

---

### 1. The Text Flow 
- **Execution:** Playwright launches the app, locates the text input element, sizes and inputs text natively, exactly simulating user keystrokes.
- **Transport:** The React frontend constructs a text payload and pushes it over the WebSocket (`ws://localhost:5000/ws`).
- **Processing:** `server.js` processes the text through a predefined canned intent matcher or falls back to an LLM completion API (`/chat/completions`). 
- **Verification:** The returned string from the AI is extracted and parsed.

### 2. The Voice Flow (The "Real Audio Path")
- **Injection:** Playwright is launched with flags `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, and `--use-file-for-fake-audio-capture=...` mapping a `.wav` file into the target browser.
- **Capture:** The React app mounts, accesses the microphone via `getUserMedia()`, and a `MediaRecorder` buffers the chunked bytes.
- **Transport:** The binary bytes are pushed to the backend alongside a metadata object carrying an `input_transcript` (avoiding expensive local STT models during functional tests). 
- **Return:** The agent response text comes back down the pipe. If `PLAY_SYNTHETIC_AUDIO` is active, a synthetic audio payload (`audio/wav; base64`) is provided and rendered to the mocked speakers. Then, output paths are cleanly dropped for analysis.

---

##  Why This Structure? 

1. **Real Audio Injection via Chromium Mocking** 
   * **Reasoning:** Rather than using API mocks that skip the user interface layer, this executes tests utilizing Playwright's ability to spoof media enumerators (`--use-file-for-fake-audio-capture`). 
   * **Proof:** Validates the entire peripheral permission path, the `MediaRecorder` binary serialization, and the WebSockets transport layers. It proves the platform successfully consumes bytes exactly as a real user microphone produces them natively.

2. **Semantic Verification Over Exact String Matching**
   * **Reasoning:** Large Language Models produce non-deterministic output phrasing for the exact same semantic meaning (e.g., "Hi!" vs. "Hello how are you?"). 
   * **Proof:** As shown in `python-voice/verification.py`, a `semantic_verify` engine calculates word token overlap/union (`similarity = overlap / union`) applying a logical threshold (`> 0.3`). This asserts tests predictably pass without flaky string comparisons while preserving intention accurately.

3. **YAML-Based, Non-Technical Authoring**
   * **Reasoning:** One of the core goals is enabling product managers or QA to write scenarios. Programming tests directly via Jest/Mocha functions generates unwanted friction. 
   * **Proof:** Files like `test_cases.yaml` encapsulate all configuration: mapping `input_audio`, `input_transcript`, and `expected_intent`. The `cli.js` dynamically orchestrates the harness logic around those YAML directives. 

4. **Modular Cross-Platform Decoupling**
   * **Reasoning:** The Task also included the requirement that the harness logic should extend cleanly to Android and iOS. 
   * **Proof:** By decoupling the Test Definitions (`tests/`), the Engine (`python-voice/`), and the Driver implementation (`harness/AudioHarness.js`), you can effortlessly substitute Playwright with **Appium/Espresso** natively for Android or **XCUITest/Detox** natively for iOS without altering any other architecture logic. (See `CI-CD-AND-EXTENSIONS.md`)

5. **Intentional Regression Break Mode ("Test the Test")**
   * **Reasoning:** We must verify that regressions actually register a **Failure** in CI pipelines. 
   * **Proof:** Using `should_enable_break_mode`, the app purposely mutates backend return data ("salve mundo corvo delta delta..."). The semantic match rightfully drops below the strict threshold, tripping the automated runner. This robustly validates harness efficacy on every run. 

---

### Operating Guides & Additions

- For detailed build, run, and usage steps see the [Runbook](./RUNBOOK.md)
- For the mobile migration map (iOS/Android plans) and CI implementations (GitHub Actions, Jenkins, Gitlab), please see [CI-CD AND Extensions Guide](./CI-CD-AND-EXTENSIONS.md)
