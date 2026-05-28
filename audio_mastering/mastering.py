import json
import subprocess
import shlex
import threading
from typing import Optional


class JobCancelledError(RuntimeError):
    """Raised when a mastering job is cancelled via cancel_active()."""


# Single active ffmpeg process — allows cancel via kill().
# IMPORTANT: these globals assume exactly one concurrent mastering job.
# The server enforces this via ThreadPoolExecutor(max_workers=1).
# Never increase max_workers without replacing this with per-job state;
# two concurrent jobs would share _active_proc and one cancel could kill the other.
_proc_lock = threading.Lock()
_active_proc: "subprocess.Popen[str] | None" = None

# Set by cancel_active(); checked between Pass 1 and Pass 2 to catch the gap
# where _active_proc is briefly None while the chain switches processes.
_cancel_event = threading.Event()


def _set_proc(proc: "subprocess.Popen[str] | None") -> None:
    global _active_proc
    with _proc_lock:
        _active_proc = proc


def cancel_active() -> bool:
    """
    Signal cancellation and kill the running ffmpeg process if any.
    Sets _cancel_event so the inter-pass gap is also covered.
    Returns True if a process was killed.
    """
    global _active_proc
    _cancel_event.set()
    with _proc_lock:
        if _active_proc is not None:
            _active_proc.kill()
            _active_proc = None  # clear immediately to prevent stale ref after kill
            return True
    return False


def _build_pre_filters(tone: str, glue: str, width: float) -> list[str]:
    """Build tone, glue, and width filters before L2-style maximization."""
    filters: list[str] = []

    # Tone → EQ
    if tone == "balanced":
        filters.append("equalizer=f=80:t=q:w=1.0:g=1.0")
        filters.append("equalizer=f=2500:t=q:w=1.2:g=-0.8")
        filters.append("equalizer=f=10000:t=q:w=0.8:g=1.2")
    elif tone == "warm":
        filters.append("equalizer=f=80:t=q:w=1.0:g=2.0")
        filters.append("equalizer=f=2500:t=q:w=1.2:g=-1.2")
        filters.append("equalizer=f=10000:t=q:w=0.8:g=0.5")
        # Slow phaser LFO adds subtle chorus-like warmth; not true harmonic saturation
        filters.append("aphaser=in_gain=0.4:out_gain=0.74:delay=3:decay=0.4:speed=0.5:type=t")
    # clean: no EQ — pass through untouched

    # Glue → compression
    # makeup=1.0 intentionally: compressor controls peaks only, not loudness.
    # Loudness normalization is handled by loudnorm; makeup gain here would
    # over-boost quiet sections and create the illusion of loud sections shrinking.
    if glue == "medium":
        filters.append("acompressor=threshold=-18dB:ratio=2:attack=15:release=300:makeup=1.0")
    elif glue == "strong":
        filters.append("acompressor=threshold=-12dB:ratio=3:attack=10:release=250:makeup=1.0")
    # light: no compression

    # Stereo width
    if abs(width - 1.0) > 0.01:
        filters.append(f"extrastereo=m={width:.3f}:c=0")

    return filters


def _build_filter_chain(
    lufs: float,
    tp: float,
    lra: float,
    tone: str,
    glue: str,
    width: float,
    measured: dict,
) -> str:
    """
    Build the ffmpeg -af filter string for Pass 2.

    tone: "clean" | "balanced" | "warm"
    glue: "light" | "medium" | "strong"

    Raises:
        ValueError: if any value in `measured` cannot be cast to float
                    (e.g. a corrupted loudnorm JSON field).
    """
    filters = _build_pre_filters(tone, glue, width)

    # loudnorm linear two-pass
    # Cast to float to guard against injected strings from ffmpeg stderr parsing.
    # Fallback values are ffmpeg loudnorm's built-in defaults (EBU R128 reference signal):
    #   input_i=-23 (EBU R128 target), input_tp=-2 (EBU ceiling), input_lra=7 (typical music),
    #   input_thresh=-33 (gating threshold), offset=0 (no correction needed).
    # These are only used if Pass 1 JSON is missing a key, which should never happen in practice.
    input_i      = float(measured.get("input_i",      -23.0))
    input_tp     = float(measured.get("input_tp",      -2.0))
    input_lra    = float(measured.get("input_lra",      7.0))
    input_thresh = float(measured.get("input_thresh", -33.0))
    offset       = float(measured.get("target_offset",  0.0))

    filters.append(
        f"loudnorm=I={lufs}:TP={tp}:LRA={lra}"
        f":measured_I={input_i}"
        f":measured_TP={input_tp}"
        f":measured_LRA={input_lra}"
        f":measured_thresh={input_thresh}"
        f":offset={offset}"
        f":linear=true:print_format=none"
    )

    return ",".join(filters)


def loudnorm_pass1(
    input_path: str,
    lufs: float,
    tp: float,
    lra: float,
    tone: str = "balanced",
    glue: str = "light",
    width: float = 1.0,
) -> dict:
    """
    Run loudnorm Pass 1 to measure input loudness.

    Applies the same EQ / compressor / width pre-filters as Pass 2 so that
    the measurement reflects the signal loudnorm will actually receive — which
    is required for EBU R128 two-pass linear normalization to be accurate.

    Returns a parsed JSON dict from ffmpeg stderr with values already cast to
    float so callers never receive raw strings.
    Raises JobCancelledError if the process is killed.
    """
    pre_filters = _build_pre_filters(tone, glue, width)
    loudnorm_filter = f"loudnorm=I={lufs}:TP={tp}:LRA={lra}:print_format=json"
    af_chain = ",".join(pre_filters + [loudnorm_filter])

    cmd = [
        "ffmpeg", "-hide_banner", "-y",
        # -threads 0: use all available CPU cores per ffmpeg job.
        # Concurrency is capped at the job level by the executor's max_workers=1,
        # not at the thread level, so letting ffmpeg use all cores is safe and fast.
        "-threads", "0",
        "-i", input_path,
        "-af", af_chain,
        "-f", "null", "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    _set_proc(proc)
    _, stderr = proc.communicate()
    _set_proc(None)

    # POSIX only: -9 = SIGKILL, -15 = SIGTERM. Windows is not supported —
    # kill() there returns returncode=1 which falls through to RuntimeError.
    if proc.returncode in (-9, -15):
        raise JobCancelledError()
    if proc.returncode != 0:
        raise RuntimeError(f"loudnorm Pass 1 failed (exit {proc.returncode}).\nstderr:\n{stderr}")

    # loudnorm JSON is always the last {...} block in stderr
    start = stderr.rfind("{")
    end = stderr.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            raw = json.loads(stderr[start:end])
            # Cast numeric values to float — loudnorm also emits string fields
            # like "normalization_type": "linear" that must be left as-is.
            result = {}
            for k, v in raw.items():
                try:
                    result[k] = float(v)
                except (ValueError, TypeError):
                    result[k] = v
            return result
        except json.JSONDecodeError:
            pass
    raise RuntimeError(f"loudnorm Pass 1 failed to return JSON.\nstderr:\n{stderr}")


def run_ffmpeg_chain(
    input_path: str,
    output_path: str,
    lufs: float,
    tp: float,
    lra: float,
    tone: str = "balanced",
    glue: str = "light",
    width: float = 1.0,
    sample_rate: int = 44100,
    codec: str = "pcm_s24le",
    codec_opts: Optional[list[str]] = None,
) -> None:
    """
    Apply tonal preprocessing before the L2-style maximizer stage.

    Loudness is intentionally not normalized here. The final level is driven by
    core.limiter using input_gain_db and a fixed output ceiling, matching the
    Threshold/Out Ceiling relationship of an L2-style workflow.
    """
    # Clear any stale cancel signal from a previous job.
    # All global state resets happen here — callers (tests included) don't need to
    # reset _cancel_event manually; this is the single authoritative entry point.
    _cancel_event.clear()

    if _cancel_event.is_set():
        raise JobCancelledError()

    filter_chain = ",".join(_build_pre_filters(tone, glue, width)) or "anull"

    cmd = [
        "ffmpeg", "-hide_banner", "-y",
        "-threads", "0",
        "-i", input_path,
        "-af", filter_chain,
        "-ar", str(sample_rate),
        "-c:a", codec,
        *(codec_opts or []),
        output_path,
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    _set_proc(proc)
    _, stderr = proc.communicate()
    _set_proc(None)

    # POSIX only: -9 = SIGKILL, -15 = SIGTERM. Windows is not supported —
    # kill() there returns returncode=1 which falls through to RuntimeError.
    if proc.returncode in (-9, -15):
        raise JobCancelledError()
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg preprocessing failed (exit {proc.returncode}).\n"
            f"cmd: {shlex.join(cmd)}\n"
            f"stderr:\n{stderr}"
        )
