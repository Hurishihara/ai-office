import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
createApp({}).listen(config.port, "127.0.0.1", () => {
  console.log(`server listening on http://127.0.0.1:${config.port}`);
});
