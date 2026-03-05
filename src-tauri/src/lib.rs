use std::fs;
use std::collections::HashMap;
use tauri::Manager;

#[derive(serde::Deserialize)]
struct ProxyApiRequest {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(serde::Serialize)]
struct ProxyApiResponse {
    status: u16,
    body: String,
}

#[tauri::command]
async fn proxy_api_request(request: ProxyApiRequest) -> Result<ProxyApiResponse, String> {
    let client = reqwest::Client::new();

    let mut req_builder = match request.method.as_str() {
        "GET" => client.get(&request.url),
        "POST" => client.post(&request.url),
        "PUT" => client.put(&request.url),
        "DELETE" => client.delete(&request.url),
        "PATCH" => client.patch(&request.url),
        _ => return Err(format!("Unsupported HTTP method: {}", request.method)),
    };

    // Add headers
    for (key, value) in request.headers {
        req_builder = req_builder.header(&key, &value);
    }

    // Add body if present
    if let Some(body) = request.body {
        req_builder = req_builder.body(body);
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(ProxyApiResponse { status, body })
}

#[tauri::command]
async fn proxy_media(url: String) -> Result<Vec<u8>, String> {
    // Make HTTP request using reqwest to proxy media content
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch media: {}", e))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read media bytes: {}", e))?;

    Ok(bytes.to_vec())
}

#[tauri::command]
async fn save_video(app_handle: tauri::AppHandle, video_data: Vec<u8>) -> Result<String, String> {
    // Get app data directory
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Create videos directory
    let videos_dir = app_data_dir.join("videos");
    fs::create_dir_all(&videos_dir)
        .map_err(|e| format!("Failed to create videos directory: {}", e))?;

    // Generate filename with timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_secs();
    let filename = format!("video_{}.mp4", timestamp);
    let file_path = videos_dir.join(&filename);

    // Write the video file
    fs::write(&file_path, video_data)
        .map_err(|e| format!("Failed to write video file: {}", e))?;

    // Return the absolute path
    Ok(file_path
        .to_str()
        .ok_or_else(|| "Failed to convert path to string".to_string())?
        .to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![proxy_api_request, proxy_media, save_video])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
