import { createTheme, darken, lighten } from "@mui/material/styles";

export const createAppTheme = (
    mode: "light" | "dark",
    primaryColor: string,
    themeStyle: "default" | "custom" = "custom",
) => {
    // 1. 基础变量计算
    const secondaryColor =
        mode === "light" ? lighten(primaryColor, 0.2) : darken(primaryColor, 0.4);

    const isCustom = themeStyle === "custom";

    // 2. 自定义模式下的样式变量
    const backgroundColor = mode === "light" ? "#fce4ec" : "#1a1015";
    const glassBackground =
        mode === "light" ? "rgba(255, 255, 255, 0.7)" : "rgba(30, 30, 30, 0.6)";
    const glassBorder =
        mode === "light"
            ? "1px solid rgba(255, 255, 255, 0.5)"
            : "1px solid rgba(255, 255, 255, 0.1)";
    const glassShadow =
        mode === "light"
            ? "0 8px 32px 0 rgba(31, 38, 135, 0.1)"
            : "0 8px 32px 0 rgba(0, 0, 0, 0.3)";
    const cardBackground =
        mode === "light" ? "rgba(255, 255, 255, 0.6)" : "rgba(40, 40, 40, 0.6)";

    const bodyBackground =
        mode === "light"
            ? `linear-gradient(rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.8)), url("/images/reina.png"), linear-gradient(135deg, ${backgroundColor} 0%, #ffffff 100%)`
            : `linear-gradient(rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.85)), url("/images/reina.png"), linear-gradient(135deg, #000000 0%, #2d2d2d 100%)`;

    // 3. 自定义组件样式
    const customComponents = {
        MuiCssBaseline: {
            styleOverrides: {
                "@keyframes checkbox-bounce": {
                    "0%": { transform: "scale(1)" },
                    "50%": { transform: "scale(1.3)" },
                    "100%": { transform: "scale(1)" },
                },
                body: {
                    backgroundImage: bodyBackground,
                    backgroundAttachment: "fixed, fixed, fixed",
                    backgroundPosition: "center, bottom right, center",
                    backgroundRepeat: "no-repeat, no-repeat, no-repeat",
                    backgroundSize: "cover, 300px, cover",
                    minHeight: "100vh",
                    transition: "background 0.3s ease-in-out",
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backdropFilter: "blur(10px)",
                    border: glassBorder,
                    boxShadow: glassShadow,
                    background: glassBackground,
                    transition:
                        "background 0.3s ease-in-out, box-shadow 0.3s ease-in-out, border 0.3s ease-in-out",
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    background: cardBackground,
                    transition:
                        "transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out, background 0.3s ease-in-out",
                    "&:hover": {
                        transform: "translateY(-5px)",
                        boxShadow:
                            mode === "light"
                                ? "0 12px 40px 0 rgba(31, 38, 135, 0.2)"
                                : "0 12px 40px 0 rgba(0, 0, 0, 0.5)",
                    },
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor:
                        mode === "light"
                            ? "rgba(255, 255, 255, 0.8) !important"
                            : "rgba(30, 30, 30, 0.8) !important",
                    backdropFilter: "blur(12px) !important",
                    borderRight: glassBorder,
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor:
                        mode === "light"
                            ? "rgba(255, 255, 255, 0.7) !important"
                            : "rgba(30, 30, 30, 0.7) !important",
                    backdropFilter: "blur(10px)",
                    boxShadow: "none",
                    borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
                    color: mode === "light" ? "#333" : "#fff",
                },
            },
        },
        // M3 Switch 样式
        MuiSwitch: {
            styleOverrides: {
                root: {
                    width: 46,
                    height: 26,
                    marginLeft: 6,
                    marginRight: 6,
                    padding: 0,
                },
                switchBase: {
                    padding: 4,
                    transitionDuration: "300ms",
                    "&.Mui-checked": {
                        transform: "translateX(20px)",
                        color: "#fff",
                        "& + .MuiSwitch-track": {
                            backgroundColor: primaryColor,
                            opacity: 1,
                            border: 0,
                        },
                        "&.Mui-disabled + .MuiSwitch-track": {
                            opacity: 0.5,
                        },
                        "& .MuiSwitch-thumb": {
                            backgroundColor: "#ffffffff",
                        },
                    },
                    "&.Mui-focusVisible .MuiSwitch-thumb": {
                        color: "#33cf4d",
                        border: "6px solid #fff",
                    },
                    "&.Mui-disabled .MuiSwitch-thumb": {
                        opacity: 0.3,
                    },
                    "&.Mui-disabled + .MuiSwitch-track": {
                        opacity: 0.3,
                    },
                },
                thumb: {
                    // ★★★ 修复点 1：添加 as const ★★★
                    boxSizing: "border-box" as const,
                    width: 10,
                    height: 10,
                    margin: 4,
                    boxShadow: "none",
                    backgroundColor: "#49454F",
                    transition: "width 0.2s, height 0.2s",
                },
                track: {
                    borderRadius: 32 / 2,
                    backgroundColor: "#E7E0EC",
                    border: "2px solid #79747E",
                    opacity: 1,
                    transition: "background-color 500ms",
                    // ★★★ 修复点 2：添加 as const ★★★
                    boxSizing: "border-box" as const,
                },
            },
        },
        MuiCheckbox: {
            styleOverrides: {
                root: {
                    padding: 8,
                    borderRadius: "2px",
                    "&.Mui-checked": {
                        color: primaryColor,
                        animation:
                            "checkbox-bounce 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    },
                },
            },
        },
    };

    // 4. 创建并返回主题
    return createTheme({
        cssVariables: {
            colorSchemeSelector: "data-mui-color-scheme",
        },
        palette: {
            mode,
            primary: {
                main: primaryColor,
            },
            secondary: {
                main: secondaryColor,
            },
            ...(isCustom && {
                background: {
                    default: "transparent",
                    paper: glassBackground,
                },
            }),
        },
        typography: {
            fontFamily: [
                "Segoe UI",
                "Roboto",
                "Helvetica Neue",
                "Arial",
                "sans-serif",
            ].join(","),
            h1: { fontWeight: 600 },
            h2: { fontWeight: 600 },
            h3: { fontWeight: 600 },
            h4: { fontWeight: 600 },
            h5: { fontWeight: 600 },
            h6: { fontWeight: 600 },
        },
        shape: {
            borderRadius: isCustom ? 16 : 4,
        },
        components: isCustom ? customComponents : {
            MuiCssBaseline: {
                styleOverrides: {
                    body: {
                        transition: "background 0.3s ease-in-out",
                    },
                },
            },
        },
    });
};