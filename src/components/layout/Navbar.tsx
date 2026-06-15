'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Download, Video, ImageIcon, Zap, Film, Monitor, FileImage, Music, ChevronDown } from 'lucide-react';

const primaryLinks = [
  { href: '/downloader', label: 'YT Download', icon: Download },
  { href: '/video-editor', label: 'Video Editor', icon: Video },
  { href: '/image-editor', label: 'Image Editor', icon: ImageIcon },
];

const moreTools = [
  { href: '/gif-maker', label: 'GIF Maker', icon: Film },
  { href: '/screen-recorder', label: 'Screen Recorder', icon: Monitor },
  { href: '/image-compressor', label: 'Image Compressor', icon: FileImage },
  { href: '/video-to-mp3', label: 'Video to MP3', icon: Music },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border glass">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">
            <span className="text-violet-400">Fahi</span>
            <span className="text-foreground"> Video</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {primaryLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                pathname === href
                  ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}

          {/* More tools dropdown */}
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                moreTools.some((t) => t.href === pathname)
                  ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              <span className="hidden sm:inline">More</span>
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 glass rounded-xl border border-border shadow-xl z-20 py-1 overflow-hidden">
                  {moreTools.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors',
                        pathname === href
                          ? 'text-violet-400 bg-violet-600/10'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {label}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
