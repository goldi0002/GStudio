import { createCanvas } from './canvasOps';

export interface SamplePreset {
  id: string;
  name: string;
  subtitle: string;
  width: number;
  height: number;
  backgroundColor: string;
  render: () => HTMLCanvasElement;
}

function renderAlpineDawn(): HTMLCanvasElement {
  const w = 1600;
  const h = 1000;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d')!;

  // Dawn sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#0F1B2E');
  sky.addColorStop(0.42, '#2B4162');
  sky.addColorStop(0.76, '#A97C73');
  sky.addColorStop(1, '#F2C6A0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.62);

  // Soft solar glow
  const sunGlow = ctx.createRadialGradient(w * 0.68, h * 0.44, 12, w * 0.68, h * 0.44, 420);
  sunGlow.addColorStop(0, 'rgba(255, 240, 210, 0.92)');
  sunGlow.addColorStop(0.25, 'rgba(247, 198, 148, 0.48)');
  sunGlow.addColorStop(1, 'rgba(247, 198, 148, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, w, h * 0.65);

  // Far mountain ridge
  ctx.fillStyle = '#334663';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  const farPoints = [
    [0, 0.48], [180, 0.34], [340, 0.42], [520, 0.25], [710, 0.38],
    [910, 0.22], [1120, 0.36], [1310, 0.29], [1480, 0.39], [1600, 0.33],
  ];
  for (const [px, py] of farPoints) {
    ctx.lineTo(px, h * py);
  }
  ctx.lineTo(w, h * 0.62);
  ctx.closePath();
  ctx.fill();

  // Mid granite ridge with warm rim highlight
  const midGrad = ctx.createLinearGradient(0, h * 0.28, 0, h * 0.62);
  midGrad.addColorStop(0, '#4E5D75');
  midGrad.addColorStop(1, '#1E2838');
  ctx.fillStyle = midGrad;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  const midPoints = [
    [0, 0.54], [140, 0.44], [290, 0.5], [460, 0.33], [630, 0.49],
    [820, 0.31], [1010, 0.47], [1220, 0.38], [1410, 0.51], [1600, 0.43],
  ];
  for (const [px, py] of midPoints) {
    ctx.lineTo(px, h * py);
  }
  ctx.lineTo(w, h * 0.62);
  ctx.closePath();
  ctx.fill();

  // Mist band
  const mist = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.63);
  mist.addColorStop(0, 'rgba(244, 214, 188, 0)');
  mist.addColorStop(0.55, 'rgba(244, 214, 188, 0.35)');
  mist.addColorStop(1, 'rgba(216, 204, 200, 0.14)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, h * 0.48, w, h * 0.15);

  // Foreground dark pine silhouette ridge
  ctx.fillStyle = '#121A24';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  ctx.lineTo(0, h * 0.57);
  for (let x = 0; x <= w; x += 14) {
    const base = h * (0.56 + Math.sin(x * 0.004) * 0.03);
    const tree = ((x * 37) % 19) * 1.4;
    ctx.lineTo(x, base - tree);
  }
  ctx.lineTo(w, h * 0.62);
  ctx.closePath();
  ctx.fill();

  // Lake water surface (reflected palette)
  const lake = ctx.createLinearGradient(0, h * 0.62, 0, h);
  lake.addColorStop(0, '#5B5969');
  lake.addColorStop(0.35, '#2A394F');
  lake.addColorStop(1, '#101824');
  ctx.fillStyle = lake;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);

  // Subtle horizontal water ripples
  ctx.fillStyle = 'rgba(248, 212, 178, 0.14)';
  for (let i = 0; i < 65; i++) {
    const ry = h * 0.63 + ((i * 23) % (h * 0.34));
    const rx = (i * 197) % (w - 200);
    const rw = 80 + ((i * 53) % 240);
    ctx.fillRect(rx, ry, rw, 1.5);
  }

  return canvas;
}

function renderArchitecturalCourtyard(): HTMLCanvasElement {
  const w = 1400;
  const h = 1050;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d')!;

  // Clear crisp sky
  const sky = ctx.createLinearGradient(0, 0, w, h * 0.55);
  sky.addColorStop(0, '#5A89B8');
  sky.addColorStop(1, '#BED6EC');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Left architectural concrete wall
  const leftWall = ctx.createLinearGradient(0, 0, w * 0.45, h);
  leftWall.addColorStop(0, '#D9D7D2');
  leftWall.addColorStop(1, '#ACA9A2');
  ctx.fillStyle = leftWall;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.48, h * 0.14);
  ctx.lineTo(w * 0.48, h * 0.78);
  ctx.lineTo(0, h * 0.94);
  ctx.closePath();
  ctx.fill();

  // Warm cedar timber upper overhang
  const wood = ctx.createLinearGradient(w * 0.42, h * 0.14, w, h * 0.34);
  wood.addColorStop(0, '#9B623B');
  wood.addColorStop(1, '#6D4124');
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h * 0.14);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h * 0.42);
  ctx.lineTo(w * 0.42, h * 0.42);
  ctx.closePath();
  ctx.fill();

  // Cedar slats
  ctx.strokeStyle = 'rgba(42, 22, 10, 0.38)';
  ctx.lineWidth = 3;
  for (let x = w * 0.44; x < w; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h * 0.42);
    ctx.stroke();
  }

  // Sunlit courtyard floor
  const floor = ctx.createLinearGradient(0, h * 0.68, w, h);
  floor.addColorStop(0, '#CFCBC4');
  floor.addColorStop(1, '#8F8B84');
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.94);
  ctx.lineTo(w * 0.48, h * 0.78);
  ctx.lineTo(w, h * 0.78);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Diagonal architectural sunlight beam
  ctx.fillStyle = 'rgba(255, 246, 228, 0.48)';
  ctx.beginPath();
  ctx.moveTo(w * 0.48, h * 0.42);
  ctx.lineTo(w, h * 0.42);
  ctx.lineTo(w, h * 0.78);
  ctx.lineTo(w * 0.48, h * 0.78);
  ctx.closePath();
  ctx.fill();

  // Crisp geometric shadow polygon across concrete wall
  ctx.fillStyle = 'rgba(26, 30, 38, 0.24)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.36);
  ctx.lineTo(w * 0.48, h * 0.52);
  ctx.lineTo(w * 0.48, h * 0.78);
  ctx.lineTo(0, h * 0.94);
  ctx.closePath();
  ctx.fill();

  // Shallow reflecting pool
  const pool = ctx.createLinearGradient(w * 0.34, h * 0.82, w * 0.92, h * 0.97);
  pool.addColorStop(0, '#365570');
  pool.addColorStop(1, '#6C94B5');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.85);
  ctx.lineTo(w * 0.92, h * 0.85);
  ctx.lineTo(w * 0.86, h * 0.96);
  ctx.lineTo(w * 0.24, h * 0.96);
  ctx.closePath();
  ctx.fill();

  return canvas;
}

function renderTransparencyPrismLab(): HTMLCanvasElement {
  const w = 1200;
  const h = 1200;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d')!;

  // Leave outer border transparent to demonstrate PNG/WebP transparency!
  // Soft rounded studio plate
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(100, 100, 1000, 1000, 140);
  ctx.clip();

  const base = ctx.createLinearGradient(100, 100, 1100, 1100);
  base.addColorStop(0, '#1D222B');
  base.addColorStop(1, '#111419');
  ctx.fillStyle = base;
  ctx.fillRect(100, 100, 1000, 1000);

  // Chromatic color wheel orbs for saturation / hue / tint inspection
  const orbs: Array<[number, number, number, string, string]> = [
    [450, 470, 240, '#0A84FF', 'rgba(10, 132, 255, 0)'],
    [740, 480, 230, '#FF453A', 'rgba(255, 69, 58, 0)'],
    [600, 740, 240, '#30D158', 'rgba(48, 209, 88, 0)'],
  ];

  ctx.globalCompositeOperation = 'screen';
  for (const [ox, oy, r, c1, c2] of orbs) {
    const g = ctx.createRadialGradient(ox, oy, 20, ox, oy, r);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';

  // Precision calibration rings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 2;
  for (const rad of [140, 260, 380]) {
    ctx.beginPath();
    ctx.arc(600, 600, rad, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Neutral grayscale calibration bar at bottom
  const steps = 8;
  const barW = 640;
  const stepW = barW / steps;
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(280 + i * stepW, 930, stepW, 44);
  }
  ctx.restore();

  return canvas;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'sample-alpine-dawn',
    name: 'Alpine Dawn Horizon',
    subtitle: '1600 × 1000 · Dynamic Range & Tone Study',
    width: 1600,
    height: 1000,
    backgroundColor: '#101824',
    render: renderAlpineDawn,
  },
  {
    id: 'sample-courtyard',
    name: 'Sunlit Courtyard Study',
    subtitle: '1400 × 1050 · Geometry, Crop & Sharpness',
    width: 1400,
    height: 1050,
    backgroundColor: '#8F8B84',
    render: renderArchitecturalCourtyard,
  },
  {
    id: 'sample-prism-lab',
    name: 'Color & Alpha Calibration',
    subtitle: '1200 × 1200 · Transparent PNG & Color Lab',
    width: 1200,
    height: 1200,
    backgroundColor: 'transparent',
    render: renderTransparencyPrismLab,
  },
];

const cachedThumbs = new Map<string, string>();

export function getSampleThumbnail(preset: SamplePreset): string {
  const existing = cachedThumbs.get(preset.id);
  if (existing) return existing;
  const full = preset.render();
  const thumb = createCanvas(320, Math.round((320 * preset.height) / preset.width));
  const ctx = thumb.getContext('2d');
  if (ctx) {
    ctx.drawImage(full, 0, 0, thumb.width, thumb.height);
  }
  const url = thumb.toDataURL('image/png');
  cachedThumbs.set(preset.id, url);
  return url;
}
