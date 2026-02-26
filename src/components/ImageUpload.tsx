import { useState, useCallback, useEffect } from "react";

type Props = {
  preview: string | null;
  onFileSelect: (file: File) => void;
  label?: string;
};

export default function ImageUpload({ preview, onFileSelect, label = "Image" }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  // Handle paste event
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            onFileSelect(file);
            e.preventDefault();
          }
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onFileSelect]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f && f.type.startsWith("image/")) onFileSelect(f);
      e.target.value = "";
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f && f.type.startsWith("image/")) {
        onFileSelect(f);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only set dragging false if we're leaving the drop zone itself
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  return (
    <label className="block">
      <span>{label}</span>
      <div
        className={`upload-zone ${isDragging ? "upload-zone--dragging" : ""} ${preview ? "upload-zone--has-preview" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="upload-zone-input"
        />
        {preview ? (
          <div className="upload-zone-preview">
            <img src={preview} alt="" className="upload-zone-thumb" />
            <span className="upload-zone-change">Change image</span>
          </div>
        ) : (
          <div className="upload-zone-empty">
            <span className="upload-zone-icon" aria-hidden>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </span>
            <span className="upload-zone-text">Drop, paste, or click to browse</span>
          </div>
        )}
      </div>
    </label>
  );
}
