import ImageCompressor from '@/components/image-compressor/ImageCompressor';

export const metadata = { title: 'Image Compressor – Fahi' };

export default function Page() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">Image Compressor</h1>
      <ImageCompressor />
    </main>
  );
}
