import type { StockItem, StockMovement } from "@/lib/types";

export const demoItems: StockItem[] = [
  { id: "huile-1l", name: "Huile végétale Mayor 1 L", brand: "Mayor", category: "Épicerie", kind: "commercialise", unit: "bouteille", quantity: 3, threshold: 10, unitCost: 1450 },
  { id: "riz-5kg", name: "Riz parfumé Royal Umbrella 5 kg", brand: "Royal Umbrella", category: "Épicerie", kind: "commercialise", unit: "sac", quantity: 24, threshold: 12, unitCost: 5600 },
  { id: "sacs-kraft", name: "Sacs kraft EcoPack taille M", brand: "EcoPack", category: "Emballage", kind: "outil", unit: "unité", quantity: 8, threshold: 15, unitCost: 75 },
  { id: "eau-50cl", name: "Eau minérale Cristal 50 cl", brand: "Cristal", category: "Boissons", kind: "commercialise", unit: "bouteille", quantity: 12, threshold: 20, unitCost: 250 },
  { id: "nettoyant-sol", name: "Nettoyant sol Madar 1 L", brand: "Madar", category: "Hygiène", kind: "outil", unit: "bidon", quantity: 31, threshold: 8, unitCost: 3200 },
  { id: "jus-mangue", name: "Jus de mangue Top 33 cl", brand: "Top", category: "Boissons", kind: "commercialise", unit: "bouteille", quantity: 46, threshold: 15, unitCost: 550 },
  { id: "ruban", name: "Ruban adhésif Scotch 48 mm", brand: "Scotch", category: "Emballage", kind: "outil", unit: "rouleau", quantity: 0, threshold: 6, unitCost: 800 },
];

export const demoMovements: StockMovement[] = [
  { id: "m1", itemName: "Riz parfumé 5 kg", type: "sortie", delta: -4, author: "Aïcha", occurredAt: "Aujourd’hui, 15:42" },
  { id: "m2", itemName: "Ruban adhésif", type: "entree", delta: 12, author: "Moussa", occurredAt: "Aujourd’hui, 14:18" },
  { id: "m3", itemName: "Jus de mangue", type: "ajustement", delta: 2, author: "Aïcha", occurredAt: "Aujourd’hui, 11:06", reason: "Comptage physique" },
];
