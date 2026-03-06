/**
 * Todo EXP – Preload Script
 *
 * This script runs in a privileged context with access to Node APIs,
 * but exposes only a safe, controlled API to the renderer via contextBridge.
 * This maintains security via context isolation.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process (window.electronAPI)
contextBridge.exposeInMainWorld('electronAPI', {

  // ── Data Persistence ──────────────────────────────────────────────────────
  /** Load all saved app data from the local JSON file */
  loadData: () => ipcRenderer.invoke('data:load'),

  /** Save all app data to the local JSON file. Auto-called on every change. */
  saveData: (data) => ipcRenderer.invoke('data:save', data),

  // ── App Info ──────────────────────────────────────────────────────────────
  /** Get the current app version */
  getVersion: () => ipcRenderer.invoke('app:version'),

  /** Get the path to the data file */
  getDataPath: () => ipcRenderer.invoke('app:dataPath'),

  /** Open the data folder in Windows Explorer */
  openDataFolder: () => ipcRenderer.send('app:openDataFolder'),

  // ── Window Controls (Custom Title Bar) ────────────────────────────────────
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),

  // ── Platform Detection ────────────────────────────────────────────────────
  platform: process.platform,
  isElectron: true
});
