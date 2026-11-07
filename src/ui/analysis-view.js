// Écran Analyse : résumé en phrases, calendrier coloré, pistes en « X fois
// sur N », phases d'injection, et ce qui ne peut pas encore être analysé.
import { ANALYSIS } from "../config.js";
import { addDays, diffDays, formatShort, range, today } from "../dates.js";
import { OUTCOMES, WINDOW, analyse } from "../analysis.js";
import { painScore } from "../model.js";
import { html } from "./dom.js";

let selected = "douleur"; // mesure choisie, conservée pendant la session

const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
const times = (g) => `${g.yes} fois sur ${g.n}`;
// « 7 nov. » termine déjà la phrase : pas de second point.
const dot = (s) => (s.endsWith(".") ? s : `${s}.`);
const MAX_LEADS = 5;

/** Niveau de couleur d'un jour pour la mesure : 0 rien, 1-3 intensité, null inconnu. */
function level(e, outcomeId) {
  if (!e) return undefined;
  if (outcomeId === "douleur") return painScore(e);
  const v = OUTCOMES.find((o) => o.id === outcomeId).present(e);
  if (v === null || v === undefined) return null;
  return v ? 3 : 0;
}

function calendar(days, outcomeId) {
  const byDate = new Map(days.map((e) => [e.date, e]));
  const first = days[0].date;
  // Semaines du lundi au dimanche.
  const weekday = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  const start = addDays(first, -weekday);
  const cells = range(start, today()).map((d) => {
    if (d < first) return html`<div class="d out"></div>`;
    const e = byDate.get(d);
    const lvl = level(e, outcomeId);
    const cls = lvl === undefined ? "none" : lvl === null ? "unk" : `l${lvl}`;
    const marks = e ? [e.injection && "💉", e.cortisone && "🧴", e.period && "🩸"].filter(Boolean).join("") : "";
    return html`<a class="d ${cls}" href="#saisie/${d}" title="${formatShort(d)}"><span>${Number(d.slice(8))}</span><small>${marks}</small></a>`;
  });
  const legend = outcomeId === "douleur"
    ? [["l0", "aucune"], ["l1", "légère"], ["l2", "moyenne"], ["l3", "intense"]]
    : [["l0", "non"], ["l3", "oui"]];
  return html`
    <div class="cal-head">${["L", "M", "M", "J", "V", "S", "D"].map((x) => html`<span>${x}</span>`)}</div>
    <div class="cal">${cells}</div>
    <p class="cal-legend">${legend.map(([c, t]) => html`<span><i class="${c}"></i>${t}</span>`)}
      <span><i class="unk"></i>non renseigné</span><span><i class="none"></i>non rempli</span></p>
    <p class="hint">💉 injection · 🧴 crème cortisone · 🩸 règles. Touche un jour pour l'ouvrir.</p>`;
}

function summaryLines(r, lastDate) {
  return r.summary.map((s) => {
    if (!s.known) return html`<li><strong>${s.label}</strong> : pas encore renseigné.</li>`;
    if (!s.yes) return html`<li><strong>${s.label}</strong> : aucun jour sur ${s.known} renseignés.</li>`;
    const calm = diffDays(s.last, lastDate);
    const end = calm >= 3 ? `, plus rien depuis le ${formatShort(s.last)} (${calm} jours)` : `, le dernier le ${formatShort(s.last)}`;
    return html`<li><strong>${s.label}</strong> : ${dot(`${plural(s.yes, "jour")} sur ${s.known} renseignés${end}`)}</li>`;
  });
}

function leadSentence(o, f) {
  const sens = f.diff > 0 ? html`<span class="worse">plus souvent</span>` : html`<span class="better">moins souvent</span>`;
  return html`<div class="factor">
    <div class="factor-head"><strong>${f.label}</strong><span class="grp">${f.group}</span></div>
    <p class="lead">Dans les ${WINDOW} jours après « ${f.label} », tu as eu ${o.noun} <strong>${times(f.with)}</strong>.
      Après les autres jours : ${times(f.without)}. Donc ${sens}.
      ${f.fragile ? html`<span class="fragile">à confirmer</span>` : ""}</p>
  </div>`;
}

function phasesBlock(r) {
  const o = r.outcome;
  if (!r.injections.length) return html`<p class="muted">Aucune injection enregistrée pour l'instant.</p>`;
  const rows = r.phases.filter((p) => p.n).map((p) =>
    html`<div class="factor-line"><span>${p.label}</span><span><strong>${p.yes}</strong> jour${p.yes > 1 ? "s" : ""} sur ${p.n}</span></div>`);
  return html`
    <p>${o.label} selon le nombre de jours écoulés depuis l'injection :</p>
    ${rows.length ? rows : html`<p class="muted">Pas encore de jours renseignés après une injection.</p>`}
    <p class="hint">${r.injections.length < 3
      ? `${plural(r.injections.length, "injection")} enregistrée${r.injections.length > 1 ? "s" : ""} : il en faut 2 ou 3 pour voir si un rythme se répète.`
      : `${r.injections.length} injections enregistrées.`}</p>`;
}

export async function renderAnalysis(view, app) {
  const days = await app.storage.listDays();
  const root = document.createElement("div");
  view.replaceChildren(root);

  function render() {
    if (!days.length) {
      root.innerHTML = html`<div class="card"><h2>Analyse</h2><p class="muted">Aucune journée enregistrée pour l'instant.</p></div>`;
      return;
    }
    const r = analyse(days, selected);
    const o = r.outcome;
    const last = days.at(-1).date;
    const picker = html`<div class="seg" role="group" aria-label="Ce que tu veux comprendre">${OUTCOMES.map((x) =>
      html`<button type="button" data-outcome="${x.id}" aria-pressed="${x.id === selected}">${x.label}</button>`)}</div>`;

    root.innerHTML = html`
      <div class="card stack">
        <h2>En résumé</h2>
        <p>Sur ${plural(r.days, "jour")} remplis, du ${formatShort(days[0].date)} au ${formatShort(last)} :</p>
        <ul>${summaryLines(r, last)}</ul>
      </div>

      <div class="card stack">
        <h2>Ce que tu veux comprendre</h2>
        ${picker}
        ${calendar(days, selected)}
      </div>

      <div class="card">
        <h2>Pistes à surveiller</h2>
        ${!r.enoughDays
          ? html`<p class="muted">Les pistes apparaissent à partir de ${ANALYSIS.minDays} jours remplis (encore ${ANALYSIS.minDays - r.days}).</p>`
          : r.leads.length
            ? html`<p class="muted">Ce qui est suivi ${o.after} nettement plus (ou moins) souvent que d'habitude.</p>${r.leads.slice(0, MAX_LEADS).map((f) => leadSentence(o, f))}${
              r.leads.length > MAX_LEADS ? html`<p class="hint">Et ${r.leads.length - MAX_LEADS} autre(s) dans « Tous les facteurs comparés ».</p>` : ""}`
            : html`<p>Aucune piste nette pour l'instant : rien n'est suivi ${o.after} nettement plus souvent que les autres jours.</p>`}
      </div>

      <div class="card">
        <h2>Injection</h2>
        ${phasesBlock(r)}
      </div>

      ${r.unanalysable.always.length || r.unanalysable.rare.length ? html`<div class="card">
        <h2>Pourquoi certaines choses n'apparaissent pas</h2>
        ${r.unanalysable.always.length ? html`<p><strong>Presque tous les jours</strong>, donc impossible de comparer avec des jours sans :
          ${r.unanalysable.always.join(", ")}.</p>` : ""}
        ${r.unanalysable.rare.length ? html`<p><strong>Trop peu de jours</strong> pour l'instant (il en faut au moins ${ANALYSIS.minGroup}) :
          ${r.unanalysable.rare.join(", ")}.</p>` : ""}
      </div>` : ""}

      ${r.enoughDays && r.factors.length ? html`<div class="card">
        <details><summary>Tous les facteurs comparés (${r.factors.length})</summary>
          ${r.factors.map((f) => leadSentence(o, f))}
        </details>
      </div>` : ""}

      ${r.cycles.length ? html`<div class="card">
        <h2>Cycles</h2>
        ${r.cycles.slice().reverse().map((c) => html`<div class="factor-line">
          <span>Règles du ${formatShort(c.start)}</span>
          <span>${plural(c.length, "jour")}${c.sincePrevious ? ` · cycle de ${c.sincePrevious} jours` : ""}</span></div>`)}
      </div>` : ""}

      <div class="card">
        <h2>À garder en tête</h2>
        <ul class="caveats muted">
          <li>Un facteur qui revient avant ${o.noun} n'en est pas forcément la cause : il peut juste l'accompagner.</li>
          <li>L'effet peut être inversé : on bouge moins quand on a mal.</li>
          <li>Avec beaucoup d'aliments comparés, quelques-uns semblent suspects par pur hasard. « À confirmer » = moins de ${ANALYSIS.solidGroup} jours dans un des deux groupes.</li>
          <li>La crème à la cortisone n'est pas comparée : elle suit les plaques ou fait partie de ta routine.</li>
          <li>Pour confirmer une piste : arrêter l'aliment 2 à 3 semaines, idéalement avec ton médecin.</li>
        </ul>
      </div>`;
  }

  root.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-outcome]");
    if (b) { selected = b.dataset.outcome; render(); }
  });
  render();
}
