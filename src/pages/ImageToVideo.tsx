import { useState, useCallback, useEffect } from "react";
import { imageToVideo } from "../lib/grokApi";
import ImageUpload from "../components/ImageUpload";
import { invoke } from "@tauri-apps/api/core";

const DURATION_MIN = 1;
const DURATION_MAX = 15;
const DURATION_DEFAULT = 6;
const PROMPTS_STORAGE_KEY = "image-to-video-prompts";

type Resolution = "480p" | "720p";

function loadPrompts(): string[] {
  try {
    const stored = localStorage.getItem(PROMPTS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [""];
    }
  } catch {
    // ignore parse errors
  }
  return [""];
}

function savePrompts(prompts: string[]): void {
  try {
    localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(prompts));
  } catch {
    // ignore save errors
  }
}

export default function ImageToVideo() {
  const [preview, setPreview] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<string[]>(() => loadPrompts());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [duration, setDuration] = useState(DURATION_DEFAULT);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const prompt = prompts[currentIndex] || "";

  // Auto-save whenever prompts change
  useEffect(() => {
    savePrompts(prompts);
  }, [prompts]);

  const updatePrompt = useCallback((value: string) => {
    setPrompts((prev) => {
      const updated = [...prev];
      updated[currentIndex] = value;
      return updated;
    });
  }, [currentIndex]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prompts.length - 1, prev + 1));
  }, [prompts.length]);

  const addPrompt = useCallback(() => {
    setPrompts((prev) => [...prev, ""]);
    setCurrentIndex(prompts.length);
  }, [prompts.length]);

  const duplicatePrompt = useCallback(() => {
    setPrompts((prev) => [...prev, prompt]);
    setCurrentIndex(prompts.length);
  }, [prompts.length, prompt]);

  const removePrompt = useCallback(() => {
    if (prompts.length <= 1) return;
    setPrompts((prev) => prev.filter((_, i) => i !== currentIndex));
    setCurrentIndex((prev) => Math.min(prev, prompts.length - 2));
  }, [currentIndex, prompts.length]);

  const onFileSelect = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    setError(null);
    setResultUrl(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }, []);

  const submit = useCallback(async () => {
    if (!preview || !prompt.trim()) {
      setError("Please upload an image and enter a prompt.");
      return;
    }
    setLoading(true);
    setError(null);
    setResultUrl(null);
    setSavedPath(null);
    setProgress(0);

    // Start progress timer (25 seconds to 100%)
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percentage = Math.min(100, Math.floor((elapsed / 25000) * 100));
      setProgress(percentage);
      if (percentage >= 100) {
        clearInterval(progressInterval);
      }
    }, 100);

    try {
      const url = await imageToVideo(prompt.trim(), preview, {
        duration,
        resolution,
      });
      setResultUrl(url);

      // Save video to local file if running in Tauri
      if ('__TAURI_INTERNALS__' in window) {
        try {
          // Fetch the video data
          const response = await fetch(url);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const videoData = Array.from(uint8Array);

          // Save using Tauri command
          const savedFilePath = await invoke<string>("save_video", { videoData });
          setSavedPath(savedFilePath);
        } catch (saveErr) {
          console.error("Failed to save video:", saveErr);
          // Don't show error to user, just log it
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      clearInterval(progressInterval);
    } finally {
      setLoading(false);
      clearInterval(progressInterval);
    }
  }, [preview, prompt, duration, resolution]);

  // Global Ctrl+Enter handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submit]);

  return (
    <div className="page page-two-column">
      <div className="page-column page-column-left">
        <h1>Image to Video</h1>
        <p className="subtitle">Upload an image and describe the motion. The model returns a short video.</p>

        <div className="form">
          <ImageUpload preview={preview} onFileSelect={onFileSelect} />

          <label className="block">
            <span>Prompt ({currentIndex + 1}/{prompts.length})</span>
            <textarea
              value={prompt}
              onChange={(e) => updatePrompt(e.target.value)}
              placeholder="e.g. Animate the clouds drifting and trees swaying gently"
              rows={3}
            />
          </label>

          <div className="prompt-controls">
            <button type="button" onClick={goToPrevious} disabled={currentIndex === 0} className="prompt-nav-btn">
              ← Prev
            </button>
            <button type="button" onClick={goToNext} disabled={currentIndex === prompts.length - 1} className="prompt-nav-btn">
              Next →
            </button>
            <button type="button" onClick={addPrompt} className="prompt-action-btn">
              + Add
            </button>
            <button type="button" onClick={duplicatePrompt} className="prompt-action-btn">
              ⎘ Duplicate
            </button>
            <button type="button" onClick={removePrompt} disabled={prompts.length <= 1} className="prompt-action-btn">
              − Remove
            </button>
          </div>

          <button type="button" onClick={submit} disabled={loading || !preview || !prompt.trim()} className="submit-btn">
            {loading ? "Generating video…" : "Generate video"}
          </button>

          {error && <p className="error">{error}</p>}
          {savedPath && <p className="success">Video saved to: {savedPath}</p>}
        </div>
      </div>

      <div className="page-column page-column-right">
        {loading && !resultUrl && (
          <div className="result-placeholder">
            <div className="spinner"></div>
            <p className="status">Video is being generated. This may take a few minutes.</p>
            <p className="progress-text">{progress}%</p>
          </div>
        )}
        {resultUrl && (
          <div className="result-fill">
            <video src={resultUrl} controls autoPlay loop className="result-video-fill" />
          </div>
        )}
      </div>
    </div>
  );
}
