import { loadAppConfig } from "../app-config.js";

const config = loadAppConfig();

console.log(
  JSON.stringify(
    {
      server: {
        host: config.server.host,
        port: config.server.port,
        nodeEnv: config.server.nodeEnv,
        selfUrlConfigured: Boolean(config.server.selfUrl),
        corsConfigured: Boolean(config.server.allowedCorsOrigin),
      },
      database: {
        configured: Boolean(config.database.connectionString),
        maxConnections: config.database.maxConnections,
      },
      authConfigured: Boolean(config.auth.authUrl && config.auth.appToken && config.auth.jwksUrl),
      emailConfigured: Boolean(config.email.url && config.email.appToken),
      keyEncryptionConfigured: Boolean(config.keyEncryption.salt && config.keyEncryption.secret),
      paymentConfigured: Boolean(config.payment.provider && config.payment.webhookSecret),
      mapsConfigured: Boolean(config.maps.amapApiKey || config.maps.tencentMapApiKey),
    },
    null,
    2,
  ),
);
