/**
 * C37-EXTERNAL-RUNTIME-STORAGE — global depolama modulu.
 *
 * `RuntimeStoragePaths` uygulama acilisinda BIR KEZ cozumlenir; production'da
 * eksik/guvensiz kok boot'ta HARD FAIL uretir (modul yuklemesi patlar).
 */
import { Global, Module } from "@nestjs/common";
import { RuntimeStoragePaths, runtimeStoragePaths } from "./runtime-storage-paths";

@Global()
@Module({
  providers: [
    {
      provide: RuntimeStoragePaths,
      useFactory: () => runtimeStoragePaths(),
    },
  ],
  exports: [RuntimeStoragePaths],
})
export class StorageModule {}
