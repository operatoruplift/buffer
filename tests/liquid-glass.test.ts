import { describe, expect, it } from 'vitest';
import { coverTransform, createRefractionMap, GLASS_OPTICS, refractFrame, type RefractionMap } from '../src/lib/liquid-glass';

const clearOptics = { distortion: 0, edgeCurl: 0, brightness: 0, specular: 0, border: 0 };

describe('video-to-card optical geometry', () => {
  it('crops a landscape video correctly in a portrait scene', () => {
    const cover = coverTransform(1920, 1080, 400, 800);
    expect(cover.height).toBe(800);
    expect(cover.width).toBeCloseTo(1422.222222);
    expect(cover.left).toBeCloseTo(-511.111111);
    expect(cover.top).toBe(0);
  });

  it('crops a portrait video correctly in a wide scene', () => {
    expect(coverTransform(720, 1280, 1440, 900)).toEqual({ width: 1440, height: 2560, left: 0, top: -830 });
  });

  it('preserves an exact-aspect scene and rejects unusable dimensions', () => {
    expect(coverTransform(1920, 1080, 960, 540)).toEqual({ width: 960, height: 540, left: 0, top: 0 });
    for (const invalid of [0, -1, NaN, Infinity, 20_000]) {
      expect(() => coverTransform(invalid, 1080, 400, 800)).toThrow(RangeError);
      expect(() => createRefractionMap(512, invalid)).toThrow(RangeError);
    }
  });

  it.each([[512, 720], [335, 780], [512, 1400], [1024, 1400]])('bounds per-frame work for a %i × %i card', (width, height) => {
    const map = createRefractionMap(width, height);
    expect(map.width).toBeLessThanOrEqual(380);
    expect(map.width * map.height).toBeLessThanOrEqual(120_000);
    expect(map.width / map.scaleX).toBeCloseTo(width);
    expect(map.height / map.scaleY).toBeCloseTo(height);
    expect(map.sampleX.every(value => Number.isFinite(value) && value >= 0 && value < map.sourceWidth)).toBe(true);
    expect(map.sampleY.every(value => Number.isFinite(value) && value >= 0 && value < map.sourceHeight)).toBe(true);
  });

  it('clips rounded corners while retaining opaque interior pixels', () => {
    const map = createRefractionMap(335, 580);
    expect(map.alpha[0]).toBe(0);
    expect(map.alpha[map.width - 1]).toBe(0);
    expect(map.alpha[Math.floor(map.height / 2) * map.width + Math.floor(map.width / 2)]).toBe(255);
  });

  it('displaces opposite sides symmetrically with a brighter upper rim', () => {
    const map = createRefractionMap(320, 500);
    const row = Math.floor(map.height / 2);
    const left = row * map.width + 1;
    const right = row * map.width + map.width - 2;
    expect(map.sampleX[left] + map.sampleX[right]).toBeCloseTo(map.width - 1 + map.paddingX * 2, 4);
    expect(map.sampleX[left]).toBeLessThan(1 + map.paddingX);
    const top = map.width + Math.floor(map.width / 2);
    const bottom = (map.height - 2) * map.width + Math.floor(map.width / 2);
    expect(map.light[top]).toBeGreaterThan(map.light[bottom]);
  });

  it('maps to the original pixels when refraction and lighting are disabled', () => {
    const map = createRefractionMap(60, 100, clearOptics);
    const x = 22;
    const y = 37;
    expect(map.sampleX[y * map.width + x]).toBe(x + map.paddingX);
    expect(map.sampleY[y * map.width + x]).toBe(y + map.paddingY);
    expect(map.light[y * map.width + x]).toBe(0);
    expect(GLASS_OPTICS).toEqual({ distortion: 0.06, edgeCurl: 0.04, brightness: 0.06, specular: 0.20, border: 0.18 });
  });
});

function onePixelMap(x: number, y: number, light = 0): RefractionMap {
  return { width: 1, height: 1, sourceWidth: 2, sourceHeight: 2, scaleX: 1, scaleY: 1, paddingX: 0, paddingY: 0,
    sampleX: new Float32Array([x]), sampleY: new Float32Array([y]), light: new Float32Array([light]), alpha: new Uint8ClampedArray([240]) };
}

describe('decoded frame refraction', () => {
  const source = new Uint8ClampedArray([0, 20, 40, 255, 100, 120, 140, 255, 200, 220, 240, 255, 100, 120, 140, 255]);

  it('bilinearly mixes all four pixels and preserves the curved-edge mask', () => {
    const output = new Uint8ClampedArray(4);
    refractFrame(source, onePixelMap(0.5, 0.5), output);
    expect([...output]).toEqual([100, 120, 140, 240]);
  });

  it('clamps sampling at source edges rather than reading outside the buffer', () => {
    const output = new Uint8ClampedArray(4);
    refractFrame(source, onePixelMap(-10, 100), output);
    expect([...output]).toEqual([200, 220, 240, 240]);
  });

  it('applies highlights to RGB without changing native form content or mask opacity', () => {
    const output = new Uint8ClampedArray(4);
    refractFrame(new Uint8ClampedArray(16), onePixelMap(0.5, 0.5, 0.2), output);
    expect([...output]).toEqual([51, 51, 51, 240]);
  });

  it('reuses the caller output and updates it with the next scene frame', () => {
    const output = new Uint8ClampedArray(4);
    const map = onePixelMap(0, 0);
    refractFrame(source, map, output);
    expect(output[0]).toBe(0);
    const nextFrame = new Uint8ClampedArray(source);
    nextFrame[0] = 210;
    refractFrame(nextFrame, map, output);
    expect(output[0]).toBe(210);
    expect(() => refractFrame(source, map, new Uint8ClampedArray(8))).toThrow(RangeError);
    expect(() => refractFrame(new Uint8ClampedArray(12), map, output)).toThrow(RangeError);
  });
});
