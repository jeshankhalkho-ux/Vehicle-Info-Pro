import { Router, type IRouter } from "express";

const router: IRouter = Router();

const VAHANX_API = "https://vahanx-346l.onrender.com/api/rc";

router.get("/rc", async (req, res) => {
  const { number } = req.query;

  if (!number || typeof number !== "string" || !number.trim()) {
    res.status(400).json({ error: "Vehicle number is required" });
    return;
  }

  const vehicleNumber = number.trim().toUpperCase();

  try {
    const response = await fetch(
      `${VAHANX_API}?number=${encodeURIComponent(vehicleNumber)}`,
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        signal: AbortSignal.timeout(20000),
      } as any
    );

    const data = await response.json() as any;

    if (data?.status === "error" || data?.error) {
      res.status(404).json({ error: data.message || data.error || "Vehicle not found." });
      return;
    }

    res.json(data);
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      res.status(504).json({ error: "Request timed out. Please try again." });
    } else {
      res.status(502).json({ error: "Could not connect to RC registry. Please try again." });
    }
  }
});

export default router;
