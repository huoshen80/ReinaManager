<div align="center">
  <div style="width:200px">
    <a href="https://vndb.org/c64303">
      <img src="src-tauri/icons/reina.png" alt="Reina">
    </a>
  </div>

<h1>ReinaManager</h1>

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Stage](https://img.shields.io/badge/stage-beta-blue) ![Build Status](https://github.com/huoshen80/ReinaManager/actions/workflows/build.yml/badge.svg)

<p align="center"><a href="./README.md">English</a>|中文|<a href="./README.zh_TW.md">繁體中文</a>|<a href="./README.ja_JP.md">日本語</a></p>

<h5>一个轻量级的视觉小说管理工具，正在开发中...</h5>

名称中的 `Reina` 来源于游戏 <a href="https://vndb.org/v21852"><b>金色ラブリッチェ(Kin'iro Loveriche)</b></a> 中的角色 <a href="https://vndb.org/c64303"><b>妃 玲奈(Kisaki Reina)</b></a>

</div>

## 技术栈

- Tauri 2.0
- React
- Material UI
- UnoCSS
- Zustand
- Sqlite
- Rust

## 待办事项

- [x] 添加可执行文件以启动游戏
- [x] 打开本地游戏文件夹
- [x] 主页功能
- [x] 添加VNDB API用于搜索游戏
- [x] 国际化语言支持
- [ ] 游戏的自定义数据
- [x] 统计游戏时间
- [ ] 美化各个页面
- [x] 设计详情页页面
- [x] 重构数据库查询
- [x] 添加混合API搜索游戏
- [x] 编辑页面功能

## 演示版本

##### 前端演示
- 网页版本：[https://reina.huoshen80.top](https://reina.huoshen80.top)

##### 桌面应用演示
- 从GitHub Actions下载最新构建：
  1. 前往 [Actions页面](https://github.com/huoshen80/ReinaManager/actions/workflows/build.yml)
  2. 点击最近成功的workflow run
  3. 滚动到"Artifacts"部分
  4. 下载你需要的

## 许可证

本项目采用 [AGPL-3.0 许可证](https://github.com/huoshen80/ReinaManager#AGPL-3.0-1-ov-file)