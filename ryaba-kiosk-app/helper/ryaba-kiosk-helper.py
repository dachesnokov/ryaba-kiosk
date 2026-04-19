#!/usr/bin/env python3
import json
import os
import pwd
import grp
import shlex
import socket
import shutil
import subprocess
import sys
from pathlib import Path

SOCKET_PATH = "/run/ryaba-kiosk-helper.sock"
KIOSK_USER = os.environ.get("RYABA_KIOSK_USER", "ryaba-kiosk")
KIOSK_GROUP = os.environ.get("RYABA_KIOSK_GROUP", "ryaba-kiosk")


def run(args, timeout=12):
    try:
        proc = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            text=True,
            check=False,
        )
        return {
            "ok": proc.returncode == 0,
            "code": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
            "cmd": " ".join(shlex.quote(x) for x in args),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc), "cmd": args}


def network_status(_payload):
    dev = run(["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "dev", "status"])
    con = run(["nmcli", "-t", "-f", "NAME,TYPE,DEVICE", "con", "show", "--active"])
    ip = run(["hostname", "-I"])
    return {"ok": dev["ok"], "data": {"devices": dev, "connections": con, "ip": ip}}


def wifi_scan(_payload):
    result = run(["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "dev", "wifi", "list", "--rescan", "yes"], timeout=20)
    if not result["ok"]:
        return result

    rows = []
    seen = set()
    for line in result["stdout"].splitlines():
        parts = line.split(":")
        ssid = parts[0].replace("\\:", ":") if parts else ""
        signal = parts[1] if len(parts) > 1 else ""
        security = parts[2] if len(parts) > 2 else ""
        key = (ssid, security)
        if not ssid or key in seen:
            continue
        seen.add(key)
        rows.append({"ssid": ssid, "signal": signal, "security": security})
    return {"ok": True, "data": rows}


def wifi_connect(payload):
    ssid = str(payload.get("ssid") or "").strip()
    password = str(payload.get("password") or "")
    if not ssid:
        return {"ok": False, "error": "SSID is empty"}

    args = ["nmcli", "device", "wifi", "connect", ssid]
    if password:
        args += ["password", password]
    return run(args, timeout=30)



def has_cmd(name):
    return shutil.which(name) is not None


def audio_status(_payload):
    backends = []

    if has_cmd("pactl"):
        volume = run(["pactl", "get-sink-volume", "@DEFAULT_SINK@"])
        mute = run(["pactl", "get-sink-mute", "@DEFAULT_SINK@"])
        source = run(["pactl", "get-source-mute", "@DEFAULT_SOURCE@"])
        return {
            "ok": volume["ok"] or mute["ok"] or source["ok"],
            "backend": "pactl",
            "data": {
                "volume": volume,
                "mute": mute,
                "microphone": source,
            },
        }
    backends.append("pactl: not found")

    if has_cmd("wpctl"):
        volume = run(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"])
        mic = run(["wpctl", "get-volume", "@DEFAULT_AUDIO_SOURCE@"])
        return {
            "ok": volume["ok"] or mic["ok"],
            "backend": "wpctl",
            "data": {
                "volume": volume,
                "microphone": mic,
            },
        }
    backends.append("wpctl: not found")

    if has_cmd("amixer"):
        volume = run(["amixer", "sget", "Master"])
        mic = run(["amixer", "sget", "Capture"])
        return {
            "ok": volume["ok"] or mic["ok"],
            "backend": "amixer",
            "data": {
                "volume": volume,
                "microphone": mic,
            },
        }
    backends.append("amixer: not found")

    return {
        "ok": False,
        "error": "Не найден backend управления звуком",
        "checked": backends,
    }


def audio_set_volume(payload):
    try:
        volume = int(payload.get("volume", 50))
    except Exception:
        volume = 50

    volume = max(0, min(100, volume))

    if has_cmd("pactl"):
        return {
            "ok": True,
            "backend": "pactl",
            "result": run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{volume}%"]),
        }

    if has_cmd("wpctl"):
        return {
            "ok": True,
            "backend": "wpctl",
            "result": run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{volume}%"]),
        }

    if has_cmd("amixer"):
        return {
            "ok": True,
            "backend": "amixer",
            "result": run(["amixer", "sset", "Master", f"{volume}%"]),
        }

    return {
        "ok": False,
        "error": "Не найден pactl/wpctl/amixer для установки громкости",
    }


def audio_mute(payload):
    muted = bool(payload.get("muted"))

    if has_cmd("pactl"):
        value = "1" if muted else "0"
        return {
            "ok": True,
            "backend": "pactl",
            "result": run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", value]),
        }

    if has_cmd("wpctl"):
        value = "1" if muted else "0"
        return {
            "ok": True,
            "backend": "wpctl",
            "result": run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", value]),
        }

    if has_cmd("amixer"):
        value = "mute" if muted else "unmute"
        return {
            "ok": True,
            "backend": "amixer",
            "result": run(["amixer", "sset", "Master", value]),
        }

    return {
        "ok": False,
        "error": "Не найден pactl/wpctl/amixer для mute",
    }



def systemctl_bin():
    found = shutil.which("systemctl")
    if found:
        return found

    for candidate in ["/bin/systemctl", "/usr/bin/systemctl"]:
        if os.path.exists(candidate) and os.access(candidate, os.X_OK):
            return candidate

    return "systemctl"


def system_status(_payload):
    sctl = systemctl_bin()

    def state(unit):
        return {
            "active": run([sctl, "is-active", unit], timeout=5),
            "enabled": run([sctl, "is-enabled", unit], timeout=5),
        }

    return {
        "ok": True,
        "data": {
            "sddm": state("sddm.service"),
            "displayManager": state("display-manager.service"),
            "kiosk": state("ryaba-kiosk-shell.service"),
        },
    }


def schedule_mode_switch(mode):
    sctl = systemctl_bin()
    script = Path(f"/tmp/ryaba-kiosk-switch-{mode}-{os.getpid()}.sh")

    if mode == "kiosk":
        body = f"""#!/usr/bin/env bash
set -u
sleep 1
{sctl} disable --now sddm.service >/tmp/ryaba-kiosk-switch.log 2>&1 || true
{sctl} disable --now display-manager.service >>/tmp/ryaba-kiosk-switch.log 2>&1 || true
{sctl} daemon-reload >>/tmp/ryaba-kiosk-switch.log 2>&1 || true
{sctl} enable --now ryaba-kiosk-shell.service >>/tmp/ryaba-kiosk-switch.log 2>&1 || true
"""
        message = "Запланировано включение чистого режима киоска: SDDM будет выключен, ryaba-kiosk-shell будет включен."
    elif mode == "desktop":
        body = f"""#!/usr/bin/env bash
set -u
sleep 1
{sctl} disable --now ryaba-kiosk-shell.service >/tmp/ryaba-kiosk-switch.log 2>&1 || true
{sctl} daemon-reload >>/tmp/ryaba-kiosk-switch.log 2>&1 || true
{sctl} enable --now sddm.service >>/tmp/ryaba-kiosk-switch.log 2>&1 || true
"""
        message = "Запланирован возврат рабочего стола: ryaba-kiosk-shell будет выключен, SDDM будет включен."
    else:
        return {"ok": False, "error": f"unknown mode: {mode}"}

    script.write_text(body, encoding="utf-8")
    script.chmod(0o755)

    subprocess.Popen(
        ["/bin/bash", str(script)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        close_fds=True,
    )

    return {
        "ok": True,
        "scheduled": True,
        "mode": mode,
        "message": message,
        "log": "/tmp/ryaba-kiosk-switch.log",
    }


def system_enable_kiosk_mode(_payload):
    return schedule_mode_switch("kiosk")


def system_enable_desktop_mode(_payload):
    return schedule_mode_switch("desktop")


ACTIONS = {
    "system.status": system_status,
    "system.enableKioskMode": system_enable_kiosk_mode,
    "system.enableDesktopMode": system_enable_desktop_mode,
    "network.status": network_status,
    "wifi.scan": wifi_scan,
    "wifi.connect": wifi_connect,
    "audio.status": audio_status,
    "audio.setVolume": audio_set_volume,
    "audio.mute": audio_mute,
}


def handle(request):
    action = request.get("action")
    payload = request.get("payload") or {}
    fn = ACTIONS.get(action)
    if not fn:
        return {"ok": False, "error": f"unknown action: {action}"}
    try:
        return fn(payload)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def prepare_socket(path):
    p = Path(path)
    if p.exists():
        p.unlink()
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.bind(path)

    # В режиме полноценного киоска приложение обычно запускается от ryaba-kiosk.
    # Но при ручном запуске из меню МОС оно может идти от текущего пользователя teacher/admin.
    # Поэтому для MVP открываем локальный unix-socket всем локальным пользователям.
    # Сам helper всё равно разрешает только ограниченный набор безопасных действий.
    try:
        uid = pwd.getpwnam(KIOSK_USER).pw_uid
        gid = grp.getgrnam(KIOSK_GROUP).gr_gid
        os.chown(path, uid, gid)
    except Exception:
        pass

    os.chmod(path, 0o666)

    sock.listen(20)
    return sock


def main():
    sock = prepare_socket(SOCKET_PATH)
    print(f"Ryaba Kiosk helper listening on {SOCKET_PATH}", flush=True)

    while True:
        conn, _addr = sock.accept()
        try:
            data = b""
            while not data.endswith(b"\n"):
                chunk = conn.recv(65536)
                if not chunk:
                    break
                data += chunk

            request = json.loads(data.decode("utf-8").strip() or "{}")
            response = handle(request)
            conn.sendall((json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8"))
        except Exception as exc:
            response = {"ok": False, "error": str(exc)}
            try:
                conn.sendall((json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8"))
            except Exception:
                pass
        finally:
            conn.close()


if __name__ == "__main__":
    if os.geteuid() != 0:
        print("This helper must be started as root by systemd.", file=sys.stderr)
    main()
