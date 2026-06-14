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
} from 'lucide-react';
import { cn, blobToDownload, sanitizeFilename } from '@/lib/utils';

interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  blur: number;
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
};

const FILTER_PRESETS = [
  { name: 'None', adjustments: DEFAULT_ADJUSTMENTS },
  { name: 'Vivid', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 110, contrast: 120, saturation: 130 } },
  { name: 'Grayscale', adjustments: { ...DEFAULT_ADJUSTMENTS, grayscale: 100, saturation: 0 } },
  { name: 'Sepia', adjustments: { ...DEFAULT_ADJUSTMENTS, sepia: 80, saturation: 60 } },
  { name: 'Vintage', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 95, contrast: 90, saturation: 70, sepia: 30 } },
  { name: 'Cool', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 102, contrast: 105, saturation: 90 } },
];

type ActivePanel = 'resize' | 'filters' | 'text' | null;

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

  const canvasRef = useRef<HTMLCanvasElement>(null);

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

      // Overlay text
      if (overlayText) {
        ctx.save();
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const x = (textX / 100) * canvas.width;
        const y = (textY / 100) * canvas.height;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(overlayText, x, y);
        ctx.restore();
      }
    };
    img.src = imageSrc;
  }, [imageSrc, rotation, flipH, flipV, adjustments, resizeWidth, resizeHeight, overlayText, fontSize, textColor, textX, textY]);

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
                <button
                  onClick={() => { setImageSrc(null); setFileName(''); }}
                  className="text-xs text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
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
                  {/* Sliders */}
                  {(
                    [
                      { key: 'brightness', label: 'Brightness', min: 0, max: 200 },
                      { key: 'contrast', label: 'Contrast', min: 0, max: 200 },
                      { key: 'saturation', label: 'Saturation', min: 0, max: 200 },
                      { key: 'grayscale', label: 'Grayscale', min: 0, max: 100 },
                      { key: 'sepia', label: 'Sepia', min: 0, max: 100 },
                      { key: 'blur', label: 'Blur', min: 0, max: 10 },
                    ] as Array<{ key: keyof Adjustments; label: string; min: number; max: number }>
                  ).map(({ key, label, min, max }) => (
                    <div key={key}>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{label}</span>
                        <span>{adjustments[key]}{key === 'blur' ? 'px' : '%'}</span>
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
      `}</style>
    </div>
  );
}
