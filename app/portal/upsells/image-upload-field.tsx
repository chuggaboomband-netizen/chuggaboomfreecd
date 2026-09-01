"use client";

import { useEffect, useRef, useState } from "react";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type UploadState =
  | { status: "idle"; message: string }
  | { status: "working"; message: string }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };

function formatBytes(value: number) {
  return value < 1024 * 1024
    ? `${Math.round(value / 1024)} KB`
    : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This image could not be read."));
    };
    image.src = objectUrl;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This image could not be compressed."));
    }, "image/webp", quality);
  });
}

async function compressForUpload(file: File) {
  const image = await loadImage(file);
  const settings = [
    { dimension: 1600, quality: 0.82 },
    { dimension: 1400, quality: 0.76 },
    { dimension: 1200, quality: 0.7 },
  ];

  let smallest: Blob | undefined;
  for (const setting of settings) {
    const scale = Math.min(1, setting.dimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = await canvasToWebp(canvas, setting.quality);
    smallest = webp;
    if (webp.size <= MAX_UPLOAD_BYTES) return webp;
  }

  throw new Error(`The compressed image is still ${formatBytes(smallest?.size || 0)}. Please choose a smaller image.`);
}

export function ImageUploadField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({
    status: "idle",
    message: "Images are automatically optimised before upload.",
  });

  useEffect(() => {
    const form = inputRef.current?.form;
    const blockSubmit = (event: SubmitEvent) => {
      if (state.status === "working" || state.status === "error") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setState((current) => ({
          ...current,
          message: current.status === "working" ? "Please wait for image optimisation to finish." : current.message,
        }));
      }
    };
    form?.addEventListener("submit", blockSubmit, true);
    return () => form?.removeEventListener("submit", blockSubmit, true);
  }, [state.status]);

  const handleChange = async () => {
    const input = inputRef.current;
    const file = input?.files?.[0];
    if (!input || !file) {
      setState({ status: "idle", message: "Images are automatically optimised before upload." });
      return;
    }

    if (file.type === "image/gif") {
      if (file.size > MAX_UPLOAD_BYTES) {
        setState({ status: "error", message: "Animated GIFs cannot be compressed here. Please choose one below 4 MB." });
      } else {
        setState({ status: "ready", message: `${file.name} is ready to upload.` });
      }
      return;
    }

    setState({ status: "working", message: "Optimising image before upload..." });
    try {
      const compressed = await compressForUpload(file);
      const safeBaseName = file.name.replace(/\.[^.]+$/, "") || "product-image";
      const optimisedFile = new File([compressed], `${safeBaseName}.webp`, { type: "image/webp" });
      const transfer = new DataTransfer();
      transfer.items.add(optimisedFile);
      input.files = transfer.files;
      setState({ status: "ready", message: `Ready to upload: ${formatBytes(file.size)} → ${formatBytes(compressed.size)}.` });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "This image could not be optimised." });
    }
  };

  return (
    <label className="field">
      <span>Upload image</span>
      <input
        ref={inputRef}
        name="imageFile"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleChange}
      />
      <span className={`image-upload-status is-${state.status}`} aria-live="polite">{state.message}</span>
    </label>
  );
}
