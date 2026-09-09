#!/usr/bin/env node
/**
 * sync-avisos.js
 * ============================================================
 * Complementa sync-web.js: mentre aquell llegeix l'API oberta
 * (horari setmanal estable, contacte), aquest script llegeix les
 * fitxes individuals de cada biblioteca a bibliotecavirtual.diba.cat
 * per capturar els AVISOS PUNTUALS (tancaments d'última hora,
 * alertes meteorològiques, vagues...) que l'API no sempre recull
 * a temps.
 *
 * ⚠️ AVÍS IMPORTANT: aquest script llegeix HTML "de veritat" (no una
 * API estructurada), i s'ha escrit sense poder inspeccionar l'HTML
 * en brut de bibliotecavirtual.diba.cat (només se n'ha vist una
 * versió convertida a Markdown). És a dir: la lògica de
 * parsing és una millor estimació, NO una cosa ja verificada.
 * Executa primer el mode de prova d'una sola biblioteca:
 *
 *   node scripts/sync-avisos.js --test terrassa-biblioteca-central
 *
 * ...i revisa que el text que imprimeix té sentit abans de fer
 * una passada completa amb:
 *
 *   node scripts/sync-avisos.js
 *
 * Passos del procés complet:
 *   1. Descarrega el directori (una sola pàgina llarga amb totes
 *      les biblioteques de la XBM i el seu enllaç individual).
 *   2. Fa coincidir cada entrada del directori amb una biblioteca
 *      del nostre data/biblioteques.json, pel NOM (aquest directori
 *      no dona el codi PI, així que no podem creuar per codi com a
 *      sync-web.js). Els casos ambigus o sense match es llisten a
 *      la consola per revisar-los a mà — mai s'assignen a cegues.
 *   3. Per cada biblioteca amb match, visita la seva fitxa i
 *      n'extreu la secció "Observacions" en text pla.
 *   4. Guarda el resultat a lib.avisos (només si hi ha text real,
 *      no un avís buit o merament genèric).
 *
 * Requereix Node.js 18+ (fetch nadiu). Sense dependències extra.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const DIRECTORY_URL = 'https://bibliotecavirtual.diba.cat/ca/busca-una-biblioteca';
const DATA_PATH = path.join(__dirname, '..', 'data', 'biblioteques.json');

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Normalitza un nom de municipi perquè "L'Hospitalet de Llobregat" i
// "Hospitalet de Llobregat, l'" (formats diferents a API i directori)
// acabin comparant-se iguals.
function normMunicipi(s) {
  let t = stripAccents((s || '').toLowerCase());
  t = t.replace(/,\s*(els|les|el|la|l['’])\s*$/i, ''); // treu l'article final "...,  l'"
  t = t.replace(/^l['’]\s*/i, '');                     // "L'Hospitalet" (apòstrof enganxat, sense espai)
  t = t.replace(/^(els|les|el|la)\s+/i, '');            // "El Masnou", "La Garriga"...
  t = t.replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return t;
}

// Normalitza un nom de biblioteca traient paraules genèriques
// ("Biblioteca", "Bibliobús", "Municipal"...) que sovint sobren
// en un dels dos costats de la comparació.
function normBiblioteca(s) {
  let t = stripAccents((s || '').toLowerCase());
  t = t.replace(/\bbiblioteca\b|\bbibliobus\b|\bmunicipal\b|\bpublica\b/g, ' ');
  t = t.replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return t;
}

function extractRows(directoryHtml) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(directoryHtml))) {
    const rowHtml = trMatch[1];
    const linkRe = /<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
    const links = [];
    let linkMatch;
    while ((linkMatch = linkRe.exec(rowHtml))) {
      const href = linkMatch[1];
      const text = stripHtml(linkMatch[2]);
      if (href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('#')) continue;
      links.push({ href, text });
    }
    // Primer enllaç útil = municipi, segon = biblioteca (l'ordre de columnes del directori).
    const pageLinks = links.filter(l => l.href.includes('bibliotecavirtual.diba.cat'));
    if (pageLinks.length < 2) continue;
    const [municipi, biblioteca] = pageLinks;
    if (!biblioteca.text) continue;
    if (/^bibliob[uú]s/i.test(biblioteca.text)) continue; // bibliobusos: fora d'abast per ara
    rows.push({ municipiText: municipi.text, biblioteca: biblioteca.text, url: biblioteca.href });
  }
  return rows;
}

function matchLibraries(biblioteques, directoryRows) {
  const results = [];
  const ambigües = [];
  const senseMatch = [];

  for (const lib of biblioteques) {
    if (!lib.nom || !lib.nom.includes('. ')) continue; // sense format "Municipi. Biblioteca"
    const [municipiPart, bibliotecaPart] = lib.nom.split(/\.\s+/, 2);
    const wantMunicipi = normMunicipi(municipiPart);
    const wantBiblioteca = normBiblioteca(bibliotecaPart);

    const candidats = directoryRows.filter(r => {
      const rMunicipi = normMunicipi(r.municipiText);
      const rBiblioteca = normBiblioteca(r.biblioteca);
      const municipiOk = rMunicipi === wantMunicipi || rMunicipi.includes(wantMunicipi) || wantMunicipi.includes(rMunicipi);
      const bibliotecaOk = rBiblioteca === wantBiblioteca || (wantBiblioteca.length > 3 && rBiblioteca.includes(wantBiblioteca)) || (rBiblioteca.length > 3 && wantBiblioteca.includes(rBiblioteca));
      return municipiOk && bibliotecaOk;
    });

    if (candidats.length === 1) {
      results.push({ lib, url: candidats[0].url });
    } else if (candidats.length > 1) {
      ambigües.push({ nom: lib.nom, candidats: candidats.map(c => c.url) });
    } else {
      senseMatch.push(lib.nom);
    }
  }
  return { results, ambigües, senseMatch };
}

function extractObservacions(pageHtml) {
  const startMarkers = ['id="library-obsbodyContent"', '>Observacions:<', '>Observacions<'];
  const endMarkers = ['id="library-timetablesbodyContent"', '>Horaris:<', '>Història:<', 'id="library-historybodyContent"'];
  const lower = pageHtml.toLowerCase();

  let startIdx = -1;
  for (const m of startMarkers) {
    const idx = lower.indexOf(m.toLowerCase());
    if (idx !== -1) { startIdx = idx + m.length; break; }
  }
  if (startIdx === -1) return null;

  let endIdx = pageHtml.length;
  for (const m of endMarkers) {
    const idx = lower.indexOf(m.toLowerCase(), startIdx);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }

  const text = stripHtml(pageHtml.slice(startIdx, endIdx));
  if (!text || text.length < 15) return null;
  return text;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} a ${url}`);
  return res.text();
}

async function testOne(slugOrUrl) {
  const url = slugOrUrl.startsWith('http') ? slugOrUrl : `https://bibliotecavirtual.diba.cat/${slugOrUrl}`;
  console.log(`Provant extracció d'avisos a: ${url}\n`);
  const html = await fetchText(url);
  const obs = extractObservacions(html);
  if (obs) {
    console.log('--- OBSERVACIONS EXTRETES ---');
    console.log(obs);
    console.log('-----------------------------');
    console.log('\nSi això té sentit i coincideix amb el que veus a la pàgina, la lògica funciona.');
  } else {
    console.log('No s\'ha trobat cap secció d\'Observacions (o és massa curta / buida).');
    console.log('Els marcadors d\'inici/final probablement no coincideixen amb l\'HTML real d\'aquesta pàgina.');
    console.log('Caldrà ajustar startMarkers/endMarkers a extractObservacions() mirant l\'HTML de la pàgina directament.');
  }
}

async function main() {
  console.log('Descarregant directori de bibliotecavirtual.diba.cat...');
  const directoryHtml = await fetchText(DIRECTORY_URL);
  const rows = extractRows(directoryHtml);
  console.log(`Trobades ${rows.length} files amb enllaç a fitxa individual al directori.`);
  if (rows.length < 100) {
    console.log('\n⚠️  Això sembla pocs resultats per a 254 biblioteques — probablement el regex de files');
    console.log('    no està capturant bé l\'estructura real de la taula. Revisa extractRows() abans de continuar.');
  }

  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const biblioteques = JSON.parse(raw);

  const { results, ambigües, senseMatch } = matchLibraries(biblioteques, rows);
  console.log(`\nMatch trobat per a ${results.length} biblioteques.`);
  if (ambigües.length) {
    console.log(`\n${ambigües.length} amb match ambigu (no assignat, cal revisar a mà):`);
    ambigües.forEach(a => console.log(`  - ${a.nom}: ${a.candidats.join(' | ')}`));
  }
  if (senseMatch.length) {
    console.log(`\n${senseMatch.length} sense cap match al directori:`);
    console.log('  ' + senseMatch.join(', '));
  }

  let ambAvis = 0;
  let processats = 0;
  for (const { lib, url } of results) {
    processats++;
    try {
      const html = await fetchText(url);
      const obs = extractObservacions(html);
      if (obs) {
        lib.avisos = {
          text: obs,
          font: 'bibliotecavirtual.diba.cat',
          url,
          actualitzat: new Date().toISOString().slice(0, 10)
        };
        ambAvis++;
      } else {
        delete lib.avisos;
      }
    } catch (err) {
      console.log(`  Error llegint ${url}: ${err.message}`);
    }
    if (processats % 25 === 0) console.log(`  ...${processats}/${results.length}`);
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(biblioteques, null, 1), 'utf-8');
  console.log(`\nFet. ${ambAvis} biblioteques tenen un avís puntual guardat.`);
}

const arg = process.argv[2];
if (arg === '--test') {
  const target = process.argv[3];
  if (!target) {
    console.error('Ús: node scripts/sync-avisos.js --test <slug-o-url>');
    process.exit(1);
  }
  testOne(target).catch(err => { console.error('Error:', err); process.exit(1); });
} else {
  main().catch(err => { console.error('Error executant sync-avisos.js:', err); process.exit(1); });
}
