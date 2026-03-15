import Fastify from "fastify";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { webhookRoute } from "./routes/webhook.js";
import { initUsage, getUsage } from "./services/usage.service.js";
import { getHealthStatus } from "./services/health.service.js";
import { flushPendingPersist } from "./services/usage.persistence.js";

export const app = Fastify({ logger });

app.register(webhookRoute);

app.get("/health", async (_request, reply) => {
  const health = await getHealthStatus();
  reply.code(health.status === "healthy" ? 200 : 503);
  return health;
});
app.get("/health/live", async () => ({ status: "ok" }));
app.get("/usage", async () => getUsage());

const SHUTDOWN_GRACE_MS = 10_000;

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down gracefully");

  // Force exit after grace period
  const forceTimer = setTimeout(() => {
    app.log.warn("Shutdown grace period expired, forcing exit");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceTimer.unref();

  try {
    await app.close();
    await flushPendingPersist();
  } catch (err) {
    app.log.error(err, "Error during graceful shutdown");
  }

  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export const start = async () => {
  try {
    await initUsage();
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`AI Reviewer listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
