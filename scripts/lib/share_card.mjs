// Link-preview cards for newtab.party (og:image / twitter:image).
//
// Slack, Facebook, X and iMessage crop og:image to their own aspect ratio, which
// chops the top and bottom off the tall crest logos. So each game gets a 1200x630
// (1.91:1, the size every unfurler expects) card with its transparent logo centered
// and fully inside it, on the arcade's dark background.
import path from 'node:path';

export const SHARE_W = 1200;
export const SHARE_H = 630;
const PAD = 45;                 // keep the logo clear of the edges
const BG = '#080810';           // arcade background (render.ts)

export const shareDir = (root) => path.join(root, 'worker', 'public', 'games', 'share');
export const sharePath = (root, id) => path.join(shareDir(root), `${id}.jpg`);

// logoPng: Buffer of the transparent logo. Returns a JPEG Buffer.
export async function makeShareCard(sharp, logoPng) {
  const logo = await sharp(logoPng)
    .resize(SHARE_W - PAD * 2, SHARE_H - PAD * 2, { fit: 'inside' })
    .png()
    .toBuffer();
  return sharp({ create: { width: SHARE_W, height: SHARE_H, channels: 3, background: BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
