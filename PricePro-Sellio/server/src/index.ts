import { config, features } from "./config.js";
import { getDb } from "./db/index.js";
import { createApp } from "./app.js";
import { recoverInterruptedGenerations } from "./modules/studio/service.js";

await getDb();
await recoverInterruptedGenerations();

const app = createApp();
app.listen(config.PORT, () => {
  console.log(`PricePro API listening on http://localhost:${config.PORT}`);
  const missing = Object.entries(features)
    .filter(([, on]) => !on)
    .map(([name]) => name);
  if (missing.length) {
    console.log(`Integrations not configured (features will report this to users): ${missing.join(", ")}`);
  }
});
