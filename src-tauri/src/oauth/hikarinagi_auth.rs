//! Hikarinagi OIDC OAuth 授权模块。
//!
//! Hikarinagi 使用授权码 + PKCE；客户端不保存 client secret，refresh token 仅写入本地用户设置。

use std::time::Duration;

use chrono::Utc;
use sea_orm::{ActiveModelTrait, DatabaseConnection, Set};
use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::database::repository::settings_repository::SettingsRepository;
use crate::entity::user::HikarinagiAuth;
use crate::oauth::shared::{
    cancel_oauth_callback, generate_oauth_state, generate_pkce_pair, start_oauth_callback,
};

const HIKARINAGI_CLIENT_ID: &str = "hkn_hVbw2qChqzo2avRl";
const HIKARINAGI_REDIRECT_URI: &str = "http://127.0.0.1:23380/callback/hikarinagi";
const HIKARINAGI_CALLBACK_PORT: u16 = 23380;
const HIKARINAGI_CALLBACK_PATH: &str = "/callback/hikarinagi";
const HIKARINAGI_CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);
const HIKARINAGI_AUTHORIZATION_ENDPOINT: &str = "https://id.hikarinagi.org/oidc/auth";
const HIKARINAGI_TOKEN_ENDPOINT: &str = "https://id.hikarinagi.org/oidc/token";
const HIKARINAGI_SCOPES: &str =
    "openid user:read catalog:full status:read status:write offline_access";

#[derive(Debug, Deserialize)]
struct HikarinagiTokenResponse {
    access_token: String,
    expires_in: i64,
    refresh_token: Option<String>,
    scope: Option<String>,
}

#[tauri::command]
pub async fn hikarinagi_oauth_start_login(app: AppHandle) -> Result<String, String> {
    let state = generate_oauth_state()?;
    let nonce = generate_oauth_state()?;
    let (code_verifier, code_challenge) = generate_pkce_pair()?;

    start_oauth_callback(
        app,
        "hikarinagi",
        HIKARINAGI_CALLBACK_PORT,
        HIKARINAGI_CALLBACK_PATH,
        HIKARINAGI_CALLBACK_TIMEOUT,
        state.clone(),
        Some(code_verifier),
    )?;

    let mut url = url::Url::parse(HIKARINAGI_AUTHORIZATION_ENDPOINT)
        .map_err(|error| format!("构造 Hikarinagi 授权地址失败: {error}"))?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", HIKARINAGI_CLIENT_ID)
        .append_pair("redirect_uri", HIKARINAGI_REDIRECT_URI)
        .append_pair("scope", HIKARINAGI_SCOPES)
        .append_pair("prompt", "consent")
        .append_pair("state", &state)
        .append_pair("nonce", &nonce)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256");

    Ok(url.to_string())
}

#[tauri::command]
pub async fn hikarinagi_oauth_exchange_code(
    db: State<'_, DatabaseConnection>,
    code: String,
    code_verifier: String,
) -> Result<HikarinagiAuth, String> {
    let token_response = request_token(&[
        ("grant_type", "authorization_code"),
        ("client_id", HIKARINAGI_CLIENT_ID),
        ("code", code.trim()),
        ("redirect_uri", HIKARINAGI_REDIRECT_URI),
        ("code_verifier", code_verifier.trim()),
    ])
    .await?;

    let auth = HikarinagiAuth {
        access_token: token_response.access_token,
        refresh_token: token_response.refresh_token,
        expires_at: Some(Utc::now().timestamp() + token_response.expires_in),
        user_id: None,
        name: None,
        // OAuth 允许在授权范围与请求一致时省略 scope，此时保存本次明确请求的范围。
        scope: token_response
            .scope
            .or_else(|| Some(HIKARINAGI_SCOPES.to_string())),
    };

    store_hikarinagi_auth(&db, &auth).await?;
    log::info!(
        "Hikarinagi OAuth 授权信息已保存 expires_at={:?}",
        auth.expires_at
    );
    Ok(auth)
}

#[tauri::command]
pub async fn hikarinagi_oauth_cancel_login() -> Result<(), String> {
    cancel_oauth_callback(HIKARINAGI_CALLBACK_PORT, HIKARINAGI_CALLBACK_PATH)
}

#[tauri::command]
pub async fn hikarinagi_oauth_refresh_token(
    db: State<'_, DatabaseConnection>,
    refresh_token: String,
) -> Result<HikarinagiAuth, String> {
    let token_response = request_token(&[
        ("grant_type", "refresh_token"),
        ("client_id", HIKARINAGI_CLIENT_ID),
        ("refresh_token", refresh_token.trim()),
    ])
    .await?;

    let settings = SettingsRepository::get_all_settings(&db)
        .await
        .map_err(|error| format!("获取现有设置失败: {error}"))?;
    let existing = settings.hikarinagi_auth.as_ref();
    let auth = HikarinagiAuth {
        access_token: token_response.access_token,
        refresh_token: token_response
            .refresh_token
            .or_else(|| existing.and_then(|auth| auth.refresh_token.clone())),
        expires_at: Some(Utc::now().timestamp() + token_response.expires_in),
        user_id: existing.and_then(|auth| auth.user_id),
        name: existing.and_then(|auth| auth.name.clone()),
        scope: token_response
            .scope
            .or_else(|| existing.and_then(|auth| auth.scope.clone())),
    };

    store_hikarinagi_auth(&db, &auth).await?;
    log::info!(
        "Hikarinagi OAuth 授权信息已刷新 expires_at={:?}",
        auth.expires_at
    );
    Ok(auth)
}

async fn request_token(params: &[(&str, &str)]) -> Result<HikarinagiTokenResponse, String> {
    let response = crate::utils::http::get_client()
        .post(HIKARINAGI_TOKEN_ENDPOINT)
        .form(params)
        .send()
        .await
        .map_err(|error| format!("请求 Hikarinagi OAuth 接口失败: {error}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取 Hikarinagi OAuth 响应失败: {error}"))?;
    if !status.is_success() {
        return Err(format!("Hikarinagi OAuth 请求失败 ({status}): {text}"));
    }

    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("解析 Hikarinagi OAuth 响应失败: {error} - {text}"))?;
    let token_value = value.get("data").cloned().unwrap_or(value);
    let token_response: HikarinagiTokenResponse = serde_json::from_value(token_value)
        .map_err(|error| format!("解析 Hikarinagi OAuth token 失败: {error} - {text}"))?;
    if token_response.access_token.trim().is_empty() {
        return Err("Hikarinagi OAuth 响应缺少 access_token".to_string());
    }

    Ok(token_response)
}

async fn store_hikarinagi_auth(
    db: &DatabaseConnection,
    auth: &HikarinagiAuth,
) -> Result<(), String> {
    let settings = SettingsRepository::get_all_settings(db)
        .await
        .map_err(|error| format!("获取用户记录失败: {error}"))?;

    let mut active: crate::entity::user::ActiveModel = settings.into();
    active.hikarinagi_auth = Set(Some(auth.clone()));
    active
        .update(db)
        .await
        .map_err(|error| format!("保存 Hikarinagi 授权信息失败: {error}"))?;

    Ok(())
}
