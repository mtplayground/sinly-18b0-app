export interface RuntimeConfig {
  host: string;
  port: number;
  nodeEnv: string;
  allowedCorsOrigin?: string;
}

function readPort(value: string | undefined): number {
  if (!value) {
    return 8080;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    host: env.HOST ?? "0.0.0.0",
    port: readPort(env.PORT),
    nodeEnv: env.NODE_ENV ?? "development",
    allowedCorsOrigin: env.ALLOWED_CORS_ORIGIN,
  };
}
