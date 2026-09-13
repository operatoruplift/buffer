export const GLASS_OPTICS = {
  distortion: 0.06,
  edgeCurl: 0.04,
  brightness: 0.06,
  specular: 0.20,
  border: 0.18,
} as const;

export type GlassOptics = { [Key in keyof typeof GLASS_OPTICS]: number };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function requireDimension(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 16_384) throw new RangeError('Invalid glass dimensions.');
}

/** The centered CSS object-fit: cover transform, in the video's displayed CSS box. */
export function coverTransform(videoWidth: number, videoHeight: number, boxWidth: number, boxHeight: number) {
  [videoWidth, videoHeight, boxWidth, boxHeight].forEach(requireDimension);
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { left: (boxWidth - width) / 2, top: (boxHeight - height) / 2, width, height };
}

export type RefractionMap = {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  scaleX: number;
  scaleY: number;
  paddingX: number;
  paddingY: number;
  sampleX: Float32Array;
  sampleY: Float32Array;
  light: Float32Array;
  alpha: Uint8ClampedArray;
};

/** Compute geometry and lighting only on resize; the video frame reuses these buffers. */
export function createRefractionMap(cssWidth: number, cssHeight: number, optics: GlassOptics = GLASS_OPTICS): RefractionMap {
  requireDimension(cssWidth);
  requireDimension(cssHeight);
  if (Object.values(optics).some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError('Invalid glass optics.');
  const scale = Math.min(1, 380 / cssWidth, Math.sqrt(120_000 / (cssWidth * cssHeight)));
  const width = Math.max(1, Math.floor(cssWidth * scale));
  const height = Math.max(1, Math.floor(cssHeight * scale));
  const scaleX = width / cssWidth;
  const scaleY = height / cssHeight;
  const shortest = Math.min(cssWidth, cssHeight);
  const radius = Math.min(16, shortest / 2);
  const halfWidth = cssWidth / 2;
  const halfHeight = cssHeight / 2;
  const paddingX = Math.ceil((halfWidth * optics.distortion + shortest * optics.edgeCurl + 3) * scaleX);
  const paddingY = Math.ceil((halfHeight * optics.distortion + shortest * optics.edgeCurl + 3) * scaleY);
  const sourceWidth = width + paddingX * 2;
  const sourceHeight = height + paddingY * 2;
  const sampleX = new Float32Array(width * height);
  const sampleY = new Float32Array(width * height);
  const light = new Float32Array(width * height);
  const alpha = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const px = (x + 0.5) / scaleX - halfWidth;
      const py = (y + 0.5) / scaleY - halfHeight;
      const qx = Math.abs(px) - halfWidth + radius;
      const qy = Math.abs(py) - halfHeight + radius;
      const cornerX = Math.max(qx, 0);
      const cornerY = Math.max(qy, 0);
      const cornerLength = Math.hypot(cornerX, cornerY);
      const distance = cornerLength + Math.min(Math.max(qx, qy), 0) - radius;
      let normalX = 0;
      let normalY = 0;
      if (cornerLength > 0) {
        normalX = cornerX / cornerLength * Math.sign(px);
        normalY = cornerY / cornerLength * Math.sign(py);
      } else if (qx > qy) normalX = Math.sign(px);
      else normalY = Math.sign(py);

      const radial = Math.min(1, Math.hypot(px / halfWidth, py / halfHeight) / Math.SQRT2);
      const bulge = optics.distortion * (1 - radial * radial);
      const edge = Math.pow(clamp(1 + distance / (shortest * 0.18), 0, 1), 3);
      const curl = shortest * optics.edgeCurl * edge;
      sampleX[index] = (px + halfWidth + px * bulge + normalX * curl) * scaleX + paddingX - 0.5;
      sampleY[index] = (py + halfHeight + py * bulge + normalY * curl) * scaleY + paddingY - 0.5;
      const facingLight = Math.max(0, -normalX * 0.55 - normalY * 0.835);
      light[index] = clamp(optics.brightness + optics.specular * edge * facingLight ** 4 + optics.border * Math.exp(-Math.abs(distance) * 1.3), 0, 1);
      alpha[index] = clamp(0.5 - distance * Math.min(scaleX, scaleY), 0, 1) * 255;
    }
  }
  return { width, height, sourceWidth, sourceHeight, scaleX, scaleY, paddingX, paddingY, sampleX, sampleY, light, alpha };
}

/** Bilinear video sampling, including clamped edges, into a caller-owned RGBA buffer. */
export function refractFrame(source: Uint8ClampedArray, map: RefractionMap, output: Uint8ClampedArray) {
  if (source.length !== map.sourceWidth * map.sourceHeight * 4 || output.length !== map.width * map.height * 4) throw new RangeError('Mismatched glass frame buffers.');
  for (let index = 0; index < map.width * map.height; index++) {
    const x = clamp(map.sampleX[index], 0, map.sourceWidth - 1);
    const y = clamp(map.sampleY[index], 0, map.sourceHeight - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, map.sourceWidth - 1);
    const y1 = Math.min(y0 + 1, map.sourceHeight - 1);
    const fx = x - x0;
    const fy = y - y0;
    const topLeft = (y0 * map.sourceWidth + x0) * 4;
    const topRight = (y0 * map.sourceWidth + x1) * 4;
    const bottomLeft = (y1 * map.sourceWidth + x0) * 4;
    const bottomRight = (y1 * map.sourceWidth + x1) * 4;
    const light = map.light[index];
    const outputIndex = index * 4;
    for (let channel = 0; channel < 3; channel++) {
      const top = source[topLeft + channel] * (1 - fx) + source[topRight + channel] * fx;
      const bottom = source[bottomLeft + channel] * (1 - fx) + source[bottomRight + channel] * fx;
      output[outputIndex + channel] = (top * (1 - fy) + bottom * fy) * (1 - light) + 255 * light;
    }
    output[outputIndex + 3] = map.alpha[index];
  }
}
