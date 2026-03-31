import { Router, type IRouter } from "express";
import { createDecipheriv } from "crypto";

const router: IRouter = Router();

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function bufferToHex(buf: Buffer): string {
  return buf.toString("hex").toLowerCase();
}

function solveChallenge(html: string): string | null {
  const aMatch = html.match(/\ba=toNumbers\("([0-9a-f]+)"\)/);
  const bMatch = html.match(/\bb=toNumbers\("([0-9a-f]+)"\)/);
  const cMatch = html.match(/\bc=toNumbers\("([0-9a-f]+)"\)/);

  if (!aMatch || !bMatch || !cMatch) return null;

  const key = hexToBuffer(aMatch[1]);
  const iv = hexToBuffer(bMatch[1]);
  const ciphertext = hexToBuffer(cMatch[1]);

  try {
    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return bufferToHex(decrypted);
  } catch {
    return null;
  }
}

// Main lookup route — accessible as /api/vehicle?rcno=XX or /api/lookup?number=XX
router.get(["/vehicle", "/lookup"], async (req, res) => {
  const rcno = (req.query.rcno || req.query.number) as string | undefined;

  if (!rcno || !rcno.trim()) {
    res.status(400).json({ error: "Vehicle number is required" });
    return;
  }

  const vehicleNumber = rcno.trim().toUpperCase();
  const baseUrl = `https://echat.ct.ws/vehicle.php/?rcno=${encodeURIComponent(vehicleNumber)}`;

  try {
    // Step 1: First request to get challenge HTML
    const firstResponse = await fetch(baseUrl, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/json,*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    } as any);

    const firstText = await firstResponse.text();

    let cookieHeader = "";

    if (firstText.includes("slowAES") || firstText.includes("toNumbers")) {
      const cookieValue = solveChallenge(firstText);
      if (!cookieValue) {
        res.status(502).json({ error: "Could not bypass API protection. Please try again." });
        return;
      }
      cookieHeader = `__test=${cookieValue}`;
    } else if (firstText.trim().startsWith("{") || firstText.trim().startsWith("[")) {
      const data = JSON.parse(firstText);
      if (data?.error || data?.status === "error" || data?.status === false || data?.status === "false") {
        res.status(404).json({ error: data.message || data.error || "Vehicle not found." });
        return;
      }
      res.json(data);
      return;
    }

    // Step 2: Second request with cookie
    const secondUrl = `${baseUrl}&i=1`;
    const secondResponse = await fetch(secondUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
        ...(cookieHeader ? { "Cookie": cookieHeader } : {}),
        "Referer": baseUrl,
      },
      signal: AbortSignal.timeout(15000),
    } as any);

    const secondText = await secondResponse.text();

    if (!secondText || secondText.trim() === "") {
      res.status(404).json({ error: "No data found for this vehicle number. Please verify and try again." });
      return;
    }

    if (secondText.includes("slowAES") || secondText.includes("<html>")) {
      res.status(503).json({ error: "API returned an unexpected response. Please try again in a moment." });
      return;
    }

    let data: any;
    try {
      data = JSON.parse(secondText);
    } catch {
      res.status(502).json({ error: "Invalid response from vehicle registry. Please try again." });
      return;
    }

    if (data?.error || data?.status === "error" || data?.status === false || data?.status === "false") {
      const msg = data.message || data.error || "Vehicle not found in registry.";
      res.status(404).json({ error: msg });
      return;
    }

    if (data?.message && typeof data.message === "string") {
      const msg = data.message.toLowerCase();
      if (msg.includes("not found") || msg.includes("invalid") || msg.includes("no record")) {
        res.status(404).json({ error: data.message });
        return;
      }
    }

    res.json(data);
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      res.status(504).json({ error: "Vehicle registry took too long to respond. Please try again." });
    } else {
      res.status(502).json({ error: "Could not connect to vehicle registry. Please try again." });
    }
  }
});

export default router;
