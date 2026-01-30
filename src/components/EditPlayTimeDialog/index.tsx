import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGamePlayStore } from "@/store/gamePlayStore";
import { useStore } from "@/store";

interface EditPlayTimeDialogProps {
    open: boolean;
    onClose: () => void;
    gameId: number;
}

export const EditPlayTimeDialog: React.FC<EditPlayTimeDialogProps> = ({
    open,
    onClose,
    gameId,
}) => {
    const { t } = useTranslation();
    const { loadGameStats, updatePlayTime } = useGamePlayStore();
    const { getGameById } = useStore();
    const [hours, setHours] = useState<number | string>(0);
    const [minutes, setMinutes] = useState<number | string>(0);
    const [gameName, setGameName] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && gameId) {
            setLoading(true);
            const fetchData = async () => {
                try {
                    const game = await getGameById(gameId);
                    if (game && game.name) setGameName(game.name);

                    const stats = await loadGameStats(gameId);
                    if (stats) {
                        const totalMin = stats.totalMinutes || 0;
                        setHours(Math.floor(totalMin / 60));
                        setMinutes(totalMin % 60);
                    } else {
                        setHours(0);
                        setMinutes(0);
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }
    }, [open, gameId, loadGameStats, getGameById]);

    const handleSave = async () => {
        const h = Number(hours);
        const m = Number(minutes);
        if (isNaN(h) || isNaN(m)) return;

        const totalMinutes = h * 60 + m;

        try {
            await updatePlayTime(gameId, totalMinutes);
            onClose();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{t("components.EditPlayTimeDialog.title", "编辑游玩时间")}</DialogTitle>
            <DialogContent>
                <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary' }}>
                    {gameName}
                </Typography>
                <div className="flex gap-4 items-center">
                    <TextField
                        label={t("components.EditPlayTimeDialog.hours", "小时")}
                        type="number"
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                        fullWidth
                        inputProps={{ min: 0 }}
                    />
                    <TextField
                        label={t("components.EditPlayTimeDialog.minutes", "分钟")}
                        type="number"
                        value={minutes}
                        onChange={(e) => setMinutes(e.target.value)}
                        fullWidth
                        inputProps={{ min: 0, max: 59 }}
                    />
                </div>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t("common.cancel", "取消")}</Button>
                <Button onClick={handleSave} variant="contained" disabled={loading}>
                    {t("common.confirm", "确认")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
