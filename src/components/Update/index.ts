import { check, Update } from '@tauri-apps/plugin-updater';

export interface UpdateProgress {
  downloaded: number;
  contentLength: number;
  percentage: number;
}

export interface UpdateCallbacks {
  onUpdateFound?: (update: Update) => void;
  onProgress?: (progress: UpdateProgress) => void;
  onDownloadComplete?: () => void;
  onError?: (error: string) => void;
  onNoUpdate?: () => void;
}

// 检查更新的主函数
export const checkForUpdates = async (callbacks?: UpdateCallbacks) => {
  try {
    console.log('正在检查更新...');
    const update = await check();
    
    if (update) {  
      console.log(`发现新版本: ${update.version}`, update);
      callbacks?.onUpdateFound?.(update);
      return update;
    } else {
      console.log('当前已是最新版本');
      callbacks?.onNoUpdate?.();
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '检查更新失败';
    console.error('检查更新失败:', error);
    callbacks?.onError?.(errorMessage);
    return null;
  }
};

// 下载并安装更新
export const downloadAndInstallUpdate = async (
  update: Update, 
  callbacks?: UpdateCallbacks
) => {
  try {
    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength || 0;
          console.log(`开始下载 ${contentLength} 字节`);
          break;
          
        case 'Progress':
          downloaded += event.data.chunkLength;
          const percentage = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
          console.log(`下载进度: ${percentage}% (${downloaded}/${contentLength})`);
          
          callbacks?.onProgress?.({
            downloaded,
            contentLength,
            percentage
          });
          break;
          
        case 'Finished':
          console.log('下载完成');
          callbacks?.onDownloadComplete?.();
          break;
      }
    });

    console.log('更新安装完成');
    // 注意：在 Windows 上，应用会自动退出并重启
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '下载/安装更新失败';
    console.error('更新失败:', error);
    callbacks?.onError?.(errorMessage);
  }
};

// 完整的更新流程（检查 + 安装）
export const autoUpdate = async (callbacks?: UpdateCallbacks) => {
  const update = await checkForUpdates(callbacks);
  if (update) {
    await downloadAndInstallUpdate(update, callbacks);
  }
};

// 静默检查更新（应用启动时调用）
export const silentCheckForUpdates = async () => {
  try {
    // 开发环境下可能没有签名，先跳过检查
    if (import.meta.env.DEV) {
      console.log('开发环境跳过更新检查');
      return { hasUpdate: false };
    }
    
    const update = await check();
    if (update) {  
      // 可以存储到状态管理中，在适当时候提醒用户
      return {
        hasUpdate: true,
        version: update.version,
        body: update.body,
        date: update.date
      };
    }
    return { hasUpdate: false };
  } catch (error) {
    console.error('静默检查更新失败:', error);
    // 如果是签名相关错误，在开发环境下忽略
    if (error instanceof Error && error.message.includes('signature')) {
      console.warn('签名验证失败，可能是因为发布版本还未包含签名文件');
    }
    return { hasUpdate: false };
  }
};

export default checkForUpdates;
