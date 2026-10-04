"""User-controlled local dictation. Audio stays in memory and is never uploaded."""
import argparse
import json
import os
from pathlib import Path
import sys
import threading
import time

os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
sys.stdout.reconfigure(encoding="utf-8")
MODEL = Path(__file__).resolve().parent / "runtime" / "voice-model"


def emit(kind, text):
    print(json.dumps({"kind": kind, "text": text}), flush=True)


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--wave")
    parser.add_argument("--mic-test", action="store_true")
    args = parser.parse_args()
    from faster_whisper import WhisperModel, download_model
    import numpy as np
    import sounddevice as sd

    if args.prepare:
        download_model("small.en", output_dir=str(MODEL))
        emit("prepared", "Local English Whisper model installed.")
        return

    stopped = threading.Event()
    abandoned = threading.Event()
    if not args.wave and not args.check and not args.mic_test:
        def control():
            line = sys.stdin.readline().strip()
            if line != "stop":
                abandoned.set()
            stopped.set()
        threading.Thread(target=control, daemon=True).start()

    emit("loading", "Loading local speech model… microphone is off")
    model = WhisperModel(str(MODEL), device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)
    if args.check:
        device = sd.query_devices(kind="input")
        sd.check_input_settings(channels=1, samplerate=16000, dtype="float32")
        emit("checked", "Local model ready; default input: " + device["name"])
        return
    if stopped.is_set():
        emit("stopped", "Mic off. Recording was stopped before it started.")
        return

    if args.wave:
        audio = args.wave
    else:
        blocks = []
        overflowed = threading.Event()
        peak = [0.0]
        def capture(data, frames, timing, status):
            if status:
                overflowed.set()
            blocks.append(data[:, 0].copy())
            peak[0] = max(peak[0], float(np.max(np.abs(data))))
        device = sd.query_devices(kind="input")["name"]
        with sd.InputStream(samplerate=16000, channels=1, dtype="float32", callback=capture):
            emit("ready", "MIC ON • " + device + " • F4 stops • maximum 5 minutes")
            deadline = time.monotonic() + (15 if args.mic_test else 300)
            while not stopped.wait(0.5):
                if time.monotonic() >= deadline:
                    break
                emit("level", "MIC ON • " + device + " • " +
                     ("audio detected" if peak[0] >= 0.005 else "quiet: speak closer or check mute") + " • F4 stops")
        if abandoned.is_set():
            return
        if overflowed.is_set():
            emit("warning", "Some microphone audio was missed. Check the transcript carefully.")
        if not blocks:
            emit("stopped", "Mic off. No audio captured; F4 tries again.")
            return
        audio = np.concatenate(blocks)
        blocks.clear()
        if args.mic_test:
            emit("measurement", "Captured " + str(round(len(audio) / 16000, 1)) + "s; peak=" + str(round(peak[0], 4)))

    emit("transcribing", "MIC OFF • transcribing locally… wait before answering")
    started = time.monotonic()
    segments, _ = model.transcribe(audio, language="en", beam_size=5, vad_filter=True,
                                  condition_on_previous_text=False,
                                  vad_parameters={"min_silence_duration_ms": 500})
    found = False
    for segment in segments:
        if abandoned.is_set():
            return
        text = segment.text.strip()
        if text:
            emit("text", text)
            found = True
    emit("stopped", ("Mic off. Review words/math, then answer." if found else
                     "Mic off. No clear speech found; F4 tries again or type your note.") +
         " Transcribed in " + str(round(time.monotonic() - started, 1)) + "s.")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        emit("error", "Mic unavailable: " + str(error) +
             ". Check Windows microphone permissions/default input. You can still type your note.")
        sys.exit(1)
