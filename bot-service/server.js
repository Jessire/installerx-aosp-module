import http from "node:http";

const {
  BUILD_WORKFLOW = "build-aosp-module.yml",
  GITHUB_REF = "master",
  GITHUB_REPOSITORY = "Jessire/installerx-aosp-module",
  GITHUB_TOKEN,
  PORT = "10000",
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  WEBHOOK_SECRET
} = process.env;

function required(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

required("GITHUB_TOKEN", GITHUB_TOKEN);
required("TELEGRAM_BOT_TOKEN", TELEGRAM_BOT_TOKEN);
required("TELEGRAM_CHAT_ID", TELEGRAM_CHAT_ID);
required("WEBHOOK_SECRET", WEBHOOK_SECRET);

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function sendMessage(text) {
  await telegram("sendMessage", {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    disable_web_page_preview: true
  });
}

async function dispatchBuild(ref) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${BUILD_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${GITHUB_TOKEN}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify({
        ref: GITHUB_REF,
        inputs: {
          ref,
          force: "true"
        }
      })
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub workflow dispatch failed: ${response.status} ${detail}`);
  }
}

async function latestRuns(limit = 3) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${BUILD_WORKFLOW}/runs?per_page=${limit}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${GITHUB_TOKEN}`,
        "x-github-api-version": "2022-11-28"
      }
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub runs lookup failed: ${response.status} ${detail}`);
  }
  const data = await response.json();
  return data.workflow_runs ?? [];
}

function helpText() {
  return [
    "InstallerX AOSP Module Bot",
    "",
    "/build - build latest upstream Preview and send module zip",
    "/build <ref> - build a specific upstream tag or branch",
    "/status - show recent build runs",
    "/help - show commands"
  ].join("\n");
}

async function handleCommand(text) {
  const [rawCommand, ...rest] = text.trim().split(/\s+/);
  const command = rawCommand.split("@", 1)[0].toLowerCase();
  const arg = rest.join(" ").trim();

  if (command === "/start" || command === "/help") {
    await sendMessage(helpText());
    return;
  }

  if (command === "/build") {
    await dispatchBuild(arg);
    await sendMessage(
      `Build queued for ${arg || "latest Preview"}.\n` +
        "When it finishes, I will send the module zip here."
    );
    return;
  }

  if (command === "/status") {
    const runs = await latestRuns();
    if (runs.length === 0) {
      await sendMessage("No build runs found yet.");
      return;
    }
    const lines = ["Recent builds:"];
    for (const run of runs) {
      lines.push(`#${run.run_number} ${run.status} ${run.conclusion ?? "-"}\n${run.html_url}`);
    }
    await sendMessage(lines.join("\n\n"));
    return;
  }

  await sendMessage(`Unknown command.\n\n${helpText()}`);
}

async function handleTelegramUpdate(update) {
  const message = update.message;
  if (!message) {
    return;
  }

  const chatId = String(message.chat?.id ?? "");
  if (chatId !== String(TELEGRAM_CHAT_ID)) {
    return;
  }

  const text = String(message.text ?? "").trim();
  if (!text.startsWith("/")) {
    return;
  }

  await handleCommand(text);
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/health") {
      send(response, 200, { ok: true });
      return;
    }

    if (request.method !== "POST" || url.pathname !== `/telegram/${WEBHOOK_SECRET}`) {
      send(response, 404, { ok: false });
      return;
    }

    const update = await readJson(request);
    await handleTelegramUpdate(update);
    send(response, 200, { ok: true });
  } catch (error) {
    console.error(error);
    send(response, 200, { ok: true });
  }
});

server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Telegram webhook bot listening on port ${PORT}`);
});
