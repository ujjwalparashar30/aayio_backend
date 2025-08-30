import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import chalk from "chalk";
import { clerkMiddleware } from "@clerk/express";


import routes from "./routes/auth.route";
import questionRoutes from "./routes/question.route";
import tradingRoutes from "./routes/trading.route";
import p2pRoutes from "./routes/p2p.route";
import adminRoutes from "./routes/admin.route";
import walletRoutes from "./routes/wallet.route";
import webhookRoutes from "./routes/webhook.route";

dotenv.config();
const app = express();

/* ✅ 1) CORS FIRST */
const allowedOrigins: string[] = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL || "",  // fallback to empty string if undefined
].filter(Boolean) as string[];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);
app.options("*", cors());

/* ✅ 2) Security & parsers */
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/* ✅ 3) Webhooks BEFORE Clerk & JSON parsing */
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);


/* ✅ 4) Clerk AFTER CORS */
app.use(clerkMiddleware());

/* ✅ 5) Logging */
morgan.token("statusColor", (req, res) => {
  const status = res.statusCode;
  if (status >= 500) return chalk.red(status.toString());
  if (status >= 400) return chalk.yellow(status.toString());
  if (status >= 300) return chalk.cyan(status.toString());
  if (status >= 200) return chalk.green(status.toString());
  return chalk.white(status.toString());
});
app.use(
  morgan((tokens, req, res) => {
    return [
      chalk.gray(tokens.date(req, res, "iso")),
      chalk.blue(tokens.method(req, res)),
      chalk.white(tokens.url(req, res)),
      tokens["statusColor"](req, res),
      chalk.magenta(tokens["response-time"](req, res) + " ms"),
    ].join(" ");
  })
);

/* ✅ 6) Routes */
app.use((req, res, next) => {
  console.log(`📡 Incoming: ${req.method} ${req.originalUrl}`);
  next();
});
app.get("/", (_req, res) => res.send("🚀 Backend is running!"));
app.use("/api", routes);
app.use("/api/question", questionRoutes);
app.use("/api/trading", tradingRoutes);
app.use("/api/p2p", p2pRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/wallet", walletRoutes);

/* ✅ 7) Error handler (helps debug 500s) */
app.use((err  :any , _req : Request, res : Response, _next : NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(chalk.green.bold(`✅ Server running on http://localhost:${PORT}`));
});
