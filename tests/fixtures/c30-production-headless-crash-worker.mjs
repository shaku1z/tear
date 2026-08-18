import process from "node:process";

function send(value) {
  if (typeof process.send === "function") process.send(value);
}

process.on("message", () => process.exit(42));
send({ format: "tearbench-production-headless-worker", schemaVersion: 1, kind: "ready" });
