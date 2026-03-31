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
  },
  crud: {
    open: false,
    kind: null, // app | resource
    mode: "create", // create | edit
    entityId: null,
  },
  textModal: {
    open: false,
    resolver: null,
  },
  confirmModal: {
    open: false,
    resolver: null,
  },
  safeNoteModal: {
    open: false,
  },
  settings: {
    open: false,
    autostartEnabled: false,
    trayEnabled: true,
    hotkeyEnabled: true,
  },
  dashboard: {
    launcherCollapsed: false,
    libraryCollapsed: false,
    safeCollapsed: false,
    appCategoriesCollapsed: {},
    resourceCategoriesCollapsed: {},
  },
  safe: {
    partitionKey: null,
    status: null,
    vaults: [],
    selectedVaultId: null,
    items: [],
    selectedItemId: null,
    selectedItemDetail: null,
    searchQuery: "",
    showTrashed: false,
    revealPassword: false,
    latestTotp: "",
  },
};

function el(id) {
  return document.getElementById(id);
}

function notify(message, type = "info") {
  const root = el("toastRoot");
  if (!root) return;
  const toast = document.createElement("div");
  const colorClass =
    type === "error"
      ? "border-red-700 bg-red-950/90 text-red-100"
      : type === "success"
        ? "border-emerald-700 bg-emerald-950/90 text-emerald-100"
        : "border-slate-700 bg-slate-900/95 text-slate-100";
  toast.className = `rounded border px-3 py-2 text-sm shadow-lg ${colorClass}`;
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

function renderWorkspaceTabs() {
  const tabs = el("workspaceTabs");
  tabs.innerHTML = "";
  state.workspaces.forEach((workspace) => {
    const button = document.createElement("button");
    const isActive = workspace.id === state.activeWorkspaceId;
    button.className = `rounded px-3 py-1 text-sm ${
      isActive ? "bg-blue-600" : "bg-slate-800 hover:bg-slate-700"
    }`;
    button.textContent = `${workspace.icon || "fa-folder"} ${workspace.name}`;
    button.onclick = async () => {
      state.activeWorkspaceId = workspace.id;
      await loadWorkspaceData();
      await refreshSafePanel();
      renderAll();
    };
    tabs.appendChild(button);
  });
}

function groupByCategory(items) {
  return items.reduce((acc, item) => {
    const key = item.category || "Uncategorized";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function renderDashboard(apps, resources) {
  el("launcherContent")?.classList.toggle("hidden", state.dashboard.launcherCollapsed);
  el("libraryContent")?.classList.toggle("hidden", state.dashboard.libraryCollapsed);
  el("safeContent")?.classList.toggle("hidden", state.dashboard.safeCollapsed);
  const launcherBtn = el("toggleLauncherBtn");
  const libraryBtn = el("toggleLibraryBtn");
  const safeBtn = el("toggleSafeBtn");
  if (launcherBtn) launcherBtn.textContent = state.dashboard.launcherCollapsed ? "Expand" : "Collapse";
  if (libraryBtn) libraryBtn.textContent = state.dashboard.libraryCollapsed ? "Expand" : "Collapse";
  if (safeBtn) safeBtn.textContent = state.dashboard.safeCollapsed ? "Expand" : "Collapse";

  const appsList = el("appsList");
  const appsByCat = groupByCategory(apps);
  appsList.innerHTML =
    apps.length === 0
      ? "No apps yet."
      : Object.entries(appsByCat)
          .map(
            ([category, items]) => `
          <div class="mb-2">
            <button class="w-full text-left text-xs uppercase tracking-wide text-slate-400 mb-1 hover:text-slate-200" data-toggle-app-category="${category}">
              ${state.dashboard.appCategoriesCollapsed[category] ? "▸" : "▾"} ${category}
            </button>
            <div class="grid grid-cols-1 gap-1 ${state.dashboard.appCategoriesCollapsed[category] ? "hidden" : ""}">
              ${items
                .map(
                  (app) => `
                  <div class="flex items-center justify-between rounded bg-slate-900 px-2 py-1">
                    <button class="text-left flex-1 truncate hover:text-slate-50" data-launch-app="${app.id}">
                      ${app.name}
                    </button>
                    <button class="ml-2 text-xs text-slate-400 hover:text-slate-200" data-edit-app="${app.id}">Edit</button>
                    <button class="ml-2 text-xs text-red-300 hover:text-red-200" data-delete-app="${app.id}">Del</button>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>
        `
          )
          .join("");

  const resourcesList = el("resourcesList");
  const resByCat = groupByCategory(resources);
  resourcesList.innerHTML =
    resources.length === 0
      ? "No resources yet."
      : Object.entries(resByCat)
          .map(
            ([category, items]) => `
          <div class="mb-2">
            <button class="w-full text-left text-xs uppercase tracking-wide text-slate-400 mb-1 hover:text-slate-200" data-toggle-resource-category="${category}">
              ${state.dashboard.resourceCategoriesCollapsed[category] ? "▸" : "▾"} ${category}
            </button>
            <div class="space-y-1 ${state.dashboard.resourceCategoriesCollapsed[category] ? "hidden" : ""}">
              ${items
                .map(
                  (res) => `
                  <div class="flex items-center justify-between rounded bg-slate-900 px-2 py-1">
                    <button class="text-left flex-1 truncate hover:text-slate-50" data-open-resource="${res.id}">
                      ${res.name}
                    </button>
                    <button class="ml-2 text-xs text-slate-400 hover:text-slate-200" data-edit-resource="${res.id}">Edit</button>
                    <button class="ml-2 text-xs text-red-300 hover:text-red-200" data-delete-resource="${res.id}">Del</button>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>
        `
          )
          .join("");
}

function renderKanban() {
  const root = el("kanbanColumns");
  root.innerHTML = "";
  const doneColumnId = getDoneColumnId();
  state.columns.forEach((column, index) => {
    const tasks = state.tasks.filter((task) => task.column_id === column.id);
    const col = document.createElement("div");
    col.className = "rounded border border-slate-800 p-3 bg-slate-900";
    col.dataset.columnId = String(column.id);
    col.dataset.columnCard = "true";
    col.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold">${column.name}</h3>
        <div class="flex items-center gap-1">
          <button class="text-xs text-slate-400 hover:text-slate-200" data-drag-column="${column.id}" title="Drag to reorder">↕</button>
          <button class="text-xs text-slate-400 hover:text-slate-200" data-move-column-left="${column.id}" ${
            index === 0 ? "disabled" : ""
          }>◀</button>
          <button class="text-xs text-slate-400 hover:text-slate-200" data-move-column-right="${column.id}" ${
            index === state.columns.length - 1 ? "disabled" : ""
          }>▶</button>
          <button class="text-xs text-slate-400 hover:text-slate-200" data-rename-column="${column.id}">Rename</button>
          <button class="text-xs text-red-300 hover:text-red-200" data-delete-column="${column.id}">Delete</button>
        </div>
      </div>
      <div class="space-y-2 min-h-12" data-dropzone="true">
        ${
          tasks.length
            ? tasks
                .map(
                  (task) => `
                    <div
                      class="rounded border ${
                        isTaskBlocked(task, doneColumnId)
                          ? "bg-amber-950/30 border-amber-700/60"
                          : "bg-slate-800 border-slate-700/40"
                      } p-2 text-sm flex items-center justify-between cursor-grab active:cursor-grabbing group"
                      draggable="true"
                      data-task-card="true"
                      data-task-id="${task.id}"
                    >
                      <button class="text-left flex-1 pr-2 hover:text-slate-50" data-open-task="${task.id}">
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="inline-block h-2 w-2 rounded-full ${
                            isTaskBlocked(task, doneColumnId) ? "bg-amber-400" : "bg-emerald-400"
                          }"></span>
                          <span class="truncate">${task.title}</span>
                        </div>
                        <div class="mt-1 flex items-center gap-1">
                          <span class="rounded border px-1.5 py-0.5 text-[10px] ${priorityBadgeClass(task.priority)}">
                            ${(task.priority || "medium").toUpperCase()}
                          </span>
                        </div>
                      </button>
                      ${
                        isTaskBlocked(task, doneColumnId)
                          ? `<span class="text-[10px] text-amber-300 mr-2">Blocked (${getIncompleteBlockingTasks(task, doneColumnId).length})</span>`
                          : ""
                      }
                      <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button data-open-task="${task.id}" class="text-xs text-slate-300 hover:text-white">Edit</button>
                        <button data-delete-task="${task.id}" class="text-xs text-red-300 hover:text-red-200">Delete</button>
                      </div>
                    </div>
                  `
                )
                .join("")
            : `<div class="text-sm text-slate-400">No tasks</div>`
        }
      </div>
    `;
    root.appendChild(col);
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

  root.querySelectorAll("[data-rename-column]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const columnId = Number(btn.dataset.renameColumn);
      const column = state.columns.find((c) => c.id === columnId);
      if (!column) return;
      const name = await openTextModal({
        title: "Rename Column",
        label: "New column name",
        value: column.name,
      });
      if (!name) return;
      await apiCall("update_column", columnId, name, column.sort_order || 0);
      await loadWorkspaceData();
      renderKanban();
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
  if (!state.activeWorkspaceId) return;
  const [apps, resources, columns, tasks] = await Promise.all([
    apiCall("get_apps", state.activeWorkspaceId),
    apiCall("get_resources", state.activeWorkspaceId),
    apiCall("get_kanban_columns", state.activeWorkspaceId),
    apiCall("get_tasks", state.activeWorkspaceId),
  ]);
  state.lastApps = apps;
  state.lastResources = resources;
  state.columns = columns;
  state.tasks = tasks;
  renderDashboard(apps, resources);
}

async function persistColumnOrder(columns) {
  await Promise.all(
    columns.map((column, index) =>
      apiCall("update_column", column.id, column.name, index)
    )
  );
}

function openCrudModal(kind, mode, entity = null) {
  state.crud.open = true;
  state.crud.kind = kind;
  state.crud.mode = mode;
  state.crud.entityId = entity?.id ?? null;

  const isApp = kind === "app";
  el("crudModalTitle").textContent = `${mode === "create" ? "Add" : "Edit"} ${isApp ? "App" : "Resource"}`;
  el("crudCommandRow").classList.toggle("hidden", !isApp);
  el("crudTypeRow").classList.toggle("hidden", isApp);
  el("crudPathRow").classList.toggle("hidden", isApp);
  el("crudDescriptionRow").classList.toggle("hidden", isApp);

  el("crudName").value = entity?.name ?? "";
  el("crudCategory").value = entity?.category ?? "Uncategorized";
  el("crudCommand").value = entity?.command_path ?? "";
  el("crudType").value = entity?.type ?? "file";
  el("crudPath").value = entity?.path ?? "";
  el("crudDescription").value = entity?.description ?? "";
  el("crudModalRoot").classList.remove("hidden");
}

function closeCrudModal() {
  state.crud.open = false;
  state.crud.kind = null;
  state.crud.entityId = null;
  el("crudModalRoot").classList.add("hidden");
}

function openTextModal({ title, label, value = "" }) {
  state.textModal.open = true;
  el("textModalTitle").textContent = title;
  el("textModalLabel").textContent = label;
  el("textModalInput").value = value;
  el("textModalRoot").classList.remove("hidden");
  el("textModalInput").focus();
  el("textModalInput").select();

  return new Promise((resolve) => {
    state.textModal.resolver = resolve;
  });
}

function closeTextModal(result = null) {
  if (state.textModal.resolver) state.textModal.resolver(result);
  state.textModal.open = false;
  state.textModal.resolver = null;
  el("textModalRoot").classList.add("hidden");
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

function openSafeNoteModal() {
  state.safeNoteModal.open = true;
  el("safeNoteTitle").value = "";
  el("safeNoteContent").value = "";
  el("safeNoteModalRoot").classList.remove("hidden");
  el("safeNoteTitle").focus();
}

function closeSafeNoteModal() {
  state.safeNoteModal.open = false;
  el("safeNoteModalRoot").classList.add("hidden");
}

function renderWorkspaceSettingsList() {
  const root = el("workspaceSettingsList");
  root.innerHTML = state.workspaces
    .map(
      (workspace) => `
      <div class="flex items-center justify-between rounded bg-slate-900 px-3 py-2">
        <span class="truncate pr-2">${workspace.icon || "fa-folder"} ${workspace.name}</span>
        <div class="flex items-center gap-2">
          <button class="text-xs text-sky-300 hover:text-sky-200" data-edit-workspace-icon="${workspace.id}">Icon</button>
          <button class="text-xs text-slate-300 hover:text-white" data-rename-workspace="${workspace.id}">Rename</button>
          <button class="text-xs text-red-300 hover:text-red-200" data-delete-workspace="${workspace.id}">Delete</button>
        </div>
      </div>
    `
    )
    .join("");
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
  await refreshSafePanel();
}

function closeSettingsModal() {
  state.settings.open = false;
  el("settingsModalRoot").classList.add("hidden");
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
    if (state.crud.mode === "create") {
      await apiCall("create_app", state.activeWorkspaceId, name, commandPath, category);
    } else {
      await apiCall("update_app", state.crud.entityId, name, commandPath, category);
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
  const done = state.columns.find((c) => c.name?.trim().toLowerCase() === "done");
  return done ? done.id : null;
}

function getSelectedIds(selectId) {
  return Array.from(el(selectId).selectedOptions).map((option) => Number(option.value));
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
  if (normalized === "critical") return "bg-red-900/70 text-red-200 border-red-700/70";
  if (normalized === "high") return "bg-amber-900/60 text-amber-200 border-amber-700/70";
  if (normalized === "low") return "bg-sky-900/60 text-sky-200 border-sky-700/70";
  return "bg-slate-800 text-slate-200 border-slate-700";
}

function populateMultiSelect(selectId, options, selectedIds) {
  const selectedSet = new Set(selectedIds.map((id) => Number(id)));
  const select = el(selectId);
  select.innerHTML = options
    .map(
      (option) =>
        `<option value="${option.id}" ${selectedSet.has(Number(option.id)) ? "selected" : ""}>${
          option.name || option.title || `#${option.id}`
        }</option>`
    )
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

function openSearchModal() {
  state.search.open = true;
  el("searchModalRoot").classList.remove("hidden");
  el("searchInput").value = "";
  el("searchResults").innerHTML = `<div class="text-slate-400 px-2 py-2">Loading index...</div>`;
  buildSearchIndex()
    .then(() => {
      el("searchResults").innerHTML = `<div class="text-slate-400 px-2 py-2">Type to search...</div>`;
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

async function buildSearchIndex() {
  const workspaces = await apiCall("get_workspaces");
  const index = [];

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
      })
    );

    tasks.forEach((task) =>
      index.push({
        kind: "task",
        id: task.id,
        workspace_id: workspace.id,
        title: task.title,
        subtitle: `Task in ${workspace.name}`,
      })
    );
  }

  state.search.index = index;
}

function renderSearchResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    el("searchResults").innerHTML = `<div class="text-slate-400 px-2 py-2">Type to search...</div>`;
    return;
  }
  const results = state.search.index
    .map((entry) => ({ entry, score: scoreSearchEntry(entry, q) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, 100)
    .map((item) => item.entry);

  if (!results.length) {
    el("searchResults").innerHTML = `<div class="text-slate-400 px-2 py-2">No matches.</div>`;
    return;
  }

  el("searchResults").innerHTML = results
    .map(
      (entry) => `
      <button
        class="w-full text-left rounded px-2 py-2 hover:bg-slate-900 flex items-center justify-between"
        data-search-kind="${entry.kind}"
        data-search-id="${entry.id}"
        data-search-workspace-id="${entry.workspace_id}"
      >
        <span class="truncate pr-2">${entry.title}</span>
        <span class="text-xs text-slate-400">${entry.subtitle}</span>
      </button>
    `
    )
    .join("");
}

function scoreSearchEntry(entry, query) {
  const title = String(entry.title || "").toLowerCase();
  const subtitle = String(entry.subtitle || "").toLowerCase();
  const full = `${title} ${subtitle}`.trim();

  if (!title && !subtitle) return 0;

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
  state.activeWorkspaceId = workspaceId;
  await loadWorkspaceData();
  renderAll();
}

async function handleSearchResultClick(entryKind, entryId, workspaceId) {
  await jumpToWorkspace(workspaceId);

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

  el("taskDescription").value = task.description_md || "";

  const labels = Array.isArray(task.labels)
    ? task.labels
    : safeJsonParse(task.labels || "[]", []);
  el("taskLabels").value = labels.join(", ");
  populateMultiSelect("taskAppIds", state.lastApps || [], toIdArray(task.app_ids));
  populateMultiSelect("taskResourceIds", state.lastResources || [], toIdArray(task.resource_ids));
  populateMultiSelect(
    "taskBlockingIds",
    state.tasks.filter((candidate) => candidate.id !== task.id),
    toIdArray(task.blocking_task_ids)
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
    JSON.stringify(getSelectedIds("taskResourceIds"))
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

function renderSafePanel() {
  const statusEl = el("safeStatus");
  const vaultSelect = el("safeVaultSelect");
  const itemsList = el("safeItemsList");
  const detailEl = el("safeItemDetail");
  const searchInput = el("safeItemSearch");
  const showTrashedCheckbox = el("safeShowTrashed");
  if (!statusEl || !vaultSelect || !itemsList || !detailEl || !searchInput || !showTrashedCheckbox) return;
  searchInput.value = state.safe.searchQuery;
  showTrashedCheckbox.checked = state.safe.showTrashed;

  const status = state.safe.status;
  if (!status) {
    statusEl.textContent = "Checking Proton Pass CLI status...";
  } else if (!status.installed) {
    statusEl.textContent =
      "Proton Pass CLI is not installed. Install pass-cli and run `pass-cli login` in terminal.";
  } else if (!status.logged_in) {
    statusEl.textContent = `Not logged in: ${status.message || "Run pass-cli login in terminal."}`;
  } else {
    statusEl.textContent = "Connected to Proton Pass CLI.";
  }

  vaultSelect.innerHTML = state.safe.vaults.length
    ? state.safe.vaults
        .map(
          (vault) =>
            `<option value="${vault.id}" ${
              String(vault.id) === String(state.safe.selectedVaultId) ? "selected" : ""
            }>${vault.name}</option>`
        )
        .join("")
    : `<option value="">No vaults available</option>`;
  vaultSelect.disabled = !state.safe.vaults.length;

  const filteredItems = state.safe.items.filter((item) => {
    const stateValue = String(item.state || "").toLowerCase();
    if (!state.safe.showTrashed && stateValue === "trashed") return false;
    if (!state.safe.searchQuery.trim()) return true;
    return String(item.name || "")
      .toLowerCase()
      .includes(state.safe.searchQuery.trim().toLowerCase());
  });
  itemsList.innerHTML = filteredItems.length
    ? filteredItems
        .map(
          (item) => `
        <button
          class="w-full text-left rounded px-2 py-1 flex items-center justify-between ${
            String(item.id) === String(state.safe.selectedItemId) ? "bg-slate-800" : "bg-slate-950 hover:bg-slate-900"
          }"
          data-safe-item-id="${item.id}"
        >
          <span class="truncate pr-2">${item.name}</span>
          <span class="text-[10px] text-slate-500">${item.state || item.type || "item"}</span>
        </button>
      `
        )
        .join("")
    : `<div class="text-slate-500">No items.</div>`;

  if (!state.safe.selectedItemDetail) {
    detailEl.textContent = "Select an item to load details.";
  } else {
    const detail = state.safe.selectedItemDetail;
    const fields = detail.fields || {};
    const normalizedFields = { ...fields };
    if (normalizedFields.password && !state.safe.revealPassword) {
      normalizedFields.password = "••••••••";
    }
    if (state.safe.latestTotp) {
      normalizedFields.totp = state.safe.latestTotp;
    }
    const fieldRows = Object.entries(fields)
      .filter(([k]) => k !== "totp_uri")
      .map(
        ([k, _v]) => `
        <div class="py-1 border-b border-slate-900">
          <div class="text-[10px] uppercase tracking-wide text-slate-500">${k}</div>
          <div class="text-slate-200 break-all">${normalizedFields[k] ?? ""}</div>
        </div>
      `
      )
      .join("");
    detailEl.innerHTML = `
      <div class="mb-2">
        <div class="text-slate-200 font-semibold">${detail.name || detail.id}</div>
        <div class="text-[10px] text-slate-500">${detail.id}</div>
      </div>
      ${fieldRows || '<div class="text-slate-500">No readable fields returned for this item.</div>'}
      ${
        fields.password
          ? `<button id="safeTogglePasswordBtn" class="mt-2 rounded bg-slate-800 px-2 py-1 text-[10px] hover:bg-slate-700">${
              state.safe.revealPassword ? "Hide Password" : "Reveal Password"
            }</button>`
          : ""
      }
    `;
    const toggleBtn = el("safeTogglePasswordBtn");
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        state.safe.revealPassword = !state.safe.revealPassword;
        renderSafePanel();
      };
    }
  }

  renderSafeSettingsStatus();
}

function renderSafeSettingsStatus() {
  const statusEl = el("safeSettingsStatus");
  if (!statusEl) return;
  const status = state.safe.status;
  if (!status) {
    statusEl.textContent = "Checking status...";
    return;
  }
  if (!status.installed) {
    statusEl.textContent = "pass-cli is not installed.";
    return;
  }
  if (!status.logged_in) {
    statusEl.textContent = `Not logged in. ${status.message || ""}`.trim();
    return;
  }
  statusEl.textContent = "Logged in and ready.";
}

async function loadSafeStatus() {
  const status = await apiCall("safe_cli_status");
  state.safe.status = status;
  return status;
}

async function loadSafeVaults() {
  const result = await apiCall("safe_cli_list_vaults");
  if (!result?.ok) {
    throw new Error(result?.error || "Failed to load vaults.");
  }
  state.safe.vaults = result.vaults || [];
  if (!state.safe.vaults.length) {
    state.safe.selectedVaultId = null;
    state.safe.items = [];
    return;
  }
  if (
    !state.safe.selectedVaultId ||
    !state.safe.vaults.some((v) => String(v.id) === String(state.safe.selectedVaultId))
  ) {
    state.safe.selectedVaultId = state.safe.vaults[0].id;
  }
}

async function loadSafeItems() {
  if (!state.safe.selectedVaultId) {
    state.safe.items = [];
    return;
  }
  const result = await apiCall("safe_cli_list_items", String(state.safe.selectedVaultId));
  if (!result?.ok) {
    throw new Error(result?.error || "Failed to load items.");
  }
  state.safe.items = result.items || [];
  if (!state.safe.items.some((item) => String(item.id) === String(state.safe.selectedItemId))) {
    state.safe.selectedItemId = null;
    state.safe.selectedItemDetail = null;
    state.safe.latestTotp = "";
  }
}

async function loadSafeItemDetail(itemId) {
  if (!state.safe.selectedVaultId || !itemId) {
    state.safe.selectedItemDetail = null;
    return;
  }
  const result = await apiCall("safe_cli_get_item", String(state.safe.selectedVaultId), String(itemId));
  if (!result?.ok) {
    throw new Error(result?.error || "Failed to load item detail.");
  }
  state.safe.selectedItemDetail = result.item || null;
  state.safe.revealPassword = false;
  state.safe.latestTotp = "";
}

async function refreshSafePanel() {
  try {
    const status = await loadSafeStatus();
    if (!status.installed || !status.logged_in) {
      state.safe.vaults = [];
      state.safe.items = [];
      renderSafePanel();
      return;
    }
    await loadSafeVaults();
    if (state.activeWorkspaceId && state.safe.vaults.length) {
      const pref = await apiCall("get_workspace_safe_pref", state.activeWorkspaceId);
      const preferredVaultId = pref?.vault_id;
      if (
        preferredVaultId &&
        state.safe.vaults.some((vault) => String(vault.id) === String(preferredVaultId))
      ) {
        state.safe.selectedVaultId = preferredVaultId;
      }
    }
    await loadSafeItems();
    renderSafePanel();
  } catch (error) {
    state.safe.items = [];
    renderSafePanel();
    notify(`Safe refresh failed: ${error.message}`, "error");
  }
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
    await loadWorkspaceData();
    await refreshSafePanel();
  }
  renderAll();
}

function initUI() {
  el("showDashboard").onclick = () => setView("dashboard");
  el("showKanban").onclick = () => setView("kanban");
  el("toggleLauncherBtn").onclick = () => {
    state.dashboard.launcherCollapsed = !state.dashboard.launcherCollapsed;
    renderDashboard(state.lastApps || [], state.lastResources || []);
  };
  el("toggleLibraryBtn").onclick = () => {
    state.dashboard.libraryCollapsed = !state.dashboard.libraryCollapsed;
    renderDashboard(state.lastApps || [], state.lastResources || []);
  };
  el("toggleSafeBtn").onclick = () => {
    state.dashboard.safeCollapsed = !state.dashboard.safeCollapsed;
    renderDashboard(state.lastApps || [], state.lastResources || []);
  };
  el("openSettingsBtn").onclick = () => {
    openSettingsModal().catch((error) => {
      notify(`Failed to open settings: ${error.message}`, "error");
    });
  };
  el("openSearchBtn").onclick = () => {
    openSearchModal();
  };
  el("safeRefreshBtn").onclick = () => {
    refreshSafePanel().then(() => notify("Safe panel refreshed.", "success"));
  };
  el("safeCreateNoteBtn").onclick = () => {
    if (!state.safe.selectedVaultId) {
      notify("Select a vault first.", "info");
      return;
    }
    openSafeNoteModal();
  };
  el("safeStatusRefreshBtn").onclick = () => {
    refreshSafePanel().then(() => notify("Safe status refreshed.", "success"));
  };
  el("safeLoginBtn").onclick = async () => {
    try {
      const result = await apiCall("safe_cli_login");
      if (!result?.ok) {
        notify(result?.error || "Failed to start pass-cli login.", "error");
        return;
      }
      notify("Opened terminal for pass-cli login.", "success");
      await refreshSafePanel();
    } catch (error) {
      notify(`Failed to start login: ${error.message}`, "error");
    }
  };
  el("safeLogoutBtn").onclick = async () => {
    try {
      const result = await apiCall("safe_cli_logout");
      if (!result?.ok) {
        notify(result?.error || "Failed to logout from pass-cli.", "error");
        return;
      }
      notify("Logged out from pass-cli.", "success");
      await refreshSafePanel();
    } catch (error) {
      notify(`Failed to logout: ${error.message}`, "error");
    }
  };
  el("safeDebugBtn").onclick = async () => {
    try {
      const vaultId = state.safe.selectedVaultId || "";
      const result = await apiCall("safe_cli_debug", String(vaultId));
      if (!result?.ok) {
        notify(result?.error || "Safe debug failed.", "error");
        return;
      }
      const lines = (result.runs || []).map((run) => {
        const stderr = (run.stderr || "").replace(/\s+/g, " ").trim();
        return `${run.ok ? "OK" : "ERR"} :: pass-cli ${run.args.join(" ")} :: ${stderr || "no stderr"}`;
      });
      notify(lines[0] || "No debug output.", "info");
      console.log("Safe CLI Debug", result);
    } catch (error) {
      notify(`Safe debug failed: ${error.message}`, "error");
    }
  };
  el("safeVaultSelect").addEventListener("change", (event) => {
    state.safe.selectedVaultId = event.target.value || null;
    state.safe.selectedItemId = null;
    state.safe.selectedItemDetail = null;
    state.safe.latestTotp = "";
    if (state.activeWorkspaceId && state.safe.selectedVaultId) {
      apiCall("set_workspace_safe_pref", state.activeWorkspaceId, state.safe.selectedVaultId).catch((error) =>
        notify(`Failed to save default vault: ${error.message}`, "error")
      );
    }
    loadSafeItems()
      .then(() => renderSafePanel())
      .catch((error) => notify(`Failed to load vault items: ${error.message}`, "error"));
  });
  el("safeItemSearch").addEventListener("input", (event) => {
    state.safe.searchQuery = event.target.value || "";
    renderSafePanel();
  });
  el("safeShowTrashed").addEventListener("change", (event) => {
    state.safe.showTrashed = Boolean(event.target.checked);
    renderSafePanel();
  });
  el("safeItemsList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-safe-item-id]");
    if (!button) return;
    const itemId = button.dataset.safeItemId;
    state.safe.selectedItemId = itemId;
    loadSafeItemDetail(itemId)
      .then(() => renderSafePanel())
      .catch((error) => notify(`Failed to load item detail: ${error.message}`, "error"));
  });
  el("safeCopyPrimaryBtn").onclick = async () => {
    const fields = state.safe.selectedItemDetail?.fields || {};
    const primary = fields.username || fields.email || "";
    if (!primary) {
      notify("No username/email to copy.", "info");
      return;
    }
    const ok = await copyToClipboard(primary);
    notify(ok ? "Copied login to clipboard." : "Failed to copy login.", ok ? "success" : "error");
  };
  el("safeCopyPasswordBtn").onclick = async () => {
    const fields = state.safe.selectedItemDetail?.fields || {};
    const value = fields.password || "";
    if (!value) {
      notify("No password field available.", "info");
      return;
    }
    const ok = await copyToClipboard(value);
    notify(ok ? "Copied password to clipboard." : "Failed to copy password.", ok ? "success" : "error");
  };
  el("safeTotpBtn").onclick = async () => {
    if (!state.safe.selectedVaultId || !state.safe.selectedItemId) {
      notify("Select an item first.", "info");
      return;
    }
    try {
      const result = await apiCall(
        "safe_cli_get_totp",
        String(state.safe.selectedVaultId),
        String(state.safe.selectedItemId)
      );
      if (!result?.ok || !result?.totp) {
        notify(result?.error || "No TOTP available for this item.", "error");
        return;
      }
      state.safe.latestTotp = result.totp;
      renderSafePanel();
      const copied = await copyToClipboard(result.totp);
      notify(copied ? "TOTP copied to clipboard." : `TOTP: ${result.totp}`, copied ? "success" : "info");
    } catch (error) {
      notify(`Failed to get TOTP: ${error.message}`, "error");
    }
  };
  el("safeDeleteItemBtn").onclick = async () => {
    if (!state.safe.selectedVaultId || !state.safe.selectedItemId) {
      notify("Select an item first.", "info");
      return;
    }
    const selected = state.safe.items.find(
      (item) => String(item.id) === String(state.safe.selectedItemId)
    );
    const itemName = selected?.name || state.safe.selectedItemDetail?.name || `#${state.safe.selectedItemId}`;
    const ok = await openConfirmModal({
      title: "Delete Safe Item",
      message: `Delete "${itemName}" from Proton Pass?`,
    });
    if (!ok) return;
    try {
      const result = await apiCall(
        "safe_cli_delete_item",
        String(state.safe.selectedVaultId),
        String(state.safe.selectedItemId)
      );
      if (!result?.ok) {
        throw new Error(result?.error || "Delete failed");
      }
      state.safe.selectedItemId = null;
      state.safe.selectedItemDetail = null;
      state.safe.latestTotp = "";
      await loadSafeItems();
      renderSafePanel();
      notify("Safe item deleted.", "success");
    } catch (error) {
      notify(`Failed to delete item: ${error.message}`, "error");
    }
  };
  el("safeNoteBackdrop").onclick = closeSafeNoteModal;
  el("safeNoteClose").onclick = closeSafeNoteModal;
  el("safeNoteCancel").onclick = closeSafeNoteModal;
  el("safeNoteSave").onclick = async () => {
    if (!state.safe.selectedVaultId) {
      notify("Select a vault first.", "info");
      return;
    }
    const title = el("safeNoteTitle").value.trim();
    const note = el("safeNoteContent").value.trim();
    if (!title) {
      notify("Note title is required.", "error");
      return;
    }
    try {
      const result = await apiCall("safe_cli_create_note", String(state.safe.selectedVaultId), title, note);
      if (!result?.ok) {
        throw new Error(result?.error || "Create note failed");
      }
      closeSafeNoteModal();
      await loadSafeItems();
      renderSafePanel();
      notify("Secure note created.", "success");
    } catch (error) {
      notify(`Failed to create note: ${error.message}`, "error");
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
    if (event.key === "Escape" && state.safeNoteModal.open) {
      closeSafeNoteModal();
      return;
    }
    if (event.key === "Enter" && state.textModal.open) {
      event.preventDefault();
      const value = el("textModalInput").value.trim();
      closeTextModal(value || null);
    }
  });

  el("searchBackdrop").onclick = closeSearchModal;
  el("searchInput").addEventListener("input", (event) => {
    renderSearchResults(event.target.value || "");
  });
  el("searchResults").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-search-kind]");
    if (!btn) return;
    const kind = btn.dataset.searchKind;
    const id = Number(btn.dataset.searchId);
    const workspaceId = Number(btn.dataset.searchWorkspaceId);
    handleSearchResultClick(kind, id, workspaceId).catch((error) => {
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
  el("textBackdrop").onclick = () => closeTextModal(null);
  el("textModalClose").onclick = () => closeTextModal(null);
  el("textCancel").onclick = () => closeTextModal(null);
  el("textSave").onclick = () => {
    const value = el("textModalInput").value.trim();
    closeTextModal(value || null);
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
        label: "Icon label (e.g. fa-folder, fa-code, Dev)",
        value: workspace.icon || "fa-folder",
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
        await apiCall("update_workspace", workspaceId, name, workspace.icon || "fa-folder");
        state.workspaces = await apiCall("get_workspaces");
        if (workspaceId === state.activeWorkspaceId) await refreshSafePanel();
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
        const created = await apiCall("create_workspace", "Default", "fa-folder");
        state.workspaces = await apiCall("get_workspaces");
        state.activeWorkspaceId = created.id;
      } else if (!state.workspaces.some((w) => w.id === state.activeWorkspaceId)) {
        state.activeWorkspaceId = state.workspaces[0].id;
      }
      await loadWorkspaceData();
      await refreshSafePanel();
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
      label: "Icon label (optional)",
      value: "fa-folder",
    });
    try {
      await apiCall("create_workspace", name, icon || "fa-folder");
      state.workspaces = await apiCall("get_workspaces");
      state.activeWorkspaceId = state.workspaces[state.workspaces.length - 1].id;
      await loadWorkspaceData();
      await refreshSafePanel();
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
      await apiCall("create_task", state.activeWorkspaceId, state.columns[0].id, title);
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

  el("addResourceBtn").onclick = async () => {
    if (!state.activeWorkspaceId) return;
    openCrudModal("resource", "create");
  };

  el("appsList").addEventListener("click", async (event) => {
    const toggleAppCategoryBtn = event.target.closest("[data-toggle-app-category]");
    if (toggleAppCategoryBtn) {
      const category = toggleAppCategoryBtn.dataset.toggleAppCategory;
      state.dashboard.appCategoriesCollapsed[category] = !state.dashboard.appCategoriesCollapsed[category];
      renderDashboard(state.lastApps || [], state.lastResources || []);
      return;
    }
    const launchBtn = event.target.closest("[data-launch-app]");
    const editBtn = event.target.closest("[data-edit-app]");
    const deleteBtn = event.target.closest("[data-delete-app]");
    if (!launchBtn && !editBtn && !deleteBtn) return;

    const sourceBtn = launchBtn || editBtn || deleteBtn;
    const appId = Number(
      sourceBtn.dataset.launchApp || sourceBtn.dataset.editApp || sourceBtn.dataset.deleteApp
    );
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

    if (deleteBtn) {
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
      return;
    }

    openCrudModal("app", "edit", app);
  });

  el("resourcesList").addEventListener("click", async (event) => {
    const toggleResourceCategoryBtn = event.target.closest("[data-toggle-resource-category]");
    if (toggleResourceCategoryBtn) {
      const category = toggleResourceCategoryBtn.dataset.toggleResourceCategory;
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

  bootstrap().catch((error) => {
    console.error(error);
    notify(`Bootstrap error: ${error.message}`, "error");
  });
}

window.addEventListener("pywebviewready", initUI);
