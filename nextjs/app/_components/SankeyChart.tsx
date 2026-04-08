"use client";

import { useEffect, useRef } from "react";
import { Chart } from "chart.js";
import { SankeyController, Flow } from "chartjs-chart-sankey";

Chart.register(SankeyController, Flow);

export type SankeyFlow = { from: string; to: string; flow: number };

export function SankeyChart({
  flows,
  title,
  height = 320,
}: {
  flows: SankeyFlow[];
  title?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (flows.length === 0) return;

    const chart = new Chart(ctx, {
      type: "sankey" as any,
      data: {
        datasets: [
          {
            label: "flows",
            data: flows.map((f) => ({ from: f.from, to: f.to, flow: f.flow })),
            colorFrom: () => "#a78bfa",
            colorTo: () => "#60a5fa",
            colorMode: "gradient",
          } as any,
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      } as any,
    });
    return () => chart.destroy();
  }, [flows]);

  return (
    <div className="chart-wrap" style={{ background: "#fff" }}>
      {title && (
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "#18181b" }}>
          {title}
        </div>
      )}
      <div style={{ height, position: "relative" }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
