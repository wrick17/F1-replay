import type { WarmStatus } from "./types";
import { LOG_FILE } from "./config";

export const initLogger = (status: WarmStatus) => {
  let logWriteChain = Promise.resolve();

  const appendLog = (line: string) => {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    status.recentLogs.unshift(stamped);
    status.recentLogs = status.recentLogs.slice(0, 500);
    status.updatedAt = new Date().toISOString();

    // Chain writes to preserve order and avoid blowing up on transient fs errors.
    logWriteChain = logWriteChain
      .then(() => Bun.write(LOG_FILE, `${stamped}\n`, { append: true }))
      .catch(() => undefined);

    // eslint-disable-next-line no-console
    console.log(stamped);
  };

  const recordFailure = (entry: string) => {
    status.recentFailures.unshift(entry);
    status.recentFailures = status.recentFailures.slice(0, 50);
    status.updatedAt = new Date().toISOString();
  };

  const touchStatus = () => {
    status.updatedAt = new Date().toISOString();
  };

  return { appendLog, recordFailure, touchStatus };
};

