/**
 * @file SortModal 组件
 * @description 游戏排序弹窗组件，支持按添加时间、发售时间、排名、最近游玩等方式排序，支持升降序切换，集成国际化。
 * @module src/components/SortModal/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - SortModal：游戏排序弹窗组件
 *
 * 依赖：
 * - @mui/material
 * - @mui/icons-material
 * - @/store
 * - react-i18next
 */

import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { useModal } from '@/components/Toolbar';
import Switch from '@mui/material/Switch';
import { useStore } from '@/store';
import { useTranslation } from 'react-i18next';

/**
 * SortModal 组件
 * 游戏排序弹窗，支持多种排序方式和升降序切换。
 *
 * @component
 * @returns {JSX.Element} 排序弹窗
 */
const SortModal: React.FC = () => {
    const { t } = useTranslation();
    const { isopen, handleOpen, handleClose } = useModal();
    // 从 store 获取排序状态
    const { sortOption, sortOrder } = useStore();

    // 本地状态，用于在对话框内部跟踪更改
    const [localSortOption, setLocalSortOption] = useState(sortOption);
    const [localSortOrder, setLocalSortOrder] = useState(sortOrder);

    /**
     * 每次打开对话框时，重置本地状态
     */
    useEffect(() => {
        if (isopen) {
            setLocalSortOption(sortOption);
            setLocalSortOrder(sortOrder);
        }
    }, [isopen, sortOption, sortOrder]);

    /**
     * 提交排序设置，应用到全局 store
     * @param {React.FormEvent<HTMLFormElement>} event 表单提交事件
     */
    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        // 使用新的updateSort方法一次性更新排序并获取数据
        const { updateSort } = useStore.getState();
        await updateSort(localSortOption, localSortOrder);

        // 关闭对话框
        handleClose();
    };

    return (
        <>
            <Button onClick={handleOpen} startIcon={<SwapVertIcon />}>{t('components.SortModal.sort')}</Button>
            <Dialog
                open={isopen}
                onClose={handleClose}
                closeAfterTransition={false}
                TransitionProps={{
                    timeout: 0, // 禁用过渡动画
                }}
                aria-labelledby="sort-dialog-title"
                PaperProps={{
                    component: 'form',
                    onSubmit: handleSubmit,
                }}
            >
                <DialogTitle>{t('components.SortModal.sort')}</DialogTitle>
                <DialogContent className="pt-2 flex flex-col gap-2">
                    <div>{t('components.SortModal.sortMethod')}</div>
                    <SortOption
                        value={localSortOption}
                        onChange={setLocalSortOption}
                    />
                    <UpDownSwitches
                        value={localSortOrder}
                        onChange={(value: string) => setLocalSortOrder(value as "asc" | "desc")}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>{t('components.SortModal.cancel')}</Button>
                    <Button type="submit">{t('components.SortModal.confirm')}</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

/**
 * SortOption 组件
 * 排序方式选择下拉框
 *
 * @param {object} props
 * @param {string} props.value 当前排序方式
 * @param {(value: string) => void} props.onChange 排序方式变更回调
 * @returns {JSX.Element}
 */
const SortOption = ({ value, onChange }: { value: string, onChange: (value: string) => void }) => {
    const { t } = useTranslation();
    const handleChange = (event: SelectChangeEvent) => {
        onChange(event.target.value);
    };

    return (
        <Select value={value} onChange={handleChange}>
            <MenuItem value="addtime">{t('components.SortModal.addTime')}</MenuItem>
            <MenuItem value="datetime">{t('components.SortModal.releaseTime')}</MenuItem>
            <MenuItem value="lastplayed">{t('components.SortModal.lastPlayed')}</MenuItem>
            <MenuItem value="bgmrank">{t('components.SortModal.bgmRank', "bgm排行")}</MenuItem>
            <MenuItem value="vndbrank">{t('components.SortModal.vndbRank', "vndb排行")}</MenuItem>
        </Select>
    );
}

/**
 * UpDownSwitches 组件
 * 升序/降序切换开关
 *
 * @param {object} props
 * @param {string} props.value 当前排序顺序（'asc' 或 'desc'）
 * @param {(value: string) => void} props.onChange 排序顺序变更回调
 * @returns {JSX.Element}
 */
const UpDownSwitches = ({ value, onChange }: { value: string, onChange: (value: string) => void }) => {
    const { t } = useTranslation();
    // 使用 asc/desc 而不是布尔值
    const isDesc = value === 'desc';

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.checked ? 'desc' : 'asc');
    };

    return (
        <div className="flex items-center mt-2.5">
            <span className={`mr-2 ${isDesc ? 'opacity-50' : 'opacity-100'}`}>{t('components.SortModal.ascending')}</span>
            <Switch
                checked={isDesc}
                onChange={handleChange}
                inputProps={{ 'aria-label': 'controlled' }}
            />
            <span className={`ml-2 ${isDesc ? 'opacity-100' : 'opacity-50'}`}>{t('components.SortModal.descending')}</span>
        </div>
    );
}

export default SortModal;