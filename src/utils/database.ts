import Database  from '@tauri-apps/plugin-sql';
import { exists, BaseDirectory,mkdir,copyFile } from '@tauri-apps/plugin-fs';

let dbInstance: Database | null = null;

export async function initDatabase() {
    // 检查数据库目录并创建（包括父目录）
    if (!await exists('data', { baseDir: BaseDirectory.AppData })) {
      await mkdir('data', { 
        baseDir: BaseDirectory.AppData, 
        recursive: true  // recursive确保所有父目录也被创建
      });
      console.log("已创建数据目录");
    }

    // 检查数据库是否存在
    const existdb = await exists('data/reina_manager.db', { baseDir: BaseDirectory.AppData });
    
    if (existdb) {
        // 数据库已存在，直接加载（自动处理迁移）
        console.log('检测到现有数据库，正在加载...');
        const db = await Database.load('sqlite:data/reina_manager.db');
        console.log('现有数据库加载完成，迁移已由 Rust 端处理');
        return db;
    }
    
    // 数据库不存在，先加载再创建基础表结构
    console.log('数据库不存在，正在创建新数据库...');
    const db = await Database.load('sqlite:data/reina_manager.db');
    
    // 创建基础表结构
    await createTable(db);
    console.log('新数据库已创建完成');
    return db;
}

export async function getDb() {
  if (!dbInstance) {
    dbInstance = await initDatabase();
  }
  return dbInstance;
}

export async function backupDatabase(): Promise<string> {
  // 生成带时间戳的备份文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `reina_manager_${timestamp}.db`;
  const backupPath = `data/backups/${backupName}`;
  
  try {
    // 确保备份目录存在
    await mkdir('data/backups', { baseDir: BaseDirectory.AppData, recursive: true });
    
    // 关闭当前连接
    if (dbInstance) {
      await dbInstance.close();
      dbInstance = null;
    }
    
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

const createTable=async(db:Database)=>{
  // 创建存储游戏数据的表，注意将 tags 以 JSON 字符串形式存储
  await db.execute(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bgm_id TEXT,
      vndb_id TEXT,
      id_type TEXT NOT NULL,
      date TEXT,
      image TEXT,
      summary TEXT,
      name TEXT,
      name_cn TEXT,
      tags TEXT,
      rank INTEGER,
      score REAL,
      time TEXT,
      localpath TEXT,
      savepath TEXT,
      autosave INTEGER DEFAULT 0,
      developer TEXT,
      all_titles TEXT,
      aveage_hours REAL,
      clear INTEGER DEFAULT 0,
      custom_name TEXT,
      custom_image_base64 TEXT
    );
  `);

  // 创建 user 表，仅存储一条记录，用于保存 BGM_TOKEN
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY,
      BGM_TOKEN TEXT,
      save_root_path TEXT
    );
  `);

  // 游戏会话表 - 记录每次游戏会话
  await db.execute(`
    CREATE TABLE IF NOT EXISTS game_sessions (
      session_id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      date TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY(game_id) REFERENCES games(id)
    );
  `);
  
  // 游戏统计表 - 存储聚合数据
  await db.execute(`
    CREATE TABLE IF NOT EXISTS game_statistics (
      game_id INTEGER PRIMARY KEY,
      total_time INTEGER DEFAULT 0,
      session_count INTEGER DEFAULT 0,
      last_played INTEGER,
      daily_stats TEXT DEFAULT '{}',
      FOREIGN KEY(game_id) REFERENCES games(id)
    );
  `);

  // 存档备份表 - 记录游戏存档的备份信息
  await db.execute(`
    CREATE TABLE IF NOT EXISTS savedata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      file TEXT NOT NULL,
      backup_time INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY(game_id) REFERENCES games(id)
    );
  `);

  // 创建索引
  await db.execute('CREATE INDEX IF NOT EXISTS idx_games_autosave ON games(autosave);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_games_custom_name ON games(custom_name);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_savedata_game_id ON savedata(game_id);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_savedata_backup_time ON savedata(backup_time);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id ON game_sessions(game_id);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_game_sessions_date ON game_sessions(date);');

}