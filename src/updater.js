import { Capacitor, registerPlugin } from '@capacitor/core'

const UPDATE_MANIFEST_URL = 'https://leetarena.tech/updates/latest.json'
const WEB_UPDATE_MANIFEST_URL = 'https://leetarena.tech/updates/web.json'
const ApkUpdater = registerPlugin('ApkUpdater')

function getPlugin() {
  return Capacitor.isNativePlatform() ? ApkUpdater : null
}

export async function authRequest(path, options = {}) {
  const plugin = getPlugin()
  if (plugin) {
    try {
      const result = await plugin.authRequest({
        path,
        method: options.method || 'GET',
        token: options.token || '',
        body: options.body || '',
      })
      return {
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        json: async () => result.body ? JSON.parse(result.body) : {},
      }
    } catch (error) {
      if (!String(error?.message || error).includes('not implemented')) throw error
    }
  }
  return fetch(`https://leetarena.tech/media${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body || undefined,
  })
}

export async function getInstalledVersion() {
  const plugin = getPlugin()
  if (!plugin) return null
  try {
    return await plugin.getVersionInfo()
  } catch {
    return null
  }
}

export async function checkForUpdate() {
  const plugin = getPlugin()
  if (!plugin) return { available: false }

  let manifest
  try {
    const response = await fetch(UPDATE_MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) return { available: false }
    manifest = await response.json()
  } catch {
    return { available: false }
  }

  let current
  try {
    current = await plugin.getVersionInfo()
  } catch {
    return { available: false }
  }

  const available = Number(manifest.versionCode) > Number(current.versionCode)
  return { available, manifest, currentVersionName: current.versionName }
}

export async function checkWebUpdate() {
  try {
    const response = await fetch(WEB_UPDATE_MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) return { available: false }
    const manifest = await response.json()
    const plugin = getPlugin()
    let current = Number(localStorage.getItem('leet-web-version') || '0')
    if (plugin) {
      try {
        const installed = await plugin.getWebVersion()
        current = Number(installed?.webVersion || 0)
      } catch {
        current = 0
      }
    }
    return {
      available: Number(manifest.versionCode) > current,
      manifest,
      currentVersionName: manifest.versionName,
    }
  } catch (error) {
    return { available: false, error: error.message || 'Falha ao verificar a atualização web.' }
  }
}

export async function installWebUpdate(manifest) {
  if (!manifest?.downloadUrl) {
    throw new Error('Manifesto da atualização web sem URL de download.')
  }
  const nextVersion = Number(manifest.versionCode || 0)
  if (!Number.isFinite(nextVersion)) {
    throw new Error('Versão da atualização web inválida.')
  }
  const plugin = getPlugin()
  if (!plugin) {
    throw new Error('A atualização web precisa ser instalada pelo aplicativo Android.')
  }
  const result = await Promise.race([
    plugin.installWebUpdate({ url: manifest.downloadUrl, version: nextVersion }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('A atualização demorou mais de 75 segundos. Verifique a conexão e tente novamente.')), 75000)),
  ])
  if (!result?.applied) {
    throw new Error('O aplicativo não confirmou a instalação da atualização web.')
  }
  localStorage.setItem('leet-web-version', String(nextVersion))
}

export function onDownloadProgress(callback) {
  return () => {}
}

export function exitApp() {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    const app = window.Capacitor.Plugins?.App
    if (app && typeof app.exitApp === 'function') {
      app.exitApp()
      return
    }
  }
  if (typeof window !== 'undefined') {
    window.location.href = 'about:blank'
  }
}

export async function installUpdate(manifest, onStatus) {
  const plugin = getPlugin()
  if (!plugin) throw new Error('Atualização disponível apenas no aplicativo instalado.')

  const permission = await plugin.canRequestInstall()
  if (!permission.allowed) {
    onStatus?.('Autorize a instalação de fontes desconhecidas na próxima tela.')
    await plugin.requestInstallPermission()
    throw new Error('Confirme a permissão e tente novamente.')
  }

  onStatus?.('Baixando atualização...')
  await plugin.downloadAndInstall({
    url: manifest.downloadUrl,
    fileName: `leet-arena-${manifest.versionName}.apk`,
    sha256: manifest.sha256 || '',
  })
}
