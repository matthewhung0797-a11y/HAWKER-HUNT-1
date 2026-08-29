// 臨時：將 Tripo GLB 焗入 yaw 旋轉（正面 +X → +Z），俾 Meshy pose estimation 認到正面
import { NodeIO } from "@gltf-transform/core";
import { clearNodeTransform } from "@gltf-transform/functions";

const [src, dest, degStr] = process.argv.slice(2);
const deg = Number(degStr ?? -90);
const rad = (deg * Math.PI) / 180;

const io = new NodeIO();
const doc = await io.read(src);
const root = doc.getRoot();
for (const scene of root.listScenes()) {
  for (const node of scene.listChildren()) {
    // premultiply yaw：新 rotation = yawQuat * 原 rotation
    const [x, y, z, w] = node.getRotation();
    const hy = rad / 2;
    const qy = [0, Math.sin(hy), 0, Math.cos(hy)];
    const nq = [
      qy[3] * x + qy[1] * z,
      qy[3] * y + qy[1] * w,
      qy[3] * z - qy[1] * x,
      qy[3] * w - qy[1] * y,
    ];
    node.setRotation(nq);
    const [tx, ty, tz] = node.getTranslation();
    const c = Math.cos(rad), s = Math.sin(rad);
    node.setTranslation([c * tx + s * tz, ty, -s * tx + c * tz]);
    clearNodeTransform(node);
  }
}
await io.write(dest, doc);
console.log(`rotated ${deg}° → ${dest}`);
