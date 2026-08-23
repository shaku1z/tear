function normalizeRepositoryPath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
}

/** Normalize SSH, HTTPS, and owner/repository forms to a comparable identity. */
export function normalizeRepositoryIdentifier(value) {
  let raw = String(value ?? "").trim();
  if (raw === "") return "";
  raw = raw.split(/[?#]/u, 1)[0].replace(/\/+$/u, "").replace(/\.git$/iu, "");

  let hostPath = raw;
  const urlMatch = raw.match(/^[a-z][a-z0-9+.-]*:\/\//iu);
  if (urlMatch) {
    try {
      const parsed = new URL(raw);
      hostPath = `${parsed.hostname}/${parsed.pathname.replace(/^\/+/, "")}`;
    } catch {
      return "";
    }
  } else {
    const scpMatch = raw.match(/^(?:[^@/]+@)?([^:]+):(.+)$/u);
    if (scpMatch) hostPath = `${scpMatch[1]}/${scpMatch[2]}`;
  }

  hostPath = normalizeRepositoryPath(hostPath).toLowerCase();
  if (hostPath.startsWith("github.com/")) return hostPath.slice("github.com/".length);
  return hostPath;
}
