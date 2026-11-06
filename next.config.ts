import type { NextConfig } from "next";

// Application entièrement privée et dynamique (données propres au compte
// connecté) : on garde le modèle de rendu classique, sans Cache Components.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
