// Env bootstrap — MUST be the first import in index.ts (static imports run in order, so this
// executes before redis.ts/queues.ts read process.env at module load). Loads the package-local
// .env if present, then FALLS BACK to the monorepo root .env: the worker runs with cwd=apps/worker
// (turbo / pnpm --filter), where a bare `import 'dotenv/config'` finds nothing and the first Prisma
// call dies with "Environment variable not found: DATABASE_URL". dotenv never overrides vars that
// are already set, so real environments (Railway) are unaffected.
import { config as loadEnv } from 'dotenv';
import * as path from 'node:path';

loadEnv();
loadEnv({ path: path.resolve(__dirname, '../../../.env') });
