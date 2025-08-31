/**
 * @file 自定义内容编辑器组件
 * @description 用于编辑游戏的自定义名字和封面
 * @module src/components/CustomContentEditor
 * @author Pysio<qq593277393@outlook.com>
 * @copyright AGPL-3.0
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Avatar,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  PhotoCamera,
  Delete,
  Restore,
  Info
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { isTauri } from '@tauri-apps/api/core';

import type { GameData } from '@/types';
import { 
  selectAndProcessImage, 
  selectAndProcessImageWeb,
  validateBase64Image,
  getBase64ImageSize,
  MAX_IMAGE_SIZE 
} from '@/utils/imageUtils';
import { 
  getGameDisplayName, 
  getGameDisplayImage, 
  hasCustomName, 
  hasCustomImage 
} from '@/utils';
import { updateGameCustomName, updateGameCustomImage } from '@/utils/repository';

interface CustomContentEditorProps {
  game: GameData;
  onUpdate?: (updatedGame: GameData) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

/**
 * 自定义内容编辑器组件
 */
const CustomContentEditor: React.FC<CustomContentEditorProps> = ({
  game,
  onUpdate,
  onError,
  disabled = false
}) => {
  const { t } = useTranslation();
  
  // 状态管理
  const [customName, setCustomName] = useState(game.custom_name || '');
  const [customImage, setCustomImage] = useState(game.custom_image_base64 || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isUpdatingImage, setIsUpdatingImage] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // 更新本地状态当props变化时
  useEffect(() => {
    setCustomName(game.custom_name || '');
    setCustomImage(game.custom_image_base64 || '');
  }, [game.custom_name, game.custom_image_base64]);

  // 显示提示信息
  const showAlert = (type: 'success' | 'error' | 'info', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  // 处理自定义名字更新
  const handleUpdateCustomName = async () => {
    if (!game.id) return;
    
    setIsUpdatingName(true);
    try {
      const trimmedName = customName.trim();
      const nameToSave = trimmedName === '' ? null : trimmedName;
      
      if (isTauri()) {
        await updateGameCustomName(game.id, nameToSave);
      }
      
      const updatedGame: GameData = {
        ...game,
        custom_name: nameToSave || undefined
      };
      
      onUpdate?.(updatedGame);
      showAlert('success', t('customContent.nameUpdateSuccess'));
    } catch (error) {
      console.error('更新自定义名字失败:', error);
      const errorMsg = t('customContent.nameUpdateFailed');
      showAlert('error', errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsUpdatingName(false);
    }
  };

  // 处理自定义封面选择
  const handleSelectCustomImage = async () => {
    setIsLoadingImage(true);
    try {
      const base64Image = isTauri() 
        ? await selectAndProcessImage({
            compress: true,
            quality: 0.8,
            maxWidth: 400,
            maxHeight: 600
          })
        : await selectAndProcessImageWeb({
            compress: true,
            quality: 0.8,
            maxWidth: 400,
            maxHeight: 600
          });

      if (base64Image) {
        // 验证图片
        const isValidImage: boolean = validateBase64Image(base64Image);
        if (!isValidImage) {
          throw new Error('无效的图片格式');
        }

        // 检查大小
        const imageSize = getBase64ImageSize(base64Image);
        if (imageSize > MAX_IMAGE_SIZE) {
          throw new Error(`图片过大，最大支持${Math.floor(MAX_IMAGE_SIZE / 1024 / 1024)}MB`);
        }

        setCustomImage(base64Image);
        showAlert('success', t('customContent.imageSelected'));
      }
    } catch (error) {
      console.error('选择自定义封面失败:', error);
      const errorMsg = error instanceof Error ? error.message : '选择图片失败';
      showAlert('error', errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsLoadingImage(false);
    }
  };

  // 处理自定义封面更新
  const handleUpdateCustomImage = async () => {
    if (!game.id) return;
    
    setIsUpdatingImage(true);
    try {
      const imageToSave = customImage.trim() === '' ? null : customImage;
      
      if (isTauri()) {
        await updateGameCustomImage(game.id, imageToSave);
      }
      
      const updatedGame: GameData = {
        ...game,
        custom_image_base64: imageToSave || undefined
      };
      
      onUpdate?.(updatedGame);
      showAlert('success', t('customContent.imageUpdateSuccess'));
    } catch (error) {
      console.error('更新自定义封面失败:', error);
      const errorMsg = t('customContent.imageUpdateFailed');
      showAlert('error', errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsUpdatingImage(false);
    }
  };

  // 清除自定义名字
  const handleClearCustomName = () => {
    setCustomName('');
  };

  // 清除自定义封面
  const handleClearCustomImage = () => {
    setCustomImage('');
  };

  // 恢复原始名字
  const handleRestoreOriginalName = () => {
    setCustomName('');
  };

  // 恢复原始封面
  const handleRestoreOriginalImage = () => {
    setCustomImage('');
  };

  // 获取显示的图片 - 优先使用当前编辑中的自定义图片，然后回退到游戏的显示图片
  const displayImage = customImage || getGameDisplayImage(game);
  const originalDisplayName = getGameDisplayName({ ...game, custom_name: undefined });

  return (
    <Paper elevation={2} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        {t('customContent.title')}
      </Typography>

      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {/* 自定义名字编辑 */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle2">
            {t('customContent.customName')}
          </Typography>
          {(hasCustomName(game) === true) && (
            <Tooltip title={t('customContent.hasCustomContent')}>
              <Info fontSize="small" color="info" />
            </Tooltip>
          )}
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={originalDisplayName}
            variant="outlined"
            size="small"
            fullWidth
            disabled={disabled || isUpdatingName}
            helperText={t('customContent.customNameHelp')}
          />
          
          <Button
            onClick={handleUpdateCustomName}
            disabled={disabled || isUpdatingName || customName === (game.custom_name || '')}
            startIcon={isUpdatingName ? <CircularProgress size={16} /> : undefined}
            variant="contained"
            size="small"
          >
            {t('common.save')}
          </Button>
          
          <Tooltip title={t('customContent.clearCustomName')}>
            <IconButton
              onClick={handleClearCustomName}
              disabled={disabled || customName === ''}
              size="small"
            >
              <Delete />
            </IconButton>
          </Tooltip>
          
          <Tooltip title={t('customContent.restoreOriginalName')}>
            <IconButton
              onClick={handleRestoreOriginalName}
              disabled={disabled || customName === ''}
              size="small"
            >
              <Restore />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 自定义封面编辑 */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="subtitle2">
            {t('customContent.customCover')}
          </Typography>
          {hasCustomImage(game) && (
            <Tooltip title={t('customContent.hasCustomContent')}>
              <Info fontSize="small" color="info" />
            </Tooltip>
          )}
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          {/* 封面预览 */}
          <Avatar
            src={displayImage}
            sx={{ 
              width: 120, 
              height: 160, 
              borderRadius: 1,
              bgcolor: 'grey.200'
            }}
            variant="rounded"
          >
            {!displayImage && <PhotoCamera />}
          </Avatar>
          
          {/* 操作按钮 */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              onClick={handleSelectCustomImage}
              disabled={disabled || isLoadingImage}
              startIcon={isLoadingImage ? <CircularProgress size={16} /> : <PhotoCamera />}
              variant="outlined"
              size="small"
            >
              {t('customContent.selectImage')}
            </Button>
            
            <Button
              onClick={handleUpdateCustomImage}
              disabled={disabled || isUpdatingImage || customImage === (game.custom_image_base64 || '')}
              startIcon={isUpdatingImage ? <CircularProgress size={16} /> : undefined}
              variant="contained"
              size="small"
            >
              {t('common.save')}
            </Button>
            
            <Button
              onClick={handleClearCustomImage}
              disabled={disabled || customImage === ''}
              startIcon={<Delete />}
              variant="outlined"
              size="small"
              color="error"
            >
              {t('common.clear')}
            </Button>
            
            <Button
              onClick={handleRestoreOriginalImage}
              disabled={disabled || customImage === ''}
              startIcon={<Restore />}
              variant="outlined"
              size="small"
            >
              {t('common.restore')}
            </Button>
          </Box>
        </Box>
        
        <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
          {t('customContent.imageSizeLimit')}
        </Typography>
      </Box>
    </Paper>
  );
};

export default CustomContentEditor;
