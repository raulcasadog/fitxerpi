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
  }catch(err){
    document.getElementById('detail').innerHTML =
      `<div class="empty-state"><div class="glyph">!</div><p>No s'han pogut carregar les dades (${err.message}). Si estàs obrint el fitxer directament des del disc, prova d'executar-lo amb un servidor local o publica'l a GitHub Pages.</p></div>`;
  }
}

function renderHorarisBlock(lib){
  const h = lib.horaris;
  if(!h || !h.web) return '';

  return `
    <div class="horaris-block">
      <a class="web-link" href="${h.web}" target="_blank" rel="noopener">
        <span class="web-link-icon">&#128279;</span>
        <span class="web-link-text">
          <span class="web-link-title">Web oficial de la biblioteca</span>
          <span class="web-link-sub">Horaris actualitzats, activitats i catàleg</span>
        </span>
        <span class="web-link-arrow">&rarr;</span>
      </a>
    </div>
  `;
}

function effectiveStatus(lib){
  // 1. Un tancament manual PERMANENT (estat "tancat" sense data de reobertura coneguda)
  //    sempre té prioritat: no té sentit que el calendari d'estiu li doni una data de
  //    reobertura, perquè no en sabem cap.
  if(lib.estat === 'tancat' && !lib.tancament_fi){
    return {status:'tancat', label:'Tancada'};
  }

  // 2. Calendari de tancaments d'estiu. Si tenim una versió verificada directament a la
  //    web oficial de la biblioteca (tancaments_estiu_web), és més fiable que la extreta
  //    del PDF (tancaments_estiu) i es fa servir primer, sense esborrar mai la del PDF.
  const periodesEstiu = periodesEstiuVigents(lib);
  if(periodesEstiu && periodesEstiu.length){
    for(const periode of periodesEstiu){
      const inici = new Date(periode.inici + 'T00:00:00');
      const fi = new Date(periode.fi + 'T00:00:00');
      if(today >= inici && today <= fi){
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
  if(lib.estat === 'tancat'){
    if(lib.tancament_fi){
      const fi = new Date(lib.tancament_fi + 'T00:00:00');
      if(today > fi){
        return {status:'obert', label:'Oberta', reopened:true};
      }
      return {status:'tancat', label:'Tancada'};
    }
    return {status:'tancat', label:'Tancada'};
  }
  if(lib.estat === 'restringit') return {status:'restringit', label:'Restringida', properaTancament: properTancamentFutur(lib)};
  if(lib.estat === 'no_actiu') return {status:'no_actiu', label:'No activa'};
  return {status:'obert', label:'Oberta', properaTancament: properTancamentFutur(lib)};
}

// Retorna els períodes d'estiu a fer servir: prioritza tancaments_estiu_web (verificat
// directament a la web oficial de la biblioteca) per sobre de tancaments_estiu (del PDF).
function periodesEstiuVigents(lib){
  if(lib.tancaments_estiu_web && lib.tancaments_estiu_web.length) return lib.tancaments_estiu_web;
  return lib.tancaments_estiu || null;
}

// Busca el proper període de tancament d'estiu que encara no ha començat,
// per avisar amb antelació encara que la biblioteca estigui oberta ara mateix.
function properTancamentFutur(lib){
  const periodes = periodesEstiuVigents(lib);
  if(!periodes || !periodes.length) return null;
  const futurs = periodes
    .map(p => ({inici: new Date(p.inici + 'T00:00:00'), fi: new Date(p.fi + 'T00:00:00')}))
    .filter(p => p.inici > today)
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
    .filter(({lib, st}) => st.status !== 'obert' || (lib.observacions && lib.observacions.trim()))
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

function incidenciaMeta(lib, st){
  const fmt = d => d.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'});
  if(st.motiuEstiu){
    const periode = (periodesEstiuVigents(lib) || [])
      .map(p => ({inici: new Date(p.inici+'T00:00:00'), fi: new Date(p.fi+'T00:00:00')}))
      .find(p => today >= p.inici && today <= p.fi);
    if(periode) return `Tancada · torna el ${fmt(periode.fi)}`;
  }
  if(st.status === 'tancat'){
    if(lib.tancament_fi) return `Tancada · torna el ${fmt(new Date(lib.tancament_fi+'T00:00:00'))}`;
    return 'Tancada · data de reobertura no confirmada';
  }
  if(st.status === 'restringit') return 'Restringida · només rep peticions';
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
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
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
  obert:    {stripe:'#3D6B4F', stamp:'#3D6B4F'},
  tancat:   {stripe:'#A13D2E', stamp:'#A13D2E'},
  restringit:{stripe:'#B8862E', stamp:'#B8862E'},
  no_actiu: {stripe:'#8a8a8a', stamp:'#8a8a8a'}
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
    notice = `<div class="notice restricted"><span class="notice-icon">&#10003;</span><span>Havia estat tancada (${lib.observacions}), però la data de tancament ja ha passat.</span></div>`;
  } else if(lib.observacions){
    notice = `<div class="notice restricted"><span class="notice-icon">&#9432;</span><span>${lib.observacions}</span></div>`;
  }

  if(st.properaTancament){
    const fmt = d => d.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'});
    notice += `<div class="notice upcoming"><span class="notice-icon">&#128197;</span><span>Tancarà per vacances d'estiu del ${fmt(st.properaTancament.inici)} al ${fmt(st.properaTancament.fi)}.</span></div>`;
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

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  updateClearBtn();
  resultsEl.classList.remove('show');
  resultsEl.innerHTML = '';
  countTag.textContent = '';
  searchInput.focus();
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

loadData();
