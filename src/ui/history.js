// Historique : tous les jours depuis la première saisie, y compris les oublis.
import { PAIN_INTENSITIES, labelOf } from "../config.js";
import { formatShort, range, today } from "../dates.js";
import { daysSinceInjection } from "../analysis.js";
import { skinScore } from "../model.js";
import { html } from "./dom.js";

function tags(e, sinceInjection) {
  const t = [];
  if (e.flare) t.push(html`<span class="tag flare">crise</span>`);
  if (e.pain.sites.includes("ras")) t.push(html`<span class="tag">pas de douleur</span>`);
  else if (e.pain.intensity) t.push(html`<span class="tag">douleur ${labelOf(PAIN_INTENSITIES, e.pain.intensity).toLowerCase()}</span>`);
  const zones = skinScore(e);
  if (zones === 0) t.push(html`<span class="tag">pas de plaque</span>`);
  else if (zones) t.push(html`<span class="tag">psoriasis ${zones} zone${zones > 1 ? "s" : ""}</span>`);
  if (e.period) t.push(html`<span class="tag">règles</span>`);
  if (e.injection) t.push(html`<span class="tag">injection</span>`);
  else if (sinceInjection !== undefined) t.push(html`<span class="tag">injection il y a ${sinceInjection} j</span>`);
  return t.length ? t : [html`<span>rempli</span>`];
}

export async function renderHistory(view, app) {
  const days = await app.storage.listDays();
  const root = document.createElement("div");
  view.replaceChildren(root);
  if (!days.length) {
    root.innerHTML = html`<div class="card"><h2>Historique</h2>
      <p class="muted">Aucune journée enregistrée pour l'instant.</p>
      <a class="btn" href="#saisie">Remplir aujourd'hui</a></div>`;
    return;
  }
  const byDate = new Map(days.map((e) => [e.date, e]));
  const since = daysSinceInjection(days);
  const dates = range(days[0].date, today()).reverse();
  const missing = dates.filter((d) => !byDate.has(d)).length;
  root.innerHTML = html`
    <div class="card">
      <h2>Historique</h2>
      <p class="muted">${days.length} jour${days.length > 1 ? "s" : ""} rempli${days.length > 1 ? "s" : ""}${
        missing ? `, ${missing} oublié${missing > 1 ? "s" : ""}` : ""}. Touche un jour pour l'ouvrir ou le compléter.</p>
    </div>
    <div class="card">
      ${dates.map((d) => {
        const e = byDate.get(d);
        return e
          ? html`<a class="day-row" href="#saisie/${d}"><span class="d">${formatShort(d)}</span><span class="tags">${tags(e, since.get(d))}</span></a>`
          : html`<a class="day-row missing" href="#saisie/${d}"><span class="d">${formatShort(d)}</span><span class="tags">non rempli · compléter</span></a>`;
      })}
    </div>`;
}
