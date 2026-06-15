import GifMaker from '@/components/gif-maker/GifMaker';

export const metadata = { title: 'GIF Maker – Fahi' };

export default function Page() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">GIF Maker</h1>
      <GifMaker />
    </main>
  );
}
