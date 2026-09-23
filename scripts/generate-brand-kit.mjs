/** Rebuild the reviewed brand collection; never calls an external image service. */
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { BRAND_ASSETS, BRAND_KIT_REVISION } from '../src/lib/brand-assets.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/brand-kit');
await mkdir(path.join(output, 'previews'), { recursive: true });
const cobalt = '#315FE8';
const ivory = '#F7F8F5';
const ink = '#14232D';
const navy = '#031126';
const white = '#FFFFFF';
const markSvg = await readFile(path.join(root, 'public/brand/mark.svg'), 'utf8');
const markPath = markSvg.match(/<path d="([^"]+)"/)?.[1];
if (!markPath) throw new Error('Canonical Buffer mark is missing.');

const masters = {};
for (const [key, filename] of [['day', 'daylight.png'], ['night', 'after-hours.png']]) {
  const source = await readFile(path.join(root, 'design/brand-kit/masters', filename));
  masters[key] = {
    data: `data:image/jpeg;base64,${(await sharp(source).jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toBuffer()).toString('base64')}`,
    sha256: createHash('sha256').update(source).digest('hex'),
  };
}

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const rect = (x, y, w, h, color, radius = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${color}"/>`;
const mark = (x, y, size, color = cobalt) => `<g transform="translate(${x} ${y}) scale(${size / 32})"><path d="${markPath}" fill="${color}" fill-rule="evenodd"/></g>`;
const text = (x, y, size, lines, color = ink, opts = {}) => `<text x="${x}" y="${y}" fill="${color}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${opts.weight ?? 500}" letter-spacing="${opts.spacing ?? -size * 0.047}">${(Array.isArray(lines) ? lines : [lines]).map((line, index) => `<tspan x="${x}" dy="${index ? size * (opts.leading ?? 1.02) : 0}">${esc(line)}</tspan>`).join('')}</text>`;
const small = (x, y, content, color = cobalt, size = 18) => text(x, y, size, content, color, { spacing: size * 0.1, weight: 500 });
const centeredSmall = (x, y, content, color = cobalt, size = 18) => `<g text-anchor="middle">${small(x, y, content, color, size)}</g>`;
const lockup = (x, y, width, color = cobalt) => `<g transform="translate(${x} ${y}) scale(${width / 140})">${mark(0, 0, 33, color)}${text(40, 28, 31, 'Buffer', color, { weight: 550, spacing: -1.4 })}</g>`;
const image = (kind, x, y, w, h, align = 'xMidYMid slice') => `<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${align}" href="${masters[kind].data}"/>`;
const nightWide = (x, y, w, h, canvasHeight) => `${image('night', x, y, w, h, 'xMidYMid meet')}<defs><linearGradient id="night-blend"><stop stop-color="${navy}"/><stop offset="1" stop-color="${navy}" stop-opacity="0"/></linearGradient></defs>${rect(x, 0, w * 0.24, canvasHeight, 'url(#night-blend)')}`;
const hairline = (x, y, w, color = '#D7E0E5') => `<path d="M${x} ${y}h${w}" stroke="${color}" stroke-width="1"/>`;
const foot = (w, h, color = cobalt, inset = 64) => `${hairline(inset, h - 100, w - inset * 2, color)}${small(inset, h - 57, 'BUFFER / A CLEARER PERSPECTIVE', color, 14)}${text(w - inset - 284, h - 57, 17, 'bufferonsolana.vercel.app', color, { spacing: 0 })}`;
const tag = (x, y, label, color = cobalt, size = 16) => `${rect(x, y - size + 3, 6, 6, color)}${small(x + 18, y, label, color, size)}`;

// Geometry is purpose-designed for each output, not a rescaled universal poster.
function composition(id, w, h) {
  switch (id) {
    case 'buffer-profile':
      return `${rect(0, 0, w, h, ivory)}${mark(187, 178, 650)}`;
    case 'buffer-profile-cobalt':
      return `${rect(0, 0, w, h, cobalt)}${mark(187, 178, 650, white)}`;
    case 'buffer-wallpaper-phone':
      return `${rect(0, 0, w, h, ivory)}${image('day', -230, 710, 1800, 2086)}<defs><linearGradient id="fade" x2="0" y2="1"><stop stop-color="${ivory}"/><stop offset="1" stop-color="${ivory}" stop-opacity="0"/></linearGradient></defs>${rect(0, 708, w, 730, 'url(#fade)')}${lockup(523, 825, 270)}${centeredSmall(w / 2, 980, 'A LITTLE MORE PERSPECTIVE.', ink, 18)}`;
    case 'buffer-wallpaper-phone-night':
      return `${rect(0, 0, w, h, navy)}${image('night', 0, 0, w, h)}${lockup(523, 2320, 270, white)}${centeredSmall(w / 2, 2495, 'BUFFER, WITH YOU.', white, 18)}`;
    case 'buffer-wallpaper-desktop':
      return `${image('day', 0, 0, w, h)}${lockup(162, 1590, 440)}${small(175, 1800, 'A LITTLE MORE PERSPECTIVE.', ink, 25)}`;
    case 'buffer-wallpaper-desktop-night':
      return `${rect(0, 0, w, h, navy)}${nightWide(1330, -840, 2520, 3780, h)}${lockup(160, 1590, 440, white)}${small(173, 1800, 'A LITTLE MORE PERSPECTIVE.', '#A9BDE7', 25)}`;
    case 'buffer-header':
      return `${image('day', 0, 0, w, h)}${lockup(305, 115, 230)}${text(310, 285, 62, ['A clearer', 'picture.'])}${small(315, 402, 'PERPETUALS, IN PERSPECTIVE.', cobalt, 13)}`;
    case 'buffer-header-linkedin':
      return `${rect(0, 0, w, h, navy)}${nightWide(850, -480, 850, 1275, h)}${lockup(350, 66, 190, white)}${text(355, 218, 61, 'Room to think.', white)}${small(359, 282, 'BUFFER, WITH YOU.', '#B3C7EE', 13)}`;
    case 'buffer-header-youtube':
      return `${image('day', 0, 0, w, h)}${rect(550, 535, 1460, 370, ivory, 12)}${lockup(635, 608, 300)}${text(1185, 692, 65, ['Every move.', 'More perspective.'])}${small(645, 819, 'SOLANA PERPETUALS / PRICE SCENARIOS', cobalt, 17)}`;
    case 'buffer-ad-square':
      return `${rect(0, 0, w, h, ivory)}${image('day', 0, 506, 1080, 610)}${lockup(58, 58, 208)}${tag(66, 206, 'A CLEARER PERSPECTIVE')}${text(58, 352, 108, ['Every move.', 'More clarity.'])}${text(66, 738, 26, ['Explore the price effect', 'on your positions.'], ink, { spacing: -0.35, leading: 1.42 })}${rect(0, h - 101, w, 101, ivory)}${foot(w, h)}`;
    case 'buffer-social-portrait':
      return `${image('night', 0, 0, w, h)}${lockup(58, 60, 208, white)}${tag(66, 200, 'PERPETUALS, IN PERSPECTIVE.', '#B3C7EE')}${text(58, 345, 113, ['Before your', 'next move.'], white)}${text(65, 556, 28, ['A little more room', 'to understand the price effect.'], '#CDDAF5', { spacing: -0.4, leading: 1.4 })}${foot(w, h, white)}`;
    case 'buffer-story':
      return `${rect(0, 0, w, h, ivory)}${image('day', -360, 730, 1610, 1074)}${lockup(75, 230, 220)}${tag(82, 406, 'BUFFER, WITH YOU.')}${text(73, 554, 120, ['A little more', 'room to', 'think.'])}${rect(0, 1630, w, 290, ivory)}${text(82, 1697, 28, 'Explore your price scenario.', ink, { spacing: -0.6 })}${text(82, 1747, 23, 'bufferonsolana.vercel.app', cobalt, { spacing: 0 })}`;
    case 'buffer-ad-landscape':
      return `${image('day', 0, 0, w, h)}${lockup(52, 47, 182)}${text(56, 244, 75, ['See the', 'price effect.'])}${text(60, 447, 21, ['Explore your positions.', 'Understand the price effect.'], ink, { spacing: -0.3, leading: 1.55 })}${small(60, 570, 'BUFFERONSOLANA.VERCEL.APP', cobalt, 12)}`;
    case 'buffer-background':
      return image('day', 0, 0, w, h);
    case 'buffer-background-night':
      return `${rect(0, 0, w, h, navy)}${nightWide(1330, -840, 2520, 3780, h)}`;
    default: throw new Error(`No composition for ${id}`);
  }
}

const fileRecords = [];
for (const asset of BRAND_ASSETS) {
  const { id, width, height } = asset;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${esc(asset.name)} — Buffer</title>${composition(id, width, height)}</svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 6 }).toBuffer();
  await writeFile(path.join(output, `${id}.svg`), svg);
  await writeFile(path.join(output, `${id}.png`), png);
  await sharp(png).resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toFile(path.join(output, 'previews', `${id}.webp`));
  fileRecords.push({ ...asset, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex') });
  console.log(`${id}: ${width} × ${height}, ${(png.length / 1048576).toFixed(2)} MiB`);
}

// SVG export typography follows the existing shared Brand rather than system-ui.
for (const [filename, color] of [['wordmark.svg', cobalt], ['wordmark-mono.svg', ink]]) {
  await writeFile(path.join(root, 'public/brand', filename), `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="72" viewBox="0 0 140 36"><title>Buffer</title>${lockup(0, 1, 140, color)}</svg>\n`);
}

const guide = `BUFFER / A CLEARER PERSPECTIVE\nBrand collection — ${BRAND_KIT_REVISION}\n\n15 original-size PNG artworks. Daylight glass and after-hours cobalt collections.\n\nProfiles: square, circle-crop safe. X:1500x500. LinkedIn personal:1584x396.\nYouTube:2560x1440, essential identity centered inside1546x423 safe area.\nPhone:1290x2796. Desktop and clean backgrounds:3840x2160.\nSocial:1080square,1080x1350feed,1080x1920story,1200x628landscape.\nPlatform crops vary; preview your upload before publishing.\n\nPNG files are ready to use. Profile and logo SVG files are vector.\nThe other standalone SVG layouts embed raster artwork; they are not vector photos.\nPNG is recommended to keep typography consistent on every device.\n\nCobalt#315FE8 / Ink#14232D / Ivory#F7F8F5 / Ice#EDF3F7.\nPreserve the mark geometry, clear space, and wordmark.\nArtwork is decorative; it is not market data or a performance claim.\n\nMobile: open a PNG, then use your browser's share/save-image action.\nThe native Download action may save to Files rather than Photos.\n\nhttps://bufferonsolana.vercel.app\n`;
await writeFile(path.join(output, 'README.txt'), guide);
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ revision: BRAND_KIT_REVISION, masters: Object.fromEntries(Object.entries(masters).map(([key, value]) => [key, value.sha256])), assets: fileRecords }, null, 2) + '\n');

// Recreate rather than update so retired entries cannot linger in the ZIP.
const archive = path.join(output, 'buffer-brand-kit.zip');
const temporaryArchive = path.join(output, '.buffer-brand-kit-next.zip');
const { rm, rename } = await import('node:fs/promises');
await rm(temporaryArchive, { force: true });
execFileSync('zip', ['-q', '-X', temporaryArchive, 'README.txt', 'manifest.json', ...BRAND_ASSETS.map(asset => `${asset.id}.png`), 'buffer-profile.svg', 'buffer-profile-cobalt.svg'], { cwd: output });
await rename(temporaryArchive, archive);
const zipBytes = (await stat(archive)).size;
console.log(`Full kit: ${(zipBytes / 1048576).toFixed(1)} MiB; ${BRAND_ASSETS.length} artworks.`);
if (zipBytes >= 95 * 1048576) throw new Error('Archive exceeds the release size budget.');
const previewBytes = await Promise.all((await readdir(path.join(output, 'previews'))).map(async file => (await stat(path.join(output, 'previews', file))).size));
console.log(`All gallery previews: ${(previewBytes.reduce((sum, size) => sum + size, 0) / 1024).toFixed(0)} KiB.`);
