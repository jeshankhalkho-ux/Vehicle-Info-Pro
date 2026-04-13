import express from "express";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import routes from "../routes";

const logger = pino({ level: "info" });
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors()); // Allow all origins — required for browser access
app.use(express.json());
app.use(pinoHttp({ logger }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", routes);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on port ${PORT}`);
});

export default app;
app.get('/api/pincode/:pin', async (req, res) => {
  const { pin } = req.params;
  if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: 'Invalid PIN' });
  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pincode data' });
  }
});
