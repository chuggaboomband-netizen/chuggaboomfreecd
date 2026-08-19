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

function createScale(values: number[], height: number, padding: number) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const difference = maximum - minimum;
  const breathingRoom = difference ? difference * 0.08 : Math.max(Math.abs(maximum) * 0.12, 1);
  const min = minimum - breathingRoom;
  const max = maximum + breathingRoom;
  const range = max - min || 1;

  return (value: number) => height - padding - ((value - min) / range) * (height - padding * 2);
}

export function ProfitTimelineChart({ points }: { points: ProfitTimelinePoint[] }) {
  const [range, setRange] = useState<DateRange>("all");
  const [showAdSpend, setShowAdSpend] = useState(false);
  const [showCosts, setShowCosts] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
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
  const height = 340;
  const padding = 30;
  const denominator = Math.max(filteredPoints.length - 1, 1);
  const coordinates = filteredPoints.map((point, index) => ({
    x: padding + ((width - padding * 2) * index) / denominator,
    point,
  }));
  const profitY = createScale(filteredPoints.map((point) => point.netProfit), height, padding);
  const adSpendY = createScale(filteredPoints.map((point) => point.cumulativeAdSpend), height, padding);
  const costsY = createScale(filteredPoints.map((point) => point.cumulativeCosts), height, padding);
  const pathFor = (getValue: (point: ProfitTimelinePoint) => number, yFor: (value: number) => number) =>
    coordinates
      .map(({ x, point }, index) => `${index ? "L" : "M"} ${x.toFixed(2)} ${yFor(getValue(point)).toFixed(2)}`)
      .join(" ");
  const latestPoint = filteredPoints[filteredPoints.length - 1];
  const selectedIndex = activeIndex === null ? filteredPoints.length - 1 : Math.min(activeIndex, filteredPoints.length - 1);
  const selectedPoint = filteredPoints[selectedIndex];
  const previousPoint = filteredPoints[selectedIndex - 1];
  const isFirstPoint = !previousPoint;
  const zeroY = profitY(0);
  const amountSincePrevious = (value: keyof Pick<ProfitTimelinePoint, "netProfit" | "cumulativeRevenue" | "cumulativeCosts" | "cumulativeAdSpend">) =>
    isFirstPoint ? selectedPoint[value] : selectedPoint[value] - previousPoint[value];

  return (
    <div className="reports-chart-card">
      <div className="reports-chart-toolbar">
        <div className="reports-chart-range" role="group" aria-label="Chart date range">
          {(Object.keys(rangeLabels) as DateRange[]).map((option) => (
            <button
              className={`reports-chart-filter ${range === option ? "is-active" : ""}`}
              key={option}
              type="button"
              onClick={() => {
                setRange(option);
                setActiveIndex(null);
              }}
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
        <span className="microcopy">Hover a point for its full breakdown. Each line is scaled to show its movement clearly.</span>
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
          return <path key={`${point.timestamp}-profit`} d={`M ${previous.x} ${profitY(previous.point.netProfit)} L ${x} ${profitY(point.netProfit)}`} className={`reports-chart-profit-segment ${isIncrease ? "is-up" : "is-down"}`} />;
        })}
        {showAdSpend ? <path d={pathFor((point) => point.cumulativeAdSpend, adSpendY)} className="reports-chart-spend-line" /> : null}
        {showCosts ? <path d={pathFor((point) => point.cumulativeCosts, costsY)} className="reports-chart-cost-line" /> : null}
        {coordinates.map(({ x, point }, index) => (
          <g
            key={`${point.timestamp}-${index}`}
            className="reports-chart-point"
            onMouseEnter={() => setActiveIndex(index)}
          >
            <circle
              cx={x}
              cy={profitY(point.netProfit)}
              r="12"
              className="reports-chart-hit-area"
              tabIndex={0}
              role="button"
              aria-label={`${point.label || "Campaign start"}: net profit ${formatPrice(point.netProfit)}`}
              onFocus={() => setActiveIndex(index)}
            />
          </g>
        ))}
      </svg>
      <div className="reports-chart-point-details" aria-live="polite">
        <div>
          <strong>{selectedPoint.label || "Campaign start"}</strong>
          <span>{formatDate(selectedPoint.timestamp)}</span>
        </div>
        <dl>
          <div><dt>Net profit</dt><dd>{formatPrice(selectedPoint.netProfit)} <em>{formatPrice(amountSincePrevious("netProfit"))} this point</em></dd></div>
          <div><dt>Revenue</dt><dd>{formatPrice(selectedPoint.cumulativeRevenue)} <em>{formatPrice(amountSincePrevious("cumulativeRevenue"))} this point</em></dd></div>
          <div><dt>Product & postage</dt><dd>{formatPrice(selectedPoint.cumulativeCosts)} <em>{formatPrice(amountSincePrevious("cumulativeCosts"))} this point</em></dd></div>
          <div><dt>Ad spend</dt><dd>{formatPrice(selectedPoint.cumulativeAdSpend)} <em>{formatPrice(amountSincePrevious("cumulativeAdSpend"))} this point</em></dd></div>
        </dl>
      </div>
      <div className="reports-chart-labels">
        <span>{formatDate(filteredPoints[0].timestamp)}</span>
        <span>{formatDate(latestPoint.timestamp)}</span>
      </div>
    </div>
  );
}
