export const GLITCH_AI_VERSION = '1.0';
export const INITIAL_CREDITS = 100;
export const IMAGE_CREDIT_COST = 10;
export const AD_REWARD_MIN = 0;
export const AD_REWARD_MAX = 10;
export const MAX_CREDITS_CAP = 10000;
export const MAX_TRANSFER_CREDITS = 1000;

export const ADSTERRA_SMART_LINKS = [
  'https://asiafilm.org/4/d8a0c88b6ee1fc946e77037c5d4cf28e',
  'https://araplhn.org/4/719161dd8fa773577fc7ffcc5008e9cb',
  'https://asiafilm.org/4/904c2e23e02989c5ea8c91c07e53d113',
  'https://asiafilm.org/4/188ac2615ae30cde1771518b003c75c4',
  'https://asiafilm.org/4/1ab474778e8924810ffd6231d0b65fa',
  'https://auctionr.org/4/8f854c38340469369035fd7e320915ef',
  'https://auctionr.org/4/8b5c0d68eea9f3eceda556c788c3836f',
  'https://asiafilm.org/4/12d474dea7f0aafbc471cfb4bd1df9fa',
  'https://asiafilm.org/4/28d1c7e9d7a82919640953b18cb6bf47',
] as const;

export const ADSTERRA_SMART_LINK = ADSTERRA_SMART_LINKS[0];

function getSecureUnitRandom(): number {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] / 0x100000000;
    }
  } catch {}
  return Math.random();
}

export function getRandomAdsterraSmartLink(excludeUrl?: string): string {
  const pool =
    excludeUrl && ADSTERRA_SMART_LINKS.length > 1
      ? ADSTERRA_SMART_LINKS.filter((url) => url !== excludeUrl)
      : [...ADSTERRA_SMART_LINKS];
  const index = Math.floor(getSecureUnitRandom() * pool.length);
  return pool[index] || ADSTERRA_SMART_LINKS[0];
}

/**
 * Lucky ad reward roll between 0 and 10 credits:
 * - ~10% chance of 0 (unlucky spin — watch another ad to try again)
 * - ~80% chance spread evenly across 1–9 credits
 * - ~10% chance of 10 (jackpot!)
 */
export function rollLuckyAdReward(): number {
  const r = getSecureUnitRandom();
  if (r < 0.1) return 0;
  if (r >= 0.9) return 10;
  return 1 + Math.floor(getSecureUnitRandom() * 9);
}

const GUEST_CREDITS_KEY = 'glitch_ai_guest_credits_v1';

export function getGuestCredits(): number {
  try {
    const raw = localStorage.getItem(GUEST_CREDITS_KEY);
    if (raw === null) {
      localStorage.setItem(GUEST_CREDITS_KEY, String(INITIAL_CREDITS));
      return INITIAL_CREDITS;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      localStorage.setItem(GUEST_CREDITS_KEY, String(INITIAL_CREDITS));
      return INITIAL_CREDITS;
    }
    return Math.max(0, Math.min(MAX_CREDITS_CAP, parsed));
  } catch {
    return INITIAL_CREDITS;
  }
}

export function deductGuestCredits(cost: number = IMAGE_CREDIT_COST): number {
  const current = getGuestCredits();
  if (current < cost) {
    throw new Error('INSUFFICIENT_CREDITS');
  }
  const next = Math.max(0, Math.min(MAX_CREDITS_CAP, current - cost));
  try {
    localStorage.setItem(GUEST_CREDITS_KEY, String(next));
  } catch {}
  return next;
}

export function earnGuestCredits(reward: number): number {
  const safeReward = Math.max(AD_REWARD_MIN, Math.min(AD_REWARD_MAX, Math.floor(reward)));
  const current = getGuestCredits();
  if (safeReward <= 0) return current;
  const next = Math.max(0, Math.min(MAX_CREDITS_CAP, current + safeReward));
  try {
    localStorage.setItem(GUEST_CREDITS_KEY, String(next));
  } catch {}
  return next;
}
