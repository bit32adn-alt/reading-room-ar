// Reading Room · AR camera. Runs on the filming device.
// 8th Wall image-target tracking finds the room photo shown on the other phone, and every frame
// stands the World Labs splat dollhouse on that phone's screen plane, with a 3D name label in front of it.
// ?test=1 skips the "open on mobile" gate so the page can run on a desktop webcam or a fake camera.
import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
window.THREE = THREE;                                    // 8th Wall builds its three.js renderer from window.THREE

const TEST = new URLSearchParams(location.search).has("test");
// One entry per style: image-target name -> splat + label. Target space: the photo lies in X (right) / Y (up),
// 0.75 wide by 1 tall, with +Z pointing out of the screen toward the camera.
const STYLES = {
  "reading-room": { label: "Reading Room", splat: "./world/room.spz",
    room: { cx: 0.39, cz: -3.41, floor: -1.90, width: 5.63 } },   // footprint measured from the splat file
};
const ROOM_WIDTH_ON_PHONE = 0.86;   // a little wider than the 0.75-wide photo, like the reference
const ROOM_CENTRE_Y = 0.2;          // room sits toward the top of the phone; the label goes below it
const $ = (id) => document.getElementById(id);

const anchors = {};                 // target name -> { holder, inner, label, pop, lostTimer }

function makeLabel(text) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 200;
  const g = c.getContext("2d");
  const r = 100, w = c.width, h = c.height;
  g.fillStyle = "rgba(255,255,255,0.94)"; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, r - 8); g.fill();
  g.lineWidth = 6; g.strokeStyle = "rgba(30,28,25,0.25)"; g.stroke();
  g.fillStyle = "#1d1b18"; g.font = "600 104px -apple-system, system-ui, 'Segoe UI', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 6);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.11),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.position.set(0, -0.17, 0.07);
  m.rotation.x = THREE.MathUtils.degToRad(35);           // tilted up toward the camera, so it reads in perspective
  m.renderOrder = 10;
  return m;
}

function makeAnchor(scene, name) {
  const s = STYLES[name]; if (!s) return null;
  const holder = new THREE.Group(); holder.visible = false; scene.add(holder);
  const inner = new THREE.Group();                         // the room, standing on the screen plane
  inner.rotation.x = Math.PI / 2;                          // room up (+Y) -> out of the screen (+Z); room front -> photo bottom
  inner.position.set(0, ROOM_CENTRE_Y, 0.003);
  const splat = new SplatMesh({ url: s.splat });
  splat.quaternion.set(1, 0, 0, 0);                        // World Labs axes -> three.js axes
  splat.position.set(-s.room.cx, -s.room.floor, -s.room.cz);  // floor centre to the origin
  inner.add(splat); holder.add(inner);
  const label = makeLabel(s.label); holder.add(label);
  return (anchors[name] = { holder, inner, label, splat, base: ROOM_WIDTH_ON_PHONE / s.room.width, pop: 0, lostTimer: null });
}

const easeOutBack = (t) => { const k = 1.4; t = Math.min(1, t) - 1; return 1 + (k + 1) * t * t * t + k * t * t; };

function trackModule() {
  let scene, last = performance.now();
  const show = ({ detail }) => {
    const a = anchors[detail.name] || makeAnchor(scene, detail.name); if (!a) return;
    clearTimeout(a.lostTimer);
    a.holder.position.copy(detail.position);
    a.holder.quaternion.copy(detail.rotation);
    a.holder.scale.setScalar(detail.scale);
    if (!a.holder.visible) { a.holder.visible = true; a.pop = 0; }
    $("hint").style.opacity = "0";
  };
  const hide = ({ detail }) => {
    const a = anchors[detail.name]; if (!a) return;
    a.lostTimer = setTimeout(() => { a.holder.visible = false; $("hint").style.opacity = "1"; }, 350);  // ride out brief dropouts
  };
  return {
    name: "reading-room-targets",
    onStart: ({ canvas }) => {
      const xr = XR8.Threejs.xrScene(); scene = xr.scene;
      scene.add(new SparkRenderer({ renderer: xr.renderer }));
      Object.keys(STYLES).forEach((n) => makeAnchor(scene, n));          // start loading the splats now
      xr.camera.position.set(0, 3, 0);
      XR8.XrController.updateCameraProjectionMatrix({ origin: xr.camera.position, facing: xr.camera.quaternion });
      canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    },
    onUpdate: () => {
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      for (const a of Object.values(anchors)) {
        if (!a.holder.visible) continue;
        a.pop = Math.min(1, a.pop + dt / 0.6);
        const p = easeOutBack(a.pop);
        a.inner.scale.setScalar(Math.max(1e-4, a.base * p));
        a.label.scale.setScalar(Math.max(1e-4, Math.min(1, a.pop * 1.6)));
      }
    },
    listeners: [
      { event: "reality.imagefound", process: show },
      { event: "reality.imageupdated", process: show },
      { event: "reality.imagelost", process: hide },
    ],
  };
}

async function start() {
  const targets = await Promise.all(Object.keys(STYLES).map((n) => fetch(`image-targets/${n}.json`).then((r) => r.json())));
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: targets });
  const modules = [
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    trackModule(),
  ];
  if (!TEST) modules.splice(3, 0, LandingPage.pipelineModule());
  XR8.addCameraPipelineModules(modules);
  XR8.run({ canvas: $("camerafeed"), webgl2: true, allowedDevices: TEST ? XR8.XrConfig.device().ANY : undefined });
}
window.__anchors = anchors;
window.XR8 ? start() : window.addEventListener("xrloaded", start);
