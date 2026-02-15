export type CarTelemetrySample = {
  timestampMs: number;
  speed: number;
  gear: number;
  rpm: number;
  throttle: number;
  brake: number;
  drs: number;
};

export type CarTelemetryPayload = {
  sessionKey: number;
  sampleIntervalMs: 500;
  createdAt: string;
  byDriver: Record<number, CarTelemetrySample[]>;
};
