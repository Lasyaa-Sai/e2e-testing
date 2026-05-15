import sys
import speech_recognition as sr

def transcribe(audio_path):
    r = sr.Recognizer()
    try:
        with sr.AudioFile(audio_path) as source:
            audio = r.record(source)
            text = r.recognize_google(audio)
            print(text)
    except sr.UnknownValueError:
        print("")
    except Exception as e:
        print("")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    transcribe(sys.argv[1])
