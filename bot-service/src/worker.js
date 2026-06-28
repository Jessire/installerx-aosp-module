const DEFAULT_BUILD_WORKFLOW = "build-aosp-module.yml";
const DEFAULT_GITHUB_REF = "master";
const DEFAULT_GITHUB_REPOSITORY = "Jessire/installerx-aosp-module";

function getConfig(env) {
  return {
    buildWorkflow: env.BUILD_WORKFLOW || DEFAULT_BUILD_WORKFLOW,
    githubRef: env.GITHUB_REF || DEFAULT_GITHUB_REF,
    githubRepository: env.GITHUB_REPOSITORY || DEFAULT_GITHUB_REPOSITORY,
    githubToken: env.GITHUB_TOKEN,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID,
    webhookSecret: env.WEBHOOK_SECRET,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function missingConfig(config) {
  return [
    ["GITHUB_TOKEN", config.githubToken],
    ["TELEGRAM_BOT_TOKEN", config.telegramBotToken],
    ["TELEGRAM_CHAT_ID", config.telegramChatId],
    ["WEBHOOK_SECRET", config.webhookSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

async function telegram(config, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function sendMessage(config, text) {
  await telegram(config, "sendMessage", {
    chat_id: config.telegramChatId,
    text,
    disable_web_page_preview: true,
  });
}

async function dispatchBuild(config, ref) {
  const response = await fetch(
    `https://api.github.com/repos/${config.githubRepository}/actions/workflows/${config.buildWorkflow}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${config.githubToken}`,
        "content-type": "application/json",
        "user-agent": "installerx-aosp-telegram-bot",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: config.githubRef,
        inputs: {
          ref,
          force: "true",
        },
      }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub workflow dispatch failed: ${response.status} ${detail}`);
  }
}

async function latestRuns(config, limit = 3) {
  const response = await fetch(
    `https://api.github.com/repos/${config.githubRepository}/actions/workflows/${config.buildWorkflow}/runs?per_page=${limit}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${config.githubToken}`,
        "user-agent": "installerx-aosp-telegram-bot",
        "x-github-api-version": "2022-11-28",
      },
    },
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
    "/help - show commands",
  ].join("\n");
}

async function handleCommand(config, text) {
  const [rawCommand, ...rest] = text.trim().split(/\s+/);
  const command = rawCommand.split("@", 1)[0].toLowerCase();
  const arg = rest.join(" ").trim();

  if (command === "/start" || command === "/help") {
    await sendMessage(config, helpText());
    return;
  }

  if (command === "/build") {
    await dispatchBuild(config, arg);
    await sendMessage(
      config,
      `Build queued for ${arg || "latest Preview"}.\n` +
        "When it finishes, I will send the module zip here.",
    );
    return;
  }

  if (command === "/status") {
    const runs = await latestRuns(config);
    if (runs.length === 0) {
      await sendMessage(config, "No build runs found yet.");
      return;
    }
    const lines = ["Recent builds:"];
    for (const run of runs) {
      lines.push(`#${run.run_number} ${run.status} ${run.conclusion ?? "-"}\n${run.html_url}`);
    }
    await sendMessage(config, lines.join("\n\n"));
    return;
  }

  await sendMessage(config, `Unknown command.\n\n${helpText()}`);
}

async function handleTelegramUpdate(config, update) {
  const message = update.message;
  if (!message) {
    return;
  }

  const chatId = String(message.chat?.id ?? "");
  if (chatId !== String(config.telegramChatId)) {
    return;
  }

  const text = String(message.text ?? "").trim();
  if (!text.startsWith("/")) {
    return;
  }

  await handleCommand(config, text);
}

export default {
  async fetch(request, env) {
    const config = getConfig(env);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      const missing = missingConfig(config);
      return json({ ok: missing.length === 0, missing });
    }

    if (request.method !== "POST" || url.pathname !== `/telegram/${config.webhookSecret}`) {
      return json({ ok: false }, 404);
    }

    try {
      const missing = missingConfig(config);
      if (missing.length > 0) {
        throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
      }
      const update = await request.json();
      await handleTelegramUpdate(config, update);
      return json({ ok: true });
    } catch (error) {
      console.error(error);
      return json({ ok: true });
    }
  },
};
