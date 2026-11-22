interface OfflineVaultEntry {
  id: string;
  topic: string;
  category: string;
  keywords: string[];
  summary: string;
  details: string;
}

let cachedVault: OfflineVaultEntry[] | null = null;

function loadOfflineVault(): OfflineVaultEntry[] {
  if (cachedVault) return cachedVault;
  if (typeof document === 'undefined') return [];
  try {
    const el = document.getElementById('glitch-offline-vault');
    if (!el || !el.textContent) return [];
    const parsed = JSON.parse(el.textContent);
    if (Array.isArray(parsed?.entries)) {
      const entries: OfflineVaultEntry[] = parsed.entries;
      cachedVault = entries;
      return entries;
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

export function tryOfflineKnowledgeFallback(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const entries = loadOfflineVault();
  if (entries.length === 0) return null;

  const terms = q
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (terms.length === 0) return null;

  let bestScore = 0;
  let bestEntry: OfflineVaultEntry | null = null;

  for (let i = 0; i < Math.min(entries.length, 4000); i++) {
    const entry = entries[i];
    let score = 0;
    const topicLower = entry.topic.toLowerCase();
    for (const term of terms) {
      if (topicLower.includes(term)) score += 5;
      if (entry.keywords.some((k) => k.toLowerCase().includes(term))) score += 3;
      if (entry.summary.toLowerCase().includes(term)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (!bestEntry || bestScore < 3) return null;

  return `**${bestEntry.topic}** *(${bestEntry.category} — Offline Knowledge Mode)*\n\n${bestEntry.summary}\n\n${bestEntry.details}\n\n*Note: Live internet connection is currently unreachable, so this answer came from Glitch AI's built-in offline reference vault.*`;
}
