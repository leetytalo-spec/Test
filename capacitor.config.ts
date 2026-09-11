import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.leetarena.game',
  appName: 'Leet Arena',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    url: 'https://leetarena.tech',
    cleartext: false,
  },
}

export default config