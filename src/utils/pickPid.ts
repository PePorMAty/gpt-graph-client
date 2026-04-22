export function pickPid(
  obj: Record<string, string> | null | undefined,
): string | null {
  if (!obj || typeof obj !== "object") return null;
  const vals = Object.values(obj);
  const v = vals[0];
  return typeof v === "string" ? v : null;
}

export function trNum(id: string): number {
  const m = String(id).match(/\d+/);
  return m ? Number(m[0]) : 999999;
}
