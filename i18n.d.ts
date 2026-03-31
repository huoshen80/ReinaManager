import "i18next";
// 直接导入你的中文语言包作为类型定义的基准
import type zh_CN from "./src/locales/zh-CN.json";

declare module "i18next" {
	interface CustomTypeOptions {
		// 默认命名空间
		defaultNS: "translation";
		// 定义资源结构
		resources: {
			translation: typeof zh_CN;
		};
	}
}
