<div align="center">
  <div style="width:200px">
    <a href="https://vndb.org/c64303">
      <img src="src-tauri/icons/reina.png" alt="Reina">
    </a>
  </div>

<h1>ReinaManager</h1>

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Stage](https://img.shields.io/badge/stage-beta-blue) ![Build Status](https://github.com/huoshen80/ReinaManager/actions/workflows/build.yml/badge.svg) ![Release](https://img.shields.io/github/v/release/huoshen80/ReinaManager) ![Downloads](https://img.shields.io/github/downloads/huoshen80/ReinaManager/total)

[![wakatime](https://wakatime.com/badge/user/36a51c62-bf3b-4b81-9993-0e5b0e7ed309/project/efb3bd00-20c2-40de-98b6-e2f4a24bc120.svg)](https://wakatime.com/badge/user/36a51c62-bf3b-4b81-9993-0e5b0e7ed309/project/efb3bd00-20c2-40de-98b6-e2f4a24bc120)

Development time tracked since v0.9.0

<p align="center">English|<a href="./README.zh_CN.md">中文</a>|<a href="./README.zh_TW.md">繁體中文</a>|<a href="./README.ja_JP.md">日本語</a></p>

<h5>A lightweight galgame/visual-novel manager,Under development...</h5>

The `Reina` in the name is the character <a href="https://vndb.org/c64303"><b>妃 玲奈(Kisaki Reina)</b></a> from game <a href="https://vndb.org/v21852"><b>金色ラブリッチェ(Kin'iro Loveriche)</b></a>

</div>

## Stacks

- Tauri 2.0

- React

- Material UI

- UnoCSS

- Zustand

- Sqlite

- Rust

- SeaORM

## Features

- 🌐 **Multi-source Data Integration** - Seamlessly fetch and merge game metadata from VNDB, Bangumi and YmGal APIs
- 🔍 **Powerful Search** - Smart search game from titles, aliases, custom names, and other metadata
- 📚 **Collection Management** - Organize games with hierarchical groups and categories for better library management, support drag and drop sorting
- 🎮 **Play Time Tracking** - Automatic gameplay session recording with detailed play time statistics and history
- 🎨 **Customization** - Set custom metadata for games such as covers, names, tags, etc., to create a personalized game library
- 🔄 **Batch Operations** - Bulk update game metadata from APIs 
- 🌍 **Multi-language Support** - Complete i18n support with multiple language interfaces, including Chinese (Simplified, Traditional), English, Japanese, etc.
- 🔒 **NSFW Filter** - Hide or cover NSFW content with a simple toggle
- 💾 **Auto Savedata Backup** - Configurable automatic backup to protect your game savedata
- 🚀 **System Integration** - Auto-start on boot and minimize to system tray
- 🎮 **Tool Integration** - Launch games with LE locale switching and Magpie upscaling integration

## Todo

- [x] More custom data fields for games
- [ ] Beautify individual pages
- [ ] Sync game status with Bangumi and VNDB
- [ ] Bulk import games from folders
- [x] Better game adding module
- [x] Game savedata restore, and maximum backup count setting
- [x] Ymgal data source support

## Migration

Need to migrate your data from other galgame/visual-novel managers? Check out [reina_migrator](https://github.com/huoshen80/reina_migrator) - a tool for migrating others manager data into ReinaManager.

Currently supports:
- **WhiteCloud** data migration

The migrator helps you seamlessly transfer your game library, play time records, and other data from supported managers to ReinaManager.

## Demo
##### Frontend Demo
- Try the web version: [https://reina.huoshen80.top](https://reina.huoshen80.top)
- The web version is not fully functional yet, but you can view the UI and some features.

##### Desktop App Demo

![Home](screenshots/home.png)
![Library](screenshots/library.png)
![Detail](screenshots/detail.png)
![Stats](screenshots/stats.png)
![Collection](screenshots/collection.png)
![Setting](screenshots/setting.png)

For more, you can download the latest Release Version: [Download](https://github.com/huoshen80/ReinaManager/releases)

## Contribution
##### Start
Contributions are welcome! If you have suggestions for improvements, bug reports, or want to submit a pull request, please follow these steps:

1. Fork this repository and create your branch from `main`.
2. If you have fixed a bug or added a feature, please try to conduct the corresponding tests.
3. Ensure your code follows the existing style and passes all checks.
4. Submit a pull request with a clear description of your changes.

##### How to build and run the project locally
1. Make sure you have [Node.js](https://nodejs.org/) and [Rust](https://www.rust-lang.org/) installed on your machine.
2. Clone the repository:
   ```bash
   git clone https://github.com/huoshen80/ReinaManager.git
   cd ReinaManager
   ```
3. Install the dependencies:
   ```bash
   pnpm install
   ```
4. Run the development server:
   ```bash
   pnpm tauri dev
   ```
5. Build the application for production:
   ```bash
   pnpm tauri build
   ```

Thank you for all the contributions you have made to ReinaManager!

## Donate
If you find this project helpful and would like to support its development, you can consider donating. Your support is greatly appreciated!
- [donate link](https://cdn.huoshen80.top/233.html)

### Data Sources

- **[Bangumi](https://bangumi.tv/)** - Bangumi 番组计划

- **[VNDB](https://vndb.org/)** - 视觉小说数据库

- **[Ymgal](https://www.ymgal.games/)** - 月幕Galgame

Special thanks to these platforms for providing public APIs and data!

## License

This project is licensed under the [AGPL-3.0 license](https://github.com/huoshen80/ReinaManager#AGPL-3.0-1-ov-file)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=huoshen80/ReinaManager&type=Date)](https://star-history.com/#huoshen80/ReinaManager&Date)



