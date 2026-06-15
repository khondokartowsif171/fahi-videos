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

export interface ProcessOptions {
  trim?: TrimOptions;
  crop?: CropOptions;
  resize?: ResizeOptions;
  compress?: CompressOptions;
}

let ffmpegInstance: FFmpeg | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

export async function getFFmpeg(
  onProgress?: (progress: number) => void
): Promise<FFmpeg> {
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

export function buildFFmpegArgs(
  inputName: string,
  outputName: string,
  options: ProcessOptions
): string[] {
  const args: string[] = [];
  const { trim, crop, resize, compress } = options;

  // Input with optional fast seek for trim
  if (trim && trim.startTime > 0) {
    args.push('-ss', String(trim.startTime));
  }
  args.push('-i', inputName);
  if (trim && trim.endTime > 0) {
    args.push('-to', String(trim.endTime - (trim.startTime || 0)));
  }

  // Build video filter chain: crop and/or scale
  const filters: string[] = [];
  if (crop && crop.width > 0 && crop.height > 0) {
    filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  }
  if (resize && (resize.width > 0 || resize.height > 0)) {
    const w = resize.width > 0 ? resize.width : -2;
    const h = resize.height > 0 ? resize.height : -2;
    filters.push(`scale=${w}:${h}`);
  }
  if (filters.length > 0) {
    args.push('-vf', filters.join(','));
  }

  // Compression / codec
  if (compress) {
    if (compress.outputFormat === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', String(compress.crf), '-b:v', '0');
      args.push('-c:a', 'libopus');
    } else {
      args.push('-c:v', 'libx264', '-crf', String(compress.crf), '-preset', 'fast');
      args.push('-c:a', 'aac', '-b:a', '128k');
    }
  } else if (filters.length === 0) {
    // No video processing — stream copy
    args.push('-c', 'copy');
  } else {
    // Video filter applied without explicit codec
    args.push('-c:a', 'copy');
  }

  args.push('-movflags', '+faststart');
  args.push(outputName);
  return args;
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

  // Cleanup
  await ffmpeg.deleteFile(inputName).catch(() => {});
  await ffmpeg.deleteFile(outputName).catch(() => {});

  const mimeType = outputExt === 'webm' ? 'video/webm' : 'video/mp4';
  // Copy into a plain ArrayBuffer to satisfy Blob's type requirements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any;
  const src: Uint8Array = raw instanceof Uint8Array ? raw : new TextEncoder().encode(String(raw));
  const plainBuffer = new ArrayBuffer(src.byteLength);
  new Uint8Array(plainBuffer).set(src);
  return new Blob([plainBuffer], { type: mimeType });
}
