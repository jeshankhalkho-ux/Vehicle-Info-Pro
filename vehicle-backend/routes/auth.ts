import { Router, type IRouter } from "express";

const router: IRouter = Router();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const SECRET_KEY = process.env.SECRET_KEY || "Jishan15";

// Pending approval requests: token -> { resolve, reject, timer }
const pendingApprovals = new Map<string, {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

// Send a Telegram message
async function sendTelegram(text: string, replyMarkup?: object) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

// Poll Telegram for callback queries (approve/deny buttons)
async function pollTelegram(offset: number): Promise<number> {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["callback_query"]`;
    const res = await fetch(url, { signal: AbortSignal.timeout(35000) } as any);
    const data: any = await res.json();

    if (!data.ok || !data.result.length) return offset;

    for (const update of data.result) {
      offset = update.update_id + 1;
      const cb = update.callback_query;
      if (!cb) continue;

      const [action, token] = (cb.data || "").split(":");
      const pending = pendingApprovals.get(token);

      // Answer the callback to remove loading state on button
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: cb.id }),
      });

      if (pending) {
        clearTimeout(pending.timer);
        pendingApprovals.delete(token);
        pending.resolve(action === "approve");

        // Edit the message to show result
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            message_id: cb.message?.message_id,
            reply_markup: { inline_keyboard: [] },
          }),
        });
        await sendTelegram(action === "approve" ? "✅ Approved!" : "❌ Denied.");
      }
    }
  } catch {
    // Polling errors are non-fatal
  }
  return offset;
}

// Start polling loop
(async () => {
  if (!TELEGRAM_BOT_TOKEN) return;
  let offset = 0;
  while (true) {
    offset = await pollTelegram(offset);
  }
})();

// ── Auth route: request login approval via Telegram ───────────────────────────
router.post("/auth/request", async (req, res) => {
  const { key } = req.body;

  if (key !== SECRET_KEY) {
    res.status(401).json({ error: "Invalid secret key." });
    return;
  }

  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Send Telegram approval request
  await sendTelegram(
    `🔐 <b>Login Request</b>\n\nSomeone with the correct key is requesting access to VehicleInfo.\n\nApprove?`,
    {
      inline_keyboard: [[
        { text: "✅ Approve", callback_data: `approve:${token}` },
        { text: "❌ Deny", callback_data: `deny:${token}` },
      ]],
    }
  );

  // Wait up to 60s for approval
  const approved = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pendingApprovals.delete(token);
      resolve(false);
    }, 60000);
    pendingApprovals.set(token, { resolve, timer });
  });

  if (approved) {
    res.json({ success: true });
  } else {
    res.status(403).json({ error: "Login denied or timed out." });
  }
});

export default router;
