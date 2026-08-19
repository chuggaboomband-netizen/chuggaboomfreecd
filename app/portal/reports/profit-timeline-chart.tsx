"use client";

import { useMemo, useState } from "react";

import type { ProfitTimelinePoint } from "@/lib/types";

type DateRange = "all" | "7d" | "30d" | "90d";

const rangeLabels: Record<DateRange, string> = {
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function daysForRange(range: DateRange) {
  return range === "all" ? null : Number.parseInt(range, 10);
}

export function ProfitTimelineChart({ points }: { points: ProfitTimelinePoint[] }) {
  const [range, setRange] = useState<DateRange>("all");
  const [showAdSpend, setShowAdSpend] = useState(false);
  const [showCosts, setShowCosts] = useState(false);
  const filteredPoints = useMemo(() => {
    const days = daysForRange(range);
    if (!days) return points;

    const latestTimestamp = new Date(points[points.length - 1]?.timestamp).getTime();
    const cutoff = latestTimestamp - days * 24 * 60 * 60 * 1000;
    const firstIncludedIndex = points.findIndex((point) => new Date(point.timestamp).getTime() >= cutoff);
    if (firstIncludedIndex < 0) return points.slice(-1);

    // Keep the point immediately before the range as context for the first trend segment.
    return points.slice(Math.max(0, firstIncludedIndex - 1));
  }, [points, range]);

  const width = 760;
  const height = 300;
  const padding = 30;
  const values = [
    ...filteredPoints.map((point) => point.netProfit),
    ...(showAdSpend ? filteredPoints.map((point) => point.cumulativeAdSpend) : []),
    ...(showCosts ? filteredPoints.map((point) => point.cumulativeCosts) : []),
    0,
  ];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  const denominator = Math.max(filteredPoints.length - 1, 1);
  const coordinates = filteredPoints.map((point, index) => ({
    x: padding + ((width - padding * 2) * index) / denominator,
    point,
  }));
  const yFor = (value: number) => height - padding - ((value - minValue) / valueRange) * (height - padding * 2);
  const pathFor = (getValue: (point: ProfitTimelinePoint) => number) =>
    coordinates
      .map(({ x, point }, index) => `${index ? "L" : "M"} ${x.toFixed(2)} ${yFor(getValue(point)).toFixed(2)}`)
      .join(" ");
  const latestPoint = filteredPoints[filteredPoints.length - 1];
  const zeroY = yFor(0);

  return (
    <div className="reports-chart-card">
      <div className="reports-chart-toolbar">
        <div className="reports-chart-range" role="group" aria-label="Chart date range">
          {(Object.keys(rangeLabels) as DateRange[]).map((option) => (
            <button
              className={`reports-chart-filter ${range === option ? "is-active" : ""}`}
              key={option}
              type="button"
              onClick={() => setRange(option)}
            >
              {rangeLabels[option]}
            </button>
          ))}
        </div>
        <div className="reports-chart-toggles">
          <label><input type="checkbox" checked={showAdSpend} onChange={(event) => setShowAdSpend(event.target.checked)} /> Ad spend</label>
          <label><input type="checkbox" checked={showCosts} onChange={(event) => setShowCosts(event.target.checked)} /> Product & postage costs</label>
        </div>
      </div>

      <div className="reports-chart-meta">
        <strong>Net profit: {formatPrice(latestPoint.netProfit)}</strong>
        <span className="microcopy">Green rises; red falls. {showAdSpend || showCosts ? "Line values are cumulative." : ""}</span>
      </div>

      <div className="reports-chart-key">
        <span><i className="reports-key-profit" /> Net profit</span>
        {showAdSpend ? <span><i className="reports-key-spend" /> Ad spend</span> : null}
        {showCosts ? <span><i className="reports-key-costs" /> Costs</span> : null}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart" role="img" aria-label="Profit and cost trends over time">
        <line x1={padding} x2={width - padding} y1={zeroY} y2={zeroY} className="reports-chart-zero" />
        {coordinates.slice(1).map(({ x, point }, index) => {
          const previous = coordinates[index];
          const isIncrease = point.netProfit >= previous.point.netProfit;
          return <path key={`${point.timestamp}-profit`} d={`M ${previous.x} ${yFor(previous.point.netProfit)} L ${x} ${yFor(point.netProfit)}`} className={`reports-chart-profit-segment ${isIncrease ? "is-up" : "is-down"}`} />;
        })}
        {showAdSpend ? <path d={pathFor((point) => point.cumulativeAdSpend)} className="reports-chart-spend-line" /> : null}
        {showCosts ? <path d={pathFor((point) => point.cumulativeCosts)} className="reports-chart-cost-line" /> : null}
        {coordinates.map(({ x, point }, index) => (
          <g key={`${point.timestamp}-${index}`}>
            <circle cx={x} cy={yFor(point.netProfit)} r="4" className="reports-chart-dot is-order" />
            <title>{`${formatDate(point.timestamp)} · Net profit ${formatPrice(point.netProfit)} · Ad spend ${formatPrice(point.cumulativeAdSpend)} · Costs ${formatPrice(point.cumulativeCosts)}`}</title>
          </g>
        ))}
      </svg>
      <div className="reports-chart-labels">
        <span>{formatDate(filteredPoints[0].timestamp)}</span>
        <span>{formatDate(latestPoint.timestamp)}</span>
      </div>
    </div>
  );
}
