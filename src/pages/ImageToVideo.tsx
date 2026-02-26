import { useState, useCallback, useEffect, useRef } from "react";
import { imageToVideo } from "../lib/grokApi";
import ImageUpload from "../components/ImageUpload";
import { invoke } from "@tauri-apps/api/core";

const DURATION_DEFAULT = 6;
const PROMPTS_STORAGE_KEY = "image-to-video-prompts";
const JOBS_STORAGE_KEY = "image-to-video-jobs";

type Resolution = "480p" | "720p";

interface Job {
  id: string;
  prompt: string;
  image: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  resultUrl?: string;
  error?: string;
  savedPath?: string;
  timestamp: number;
}

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

function loadJobs(): Job[] {
  try {
    const stored = localStorage.getItem(JOBS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function saveJobs(jobs: Job[]): void {
  try {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // ignore save errors
  }
}

function getJobStatusText(job: Job): string {
  if (job.status === "failed" && job.error) {
    const errorLower = job.error.toLowerCase();
    if (errorLower.includes("moderation")) {
      return "failed - moderation";
    }
    if (errorLower.includes("token")) {
      return "failed - balance";
    }
  }
  return job.status;
}

export default function ImageToVideo() {
  const [preview, setPreview] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<string[]>(() => loadPrompts());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [duration] = useState(DURATION_DEFAULT);
  const [resolution] = useState<Resolution>("720p");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [jobs, setJobs] = useState<Job[]>(() => loadJobs());
  const jobsListRef = useRef<HTMLDivElement>(null);

  const prompt = prompts[currentIndex] || "";

  // Auto-save whenever prompts change
  useEffect(() => {
    savePrompts(prompts);
  }, [prompts]);

  // Auto-save whenever jobs change
  useEffect(() => {
    saveJobs(jobs);
  }, [jobs]);

  // Auto-scroll to top when new job is added
  useEffect(() => {
    if (jobsListRef.current && jobs.length > 0) {
      jobsListRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [jobs.length]);

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
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }, []);

  const runJob = useCallback(async (jobPrompt: string, jobImage: string) => {
    if (!jobImage || !jobPrompt.trim()) {
      setError("Please upload an image and enter a prompt.");
      return;
    }
    setLoading(true);
    setError(null);
    setSavedPath(null);
    setProgress(0);

    // Create a new job
    const jobId = `job-${Date.now()}`;
    const newJob: Job = {
      id: jobId,
      prompt: jobPrompt,
      image: jobImage,
      status: "processing",
      progress: 0,
      timestamp: Date.now(),
    };

    setJobs((prev) => [newJob, ...prev]);

    // Start progress timer (25 seconds to 100%)
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percentage = Math.min(100, Math.floor((elapsed / 25000) * 100));
      setProgress(percentage);
      setJobs((prev) =>
        prev.map((job) => (job.id === jobId ? { ...job, progress: percentage } : job))
      );
      if (percentage >= 100) {
        clearInterval(progressInterval);
      }
    }, 100);

    try {
      const url = await imageToVideo(jobPrompt.trim(), jobImage, {
        duration,
        resolution,
      });
      setResultUrl(url);

      let savedFilePath: string | undefined;

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
          savedFilePath = await invoke<string>("save_video", { videoData });
          setSavedPath(savedFilePath);
        } catch (saveErr) {
          console.error("Failed to save video:", saveErr);
          // Don't show error to user, just log it
        }
      }

      // Update job with completed status
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? { ...job, status: "completed" as const, resultUrl: url, savedPath: savedFilePath, progress: 100 }
            : job
        )
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Request failed";
      setError(errorMsg);
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, status: "failed" as const, error: errorMsg } : job
        )
      );
      clearInterval(progressInterval);
    } finally {
      setLoading(false);
      clearInterval(progressInterval);
    }
  }, [duration, resolution]);

  const submit = useCallback(async () => {
    if (!preview || !prompt.trim()) {
      setError("Please upload an image and enter a prompt.");
      return;
    }
    await runJob(prompt, preview);
  }, [preview, prompt, runJob]);

  const rerunJob = useCallback((job: Job) => {
    runJob(job.prompt, job.image);
  }, [runJob]);

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
        <div className="page-header">
          <h1>Image to Video</h1>
          <p className="subtitle">Upload an image and describe the motion. The model returns a short video.</p>
        </div>

        <div className="form">
          <ImageUpload preview={preview} onFileSelect={onFileSelect} />

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

          <label className="block">
            <span>Prompt ({currentIndex + 1}/{prompts.length})</span>
            <textarea
              value={prompt}
              onChange={(e) => updatePrompt(e.target.value)}
              placeholder="e.g. Animate the clouds drifting and trees swaying gently"
              rows={3}
            />
          </label>

          <button type="button" onClick={submit} disabled={loading || !preview || !prompt.trim()} className="submit-btn">
            {loading ? "Generating video…" : "Generate video"}
          </button>

          {savedPath && <p className="success">Video saved to: {savedPath}</p>}

          <div className="jobs-log">
            <h3>Jobs History</h3>
            <div className="jobs-list" ref={jobsListRef}>
              {jobs.length === 0 ? (
                <p className="jobs-empty">No jobs yet. Generate a video to get started.</p>
              ) : (
                jobs.map((job) => (
                  <div key={job.id} className={`job-item job-${job.status}`}>
                    <div className="job-content">
                      {job.image && (
                        <div className="job-image">
                          <img src={job.image} alt="Job input" />
                        </div>
                      )}
                      <div className="job-details">
                        <div className="job-header">
                          <span className="job-status">{getJobStatusText(job)}</span>
                          {job.status === "processing" && <span className="job-progress">{job.progress}%</span>}
                        </div>
                        <div className="job-prompt">{job.prompt}</div>
                        {job.savedPath && <p className="job-saved-path">Saved: {job.savedPath}</p>}
                        <div className="job-actions">
                          <button
                            type="button"
                            onClick={() => rerunJob(job)}
                            disabled={loading}
                            className="job-rerun-btn"
                          >
                            ↻ Rerun
                          </button>
                          {job.resultUrl && (
                            <a href={job.resultUrl} target="_blank" rel="noopener noreferrer" className="job-view-link">
                              View Result
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
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
            {loading && (
              <div className="result-loading-badge">
                <div className="spinner-small"></div>
                <span>{progress}%</span>
              </div>
            )}
            <video src={resultUrl} controls autoPlay loop className="result-video-fill" />
          </div>
        )}
      </div>
    </div>
  );
}
