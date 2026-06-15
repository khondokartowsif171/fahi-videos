'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Download,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Sliders,
  Type,
  Trash2,
  ImageIcon,
  ChevronDown,
  ChevronUp,
  Crop,
  Eraser,
  Frame,
} from 'lucide-react';
import { cn, blobToDownload, sanitizeFilename } from '@/lib/utils';

interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  blur: number;
  sharpen: number;
  vignette: number;
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
  sharpen: 0,
  vignette: 0,
};

const FILTER_PRESETS = [
  { name: 'None', adjustments: DEFAULT_ADJUSTMENTS },
  { name: 'Vivid', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 110, contrast: 120, saturation: 130 } },
  { name: 'Grayscale', adjustments: { ...DEFAULT_ADJUSTMENTS, grayscale: 100, saturation: 0 } },
  { name: 'Sepia', adjustments: { ...DEFAULT_ADJUSTMENTS, sepia: 80, saturation: 60 } },
  { name: 'Vintage', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 95, contrast: 90, saturation: 70, sepia: 30 } },
  { name: 'Cool', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 102, contrast: 105, saturation: 90 } },
];

type ActivePanel = 'resize' | 'filters' | 'text' | 'crop' | 'bgremove' | 'border' | null;

const MAX_HISTORY = 20;

export default function ImageEditor() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [origWidth, setOrigWidth] = useState(0);
  const [origHeight, setOrigHeight] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [textInput, setTextInput] = useState('');
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState('#ffffff');
  const [textX, setTextX] = useState(50);
  const [textY, setTextY] = useState(50);
  const [overlayText, setOverlayText] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png');

  // Crop state
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(0);
  const [cropH, setCropH] = useState(0);

  // Background removal state
  const [bgRemoving, setBgRemoving] = useState(false);
  const [bgStatus, setBgStatus] = useState('');

  // Border state
  const [borderThickness, setBorderThickness] = useState(10);
  const [borderColor, setBorderColor] = useState('#ffffff');

  // Undo/Redo state
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Flag to suppress history push during undo/redo restores
  const skipHistoryRef = useRef(false);

  // Push current canvas data URL into history
  const pushHistory = useCallback((dataUrl: string) => {
    if (skipHistoryRef.current) return;
    setHistory((prev) => {
      const base = prev.slice(0, historyIndex + 1);
      const next = [...base, dataUrl].slice(-MAX_HISTORY);
      return next;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      setImageSrc(src);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setOverlayText(null);
      setHistory([src]);
      setHistoryIndex(0);
    };
    reader.readAsDataURL(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
  });

  const buildFilterString = (adj: Adjustments) =>
    `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) grayscale(${adj.grayscale}%) sepia(${adj.sepia}%) blur(${adj.blur}px)`;

  // Apply sharpen convolution to canvas pixel data
  const applySharpen = (ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) => {
    if (amount <= 0) return;
    const v = amount;
    const kernel = [0, -v, 0, -v, 4 * v + 1, -v, 0, -v, 0];
    const imageData = ctx.getImageData(0, 0, w, h);
    const src = new Uint8ClampedArray(imageData.data);
    const dst = imageData.data;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          let val = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const ki = (ky + 1) * 3 + (kx + 1);
              const si = ((y + ky) * w + (x + kx)) * 4 + c;
              val += src[si] * kernel[ki];
            }
          }
          dst[idx + c] = Math.min(255, Math.max(0, val));
        }
        dst[idx + 3] = src[idx + 3];
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };

  // Apply vignette radial gradient overlay
  const applyVignette = (ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) => {
    if (amount <= 0) return;
    const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    gradient.addColorStop(0, `rgba(0,0,0,0)`);
    gradient.addColorStop(1, `rgba(0,0,0,${amount})`);
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  // Render canvas whenever state changes
  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      setOrigWidth(img.naturalWidth);
      setOrigHeight(img.naturalHeight);

      const w = resizeWidth || img.naturalWidth;
      const h = resizeHeight || img.naturalHeight;
      const isRotated90 = rotation % 180 !== 0;
      canvas.width = isRotated90 ? h : w;
      canvas.height = isRotated90 ? w : h;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.filter = buildFilterString(adjustments);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();

      // Sharpen (pixel-level, applied after CSS filter pass)
      if (adjustments.sharpen > 0) {
        // Reset filter before pixel ops
        ctx.filter = 'none';
        applySharpen(ctx, canvas.width, canvas.height, adjustments.sharpen);
      }

      // Vignette overlay
      if (adjustments.vignette > 0) {
        applyVignette(ctx, canvas.width, canvas.height, adjustments.vignette);
      }

      // Overlay text
      if (overlayText) {
        ctx.save();
        ctx.filter = 'none';
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tx = (textX / 100) * canvas.width;
        const ty = (textY / 100) * canvas.height;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(overlayText, tx, ty);
        ctx.restore();
      }
    };
    img.src = imageSrc;
  }, [imageSrc, rotation, flipH, flipV, adjustments, resizeWidth, resizeHeight, overlayText, fontSize, textColor, textX, textY]);

  // Initialize crop dimensions when the panel opens or image changes
  useEffect(() => {
    if (activePanel === 'crop' && origWidth > 0) {
      setCropX(0);
      setCropY(0);
      setCropW(origWidth);
      setCropH(origHeight);
    }
  }, [activePanel, origWidth, origHeight]);

  const handleWidthChange = (v: number) => {
    setResizeWidth(v);
    if (lockAspect && origWidth && origHeight) {
      setResizeHeight(Math.round((v / origWidth) * origHeight));
    }
  };

  const handleHeightChange = (v: number) => {
    setResizeHeight(v);
    if (lockAspect && origWidth && origHeight) {
      setResizeWidth(Math.round((v / origHeight) * origWidth));
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const mime = exportFormat === 'jpeg' ? 'image/jpeg' : exportFormat === 'webp' ? 'image/webp' : 'image/png';
    const quality = exportFormat === 'jpeg' ? 0.92 : undefined;
    canvasRef.current.toBlob(
      (blob) => {
        if (!blob) return;
        const base = sanitizeFilename(fileName.replace(/\.[^.]+$/, ''));
        blobToDownload(blob, `${base}_edited.${exportFormat}`);
      },
      mime,
      quality
    );
  };

  const togglePanel = (panel: ActivePanel) => setActivePanel(activePanel === panel ? null : panel);

  const adj = (key: keyof Adjustments, val: number) =>
    setAdjustments((prev) => ({ ...prev, [key]: val }));

  // --- Crop ---
  const handleApplyCrop = () => {
    if (!imageSrc) return;
    const x = Math.max(0, cropX);
    const y = Math.max(0, cropY);
    const w = Math.max(1, cropW);
    const h = Math.max(1, cropH);

    const img = new Image();
    img.onload = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      const dataUrl = offscreen.toDataURL('image/png');
      // Updating imageSrc triggers a re-render; record in history
      setImageSrc(dataUrl);
      setResizeWidth(0);
      setResizeHeight(0);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      // Push cropped result to history after a tick (state updates settle)
      setTimeout(() => pushHistory(dataUrl), 50);
    };
    img.src = imageSrc;
  };

  // --- Background Removal ---
  const handleRemoveBackground = async () => {
    if (!imageSrc) return;
    setBgRemoving(true);
    setBgStatus('Downloading AI model on first use (~40MB)...');
    try {
      // Convert dataURL to Blob
      const res = await fetch(imageSrc);
      const blob = await res.blob();

      setBgStatus('Removing background... (this may take 5-15 seconds)');
      const { removeBackground } = await import('@imgly/background-removal');
      const resultBlob = await removeBackground(blob);

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImageSrc(dataUrl);
        setTimeout(() => pushHistory(dataUrl), 50);
        setBgRemoving(false);
        setBgStatus('');
      };
      reader.readAsDataURL(resultBlob);
    } catch (err) {
      console.error('Background removal failed:', err);
      setBgStatus('Error removing background. Please try again.');
      setBgRemoving(false);
    }
  };

  // --- Border ---
  const handleApplyBorder = () => {
    if (!canvasRef.current) return;
    const src = canvasRef.current;
    const bw = src.width + borderThickness * 2;
    const bh = src.height + borderThickness * 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = bw;
    offscreen.height = bh;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = borderColor;
    ctx.fillRect(0, 0, bw, bh);
    ctx.drawImage(src, borderThickness, borderThickness);
    const dataUrl = offscreen.toDataURL('image/png');
    setImageSrc(dataUrl);
    setResizeWidth(0);
    setResizeHeight(0);
    setTimeout(() => pushHistory(dataUrl), 50);
  };

  // --- Undo / Redo ---
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = () => {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    const dataUrl = history[newIndex];
    skipHistoryRef.current = true;
    setHistoryIndex(newIndex);
    setImageSrc(dataUrl);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setResizeWidth(0);
    setResizeHeight(0);
    setTimeout(() => { skipHistoryRef.current = false; }, 100);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    const dataUrl = history[newIndex];
    skipHistoryRef.current = true;
    setHistoryIndex(newIndex);
    setImageSrc(dataUrl);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setResizeWidth(0);
    setResizeHeight(0);
    setTimeout(() => { skipHistoryRef.current = false; }, 100);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {!imageSrc ? (
        <div
          {...getRootProps()}
          className={cn(
            'glass rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all',
            isDragActive
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-border hover:border-cyan-500/50 hover:bg-white/3'
          )}
        >
          <input {...getInputProps()} />
          <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium mb-1">
            {isDragActive ? 'Drop your image here' : 'Drag & drop an image'}
          </p>
          <p className="text-sm text-muted-foreground">or click to browse · PNG, JPG, WebP, GIF</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground truncate">{fileName}</span>
                <div className="flex items-center gap-2">
                  {/* Undo / Redo */}
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title="Undo"
                    className={cn(
                      'undo-redo-btn',
                      !canUndo && 'opacity-30 cursor-not-allowed'
                    )}
                  >
                    ↩ Undo
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    title="Redo"
                    className={cn(
                      'undo-redo-btn',
                      !canRedo && 'opacity-30 cursor-not-allowed'
                    )}
                  >
                    ↪ Redo
                  </button>
                  <button
                    onClick={() => {
                      setImageSrc(null);
                      setFileName('');
                      setHistory([]);
                      setHistoryIndex(-1);
                    }}
                    className="text-xs text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden bg-[repeating-conic-gradient(#374151_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
                <canvas
                  ref={canvasRef}
                  className="w-full h-auto max-h-[500px] object-contain"
                  style={{ display: 'block' }}
                />
              </div>
              {origWidth > 0 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {resizeWidth || origWidth} × {resizeHeight || origHeight}px
                </p>
              )}
            </div>

            {/* Quick transform tools */}
            <div className="glass rounded-xl p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Transform
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setRotation((r) => r - 90)} className="tool-btn">
                  <RotateCcw className="w-4 h-4" /> Rotate L
                </button>
                <button onClick={() => setRotation((r) => r + 90)} className="tool-btn">
                  <RotateCw className="w-4 h-4" /> Rotate R
                </button>
                <button
                  onClick={() => setFlipH((f) => !f)}
                  className={cn('tool-btn', flipH && 'border-cyan-500/60 text-cyan-400')}
                >
                  <FlipHorizontal className="w-4 h-4" /> Flip H
                </button>
                <button
                  onClick={() => setFlipV((f) => !f)}
                  className={cn('tool-btn', flipV && 'border-cyan-500/60 text-cyan-400')}
                >
                  <FlipVertical className="w-4 h-4" /> Flip V
                </button>
                <button
                  onClick={() => {
                    setRotation(0);
                    setFlipH(false);
                    setFlipV(false);
                    setAdjustments(DEFAULT_ADJUSTMENTS);
                    setResizeWidth(0);
                    setResizeHeight(0);
                    setOverlayText(null);
                  }}
                  className="tool-btn text-red-400 border-red-500/20"
                >
                  Reset All
                </button>
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-3">
            {/* Resize */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => togglePanel('resize')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <Maximize2 className="w-4 h-4 text-cyan-400" />
                <span className="flex-1 text-sm font-medium text-left">Resize</span>
                {activePanel === 'resize' ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {activePanel === 'resize' && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lockAspect}
                      onChange={(e) => setLockAspect(e.target.checked)}
                      className="accent-cyan-500"
                    />
                    Lock aspect ratio
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Width</label>
                      <input
                        type="number"
                        value={resizeWidth || origWidth}
                        onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Height</label>
                      <input
                        type="number"
                        value={resizeHeight || origHeight}
                        onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Original: {origWidth}×{origHeight}px</p>
                </div>
              )}
            </div>

            {/* Crop */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => togglePanel('crop')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <Crop className="w-4 h-4 text-cyan-400" />
                <span className="flex-1 text-sm font-medium text-left">Crop</span>
                {activePanel === 'crop' ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {activePanel === 'crop' && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">Enter pixel coordinates for the crop region.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">X (px)</label>
                      <input
                        type="number"
                        value={cropX}
                        min={0}
                        onChange={(e) => setCropX(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Y (px)</label>
                      <input
                        type="number"
                        value={cropY}
                        min={0}
                        onChange={(e) => setCropY(parseInt(e.target.value) || 0)}
                        className="w-full bg-white/5 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Width (px)</label>
                      <input
                        type="number"
                        value={cropW}
                        min={1}
                        onChange={(e) => setCropW(parseInt(e.target.value) || 1)}
                        className="w-full bg-white/5 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Height (px)</label>
                      <input
                        type="number"
                        value={cropH}
                        min={1}
                        onChange={(e) => setCropH(parseInt(e.target.value) || 1)}
                        className="w-full bg-white/5 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleApplyCrop}
                    className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg font-medium transition-colors"
                  >
                    Apply Crop
                  </button>
                </div>
              )}
            </div>

            {/* Filters & Adjustments */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => togglePanel('filters')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span className="flex-1 text-sm font-medium text-left">Filters & Adjustments</span>
                {activePanel === 'filters' ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {activePanel === 'filters' && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-4">
                  {/* Presets */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Presets</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {FILTER_PRESETS.map((p) => (
                        <button
                          key={p.name}
                          onClick={() => setAdjustments(p.adjustments)}
                          className="py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:border-cyan-500/50 hover:text-foreground transition-all"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* CSS Filter Sliders */}
                  {(
                    [
                      { key: 'brightness', label: 'Brightness', min: 0, max: 200, unit: '%' },
                      { key: 'contrast', label: 'Contrast', min: 0, max: 200, unit: '%' },
                      { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
                      { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, unit: '%' },
                      { key: 'sepia', label: 'Sepia', min: 0, max: 100, unit: '%' },
                      { key: 'blur', label: 'Blur', min: 0, max: 10, unit: 'px' },
                    ] as Array<{ key: keyof Adjustments; label: string; min: number; max: number; unit: string }>
                  ).map(({ key, label, min, max, unit }) => (
                    <div key={key}>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{label}</span>
                        <span>{adjustments[key]}{unit}</span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={adjustments[key]}
                        onChange={(e) => adj(key, parseInt(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                  ))}
                  {/* Sharpen */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Sharpen</span>
                      <span>{adjustments.sharpen}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={0.5}
                      value={adjustments.sharpen}
                      onChange={(e) => adj('sharpen', parseFloat(e.target.value))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                  {/* Vignette */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Vignette</span>
                      <span>{adjustments.vignette.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={adjustments.vignette}
                      onChange={(e) => adj('vignette', parseFloat(e.target.value))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Add Text */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => togglePanel('text')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <Type className="w-4 h-4 text-cyan-400" />
                <span className="flex-1 text-sm font-medium text-left">Add Text</span>
                {activePanel === 'text' ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {activePanel === 'text' && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                  <input
                    type="text"
                    placeholder="Enter text..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/50"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Size (px)</label>
                      <input
                        type="number"
                        value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value) || 48)}
                        className="w-full bg-white/5 border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Color</label>
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-full h-9 bg-white/5 border border-border rounded-lg px-1 cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">X Position %</label>
                      <input
                        type="range" min={0} max={100} value={textX}
                        onChange={(e) => setTextX(parseInt(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Y Position %</label>
                      <input
                        type="range" min={0} max={100} value={textY}
                        onChange={(e) => setTextY(parseInt(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOverlayText(textInput || null)}
                      className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      Apply Text
                    </button>
                    {overlayText && (
                      <button
                        onClick={() => setOverlayText(null)}
                        className="py-2 px-3 border border-border text-muted-foreground text-sm rounded-lg hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Border / Frame */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => togglePanel('border')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <Frame className="w-4 h-4 text-cyan-400" />
                <span className="flex-1 text-sm font-medium text-left">Border / Frame</span>
                {activePanel === 'border' ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {activePanel === 'border' && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Thickness</span>
                      <span>{borderThickness}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={borderThickness}
                      onChange={(e) => setBorderThickness(parseInt(e.target.value))}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Border Color</label>
                    <input
                      type="color"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="w-full h-9 bg-white/5 border border-border rounded-lg px-1 cursor-pointer"
                    />
                  </div>
                  <button
                    onClick={handleApplyBorder}
                    className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg font-medium transition-colors"
                  >
                    Apply Border
                  </button>
                </div>
              )}
            </div>

            {/* Background Removal */}
            <div className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => togglePanel('bgremove')}
                className="w-full flex items-center gap-3 p-4 hover:bg-white/3 transition-colors"
              >
                <Eraser className="w-4 h-4 text-cyan-400" />
                <span className="flex-1 text-sm font-medium text-left">Remove Background</span>
                {activePanel === 'bgremove' ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {activePanel === 'bgremove' && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    AI-powered background removal. Runs locally in the browser. First use downloads a ~40MB model.
                  </p>
                  {bgRemoving ? (
                    <div className="flex flex-col items-center gap-3 py-2">
                      {/* Spinner */}
                      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-cyan-400 text-center leading-relaxed">{bgStatus}</p>
                    </div>
                  ) : (
                    <button
                      onClick={handleRemoveBackground}
                      className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      Remove Background
                    </button>
                  )}
                  {!bgRemoving && bgStatus && (
                    <p className="text-xs text-red-400 text-center">{bgStatus}</p>
                  )}
                </div>
              )}
            </div>

            {/* Download */}
            <div className="glass rounded-xl p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Export</p>
              <div className="flex gap-2">
                {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      exportFormat === fmt
                        ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400'
                        : 'border-border text-muted-foreground hover:border-white/20'
                    )}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                onClick={handleDownload}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
              >
                <Download className="w-4 h-4" />
                Download Image
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .tool-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.03);
          color: var(--muted-foreground);
          font-size: 0.75rem;
          font-weight: 500;
          transition: all 0.15s;
          cursor: pointer;
        }
        .tool-btn:hover {
          border-color: rgba(255,255,255,0.2);
          color: var(--foreground);
        }
        .undo-redo-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          border-radius: 0.375rem;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.04);
          color: var(--muted-foreground);
          font-size: 0.7rem;
          font-weight: 500;
          transition: all 0.15s;
          cursor: pointer;
        }
        .undo-redo-btn:not(:disabled):hover {
          border-color: rgba(255,255,255,0.2);
          color: var(--foreground);
        }
      `}</style>
    </div>
  );
}
