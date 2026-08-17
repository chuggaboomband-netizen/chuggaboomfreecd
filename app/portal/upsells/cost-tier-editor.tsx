"use client";

import { useState } from "react";

import type { ProductCostTier } from "@/lib/types";

type EditableTier = Pick<ProductCostTier, "startAtUnit" | "unitCost" | "note">;

function initialTiers(tiers?: ProductCostTier[], fallbackUnitCost?: string): EditableTier[] {
  if (tiers?.length) {
    return tiers.map(({ startAtUnit, unitCost, note }) => ({ startAtUnit, unitCost, note }));
  }

  return fallbackUnitCost ? [{ startAtUnit: 1, unitCost: fallbackUnitCost, note: "Original batch" }] : [];
}

export function CostTierEditor({
  tiers,
  fallbackUnitCost,
}: {
  tiers?: ProductCostTier[];
  fallbackUnitCost?: string;
}) {
  const [rows, setRows] = useState<EditableTier[]>(() => initialTiers(tiers, fallbackUnitCost));
  const serialized = rows
    .filter((row) => row.startAtUnit > 0 && row.unitCost.trim())
    .map((row) => [row.startAtUnit, row.unitCost.trim(), row.note?.trim() || ""].join("|"))
    .join("\n");

  const updateRow = (index: number, change: Partial<EditableTier>) => {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...change } : row)));
  };

  return (
    <div className="cost-tier-editor">
      <input type="hidden" name="costTiersText" value={serialized} readOnly />
      {rows.length ? (
        <div className="cost-tier-list">
          {rows.map((row, index) => (
            <div className="cost-tier-row" key={`${row.startAtUnit}-${index}`}>
              <label className="field">
                <span>From CD number</span>
                <input
                  type="number"
                  min="1"
                  value={row.startAtUnit || ""}
                  onChange={(event) => updateRow(index, { startAtUnit: Number(event.target.value) })}
                  placeholder="201"
                />
              </label>
              <label className="field">
                <span>Unit cost</span>
                <input
                  value={row.unitCost}
                  onChange={(event) => updateRow(index, { unitCost: event.target.value })}
                  placeholder="£1.46"
                />
              </label>
              <label className="field">
                <span>Note (optional)</span>
                <input
                  value={row.note || ""}
                  onChange={(event) => updateRow(index, { note: event.target.value })}
                  placeholder="1,000-unit restock"
                />
              </label>
              <button
                className="button secondary cost-tier-remove"
                type="button"
                onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="microcopy">Add your original cost first, then add a new row whenever the purchase price changes.</p>
      )}
      <button
        className="button secondary"
        type="button"
        onClick={() => setRows((current) => [...current, { startAtUnit: current.length ? 201 : 1, unitCost: "", note: "" }])}
      >
        Add price change
      </button>
      <p className="microcopy">For your current restock: keep the first row at 1, then add a row starting at CD number 201.</p>
    </div>
  );
}
