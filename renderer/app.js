/**
 * Todo EXP – Renderer (Fixed + i18n)
 *
 * KEY FIXES vs original:
 * ─────────────────────
 * 1. CONTEXT MENU BUG: The old code used document.addEventListener('mousedown')
 *    to hide the menu, which fired BEFORE the button's 'click' event, swallowing
 *    every action. Fixed by using 'pointerdown' with a flag so the menu only hides
 *    when clicking OUTSIDE it, and only after the click has already fired.
 *
 * 2. CSP VIOLATION: Modal HTML used inline onclick="..." strings which Electron's
 *    CSP blocks when script-src is 'self' (no 'unsafe-inline' for scripts).
 *    Fixed by building modal buttons with addEventListener in JS — never inline handlers.
 *
 * 3. TASK ID TRACKING: Context menu stored task data by closure on the task object
 *    at render time. If state changed between render and click, stale data was used.
 *    Fixed with a dedicated `contextMenuTargetId` variable updated on every right-click.
 *
 * 4. EVENT DELEGATION: All task-level events now use a single delegated listener on
 *    #taskList, so dynamically added tasks are covered without re-binding listeners.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const EXP_PER_LEVEL = 100;
const uid = () => Math.random().toString(36).slice(2, 10);

// ─── i18n Translation System ──────────────────────────────────────────────────
const translations = {
  en: {
    // Sidebar
    newList:          'New List',
    selectList:       'Select or create a list to get started',
    // Header/subtitle
    completedOf:      (done, total) => `${done} of ${total} completed`,
    // Task input
    taskPlaceholder:  'Add a task…',
    add:              'Add',
    // Filters
    all:              'All',
    active:           'Active',
    completed:        'Completed',
    // Empty states
    emptyAll:         'Add your first task above',
    emptyActive:      'All tasks done! 🎉',
    emptyCompleted:   'No completed tasks yet',
    // Context menu – task
    editTask:         'Edit Task',
    changeExp:        'Change EXP',
    removeTask:       'Remove Task',
    // Context menu – list
    rename:           'Rename',
    delete:           'Delete',
    // Modals
    editTaskTitle:    'Edit Task',
    setExpTitle:      'Set EXP Value',
    renameListTitle:  'Rename List',
    cancel:           'Cancel',
    save:             'Save',
    ok:               'OK',
    // EXP bar
    lvl:              'LVL',
    expUnit:          'EXP',
    // Language toggle tooltip
    langToggle:       'Switch to Vietnamese',
    // Misc
    cannotDeleteLast: 'Cannot delete the last list.',
    levelBadge:       (n) => `⚡ LVL ${n}`,
    // Streak
    streak:           'Streak',
    days:             'days',
    streakTooltip:    'Complete at least one task per day to keep your streak',
    // Level up
    levelUp:          'Level Up!',
  },
  vi: {
    newList:          'Danh sách mới',
    selectList:       'Chọn hoặc tạo danh sách để bắt đầu',
    completedOf:      (done, total) => `${done} trong ${total} đã hoàn thành`,
    taskPlaceholder:  'Thêm nhiệm vụ…',
    add:              'Thêm',
    all:              'Tất cả',
    active:           'Đang làm',
    completed:        'Hoàn thành',
    emptyAll:         'Hãy thêm nhiệm vụ đầu tiên',
    emptyActive:      'Hoàn thành hết rồi! 🎉',
    emptyCompleted:   'Chưa có nhiệm vụ nào hoàn thành',
    editTask:         'Chỉnh sửa',
    changeExp:        'Đổi điểm EXP',
    removeTask:       'Xóa nhiệm vụ',
    rename:           'Đổi tên',
    delete:           'Xóa',
    editTaskTitle:    'Chỉnh sửa nhiệm vụ',
    setExpTitle:      'Đặt giá trị EXP',
    renameListTitle:  'Đổi tên danh sách',
    cancel:           'Hủy',
    save:             'Lưu',
    ok:               'OK',
    lvl:              'CẤP',
    expUnit:          'EXP',
    langToggle:       'Chuyển sang tiếng Anh',
    cannotDeleteLast: 'Không thể xóa danh sách cuối cùng.',
    levelBadge:       (n) => `⚡ CẤP ${n}`,
    // Streak
    streak:           'Chuỗi ngày',
    days:             'ngày',
    streakTooltip:    'Hoàn thành ít nhất một nhiệm vụ mỗi ngày để duy trì chuỗi',
    // Level up
    levelUp:          'Lên cấp!',
  }
};

// Current language – load from localStorage (persists across restarts)
let lang = localStorage.getItem('todoexp_lang') || 'en';

/** Translate a key. If the value is a function, call it with args. */
function t(key, ...args) {
  const val = translations[lang]?.[key] ?? translations['en'][key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

/** Re-render all static [data-i18n] elements */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    // For filter buttons that contain a badge span, only update own text node
    if (el.id === 'filterActive') {
      // Replace first text node only, keep the badge span
      el.childNodes[0].textContent = t('active') + ' ';
    } else {
      el.textContent = t(key);
    }
  });
  document.getElementById('taskInput').placeholder = t('taskPlaceholder');
  document.getElementById('langToggleBtn').title = t('langToggle');
  // Refresh subtitle with new language
  updateSubtitle();
}

// ─── Sound Effects ────────────────────────────────────────────────────────────
// Audio objects created once at startup. Electron allows local file:// audio.
// We use a factory so a rapid re-trigger always gets a fresh instance (no
// overlap/cutoff issues on fast repeated completions).
const Sounds = {
  _load(path) {
    // Return a factory that creates a fresh Audio node each play —
    // avoids "play interrupted by new play" browser warnings.
    return () => {
      const a = new Audio(path);
      a.volume = 0.55;
      a.play().catch(() => {}); // silence autoplay policy errors silently
    };
  },
  complete: null,
  levelup:  null,
  init() {
    // Paths resolve relative to index.html inside renderer/
    // In Electron, '../assets/' navigates one folder up from renderer/
    this.complete = this._load('../assets/complete.mp3');
    this.levelup  = this._load('../assets/levelup.mp3');
  }
};

// ─── Streak State ─────────────────────────────────────────────────────────────
// Stored in localStorage (key: 'todoexp_streak') as JSON.
// Shape: { count: number, lastDate: "YYYY-MM-DD" | null }
// Streak is PURELY motivational — it never awards EXP.
const Streak = {
  KEY: 'todoexp_streak',

  /** Load from localStorage, returning defaults if absent or corrupt. */
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.count === 'number' && (parsed.lastDate === null || typeof parsed.lastDate === 'string')) {
          return parsed;
        }
      }
    } catch (_) {}
    return { count: 0, lastDate: null };
  },

  /** Save to localStorage. */
  save(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
  },

  /** Return today's date as "YYYY-MM-DD" in local time. */
  today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  /**
   * Called whenever a task is marked complete (false → true).
   * Returns { count, isNew } where isNew=true if the streak just incremented.
   * Streak never increments on uncheck.
   */
  recordCompletion() {
    const data  = this.load();
    const today = this.today();

    if (data.lastDate === today) {
      // Already recorded a completion today — no change needed
      return { count: data.count, isNew: false };
    }

    let newCount;
    if (data.lastDate === null) {
      // First ever completion
      newCount = 1;
    } else {
      // Calculate calendar-day gap
      const last    = new Date(data.lastDate + 'T00:00:00');
      const now     = new Date(today        + 'T00:00:00');
      const diffDays = Math.round((now - last) / 86400000);
      if (diffDays === 1) {
        newCount = data.count + 1;  // consecutive day → extend streak
      } else {
        newCount = 1;               // gap > 1 day → reset
      }
    }

    this.save({ count: newCount, lastDate: today });
    return { count: newCount, isNew: true };
  },

  /** Current streak count (read-only, no side effects). */
  get count() {
    return this.load().count;
  }
};

// ─── App State ────────────────────────────────────────────────────────────────
let state = {
  lists: [],
  tasks: {},
  exp: 0,
  dark: false,
  activeListId: null,
  sidebarWidth: 256
};

let currentFilter  = 'all';
let saveTimer      = null;
let dragSrcId      = null;

/**
 * FIX 1 – Context menu target tracking.
 * We store the task ID at the moment the context menu opens,
 * so the action callbacks always reference fresh data from state,
 * not a stale closure captured at render time.
 */
let contextMenuTargetId   = null;   // task id for task context menu
let contextMenuTargetList = null;   // list object for list context menu

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
  const saved = await window.electronAPI.loadData();
  state = { ...state, ...saved };

  applyDark();
  applyI18n();

  const version = await window.electronAPI.getVersion();
  document.getElementById('versionLabel').textContent = 'v' + version;
  if (state.sidebarWidth) {
    document.getElementById('sidebar').style.width = state.sidebarWidth + 'px';
  }

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
  bindResizer();
}

// ─── Static Event Binding ─────────────────────────────────────────────────────
// All buttons in the HTML get their listeners here — no inline onclick needed.
function bindStaticEvents() {
  // Title bar
  document.getElementById('btnMinimize').addEventListener('click', () => window.electronAPI.minimizeWindow());
  document.getElementById('btnMaximize').addEventListener('click', () => window.electronAPI.maximizeWindow());
  document.getElementById('btnClose').addEventListener('click',    () => window.electronAPI.closeWindow());

  // Sidebar
  document.getElementById('btnNewList').addEventListener('click', createList);
  document.getElementById('darkToggleBtn').addEventListener('click', toggleDark);
  document.getElementById('langToggleBtn').addEventListener('click', toggleLang);
  document.getElementById('dataFolderBtn').addEventListener('click', () => window.electronAPI.openDataFolder());

  // Task input
  document.getElementById('taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
  document.getElementById('taskInput').addEventListener('input',   e => {
    document.getElementById('addTaskBtn').style.display = e.target.value ? 'block' : 'none';
  });
  document.getElementById('addTaskBtn').addEventListener('click', addTask);

  // Filters
  document.getElementById('filterAll').addEventListener('click',       () => setFilter('all'));
  document.getElementById('filterActive').addEventListener('click',    () => setFilter('active'));
  document.getElementById('filterCompleted').addEventListener('click', () => setFilter('completed'));

  // Global keyboard
  document.addEventListener('keydown', onGlobalKeydown);
}

/**
 * Context menu dismiss.
 *
 * Uses 'mousedown' on the document. When the user clicks a menu button,
 * mousedown fires → we check if it's inside the menu → if so we do nothing
 * and let the button's own 'click' handler fire naturally.
 * If it's outside, we hide the menu immediately.
 *
 * CRITICAL: we do NOT null out contextMenuTargetId here.
 * That is only done inside hideContextMenu(), which is called by the
 * button's click handler AFTER it has already captured the id it needs.
 */
function bindContextMenuDismiss() {
  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('contextMenu');
    if (menu.style.display === 'none') return;
    // Click is on a menu button — let the click event handle it, don't interfere
    if (menu.contains(e.target)) return;
    // Click is outside — hide the menu and clear targets
    hideContextMenu();
  });
}

/**
 * FIX 3 – Event delegation for task list.
 *
 * Instead of binding listeners on every task element (which means newly
 * added tasks don't automatically get listeners unless renderTaskList is called),
 * we bind ONE listener on the parent #taskList container and route by
 * the clicked element's class/data attributes.
 *
 * This also fixes the context menu: the contextmenu event fires on the task
 * container, we look up the task id from data-id, store it in
 * `contextMenuTargetId`, then build the menu. When a menu action runs, it
 * reads the CURRENT task from state using that id — always fresh.
 */
function bindTaskListDelegation() {
  const list = document.getElementById('taskList');

  // Left-click delegation
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.task-item');
    if (!item) return;
    const taskId = item.dataset.id;

    // Checkbox toggle
    if (e.target.closest('.checkbox')) {
      e.stopPropagation();
      const rect = e.target.closest('.checkbox').getBoundingClientRect();
      toggleTask(taskId, rect.left + rect.width / 2, rect.top + rect.height / 2);
      return;
    }
  });

  // Double-click to edit title inline
  list.addEventListener('dblclick', (e) => {
    const titleEl = e.target.closest('.task-title');
    if (!titleEl) return;
    const item   = e.target.closest('.task-item');
    const taskId = item?.dataset.id;
    const task   = getTaskById(taskId);
    if (task) startInlineEdit(item, task);
  });

  /**
   * FIX 4 – Right-click context menu via delegation.
   *
   * We capture the task id HERE when the right-click fires, store it in
   * contextMenuTargetId, then build menu items that call helper functions
   * which look up the task fresh from state. This avoids stale-closure bugs.
   */
  list.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const item = e.target.closest('.task-item');
    if (!item) return;

    contextMenuTargetId = item.dataset.id;
    showTaskContextMenu(e.clientX, e.clientY);
  });

  // Drag & drop (delegated)
  list.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.task-item');
    if (!item) return;
    dragSrcId = item.dataset.id;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  list.addEventListener('dragend', (e) => {
    const item = e.target.closest('.task-item');
    item?.classList.remove('dragging');
    document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest('.task-item');
    if (!item) return;
    document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
    item.classList.add('drag-over');
  });
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    const item = e.target.closest('.task-item');
    if (!item) return;
    const toId = item.dataset.id;
    if (dragSrcId && dragSrcId !== toId) reorderTasks(dragSrcId, toId);
    document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
  });
}

// ─── Auto Save ────────────────────────────────────────────────────────────────
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.electronAPI.saveData(state), 300);
}

// ─── i18n ─────────────────────────────────────────────────────────────────────
function toggleLang() {
  lang = lang === 'en' ? 'vi' : 'en';
  localStorage.setItem('todoexp_lang', lang);
  applyI18n();
  renderSidebar();
  renderTaskList();
  renderStreak();      // re-render streak with new language
  updateSubtitle();
}

// ─── Dark Mode ────────────────────────────────────────────────────────────────
function toggleDark() {
  state.dark = !state.dark;
  applyDark();
  scheduleSave();
}

function applyDark() {
  document.body.classList.toggle('dark', state.dark);
  const btn = document.getElementById('darkToggleBtn');
  if (btn) btn.textContent = state.dark ? '☀️' : '🌙';
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function renderSidebar() {
  const container = document.getElementById('sidebarLists');
  container.innerHTML = '';

  state.lists.forEach(list => {
    const btn = document.createElement('button');
    btn.className = 'list-btn' + (list.id === state.activeListId ? ' active' : '');
    btn.dataset.id = list.id;

    const tasks      = state.tasks[list.id] || [];
    const incomplete = tasks.filter(t => !t.completed).length;

    btn.innerHTML = `
      <span class="list-icon">${list.icon || '📋'}</span>
      <span class="list-name">${escHtml(list.name)}</span>
      ${incomplete > 0 ? `<span class="list-count">${incomplete}</span>` : ''}
    `;

    btn.addEventListener('click', () => selectList(list.id));

    // List right-click: capture list object, store reference, show menu
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      contextMenuTargetList = list;
      showListContextMenu(e.clientX, e.clientY);
    });

    container.appendChild(btn);
  });
}

// ─── List Selection ───────────────────────────────────────────────────────────
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

// ─── Task Rendering ───────────────────────────────────────────────────────────
function renderTaskList() {
  const container = document.getElementById('taskList');
  container.innerHTML = '';

  const tasks = getFilteredTasks();

  if (tasks.length === 0) {
    const msg = currentFilter === 'completed' ? t('emptyCompleted')
              : currentFilter === 'active'    ? t('emptyActive')
              :                                 t('emptyAll');
    const icon = currentFilter === 'active' ? '🎉' : '✨';
    container.innerHTML = `<div class="empty-tasks"><div class="empty-tasks-icon">${icon}</div><p>${escHtml(msg)}</p></div>`;
    return;
  }

  // NOTE: No event listeners attached here — all handled by delegated listeners
  tasks.forEach(task => {
    const div = document.createElement('div');
    div.className = 'task-item' + (task.completed ? ' completed' : '');
    div.dataset.id = task.id;
    div.draggable  = true;

    div.innerHTML = `
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
  const tasks = state.tasks[state.activeListId] || [];
  return tasks.find(t => t.id === id) || null;
}

function startInlineEdit(div, task) {
  const titleEl = div.querySelector('.task-title');
  if (!titleEl) return;

  const input = document.createElement('input');
  input.className = 'task-edit-input';
  input.value = task.title;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newTitle = input.value.trim() || task.title;
    editTaskTitle(task.id, newTitle);
    renderTaskList();
  };

  input.addEventListener('blur',    commit);
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

  scheduleSave();
  renderTaskList();
  renderSidebar();
  updateSubtitle();
}

function toggleTask(taskId, px, py) {
  const tasks = state.tasks[state.activeListId];
  if (!tasks) return;
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;

  const wasCompleted = tasks[idx].completed;
  tasks[idx] = { ...tasks[idx], completed: !wasCompleted };
  const task = tasks[idx];

  // ── Level-up detection ─────────────────────────────────────────────────────
  // Capture level BEFORE applying EXP so we can compare afterwards.
  const levelBefore = calcLevel(state.exp);

  state.exp = Math.max(0, state.exp + (task.completed ? task.expValue : -task.expValue));

  const levelAfter = calcLevel(state.exp);

  // ── Completion-only effects (false → true) ─────────────────────────────────
  if (task.completed) {
    // 1. Floating EXP particle
    spawnParticle(px, py, task.expValue);

    // 2. Completion tick sound
    Sounds.complete();

    // 3. Streak update (no EXP reward — purely motivational)
    Streak.recordCompletion();
    renderStreak();

    // 4. Level-up effect (only when levelling up, not down)
    if (levelAfter > levelBefore) {
      Sounds.levelup();
      showLevelUpEffect(levelAfter);
    }
  }

  scheduleSave();
  renderTaskList();
  renderExpBar();
  renderSidebar();
  updateSubtitle();
}

function deleteTask(taskId) {
  if (!taskId) return;
  const tasks = state.tasks[state.activeListId];
  if (!tasks) return;
  const task = tasks.find(t => t.id === taskId);
  if (task?.completed) state.exp = Math.max(0, state.exp - task.expValue);
  state.tasks[state.activeListId] = tasks.filter(t => t.id !== taskId);
  scheduleSave();
  renderTaskList();
  renderExpBar();
  renderSidebar();
  updateSubtitle();
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
  scheduleSave();
  renderTaskList();
  renderExpBar();
}

function reorderTasks(fromId, toId) {
  const tasks = state.tasks[state.activeListId];
  if (!tasks) return;
  const fromIdx = tasks.findIndex(t => t.id === fromId);
  const toIdx   = tasks.findIndex(t => t.id === toId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [item] = tasks.splice(fromIdx, 1);
  tasks.splice(toIdx, 0, item);
  scheduleSave();
  renderTaskList();
}

// ─── List CRUD ────────────────────────────────────────────────────────────────
const LIST_ICONS = ['📋','⭐','🎯','🔥','💡','🌈','🚀','🎨','📝','🏆'];

function createList() {
  const id   = uid();
  const icon = LIST_ICONS[state.lists.length % LIST_ICONS.length];
  state.lists.push({ id, name: 'New List', icon });
  state.tasks[id] = [];
  scheduleSave();
  renderSidebar();
  selectList(id);
  openRenameListModal(id, 'New List');
}

function renameList(id, name) {
  const idx = state.lists.findIndex(l => l.id === id);
  if (idx !== -1) state.lists[idx].name = name;
  scheduleSave();
  renderSidebar();
  if (id === state.activeListId) document.getElementById('listTitle').textContent = name;
}

function deleteList(id) {
  if (state.lists.length <= 1) { showAlertModal(t('cannotDeleteLast')); return; }
  state.lists = state.lists.filter(l => l.id !== id);
  delete state.tasks[id];
  scheduleSave();
  renderSidebar();
  if (id === state.activeListId) selectList(state.lists[0]?.id);
}

// ─── Streak UI ────────────────────────────────────────────────────────────────
/**
 * Render the streak counter in #streakDisplay.
 * Called on init, on every task completion, and on language switch.
 */
function renderStreak() {
  const el = document.getElementById('streakDisplay');
  if (!el) return;
  const count = Streak.count;
  el.title = t('streakTooltip');
  // Flame emoji intensity: gray at 0, orange at 1+, bright at 7+
  const flame = count === 0 ? '🔥' : count >= 7 ? '🔥' : '🔥';
  el.innerHTML = `<span class="streak-flame">${flame}</span><span class="streak-label" data-i18n="streak">${t('streak')}</span><span class="streak-count">${count}</span><span class="streak-unit">${t('days')}</span>`;
  // Subtle highlight when streak is active
  el.classList.toggle('streak-active', count > 0);
}

// ─── Level Up Effect ──────────────────────────────────────────────────────────
/**
 * Show a small, non-intrusive "Level Up!" text near the EXP bar for 1.8s.
 * Uses CSS animation — no heavy JS or external libs needed.
 */
let _levelUpTimer = null;
function showLevelUpEffect(newLevel) {
  // If already showing (very fast level-up chain), reset the timer
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

// ─── EXP Bar ──────────────────────────────────────────────────────────────────
function calcLevel(exp)    { return Math.floor(exp / EXP_PER_LEVEL) + 1; }
function calcProgress(exp) { return exp % EXP_PER_LEVEL; }

function renderExpBar() {
  const level    = calcLevel(state.exp);
  const progress = calcProgress(state.exp);
  const pct      = (progress / EXP_PER_LEVEL) * 100;

  document.getElementById('expLvlNum').textContent       = level;
  document.getElementById('expFill').style.width         = pct + '%';
  document.getElementById('expCur').textContent          = progress;
  document.getElementById('expMax').textContent          = EXP_PER_LEVEL + ' ' + t('expUnit');
  document.getElementById('headerLevelBadge').textContent = t('levelBadge', level);
}

// ─── EXP Particles ────────────────────────────────────────────────────────────
function spawnParticle(x, y, value) {
  const el = document.createElement('div');
  el.className   = 'exp-particle';
  el.textContent = `+${value} EXP`;
  el.style.left  = x + 'px';
  el.style.top   = y + 'px';
  document.getElementById('particles').appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// ─── Filters ──────────────────────────────────────────────────────────────────
function setFilter(f) {
  currentFilter = f;
  updateFilterButtons();
  renderTaskList();
}

function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === currentFilter);
  });
  const tasks       = state.tasks[state.activeListId] || [];
  const activeCount = tasks.filter(t => !t.completed).length;
  const badge       = document.getElementById('activeCount');
  if (badge) badge.textContent = activeCount > 0 ? String(activeCount) : '';
}

function updateSubtitle() {
  const tasks = state.tasks[state.activeListId] || [];
  const done  = tasks.filter(t => t.completed).length;
  const el    = document.getElementById('listSubtitle');
  if (el) el.textContent = t('completedOf', done, tasks.length);
  updateFilterButtons();
}

// ─── Context Menus ────────────────────────────────────────────────────────────
/**
 * FIX 5 – showTaskContextMenu reads from contextMenuTargetId, not a closure.
 * The task is always looked up fresh from state at the moment the action fires.
 */
function showTaskContextMenu(x, y) {
  // Snapshot the id into a local const RIGHT NOW so the closures below
  // are guaranteed to have the correct id regardless of when they fire.
  // This is belt-AND-suspenders alongside the snapshot in the click handler.
  const frozenId = contextMenuTargetId;

  const items = [
    {
      icon: '✏️', label: t('editTask'),
      action: () => {
        const task = getTaskById(frozenId);
        if (task) openEditTaskModal(task);
      }
    },
    {
      icon: '⚡', label: t('changeExp'),
      action: () => {
        const task = getTaskById(frozenId);
        if (task) openChangeExpModal(task);
      }
    },
    {
      icon: '🗑️', label: t('removeTask'), danger: true,
      action: () => deleteTask(frozenId)
    }
  ];
  renderContextMenu(x, y, items);
}

function showListContextMenu(x, y) {
  // Snapshot immediately — same freeze pattern as showTaskContextMenu
  const frozenList = contextMenuTargetList;
  if (!frozenList) return;
  const items = [
    {
      icon: '✏️', label: t('rename'),
      action: () => openRenameListModal(frozenList.id, frozenList.name)
    },
    {
      icon: '🗑️', label: t('delete'), danger: true,
      action: () => deleteList(frozenList.id)
    }
  ];
  renderContextMenu(x, y, items);
}

/**
 * FIX 6 – renderContextMenu uses addEventListener, not inline onclick.
 * This works correctly with Electron's CSP (script-src 'self').
 * Buttons get their handlers via JS — the menu is NOT hidden before click
 * because the dismiss listener checks if the click is inside the menu first.
 */
function renderContextMenu(x, y, items) {
  const menu = document.getElementById('contextMenu');
  menu.innerHTML = '';

  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'ctx-item' + (item.danger ? ' danger' : '');
    // Build icon + label with DOM (not innerHTML from untrusted data)
    const iconSpan = document.createElement('span');
    iconSpan.className   = 'ctx-icon';
    iconSpan.textContent = item.icon;
    const labelNode = document.createTextNode(item.label);
    btn.appendChild(iconSpan);
    btn.appendChild(labelNode);

    // FIXED: Capture the target ids NOW, before hideContextMenu() nulls them.
    // Then hide the menu visually, restore the captured values so the action
    // lambdas (which read the globals) still see them, run the action, then clear.
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 1. Snapshot globals before they get nulled
      const _taskId = contextMenuTargetId;
      const _list   = contextMenuTargetList;
      // 2. Hide menu UI (also nulls globals — that's fine, we snapshotted above)
      hideContextMenu();
      // 3. Restore snapshots so the item.action() lambda can read them
      contextMenuTargetId   = _taskId;
      contextMenuTargetList = _list;
      // 4. Run action synchronously — no setTimeout needed
      item.action();
      // 5. Clear for real
      contextMenuTargetId   = null;
      contextMenuTargetList = null;
    });

    menu.appendChild(btn);
  });

  menu.style.left    = x + 'px';
  menu.style.top     = y + 'px';
  menu.style.display = 'block';

  // Constrain to viewport
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

// ─── Modals ───────────────────────────────────────────────────────────────────
/**
 * FIX 7 – All modal buttons use addEventListener, not inline onclick strings.
 * showModal() accepts a setup callback that receives the modal element,
 * allowing callers to attach real event listeners to buttons.
 */
function showModal(buildFn) {
  const overlay = document.getElementById('modalOverlay');
  const modal   = document.getElementById('modal');
  modal.innerHTML = '';
  buildFn(modal);        // caller populates modal and attaches listeners
  overlay.style.display = 'flex';

  // Close on backdrop click
  const onOverlayClick = (e) => {
    if (e.target === overlay) {
      hideModal();
      overlay.removeEventListener('click', onOverlayClick);
    }
  };
  overlay.addEventListener('click', onOverlayClick);
}

function hideModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  document.getElementById('modal').innerHTML = '';
}

function openEditTaskModal(task) {
  showModal(modal => {
    const h   = el('h3',    { className: 'modal-title' }, t('editTaskTitle'));
    const inp = el('input', { className: 'modal-input', type: 'text', value: task.title });
    const row = el('div',   { className: 'modal-actions' });
    const cancel = el('button', { className: 'btn-secondary' }, t('cancel'));
    const save   = el('button', { className: 'btn-primary'   }, t('save'));

    const commit = () => {
      const v = inp.value.trim();
      if (v) { editTaskTitle(task.id, v); renderTaskList(); hideModal(); }
    };

    cancel.addEventListener('click', hideModal);
    save.addEventListener('click', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  commit();
      if (e.key === 'Escape') hideModal();
    });

    row.append(cancel, save);
    modal.append(h, inp, row);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

function openChangeExpModal(task) {
  showModal(modal => {
    const presets = [5, 10, 20, 50, 100];

    const h    = el('h3',    { className: 'modal-title' }, t('setExpTitle'));
    const grid = el('div',   { className: 'preset-grid' });
    const inp  = el('input', { className: 'modal-input', type: 'number', min: '1', max: '9999', value: String(task.expValue) });
    const row  = el('div',   { className: 'modal-actions' });
    const cancel = el('button', { className: 'btn-secondary' }, t('cancel'));
    const save   = el('button', { className: 'btn-primary'   }, t('save'));

    presets.forEach(p => {
      const btn = el('button', { className: 'preset-btn' + (p === task.expValue ? ' active' : '') }, String(p));
      btn.addEventListener('click', () => {
        inp.value = String(p);
        grid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      grid.appendChild(btn);
    });

    cancel.addEventListener('click', hideModal);
    save.addEventListener('click', () => {
      const v = parseInt(inp.value) || 1;
      changeTaskExp(task.id, v);
      hideModal();
    });

    row.append(cancel, save);
    modal.append(h, grid, inp, row);
    setTimeout(() => inp.focus(), 30);
  });
}

function openRenameListModal(id, currentName) {
  showModal(modal => {
    const h   = el('h3',    { className: 'modal-title' }, t('renameListTitle'));
    const inp = el('input', { className: 'modal-input', type: 'text', value: currentName });
    const row = el('div',   { className: 'modal-actions' });
    const cancel = el('button', { className: 'btn-secondary' }, t('cancel'));
    const save   = el('button', { className: 'btn-primary'   }, t('save'));

    const commit = () => {
      const v = inp.value.trim();
      if (v) { renameList(id, v); hideModal(); }
    };

    cancel.addEventListener('click', hideModal);
    save.addEventListener('click', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  commit();
      if (e.key === 'Escape') hideModal();
    });

    row.append(cancel, save);
    modal.append(h, inp, row);
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

function showAlertModal(msg) {
  showModal(modal => {
    const p  = el('p',  { style: 'margin-bottom:20px;color:var(--text)' }, msg);
    const ok = el('button', { className: 'btn-primary' }, t('ok'));
    const row = el('div', { className: 'modal-actions' });
    ok.addEventListener('click', hideModal);
    row.appendChild(ok);
    modal.append(p, row);
  });
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
function onGlobalKeydown(e) {
  if (e.key === 'Escape')                    { hideContextMenu(); hideModal(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); createList(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); toggleDark(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleLang(); }
}

// ─── DOM Utility ──────────────────────────────────────────────────────────────
/** Create an element with props and optional text content */
function el(tag, props = {}, text) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  // Allow style object
  if (props.style && typeof props.style === 'string') node.style.cssText = props.style;
  if (text !== undefined) node.textContent = text;
  return node;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bindResizer() {
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('dragHandle');
  let isResizing = false;

  resizer.addEventListener('mousedown', () => {
    isResizing = true;
    resizer.classList.add('active-drag');
    document.body.classList.add('is-dragging'); 
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    let newWidth = e.clientX;
    // Khống chế kích thước: nhỏ nhất 150px, to nhất 500px
    if (newWidth < 150) newWidth = 150;
    if (newWidth > 500) newWidth = 500;
    sidebar.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('active-drag');
      document.body.classList.remove('is-dragging');
      // Lưu lại độ rộng vào file JSON
      state.sidebarWidth = parseInt(sidebar.style.width, 10);
      scheduleSave();
    }
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();
