import "reflect-metadata";
import { IdentityController } from "./identity/controller.js";
import { Sessions } from "./identity/sessions.js";
import { Controller, Get, Inject, Module, Res } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { ServerResponse } from "node:http";
import { Dependencies, sendHealth, startTelemetry } from "@km/foundation";

@Controller()
class FoundationController {
  constructor(
    @Inject(Dependencies) private readonly dependencies: Dependencies,
  ) {}

  @Get("healthz")
  health(@Res() response: ServerResponse) {
    sendHealth(response, "healthy");
  }

  @Get("readyz")
  async readiness(@Res() response: ServerResponse) {
    sendHealth(
      response,
      (await this.dependencies.isReady()) ? "ready" : "unavailable",
    );
  }
}

const dependencies = new Dependencies();

@Module({
  controllers: [FoundationController, IdentityController],
  providers: [
    { provide: Dependencies, useValue: dependencies },
    { provide: Sessions, useFactory: () => new Sessions(dependencies) },
  ],
})
class FoundationModule {}

async function main() {
  const telemetry = startTelemetry();
  const api = await NestFactory.create<NestExpressApplication>(
    FoundationModule,
    {
      logger: ["warn", "error"],
    },
  );
  api.useBodyParser("json", { limit: "12mb" });
  await api.listen(3000, "0.0.0.0");
  console.log(JSON.stringify({ service: "api", event: "listening" }));

  const shutdown = async () => {
    await api.close();
    await dependencies.close();
    await telemetry?.shutdown();
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

void main().catch(() => {
  console.error(JSON.stringify({ service: "api", event: "startup_failed" }));
  process.exitCode = 1;
  void dependencies.close();
});
