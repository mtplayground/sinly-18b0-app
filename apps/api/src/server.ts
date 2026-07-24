import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, config.host, () => {
  console.log(`API server listening on http://${config.host}:${config.port}`);
});
