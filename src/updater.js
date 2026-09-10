import { Capacitor, registerPlugin } from '@capacitor/core'

const APP_DOMAIN = 'https://leetarena.tech'
const UPDATE_MANIFEST_URL = `${APP_DOMAIN}/updates/latest.json`
const WEB_MANIFEST_URL = `${APP_DOMAIN}/updates/web.json`
const ApkUpdater = registerPlugin('ApkUpdater')

function getPlugin() {
  return Capacitor.isNativePlatform() ? ApkUpdater : null
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
    manifest = await plugin.getUpdateManifest({ url: UPDATE_MANIFEST_URL })
  } catch (err) {
    return { available: false, error: `Falha na conexão: ${err?.message || 'não foi possível acessar o servidor'}` }
  }

  let current
  try {
    current = await plugin.getVersionInfo()
  } catch {
    return { available: false, error: 'Não foi possível ler a versão instalada.' }
  }

  const available = Number(manifest.versionCode) > Number(current.versionCode)
  return { available, manifest, currentVersionName: current.versionName }
}

export async function checkWebUpdate() {
  const plugin = getPlugin()
  if (!plugin) return { available: false }

  let manifest
  try {
    manifest = await plugin.getUpdateManifest({ url: WEB_MANIFEST_URL })
  } catch (err) {
    return { available: false, error: `Falha na conexão: ${err?.message || 'servidor indisponível'}` }
  }

  let current
  try {
    current = await plugin.getWebVersion()
  } catch {
    return { available: false }
  }

  return { available: Number(manifest.versionCode) > Number(current.webVersion), manifest }
}

export async function installWebUpdate(manifest) {
  const plugin = getPlugin()
  if (!plugin) throw new Error('Atualização disponível apenas no aplicativo instalado.')
  await plugin.installWebUpdate({ url: manifest.downloadUrl, version: Number(manifest.versionCode) })
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

export function onDownloadProgress(callback) {
  const plugin = getPlugin()
  if (!plugin) return () => {}
  const handle = plugin.addListener('downloadProgress', callback)
  return () => handle.remove()
}

export async function exitApp() {
  const plugin = getPlugin()
  if (plugin) await plugin.exitApp()
}
