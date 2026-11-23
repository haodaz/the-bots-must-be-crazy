"use client";

import { useEffect, useRef } from "react";
import { W, H, avatarCanvas } from "@/ui/avatar";

/** A contact sheet of generated people, for checking the parts. */
export default function Avatars() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const cols = 10;
    const rows = 4;
    const k = 6;
    c.width = cols * (W + 4) * k;
    c.height = rows * (H + 4) * k;
    const x = c.getContext("2d")!;
    x.imageSmoothingEnabled = false;
    x.fillStyle = "#e8dcc0";
    x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < cols * rows; i++) {
      const a = avatarCanvas(7, i, i % 7 === 0 ? 0.9 : 0.4, "normal", null);
      x.drawImage(a, (i % cols) * (W + 4) * k + 2 * k, Math.floor(i / cols) * (H + 4) * k + 2 * k, W * k, H * k);
    }
  }, []);
  return <canvas ref={ref} style={{ width: "100%", imageRendering: "pixelated" }} />;
}
