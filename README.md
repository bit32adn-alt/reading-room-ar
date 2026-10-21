# Reading Room AR

A World Labs Gaussian-splat reading room, cut into a tabletop dollhouse and pinned in the real world with WebAR.
Two-device mode (like the reference clip): open `display.html` on the phone you hold and `ar.html` on the device that films it. 8th Wall image-target tracking finds the photo on the held phone and stands the 3D room and a 3D label on it every frame.

Table mode: `world.html` places the room on a table with one phone (world tracking).

- Room: Nano Banana 2 image -> World Labs Marble 1.1 Plus world (via invideo), cropped to a dollhouse.
- Rendering: [Spark](https://sparkjs.dev) (MIT) on [three.js](https://threejs.org) (MIT).
- World tracking: 8th Wall XR Engine binary. This product includes the XR Engine software developed by Niantic Spatial, Inc.
  Copyright © 2026 Niantic Spatial, Inc. All rights reserved. License: https://github.com/8thwall/engine/blob/main/LICENSE
- Desktop preview without a camera: `world.html?desktop=1`. Desktop test of the image tracker with a webcam: `ar.html?test=1`.
