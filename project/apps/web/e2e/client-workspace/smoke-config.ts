import type { APIRequestContext } from '@playwright/test';

export interface ClientWorkspaceSmokeConfig {
  enabled: boolean;
  webBaseUrl: string;
  apiBaseUrl: string;
  clientId: string;
  token: string;
  email: string;
  password: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function readClientWorkspaceSmokeConfig(env: NodeJS.ProcessEnv = process.env): ClientWorkspaceSmokeConfig {
  return {
    enabled: env.CLIENT_WORKSPACE_LIVE_SMOKE === '1',
    webBaseUrl: trimTrailingSlash(env.CLIENT_WORKSPACE_WEB_BASE_URL ?? 'http://localhost:3002'),
    apiBaseUrl: trimTrailingSlash(env.CLIENT_WORKSPACE_API_BASE_URL ?? env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'),
    clientId: env.CLIENT_WORKSPACE_SMOKE_CLIENT_ID ?? '',
    token: env.CLIENT_WORKSPACE_SMOKE_TOKEN ?? '',
    email: env.CLIENT_WORKSPACE_SMOKE_EMAIL ?? '',
    password: env.CLIENT_WORKSPACE_SMOKE_PASSWORD ?? '',
  };
}

export function missingClientWorkspaceSmokeConfig(config: ClientWorkspaceSmokeConfig): string[] {
  if (!config.enabled) return ['CLIENT_WORKSPACE_LIVE_SMOKE=1'];

  const missing: string[] = [];
  if (!config.clientId) missing.push('CLIENT_WORKSPACE_SMOKE_CLIENT_ID');
  if (!config.token && !(config.email && config.password)) {
    missing.push('CLIENT_WORKSPACE_SMOKE_TOKEN or CLIENT_WORKSPACE_SMOKE_EMAIL + CLIENT_WORKSPACE_SMOKE_PASSWORD');
  }
  return missing;
}

export async function resolveClientWorkspaceSmokeToken(
  request: APIRequestContext,
  config: ClientWorkspaceSmokeConfig,
): Promise<string> {
  if (config.token) return config.token;

  const response = await request.post(`${config.apiBaseUrl}/api/auth/login`, {
    data: { email: config.email, password: config.password },
  });
  if (!response.ok()) {
    throw new Error(`Client Workspace smoke login failed: ${response.status()} ${await response.text()}`);
  }

  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error('Client Workspace smoke login response did not include token.');
  return body.token;
}