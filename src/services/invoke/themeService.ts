import type { ThemeMuiConfig } from "@/utils/themeMui";
import { BaseService } from "./base";

export interface ThemeAssetInfo {
	relativePath: string;
	mimeType: string;
	width: number;
	height: number;
	sizeBytes: number;
	sha256: string;
	updatedAt: number;
}

export interface ThemePackageInfo {
	id: string;
	name: string;
	version: string;
	author?: string | null;
	description?: string | null;
	manifestHash: string;
	installedAt: number;
	updatedAt: number;
	assets: ThemeAssetInfo[];
	hasMuiConfig: boolean;
	mui?: ThemeMuiConfig | null;
}

class ThemeService extends BaseService {
	async listPackages(): Promise<ThemePackageInfo[]> {
		return this.invoke<ThemePackageInfo[]>("list_theme_packages");
	}

	async getActiveTheme(): Promise<unknown> {
		return this.invoke("get_active_theme");
	}

	async setActivePackage(packageId: string | null): Promise<void> {
		return this.invoke("set_active_theme_package", { packageId });
	}

	async uploadBackground(sourcePath: string): Promise<ThemeAssetInfo> {
		return this.invoke<ThemeAssetInfo>("upload_theme_background", {
			sourcePath,
		});
	}

	async removeBackground(): Promise<void> {
		return this.invoke("remove_theme_background");
	}

	async deletePackage(packageId: string): Promise<void> {
		return this.invoke("delete_theme_package", { packageId });
	}

	async importPackage(
		sourcePath: string,
		overwrite: boolean,
	): Promise<ThemePackageInfo> {
		return this.invoke<ThemePackageInfo>("import_theme_package", {
			sourcePath,
			overwrite,
		});
	}

	async exportPackage(
		packageId: string,
		destinationPath: string,
	): Promise<void> {
		return this.invoke("export_theme_package", { packageId, destinationPath });
	}

	async cleanupAssets(): Promise<{
		removedFiles: number;
		removedDirectories: number;
	}> {
		return this.invoke("cleanup_theme_assets");
	}

	async getAssetsStatus(): Promise<{
		missing: string[];
		orphans: string[];
	}> {
		return this.invoke("get_theme_assets_status");
	}

	async updatePackageInfo(
		packageId: string,
		updates: {
			name?: string;
			author?: string | null;
			description?: string | null;
			version?: string;
		},
	): Promise<void> {
		return this.invoke("update_theme_package_info", {
			packageId,
			...updates,
		});
	}

	/**
	 * 将当前配置（palette + 外观 + 元数据）保存为自定义主题包并激活。
	 */
	async saveCustomTheme(updates: {
		name?: string;
		author?: string | null;
		description?: string | null;
		version?: string;
	}): Promise<ThemePackageInfo> {
		return this.invoke<ThemePackageInfo>("save_custom_theme", updates);
	}

	async resolveAssetUrl(relativePath: string): Promise<string> {
		return this.invoke("resolve_theme_asset_url", { relativePath });
	}
}

export const themeService = new ThemeService();
