/** Coordinates share the normalized, rotated replay plane. Polygon rings retain holes. */
export type MapPoint = [number, number];
export type MapPolygon = MapPoint[][];

export type CircuitSurroundings = {
  schemaVersion: 1;
  circuitKey: number;
  geometry: { sha256: string; anchors: number[][]; referencePlanarLengthRaw: number };
  source: { snapshotAt: string; url: string; attribution: string };
  metersToWorld: number;
  coverage: MapPolygon;
  terrain?: {
    width: number;
    height: number;
    bounds: [number, number, number, number];
    heights: number[];
    source: { attribution: string; url: string; license: string };
  };
  buildings: {
    id: string;
    polygons: MapPolygon[];
    heightM?: number;
    levels?: number;
    minHeightM?: number;
    kind?: string;
    name?: string;
  }[];
  roads: {
    id: string;
    points: MapPoint[];
    widthM?: number;
    kind: string;
    layer?: number;
    bridge?: boolean;
    tunnel?: boolean;
  }[];
  areas: {
    id: string;
    polygons: MapPolygon[];
    kind: "water" | "wood" | "grass" | "paved" | "parking";
  }[];
};
