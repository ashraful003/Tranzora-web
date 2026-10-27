import { initProjectStorage, writeWorkspace, freshState, DEMO_WS, writeDirectory, writeBackups } from "../lib/db/server-storage";

console.log("[Storage] Initializing project local storage inside /data...");
initProjectStorage().then(() => {
  const fresh = freshState();
  return Promise.all([
    writeWorkspace(DEMO_WS, fresh),
    writeDirectory({ "admin@tranzora.com": DEMO_WS }),
    writeBackups(DEMO_WS, []),
  ]);
}).then(() => {
  console.log("[Storage] Project local storage successfully initialized at /data!");
}).catch((err) => {
  console.error("[Storage] Failed to initialize storage:", err);
});
