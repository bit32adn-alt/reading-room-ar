// Reading Room AR: the World Labs splat room as a tabletop dollhouse, pinned in the real world with
// 8th Wall SLAM (world tracking) and drawn with Spark inside 8th Wall's three.js scene.
// ?desktop=1 skips the camera and shows the same scene with a mouse-orbit camera, for testing.
import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
window.THREE = THREE;                                   // 8th Wall builds its renderer from window.THREE

const DESKTOP = new URLSearchParams(location.search).has("desktop");
// Room footprint in splat units (measured from the file): centre and floor height.
const ROOM = { cx: 0.39, cz: -3.41, floor: -1.90, width: 5.63 };
const START_WIDTH = 0.55;                                // placed size on the table, in scene units
const $ = (id) => document.getElementById(id);

let model, holder, shadow, placed = false, popT = 1, baseScale = START_WIDTH / ROOM.width, userScale = 1, userYaw = 0;

function buildContent(scene, renderer) {
  scene.add(new SparkRenderer({ renderer }));
  holder = new THREE.Group(); holder.visible = false; scene.add(holder);

  model = new SplatMesh({ url: "./world/room.spz" });
  model.quaternion.set(1, 0, 0, 0);                    // World Labs axes -> three.js axes
  // after the flip, file (x, y, z) shows at (x, -y, -z) in three: recentre so the floor centre sits at the holder origin
  model.position.set(-ROOM.cx, -ROOM.floor, -ROOM.cz);
  const inner = new THREE.Group(); inner.add(model); holder.add(inner);
  holder.userData.inner = inner;

  // soft contact shadow so it reads as sitting on the surface
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "rgba(0,0,0,0.55)"); grd.addColorStop(0.6, "rgba(0,0,0,0.25)"); grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  shadow = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width * 1.05, 4.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; inner.add(shadow);

  model.initialized.then(() => { $("loading").classList.add("done"); });
}

function applyTransform() {
  const s = baseScale * userScale * easeOutBack(Math.min(1, popT));
  holder.userData.inner.scale.setScalar(Math.max(s, 1e-4));
  holder.userData.inner.rotation.y = userYaw;
}
function easeOutBack(t) { const k = 1.5; t -= 1; return 1 + (k + 1) * t * t * t + k * t * t; }

function placeAt(point) {
  holder.position.copy(point); holder.visible = true;
  if (!placed) { popT = 0; placed = true; $("hint").style.opacity = "0"; }
  applyTransform();
}

// tap -> ray against the ground plane (y = 0), which 8th Wall's SLAM aligns to the surface you pointed at
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function groundHit(camera, clientX, clientY) {
  const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(ground, hitP) ? hitP.clone() : null;
}

function wireGestures(canvas, camera) {
  let mode = null, startDist = 1, startAng = 0, startScale = 1, startYaw = 0, tapStart = null;
  const two = (t) => [t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY];
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) { mode = "tap"; tapStart = [e.touches[0].clientX, e.touches[0].clientY, performance.now()]; }
    if (e.touches.length === 2) {
      mode = "pinch"; const [dx, dy] = two(e.touches);
      startDist = Math.hypot(dx, dy); startAng = Math.atan2(dy, dx); startScale = userScale; startYaw = userYaw;
    }
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (mode === "pinch" && e.touches.length === 2 && placed) {
      const [dx, dy] = two(e.touches);
      userScale = THREE.MathUtils.clamp(startScale * Math.hypot(dx, dy) / startDist, 0.25, 6);
      userYaw = startYaw - (Math.atan2(dy, dx) - startAng);
      applyTransform();
    } else if (mode === "tap") {
      const t = e.touches[0]; if (Math.hypot(t.clientX - tapStart[0], t.clientY - tapStart[1]) > 12) mode = "drag";
    }
    if (mode === "drag" && placed && e.touches.length === 1) {
      const p = groundHit(camera, e.touches[0].clientX, e.touches[0].clientY); if (p) holder.position.copy(p);
    }
  }, { passive: false });
  canvas.addEventListener("touchend", (e) => {
    if (mode === "tap" && performance.now() - tapStart[2] < 350) {
      const p = groundHit(camera, tapStart[0], tapStart[1]); if (p) placeAt(p);
    }
    if (e.touches.length === 0) mode = null;
  });
  $("reset").addEventListener("click", () => { userScale = 1; userYaw = 0; applyTransform(); });
}

function tick(dt) { if (placed && popT < 1) { popT += dt / 0.7; applyTransform(); } }

// ---------------- AR (8th Wall)
function arModule() {
  let last = performance.now();
  return {
    name: "reading-room",
    onStart: ({ canvas }) => {
      const { scene, camera, renderer } = XR8.Threejs.xrScene();
      buildContent(scene, renderer);
      camera.position.set(0, 1.2, 0);                  // starting height above the surface; defines the scene's scale
      XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
      wireGestures(canvas, camera);
      $("recenter").addEventListener("click", () => XR8.XrController.recenter());
    },
    onUpdate: () => { const now = performance.now(); tick((now - last) / 1000); last = now; },
  };
}
function startAR() {
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    LandingPage.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    arModule(),
  ]);
  XR8.run({ canvas: $("camerafeed"), webgl2: true });
}

// ---------------- desktop preview (no camera): same content, mouse orbit
function startDesktop() {
  const canvas = $("camerafeed");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x6b625a);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
  const table = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.MeshBasicMaterial({ color: 0x8a7b6a }));
  table.rotation.x = -Math.PI / 2; scene.add(table);
  buildContent(scene, renderer); placeAt(new THREE.Vector3(0, 0, 0));
  let yaw = 0.5, pitch = 0.55, dist = 1.25, drag = null;
  canvas.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (!drag) return; yaw -= (e.clientX - drag[0]) * 0.006; pitch = THREE.MathUtils.clamp(pitch + (e.clientY - drag[1]) * 0.005, 0.05, 1.45); drag = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", () => { drag = null; });
  canvas.addEventListener("wheel", (e) => { dist = THREE.MathUtils.clamp(dist * (1 + Math.sign(e.deltaY) * 0.08), 0.3, 5); });
  addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  window.__setView = (y, p, d) => { yaw = y; pitch = p; dist = d; };
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(); tick((now - last) / 1000); last = now;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(0, 0.12, 0); renderer.render(scene, camera);
  });
  $("hint").style.opacity = "0";
}

if (DESKTOP) startDesktop();
else window.XR8 ? startAR() : window.addEventListener("xrloaded", startAR);
