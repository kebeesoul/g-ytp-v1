#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


CHUNK_SIZE = 8 * 1024 * 1024
QUOTA_USED_UPLOAD = 1600
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def load_metadata(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    tags = data.get("tags")
    return {
        "title": str(data.get("title", "")),
        "description": str(data.get("description", "")),
        "tags": tags if isinstance(tags, list) else [],
    }


def upload(video_path: Path, token_path: Path, metadata_path: Path) -> str:
    metadata = load_metadata(metadata_path)
    credentials = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    youtube = build("youtube", "v3", credentials=credentials)

    body = {
        "snippet": {
            "title": metadata["title"],
            "description": metadata["description"],
            "tags": metadata["tags"],
            "categoryId": "10",
        },
        "status": {
            "privacyStatus": "private",
        },
    }

    media = MediaFileUpload(
        str(video_path),
        chunksize=CHUNK_SIZE,
        resumable=True,
        mimetype="video/mp4",
    )
    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media,
    )

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            emit({"progress": int(status.progress() * 100)})

    video_id = response.get("id")
    if not video_id:
        raise RuntimeError("YouTube upload completed without video id")
    return str(video_id)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--metadata", required=True)
    args = parser.parse_args()

    try:
        video_id = upload(Path(args.video), Path(args.token), Path(args.metadata))
        emit({"videoId": video_id, "quotaUsed": QUOTA_USED_UPLOAD})
        return 0
    except Exception as exc:
        emit({"error": str(exc)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
