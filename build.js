// ─────────────────────────────────────────────
//  build.js  —  對應實際 Notion 欄位名稱版本
// ─────────────────────────────────────────────
const { Client } = require("@notionhq/client");
const fs = require("fs");
 
const notion = new Client({ auth: process.env.NOTION_TOKEN });
 
const DB = {
  archives: process.env.DB_ARCHIVES,
  atelier:  process.env.DB_ATELIER,
  rtw:      process.env.DB_RTW,
};
 
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
 
function imgCell(url, label) {
  if (url) return `<div class="tc"><img src="${esc(url)}" alt="${esc(label)}" loading="lazy"><div class="tc-lbl">${esc(label)}</div></div>`;
  return `<div class="tc"><div class="tc-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div><div class="tc-lbl">${esc(label)}</div></div>`;
}
 
function singleImg(url) {
  if (url) return `<img src="${esc(url)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  return `<div class="ac-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span>示意圖</span></div>`;
}
 
// 01 經典衣櫃
// 欄位：分類 中文名稱(title) Name Prompt Tags 備註 coco-Illustrious-NoobXL-Style ChocoMint_Mix illustrious_Mix2 Plant_Milk 發布
function buildArchives(pages) {
  const groups = {};
  const order  = [];
  for (const page of pages) {
    const p   = page.properties;
    const cat = text(p["分類"]) || "其他";
    if (!groups[cat]) { groups[cat] = []; order.push(cat); }
    groups[cat].push(p);
  }

  function toSlug(str) {
    return str.replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "");
  }

  const imgKeys     = ["coco-Illustrious-NoobXL-Style","ChocoMint_Mix","illustrious_Mix2","Plant_Milk","模型E示意圖"];
  const modelLabels = ["coco","ChocoMint","illus_Mix2","Plant Milk","（待定）"];

  let toc    = "";
  let filter = `<button class="f-btn active" onclick="filterArc(this,'all')">全部</button>`;
  let html   = "";

  order.forEach((cat, idx) => {
    const items = groups[cat];
    const slug  = toSlug(cat);
    const code  = String(idx + 1).padStart(2, "0");
    const first = idx === 0 ? " active" : "";

    toc    += `<div class="sb-link${first}" onclick="scrollTo2('a-${slug}','arc-toc',this)"><span class="sb-dot"></span>${code} ${esc(cat)}</div>`;
    filter += `<button class="f-btn" onclick="filterArc(this,'${slug}')">${esc(cat)}</button>`;

    html += `<div id="a-${slug}" data-acat="${slug}">`;
    html += `<div class="sub-label"><span class="sub-code">${code}</span>${esc(cat)}</div>`;
    html += `<div class="arc-grid">`;

    for (const p of items) {
      const zh      = esc(text(p["中文名稱"]));
      const en      = esc(text(p["Name"]));
      const prompt  = esc(text(p["Prompt Tags"]));
      const imgs    = imgKeys.map(k => (text(p[k]) || [])[0] || "");
      const img0    = imgs[0] || "";
      const imgData = esc(JSON.stringify(imgs));
      const lblData = esc(JSON.stringify(modelLabels));
      html += `<div class="arc-card" onclick="openArcModal('${en}','${prompt}',${imgData},${lblData})" style="cursor:pointer;"><div class="ac-img">${singleImg(img0)}</div><div class="ac-info"><div class="ac-en">${en}</div><div class="ac-zh">${zh}</div><div class="ac-prompt">${prompt}</div></div><div class="ac-foot"><button class="cp-btn" onclick="event.stopPropagation();cp(this,'${prompt}')">COPY</button></div></div>`;
    }
    html += `</div></div>`;
  });

  return { html, toc, filter };
}
 
// 02 製衣工坊
// 欄位：分類 中文名稱(title) Name Prompt Tags 備註 發布
function buildAtelier(pages) {
  const modules = {
    "基礎版型":{ label:"", tag:"t-sil", tagText:"SILHOUETTE" },
    "材質面料":{ label:"", tag:"t-fab", tagText:"FABRIC" },
    "剪裁細節":{ label:"", tag:"t-tai", tagText:"TAILORING" },
    "顏色系統":{ label:"", tag:"t-col", tagText:"COLOR LAB" },
    "其他點綴":{ label:"", tag:"t-fin", tagText:"FINDINGS" },
  };
 
  // 篩選按鈕
  let html = `<div class="ate-filter-bar">
    <button class="ate-tag active" data-mod="all" onclick="ateFilter(this,'all')">全部</button>`;
  for (const [mod, { label, tag, tagText }] of Object.entries(modules)) {
    html += `<button class="ate-tag" data-mod="${mod}" onclick="ateFilter(this,'${mod}')"><span class="mtag ${tag}" style="font-size:.55rem;padding:.1rem .35rem;">${tagText}</span> ${esc(mod)}</button>`;
  }
  html += `</div>`;
 
  // 詞條列表
  html += `<div id="ate-list" class="ate-list">`;
  for (const page of pages) {
    const p      = page.properties;
    const mod    = text(p["分類"]) || "";
    if (!modules[mod]) continue;
    const zh     = text(p["中文名稱"]);
    const prompt = text(p["Prompt Tags"]);
    const note   = text(p["備註"]);
    const { tag="", tagText="" } = modules[mod] || {};
 
    html += `
<div class="ate-entry" data-mod="${esc(mod)}">
  <div class="ate-entry-head">
    <span class="ate-zh">${esc(zh)}</span>
    <span class="mtag ${tag}" style="font-size:.55rem;padding:.1rem .35rem;margin-left:auto;">${tagText}</span>
  </div>
  <div class="ate-prompt">${esc(prompt)}</div>
  ${note ? `<div class="ate-note">${esc(note)}</div>` : ""}
  <div class="ate-foot"><button class="cp-btn" onclick="cp(this,'${esc(prompt)}')">COPY</button></div>
</div>`;
  }
  html += `</div>`;
  return html;
}
 
// 03 成衣型錄
function buildRTW(pages) {
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

  order.forEach((series, idx) => {
    const items    = groups[series];
    const anchorId = `rtw-${series.replace(/\s/g,"-")}`;
    const first    = idx === 0 ? " active" : "";

    toc += `<div class="sb-link${first}" onclick="scrollTo2('${anchorId}','rtw-toc',this)"><span class="sb-dot"></span>${esc(series)}</div>`;

    html += `<div id="${anchorId}" style="margin-top:2.5rem;">`;
    html += `<div class="sub-label"><span class="sub-code">${esc(series)}</span></div>`;
    html += `<div class="rtw-catalog">`;

    for (const p of items) {
      const name     = esc(text(p["名稱"]));
      const prompt   = esc(text(p["Prompt"]));
      const imgs     = text(p["pixAI衣櫃"]) || [];
      const img0     = imgs[0] || "";
      const pixaiUrl = p["pixAI連結"]?.url || "";
      const _gender  = text(p["性別"]);
      const genders  = _gender ? `<span class="rtw-tag">${esc(_gender)}</span>` : "";

      html += `
<div class="rtw-card">
  <div class="rtw-img">`;
      if (img0) {
        html += `<img src="${esc(img0)}" alt="${name}" loading="lazy">`;
      } else {
        html += `<div class="rtw-img-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>`;
      }
      html += `</div>
  <div class="rtw-body">
    <div class="rtw-name">${name}</div>
    ${genders ? `<div class="rtw-meta">${genders}</div>` : ""}
    <div class="prompt-box" style="margin:.6rem 0 .5rem;"><span class="pt">${prompt}</span><span class="pt-toggle" onclick="togglePt(this)">展開</span><button class="cp-btn" onclick="cp(this,'${prompt}')">COPY</button></div>
    ${pixaiUrl ? `<a href="${esc(pixaiUrl)}" target="_blank" rel="noopener" class="pixai-link">在 pixAI 開啟 <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10L10 2M10 2H5M10 2v5"/></svg></a>` : ""}
  </div>
</div>`;
    }
    html += `</div></div>`;
  });

  return { html, toc };
}
 
async function main() {
  console.log("📦 抓取 Notion 資料...");
  const [archivesPages, atelierPages, rtwPages] = await Promise.all([
    fetchDB(DB.archives),
    fetchDB(DB.atelier),
    fetchDB(DB.rtw),
  ]);
  console.log(`✅ 經典衣櫃：${archivesPages.length} 筆`);
  console.log(`✅ 製衣工坊：${atelierPages.length} 筆`);
  console.log(`✅ 成衣型錄：${rtwPages.length} 筆`);
 
  const { html: archivesHtml, toc: archivesToc, filter: archivesFilter } = buildArchives(archivesPages);
  const { html: rtwHtml, toc: rtwToc } = buildRTW(rtwPages);
  let template = fs.readFileSync("template.html", "utf8");
  template = template
    .replace("<!-- ARCHIVES_CONTENT -->", archivesHtml)
    .replace("<!-- ARCHIVES_TOC -->",     archivesToc)
    .replace("<!-- ARCHIVES_FILTER -->",  archivesFilter)
    .replace("<!-- ATELIER_CONTENT -->",  buildAtelier(atelierPages))
    .replace("<!-- RTW_CONTENT -->",      rtwHtml)
    .replace("<!-- RTW_TOC -->",          rtwToc)
    .replace("<!-- BUILD_TIME -->",       `<!-- built: ${new Date().toISOString()} -->`);
 
  if (!fs.existsSync("dist")) fs.mkdirSync("dist");
  fs.writeFileSync("dist/index.html", template, "utf8");
  console.log("🎉 dist/index.html 產生完成！");
}
 
main().catch(err => { console.error("❌ 錯誤：", err); process.exit(1); });
