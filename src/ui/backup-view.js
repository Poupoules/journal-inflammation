// Écran Sauvegarde : sauvegarder (partage du téléphone), restaurer, état du stockage.
import { APP_VERSION } from "../version.js";
import { formatLong, today } from "../dates.js";
import { backupFileName, buildBackup, parseBackup, planRestore, toCSV } from "../backup.js";
import { html } from "./dom.js";

const PERSISTENCE_TEXT = {
  persistant: "Protégées : le téléphone ne les effacera pas pour libérer de la place.",
  "non-persistant": "Non protégées : le téléphone pourrait les effacer s'il manque de place. Installe l'app sur l'écran d'accueil, puis rouvre cet écran.",
  inconnu: "Protection inconnue sur ce navigateur.",
};

function download(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Envoie les fichiers via le menu de partage ; sinon les télécharge. Renvoie false si annulé. */
async function shareOrDownload(files) {
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: "Sauvegarde du journal" });
      return true;
    } catch (err) {
      if (err.name === "AbortError") return false;
      // Partage refusé par le navigateur : on télécharge à la place.
    }
  }
  files.forEach(download);
  return true;
}

export async function renderBackup(view, app) {
  const root = document.createElement("div");
  view.replaceChildren(root);
  let pending = null; // restauration en attente de confirmation
  let message = null;

  async function render() {
    const days = await app.storage.listDays();
    const last = await app.storage.getMeta("lastBackupAt");
    const persistence = await app.storage.persistence();
    root.innerHTML = html`
      <div class="card stack">
        <h2>Sauvegarder</h2>
        <p class="muted">Crée deux fichiers : une sauvegarde complète (pour restaurer) et un tableur (pour analyser avec Claude).
          Choisis ensuite où les envoyer : Google Drive, mail…</p>
        <p>${days.length} jour${days.length > 1 ? "s" : ""} enregistré${days.length > 1 ? "s" : ""}.
          ${last ? `Dernière sauvegarde : ${formatLong(last.slice(0, 10))}.` : "Aucune sauvegarde pour l'instant."}</p>
        <button type="button" class="btn block" data-act="backup" ${days.length ? "" : "disabled"}>Sauvegarder maintenant</button>
        <p class="hint">Les fichiers ne sont pas protégés par un mot de passe : range-les dans un endroit qui n'est qu'à toi.</p>
        ${message ? html`<p class="status ${message.cls}" role="status">${message.text}</p>` : ""}
      </div>

      <div class="card stack">
        <h2>Restaurer</h2>
        <p class="muted">Récupère tes données depuis un fichier de sauvegarde (nouveau téléphone, données effacées…).
          Rien n'est modifié avant ta confirmation.</p>
        <label class="btn secondary block" style="display:block;text-align:center">Choisir un fichier de sauvegarde
          <input type="file" accept=".json,application/json" data-act="file" class="sr-only"></label>
        ${pending ? restorePreview(pending) : ""}
      </div>

      <div class="card">
        <h2>Tes données</h2>
        <p>Elles restent uniquement sur ce téléphone, jamais envoyées sur internet.</p>
        <p class="muted">${PERSISTENCE_TEXT[persistence]}</p>
        <p class="hint">Version de l'app : ${APP_VERSION}</p>
      </div>`;
  }

  function restorePreview({ plan, parsed }) {
    const changes = plan.add.length + plan.replace.length;
    return html`<div class="card" style="margin:0">
      <p><strong>Sauvegarde du ${parsed.exportedAt ? formatLong(parsed.exportedAt.slice(0, 10)) : "?"}</strong></p>
      <ul>
        <li>${plan.add.length} jour(s) absent(s) de ce téléphone : ajoutés</li>
        <li>${plan.replace.length} jour(s) plus récent(s) dans la sauvegarde : remplacés</li>
        <li>${plan.keepLocal.length} jour(s) plus récent(s) sur ce téléphone : conservés tels quels</li>
        <li>${plan.identical} jour(s) identique(s)</li>
        ${parsed.rejected ? html`<li class="worse">${parsed.rejected} fiche(s) illisible(s), ignorée(s)</li>` : ""}
      </ul>
      ${changes
        ? html`<div class="field-row"><button type="button" class="btn" data-act="confirm">Restaurer ${changes} jour(s)</button>
            <button type="button" class="btn secondary" data-act="cancel">Annuler</button></div>`
        : html`<p>Rien à restaurer : ce téléphone est déjà à jour.</p><button type="button" class="btn secondary" data-act="cancel">Fermer</button>`}
    </div>`;
  }

  async function backup(btn) {
    btn.disabled = true;
    try {
      const days = await app.storage.listDays();
      const date = today();
      const json = JSON.stringify(buildBackup(days, { customFoods: await app.customFoods() }), null, 1);
      const files = [
        new File([json], backupFileName(date, "json"), { type: "application/json" }),
        new File([toCSV(days)], backupFileName(date, "csv"), { type: "text/csv" }),
      ];
      if (await shareOrDownload(files)) {
        await app.storage.setMeta("lastBackupAt", new Date().toISOString());
        message = { cls: "ok", text: "Sauvegarde créée ✓. Vérifie qu'elle est bien arrivée à destination." };
      } else {
        message = { cls: "dirty", text: "Sauvegarde annulée." };
      }
    } catch (err) {
      console.error(err);
      message = { cls: "err", text: `Échec de la sauvegarde : ${err.message}` };
    }
    await render();
    app.refreshBanners();
  }

  async function readFile(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      pending = { parsed, plan: planRestore(await app.storage.listDays(), parsed.days) };
      message = null;
    } catch (err) {
      pending = null;
      message = { cls: "err", text: err.message };
    }
    await render();
  }

  async function confirmRestore() {
    const { plan, parsed } = pending;
    try {
      // Les fiches gardent leur date de modification d'origine.
      await app.storage.putDays([...plan.add, ...plan.replace]);
      const current = await app.customFoods();
      const merged = [...new Set([...current, ...parsed.customFoods])];
      if (merged.length !== current.length) await app.storage.setMeta("customFoods", merged);
      message = { cls: "ok", text: `Restauration terminée et vérifiée ✓ (${plan.add.length + plan.replace.length} jours).` };
    } catch (err) {
      console.error(err);
      message = { cls: "err", text: `Échec de la restauration : ${err.message}. Tes données actuelles n'ont pas été modifiées.` };
    }
    pending = null;
    await render();
    app.refreshBanners();
  }

  root.addEventListener("click", (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    if (act === "backup") backup(ev.target.closest("button"));
    else if (act === "confirm") confirmRestore();
    else if (act === "cancel") { pending = null; render(); }
  });
  root.addEventListener("change", (ev) => {
    if (ev.target.dataset.act === "file") readFile(ev.target);
  });

  await render();
}
