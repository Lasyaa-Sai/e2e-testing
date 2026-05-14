#!/usr/bin/env python3
"""
Test Audio Generator
Generates WAV audio files for voice testing using text-to-speech
"""

import os
import sys
from pathlib import Path

try:
    from gtts import gTTS
    HAS_GTTS = True
except ImportError:
    HAS_GTTS = False
    print("WARNING: gtts not installed. Install with: pip install gtts")

try:
    import pyttsx3
    HAS_PYTTSX3 = True
except ImportError:
    HAS_PYTTSX3 = False


def generate_with_gtts(text, output_path):
    """Generate audio using Google Text-to-Speech (requires internet)"""
    if not HAS_GTTS:
        print("ERROR: gtts not installed. Install with: pip install gtts")
        return False

    try:
        print(f"Generating audio: {text}")
        tts = gTTS(text=text, lang='en', slow=False)
        tts.save(output_path)
        print(f"✓ Audio saved: {output_path}")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        return False


def generate_with_pyttsx3(text, output_path):
    """Generate audio using pyttsx3 (offline, no internet required)"""
    if not HAS_PYTTSX3:
        print("ERROR: pyttsx3 not installed. Install with: pip install pyttsx3")
        return False

    try:
        print(f"Generating audio (offline): {text}")
        engine = pyttsx3.init()
        engine.save_to_file(text, output_path)
        engine.runAndWait()
        print(f"✓ Audio saved: {output_path}")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        return False


def main():
    # Create audio assets directory
    audio_dir = Path(__file__).parent.parent / 'tests' / 'audio_assets'
    audio_dir.mkdir(parents=True, exist_ok=True)

    # Test cases
    test_audios = {
        'hello.wav': 'hello',
        'order_pizza.wav': 'I want to order a pepperoni pizza',
        'who_are_you.wav': 'who are you',
    }

    print("\n╔═══════════════════════════════════════╗")
    print("║  Test Audio Generator                 ║")
    print("╚═══════════════════════════════════════╝\n")

    # Try gTTS first (better quality), fall back to pyttsx3
    method = 'gtts' if HAS_GTTS else 'pyttsx3'
    fallback = pyttsx3 if not HAS_GTTS else None

    if method == 'gtts':
        print("Using Google Text-to-Speech (requires internet)\n")
    else:
        print("Using pyttsx3 (offline)\n")

    for filename, text in test_audios.items():
        output_path = audio_dir / filename

        if output_path.exists():
            print(f"⊘ Skipping {filename} (already exists)")
            continue

        success = False
        if method == 'gtts':
            success = generate_with_gtts(text, str(output_path))
            if not success and fallback:
                print("Falling back to pyttsx3...")
                success = generate_with_pyttsx3(text, str(output_path))
        else:
            success = generate_with_pyttsx3(text, str(output_path))

        if not success:
            print(f"✗ Failed to generate {filename}")

    print("\n╔═══════════════════════════════════════╗")
    print("║  Generation Complete                 ║")
    print("╚═══════════════════════════════════════╝\n")

    # List generated files
    generated_files = list(audio_dir.glob('*.wav'))
    if generated_files:
        print(f"Generated {len(generated_files)} audio files:")
        for f in generated_files:
            print(f"  - {f.name}")
    else:
        print("No audio files generated.")
        print("\nTo generate audio files, ensure you have:")
        print("  pip install gtts  (for online TTS)")
        print("  OR")
        print("  pip install pyttsx3  (for offline TTS)")


if __name__ == '__main__':
    main()
