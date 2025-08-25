/**
 * @file main.tsx
 * @description 应用入口文件，初始化全局状态，设置全局事件监听，挂载根组件。
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { routers } from '@/routes'
import './index.css'
import 'virtual:uno.css'
import { initializeStores } from './store';
import { initTray } from '@/components/Tray'

// 禁止拖拽、右键菜单和部分快捷键，提升桌面体验
document.addEventListener("drop", (e) => e.preventDefault());
document.addEventListener("dragover", (e) => e.preventDefault(),);
document.addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('keydown', (e) => {
  if (['F3', 'F5', 'F7'].includes(e.key.toUpperCase())) {
    e.preventDefault()
  }

  if (e.ctrlKey && ['r', 'u', 'p', 'l', 'j', 'g', 'f', 's', 'a'].includes(e.key.toLowerCase())) {
    e.preventDefault()
  }
})

// 初始化全局状态后，挂载 React 应用
initializeStores().then(async () => {
  await initTray()

  // 应用启动后静默检查更新
  const { silentCheckForUpdates } = await import('@/components/Update')
  silentCheckForUpdates().then((result) => {
    if (result.hasUpdate) {
      console.log('发现新版本可用:', result.version)
      // 可以在这里添加通知逻辑，比如显示在托盘或设置页面
    } else if (result.version) {
      console.log('当前已是最新版本:', result.version)
    }
  })

  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <RouterProvider router={routers} />
    </StrictMode>
  )
})
