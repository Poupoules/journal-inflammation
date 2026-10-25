// Écran Analyse : résultats lisibles, toujours accompagnés de leurs limites.
import { ANALYSIS } from "../config.js";
import { formatShort } from "../dates.js";
import { OUTCOMES, analyse } from "../analysis.js";
import { html } from "./dom.js";

// Écart à partir duquel un résultat est mis en couleur, selon la mesure.
const NOTABLE = { douleur: 0.5, psoriasis: 0.5, crise: 0.15 };
let selected = "douleur"; // mesure choisie, conservée pendant la session

const num = (v, digits = 1) => v.toFixed(digits).replace(".", ",");

function fmt(outcome, v) {
  if (isNaN(v)) return "–";
  return outcome.percent ? `${Math.round(v * 100)} %` : num(v);
}

function fmtDiff(outcome, v) {
  if (isNaN(v)) return "–";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return outcome.percent ? `${sign}${Math.abs(Math.round(v * 100))} pts` : `${sign}${num(Math.abs(v))}`;
}

function cls(outcome, v) {
  if (isNaN(v)) return "";
  return v >= NOTABLE[outcome.id] ? "worse" : v <= -NOTABLE[outcome.id] ? "better" : "";
}

function line(outcome, title, c) {
  if (isNaN(c.diff)) return html`<div class="factor-line"><span>${title}</span><span>pas assez de jours</span></div>`;
  return html`<div class="factor-line">
    <span>${title} : avec ${fmt(outcome, c.with)} / sans ${fmt(outcome, c.without)}
      <span class="muted">(${c.nWith} j / ${c.nWithout} j)</span></span>
    <span><span class="${cls(outcome, c.diff)}">${fmtDiff(outcome, c.diff)}</span>${c.fragile ? html` <span class="fragile">fragile</span>` : ""}</span>
  </div>`;
}

function factorRow(outcome, f) {
  return html`<div class="factor">
    <div class="factor-head"><strong>${f.label}</strong><span class="grp">${f.group}</span></div>
    ${line(outcome, "Le lendemain", f.nextDay)}
    ${line(outcome, "Le jour même", f.sameDay)}
  </div>`;
}

function corrText(c) {
  if (isNaN(c.r)) return `pas assez de points (${c.n}/${ANALYSIS.minPairs})`;
  const a = Math.abs(c.r);
  const force = a < 0.2 ? "aucun lien net" : a < 0.4 ? "lien faible" : a < 0.6 ? "lien modéré" : "lien fort";
  const sens = a < 0.2 ? "" : c.r > 0 ? ", plus il y en a, plus la mesure monte" : ", plus il y en a, plus la mesure baisse";
  return `r = ${num(c.r, 2)} : ${force}${sens} (${c.n} j)`;
}

export async function renderAnalysis(view, app) {
  const days = await app.storage.listDays();
  const root = document.createElement("div");
  view.replaceChildren(root);

  function render() {
    const r = analyse(days, selected);
    const o = r.outcome;
    const picker = html`<div class="seg" role="group" aria-label="Mesure analysée">${OUTCOMES.map((x) =>
      html`<button type="button" data-outcome="${x.id}" aria-pressed="${x.id === selected}">${x.label}</button>`)}</div>`;

    if (!r.enoughDays) {
      const pct = Math.round((r.days / ANALYSIS.minDays) * 100);
      root.innerHTML = html`<div class="card"><h2>Analyse</h2>
        <p><strong>${r.days} jour${r.days > 1 ? "s" : ""} enregistré${r.days > 1 ? "s" : ""}</strong> sur ${ANALYSIS.minDays} minimum.</p>
        <div class="progress" aria-hidden="true"><div style="width:${pct}%"></div></div>
        <p class="muted">L'analyse s'affiche à partir de ${ANALYSIS.minDays} jours. Elle devient vraiment parlante après 6 à 8 semaines de saisie régulière.</p></div>`;
      return;
    }

    const notable = r.factors.filter((f) => !isNaN(f.nextDay.diff) && Math.abs(f.nextDay.diff) >= NOTABLE[o.id]);
    const label = o.id === "douleur" ? "Douleur moyenne" : o.id === "psoriasis" ? "Zones en moyenne" : "Jours de crise";
    root.innerHTML = html`
      <div class="card stack">
        <h2>Analyse</h2>
        ${picker}
        <div class="stats">
          <div><b>${r.days}</b><span>jours</span></div>
          <div><b>${r.flares}</b><span>crises</span></div>
          <div><b>${fmt(o, r.average)}</b><span>${label}${o.id === "douleur" ? " (0 à 3)" : ""}</span></div>
        </div>
      </div>

      <div class="card">
        <h2>Pistes à surveiller</h2>
        <p class="muted">Facteurs suivis d'un écart marqué le lendemain. Rouge : ça va moins bien quand le facteur est présent. Vert : ça va mieux.</p>
        ${notable.length ? notable.map((f) => factorRow(o, f)) : html`<p>Aucun écart marqué pour l'instant.</p>`}
      </div>

      <div class="card">
        <details><summary>Tous les facteurs (${r.factors.length})</summary>
          ${r.factors.map((f) => factorRow(o, f))}
          ${r.skipped ? html`<p class="hint">${r.skipped} facteur${r.skipped > 1 ? "s" : ""} non analysable${r.skipped > 1 ? "s" : ""} :
            il faut au moins ${ANALYSIS.minGroup} jours avec et ${ANALYSIS.minGroup} jours sans.</p>` : ""}
        </details>
      </div>

      <div class="card">
        <h2>Sommeil et injection</h2>
        ${r.correlations.map((c) => html`<div class="factor"><strong>${c.label}</strong>
          <div class="factor-line"><span>Le jour même : ${corrText(c.sameDay)}</span></div>
          <div class="factor-line"><span>Le lendemain : ${corrText(c.nextDay)}</span></div></div>`)}
      </div>

      <div class="card">
        <h2>Cycles</h2>
        ${r.cycles.length ? r.cycles.slice().reverse().map((c) => html`<div class="factor-line">
          <span>Règles du ${formatShort(c.start)}</span>
          <span>${c.length} jour${c.length > 1 ? "s" : ""}${c.sincePrevious ? ` · cycle de ${c.sincePrevious} j` : ""}</span></div>`)
          : html`<p class="muted">Aucun jour de règles enregistré.</p>`}
      </div>

      <div class="card">
        <h2>À garder en tête</h2>
        <ul class="caveats muted">
          <li>Une corrélation n'est pas une cause : un facteur peut accompagner une crise sans la provoquer.</li>
          <li>L'effet peut être inversé : on fait moins de sport quand on a mal.</li>
          <li>Avec beaucoup d'aliments testés, quelques-uns semblent suspects par pur hasard. « Fragile » = moins de ${ANALYSIS.solidGroup} jours dans un groupe.</li>
          <li>Pour confirmer une piste : arrêter l'aliment 2 à 3 semaines, idéalement avec ton médecin.</li>
          <li>Pour une analyse plus fine, exporte le tableur (onglet Sauvegarde) et partage-le avec Claude.</li>
        </ul>
      </div>`;
  }

  root.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-outcome]");
    if (b) { selected = b.dataset.outcome; render(); }
  });
  render();
}
