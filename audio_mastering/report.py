from dataclasses import dataclass, asdict, field
import json
from typing import Optional


@dataclass
class MasteringReport:
    input_file:         str
    output_file:        str
    preset:             str
    target_lufs:        float
    target_tp:          float
    original_lufs:      float
    original_tp:        float
    final_lufs:         float
    final_tp:           float
    duration_sec:       float
    sample_rate:        int
    channels:           int
    tone:               str
    glue:               str
    loudness_mode:      str
    stereo_width:       float
    reference_matched:  bool
    processed_at:       str        # ISO datetime
    gr_peak_db:         float = 0.0
    gr_avg_db:          float = 0.0
    gr_status:          str = "transparent"
    drive_db:           float = 0.0
    threshold_db:       float = 0.0
    out_ceiling_db:     float = 0.0
    soft_knee_db:       float = 0.0
    crest_factor_db:    float = 0.0
    headroom_db:        float = 0.0
    drive_scale:        float = 1.0
    drive_warning:      Optional[str] = None
    # Computed in __post_init__ — do not pass as constructor argument
    lufs_delta:         float = field(init=False)

    def __post_init__(self) -> None:
        self.lufs_delta = self.final_lufs - self.original_lufs

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)
