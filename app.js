// ============================================================
// Fitxer PI — lògica de cerca i càlcul d'estat
// Les dades es carreguen des de data/biblioteques.json
// ============================================================

const today = new Date(); today.setHours(0,0,0,0);

let DATA = [];

async function loadData(){
  try{
    const res = await fetch('data/biblioteques.json');
    if(!res.ok) throw new Error('No s\'ha pogut carregar data/biblioteques.json');
    DATA = await res.json();
    renderIncidencies();
    document.getElementById('print-week').disabled = false;
    document.getElementById('print-week-a4').disabled = false;
  }catch(err){
    document.getElementById('detail').innerHTML =
      `<div class="empty-state"><div class="glyph">!</div><p>No s'han pogut carregar les dades (${err.message}). Si estàs obrint el fitxer directament des del disc, prova d'executar-lo amb un servidor local o publica'l a GitHub Pages.</p></div>`;
  }
}

const DIES = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
const DIES_LABEL = {
  dilluns: 'Dilluns', dimarts: 'Dimarts', dimecres: 'Dimecres', dijous: 'Dijous',
  divendres: 'Divendres', dissabte: 'Dissabte', diumenge: 'Diumenge'
};

// Decideix si avui toca l'horari d'hivern o el d'estiu, comparant la
// data d'avui amb les dates d'inici de cada temporada que ens dona
// l'API (camp "inici": {dia, mes}). El període d'estiu és el que va
// des de la seva data d'inici fins just abans que comenci l'hivern.
function horariVigent(lib){
  const h = lib.horaris;
  if(!h) return null;
  const { hivern, estiu } = h;
  if(!estiu) return hivern || null;
  if(!hivern) return estiu;

  const md = (today.getMonth() + 1) * 100 + today.getDate();
  const mdEstiu = estiu.inici ? estiu.inici.mes * 100 + estiu.inici.dia : null;
  const mdHivern = hivern.inici ? hivern.inici.mes * 100 + hivern.inici.dia : null;
  if(mdEstiu == null || mdHivern == null) return hivern;

  if(mdEstiu <= mdHivern){
    return (md >= mdEstiu && md < mdHivern) ? estiu : hivern;
  }
  // Cas estrany (temporada d'estiu a cavall d'any); per seguretat, no hauria de passar mai.
  return (md >= mdEstiu || md < mdHivern) ? estiu : hivern;
}

function renderHorarisBlock(lib){
  const h = lib.horaris;
  if(!h) return '';

  const sched = horariVigent(lib);
  let horariHtml = '';
  if(sched){
    const avuiKey = DIES[today.getDay()];
    const avuiText = (sched[avuiKey] || '').trim() || 'Tancat';
    const files = Object.keys(DIES_LABEL).map(k => `
      <div class="horari-row${k === avuiKey ? ' is-today' : ''}">
        <span class="horari-day">${DIES_LABEL[k]}</span>
        <span class="horari-hours">${(sched[k] || '').trim() || 'Tancat'}</span>
      </div>
    `).join('');
    horariHtml = `
      <div class="horari-avui">
        <span class="horari-avui-label">Avui</span>
        <span class="horari-avui-hores">${avuiText}</span>
      </div>
      <details class="horari-setmana">
        <summary>
          <svg class="horari-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <span class="horari-txt">Veure horari complet de la setmana</span>
          <span class="horari-chev" aria-hidden="true">&#9662;</span>
        </summary>
        <div class="horari-week">${files}</div>
        ${sched.observacions ? `<p class="horari-obs">${sched.observacions}</p>` : ''}
      </details>
    `;
  }

  const contactRows = [];
  if(h.telefon){
    contactRows.push(`<a class="contact-row" href="tel:${h.telefon.replace(/\s+/g,'')}"><span class="contact-icon">&#9742;</span><span>${h.telefon}</span></a>`);
  }
  if(h.email){
    contactRows.push(`<a class="contact-row" href="mailto:${h.email}"><span class="contact-icon">&#9993;</span><span>${h.email}</span></a>`);
  }
  if(h.adreca){
    // Enllaç a Google Maps: es treuen els comentaris entre parèntesis
    // (p. ex. "(antiga fàbrica Alchemika)") perquè no confonguin la cerca.
    const mapsQuery = h.adreca.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;
    contactRows.push(`<a class="contact-row" href="${mapsUrl}" target="_blank" rel="noopener" aria-label="Veure ${h.adreca} a Google Maps (s'obre en una pestanya nova)"><span class="contact-icon">&#128205;</span><span>${h.adreca}</span></a>`);
  }

  const webLink = h.web ? `
    <a class="web-link" href="${h.web}" target="_blank" rel="noopener">
      <span class="web-link-icon">&#128279;</span>
      <span class="web-link-text">
        <span class="web-link-title">Web oficial de la biblioteca</span>
        <span class="web-link-sub">Horaris actualitzats, activitats i catàleg</span>
      </span>
      <span class="web-link-arrow">&rarr;</span>
    </a>
  ` : '';

  if(!horariHtml && !contactRows.length && !webLink) return '';

  return `
    <div class="horaris-block">
      ${horariHtml}
      ${contactRows.length ? `<div class="contact-list">${contactRows.join('')}</div>` : ''}
      ${webLink}
    </div>
  `;
}

function effectiveStatus(lib, ref = today){
  // Un tancament manual només compta a partir de tancament_inici (si n'hi ha), de manera
  // que es pot deixar programat un tancament futur i el PDF setmanal el mostra el dia just.
  const iniciManual = lib.tancament_inici ? new Date(lib.tancament_inici + 'T00:00:00') : null;
  const tancatManual = lib.estat === 'tancat' && !(iniciManual && ref < iniciManual);

  // 1. Un tancament manual PERMANENT (estat "tancat" sense data de reobertura coneguda)
  //    sempre té prioritat: no té sentit que el calendari d'estiu li doni una data de
  //    reobertura, perquè no en sabem cap.
  if(tancatManual && !lib.tancament_fi){
    return {status:'tancat', label:'Tancada'};
  }

  // 2. Calendari de tancaments d'estiu. Si tenim una versió verificada directament a la
  //    web oficial de la biblioteca (tancaments_estiu_web), és més fiable que la extreta
  //    del PDF (tancaments_estiu) i es fa servir primer, sense esborrar mai la del PDF.
  const periodesEstiu = periodesEstiuVigents(lib);
  if(periodesEstiu && periodesEstiu.length){
    for(const periode of periodesEstiu){
      const inici = new Date(periode.inici + 'T00:00:00');
      const iniciEfectiu = diumengePrevi(inici);
      const fi = new Date(periode.fi + 'T00:00:00');
      if(ref >= iniciEfectiu && ref <= fi){
        const fmt = d => d.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'});
        return {
          status:'tancat',
          label:'Tancada',
          motiuEstiu: `Tancada per vacances d'estiu, del ${fmt(inici)} al ${fmt(fi)}.`
        };
      }
    }
  }

  // 3. Estat manual amb data de reobertura coneguda, o altres estats
  if(tancatManual){
    if(lib.tancament_fi){
      const fi = new Date(lib.tancament_fi + 'T00:00:00');
      if(ref > fi){
        return {status:'obert', label:'Oberta', reopened:true};
      }
      return {status:'tancat', label:'Tancada'};
    }
    return {status:'tancat', label:'Tancada'};
  }
  if(lib.estat === 'restringit') return {status:'restringit', label:'Restringida', properaTancament: properTancamentFutur(lib, ref)};
  if(lib.estat === 'no_actiu') return {status:'no_actiu', label:'No activa'};
  return {status:'obert', label:'Oberta', properaTancament: properTancamentFutur(lib, ref)};
}

// Si un tancament comença en dilluns, el diumenge anterior ja es considera tancat
// (moltes biblioteques ja no donen servei en cap de setmana, però com que no sabem
// del cert quines tanquen també el dissabte, només avancem un dia, no dos).
function diumengePrevi(inici){
  if(inici.getDay() === 1){
    const d = new Date(inici);
    d.setDate(d.getDate() - 1);
    return d;
  }
  return inici;
}

// Retorna els períodes d'estiu a fer servir: prioritza tancaments_estiu_web (verificat
// directament a la web oficial de la biblioteca) per sobre de tancaments_estiu (del PDF).
function periodesEstiuVigents(lib){
  if(lib.tancaments_estiu_web && lib.tancaments_estiu_web.length) return lib.tancaments_estiu_web;
  return lib.tancaments_estiu || null;
}

// Busca el proper període de tancament d'estiu que encara no ha començat,
// per avisar amb antelació encara que la biblioteca estigui oberta ara mateix.
function properTancamentFutur(lib, ref = today){
  const periodes = periodesEstiuVigents(lib);
  if(!periodes || !periodes.length) return null;
  const futurs = periodes
    .map(p => ({inici: new Date(p.inici + 'T00:00:00'), fi: new Date(p.fi + 'T00:00:00')}))
    .filter(p => diumengePrevi(p.inici) > ref)
    .sort((a,b) => a.inici - b.inici);
  return futurs.length ? futurs[0] : null;
}

const incidenciesEl = document.getElementById('incidencies');

function truncate(text, max = 70){
  if(!text) return '';
  if(text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

function getIncidencies(){
  return DATA
    .map(l => ({lib: l, st: effectiveStatus(l)}))
    // Una biblioteca que ja ha reobert (tancament_fi passat) deixa de ser incidència.
    .filter(({lib, st}) => !st.reopened && (st.status !== 'obert' || (lib.observacions && lib.observacions.trim())))
    .sort((a, b) => (a.st.status === 'obert' ? 1 : 0) - (b.st.status === 'obert' ? 1 : 0));
}

function motiuTag(lib, st){
  if(lib.motiu) return lib.motiu;
  if(st.motiuEstiu) return "Vacances d'estiu";
  if(st.status === 'tancat') return 'Tancament';
  if(st.status === 'restringit') return 'Restricció PI';
  if(st.status === 'no_actiu') return 'No activa';
  return 'Nota';
}

function incidenciaMeta(lib, st, ref = today){
  const fmt = d => d.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'});
  if(st.motiuEstiu){
    const periode = (periodesEstiuVigents(lib) || [])
      .map(p => ({inici: new Date(p.inici+'T00:00:00'), fi: new Date(p.fi+'T00:00:00')}))
      .find(p => ref >= diumengePrevi(p.inici) && ref <= p.fi);
    if(periode) return `Tancada · torna el ${fmt(periode.fi)}`;
  }
  if(st.status === 'tancat'){
    if(lib.tancament_fi){
      // tancament_fi és l'últim dia tancat: reobre l'endemà.
      const torna = new Date(lib.tancament_fi+'T00:00:00');
      torna.setDate(torna.getDate() + 1);
      return `Tancada · torna el ${fmt(torna)}`;
    }
    return 'Tancada · data de reobertura no confirmada';
  }
  if(st.status === 'restringit'){
    // No totes les restriccions són "només rep": n'hi ha de parcials (p. ex. magatzem).
    if(lib.observacions && /magatzem/i.test(lib.observacions)) return 'Restringida · no serveix documents de magatzem';
    return 'Restringida · només rep peticions';
  }
  if(st.status === 'no_actiu') return 'No activa a la xarxa PI';
  return truncate(lib.observacions, 60);
}

function renderIncidencies(){
  const incidencies = getIncidencies();
  if(!incidencies.length){
    incidenciesEl.innerHTML = '';
    return;
  }
  const rows = incidencies.map(({lib, st}) => `
    <div class="incidencia-row" data-id="${lib.id}">
      <i class="result-dot dot-${st.status}"></i>
      <div>
        <div class="incidencia-name">${lib.nom}</div>
        <div class="incidencia-meta">${incidenciaMeta(lib, st)}</div>
      </div>
      <span class="incidencia-tag">${motiuTag(lib, st)}</span>
    </div>
  `).join('');
  incidenciesEl.innerHTML = `
    <details class="incidencies">
      <summary>
        <span class="incidencies-left">
          Incidències actuals
          <span class="incidencies-badge">${incidencies.length}</span>
        </span>
        <span class="incidencies-hint">Clica per veure <span class="incidencies-chevron"></span></span>
      </summary>
      <div class="incidencies-list">${rows}</div>
    </details>
  `;
}

incidenciesEl.addEventListener('click', (e) => {
  const row = e.target.closest('.incidencia-row');
  if(!row) return;
  const lib = DATA.find(l => l.id == row.dataset.id);
  if(lib){
    renderDetail(lib);
    searchInput.value = lib.nom;
    updateClearBtn();
    detailEl.scrollIntoView({behavior:'smooth', block:'nearest'});
  }
});

const searchInput = document.getElementById('search');
const resultsEl = document.getElementById('results');
const detailEl = document.getElementById('detail');
const countTag = document.getElementById('count-tag');
const clearBtn = document.getElementById('clear-search');

function norm(s){
  let t = (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  // "St." i "Sta." al Fitxer PI venen abreujats a les dades oficials, però la gent
  // sol cercar "Sant"/"Santa" sencer (o a l'inrevés). Normalitzem els dos costats
  // (nom i consulta) a la mateixa forma perquè coincideixin sempre.
  t = t.replace(/\b(st|sta)\.?(?=\s|$)/g, (m, p1) => p1 === 'sta' ? 'santa' : 'sant');
  return t;
}

function updateClearBtn(){
  clearBtn.classList.toggle('show', searchInput.value.length > 0);
}

function renderResults(query){
  updateClearBtn();
  const q = norm(query);
  if(!q){ resultsEl.classList.remove('show'); resultsEl.innerHTML=''; countTag.textContent=''; return; }
  const matches = DATA.filter(l => norm(l.nom).includes(q) || norm(l.codi).includes(q)).slice(0,40);
  countTag.textContent = matches.length ? `${matches.length} resultat${matches.length===1?'':'s'}` : '';
  if(matches.length === 0){
    resultsEl.innerHTML = `<div class="no-results">Cap biblioteca coincideix amb "${query}".</div>`;
    resultsEl.classList.add('show');
    return;
  }
  resultsEl.innerHTML = matches.map(l => {
    const st = effectiveStatus(l);
    return `<div class="result-row" data-id="${l.id}">
      <div class="result-left"><i class="result-dot dot-${st.status}"></i><span class="result-name">${l.nom}</span></div>
      <span class="result-code">${l.codi || '—'}</span>
    </div>`;
  }).join('');
  resultsEl.classList.add('show');
}

const COLORS = {
  obert:    {stripe:'var(--st-obert)', stamp:'var(--st-obert)'},
  tancat:   {stripe:'var(--st-tancat)', stamp:'var(--st-tancat)'},
  restringit:{stripe:'var(--st-restringit)', stamp:'var(--st-restringit)'},
  no_actiu: {stripe:'var(--st-no_actiu)', stamp:'var(--st-no_actiu)'}
};

function renderDetail(lib){
  const st = effectiveStatus(lib);
  const colors = COLORS[st.status];
  let notice = '';
  if(st.motiuEstiu){
    notice = `<div class="notice closed"><span class="notice-icon">&#127774;</span><span>${st.motiuEstiu}</span></div>`;
  } else if(st.status === 'tancat'){
    let txt = lib.observacions || 'Biblioteca tancada.';
    notice = `<div class="notice closed"><span class="notice-icon">&#9888;</span><span>${txt}</span></div>`;
  } else if(st.status === 'restringit'){
    notice = `<div class="notice restricted"><span class="notice-icon">&#9432;</span><span>${lib.observacions}</span></div>`;
  } else if(st.status === 'no_actiu'){
    notice = `<div class="notice inactive"><span class="notice-icon">&#9679;</span><span>Servei no actiu actualment.</span></div>`;
  } else if(st.reopened){
    const torna = new Date(lib.tancament_fi + 'T00:00:00');
    torna.setDate(torna.getDate() + 1);
    const fmtR = d => d.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'});
    notice = `<div class="notice restricted"><span class="notice-icon">&#10003;</span><span>Reoberta el ${fmtR(torna)} després d'un tancament temporal. Ja pot servir PI.</span></div>`;
  } else if(lib.observacions){
    notice = `<div class="notice restricted"><span class="notice-icon">&#9432;</span><span>${lib.observacions}</span></div>`;
  }

  if(st.properaTancament){
    const fmt = d => d.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'});
    notice += `<div class="notice upcoming"><span class="notice-icon">&#128197;</span><span>Tancarà per vacances d'estiu del ${fmt(st.properaTancament.inici)} al ${fmt(st.properaTancament.fi)}.</span></div>`;
  }

  if(lib.avisos && lib.avisos.text){
    notice += `
      <div class="notice avis">
        <span class="notice-icon">&#128276;</span>
        <span>
          ${lib.avisos.text}
          <a class="avis-font" href="${lib.avisos.url}" target="_blank" rel="noopener">Font: bibliotecavirtual.diba.cat &rarr;</a>
        </span>
      </div>
    `;
  }

  detailEl.innerHTML = `
    <div class="card" style="--stripe:${colors.stripe}">
      <div class="card-top">
        <div>
          <div class="card-title">${lib.nom}</div>
          <div class="card-code">Codi PI: <b>${lib.codi || '— (sense codi)'}</b></div>
        </div>
        <div class="stamp" style="--stamp-color:${colors.stamp}"><span class="stamp-dot"></span>${st.label}</div>
      </div>
      ${notice}
      ${renderHorarisBlock(lib)}
      <div class="card-meta">
        <div>
          <div class="meta-label">Valises</div>
          <div class="meta-value">${lib.valises !== null ? lib.valises : '—'}</div>
        </div>
        <div>
          <div class="meta-label">Freqüència de recollida</div>
          <div class="meta-value">${lib.freq}</div>
        </div>
        <div>
          <div class="meta-label">Consultat el</div>
          <div class="meta-value mono">${today.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit', year:'numeric'})}</div>
        </div>
      </div>
    </div>
  `;
}

searchInput.addEventListener('input', (e) => renderResults(e.target.value));
searchInput.addEventListener('focus', (e) => { if(e.target.value) renderResults(e.target.value); });

// Deixa la pàgina com acabada d'obrir: sense cerca, resultats ni fitxa de detall.
function resetCerca(){
  searchInput.value = '';
  updateClearBtn();
  resultsEl.classList.remove('show');
  resultsEl.innerHTML = '';
  countTag.textContent = '';
  detailEl.innerHTML = '';
}

clearBtn.addEventListener('click', () => {
  resetCerca();
  searchInput.focus();
});

// Clicar "Fitxer PI" a la capçalera torna a l'inici sense recarregar.
// L'enllaç (href="./") és la reserva si el JavaScript falla.
document.getElementById('home-link').addEventListener('click', (e) => {
  if(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // nova pestanya, etc.
  e.preventDefault();
  resetCerca();
  incidenciesEl.querySelector('details')?.removeAttribute('open');
  window.scrollTo({top: 0, behavior: 'smooth'});
});

resultsEl.addEventListener('click', (e) => {
  const row = e.target.closest('.result-row');
  if(!row) return;
  const lib = DATA.find(l => l.id == row.dataset.id);
  if(lib){
    renderDetail(lib);
    resultsEl.classList.remove('show');
    searchInput.value = lib.nom;
    updateClearBtn();
    detailEl.scrollIntoView({behavior:'smooth', block:'nearest'});
  }
});

document.addEventListener('click', (e) => {
  if(!e.target.closest('.search-wrap') && !e.target.closest('#results')){
    resultsEl.classList.remove('show');
  }
});

// ============================================================
// Full setmanal imprimible: biblioteques on no es pot demanar PI
// ------------------------------------------------------------
// Es genera al moment amb la mateixa lògica d'estat que la resta del web
// (effectiveStatus amb una data de referència per a cada dia) i s'imprimeix
// amb window.print(): l'usuari tria "Desa com a PDF". Sense llibreries.
// ============================================================

const SHEET_SYMBOL = {
  tancat:     {glyph:'■', title:'Tancada'},
  restringit: {glyph:'▲', title:'Restringida'},
  no_actiu:   {glyph:'✕', title:'No activa'}
};
const DIES_CURTS = ['Dg', 'Dl', 'Dm', 'Dc', 'Dj', 'Dv', 'Ds'];

// Dilluns a divendres de la setmana actual. En cap de setmana, la setmana vinent.
function setmanaLaborable(ref = today){
  const dilluns = new Date(ref);
  const dow = ref.getDay();
  dilluns.setDate(ref.getDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
  return [0, 1, 2, 3, 4].map(i => {
    const d = new Date(dilluns);
    d.setDate(dilluns.getDate() + i);
    return d;
  });
}

function escHtml(t){
  return String(t ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// Nom compacte per al full: municipi en negreta i la biblioteca al costat, sense
// repeticions ("Biblioteca Municipal de…"). Barcelona s'abreuja a BCN, com a Sierra.
function nomFull(nom){
  if(/^Bibliob[uú]s - /.test(nom)) return {municipi: 'Bibliobús', branca: nom.replace(/^Bibliob[uú]s - /, '')};
  // El primer ". " separa municipi i biblioteca, però no el de "St." / "Sta."
  const m = nom.match(/^((?:Sta?\. )?[^.]+)\. (.+)$/);
  if(!m) return {municipi: nom, branca: ''};
  let municipi = m[1], branca = m[2];
  if(municipi === 'Barcelona'){
    municipi = 'BCN';
    branca = branca.split('-')[0];
  }
  branca = branca
    .replace(/^Biblioteca (Municipal|Pública)( de [^,]+)?$/i, '')
    .replace(/^Biblioteca (Municipal |Pública )?/i, '')
    .trim();
  if(branca.toLowerCase() === 'biblioteca') branca = '';
  return {municipi, branca};
}

function filesSetmana(dies){
  return DATA
    .map(lib => {
      const estats = dies.map(d => effectiveStatus(lib, d));
      const primer = estats.findIndex(st => st.status !== 'obert');
      if(primer === -1) return null;
      const st = estats[primer];
      // A la taula el símbol ja diu si és tancada o restringida: només en deixem el detall.
      const meta = incidenciaMeta(lib, st, dies[primer]).replace(/^(Tancada|Restringida) · /, '');
      return {lib, estats, motiu: motiuTag(lib, st), meta, nom: nomFull(lib.nom)};
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Per codi PI (com a Sierra); les que no en tenen, al final per nom.
      const ca = a.lib.codi || '￿', cb = b.lib.codi || '￿';
      return ca.localeCompare(cb, 'ca') || a.lib.nom.localeCompare(b.lib.nom, 'ca');
    });
}

// Fitxa petita (A6 apaïsat, 14,8 × 10,5 cm) dins d'un full A4, amb línia de tall,
// per retallar-la i tenir-la al costat de l'ordinador. Dues llistes: per codi i per municipi.
function etiquetaFull(f){
  const st = f.estats.find(s => s.status === 'tancat') || f.estats.find(s => s.status !== 'obert');
  let tag;
  if(st.status === 'tancat') tag = 'Tancada';
  else if(st.status === 'no_actiu') tag = 'No activa';
  else if(/magatzem/i.test(f.lib.observacions || '')) tag = 'No magatzem';
  else tag = 'Només rep';
  return {status: st.status, tag, parcial: f.estats.some(s => s.status === 'obert')};
}

function renderFullSetmanal(gran = false){
  const dies = setmanaLaborable();
  const fmtCurt = d => d.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'});
  const mes = d => d.toLocaleDateString('ca-ES', {month:'short'}).replace('.', '');
  const any = dies[4].getFullYear();
  const rang = dies[0].getMonth() === dies[4].getMonth()
    ? `${dies[0].getDate()}–${dies[4].getDate()} ${mes(dies[4])} ${any}`
    : `${dies[0].getDate()} ${mes(dies[0])} – ${dies[4].getDate()} ${mes(dies[4])} ${any}`;

  // Només les que tenen codi PI: sense codi no es poden demanar igualment.
  const files = filesSetmana(dies)
    .filter(f => f.lib.codi)
    .map(f => ({...f, et: etiquetaFull(f)}));
  const clauMun = f => f.nom.municipi === 'BCN' ? 'Barcelona' : f.nom.municipi;
  const perMunicipi = [...files].sort((a, b) =>
    clauMun(a).localeCompare(clauMun(b), 'ca') || a.nom.branca.localeCompare(b.nom.branca, 'ca'));

  const fila = ({lib, nom, et}) => `
    <tr>
      <td class="fp-codi">${escHtml(lib.codi)}</td>
      <td class="fp-nom"><b>${escHtml(nom.municipi)}</b>${nom.branca ? ` ${escHtml(nom.branca)}` : ''}</td>
      <td class="fp-tag fp-${et.status}"><i>${SHEET_SYMBOL[et.status].glyph}</i>${escHtml(et.tag)}${et.parcial ? '*' : ''}</td>
    </tr>`;
  const llista = (titol, ll) => `
    <div class="fp-col">
      <h3>${titol}</h3>
      <table class="fp-taula"><tbody>${ll.map(fila).join('')}</tbody></table>
    </div>`;

  const cos = files.length
    ? `<div class="fp-cols">${llista('Per codi', files)}${llista('Per municipi', perMunicipi)}</div>`
    : `<p class="fp-buit">Cap incidència prevista aquesta setmana: totes les biblioteques accepten PI.</p>`;

  const generat = new Date().toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit', year:'2-digit'});
  const asterisc = files.some(f => f.et.parcial) ? ' · * no tota la setmana' : '';

  document.getElementById('full-pi').innerHTML = `
    <div class="fp-fitxa">
      <header class="fp-head">
        <h2>Biblioteques sense PI</h2>
        <span>${rang}</span>
      </header>
      ${cos}
      <p class="fp-nota">■ Tancada · ▲ Només rep peticions, no en serveix (o no serveix el magatzem)${asterisc} · fitxerpi.cat · ${generat}</p>
    </div>
    ${gran ? '' : '<p class="fp-tall">✂ Retalla per la línia de punts</p>'}
  `;
  document.getElementById('full-pi').classList.toggle('fp-gran', gran);

  return `Biblioteques sense PI - setmana del ${fmtCurt(dies[0]).replace('/', '-')}-${any}`;
}

let titolOriginal = document.title;

function imprimirFull(gran){
  if(!DATA.length) return;
  titolOriginal = document.title;
  // El títol del document és el nom de fitxer que proposa "Desa com a PDF".
  document.title = renderFullSetmanal(gran) + (gran ? ' (A4)' : '');
  document.body.classList.add('print-pi');
  window.print();
}

document.getElementById('print-week').addEventListener('click', () => imprimirFull(false));
document.getElementById('print-week-a4').addEventListener('click', () => imprimirFull(true));

window.addEventListener('afterprint', () => {
  if(!document.body.classList.contains('print-pi')) return;
  document.body.classList.remove('print-pi');
  document.title = titolOriginal;
});

loadData();
