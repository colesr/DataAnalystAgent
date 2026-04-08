"use client";

import { useEffect, useRef } from "react";
import { Chart } from "chart.js";
import { TreemapController, TreemapElement } from "chartjs-chart-treemap";

Chart.register(TreemapController, TreemapElement);

export type TreemapBlock = { label: string; value: number };

const PALETTE = [
  "#a78bfa",
  "#4ade80",
  "#facc15",
  "#f87171",
  "#60a5fa",
  "#fb923c",
  "#34d399",
  "#f472b6",
];

export function TreemapChart({
  blocks,
  title,
  height = 320,
}: {
  blocks: TreemapBlock[];
  title?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (blocks.length === 0) return;

    const chart = new Chart(ctx, {
      type: "treemap" as any,
      data: {
        datasets: [
          {
            label: "treemap",
            tree: blocks,
            key: "value",
            backgroundColor: (ctx2: any) => {
              const i = ctx2.dataIndex ?? 0;
              return PALETTE[i % PALETTE.length];
            },
            borderColor: "#fff",
            borderWidth: 1,
            labels: {
              display: true,
              formatter(ctx2: any) {
                const b = ctx2.raw?._data as TreemapBlock | undefined;
                if (!b) return "";
                return [`${b.label}`, `${b.value.toLocaleString()}`];
              },
              color: "#fff",
              font: { size: 10, weight: "bold" as any },
            },
          } as any,
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      } as any,
    });
    return () => chart.destroy();
  }, [blocks]);

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
