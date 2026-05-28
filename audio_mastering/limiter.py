"""
core/limiter.py — Python mastering lookahead brickwall limiter/maximizer.

Signal flow:
  data → DC block → input drive → stereo-linked peak detection
       → forward-min lookahead → ARC-style gain smoothing → apply gain
       → true-peak safety pass (4× oversampling) → dither + quantize → output
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
from scipy.ndimage import minimum_filter1d
from scipy.signal import lfilter, resample_poly


# ---------------------------------------------------------------------------
# Character presets
# ---------------------------------------------------------------------------

_RNG = np.random.default_rng()  # module-level RNG — avoids re-seeding on every dither call

_CHARACTER: dict[str, dict[str, float]] = {
    "clean": {
        "attack_ms":    1.0,
        "release_ms":   150.0,
        "release_fast_ms": 35.0,
        "release_slow_ms": 320.0,
        "lookahead_ms": 5.0,
    },
    "balanced": {
        "attack_ms":    1.0,
        "release_ms":   200.0,
        "release_fast_ms": 50.0,
        "release_slow_ms": 450.0,
        "lookahead_ms": 6.0,
    },
    "loud": {
        "attack_ms":    1.5,
        "release_ms":   300.0,
        "release_fast_ms": 65.0,
        "release_slow_ms": 520.0,
        "lookahead_ms": 7.0,
    },
    "aggressive": {
        "attack_ms":    2.0,
        "release_ms":   100.0,
        "release_fast_ms": 25.0,
        "release_slow_ms": 260.0,
        "lookahead_ms": 4.0,
    },
}


# ---------------------------------------------------------------------------
# Params
# ---------------------------------------------------------------------------

@dataclass
class LimiterParams:
    ceiling_db: float = -0.1     # True-peak ceiling in dBFS
    character: str = "balanced"  # One of the _CHARACTER keys
    oversample: int = 4          # True-peak detection oversampling factor
    dither: str = "tpdf"         # none | tpdf | shaped
    bit_depth: int = 24
    input_gain_db: float = 0.0   # L2-style threshold drive into the limiter
    arc: bool = True             # Program-dependent auto release control
    soft_knee_db: float = 4.0     # Gradual onset around the limiting threshold


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _dc_block(data: np.ndarray, sr: int) -> np.ndarray:
    """Remove DC offset with a one-pole high-pass (fc ≈ 5 Hz)."""
    fc = 5.0
    alpha = np.clip(1.0 - 2.0 * np.pi * fc / sr, 0.0, 1.0)
    # H(z) = (1 − z⁻¹) / (1 − α·z⁻¹)
    b = [1.0, -1.0]
    a = [1.0, -alpha]
    if data.ndim > 1:
        # axis=0: filter along time axis, all channels at once
        return lfilter(b, a, data, axis=0)
    return lfilter(b, a, data)


def _forward_min(arr: np.ndarray, window: int) -> np.ndarray:
    """
    For each index t, return min(arr[t : t+window]).

    Uses scipy.ndimage.minimum_filter1d which runs an O(N) deque algorithm
    regardless of window size, unlike sliding_window_view's O(N×W) approach.

    Pads right with 1.0 (neutral: no gain reduction) so end samples
    look forward into silence rather than wrapping.

    origin=-(window // 2) shifts the centered window fully forward so that
    position t covers exactly [t, t+window-1].
    """
    padded = np.concatenate([arr, np.ones(window - 1, dtype=arr.dtype)])
    filtered = minimum_filter1d(padded, size=window, origin=-(window // 2))
    return filtered[:len(arr)]


def _smooth_gain(
    gain_env: np.ndarray,
    attack_coef: float,
    release_coef: float,
) -> np.ndarray:
    """
    Vectorized two-pass decoupled attack/release smoother.

    Pass 1 (attack): one-pole IIR + clamp to gain_env.
      → Output never exceeds gain_env; downward gain moves are followed fast.

    Pass 2 (release): one-pole IIR starting from pass-1 state + clamp to att.
      → Upward gain recovery is smoothed; downward moves remain instant.

    Initial state for both passes assumes y[-1] = 1.0 (no gain reduction before
    the signal starts), then pass 2 aligns its start to att[0] so the release
    filter does not start from an incorrect baseline.
    """
    a_att = 1.0 - attack_coef
    a_rel = 1.0 - release_coef

    # Pass 1: attack filter — y[-1] = 1.0 → zi = a_att
    att, _ = lfilter([attack_coef], [1.0, -a_att], gain_env, zi=np.array([a_att]))
    np.minimum(att, gain_env, out=att)  # never above gain_env

    # Pass 2: release filter — y[-1] = att[0] → zi = a_rel * att[0]
    rel, _ = lfilter([release_coef], [1.0, -a_rel], att, zi=np.array([a_rel * att[0]]))
    np.minimum(rel, att, out=rel)  # instant downward response preserved

    return rel


def _arc_smooth_gain(gain_env: np.ndarray, sr: int, attack_ms: float, fast_release_ms: float, slow_release_ms: float) -> np.ndarray:
    """
    Program-dependent release inspired by L2 ARC.

    Fast release follows isolated transients; slow release dominates sustained
    gain reduction so dense sections avoid low-frequency pumping.
    """
    attack_samples = max(1, round(attack_ms * sr / 1000))
    fast_samples = max(1, round(fast_release_ms * sr / 1000))
    slow_samples = max(1, round(slow_release_ms * sr / 1000))

    attack_coef = 1.0 - np.exp(-1.0 / attack_samples)
    fast_coef = 1.0 - np.exp(-1.0 / fast_samples)
    slow_coef = 1.0 - np.exp(-1.0 / slow_samples)

    fast = _smooth_gain(gain_env, attack_coef, fast_coef)
    slow = _smooth_gain(gain_env, attack_coef, slow_coef)

    reduction = 1.0 - gain_env
    rms_window = max(1, round(0.080 * sr))
    rms_kernel = np.ones(rms_window, dtype=float) / rms_window
    sustained = np.convolve(reduction, rms_kernel, mode="same")
    blend = np.clip(sustained * 10.0, 0.0, 1.0)

    return fast * (1.0 - blend) + slow * blend


def _true_peak_pass(data: np.ndarray, ceiling_linear: float, oversample: int) -> np.ndarray:
    """
    Safety true-peak ceiling via oversampling.
    Upsample by `oversample`, hard-clip at ceiling_linear, downsample back.
    resample_poly operates along axis=0, handling mono (N,) and stereo (N, ch) uniformly.
    """
    n = len(data)
    up = resample_poly(data, oversample, 1, axis=0)
    np.clip(up, -ceiling_linear, ceiling_linear, out=up)
    return resample_poly(up, 1, oversample, axis=0)[:n]


def _soft_knee_gain(peak: np.ndarray, knee_db: float) -> np.ndarray:
    """Return gain envelope for a soft-knee infinite-ratio limiter threshold at 0 dBFS."""
    eps = 1e-10
    peak_db = 20.0 * np.log10(np.maximum(peak, eps))
    knee = max(float(knee_db), 0.0)
    if knee <= 0.0:
        reduction_db = np.maximum(0.0, peak_db)
    else:
        half = knee / 2.0
        reduction_db = np.zeros_like(peak_db)
        knee_mask = (peak_db > -half) & (peak_db < half)
        reduction_db[knee_mask] = ((peak_db[knee_mask] + half) ** 2) / (2.0 * knee)
        reduction_db[peak_db >= half] = peak_db[peak_db >= half]
    return np.minimum(1.0, 10.0 ** (-reduction_db / 20.0))


def _apply_dither(data: np.ndarray, bit_depth: int, mode: str) -> np.ndarray:
    """Add dither noise at LSB level before quantization."""
    if mode == "none":
        return data

    lsb = 2.0 / (2**bit_depth)

    if mode == "tpdf":
        # Triangular PDF = two uniform rectangles; variance = lsb²/6
        noise = (
            _RNG.uniform(-0.5, 0.5, data.shape) + _RNG.uniform(-0.5, 0.5, data.shape)
        ) * lsb
    elif mode == "shaped":
        # First-order noise shaping: H(z) = 1 − z⁻¹, pushes noise energy to high freq
        white = _RNG.uniform(-0.5, 0.5, data.shape) * lsb
        noise = np.diff(white, prepend=0, axis=0)
    else:
        raise ValueError(f"Unknown dither mode '{mode}'. Valid: none, tpdf, shaped")

    return data + noise


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def process(data: np.ndarray, sr: int, params: LimiterParams, report: Optional[dict] = None) -> np.ndarray:
    """
    Apply mastering lookahead brickwall limiter/maximizer.

    Args:
        data:   Float64 audio, shape (N,) mono or (N, channels) stereo.
        sr:     Sample rate in Hz.
        params: LimiterParams instance.

    Returns:
        Processed audio, same shape and dtype as input.
    """
    if params.character not in _CHARACTER:
        raise ValueError(
            f"Unknown character '{params.character}'. Valid: {list(_CHARACTER)}"
        )

    char = _CHARACTER[params.character]
    ceiling_db = float(np.clip(params.ceiling_db, -24.0, 0.0))
    output_ceiling_linear = 10.0 ** (ceiling_db / 20.0)
    lookahead_samples = max(1, round(char["lookahead_ms"] * sr / 1000))

    # 1. DC block
    out = _dc_block(data, sr)

    # 2. L2-style level maximization: lowering threshold is equivalent to
    # driving signal into a fixed output ceiling.
    drive_db = float(np.clip(params.input_gain_db, -24.0, 24.0))
    out = out * (10.0 ** (drive_db / 20.0))

    # 3. Stereo-linked instantaneous peak (max abs across channels)
    peak = np.max(np.abs(out), axis=1) if out.ndim > 1 else np.abs(out)

    # 4. Soft-knee gain onset before full limiting. Threshold drive raises the
    # signal, but gain reduction begins gradually near 0 dBFS instead of snapping
    # on at a hard boundary.
    needed_gain = _soft_knee_gain(peak, params.soft_knee_db)

    # 5. Lookahead: forward-minimum envelope — anticipate the worst peak ahead
    gain_env = _forward_min(needed_gain, lookahead_samples)

    # 6. Attack/release smoothing
    if params.arc:
        gain_smooth = _arc_smooth_gain(
            gain_env,
            sr,
            char["attack_ms"],
            char["release_fast_ms"],
            char["release_slow_ms"],
        )
    else:
        attack_samples = max(1, round(char["attack_ms"] * sr / 1000))
        release_samples = max(1, round(char["release_ms"] * sr / 1000))
        attack_coef = 1.0 - np.exp(-1.0 / attack_samples)
        release_coef = 1.0 - np.exp(-1.0 / release_samples)
        gain_smooth = _smooth_gain(gain_env, attack_coef, release_coef)

    # 5b. Capture gain reduction stats before applying
    if report is not None:
        gr_db = 20.0 * np.log10(np.clip(gain_smooth, 1e-10, 1.0))
        report["drive_db"] = round(drive_db, 1)
        report["threshold_db"] = round(ceiling_db - drive_db, 1)
        report["out_ceiling_db"] = round(ceiling_db, 1)
        report["soft_knee_db"] = round(float(params.soft_knee_db), 1)
        report["gr_peak_db"] = round(float(np.min(gr_db)), 1)
        report["gr_avg_db"] = round(float(np.mean(gr_db)), 1)
        avg = report["gr_avg_db"]
        if avg > -2:
            report["gr_status"] = "transparent"
        elif avg > -4:
            report["gr_status"] = "controlled"
        elif avg > -6:
            report["gr_status"] = "pushed"
        elif avg > -8:
            report["gr_status"] = "aggressive"
        else:
            report["gr_status"] = "risky"

    # 6. Apply gain (broadcast to stereo if needed)
    if out.ndim > 1:
        out = out * gain_smooth[:, np.newaxis]
    else:
        out = out * gain_smooth

    # 7. Apply Out Ceiling as final output trim, then true-peak safety pass.
    out = out * output_ceiling_linear
    out = _true_peak_pass(out, output_ceiling_linear, params.oversample)

    # 8. Clip to ceiling, then dither.
    # Clip must come before dither so the ceiling is enforced on the clean signal;
    # dithering after guarantees the noise floor sits below — not above — the ceiling.
    np.clip(out, -output_ceiling_linear, output_ceiling_linear, out=out)
    if params.dither != "none":
        out = _apply_dither(out, params.bit_depth, params.dither)

    return out
