/// <reference lib="webworker" />

import { type LabelRect, resolveCollisions, type ViewboxBounds } from "../utils/geometry.util";

type LabelWorkerRequest = {
  type: "resolve";
  requestId: number;
  payload: {
    labels: LabelRect[];
    viewbox?: ViewboxBounds | null;
  };
};

type LabelWorkerResponse = {
  type: "resolved";
  requestId: number;
  payload: LabelRect[];
};

self.onmessage = (event: MessageEvent<LabelWorkerRequest>) => {
  const message = event.data;
  if (message.type !== "resolve") return;

  const resolved = resolveCollisions(
    message.payload.labels,
    undefined,
    message.payload.viewbox ?? undefined,
  );

  const response: LabelWorkerResponse = {
    type: "resolved",
    requestId: message.requestId,
    payload: resolved,
  };
  self.postMessage(response);
};
