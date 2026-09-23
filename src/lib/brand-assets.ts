export type BrandAsset = {
  id: string;
  name: string;
  category: 'Profiles' | 'Wallpapers' | 'Headers' | 'Social' | 'Backgrounds';
  collection: 'Daylight' | 'After hours' | 'Essential';
  description: string;
  src: string;
  preview: string;
  svgSrc?: string;
  width: number;
  height: number;
};

export const BRAND_KIT_REVISION = '2026-09-23';
export const BRAND_KIT_ARCHIVE = '/brand-kit/buffer-brand-kit.zip';

const entries: Omit<BrandAsset, 'src' | 'preview'>[] = [
  { id: 'buffer-profile', name: 'The original, refined.', category: 'Profiles', collection: 'Essential', description: 'Our cobalt ribbon on warm ivory. Centered with room for a circular crop.', width: 1024, height: 1024, svgSrc: '/brand-kit/buffer-profile.svg' },
  { id: 'buffer-profile-cobalt', name: 'Cobalt, full volume.', category: 'Profiles', collection: 'Essential', description: 'A white ribbon on signature blue. Clear even at the smallest profile size.', width: 1024, height: 1024, svgSrc: '/brand-kit/buffer-profile-cobalt.svg' },
  { id: 'buffer-wallpaper-phone', name: 'Clarity / phone', category: 'Wallpapers', collection: 'Daylight', description: 'Optical glass, soft daylight, and a quiet upper field for your lock-screen clock.', width: 1290, height: 2796 },
  { id: 'buffer-wallpaper-phone-night', name: 'Blue hour / phone', category: 'Wallpapers', collection: 'After hours', description: 'Sculpted cobalt against midnight. Minimal branding below the clock area.', width: 1290, height: 2796 },
  { id: 'buffer-wallpaper-desktop', name: 'Clarity / desktop', category: 'Wallpapers', collection: 'Daylight', description: 'A 4K glass study with a calm left side for desktop icons and windows.', width: 3840, height: 2160 },
  { id: 'buffer-wallpaper-desktop-night', name: 'Blue hour / desktop', category: 'Wallpapers', collection: 'After hours', description: 'A 4K cobalt sculpture with deep navy space and an understated wordmark.', width: 3840, height: 2160 },
  { id: 'buffer-header', name: 'A clearer perspective.', category: 'Headers', collection: 'Daylight', description: 'An X-sized header. The artwork carries the right side; the lower-left stays clear for your avatar.', width: 1500, height: 500 },
  { id: 'buffer-header-linkedin', name: 'Room to think.', category: 'Headers', collection: 'After hours', description: 'A wide personal LinkedIn header with identity and copy kept away from the profile-photo area.', width: 1584, height: 396 },
  { id: 'buffer-header-youtube', name: 'The bigger picture.', category: 'Headers', collection: 'Daylight', description: 'A full YouTube canvas. Essential identity sits within the centered 1546 × 423 safe area.', width: 2560, height: 1440 },
  { id: 'buffer-ad-square', name: 'Every move. More clarity.', category: 'Social', collection: 'Daylight', description: 'A square launch composition with sculptural glass and a simple invitation to explore.', width: 1080, height: 1080 },
  { id: 'buffer-social-portrait', name: 'Before your next move.', category: 'Social', collection: 'After hours', description: 'A 4:5 feed poster about understanding a price move. No return promises or invented figures.', width: 1080, height: 1350 },
  { id: 'buffer-story', name: 'A little more room.', category: 'Social', collection: 'Daylight', description: 'A 9:16 story with the headline and address clear of the top and bottom interface zones.', width: 1080, height: 1920 },
  { id: 'buffer-ad-landscape', name: 'See the price effect.', category: 'Social', collection: 'Daylight', description: 'A landscape campaign card for link shares, launch updates, and community announcements.', width: 1200, height: 628 },
  { id: 'buffer-background', name: 'Glass study / clean', category: 'Backgrounds', collection: 'Daylight', description: 'A text-free 4K canvas for decks and custom posts. Add your own message in the quiet left field.', width: 3840, height: 2160 },
  { id: 'buffer-background-night', name: 'Cobalt study / clean', category: 'Backgrounds', collection: 'After hours', description: 'A text-free 4K midnight canvas for presentations, announcements, and custom artwork.', width: 3840, height: 2160 },
];

export const BRAND_ASSETS: BrandAsset[] = entries.map(asset => ({
  ...asset,
  src: `/brand-kit/${asset.id}.png`,
  preview: `/brand-kit/previews/${asset.id}.webp`,
}));
