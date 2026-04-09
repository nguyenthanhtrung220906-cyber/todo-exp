/**
 * Todo EXP — Renderer
 *
 * Features: Tasks, EXP/Level system, Context menus (fixed), i18n (EN/VI),
 *           Dark mode, Sounds, Daily streak, Group system for lists.
 *
 * Group data model
 * ────────────────
 * state.groups = [{ id, name, collapsed, listIds: [] }, ...]
 *
 * A list's "group membership" is determined entirely by whether its id appears
 * inside any group.listIds array.  Lists not in any group render ungrouped.
 *
 * Context menu on a list shows:
 *   – Rename / Delete  (always)
 *   – Create Group from this List  (always)
 *   – Add to Group  (only when groups exist AND list is not already in that group)
 *   – Remove from Group  (only when list is currently in a group)
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const EXP_PER_LEVEL = 100;
const uid = () => Math.random().toString(36).slice(2, 10);

// ─── Translations ─────────────────────────────────────────────────────────────
const translations = {
  en: {
    newList:              'New List',
    newGroup:             'New Group',
    selectList:           'Select or create a list to get started',
    completedOf:          (d, n) => `${d} of ${n} completed`,
    taskPlaceholder:      'Add a task…',
    add:                  'Add',
    all:                  'All',
    active:               'Active',
    completed:            'Completed',
    emptyAll:             'Add your first task above',
    emptyActive:          'All tasks done! 🎉',
    emptyCompleted:       'No completed tasks yet',
    editTask:             'Edit Task',
    changeExp:            'Change EXP',
    removeTask:           'Remove Task',
    rename:               'Rename',
    delete:               'Delete',
    editTaskTitle:        'Edit Task',
    setExpTitle:          'Set EXP Value',
    renameListTitle:      'Rename List',
    renameGroupTitle:     'Rename Group',
    createGroupTitle:     'Create Group',
    createGroupFromList:  'Create Group from this List',
    addToGroup:           'Add to Group',
    removeFromGroup:      'Remove from Group',
    deleteGroup:          'Delete Group',
    groupNamePlaceholder: 'Group name…',
    cancel:               'Cancel',
    save:                 'Save',
    create:               'Create',
    ok:                   'OK',
    lvl:                  'LVL',
    expUnit:              'EXP',
    langToggle:           'Switch to Vietnamese',
    cannotDeleteLast:     'Cannot delete the last list.',
    levelBadge:           (n) => `⚡ LVL ${n}`,
    streak:               'Streak',
    days:                 'days',
    streakTooltip:        'Complete at least one task per day to keep your streak',
    levelUp:              'Level Up!',
  },
  vi: {
    newList:              'Danh sách mới',
    newGroup:             'Nhóm mới',
    selectList:           'Chọn hoặc tạo danh sách để bắt đầu',
    completedOf:          (d, n) => `${d} trong ${n} đã hoàn thành`,
    taskPlaceholder:      'Thêm nhiệm vụ…',
    add:                  'Thêm',
    all:                  'Tất cả',
    active:               'Đang làm',
    completed:            'Hoàn thành',
    emptyAll:             'Hãy thêm nhiệm vụ đầu tiên',
    emptyActive:          'Hoàn thành hết rồi! 🎉',
    emptyCompleted:       'Chưa có nhiệm vụ nào hoàn thành',
    editTask:             'Chỉnh sửa',
    changeExp:            'Đổi điểm EXP',
    removeTask:           'Xóa nhiệm vụ',
    rename:               'Đổi tên',
    delete:               'Xóa',
    editTaskTitle:        'Chỉnh sửa nhiệm vụ',
    setExpTitle:          'Đặt giá trị EXP',
    renameListTitle:      'Đổi tên danh sách',
    renameGroupTitle:     'Đổi tên nhóm',
    createGroupTitle:     'Tạo nhóm',
    createGroupFromList:  'Tạo nhóm từ danh sách này',
    addToGroup:           'Thêm vào nhóm',
    removeFromGroup:      'Xóa khỏi nhóm',
    deleteGroup:          'Xóa nhóm',
    groupNamePlaceholder: 'Tên nhóm…',
    cancel:               'Hủy',
    save:                 'Lưu',
    create:               'Tạo',
    ok:                   'OK',
    lvl:                  'CẤP',
    expUnit:              'EXP',
    langToggle:           'Chuyển sang tiếng Anh',
    cannotDeleteLast:     'Không thể xóa danh sách cuối cùng.',
    levelBadge:           (n) => `⚡ CẤP ${n}`,
    streak:               'Chuỗi ngày',
    days:                 'ngày',
    streakTooltip:        'Hoàn thành ít nhất một nhiệm vụ mỗi ngày để duy trì chuỗi',
    levelUp:              'Lên cấp!',
  }
};

let lang = localStorage.getItem('todoexp_lang') || 'en';

function t(key, ...args) {
  const val = translations[lang]?.[key] ?? translations['en'][key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(node => {
    const key = node.dataset.i18n;
    if (node.id === 'filterActive') {
      node.childNodes[0].textContent = t('active') + ' ';
    } else {
      node.textContent = t(key);
    }
  });
  document.getElementById('taskInput').placeholder = t('taskPlaceholder');
  document.getElementById('langToggleBtn').title    = t('langToggle');
  updateSubtitle();
}

// ─── Sounds ───────────────────────────────────────────────────────────────────
const Sounds = {
  _load(path) {
    return () => { const a = new Audio(path); a.volume = 0.55; a.play().catch(() => {}); };
  },
  complete: null, levelup: null,
  init() {
    this.complete = this._load('../assets/complete.mp3');
    this.levelup  = this._load('../assets/levelup.mp3');
  }
};

// ─── Streak ───────────────────────────────────────────────────────────────────
const Streak = {
  KEY: 'todoexp_streak',
  load() {
    try {
      const p = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (p && typeof p.count === 'number') return p;
    } catch (_) {}
    return { count: 0, lastDate: null };
  },
  save(d) { localStorage.setItem(this.KEY, JSON.stringify(d)); },
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  recordCompletion() {
    const data = this.load(), today = this.today();
    if (data.lastDate === today) return { count: data.count, isNew: false };
    let newCount = 1;
    if (data.lastDate) {
      const diff = Math.round((new Date(today+'T00:00:00') - new Date(data.lastDate+'T00:00:00')) / 86400000);
      if (diff === 1) newCount = data.count + 1;
    }
    this.save({ count: newCount, lastDate: today });
    return { count: newCount, isNew: true };
  },
  get count() { return this.load().count; }
};

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  lists:        [],
  tasks:        {},
  groups:       [],   // NEW: [{ id, name, collapsed, listIds }]
  exp:          0,
  dark:         false,
  activeListId: null
};

let currentFilter         = 'all';
let saveTimer             = null;
let dragSrcId             = null;
let contextMenuTargetId   = null;   // task id
let contextMenuTargetList = null;   // list object (for list context menu)

// ─── Group helpers ────────────────────────────────────────────────────────────

/** Return the group that contains listId, or null. */
function groupOfList(listId) {
  return state.groups.find(g => g.listIds.includes(listId)) || null;
}

/** Return true if listId is inside any group. */
function listIsGrouped(listId) {
  return state.groups.some(g => g.listIds.includes(listId));
}

/** Remove listId from whichever group currently contains it (no-op if none). */
function removeListFromAnyGroup(listId) {
  state.groups.forEach(g => {
    g.listIds = g.listIds.filter(id => id !== listId);
  });
}

/** Add listId to group, preventing duplicates. */
function addListToGroup(groupId, listId) {
  removeListFromAnyGroup(listId);   // a list can only be in one group
  const g = state.groups.find(g => g.id === groupId);
  if (g && !g.listIds.includes(listId)) g.listIds.push(listId);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  const saved = await window.electronAPI.loadData();
  // Merge, ensuring groups key exists (backward compat with saves that predate groups)
  state = { ...state, ...saved };
  if (!Array.isArray(state.groups)) state.groups = [];

  applyDark();
  applyI18n();

  const version = await window.electronAPI.getVersion();
  document.getElementById('versionLabel').textContent = 'v' + version;

  renderSidebar();

  if (state.activeListId && state.lists.find(l => l.id === state.activeListId)) {
    selectList(state.activeListId, false);
  } else if (state.lists.length > 0) {
    selectList(state.lists[0].id, false);
  } else {
    showEmptyMain();
  }

  Sounds.init();
  renderExpBar();
  renderStreak();
  bindStaticEvents();
  bindContextMenuDismiss();
  bindTaskListDelegation();
}

// ─── Static event binding ─────────────────────────────────────────────────────
function bindStaticEvents() {
  document.getElementById('btnMinimize').addEventListener('click', () => window.electronAPI.minimizeWindow());
  document.getElementById('btnMaximize').addEventListener('click', () => window.electronAPI.maximizeWindow());
  document.getElementById('btnClose').addEventListener('click',    () => window.electronAPI.closeWindow());

  document.getElementById('btnNewList').addEventListener('click',  createList);
  document.getElementById('btnNewGroup').addEventListener('click', openCreateGroupModal);
  document.getElementById('darkToggleBtn').addEventListener('click', toggleDark);
  document.getElementById('langToggleBtn').addEventListener('click', toggleLang);
  document.getElementById('dataFolderBtn').addEventListener('click', () => window.electronAPI.openDataFolder());

  document.getElementById('taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
  document.getElementById('taskInput').addEventListener('input',   e => {
    document.getElementById('addTaskBtn').style.display = e.target.value ? 'block' : 'none';
  });
  document.getElementById('addTaskBtn').addEventListener('click', addTask);

  document.getElementById('filterAll').addEventListener('click',       () => setFilter('all'));
  document.getElementById('filterActive').addEventListener('click',    () => setFilter('active'));
  document.getElementById('filterCompleted').addEventListener('click', () => setFilter('completed'));

  document.addEventListener('keydown', onGlobalKeydown);
}

// ─── Context menu dismiss (fixed mousedown pattern) ───────────────────────────
function bindContextMenuDismiss() {
  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('contextMenu');
    if (menu.style.display === 'none') return;
    if (menu.contains(e.target)) return;
    hideContextMenu();
  });
}

// ─── Task list delegation ─────────────────────────────────────────────────────
function bindTaskListDelegation() {
  const list = document.getElementById('taskList');

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.task-item');
    if (!item) return;
    if (e.target.closest('.checkbox')) {
      e.stopPropagation();
      const rect = e.target.closest('.checkbox').getBoundingClientRect();
      toggleTask(item.dataset.id, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  });

  list.addEventListener('dblclick', (e) => {
    const titleEl = e.target.closest('.task-title');
    if (!titleEl) return;
    const item = e.target.closest('.task-item');
    const task = getTaskById(item?.dataset.id);
    if (task) startInlineEdit(item, task);
  });

  list.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    const item = e.target.closest('.task-item');
    if (!item) return;
    contextMenuTargetId = item.dataset.id;
    showTaskContextMenu(e.clientX, e.clientY);
  });

  list.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.task-item');
    if (!item) return;
    dragSrcId = item.dataset.id;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  list.addEventListener('dragend', () => {
    document.querySelectorAll('.task-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const item = e.target.closest('.task-item');
    if (!item) return;
    document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
    item.classList.add('drag-over');
  });
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    const item = e.target.closest('.task-item');
    if (!item) return;
    if (dragSrcId && dragSrcId !== item.dataset.id) reorderTasks(dragSrcId, item.dataset.id);
    document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
  });
}

// ─── Auto-save ────────────────────────────────────────────────────────────────
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.electronAPI.saveData(state), 300);
}

// ─── i18n / Dark ──────────────────────────────────────────────────────────────
function toggleLang() {
  lang = lang === 'en' ? 'vi' : 'en';
  localStorage.setItem('todoexp_lang', lang);
  applyI18n();
  renderSidebar();
  renderTaskList();
  renderStreak();
  updateSubtitle();
}

function toggleDark() { state.dark = !state.dark; applyDark(); scheduleSave(); }
function applyDark() {
  document.body.classList.toggle('dark', state.dark);
  const btn = document.getElementById('darkToggleBtn');
  if (btn) btn.textContent = state.dark ? '☀️' : '🌙';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR RENDERING
// Layout:
//   [group header]         ← collapsible
//     [list button]
//     [list button]
//   [ungrouped list button]
//   [ungrouped list button]
// ═══════════════════════════════════════════════════════════════════════════════
function renderSidebar() {
  const container = document.getElementById('sidebarLists');
  container.innerHTML = '';

  // Collect IDs of all grouped lists so we can skip them in the ungrouped pass
  const groupedIds = new Set(state.groups.flatMap(g => g.listIds));

  // ── 1. Render groups ───────────────────────────────────────────────────────
  state.groups.forEach(group => {
    // Group header row
    const header = document.createElement('div');
    header.className = 'group-header';
    header.dataset.groupId = group.id;

    const chevron = document.createElement('span');
    chevron.className = 'group-chevron';
    chevron.textContent = group.collapsed ? '▶' : '▼';

    const icon = document.createElement('span');
    icon.className   = 'group-icon';
    icon.textContent = '📁';

    const nameSpan = document.createElement('span');
    nameSpan.className   = 'group-name';
    nameSpan.textContent = group.name;

    header.append(chevron, icon, nameSpan);

    // Toggle collapse on click
    header.addEventListener('click', (e) => {
      // Don't collapse if clicking the chevron area while a context menu is open
      if (document.getElementById('contextMenu').style.display !== 'none') return;
      group.collapsed = !group.collapsed;
      scheduleSave();
      renderSidebar();
    });

    // Group right-click menu
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      showGroupContextMenu(e.clientX, e.clientY, group);
    });

    container.appendChild(header);

    // ── 2. Lists inside group ────────────────────────────────────────────────
    if (!group.collapsed) {
      const listsInGroup = group.listIds
        .map(id => state.lists.find(l => l.id === id))
        .filter(Boolean);

      listsInGroup.forEach(list => {
        container.appendChild(makeListButton(list, true));
      });
    }
  });

  // ── 3. Ungrouped lists ─────────────────────────────────────────────────────
  state.lists
    .filter(l => !groupedIds.has(l.id))
    .forEach(list => container.appendChild(makeListButton(list, false)));
}

/** Build a sidebar list button. `indented` = visually inset inside a group. */
function makeListButton(list, indented) {
  const btn = document.createElement('button');
  btn.className = 'list-btn' + (list.id === state.activeListId ? ' active' : '') + (indented ? ' grouped' : '');
  btn.dataset.id = list.id;

  const tasks      = state.tasks[list.id] || [];
  const incomplete = tasks.filter(t => !t.completed).length;

  btn.innerHTML = `
    <span class="list-icon">${list.icon || '📋'}</span>
    <span class="list-name">${escHtml(list.name)}</span>
    ${incomplete > 0 ? `<span class="list-count">${incomplete}</span>` : ''}
  `;

  btn.addEventListener('click', () => selectList(list.id));

  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    contextMenuTargetList = list;
    showListContextMenu(e.clientX, e.clientY, list);
  });

  return btn;
}

// ─── List selection ───────────────────────────────────────────────────────────
function selectList(id, save = true) {
  state.activeListId = id;
  if (save) scheduleSave();

  document.querySelectorAll('.list-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === id);
  });

  const list = state.lists.find(l => l.id === id);
  if (!list) { showEmptyMain(); return; }

  document.getElementById('emptyMain').style.display    = 'none';
  document.getElementById('listView').style.display     = 'flex';
  document.getElementById('listHeaderIcon').textContent = list.icon || '📋';
  document.getElementById('listTitle').textContent      = list.name;

  currentFilter = 'all';
  updateFilterButtons();
  renderTaskList();
  updateSubtitle();
}

function showEmptyMain() {
  document.getElementById('emptyMain').style.display = 'flex';
  document.getElementById('listView').style.display  = 'none';
}

// ─── Task rendering ───────────────────────────────────────────────────────────
function renderTaskList() {
  const container = document.getElementById('taskList');
  container.innerHTML = '';
  const tasks = getFilteredTasks();

  if (tasks.length === 0) {
    const msg  = currentFilter === 'completed' ? t('emptyCompleted')
               : currentFilter === 'active'    ? t('emptyActive')
               :                                 t('emptyAll');
    const icon = currentFilter === 'active' ? '🎉' : '✨';
    container.innerHTML = `<div class="empty-tasks"><div class="empty-tasks-icon">${icon}</div><p>${escHtml(msg)}</p></div>`;
    return;
  }

  tasks.forEach(task => {
    const div = document.createElement('div');
    div.className  = 'task-item' + (task.completed ? ' completed' : '');
    div.dataset.id = task.id;
    div.draggable  = true;
    div.innerHTML  = `
      <button class="checkbox ${task.completed ? 'checked' : ''}" aria-label="Toggle">
        ${task.completed ? `<svg viewBox="0 0 12 10" fill="none" stroke="white" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"><polyline points="1,5 4,8 11,1"/></svg>` : ''}
      </button>
      <div class="task-body">
        <span class="task-title">${escHtml(task.title)}</span>
      </div>
      <span class="exp-badge ${task.completed ? 'earned' : ''}">⚡${task.expValue}</span>
      <div class="drag-handle" title="Drag to reorder">⠿</div>
    `;
    container.appendChild(div);
  });
}

function getFilteredTasks() {
  const tasks = state.tasks[state.activeListId] || [];
  if (currentFilter === 'active')    return tasks.filter(t => !t.completed);
  if (currentFilter === 'completed') return tasks.filter(t =>  t.completed);
  return tasks;
}

function getTaskById(id) {
  return (state.tasks[state.activeListId] || []).find(t => t.id === id) || null;
}

function startInlineEdit(div, task) {
  const titleEl = div.querySelector('.task-title');
  if (!titleEl) return;
  const input = document.createElement('input');
  input.className = 'task-edit-input';
  input.value     = task.title;
  titleEl.replaceWith(input);
  input.focus(); input.select();
  const commit = () => { editTaskTitle(task.id, input.value.trim() || task.title); renderTaskList(); };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { input.removeEventListener('blur', commit); commit(); }
    if (e.key === 'Escape') { input.removeEventListener('blur', commit); renderTaskList(); }
  });
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────
function addTask() {
  const input = document.getElementById('taskInput');
  const title = input.value.trim();
  if (!title || !state.activeListId) return;
  const task = { id: uid(), title, completed: false, expValue: 10, createdAt: Date.now() };
  if (!state.tasks[state.activeListId]) state.tasks[state.activeListId] = [];
  state.tasks[state.activeListId].push(task);
  input.value = '';
  document.getElementById('addTaskBtn').style.display = 'none';
  scheduleSave(); renderTaskList(); renderSidebar(); updateSubtitle();
}

function toggleTask(taskId, px, py) {
  const tasks = state.tasks[state.activeListId];
  if (!tasks) return;
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;
  tasks[idx] = { ...tasks[idx], completed: !tasks[idx].completed };
  const task = tasks[idx];
  const levelBefore = calcLevel(state.exp);
  state.exp = Math.max(0, state.exp + (task.completed ? task.expValue : -task.expValue));
  const levelAfter  = calcLevel(state.exp);
  if (task.completed) {
    spawnParticle(px, py, task.expValue);
    Sounds.complete();
    Streak.recordCompletion(); renderStreak();
    if (levelAfter > levelBefore) { Sounds.levelup(); showLevelUpEffect(levelAfter); }
  }
  scheduleSave(); renderTaskList(); renderExpBar(); renderSidebar(); updateSubtitle();
}

function deleteTask(taskId) {
  if (!taskId) return;
  const tasks = state.tasks[state.activeListId];
  if (!tasks) return;
  const task = tasks.find(t => t.id === taskId);
  if (task?.completed) state.exp = Math.max(0, state.exp - task.expValue);
  state.tasks[state.activeListId] = tasks.filter(t => t.id !== taskId);
  scheduleSave(); renderTaskList(); renderExpBar(); renderSidebar(); updateSubtitle();
}

function editTaskTitle(taskId, title) {
  if (!taskId) return;
  const tasks = state.tasks[state.activeListId];
  if (!tasks) return;
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) tasks[idx] = { ...tasks[idx], title };
  scheduleSave();
}

function changeTaskExp(taskId, newExp) {
  if (!taskId) return;
  const tasks = state.tasks[state.activeListId];
  if (!tasks) return;
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;
  const task = tasks[idx];
  if (task.completed) state.exp = Math.max(0, state.exp - task.expValue + newExp);
  tasks[idx] = { ...task, expValue: newExp };
  scheduleSave(); renderTaskList(); renderExpBar();
}

function reorderTasks(fromId, toId) {
  const tasks = state.tasks[state.activeListId];
  if (!tasks) return;
  const fi = tasks.findIndex(t => t.id === fromId);
  const ti = tasks.findIndex(t => t.id === toId);
  if (fi === -1 || ti === -1) return;
  const [item] = tasks.splice(fi, 1);
  tasks.splice(ti, 0, item);
  scheduleSave(); renderTaskList();
}

// ─── List CRUD ────────────────────────────────────────────────────────────────
const LIST_ICONS = ['📋','⭐','🎯','🔥','💡','🌈','🚀','🎨','📝','🏆'];

function createList() {
  const id   = uid();
  const icon = LIST_ICONS[state.lists.length % LIST_ICONS.length];
  state.lists.push({ id, name: 'New List', icon });
  state.tasks[id] = [];
  scheduleSave(); renderSidebar(); selectList(id);
  openRenameListModal(id, 'New List');
}

function renameList(id, name) {
  const idx = state.lists.findIndex(l => l.id === id);
  if (idx !== -1) state.lists[idx].name = name;
  scheduleSave(); renderSidebar();
  if (id === state.activeListId) document.getElementById('listTitle').textContent = name;
}

function deleteList(id) {
  if (state.lists.length <= 1) { showAlertModal(t('cannotDeleteLast')); return; }
  // Remove from any group first
  removeListFromAnyGroup(id);
  state.lists  = state.lists.filter(l => l.id !== id);
  delete state.tasks[id];
  scheduleSave(); renderSidebar();
  if (id === state.activeListId) selectList(state.lists[0]?.id);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP CRUD
// ═══════════════════════════════════════════════════════════════════════════════

function createGroup(name) {
  const group = { id: uid(), name: name.trim() || 'New Group', collapsed: false, listIds: [] };
  state.groups.push(group);
  scheduleSave(); renderSidebar();
  return group;
}

/**
 * Create a group from a specific list:
 * 1. Prompt for group name (pre-filled with list name)
 * 2. Create the group
 * 3. Add the list into it
 */
function createGroupFromList(listId) {
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;
  openCreateGroupModal(list.name, (name) => {
    const group = createGroup(name);
    addListToGroup(group.id, listId);
    scheduleSave(); renderSidebar();
  });
}

function renameGroup(groupId, name) {
  const g = state.groups.find(g => g.id === groupId);
  if (g) { g.name = name.trim() || g.name; scheduleSave(); renderSidebar(); }
}

/**
 * Delete a group. Lists inside the group are NOT deleted — they become ungrouped.
 */
function deleteGroup(groupId) {
  state.groups = state.groups.filter(g => g.id !== groupId);
  scheduleSave(); renderSidebar();
}

function moveListToGroup(listId, groupId) {
  addListToGroup(groupId, listId);
  scheduleSave(); renderSidebar();
}

function removeListFromGroup(listId) {
  removeListFromAnyGroup(listId);
  scheduleSave(); renderSidebar();
}

// ─── EXP / Level ──────────────────────────────────────────────────────────────
function calcLevel(exp)    { return Math.floor(exp / EXP_PER_LEVEL) + 1; }
function calcProgress(exp) { return exp % EXP_PER_LEVEL; }

function renderExpBar() {
  const level = calcLevel(state.exp), progress = calcProgress(state.exp);
  document.getElementById('expLvlNum').textContent        = level;
  document.getElementById('expFill').style.width          = (progress / EXP_PER_LEVEL * 100) + '%';
  document.getElementById('expCur').textContent           = progress;
  document.getElementById('expMax').textContent           = EXP_PER_LEVEL + ' ' + t('expUnit');
  document.getElementById('headerLevelBadge').textContent = t('levelBadge', level);
}

function spawnParticle(x, y, value) {
  const node = document.createElement('div');
  node.className   = 'exp-particle';
  node.textContent = `+${value} EXP`;
  node.style.left  = x + 'px';
  node.style.top   = y + 'px';
  document.getElementById('particles').appendChild(node);
  setTimeout(() => node.remove(), 1400);
}

// ─── Streak ───────────────────────────────────────────────────────────────────
function renderStreak() {
  const node  = document.getElementById('streakDisplay');
  if (!node) return;
  const count = Streak.count;
  node.title  = t('streakTooltip');
  node.innerHTML = `<span class="streak-flame">🔥</span><span class="streak-label">${t('streak')}</span><span class="streak-count">${count}</span><span class="streak-unit">${t('days')}</span>`;
  node.classList.toggle('streak-active', count > 0);
}

// ─── Level-up effect ──────────────────────────────────────────────────────────
let _levelUpTimer = null;
function showLevelUpEffect(newLevel) {
  clearTimeout(_levelUpTimer);
  const indicator = document.getElementById('levelUpIndicator');
  if (!indicator) return;
  indicator.textContent = t('levelUp') + ' ' + t('levelBadge', newLevel);
  indicator.classList.remove('level-up-hidden');
  indicator.classList.add('level-up-visible');
  _levelUpTimer = setTimeout(() => {
    indicator.classList.remove('level-up-visible');
    indicator.classList.add('level-up-hidden');
  }, 1800);
}

// ─── Filters / subtitle ───────────────────────────────────────────────────────
function setFilter(f) { currentFilter = f; updateFilterButtons(); renderTaskList(); }

function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === currentFilter);
  });
  const tasks = state.tasks[state.activeListId] || [];
  const badge = document.getElementById('activeCount');
  if (badge) badge.textContent = tasks.filter(t => !t.completed).length || '';
}

function updateSubtitle() {
  const tasks = state.tasks[state.activeListId] || [];
  const done  = tasks.filter(t => t.completed).length;
  const sub   = document.getElementById('listSubtitle');
  if (sub) sub.textContent = t('completedOf', done, tasks.length);
  updateFilterButtons();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT MENUS
// ═══════════════════════════════════════════════════════════════════════════════

function showTaskContextMenu(x, y) {
  const frozenId = contextMenuTargetId;
  const items = [
    { icon: '✏️', label: t('editTask'),   action: () => { const task = getTaskById(frozenId); if (task) openEditTaskModal(task); } },
    { icon: '⚡', label: t('changeExp'),  action: () => { const task = getTaskById(frozenId); if (task) openChangeExpModal(task); } },
    { icon: '🗑️', label: t('removeTask'), danger: true, action: () => deleteTask(frozenId) }
  ];
  renderContextMenu(x, y, items);
}

/**
 * List context menu — dynamically builds group-related options:
 *
 * Always shown:
 *   ✏️  Rename
 *   📁  Create Group from this List
 *   🗑️  Delete
 *
 * Only when list IS in a group:
 *   ↩️  Remove from Group
 *
 * Only when groups exist AND this list is NOT already in all of them:
 *   ➕  Add to Group  (submenu or per-group items)
 */
function showListContextMenu(x, y, list) {
  const frozenList  = list;
  const currentGroup = groupOfList(frozenList.id);
  const items = [];

  // ── Rename
  items.push({ icon: '✏️', label: t('rename'),
    action: () => openRenameListModal(frozenList.id, frozenList.name) });

  // ── Create Group from this List
  items.push({ icon: '📁', label: t('createGroupFromList'),
    action: () => createGroupFromList(frozenList.id) });

  // ── Add to Group (only if there are groups the list is not already in)
  const eligibleGroups = state.groups.filter(g => !g.listIds.includes(frozenList.id));
  if (eligibleGroups.length > 0) {
    // If exactly one eligible group, go direct; if many, show submenu per group
    if (eligibleGroups.length === 1) {
      items.push({ icon: '➕', label: `${t('addToGroup')}: ${eligibleGroups[0].name}`,
        action: () => moveListToGroup(frozenList.id, eligibleGroups[0].id) });
    } else {
      // One item per eligible group
      items.push({ icon: '➕', label: t('addToGroup'), separator: true });
      eligibleGroups.forEach(g => {
        items.push({ icon: '  ', label: `↳ ${g.name}`, indent: true,
          action: () => moveListToGroup(frozenList.id, g.id) });
      });
    }
  }

  // ── Remove from Group (only when in one)
  if (currentGroup) {
    items.push({ icon: '↩️', label: t('removeFromGroup'),
      action: () => removeListFromGroup(frozenList.id) });
  }

  // ── Delete (always last, danger)
  items.push({ icon: '🗑️', label: t('delete'), danger: true,
    action: () => deleteList(frozenList.id) });

  renderContextMenu(x, y, items);
}

function showGroupContextMenu(x, y, group) {
  const frozenGroup = group;
  const items = [
    { icon: '✏️', label: t('rename'),      action: () => openRenameGroupModal(frozenGroup) },
    { icon: '🗑️', label: t('deleteGroup'), danger: true, action: () => deleteGroup(frozenGroup.id) }
  ];
  renderContextMenu(x, y, items);
}

/**
 * Render the context menu. Supports separator items (non-clickable labels)
 * and indented items (visually inset sub-options).
 */
function renderContextMenu(x, y, items) {
  const menu = document.getElementById('contextMenu');
  menu.innerHTML = '';

  items.forEach(item => {
    if (item.separator) {
      // Non-clickable category label
      const sep = document.createElement('div');
      sep.className = 'ctx-separator';
      const icon = document.createElement('span');
      icon.className = 'ctx-icon'; icon.textContent = item.icon;
      const label = document.createTextNode(item.label);
      sep.appendChild(icon); sep.appendChild(label);
      menu.appendChild(sep);
      return;
    }

    const btn = document.createElement('button');
    btn.className = 'ctx-item'
      + (item.danger  ? ' danger' : '')
      + (item.indent  ? ' indent' : '');

    const iconSpan = document.createElement('span');
    iconSpan.className   = 'ctx-icon';
    iconSpan.textContent = item.icon;
    btn.appendChild(iconSpan);
    btn.appendChild(document.createTextNode(item.label));

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const _taskId = contextMenuTargetId;
      const _list   = contextMenuTargetList;
      hideContextMenu();
      contextMenuTargetId   = _taskId;
      contextMenuTargetList = _list;
      item.action();
      contextMenuTargetId   = null;
      contextMenuTargetList = null;
    });

    menu.appendChild(btn);
  });

  menu.style.left    = x + 'px';
  menu.style.top     = y + 'px';
  menu.style.display = 'block';

  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.right  > window.innerWidth)  menu.style.left = (x - r.width)  + 'px';
    if (r.bottom > window.innerHeight) menu.style.top  = (y - r.height) + 'px';
  });
}

function hideContextMenu() {
  document.getElementById('contextMenu').style.display = 'none';
  contextMenuTargetId   = null;
  contextMenuTargetList = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODALS  (all built with DOM + addEventListener — no inline handlers, CSP-safe)
// ═══════════════════════════════════════════════════════════════════════════════
function showModal(buildFn) {
  const overlay = document.getElementById('modalOverlay');
  const modal   = document.getElementById('modal');
  modal.innerHTML = '';
  buildFn(modal);
  overlay.style.display = 'flex';
  const onBg = (e) => { if (e.target === overlay) { hideModal(); overlay.removeEventListener('click', onBg); } };
  overlay.addEventListener('click', onBg);
}

function hideModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  document.getElementById('modal').innerHTML = '';
}

function openEditTaskModal(task) {
  showModal(modal => {
    const h      = el('h3',    { className: 'modal-title' }, t('editTaskTitle'));
    const inp    = el('input', { className: 'modal-input', type: 'text', value: task.title });
    const row    = el('div',   { className: 'modal-actions' });
    const cancel = el('button',{ className: 'btn-secondary' }, t('cancel'));
    const save   = el('button',{ className: 'btn-primary'   }, t('save'));
    const commit = () => { const v = inp.value.trim(); if (v) { editTaskTitle(task.id, v); renderTaskList(); hideModal(); } };
    cancel.addEventListener('click', hideModal);
    save.addEventListener('click', commit);
    inp.addEventListener('keydown', e => { if (e.key==='Enter') commit(); if (e.key==='Escape') hideModal(); });
    row.append(cancel, save); modal.append(h, inp, row);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

function openChangeExpModal(task) {
  showModal(modal => {
    const presets = [5, 10, 20, 50, 100];
    const h      = el('h3',    { className: 'modal-title' }, t('setExpTitle'));
    const grid   = el('div',   { className: 'preset-grid' });
    const inp    = el('input', { className: 'modal-input', type: 'number', min:'1', max:'9999', value: String(task.expValue) });
    const row    = el('div',   { className: 'modal-actions' });
    const cancel = el('button',{ className: 'btn-secondary' }, t('cancel'));
    const save   = el('button',{ className: 'btn-primary'   }, t('save'));
    presets.forEach(p => {
      const btn = el('button', { className: 'preset-btn' + (p === task.expValue ? ' active' : '') }, String(p));
      btn.addEventListener('click', () => { inp.value = String(p); grid.querySelectorAll('.preset-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); });
      grid.appendChild(btn);
    });
    cancel.addEventListener('click', hideModal);
    save.addEventListener('click', () => { changeTaskExp(task.id, parseInt(inp.value)||1); hideModal(); });
    row.append(cancel, save); modal.append(h, grid, inp, row);
    setTimeout(() => inp.focus(), 30);
  });
}

function openRenameListModal(id, currentName) {
  showModal(modal => {
    const h      = el('h3',    { className: 'modal-title' }, t('renameListTitle'));
    const inp    = el('input', { className: 'modal-input', type: 'text', value: currentName });
    const row    = el('div',   { className: 'modal-actions' });
    const cancel = el('button',{ className: 'btn-secondary' }, t('cancel'));
    const save   = el('button',{ className: 'btn-primary'   }, t('save'));
    const commit = () => { const v = inp.value.trim(); if (v) { renameList(id, v); hideModal(); } };
    cancel.addEventListener('click', hideModal);
    save.addEventListener('click', commit);
    inp.addEventListener('keydown', e => { if (e.key==='Enter') commit(); if (e.key==='Escape') hideModal(); });
    row.append(cancel, save); modal.append(h, inp, row);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

function openRenameGroupModal(group) {
  showModal(modal => {
    const h      = el('h3',    { className: 'modal-title' }, t('renameGroupTitle'));
    const inp    = el('input', { className: 'modal-input', type: 'text', value: group.name });
    const row    = el('div',   { className: 'modal-actions' });
    const cancel = el('button',{ className: 'btn-secondary' }, t('cancel'));
    const save   = el('button',{ className: 'btn-primary'   }, t('save'));
    const commit = () => { const v = inp.value.trim(); if (v) { renameGroup(group.id, v); hideModal(); } };
    cancel.addEventListener('click', hideModal);
    save.addEventListener('click', commit);
    inp.addEventListener('keydown', e => { if (e.key==='Enter') commit(); if (e.key==='Escape') hideModal(); });
    row.append(cancel, save); modal.append(h, inp, row);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

/**
 * openCreateGroupModal(prefillName?, onCreated?)
 *  – prefillName: pre-fill the group name input (used when creating from a list)
 *  – onCreated: callback(name) called after the user confirms (used internally)
 *    If omitted, creates the group directly via createGroup().
 */
function openCreateGroupModal(prefillName, onCreated) {
  // Handle the case where called via button click (event object passed instead of string)
  if (prefillName instanceof Event || prefillName == null) prefillName = '';
  showModal(modal => {
    const h      = el('h3',    { className: 'modal-title' }, t('createGroupTitle'));
    const inp    = el('input', { className: 'modal-input', type: 'text', value: typeof prefillName === 'string' ? prefillName : '', placeholder: t('groupNamePlaceholder') });
    const row    = el('div',   { className: 'modal-actions' });
    const cancel = el('button',{ className: 'btn-secondary' }, t('cancel'));
    const create = el('button',{ className: 'btn-primary'   }, t('create'));
    const commit = () => {
      const v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      hideModal();
      if (typeof onCreated === 'function') {
        onCreated(v);
      } else {
        createGroup(v);
      }
    };
    cancel.addEventListener('click', hideModal);
    create.addEventListener('click', commit);
    inp.addEventListener('keydown', e => { if (e.key==='Enter') commit(); if (e.key==='Escape') hideModal(); });
    row.append(cancel, create); modal.append(h, inp, row);
    setTimeout(() => { inp.focus(); if (typeof prefillName === 'string' && prefillName) inp.select(); }, 30);
  });
}

function showAlertModal(msg) {
  showModal(modal => {
    const p   = el('p',     { style: 'margin-bottom:20px;color:var(--text)' }, msg);
    const ok  = el('button',{ className: 'btn-primary' }, t('ok'));
    const row = el('div',   { className: 'modal-actions' });
    ok.addEventListener('click', hideModal);
    row.appendChild(ok); modal.append(p, row);
  });
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
function onGlobalKeydown(e) {
  if (e.key === 'Escape') { hideContextMenu(); hideModal(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); createList(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'g') { e.preventDefault(); openCreateGroupModal(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); toggleDark(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleLang(); }
}

// ─── DOM utility ──────────────────────────────────────────────────────────────
function el(tag, props = {}, text) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  if (props.style && typeof props.style === 'string') node.style.cssText = props.style;
  if (text !== undefined) node.textContent = text;
  return node;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();

// ═══════════════════════════════════════════════════════════════════════════════
// RESIZABLE SIDEBAR
// Hoàn toàn độc lập — không đụng đến bất kỳ logic nào ở trên.
//
// Cách hoạt động:
//   1. Người dùng mousedown trên #sidebarResizer → ghi nhớ X ban đầu.
//   2. mousemove trên document → tính delta X → gán width mới cho .sidebar.
//   3. mouseup → kết thúc, lưu width vào localStorage.
//
// Width được set trực tiếp bằng element.style.width (nhanh hơn CSS variable)
// và được lưu vào localStorage với key 'todoexp_sidebar_w' để nhớ giữa
// các phiên làm việc.
// ═══════════════════════════════════════════════════════════════════════════════

(function initSidebarResize() {
  const STORAGE_KEY  = 'todoexp_sidebar_w';
  const MIN_W        = 160;   // px — khớp với CSS min-width
  const MAX_W        = 480;   // px — khớp với CSS max-width
  const DEFAULT_W    = 260;   // px — khớp với --sidebar-w

  const resizer      = document.getElementById('sidebarResizer');
  const sidebar      = document.getElementById('sidebar');

  if (!resizer || !sidebar) return;   // phòng thủ: thoát nếu DOM thiếu

  // ── Khôi phục width đã lưu từ phiên trước ────────────────────────────────
  const savedW = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (savedW && savedW >= MIN_W && savedW <= MAX_W) {
    sidebar.style.width = savedW + 'px';
  }

  // ── Trạng thái kéo ────────────────────────────────────────────────────────
  let isDragging  = false;
  let startX      = 0;
  let startWidth  = 0;

  // ── mousedown: bắt đầu kéo ───────────────────────────────────────────────
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();   // ngăn text selection

    isDragging = true;
    startX     = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;

    resizer.classList.add('is-dragging');
    document.body.classList.add('sidebar-is-resizing');
  });

  // ── mousemove: cập nhật width realtime ───────────────────────────────────
  // Gắn vào document để vẫn hoạt động khi chuột ra ngoài resizer
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const delta    = e.clientX - startX;
    const newWidth = Math.min(MAX_W, Math.max(MIN_W, startWidth + delta));

    // Gán trực tiếp — nhanh hơn CSS variable, không trigger reflow lớn
    sidebar.style.width = newWidth + 'px';
  });

  // ── mouseup: kết thúc kéo, lưu width ────────────────────────────────────
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;

    isDragging = false;
    resizer.classList.remove('is-dragging');
    document.body.classList.remove('sidebar-is-resizing');

    // Lưu lại để khôi phục lần sau
    const finalWidth = sidebar.getBoundingClientRect().width;
    localStorage.setItem(STORAGE_KEY, Math.round(finalWidth));
  });

  // ── mouseleave window: an toàn, tự kết thúc nếu chuột thoát khỏi app ────
  document.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      resizer.classList.remove('is-dragging');
      document.body.classList.remove('sidebar-is-resizing');
      const finalWidth = sidebar.getBoundingClientRect().width;
      localStorage.setItem(STORAGE_KEY, Math.round(finalWidth));
    }
  });

})();  // IIFE — tự gọi ngay, không ô nhiễm scope ngoài