// Sous-écran « Gérer ma liste » : retirer ou regrouper des aliments.
import { FOODS, labelOf } from "../config.js";
import { foodIdFor, hiddenBaseFoods, mergeInDays, removeFromList, showInList, usage, visibleFoods } from "../foods.js";
import { $, html } from "./dom.js";

const NEW = "__nouveau__";
const days = (n) => `${n} jour${n > 1 ? "s" : ""}`;

export async function renderFoods(view, app) {
  const root = document.createElement("div");
  view.replaceChildren(root);
  let lists = await app.foodLists();
  let counts = usage(await app.storage.listDays());
  let open = null; // aliment dont le regroupement est en cours
  let message = null;

  function render() {
    const foods = visibleFoods(lists);
    const hidden = hiddenBaseFoods(lists);
    root.innerHTML = html`
      <p><a href="#saisie">‹ Retour à la saisie</a></p>
      <div class="card">
        <h2>Ma liste d'aliments</h2>
        <ul class="muted">
          <li><strong>Retirer</strong> : l'aliment n'est plus proposé. Tes journées passées le gardent.</li>
          <li><strong>Regrouper</strong> : l'aliment est remplacé par un autre dans toutes tes journées, puis retiré de la liste.</li>
        </ul>
        ${message ? html`<p class="status ${message.cls}" role="status">${message.text}</p>` : ""}
      </div>
      <div class="card">
        ${foods.map((f) => html`<div class="factor">
          <div class="factor-head" style="align-items:center">
            <span><strong>${f.label}</strong><span class="grp" style="display:block">${days(counts.get(f.id) ?? 0)}</span></span>
            ${open === f.id ? "" : html`<span class="chips" style="flex-wrap:nowrap">
              <button type="button" class="chip" data-act="open" data-id="${f.id}">Regrouper</button>
              <button type="button" class="chip" data-act="remove" data-id="${f.id}">Retirer</button>
            </span>`}
          </div>
          ${open === f.id ? html`<div class="stack" style="margin-top:8px">
              <label class="field">Regrouper « ${f.label} » dans :
                <select data-input="target" style="width:100%;min-height:44px;margin-top:4px">
                  <option value="">Choisir…</option>
                  ${foods.filter((o) => o.id !== f.id).map((o) => html`<option value="${o.id}">${o.label}</option>`)}
                  <option value="${NEW}">Un nouveau nom…</option>
                </select></label>
              <input type="text" data-input="newName" maxlength="40" placeholder="Nouveau nom (ex. : Féculents)" hidden>
              <div class="field-row">
                <button type="button" class="btn" data-act="merge" data-id="${f.id}">Regrouper</button>
                <button type="button" class="btn secondary" data-act="cancel">Annuler</button>
              </div>
            </div>` : ""}
        </div>`)}
      </div>
      ${hidden.length ? html`<div class="card">
        <h2>Aliments retirés</h2>
        ${hidden.map((f) => html`<div class="factor-head factor"><span>${f.label}</span>
          <button type="button" class="chip" data-act="restore" data-id="${f.id}">Remettre</button></div>`)}
      </div>` : ""}`;
  }

  async function save(next, text) {
    try {
      lists = await app.saveFoodLists(next);
      message = { cls: "ok", text };
    } catch (err) {
      message = { cls: "err", text: `Échec : ${err.message}` };
    }
    open = null;
    render();
  }

  async function merge(from) {
    const select = $("[data-input=target]", root);
    let to = select.value;
    if (to === NEW) {
      const name = $("[data-input=newName]", root).value;
      if (!name.trim()) return;
      to = foodIdFor(name, lists);
    }
    if (!to || to === from) return;
    const all = await app.storage.listDays();
    const changed = mergeInDays(all, from, to);
    const a = labelOf(FOODS, from), b = labelOf(FOODS, to);
    if (!confirm(`Remplacer « ${a} » par « ${b} » dans ${days(changed.length)}, puis retirer « ${a} » de ta liste ?`)) return;
    try {
      if (changed.length) await app.storage.putDays(changed);
    } catch (err) {
      message = { cls: "err", text: `Échec du regroupement : ${err.message}` };
      render();
      return;
    }
    counts = usage(await app.storage.listDays());
    await save(removeFromList(from, showInList(to, lists)), `« ${a} » regroupé dans « ${b} » ✓ (${days(changed.length)} corrigé${changed.length > 1 ? "s" : ""}).`);
  }

  root.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const { act, id } = b.dataset;
    if (act === "open") { open = id; message = null; render(); }
    else if (act === "cancel") { open = null; render(); }
    else if (act === "merge") merge(id);
    else if (act === "remove") {
      const label = labelOf(FOODS, id);
      if (confirm(`Retirer « ${label} » de ta liste ? Tes journées passées le gardent.`)) {
        save(removeFromList(id, lists), `« ${label} » retiré de ta liste ✓`);
      }
    } else if (act === "restore") save(showInList(id, lists), `« ${labelOf(FOODS, id)} » remis dans ta liste ✓`);
  });

  root.addEventListener("change", (ev) => {
    if (ev.target.dataset.input === "target") $("[data-input=newName]", root).hidden = ev.target.value !== NEW;
  });

  render();
}
