// ─────────────────────────────────────────────
//  build.js
//  抓 Notion 三個資料庫的資料，產生 index.html
// ─────────────────────────────────────────────
const { Client } = require("@notionhq/client");
const fs = require("fs");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DB = {
  archives: process.env.DB_ARCHIVES,
  atelier:  process.env.DB_ATELIER,
  rtw:      process.env.DB_RTW,
};

// ── 工具函式 ──────────────────────────────────

function text(prop) {
  if (!prop) return "";
  if (prop.type === "title")       return prop.title.map(t => t.plain_text).join("");
  if (prop.type === "rich_text")   return prop.rich_text.map(t => t.plain_text).join("");
  if (prop.type === "select")      return prop.select?.name || "";
  if (prop.type === "checkbox")    return prop.checkbox;
  if (prop.type === "files")       return prop.files.map(f => f.type === "external" ? f.external.url : f.file?.url || "").filter(Boolean);
  return "";
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── 抓資料庫 ──────────────────────────────────

async function fetchDB(dbId) {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: { property: "發布", checkbox: { equals: true } },
      start_cursor: cursor,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// ── 圖片格子（含佔位）──────────────────────────

function imgCell(url, label) {
  if (url) {
    return `<div class="tc"><img src="${esc(url)}" alt="${esc(label)}" loading="lazy"><div class="tc-lbl">${esc(label)}</div></div>`;
  }
  return `<div class="tc"><div class="tc-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div><div class="tc-lbl">${esc(label)}</div></div>`;
}

function singleImg(url) {
  if (url) return `<img src="${esc(url)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  return `<div class="ac-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span>示意圖</span></div>`;
}

// ── 產生各區塊 HTML ────────────────────────────

function buildArchives(pages) {
  // 依分類分組
  const groups = { "經典女裝": [], "經典男裝": [], "民族文化": [], "現代街頭": [] };
  const catMap  = { "經典女裝": "female", "經典男裝": "male", "民族文化": "ethnic", "現代街頭": "street" };
  const codeMap = { "經典女裝": "1.1", "經典男裝": "1.2", "民族文化": "1.3", "現代街頭": "1.4" };

  for (const page of pages) {
    const p = page.properties;
    const cat = text(p["分類"]) || "經典女裝";
    if (groups[cat]) groups[cat].push(p);
  }

  let html = "";
  for (const [cat, items] of Object.entries(groups)) {
    if (!items.length) continue;
    const acat = catMap[cat];
    const code = codeMap[cat];
    html += `<div id="a-${acat}" data-acat="${acat}">`;
    html += `<div class="sub-label"><span class="sub-code">${code}</span>${esc(cat)}</div>`;
    html += `<div class="arc-grid">`;

    for (const p of items) {
      const en     = esc(text(p["Name"]));
      const zh     = esc(text(p["中文名"]));
      const prompt = esc(text(p["提示詞"]));
      const imgs   = text(p["圖片 A–E"]);
      const img0   = imgs[0] || "";

      html += `
<div class="arc-card">
  <div class="ac-img">${singleImg(img0)}</div>
  <div class="ac-info">
    <div class="ac-en">${en}</div>
    <div class="ac-zh">${zh}</div>
    <div class="ac-prompt">${prompt}</div>
  </div>
  <div class="ac-foot"><button class="cp-btn" onclick="cp(this,'${prompt}')">COPY</button></div>
</div>`;
    }

    html += `</div>`; // arc-grid

    // 五模型對比列（取第一筆做示範）
    if (items.length > 0) {
      const p    = items[0];
      const en   = esc(text(p["Name"]));
      const imgs = text(p["圖片 A–E"]);
      const models = ["Model A","Model B","Model C","Model D","Model E"];
      html += `
<div class="amc">
  <div class="amc-head">
    <div><div class="amc-title">${en} — 五模型直出對比</div></div>
    <span class="amc-tag t-arc">ARCHIVES</span>
  </div>
  <div class="tg5">`;
      for (let i = 0; i < 5; i++) {
        html += imgCell(imgs[i] || "", models[i]);
      }
      html += `</div>`;

      // 展開備註表
      html += `<button class="xbtn" onclick="toggleX(this)">展開各模型備註 <span class="ea">▾</span></button>
<div class="xpanel"><table class="xtable">
<thead><tr><th>模型</th><th>圖例</th><th>備註</th></tr></thead><tbody>`;
      for (let i = 0; i < 5; i++) {
        const note = esc(text(items[i]?.["備註"]) || "—");
        html += `<tr>
  <td><span class="mn">${models[i]}</span></td>
  <td>${imgs[i] ? `<img src="${esc(imgs[i])}" style="width:52px;height:65px;object-fit:cover;border-radius:2px;">` : '<div class="tph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>'}</td>
  <td class="nt">${note}</td>
</tr>`;
      }
      html += `</tbody></table></div></div>`;
    }

    html += `</div>`; // data-acat group
  }
  return html;
}

function buildAtelier(pages) {
  const modules = {
    "A-01": { label: "版型分類", tag: "t-sil", tagText: "SILHOUETTE" },
    "A-02": { label: "面料車間", tag: "t-fab", tagText: "FABRIC" },
    "A-03": { label: "剪裁工藝", tag: "t-tai", tagText: "TAILORING" },
    "A-04": { label: "色彩系統", tag: "t-col", tagText: "COLOR LAB" },
    "A-05": { label: "五金配飾", tag: "t-fin", tagText: "FINDINGS" },
  };
  const groups = {};
  for (const key of Object.keys(modules)) groups[key] = [];

  for (const page of pages) {
    const p   = page.properties;
    const mod = text(p["模組"]);
    if (groups[mod]) groups[mod].push(p);
  }

  let html = "";
  for (const [mod, items] of Object.entries(groups)) {
    if (!items.length) continue;
    const { label, tag, tagText } = modules[mod];
    const anchorId = `m-${mod.toLowerCase().replace("-","")}`; // e.g. m-a01

    html += `<div id="${anchorId}" class="cat-group">`;
    html += `<div class="cg-head"><span class="cg-title">${mod} ${esc(label)}</span><span class="mtag ${tag}">${tagText}</span><span class="cg-count">${items.length} 詞條</span></div>`;
    html += `<div class="item-row">`;

    for (const p of items) {
      const en     = esc(text(p["Name"]));
      const zh     = esc(text(p["中文名"]));
      const prompt = esc(text(p["提示詞"]));
      const imgs   = text(p["示意圖"]);
      const img0   = imgs[0] || "";

      html += `
<div class="fi">
  <div class="fi-img">${singleImg(img0)}</div>
  <div class="fi-info">
    <div class="fi-en">${en}</div>
    <div class="fi-zh">${zh}</div>
    <div class="fi-prompt">${prompt}</div>
  </div>
  <div class="fi-foot"><button class="cp-btn" onclick="cp(this,'${prompt}')">COPY</button></div>
</div>`;
    }

    html += `</div></div>`; // item-row + cat-group
  }
  return html;
}

function buildRTW(pages) {
  const seriesMap = { "材質跨界": "r31", "結構挑戰": "r32", "環境適配": "r33" };
  const codeMap   = { "材質跨界": "3.1", "結構挑戰": "3.2", "環境適配": "3.3" };
  const groups    = { "材質跨界": [], "結構挑戰": [], "環境適配": [] };

  for (const page of pages) {
    const p   = page.properties;
    const ser = text(p["系列"]);
    if (groups[ser]) groups[ser].push(p);
  }

  let html = "";
  for (const [ser, items] of Object.entries(groups)) {
    if (!items.length) continue;
    const anchorId = seriesMap[ser];
    const code     = codeMap[ser];

    html += `<div id="${anchorId}" style="margin-top:2.5rem;">`;
    html += `<div class="sub-label"><span class="sub-code">${code}</span>${esc(ser)}</div>`;
    html += `<div class="card-grid">`;

    for (const p of items) {
      const en      = esc(text(p["Name"]));
      const zh      = esc(text(p["中文名"]));
      const formula = esc(text(p["公式"]));
      const prompt  = esc(text(p["完整提示詞"]));
      const weights = esc(text(p["權重說明"]));
      const note    = esc(text(p["備註"]));
      const imgs    = text(p["圖片 A–D"]);
      const models  = ["Model A","Model B","Model C","Model D"];

      // 公式拆解（用 + 跟 = 分割）
      const formulaParts = text(p["公式"]).split(/(\+|=)/).map(s => s.trim()).filter(Boolean);
      let formulaHtml = "";
      for (const part of formulaParts) {
        if (part === "+") formulaHtml += `<span class="fop">+</span>`;
        else if (part === "=") formulaHtml += `<span class="fop">=</span>`;
        else if (formulaParts.indexOf(part) === formulaParts.length - 1 && formulaParts.includes("=")) {
          formulaHtml += `<span class="fr">${esc(part)}</span>`;
        } else {
          formulaHtml += `<span class="ft">${esc(part)}</span>`;
        }
      }

      html += `
<div class="fc">
  <div class="fc-head">
    <div class="fc-title">${en}　<span style="font-size:.85rem;opacity:.6;">${zh}</span></div>
    <div class="fc-sub">${code} · ${esc(ser)}</div>
    <div class="fml">${formulaHtml}</div>
  </div>
  <div class="wt-strip"><span class="wt-lbl">WEIGHTS</span><span class="wt-chip">${weights}</span></div>
  <div class="prompt-box"><span class="pt">${prompt}</span><button class="cp-btn" onclick="cp(this,'${prompt}')">COPY</button></div>
  <div class="tg4">`;

      for (let i = 0; i < 4; i++) {
        html += imgCell(imgs[i] || "", models[i]);
      }

      html += `</div>
  <button class="xbtn" onclick="toggleX(this)">展開模型備註 <span class="ea">▾</span></button>
  <div class="xpanel"><table class="xtable">
  <thead><tr><th>模型</th><th>圖例</th><th>備註</th></tr></thead><tbody>`;

      for (let i = 0; i < 4; i++) {
        html += `<tr>
  <td><span class="mn">${models[i]}</span></td>
  <td>${imgs[i] ? `<img src="${esc(imgs[i])}" style="width:52px;height:65px;object-fit:cover;border-radius:2px;">` : '<div class="tph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>'}</td>
  <td class="nt">${i === 0 ? note : "—"}</td>
</tr>`;
      }

      html += `</tbody></table></div>
</div>`; // fc
    }

    html += `</div></div>`; // card-grid + section
  }
  return html;
}

// ── 讀取現有的 index.html 樣板 ────────────────
// 把三個區塊的內容替換進去
// 樣板中用特殊註解標記插入點：
//   <!-- ARCHIVES_CONTENT -->
//   <!-- ATELIER_CONTENT -->
//   <!-- RTW_CONTENT -->

async function main() {
  console.log("📦 抓取 Notion 資料...");

  const [archivesPages, atelierPages, rtwPages] = await Promise.all([
    fetchDB(DB.archives),
    fetchDB(DB.atelier),
    fetchDB(DB.rtw),
  ]);

  console.log(`✅ 基礎衣櫃：${archivesPages.length} 筆`);
  console.log(`✅ 製衣工廠：${atelierPages.length} 筆`);
  console.log(`✅ 成衣收藏：${rtwPages.length} 筆`);

  const archivesHTML = buildArchives(archivesPages);
  const atelierHTML  = buildAtelier(atelierPages);
  const rtwHTML      = buildRTW(rtwPages);

  // 讀取樣板
  let template = fs.readFileSync("template.html", "utf8");

  // 替換內容
  template = template
    .replace("<!-- ARCHIVES_CONTENT -->", archivesHTML)
    .replace("<!-- ATELIER_CONTENT -->",  atelierHTML)
    .replace("<!-- RTW_CONTENT -->",      rtwHTML)
    .replace("<!-- BUILD_TIME -->",       new Date().toISOString());

  // 輸出
  if (!fs.existsSync("dist")) fs.mkdirSync("dist");
  fs.writeFileSync("dist/index.html", template, "utf8");
  console.log("🎉 dist/index.html 產生完成！");
}

main().catch(err => {
  console.error("❌ 錯誤：", err);
  process.exit(1);
});
