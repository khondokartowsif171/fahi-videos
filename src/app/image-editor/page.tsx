import ImageEditor from '@/components/image-editor/ImageEditor';
import { ImageIcon } from 'lucide-react';

export const metadata = {
  title: 'Image Editor — Fahi Video',
  description: 'Resize, crop, rotate, filter and add text to images. Free, instant, no uploads.',
};

export default function ImageEditorPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-xl mb-4">
          <ImageIcon className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Image Editor</h1>
        <p className="text-muted-foreground">
          Resize, rotate, apply filters, and add text — export in PNG, JPG, or WebP.
        </p>
      </div>
      <ImageEditor />
    </div>
  );
}
