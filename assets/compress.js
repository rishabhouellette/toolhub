// ToolHub - Image Compressor
// Client-side compression to hit target KB size (approx) using binary search on quality.

const $ = (id) => document.getElementById(id);

const fileInput = $("file");
const targetSelect = $("target");
const maxWidthInput = $("maxWidth");
const formatSelect = $("format");

const compressBtn = $("compressBtn");
const resetBtn = $("resetBtn");
const statusEl = $("status");

const origImg = $("origImg");
const newImg = $("newImg");
const origMeta = $("origMeta");
const newMeta = $("newMeta");

const downloadBtn = $("downloadBtn");
const copySizeBtn = $("copySizeBtn");
const copyLinkBtn = $("copyLinkBtn");
const shareBtn = $("shareBtn");
const viralCta = $("viralCta");

let originalFile = null;
let originalBitmap = null;

function kb(bytes) {
  return (bytes / 1024).toFixed(1);
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function resetAll() {
  originalFile = null;
  originalBitmap = null;

  origImg.style.display = "none";
  newImg.style.display = "none";
  origMeta.textContent = "—";
  newMeta.textContent = "—";

  downloadBtn.style.display = "none";
  copySizeBtn.style.display = "none";
  copyLinkBtn.style.display = "none";
  shareBtn.style.display = "none";
  viralCta.style.display = "none";
  downloadBtn.href = "#";
  downloadBtn.download = "";

  setStatus("");
  fileInput.value = "";
}

async function fileToBitmap(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const bitmap = await createImageBitmap(img);
    return bitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawToCanvas(bitmap, maxWidth) {
  const w = bitmap.width;
  const h = bitmap.height;

  const scale = Math.min(1, maxWidth / w);
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, nw, nh);

  return canvas;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    if (mimeType === "image/png") {
      // PNG ignores quality, so we just export
      canvas.toBlob((b) => resolve(b), mimeType);
    } else {
      canvas.toBlob((b) => resolve(b), mimeType, quality);
    }
  });
}

async function compressToTarget(canvas, mimeType, targetBytes) {
  // If PNG selected, we can't quality-tune much. We return single export.
  if (mimeType === "image/png") {
    const blob = await canvasToBlob(canvas, mimeType);
    return blob;
  }

  // Binary search quality to get close to targetBytes
  let low = 0.05;
  let high = 0.95;
  let bestBlob = null;

  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    const blob = await canvasToBlob(canvas, mimeType, mid);

    if (!blob) continue;
    bestBlob = blob;

    if (blob.size > targetBytes) {
      // too big -> lower quality
      high = mid;
    } else {
      // too small -> increase quality
      low = mid;
    }
  }

  return bestBlob;
}

function guessExtension(mime) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "img";
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  originalFile = file;

  setStatus("Loading image...");
  originalBitmap = await fileToBitmap(file);

  // show original preview
  origImg.src = URL.createObjectURL(file);
  origImg.style.display = "block";
  origMeta.textContent = `${file.name} • ${kb(file.size)} KB • ${originalBitmap.width}×${originalBitmap.height}px`;

  setStatus("Ready. Choose target size and click Compress.");
});

compressBtn.addEventListener("click", async () => {
  if (!originalBitmap || !originalFile) {
    setStatus("Please upload an image first.");
    return;
  }

  compressBtn.disabled = true;
  setStatus("Compressing...");

  try {
    const targetKB = parseInt(targetSelect.value, 10);
    const targetBytes = targetKB * 1024;

    const maxWidth = Math.max(200, parseInt(maxWidthInput.value || "1200", 10));
    const mimeType = formatSelect.value;

    // Draw to canvas with resize
    const canvas = drawToCanvas(originalBitmap, maxWidth);

    // Run compression
    let blob = await compressToTarget(canvas, mimeType, targetBytes);

    // If still too big, do an emergency resize loop
    // (helps strict 20KB constraints)
    let loop = 0;
    while (blob && blob.size > targetBytes && loop < 4) {
      const shrinkFactor = 0.82; // reduce size each loop
      const nw = Math.max(200, Math.round(canvas.width * shrinkFactor));
      const nh = Math.max(200, Math.round(canvas.height * shrinkFactor));

      const c2 = document.createElement("canvas");
      c2.width = nw;
      c2.height = nh;

      const ctx = c2.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, 0, 0, nw, nh);

      blob = await compressToTarget(c2, mimeType, targetBytes);
      loop++;
    }

    if (!blob) {
      setStatus("Compression failed. Try again with JPG format.");
      return;
    }

    // Preview compressed image
    const blobUrl = URL.createObjectURL(blob);
    newImg.src = blobUrl;
    newImg.style.display = "block";

    const ext = guessExtension(mimeType);
    const outName = `compressed-${targetKB}kb.${ext}`;

    const savings = ((1 - blob.size / originalFile.size) * 100).toFixed(1);

    newMeta.textContent =
      `${outName} • ${kb(blob.size)} KB • saved ${savings}%`;

    // Download link
    downloadBtn.href = blobUrl;
    downloadBtn.download = outName;
    downloadBtn.style.display = "inline-flex";
    copySizeBtn.style.display = "inline-flex";
    copyLinkBtn.style.display = "inline-flex";
    shareBtn.style.display = "inline-flex";
    viralCta.style.display = "block";

    copySizeBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(`${kb(blob.size)} KB`);
        setStatus("Copied size to clipboard ✅");
        setTimeout(() => setStatus(""), 1500);
      } catch (e) {
        setStatus("Could not copy. (Browser blocked clipboard)");
      }
    };

    if (blob.size <= targetBytes) {
      setStatus(`Done ✅ Under target (${targetKB}KB).`);
    } else {
      setStatus(`Compressed, but still above target. Try lower max width.`);
    }
  } catch (err) {
    console.error(err);
    setStatus("Error during compression. Try JPG format or smaller max width.");
  } finally {
    compressBtn.disabled = false;
  }
});

resetBtn.addEventListener("click", () => {
  resetAll();
});

copyLinkBtn.addEventListener("click", async () => {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    setStatus("Tool link copied ✅");
    setTimeout(() => setStatus(""), 1500);
  } catch {
    setStatus("Could not copy link.");
  }
});

shareBtn.addEventListener("click", async () => {
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({
        title: document.title,
        text: "Compress image instantly (20KB/50KB/100KB)",
        url
      });
    } else {
      await navigator.clipboard.writeText(url);
      setStatus("Share not supported — link copied ✅");
      setTimeout(() => setStatus(""), 1500);
    }
  } catch (e) {
    // user cancelled share etc
  }
});

resetAll();