"use client";

import { useEffect, useRef } from "react";
import { drawDecor, type Piece } from "@/ui/mapDecor";

/** A sheet of the chart's margin pieces, drawn large, for checking the drawings. */
export default function Decor() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = 1600;
    c.height = 900;
    const x = c.getContext("2d")!;
    x.fillStyle = "#ece1c8";
    x.fillRect(0, 0, c.width, c.height);
    const base = { flip: false, tone: "rgba(205, 155, 75, 0.38)", ring: false };
    const pieces: Piece[] = [
      { ...base, kind: "ship", x: 4, y: 7, size: 6 },
      { ...base, kind: "serpent", x: 17, y: 7, size: 15 },
      { ...base, kind: "whale", x: 31, y: 7, size: 10 },
      { ...base, kind: "planet", x: 5, y: 14, size: 3.6, ring: true },
      { ...base, kind: "planet", x: 15, y: 14, size: 3, tone: "rgba(115, 150, 175, 0.34)" },
      { ...base, kind: "moon", x: 23, y: 14, size: 2.4 },
      { ...base, kind: "comet", x: 32, y: 14, size: 7 },
      { ...base, kind: "star", x: 38, y: 12, size: 0.9 },
      { ...base, kind: "wave", x: 38, y: 16, size: 1.5 },
    ];
    drawDecor(x, pieces, 0, 0, 40);
  }, []);
  return <canvas ref={ref} style={{ width: "100%" }} />;
}
