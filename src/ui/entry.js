// Écran de saisie d'une journée (aujourd'hui ou un jour passé).
import {
  ALCOHOL_GLASSES, ALCOHOL_TYPES, CUSTOM_FOOD_PREFIX, FOODS, INTENSITY_LABELS, MOODS, PAIN_INTENSITIES,
  PAIN_SITES, SKIN_SITES, SLEEP_QUALITIES, SPORTS, YES_NO,
} from "../config.js";
import { addDays, diffDays, formatLong, formatShort, isISODate, today } from "../dates.js";
import { emptyEntry, sleepHours, toggleChoice } from "../model.js";
import { $, html } from "./dom.js";

// Champs à choix multiples : où lire/écrire dans la fiche, et quelles options.
const MULTI = {
  moods: { get: (d) => d.moods, set: (d, v) => { d.moods = v; }, options: MOODS },
  sports: { get: (d) => d.sports, set: (d, v) => { d.sports = v; }, options: SPORTS },
  painSites: {
    get: (d) => d.pain.sites,
    set: (d, v) => {
      d.pain.sites = v;
      if (!v.includes("autre")) d.pain.other = "";
      if (!v.length || v.includes("ras")) d.pain.intensity = null;
    },
    options: PAIN_SITES,
  },
  skin: { get: (d) => d.skin, set: (d, v) => { d.skin = v; }, options: SKIN_SITES },
  foods: { get: (d) => d.foods, set: (d, v) => { d.foods = v; }, options: FOODS },
  alcoholTypes: {
    get: (d) => d.alcohol.types,
    set: (d, v) => { d.alcohol.types = v; if (!v.length) d.alcohol.glasses = null; },
    options: ALCOHOL_TYPES,
  },
};

// Champs à choix unique : un second appui sur le choix actif l'efface.
const SINGLE = {
  quality: { get: (d) => d.sleep.quality, set: (d, v) => { d.sleep.quality = v; } },
  painIntensity: { get: (d) => d.pain.intensity, set: (d, v) => { d.pain.intensity = v; } },
  glasses: { get: (d) => d.alcohol.glasses, set: (d, v) => { d.alcohol.glasses = v; } },
  flare: { get: (d) => d.flare, set: (d, v) => { d.flare = v; } },
  cortisone: { get: (d) => d.cortisone, set: (d, v) => { d.cortisone = v; } },
  injection: { get: (d) => d.injection, set: (d, v) => { d.injection = v; } },
};

const clone = (o) => structuredClone(o);
const parseId = (s) => (s === "true" ? true : s === "false" ? false : s);

function multi(field, options, selected, hint) {
  return html`<div class="chips" role="group">${options.map((o) => html`<button type="button" class="chip"
    data-act="toggle" data-field="${field}" data-id="${o.id}" aria-pressed="${selected.includes(o.id)}">${o.label}${
    hint ? html` <small>${hint(o)}</small>` : ""}</button>`)}</div>`;
}

function single(field, options, value) {
  return html`<div class="chips" role="group">${options.map((o) => html`<button type="button" class="chip"
    data-act="pick" data-field="${field}" data-id="${String(o.id)}" aria-pressed="${value === o.id}">${o.label}${
    o.hint ? html` <small>${o.hint}</small>` : ""}</button>`)}</div>`;
}

export async function renderEntry(view, app, arg) {
  const max = today();
  const date = isISODate(arg) && arg <= max ? arg : max;
  const all = await app.storage.listDays();
  let stored = all.find((e) => e.date === date) ?? null;
  let draft = clone(stored ?? emptyEntry(date));
  const yesterday = all.find((e) => e.date === addDays(date, -1));
  const lastInjectionBefore = all.filter((e) => e.injection === true && e.date < date).map((e) => e.date).pop() ?? null;
  let customFoods = await app.customFoods();
  let status = stored ? { cls: "", text: "Journée déjà enregistrée : tu peux la modifier." } : { cls: "", text: "Nouvelle journée." };
  app.dirty = false;

  const root = document.createElement("div");
  view.replaceChildren(root);

  const markDirty = () => {
    app.dirty = true;
    status = { cls: "dirty", text: "Modifications non enregistrées." };
  };

  function injectionInfo() {
    if (draft.injection === true) return "Injection aujourd'hui.";
    if (!lastInjectionBefore) return "Aucune injection enregistrée avant ce jour.";
    const n = diffDays(lastInjectionBefore, date);
    return `Dernière injection il y a ${n} jour${n > 1 ? "s" : ""} (${formatShort(lastInjectionBefore)}).`;
  }

  function render() {
    const d = draft;
    const hours = sleepHours(d.sleep);
    const painActive = d.pain.sites.length && !d.pain.sites.includes("ras");
    const foodOptions = [
      ...FOODS,
      ...[...new Set([...customFoods, ...d.foods.filter((f) => f.startsWith(CUSTOM_FOOD_PREFIX))])]
        .map((id) => ({ id, label: id.slice(CUSTOM_FOOD_PREFIX.length) })),
    ];
    root.innerHTML = html`
      <div class="datebar">
        <button type="button" class="icon-btn" data-act="prev" aria-label="Jour précédent">‹</button>
        <label class="sr-only" for="date">Date</label>
        <input type="date" id="date" value="${date}" max="${max}">
        <button type="button" class="icon-btn" data-act="next" aria-label="Jour suivant" ${date >= max ? "disabled" : ""}>›</button>
      </div>
      <p class="datelabel">${formatLong(date)}${date === max ? " · aujourd'hui" : html` · <button type="button" class="link-btn" data-act="today">revenir à aujourd'hui</button>`}</p>

      <section class="card" aria-labelledby="h-sleep">
        <h2 id="h-sleep">Sommeil</h2>
        <div class="field-row">
          <label class="field">Coucher<input type="time" data-input="bed" value="${d.sleep.bed ?? ""}"></label>
          <label class="field">Réveil<input type="time" data-input="wake" value="${d.sleep.wake ?? ""}"></label>
        </div>
        <p class="hint">${hours === null ? "Durée calculée automatiquement." : `Durée : ${Math.floor(hours)} h ${String(Math.round((hours % 1) * 60)).padStart(2, "0")}`}
          ${yesterday?.sleep.bed && yesterday?.sleep.wake ? html` · <button type="button" class="link-btn" data-act="copy-sleep">comme la veille (${yesterday.sleep.bed} → ${yesterday.sleep.wake})</button>` : ""}</p>
        <h3>Qualité</h3>
        ${single("quality", SLEEP_QUALITIES, d.sleep.quality)}
      </section>

      <section class="card" aria-labelledby="h-mood">
        <h2 id="h-mood">Humeur</h2>
        ${multi("moods", MOODS, d.moods)}
      </section>

      <section class="card" aria-labelledby="h-sport">
        <h2 id="h-sport">Sport</h2>
        ${multi("sports", SPORTS, d.sports, (o) => INTENSITY_LABELS[o.intensity])}
      </section>

      <section class="card" aria-labelledby="h-pain">
        <h2 id="h-pain">Douleurs</h2>
        ${multi("painSites", PAIN_SITES, d.pain.sites)}
        ${d.pain.sites.includes("autre") ? html`<label class="field" style="margin-top:10px">Autre endroit
          <input type="text" data-input="painOther" maxlength="200" value="${d.pain.other}" placeholder="Ex. : genou droit"></label>` : ""}
        ${painActive ? html`<h3>Intensité</h3>${single("painIntensity", PAIN_INTENSITIES, d.pain.intensity)}` : ""}
      </section>

      <section class="card" aria-labelledby="h-skin">
        <h2 id="h-skin">Psoriasis</h2>
        ${multi("skin", SKIN_SITES, d.skin)}
        <p class="hint">RAS = pas de plaque ce jour-là.</p>
      </section>

      <section class="card" aria-labelledby="h-flare">
        <h2 id="h-flare">Journée de crise</h2>
        ${single("flare", YES_NO, d.flare)}
      </section>

      <section class="card" aria-labelledby="h-treat">
        <h2 id="h-treat">Traitement</h2>
        <h3>Cortisone</h3>
        ${single("cortisone", YES_NO, d.cortisone)}
        <h3>Injection</h3>
        ${single("injection", YES_NO, d.injection)}
        <p class="hint">${injectionInfo()}</p>
      </section>

      <section class="card" aria-labelledby="h-food">
        <h2 id="h-food">Alimentation</h2>
        ${multi("foods", foodOptions, d.foods)}
        <div class="field-row" style="margin-top:10px">
          <label class="field">Ajouter un aliment à ta liste
            <input type="text" data-input="newFood" maxlength="40" placeholder="Ex. : fraises"></label>
          <button type="button" class="btn secondary" data-act="add-food">Ajouter</button>
        </div>
      </section>

      <section class="card" aria-labelledby="h-alcohol">
        <h2 id="h-alcohol">Alcool</h2>
        ${multi("alcoholTypes", ALCOHOL_TYPES, d.alcohol.types)}
        ${d.alcohol.types.length ? html`<h3>Nombre de verres</h3>${single("glasses", ALCOHOL_GLASSES, d.alcohol.glasses)}` : ""}
      </section>

      <section class="card">
        <label class="switch"><strong>J'ai mes règles aujourd'hui</strong>
          <input type="checkbox" data-input="period" ${d.period ? "checked" : ""}></label>
      </section>

      <section class="card" aria-labelledby="h-notes">
        <h2 id="h-notes">Notes</h2>
        <textarea data-input="notes" rows="2" maxlength="2000" aria-labelledby="h-notes"
          placeholder="Facultatif : rhume, voyage, anti-inflammatoire…">${d.notes}</textarea>
      </section>

      <div class="savebar"><div>
        <button type="button" class="btn block" data-act="save">Enregistrer cette journée</button>
        <p class="status ${status.cls}" role="status">${status.text}</p>
      </div></div>`;
  }

  function setStatus(cls, text) {
    status = { cls, text };
    const el = $(".status", root);
    el.className = `status ${cls}`;
    el.textContent = text;
  }

  async function save(btn) {
    btn.disabled = true;
    setStatus("", "Enregistrement…");
    try {
      stored = await app.storage.putDay(draft);
      draft = clone(stored);
      app.dirty = false;
      const t = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      status = { cls: "ok", text: `Enregistré et vérifié ✓ (${t})` };
      render();
      app.refreshBanners();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      setStatus("err", `Échec de l'enregistrement : ${err.message} Ta saisie est toujours à l'écran, réessaie.`);
    }
  }

  async function addFood() {
    const input = $("[data-input=newFood]", root);
    const name = input.value.trim().replace(/\s+/g, " ");
    if (!name) return;
    const known = FOODS.find((f) => f.label.toLowerCase() === name.toLowerCase());
    const id = known ? known.id : CUSTOM_FOOD_PREFIX + name.charAt(0).toUpperCase() + name.slice(1);
    if (!known && !customFoods.some((f) => f.toLowerCase() === id.toLowerCase())) {
      customFoods = [...customFoods, id];
      try {
        await app.storage.setMeta("customFoods", customFoods);
      } catch (err) {
        setStatus("err", `Impossible d'ajouter l'aliment : ${err.message}`);
        return;
      }
    }
    const existing = customFoods.find((f) => f.toLowerCase() === id.toLowerCase()) ?? id;
    if (!draft.foods.includes(existing)) { draft.foods = [...draft.foods, existing]; markDirty(); }
    render();
  }

  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const { act, field, id } = btn.dataset;
    if (act === "toggle") {
      const m = MULTI[field];
      m.set(draft, toggleChoice(m.get(draft), id, m.options));
      markDirty();
      render();
    } else if (act === "pick") {
      const s = SINGLE[field];
      const v = parseId(id);
      s.set(draft, s.get(draft) === v ? null : v);
      markDirty();
      render();
    } else if (act === "copy-sleep") {
      draft.sleep.bed = yesterday.sleep.bed;
      draft.sleep.wake = yesterday.sleep.wake;
      markDirty();
      render();
    } else if (act === "prev") app.go(`#saisie/${addDays(date, -1)}`);
    else if (act === "next") app.go(`#saisie/${addDays(date, 1)}`);
    else if (act === "today") app.go(`#saisie/${max}`);
    else if (act === "add-food") addFood();
    else if (act === "save") save(btn);
  });

  root.addEventListener("input", (ev) => {
    const key = ev.target.dataset.input;
    if (key === "painOther") draft.pain.other = ev.target.value;
    else if (key === "notes") draft.notes = ev.target.value;
    else return;
    if (!app.dirty) { markDirty(); setStatus(status.cls, status.text); }
  });

  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.id === "date") {
      if (isISODate(t.value) && t.value <= max) app.go(`#saisie/${t.value}`);
      else t.value = date;
      return;
    }
    const key = t.dataset.input;
    if (key === "bed" || key === "wake") {
      draft.sleep[key] = t.value || null;
      markDirty();
      render();
    } else if (key === "period") {
      draft.period = t.checked;
      markDirty();
      setStatus(status.cls, status.text);
    }
  });

  root.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.dataset.input === "newFood") { ev.preventDefault(); addFood(); }
  });

  render();
}
