"use client";

import dynamic from "next/dynamic";

/** The game runs only in the browser: it is all canvas and live state. */
const WorldView = dynamic(() => import("./WorldView"), {
  ssr: false,
  loading: () => <main className="board-loading">Unrolling the map…</main>,
});

export default function ClientWorld() {
  return <WorldView />;
}
