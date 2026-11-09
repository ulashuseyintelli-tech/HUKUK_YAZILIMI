import { Module } from "@nestjs/common";
import { TaskService } from "./task.service";
import { TaskController } from "./task.controller";
import { WorkScopePermissionModule } from "@/modules/work-scope-permission/work-scope-permission.module";
// F02 P3 tarama S10: görev yanıtına gömülen dosya nesnesi dosya görünüm kapsamına bağlıdır (CaseViewScopeService; döngü yok).
import { CaseViewScopeModule } from "@/modules/case/case-view-scope.module";

@Module({
  imports: [WorkScopePermissionModule, CaseViewScopeModule],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
