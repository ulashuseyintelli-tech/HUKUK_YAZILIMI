import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UserModule } from "./modules/user/user.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { CaseModule } from "./modules/case/case.module";
import { DebtorModule } from "./modules/debtor/debtor.module";
import { TaskModule } from "./modules/task/task.module";
import { ClientModule } from "./modules/client/client.module";
import { LawyerModule } from "./modules/lawyer/lawyer.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    TenantModule,
    CaseModule,
    DebtorModule,
    TaskModule,
    ClientModule,
    LawyerModule,
  ],
})
export class AppModule {}
