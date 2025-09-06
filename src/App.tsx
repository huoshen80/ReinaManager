/**
 * @file App 入口组件
 * @description 应用主入口，配置全局导航菜单，集成国际化与路由，作为所有页面的顶层容器。
 * @module src/App
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 依赖：
 * - @toolpad/core
 * - @mui/icons-material
 * - react-router
 * - react-i18next
 * - @/store
 * - @/utils/i18n
 * - ./App.css
 */

import './App.css'
import '@/utils/i18n';
import {Outlet} from "react-router";
import type {Navigation} from '@toolpad/core/AppProvider';
import {ReactRouterAppProvider} from '@toolpad/core/react-router'
import HomeIcon from '@mui/icons-material/Home';
import GamesIcon from '@mui/icons-material/Games';
import SettingsIcon from '@mui/icons-material/Settings';
import {useTranslation} from 'react-i18next';
import {AliveScope} from 'react-activation';
import {SnackbarProvider} from "notistack";
import {SnackbarUtilsConfigurator} from "@/components/Snackbar";

/**
 * App 组件
 * 应用主入口，配置全局导航菜单，集成国际化与路由。
 *
 * @component
 * @returns {JSX.Element} 应用主容器
 */
const App: React.FC = () => {
    const {t} = useTranslation();
    // 全局导航配置
    const NAVIGATION: Navigation = [
        {
            kind: 'header',
            title: t('app.NAVIGATION.menu'),
        },
        {
            title: t('app.NAVIGATION.home'),
            icon: <HomeIcon/>,
        },
        {
            segment: 'libraries',
            title: t('app.NAVIGATION.gameLibrary'),
            icon: <GamesIcon/>,
            pattern: 'libraries/:id'
        },
        {
            segment: 'settings',
            title: t('app.NAVIGATION.settings'),
            icon: <SettingsIcon/>,
        }
    ];

    return (
        <SnackbarProvider
            maxSnack={3}
            autoHideDuration={3000}
            anchorOrigin={{vertical: 'top', horizontal: 'center'}}
        >
            <SnackbarUtilsConfigurator/>
            <ReactRouterAppProvider navigation={NAVIGATION}>
                <AliveScope>
                    <Outlet/>
                </AliveScope>
            </ReactRouterAppProvider>
        </SnackbarProvider>
    )
}

export default App
