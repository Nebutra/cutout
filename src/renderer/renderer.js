const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const sourceCanvas = document.querySelector("#sourceCanvas");
const transparentCanvas = document.querySelector("#transparentCanvas");
const sourceMeta = document.querySelector("#sourceMeta");
const transparentMeta = document.querySelector("#transparentMeta");
const exportAll = document.querySelector("#exportAll");
const rerun = document.querySelector("#rerun");
const assetGrid = document.querySelector("#assetGrid");
const assetCount = document.querySelector("#assetCount");

const controls = {
  threshold: document.querySelector("#threshold"),
  minArea: document.querySelector("#minArea"),
  mergeGap: document.querySelector("#mergeGap"),
  padding: document.querySelector("#padding")
};

const valueLabels = {
  threshold: document.querySelector("#thresholdValue"),
  minArea: document.querySelector("#minAreaValue"),
  mergeGap: document.querySelector("#mergeGapValue"),
  padding: document.querySelector("#paddingValue")
};

let sourceImage = null;
let sourceName = "asset-sheet";
let cutouts = [];

function settings() {
  return {
    threshold: Number(controls.threshold.value),
    minArea: Number(controls.minArea.value),
    mergeGap: Number(controls.mergeGap.value),
    padding: Number(controls.padding.value)
  };
}

Object.entries(controls).forEach(([key, input]) => {
  input.addEventListener("input", () => {
    valueLabels[key].textContent = input.value;
  });
  input.addEventListener("change", () => {
    if (sourceImage) analyzeImage();
  });
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  const file = event.dataTransfer.files[0];
  if (file) loadFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) loadFile(file);
});

rerun.addEventListener("click", analyzeImage);

exportAll.addEventListener("click", async () => {
  if (!cutouts.length) return;
  exportAll.disabled = true;
  exportAll.textContent = "导出中...";
  const result = await window.cutoutStudio.saveAssets(
    cutouts.map((asset, index) => ({
      name: `${sourceName}-${String(index + 1).padStart(2, "0")}.png`,
      dataUrl: asset.dataUrl
    }))
  );
  exportAll.disabled = false;
  exportAll.textContent = result.canceled ? "导出全部" : `已导出 ${result.count} 个`;
  if (!result.canceled) {
    setTimeout(() => {
      exportAll.textContent = "导出全部";
    }, 1800);
  }
});

function loadFile(file) {
  if (!file.type.startsWith("image/")) return;
  sourceName = file.name.replace(/\.[^.]+$/, "") || "asset-sheet";
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      sourceImage = image;
      drawSource();
      analyzeImage();
      rerun.disabled = false;
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function drawSource() {
  sourceCanvas.width = sourceImage.naturalWidth;
  sourceCanvas.height = sourceImage.naturalHeight;
  const ctx = sourceCanvas.getContext("2d");
  ctx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  ctx.drawImage(sourceImage, 0, 0);
  sourceMeta.textContent = `${sourceCanvas.width} x ${sourceCanvas.height}`;
}

function analyzeImage() {
  if (!sourceImage) return;

  const { threshold, minArea, mergeGap, padding } = settings();
  const width = sourceImage.naturalWidth;
  const height = sourceImage.naturalHeight;
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d");
  ctx.drawImage(sourceImage, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const background = floodBackground(data, width, height, threshold);

  for (let i = 0; i < background.length; i += 1) {
    if (background[i]) {
      const offset = i * 4;
      data[offset + 3] = 0;
    }
  }

  featherEdges(data, background, width, height);
  ctx.putImageData(imageData, 0, 0);

  transparentCanvas.width = width;
  transparentCanvas.height = height;
  const previewCtx = transparentCanvas.getContext("2d");
  previewCtx.clearRect(0, 0, width, height);
  previewCtx.drawImage(offscreen, 0, 0);

  const boxes = mergeBoxes(
    findComponents(data, width, height, minArea),
    mergeGap
  ).map((box) => padBox(box, padding, width, height));

  cutouts = boxes
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((box) => cropCanvas(offscreen, box));

  transparentMeta.textContent = `${cutouts.length} 个区域`;
  renderCutouts();
}

function isBackgroundPixel(data, index, threshold) {
  const offset = index * 4;
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const a = data[offset + 3];
  return a < 8 || (r >= threshold && g >= threshold && b >= threshold);
}

function floodBackground(data, width, height, threshold) {
  const size = width * height;
  const seen = new Uint8Array(size);
  const background = new Uint8Array(size);
  const queue = [];

  function add(index) {
    if (seen[index]) return;
    seen[index] = 1;
    if (isBackgroundPixel(data, index, threshold)) queue.push(index);
  }

  for (let x = 0; x < width; x += 1) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    add(y * width);
    add(y * width + width - 1);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    background[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) add(index - 1);
    if (x < width - 1) add(index + 1);
    if (y > 0) add(index - width);
    if (y < height - 1) add(index + width);
  }

  return background;
}

function featherEdges(data, background, width, height) {
  const copy = new Uint8Array(background);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (copy[index]) continue;
      const touchesBackground =
        copy[index - 1] ||
        copy[index + 1] ||
        copy[index - width] ||
        copy[index + width];
      if (!touchesBackground) continue;
      const offset = index * 4;
      if (data[offset] > 235 && data[offset + 1] > 235 && data[offset + 2] > 235) {
        data[offset + 3] = Math.min(data[offset + 3], 90);
      }
    }
  }
}

function findComponents(data, width, height, minArea) {
  const size = width * height;
  const seen = new Uint8Array(size);
  const boxes = [];
  const queue = [];

  for (let start = 0; start < size; start += 1) {
    if (seen[start] || data[start * 4 + 3] === 0) continue;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let pixels = 0;
    queue.length = 0;
    queue.push(start);
    seen[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % width;
      const y = Math.floor(index / width);
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1
      ];

      neighbors.forEach((next) => {
        if (next < 0 || seen[next] || data[next * 4 + 3] === 0) return;
        seen[next] = 1;
        queue.push(next);
      });
    }

    if (pixels >= minArea) {
      boxes.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixels });
    }
  }

  return boxes;
}

function mergeBoxes(boxes, gap) {
  const merged = boxes.map((box) => ({ ...box }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        if (!near(merged[i], merged[j], gap)) continue;
        merged[i] = unionBox(merged[i], merged[j]);
        merged.splice(j, 1);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return merged;
}

function near(a, b, gap) {
  return !(
    a.x + a.width + gap < b.x ||
    b.x + b.width + gap < a.x ||
    a.y + a.height + gap < b.y ||
    b.y + b.height + gap < a.y
  );
}

function unionBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    pixels: a.pixels + b.pixels
  };
}

function padBox(box, padding, width, height) {
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const right = Math.min(width, box.x + box.width + padding);
  const bottom = Math.min(height, box.y + box.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

function cropCanvas(canvas, box) {
  const crop = document.createElement("canvas");
  crop.width = box.width;
  crop.height = box.height;
  const ctx = crop.getContext("2d");
  ctx.drawImage(
    canvas,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height
  );
  return {
    box,
    dataUrl: crop.toDataURL("image/png")
  };
}

function renderCutouts() {
  assetCount.textContent = `${cutouts.length} 个切片`;
  exportAll.disabled = cutouts.length === 0;

  if (!cutouts.length) {
    assetGrid.innerHTML = `<p class="empty-note">没有找到可导出的区域。请降低白底阈值或最小面积。</p>`;
    return;
  }

  assetGrid.innerHTML = cutouts
    .map((asset, index) => {
      const name = `${String(index + 1).padStart(2, "0")}.png`;
      return `
        <article class="asset-card">
          <div class="asset-thumb"><img src="${asset.dataUrl}" alt="切片 ${index + 1}" /></div>
          <div class="asset-info">
            <p class="asset-title">${name}</p>
            <p class="asset-meta">${asset.box.width} x ${asset.box.height}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

assetGrid.innerHTML = `<p class="empty-note">载入图片后，这里会显示每个透明 PNG 的预览。</p>`;
