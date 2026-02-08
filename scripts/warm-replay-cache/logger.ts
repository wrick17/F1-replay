import { LOG_FILE } from "./config";
import type { WarmStatus } from "./types";

export const initLogger = (status: WarmStatus) => {
  let logWriteChain = Promise.resolve();
  const appendLog = (line: string) => {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    status.recentLogs.unshift(stamped);
    status.recentLogs = status.recentLogs.slice(0, 200);
    logWriteChain = logWriteChain
      .then(() => Bun.write(LOG_FILE, `${stamped}\n`, { append: true }))
      .catch(() => undefined);
    console.log(stamped);
  };
  const touchStatus = () => {
    status.updatedAt = new Date().toISOString();
  };
  return { appendLog, touchStatus };
};
