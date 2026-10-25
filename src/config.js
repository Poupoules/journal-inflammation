// Listes de choix de la fiche quotidienne.
// Les `id` sont enregistrés dans les données : ne jamais les renommer,
// seuls les `label` peuvent changer sans casser l'historique.

export const MOODS = [
  { id: "energique", label: "Énergique" },
  { id: "anxieuse", label: "Anxieuse" },
  { id: "fatiguee", label: "Fatiguée" },
  { id: "neutre", label: "Neutre", exclusive: true },
];

export const SLEEP_QUALITIES = [
  { id: "bien", label: "Bien" },
  { id: "moyen", label: "Moyen", hint: "(réveil, cauchemar ou réveil fatigué)" },
];

export const INTENSITY_LABELS = { douce: "douce", moyenne: "moyenne", elevee: "élevée" };

export const SPORTS = [
  { id: "yoga", label: "Yoga", intensity: "douce" },
  { id: "pilates", label: "Pilates", intensity: "moyenne" },
  { id: "course", label: "Course à pied", intensity: "elevee" },
  { id: "pole", label: "Pole dance", intensity: "elevee" },
];

export const PAIN_SITES = [
  { id: "ras", label: "RAS", exclusive: true },
  { id: "bas-dos", label: "Bas du dos" },
  { id: "sacro-iliaque", label: "Sacro-iliaque" },
  { id: "aine", label: "Aine" },
  { id: "autre", label: "Autre" },
];

// Valeur numérique utilisée par l'analyse (RAS = 0).
export const PAIN_INTENSITIES = [
  { id: "legere", label: "Légère", score: 1 },
  { id: "moyenne", label: "Moyenne", score: 2 },
  { id: "intense", label: "Intense", score: 3 },
];

export const SKIN_SITES = [
  { id: "ras", label: "RAS", exclusive: true },
  { id: "visage", label: "Visage" },
  { id: "yeux", label: "Yeux" },
  { id: "cuir-chevelu", label: "Cuir chevelu" },
  { id: "aisselles", label: "Aisselles" },
  { id: "plis-coudes", label: "Plis des coudes" },
  { id: "nombril", label: "Nombril" },
  { id: "pubis", label: "Pubis" },
  { id: "plis-genoux", label: "Plis des genoux" },
];

export const FOODS = [
  { id: "biscuit", label: "Biscuit" },
  { id: "chocolat-noir", label: "Chocolat noir" },
  { id: "chips", label: "Chips" },
  { id: "charcuterie", label: "Charcuterie" },
  { id: "frites", label: "Frites" },
  { id: "viande-rouge", label: "Viande rouge" },
  { id: "gluten", label: "Gluten" },
  { id: "beurre", label: "Beurre" },
  { id: "skyr", label: "Skyr" },
  { id: "tomate", label: "Tomate" },
  { id: "poivron", label: "Poivron" },
  { id: "aubergine", label: "Aubergine" },
  { id: "pomme-de-terre", label: "Pomme de terre" },
  { id: "riz", label: "Riz" },
  { id: "noix-graines", label: "Noix et graines" },
  { id: "poisson-gras", label: "Poisson gras" },
  { id: "legumes", label: "Légumes" },
  { id: "fruits", label: "Fruits" },
  { id: "legumineuses", label: "Légumineuses" },
  { id: "avoine", label: "Avoine" },
  { id: "oeufs", label: "Œufs" },
  { id: "cafe", label: "Café" },
];

// Préfixe des aliments ajoutés par l'utilisatrice : "perso:Fraises".
export const CUSTOM_FOOD_PREFIX = "perso:";

export const ALCOHOL_TYPES = [
  { id: "biere", label: "Bière" },
  { id: "vin", label: "Vin" },
  { id: "champagne", label: "Champagne" },
];

export const ALCOHOL_GLASSES = [
  { id: "1", label: "1 verre" },
  { id: "2", label: "2 verres" },
  { id: "3+", label: "Plus de 2" },
];

export const YES_NO = [
  { id: true, label: "Oui" },
  { id: false, label: "Non" },
];

// Seuils de l'analyse.
export const ANALYSIS = {
  minDays: 14,
  minGroup: 3, // jours minimum avec ET sans un facteur
  solidGroup: 7, // en dessous : résultat signalé comme fragile
  minPairs: 10, // points minimum pour une corrélation
};

export const BACKUP_REMINDER_DAYS = 7;

export function labelOf(list, id) {
  if (typeof id === "string" && id.startsWith(CUSTOM_FOOD_PREFIX)) return id.slice(CUSTOM_FOOD_PREFIX.length);
  const item = list.find((x) => x.id === id);
  return item ? item.label : String(id);
}
