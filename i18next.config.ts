import { defineConfig } from "i18next-cli";

export default defineConfig({
	locales: ["zh-CN", "zh-TW", "en-US", "ja-JP"],
	extract: {
		input: "src/**/*.{ts,tsx}",
		output: "src/locales/{{language}}.json",
		keySeparator: ".", // 用的是点号连接嵌套
		nsSeparator: false,
		defaultNS: false,
		defaultValue: "__MISSING__",
		removeUnusedKeys: true,
		// translationRef 是 InstallRequestHandler 中避免闭包过期的 t 引用，需要显式声明才能被提取
		functions: ["t", "*.t", "translationRef.current"],
		preservePatterns: [
			"category.playStatus.*",
			"app.NAVIGATION.gameLibrary",
			"app.NAVIGATION.collection",
			"components.AlertBox.bgmData",
			"components.AlertBox.kunData",
			"components.AlertBox.vndbData",
			"components.AlertBox.ymgalData",
			"components.FilterSortModal.allGames",
			"components.FilterSortModal.localGames",
			"components.FilterSortModal.onlineGames",
			"components.FilterSortModal.customGames",
			"components.FilterSortModal.addTime",
			"components.FilterSortModal.nameSort",
			"components.FilterSortModal.releaseTime",
			"components.FilterSortModal.lastPlayed",
			"components.FilterSortModal.bgmRank",
			"components.FilterSortModal.vndbRank",
			"components.FilterSortModal.userRatingRank",
		],
	},
});
