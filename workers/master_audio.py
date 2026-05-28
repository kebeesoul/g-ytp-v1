#!/usr/bin/env python3
"""Render one track with the Vibe Master L2-style mastering engine."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from audio_mastering.audio import (
    apply_fades,
    load_audio,
    measure_loudness,
    save_wav,
    trim_silence,
)
from audio_mastering.drive import calculate_crest_aware_drive
from audio_mastering.limiter import LimiterParams, process as limiter_process
from audio_mastering.mastering import run_ffmpeg_chain
from audio_mastering.report import MasteringReport

TARGET_LOUDNESS = -9.0
OUTPUT_CEILING = -0.1
LRA_TARGET = 9.0
TONE = "balanced"
GLUE = "light"
LOUDNESS_MODE = "natural"
STEREO_WIDTH = 1.0
BIT_DEPTH = 24
EDGE_DECLICK_MS = 5


def master_for_youtube(input_path: Path, output_path: Path) -> MasteringReport:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_pre = output_path.with_suffix(".pre.wav")

    data, sr = load_audio(str(input_path))
    original_lufs, original_tp = measure_loudness(data, sr)
    drive_decision = calculate_crest_aware_drive(TARGET_LOUDNESS, original_lufs, original_tp)
    channels = data.shape[1] if data.ndim > 1 else 1
    duration_sec = len(data) / sr

    data = trim_silence(data, sr)
    data = apply_fades(data, sr, EDGE_DECLICK_MS, EDGE_DECLICK_MS)
    save_wav(data, sr, str(temp_pre))

    try:
        run_ffmpeg_chain(
            input_path=str(temp_pre),
            output_path=str(output_path),
            lufs=TARGET_LOUDNESS,
            tp=OUTPUT_CEILING,
            lra=LRA_TARGET,
            tone=TONE,
            glue=GLUE,
            width=STEREO_WIDTH,
            sample_rate=sr,
            codec="pcm_s24le",
        )

        gr_report: dict[str, object] = {}
        ffmpeg_out, ffmpeg_sr = load_audio(str(output_path))
        limited = limiter_process(
            ffmpeg_out,
            ffmpeg_sr,
            LimiterParams(
                ceiling_db=OUTPUT_CEILING,
                character="clean",
                dither="none",
                bit_depth=BIT_DEPTH,
                input_gain_db=drive_decision.drive_db,
            ),
            report=gr_report,
        )
        save_wav(limited, ffmpeg_sr, str(output_path), file_format="WAV", subtype="PCM_24")
        final_lufs, final_tp = measure_loudness(limited, ffmpeg_sr)
    finally:
        temp_pre.unlink(missing_ok=True)

    return MasteringReport(
        input_file=str(input_path),
        output_file=str(output_path),
        preset="custom",
        target_lufs=TARGET_LOUDNESS,
        target_tp=OUTPUT_CEILING,
        original_lufs=original_lufs,
        original_tp=original_tp,
        final_lufs=final_lufs,
        final_tp=final_tp,
        duration_sec=duration_sec,
        sample_rate=sr,
        channels=channels,
        tone=TONE,
        glue=GLUE,
        loudness_mode=LOUDNESS_MODE,
        stereo_width=STEREO_WIDTH,
        reference_matched=False,
        processed_at=datetime.now(timezone.utc).isoformat(),
        gr_peak_db=float(gr_report.get("gr_peak_db", 0.0)),
        gr_avg_db=float(gr_report.get("gr_avg_db", 0.0)),
        gr_status=str(gr_report.get("gr_status", "transparent")),
        drive_db=round(drive_decision.drive_db, 1),
        threshold_db=round(OUTPUT_CEILING - drive_decision.drive_db, 1),
        out_ceiling_db=OUTPUT_CEILING,
        soft_knee_db=4.0,
        crest_factor_db=round(drive_decision.crest_factor_db, 1),
        headroom_db=round(drive_decision.headroom_db, 1),
        drive_scale=round(drive_decision.drive_scale, 2),
        drive_warning=drive_decision.warning,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--report")
    args = parser.parse_args()

    report = master_for_youtube(Path(args.input), Path(args.output))
    if args.report:
        Path(args.report).write_text(report.to_json())
    print(json.dumps(report.to_dict()))


if __name__ == "__main__":
    main()
