import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

import type { DesktopProfileRoute } from './desktop-profile'
import type { HudModifierApi, HudModifierStatus } from './hud-modifier-types'
import { customWindowControlsEnabled } from './window-controls'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.harryDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('harry:translucency:support')
const hudWindowing = ipcRenderer.sendSync('harry:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true
const launchFlags = ipcRenderer.sendSync('harry:launch-flags')
// Local, sanitized skin payload for the first renderer theme paint. This does
// not wait on `gateway.ready`, so an unreachable remote primary cannot force
// the built-in palette over the skin configured on this machine.
const localSkin = ipcRenderer.sendSync('harry:skin:local')

contextBridge.exposeInMainWorld('harryDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  // Launch-flag fact: the app was started with --local, so the renderer may
  // show the local-models surfaces. Static for the window's lifetime.
  localModelsEnabled: launchFlags?.localModels === true,
  // Launch-flag fact: the Nous free tier is on for this launch
  // (HARRY_GUEST_ONBOARDING=1 or --guest-onboarding). Read-only; the same
  // decision is stamped onto every backend the app spawns.
  guestOnboardingEnabled: launchFlags?.guestOnboarding === true,
  localSkin: localSkin && typeof localSkin === 'object' ? localSkin : null,
  // Launch-flag fact: skip the first-run film (HARRY_SKIP_INTRO=1 or
  // --skip-intro). Rehearsal aid for the guided chat behind it.
  skipIntro: launchFlags?.skipIntro === true,
  getConnection: (profile, opts) => ipcRenderer.invoke('harry:connection', profile, opts),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('harry:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('harry:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('harry:connection:revalidate'),
  touchBackend: (profile, options) => ipcRenderer.invoke('harry:backend:touch', profile, options),
  getPoolLimits: () => ipcRenderer.invoke('harry:pool-limits:get'),
  setPoolLimits: limits => ipcRenderer.invoke('harry:pool-limits:set', limits),
  getGatewayWsUrl: profile => ipcRenderer.invoke('harry:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('harry:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('harry:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('harry:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('harry:window:openInTerminal', sessionId, opts),
  openWindow: (options?: DesktopProfileRoute) => ipcRenderer.invoke('harry:window:openInstance', options),
  openBrowserWindow: tabId => ipcRenderer.invoke('harry:window:openBrowser', tabId),
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('harry:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('harry:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('harry:ambient:claim', key),
  windowControls: {
    custom: customWindowControlsEnabled(),
    minimize: () => ipcRenderer.send('harry:window-control', 'minimize'),
    toggleMaximize: () => ipcRenderer.send('harry:window-control', 'toggle-maximize'),
    close: () => ipcRenderer.send('harry:window-control', 'close')
  },
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('harry:wake-indicator:get'),
    setState: state => ipcRenderer.send('harry:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('harry:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('harry:wake-indicator:state', listener)
    }
  },
  chatOnboarding: {
    grow: request => ipcRenderer.send('harry:chat-onboarding:grow', request),
    soloBoot: () => ipcRenderer.send('harry:chat-onboarding:solo-boot')
  },
  introReveal: {
    open: (payload?: { hideMain?: boolean }) => ipcRenderer.invoke('harry:intro-reveal:open', payload),
    close: (payload?: { showMain?: boolean }) => ipcRenderer.invoke('harry:intro-reveal:close', payload),
    skip: () => ipcRenderer.send('harry:intro-reveal:skip'),
    ready: () => ipcRenderer.send('harry:intro-reveal:ready'),
    onSkip: callback => {
      const listener = () => callback()

      ipcRenderer.on('harry:intro-reveal:skip', listener)

      return () => ipcRenderer.removeListener('harry:intro-reveal:skip', listener)
    },
    onClosed: callback => {
      const listener = () => callback()

      ipcRenderer.on('harry:intro-reveal:closed', listener)

      return () => ipcRenderer.removeListener('harry:intro-reveal:closed', listener)
    }
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('harry:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('harry:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('harry:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('harry:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('harry:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('harry:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('harry:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('harry:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('harry:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('harry:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('harry:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('harry:hud:open', request),
    close: () => ipcRenderer.invoke('harry:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('harry:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('harry:hud:begin-move'),
    endMove: () => ipcRenderer.send('harry:hud:end-move'),
    moveBy: delta => ipcRenderer.send('harry:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('harry:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('harry:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('harry:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('harry:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('harry:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('harry:hud:goto', listener)

      return () => ipcRenderer.removeListener('harry:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('harry:hud:changed', listener)

      return () => ipcRenderer.removeListener('harry:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('harry:hud:cursor', listener)

      return () => ipcRenderer.removeListener('harry:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('harry:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('harry:hud:game-overlay', listener)
    }
  },
  hudModifier: {
    getSettings: () => ipcRenderer.invoke('harry:hud-modifier:settings:get'),
    setEnabled: enabled => ipcRenderer.invoke('harry:hud-modifier:settings:set', enabled),
    openPermissionSettings: () => ipcRenderer.invoke('harry:hud-modifier:permission'),
    onStatus: callback => {
      const listener = (_event: Electron.IpcRendererEvent, status: HudModifierStatus) => callback(status)
      ipcRenderer.on('harry:hud-modifier:status', listener)

      return () => ipcRenderer.removeListener('harry:hud-modifier:status', listener)
    }
  } satisfies HudModifierApi,
  // macOS native screenshot gesture; captures require a main-issued request.
  screenshot:
    process.platform === 'darwin'
      ? {
          getSettings: () => ipcRenderer.invoke('harry:screenshot:settings:get'),
          setEnabled: enabled => ipcRenderer.invoke('harry:screenshot:settings:set', enabled),
          openPermissionSettings: kind => ipcRenderer.invoke('harry:screenshot:permission', kind),
          capture: requestId => ipcRenderer.invoke('harry:screenshot:capture', requestId),
          onStatus: callback => {
            const listener = (_event, status) => callback(status)
            ipcRenderer.on('harry:screenshot:status', listener)

            return () => ipcRenderer.removeListener('harry:screenshot:status', listener)
          },
          onRequest: callback => {
            const channel = 'harry:screenshot:request'
            const listener = (_event, requestId) => callback(requestId)

            if (ipcRenderer.listenerCount(channel) === 0) {
              ipcRenderer.send('harry:screenshot:subscribe', true)
            }

            ipcRenderer.on(channel, listener)

            return () => {
              ipcRenderer.removeListener(channel, listener)

              if (ipcRenderer.listenerCount(channel) === 0) {
                ipcRenderer.send('harry:screenshot:subscribe', false)
              }
            }
          }
        }
      : undefined,
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('harry:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('harry:quick-entry:settings:set', patch),
    submit: payload => ipcRenderer.send('harry:quick-entry:submit', payload),
    dismiss: () => ipcRenderer.send('harry:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('harry:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('harry:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('harry:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('harry:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('harry:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('harry:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('harry:quick-entry:shown', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('harry:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('harry:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('harry:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('harry:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('harry:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('harry:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('harry:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('harry:connections:list'),
    save: payload => ipcRenderer.invoke('harry:connections:save', payload),
    remove: id => ipcRenderer.invoke('harry:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('harry:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('harry:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('harry:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('harry:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('harry:connections:update-managed', id),
    // Fan out `harry update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('harry:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('harry:connections:changed', listener)

      return () => ipcRenderer.removeListener('harry:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('harry:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('harry:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('harry:connection-config:probe', remoteUrl),
  oauthLoginConnectionConfig: remoteUrl => ipcRenderer.invoke('harry:connection-config:oauth-login', remoteUrl),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('harry:connection-config:oauth-logout', remoteUrl),
  // Harry Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('harry:cloud:status'),
    login: () => ipcRenderer.invoke('harry:cloud:login'),
    logout: () => ipcRenderer.invoke('harry:cloud:logout'),
    discover: org => ipcRenderer.invoke('harry:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('harry:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    getDefault: () => ipcRenderer.invoke('harry:profile:default:get'),
    setDefault: (route: DesktopProfileRoute) => ipcRenderer.invoke('harry:profile:default:set', route),
    onDefaultChanged: (callback: (route: DesktopProfileRoute | null) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, route: DesktopProfileRoute | null) => callback(route)
      ipcRenderer.on('harry:profile:default:changed', listener)

      return () => ipcRenderer.removeListener('harry:profile:default:changed', listener)
    },
    get: () => ipcRenderer.invoke('harry:profile:get'),
    remember: name => ipcRenderer.invoke('harry:profile:remember', name),
    set: name => ipcRenderer.invoke('harry:profile:set', name)
  },
  api: request => ipcRenderer.invoke('harry:api', request),
  notify: payload => ipcRenderer.invoke('harry:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('harry:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('harry:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('harry:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('harry:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('harry:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('harry:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('harry:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('harry:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('harry:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('harry:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('harry:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('harry:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('harry:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('harry:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('harry:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('harry:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('harry:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('harry:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('harry:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext, name) => ipcRenderer.invoke('harry:saveImageBuffer', { data, ext, name }),
  capturePreview: payload => ipcRenderer.invoke('harry:capturePreview', payload),
  savePastedText: text => ipcRenderer.invoke('harry:savePastedText', { text }),
  saveClipboardImage: () => ipcRenderer.invoke('harry:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('harry:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('harry:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('harry:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('harry:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('harry:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('harry:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('harry:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('harry:translucency', payload),
  setKeepAwake: on => ipcRenderer.send('harry:keep-awake', on),
  minimizeToTray: {
    get: () => ipcRenderer.invoke('harry:minimize-to-tray:get'),
    set: on => ipcRenderer.invoke('harry:minimize-to-tray:set', on),
    onChanged: callback => {
      const listener = (_event, status) => callback(status)
      ipcRenderer.on('harry:minimize-to-tray:changed', listener)

      return () => ipcRenderer.removeListener('harry:minimize-to-tray:changed', listener)
    }
  },
  setDisableF12: blocked => ipcRenderer.send('harry:devtools:disable-f12', blocked),
  setF12ShortcutActive: active => ipcRenderer.send('harry:f12ShortcutActive', Boolean(active)),
  onF12Shortcut: callback => {
    const listener = (_event, input) => callback(input)
    ipcRenderer.on('harry:f12-shortcut', listener)

    return () => ipcRenderer.removeListener('harry:f12-shortcut', listener)
  },
  setPreviewShortcutActive: active => ipcRenderer.send('harry:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('harry:openExternal', url),
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('harry:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('harry:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('harry:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('harry:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('harry:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('harry:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('harry:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('harry:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('harry:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('harry:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('harry:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('harry:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('harry:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('harry:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('harry:zoom:changed', listener)

      return () => ipcRenderer.removeListener('harry:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('harry:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('harry:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('harry:logs:renderer-error', report),
  readDir: dirPath => ipcRenderer.invoke('harry:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('harry:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('harry:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('harry:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('harry:fs:desktopPluginsRoot'),
  reconcileDesktopPlugins: () => ipcRenderer.invoke('harry:fs:reconcileDesktopPlugins'),
  logsRoot: () => ipcRenderer.invoke('harry:fs:logsRoot'),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('harry:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('harry:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('harry:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('harry:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('harry:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('harry:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('harry:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('harry:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('harry:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('harry:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('harry:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('harry:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('harry:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('harry:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('harry:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('harry:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('harry:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('harry:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('harry:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('harry:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('harry:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('harry:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('harry:git:review:prList', repoPath, branches, numbers),
      createPr: repoPath => ipcRenderer.invoke('harry:git:review:createPr', repoPath)
    }
  },
  terminal: {
    attach: id => ipcRenderer.invoke('harry:terminal:attach', id),
    cwd: id => ipcRenderer.invoke('harry:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('harry:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('harry:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('harry:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('harry:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `harry:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `harry:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('harry:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('harry:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('harry:preview-nav', listener)

    return () => ipcRenderer.removeListener('harry:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('harry:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('harry:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('harry:open-updates', listener)

    return () => ipcRenderer.removeListener('harry:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:deep-link', listener)

    return () => ipcRenderer.removeListener('harry:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('harry:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('harry:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('harry:plugin:installDesktop', payload),
  removeDesktopPlugin: payload => ipcRenderer.invoke('harry:plugin:removeDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:window-state-changed', listener)

    return () => ipcRenderer.removeListener('harry:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('harry:focus-session', listener)

    return () => ipcRenderer.removeListener('harry:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:notification-action', listener)

    return () => ipcRenderer.removeListener('harry:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:notification-activate', listener)

    return () => ipcRenderer.removeListener('harry:notification-activate', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('harry:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:backend-exit', listener)

    return () => ipcRenderer.removeListener('harry:backend-exit', listener)
  },
  // Cooperative pool retirement (main → renderer): the pooled backend under
  // `poolKey` is being stopped for a foreground open. Park that scope; do not
  // redial into the slot it vacated.
  onPoolBackendRetiring: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:pool:retiring', listener)

    return () => ipcRenderer.removeListener('harry:pool:retiring', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('harry:connection:applied', listener)

    return () => ipcRenderer.removeListener('harry:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('harry:power-resume', listener)

    return () => ipcRenderer.removeListener('harry:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('harry:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('harry:power-battery', listener)

    return () => ipcRenderer.removeListener('harry:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:boot-progress', listener)

    return () => ipcRenderer.removeListener('harry:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('harry:bootstrap:get'),
  continueBootstrapLocal: () => ipcRenderer.invoke('harry:bootstrap:continue-local'),
  recycleBackend: profile => ipcRenderer.invoke('harry:backend:recycle', profile),
  resetBootstrap: () => ipcRenderer.invoke('harry:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('harry:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('harry:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('harry:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('harry:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('harry:version'),
  relaunchApp: () => ipcRenderer.invoke('harry:app:relaunch'),
  getMachineProfile: () => ipcRenderer.invoke('harry:machine:profile'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('harry:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('harry:uninstall:summary'),
    run: mode => ipcRenderer.invoke('harry:uninstall:run', { mode })
  },
  updates: {
    check: opts => ipcRenderer.invoke('harry:updates:check', opts),
    apply: opts => ipcRenderer.invoke('harry:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('harry:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('harry:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('harry:updates:progress', listener)

      return () => ipcRenderer.removeListener('harry:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('harry:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('harry:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('harry:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('harry:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('harry:found-in-page', listener)

    return () => ipcRenderer.removeListener('harry:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('harry:open-find-bar', listener)

    return () => ipcRenderer.removeListener('harry:open-find-bar', listener)
  }
})
