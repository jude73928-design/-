#!/usr/bin/env node
process.env.HOST = "0.0.0.0";
process.env.NITRO_HOST = "0.0.0.0";
const targetPort = process.env.PORT || "3000";
process.env.PORT = targetPort;
process.env.NITRO_PORT = targetPort;

import("../.output/server/index.mjs")
  .then(() => {
    console.log(`Server started on http://0.0.0.0:${targetPort}`);
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
