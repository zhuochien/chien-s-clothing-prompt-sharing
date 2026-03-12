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

// 01 基礎衣櫃
// 欄位：分類 中文名稱(title) Name Prompt Tags 備註 模型A-E示意圖 發布
function buildArchives(pages) {
  const catMap  = { "經典女裝":"female","經典男裝":"male","民族文化":"ethnic","現代街頭":"street" };
  const codeMap = { "經典女裝":"1.1","經典男裝":"1.2","民族文化":"1.3","現代街頭":"1.4" };
  const groups  = { "經典女裝":[],"經典男裝":[],"民族文化":[],"現代街頭":[] };

  for (const page of pages) {
    const p = page.properties;
    const cat = text(p["分類"]) || "經典女裝";
    if (groups[cat]) groups[cat].push(p);
  }

  let html = "";
  for (const [cat, items] of Object.entries(groups)) {
    if (!items.length) continue;
    html += `<div id="a-${catMap[cat]}" data-acat="${catMap[cat]}">`;
    html += `<div class="sub-label"><span class="sub-code">${codeMap[cat]}</span>${esc(cat)}</div>`;
    html += `<div class="arc-grid">`;

    for (const p of items) {
      const zh = esc(text(p["中文名稱"]));
      const en = esc(text(p["Name"]));
      const prompt = esc(text(p["Prompt Tags"]));
      const img0 = (text(p["模型A示意圖"]) || [])[0] || "";
      html += `<div class="arc-card"><div class="ac-img">${singleImg(img0)}</div><div class="ac-info"><div class="ac-en">${en}</div><div class="ac-zh">${zh}</div><div class="ac-prompt">${prompt}</div></div><div class="ac-foot"><button class="cp-btn" onclick="cp(this,'${prompt}')">COPY</button></div></div>`;
    }
    html += `</div>`;

    if (items.length > 0) {
      const p = items[0];
      const en = esc(text(p["Name"]));
      const prompt = esc(text(p["Prompt Tags"]));
      const imgs = ["模型A示意圖","模型B示意圖","模型C示意圖","模型D示意圖","模型E示意圖"].map(k => (text(p[k]) || [])[0] || "");
      const models = ["Model A","Model B","Model C","Model D","Model E"];
      html += `<div class="amc"><div class="amc-head"><div><div class="amc-title">${en} — 五模型直出對比</div><div class="amc-prompt">${prompt}</div></div><span class="amc-tag t-arc">ARCHIVES</span></div><div class="tg5">`;
      for (let i = 0; i < 5; i++) html += imgCell(imgs[i], models[i]);
      html += `</div><button class="xbtn" onclick="toggleX(this)">展開各模型備註 <span class="ea">▾</span></button><div class="xpanel"><table class="xtable"><thead><tr><th>模型</th><th>圖例</th><th>備註</th></tr></thead><tbody>`;
      for (let i = 0; i < 5; i++) {
        html += `<tr><td><span class="mn">${models[i]}</span></td><td>${imgs[i] ? `<img src="${esc(imgs[i])}" style="width:52px;height:65px;object-fit:cover;border-radius:2px;">` : ""}</td><td class="nt">${i===0 ? esc(text(items[0]["備註"])||"—") : "—"}</td></tr>`;
      }
      html += `</tbody></table></div></div>`;
    }
    html += `</div>`;
  }
  return html;
}

// 02 製衣工廠
// 欄位：分類 中文名稱(title) Name Prompt Tags 備註 發布
function buildAtelier(pages) {
  const modules = {
    "A-01":{ label:"版型分類", tag:"t-sil", tagText:"SILHOUETTE" },
    "A-02":{ label:"面料車間", tag:"t-fab", tagText:"FABRIC" },
    "A-03":{ label:"剪裁工藝", tag:"t-tai", tagText:"TAILORING" },
    "A-04":{ label:"色彩系統", tag:"t-col", tagText:"COLOR LAB" },
    "A-05":{ label:"五金配飾", tag:"t-fin", tagText:"FINDINGS" },
  };
  const groups = {};
  for (const key of Object.keys(modules)) groups[key] = [];

  for (const page of pages) {
    const p = page.properties;
    const mod = text(p["分類"]);
    if (groups[mod]) groups[mod].push(p);
  }

  let html = "";
  for (const [mod, items] of Object.entries(groups)) {
    if (!items.length) continue;
    const { label, tag, tagText } = modules[mod];
    const anchorId = `m-${mod.toLowerCase().replace("-","")}`;
    html += `<div id="${anchorId}" class="cat-group"><div class="cg-head"><span class="cg-title">${mod} ${esc(label)}</span><span class="mtag ${tag}">${tagText}</span><span class="cg-count">${items.length} 詞條</span></div><div class="item-row">`;
    for (const p of items) {
      const zh = esc(text(p["中文名稱"]));
      const en = esc(text(p["Name"]));
      const prompt = esc(text(p["Prompt Tags"]));
      html += `<div class="fi"><div class="fi-img"><div class="fi-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span>示意圖</span></div></div><div class="fi-info"><div class="fi-en">${en}</div><div class="fi-zh">${zh}</div><div class="fi-prompt">${prompt}</div></div><div class="fi-foot"><button class="cp-btn" onclick="cp(this,'${prompt}')">COPY</button></div></div>`;
    }
    html += `</div></div>`;
  }
  return html;
}

// 03 成衣收藏
// 欄位：序號 主題(title) 人數 節日屬性 服裝標籤 發布 Prompt pixAI衣櫃 pixAI連結
function buildRTW(pages) {
  const groups = {};
  for (const page of pages) {
    const p = page.properties;
    const tags = text(p["服裝標籤"]) || [];
    const key = tags[0] || "其他";
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  let html = "";
  let idx = 0;
  for (const [series, items] of Object.entries(groups)) {
    const anchorId = `rtw-s${idx}`;
    const seriesLabel = `系列${["一","二","三","四","五","六","七","八","九","十"][idx] || idx+1}`;
    idx++;
    html += `<div id="${anchorId}" style="margin-top:2.5rem;"><div class="sub-label"><span class="sub-code">${seriesLabel}</span><span style="font-size:.75rem;color:var(--muted);margin-left:.5rem;">${esc(series)}</span></div><div class="card-grid">`;

    for (const p of items) {
      const title   = esc(text(p["主題"]));
      const prompt  = esc(text(p["Prompt"]));
      const imgs    = text(p["pixAI衣櫃"]) || [];
      const pixaiUrl = p["pixAI連結"]?.url || "";
      const people  = (text(p["人數"]) || []).join("、");
      const holiday = (text(p["節日屬性"]) || []).join("、");
      const tagChips = (text(p["服裝標籤"]) || []).map(t => `<span class="wt-chip">${esc(t)}</span>`).join("");
      const models  = ["Model A","Model B","Model C","Model D"];

      html += `<div class="fc"><div class="fc-head"><div class="fc-title">${title}</div><div class="fc-sub">${seriesLabel} · ${esc(series)}</div></div>`;
      html += `<div class="wt-strip"><span class="wt-lbl">TAGS</span>${tagChips}${people ? `<span class="wt-chip">${esc(people)}</span>` : ""}${holiday ? `<span class="wt-chip">${esc(holiday)}</span>` : ""}</div>`;
      html += `<div class="prompt-box"><span class="pt">${prompt}</span><button class="cp-btn" onclick="cp(this,'${prompt}')">COPY</button></div>`;
      if (pixaiUrl) {
        html += `<div style="padding:.4rem 1rem .6rem;"><a href="${esc(pixaiUrl)}" target="_blank" rel="noopener" class="pixai-link">在 pixAI 開啟 <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 10L10 2M10 2H5M10 2v5"/></svg></a></div>`;
      }
      html += `<div class="tg4">`;
      for (let i = 0; i < 4; i++) html += imgCell(imgs[i] || "", models[i]);
      html += `</div><button class="xbtn" onclick="toggleX(this)">展開模型備註 <span class="ea">▾</span></button><div class="xpanel"><table class="xtable"><thead><tr><th>模型</th><th>圖例</th><th>備註</th></tr></thead><tbody>`;
      for (let i = 0; i < 4; i++) {
        html += `<tr><td><span class="mn">${models[i]}</span></td><td>${imgs[i] ? `<img src="${esc(imgs[i])}" style="width:52px;height:65px;object-fit:cover;border-radius:2px;">` : ""}</td><td class="nt">—</td></tr>`;
      }
      html += `</tbody></table></div></div>`;
    }
    html += `</div></div>`;
  }
  return html;
}

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

  let template = fs.readFileSync("template.html", "utf8");
  template = template
    .replace("<!-- ARCHIVES_CONTENT -->", buildArchives(archivesPages))
    .replace("<!-- ATELIER_CONTENT -->",  buildAtelier(atelierPages))
    .replace("<!-- RTW_CONTENT -->",      buildRTW(rtwPages))
    .replace("<!-- BUILD_TIME -->",       `<!-- built: ${new Date().toISOString()} -->`);

  if (!fs.existsSync("dist")) fs.mkdirSync("dist");
  fs.writeFileSync("dist/index.html", template, "utf8");
  console.log("🎉 dist/index.html 產生完成！");
}

main().catch(err => { console.error("❌ 錯誤：", err); process.exit(1); });
