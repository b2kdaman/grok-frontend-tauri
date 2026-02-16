import { useState, useCallback } from "react";
import { textToImage } from "../lib/grokApi";

export default function TextToImage() {
  const [prompt, setPrompt] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt.");
      return;
    }
    setLoading(true);
    setError(null);
    setResultUrl(null);
    try {
      const url = await textToImage(prompt.trim());
      setResultUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [prompt]);

  return (
    <div className="page">
      <h1>Text to Image</h1>
      <p className="subtitle">Describe an image. The model generates it from your prompt.</p>

      {resultUrl && (
        <div className="result result-on-top">
          <h2>Result</h2>
          <img src={resultUrl} alt="Generated" className="result-img" />
          <a href={resultUrl} download="grok-image.png" className="download-link">
            Download image
          </a>
        </div>
      )}

      <div className="form">
        <label className="block">
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A collage of London landmarks in a stenciled street-art style"
            rows={4}
          />
        </label>

        <button type="button" onClick={submit} disabled={loading || !prompt.trim()}>
          {loading ? "Generating…" : "Generate image"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
