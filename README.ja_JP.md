<div align="center">
  <div style="width:200px">
    <a href="https://vndb.org/c64303">
      <img src="src-tauri/icons/reina.png" alt="Reina">
    </a>
  </div>

<h1>ReinaManager</h1>

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Stage](https://img.shields.io/badge/stage-beta-blue) ![Build Status](https://github.com/huoshen80/ReinaManager/actions/workflows/build.yml/badge.svg) ![Release](https://img.shields.io/github/v/release/huoshen80/ReinaManager) ![Downloads](https://img.shields.io/github/downloads/huoshen80/ReinaManager/total)

[![wakatime](https://wakatime.com/badge/user/36a51c62-bf3b-4b81-9993-0e5b0e7ed309/project/efb3bd00-20c2-40de-98b6-e2f4a24bc120.svg)](https://wakatime.com/badge/user/36a51c62-bf3b-4b81-9993-0e5b0e7ed309/project/efb3bd00-20c2-40de-98b6-e2f4a24bc120)

開発時間の記録は v0.9.0 から開始

<p align="center"><a href="./README.md">English</a>|<a href="./README.zh_CN.md">中文</a>|<a href="./README.zh_TW.md">繁體中文</a>|日本語</p>

<h5>軽量なギャルゲー・ビジュアルノベル管理ツール、開発中...</h5>

名前の `Reina` は、ゲーム <a href="https://vndb.org/v21852"><b>金色ラブリッチェ(Kin'iro Loveriche)</b></a> のキャラクター <a href="https://vndb.org/c64303"><b>妃 玲奈(Kisaki Reina)</b></a> に由来しています

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

## 機能

- 🌐 **マルチソースデータ統合** - VNDB、Bangumi、YmGal API からゲームメタデータをシームレスに取得・統合
- 🔍 **強力な検索** - ゲームタイトル、エイリアス、カスタム名、その他のメタデータを通じてゲームをスマート検索
- 📚 **コレクション管理** - 階層的な分類とカテゴリを使用してゲームを整理し、ゲームライブラリをより効果的に管理、ドラッグ＆ドロップによる並び替えをサポート
- 🎮 **プレイ時間追跡** - ゲームセッションを自動記録し、詳細なプレイ時間統計と履歴を提供
- 🎨 **パーソナライズ** - ゲームにカスタムメタデータ（カバー、名前、タグなど）を設定し、パーソナライズされたゲームライブラリを構築
- 🔄 **バッチ操作** - API からゲームメタデータを一括更新
- 🌍 **多言語サポート** - 完全な国際化サポートで、中国語（簡体字、繁体字）、英語、日本語など、複数の言語インターフェースを提供
- 🔒 **NSFW フィルター** - 簡単なスイッチでNSFWコンテンツを非表示またはカバー
- 💾 **自動セーブバックアップ** - 設定可能な自動バックアップ機能で、ゲームセーブデータを保護
- 🚀 **システム統合** - 起動時の自動起動とシステムトレイへの最小化
- 🎮 **ツール統合** - ゲーム起動時に LE ロケール切り替えと Magpie 拡大を連動

## やることリスト（Todo）

- [x] ゲームのカスタムデータフィールドを追加
- [ ] 各ページの美化
- [ ] Bangumi と VNDB でゲームステータスを同期
- [ ] フォルダからゲームを一括インポート
- [x] より良いゲーム追加モジュール
- [x] ゲームセーブデータの復元、および最大バックアップ数の設定
- [x] Ymgal データソースのサポート

## 移住する

他のギャルゲー・ビジュアルノベル管理ツールからデータを移行する必要がありますか？[reina_migrator](https://github.com/huoshen80/reina_migrator) をご覧ください - 他の管理ツールのデータを ReinaManager に移行するためのツールです。

現在サポート：
- **WhiteCloud** データ移行

この移行ツールは、ゲームライブラリ、プレイ時間記録、その他のデータをサポートされている管理ツールから ReinaManager にシームレスに転送するのに役立ちます。

## デモバージョン

##### フロントエンドデモ
- Web版を試す: [https://reina.huoshen80.top](https://reina.huoshen80.top)
- Web版はまだ完全に機能していませんが、UIといくつかの機能を確認できます。

##### デスクトップアプリデモ

![ホーム](screenshots/home.png)
![ライブラリ](screenshots/library.png)
![詳細](screenshots/detail.png)
![統計](screenshots/stats.png)
![コレクション](screenshots/collection.png)
![設定](screenshots/setting.png)

詳細については、最新のリリース版をダウンロードしてください：[ダウンロード](https://github.com/huoshen80/ReinaManager/releases)

## コントリビュート
##### まず
貢献は大歓迎です！改善提案、バグ報告、プルリクエストの送信は以下の手順に従ってください：

1. このリポジトリをフォークし、`main` ブランチから新しいブランチを作成します。
2. バグ修正や機能追加を行った場合は、適切なテストを追加してください。
3. コードスタイルを既存のプロジェクトに合わせ、すべてのチェックを通過させてください。
4. 変更内容を明確に説明したプルリクエストを作成してください。

##### プロジェクトをローカルでビルド・実行する方法
1. [Node.js](https://nodejs.org/) と [Rust](https://www.rust-lang.org/) をインストールします。
2. リポジトリをクローン：
   ```bash
   git clone https://github.com/huoshen80/ReinaManager.git
   cd ReinaManager
   ```
3. 依存関係をインストール：
   ```bash
   pnpm install
   ```
4. 開発サーバーを起動：
   ```bash
   pnpm tauri dev
   ```
5. 本番向けビルド：
   ```bash
   pnpm tauri build
   ```

ReinaManager へのすべての貢献に感謝します！

### データソース

- **[Bangumi](https://bangumi.tv/)** - Bangumi 番組計画

- **[VNDB](https://vndb.org/)** - ビジュアルノベルデータベース

- **[Ymgal](https://www.ymgal.games/)** - 月幕Galgame

これらのプラットフォームが提供するパブリック API とデータに感謝します！

## Donate
このプロジェクトが役立つと感じ、開発を支援したい場合は、寄付をご検討ください。あなたの支援は大変ありがたいです！
- [donate link](https://cdn.huoshen80.top/233.html)

## ライセンス

本プロジェクトは [AGPL-3.0 ライセンス](https://github.com/huoshen80/ReinaManager#AGPL-3.0-1-ov-file) の下で公開されています。

## Star履歴

[![Star History Chart](https://api.star-history.com/svg?repos=huoshen80/ReinaManager&type=Date)](https://star-history.com/#huoshen80/ReinaManager&Date)
