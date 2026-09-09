import { registerPlugin } from '@capacitor/core'

const UPDATE_MANIFEST_URL = 'https://leetarena.zorobot.shop/updates/latest.json'
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
