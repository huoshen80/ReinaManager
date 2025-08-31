/**
 * @file 图片处理工具函数
 * @description 处理图片上传、BASE64转换、压缩等功能
 * @module src/utils/imageUtils
 * @author Pysio<qq593277393@outlook.com>
 * @copyright AGPL-3.0
 */

import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { isTauri } from '@tauri-apps/api/core';

/**
 * 支持的图片格式
 */
export const SUPPORTED_IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

/**
 * 图片文件大小限制 (5MB)
 */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/**
 * 压缩后的最大图片尺寸
 */
export const MAX_IMAGE_DIMENSIONS = {
  width: 800,
  height: 600
};

/**
 * 打开文件选择对话框选择图片
 * @returns Promise<string | null> 返回选择的文件路径，如果取消则返回null
 */
export async function selectImageFile(): Promise<string | null> {
  if (!isTauri()) {
    throw new Error('图片选择功能仅在桌面端支持');
  }

  try {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{
        name: '图片文件',
        extensions: SUPPORTED_IMAGE_TYPES
      }]
    });

    return typeof selected === 'string' ? selected : null;
  } catch (error) {
    console.error('选择图片文件失败:', error);
    return null;
  }
}

/**
 * 读取图片文件并转换为BASE64
 * @param filePath 图片文件路径
 * @returns Promise<string> 返回BASE64编码的图片数据
 */
export async function fileToBase64(filePath: string): Promise<string> {
  if (!isTauri()) {
    throw new Error('文件读取功能仅在桌面端支持');
  }

  try {
    const fileData = await readFile(filePath);
    const base64 = btoa(String.fromCharCode(...fileData));
    
    // 根据文件扩展名确定MIME类型
    const extension = filePath.split('.').pop()?.toLowerCase() || 'png';
    const mimeType = getMimeType(extension);
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('读取图片文件失败:', error);
    throw error;
  }
}

/**
 * 根据文件扩展名获取MIME类型
 * @param extension 文件扩展名
 * @returns MIME类型字符串
 */
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp'
  };
  
  return mimeTypes[extension] || 'image/png';
}

/**
 * 压缩BASE64图片
 * @param base64String BASE64编码的图片
 * @param quality 压缩质量 (0.1-1.0)
 * @param maxWidth 最大宽度
 * @param maxHeight 最大高度
 * @returns Promise<string> 压缩后的BASE64图片
 */
export async function compressBase64Image(
  base64String: string,
  quality: number = 0.8,
  maxWidth: number = MAX_IMAGE_DIMENSIONS.width,
  maxHeight: number = MAX_IMAGE_DIMENSIONS.height
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      try {
        // 计算压缩后的尺寸
        let { width, height } = calculateCompressedDimensions(
          img.width,
          img.height,
          maxWidth,
          maxHeight
        );
        
        canvas.width = width;
        canvas.height = height;
        
        // 绘制压缩后的图片
        ctx?.drawImage(img, 0, 0, width, height);
        
        // 转换为BASE64
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('图片加载失败'));
    };
    
    img.src = base64String;
  });
}

/**
 * 计算压缩后的图片尺寸
 * @param originalWidth 原始宽度
 * @param originalHeight 原始高度
 * @param maxWidth 最大宽度
 * @param maxHeight 最大高度
 * @returns 压缩后的尺寸
 */
function calculateCompressedDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;
  
  // 如果原始尺寸超过最大尺寸，按比例缩放
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }
  
  return { width, height };
}

/**
 * 验证BASE64图片数据是否有效
 * @param base64String BASE64编码的图片
 * @returns boolean 是否有效
 */
export function validateBase64Image(base64String: string): boolean {
  if (!base64String || !base64String.startsWith('data:image/')) {
    return false;
  }
  
  try {
    // 尝试创建Image对象验证
    const img = new Image();
    img.src = base64String;
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取BASE64图片的大小（字节）
 * @param base64String BASE64编码的图片
 * @returns number 图片大小（字节）
 */
export function getBase64ImageSize(base64String: string): number {
  if (!base64String) return 0;
  
  // 移除data:image/...;base64,前缀
  const base64Data = base64String.split(',')[1] || base64String;
  
  // BASE64编码后的大小约为原始大小的4/3
  return Math.floor((base64Data.length * 3) / 4);
}

/**
 * 完整的图片选择和处理流程
 * @param options 处理选项
 * @returns Promise<string | null> 处理后的BASE64图片数据
 */
export interface ImageProcessOptions {
  compress?: boolean;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export async function selectAndProcessImage(
  options: ImageProcessOptions = {}
): Promise<string | null> {
  const {
    compress = true,
    quality = 0.8,
    maxWidth = MAX_IMAGE_DIMENSIONS.width,
    maxHeight = MAX_IMAGE_DIMENSIONS.height
  } = options;
  
  try {
    // 1. 选择图片文件
    const filePath = await selectImageFile();
    if (!filePath) {
      return null;
    }
    
    // 2. 转换为BASE64
    let base64Image = await fileToBase64(filePath);
    
    // 3. 压缩图片（如果需要）
    if (compress) {
      base64Image = await compressBase64Image(base64Image, quality, maxWidth, maxHeight);
    }
    
    // 4. 验证结果
    if (!validateBase64Image(base64Image)) {
      throw new Error('处理后的图片数据无效');
    }
    
    // 5. 检查大小
    const imageSize = getBase64ImageSize(base64Image);
    if (imageSize > MAX_IMAGE_SIZE) {
      throw new Error(`图片过大，最大支持${Math.floor(MAX_IMAGE_SIZE / 1024 / 1024)}MB`);
    }
    
    return base64Image;
  } catch (error) {
    console.error('选择和处理图片失败:', error);
    throw error;
  }
}

/**
 * Web环境下的文件选择和处理
 * @param options 处理选项
 * @returns Promise<string | null> 处理后的BASE64图片数据
 */
export async function selectAndProcessImageWeb(
  options: ImageProcessOptions = {}
): Promise<string | null> {
  const {
    compress = true,
    quality = 0.8,
    maxWidth = MAX_IMAGE_DIMENSIONS.width,
    maxHeight = MAX_IMAGE_DIMENSIONS.height
  } = options;
  
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SUPPORTED_IMAGE_TYPES.map(ext => `.${ext}`).join(',');
    
    input.onchange = async (event) => {
      try {
        const file = (event.target as HTMLInputElement)?.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        
        // 检查文件大小
        if (file.size > MAX_IMAGE_SIZE) {
          throw new Error(`文件过大，最大支持${Math.floor(MAX_IMAGE_SIZE / 1024 / 1024)}MB`);
        }
        
        // 读取文件为BASE64
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            let base64String = e.target?.result as string;
            
            // 压缩图片（如果需要）
            if (compress) {
              base64String = await compressBase64Image(base64String, quality, maxWidth, maxHeight);
            }
            
            resolve(base64String);
          } catch (error) {
            reject(error);
          }
        };
        
        reader.onerror = () => {
          reject(new Error('读取文件失败'));
        };
        
        reader.readAsDataURL(file);
      } catch (error) {
        reject(error);
      }
    };
    
    input.click();
  });
}
