import { resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	base: "./",
	server: {
		// Tauri 工作于固定端口，如果端口不可用则报错
		strictPort: true,
		host: "0.0.0.0",
		port: 5173,
	},
	clearScreen: false,
	// 添加有关当前构建目标的额外前缀，使这些 CLI 设置的 Tauri 环境变量可以在客户端代码中访问
	envPrefix: ["VITE_", "TAURI_ENV_"],
	build: {
		// 使用 Vite 7 默认目标（baseline-widely-available），更符合 2025 的浏览器能力基线
		// 若需固定更高目标，可设置为：windows 使用 'chrome107'，其他平台 'safari16'
		// 在 debug 构建中不使用 minify
		minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
		// 在 debug 构建中生成 sourcemap
		sourcemap: !!process.env.TAURI_ENV_DEBUG,
	},
	plugins: [react(), UnoCSS()],
	resolve: {
		// 设置文件./src路径为 @
		alias: [
			{
				find: "@",
				replacement: resolve(__dirname, "./src"),
			},
			{
				find: "@pkg",
				replacement: resolve(__dirname, "./package.json"),
			},
		],
	},
});
