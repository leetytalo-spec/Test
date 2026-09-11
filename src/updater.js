import { registerPlugin } from '@capacitor/core'

const UPDATE_MANIFEST_URL = 'https://leetarena.tech/updates/latest.json'
const WEB_UPDATE_MANIFEST_URL = 'https://leetarena.tech/updates/web.json'
const ApkUpdater = registerPlugin('ApkUpdater')

function getPlugin() {
  return window.Capacitor?.isNativePlatform?.() ? ApkUpdater : null
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
    const current = Number(localStorage.getItem('leet-web-version') || '0')
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
  localStorage.setItem('leet-web-version', String(nextVersion))
  window.location.reload()
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
  await plugin.downloadAndInstall({ url: manifest.downloadUrl, fileName: `leet-arena-${manifest.versionName}.apk` })
}
