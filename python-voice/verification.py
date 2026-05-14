#!/usr/bin/env python3
"""
Text-only verification helper.

This module intentionally does not transcribe audio and does not load any voice
model. Voice tests should provide a transcript fixture alongside the WAV file;
the WAV bytes are still sent through the WebSocket path by the Node harness.
"""

import json
import sys
from typing import Any, Dict


def normalize(value: str) -> str:
    return " ".join(str(value or "").lower().split())


class VerificationEngine:
    def semantic_verify(
        self, transcript: str, expected_intent: str, context: str = None
    ) -> Dict[str, Any]:
        transcript_words = set(normalize(transcript).split())
        intent_words = set(normalize(expected_intent).split())
        overlap = len(transcript_words & intent_words)
        union = len(transcript_words | intent_words)
        similarity = overlap / union if union else 0

        return {
            "pass": similarity > 0.3,
            "reason": f"Text fixture verification: {similarity:.1%} word overlap",
            "similarity_score": similarity,
            "confidence": 0.5,
        }

    def verify_transcript(
        self, transcript: str, expected_intent: str, context: str = None
    ) -> Dict[str, Any]:
        verification = self.semantic_verify(transcript, expected_intent, context)
        return {
            "pass": verification["pass"],
            "transcript": transcript,
            "expected_intent": expected_intent,
            "reason": verification["reason"],
            "similarity_score": verification["similarity_score"],
            "verification_confidence": verification["confidence"],
        }


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: python verification.py <transcript> <expected_intent> [context]")
        sys.exit(1)

    transcript = sys.argv[1]
    expected_intent = sys.argv[2]
    context = sys.argv[3] if len(sys.argv) > 3 else None

    result = VerificationEngine().verify_transcript(
        transcript,
        expected_intent,
        context,
    )

    print(json.dumps(result, indent=2))
    sys.exit(0 if result["pass"] else 1)


if __name__ == "__main__":
    main()
