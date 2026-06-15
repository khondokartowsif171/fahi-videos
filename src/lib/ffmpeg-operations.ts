/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface TrimOptions {
  startTime: number;
  endTime: number;
}

export interface ResizeOptions {
  width: number;
  height: number;
  maintainAspect: boolean;
}

export interface CompressOptions {
  crf: number;
  outputFormat: 'mp4' | 'webm';
}

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FilterAdjustOptions {
  brightness: number;  // -1.0 to 1.0
  contrast: number;    // 0.0 to 3.0
  saturation: number;  // 0.0 to 3.0
  hue: number;         // degrees -180 to 180
}

export interface SpeedOptions {
  rate: number; // 0.25 to 4.0
}

export interface RotateOptions {
  angle: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  color: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}

export interface GifOptions {
  fps: number;
  scale: number;
  startTime?: number;
  duration?: number;
}

export interface ProcessOptions {
  trim?: TrimOptions;
  crop?: CropOptions;
  resize?: ResizeOptions;
  compress?: CompressOptions;
  filters?: FilterAdjustOptions;
  speed?: SpeedOptions;
  rotate?: RotateOptions;
  watermark?: WatermarkOptions;
  mute?: boolean;
  reverse?: boolean;
}

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<any> | null = null;

export async function getFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  const { FFmpeg: FFmpegClass } = await import('@ffmpeg/ffmpeg');

  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpegClass();
  }

  if (onProgress) {
    ffmpegInstance.on('progress', ({ progress }) => {
      onProgress(Math.min(Math.round(progress * 100), 99));
    });
  }

  if (!loadPromise) {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    loadPromise = ffmpegInstance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  }

  await loadPromise;
  return ffmpegInstance;
}

function wmX(pos: string): string {
  if (pos === 'top-right' || pos === 'bottom-right') return '(w-text_w-20)';
  if (pos === 'center') return '(w-text_w)/2';
  return '20';
}
function wmY(pos: string): string {
  if (pos === 'bottom-left' || pos === 'bottom-right') return '(h-text_h-20)';
  if (pos === 'center') return '(h-text_h)/2';
  return '20';
}

export function buildFFmpegArgs(
  inputName: string,
  outputName: string,
  options: ProcessOptions
): string[] {
  const args: string[] = [];
  const { trim, crop, resize, compress, filters, speed, rotate, watermark, mute, reverse } = options;

  if (trim && trim.startTime > 0) args.push('-ss', String(trim.startTime));
  args.push('-i', inputName);
  if (trim && trim.endTime > 0) args.push('-to', String(trim.endTime - (trim.startTime || 0)));

  const vFilters: string[] = [];
  const aFilters: string[] = [];

  if (reverse) {
    vFilters.push('reverse');
    if (!mute) aFilters.push('areverse');
  }

  if (crop && crop.width > 0 && crop.height > 0) {
    vFilters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  }

  if (resize && (resize.width > 0 || resize.height > 0)) {
    const w = resize.width > 0 ? resize.width : -2;
    const h = resize.height > 0 ? resize.height : -2;
    vFilters.push(`scale=${w}:${h}`);
  }

  if (rotate) {
    if (rotate.angle === 90) vFilters.push('transpose=1');
    else if (rotate.angle === 180) vFilters.push('transpose=2,transpose=2');
    else if (rotate.angle === 270) vFilters.push('transpose=2');
    if (rotate.flipH) vFilters.push('hflip');
    if (rotate.flipV) vFilters.push('vflip');
  }

  if (filters) {
    vFilters.push(`eq=brightness=${filters.brightness}:contrast=${filters.contrast}:saturation=${filters.saturation}:gamma=1`);
    if (filters.hue !== 0) vFilters.push(`hue=h=${filters.hue}`);
  }

  if (watermark && watermark.text) {
    const safe = watermark.text.replace(/[':]/g, '');
    const color = watermark.color.replace('#', '0x');
    vFilters.push(`drawtext=text='${safe}':fontsize=${watermark.fontSize}:fontcolor=${color}:x=${wmX(watermark.position)}:y=${wmY(watermark.position)}:shadowcolor=black:shadowx=2:shadowy=2`);
  }

  if (speed && speed.rate !== 1.0) {
    vFilters.push(`setpts=${(1 / speed.rate).toFixed(4)}*PTS`);
    if (!mute) {
      const r = speed.rate;
      if (r >= 0.5 && r <= 2.0) aFilters.push(`atempo=${r.toFixed(4)}`);
      else if (r > 2.0) aFilters.push(`atempo=2.0,atempo=${(r / 2).toFixed(4)}`);
      else aFilters.push(`atempo=0.5,atempo=${(r * 2).toFixed(4)}`);
    }
  }

  if (vFilters.length > 0) args.push('-vf', vFilters.join(','));
  if (aFilters.length > 0 && !mute) args.push('-af', aFilters.join(','));
  if (mute) args.push('-an');

  const needsRecode = vFilters.length > 0 || mute || aFilters.length > 0;
  if (compress) {
    if (compress.outputFormat === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', String(compress.crf), '-b:v', '0');
      if (!mute) args.push('-c:a', 'libopus');
    } else {
      args.push('-c:v', 'libx264', '-crf', String(compress.crf), '-preset', 'fast');
      if (!mute) args.push('-c:a', 'aac', '-b:a', '128k');
    }
  } else if (!needsRecode) {
    args.push('-c', 'copy');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
    if (!mute) args.push('-c:a', 'aac', '-b:a', '128k');
  }

  args.push('-movflags', '+faststart');
  args.push(outputName);
  return args;
}

function toPlainBlob(data: unknown, mimeType: string): Blob {
  const raw = data as any;
  const src: Uint8Array = raw instanceof Uint8Array ? raw : new TextEncoder().encode(String(raw));
  const buf = new ArrayBuffer(src.byteLength);
  new Uint8Array(buf).set(src);
  return new Blob([buf], { type: mimeType });
}

export async function processVideo(
  file: File,
  options: ProcessOptions,
  onProgress: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onProgress);
  const inputExt = file.name.split('.').pop() || 'mp4';
  const outputExt = options.compress?.outputFormat || 'mp4';
  const inputName = `input.${inputExt}`;
  const outputName = `output.${outputExt}`;

  onProgress(5);
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  onProgress(10);

  const args = buildFFmpegArgs(inputName, outputName, options);
  await ffmpeg.exec(args);

  onProgress(95);
  const data = await ffmpeg.readFile(outputName);
  onProgress(100);

  await ffmpeg.deleteFile(inputName).catch(() => {});
  await ffmpeg.deleteFile(outputName).catch(() => {});

  return toPlainBlob(data, outputExt === 'webm' ? 'video/webm' : 'video/mp4');
}

export async function extractAudio(
  file: File,
  format: 'mp3' | 'aac',
  onProgress: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onProgress);
  const inputExt = file.name.split('.').pop() || 'mp4';
  const inputName = `input.${inputExt}`;
  const outputName = `output.${format}`;

  onProgress(5);
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  onProgress(15);

  if (format === 'mp3') {
    await ffmpeg.exec(['-i', inputName, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', outputName]);
  } else {
    await ffmpeg.exec(['-i', inputName, '-vn', '-c:a', 'aac', '-b:a', '192k', outputName]);
  }

  onProgress(95);
  const data = await ffmpeg.readFile(outputName);
  onProgress(100);

  await ffmpeg.deleteFile(inputName).catch(() => {});
  await ffmpeg.deleteFile(outputName).catch(() => {});

  return toPlainBlob(data, format === 'mp3' ? 'audio/mpeg' : 'audio/aac');
}

export async function makeGif(
  file: File,
  options: GifOptions,
  onProgress: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onProgress);
  const inputExt = file.name.split('.').pop() || 'mp4';
  const inputName = `input.${inputExt}`;

  onProgress(5);
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  onProgress(15);

  const seekArgs: string[] = [];
  if (options.startTime && options.startTime > 0) seekArgs.push('-ss', String(options.startTime));
  const durArgs: string[] = [];
  if (options.duration && options.duration > 0) durArgs.push('-t', String(options.duration));

  const filterBase = `fps=${options.fps},scale=${options.scale}:-1:flags=lanczos`;

  await ffmpeg.exec([...seekArgs, '-i', inputName, ...durArgs, '-vf', `${filterBase},palettegen=stats_mode=diff`, 'palette.png']);
  onProgress(50);

  await ffmpeg.exec([...seekArgs, '-i', inputName, '-i', 'palette.png', ...durArgs, '-lavfi', `${filterBase} [x]; [x][1:v] paletteuse=dither=bayer`, 'output.gif']);
  onProgress(95);

  const data = await ffmpeg.readFile('output.gif');
  onProgress(100);

  await ffmpeg.deleteFile(inputName).catch(() => {});
  await ffmpeg.deleteFile('palette.png').catch(() => {});
  await ffmpeg.deleteFile('output.gif').catch(() => {});

  return toPlainBlob(data, 'image/gif');
}
