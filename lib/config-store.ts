import { promises as fs } from "node:fs";
import path from "node:path";

import { FunnelConfig } from "@/lib/types";

const configPath = path.join(process.cwd(), "data", "funnel-config.json");

export async function readConfig(): Promise<FunnelConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw) as FunnelConfig;
}

export async function writeConfig(config: FunnelConfig): Promise<void> {
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
