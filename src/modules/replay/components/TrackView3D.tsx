import { useEffect, useMemo, useRef, useState } from "react";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ClusteredLighting } from "three/addons/lighting/ClusteredLighting.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ACESFilmicToneMapping,
  CatmullRomCurve3,
  Color,
  type Group,
  InstancedMesh,
  LineSegments,
  MathUtils,
  Mesh,
  type MeshStandardMaterial,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  Sprite,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
  WebGPURenderer,
} from "three/webgpu";
import type { TrackViewProps } from "../types/replay.types";
import { constrainMapCamera3D, fitTrackOverviewCamera3D } from "../utils/mapCamera3d.util";
import { loadReplayCarModel3D } from "../utils/replayCar3d.util";
import { elevateReplayTrack3D } from "../utils/replayElevation3d.util";
import type { ReplayEnvironment } from "../utils/replayEnvironment.util";
import { createReplayVolumetricLighting3D } from "../utils/replayVolumetricLighting3d.util";
import { createReplayWorld3D, REPLAY_CLUSTERED_LIGHT_LIMIT_3D } from "../utils/replayWorld3d.util";
import {
  getTrackBounds3D,
  projectTrackPosition3D,
  smoothTrackAngle3D,
  type TrackPoint3D,
  toTrackPoints3D,
} from "../utils/track3d.util";

type TrackView3DProps = TrackViewProps & {
  active: boolean;
  circuitKey?: number;
  environment: ReplayEnvironment;
  followDriver: number | null;
  onFollowDriver: (driverNumber: number | null) => void;
  onReady: () => void;
  onError: (message: string) => void;
};

type SceneActions = {
  orbit: (angle: number) => void;
  reset: () => void;
  start: () => void;
  zoom: (factor: number) => void;
};

const makeCurve = (points: TrackPoint3D[], closed: boolean) =>
  new CatmullRomCurve3(
    points.map(({ x, y = 0, z }) => new Vector3(x, y, z)),
    closed,
    "centripetal",
  );

const disposeObject = (object: Object3D) => {
  object.traverse((child) => {
    if (child instanceof Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
      return;
    }
    if (!(child instanceof Mesh) && !(child instanceof LineSegments)) return;
    if (child instanceof InstancedMesh) child.dispose();
    if (!child.geometry.userData.sharedReplayCarResource) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if ("map" in material) (material.map as Texture | null)?.dispose();
      if (!material.userData.sharedReplayCarResource) material.dispose();
    }
  });
};

export default function TrackView3D(props: TrackView3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const latestPropsRef = useRef(props);
  const activeRef = useRef(props.active);
  const followRef = useRef<number | null>(null);
  const readyRef = useRef(false);
  const actionsRef = useRef<SceneActions | null>(null);
  const [canInitialize, setCanInitialize] = useState(false);
  const { followDriver } = props;
  latestPropsRef.current = props;
  activeRef.current = props.active;
  followRef.current = followDriver;

  const elevation = useMemo(
    () => elevateReplayTrack3D(toTrackPoints3D(props.trackPath), props.circuitKey),
    [props.trackPath, props.circuitKey],
  );
  const trackPoints = elevation.points;
  const savedViewRef = useRef<{
    points: ReturnType<typeof toTrackPoints3D>;
    position: Vector3;
    target: Vector3;
    follow: number | null;
    overview: boolean;
  } | null>(null);
  const pitPoints = useMemo(
    () => toTrackPoints3D(props.pitLanePath ?? [], false),
    [props.pitLanePath],
  );
  const drivers = Object.entries(props.driverStates)
    .filter(
      ([, state]) =>
        state.position && Number.isFinite(state.position.x) && Number.isFinite(state.position.y),
    )
    .map(([number]) => Number(number))
    .sort(
      (a, b) =>
        (props.driverStates[a].racePosition ?? 99) - (props.driverStates[b].racePosition ?? 99),
    );

  useEffect(() => {
    if (trackPoints.length >= 3 || readyRef.current) return;
    readyRef.current = true;
    latestPropsRef.current.onReady();
  }, [trackPoints.length]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setCanInitialize(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!canInitialize) return;
    const container = containerRef.current;
    if (!container || trackPoints.length < 3) return;

    let renderer: WebGPURenderer;
    try {
      renderer = new WebGPURenderer({ antialias: true, alpha: false });
      renderer.lighting = new ClusteredLighting(REPLAY_CLUSTERED_LIGHT_LIMIT_3D, 32, 24, 64);
    } catch {
      latestPropsRef.current.onError("This browser could not start the 3D circuit view.");
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new Scene();
    scene.background = new Color(0xa9c9d6);
    const camera = new PerspectiveCamera(42, 1, 0.006, 64);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.07;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = (Math.PI * 78) / 180;
    controls.minPolarAngle = Math.PI * 0.025;

    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    container.prepend(renderer.domElement);

    const bounds = getTrackBounds3D(trackPoints);
    const center = new Vector3(bounds.centerX, 0, bounds.centerZ);
    const span = Math.max(bounds.width, bounds.depth, 0.5);
    const trackHeights = trackPoints.map((point) => point.y ?? 0);
    const overviewTarget = center
      .clone()
      .setY((Math.min(...trackHeights) + Math.max(...trackHeights)) / 2);
    camera.near = span * 0.006;
    camera.far = span * 64;
    const trackCurve = makeCurve(trackPoints, true);
    const trackRoute = Array.from({ length: 1001 }, (_, index) => ({
      point: trackCurve.getPointAt(index / 1000),
      tangent: trackCurve.getTangentAt(index / 1000),
    }));
    const elevatedPitPoints = trackPoints.some((point) => Math.abs(point.y ?? 0) > 1e-7)
      ? pitPoints.map((point) => ({
          ...point,
          y: projectTrackPosition3D(point, trackRoute)?.point.y ?? 0,
        }))
      : pitPoints;
    const pitCurve = elevatedPitPoints.length >= 2 ? makeCurve(elevatedPitPoints, false) : null;
    const pitRoute = pitCurve
      ? Array.from({ length: 201 }, (_, index) => ({
          point: pitCurve.getPointAt(index / 200),
          tangent: pitCurve.getTangentAt(index / 200),
        }))
      : [];
    const previousProgress = new Map<number, number>();
    let drawingBufferWidth = 1;
    let drawingBufferHeight = 1;
    let world: ReturnType<typeof createReplayWorld3D>;
    const worldBuildStarted = performance.now();
    try {
      const teams = new Map<string, string>();
      for (const [number, team] of Object.entries(latestPropsRef.current.driverTeams))
        teams.set(
          team.name,
          latestPropsRef.current.driverStates[Number(number)]?.color ?? "#70808d",
        );
      world = createReplayWorld3D(
        scene,
        center,
        span,
        trackCurve,
        pitCurve,
        elevation.bridge,
        [...teams.values()],
        props.surroundings,
      );
      renderer.domElement.dataset.worldBuildMs = (performance.now() - worldBuildStarted).toFixed(1);
    } catch (error) {
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      console.error("Could not initialize the circuit world", error);
      latestPropsRef.current.onError("This browser could not build the 3D circuit world.");
      return;
    }

    let carModel: Awaited<ReturnType<typeof loadReplayCarModel3D>> | undefined;
    let environmentTarget: ReturnType<PMREMGenerator["fromScene"]> | undefined;
    let volumetric: ReturnType<typeof createReplayVolumetricLighting3D> | undefined;
    const cars = new Map<number, Group>();
    const previous = new Map<number, Vector3>();
    let overviewDistance = 1;
    const savedView =
      savedViewRef.current?.points === trackPoints &&
      savedViewRef.current.follow === followRef.current
        ? savedViewRef.current
        : null;
    let overview = savedView?.overview ?? true;
    let previousFollow: number | null = savedView?.follow ?? null;
    let previousReplayTime: number | null = null;
    let followTransition = 0;
    const chaseOffset = new Vector3();
    let animationFrame = 0;
    let disposed = false;
    let initialized = false;
    let initializationSettled = false;
    let failed = false;
    let renderFrames = 0;

    const resetOverview = () => {
      overview = true;
      controls.target.copy(overviewTarget);
      const width = Math.max(container.clientWidth, 1),
        height = Math.max(container.clientHeight, 1);
      // Keep the centered projection clear of the widest side HUD and its page inset.
      const panelInset = width >= 1024 ? 330 : 298;
      const usableWidth =
        width >= 900 ? Math.max(width - panelInset * 2, width * 0.35) : width * 0.9;
      const usableHeight =
        width >= 900 ? Math.max(height - 280, height * 0.45) : Math.max(height * 0.52, 180);
      overviewDistance = fitTrackOverviewCamera3D(
        camera,
        overviewTarget,
        trackPoints,
        usableWidth / width,
        usableHeight / height,
      );
      controls.minDistance = span * 0.028;
      controls.maxDistance = overviewDistance * 2;
      followTransition = 0;
      controls.update();
    };

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      // ClusteredLighting requires tile-aligned buffers and a symmetric camera projection.
      drawingBufferWidth = Math.ceil((width * pixelRatio) / 32) * 32;
      drawingBufferHeight = Math.ceil((height * pixelRatio) / 32) * 32;
      renderer.setDrawingBufferSize(drawingBufferWidth, drawingBufferHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (overview && followRef.current === null) resetOverview();
    };

    let steeringSettling = false;
    let previousRenderTime = performance.now();
    const updateCars = (seconds = 0) => {
      steeringSettling = false;
      if (!carModel) return;
      const { driverStates } = latestPropsRef.current;
      const replayTime = latestPropsRef.current.environment.timeMs;
      const seeking =
        previousReplayTime !== null &&
        (replayTime < previousReplayTime || replayTime - previousReplayTime > 1000);
      previousReplayTime = replayTime;
      for (const car of cars.values()) car.visible = false;
      for (const [key, state] of Object.entries(driverStates)) {
        const driverNumber = Number(key);
        const position = state.position;
        let car = cars.get(driverNumber);
        if (!car) {
          car = carModel.createCar(
            driverNumber,
            state.color,
            latestPropsRef.current.driverNames[driverNumber] ?? String(driverNumber),
          );
          car.scale.setScalar(0.05);
          cars.set(driverNumber, car);
          scene.add(car);
        }
        const visible = Boolean(
          position && Number.isFinite(position.x) && Number.isFinite(position.y),
        );
        car.visible = visible;
        if (!visible || !position) {
          previous.delete(driverNumber);
          previousProgress.delete(driverNumber);
          continue;
        }
        const direction = state.direction
          ? { x: state.direction.x, z: state.direction.y }
          : undefined;
        const location = { x: position.x, z: position.y };
        const main = projectTrackPosition3D(
          location,
          trackRoute,
          direction,
          seeking ? undefined : previousProgress.get(driverNumber),
        );
        const pit = pitRoute.length ? projectTrackPosition3D(location, pitRoute, direction) : null;
        const route = pit && main && pit.distance + 0.001 < main.distance ? pit : main;
        if (route === main && main) previousProgress.set(driverNumber, main.progress);
        else previousProgress.delete(driverNumber);
        const next = new Vector3(position.x, (route?.point.y ?? 0) + 0.001, position.y);
        const last = previous.get(driverNumber);
        car.rotation.order = "YXZ";
        const snap = !last || seeking || last.distanceToSquared(next) > 0.0009;
        const heading =
          !seeking && direction && Math.hypot(direction.x, direction.z) > 1e-7
            ? direction
            : route?.tangent;
        const targetYaw = heading ? Math.atan2(heading.x, heading.z) : car.rotation.y;
        const targetPitch = route
          ? -Math.atan2(route.tangent.y ?? 0, Math.hypot(route.tangent.x, route.tangent.z))
          : 0;
        car.rotation.y = smoothTrackAngle3D(car.rotation.y, targetYaw, seconds, snap);
        car.rotation.x = smoothTrackAngle3D(car.rotation.x, targetPitch, seconds, snap);
        steeringSettling ||=
          Math.abs(
            Math.atan2(Math.sin(targetYaw - car.rotation.y), Math.cos(targetYaw - car.rotation.y)),
          ) > 0.002 || Math.abs(targetPitch - car.rotation.x) > 0.002;
        car.position.copy(next);
        previous.set(driverNumber, next);
        const bodyMaterial = car.userData.bodyMaterial as MeshStandardMaterial;
        bodyMaterial.color.set(state.color);
        const selected = latestPropsRef.current.selectedDrivers.includes(driverNumber);
        bodyMaterial.emissive.set(selected ? state.color : 0x000000);
        bodyMaterial.emissiveIntensity = selected ? 0.2 : 0;
      }

      const followed = followRef.current === null ? null : cars.get(followRef.current);
      if (followRef.current !== previousFollow) {
        if (followed?.visible || followRef.current === null) previousFollow = followRef.current;
        if (followed?.visible) {
          chaseOffset
            .set(0, span * 0.06, -span * 0.12)
            .applyAxisAngle(new Vector3(0, 1, 0), followed.rotation.y);
          followTransition = reducedMotion ? 1 : 70;
        } else if (overview && followRef.current === null) resetOverview();
      }
      if (followed?.visible) {
        renderer.domElement.dataset.followHeight = followed.position.y.toFixed(5);
        renderer.domElement.dataset.followYaw = followed.rotation.y.toFixed(6);
        const delta = followed.position.clone().sub(controls.target);
        if (!reducedMotion) delta.multiplyScalar(0.15);
        controls.target.add(delta);
        camera.position.add(delta);
        if (followTransition > 0) {
          camera.position.lerp(controls.target.clone().add(chaseOffset), reducedMotion ? 1 : 0.085);
          followTransition--;
        }
      }
    };

    const updateLabels = () => {
      const current = latestPropsRef.current;
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
      const ordered = [...cars.entries()]
        .filter(([, car]) => car.visible)
        .sort(
          ([a], [b]) =>
            Number(b === followRef.current) - Number(a === followRef.current) ||
            Number(current.selectedDrivers.includes(b)) -
              Number(current.selectedDrivers.includes(a)) ||
            (current.driverStates[a]?.racePosition ?? 99) -
              (current.driverStates[b]?.racePosition ?? 99),
        );
      for (const [, car] of ordered) {
        const caption = car.userData.caption as Sprite | undefined;
        if (!caption) continue;
        caption.visible = false;
        const projected = car.position.clone();
        const distance = camera.position.distanceTo(car.position);
        const worldPerPixel =
          (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * distance) / height;
        const labelHeight = Math.max(0.01, worldPerPixel * 19);
        caption.position.y = labelHeight / car.scale.y;
        caption.scale.set(
          (worldPerPixel * 44) / car.scale.x,
          (worldPerPixel * 16) / car.scale.y,
          1,
        );
        projected.y += labelHeight;
        projected.project(camera);
        if (
          projected.z < -1 ||
          projected.z > 1 ||
          Math.abs(projected.x) > 1 ||
          Math.abs(projected.y) > 1
        )
          continue;
        const box = {
          x: ((projected.x + 1) / 2) * width - 23,
          y: ((1 - projected.y) / 2) * height - 8.5,
          width: 46,
          height: 17,
        };
        if (
          occupied.some(
            (other) =>
              box.x < other.x + other.width + 3 &&
              box.x + box.width + 3 > other.x &&
              box.y < other.y + other.height + 3 &&
              box.y + box.height + 3 > other.y,
          )
        )
          continue;
        occupied.push(box);
        caption.visible = true;
      }
    };

    const render = (now = performance.now()) => {
      animationFrame = 0;
      if (disposed || failed || !initialized || !activeRef.current) return;
      // OrbitControls emits change inside update; avoid queuing a second frame from that event.
      animationFrame = -1;
      const cameraPosition = camera.position.clone();
      updateCars(Math.min(0.05, Math.max(0, (now - previousRenderTime) / 1000)));
      previousRenderTime = now;
      const controlsChanged = controls.update();
      controls.maxDistance = constrainMapCamera3D(
        camera,
        controls.target,
        props.surroundings?.coverage,
        overviewTarget,
        span,
        controls.minDistance,
        overviewDistance * 2,
      );
      updateLabels();
      world.update(latestPropsRef.current.environment, camera, renderer, controls.target);
      volumetric?.update(latestPropsRef.current.environment, controls.target);
      renderer.setViewport(0, 0, drawingBufferWidth, drawingBufferHeight);
      try {
        if (volumetric) volumetric.render();
        else renderer.render(scene, camera);
      } catch (error) {
        animationFrame = 0;
        failed = true;
        console.error("Could not render the circuit world", error);
        latestPropsRef.current.onError("The 3D circuit could not render on this device.");
        return;
      }
      renderer.domElement.dataset.renderFrames = String(++renderFrames);
      renderer.domElement.dataset.drawCalls = String(renderer.info.render.drawCalls);
      renderer.domElement.dataset.pitBoxes = String(world.pitBoxCount);
      renderer.domElement.dataset.mappedBuildings = String(world.mappedBuildingCount);
      renderer.domElement.dataset.mappedTrees = String(world.mappedTreeCount);
      renderer.domElement.dataset.clusteredLights = String(world.clusteredLightCount);
      renderer.domElement.dataset.mapFeatures = String(world.mapFeatureCount);
      renderer.domElement.dataset.mapTerrain = String(world.hasMappedTerrain);
      renderer.domElement.dataset.triangles = String(renderer.info.render.triangles);
      const cameraOffset = camera.position.clone().sub(controls.target);
      const cameraDistance = cameraOffset.length();
      renderer.domElement.dataset.cameraDistance = cameraDistance.toFixed(6);
      renderer.domElement.dataset.cameraMaxDistance = controls.maxDistance.toFixed(6);
      renderer.domElement.dataset.cameraPolar = Math.acos(
        MathUtils.clamp(cameraOffset.y / cameraDistance, -1, 1),
      ).toFixed(6);
      renderer.domElement.dataset.cameraAzimuth = Math.atan2(
        cameraOffset.x,
        cameraOffset.z,
      ).toFixed(6);
      renderer.domElement.dataset.cameraTargetX = controls.target.x.toFixed(6);
      renderer.domElement.dataset.cameraTargetY = controls.target.y.toFixed(6);
      renderer.domElement.dataset.cameraTargetZ = controls.target.z.toFixed(6);
      renderer.domElement.dataset.cameraPanning = String(controls.enablePan);
      if (!readyRef.current) {
        readyRef.current = true;
        latestPropsRef.current.onReady();
      }
      animationFrame = 0;
      if (
        controlsChanged ||
        steeringSettling ||
        followTransition > 0 ||
        cameraPosition.distanceToSquared(camera.position) > 1e-12
      )
        animationFrame = requestAnimationFrame(render);
    };

    const start = () => {
      if (!disposed && !failed && initialized && activeRef.current && !animationFrame)
        animationFrame = requestAnimationFrame(render);
    };
    const onControlChange = () => start();

    let pointerDown: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };
    const onControlStart = () => {
      overview = false;
      followTransition = 0;
    };
    const onCanvasClick = (event: PointerEvent) => {
      if (
        !pointerDown ||
        Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5
      )
        return;
      pointerDown = null;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const pointer = new Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
      const raycaster = new Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...cars.values()], true)[0];
      const driverNumber = hit?.object.userData.driverNumber;
      if (typeof driverNumber === "number") latestPropsRef.current.onFollowDriver(driverNumber);
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      failed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      latestPropsRef.current.onError("The 3D circuit lost its graphics context.");
    };

    actionsRef.current = {
      orbit: (angle) => {
        overview = false;
        const offset = camera.position.clone().sub(controls.target);
        offset.applyAxisAngle(new Vector3(0, 1, 0), angle);
        camera.position.copy(controls.target).add(offset);
        camera.lookAt(controls.target);
        controls.update();
      },
      reset: resetOverview,
      start,
      zoom: (factor) => {
        overview = false;
        const offset = camera.position.clone().sub(controls.target);
        const distance = MathUtils.clamp(
          offset.length() * factor,
          controls.minDistance,
          controls.maxDistance,
        );
        camera.position.copy(controls.target).add(offset.setLength(distance));
        controls.update();
      },
    };
    resize();
    resetOverview();
    if (savedView && (!savedView.overview || savedView.follow !== null)) {
      overview = savedView.overview;
      camera.position.copy(savedView.position);
      controls.target.copy(savedView.target);
      controls.update();
    }
    controls.addEventListener("start", onControlStart);
    controls.addEventListener("change", onControlChange);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("click", onCanvasClick);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const disposeResources = () => {
      volumetric?.dispose();
      world.dispose();
      disposeObject(scene);
      carModel?.dispose();
      environmentTarget?.dispose();
      renderer.dispose();
      cars.clear();
      previous.clear();
      previousProgress.clear();
    };
    renderer.onDeviceLost = () => {
      if (disposed) return;
      failed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      latestPropsRef.current.onError("The 3D circuit lost its graphics device.");
    };
    renderer.onError = (error) => {
      if (disposed || failed) return;
      failed = true;
      console.error("Circuit graphics error", error);
      latestPropsRef.current.onError("The 3D circuit reported a graphics error.");
    };
    void (async () => {
      try {
        // Three selects WebGPU when available and initializes its WebGL2 fallback otherwise.
        const carModelStarted = performance.now();
        carModel = await loadReplayCarModel3D();
        renderer.domElement.dataset.carModelMs = (performance.now() - carModelStarted).toFixed(1);
        if (disposed) return;
        const rendererInitStarted = performance.now();
        await renderer.init();
        renderer.domElement.dataset.rendererInitMs = (
          performance.now() - rendererInitStarted
        ).toFixed(1);
        if (disposed) return;
        renderer.domElement.dataset.renderer =
          "isWebGPUBackend" in renderer.backend && renderer.backend.isWebGPUBackend
            ? "webgpu"
            : "webgl2";
        const volumetricStarted = performance.now();
        volumetric = createReplayVolumetricLighting3D({
          scene,
          camera,
          renderer,
          span,
          spotLights: world.volumetricLights,
        });
        renderer.domElement.dataset.volumetricInitMs = (
          performance.now() - volumetricStarted
        ).toFixed(1);
        updateCars();
        controls.update();
        world.update(latestPropsRef.current.environment, camera, renderer, controls.target);
        volumetric.update(latestPropsRef.current.environment, controls.target);
        initialized = true;
        render();
        await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
        if (disposed) return;
        renderer.domElement.dataset.initialRenderMs = (
          performance.now() - worldBuildStarted
        ).toFixed(1);
        const environmentStarted = performance.now();
        const room = new RoomEnvironment();
        const pmrem = new PMREMGenerator(renderer);
        try {
          environmentTarget = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 64 });
          scene.environment = environmentTarget.texture;
        } finally {
          room.dispose();
          pmrem.dispose();
        }
        renderer.domElement.dataset.environmentMs = (
          performance.now() - environmentStarted
        ).toFixed(1);
        if (disposed) return;
        start();
      } catch (error) {
        if (!disposed) {
          failed = true;
          console.error("Could not initialize the circuit renderer", error);
          latestPropsRef.current.onError(
            "This browser could not initialize the 3D circuit renderer.",
          );
        }
      } finally {
        initializationSettled = true;
        if (disposed) disposeResources();
      }
    })();

    return () => {
      if (initialized)
        savedViewRef.current = {
          points: trackPoints,
          position: camera.position.clone(),
          target: controls.target.clone(),
          follow: followRef.current,
          overview,
        };
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("click", onCanvasClick);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("change", onControlChange);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      controls.dispose();
      if (initializationSettled) disposeResources();
      renderer.domElement.remove();
      actionsRef.current = null;
    };
  }, [canInitialize, pitPoints, trackPoints, elevation.bridge, props.surroundings]);

  useEffect(() => {
    if (!props.active) return;
    actionsRef.current?.start();
  }, [props.active]);

  // Replay updates request a frame; a paused, untouched scene uses no animation loop.
  useEffect(() => {
    actionsRef.current?.start();
  });

  const selectDriver = (driverNumber: number | null) => {
    props.onFollowDriver(driverNumber);
    if (driverNumber === null) actionsRef.current?.reset();
  };
  const followedState = followDriver === null ? null : props.driverStates[followDriver];
  const followedName =
    followDriver === null
      ? "Overview"
      : (props.driverFullNames?.[followDriver] ??
          props.driverNames[followDriver] ??
          `Driver ${followDriver}`) +
        (followedState?.locationStatus === "stale" ? " · Last known location" : "");

  return (
    <section
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-[#9ab8c7] ${props.className ?? ""}`}
      aria-label="Interactive 3D F1 circuit and driver positions"
    >
      {trackPoints.length < 3 ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-400">
          Waiting for circuit geometry…
        </div>
      ) : (
        <div className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-md md:top-24">
          Following: {followedName}
        </div>
      )}

      {trackPoints.length >= 3 && (
        <p className="pointer-events-none absolute bottom-[12rem] left-1/2 z-10 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 text-center text-[11px] text-slate-400">
          <span className="md:hidden">Drag to orbit · Pinch to zoom</span>
          <span className="hidden md:inline">
            Drag to orbit · Right-drag to pan · Scroll to zoom
          </span>
        </p>
      )}

      {trackPoints.length >= 3 && (
        <div className="absolute bottom-[9rem] left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1.5 rounded-xl border border-white/15 bg-[#0a1019]/90 p-2 shadow-2xl backdrop-blur-xl">
          <label className="sr-only" htmlFor="track-3d-driver">
            Follow driver
          </label>
          <select
            id="track-3d-driver"
            value={followDriver ?? ""}
            onChange={(event) =>
              selectDriver(event.target.value ? Number(event.target.value) : null)
            }
            onKeyDown={(event) => {
              if (event.key.startsWith("Arrow")) event.stopPropagation();
            }}
            className="min-w-0 max-w-32 rounded-lg border border-white/15 bg-[#111925] px-2 py-1.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-sky-400 md:max-w-48"
          >
            <option value="">Overview</option>
            {drivers.map((driverNumber) => (
              <option key={driverNumber} value={driverNumber}>
                P{props.driverStates[driverNumber].racePosition ?? "–"}{" "}
                {props.driverNames[driverNumber] ?? `#${driverNumber}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => selectDriver(null)}
            className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-slate-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            Reset
          </button>
          <button
            type="button"
            aria-label="Orbit left"
            title="Orbit left"
            onClick={() => actionsRef.current?.orbit(-Math.PI / 12)}
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/15 text-base text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Orbit right"
            title="Orbit right"
            onClick={() => actionsRef.current?.orbit(Math.PI / 12)}
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/15 text-base text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            ↷
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => actionsRef.current?.zoom(0.78)}
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/15 text-base text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => actionsRef.current?.zoom(1.28)}
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/15 text-base text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            −
          </button>
        </div>
      )}
    </section>
  );
}
