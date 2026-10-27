// Content rules every published string must pass. Used by the data build and by the tests.
// The one allowed "largest" phrasing is removed before the check, so any other use fails.
const ALLOWED = /one of the largest on-demand manufacturing platforms in the EU/g;
// Figure dash, en-dash, em-dash, horizontal bar, minus sign. Built from code points so this file stays ASCII.
const DASHES = new RegExp(`[${[0x2012, 0x2013, 0x2014, 0x2015, 0x2212].map((c) => String.fromCharCode(c)).join('')}]`);

export const BANNED = [
  [DASHES, 'dash other than the ASCII hyphen'],
  [/protolabs|craftcloud|xometry/i, 'manufacturing partner name'],
  [/\bHubs\b/, 'manufacturing partner name'], // capitalised brand only, so "EU hubs" passes
  [/largest/i, '"largest" claim'],
  [/middle east/i, 'region (use "four continents")'],
  [/\bbet(s|ting)?\b|\btrad(e|es|ing)\b(?! press)/i, 'trading or betting'],
  [/seven-figure|funding placed/i, 'HighCrowd funding figure'],
  [/10,000|10K\+? orders/i, 'Innovium order count'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, 'email address'],
  [/(?<![.\w])I(?![.\w])|\b(I'm|I've|me|my|we|our|We|Our|My|Me)\b/, 'first-person voice'], // S.I. 301/2024 passes
  [/world-class|cutting-edge|revolutionary|game-?chang|seamless|unparalleled|best-in-class|rockstar|ninja|synerg|supercharg|\b10x\b/i, 'hype word'],
];

export function violations(text) {
  const t = text.replace(ALLOWED, '');
  return BANNED.filter(([re]) => re.test(t)).map(([re, why]) => {
    const i = t.search(re);
    return `${why}: ...${t.slice(Math.max(0, i - 60), i + 60)}...`;
  });
}
