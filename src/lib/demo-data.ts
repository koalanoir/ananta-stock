import type { StockItem, StockMovement } from "@/lib/types";

export const demoItems: StockItem[] = [
  { id: "huile-1l", name: "Huile végétale 1 L", category: "Épicerie", kind: "commercialise", unit: "bouteille", quantity: 3, threshold: 10, unitCost: 1450 },
  { id: "riz-5kg", name: "Riz parfumé 5 kg", category: "Épicerie", kind: "commercialise", unit: "sac", quantity: 24, threshold: 12, unitCost: 5600 },
  { id: "sacs-kraft", name: "Sacs kraft M", category: "Emballage", kind: "outil", unit: "unité", quantity: 8, threshold: 15, unitCost: 75 },
  { id: "eau-50cl", name: "Eau minérale 50 cl", category: "Boissons", kind: "commercialise", unit: "bouteille", quantity: 12, threshold: 20, unitCost: 250 },
  { id: "nettoyant-sol", name: "Nettoyant sol", category: "Hygiène", kind: "outil", unit: "bidon", quantity: 31, threshold: 8, unitCost: 3200 },
  { id: "jus-mangue", name: "Jus de mangue", category: "Boissons", kind: "commercialise", unit: "bouteille", quantity: 46, threshold: 15, unitCost: 550 },
  { id: "ruban", name: "Ruban adhésif", category: "Emballage", kind: "outil", unit: "rouleau", quantity: 0, threshold: 6, unitCost: 800 },
];

export const demoMovements: StockMovement[] = [
  { id: "m1", itemName: "Riz parfumé 5 kg", type: "sortie", delta: -4, author: "Aïcha", occurredAt: "Aujourd’hui, 15:42" },
  { id: "m2", itemName: "Ruban adhésif", type: "entree", delta: 12, author: "Moussa", occurredAt: "Aujourd’hui, 14:18" },
  { id: "m3", itemName: "Jus de mangue", type: "ajustement", delta: 2, author: "Aïcha", occurredAt: "Aujourd’hui, 11:06", reason: "Comptage physique" },
];
