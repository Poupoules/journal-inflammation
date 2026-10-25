// Petits outils d'affichage. `html` échappe automatiquement toute valeur
// insérée : un texte saisi ne peut jamais casser la page.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escape(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

/** Marque un fragment déjà sûr (produit par `html`) pour l'insérer tel quel. */
export const raw = (s) => new Raw(s);

function value(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(value).join("");
  if (v === false || v === null || v === undefined) return "";
  return escape(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += value(v) + strings[i + 1]; });
  return raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
