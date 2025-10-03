// import Database  from '@tauri-apps/plugin-sql';
import { BaseDirectory,mkdir,copyFile } from '@tauri-apps/plugin-fs';

// let dbInstance: Database | null = null;

// export async function initDatabase() {
//     // 检查数据库目录并创建（包括父目录）
//     if (!await exists('data', { baseDir: BaseDirectory.AppData })) {
//       await mkdir('data', { 
//         baseDir: BaseDirectory.AppData, 
//         recursive: true  // recursive确保所有父目录也被创建
//       });
//       console.log("已创建数据目录");
//     }

//     const db = await Database.load('sqlite:data/reina_manager.db');

//     return db;
// }

// export async function getDb() {
//   if (!dbInstance) {
//     dbInstance = await initDatabase();
//   }
//   return dbInstance;
// }

export async function backupDatabase(): Promise<string> {
  // 生成带时间戳的备份文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `reina_manager_${timestamp}.db`;
  const backupPath = `data/backups/${backupName}`;
  
  try {
    // 确保备份目录存在
    await mkdir('data/backups', { baseDir: BaseDirectory.AppData, recursive: true });
    
    // // 关闭当前连接
    // if (dbInstance) {
    //   await dbInstance.close();
    //   dbInstance = null;
    // }
    
    // 复制数据库文件
    await copyFile(
      'data/reina_manager.db', 
      backupPath, 
      { fromPathBaseDir: BaseDirectory.AppData ,
      toPathBaseDir: BaseDirectory.AppData}
    );
    
    console.log(`数据库已备份到: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('备份数据库失败:', error);
    throw error;
  }
}