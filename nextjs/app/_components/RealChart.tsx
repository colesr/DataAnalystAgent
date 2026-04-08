"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  BarController,
  LineController,
  PieController,
  DoughnutController,
  ScatterController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

// Register the controllers/elements/scales we use. Importing this file once
// is enough — Chart.register is idempotent.
Chart.register(
  BarController,
  LineController,
  PieController,
  DoughnutController,
  ScatterController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

export type ChartSpec = {
  type: "bar" | "line" | "pie" | "doughnut" | "scatter";
  title?: string;
  labels: (string | number)[];
  datasets: { label: string; data: number[] }[];
};

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

export function RealChart({ spec, height = 240 }: { spec: ChartSpec; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isPie = spec.type === "pie" || spec.type === "doughnut";
    const isScatter = spec.type === "scatter";

    let chart: Chart;
    if (isScatter) {
      chart = new Chart(ctx, {
        type: "scatter",
        data: {
          datasets: spec.datasets.map((ds, i) => ({
            label: ds.label,
            data: ds.data.map((y, idx) => ({
              x: typeof spec.labels[idx] === "number" ? (spec.labels[idx] as number) : idx,
              y,
            })),
            backgroundColor: PALETTE[i % PALETTE.length],
            borderColor: PALETTE[i % PALETTE.length],
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: spec.datasets.length > 1 } },
        },
      });
    } else {
      chart = new Chart(ctx, {
        type: spec.type,
        data: {
          labels: spec.labels.map(String),
          datasets: spec.datasets.map((ds, i) => ({
            label: ds.label,
            data: ds.data,
            backgroundColor: isPie
              ? ds.data.map((_, idx) => PALETTE[idx % PALETTE.length])
              : PALETTE[i % PALETTE.length],
            borderColor: PALETTE[i % PALETTE.length],
            borderWidth: spec.type === "line" ? 2 : 1,
            tension: spec.type === "line" ? 0.25 : 0,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: isPie || spec.datasets.length > 1 } },
        },
      });
    }

    return () => chart.destroy();
  }, [spec]);

  return (
    <div className="chart-wrap" style={{ background: "#fff" }}>
      {spec.title && (
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "#18181b" }}>
          {spec.title}
        </div>
      )}
      <div style={{ height, position: "relative" }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
