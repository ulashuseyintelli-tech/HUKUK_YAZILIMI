import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";
import { PortalAuthGuard } from "./portal-auth.guard";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "portal-secret-key",
      signOptions: { expiresIn: "7d" },
    }),
  ],
  controllers: [PortalController],
  providers: [PortalService, PortalAuthGuard],
  exports: [PortalService],
})
export class PortalModule {}
