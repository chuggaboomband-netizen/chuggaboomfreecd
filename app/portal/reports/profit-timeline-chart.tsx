"use client";

import { useMemo, useState } from "react";

import type { ProfitTimelinePoint } from "@/lib/types";

type DateRange = "all" | "7d" | "30d" | "90d";
type ChartView = "cumulative" | "weekly";
type ChartPoint = { timestamp: string; label: string; netProfit: number; revenue: number; costs: number; adSpend: number; kind: "order" | "ad-spend" };

const rangeLabels: Record<DateRange, string> = { all: "All time", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(value));
}

function formatWeek(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(value));
}

function weekStart(timestamp: string) {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function createScale(values: number[], height: number, padding: number) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const difference = maximum - minimum;
  const breathingRoom = difference ? difference * 0.08 : Math.max(Math.abs(maximum) * 0.12, 1);
  const min = minimum - breathingRoom;
  const range = maximum + breathingRoom - min || 1;
  return (value: number) => height - padding - ((value - min) / range) * (height - padding * 2);
}

function cumulativePoints(points: ProfitTimelinePoint[]): ChartPoint[] {
  return points.map((point) => ({ timestamp: point.timestamp, label: point.label, netProfit: point.netProfit, revenue: point.cumulativeRevenue, costs: point.cumulativeCosts, adSpend: point.cumulativeAdSpend, kind: point.kind }));
}

function weeklyPoints(points: ProfitTimelinePoint[]): ChartPoint[] {
  const weeks = new Map<string, ChartPoint>();
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    const timestamp = weekStart(current.timestamp);
    const point = weeks.get(timestamp) || { timestamp, label: `Week of ${formatWeek(timestamp)}`, netProfit: 0, revenue: 0, costs: 0, adSpend: 0, kind: current.kind };
    point.netProfit += current.netProfit - previous.netProfit;
    point.revenue += current.cumulativeRevenue - previous.cumulativeRevenue;
    point.costs += current.cumulativeCosts - previous.cumulativeCosts;
    point.adSpend += current.cumulativeAdSpend - previous.cumulativeAdSpend;
    weeks.set(timestamp, point);
  }
  return [...weeks.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function filterRange(points: ChartPoint[], range: DateRange, includePrevious: boolean) {
  if (range === "all") return points;
  const cutoff = new Date(points[points.length - 1].timestamp).getTime() - Number.parseInt(range, 10) * 86_400_000;
  const first = points.findIndex((point) => new Date(point.timestamp).getTime() >= cutoff);
  return first < 0 ? points.slice(-1) : points.slice(Math.max(0, first - (includePrevious ? 1 : 0)));
}

function movingAverage(values: number[], windowSize: number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = values.slice(start, index + 1);
    return window.reduce((total, value) => total + value, 0) / window.length;
  });
}

export function ProfitTimelineChart({ points }: { points: ProfitTimelinePoint[] }) {
  const [range, setRange] = useState<DateRange>("all");
  const [view, setView] = useState<ChartView>("cumulative");
  const [showAdSpend, setShowAdSpend] = useState(false);
  const [showCosts, setShowCosts] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartPoints = useMemo(() => filterRange(view === "cumulative" ? cumulativePoints(points) : weeklyPoints(points), range, view === "cumulative"), [points, range, view]);
  const isCumulative = view === "cumulative";
  const width = 760;
  const height = 340;
  const padding = 30;
  const denominator = Math.max(chartPoints.length - 1, 1);
  const coordinates = chartPoints.map((point, index) => ({ x: padding + ((width - padding * 2) * index) / denominator, point }));
  const averageWindowSize = Math.min(isCumulative ? 7 : 4, chartPoints.length);
  const averageProfit = movingAverage(chartPoints.map((point) => point.netProfit), averageWindowSize);
  const profitY = createScale([...chartPoints.map((point) => point.netProfit), ...averageProfit], height, padding);
  const adSpendY = createScale(chartPoints.map((point) => point.adSpend), height, padding);
  const costsY = createScale(chartPoints.map((point) => point.costs), height, padding);
  const pathFor = (value: (point: ChartPoint) => number, yFor: (value: number) => number) => coordinates.map(({ x, point }, index) => `${index ? "L" : "M"} ${x.toFixed(2)} ${yFor(value(point)).toFixed(2)}`).join(" ");
  const averageProfitPath = coordinates.map(({ x }, index) => `${index ? "L" : "M"} ${x.toFixed(2)} ${profitY(averageProfit[index]).toFixed(2)}`).join(" ");
  const latestPoint = chartPoints[chartPoints.length - 1];
  const selectedIndex = activeIndex === null ? chartPoints.length - 1 : Math.min(activeIndex, chartPoints.length - 1);
  const selectedPoint = chartPoints[selectedIndex];
  const previousPoint = chartPoints[selectedIndex - 1];
  const differenceAtPoint = (value: keyof Pick<ChartPoint, "netProfit" | "revenue" | "costs" | "adSpend">) => !previousPoint ? selectedPoint[value] : selectedPoint[value] - previousPoint[value];
  const resetView = (next: ChartView) => { setView(next); setActiveIndex(null); };

  return (
    <div className="reports-chart-card">
      <div className="reports-chart-toolbar">
        <div className="reports-chart-range" role="group" aria-label="Profit chart view">
          <button className={`reports-chart-filter ${isCumulative ? "is-active" : ""}`} type="button" onClick={() => resetView("cumulative")}>Lifetime profit</button>
          <button className={`reports-chart-filter ${!isCumulative ? "is-active" : ""}`} type="button" onClick={() => resetView("weekly")}>Profit by week</button>
        </div>
        <div className="reports-chart-toggles">
          <label><input type="checkbox" checked={showAdSpend} onChange={(event) => setShowAdSpend(event.target.checked)} /> Ad spend</label>
          <label><input type="checkbox" checked={showCosts} onChange={(event) => setShowCosts(event.target.checked)} /> Product & postage costs</label>
        </div>
      </div>
      <div className="reports-chart-range" role="group" aria-label="Chart date range">
        {(Object.keys(rangeLabels) as DateRange[]).map((option) => <button className={`reports-chart-filter ${range === option ? "is-active" : ""}`} key={option} type="button" onClick={() => { setRange(option); setActiveIndex(null); }}>{rangeLabels[option]}</button>)}
      </div>
      <div className="reports-chart-meta">
        <strong>{isCumulative ? "Lifetime net profit" : "Latest weekly net profit"}: {formatPrice(latestPoint.netProfit)}</strong>
        <span className="microcopy">The white trend line is a rolling average across the latest {averageWindowSize} points. Hover a point for actual amounts.</span>
      </div>
      <div className="reports-chart-key">
        <span><i className="reports-key-profit" /> Net profit</span>
        <span><i className="reports-key-average" /> Trend average</span>
        {showAdSpend ? <span><i className="reports-key-spend" /> Ad spend</span> : null}
        {showCosts ? <span><i className="reports-key-costs" /> Costs</span> : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart" role="img" aria-label="Profit and cost trends over time">
        {coordinates.slice(1).map(({ x, point }, index) => {
          const previous = coordinates[index];
          return <path key={`${point.timestamp}-profit`} d={`M ${previous.x} ${profitY(previous.point.netProfit)} L ${x} ${profitY(point.netProfit)}`} className={`reports-chart-profit-segment ${point.netProfit >= previous.point.netProfit ? "is-up" : "is-down"}`} />;
        })}
        <path d={averageProfitPath} className="reports-chart-average-line" />
        {showAdSpend ? <path d={pathFor((point) => point.adSpend, adSpendY)} className="reports-chart-spend-line" /> : null}
        {showCosts ? <path d={pathFor((point) => point.costs, costsY)} className="reports-chart-cost-line" /> : null}
        {coordinates.map(({ x, point }, index) => <circle key={`${point.timestamp}-${index}`} cx={x} cy={profitY(point.netProfit)} r="12" className="reports-chart-hit-area" tabIndex={0} role="button" aria-label={`${point.label}: net profit ${formatPrice(point.netProfit)}`} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} />)}
      </svg>
      <div className="reports-chart-point-details" aria-live="polite">
        <div><strong>{selectedPoint.label || "Campaign start"}</strong><span>{isCumulative ? formatDate(selectedPoint.timestamp) : selectedPoint.label}</span></div>
        <dl>
          <div><dt>{isCumulative ? "Net profit to date" : "Net profit that week"}</dt><dd>{formatPrice(selectedPoint.netProfit)} {isCumulative ? <em>{formatPrice(differenceAtPoint("netProfit"))} this event</em> : null}</dd></div>
          <div><dt>Trend average</dt><dd>{formatPrice(averageProfit[selectedIndex])}</dd></div>
          <div><dt>{isCumulative ? "Revenue to date" : "Revenue that week"}</dt><dd>{formatPrice(selectedPoint.revenue)} {isCumulative ? <em>{formatPrice(differenceAtPoint("revenue"))} this event</em> : null}</dd></div>
          <div><dt>{isCumulative ? "Product & postage to date" : "Product & postage that week"}</dt><dd>{formatPrice(selectedPoint.costs)} {isCumulative ? <em>{formatPrice(differenceAtPoint("costs"))} this event</em> : null}</dd></div>
          <div><dt>{isCumulative ? "Ad spend to date" : "Ad spend that week"}</dt><dd>{formatPrice(selectedPoint.adSpend)} {isCumulative ? <em>{formatPrice(differenceAtPoint("adSpend"))} this event</em> : null}</dd></div>
        </dl>
      </div>
      <div className="reports-chart-labels"><span>{isCumulative ? formatDate(chartPoints[0].timestamp) : chartPoints[0].label}</span><span>{isCumulative ? formatDate(latestPoint.timestamp) : latestPoint.label}</span></div>
    </div>
  );
}
