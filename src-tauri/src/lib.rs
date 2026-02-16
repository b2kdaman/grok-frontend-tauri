use std::fs;
use tauri::Manager;

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
        .invoke_handler(tauri::generate_handler![proxy_media, save_video])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
