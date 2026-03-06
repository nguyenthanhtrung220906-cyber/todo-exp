/**
 * Todo EXP – Electron Main Process
 * Handles window creation, IPC, and persistent storage via JSON file
 */

const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater'); // Thêm autoUpdater nè bro
const path = require('path');
const fs = require('fs');

// ─── Dev Mode Detection ────────────────────────────────────────────────────────
const isDev = process.argv.includes('--dev');

// ─── Data Storage Setup ────────────────────────────────────────────────────────
// Store data in the OS user data directory (persists across updates)
const userDataPath = app.getPath('userData');
const dataFilePath = path.join(userDataPath, 'todoexp-data.json');

// Default initial data
const DEFAULT_DATA = {
  lists: [
    { id: 'today',    name: 'My Day',    icon: '☀️' },
    { id: 'study',    name: 'Study',     icon: '📚' },
    { id: 'work',     name: 'Work',      icon: '💼' },
    { id: 'personal', name: 'Personal',  icon: '🏠' }
  ],
  tasks: {
    today: [
      {
        id: 'demo1',
        title: 'Welcome to Todo EXP! Complete tasks to earn EXP.',
        completed: false,
        expValue: 20,
        createdAt: Date.now()
      },
      {
        id: 'demo2',
        title: 'Right-click any task to edit, remove, or change EXP',
        completed: false,
        expValue: 10,
        createdAt: Date.now() - 1000
      }
    ],
    study: [],
    work: [],
    personal: []
  },
  exp: 0,
  dark: false,
  activeListId: 'today'
};

/**
 * Load data from JSON file. Returns default data if file doesn't exist or is corrupt.
 */
function loadData() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Merge with defaults to handle new fields added in updates
      return { ...DEFAULT_DATA, ...parsed };
    }
  } catch (err) {
    console.error('Failed to load data:', err);
  }
  return { ...DEFAULT_DATA };
}

/**
 * Save data to JSON file atomically (write to temp then rename).
 */
function saveData(data) {
  try {
    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const tmpPath = dataFilePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, dataFilePath);
    return { success: true };
  } catch (err) {
    console.error('Failed to save data:', err);
    return { success: false, error: err.message };
  }
}

// ─── Window Management ─────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    title: 'Todo EXP',
    backgroundColor: '#f0f2f8',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // Security: isolate renderer from Node
      nodeIntegration: false,   // Security: no Node in renderer
      sandbox: false            // Required for preload
    },
    frame: false,       // Custom title bar
    titleBarStyle: 'hidden',
    show: false         // Don't show until ready
  });

  // Load the renderer
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show when ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
    
    // Chỉ check update khi KHÔNG phải là môi trường dev
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });

  // Open external links in browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Auto Updater Events ───────────────────────────────────────────────────────
// Gửi thông báo về cho UI để show trạng thái update
autoUpdater.on('update-available', () => {
  if (mainWindow) mainWindow.webContents.send('update-message', 'Có bản update mới nha đại ca!');
});

autoUpdater.on('download-progress', (progressObj) => {
  // Gửi phần trăm tải xuống về cho renderer làm progress bar
  if (mainWindow) mainWindow.webContents.send('update-progress', progressObj.percent);
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('update-downloaded', 'Tải xong rồi, khởi động lại để cài nhé!');
});

// Lắng nghe lệnh từ UI yêu cầu cài đặt và restart
ipcMain.on('app:installUpdate', () => {
  autoUpdater.quitAndInstall();
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Load all app data
ipcMain.handle('data:load', () => {
  return loadData();
});

// Save all app data (full replace)
ipcMain.handle('data:save', (_event, data) => {
  return saveData(data);
});

// Get app version
ipcMain.handle('app:version', () => {
  return app.getVersion();
});

// Window controls (custom title bar)
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

// Get data file path (for showing user where data is stored)
ipcMain.handle('app:dataPath', () => {
  return dataFilePath;
});

// Open data folder in Explorer
ipcMain.on('app:openDataFolder', () => {
  shell.openPath(userDataPath);
});