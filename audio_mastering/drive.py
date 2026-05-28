from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass(frozen=True)
class DriveDecision:
    drive_db: float
    base_gap_db: float
    crest_factor_db: float
    headroom_db: float
    drive_scale: float
    warning: Optional[str] = None


def calculate_crest_aware_drive(target_lufs: float, source_lufs: float, source_true_peak: float) -> DriveDecision:
    """Calculate limiter drive from loudness gap, crest factor, and peak headroom."""
    base_gap = float(np.clip(target_lufs - source_lufs, -24.0, 24.0))
    crest = float(np.clip(source_true_peak - source_lufs, 0.0, 36.0))
    headroom = float(np.clip(-source_true_peak, 0.0, 36.0))

    if base_gap <= 0.0:
        return DriveDecision(
            drive_db=base_gap,
            base_gap_db=base_gap,
            crest_factor_db=crest,
            headroom_db=headroom,
            drive_scale=1.0,
            warning="Source is already at or above target loudness" if source_lufs > target_lufs else None,
        )

    scale = 1.0
    warnings: list[str] = []

    if crest >= 14.0 and headroom >= 3.0 and source_lufs <= -12.0:
        scale += min(0.25, (crest - 14.0) * 0.035 + (headroom - 3.0) * 0.02)

    if crest < 9.0:
        scale -= min(0.35, (9.0 - crest) * 0.07)
        warnings.append("source already dense or limited")

    if source_lufs > -10.0:
        scale -= min(0.30, 0.15 + (source_lufs + 10.0) * 0.08)
        warnings.append("source already loud")

    if headroom < 1.5:
        scale -= min(0.35, 0.15 + (1.5 - headroom) * 0.20)
        warnings.append("low true-peak headroom")

    scale = float(np.clip(scale, 0.45, 1.25))
    drive = float(np.clip(base_gap * scale, -24.0, 24.0))
    warning = None
    if warnings:
        warning = "Drive reduced: " + ", ".join(dict.fromkeys(warnings))

    return DriveDecision(
        drive_db=drive,
        base_gap_db=base_gap,
        crest_factor_db=crest,
        headroom_db=headroom,
        drive_scale=scale,
        warning=warning,
    )
