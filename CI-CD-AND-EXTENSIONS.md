# Cross-Platform Extension & CI/CD Integration Guide

## Part 1: Extending to Web (Full Implementation)

### 1.1 Browser Support

The current implementation uses **Playwright** which supports:
- ✅ Chromium (Chrome, Edge)
- ✅ Firefox
- ✅ Safari (macOS only)

### 1.2 Zero Changes Required

The harness already works across all browsers:

```javascript
// AudioHarness.js can be extended
const browserType = process.env.BROWSER || 'chromium';

const browser = await {
  chromium: () => chromium.launch(),
  firefox: () => firefox.launch(),
  webkit: () => webkit.launch()
}[browserType]();
```

### 1.3 Cross-Browser Testing

```json
{
  "browsers": ["chromium", "firefox", "webkit"],
  "execution": {
    "run_on_all_browsers": true
  }
}
```

**Implementation**: In `harness/cli.js`, loop through browsers:
```javascript
for (const browserType of config.browsers) {
  const harness = new AudioHarness({ browser: browserType });
  await harness.launch();
  // Run tests
}
```

---

## Part 2: Extending to Android

### 2.1 Architecture Changes

| Component | Web | Android |
|-----------|-----|---------|
| Driver | Playwright | Appium + Espresso |
| Audio Injection | WebAudio API | Android MediaRecorder |
| Audio Capture | MediaStream | AudioRecord |
| Verification | Same | Same text-fixture verification |
| Test Format | Same (YAML/JSON) | Same |

### 2.2 Android Implementation Plan

**Step 1: Replace Playwright with Appium**

```python
# android-harness/harness.py
from appium import webdriver
from appium.webdriver.common.appiumby import AppiumBy

class AndroidAudioHarness:
    def __init__(self, app_path, device_id=None):
        self.device_id = device_id
        self.app_path = app_path
        
    async def launch(self):
        caps = {
            'platformName': 'Android',
            'automationName': 'UiAutomator2',
            'app': self.app_path,
            'deviceName': self.device_id
        }
        self.driver = webdriver.Remote('http://localhost:4723', caps)
        
    async def click_element(self, locator):
        element = self.driver.find_element(*locator)
        element.click()
```

**Step 2: Audio Injection (Native Android)**

```kotlin
// Android App - Audio Injection
val audioRecord = AudioRecord(
    MediaRecorder.AudioSource.MIC,
    44100,
    AudioFormat.CHANNEL_IN_MONO,
    AudioFormat.ENCODING_PCM_16BIT,
    bufferSize
)

// Load test audio file into input
val testAudioFile = File(context.filesDir, "test_audio.wav")
audioRecord.read(testAudioBuffer, 0, testAudioBuffer.size)
```

**Step 3: Audio Capture (Native Android)**

```kotlin
// Android App - Audio Capture
val mediaRecorder = MediaRecorder().apply {
    setAudioSource(MediaRecorder.AudioSource.DEFAULT)
    setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
    setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB)
    setOutputFile(outputPath)
    prepare()
    start()
}

// After agent response completes
mediaRecorder.stop()
mediaRecorder.release()

// Save to file for audio transport/debug inspection
```

**Step 4: Test Harness Wrapper**

```python
# harness/android_runner.py
import subprocess
import time

class AndroidTestRunner:
    def __init__(self, app_package, device_id=None):
        self.app_package = app_package
        self.device_id = device_id
        self.adb = ADBDriver(device_id)
        
    def run_test_case(self, test_case):
        # 1. Inject audio file
        self.adb.push(test_case.input_audio, '/sdcard/test_audio.wav')
        
        # 2. Open app
        self.adb.shell(f'am start -n {self.app_package}/.MainActivity')
        time.sleep(3)
        
        # 3. Trigger input
        self.adb.tap(test_case.input_coordinates)
        
        # 4. Wait for response
        time.sleep(test_case.latency_threshold_ms / 1000)
        
        # 5. Capture response audio
        self.adb.pull('/sdcard/output_audio.wav', 'audio_output.wav')
        
        # 6. Verify (same as web)
        verification = self.verify_audio('audio_output.wav', test_case.expected_intent)
        
        return verification
```

### 2.3 CI/CD for Android

```yaml
# .github/workflows/android-e2e.yml
name: Android E2E Tests

on: [push, pull_request]

jobs:
  android-test:
    runs-on: macos-latest  # Android emulator needs macOS
    steps:
      - uses: actions/checkout@v2
      
      - name: Start Android Emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 30
          
      - name: Install app
        run: adb install app/android/build/app/outputs/apk/debug/app-debug.apk
        
      - name: Setup test environment
        run: |
          python -m venv venv
          source venv/bin/activate
          pip install appium-python-client pyyaml
          
      - name: Run tests
        run: |
          cd harness
          python android_runner.py --device emulator-5554
          
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v2
        with:
          name: android-report
          path: report.json
```

---

## Part 3: Extending to iOS

### 3.1 Architecture Changes

| Component | Web | iOS |
|-----------|-----|-----|
| Driver | Playwright | XCUITest / Detox |
| Audio Injection | WebAudio API | AVAudioEngine |
| Audio Capture | MediaStream | AVAudioRecorder |
| Verification | Same | Same text-fixture verification |
| Build | npm | Xcode / CocoaPods |

### 3.2 iOS Implementation (Detox Framework)

```javascript
// ios-harness/e2e.test.js
const detox = require('detox');

describe('Voice Chat - iOS', () => {
  beforeAll(async () => {
    await detox.init(detoxConfig, { launchApp: false });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
    await device.launchApp({
      permissions: { microphone: 'YES', media: 'YES' }
    });
  });

  it('should respond to voice input', async () => {
    // 1. Inject audio
    await device.simulateAudioInput('./tests/audio_assets/hello.wav');
    
    // 2. Click voice button
    await element(by.id('voiceButton')).tap();
    
    // 3. Wait for response
    await waitFor(element(by.text(/Hello/)))
      .toExist()
      .withTimeout(5000);
      
    // 4. Capture audio
    const audioData = await device.captureAudioOutput();
    
    // 5. Verify with Python
    const result = await verifyAudio(audioData, 'greeting');
    expect(result.pass).toBe(true);
  });
});
```

### 3.3 Swift Audio Handler

```swift
// iOS App - Audio Capture
import AVFoundation

class AudioRecorder: NSObject, AVAudioRecorderDelegate {
    var audioRecorder: AVAudioRecorder?
    
    func startRecording() {
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setCategory(.record)
        
        let settings = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 12000,
            AVNumberOfChannelsKey: 1
        ] as [String: Any]
        
        let audioURL = URL.documentsDirectory.appendingPathComponent("output.wav")
        audioRecorder = try? AVAudioRecorder(url: audioURL, settings: settings)
        audioRecorder?.record()
    }
    
    func stopRecording(completion: @escaping (URL) -> Void) {
        audioRecorder?.stop()
        if let url = audioRecorder?.url {
            completion(url)
        }
    }
}
```

### 3.4 Detox Test Configuration

```json
{
  "testRunner": "jest",
  "configurations": {
    "ios.sim.debug": {
      "device": {
        "type": "iPhone 14"
      },
      "app": "ios.debug"
    }
  },
  "apps": {
    "ios.debug": {
      "type": "ios.app",
      "binaryPath": "ios/build/Build/Products/Release-iphonesimulator/VoiceChat.app",
      "build": "xcodebuild -workspace ios/VoiceChat.xcworkspace -scheme VoiceChat -configuration Release -derivedDataPath ios/build"
    }
  }
}
```

---

## Part 4: CI/CD Integration Methodologies

### 4.1 GitHub Actions (Windows - Web)

```yaml
name: E2E Voice Tests - Web

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: windows-latest
    timeout-minutes: 30
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'
          
      - name: Install dependencies
        run: setup.bat
        
      - name: Start backend
        run: |
          cd app
          start /B node server.js
          timeout /t 2
          
      - name: Start frontend
        run: |
          cd app
          start /B npm start
          timeout /t 5
          
      - name: Wait for app readiness
        run: |
          $timeout = 60
          $elapsed = 0
          while ($elapsed -lt $timeout) {
            try {
              $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing
              if ($response.StatusCode -eq 200) { exit 0 }
            } catch {}
            Start-Sleep -Seconds 2
            $elapsed += 2
          }
          exit 1
          
      - name: Run tests
        run: |
          cd harness
          node cli.js
          
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-report
          path: report.json
          
      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('./report.json', 'utf8'));
            const message = `
            ## E2E Test Results
            - **Passed**: ${report.summary.passed}
            - **Failed**: ${report.summary.failed}
            - **Pass Rate**: ${report.summary.pass_rate}
            - **Duration**: ${report.summary.duration_ms}ms
            `;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: message
            });
            
      - name: Fail if tests failed
        if: failure()
        run: exit 1
```

### 4.2 Jenkins Pipeline (Self-Hosted)

```groovy
pipeline {
    agent {
        label 'windows-agent'
    }
    
    options {
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }
    
    stages {
        stage('Setup') {
            steps {
                echo 'Setting up environment...'
                bat 'setup.bat'
            }
        }
        
        stage('Start Services') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('app') {
                            bat 'start /B node server.js'
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('app') {
                            bat 'start /B npm start'
                        }
                    }
                }
            }
        }
        
        stage('Wait for Readiness') {
            steps {
                retry(30) {
                    bat 'timeout /t 1 && curl -f http://localhost:3000'
                }
            }
        }
        
        stage('Test') {
            steps {
                dir('harness') {
                    bat 'node cli.js'
                }
            }
        }
    }
    
    post {
        always {
            junit testResults: 'report.json'
            archiveArtifacts artifacts: 'report.json'
        }
        failure {
            emailext(
                subject: 'E2E Tests Failed',
                body: 'Check Jenkins logs for details',
                to: 'team@example.com'
            )
        }
    }
}
```

### 4.3 GitLab CI

```yaml
image: node:18

stages:
  - setup
  - test
  - report

variables:
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"
  PYTHON_VERSION: "3.9"

cache:
  paths:
    - node_modules/
    - .cache/pip

setup:
  stage: setup
  script:
    - apt-get update && apt-get install -y python3 python3-pip
    - python3 -m pip install --upgrade pip
    - npm install
    - pip install -r python-voice/requirements.txt
    - npx playwright install chromium
  artifacts:
    paths:
      - node_modules/
      - venv/
    expire_in: 1 hour

test:
  stage: test
  needs: ["setup"]
  script:
    - cd app && node server.js &
    - sleep 2
    - cd app && npm start &
    - sleep 5
    - cd harness && npm install && node cli.js
  artifacts:
    reports:
      junit: report.json
    paths:
      - report.json
    expire_in: 30 days
  allow_failure: false

report:
  stage: report
  script:
    - echo "Test execution completed"
    - cat report.json
  allow_failure: true
```

### 4.4 Device Farm Integration (AWS)

```python
# ci/device-farm-runner.py
import boto3
import json
import time

class DeviceFarmRunner:
    def __init__(self):
        self.client = boto3.client('devicefarm', region_name='us-west-2')
        
    def run_tests_on_devices(self, test_cases):
        """Run tests on AWS Device Farm"""
        
        project_arn = 'arn:aws:devicefarm:us-west-2:123456:project:...'
        
        # Upload test app
        app_arn = self._upload_app('app/android/build/app/outputs/apk/debug/app-debug.apk')
        
        # Upload test suite
        test_arn = self._upload_test_suite('harness/tests.zip')
        
        # Run on multiple devices
        devices = [
            'arn:aws:devicefarm:us-west-2:...:device:android:...',
            'arn:aws:devicefarm:us-west-2:...:device:ios:...',
        ]
        
        run_arn = self.client.schedule_run(
            projectArn=project_arn,
            appArn=app_arn,
            devicePoolArn='arn:aws:devicefarm:us-west-2:...:devicepool:...',
            name='E2E Voice Tests',
            test={
                'type': 'APPIUM_PYTHON',
                'testPackageArn': test_arn
            }
        )['run']['arn']
        
        # Poll for completion
        while True:
            run = self.client.get_run(arn=run_arn)['run']
            status = run['status']
            
            if status in ['COMPLETED', 'STOPPED', 'ERRORED']:
                break
                
            print(f'Run status: {status}')
            time.sleep(30)
        
        # Get results
        results = self.client.list_runs(projectArn=project_arn)
        return results
```

---

## Part 5: Infrastructure Requirements by Platform

### 5.1 Web (Chromium/Firefox/Safari)

```
┌─────────────────────────────────┐
│ Windows/Linux/macOS Runner      │
│ - Node.js 14+                   │
│ - Python 3.8+                   │
│ - 2GB RAM minimum               │
│ - 5GB disk (Chromium)           │
│ - 30 seconds per test suite     │
└─────────────────────────────────┘
```

### 5.2 Android

```
┌─────────────────────────────────┐
│ Linux/macOS Runner              │
│ - Android SDK                   │
│ - Emulator or device            │
│ - Appium server                 │
│ - Java 11+                      │
│ - 4GB RAM minimum               │
│ - 60 seconds per test suite     │
└─────────────────────────────────┘
```

### 5.3 iOS

```
┌─────────────────────────────────┐
│ macOS Runner (Apple Silicon)    │
│ - Xcode 12+                     │
│ - iOS Simulator or Device       │
│ - Detox CLI                     │
│ - Node.js 14+                   │
│ - 4GB RAM minimum               │
│ - 90 seconds per test suite     │
└─────────────────────────────────┘
```

---

## Part 6: Deployment Strategy

### 6.1 Rollout Plan

```
Phase 1 (Week 1): Web (Chromium) - ✅ COMPLETED
├─ Single browser
├─ Text + Voice tests
└─ Manual trigger

Phase 2 (Week 2-3): Cross-browser Web
├─ Chromium, Firefox, Safari
├─ Parallel execution
└─ Scheduled daily

Phase 3 (Week 4-5): Android
├─ Real device farm
├─ Emulator + physical devices
└─ Pre-release gating

Phase 4 (Week 6-7): iOS
├─ Detox framework
├─ Simulator + real devices
└─ Pre-release gating

Phase 5 (Week 8+): Full Integration
├─ All platforms coordinated
├─ Comprehensive reporting
└─ Automated release gates
```

### 6.2 Monitoring & Alerting

```yaml
# monitoring/alerts.yaml
alerts:
  - name: "e2e-tests-failing"
    condition: "pass_rate < 90%"
    severity: "critical"
    action: "slack_notification"
    
  - name: "e2e-tests-slow"
    condition: "avg_latency > 60s"
    severity: "warning"
    action: "log_and_track"
    
  - name: "audio-capture-failing"
    condition: "voice_tests_pending > 10%"
    severity: "critical"
    action: "page_oncall"
```

---

## Summary

| Platform | Current | Timeline | Effort |
|----------|---------|----------|--------|
| **Web** | ✅ Production Ready | Now | - |
| **Android** | 📋 Design Complete | 2-3 weeks | Medium |
| **iOS** | 📋 Design Complete | 2-3 weeks | Medium |
| **Full CI/CD** | ✅ Examples Provided | 1-2 weeks | Low |

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
