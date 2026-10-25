// Démarrage de l'app : stockage, navigation entre écrans, bandeaux, mises à jour.
import { BACKUP_REMINDER_DAYS } from "../config.js";
import { diffDays, today } from "../dates.js";
import { openStorage } from "../storage/storage.js";
import { $, $$, html } from "./dom.js";
import { renderEntry } from "./entry.js";
import { renderHistory } from "./history.js";
import { renderAnalysis } from "./analysis-view.js";
import { renderBackup } from "./backup-view.js";

const VIEWS = { saisie: renderEntry, historique: renderHistory, analyse: renderAnalysis, sauvegarde: renderBackup };
const LEAVE_MSG = "Des modifications de cette journée ne sont pas enregistrées. Quitter quand même ?";

const app = {
  storage: null,
  dirty: false, // vrai quand la saisie en cours n'est pas enregistrée
  updateReady: null, // fonction pour activer une nouvelle version
  async customFoods() {
    return (await this.storage.getMeta("customFoods")) ?? [];
  },
  go(hash) {
    location.hash = hash;
  },
  refreshBanners,
};

let currentHash = null;

function parseHash() {
  const [tab, arg] = location.hash.replace(/^#/, "").split("/");
  return VIEWS[tab] ? { tab, arg } : { tab: "saisie", arg: undefined };
}

async function route() {
  if (app.dirty && location.hash !== currentHash) {
    if (!confirm(LEAVE_MSG)) {
      history.replaceState(null, "", currentHash);
      return;
    }
    app.dirty = false;
  }
  currentHash = location.hash || "#saisie";
  const { tab, arg } = parseHash();
  for (const a of $$("#tabs a")) {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const view = $("#view");
  try {
    await VIEWS[tab](view, app, arg);
  } catch (err) {
    console.error(err);
    view.innerHTML = html`<div class="card"><h2>Un problème est survenu</h2><p>${err.message}</p>
      <button class="btn secondary" onclick="location.reload()">Recharger</button></div>`;
  }
  window.scrollTo(0, 0);
  refreshBanners();
}

async function refreshBanners() {
  const out = [];
  if (app.updateReady) {
    out.push(html`<div class="banner"><span>Une nouvelle version de l'app est prête.</span><button data-act="update">Mettre à jour</button></div>`);
  }
  try {
    const days = await app.storage.listDays();
    if (days.length) {
      const last = await app.storage.getMeta("lastBackupAt");
      const since = diffDays((last ?? days[0].date).slice(0, 10), today());
      if (since >= BACKUP_REMINDER_DAYS && parseHash().tab !== "sauvegarde") {
        const msg = last ? `Dernière sauvegarde il y a ${since} jours.` : "Tu n'as encore jamais sauvegardé ton journal.";
        out.push(html`<div class="banner"><span>${msg}</span><a href="#sauvegarde">Sauvegarder</a></div>`);
      }
    }
  } catch { /* le bandeau est un confort : ne jamais bloquer l'app */ }
  const box = $("#banners");
  box.innerHTML = out.join("");
  const btn = $("[data-act=update]", box);
  if (btn) btn.onclick = () => app.updateReady();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    const offer = (worker) => {
      app.updateReady = () => {
        if (app.dirty && !confirm(LEAVE_MSG)) return;
        app.dirty = false;
        worker.postMessage("skipWaiting");
      };
      refreshBanners();
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) offer(w);
      });
    });
  }).catch((err) => console.warn("Service worker non enregistré", err));
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloading) { reloading = true; location.reload(); }
  });
}

async function start() {
  try {
    app.storage = await openStorage();
  } catch (err) {
    $("#view").innerHTML = html`<div class="card"><h2>Stockage indisponible</h2>
      <p>${err.message}</p><p class="muted">Vérifie que tu n'es pas en navigation privée.</p></div>`;
    return;
  }
  app.storage.persistence({ request: true }).catch(() => {});
  window.addEventListener("hashchange", route);
  window.addEventListener("beforeunload", (e) => { if (app.dirty) e.preventDefault(); });
  registerServiceWorker();
  await route();
}

start();
