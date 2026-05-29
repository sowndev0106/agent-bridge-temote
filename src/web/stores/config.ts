import { create } from 'zustand'
import type { AppConfig } from '../../types'

type SafeConfig = Omit<AppConfig, 'password' | 'sessionSecret'>

interface ConfigStore {
  config: SafeConfig | null
  wsConnected: boolean
  setConfig: (cfg: SafeConfig) => void
  setWsConnected: (connected: boolean) => void
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  wsConnected: false,
  setConfig: (config) => set({ config }),
  setWsConnected: (wsConnected) => set({ wsConnected })
}))
