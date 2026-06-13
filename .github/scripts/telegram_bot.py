#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
GITHUB_REF_NAME = os.environ.get("GITHUB_REF_NAME", "master")
BUILD_WORKFLOW = os.environ.get("BUILD_WORKFLOW", "build-aosp-module.yml")
STATE_FILE = Path(os.environ.get("STATE_FILE", ".github/telegram-offset.txt"))


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def request_json(url: str, *, method: str = "GET", data: dict | None = None, headers: dict | None = None) -> dict:
    body = None
    req_headers = headers or {}
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        req_headers = {"Content-Type": "application/json", **req_headers}
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code}: {detail}") from err


def telegram(method: str, payload: dict) -> dict:
    return request_json(
        f"https://api.telegram.org/bot{BOT_TOKEN}/{method}",
        method="POST",
        data=payload,
    )


def send_message(text: str) -> None:
    telegram(
        "sendMessage",
        {
            "chat_id": CHAT_ID,
            "text": text,
            "disable_web_page_preview": True,
        },
    )


def get_updates(offset: int) -> list[dict]:
    query = urllib.parse.urlencode(
        {
            "offset": offset,
            "timeout": 0,
            "allowed_updates": json.dumps(["message"]),
        }
    )
    response = request_json(f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?{query}")
    if not response.get("ok"):
        raise RuntimeError(f"Telegram getUpdates failed: {response}")
    return response.get("result", [])


def dispatch_build(ref: str) -> None:
    inputs = {"ref": ref, "force": "true"}
    request_json(
        f"https://api.github.com/repos/{GITHUB_REPOSITORY}/actions/workflows/{BUILD_WORKFLOW}/dispatches",
        method="POST",
        data={"ref": GITHUB_REF_NAME, "inputs": inputs},
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )


def latest_runs(limit: int = 3) -> list[dict]:
    query = urllib.parse.urlencode({"per_page": limit})
    response = request_json(
        f"https://api.github.com/repos/{GITHUB_REPOSITORY}/actions/workflows/{BUILD_WORKFLOW}/runs?{query}",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    return response.get("workflow_runs", [])


def help_text() -> str:
    return "\n".join(
        [
            "InstallerX AOSP Module Bot",
            "",
            "/build - build latest upstream Preview and send module zip",
            "/build <ref> - build a specific upstream tag or branch",
            "/status - show recent build runs",
            "/help - show commands",
        ]
    )


def handle_command(text: str) -> None:
    command, _, rest = text.strip().partition(" ")
    command = command.split("@", 1)[0].lower()
    arg = rest.strip()

    if command in {"/start", "/help"}:
        send_message(help_text())
        return

    if command == "/build":
        dispatch_build(arg)
        target = arg if arg else "latest Preview"
        send_message(
            f"Build queued for {target}.\n"
            "When it finishes, I will send the module zip here."
        )
        return

    if command == "/status":
        runs = latest_runs()
        if not runs:
            send_message("No build runs found yet.")
            return
        lines = ["Recent builds:"]
        for run in runs:
            conclusion = run.get("conclusion") or "-"
            lines.append(
                f"#{run['run_number']} {run['status']} {conclusion}\n"
                f"{run['html_url']}"
            )
        send_message("\n\n".join(lines))
        return

    send_message("Unknown command.\n\n" + help_text())


def read_offset() -> int:
    try:
        return int(STATE_FILE.read_text(encoding="utf-8").strip())
    except FileNotFoundError:
        return 0
    except ValueError:
        return 0


def write_offset(offset: int) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(f"{offset}\n", encoding="utf-8")


def main() -> None:
    if not BOT_TOKEN or not CHAT_ID:
        print("Telegram secrets are not set; nothing to poll.")
        return
    if not GITHUB_TOKEN or not GITHUB_REPOSITORY:
        fail("GitHub environment is incomplete.")

    offset = read_offset()
    updates = get_updates(offset)
    if not updates:
        print("No Telegram updates.")
        return

    next_offset = offset
    handled = 0
    for update in updates:
        update_id = int(update["update_id"])
        next_offset = max(next_offset, update_id + 1)

        message = update.get("message") or {}
        chat = message.get("chat") or {}
        if str(chat.get("id")) != str(CHAT_ID):
            continue

        text = (message.get("text") or "").strip()
        if not text.startswith("/"):
            continue

        handle_command(text)
        handled += 1

    write_offset(next_offset)
    print(f"Processed {handled} command(s); next offset {next_offset}.")


if __name__ == "__main__":
    main()
