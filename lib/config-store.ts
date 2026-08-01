import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import path from "node:path";

import { FunnelConfig } from "@/lib/types";

const configPath = path.join(process.cwd(), "data", "funnel-config.json");

type GitHubFileResponse = {
  content?: string;
  sha?: string;
};

function getRemoteStorageConfig() {
  const token = process.env.GITHUB_STORAGE_TOKEN;
  const repo = process.env.GITHUB_STORAGE_REPO;
  const branch = process.env.GITHUB_STORAGE_BRANCH || "main";

  if (!token || !repo) {
    return null;
  }

  return { token, repo, branch };
}

function buildGitHubApiUrl(repoPath: string, branch: string) {
  return `https://api.github.com/repos/${getRemoteStorageConfig()!.repo}/contents/${repoPath}?ref=${encodeURIComponent(branch)}`;
}

async function fetchGitHubFile(repoPath: string): Promise<GitHubFileResponse | null> {
  const remote = getRemoteStorageConfig();
  if (!remote) {
    return null;
  }

  const response = await fetch(buildGitHubApiUrl(repoPath, remote.branch), {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${remote.token}`,
      "User-Agent": "chuggaboom-funnel",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub read failed for ${repoPath}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as GitHubFileResponse;
}

async function upsertGitHubFile(repoPath: string, content: string | Buffer, message: string) {
  const remote = getRemoteStorageConfig();
  if (!remote) {
    throw new Error("Remote storage is not configured.");
  }
  const encodedContent =
    typeof content === "string"
      ? Buffer.from(content, "utf8").toString("base64")
      : content.toString("base64");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await fetchGitHubFile(repoPath);
    const response = await fetch(`https://api.github.com/repos/${remote.repo}/contents/${repoPath}`, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${remote.token}`,
        "Content-Type": "application/json",
        "User-Agent": "chuggaboom-funnel",
      },
      body: JSON.stringify({
        message,
        content: encodedContent,
        branch: remote.branch,
        sha: existing?.sha,
      }),
    });

    if (response.ok) {
      return;
    }

    const body = await response.text();
    const isConflict = response.status === 409;
    const hasMoreRetries = attempt < 2;

    if (isConflict && hasMoreRetries) {
      continue;
    }

    throw new Error(`GitHub write failed for ${repoPath}: ${response.status} ${response.statusText} ${body}`);
  }
}

async function readLocalConfig(): Promise<FunnelConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw) as FunnelConfig;
}

export async function readConfig(): Promise<FunnelConfig> {
  const remote = getRemoteStorageConfig();
  if (remote) {
    try {
      const file = await fetchGitHubFile("data/funnel-config.json");
      if (!file?.content) {
        throw new Error("Remote funnel config was not found in GitHub storage.");
      }

      const raw = Buffer.from(file.content, "base64").toString("utf8");
      return JSON.parse(raw) as FunnelConfig;
    } catch (error) {
      console.error("Falling back to local funnel config after GitHub storage read failed.", error);
    }
  }

  return readLocalConfig();
}

export async function writeConfig(config: FunnelConfig): Promise<void> {
  const remote = getRemoteStorageConfig();
  if (remote) {
    await upsertGitHubFile(
      "data/funnel-config.json",
      `${JSON.stringify(config, null, 2)}\n`,
      "Update funnel config",
    );
    return;
  }

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function savePublicUpload(file: File, outputName: string): Promise<string> {
  const uploadPath = path.posix.join("public", "uploads", outputName);
  const bytes = Buffer.from(await file.arrayBuffer());

  const remote = getRemoteStorageConfig();
  if (remote) {
    await upsertGitHubFile(uploadPath, bytes, `Upload asset ${outputName}`);
    return `/uploads/${outputName}`;
  }

  const outputDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, outputName), bytes);
  return `/uploads/${outputName}`;
}
