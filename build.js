// ─────────────────────────────────────────────
//  build.js  —  對應實際 Notion 欄位名稱版本
//  圖片本地化：build 時自動下載 Notion S3 圖片到 dist/img/
// ─────────────────────────────────────────────
const { Client } = require("@notionhq/client");
const fs   = require("fs");
const path = require("path");
const https = require("https");
const http  = require("http");
const crypto = require("crypto");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DB = {
  archives: process.env.DB_ARCHIVES,
  atelier:  process.env.DB_ATELIER,
  salon:    process.env.DB_SALON,
  outfits:  process.env.DB_OUTFITS,
};

// ─── 圖片下載工具 ────────────────────────────────
const IMG_DIR = path.join("dist", "img");

function ensureImgDir() {
  fs.mkdirSync(IMG_DIR, { recursive: true });
}

// 用 URL 的純路徑部分（去掉 query string）產生穩定的檔名
function urlToFilename(url) {
  const cleanPath = url.split("?")[0];
  const ext = cleanPath.split(".").pop().split("/").pop() || "jpg";
  const hash = crypto.createHash("md5").update(cleanPath).digest("hex").slice(0, 12);
  return `${hash}.${ext}`;
}

function downloadImg(url) {
  return new Promise((resolve) => {
    if (!url) return resolve("");

    const filename = urlToFilename(url);
    const dest     = path.join(IMG_DIR, filename);
    const webPath  = `img/${filename}`;

    // 已存在就直接回傳，不重複下載
    if (fs.existsSync(dest)) return resolve(webPath);

    const lib = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);

    lib.get(url, (res) => {
      // 跟隨 redirect
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlink(dest, () => {});
        return resolve(downloadImg(res.headers.location));
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        console.warn(`⚠️  圖片下載失敗 (${res.statusCode}): ${url.slice(0, 80)}...`);
        return resolve("");
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(webPath);
      });
    }).on("error", (err) => {
      file.close();
      fs.unlink(dest, () => {});
      console.warn(`⚠️  圖片下載錯誤: ${err.message}`);
      resolve("");
    });
  });
}

// 批次下載一組 URL，回傳對應的本地路徑陣列
async function downloadImgs(urls) {
  return Promise.all(urls.map(u => downloadImg(u)));
}

// ─── Notion 資料工具 ──────────────────────────────
function text(prop) {
  if (!prop) return "";
  if (prop.type === "title")        return prop.title.map(t => t.plain_text).join("");
  if (prop.type === "rich_text")    return prop.rich_text.map(t => t.plain_text).join("");
  if (prop.type === "select")       return prop.select?.name || "";
  if (prop.type === "checkbox")     return prop.checkbox;
  if (prop.type === "number")       return prop.number ?? "";
  if (prop.type === "multi_select") return prop.multi_select.map(s => s.name);
  if (prop.type === "files")        return prop.files.map(f =>
    f.type === "external" ? f.external.url : f.file?.url || ""
  ).filter(Boolean);
  return "";
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function fetchDB(dbId, sorts = []) {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: { property: "發布", checkbox: { equals: true } },
      ...(sorts.length && { sorts }),
      start_cursor: cursor,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function singleImg(url) {
  if (url) return `<img src="${esc(url)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  return `<div class="ac-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span>示意圖</span></div>`;
}

// ─── 01 經典衣櫃 ──────────────────────────────────
async function buildArchives(pages) {
  const groups = {};
  const order  = [];
  for (const page of pages) {
    const p   = page.properties;
    const cat = text(p["分類"]) || "其他";
    if (!groups[cat]) { groups[cat] = []; order.push(cat); }
    groups[cat].push({ p, id: page.id });
  }

  function toSlug(str) {
    return str.replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "");
  }

  const imgKeys     = ["ChocoMint_Mix","coco-Illustrious-NoobXL-Style","illustrious_Mix2","Plant_Milk","Hoshino_v2"];
  const modelLabels = ["ChocoMint","coco","illus_Mix2","Plant Milk","Hoshino v2"];

  let toc    = "";
  let filter = `<button class="f-btn active" onclick="filterArc(this,'all')">全部</button>`;
  let html   = "";

  for (const [idx, cat] of order.entries()) {
    const entries = groups[cat];
    const slug    = toSlug(cat);
    const code    = String(idx + 1).padStart(2, "0");
    const first   = idx === 0 ? " active" : "";

    toc    += `<div class="sb-link${first}" onclick="scrollTo2('a-${slug}','arc-toc',this)"><span class="sb-dot"></span>${code} ${esc(cat)}</div>`;
    filter += `<button class="f-btn" onclick="filterArc(this,'${slug}')">${esc(cat)}</button>`;

    html += `<div id="a-${slug}" data-acat="${slug}">`;
    html += `<div class="sub-label"><span class="sub-code">${code}</span>${esc(cat)}</div>`;
    html += `<div class="arc-grid">`;

    for (const { p, id } of entries) {
      const zh     = esc(text(p["中文名稱"]));
      const en     = esc(text(p["Name"]));
      const prompt = esc(text(p["Prompt Tags"]));
      const pixaiUrl = esc(p["封面圖連結"]?.url || "");

      // 下載封面圖
      const coverSrcArr = text(p["封面圖"]) || [];
      const coverSrc    = coverSrcArr[0] || (text(p[imgKeys[0]]) || [])[0] || "";
      const cover       = await downloadImg(coverSrc);

      // 下載模型對比圖
      const modelSrcs = imgKeys.map(k => (text(p[k]) || [])[0] || "");
      const modelImgs = await downloadImgs(modelSrcs);
      const imgData   = esc(JSON.stringify(modelImgs));
      const lblData   = esc(JSON.stringify(modelLabels));

      const cardClick = pixaiUrl
        ? `onclick="window.open('${pixaiUrl}','_blank')"`
        : "";

      html += `<div class="arc-card" ${cardClick} style="cursor:${pixaiUrl ? 'pointer' : 'default'};">`;
      html += `<div class="ac-img">${singleImg(cover)}</div>`;
      html += `<div class="ac-info"><div class="ac-en">${en}</div><div class="ac-zh">${zh}</div><div class="ac-prompt">${prompt}</div></div>`;
      html += `<div class="ac-foot">`;
      html += `<button class="cp-btn" data-p="${prompt}" onclick="event.stopPropagation();cp(this,this.dataset.p)">COPY</button>`;
      html += `<button class="cp-btn" data-p="${prompt}" onclick="event.stopPropagation();gComposerAdd(this,this.dataset.p)" style="margin-left:.3rem;" title="加入組詞器">＋</button>`;
      html += `<button class="cp-btn" data-en="${en}" data-p="${prompt}" onclick="event.stopPropagation();openArcModal(this.dataset.en,this.dataset.p,${imgData},${lblData})" style="margin-left:.3rem;">模型對比</button>`;
      html += `</div></div>`;
    }
    html += `</div></div>`;
  }

  return { html, toc, filter };
}

// ─── 02 製衣工坊 ──────────────────────────────────
// 欄位：分類(select) 子分類(select) 中文名稱(title) Prompt Tags 備註 發布
function buildAtelier(pages) {
  const modMeta = {
    "基礎版型": { tag:"t-sil", tagText:"SILHOUETTE" },
    "材質面料": { tag:"t-fab", tagText:"FABRIC" },
    "剪裁細節": { tag:"t-tai", tagText:"TAILORING" },
    "顏色系統": { tag:"t-col", tagText:"COLOR LAB" },
    "其他點綴": { tag:"t-fin", tagText:"FINDINGS" },
  };

  function toId(str) {
    return "ate-" + str.replace(/\s+/g,"-").replace(/[^\w\u4e00-\u9fff-]/g,"");
  }

  const catOrder = [];
  const subOrder = {};
  const items    = {};

  for (const page of pages) {
    const p   = page.properties;
    const cat = text(p["分類"]) || "其他";
    const sub = text(p["子分類"]) || "";

    if (!items[cat]) { items[cat] = {}; subOrder[cat] = []; }
    if (!items[cat][sub]) { items[cat][sub] = []; subOrder[cat].push(sub); }
    items[cat][sub].push(p);
  }

  // 分類順序固定：modMeta 定義的優先，其餘補在後面
  const CAT_ORDER = Object.keys(modMeta);
  catOrder.push(...CAT_ORDER.filter(c => items[c]));
  Object.keys(items).forEach(c => { if (!CAT_ORDER.includes(c)) catOrder.push(c); });

  let toc = "";
  for (const cat of catOrder) {
    const catId  = toId(cat);
    const hasSub = subOrder[cat].some(s => s !== "");
    toc += `
<div class="ate-toc-cat" onclick="ateTocToggle(this,'${catId}')">
  <span class="sb-dot"></span>
  <span>${esc(cat)}</span>
  ${hasSub ? `<span class="ate-toc-arrow">▾</span>` : ""}
</div>`;
    if (hasSub) {
      toc += `<div class="ate-toc-subs" id="toc-subs-${catId}">`;
      for (const sub of subOrder[cat]) {
        if (!sub) continue;
        const subId = toId(cat + "-" + sub);
        toc += `<div class="ate-toc-sub" onclick="ateScrollTo('${subId}')">${esc(sub)}</div>`;
      }
      toc += `</div>`;
    }
  }

  let html = `<div id="ate-list" class="ate-list">`;

  for (const cat of catOrder) {
    const catId = toId(cat);
    const { tag="", tagText="" } = modMeta[cat] || {};

    html += `<div id="${catId}" class="ate-cat-block" data-cat="${esc(cat)}">`;
    html += `<div class="sub-label"><span class="sub-code"><span class="mtag ${tag}" style="font-size:.55rem;padding:.1rem .45rem;">${tagText}</span></span>${esc(cat)}</div>`;

    for (const sub of subOrder[cat]) {
      if (sub) {
        const subId = toId(cat + "-" + sub);
        html += `<div id="${subId}" class="ate-sub-block">`;
        html += `<div class="ate-sub-label">${esc(sub)}</div>`;
      }

      for (const p of items[cat][sub]) {
        const zh     = text(p["中文名稱"]);
        const prompt = text(p["Prompt Tags"]);
        const note   = text(p["備註"]);

        html += `
<div class="ate-entry" data-cat="${esc(cat)}" data-sub="${esc(sub)}">
  <div class="ate-entry-head">
    <span class="ate-zh">${esc(zh)}</span>
    <span class="mtag ${tag}" style="font-size:.55rem;padding:.1rem .35rem;margin-left:auto;">${tagText}</span>
  </div>
  <div class="ate-prompt">${esc(prompt)}</div>
  ${note ? `<div class="ate-note">${esc(note)}</div>` : ""}
  <div class="ate-foot"><button class="cp-btn" data-p="${esc(prompt)}" onclick="cp(this,this.dataset.p)">COPY</button><button class="cp-btn" data-p="${esc(prompt)}" onclick="event.stopPropagation();gComposerAdd(this,this.dataset.p)" style="margin-left:.4rem;" title="加入組詞器">＋</button></div>
</div>`;
      }

      if (sub) html += `</div>`; // .ate-sub-block
    }

    html += `</div>`; // .ate-cat-block
  }

  html += `</div>`;
  return { html, toc };
}

// ─── 03 寫真沙龍 ──────────────────────────────────
// 欄位：序號 名稱(title) 系列(select) 性別(select) 發布 Prompt PixAI衣櫃(files) PixAI連結(url)
async function buildSalon(pages) {
  const groups = {};
  const order  = [];
  for (const page of pages) {
    const p   = page.properties;
    const key = text(p["系列"]) || "其他";
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(p);
  }

  let toc  = "";
  let html = "";

  for (const [idx, series] of order.entries()) {
    const items    = groups[series];
    const anchorId = `salon-${series.replace(/\s/g,"-")}`;
    const first    = idx === 0 ? " active" : "";

    toc += `<div class="sb-link${first}" onclick="scrollTo2('${anchorId}','salon-toc',this)"><span class="sb-dot"></span>${esc(series)}</div>`;

    html += `<div id="${anchorId}" style="margin-top:2.5rem;">`;
    html += `<div class="sub-label"><span class="sub-code">${esc(series)}</span></div>`;
    html += `<div class="rtw-catalog">`;

    for (const p of items) {
      const name     = esc(text(p["名稱"]));
      const prompt   = esc(text(p["Prompt"]));
      const imgSrcs  = text(p["PixAI衣櫃"]) || [];
      const pixaiUrl = p["PixAI連結"]?.url || "";
      const _gender  = text(p["性別"]);
      const genders  = _gender ? `<span class="rtw-tag">${esc(_gender)}</span>` : "";

      // 下載圖片
      const imgs = await downloadImgs(imgSrcs);
      const img0 = imgs[0] || "";

      html += `<div class="rtw-card"><div class="rtw-img">`;
      if (img0) {
        if (pixaiUrl) {
          html += `<a href="${esc(pixaiUrl)}" target="_blank" rel="noopener" style="display:block;height:100%;"><img src="${esc(img0)}" alt="${name}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"></a>`;
        } else {
          html += `<img src="${esc(img0)}" alt="${name}" loading="lazy">`;
        }
      } else {
        html += `<div class="rtw-img-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>`;
      }
      const pid = `sp-${Math.random().toString(36).slice(2,8)}`;
      html += `</div><div class="rtw-body"><div class="rtw-name">${name}</div>${genders ? `<div class="rtw-meta">${genders}</div>` : ""}`;
      html += `<div class="rtw-prompt-wrap">`;
      html += `<div class="rtw-foot"><button class="cp-btn" data-p="${prompt}" onclick="cp(this,this.dataset.p)">COPY</button><button class="cp-btn" data-p="${prompt}" onclick="event.stopPropagation();gComposerAdd(this,this.dataset.p)" style="margin-left:.4rem;" title="加入組詞器">＋</button></div>`;
      html += `<div class="rtw-prompt" id="${pid}">${prompt}</div>`;
      html += `<div class="toggle-bar" onclick="togglePrompt('${pid}',this)"><span class="toggle-label">展開</span><span class="toggle-arrow">▼</span></div>`;
      html += `</div></div></div>`;
    }
    html += `</div></div>`;
  }

  return { html, toc };
}

// ─── 04 成衣型錄 ──────────────────────────────────
// 欄位：性別(select) 簡單分類(select) 名稱(title) Prompt 示意圖 PixAI連結
async function buildOutfits(pages) {
  function toOId(str) {
    return "out-" + str.replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "");
  }

  const GENDER_ORDER = [["女", "female"], ["男", "male"]];
  const subOrder = {};
  const items    = {};

  for (const page of pages) {
    const p      = page.properties;
    const gender = text(p["性別"]) || "女";
    const sub    = text(p["簡單分類"]) || "";

    if (!items[gender]) { items[gender] = {}; subOrder[gender] = []; }
    if (!items[gender][sub]) { items[gender][sub] = []; subOrder[gender].push(sub); }
    items[gender][sub].push(p);
  }

  let toc    = "";
  let filter = `<button class="f-btn active" onclick="filterOutfit(this,'all')">全部</button>`;
  let html   = "";

  for (const [idx, [gender, slug]] of GENDER_ORDER.entries()) {
    if (!items[gender]) continue;
    const catId  = toOId(gender);
    const hasSub = subOrder[gender].some(s => s !== "");
    const first  = idx === 0 ? " active" : "";

    toc += `
<div class="ate-toc-cat${first}" onclick="outfitTocToggle(this,'${catId}')">
  <span class="sb-dot"></span>
  <span>${gender}模特兒</span>
  ${hasSub ? `<span class="ate-toc-arrow">▾</span>` : ""}
</div>`;
    if (hasSub) {
      toc += `<div class="ate-toc-subs" id="toc-subs-${catId}">`;
      for (const sub of subOrder[gender]) {
        if (!sub) continue;
        const subId = toOId(gender + "-" + sub);
        toc += `<div class="ate-toc-sub" onclick="outfitScrollTo('${subId}')">${esc(sub)}</div>`;
      }
      toc += `</div>`;
    }

    filter += `<button class="f-btn" onclick="filterOutfit(this,'${slug}')">${gender}</button>`;

    html += `<div id="${catId}" data-ocat="${slug}" style="margin-top:2rem;">`;
    html += `<div class="sub-label"><span class="sub-code">${gender}模特兒</span></div>`;

    for (const sub of subOrder[gender]) {
      const subId = toOId(gender + "-" + sub);

      if (sub) {
        html += `<div id="${subId}" class="out-sub-block">`;
        html += `<div class="ate-sub-label">${esc(sub)}</div>`;
      }

      html += `<div class="outfit-runway">`;

      for (const p of items[gender][sub]) {
        const name     = esc(text(p["名稱"]));
        const prompt   = esc(text(p["Prompt"]));
        const imgSrcs  = text(p["示意圖"]) || [];
        const pixaiUrl = p["PixAI連結"]?.url || "";
        const cid      = `oc-${Math.random().toString(36).slice(2, 8)}`;

        // 下載圖片
        const imgs = await downloadImgs(imgSrcs);

        html += `<div class="outfit-card"><div class="outfit-img" id="${cid}">`;
        if (imgs.length === 0) {
          html += `<div class="rtw-img-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>`;
        } else if (imgs.length === 1) {
          if (pixaiUrl) {
            html += `<a href="${esc(pixaiUrl)}" target="_blank" rel="noopener" style="display:block;width:100%;height:100%;"><img src="${esc(imgs[0])}" alt="${name}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></a>`;
          } else {
            html += `<img src="${esc(imgs[0])}" alt="${name}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`;
          }
        } else {
          html += `<div class="outfit-slides" id="${cid}-slides">`;
          imgs.forEach(u => { html += `<img src="${esc(u)}" alt="${name}" loading="lazy">`; });
          html += `</div>`;
          html += `<button class="outfit-arr prev" onclick="outfitSlide('${cid}',-1)">‹</button>`;
          html += `<button class="outfit-arr next" onclick="outfitSlide('${cid}',1)">›</button>`;
          html += `<div class="outfit-dots" id="${cid}-dots">`;
          imgs.forEach((_, i) => { html += `<div class="outfit-dot${i === 0 ? ' active' : ''}" onclick="outfitGo('${cid}',${i})"></div>`; });
          html += `</div>`;
        }

        const pid2 = `op-${Math.random().toString(36).slice(2, 8)}`;
        html += `</div><div class="outfit-body"><div class="rtw-name">${name}</div>`;
        html += `<div class="rtw-prompt-wrap">`;
        html += `<div class="rtw-foot"><button class="cp-btn" data-p="${prompt}" onclick="cp(this,this.dataset.p)">COPY</button><button class="cp-btn" data-p="${prompt}" onclick="event.stopPropagation();gComposerAdd(this,this.dataset.p)" style="margin-left:.4rem;" title="加入組詞器">＋</button></div>`;
        html += `<div class="rtw-prompt" id="${pid2}">${prompt}</div>`;
        html += `<div class="toggle-bar" onclick="togglePrompt('${pid2}',this)"><span class="toggle-arrow">▼</span></div>`;
        html += `</div></div></div>`;
      }

      html += `</div>`; // .outfit-runway
      if (sub) html += `</div>`; // .out-sub-block
    }

    html += `</div>`; // data-ocat
  }

  return { html, toc, filter };
}

// ─── 主程式 ───────────────────────────────────────
async function main() {
  ensureImgDir();
  console.log("📦 抓取 Notion 資料...");

  const [archivesPages, atelierPages, salonPages, outfitsPages] = await Promise.all([
    fetchDB(DB.archives, [
      { property: "分類", direction: "ascending" },
    ]),
    fetchDB(DB.atelier, [
      { property: "分類",   direction: "ascending" },
      { property: "子分類", direction: "ascending" },
    ]),
    fetchDB(DB.salon, [
      { property: "系列", direction: "ascending" },
    ]),
    fetchDB(DB.outfits, [
      { property: "性別",    direction: "ascending" },
      { property: "簡單分類", direction: "ascending" },
    ]),
  ]);

  console.log(`✅ 經典衣櫃：${archivesPages.length} 筆`);
  console.log(`✅ 製衣工坊：${atelierPages.length} 筆`);
  console.log(`✅ 寫真沙龍：${salonPages.length} 筆`);
  console.log(`✅ 成衣型錄：${outfitsPages.length} 筆`);
  console.log("🖼️  下載圖片中...");

  const { html: archivesHtml, toc: archivesToc, filter: archivesFilter } = await buildArchives(archivesPages);
  const { html: atelierHtml,  toc: atelierToc }                          = buildAtelier(atelierPages);
  const { html: salonHtml,    toc: salonToc }                            = await buildSalon(salonPages);
  const { html: outfitsHtml,  toc: outfitsToc, filter: outfitsFilter }  = await buildOutfits(outfitsPages);

  console.log("✅ 圖片下載完成！");

  let template = fs.readFileSync("template.html", "utf8");
  template = template
    .replace("<!-- ARCHIVES_CONTENT -->", archivesHtml)
    .replace("<!-- ARCHIVES_TOC -->",     archivesToc)
    .replace("<!-- ARCHIVES_FILTER -->",  archivesFilter)
    .replace("<!-- ATELIER_CONTENT -->",  atelierHtml)
    .replace("<!-- ATELIER_TOC -->",      atelierToc)
    .replace("<!-- SALON_CONTENT -->",    salonHtml)
    .replace("<!-- SALON_TOC -->",        salonToc)
    .replace("<!-- OUTFITS_CONTENT -->",  outfitsHtml)
    .replace("<!-- OUTFITS_TOC -->",      outfitsToc)
    .replace("<!-- OUTFITS_FILTER -->",   outfitsFilter)
    .replace("<!-- BUILD_TIME -->",       `<!-- built: ${new Date().toISOString()} -->`);

  fs.writeFileSync("dist/index.html", template, "utf8");
  console.log("🎉 dist/index.html 產生完成！");

  // 複製根目錄的 google 驗證檔案到 dist/
  const googleFiles = fs.readdirSync(".").filter(f => f.startsWith("google") && f.endsWith(".html"));
  for (const f of googleFiles) {
    fs.copyFileSync(f, path.join("dist", f));
    console.log(`✅ 複製驗證檔案：${f}`);
  }
}

main().catch(err => { console.error("❌ 錯誤：", err); process.exit(1); });
