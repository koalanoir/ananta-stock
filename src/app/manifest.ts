import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ananta Stock",
    short_name: "Ananta",
    description: "La gestion de stock simple pour les commerces.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f3eb",
    theme_color: "#23372e",
    lang: "fr",
  };
}
