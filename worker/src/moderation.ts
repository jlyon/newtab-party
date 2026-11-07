// Leaderboard name moderation (App Store guideline 1.2 asks for a filter on
// user-generated content plus a way to report it).
//
// - normalizeName(): the stored form of a name (NFKC, no control chars, one space, ≤30).
// - isNameAllowed(): false for profanity, slurs and links. Checked when a name is saved
//   (PATCH /api/plays/:id) and again when names are shown, so names saved before the
//   filter existed are masked too.
// - Reports: POST /api/plays/:id/report records one report per (play, reporter). A name
//   with REPORT_HIDE_THRESHOLD distinct reporters is hidden everywhere (db.ts).

export const REPORT_HIDE_THRESHOLD = 2;

export function normalizeName(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

// Look-alike characters people use to dodge a filter.
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a',
  '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '€': 'e',
};

function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents
    .toLowerCase()
    .replace(/[0-9!|@$+€]/g, (c) => LEET[c] ?? c);
}

// Matched anywhere, even with the letters run together or separated ("f.u.c.k").
const ANYWHERE = [
  'fuck', 'fck', 'shit', 'nigg', 'faggot', 'fagot', 'retard', 'whore', 'slut', 'bitch',
  'biatch', 'asshole', 'arsehole', 'dickhead', 'cocksuck', 'motherf', 'pussy', 'twat',
  'wanker', 'bastard', 'wetback', 'tranny', 'molest', 'pedophil', 'paedophil', 'heilhitler',
  'hitler', 'siegheil', 'kkk', 'porn', 'dildo', 'jizz', 'blowjob', 'handjob', 'cumshot',
  'orgasm', 'killyourself',
];

// Matched only as whole words, because they hide inside ordinary names
// ("Janus", "Nazir", "therapist", "Fukuda", "Swanky" and "Scunthorpe" all pass).
const WHOLE_WORD = new Set([
  'ass', 'arse', 'fag', 'fags', 'fuk', 'cunt', 'cunts', 'dick', 'dicks', 'cock', 'cocks',
  'cum', 'tit', 'tits', 'titty', 'boob', 'boobs', 'anal', 'anus', 'rape', 'raped', 'raping',
  'rapist', 'spic', 'spick', 'kike', 'chink', 'gook', 'coon', 'dyke', 'pedo', 'paki', 'homo',
  'nazi', 'nazis', 'penis', 'vagina', 'clit', 'semen', 'sex', 'sexy', 'nude', 'nudes', 'xxx',
  'wank', 'kys',
]);

export function isNameAllowed(name: string): boolean {
  const n = normalizeName(name);
  if (!n) return false;
  // No links or handles that turn the leaderboard into an ad.
  if (/https?:|www\.|\.(com|net|org|io|gg|xyz|ru)\b|discord\.|t\.me/i.test(n)) return false;
  const folded = fold(n);
  const squashed = folded.replace(/[^a-z]/g, '');
  if (ANYWHERE.some((w) => squashed.includes(w))) return false;
  const words = folded.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => WHOLE_WORD.has(w))) return false;
  return true;
}

// Stable, non-reversible reporter id so one person can't hide a name alone.
export async function reporterId(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
  const bytes = new TextEncoder().encode('newtab.party/report/' + ip);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}
