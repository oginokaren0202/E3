// 純文字 → 團錄 HTML（正式網站和後台共用）
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
// [顯示文字](網址) → 連結；只接受 http/https，另開新分頁
const linkify = h => h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

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

function parseDay(txt, chars){
  let title = '', html = '', dice = false;
  const names = Object.keys(chars).sort((a,b) => b.length - a.length);
  let buf = [], blanks = 0;
  // 連續的一般文字行合成一段，保留換行與行首空白
  const flush = () => {
    if (buf.length) html += `<p class="nar">${buf.map(l => linkify(esc(l))).join('\n')}</p>`;
    buf = [];
  };
  for (const raw of (txt||'').split(/\r?\n/)){
    const keep = raw.replace(/\s+$/, '');      // 只去掉行尾空白，行首縮排保留
    const line = keep.trim();
    if (!line) { flush(); blanks++; continue; }
    if (blanks > 1 && html) html += '<div class="gap"></div>'.repeat(blanks - 1);   // 多個空行 → 多留空間
    blanks = 0;
    let m;
    if (!title && (m = line.match(/^#\s+(.+)$/))) { title = m[1]; continue; }
    if ((m = line.match(/^##\s+(.+)$/))) { flush(); html += `<h2 class="scene">${esc(m[1])}</h2>`; continue; }
    if ((m = line.match(/^🎲(!|！)?\s*(\S+)\s+(\S+)\s+(\d+)\s*\/\s*(\d+)\s*(.*)$/u))) {
      flush(); dice = true;
      const key = !!m[1], roll = +m[4], target = +m[5];
      const res = m[6] || (roll <= target ? '成功' : '失敗');
      html += `<p class="roll${key?' key':''}">${key?'<span class="lbl">判定</span>':''}${esc(m[2])}　${esc(m[3])} 1D100 → <strong>${roll}</strong> / ${target}　<span class="res">${esc(res)}</span></p>`;
      continue;
    }
    if ((m = line.match(/^\[圖\]\s*(\S+)\s*(.*)$/))) {
      flush();
      html += `<figure><img src="images/${esc(m[1])}" alt="${esc(m[2])}" loading="lazy">${m[2]?`<figcaption>${esc(m[2])}</figcaption>`:''}</figure>`;
      continue;
    }
    const who = names.find(n => line.startsWith(n + '：') || line.startsWith(n + ':'));
    if (who) {
      flush();
      const c = chars[who], text = line.slice(who.length + 1).trim();
      const av = c.avatar ? `<img class="av" src="images/${esc(c.avatar)}" alt="">` : `<div class="av" aria-hidden="true">${esc([...who][0])}</div>`;
      html += `<div class="say" style="--c:${c.color}">${av}<div><b>${esc(who)}</b><p>${linkify(esc(text))}</p></div></div>`;
      continue;
    }
    buf.push(keep);
  }
  flush();
  return {title, html, dice};
}

function renderDay(label, d){
  return `<header class="day-head"><p class="day-no">${esc(label)}</p><h1>${esc(d.title)}</h1></header><article>${d.html}</article>`;
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
