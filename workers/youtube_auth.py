#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow


SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--channel-id", required=True)
    parser.add_argument("--auth-dir", required=True)
    args = parser.parse_args()

    auth_dir = Path(args.auth_dir)
    client_secret = auth_dir / "client_secret.json"
    token_path = auth_dir / f"token_{args.channel_id}.json"

    if not client_secret.exists():
        emit({"error": f"client_secret.json not found: {client_secret}"})
        return 1

    try:
        flow = InstalledAppFlow.from_client_secrets_file(str(client_secret), SCOPES)
        credentials = flow.run_local_server(port=0)
        token_path.write_text(credentials.to_json(), encoding="utf-8")
        emit({"tokenPath": token_path.name})
        return 0
    except Exception as exc:
        emit({"error": str(exc)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
