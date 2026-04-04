const state = {
  workspaces: [],
  activeWorkspaceId: null,
  view: "dashboard",
  columns: [],
  tasks: [],
  draggingTaskId: null,
  draggingColumnId: null,
  modal: {
    open: false,
    taskId: null,
    mode: "edit", // edit | preview
  },
  search: {
    open: false,
    index: [],
    scope: "all",
    selectedIndex: 0,
    visibleResults: [],
  },
  kanbanFilter: {
    text: "",
    priority: "all",
  },
  taskReview: {
    open: false,
    items: [],
    index: 0,
  },
  columnContext: {
    columnId: null,
  },
  crud: {
    open: false,
    kind: null, // app | resource
    mode: "create", // create | edit
    entityId: null,
    /** Apps or resources from selected import workspace (create modal only). */
    importList: [],
  },
  textModal: {
    open: false,
    resolver: null,
  },
  confirmModal: {
    open: false,
    resolver: null,
  },
  columnEdit: {
    open: false,
    columnId: null,
  },
  launcherContext: {
    open: false,
    appId: null,
    /** "workspace" | "global_tray" */
    scope: "workspace",
    /** "app" | "divider" (tray only) */
    entryType: "app",
  },
  globalTrayApps: [],
  settings: {
    open: false,
    autostartEnabled: false,
    trayEnabled: true,
    hotkeyEnabled: true,
  },
  dashboard: {
    launcherCollapsed: false,
    libraryCollapsed: false,
    appCategoriesCollapsed: {},
    resourceCategoriesCollapsed: {},
    appIconCache: {},
    appIconPending: {},
  },
  workspaceUi: {
    loading: false,
  },
};

function el(id) {
  return document.getElementById(id);
}

/** Legacy FontAwesome-style ids from older defaults; map to Unicode for display and editing. */
const LEGACY_WORKSPACE_ICONS = {
  "fa-folder": "🖿",
  "fa-code": "💻",
  "fa-briefcase": "💼",
  "fa-home": "🏠",
  "fa-star": "⭐",
  "fa-globe": "🌐",
};

/**
 * Resolved icon for tabs and lists (Unicode). Unknown `fa-*` falls back to 🖿.
 */
function resolveWorkspaceIcon(icon) {
  const raw = String(icon ?? "").trim();
  if (!raw) return "🖿";
  if (LEGACY_WORKSPACE_ICONS[raw]) return LEGACY_WORKSPACE_ICONS[raw];
  if (raw.startsWith("fa-")) return "🖿";
  return raw;
}

function notify(message, type = "info") {
  const root = el("toastRoot");
  if (!root) return;
  const toast = document.createElement("div");
  const variant =
    type === "error" ? "cc-toast--error" : type === "success" ? "cc-toast--success" : "cc-toast--info";
  toast.className = `cc-toast ${variant}`;
  toast.textContent = message;
  root.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

async function apiCall(method, ...args) {
  if (!window.pywebview || !window.pywebview.api) {
    throw new Error("Python backend is not available (pywebview.api missing)");
  }
  if (typeof window.pywebview.api[method] !== "function") {
    throw new Error(`API method ${method} not available on backend`);
  }
  return window.pywebview.api[method](...args);
}

function injectUserCss(css) {
  const text = css == null ? "" : String(css);
  let node = document.getElementById("cc-user-css");
  if (!node) {
    node = document.createElement("style");
    node.id = "cc-user-css";
    document.head.appendChild(node);
  }
  node.textContent = text;
}

async function applyUserCustomCssFromApi() {
  try {
    const res = await apiCall("get_ui_custom_css");
    if (res && res.ok !== false) {
      injectUserCss(res.css ?? "");
    }
  } catch {
    /* pywebview API may be unavailable during local HTML open */
  }
}

async function copyToClipboard(value) {
  if (!value) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fallback below
  }
  const temp = document.createElement("textarea");
  temp.value = value;
  temp.setAttribute("readonly", "");
  temp.style.position = "absolute";
  temp.style.left = "-9999px";
  document.body.appendChild(temp);
  temp.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(temp);
  return ok;
}

function updateWorkspaceLoadingChrome() {
  const loading = Boolean(state.workspaceUi.loading);
  const indicator = el("workspaceLoadingIndicator");
  if (indicator) {
    indicator.classList.toggle("hidden", !loading);
    indicator.classList.toggle("flex", loading);
  }
  const tabsRoot = el("workspaceTabs");
  if (tabsRoot) {
    tabsRoot.setAttribute("aria-busy", loading ? "true" : "false");
  }
  const newBtn = el("newWorkspaceBtn");
  if (newBtn) {
    newBtn.disabled = loading;
    newBtn.classList.toggle("opacity-50", loading);
    newBtn.classList.toggle("cursor-not-allowed", loading);
    newBtn.classList.toggle("pointer-events-none", loading);
  }
}

function renderWorkspaceTabs() {
  const tabs = el("workspaceTabs");
  tabs.innerHTML = "";
  const loading = Boolean(state.workspaceUi.loading);
  state.workspaces.forEach((workspace) => {
    const button = document.createElement("button");
    button.type = "button";
    const isActive = workspace.id === state.activeWorkspaceId;
    const icon = resolveWorkspaceIcon(workspace.icon);
    const name = String(workspace.name || "").trim() || "Workspace";
    button.className = `${isActive ? "cc-workspace-tab-active" : "cc-workspace-tab-icon"} inline-flex items-center justify-center gap-1.5 ${
      loading ? "opacity-60 cursor-wait" : ""
    }`;
    button.textContent = isActive ? `${icon} ${name}` : icon;
    const hoverTip = isActive ? `${name} (current workspace)` : `Workspace: ${name}`;
    button.title = hoverTip;
    button.setAttribute("aria-label", name);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("tabindex", "-1");
    button.dataset.workspaceId = String(workspace.id);
    if (isActive) {
      button.setAttribute("aria-current", "true");
    }
    button.disabled = loading;
    button.classList.toggle("pointer-events-none", loading);
    button.onclick = async () => {
      await switchWorkspace(workspace.id);
    };
    tabs.appendChild(button);
  });
  const activeBtn = tabs.querySelector('[aria-current="true"]');
  activeBtn?.scrollIntoView({ block: "nearest", inline: "nearest" });
  updateWorkspaceLoadingChrome();
}

function isWorkspaceArrowShortcutBlocked(event) {
  const t = event.target;
  if (!t) return true;
  if (t.closest?.("input, textarea, select, option, [contenteditable=true], [contenteditable='']")) {
    return true;
  }
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) {
    return true;
  }
  if (
    state.search.open ||
    state.modal.open ||
    state.crud.open ||
    state.settings.open ||
    state.textModal.open ||
    state.confirmModal.open ||
    state.columnEdit.open ||
    state.launcherContext.open
  ) {
    return true;
  }
  return false;
}

/**
 * Left/Right arrows switch workspace while the window is usable (no modal, not typing in a field).
 * Wired from the global keydown handler in initUI.
 */
function tryHandleGlobalWorkspaceTabArrows(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (isWorkspaceArrowShortcutBlocked(event)) return false;

  const ids = state.workspaces.map((w) => w.id);
  if (ids.length === 0) return false;

  const activeIdx = ids.findIndex((id) => Number(id) === Number(state.activeWorkspaceId));
  if (activeIdx === -1) return false;

  event.preventDefault();
  const n = ids.length;
  const nextIndex =
    event.key === "ArrowLeft" ? (activeIdx - 1 + n) % n : (activeIdx + 1) % n;
  const nextId = ids[nextIndex];
  if (Number(nextId) === Number(state.activeWorkspaceId)) {
    return true;
  }
  void switchWorkspace(nextId);
  return true;
}

/** role="tablist" / aria-label on the workspace strip (once at init). */
function wireWorkspaceTablistSemantics() {
  const root = el("workspaceTabs");
  if (!root || root.dataset.ccTablistSemantics) return;
  root.dataset.ccTablistSemantics = "1";
  root.setAttribute("role", "tablist");
  root.setAttribute("aria-label", "Workspaces");
}

async function switchWorkspace(workspaceId) {
  if (state.workspaceUi.loading) {
    notify("Workspace is still loading…", "info");
    return false;
  }
  if (Number(workspaceId) === Number(state.activeWorkspaceId)) {
    return true;
  }
  state.workspaceUi.loading = true;
  state.activeWorkspaceId = workspaceId;
  renderWorkspaceTabs();
  try {
    await loadWorkspaceData();
    return true;
  } catch (error) {
    notify(`Workspace switch failed: ${error.message}`, "error");
    return false;
  } finally {
    state.workspaceUi.loading = false;
    renderAll();
  }
}

function groupByCategory(items) {
  return items.reduce((acc, item) => {
    const key = item.category || "Uncategorized";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

/** Insert sourceId before targetId in a copy of ids; returns null if unchanged or invalid. */
function reorderIdList(ids, sourceId, targetId) {
  if (sourceId === targetId) return null;
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return null;
  const next = ids.filter((id) => id !== sourceId);
  const insertAt = next.indexOf(targetId);
  next.splice(insertAt, 0, sourceId);
  return next;
}

const DASHBOARD_CLOCK_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ordinalDayLabel(day) {
  const n = Number(day);
  const j = n % 10;
  const k = n % 100;
  if (k >= 11 && k <= 13) return `${n}th`;
  if (j === 1) return `${n}st`;
  if (j === 2) return `${n}nd`;
  if (j === 3) return `${n}rd`;
  return `${n}th`;
}

function updateDashboardClock() {
  const node = el("dashboardClock");
  if (!node) return;
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const day = ordinalDayLabel(d.getDate());
  const mon = DASHBOARD_CLOCK_MONTHS[d.getMonth()];
  const y = d.getFullYear();
  node.textContent = `${hh}:${mm}:${ss} | ${day} ${mon}, ${y}`;
  node.dateTime = d.toISOString();
}

function startDashboardClock() {
  updateDashboardClock();
  window.setInterval(updateDashboardClock, 1000);
}

function parseISODateParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
}

function normalizeTaskRecurrence(r) {
  const s = String(r || "none").toLowerCase();
  return ["none", "daily", "weekly", "monthly", "annually"].includes(s) ? s : "none";
}

function daysInMonthForTask(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function localTodayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Overdue: non-recurring task with due_date strictly before local calendar today. */
function isTaskOverdue(task) {
  const rec = normalizeTaskRecurrence(task.recurrence);
  if (rec !== "none") return false;
  const raw = String(task.due_date || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  return raw < localTodayISO();
}

function isTaskDueToday(task) {
  const rec = normalizeTaskRecurrence(task.recurrence);
  const parts = parseISODateParts(task.due_date);
  const now = new Date();
  const Y = now.getFullYear();
  const M = now.getMonth();
  const D = now.getDate();

  if (rec === "none") {
    if (!parts) return false;
    return parts.y === Y && parts.mo === M && parts.d === D;
  }
  if (rec === "daily") {
    return true;
  }
  if (rec === "weekly") {
    if (!parts) return false;
    const anchor = new Date(parts.y, parts.mo, parts.d);
    return anchor.getDay() === now.getDay();
  }
  if (rec === "monthly") {
    if (!parts) return false;
    const dim = daysInMonthForTask(Y, M);
    const targetDay = Math.min(parts.d, dim);
    return D === targetDay;
  }
  if (rec === "annually") {
    if (!parts) return false;
    return M === parts.mo && D === parts.d;
  }
  return false;
}

function formatTaskDueCardLine(task) {
  const rec = normalizeTaskRecurrence(task.recurrence);
  const parts = parseISODateParts(task.due_date);

  if (rec === "daily") {
    if (parts) {
      return `${ordinalDayLabel(parts.d)} ${DASHBOARD_CLOCK_MONTHS[parts.mo]}, ${parts.y} · Daily`;
    }
    return "Daily";
  }
  if (!parts) return "";
  const dateStr = `${ordinalDayLabel(parts.d)} ${DASHBOARD_CLOCK_MONTHS[parts.mo]}, ${parts.y}`;
  if (!rec || rec === "none") return dateStr;
  const rw = { weekly: "Weekly", monthly: "Monthly", annually: "Annually" }[rec];
  return rw ? `${dateStr} · ${rw}` : dateStr;
}

/** Lower = higher priority (critical first). */
function taskPrioritySortRank(priority) {
  const p = String(priority || "medium").toLowerCase();
  if (p === "critical") return 0;
  if (p === "high") return 1;
  if (p === "medium") return 2;
  if (p === "low") return 3;
  return 2;
}

/** Order: priority → undated before dated → due date ascending → title. */
function passesKanbanFilter(task) {
  const f = state.kanbanFilter || { text: "", priority: "all" };
  if (f.priority && f.priority !== "all") {
    const p = String(task.priority || "medium").toLowerCase();
    if (p !== String(f.priority).toLowerCase()) return false;
  }
  const q = (f.text || "").trim().toLowerCase();
  if (!q) return true;
  if (String(task.title || "").toLowerCase().includes(q)) return true;
  if (String(task.description_md || "").toLowerCase().includes(q)) return true;
  const labels = parseTaskLabelsForCard(task);
  const lowerLabels = labels.map((x) => String(x).toLowerCase());
  if (lowerLabels.some((lb) => lb.includes(q))) return true;
  const rawLabels = String(task.labels ?? "").toLowerCase();
  if (rawLabels.includes(q)) return true;
  return false;
}

function syncKanbanFilterFromDom() {
  const t = el("kanbanFilterText");
  const p = el("kanbanFilterPriority");
  if (t) state.kanbanFilter.text = String(t.value ?? "");
  if (p) state.kanbanFilter.priority = p.value || "all";
}

function sortTasksForKanbanColumn(tasks) {
  return [...tasks].sort((a, b) => {
    const pr = taskPrioritySortRank(a.priority) - taskPrioritySortRank(b.priority);
    if (pr !== 0) return pr;
    const aHas = parseISODateParts(a.due_date) !== null;
    const bHas = parseISODateParts(b.due_date) !== null;
    if (aHas !== bHas) return aHas ? 1 : -1;
    if (aHas && bHas) {
      const dc = String(a.due_date).localeCompare(String(b.due_date));
      if (dc !== 0) return dc;
    }
    return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** First visible character for a simple “desktop icon” glyph (supports multi-codepoint graphemes). */
function launcherAppGlyph(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const chars = [...s];
  const ch = chars[0] || "?";
  if (/^[a-z]$/i.test(ch)) return ch.toUpperCase();
  return ch;
}

function getAppTileIconHtml(app) {
  const iconType = String(app?.icon_type || "unicode").toLowerCase();
  const iconValue = String(app?.icon_value || "").trim();
  if (iconType === "file" && iconValue) {
    const cached = state.dashboard.appIconCache[iconValue];
    if (cached) {
      return `<img src="${cached}" alt="" class="h-8 w-8 object-contain" />`;
    }
    queueAppIconLoad(iconValue);
  }
  const glyph = iconValue || launcherAppGlyph(app?.name);
  return `<span class="select-none font-normal leading-none text-2xl sm:text-3xl text-slate-50">${escapeHtml(glyph)}</span>`;
}

function queueAppIconLoad(path) {
  const p = String(path || "").trim();
  if (!p) return;
  if (state.dashboard.appIconCache[p]) return;
  if (state.dashboard.appIconPending[p]) return;
  state.dashboard.appIconPending[p] = true;
  apiCall("read_icon_file", p)
    .then((result) => {
      if (result?.ok && result?.data_url) {
        state.dashboard.appIconCache[p] = result.data_url;
      }
    })
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      delete state.dashboard.appIconPending[p];
      renderDashboard(state.lastApps || [], state.lastResources || []);
    });
}

function renderDashboard(apps, resources) {
  el("launcherContent")?.classList.toggle("hidden", state.dashboard.launcherCollapsed);
  el("libraryContent")?.classList.toggle("hidden", state.dashboard.libraryCollapsed);
  el("launcherSectionTitle")?.setAttribute(
    "aria-expanded",
    String(!state.dashboard.launcherCollapsed),
  );
  el("librarySectionTitle")?.setAttribute(
    "aria-expanded",
    String(!state.dashboard.libraryCollapsed),
  );

  const globalTrayRoot = el("globalTrayAppsRow");
  const gTray = state.globalTrayApps || [];
  if (globalTrayRoot) {
    globalTrayRoot.innerHTML =
      gTray.length === 0
        ? `<span class="text-sm cc-muted shrink-0">No universal apps yet. Use + App or + Divider to add entries.</span>`
        : gTray
            .map((app) => {
              const et = app.entry_type || "app";
              if (et === "divider") {
                return `
            <div class="group relative flex w-6 shrink-0 cursor-grab flex-col items-center justify-center pt-0.5 active:cursor-grabbing" data-global-tray-tile="${app.id}" data-global-tray-entry-type="divider" title="${escapeHtml(app.name || "Divider")} — drag to reorder">
              <div class="cc-tray-divider-line" aria-hidden="true"></div>
            </div>`;
              }
              return `
            <div class="group relative flex w-14 shrink-0 cursor-grab flex-col items-center gap-0.5 pt-0.5 active:cursor-grabbing" data-global-tray-tile="${app.id}" data-global-tray-entry-type="app" title="${escapeHtml(app.name)} — drag to reorder">
              <button
                type="button"
                data-launch-global-tray-app="${app.id}"
                class="cc-app-launch-tile cc-app-launch-tile--tray h-10 w-10"
                title="${escapeHtml(app.name)}"
              >
                ${getAppTileIconHtml(app)}
              </button>
              <span class="cc-app-tile-caption line-clamp-2">${escapeHtml(app.name)}</span>
            </div>
          `;
            })
            .join("");
  }

  const appsList = el("appsList");
  const appsByCat = groupByCategory(apps);
  appsList.innerHTML =
    apps.length === 0
      ? "No apps yet."
      : `<div class="flex flex-wrap gap-3">
          ${Object.entries(appsByCat)
            .map(
              ([category, items]) => `
            <div class="cc-launcher-category min-w-0 w-full md:basis-[calc(33.333%-0.75rem)] md:max-w-[calc(33.333%-0.75rem)] rounded border border-slate-800 bg-slate-950/70 p-1.5">
              <button type="button" class="w-full text-left text-xs uppercase tracking-wide text-slate-400 mb-1.5 hover:text-slate-200" data-toggle-app-category="${encodeURIComponent(
                category
              )}" data-app-category-header="1">
                ${state.dashboard.appCategoriesCollapsed[category] ? "▸" : "▾"} ${escapeHtml(category)}
              </button>
              <div class="cc-launcher-grid ${state.dashboard.appCategoriesCollapsed[category] ? "hidden" : ""}">
                ${items
                  .map(
                    (app) => `
                    <div class="group relative flex min-w-0 w-full cursor-grab flex-col items-center gap-1 pt-0.5 active:cursor-grabbing" data-app-tile="${app.id}" data-app-category="${escapeHtml(category)}" title="${escapeHtml(app.name)} — drag to reorder">
                      <button
                        type="button"
                        data-launch-app="${app.id}"
                        class="cc-app-launch-tile sm:h-12 sm:w-12 sm:text-xl"
                        title="${escapeHtml(app.name)}"
                      >
                        ${getAppTileIconHtml(app)}
                      </button>
                      <span class="cc-app-tile-caption line-clamp-2">${escapeHtml(app.name)}</span>
                    </div>
                  `
                  )
                  .join("")}
              </div>
            </div>
          `
            )
            .join("")}
        </div>`;

  const resourcesList = el("resourcesList");
  const resByCat = groupByCategory(resources);
  resourcesList.innerHTML =
    resources.length === 0
      ? "No resources yet."
      : `<div class="flex flex-wrap gap-3">
          ${Object.entries(resByCat)
            .map(
              ([category, items]) => `
            <div class="w-full md:basis-[calc(33.333%-0.75rem)] md:max-w-[calc(33.333%-0.75rem)] rounded border border-slate-800 bg-slate-950/70 p-2">
              <button type="button" class="w-full text-left text-xs uppercase tracking-wide text-slate-400 mb-2 hover:text-slate-200" data-toggle-resource-category="${encodeURIComponent(
                category
              )}" data-resource-category-header="1">
                ${state.dashboard.resourceCategoriesCollapsed[category] ? "▸" : "▾"} ${escapeHtml(category)}
              </button>
              <div class="space-y-1 ${state.dashboard.resourceCategoriesCollapsed[category] ? "hidden" : ""}">
                ${items
                  .map(
                    (res) => `
                    <div class="cc-resource-row" data-resource-row="${res.id}" data-resource-category="${escapeHtml(category)}" title="${escapeHtml(res.name)} — drag to reorder">
                      <button type="button" class="text-left flex-1 min-w-0 hover:text-slate-50" data-open-resource="${res.id}">
                        <div class="truncate">${res.name}</div>
                        ${
                          String(res.description || "").trim()
                            ? `<div class="mt-0.5 text-[11px] cc-muted whitespace-normal break-words [overflow-wrap:anywhere]">${escapeHtml(
                                String(res.description).trim()
                              )}</div>`
                            : ""
                        }
                      </button>
                      <button type="button" class="cc-kanban-col-action" data-edit-resource="${res.id}">Edit</button>
                      <button type="button" class="cc-link-danger" data-delete-resource="${res.id}">Del</button>
                    </div>
                  `
                  )
                  .join("")}
              </div>
            </div>
          `
            )
            .join("")}
        </div>`;
  wireDashboardDragDrop();
}

function wireDashboardDragDrop() {
  const tray = el("globalTrayAppsRow");
  if (tray) {
    tray.querySelectorAll("[data-global-tray-tile]").forEach((tile) => {
      tile.setAttribute("draggable", "true");
      tile.addEventListener("dragstart", (e) => {
        const id = Number(tile.dataset.globalTrayTile);
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ kind: "global-tray", id }),
        );
        e.dataTransfer.effectAllowed = "move";
        tile.classList.add("opacity-50");
      });
      tile.addEventListener("dragend", () => {
        tile.classList.remove("opacity-50");
      });
    });
    if (!tray.dataset.ccDdBound) {
      tray.dataset.ccDdBound = "1";
      tray.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      tray.addEventListener("drop", async (e) => {
        e.preventDefault();
        let payload;
        try {
          payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
        } catch {
          return;
        }
        if (payload.kind !== "global-tray") return;
        const targetTile = e.target.closest("[data-global-tray-tile]");
        if (!targetTile || !tray.contains(targetTile)) return;
        const sourceId = Number(payload.id);
        const targetId = Number(targetTile.dataset.globalTrayTile);
        const ids = (state.globalTrayApps || []).map((a) => a.id);
        const next = reorderIdList(ids, sourceId, targetId);
        if (!next) return;
        try {
          const result = await apiCall("reorder_global_tray_apps", next);
          if (result && result.ok === false) {
            notify(result.error || "Could not reorder universal tray", "error");
            return;
          }
          await loadWorkspaceData();
        } catch (err) {
          notify(err.message || String(err), "error");
        }
      });
    }
  }

  const appsList = el("appsList");
  if (appsList) {
    appsList.querySelectorAll("[data-app-tile]").forEach((tile) => {
      tile.setAttribute("draggable", "true");
      tile.addEventListener("dragstart", (e) => {
        const id = Number(tile.dataset.appTile);
        const category = tile.dataset.appCategory || "Uncategorized";
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ kind: "app", id, category }),
        );
        e.dataTransfer.effectAllowed = "move";
        tile.classList.add("opacity-50");
      });
      tile.addEventListener("dragend", () => {
        tile.classList.remove("opacity-50");
      });
    });
    if (!appsList.dataset.ccDdBound) {
      appsList.dataset.ccDdBound = "1";
      appsList.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      appsList.addEventListener("drop", async (e) => {
        e.preventDefault();
        let payload;
        try {
          payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
        } catch {
          return;
        }
        if (payload.kind !== "app") return;
        const targetTile = e.target.closest("[data-app-tile]");
        if (!targetTile || !appsList.contains(targetTile)) return;
        const targetCat = targetTile.dataset.appCategory || "Uncategorized";
        if (payload.category !== targetCat) return;
        const sourceId = Number(payload.id);
        const targetId = Number(targetTile.dataset.appTile);
        const apps = state.lastApps || [];
        const ids = apps
          .filter((a) => (a.category || "Uncategorized") === targetCat)
          .map((a) => a.id);
        const next = reorderIdList(ids, sourceId, targetId);
        if (!next || !state.activeWorkspaceId) return;
        try {
          const result = await apiCall(
            "reorder_apps_in_category",
            state.activeWorkspaceId,
            targetCat,
            next,
          );
          if (result && result.ok === false) {
            notify(result.error || "Could not reorder apps", "error");
            return;
          }
          await loadWorkspaceData();
        } catch (err) {
          notify(err.message || String(err), "error");
        }
      });
    }
  }

  const resourcesList = el("resourcesList");
  if (resourcesList) {
    resourcesList.querySelectorAll("[data-resource-row]").forEach((row) => {
      row.setAttribute("draggable", "true");
      row.addEventListener("dragstart", (e) => {
        const id = Number(row.dataset.resourceRow);
        const category = row.dataset.resourceCategory || "Uncategorized";
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ kind: "resource", id, category }),
        );
        e.dataTransfer.effectAllowed = "move";
        row.classList.add("opacity-50");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("opacity-50");
      });
    });
    if (!resourcesList.dataset.ccDdBound) {
      resourcesList.dataset.ccDdBound = "1";
      resourcesList.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      resourcesList.addEventListener("drop", async (e) => {
        e.preventDefault();
        let payload;
        try {
          payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
        } catch {
          return;
        }
        if (payload.kind !== "resource") return;
        const targetRow = e.target.closest("[data-resource-row]");
        if (!targetRow || !resourcesList.contains(targetRow)) return;
        const targetCat = targetRow.dataset.resourceCategory || "Uncategorized";
        if (payload.category !== targetCat) return;
        const sourceId = Number(payload.id);
        const targetId = Number(targetRow.dataset.resourceRow);
        const resources = state.lastResources || [];
        const ids = resources
          .filter((r) => (r.category || "Uncategorized") === targetCat)
          .map((r) => r.id);
        const next = reorderIdList(ids, sourceId, targetId);
        if (!next || !state.activeWorkspaceId) return;
        try {
          const result = await apiCall(
            "reorder_resources_in_category",
            state.activeWorkspaceId,
            targetCat,
            next,
          );
          if (result && result.ok === false) {
            notify(result.error || "Could not reorder resources", "error");
            return;
          }
          await loadWorkspaceData();
        } catch (err) {
          notify(err.message || String(err), "error");
        }
      });
    }
  }
}

/**
 * Normalize task.labels for display and filtering. Handles JSON arrays, comma-separated
 * text, and pywebview values that may arrive as arrays, strings, or other types.
 */
function parseTaskLabelsForCard(task) {
  const raw = task?.labels;
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x).trim()).filter(Boolean);
    }
    if (parsed != null && typeof parsed === "object") {
      return Object.values(parsed)
        .map((x) => String(x).trim())
        .filter(Boolean);
    }
    if (typeof parsed === "string" && parsed.trim()) {
      return [parsed.trim()];
    }
  } catch {
    /* not JSON */
  }
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function configureMarkedParser() {
  if (!window.marked || window.marked.__ccConfigured) return;
  try {
    if (typeof window.marked.setOptions === "function") {
      window.marked.setOptions({
        gfm: true,
        headerIds: false,
        mangle: false,
      });
    }
  } catch (_) {
    /* ignore */
  }
  window.marked.__ccConfigured = true;
}

function renderTaskCardMarkdownHtml(md) {
  const raw = String(md || "").trim();
  if (!raw) return "";
  configureMarkedParser();
  if (window.marked) {
    return window.marked.parse(raw);
  }
  return `<p class="whitespace-pre-wrap">${escapeHtml(raw)}</p>`;
}

function buildKanbanTaskCardHtml(task, doneColumnId) {
  const blocked = isTaskBlocked(task, doneColumnId);
  const surfaceClass = blocked ? "cc-task-card-blocked" : "cc-task-card-surface";
  const dueToday = isTaskDueToday(task);
  const overdue = isTaskOverdue(task);
  const duePulseClass = dueToday ? " task-card-due-pulse" : "";
  const overdueClass = overdue && !dueToday ? " task-card-overdue" : "";
  const dueLine = formatTaskDueCardLine(task);
  const dueLineHtml = dueLine
    ? `<div class="text-[11px] leading-snug cc-muted">${escapeHtml(dueLine)}</div>`
    : "";

  const labels = parseTaskLabelsForCard(task);
  const appIds = toIdArray(task.app_ids);
  const resourceIds = toIdArray(task.resource_ids);
  const apps = appIds
    .map((id) => state.lastApps?.find((a) => a.id === id))
    .filter(Boolean);
  const resources = resourceIds
    .map((id) => state.lastResources?.find((r) => r.id === id))
    .filter(Boolean);

  const mdRaw = (task.description_md || "").trim();
  const mdBlock = mdRaw
    ? `<div class="cc-task-md-wrap"><div class="task-card-md">${renderTaskCardMarkdownHtml(
        task.description_md || ""
      )}</div></div>`
    : "";

  const appsBlock =
    apps.length > 0
      ? `<div class="space-y-0.5">
          <div class="text-[10px] font-medium uppercase tracking-wide cc-muted">Apps</div>
          <ul class="list-none space-y-0.5 text-[11px]">
            ${apps
              .map(
                (a) =>
                  `<li class="min-w-0">
              <button type="button" class="task-card-launch-app cc-link-sky" data-task-card-app-id="${a.id}">${escapeHtml(a.name)}</button>
            </li>`
              )
              .join("")}
          </ul>
        </div>`
      : "";

  const resourcesBlock =
    resources.length > 0
      ? `<div class="space-y-0.5">
          <div class="text-[10px] font-medium uppercase tracking-wide cc-muted">Resources</div>
          <ul class="list-none space-y-0.5 text-[11px]">
            ${resources
              .map(
                (r) =>
                  `<li class="min-w-0">
              <button type="button" class="task-card-open-resource cc-link-emerald" data-task-card-resource-id="${r.id}">${escapeHtml(r.name)}</button>
            </li>`
              )
              .join("")}
          </ul>
        </div>`
      : "";

  const blockingIds = getBlockingTaskIds(task);
  let blockingBlock = "";
  if (blockingIds.length) {
    const rows = blockingIds
      .map((bid) => {
        const bt = state.tasks.find((t) => t.id === bid);
        const title = escapeHtml(bt?.title || `Task #${bid}`);
        const resolved = Boolean(bt && doneColumnId && bt.column_id === doneColumnId);
        const cls = resolved
          ? "border-slate-600 text-slate-500 line-through"
          : "border-amber-700/60 text-amber-200 hover:bg-amber-950/40";
        return `<li class="min-w-0">
            <button type="button" class="task-card-blocker-link max-w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] ${cls}" data-blocker-id="${bid}">
              ${resolved ? "✓ " : ""}${title}
            </button>
          </li>`;
      })
      .join("");
    const incomplete = getIncompleteBlockingTasks(task, doneColumnId).length;
    const statusLine =
      incomplete > 0
        ? `<div class="text-[10px] text-amber-300">Blocked (${incomplete} remaining)</div>`
        : `<div class="text-[10px] text-slate-500">Dependencies satisfied</div>`;
    blockingBlock = `<div class="space-y-1 border-t border-slate-700/50 pt-1.5">
        <div class="text-[10px] font-medium uppercase tracking-wide text-slate-500">Blocking</div>
        ${statusLine}
        <ul class="list-none space-y-1">${rows}</ul>
      </div>`;
  }

  const labelsInner =
    labels.length > 0
      ? labels
          .map(
            (lb) =>
              `<span class="cc-priority-badge cc-priority-medium">${escapeHtml(String(lb))}</span>`
          )
          .join("")
      : "";
  const labelsBlock = labelsInner
    ? `<div class="flex flex-wrap gap-1 border-t border-slate-700/50 pt-1.5">${labelsInner}</div>`
    : "";

  return `
    <div
      class="group cc-task-card ${surfaceClass}${duePulseClass}${overdueClass}"
      draggable="true"
      data-task-card="true"
      data-task-id="${task.id}"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="cursor-pointer space-y-1.5" data-open-task="${task.id}">
            <div class="flex flex-wrap items-center gap-2">
              <span class="${priorityBadgeClass(task.priority)}">
                ${(task.priority || "medium").toUpperCase()}
              </span>
              <span class="cc-task-card-title">${escapeHtml(task.title || "")}</span>
            </div>
            ${dueLineHtml}
            ${mdBlock}
          </div>
          ${appsBlock}
          ${resourcesBlock}
        </div>
        <div class="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" data-open-task="${task.id}" class="cc-kanban-col-action">Edit</button>
          <button type="button" data-delete-task="${task.id}" class="cc-link-danger">Delete</button>
        </div>
      </div>
      ${blockingBlock}
      ${labelsBlock ? `<div class="cursor-pointer" data-open-task="${task.id}">${labelsBlock}</div>` : ""}
    </div>
  `;
}

function renderKanban() {
  syncKanbanFilterFromDom();
  const root = el("kanbanColumns");
  root.innerHTML = "";
  const doneColumnId = getDoneColumnId();
  state.columns.forEach((column, index) => {
    const colId = Number(column.id);
    const tasks = sortTasksForKanbanColumn(
      state.tasks.filter(
        (task) => Number(task.column_id) === colId && passesKanbanFilter(task),
      ),
    );
    const col = document.createElement("div");
    col.className = "cc-kanban-column";
    col.dataset.columnId = String(column.id);
    col.dataset.columnCard = "true";
    col.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <button type="button" class="cc-kanban-col-drag" data-drag-column="${column.id}" title="Drag to reorder">⇆</button>
          <h3 class="truncate font-semibold">${column.name}${
            columnIsDoneColumn(column) ? ' <span class="cc-done-label">(done)</span>' : ""
          }</h3>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button type="button" class="cc-kanban-col-action" data-move-column-left="${column.id}" ${
            index === 0 ? "disabled" : ""
          }>⇇</button>
          <button type="button" class="cc-kanban-col-action" data-move-column-right="${column.id}" ${
            index === state.columns.length - 1 ? "disabled" : ""
          }>⇉</button>
          <button type="button" class="cc-kanban-col-action" data-edit-column="${column.id}">Edit</button>
          <button type="button" class="cc-link-danger" data-delete-column="${column.id}">Delete</button>
        </div>
      </div>
      <div class="space-y-2 min-h-12" data-dropzone="true">
        ${
          tasks.length
            ? tasks.map((task) => buildKanbanTaskCardHtml(task, doneColumnId)).join("")
            : `<div class="text-sm cc-muted">No tasks</div>`
        }
      </div>
    `;
    root.appendChild(col);
  });

  root.querySelectorAll(".task-card-blocker-link").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = Number(btn.dataset.blockerId);
      if (id) openTaskModal(id);
    });
  });

  root.querySelectorAll(".task-card-launch-app").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const appId = Number(btn.dataset.taskCardAppId);
      const app = state.lastApps?.find((a) => a.id === appId);
      if (!app) return;
      apiCall("launch_app", app.command_path).catch((error) => {
        console.error(error);
        notify(`Failed to launch app: ${error.message}`, "error");
      });
    });
  });

  root.querySelectorAll(".task-card-open-resource").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const resId = Number(btn.dataset.taskCardResourceId);
      const resource = state.lastResources?.find((r) => r.id === resId);
      if (!resource) return;
      apiCall("open_resource", resource.path, resource.type).catch((error) => {
        console.error(error);
        notify(`Failed to open resource: ${error.message}`, "error");
      });
    });
  });

  root.querySelectorAll("[data-task-card='true']").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      const taskId = Number(card.dataset.taskId);
      state.draggingTaskId = taskId;
      card.classList.add("opacity-70");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(taskId));
      }
    });
    card.addEventListener("dragend", () => {
      state.draggingTaskId = null;
      card.classList.remove("opacity-70");
    });
  });

  root.querySelectorAll("[data-drag-column]").forEach((handle) => {
    handle.setAttribute("draggable", "true");
    handle.addEventListener("dragstart", (event) => {
      const columnId = Number(handle.dataset.dragColumn);
      if (!columnId) return;
      state.draggingColumnId = columnId;
      const card = handle.closest("[data-column-card='true']");
      card?.classList.add("opacity-80");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-commandcentre-column", String(columnId));
      }
    });
    handle.addEventListener("dragend", () => {
      state.draggingColumnId = null;
      root.querySelectorAll("[data-column-card='true']").forEach((node) => {
        node.classList.remove("opacity-80", "ring-1", "ring-cyan-500");
      });
    });
  });

  root.querySelectorAll("[data-column-card='true']").forEach((card) => {
    card.addEventListener("dragover", (event) => {
      if (!state.draggingColumnId) return;
      event.preventDefault();
      card.classList.add("ring-1", "ring-cyan-500");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });
    card.addEventListener("dragleave", () => {
      card.classList.remove("ring-1", "ring-cyan-500");
    });
    card.addEventListener("drop", async (event) => {
      if (!state.draggingColumnId) return;
      event.preventDefault();
      card.classList.remove("ring-1", "ring-cyan-500");
      const targetColumnId = Number(card.dataset.columnId);
      const sourceColumnId =
        Number(event.dataTransfer?.getData("application/x-commandcentre-column")) ||
        Number(state.draggingColumnId);
      if (!targetColumnId || !sourceColumnId || targetColumnId === sourceColumnId) return;

      const sourceIdx = state.columns.findIndex((c) => c.id === sourceColumnId);
      const targetIdx = state.columns.findIndex((c) => c.id === targetColumnId);
      if (sourceIdx < 0 || targetIdx < 0) return;

      const reordered = [...state.columns];
      const [moved] = reordered.splice(sourceIdx, 1);
      reordered.splice(targetIdx, 0, moved);
      await persistColumnOrder(reordered);
      await loadWorkspaceData();
      renderKanban();
    });
  });

  root.querySelectorAll("[data-dropzone='true']").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      zone.classList.add("ring-1", "ring-blue-500");
    });
    zone.addEventListener("dragleave", () => {
      zone.classList.remove("ring-1", "ring-blue-500");
    });
    zone.addEventListener("drop", async (event) => {
      event.preventDefault();
      zone.classList.remove("ring-1", "ring-blue-500");

      const columnId = Number(zone.closest("[data-column-id]")?.dataset.columnId);
      const taskIdRaw =
        event.dataTransfer?.getData("text/plain") || String(state.draggingTaskId || "");
      const taskId = Number(taskIdRaw);
      if (!columnId || !taskId) return;
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (columnId === doneColumnId && isTaskBlocked(task, doneColumnId)) {
        const blockers = getIncompleteBlockingTasks(task, doneColumnId);
        const blockerNames = blockers
          .map((item) => (item ? item.title : "Missing task"))
          .filter(Boolean)
          .slice(0, 4)
          .join(", ");
        notify(
          blockerNames
            ? `Cannot move to Done. Remaining blockers: ${blockerNames}${blockers.length > 4 ? "..." : ""}.`
            : "Cannot move to Done. This task is blocked.",
          "info"
        );
        return;
      }

      await apiCall("update_task_column", taskId, columnId);
      await loadWorkspaceData();
      renderKanban();
    });
  });

  root.querySelectorAll("[data-delete-task]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const id = Number(btn.dataset.deleteTask);
      await apiCall("delete_task", id);
      await loadWorkspaceData();
      renderKanban();
    });
  });

  root.querySelectorAll("[data-open-task]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openTaskModal(Number(btn.dataset.openTask));
    });
  });

  root.querySelectorAll("[data-edit-column]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const columnId = Number(btn.dataset.editColumn);
      if (!columnId) return;
      openColumnEditModal(columnId);
    });
  });

  root.querySelectorAll("[data-delete-column]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const columnId = Number(btn.dataset.deleteColumn);
      const column = state.columns.find((c) => c.id === columnId);
      if (!column) return;
      const ok = await openConfirmModal({
        title: "Delete Column",
        message: `Delete column "${column.name}"? Tasks in this column will lose column assignment.`,
      });
      if (!ok) return;
      await apiCall("delete_column", columnId);
      await loadWorkspaceData();
      renderKanban();
    });
  });

  root.querySelectorAll("[data-move-column-left]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const columnId = Number(btn.dataset.moveColumnLeft);
      const idx = state.columns.findIndex((c) => c.id === columnId);
      if (idx <= 0) return;
      const reordered = [...state.columns];
      [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
      await persistColumnOrder(reordered);
      await loadWorkspaceData();
      renderKanban();
    });
  });

  root.querySelectorAll("[data-move-column-right]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const columnId = Number(btn.dataset.moveColumnRight);
      const idx = state.columns.findIndex((c) => c.id === columnId);
      if (idx < 0 || idx >= state.columns.length - 1) return;
      const reordered = [...state.columns];
      [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
      await persistColumnOrder(reordered);
      await loadWorkspaceData();
      renderKanban();
    });
  });
}

async function loadWorkspaceData() {
  const trayFetch = apiCall("get_global_tray_apps");
  if (!state.activeWorkspaceId) {
    state.globalTrayApps = await trayFetch;
    renderDashboard(state.lastApps || [], state.lastResources || []);
    return;
  }
  const [apps, resources, columns, tasks, globalTray] = await Promise.all([
    apiCall("get_apps", state.activeWorkspaceId),
    apiCall("get_resources", state.activeWorkspaceId),
    apiCall("get_kanban_columns", state.activeWorkspaceId),
    apiCall("get_tasks", state.activeWorkspaceId),
    trayFetch,
  ]);
  state.lastApps = apps;
  state.lastResources = resources;
  state.columns = columns;
  state.tasks = tasks;
  state.globalTrayApps = globalTray;
  renderDashboard(apps, resources);
}

async function persistColumnOrder(columns) {
  await Promise.all(
    columns.map((column, index) =>
      apiCall("update_column", column.id, column.name, index)
    )
  );
}

function openCrudModal(kind, mode, entity = null, options = {}) {
  state.crud.open = true;
  state.crud.kind = kind;
  state.crud.mode = mode;
  state.crud.entityId = entity?.id ?? null;

  const isApp = kind === "app" || kind === "global_tray_app";
  if (kind === "global_tray_app") {
    el("crudModalTitle").textContent =
      mode === "create" ? "Add universal tray app" : "Edit universal tray app";
  } else {
    el("crudModalTitle").textContent = `${mode === "create" ? "Add" : "Edit"} ${isApp ? "App" : "Resource"}`;
  }
  el("crudCommandRow").classList.toggle("hidden", !isApp);
  el("crudIconRow").classList.toggle("hidden", !isApp);
  el("crudTypeRow").classList.toggle("hidden", isApp);
  el("crudPathRow").classList.toggle("hidden", isApp);
  el("crudDescriptionRow").classList.toggle("hidden", isApp);

  el("crudName").value = entity?.name ?? "";
  const categoryDefault =
    entity?.category ?? (mode === "create" && options.category != null ? options.category : null) ?? "Uncategorized";
  el("crudCategory").value = categoryDefault;
  el("crudCommand").value = entity?.command_path ?? "";
  const iconType = String(entity?.icon_type || "unicode").toLowerCase();
  el("crudIconTypeUnicode").checked = iconType !== "file";
  el("crudIconTypeFile").checked = iconType === "file";
  el("crudIconUnicode").value = iconType === "file" ? "" : String(entity?.icon_value || "").trim();
  el("crudIconFile").value = iconType === "file" ? String(entity?.icon_value || "").trim() : "";
  el("crudIconUnicodeRow").classList.toggle("hidden", iconType === "file");
  el("crudIconFileRow").classList.toggle("hidden", iconType !== "file");
  el("crudType").value = entity?.type ?? "file";
  el("crudPath").value = entity?.path ?? "";
  el("crudDescription").value = entity?.description ?? "";

  const showImport =
    mode === "create" && (kind === "app" || kind === "resource");
  el("crudImportRow").classList.toggle("hidden", !showImport);
  if (showImport) {
    resetCrudImportUI();
  }

  el("crudModalRoot").classList.remove("hidden");
}

function resetCrudImportUI() {
  state.crud.importList = [];
  const noOther = el("crudImportNoOtherWs");
  const controls = el("crudImportControls");
  const ws = el("crudImportWorkspace");
  const item = el("crudImportItem");
  const apply = el("crudImportApply");
  if (!ws || !item || !apply) return;

  ws.innerHTML = '<option value="">— Select workspace —</option>';
  const others = state.workspaces.filter((w) => w.id !== state.activeWorkspaceId);
  others.forEach((w) => {
    ws.innerHTML += `<option value="${w.id}">${escapeHtml(w.name)}</option>`;
  });
  item.innerHTML = '<option value="">— Select item —</option>';
  item.disabled = true;
  apply.disabled = true;
  ws.value = "";

  if (others.length === 0) {
    noOther?.classList.remove("hidden");
    controls?.classList.add("hidden");
  } else {
    noOther?.classList.add("hidden");
    controls?.classList.remove("hidden");
  }
}

function applyCrudImportFromSelection() {
  const itemId = Number(el("crudImportItem").value);
  if (!itemId) return;
  const list = state.crud.importList || [];
  if (state.crud.kind === "app") {
    const app = list.find((a) => a.id === itemId);
    if (!app) return;
    el("crudName").value = app.name || "";
    el("crudCategory").value = app.category || "Uncategorized";
    el("crudCommand").value = app.command_path || "";
    const iconType = String(app.icon_type || "unicode").toLowerCase();
    el("crudIconTypeUnicode").checked = iconType !== "file";
    el("crudIconTypeFile").checked = iconType === "file";
    el("crudIconUnicode").value = iconType === "file" ? "" : String(app.icon_value || "").trim();
    el("crudIconFile").value = iconType === "file" ? String(app.icon_value || "").trim() : "";
    el("crudIconUnicodeRow").classList.toggle("hidden", iconType === "file");
    el("crudIconFileRow").classList.toggle("hidden", iconType !== "file");
  } else if (state.crud.kind === "resource") {
    const res = list.find((r) => r.id === itemId);
    if (!res) return;
    el("crudName").value = res.name || "";
    el("crudCategory").value = res.category || "Uncategorized";
    el("crudType").value = res.type || "file";
    el("crudPath").value = res.path || "";
    el("crudDescription").value = res.description || "";
  }
  notify("Form filled from selection — review and click Save.", "success");
}

function closeCrudModal() {
  state.crud.open = false;
  state.crud.kind = null;
  state.crud.entityId = null;
  state.crud.importList = [];
  el("crudModalRoot").classList.add("hidden");
}

function openTextModal({ title, label, value = "", inputType = "text" }) {
  state.textModal.open = true;
  el("textModalTitle").textContent = title;
  el("textModalLabel").textContent = label;
  const input = el("textModalInput");
  input.type = inputType;
  input.value = value;
  input.spellcheck = inputType !== "password";
  el("textModalRoot").classList.remove("hidden");
  input.focus();
  if (inputType !== "password") input.select();

  return new Promise((resolve) => {
    state.textModal.resolver = resolve;
  });
}

function closeTextModal(result = null) {
  if (state.textModal.resolver) state.textModal.resolver(result);
  state.textModal.open = false;
  state.textModal.resolver = null;
  el("textModalRoot").classList.add("hidden");
  const input = el("textModalInput");
  input.type = "text";
  input.spellcheck = true;
}

function openConfirmModal({ title = "Confirm", message = "Are you sure?" }) {
  state.confirmModal.open = true;
  el("confirmModalTitle").textContent = title;
  el("confirmModalMessage").textContent = message;
  el("confirmModalRoot").classList.remove("hidden");
  return new Promise((resolve) => {
    state.confirmModal.resolver = resolve;
  });
}

function closeConfirmModal(result = false) {
  if (state.confirmModal.resolver) state.confirmModal.resolver(result);
  state.confirmModal.open = false;
  state.confirmModal.resolver = null;
  el("confirmModalRoot").classList.add("hidden");
}

function openLauncherContextMenu(appId, x, y, scope = "workspace", entryType = "app") {
  state.launcherContext.open = true;
  state.launcherContext.appId = Number(appId);
  state.launcherContext.scope = scope;
  state.launcherContext.entryType = entryType;
  const menu = el("launcherContextMenu");
  if (!menu) return;
  const appActs = el("launcherContextAppActions");
  const divActs = el("launcherContextDividerActions");
  const isDivider = scope === "global_tray" && entryType === "divider";
  if (appActs && divActs) {
    appActs.classList.toggle("hidden", isDivider);
    divActs.classList.toggle("hidden", !isDivider);
  }
  menu.classList.remove("hidden");
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function closeLauncherContextMenu() {
  state.launcherContext.open = false;
  state.launcherContext.appId = null;
  state.launcherContext.scope = "workspace";
  state.launcherContext.entryType = "app";
  const menu = el("launcherContextMenu");
  if (!menu) return;
  menu.classList.add("hidden");
}

function renderWorkspaceSettingsList() {
  const root = el("workspaceSettingsList");
  root.innerHTML = state.workspaces
    .map(
      (workspace) => `
      <div
        class="cc-resource-row px-3 py-2"
        data-workspace-row="${workspace.id}"
        title="Drag to reorder"
      >
        <span class="truncate pr-2 select-none">${escapeHtml(resolveWorkspaceIcon(workspace.icon))} ${escapeHtml(workspace.name)}</span>
        <div class="flex shrink-0 items-center gap-2">
          <button type="button" class="cc-link-sky text-xs" data-edit-workspace-icon="${workspace.id}">Icon</button>
          <button type="button" class="cc-kanban-col-action text-xs" data-rename-workspace="${workspace.id}">Rename</button>
          <button type="button" class="cc-link-danger" data-delete-workspace="${workspace.id}">Delete</button>
        </div>
      </div>
    `
    )
    .join("");
  wireWorkspaceSettingsListDragDrop();
}

function wireWorkspaceSettingsListDragDrop() {
  const root = el("workspaceSettingsList");
  if (!root) return;
  root.querySelectorAll("[data-workspace-row]").forEach((row) => {
    row.setAttribute("draggable", "true");
    row.addEventListener("dragstart", (e) => {
      const id = Number(row.dataset.workspaceRow);
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({ kind: "workspace-settings", id }),
      );
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("opacity-50");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("opacity-50");
    });
  });
  if (!root.dataset.ccWsDdBound) {
    root.dataset.ccWsDdBound = "1";
    root.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    root.addEventListener("drop", async (e) => {
      e.preventDefault();
      let payload;
      try {
        payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
      } catch {
        return;
      }
      if (payload.kind !== "workspace-settings") return;
      const targetRow = e.target.closest("[data-workspace-row]");
      if (!targetRow || !root.contains(targetRow)) return;
      const sourceId = Number(payload.id);
      const targetId = Number(targetRow.dataset.workspaceRow);
      const ids = state.workspaces.map((w) => w.id);
      const next = reorderIdList(ids, sourceId, targetId);
      if (!next) return;
      try {
        const result = await apiCall("reorder_workspaces", next);
        if (result && result.ok === false) {
          notify(result.error || "Could not reorder workspaces", "error");
          return;
        }
        state.workspaces = await apiCall("get_workspaces");
        renderWorkspaceTabs();
        renderWorkspaceSettingsList();
      } catch (err) {
        notify(err.message || String(err), "error");
      }
    });
  }
}

async function openSettingsModal() {
  state.settings.open = true;
  el("settingsModalRoot").classList.remove("hidden");
  renderWorkspaceSettingsList();
  try {
    const result = await apiCall("is_autostart_enabled");
    state.settings.autostartEnabled = Boolean(result?.enabled);
    el("autostartToggle").checked = state.settings.autostartEnabled;
  } catch (error) {
    notify(`Failed to read autostart state: ${error.message}`, "error");
  }
  try {
    const settings = await apiCall("get_integration_settings");
    state.settings.trayEnabled = Boolean(settings?.tray_enabled ?? true);
    state.settings.hotkeyEnabled = Boolean(settings?.hotkey_enabled ?? true);
    el("trayToggle").checked = state.settings.trayEnabled;
    el("hotkeyToggle").checked = state.settings.hotkeyEnabled;
  } catch (error) {
    notify(`Failed to read integration settings: ${error.message}`, "error");
  }
  try {
    const cssRes = await apiCall("get_ui_custom_css");
    const ta = el("settingsCustomCss");
    if (ta) ta.value = cssRes?.css != null ? String(cssRes.css) : "";
  } catch (error) {
    notify(`Failed to load custom CSS: ${error.message}`, "error");
  }
}

function closeSettingsModal() {
  state.settings.open = false;
  el("settingsModalRoot").classList.add("hidden");
}

function renderTaskReviewBody() {
  const items = state.taskReview.items;
  const root = el("taskReviewBody");
  if (!root) return;
  if (!items.length) {
    root.innerHTML = `<p class="cc-muted">No tasks in the review queue.</p>`;
    return;
  }
  const i = Math.min(state.taskReview.index, items.length - 1);
  state.taskReview.index = i;
  const it = items[i];
  const due = it.due_date ? String(it.due_date).trim().slice(0, 10) : "—";
  root.innerHTML = `
    <div class="space-y-2">
      <div class="text-xs uppercase tracking-wide cc-muted">${escapeHtml(it.workspace_name || "")}</div>
      <div class="text-base font-medium text-slate-100">${escapeHtml(it.title || "")}</div>
      <div class="flex flex-wrap gap-2 text-xs cc-muted">
        <span>Due: ${escapeHtml(due)}</span>
        <span>Priority: ${escapeHtml(String(it.priority || "medium"))}</span>
        <span>${i + 1} / ${items.length}</span>
      </div>
    </div>`;
}

async function openTaskReviewModal() {
  state.taskReview.open = true;
  el("taskReviewModalRoot").classList.remove("hidden");
  const body = el("taskReviewBody");
  if (body) body.innerHTML = `<div class="cc-muted">Loading…</div>`;
  try {
    const res = await apiCall("get_task_review_queue");
    if (!res || res.ok === false) throw new Error(res?.error || "Queue failed");
    state.taskReview.items = res.items || [];
    state.taskReview.index = 0;
    renderTaskReviewBody();
  } catch (e) {
    notify(e.message || String(e), "error");
    closeTaskReviewModal();
  }
}

function closeTaskReviewModal() {
  state.taskReview.open = false;
  state.taskReview.items = [];
  state.taskReview.index = 0;
  el("taskReviewModalRoot")?.classList.add("hidden");
}

function stepTaskReview(delta) {
  const n = state.taskReview.items.length;
  if (!n) return;
  state.taskReview.index = (state.taskReview.index + delta + n) % n;
  renderTaskReviewBody();
}

async function taskReviewOpenFullEditor() {
  const items = state.taskReview.items;
  const i = state.taskReview.index;
  const it = items[i];
  if (!it) return;
  closeTaskReviewModal();
  const ok = await switchWorkspace(it.workspace_id);
  if (!ok) return;
  setView("kanban");
  openTaskModal(it.task_id);
}

function closeColumnContextMenu() {
  state.columnContext.columnId = null;
  el("columnContextMenu")?.classList.add("hidden");
}

async function saveCrudModal() {
  const name = el("crudName").value.trim();
  const category = el("crudCategory").value.trim() || "Uncategorized";
  if (!name) {
    notify("Name is required.", "error");
    return;
  }

  if (state.crud.kind === "app") {
    const commandPath = el("crudCommand").value.trim();
    if (!commandPath) {
      notify("Command / path is required.", "error");
      return;
    }
    const iconType = el("crudIconTypeFile").checked ? "file" : "unicode";
    const iconValue =
      iconType === "file" ? el("crudIconFile").value.trim() : el("crudIconUnicode").value.trim();
    if (state.crud.mode === "create") {
      await apiCall("create_app", state.activeWorkspaceId, name, commandPath, category, iconType, iconValue);
    } else {
      await apiCall("update_app", state.crud.entityId, name, commandPath, category, iconType, iconValue);
    }
  } else if (state.crud.kind === "global_tray_app") {
    const commandPath = el("crudCommand").value.trim();
    if (!commandPath) {
      notify("Command / path is required.", "error");
      return;
    }
    const iconType = el("crudIconTypeFile").checked ? "file" : "unicode";
    const iconValue =
      iconType === "file" ? el("crudIconFile").value.trim() : el("crudIconUnicode").value.trim();
    if (state.crud.mode === "create") {
      await apiCall("create_global_tray_app", name, commandPath, category, iconType, iconValue);
    } else {
      await apiCall(
        "update_global_tray_app",
        state.crud.entityId,
        name,
        commandPath,
        category,
        iconType,
        iconValue
      );
    }
  } else if (state.crud.kind === "resource") {
    const type = el("crudType").value;
    const path = el("crudPath").value.trim();
    if (!path) {
      notify("Path / URL is required.", "error");
      return;
    }
    const description = el("crudDescription").value.trim();
    if (state.crud.mode === "create") {
      await apiCall("create_resource", state.activeWorkspaceId, name, path, type, category, description);
    } else {
      await apiCall("update_resource", state.crud.entityId, name, path, type, category, description);
    }
  }

  await loadWorkspaceData();
  closeCrudModal();
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getDoneColumnId() {
  const flagged = state.columns.find((c) => c.is_done === 1 || c.is_done === true);
  if (flagged) return flagged.id;
  const legacy = state.columns.find((c) => c.name?.trim().toLowerCase() === "done");
  return legacy ? legacy.id : null;
}

function columnIsDoneColumn(column) {
  if (!column) return false;
  if (column.is_done === 1 || column.is_done === true) return true;
  return column.name?.trim().toLowerCase() === "done";
}

function openColumnEditModal(columnId) {
  const column = state.columns.find((c) => c.id === columnId);
  if (!column) return;
  state.columnEdit.open = true;
  state.columnEdit.columnId = columnId;
  el("columnEditName").value = column.name || "";
  el("columnEditIsDone").checked = columnIsDoneColumn(column);
  el("columnEditModalRoot").classList.remove("hidden");
  el("columnEditName").focus();
}

function closeColumnEditModal() {
  state.columnEdit.open = false;
  state.columnEdit.columnId = null;
  el("columnEditModalRoot").classList.add("hidden");
}

async function saveColumnEditModal() {
  const columnId = state.columnEdit.columnId;
  if (!columnId) return;
  const column = state.columns.find((c) => c.id === columnId);
  if (!column) return;
  const name = el("columnEditName").value.trim();
  if (!name) {
    notify("Column name is required.", "error");
    return;
  }
  const isDone = Boolean(el("columnEditIsDone").checked);
  try {
    await apiCall("update_column", columnId, name, column.sort_order ?? 0, isDone);
    closeColumnEditModal();
    await loadWorkspaceData();
    renderKanban();
    notify("Column updated.", "success");
  } catch (error) {
    notify(`Failed to update column: ${error.message}`, "error");
  }
}

function getSelectedIds(elementId) {
  const node = el(elementId);
  if (!node) return [];
  if (node.tagName === "SELECT" && node.multiple) {
    return Array.from(node.selectedOptions)
      .map((option) => Number(option.value))
      .filter((id) => Number.isFinite(id));
  }
  return Array.from(node.querySelectorAll('input[type="checkbox"]:checked'))
    .map((input) => Number(input.value))
    .filter((id) => Number.isFinite(id));
}

function toIdArray(value) {
  if (Array.isArray(value)) return value.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  return safeJsonParse(value || "[]", []).map((v) => Number(v)).filter((v) => Number.isFinite(v));
}

function getBlockingTaskIds(task) {
  return toIdArray(task?.blocking_task_ids);
}

function getIncompleteBlockingTasks(task, doneColumnId) {
  const blockingIds = getBlockingTaskIds(task);
  return blockingIds
    .map((id) => state.tasks.find((candidate) => candidate.id === id))
    .filter((blocker) => !blocker || !doneColumnId || blocker.column_id !== doneColumnId);
}

function isTaskBlocked(task, doneColumnId) {
  return getIncompleteBlockingTasks(task, doneColumnId).length > 0;
}

function priorityBadgeClass(priority) {
  const normalized = String(priority || "medium").toLowerCase();
  if (normalized === "critical") return "cc-priority-badge cc-priority-critical";
  if (normalized === "high") return "cc-priority-badge cc-priority-high";
  if (normalized === "low") return "cc-priority-badge cc-priority-low";
  return "cc-priority-badge cc-priority-medium";
}

function populateTaskModalCheckboxGroup(containerId, options, selectedIds, getLabel) {
  const selectedSet = new Set(selectedIds.map((id) => Number(id)));
  const root = el(containerId);
  if (!root) return;
  if (!options.length) {
    root.innerHTML = `<div class="px-1 py-0.5 text-xs text-slate-500">None available.</div>`;
    return;
  }
  root.innerHTML = options
    .map((opt) => {
      const id = Number(opt.id);
      const label = escapeHtml(String(getLabel(opt)));
      const checked = selectedSet.has(id) ? "checked" : "";
      return `<label class="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-800/80">
        <input type="checkbox" value="${id}" class="mt-0.5 shrink-0 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500/40" ${checked} />
        <span class="min-w-0 flex-1 truncate text-xs text-slate-200">${label}</span>
      </label>`;
    })
    .join("");
}

function openModal() {
  state.modal.open = true;
  el("modalRoot").classList.remove("hidden");
}

function closeModal() {
  state.modal.open = false;
  state.modal.taskId = null;
  el("modalRoot").classList.add("hidden");
}

function syncSearchScopeButtons() {
  const allBtn = el("searchScopeAll");
  const curBtn = el("searchScopeCurrent");
  if (!allBtn || !curBtn) return;
  const isAll = state.search.scope === "all";
  allBtn.setAttribute("aria-pressed", String(isAll));
  curBtn.setAttribute("aria-pressed", String(!isAll));
  allBtn.className = isAll ? "cc-search-scope-btn cc-search-scope-btn--active" : "cc-search-scope-btn";
  curBtn.className = !isAll ? "cc-search-scope-btn cc-search-scope-btn--active" : "cc-search-scope-btn";
}

function openSearchModal() {
  state.search.open = true;
  state.search.selectedIndex = 0;
  el("searchModalRoot").classList.remove("hidden");
  el("searchInput").value = "";
  syncSearchScopeButtons();
  el("searchResults").innerHTML = `<div class="cc-muted px-2 py-2">Loading index...</div>`;
  buildSearchIndex()
    .then(() => {
      el("searchResults").innerHTML = `<div class="cc-muted px-2 py-2">Type to search...</div>`;
      el("searchInput").focus();
    })
    .catch((error) => {
      console.error(error);
      el("searchResults").innerHTML = `<div class="text-red-300 px-2 py-2">Failed to load search index: ${error.message}</div>`;
    });
}
window.commandCentreOpenSearch = openSearchModal;

function closeSearchModal() {
  state.search.open = false;
  el("searchModalRoot").classList.add("hidden");
}

function staticSearchActionEntries() {
  return [
    {
      kind: "action",
      action: "view_dashboard",
      id: 0,
      workspace_id: 0,
      title: "Dashboard",
      subtitle: "Action · Launcher view",
    },
    {
      kind: "action",
      action: "view_kanban",
      id: 0,
      workspace_id: 0,
      title: "Kanban",
      subtitle: "Action · Task board",
    },
    {
      kind: "action",
      action: "open_settings",
      id: 0,
      workspace_id: 0,
      title: "Settings",
      subtitle: "Action · Preferences",
    },
    {
      kind: "action",
      action: "task_review",
      id: 0,
      workspace_id: 0,
      title: "Task review",
      subtitle: "Action · Due today & critical",
    },
  ];
}

async function buildSearchIndex() {
  const workspaces = await apiCall("get_workspaces");
  const index = [];
  const globalTray = await apiCall("get_global_tray_apps");
  state.globalTrayApps = globalTray;
  globalTray.forEach((app) => {
    const et = app.entry_type || "app";
    if (et === "divider") {
      index.push({
        kind: "global_tray_divider",
        id: app.id,
        workspace_id: 0,
        title: app.name || "—",
        subtitle: "Universal Tray · Divider",
      });
      return;
    }
    index.push({
      kind: "global_tray_app",
      id: app.id,
      workspace_id: 0,
      title: app.name,
      subtitle: "Universal Tray",
    });
  });

  for (const workspace of workspaces) {
    index.push({
      kind: "workspace",
      id: workspace.id,
      workspace_id: workspace.id,
      title: workspace.name,
      subtitle: "Workspace",
    });

    const [apps, resources, tasks] = await Promise.all([
      apiCall("get_apps", workspace.id),
      apiCall("get_resources", workspace.id),
      apiCall("get_tasks", workspace.id),
    ]);

    apps.forEach((app) =>
      index.push({
        kind: "app",
        id: app.id,
        workspace_id: workspace.id,
        title: app.name,
        subtitle: `App in ${workspace.name}`,
      })
    );

    resources.forEach((res) =>
      index.push({
        kind: "resource",
        id: res.id,
        workspace_id: workspace.id,
        title: res.name,
        subtitle: `Resource in ${workspace.name}`,
        description: res.description != null ? String(res.description) : "",
      })
    );

    tasks.forEach((task) => {
      const dueBit = formatTaskDueCardLine(task);
      index.push({
        kind: "task",
        id: task.id,
        workspace_id: workspace.id,
        title: task.title,
        subtitle: dueBit
          ? `Task in ${workspace.name} · ${dueBit}`
          : `Task in ${workspace.name}`,
      });
    });
  }

  state.search.index = [...staticSearchActionEntries(), ...index];
}

function renderSearchResults(query) {
  const qRaw = String(query || "").trim();
  const q = qRaw.toLowerCase();
  if (!qRaw) {
    state.search.visibleResults = [];
    state.search.selectedIndex = 0;
    el("searchResults").innerHTML = `<div class="cc-muted px-2 py-2">Type to search...</div>`;
    return;
  }

  let pool = state.search.index
    .map((entry) => ({ entry, score: scoreSearchEntry(entry, q) }))
    .filter((item) => item.score > 0);

  if (state.search.scope === "current" && state.activeWorkspaceId) {
    const aid = state.activeWorkspaceId;
    pool = pool.filter(({ entry }) => {
      if (entry.kind === "action") return true;
      if (entry.kind === "global_tray_app" || entry.kind === "global_tray_divider") return true;
      return entry.workspace_id === aid;
    });
  }

  const results = pool
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 100)
    .map((item) => item.entry);

  state.search.visibleResults = results;
  if (state.search.selectedIndex >= results.length) {
    state.search.selectedIndex = Math.max(0, results.length - 1);
  }

  if (!results.length) {
    el("searchResults").innerHTML = `<div class="cc-muted px-2 py-2">No matches.</div>`;
    return;
  }

  el("searchResults").innerHTML = results
    .map((entry, idx) => {
      const sel = idx === state.search.selectedIndex ? " search-result-selected" : "";
      if (entry.kind === "action") {
        return `
      <button
        type="button"
        class="cc-search-result-row${sel}"
        data-search-index="${idx}"
        data-search-kind="action"
        data-search-action="${escapeHtml(String(entry.action || ""))}"
      >
        <span class="truncate pr-2">${escapeHtml(entry.title)}</span>
        <span class="text-xs cc-muted">${escapeHtml(entry.subtitle)}</span>
      </button>`;
      }
      return `
      <button
        type="button"
        class="cc-search-result-row${sel}"
        data-search-index="${idx}"
        data-search-kind="${escapeHtml(entry.kind)}"
        data-search-id="${entry.id}"
        data-search-workspace-id="${entry.workspace_id}"
      >
        <span class="truncate pr-2">${escapeHtml(entry.title)}</span>
        <span class="text-xs cc-muted">${escapeHtml(entry.subtitle)}</span>
      </button>`;
    })
    .join("");

  const selected = el("searchResults").querySelector(".search-result-selected");
  selected?.scrollIntoView({ block: "nearest" });
}

function scoreSearchEntry(entry, query) {
  const title = String(entry.title || "").toLowerCase();
  const subtitle = String(entry.subtitle || "").toLowerCase();
  const description = String(entry.description || "").toLowerCase();
  const full = `${title} ${subtitle} ${description}`.trim();

  if (!title && !subtitle && !description) return 0;

  let score = 0;

  if (title === query) score += 1200;
  if (title.startsWith(query)) score += 700;
  if (title.includes(query)) score += 420;
  if (full.includes(query)) score += 220;

  const titleSubseq = subsequenceScore(title, query);
  const fullSubseq = subsequenceScore(full, query);
  score += Math.max(titleSubseq, Math.floor(fullSubseq * 0.75));

  if (entry.kind === "workspace") score += 40;
  if (entry.kind === "task") score += 20;
  if (entry.kind === "action") score += 25;

  return score;
}

function subsequenceScore(text, query) {
  if (!query) return 0;
  let qi = 0;
  let run = 0;
  let bestRun = 0;
  let gaps = 0;

  for (let i = 0; i < text.length && qi < query.length; i += 1) {
    if (text[i] === query[qi]) {
      qi += 1;
      run += 1;
      if (run > bestRun) bestRun = run;
    } else if (qi > 0) {
      if (run > 0) gaps += 1;
      run = 0;
    }
  }

  if (qi < query.length) return 0;

  const base = query.length * 26;
  const contiguousBoost = bestRun * 16;
  const gapPenalty = gaps * 6;
  const lengthPenalty = Math.max(0, text.length - query.length);
  return Math.max(0, base + contiguousBoost - gapPenalty - lengthPenalty);
}

async function jumpToWorkspace(workspaceId) {
  return switchWorkspace(workspaceId);
}

async function handleSearchResultEntry(entry) {
  if (!entry) return;
  if (entry.kind === "action") {
    const a = entry.action;
    closeSearchModal();
    if (a === "view_dashboard") {
      setView("dashboard");
      return;
    }
    if (a === "view_kanban") {
      setView("kanban");
      return;
    }
    if (a === "open_settings") {
      await openSettingsModal();
      return;
    }
    if (a === "task_review") {
      await openTaskReviewModal();
      return;
    }
    return;
  }
  if (entry.kind === "global_tray_divider") {
    closeSearchModal();
    return;
  }
  await handleSearchResultClick(entry.kind, entry.id, entry.workspace_id);
}

async function handleSearchResultClick(entryKind, entryId, workspaceId) {
  if (entryKind === "global_tray_app") {
    setView("dashboard");
    const app = (state.globalTrayApps || []).find((a) => a.id === entryId);
    if (app) {
      try {
        await apiCall("launch_app", app.command_path);
      } catch (error) {
        console.error(error);
        notify(`Failed to launch app: ${error.message}`, "error");
      }
    }
    closeSearchModal();
    return;
  }

  const switched = await jumpToWorkspace(workspaceId);
  if (!switched) return;

  if (entryKind === "workspace") {
    closeSearchModal();
    return;
  }
  if (entryKind === "task") {
    setView("kanban");
    openTaskModal(entryId);
    closeSearchModal();
    return;
  }
  if (entryKind === "app") {
    setView("dashboard");
    const app = state.lastApps?.find((a) => a.id === entryId);
    if (app) await apiCall("launch_app", app.command_path);
    closeSearchModal();
    return;
  }
  if (entryKind === "resource") {
    setView("dashboard");
    const resource = state.lastResources?.find((r) => r.id === entryId);
    if (resource) await apiCall("open_resource", resource.path, resource.type);
    closeSearchModal();
  }
}

function setMdMode(mode) {
  state.modal.mode = mode;
  el("taskDescription").classList.toggle("hidden", mode !== "edit");
  el("taskDescriptionPreview").classList.toggle("hidden", mode !== "preview");
  if (mode === "preview") {
    const md = el("taskDescription").value || "";
    configureMarkedParser();
    const html = window.marked ? window.marked.parse(md) : md;
    el("taskDescriptionPreview").innerHTML = html;
  }
}

function openTaskModal(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  state.modal.taskId = taskId;
  el("modalTitle").textContent = `Task #${taskId}`;
  el("taskTitle").value = task.title || "";
  el("taskPriority").value = task.priority || "medium";
  el("taskDueDate").value = String(task.due_date || "").trim().slice(0, 10);
  el("taskRecurrence").value = normalizeTaskRecurrence(task.recurrence);

  el("taskDescription").value = task.description_md || "";

  el("taskLabels").value = parseTaskLabelsForCard(task).join(", ");
  populateTaskModalCheckboxGroup(
    "taskAppIds",
    state.lastApps || [],
    toIdArray(task.app_ids),
    (a) => a.name || `#${a.id}`
  );
  populateTaskModalCheckboxGroup(
    "taskResourceIds",
    state.lastResources || [],
    toIdArray(task.resource_ids),
    (r) => r.name || `#${r.id}`
  );
  populateTaskModalCheckboxGroup(
    "taskBlockingIds",
    state.tasks.filter((candidate) => candidate.id !== task.id),
    toIdArray(task.blocking_task_ids),
    (t) => t.title || `#${t.id}`
  );
  renderBlockingQuickLinks(task);

  openModal();
  setMdMode("edit");
}

function renderBlockingQuickLinks(task) {
  const root = el("taskBlockingQuickLinks");
  if (!root) return;
  const doneColumnId = getDoneColumnId();
  const blockers = getIncompleteBlockingTasks(task, doneColumnId);
  if (!blockers.length) {
    root.innerHTML = `<div class="text-[11px] text-slate-500">No active blockers.</div>`;
    return;
  }
  root.innerHTML = blockers
    .map((blocker) => {
      if (!blocker) {
        return `<span class="rounded border border-amber-700/60 px-2 py-1 text-[11px] text-amber-300">Missing blocker task</span>`;
      }
      return `<button data-open-blocker="${blocker.id}" class="rounded border border-amber-700/60 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-950/40">Open #${blocker.id}: ${blocker.title}</button>`;
    })
    .join("");
}

async function saveTaskFromModal() {
  const task = state.tasks.find((t) => t.id === state.modal.taskId);
  if (!task) return;

  const title = el("taskTitle").value.trim();
  if (!title) {
    notify("Title is required.", "error");
    return;
  }

  const labels = el("taskLabels")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const dueRaw = el("taskDueDate").value.trim();
  const recurrence = el("taskRecurrence").value || "none";

  await apiCall(
    "update_task",
    task.id,
    task.column_id,
    title,
    el("taskDescription").value || "",
    el("taskPriority").value || "medium",
    JSON.stringify(labels),
    JSON.stringify(getSelectedIds("taskBlockingIds")),
    JSON.stringify(getSelectedIds("taskAppIds")),
    JSON.stringify(getSelectedIds("taskResourceIds")),
    dueRaw,
    recurrence
  );

  await loadWorkspaceData();
  renderKanban();
  closeModal();
}

function setView(view) {
  state.view = view;
  el("dashboardView").classList.toggle("hidden", view !== "dashboard");
  el("kanbanView").classList.toggle("hidden", view !== "kanban");
}

function renderAll() {
  renderWorkspaceTabs();
  renderKanban();
  setView(state.view);
}

async function bootstrap() {
  state.workspaces = await apiCall("get_workspaces");
  if (state.workspaces.length > 0) {
    state.activeWorkspaceId = state.workspaces[0].id;
    state.workspaceUi.loading = true;
    renderWorkspaceTabs();
    try {
      await loadWorkspaceData();
    } catch (error) {
      notify(`Failed to load workspace: ${error.message}`, "error");
    } finally {
      state.workspaceUi.loading = false;
      renderAll();
    }
    return;
  }
  state.activeWorkspaceId = null;
  renderWorkspaceTabs();
  await loadWorkspaceData();
  renderAll();
}

function initUI() {
  applyUserCustomCssFromApi().catch(() => {});
  startDashboardClock();
  el("showDashboard").onclick = () => setView("dashboard");
  el("showKanban").onclick = () => {
    setView("kanban");
    renderKanban();
  };
  function bindSectionTitleToggle(titleId, collapsedKey) {
    const node = el(titleId);
    if (!node) return;
    const toggle = () => {
      state.dashboard[collapsedKey] = !state.dashboard[collapsedKey];
      renderDashboard(state.lastApps || [], state.lastResources || []);
    };
    node.onclick = (e) => {
      e.preventDefault();
      toggle();
    };
    node.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    };
  }
  bindSectionTitleToggle("launcherSectionTitle", "launcherCollapsed");
  bindSectionTitleToggle("librarySectionTitle", "libraryCollapsed");
  wireWorkspaceTablistSemantics();
  el("openSettingsBtn").onclick = () => {
    openSettingsModal().catch((error) => {
      notify(`Failed to open settings: ${error.message}`, "error");
    });
  };
  el("openSearchBtn").onclick = () => {
    openSearchModal();
  };
  el("openTaskReviewBtn").onclick = () => {
    openTaskReviewModal().catch((error) => {
      console.error(error);
      notify(error.message || String(error), "error");
    });
  };
  el("taskReviewBackdrop").onclick = closeTaskReviewModal;
  el("taskReviewClose").onclick = closeTaskReviewModal;
  el("taskReviewPrev").onclick = () => stepTaskReview(-1);
  el("taskReviewNext").onclick = () => stepTaskReview(1);
  el("taskReviewOpenEditor").onclick = () => {
    taskReviewOpenFullEditor().catch((error) => {
      console.error(error);
      notify(error.message || String(error), "error");
    });
  };
  function onKanbanFilterTextInput(event) {
    state.kanbanFilter.text = String(event.target?.value ?? "");
    renderKanban();
  }
  const kfText = el("kanbanFilterText");
  const kfPri = el("kanbanFilterPriority");
  if (kfText) {
    kfText.addEventListener("input", onKanbanFilterTextInput);
    kfText.addEventListener("keyup", onKanbanFilterTextInput);
    kfText.addEventListener("change", onKanbanFilterTextInput);
  }
  if (kfPri) {
    kfPri.addEventListener("change", (event) => {
      state.kanbanFilter.priority = event.target.value || "all";
      renderKanban();
    });
  }
  el("kanbanColumns").addEventListener("contextmenu", (event) => {
    const card = event.target.closest("[data-column-card='true']");
    if (!card || !el("kanbanColumns").contains(card)) return;
    event.preventDefault();
    state.columnContext.columnId = Number(card.dataset.columnId);
    const menu = el("columnContextMenu");
    if (!menu) return;
    menu.classList.remove("hidden");
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
  });
  el("columnContextNewTask").onclick = async () => {
    const columnId = state.columnContext.columnId;
    closeColumnContextMenu();
    if (!columnId || !state.activeWorkspaceId) return;
    const title = await openTextModal({
      title: "Create Task",
      label: "Task title",
      value: "",
    });
    if (!title) return;
    try {
      await apiCall(
        "create_task",
        state.activeWorkspaceId,
        columnId,
        title,
        "",
        "medium",
        "[]",
        "[]",
        "[]",
        "[]",
        "",
        "none",
      );
      await loadWorkspaceData();
      renderKanban();
    } catch (error) {
      notify(`Failed to create task: ${error.message}`, "error");
    }
  };
  el("modalBackdrop").onclick = closeModal;
  el("modalClose").onclick = closeModal;
  el("taskCancel").onclick = closeModal;
  el("taskSave").onclick = () => saveTaskFromModal().catch(console.error);
  el("taskBlockingIds").addEventListener("change", () => {
    const task = state.tasks.find((t) => t.id === state.modal.taskId);
    if (!task) return;
    const draftTask = { ...task, blocking_task_ids: JSON.stringify(getSelectedIds("taskBlockingIds")) };
    renderBlockingQuickLinks(draftTask);
  });
  el("taskBlockingQuickLinks").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-open-blocker]");
    if (!btn) return;
    const blockerId = Number(btn.dataset.openBlocker);
    if (!blockerId) return;
    openTaskModal(blockerId);
  });
  el("taskDelete").onclick = async () => {
    if (!state.modal.taskId) return;
    await apiCall("delete_task", state.modal.taskId);
    await loadWorkspaceData();
    renderKanban();
    closeModal();
  };
  el("mdEdit").onclick = () => setMdMode("edit");
  el("mdPreview").onclick = () => setMdMode("preview");

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (!state.search.open) openSearchModal();
      return;
    }
    if (tryHandleGlobalWorkspaceTabArrows(event)) {
      return;
    }
    if (event.key === "Escape" && state.modal.open) {
      closeModal();
      return;
    }
    if (event.key === "Escape" && state.search.open) {
      closeSearchModal();
      return;
    }
    if (event.key === "Escape" && state.crud.open) {
      closeCrudModal();
      return;
    }
    if (event.key === "Escape" && state.columnEdit.open) {
      closeColumnEditModal();
      return;
    }
    if (event.key === "Escape" && state.textModal.open) {
      closeTextModal(null);
      return;
    }
    if (event.key === "Escape" && state.confirmModal.open) {
      closeConfirmModal(false);
      return;
    }
    if (event.key === "Escape" && state.settings.open) {
      closeSettingsModal();
      return;
    }
    if (event.key === "Escape" && state.taskReview.open) {
      closeTaskReviewModal();
      return;
    }
    if (event.key === "Escape" && state.launcherContext.open) {
      closeLauncherContextMenu();
      return;
    }
    if (state.taskReview.open && !state.textModal.open) {
      if (event.key === "j" || event.key === "J") {
        event.preventDefault();
        stepTaskReview(1);
        return;
      }
      if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        stepTaskReview(-1);
        return;
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        stepTaskReview(1);
        return;
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        stepTaskReview(-1);
        return;
      }
    }
    if (
      state.search.open &&
      !state.textModal.open &&
      !state.confirmModal.open &&
      event.target &&
      event.target.id === "searchInput"
    ) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (state.search.visibleResults.length) {
          state.search.selectedIndex = Math.min(
            state.search.visibleResults.length - 1,
            state.search.selectedIndex + 1,
          );
          renderSearchResults(el("searchInput").value || "");
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (state.search.visibleResults.length) {
          state.search.selectedIndex = Math.max(0, state.search.selectedIndex - 1);
          renderSearchResults(el("searchInput").value || "");
        }
        return;
      }
      if (event.key === "Enter") {
        const entry = state.search.visibleResults[state.search.selectedIndex];
        if (entry) {
          event.preventDefault();
          handleSearchResultEntry(entry).catch((error) => {
            console.error(error);
            notify(`Search action failed: ${error.message}`, "error");
          });
        }
        return;
      }
    }
    if (event.key === "Enter" && state.textModal.open) {
      event.preventDefault();
      const input = el("textModalInput");
      const raw = input.value;
      const value = input.type === "password" ? raw : raw.trim();
      closeTextModal(value);
    }
  });

  el("searchBackdrop").onclick = closeSearchModal;
  el("searchScopeAll").onclick = () => {
    state.search.scope = "all";
    syncSearchScopeButtons();
    state.search.selectedIndex = 0;
    renderSearchResults(el("searchInput").value || "");
  };
  el("searchScopeCurrent").onclick = () => {
    state.search.scope = "current";
    syncSearchScopeButtons();
    state.search.selectedIndex = 0;
    renderSearchResults(el("searchInput").value || "");
  };
  el("searchInput").addEventListener("input", (event) => {
    state.search.selectedIndex = 0;
    renderSearchResults(event.target.value || "");
  });
  el("searchResults").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-search-index]");
    if (!btn) return;
    const idx = Number(btn.dataset.searchIndex);
    const entry = state.search.visibleResults[idx];
    if (!entry) return;
    handleSearchResultEntry(entry).catch((error) => {
      console.error(error);
      notify(`Search action failed: ${error.message}`, "error");
    });
  });

  el("crudBackdrop").onclick = closeCrudModal;
  el("crudModalClose").onclick = closeCrudModal;
  el("crudCancel").onclick = closeCrudModal;
  el("crudSave").onclick = () => {
    saveCrudModal().catch((error) => {
      console.error(error);
      notify(`Save failed: ${error.message}`, "error");
    });
  };
  el("columnEditBackdrop").onclick = closeColumnEditModal;
  el("columnEditClose").onclick = closeColumnEditModal;
  el("columnEditCancel").onclick = closeColumnEditModal;
  el("columnEditSave").onclick = () => {
    saveColumnEditModal().catch((error) => {
      console.error(error);
    });
  };
  el("crudIconTypeUnicode").addEventListener("change", () => {
    el("crudIconUnicodeRow").classList.remove("hidden");
    el("crudIconFileRow").classList.add("hidden");
  });
  el("crudIconTypeFile").addEventListener("change", () => {
    el("crudIconUnicodeRow").classList.add("hidden");
    el("crudIconFileRow").classList.remove("hidden");
  });
  el("crudPickIconFile").onclick = async () => {
    try {
      const result = await apiCall("pick_icon_file");
      if (!result?.ok) throw new Error(result?.error || "File picker failed");
      if (result.path) {
        el("crudIconTypeFile").checked = true;
        el("crudIconUnicodeRow").classList.add("hidden");
        el("crudIconFileRow").classList.remove("hidden");
        el("crudIconFile").value = result.path;
      }
    } catch (error) {
      notify(`Failed to pick icon: ${error.message}`, "error");
    }
  };

  el("crudImportWorkspace").addEventListener("change", async () => {
    if (!state.crud.open || (state.crud.kind !== "app" && state.crud.kind !== "resource")) return;
    const wsId = el("crudImportWorkspace").value;
    const itemSel = el("crudImportItem");
    const applyBtn = el("crudImportApply");
    itemSel.innerHTML = '<option value="">— Select item —</option>';
    state.crud.importList = [];
    applyBtn.disabled = true;
    if (!wsId) {
      itemSel.disabled = true;
      return;
    }
    try {
      if (state.crud.kind === "app") {
        state.crud.importList = await apiCall("get_apps", Number(wsId));
      } else {
        state.crud.importList = await apiCall("get_resources", Number(wsId));
      }
      state.crud.importList.forEach((ent) => {
        const cat = ent.category || "Uncategorized";
        itemSel.innerHTML += `<option value="${ent.id}">${escapeHtml(`${ent.name} (${cat})`)}</option>`;
      });
      if (state.crud.importList.length === 0) {
        itemSel.innerHTML = '<option value="">(No items in this workspace)</option>';
        itemSel.disabled = true;
      } else {
        itemSel.disabled = false;
      }
    } catch (error) {
      notify(error.message || String(error), "error");
      itemSel.disabled = true;
    }
  });
  el("crudImportItem").addEventListener("change", () => {
    const itemSel = el("crudImportItem");
    const v = itemSel.value;
    el("crudImportApply").disabled = !v || itemSel.disabled;
  });
  el("crudImportApply").onclick = () => applyCrudImportFromSelection();

  el("textBackdrop").onclick = () => closeTextModal(null);
  el("textModalClose").onclick = () => closeTextModal(null);
  el("textCancel").onclick = () => closeTextModal(null);
  el("textSave").onclick = () => {
    const input = el("textModalInput");
    const raw = input.value;
    const value = input.type === "password" ? raw : raw.trim();
    closeTextModal(value);
  };
  el("confirmBackdrop").onclick = () => closeConfirmModal(false);
  el("confirmModalClose").onclick = () => closeConfirmModal(false);
  el("confirmCancel").onclick = () => closeConfirmModal(false);
  el("confirmOk").onclick = () => closeConfirmModal(true);
  el("settingsBackdrop").onclick = closeSettingsModal;
  el("settingsClose").onclick = closeSettingsModal;
  el("autostartToggle").addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      await apiCall("set_autostart", enabled);
      state.settings.autostartEnabled = enabled;
      notify(`Autostart ${enabled ? "enabled" : "disabled"}.`, "success");
    } catch (error) {
      event.target.checked = !enabled;
      notify(`Failed to update autostart: ${error.message}`, "error");
    }
  });
  el("trayToggle").addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      await apiCall("set_tray_enabled", enabled);
      state.settings.trayEnabled = enabled;
      notify(`System tray ${enabled ? "enabled" : "disabled"}.`, "success");
    } catch (error) {
      event.target.checked = !enabled;
      notify(`Failed to update tray setting: ${error.message}`, "error");
    }
  });
  el("hotkeyToggle").addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      const result = await apiCall("set_hotkey_enabled", enabled);
      if (!result?.ok) {
        throw new Error(result?.error || result?.warning || "Hotkey update failed");
      }
      state.settings.hotkeyEnabled = enabled;
      notify(`Global hotkey ${enabled ? "enabled" : "disabled"}.`, "success");
    } catch (error) {
      event.target.checked = !enabled;
      notify(`Failed to update hotkey setting: ${error.message}`, "error");
    }
  });
  el("settingsLoadDefaultCssBtn").onclick = async () => {
    const ta = el("settingsCustomCss");
    if (!ta) return;
    const cur = ta.value.trim();
    if (cur && !window.confirm("Replace the editor contents with the bundled default stylesheet?")) return;
    try {
      const res = await apiCall("get_default_ui_css");
      if (!res?.ok) throw new Error(res?.error || "Could not read default CSS");
      ta.value = res.css ?? "";
      notify("Loaded default CSS into the editor (not saved yet).", "info");
    } catch (error) {
      notify(error.message || String(error), "error");
    }
  };
  el("settingsSaveCustomCssBtn").onclick = async () => {
    const ta = el("settingsCustomCss");
    if (!ta) return;
    try {
      const res = await apiCall("set_ui_custom_css", ta.value);
      if (!res?.ok) throw new Error(res?.error || "Save failed");
      injectUserCss(ta.value);
      notify("Custom CSS saved.", "success");
    } catch (error) {
      notify(error.message || String(error), "error");
    }
  };
  el("settingsClearCustomCssBtn").onclick = async () => {
    try {
      const res = await apiCall("clear_ui_custom_css");
      if (!res?.ok) throw new Error(res?.error || "Clear failed");
      injectUserCss("");
      window.location.reload();
    } catch (error) {
      notify(error.message || String(error), "error");
    }
  };
  el("settingsExportJsonBtn").onclick = async () => {
    try {
      const json = await apiCall("export_data_json");
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `commandcentre-export-${localTodayISO()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      notify("Export saved.", "success");
    } catch (error) {
      notify(`Export failed: ${error.message}`, "error");
    }
  };
  el("settingsImportJsonBtn").onclick = () => {
    el("settingsImportFile").click();
  };
  el("settingsImportFile").addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch (error) {
      notify(`Could not read file: ${error.message}`, "error");
      return;
    }
    const typed = await openTextModal({
      title: "Confirm destructive import",
      label: 'Type REPLACE to erase all data and load this file',
      value: "",
    });
    if (typed !== "REPLACE") {
      notify("Import cancelled.", "info");
      return;
    }
    try {
      const res = await apiCall("import_data_json", text, "replace");
      if (!res?.ok) throw new Error(res?.error || "Import failed");
      notify("Import complete.", "success");
      await bootstrap();
    } catch (error) {
      notify(`Import failed: ${error.message}`, "error");
    }
  });
  el("workspaceSettingsList").addEventListener("click", async (event) => {
    const iconBtn = event.target.closest("[data-edit-workspace-icon]");
    const renameBtn = event.target.closest("[data-rename-workspace]");
    const deleteBtn = event.target.closest("[data-delete-workspace]");
    if (!iconBtn && !renameBtn && !deleteBtn) return;

    const workspaceId = Number(
      (iconBtn || renameBtn || deleteBtn).dataset.editWorkspaceIcon ||
        (iconBtn || renameBtn || deleteBtn).dataset.renameWorkspace ||
        (iconBtn || renameBtn || deleteBtn).dataset.deleteWorkspace
    );
    const workspace = state.workspaces.find((w) => w.id === workspaceId);
    if (!workspace) return;

    if (iconBtn) {
      const icon = await openTextModal({
        title: "Workspace Icon",
        label: "Unicode character (e.g. 🖿 ⚙ ✦)",
        value: resolveWorkspaceIcon(workspace.icon),
      });
      if (!icon) return;
      try {
        await apiCall("update_workspace", workspaceId, workspace.name, icon);
        state.workspaces = await apiCall("get_workspaces");
        renderWorkspaceTabs();
        renderWorkspaceSettingsList();
        notify("Workspace icon updated.", "success");
      } catch (error) {
        notify(`Failed to update workspace icon: ${error.message}`, "error");
      }
      return;
    }

    if (renameBtn) {
      const name = await openTextModal({
        title: "Rename Workspace",
        label: "Workspace name",
        value: workspace.name,
      });
      if (!name) return;
      try {
        await apiCall("update_workspace", workspaceId, name, workspace.icon || "🖿");
        state.workspaces = await apiCall("get_workspaces");
        renderWorkspaceTabs();
        renderWorkspaceSettingsList();
        notify("Workspace renamed.", "success");
      } catch (error) {
        notify(`Failed to rename workspace: ${error.message}`, "error");
      }
      return;
    }

    const ok = await openConfirmModal({
      title: "Delete Workspace",
      message: `Delete workspace "${workspace.name}" and all associated data?`,
    });
    if (!ok) return;
    try {
      await apiCall("delete_workspace", workspaceId);
      state.workspaces = await apiCall("get_workspaces");
      if (!state.workspaces.length) {
        const created = await apiCall("create_workspace", "Default", "🖿");
        state.workspaces = await apiCall("get_workspaces");
        state.activeWorkspaceId = created.id;
      } else if (!state.workspaces.some((w) => w.id === state.activeWorkspaceId)) {
        state.activeWorkspaceId = state.workspaces[0].id;
      }
      await loadWorkspaceData();
      renderAll();
      renderWorkspaceSettingsList();
      notify("Workspace deleted.", "success");
    } catch (error) {
      notify(`Failed to delete workspace: ${error.message}`, "error");
    }
  });

  el("newWorkspaceBtn").onclick = async () => {
    const name = await openTextModal({
      title: "Create Workspace",
      label: "Workspace name",
      value: "",
    });
    if (!name) return;
    const icon = await openTextModal({
      title: "Workspace Icon",
      label: "Unicode character (optional)",
      value: "🖿",
    });
    try {
      await apiCall("create_workspace", name, icon || "🖿");
      state.workspaces = await apiCall("get_workspaces");
      state.activeWorkspaceId = state.workspaces[state.workspaces.length - 1].id;
      await loadWorkspaceData();
      renderAll();
    } catch (error) {
      console.error(error);
      notify(`Failed to create workspace: ${error.message}`, "error");
    }
  };

  el("addTaskBtn").onclick = async () => {
    if (!state.columns.length) return;
    const title = await openTextModal({
      title: "Create Task",
      label: "Task title",
      value: "",
    });
    if (!title) return;
    try {
      await apiCall(
        "create_task",
        state.activeWorkspaceId,
        state.columns[0].id,
        title,
        "",
        "medium",
        "[]",
        "[]",
        "[]",
        "[]",
        "",
        "none"
      );
      await loadWorkspaceData();
      renderKanban();
    } catch (error) {
      console.error(error);
      notify(`Failed to create task: ${error.message}`, "error");
    }
  };

  el("addColumnBtn").onclick = async () => {
    if (!state.activeWorkspaceId) return;
    const name = await openTextModal({
      title: "Create Column",
      label: "Column name",
      value: "",
    });
    if (!name) return;
    const sortOrder = state.columns.length;
    try {
      await apiCall("create_column", state.activeWorkspaceId, name, sortOrder);
      await loadWorkspaceData();
      renderKanban();
    } catch (error) {
      console.error(error);
      notify(`Failed to create column: ${error.message}`, "error");
    }
  };

  el("addAppBtn").onclick = async () => {
    if (!state.activeWorkspaceId) return;
    openCrudModal("app", "create");
  };

  el("addGlobalTrayAppBtn").onclick = () => {
    openCrudModal("global_tray_app", "create");
  };

  el("addGlobalTrayDividerBtn").onclick = async () => {
    const label = await openTextModal({
      title: "New divider",
      label: "Optional label (leave blank for default)",
      value: "",
    });
    if (label === null) return;
    try {
      await apiCall("create_global_tray_divider", label || "");
      await loadWorkspaceData();
    } catch (error) {
      notify(`Failed to add divider: ${error.message}`, "error");
    }
  };

  el("globalTrayAppsRow").addEventListener("click", async (event) => {
    closeLauncherContextMenu();
    const launchBtn = event.target.closest("[data-launch-global-tray-app]");
    if (!launchBtn) return;
    const tile = launchBtn.closest("[data-global-tray-tile]");
    if (tile?.dataset.globalTrayEntryType === "divider") return;
    const appId = Number(launchBtn.dataset.launchGlobalTrayApp);
    if (!appId) return;
    const app = state.globalTrayApps?.find((a) => a.id === appId);
    if (!app) return;
    try {
      await apiCall("launch_app", app.command_path);
    } catch (error) {
      console.error(error);
      notify(`Failed to launch app: ${error.message}`, "error");
    }
  });

  el("globalTrayAppsRow").addEventListener("contextmenu", (event) => {
    const tile = event.target.closest("[data-global-tray-tile]");
    if (!tile) return;
    event.preventDefault();
    const appId = Number(tile.dataset.globalTrayTile);
    if (!appId) return;
    const et = tile.dataset.globalTrayEntryType || "app";
    openLauncherContextMenu(appId, event.clientX, event.clientY, "global_tray", et);
  });

  el("addResourceBtn").onclick = async () => {
    if (!state.activeWorkspaceId) return;
    openCrudModal("resource", "create");
  };

  el("appsList").addEventListener("click", async (event) => {
    closeLauncherContextMenu();
    const toggleAppCategoryBtn = event.target.closest("[data-toggle-app-category]");
    if (toggleAppCategoryBtn) {
      const category = decodeURIComponent(toggleAppCategoryBtn.dataset.toggleAppCategory || "");
      state.dashboard.appCategoriesCollapsed[category] = !state.dashboard.appCategoriesCollapsed[category];
      renderDashboard(state.lastApps || [], state.lastResources || []);
      return;
    }
    const launchBtn = event.target.closest("[data-launch-app]");
    if (!launchBtn) return;
    const appId = Number(launchBtn.dataset.launchApp);
    if (!appId) return;

    const app = state.lastApps?.find((a) => a.id === appId);
    if (!app) return;

    if (launchBtn) {
      try {
        await apiCall("launch_app", app.command_path);
      } catch (error) {
        console.error(error);
        notify(`Failed to launch app: ${error.message}`, "error");
      }
      return;
    }

  });
  el("appsList").addEventListener("contextmenu", (event) => {
    const hdr = event.target.closest("[data-app-category-header]");
    if (hdr) {
      event.preventDefault();
      const category = decodeURIComponent(hdr.dataset.toggleAppCategory || "");
      if (!state.activeWorkspaceId) return;
      openCrudModal("app", "create", null, { category });
      return;
    }
    const tile = event.target.closest("[data-app-tile]");
    if (!tile) return;
    event.preventDefault();
    const appId = Number(tile.dataset.appTile);
    if (!appId) return;
    openLauncherContextMenu(appId, event.clientX, event.clientY);
  });
  document.addEventListener("click", (event) => {
    const colMenu = el("columnContextMenu");
    if (colMenu && !colMenu.classList.contains("hidden") && !colMenu.contains(event.target)) {
      closeColumnContextMenu();
    }
    if (!state.launcherContext.open) return;
    const menu = el("launcherContextMenu");
    if (menu && menu.contains(event.target)) return;
    closeLauncherContextMenu();
  });
  el("launcherContextEdit").onclick = () => {
    const appId = Number(state.launcherContext.appId);
    const scope = state.launcherContext.scope || "workspace";
    closeLauncherContextMenu();
    if (scope === "global_tray") {
      const app = state.globalTrayApps?.find((a) => a.id === appId);
      if (!app) return;
      openCrudModal("global_tray_app", "edit", app);
      return;
    }
    const app = state.lastApps?.find((a) => a.id === appId);
    if (!app) return;
    openCrudModal("app", "edit", app);
  };
  el("launcherContextDelete").onclick = async () => {
    const appId = Number(state.launcherContext.appId);
    const scope = state.launcherContext.scope || "workspace";
    closeLauncherContextMenu();
    if (scope === "global_tray") {
      const app = state.globalTrayApps?.find((a) => a.id === appId);
      if (!app) return;
      const ok = await openConfirmModal({
        title: "Delete universal tray app",
        message: `Remove "${app.name}" from the universal tray?`,
      });
      if (!ok) return;
      try {
        await apiCall("delete_global_tray_app", app.id);
        await loadWorkspaceData();
      } catch (error) {
        console.error(error);
        notify(`Failed to delete app: ${error.message}`, "error");
      }
      return;
    }
    const app = state.lastApps?.find((a) => a.id === appId);
    if (!app) return;
    const ok = await openConfirmModal({
      title: "Delete App",
      message: `Delete app "${app.name}"?`,
    });
    if (!ok) return;
    try {
      await apiCall("delete_app", app.id);
      await loadWorkspaceData();
    } catch (error) {
      console.error(error);
      notify(`Failed to delete app: ${error.message}`, "error");
    }
  };
  el("launcherContextRemoveDivider").onclick = async () => {
    const appId = Number(state.launcherContext.appId);
    closeLauncherContextMenu();
    const row = state.globalTrayApps?.find((a) => a.id === appId);
    if (!row) return;
    const ok = await openConfirmModal({
      title: "Remove divider",
      message: "Remove this tray divider?",
    });
    if (!ok) return;
    try {
      await apiCall("delete_global_tray_app", appId);
      await loadWorkspaceData();
    } catch (error) {
      notify(`Failed to remove divider: ${error.message}`, "error");
    }
  };
  el("launcherContextAddDividerAfter").onclick = async () => {
    const afterId = Number(state.launcherContext.appId);
    closeLauncherContextMenu();
    const oldIds = (state.globalTrayApps || []).map((a) => a.id);
    try {
      const created = await apiCall("create_global_tray_divider", "");
      const newId = created?.id;
      if (!newId) throw new Error("No divider id returned");
      const idx = oldIds.indexOf(afterId);
      const next =
        idx >= 0 ? [...oldIds.slice(0, idx + 1), newId, ...oldIds.slice(idx + 1)] : [...oldIds, newId];
      const result = await apiCall("reorder_global_tray_apps", next);
      if (result && result.ok === false) throw new Error(result.error || "Reorder failed");
      await loadWorkspaceData();
    } catch (error) {
      notify(`Failed to add divider: ${error.message}`, "error");
    }
  };

  el("resourcesList").addEventListener("click", async (event) => {
    const toggleResourceCategoryBtn = event.target.closest("[data-toggle-resource-category]");
    if (toggleResourceCategoryBtn) {
      const category = decodeURIComponent(toggleResourceCategoryBtn.dataset.toggleResourceCategory || "");
      state.dashboard.resourceCategoriesCollapsed[category] =
        !state.dashboard.resourceCategoriesCollapsed[category];
      renderDashboard(state.lastApps || [], state.lastResources || []);
      return;
    }
    const openBtn = event.target.closest("[data-open-resource]");
    const editBtn = event.target.closest("[data-edit-resource]");
    const deleteBtn = event.target.closest("[data-delete-resource]");
    if (!openBtn && !editBtn && !deleteBtn) return;

    const sourceBtn = openBtn || editBtn || deleteBtn;
    const resId = Number(
      sourceBtn.dataset.openResource ||
        sourceBtn.dataset.editResource ||
        sourceBtn.dataset.deleteResource
    );
    if (!resId) return;

    const resource = state.lastResources?.find((r) => r.id === resId);
    if (!resource) return;

    if (openBtn) {
      try {
        await apiCall("open_resource", resource.path, resource.type);
      } catch (error) {
        console.error(error);
        notify(`Failed to open resource: ${error.message}`, "error");
      }
      return;
    }

    if (deleteBtn) {
      const ok = await openConfirmModal({
        title: "Delete Resource",
        message: `Delete resource "${resource.name}"?`,
      });
      if (!ok) return;
      try {
        await apiCall("delete_resource", resource.id);
        await loadWorkspaceData();
      } catch (error) {
        console.error(error);
        notify(`Failed to delete resource: ${error.message}`, "error");
      }
      return;
    }

    openCrudModal("resource", "edit", resource);
  });
  el("resourcesList").addEventListener("contextmenu", (event) => {
    const hdr = event.target.closest("[data-resource-category-header]");
    if (!hdr) return;
    event.preventDefault();
    const category = decodeURIComponent(hdr.dataset.toggleResourceCategory || "");
    if (!state.activeWorkspaceId) return;
    openCrudModal("resource", "create", null, { category });
  });

  bootstrap().catch((error) => {
    console.error(error);
    notify(`Bootstrap error: ${error.message}`, "error");
  });
}

window.addEventListener("pywebviewready", initUI);
