import { join } from "node:path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? "./workspace";

export const getJobWorkDir = (jobId: string): string =>
  join(WORKSPACE_DIR, "tmp", jobId);

export const getJobAudioDir = (jobId: string): string =>
  join(getJobWorkDir(jobId), "audio");

export const getFinalOutputPath = (jobId: string, format: "mp4" | "mov"): string =>
  join(getJobWorkDir(jobId), `final.${format}`);
