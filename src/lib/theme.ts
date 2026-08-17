/** 主题切换工具:通过 <html class="dark"> 切换暗/亮色,默认暗色,持久化到 localStorage */

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
  // 暗色 = 加 .dark class;亮色 = 移除
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用,忽略
  }
}

export function initTheme() {
  applyTheme(getTheme())
}
