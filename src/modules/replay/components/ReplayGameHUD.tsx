import { Activity, ArrowUpRight, CloudRain, Crosshair, Radio, Sun, Wind } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import type { OpenF1Weather } from "../types/openf1.types";
import type { DriverRenderState, TelemetryRow, TimelineEvent } from "../types/replay.types";
import { formatTime, getCompoundBadge, getCompoundLabel } from "../utils/format.util";
import type { ReplayEnvironment } from "../utils/replayEnvironment.util";
import "./replay-game-hud.css";

export type ReplayGameHUDProps = {
  rows: TelemetryRow[];
  driverStates: Record<number, DriverRenderState>;
  events: TimelineEvent[];
  currentTimeMs: number;
  startTimeMs: number;
  isPlaying: boolean;
  weather: OpenF1Weather | null;
  environment: ReplayEnvironment;
  meetingName: string;
  sessionType: string;
  panelsVisible: boolean;
  onSeek: (time: number) => void;
  controls: ReactNode;
  telemetryPanel: ReactNode;
  eventsPanel: ReactNode;
  onShowPanels: () => void;
  followDriver: number | null;
  onFollowDriver: (id: number | null) => void;
};

export const ReplayGameHUD = ({
  rows,
  driverStates,
  events,
  currentTimeMs,
  startTimeMs,
  isPlaying,
  weather,
  environment,
  meetingName,
  sessionType,
  panelsVisible,
  onSeek,
  controls,
  telemetryPanel,
  eventsPanel,
  onShowPanels,
  followDriver,
  onFollowDriver,
}: ReplayGameHUDProps) => {
  const [inspector, setInspector] = useState<"telemetry" | "events">("telemetry");
  const currentLap = (rows.find((row) => row.position === 1) ?? rows[0])?.lap;
  const latestEvent = events.reduce<TimelineEvent | null>(
    (latest, event) =>
      event.timestampMs <= currentTimeMs && (!latest || event.timestampMs > latest.timestampMs)
        ? event
        : latest,
    null,
  );
  const localMinutes = Math.floor(environment.localHour * 60);
  const localTime = `${Math.floor(localMinutes / 60)
    .toString()
    .padStart(2, "0")}:${(localMinutes % 60).toString().padStart(2, "0")}`;
  const followedRow = rows.find((row) => row.driverNumber === followDriver);
  const inspectedRow = followedRow ?? rows.find((row) => row.position === 1) ?? rows[0];

  return (
    <div className="game-hud">
      {panelsVisible && (
        <section className="game-tower" aria-label="Race classification">
          <div className="game-tower-heading">
            <span className="game-eyebrow">{sessionType}</span>
            <span className="game-tower-lap">
              LAP <b>{currentLap || "—"}</b>
            </span>
          </div>
          <div className="game-tower-columns" aria-hidden="true">
            <span>POS</span>
            <span>DRIVER</span>
            <span>TYRE</span>
            <span>LAP</span>
          </div>
          <div className="game-tower-rows">
            {rows.map((row) => {
              const following = followDriver === row.driverNumber;
              const compound = getCompoundBadge(row.compound);
              return (
                <button
                  type="button"
                  className="game-driver-row"
                  key={row.driverNumber}
                  style={
                    {
                      "--team-color": driverStates[row.driverNumber]?.color ?? "#a4afbc",
                    } as CSSProperties
                  }
                  aria-label={`${following ? "Stop following" : "Follow"} ${row.driverName}, position ${row.position ?? "unknown"}, ${getCompoundLabel(row.compound)} tyres, lap ${row.lap ?? "unknown"}`}
                  aria-pressed={following}
                  title={`${row.driverName} · ${row.teamName} · ${getCompoundLabel(row.compound)} tyres`}
                  onClick={() => onFollowDriver(following ? null : row.driverNumber)}
                >
                  <span className="game-driver-position">{row.position ?? "—"}</span>
                  <span className="game-driver-identity">
                    <strong>{row.driverAcronym || row.driverNumber}</strong>
                    <span className="game-driver-number">
                      {following ? <Crosshair size={11} /> : row.driverNumber}
                    </span>
                  </span>
                  <span
                    className="game-tyre"
                    data-compound={compound}
                    title={`${getCompoundLabel(row.compound)} tyres`}
                  >
                    {compound}
                  </span>
                  <span className="game-driver-lap">{row.lap ?? "—"}</span>
                </button>
              );
            })}
            {rows.length === 0 && <p className="game-tower-empty">Waiting for timing data</p>}
          </div>
          <div className="game-tower-footer">
            <Crosshair size={11} /> Select a driver to follow
          </div>
        </section>
      )}

      <aside className="game-mission-console" aria-label="Race inspector">
        <section className="game-environment-strip" aria-label="Recorded circuit conditions">
          <div className="game-local-time">
            <strong>{environment.timeKnown ? localTime : "—:—"}</strong>
            <span>{environment.timeKnown ? "LOCAL TIME" : "TIME UNAVAILABLE"}</span>
          </div>
          <div className="game-weather-readout">
            <div>
              {weather ? (
                <>
                  {environment.rainfall > 0 ? <CloudRain size={14} /> : <Sun size={14} />}
                  <strong>{environment.rainfall > 0 ? "Rain" : "No rain"}</strong>
                </>
              ) : (
                <span>Weather unavailable</span>
              )}
            </div>
            {weather && (
              <span>
                AIR {Number.isFinite(weather.air_temperature) ? `${weather.air_temperature}°` : "—"}
                <i />
                TRACK{" "}
                {Number.isFinite(weather.track_temperature) ? `${weather.track_temperature}°` : "—"}
              </span>
            )}
          </div>
          {weather && (
            <span className="game-wind-readout" title="Recorded wind speed">
              <Wind size={12} />
              {Number.isFinite(weather.wind_speed)
                ? `${(weather.wind_speed * 3.6).toFixed(1)}`
                : "—"}
              <small>km/h</small>
            </span>
          )}
        </section>
        <nav className="game-inspector-switch" aria-label="Race data panels">
          <button
            type="button"
            aria-pressed={panelsVisible && inspector === "telemetry"}
            onClick={() => {
              setInspector("telemetry");
              onShowPanels();
            }}
          >
            <Activity size={14} />
            Telemetry
          </button>
          <button
            type="button"
            aria-pressed={panelsVisible && inspector === "events"}
            onClick={() => {
              setInspector("events");
              onShowPanels();
            }}
          >
            <Radio size={14} />
            Race events
          </button>
        </nav>
        <section
          className="game-inspector"
          data-panel={inspector}
          hidden={!panelsVisible}
          aria-label={
            inspector === "telemetry" ? "Driver telemetry inspector" : "Race events inspector"
          }
        >
          <div
            className="game-inspector-heading"
            style={
              {
                "--team-color": inspectedRow
                  ? driverStates[inspectedRow.driverNumber]?.color
                  : "#b4d6e7",
              } as CSSProperties
            }
          >
            <div>
              <span className="game-eyebrow">
                {inspector === "events"
                  ? "Race communications"
                  : followedRow
                    ? "Following driver"
                    : "Leader telemetry"}
              </span>
              <strong>
                {inspector === "events"
                  ? "Race events"
                  : (inspectedRow?.driverName ?? "Awaiting timing")}
              </strong>
            </div>
            <span className="game-inspector-target">
              {inspector === "events" ? (
                <Radio size={24} />
              ) : inspectedRow ? (
                inspectedRow.driverNumber
              ) : (
                <Crosshair size={25} />
              )}
            </span>
          </div>
          <div
            className="game-inspector-pane game-inspector-pane--telemetry"
            hidden={inspector !== "telemetry"}
          >
            {telemetryPanel}
          </div>
          <div
            className="game-inspector-pane game-inspector-pane--events"
            hidden={inspector !== "events"}
          >
            {eventsPanel}
          </div>
          {latestEvent && (
            <button
              className="game-latest-event"
              type="button"
              onClick={() => onSeek(latestEvent.timestampMs)}
              style={{ "--event-color": latestEvent.color } as CSSProperties}
            >
              <span className="game-event-caption">
                <span>Latest moment</span>
                <time>{formatTime(latestEvent.timestampMs - startTimeMs)}</time>
                <ArrowUpRight size={11} />
              </span>
              <strong>{latestEvent.label}</strong>
            </button>
          )}
        </section>
      </aside>

      <div className="game-transport">
        <div className="game-transport-caption">
          <div className="game-transport-title">
            <span className="game-playback-dot" data-playing={isPlaying} />
            <span>{isPlaying ? "REPLAY IN MOTION" : "REPLAY PAUSED"}</span>
            <span className="game-transport-meeting">{meetingName}</span>
          </div>
          {followedRow && (
            <button
              className="game-following"
              type="button"
              onClick={() => onFollowDriver(null)}
              aria-label={`Stop following ${followedRow.driverName}`}
            >
              <Crosshair size={12} /> Following{" "}
              {followedRow.driverAcronym || followedRow.driverNumber}
              <span>×</span>
            </button>
          )}
        </div>
        {controls}
      </div>
    </div>
  );
};
