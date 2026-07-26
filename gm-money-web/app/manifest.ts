import type { MetadataRoute } from "next";

// Powers "Add to Home Screen" -- Crystal adding /lite to her iPhone's home
// screen gets a standalone (no Safari chrome), correctly-icon'd launch
// instead of just a bookmark. iOS reads name/icon mostly from the
// apple-mobile-web-app-* meta tags in layout.tsx rather than this file,
// but Android/Chrome installability relies on this manifest directly, so
// both are wired up.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GM Money",
    short_name: "GM Money",
    description: "Gathering Moss Financial Center",
    start_url: "/lite",
    display: "standalone",
    background_color: "#0c211a",
    theme_color: "#244d3a",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
