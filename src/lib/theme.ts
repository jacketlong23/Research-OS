/** 主题切换工具:通过 <html class="light"> 切换亮/暗色,持久化到 localStorage */

export type Theme = 'dark' | 'light'

const KEY = 'research-os:theme'

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('light', theme === 'light')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用,忽略
  }
}

export function initTheme() {
  applyTheme(getTheme())
}
