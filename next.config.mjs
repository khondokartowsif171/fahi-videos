/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    // @imgly/background-removal bundles onnxruntime-node (a Node.js native module)
    // which contains ESM .mjs files that Terser can't minify in CJS mode.
    // Alias it to false (empty stub) for browser builds — the browser uses
    // onnxruntime-web (WASM) instead, so this is safe.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'onnxruntime-node': false,
        sharp$: false,
      };
    }

    // Tell webpack to treat .mjs files in these packages as JS modules (not assets)
    // so they go through the normal JS pipeline instead of being emitted raw.
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules\/(onnxruntime-web|onnxruntime-node|@imgly)/,
      type: 'javascript/auto',
    });

    return config;
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
    ],
  },
};

export default nextConfig;
