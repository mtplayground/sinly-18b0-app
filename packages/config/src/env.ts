export function readOptionalString(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function readString(env: NodeJS.ProcessEnv, name: string, fallback?: string): string {
  const value = readOptionalString(env, name) ?? fallback;

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
): number {
  const rawValue = readOptionalString(env, name);

  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (
    Number.isNaN(value) ||
    (options.min !== undefined && value < options.min) ||
    (options.max !== undefined && value > options.max)
  ) {
    throw new Error(`Invalid ${name} value: ${rawValue}`);
  }

  return value;
}

export function readOptionalUrl(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = readOptionalString(env, name);

  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}
