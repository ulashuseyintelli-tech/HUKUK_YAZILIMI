import { Module } from "@nestjs/common";
import { CollectionController } from "./collection.controller";
import { CollectionService } from "./collection.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
