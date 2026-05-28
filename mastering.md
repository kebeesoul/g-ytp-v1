# Vibe Master Mastering Engine Port Spec

이 문서는 현재 `vibe_master`에 최종 적용된 마스터링 엔진을 `g-ytp-v1` 레포지토리에 이식하기 위한 코드 구조와 음향 세팅 기준이다.

Editor 화면 기준 `Target Loudness`를 켜고 `Render Master`를 누르면 영상 익스포트 전 Supabase Storage에 해당 트랙리스트의 `mastered/` 폴더가 생성되고, 각 파일이 마스터링된 이후 최종 플레이리스트 영상이 익스포트된다.

`Target Loudness` 버튼을 끄고 `Render Master`를 누르면 마스터링 기능은 바이패스된다.

## 1. 최종 고정 세팅

현재 UI에서 사용자 조절값은 제거되어 있고, 마스터링은 아래 값으로 고정된다.

```ts
TARGET_LOUDNESS = -9.0;      // LUFS
OUTPUT_CEILING = -0.1;       // dBTP
LRA_TARGET = 9.0;            // LU
STEREO_WIDTH = 1.0;          // 1.00x
TONE = "balanced";
GLUE = "light";
LOUDNESS_MODE = "natural";
EXPORT_FORMAT = "wav";
BIT_DEPTH = 24;
SAMPLE_RATE = "keep";
DITHER = "off";
```

이 값들은 `ui/app/page.tsx`에서 FormData로 `/preview`, `/master`에 전달된다. 다른 repo에 이식할 때 UI가 없더라도 동일 payload를 서버나 worker에서 직접 구성하면 된다.

## 2. 이식해야 하는 최소 코드 구조

마스터링 엔진만 이식할 경우 필요한 Python 파일은 다음이다.

```text
core/
├── audio.py       # load, loudness/peak measure, trim, fade, wav/flac write
├── drive.py       # crest-aware drive decision
├── limiter.py     # L2-style lookahead limiter/maximizer
├── mastering.py   # ffmpeg tone/glue/width preprocessing
├── report.py      # MasteringReport dataclass
└── presets.py     # preset fallback; fixed mode에서는 optional
server.py          # FastAPI API layer, upload/temp/render handling
vibe_master.py     # standalone CLI; worker integration에 유용
```

Next.js UI까지 가져갈 경우 필요한 프론트 파일은 다음이다.

```text
ui/app/page.tsx
ui/app/components/FileDropZone.tsx
ui/app/components/SourceAnalysisCard.tsx
ui/app/components/GainReductionMeter.tsx
ui/app/components/ABComparePanel.tsx
ui/app/components/WarningPanel.tsx
ui/app/components/EstimatedResultPanel.tsx
ui/app/components/VUMeter.tsx
ui/app/components/types.ts
ui/app/globals.css
```

## 3. Python 의존성

```txt
numpy>=1.24
scipy>=1.10
soundfile>=0.12
pyloudnorm>=0.1.1
fastapi>=0.110
uvicorn[standard]>=0.27
python-multipart>=0.0.9
```

시스템 의존성:

```bash
ffmpeg
libsndfile
```

## 4. API 구조

### `POST /analyze`

원본 파일을 분석만 한다. 마스터링 페이더나 고정값이 원본 모니터에 영향을 주면 안 된다.

입력:

```text
file: WAV / AIFF / FLAC / MP3
```

출력:

```json
{
  "integrated_lufs": -13.4,
  "short_term_max": -9.8,
  "true_peak": -1.2,
  "lra": 4.1,
  "clipping": false,
  "sample_rate": 48000,
  "bit_depth": 24,
  "channels": 2,
  "duration": 181.25,
  "headroom": 1.2
}
```

### `POST /preview`

항상 원본의 `1:00` 지점부터 30초 구간을 렌더한다. 원본이 짧으면 가능한 마지막 30초 구간으로 clamp한다.

필수 payload:

```text
file=<audio>
preset=custom
lufs_override=-9.0
tp_override=-0.1
lra_override=9.0
tone=balanced
glue=light
loudness_mode=natural
width=1.0
```

응답:

```text
audio/wav
X-GR-Report: gain reduction JSON
X-Preview-Start-Sec: 실제 preview start
X-Preview-Duration-Sec: 실제 preview duration
X-Source-Duration-Sec: 원본 길이
```

### `POST /master`

전체 파일을 마스터링하고 완성 파일을 반환한다.

필수 payload:

```text
file=<audio>
preset=custom
lufs_override=-9.0
tp_override=-0.1
lra_override=9.0
tone=balanced
glue=light
loudness_mode=natural
width=1.0
export_format=wav
bit_depth=24
sample_rate_override=keep
dither=off
```

응답:

```text
audio/wav
X-Mastering-Report: MasteringReport JSON
```

## 5. 오디오 처리 파이프라인

Full render 기준 신호 흐름:

```text
Upload audio
  ↓
load_audio(always_2d=True, float64)
  ↓
measure original LUFS and peak
  ↓
calculate_crest_aware_drive(target_lufs, source_lufs, source_peak)
  ↓
trim_silence(threshold=-55 dB, pad=30 ms)
  ↓
apply_fades(edge declick minimum=5 ms)
  ↓
write temp pre-WAV
  ↓
ffmpeg tone/glue/width preprocessing
  ↓
Python L2-style limiter/maximizer
  ↓
true-peak safety pass, optional dither, quantize
  ↓
write mastered WAV 24-bit
  ↓
measure final LUFS/peak
  ↓
return file + report
```

Preview는 같은 processing을 사용하지만 입력 전체가 아니라 30초 monitoring section만 처리한다.

## 6. Tone / Glue / Width 기준

현재 고정값은 `balanced / light / 1.0`이다.

### Tone: `balanced`

`core/mastering.py`의 ffmpeg pre-filter:

```text
equalizer=f=80:t=q:w=1.0:g=1.0
equalizer=f=2500:t=q:w=1.2:g=-0.8
equalizer=f=10000:t=q:w=0.8:g=1.2
```

의도:

- 80 Hz를 약하게 들어 음악적 무게를 보강한다.
- 2.5 kHz를 살짝 눌러 거친 중역을 완화한다.
- 10 kHz를 약하게 들어 유튜브 업로드 후 답답함을 줄인다.

### Glue: `light`

`light`는 compressor를 걸지 않는다. 현재 설계에서는 glue 단계가 loudness를 만들지 않고, 최종 loudness는 limiter drive에서 만든다.

### Stereo Width: `1.0`

`width=1.0`은 stereo widening을 적용하지 않는다. 모노 호환성, 보컬/센터 안정성, 유튜브 재인코딩 안정성을 우선한다.

## 7. L2 스타일 마스터링 설계

이 엔진은 Waves L2식 동작에 가깝게, `Target Loudness`를 고정 출력 정규화가 아니라 limiter threshold drive로 해석한다.

핵심 관계:

```text
base_gap_db = target_lufs - source_lufs
drive_db = crest/headroom/density 조건으로 보정된 base_gap_db
threshold_db = output_ceiling_db - drive_db
```

즉, target이 더 loud할수록 signal을 limiter로 더 밀어 넣는다. `Output Ceiling`은 최종 출력 상한이므로 낮추면 실제 mastered monitor와 render 모두 낮아져야 한다.

금지:

- 최종 단계에서 `ffmpeg loudnorm`을 loudness controller로 다시 사용하지 않는다.
- compressor makeup gain으로 loudness를 만들지 않는다.
- original monitor에 mastered chain을 적용하지 않는다.

## 8. Crest-Aware Drive 기준

`core/drive.py`의 `calculate_crest_aware_drive()`가 drive를 결정한다.

입력:

```python
target_lufs: float
source_lufs: float
source_true_peak: float
```

계산 기준:

```text
base_gap = target_lufs - source_lufs
crest_factor = source_true_peak - source_lufs
headroom = -source_true_peak
```

보정 규칙:

- `base_gap <= 0`: 소스가 이미 target 이상이면 추가 drive를 하지 않고, 필요하면 gain을 줄인다.
- crest factor가 높고 headroom이 충분하며 source가 충분히 조용하면 drive scale을 최대 `1.25x`까지 허용한다.
- crest factor가 낮으면 이미 dense/limited된 소스로 보고 drive를 줄인다.
- source LUFS가 이미 높으면 drive를 줄인다.
- true-peak headroom이 낮으면 drive를 줄인다.
- drive scale은 `0.45x`부터 `1.25x` 사이로 제한한다.
- 최종 drive는 `-24 dB`부터 `+24 dB` 사이로 clamp한다.

경고 메시지:

```text
Drive reduced: source already dense or limited
Drive reduced: source already loud
Drive reduced: low true-peak headroom
```

이 경고는 UI에서는 기술 파라미터로 노출하지 않고, 결과/주의 메시지 정도로만 보여준다.

## 9. Limiter 기준

현재 `LOUDNESS_MODE=natural`은 limiter character `clean`으로 매핑된다.

```python
natural -> clean
punchy -> balanced
aggressive -> aggressive
```

현재 사용하는 `clean` limiter 세팅:

```text
attack_ms = 1.0
release_ms = 150.0
release_fast_ms = 35.0
release_slow_ms = 320.0
lookahead_ms = 5.0
oversample = 4
soft_knee_db = 4.0
arc = true
dither = none
bit_depth = 24
ceiling_db = -0.1
```

동작 순서:

```text
DC block
  ↓
input drive
  ↓
stereo-linked peak detection
  ↓
soft-knee gain onset
  ↓
lookahead forward-min envelope
  ↓
ARC-style fast/slow release smoothing
  ↓
apply gain reduction
  ↓
output ceiling trim
  ↓
4x oversampled true-peak safety pass
  ↓
clip to ceiling
  ↓
optional dither
```

해석:

- transient detection은 lookahead와 forward-min envelope로 near-instant에 가깝게 반응한다.
- `attack_ms=1.0`은 click/zipper noise를 줄이기 위한 smoothing이다.
- release는 Auto Release 성격이다. peak transient에는 빠르게, sustained RMS와 low-end에는 느리게 회복한다.
- `soft_knee_db=4.0`은 threshold 근처에서 갑자기 눌리는 느낌을 줄인다.
- limiter는 stereo-linked로 동작해 좌우 이미지가 흔들리지 않게 한다.

## 10. 저장소 없이 동작 가능한 구조

현재 구조는 Supabase, DB, object storage 없이도 동작한다.

이유:

- 업로드 파일은 `temp/`에 임시 저장한다.
- 처리 중간 산출물도 `temp/`에 쓴 뒤 finally에서 삭제한다.
- 완성 파일은 `mastered/`에 저장하고 `FileResponse`로 즉시 반환한다.
- 오래된 mastered 파일은 다음 `/master` 호출 시 best-effort cleanup한다.
- 브라우저는 응답 blob을 받아 다운로드하거나 A/B preview URL로 사용한다.

운영형 유튜브 제작 repo에서는 다음 중 하나를 선택한다.

```text
A. 즉시 응답형
   FastAPI /master 호출 → 파일 blob 수신 → 바로 다운로드/다음 파이프라인 전달

B. 워커형
   render job 생성 → worker가 local temp에서 master → 결과를 S3/R2/Supabase Storage에 업로드 → URL 저장
```

추천:

- 로컬 제작 도구는 A안이 단순하다.
- 여러 사용자가 동시에 쓰는 SaaS/팀 파이프라인은 B안이 맞다.

## 11. 동시성 주의

`core/mastering.py`는 ffmpeg process cancel을 위해 module-level `_active_proc`를 사용한다.

현재 서버는 안전하게 아래로 제한되어 있다.

```python
ThreadPoolExecutor(max_workers=1)
```

이 값을 2 이상으로 올리면 한 작업의 cancel이 다른 작업의 ffmpeg process를 죽일 수 있다. 병렬 처리가 필요하면 job id별 process registry로 구조를 바꿔야 한다.

## 12. 유튜브 제작 레포 이식 권장 구조

유튜브 콘텐츠 제작 repo에 붙일 때는 다음처럼 분리하는 것이 가장 안전하다.

```text
youtube_repo/
├── audio_mastering/
│   ├── __init__.py
│   ├── audio.py
│   ├── drive.py
│   ├── limiter.py
│   ├── mastering.py
│   └── report.py
├── workers/
│   └── master_audio.py
├── api/
│   └── master.py
└── storage/
    └── mastered/
```

권장 worker 함수 형태:

```python
def master_for_youtube(input_path: Path, output_path: Path) -> MasteringReport:
    target_lufs = -9.0
    true_peak = -0.1
    lra = 9.0
    tone = "balanced"
    glue = "light"
    loudness_mode = "natural"
    width = 1.0
    bit_depth = 24
    dither = "none"
    sample_rate = "keep"
    ...
```

영상 렌더 파이프라인에서는 최종 mux 직전 오디오 WAV를 이 함수에 넣고, mastered WAV를 영상에 다시 mux한다.

## 13. QA 기준

이식 후 최소 검증:

```bash
python3 -m pytest
```

기능 검증:

- WAV / AIFF / FLAC / MP3 업로드가 모두 동작해야 한다.
- `/analyze`는 원본 분석만 해야 한다.
- `/preview`는 항상 같은 `1:00` 구간을 처리해야 한다.
- Original monitor는 mastering 설정 영향을 받지 않아야 한다.
- Mastered monitor와 final render는 같은 고정값을 사용해야 한다.
- Output ceiling `-0.1 dBTP`를 넘지 않아야 한다.
- 이미 loud/dense한 소스에서는 `drive_warning`이 발생할 수 있어야 한다.

사운드 체크:

- quiet source는 자연스럽게 앞으로 와야 한다.
- 이미 큰 source는 과도하게 더 눌리지 않아야 한다.
- transient가 갑자기 찌그러지거나 pumping이 심하면 drive scale, soft knee, release 값을 먼저 점검한다.
- 유튜브 업로드용 최종 목표는 loudness 경쟁보다 보컬/센터 안정성과 재인코딩 후 왜곡 최소화다.

## 14. 현재 기준 파일 위치

```text
ui/app/page.tsx       # fixed UI payload values
server.py             # API, temp/mastered file lifecycle, fixed form handling
core/audio.py         # IO and measurement
core/drive.py         # crest-aware drive
core/mastering.py     # ffmpeg pre-processing
core/limiter.py       # L2-style limiter
core/report.py        # render report
```

이 문서와 코드가 충돌하면, 현재는 코드가 source of truth다.
