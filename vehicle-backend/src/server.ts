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
