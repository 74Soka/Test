import type { NextConfig } from "next";

// Application entièrement privée et dynamique (données propres au compte
// connecté) : on garde le modèle de rendu classique, sans Cache Components.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Service worker des notifications : jamais mis en cache, valable pour tout le site
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
