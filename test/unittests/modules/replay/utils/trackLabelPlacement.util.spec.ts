import { describe, expect, it } from "bun:test";
import { type ViewboxBounds } from "modules/replay/utils/geometry.util";
import {
  LEADER_LINE_LENGTH,
  placeTrackLabels,
} from "modules/replay/utils/trackLabelPlacement.util";

const BOUNDS: ViewboxBounds = {
  minX: -120,
  minY: -120,
  maxX: 120,
  maxY: 120,
};

describe("placeTrackLabels", () => {
  it("keeps the leader line at fixed length", () => {
    const { placements } = placeTrackLabels(
      [
        {
          key: "44",
          markerX: 0,
          markerY: 0,
          labelWidth: 90,
          labelHeight: 24,
          driverNumber: 44,
        },
      ],
      { x: 0, y: 0 },
      BOUNDS,
    );

    expect(placements).toHaveLength(1);
    const placement = placements[0];
    const distance = Math.hypot(placement.leaderEndX, placement.leaderEndY);
    expect(Math.abs(distance - LEADER_LINE_LENGTH)).toBeLessThan(0.0001);
  });

  it("keeps labels within bounds when a valid angle is available", () => {
    const { placements } = placeTrackLabels(
      [
        {
          key: "16",
          markerX: 20,
          markerY: 0,
          labelWidth: 80,
          labelHeight: 24,
          driverNumber: 16,
        },
      ],
      { x: 0, y: 0 },
      BOUNDS,
    );

    const placement = placements[0];
    const halfW = 40;
    const halfH = 12;

    expect(placement.labelX - halfW).toBeGreaterThanOrEqual(BOUNDS.minX);
    expect(placement.labelX + halfW).toBeLessThanOrEqual(BOUNDS.maxX);
    expect(placement.labelY - halfH).toBeGreaterThanOrEqual(BOUNDS.minY);
    expect(placement.labelY + halfH).toBeLessThanOrEqual(BOUNDS.maxY);
  });

  it("reuses previous angle for stable placement when still valid", () => {
    const labels = [
      {
        key: "1",
        markerX: 10,
        markerY: 20,
        labelWidth: 100,
        labelHeight: 24,
        driverNumber: 1,
      },
    ];

    const first = placeTrackLabels(labels, { x: 0, y: 0 }, BOUNDS);
    const second = placeTrackLabels(
      [
        {
          ...labels[0],
          markerX: 11,
          markerY: 20.5,
        },
      ],
      { x: 0, y: 0 },
      BOUNDS,
      first.angles,
    );

    expect(second.placements[0].angle).toBe(first.placements[0].angle);
  });

  it("keeps labels on the right side of the marker", () => {
    const center = { x: 0, y: 0 };
    const labels = [
      {
        key: "2",
        markerX: -80,
        markerY: -30,
        labelWidth: 96,
        labelHeight: 24,
        driverNumber: 2,
      },
      {
        key: "55",
        markerX: 70,
        markerY: -50,
        labelWidth: 88,
        labelHeight: 24,
        driverNumber: 55,
      },
      {
        key: "14",
        markerX: -65,
        markerY: 75,
        labelWidth: 92,
        labelHeight: 24,
        driverNumber: 14,
      },
    ];

    const { placements } = placeTrackLabels(labels, center, BOUNDS);

    placements.forEach((placement, index) => {
      const marker = labels[index];
      const toLabel = { x: placement.labelX - marker.markerX, y: placement.labelY - marker.markerY };
      expect(toLabel.x).toBeGreaterThan(0);
    });
  });
});
