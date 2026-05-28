from typing import TypedDict

import numpy as np
import soundfile as sf
import pyloudnorm as pyln


class SourceAnalysis(TypedDict):
    integrated_lufs: float
    short_term_max: float
    true_peak: float
    lra: float
    clipping: bool
    sample_rate: int
    bit_depth: int
    channels: int
    duration: float
    headroom: float


def load_audio(path: str) -> tuple[np.ndarray, int]:
    """Load audio file, return (samples float64, sample_rate)."""
    data, sr = sf.read(path, dtype="float64", always_2d=True)
    return data, sr


def measure_loudness(data: np.ndarray, sr: int) -> tuple[float, float]:
    """Return (integrated LUFS, true peak dBFS).

    pyloudnorm returns -inf for completely silent signals. That value is clamped
    to -120.0 so callers always receive a finite float (e.g. lufs_delta stays
    finite even when the input is silence).
    """
    meter = pyln.Meter(sr)
    lufs = float(meter.integrated_loudness(data))
    if not np.isfinite(lufs):
        lufs = -120.0
    # True peak: max absolute sample value in dBFS
    peak_linear = np.max(np.abs(data))
    tp = 20.0 * np.log10(peak_linear) if peak_linear > 0 else -120.0
    return lufs, tp


def analyze_source(path: str) -> SourceAnalysis:
    """Full source analysis — returns metrics dict for the UI Source Analysis card."""
    # Open once: SoundFile exposes subtype + lets us read samples in the same handle.
    with sf.SoundFile(path) as f:
        subtype = f.subtype
        sr = f.samplerate
        data = f.read(dtype="float64", always_2d=True)

        meter = pyln.Meter(sr)
        integrated = meter.integrated_loudness(data)

        peak_linear = float(np.max(np.abs(data)))
        peak_db = 20.0 * np.log10(peak_linear) if peak_linear > 0 else -120.0

        # Short-term loudness (3s non-overlapping blocks) for short-term max and LRA.
        # Files shorter than one block yield no measurements; the fallback
        # short_term_max = integrated below handles that case.
        block_size = int(3 * sr)
        short_terms: list[float] = []
        if len(data) >= block_size:
            for start in range(0, len(data) - block_size + 1, block_size):
                bl = meter.integrated_loudness(data[start : start + block_size])
                if bl > -70:  # skip silence
                    short_terms.append(bl)

        short_term_max = max(short_terms) if short_terms else integrated

        # LRA approximation: 95th - 10th percentile of short-term loudness
        if len(short_terms) >= 2:
            st = sorted(short_terms)
            p10 = st[max(0, int(len(st) * 0.10))]
            p95 = st[min(len(st) - 1, int(len(st) * 0.95))]
            lra = p95 - p10
        else:
            lra = 0.0

        # Bit depth from subtype
        subtype_upper = subtype.upper()
        if "FLOAT" in subtype_upper or subtype_upper.endswith("32"):
            bit_depth = 32
        elif "24" in subtype_upper:
            bit_depth = 24
        else:
            bit_depth = 16

        channels = data.shape[1]
        duration = len(data) / sr

    return SourceAnalysis(
        integrated_lufs=round(float(integrated), 1),
        short_term_max=round(float(short_term_max), 1),
        true_peak=round(float(peak_db), 1),
        lra=round(float(lra), 1),
        clipping=peak_linear >= 1.0,
        sample_rate=sr,
        bit_depth=bit_depth,
        channels=channels,
        duration=round(float(duration), 2),
        headroom=round(float(-peak_db), 1),
    )


def find_loudest_section(
    data: np.ndarray, sr: int, duration_sec: float = 30.0
) -> tuple[int, int]:
    """Return (start, end) indices of the loudest section of given duration."""
    assert data.ndim == 2, (
        "find_loudest_section expects a 2D array (N, channels). "
        "Use load_audio() which sets always_2d=True."
    )
    window = int(sr * duration_sec)
    if len(data) <= window:
        return 0, len(data)

    mono = np.mean(data, axis=1)
    sq = mono ** 2
    cumsum = np.concatenate([[0.0], np.cumsum(sq)])
    energy = cumsum[window:] - cumsum[:-window]
    start = int(np.argmax(energy))
    return start, start + window


def trim_silence(
    data: np.ndarray,
    sr: int,
    threshold_db: float = -55.0,
    pad_ms: int = 30,
) -> np.ndarray:
    """Remove leading/trailing silence, keep pad_ms on each side."""
    threshold_linear = 10 ** (threshold_db / 20.0)
    pad_samples = int(sr * pad_ms / 1000)

    # Find first/last sample above threshold
    above = np.any(np.abs(data) > threshold_linear, axis=1)
    indices = np.where(above)[0]

    if len(indices) == 0:
        return data  # all silent, return as-is

    start = max(0, indices[0] - pad_samples)
    end = min(len(data), indices[-1] + 1 + pad_samples)
    return data[start:end]


def apply_fades(
    data: np.ndarray,
    sr: int,
    fade_in_ms: int = 300,
    fade_out_ms: int = 800,
) -> np.ndarray:
    """Apply equal-power cosine fade in/out (sin^2/cos^2 curves)."""
    result = data.copy()
    n_samples = len(result)

    fade_in_samples = min(int(sr * fade_in_ms / 1000), n_samples // 2)
    fade_out_samples = min(int(sr * fade_out_ms / 1000), n_samples // 2)

    if fade_in_samples > 0:
        # sin^2 ramp: 0->1
        t = np.linspace(0.0, np.pi / 2, fade_in_samples)
        envelope = np.sin(t) ** 2
        result[:fade_in_samples] *= envelope[:, np.newaxis]

    if fade_out_samples > 0:
        # cos^2 ramp: 1->0
        t = np.linspace(0.0, np.pi / 2, fade_out_samples)
        envelope = np.cos(t) ** 2
        result[-fade_out_samples:] *= envelope[:, np.newaxis]

    return result


def save_wav(
    data: np.ndarray,
    sr: int,
    path: str,
    *,
    file_format: str = "WAV",
    subtype: str = "PCM_24",
) -> None:
    """Write audio at given sample rate. Defaults to PCM_24 WAV."""
    sf.write(path, data, sr, format=file_format, subtype=subtype)
