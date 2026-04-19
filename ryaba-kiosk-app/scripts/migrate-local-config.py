#!/usr/bin/env python3
import json
from pathlib import Path
from datetime import datetime

state_dir = Path("/var/lib/ryaba-kiosk")
local = state_dir / "local-config.json"
remote = state_dir / "remote-config.json"

state_dir.mkdir(parents=True, exist_ok=True)

try:
    data = json.loads(local.read_text(encoding="utf-8")) if local.exists() else {}
except Exception:
    data = {}

clean = {}

core_url = data.get("coreUrl") or data.get("core_url")
token = data.get("enrollmentToken") or data.get("enrollment_token")

if core_url:
    clean["coreUrl"] = core_url

if token:
    clean["enrollmentToken"] = token

clean["migratedAt"] = datetime.now().isoformat()

local.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

try:
    local.chmod(0o666)
except Exception:
    pass

try:
    remote.unlink()
except FileNotFoundError:
    pass
except Exception:
    pass
