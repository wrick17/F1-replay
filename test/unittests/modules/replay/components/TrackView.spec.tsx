import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useTrackComputation } from "modules/replay/hooks/useTrackComputation";
import { TrackView } from "modules/replay/components/TrackView";

// A clustered grid used to produce 190 full-label collisions and thousands of track paths.
describe("TrackView", () => {
  it("renders safely before session data arrives", () => {
    const EmptyReplay = () => <TrackView {...useTrackComputation({ data: null, dataRevision: 0, currentTimeMs: 0 })} selectedDrivers={[]} />;
    expect(renderToStaticMarkup(<EmptyReplay />)).toContain("F1 circuit and driver positions");
  });
  it("renders a fixed track base, compact accessible markers and only one full detail label", () => {
    const markup = renderToStaticMarkup(<TrackView
      trackPath={[{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }]}
      pitLanePath={[{ x: 0, y: 0, z: 0 }, { x: 0.5, y: -0.2, z: 0 }, { x: 1, y: 0, z: 0 }]}
      driverStates={Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, { position: { x: 0, y: 0, z: 0 }, color: "#fff", racePosition: i + 1, locationStatus: i ? "live" : "estimated" }]))}
      driverNames={{ 1: "VER" }} driverFullNames={{ 1: "Max Verstappen" }} driverTeams={{}}
      selectedDrivers={[1, 2, 3]} />);
    expect(markup).toMatch(/^<svg[^>]*role="group"/);
    expect(markup.match(/role="button"/g)).toHaveLength(20);
    expect(markup.match(/<path /g)).toHaveLength(3);
    expect(markup).toContain('data-pit-lane="true"');
    expect(markup).toContain('r="7"');
    expect(markup.match(/data-track-detail=/g)).toHaveLength(1);
    expect(markup.match(/data-track-caption=/g)).toHaveLength(1);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(20);
    expect(markup).toContain("Position 1, Max Verstappen");
    expect(markup).toContain("estimated from lap timing");
    expect(markup).toContain("1 VER");
    expect(markup).not.toContain("<image");
  });
});
