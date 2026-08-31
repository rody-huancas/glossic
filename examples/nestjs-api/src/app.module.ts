import { Module } from "@nestjs/common";

import { LoggerMiddleware } from "./common/middleware/logger.middleware.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [UsersModule],
  providers: [LoggerMiddleware],
})
export class AppModule {}
