// 純文字 → 團錄 HTML
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');

// ===== 行內語法 =====
function inline(raw){
  const keep = [];
  const hold = h => `\u0001${keep.push(h) - 1}\u0002`;
  let t = raw;
  // \符號 → 顯示符號本身
  t = t.replace(/\\([\\*~_=|{}\[\]#>\/-])/g, (_, c) => hold(esc(c)));
  t = esc(t);
  // 連結 [文字](網址)
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, a, u) => hold(`<a href="${u}" target="_blank" rel="noopener">${fmt(a)}</a>`));
  t = fmt(t);
  return t.replace(/\u0001(\d+)\u0002/g, (_, i) => keep[i]);
}
function fmt(t){
  return t
    .replace(/\{([^{}|]+)\|([^{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>')                  // {漢字|讀音}
    .replace(/\[色=(#[0-9a-fA-F]{3,8})\]([\s\S]+?)\[\/色\]/g, '<span style="color:$1">$2</span>')
    .replace(/\[大\]([\s\S]+?)\[\/大\]/g, '<span class="big">$1</span>')
    .replace(/\[小\]([\s\S]+?)\[\/小\]/g, '<span class="small">$1</span>')
    .replace(/\[置中\]([\s\S]+?)\[\/置中\]/g, '<span class="center">$1</span>')
    .replace(/\[靠右\]([\s\S]+?)\[\/靠右\]/g, '<span class="right">$1</span>')
    .replace(/\|\|([\s\S]+?)\|\|/g, '<span class="spoiler" tabindex="0" title="點擊顯示">$1</span>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][\s\S]*?)\*/g, '<em>$1</em>')
    .replace(/~~([\s\S]+?)~~/g, '<del>$1</del>')
    .replace(/__([\s\S]+?)__/g, '<u>$1</u>')
    .replace(/==([\s\S]+?)==/g, '<mark>$1</mark>');
}

function parseSetting(txt){
  const s = {title:'', desc:'', chars:{}};
  let inChars = false;
  for (let line of (txt||'').split(/\r?\n/)){
    line = line.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^標題[：:]\s*(.*)$/))) { s.title = m[1]; inChars = false; continue; }
    if ((m = line.match(/^簡介[：:]\s*(.*)$/))) { s.desc = m[1]; inChars = false; continue; }
    if (/^角色[：:]\s*$/.test(line)) { inChars = true; continue; }
    if (inChars){
      const p = line.split(/\s+/);
      s.chars[p[0]] = {
        color: p.find(x => /^#[0-9a-f]{3,8}$/i.test(x)) || '#6B6F66',
        avatar: p.find(x => /\.(png|jpe?g|gif|webp|svg)$/i.test(x)) || ''
      };
    }
  }
  return s;
}


// 同一行裡同時有 [置中] 和 [靠右]：排成一列，置中的在中間、其他的靠右
// 文章第一行只有 [靠右]（例如只有日期）也排成一列，音樂按鈕才能和它同一行
function rowify(line, first){
  const h = inline(line);
  const hasC = h.includes('class="center"'), hasR = h.includes('class="right"');
  return ((hasC && hasR) || (first && hasR)) ? `<span class="row">${h}</span>` : h;
}
// 自成一塊的行（置中、靠右、並列）前後不再多加換行，避免多出空行
const isBlock = h => /^<span class="(center|right|row)"/.test(h) && h.endsWith('</span>');
function joinLines(arr){
  return arr.map((h, i) => (i && !isBlock(h) && !isBlock(arr[i-1]) ? '\n' : '') + h).join('');
}

function parseDay(txt, chars){
  let title = '', html = '', bgm = [];
  const names = Object.keys(chars).sort((a,b) => b.length - a.length);
  let buf = [], quote = [], blanks = 0;
  const flush = () => {
    if (buf.length) html += `<p class="nar">${joinLines(buf.map((l, i) => rowify(l, !html && i === 0)))}</p>`;
    if (quote.length) html += `<blockquote>${quote.map(inline).join('\n')}</blockquote>`;
    buf = []; quote = [];
  };
  for (const raw of (txt||'').split(/\r?\n/)){
    const keepLine = raw.replace(/\s+$/, '');
    const line = keepLine.trim();
    if (!line) { flush(); blanks++; continue; }
    if (line.startsWith('//')) continue;                                   // 註解，不顯示
    { const ma = line.match(/^\[出現於\]\s*(.+)$/); if (ma) { flush(); html += `<p class="nar appears" data-src="${esc(ma[1].trim())}">出現於：</p>`; continue; } }   // 自動列出用到這些音檔的篇
    { const mb = line.match(/^\[音樂\]\s*(\S+)(?:\s+(\d{1,3})\s*[%％])?$/); if (mb) { bgm.push({src: mb[1], vol: mb[2] ? Math.min(100, +mb[2]) / 100 : 1}); continue; } }   // 音樂，不顯示
    if (blanks > 1 && html) html += '<div class="gap"></div>'.repeat(blanks - 1);
    blanks = 0;
    let m;
    if (!title && (m = line.match(/^#\s+(.+)$/))) { title = m[1]; continue; }
    if ((m = line.match(/^##\s+(.+)$/))) { flush(); html += `<h2 class="scene">${inline(m[1])}</h2>`; continue; }
    if (/^-{3,}$/.test(line)) { flush(); html += '<hr>'; continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { if (buf.length) { html += `<p class="nar">${joinLines(buf.map((l, i) => rowify(l, !html && i === 0)))}</p>`; buf = []; } quote.push(m[1]); continue; }
    if (quote.length) flush();
    if ((m = line.match(/^\[(圖|小圖)\]\s*(\S+)\s*(.*)$/))) {
      flush();
      html += `<figure${m[1]==='小圖'?' class="sm"':''}><img src="images/${esc(m[2])}" alt="${esc(m[3].replace(/[*_~=|]/g, ''))}" loading="lazy">${m[3]?`<figcaption>${inline(m[3])}</figcaption>`:''}</figure>`;
      continue;
    }
    const who = names.find(n => new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([（(][^）)]*[）)])?[：:]').test(line));
    if (who) {
      flush();
      const mm = line.slice(who.length).match(/^([（(][^）)]*[）)])?[：:]\s*([\s\S]*)$/);
      const note = mm[1] ? `<span class="note">${esc(mm[1])}</span>` : '';
      const c = chars[who];
      const av = c.avatar ? `<img class="av" src="images/${esc(c.avatar)}" alt="">` : `<div class="av" aria-hidden="true">${esc([...who][0])}</div>`;
      html += `<div class="say" style="--c:${c.color}">${av}<div><b>${esc(who)}${note}</b><p>${inline(mm[2])}</p></div></div>`;
      continue;
    }
    buf.push(keepLine);
  }
  flush();
  return {title, html, bgm};
}

const BGM_BTN = '<button class="bgm" type="button" aria-label="播放音樂"><svg class="i-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg><svg class="i-pause" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg><span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></button>';
function renderDay(label, d){
  let body = d.html;
  if (d.bgm && d.bgm.length) {
    // 有「事件｜日期」那種並列行 → 按鈕放在最左；沒有 → 放在文章開頭靠左
    body = body.includes('<span class="row">')
      ? body.replace('<span class="row">', '<span class="row">' + BGM_BTN)
      : `<p class="bgm-solo">${BGM_BTN}</p>` + body;
  }
  return `<header class="day-head"><p class="day-no">${esc(label)}</p><h1>${esc(d.title)}</h1></header><article>${body}</article>`;
}

// 目錄.txt：每行「顯示名稱 檔名.txt」，檔名是最後一段
function parseToc(txt){
  const list = [];
  for (const raw of (txt||'').split(/\r?\n/)){
    const line = raw.trim();
    const m = line.match(/^(.*?)[\s\u3000]+(\S+\.txt)$/i);
    if (m) list.push({label: m[1].trim(), file: m[2], id: m[2].replace(/\.txt$/i, '')});
  }
  return list;
}

function renderCover(s){
  const cast = Object.entries(s.chars).map(([k,v]) => `<span style="--c:${v.color}">${esc(k)}</span>`).join('');
  return `<header class="cover"><h1>${esc(s.title)}</h1>${s.desc?`<p>${esc(s.desc)}</p>`:''}<div class="cast">${cast}</div></header>`;
}
