/**
 * jest setupFiles — test framework VE test-file modülleri (dolayısıyla @prisma/client require'ı)
 * YÜKLENMEDEN önce çalışır. DATABASE_URL'i fail-safe değere pinler → prod/.env sızıntısı engellenir.
 * bkz test/test-db-env.ts
 */
import { applyTestDatabaseEnv } from './test-db-env';

applyTestDatabaseEnv(process.env);
