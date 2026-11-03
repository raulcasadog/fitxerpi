#!/usr/bin/env node
/**
 * resum-avisos.js
 * ============================================================
 * Compara data/biblioteques.json abans i després d'executar
 * sync-avisos.js. Mostra què ha canviat i falla si el resultat
 * no és de fiar, per evitar publicar dades trencades.
 *
 * Ús: node scripts/resum-avisos.js <abans.json> <despres.json>
 *
 * Falla si:
 *   - l'arxiu nou no és un JSON vàlid;
 *   - ha canviat el nombre de biblioteques;
 *   - ha canviat cap camp que no sigui "avisos";
 *   - desapareix més de la meitat dels avisos.
 * ============================================================
 */

const fs = require('fs');

const [abansPath, despresPath] = process.argv.slice(2);
if (!abansPath || !despresPath) {
  console.error('Ús: node scripts/resum-avisos.js <abans.json> <despres.json>');
  process.exit(2);
}

function error(missatge) {
  console.error(`\nERROR: ${missatge}\nNo es publicarà res.`);
  process.exit(1);
}

function llegeix(ruta) {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf-8'));
  } catch (err) {
    return error(`No es pot llegir ${ruta}: ${err.message}`);
  }
}

// Una còpia del registre sense "avisos", per comparar la resta de camps.
function senseAvisos(lib) {
  const { avisos, ...resta } = lib;
  return JSON.stringify(resta);
}

const textAvis = lib => (lib.avisos ? lib.avisos.text : '');

const abans = llegeix(abansPath);
const despres = llegeix(despresPath);

if (!Array.isArray(despres)) error('El resultat no és una llista.');
if (despres.length !== abans.length) {
  error(`Abans hi havia ${abans.length} biblioteques i ara n'hi ha ${despres.length}.`);
}

const perId = new Map(abans.map(lib => [lib.id, lib]));
const nous = [];
const canviats = [];
const eliminats = [];

for (const lib of despres) {
  const anterior = perId.get(lib.id);
  if (!anterior) error(`Hi ha una biblioteca desconeguda: id ${lib.id}.`);
  if (senseAvisos(anterior) !== senseAvisos(lib)) {
    error(`Han canviat altres camps de "${lib.nom}".`);
  }
  const textAbans = textAvis(anterior);
  const textAra = textAvis(lib);
  if (!textAbans && textAra) nous.push(lib);
  else if (textAbans && !textAra) eliminats.push(lib);
  else if (textAbans !== textAra) canviats.push(lib);
}

const totalAbans = abans.filter(textAvis).length;
const totalAra = despres.filter(textAvis).length;

const linies = [
  '## Resum dels avisos',
  '',
  `- Avisos abans: **${totalAbans}**`,
  `- Avisos ara: **${totalAra}**`,
  `- Nous: **${nous.length}**`,
  `- Canviats: **${canviats.length}**`,
  `- Eliminats: **${eliminats.length}**`,
  '',
];

const mostra = (titol, llista) => {
  if (!llista.length) return;
  linies.push(`### ${titol}`, '');
  for (const lib of llista.slice(0, 15)) {
    const text = textAvis(lib).replace(/\s+/g, ' ').slice(0, 220);
    linies.push(`- **${lib.nom}**${text ? `: ${text}` : ''}`);
  }
  if (llista.length > 15) linies.push(`- ...i ${llista.length - 15} més`);
  linies.push('');
};

mostra('Avisos nous', nous);
mostra('Avisos canviats', canviats);
mostra('Avisos eliminats', eliminats);

const resum = linies.join('\n');
console.log(resum);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${resum}\n`);
}

if (totalAbans > 0 && totalAra < totalAbans / 2) {
  error(`Els avisos han baixat de ${totalAbans} a ${totalAra}: segurament la lectura ha fallat.`);
}
