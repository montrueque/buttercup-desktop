import electronContextMenu from 'electron-context-menu';
import { app, shell, Menu } from 'electron';
import { isOSX } from '../shared/utils/platform';
import {
  getCurrentArchiveId,
  getAllArchives,
  getSetting
} from '../shared/selectors';
import { setSetting } from '../shared/actions/settings';
import { ImportTypeInfo } from '../shared/buttercup/types';
import { openFile, openFileForImporting, newFile } from './lib/files';
import { toggleArchiveSearch } from './lib/archive-search';
import { getWindowManager } from './lib/window-manager';
import { checkForUpdates } from './lib/updater';
import { startHost, stopHost } from './lib/file-host';
import { getMainWindow, reopenMainWindow } from './utils/window';
import { setupTrayIcon } from './tray';
import i18n, { languages } from '../shared/i18n';
import pkg from '../../package.json';
import { getShortcutByKey } from '../shared/utils/global-shortcuts';

electronContextMenu();

const label = (key, options) => i18n.t(`app-menu.${key}`, options);

export const setupMenu = store => {
  setupTrayIcon(store);

  const state = store.getState();
  const archives = getAllArchives(state);
  const currentArchiveId = getCurrentArchiveId(state);
  const globalShortcuts = getSetting(state, 'globalShortcuts');

  const shortcutByLabel = (key, isAppMenu = true) =>
    getShortcutByKey(isAppMenu ? `app-menu.${key}` : key, globalShortcuts);

  // Default should be safe (always on) in case it isn't set.
  const menubarAutoHideSetting = getSetting(state, 'menubarAutoHide');
  const menubarAutoHide =
    typeof menubarAutoHideSetting === 'boolean'
      ? menubarAutoHideSetting
      : false;

  const preferencesSection = [
    { type: 'separator' },
    {
      label: label('app.preferences'),
      accelerator: shortcutByLabel('app.preferences'),
      click: () => {
        const windowManager = getWindowManager();
        const [preferencesWindow] = windowManager.getWindowsOfType(
          'app-preferences'
        );

        if (!preferencesWindow) {
          if (isOSX()) {
            app.dock.show();
          }

          reopenMainWindow(win => {
            windowManager.buildWindowOfType('app-preferences', null, {
              parent: win,
              title: i18n.t('preferences.preferences'),
              titleBarStyle: 'hiddenInset'
            });
          });
        } else {
          preferencesWindow.close();
        }
      }
    }
  ];

  const defaultTemplate = [
    {
      label: isOSX() ? label('archive.archive') : label('archive.file'),
      submenu: [
        {
          label: label('archive.new'),
          accelerator: shortcutByLabel('archive.new'),
          click: () => {
            reopenMainWindow(win => newFile(win));
          }
        },
        {
          label: label('archive.open'),
          accelerator: shortcutByLabel('archive.open'),
          click: () => {
            reopenMainWindow(win => openFile(win));
          }
        },
        {
          label: label('archive.connect-cloud-sources'),
          accelerator: shortcutByLabel('archive.connect-cloud-sources'),
          click: () => {
            reopenMainWindow(win => {
              getWindowManager().buildWindowOfType('file-manager', null, {
                parent: win
              });
            });
          }
        },
        ...(!isOSX() ? preferencesSection : []),
        {
          type: 'separator'
        },
        {
          label: i18n.t('entry.add-entry'),
          accelerator: shortcutByLabel('entry.add-entry', false),
          enabled: currentArchiveId !== null,
          click: () => {
            reopenMainWindow(win => {
              win.webContents.send('trigger-add-entry');
            });
          }
        },
        {
          label: i18n.t('group.new-group'),
          accelerator: shortcutByLabel('group.new-group', false),
          enabled: currentArchiveId !== null,
          click: () => {
            reopenMainWindow(win => {
              win.webContents.send('trigger-new-group');
            });
          }
        },
        {
          type: 'separator'
        },
        {
          label: label('archive.import.import'),
          submenu: Object.entries(ImportTypeInfo).map(([typeKey, type]) => ({
            label: label('archive.import.import-from-type', {
              name: type.name,
              extension: type.extension
            }),
            submenu:
              archives.length > 0
                ? archives.map(archive => ({
                    label: label('archive.import.import-to-type', {
                      name: archive.name,
                      extension: type.extension
                    }),
                    enabled: archive.status === 'unlocked',
                    click: (item, focusedWindow) => {
                      openFileForImporting(focusedWindow, typeKey, archive.id);
                    }
                  }))
                : [
                    {
                      label: label('archive.import.no-available-archives'),
                      enabled: false
                    }
                  ]
          }))
        },
        {
          label: label('archive.export.export'),
          submenu:
            archives.length > 0
              ? archives.map(archive => ({
                  label: label('archive.export.export-archive', {
                    name: archive.name
                  }),
                  enabled: archive.status === 'unlocked',
                  click: (item, focusedWindow) => {
                    reopenMainWindow(win => {
                      win.webContents.send('export-archive', archive.id);
                    });
                  }
                }))
              : [
                  {
                    label: label('archive.export.no-available-archives'),
                    enabled: false
                  }
                ]
        },
        {
          type: 'separator'
        },
        {
          label: label('archive.search'),
          accelerator: shortcutByLabel('archive.search'),
          click: (item, focusedWindow) => toggleArchiveSearch(focusedWindow)
        },
        {
          type: 'separator'
        },
        {
          role: 'close',
          label: label('archive.close')
        }
      ]
    },
    {
      label: label('edit.edit'),
      submenu: [
        {
          role: 'undo',
          label: label('edit.undo')
        },
        {
          role: 'redo',
          label: label('edit.redo')
        },
        { type: 'separator' },
        {
          role: 'cut',
          label: label('edit.cut')
        },
        {
          role: 'copy',
          label: label('edit.copy')
        },
        {
          role: 'paste',
          label: label('edit.paste')
        },
        {
          role: 'pasteandmatchstyle',
          label: label('edit.pasteandmatchstyle')
        },
        {
          role: 'delete',
          label: label('edit.delete')
        },
        {
          role: 'selectall',
          label: label('edit.selectall')
        }
      ]
    },
    {
      label: label('view.view'),
      submenu: [
        {
          label: label('view.condensed-sidebar'),
          type: 'checkbox',
          checked: getSetting(state, 'condencedSidebar'),
          accelerator: shortcutByLabel('view.condensed-sidebar'),
          click: item => {
            store.dispatch(setSetting('condencedSidebar', item.checked));
          }
        },
        {
          label: label('view.enable-tray-icon'),
          type: 'checkbox',
          checked: getSetting(state, 'isTrayIconEnabled'),
          click: item => {
            store.dispatch(setSetting('isTrayIconEnabled', item.checked));
            setupTrayIcon(store);
          }
        },
        { type: 'separator' },
        // Language menu point
        {
          label: label('view.language'),
          submenu: Object.keys(languages).map(key => ({
            label: languages[key].name,
            checked: getSetting(state, 'locale') === key,
            enabled: getSetting(state, 'locale') !== key,
            type: 'checkbox',
            click: () => {
              store.dispatch(setSetting('locale', key));
              i18n.changeLanguage(key);
              const win = getMainWindow();
              if (win) {
                setupMenu(store);
                Menu.setApplicationMenu(
                  Menu.buildFromTemplate(defaultTemplate)
                );
                win.webContents.send('change-locale-main', key);
              }
            }
          }))
        },
        ...(!isOSX()
          ? [
              {
                label: label('view.auto-hide-menubar'),
                type: 'checkbox',
                checked: menubarAutoHide,
                click: item => {
                  getMainWindow().setAutoHideMenuBar(item.checked);
                  store.dispatch(setSetting('menubarAutoHide', item.checked));
                }
              }
            ]
          : []),
        { type: 'separator' },
        {
          role: 'reload',
          label: label('view.reload')
        },
        {
          role: 'forcereload',
          label: label('view.forcereload')
        },
        {
          role: 'toggledevtools',
          label: label('view.toggledevtools')
        },
        { type: 'separator' },
        {
          role: 'togglefullscreen',
          label: label('view.togglefullscreen')
        }
      ]
    },
    {
      label: label('window.window'),
      role: 'window',
      submenu: [
        {
          role: 'minimize',
          label: label('window.minimize')
        },
        {
          role: 'close',
          label: label('window.close')
        },
        { type: 'separator' },
        ...archives.map((archive, index) => ({
          label: archive.name,
          accelerator: `CmdOrCtrl+${index + 1}`,
          // set type to checkbox because if none of the archives are
          // selected and the type is radio, then always the first item
          // will show as active which is unwanted.
          type: currentArchiveId ? 'radio' : 'checkbox',
          click: () => {
            reopenMainWindow(win => {
              win.webContents.send('vault-set-current', archive.id);
            });
          },
          checked: archive.id === currentArchiveId
        }))
      ]
    },
    {
      label: label('system.system'),
      submenu: [
        {
          label: label('system.enable-browser-access'),
          type: 'checkbox',
          checked: getSetting(state, 'isBrowserAccessEnabled'),
          click: item => {
            store.dispatch(setSetting('isBrowserAccessEnabled', item.checked));
            if (item.checked) {
              startHost();
            } else {
              stopHost();
            }
          }
        }
      ]
    },
    {
      label: label('help.help'),
      role: 'help',
      submenu: [
        {
          label: label('help.visit-our-website'),
          click: () => {
            shell.openExternal('https://buttercup.pw');
          }
        },
        {
          label: label('help.privacy-policy'),
          click: () => {
            shell.openExternal('https://buttercup.pw/privacy');
          }
        },
        {
          label: label('help.view-changelog-for-v', {
            currentVersion: pkg.version
          }),
          click: () => {
            shell.openExternal(
              `https://github.com/buttercup/buttercup/releases/tag/v${pkg.version}`
            );
          }
        }
      ]
    }
  ];

  if (isOSX()) {
    defaultTemplate.unshift({
      label: app.name,
      submenu: [
        { role: 'services', submenu: [], label: label('app.services') },
        { type: 'separator' },
        { role: 'hide', label: label('app.hide') },
        { role: 'hideothers', label: label('app.hideothers') },
        { role: 'unhide', label: label('app.unhide') },
        { type: 'separator' },
        { role: 'quit', label: label('app.quit') }
      ]
    });

    // Edit
    defaultTemplate[2].submenu.push(
      { type: 'separator' },
      {
        label: label('edit.speech.speech'),
        submenu: [
          { role: 'startspeaking', label: label('edit.speech.startspeaking') },
          { role: 'stopspeaking', label: label('edit.speech.stopspeaking') }
        ]
      }
    );

    // Window
    defaultTemplate[4].submenu.splice(
      2,
      0,
      {
        role: 'zoom',
        label: label('window.zoom')
      },
      {
        type: 'separator'
      },
      {
        role: 'front',
        label: label('window.front')
      }
    );
  }

  // About and Check for Updates...
  // App menu on macOS and Help menu on others
  defaultTemplate[isOSX() ? 0 : 4].submenu.unshift(
    { role: 'about', label: label('app.about') },
    {
      label: label('app.check-for-updates'),
      click: () => {
        checkForUpdates();
      }
    },
    ...preferencesSection,
    { type: 'separator' }
  );

  const buildTemplate = Menu.buildFromTemplate(defaultTemplate);
  Menu.setApplicationMenu(buildTemplate);
};
