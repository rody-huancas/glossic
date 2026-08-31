import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { appConfig } from "./config/app.config.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(appConfig.port);
}

void bootstrap();
