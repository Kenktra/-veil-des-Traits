'use strict';
/* =====================================================================
   ÉVEIL DES TRAITS — script.js
   Sommaire :
   1 Utilitaires · 2 Données · 3 État & sauvegarde · 4 Stats & objets
   5 Traits / titres / succès / quêtes · 6 Compétences · 7 Combat
   8 Exploration / donjons / événements · 9 Compagnons / artisanat / marché
   10 Interface

   Communication entre systèmes : chaque action appelle bump(compteur)
   puis Game.sync() qui vérifie traits, titres, succès, quêtes,
   sauvegarde et redessine l'interface. Le moteur n'accède jamais au DOM :
   il passe par l'objet Hooks (défini dans la partie Interface).
   ===================================================================== */

/* ---------- 1. UTILITAIRES ---------- */
const $ = (s, r = document) => r.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Math.round(n).toLocaleString('fr-FR');
const pc = v => Math.round(v * 100);
const chance = p => Math.random() < p;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let _uid = 0;
const uid = () => 'x' + Date.now().toString(36) + (_uid++).toString(36) + rint(0, 1679615).toString(36);
const today = () => new Date().toISOString().slice(0, 10);
function wpick(arr, wf) {
  const t = arr.reduce((s, x) => s + wf(x), 0);
  let r = Math.random() * t;
  for (const x of arr) { r -= wf(x); if (r <= 0) return x; }
  return arr[arr.length - 1];
}

/* ---------- 2. DONNÉES ---------- */
const MAXLVL = 250;
const xpNeeded = l => Math.floor(50 * Math.pow(l, 1.75));
// Réduction de dégâts : dépend du niveau pour rester pertinente à tous les paliers
const mitig = (def, lvl) => { const K = 60 + lvl * 12; return K / (K + Math.max(0, def)); };

const RARITIES = [
  { id: 'common', n: 'Commune', c: '#9aa0a6', w: 600, m: 1, p: 1, aff: 0 },
  { id: 'uncommon', n: 'Peu commune', c: '#5fbf6a', w: 250, m: 1.25, p: 1.8, aff: 1 },
  { id: 'rare', n: 'Rare', c: '#4a90e2', w: 100, m: 1.6, p: 3.5, aff: 2 },
  { id: 'epic', n: 'Épique', c: '#a463f2', w: 35, m: 2.1, p: 7, aff: 3 },
  { id: 'legendary', n: 'Légendaire', c: '#f0a030', w: 10, m: 2.8, p: 16, aff: 3 },
  { id: 'mythic', n: 'Mythique', c: '#ff4d6d', w: 3, m: 3.8, p: 40, aff: 4 },
  { id: 'secret', n: 'Secrète', c: '#3de0ff', w: 0.4, m: 5, p: 120, aff: 4 }
];
function rollRarity(luck = 0, min = 0) {
  const ws = RARITIES.map((r, i) => i < min ? 0 : r.w * (i >= 2 ? 1 + luck * (i - 1) : 1));
  let x = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return i; }
  return min;
}

const STAT_LABEL = { atk: 'Attaque', def: 'Défense', hp: 'PV', mp: 'Mana', spd: 'Vitesse', crit: 'Critique %', dodge: 'Esquive %', str: 'Force', int: 'Intelligence', agi: 'Agilité', end: 'Endurance' };
const STAT_POOL = ['hp', 'mp', 'str', 'int', 'agi', 'end', 'spd', 'crit', 'dodge', 'def', 'atk'];
const AFF = { str: .18, int: .18, agi: .18, end: .18, hp: 1.8, mp: .9, spd: .07, crit: .06, dodge: .04, def: .5, atk: .5 };
const EQ_SLOTS = ['weapon', 'off', 'head', 'chest', 'hands', 'legs', 'feet', 'acc1', 'acc2'];
const SLOT_NAME = { weapon: 'Arme principale', off: 'Arme secondaire', head: 'Casque', chest: 'Plastron', hands: 'Gants', legs: 'Jambières', feet: 'Bottes', acc1: 'Accessoire', acc2: 'Anneau' };
const TYPE_NAME = { weapon: 'Arme principale', off: 'Arme secondaire', head: 'Casque', chest: 'Plastron', hands: 'Gants', legs: 'Jambières', feet: 'Bottes', acc: 'Accessoire / anneau' };
const MAGIC_CATS = ['staff', 'wand', 'tome'];
const CAT_NAME = { sword: 'Épée', axe: 'Hache', mace: 'Masse', dagger: 'Dague', staff: 'Bâton', wand: 'Baguette', tome: 'Grimoire', bow: 'Arc', crossbow: 'Arbalète', spear: 'Lance', scythe: 'Faux', shield: 'Bouclier', orb: 'Orbe', quiver: 'Carquois', charm: 'Talisman' };

const ITEM_BASES = {
  weapon: [
    { n: 'Épée', cat: 'sword', i: '🗡️', main: { atk: 1.2 }, bias: ['str', 'crit'] },
    { n: 'Hache', cat: 'axe', i: '🪓', main: { atk: 1.35 }, bias: ['str', 'hp'] },
    { n: 'Masse', cat: 'mace', i: '🔨', main: { atk: 1.25 }, bias: ['end', 'def'] },
    { n: 'Dague', cat: 'dagger', i: '🔪', main: { atk: 1.0 }, bias: ['agi', 'crit'] },
    { n: 'Bâton', cat: 'staff', i: '🪄', main: { atk: 1.1 }, bias: ['int', 'mp'] },
    { n: 'Baguette', cat: 'wand', i: '✨', main: { atk: 1.0 }, bias: ['int', 'spd'] },
    { n: 'Grimoire', cat: 'tome', i: '📖', main: { atk: 1.05 }, bias: ['int', 'mp'] },
    { n: 'Arc', cat: 'bow', i: '🏹', main: { atk: 1.15 }, bias: ['agi', 'crit'] },
    { n: 'Arbalète', cat: 'crossbow', i: '🎯', main: { atk: 1.25 }, bias: ['agi', 'hp'] },
    { n: 'Lance', cat: 'spear', i: '🔱', main: { atk: 1.2 }, bias: ['str', 'spd'] },
    { n: 'Faux', cat: 'scythe', i: '⚰️', main: { atk: 1.2 }, bias: ['int', 'crit'] }],
  off: [
    { n: 'Bouclier', cat: 'shield', i: '🛡️', main: { def: 1.0 }, bias: ['end', 'hp'] },
    { n: 'Orbe', cat: 'orb', i: '🔮', main: { atk: .45 }, bias: ['int', 'mp'] },
    { n: 'Carquois', cat: 'quiver', i: '🎒', main: { atk: .45 }, bias: ['agi', 'crit'] },
    { n: 'Talisman', cat: 'charm', i: '📿', main: { def: .5 }, bias: ['dodge', 'hp'] }],
  head: [
    { n: 'Casque', i: '⛑️', main: { def: .65 }, bias: ['hp', 'end'] },
    { n: 'Capuche', i: '🧢', main: { def: .4 }, bias: ['agi', 'dodge'] },
    { n: 'Couronne', i: '👑', main: { def: .4 }, bias: ['int', 'mp'] }],
  chest: [
    { n: 'Plastron', i: '🦺', main: { def: 1.1 }, bias: ['hp', 'end'] },
    { n: 'Robe', i: '👘', main: { def: .6 }, bias: ['int', 'mp'] },
    { n: 'Cuirasse légère', i: '🥋', main: { def: .8 }, bias: ['agi', 'dodge'] }],
  hands: [
    { n: 'Gantelets', i: '🧤', main: { def: .45, atk: .2 }, bias: ['str', 'crit'] },
    { n: 'Gants', i: '🧤', main: { def: .3, atk: .3 }, bias: ['agi', 'int'] }],
  legs: [
    { n: 'Jambières', i: '👖', main: { def: .7 }, bias: ['hp', 'end'] },
    { n: 'Pantalon', i: '👖', main: { def: .45 }, bias: ['agi', 'spd'] }],
  feet: [
    { n: 'Bottes', i: '🥾', main: { def: .45 }, bias: ['spd', 'end'] },
    { n: 'Sandales', i: '🩴', main: { def: .25 }, bias: ['spd', 'dodge'] }],
  acc: [
    { n: 'Anneau', i: '💍', main: {}, bias: ['crit', 'str'] },
    { n: 'Amulette', i: '🧿', main: {}, bias: ['hp', 'int'] },
    { n: 'Cape', i: '🧣', main: {}, bias: ['dodge', 'agi'] }]
};
const TIERS = [[1, 'du Novice'], [5, 'de Fer'], [11, 'd’Acier'], [18, 'de Mithril'], [26, 'd’Obsidienne'], [34, 'de Cristal'], [43, 'de l’Éclipse']];
const EPITHETS = ['du Loup', 'de la Tempête', 'des Cendres', 'de l’Aube', 'du Vide', 'des Cimes', 'du Serpent', 'de la Nuit'];
const LEG_NAMES = ['Croc d’Hiver', 'Aube-Fendue', 'Mémoire d’Étoile', 'Soupir du Dragon', 'Veilleur d’Ambre', 'Serment Brisé', 'Dernier Matin', 'Cœur de Braise'];
const MYTH_NAMES = ['Fin des Âges', 'Voix du Néant', 'Couronne de Cendres', 'Songe Éternel', 'Rédemption Pourpre'];
const SEC_NAMES = ['Fragment d’Éveil', 'Murmure Interdit', 'Éclat Sans Nom', 'Souffle Originel'];
const FLAVOR = {
  weapon: ['Son fil garde la mémoire de mille combats.', 'Un équilibre parfait, une promesse de victoire.', 'On dit qu’elle chante lorsque le danger approche.'],
  off: ['Un compagnon fidèle dans la tourmente.', 'Il répond au moindre geste de son porteur.', 'Usé par le voyage, mais toujours fiable.'],
  def: ['Fabriqué pour durer, façonné pour protéger.', 'Chaque éraflure raconte une histoire.', 'Plus léger qu’il n’y paraît.']
};

/* Effets d'objets (clés identiques à celles des traits) */
const FX = {
  m_vamp: { n: 'Mordant', d: '+2 % de vol de vie', eff: { lifesteal: .02 } },
  m_xp: { n: 'Érudit', d: '+4 % d’XP', eff: { xpPct: .04 } },
  m_gold: { n: 'Cupide', d: '+6 % d’or', eff: { goldPct: .06 } },
  m_guard: { n: 'Protecteur', d: '−3 % de dégâts subis', eff: { dmgTakenPct: -.03 } },
  vampire: { n: 'Vampirisme', d: 'Soigne 7 % des dégâts infligés', eff: { lifesteal: .07 } },
  thorns: { n: 'Épines', d: 'Renvoie 20 % des dégâts subis', eff: { thorns: .2 } },
  bleeder: { n: 'Lames saignantes', d: '25 % de chance de faire saigner', eff: { hitBleed: .25 } },
  burner: { n: 'Flamme vive', d: '25 % de chance de brûler', eff: { hitBurn: .25 } },
  froster: { n: 'Givre mordant', d: '15 % de chance de geler', eff: { hitFreeze: .15 } },
  venom: { n: 'Venin vif', d: '30 % de chance d’empoisonner', eff: { hitPoison: .3 } },
  arcane: { n: 'Surcharge arcanique', d: '+18 % de dégâts de compétence', eff: { skillPct: .18 } },
  wealth: { n: 'Faveur de l’or', d: '+25 % d’or', eff: { goldPct: .25 } },
  scholar: { n: 'Mémoire ancienne', d: '+15 % d’XP', eff: { xpPct: .15 } },
  lucky: { n: 'Étoile du hasard', d: '+30 % de chance de butin rare', eff: { lootLuck: .3 } },
  swift: { n: 'Pas du vent', d: '+5 vitesse, agit toujours en premier', eff: { spdFlat: 5, firstStrike: true } },
  bulwark: { n: 'Rempart', d: '−10 % de dégâts subis, +5 % défense', eff: { dmgTakenPct: -.1, defPct: .05 } },
  flow: { n: 'Flux de mana', d: '+4 mana par tour', eff: { mpRegen: 4 } },
  godslayer: { n: 'Tueur de dieux', d: '+30 % de dégâts contre les boss', eff: { dmgBossPct: .3 } },
  soulreaper: { n: 'Faucheur d’âmes', d: '+12 mana par victime, +30 % invocations, 4 % de vol de vie', eff: { onKillMp: 12, summonPct: .3, lifesteal: .04 } },
  phoenix: { n: 'Cendres du phénix', d: 'Survit à un coup fatal (1×/combat), +10 % PV après combat', eff: { revive: true, regenPost: .1 } },
  tempest: { n: 'Tempête', d: '12 % de tour supplémentaire, +5 % critique', eff: { extraTurn: .12, critFlat: 5 } },
  titan: { n: 'Force du titan', d: '+15 % PV, +10 % défense', eff: { hpPct: .15, defPct: .1 } },
  execution: { n: 'Sentence', d: 'Finisseur dès 45 % de PV, +40 % dégâts critiques', eff: { finTh: .15, critDmg: .4 } },
  voidheart: { n: 'Cœur du Néant', d: 'Survit à un coup fatal avec 1 PV (1×/combat) — compte comme « Dernier rempart »', eff: { revive: true, dmgTakenPct: -.05 } },
  timeworn: { n: 'Temps distordu', d: '12 % de chance d’agir deux fois, +4 vitesse', eff: { extraTurn: .12, spdFlat: 4 } },
  eveil_fx: { n: 'Éclat d’Éveil', d: '+10 % aux stats principales et +10 % d’XP', eff: { allPct: .1, xpPct: .1 } },
  devourer: { n: 'Faim du Dévoreur', d: '10 % de vol de vie, +30 % dégâts contre les boss', eff: { lifesteal: .1, dmgBossPct: .3 } }
};
const FX_MINOR = ['m_vamp', 'm_xp', 'm_gold', 'm_guard'];
const FX_LEG = ['vampire', 'thorns', 'bleeder', 'burner', 'froster', 'venom', 'arcane', 'wealth', 'scholar', 'lucky', 'swift', 'bulwark', 'flow'];
const FX_MYTH = ['godslayer', 'soulreaper', 'phoenix', 'tempest', 'titan', 'execution'];
const FX_SEC = ['voidheart', 'timeworn', 'eveil_fx', 'devourer'];

/* Libellés des effets (utilisés pour afficher traits, titres, objets…) */
const EFFL = {
  atkPct: ['Attaque', '%'], defPct: ['Défense', '%'], hpPct: ['PV max', '%'], mpPct: ['Mana max', '%'], allPct: ['Attaque / défense / PV', '%'],
  spdFlat: ['Vitesse', 'n'], critFlat: ['Critique', 'n%'], dodgeFlat: ['Esquive', 'n%'], xpPct: ['d’XP', '%'], goldPct: ['d’or', '%'],
  lootLuck: ['de chance de butin rare', '%'], lifesteal: ['de vol de vie', '%'], dmgTakenPct: ['de dégâts subis', '%'], healPct: ['de soins reçus', '%'],
  regenPost: ['PV rendus après un combat', '%'], dmgBossPct: ['de dégâts contre les boss', '%'], nightAtk: ['d’attaque dans les zones nocturnes', '%'],
  statusChance: ['de chance d’altération', '%'], dotPct: ['de dégâts d’altération', '%'], finTh: ['de seuil du Finisseur', '%'], skillPct: ['de dégâts de compétence', '%'],
  shopDisc: ['de réduction marchande', '%'], upgBonus: ['de réussite d’amélioration', '%'], peaceBonus: ['de chance d’apaisement', '%'],
  companionPct: ['de puissance des compagnons', '%'], summonPct: ['de puissance des invocations', '%'], deathMit: ['de pénalité de mort en moins', '%'],
  defendBonus: ['d’efficacité de la défense', '%'], potionPct: ['d’efficacité des potions', '%'], thorns: ['de dégâts renvoyés', '%'],
  hitBleed: ['de saignement à chaque coup', '%'], hitBurn: ['de brûlure à chaque coup', '%'], hitFreeze: ['de gel à chaque coup', '%'], hitPoison: ['de poison à chaque coup', '%'],
  extraTurn: ['de tour supplémentaire', '%'], critDmg: ['de dégâts critiques', '%'], onKillMp: ['mana par victime', 'n'], mpRegen: ['mana par tour', 'n'],
  regenTurn: ['PV par tour', '%'], firstStrike: ['Agit toujours en premier', 'b'], revive: ['Survit à un coup fatal (1×/combat)', 'b']
};
function effText(e) {
  const out = [];
  for (const k in e) {
    const L = EFFL[k]; if (!L) continue; const v = e[k];
    if (L[1] === 'b') out.push(L[0]);
    else if (L[1] === '%') out.push(`${v > 0 ? '+' : ''}${Math.round(v * 100)} % ${L[0]}`);
    else if (L[1] === 'n%') out.push(`${v > 0 ? '+' : ''}${v} % ${L[0]}`);
    else out.push(`${v > 0 ? '+' : ''}${v} ${L[0]}`);
  }
  return out;
}

/* Classes : stats initiales, croissance automatique par niveau, avantages / faiblesses */
const CLASSES = [
  { id: 'guerrier', n: 'Guerrier', i: '⚔️', d: 'Rempart d’acier : il encaisse les coups et frappe fort.', base: { str: 8, int: 2, agi: 4, end: 8 }, grow: { str: 1, end: 1 }, eff: { hpPct: .10, defPct: .05, spdFlat: -1, mpPct: -.10 }, pros: ['+10 % PV', '+5 % défense'], cons: ['−10 % mana', 'Un peu lent'], sp: 'g_sp', weapons: ['sword', 'axe', 'mace'] },
  { id: 'assassin', n: 'Assassin', i: '🗡️', d: 'Rapide et mortel, il vit par les coups critiques et l’esquive.', base: { str: 4, int: 3, agi: 9, end: 4 }, grow: { agi: 1, str: 1 }, eff: { critFlat: 6, dodgeFlat: 5, spdFlat: 3, hpPct: -.10 }, pros: ['+6 % critique', '+5 % esquive', '+3 vitesse'], cons: ['−10 % PV'], sp: 'a_sp', weapons: ['dagger', 'sword', 'bow'] },
  { id: 'mage', n: 'Mage', i: '🔮', d: 'Maître des arcanes : une puissance magique dévastatrice.', base: { str: 2, int: 10, agi: 3, end: 4 }, grow: { int: 2 }, eff: { mpPct: .25, skillPct: .10, hpPct: -.12, defPct: -.10 }, pros: ['+25 % mana', '+10 % dégâts de compétence'], cons: ['−12 % PV', '−10 % défense'], sp: 'm_sp', weapons: ['staff', 'wand', 'tome'] },
  { id: 'paladin', n: 'Paladin', i: '🛡️', d: 'Chevalier sacré : défense, soins et protection.', base: { str: 6, int: 4, agi: 3, end: 8 }, grow: { end: 1, str: 1 }, eff: { defPct: .12, healPct: .20, atkPct: -.05, spdFlat: -1 }, pros: ['+12 % défense', '+20 % soins reçus'], cons: ['−5 % attaque', 'Un peu lent'], sp: 'p_sp', weapons: ['mace', 'sword', 'spear'] },
  { id: 'archer', n: 'Archer', i: '🏹', d: 'Précis et mobile, il frappe de loin avant d’être touché.', base: { str: 3, int: 3, agi: 10, end: 4 }, grow: { agi: 2 }, eff: { critFlat: 4, spdFlat: 2, dodgeFlat: 2, defPct: -.05 }, pros: ['+4 % critique', '+2 vitesse', '+2 % esquive'], cons: ['−5 % défense'], sp: 'r_sp', weapons: ['bow', 'crossbow', 'dagger'] },
  { id: 'necro', n: 'Nécromancien', i: '💀', d: 'Il invoque les morts et se nourrit des ennemis vaincus.', base: { str: 2, int: 9, agi: 3, end: 5 }, grow: { int: 1, end: 1 }, eff: { mpPct: .15, onKillMp: 6, hpPct: -.08 }, pros: ['+15 % mana', '+6 mana par victime'], cons: ['−8 % PV'], sp: 'n_sp', weapons: ['scythe', 'staff', 'dagger'] }
];
const STYLES = [
  { id: 'offensif', n: 'Offensif', i: '🔥', d: '+8 % attaque, −4 % défense.', eff: { atkPct: .08, defPct: -.04 } },
  { id: 'defensif', n: 'Défensif', i: '🛡️', d: '+10 % défense, −4 % attaque.', eff: { defPct: .10, atkPct: -.04 } },
  { id: 'precis', n: 'Précis', i: '🎯', d: '+4 % critique, +3 % esquive.', eff: { critFlat: 4, dodgeFlat: 3 } },
  { id: 'tactique', n: 'Tactique', i: '🧠', d: '+12 % mana, +8 % dégâts de compétence.', eff: { mpPct: .12, skillPct: .08 } }
];
const PORTRAITS = ['🧙', '🧝', '🥷', '🧛', '🧜', '🧚', '🦹', '🤺'];
const CLASS = id => CLASSES.find(c => c.id === id) || CLASSES[0];
const STYLE = id => STYLES.find(s => s.id === id) || STYLES[0];

/* Altérations et éléments */
const STATUS = {
  poison: { n: 'Poison', i: '☠️', k: 1, res: 'poison' },
  bleed: { n: 'Saignement', i: '🩸', k: 1.2, res: 'bleed' },
  burn: { n: 'Brûlure', i: '🔥', k: 1.3, res: 'fire' },
  freeze: { n: 'Gel', i: '❄️', skip: true, res: 'ice' },
  stun: { n: 'Étourdissement', i: '💫', skip: true, res: 'stun' }
};
const ELEM = { phys: ['Physique', '⚔️'], fire: ['Feu', '🔥'], ice: ['Glace', '❄️'], shock: ['Foudre', '⚡'], holy: ['Sacré', '✨'], dark: ['Ténèbres', '🌑'], poison: ['Poison', '☠️'], arcane: ['Arcane', '🔮'] };

/* Compétences ennemies */
const ESK = {
  strike: { n: 'Attaque', m: 1 },
  heavy: { n: 'Coup puissant', m: 1.8, warn: true },
  bleed_claw: { n: 'Griffes lacérantes', m: .8, st: ['bleed', .6, 3] },
  poison_bite: { n: 'Morsure venimeuse', m: .7, st: ['poison', .7, 4] },
  burn_breath: { n: 'Souffle ardent', m: 1.1, st: ['burn', .5, 3], el: 'fire' },
  frost_touch: { n: 'Toucher glacial', m: .9, st: ['freeze', .35, 1], el: 'ice' },
  stun_blow: { n: 'Coup étourdissant', m: 1, st: ['stun', .4, 1] },
  drain: { n: 'Drain de vie', m: .9, drain: .5, el: 'dark' },
  war_cry: { n: 'Cri de guerre', buff: .25 },
  regen: { n: 'Régénération', healSelf: .1 },
  quake: { n: 'Séisme', m: 2.2, st: ['stun', .5, 1], warn: true },
  dragon_breath: { n: 'Souffle de cristal', m: 2, st: ['freeze', .5, 1], el: 'ice', warn: true },
  soul_drain: { n: 'Aspiration d’âme', m: 1.2, drain: .6, mpDrain: .15, el: 'dark' },
  curse: { n: 'Malédiction', m: .5, st: ['poison', .9, 4], st2: ['bleed', .9, 4], el: 'dark' },
  web: { n: 'Toile collante', m: .4, st: ['stun', .8, 1] },
  devour: { n: 'Dévoration', m: 2.4, drain: 1, warn: true, el: 'dark' }
};

/* Ennemis : multiplicateurs relatifs (PV, attaque, défense) */
const ETPL = {
  gelee: { n: 'Gelée verte', i: '🟢', hp: .8, atk: .8, def: .6, spd: 3, skills: ['strike', 'strike', 'regen'], res: { poison: .9 }, mats: ['herb'] },
  loup: { n: 'Loup affamé', i: '🐺', hp: 1, atk: 1.1, def: .8, spd: 9, skills: ['strike', 'bleed_claw'], mats: ['hide'], peace: true },
  gobelin: { n: 'Gobelin pillard', i: '👺', hp: 1, atk: 1, def: 1, spd: 6, skills: ['strike', 'strike', 'heavy'], mats: ['ore'] },
  araignee: { n: 'Araignée tisseuse', i: '🕷️', hp: .9, atk: 1, def: .8, spd: 9, skills: ['poison_bite', 'strike'], mats: ['hide'] },
  ours: { n: 'Ours brun', i: '🐻', hp: 1.6, atk: 1.2, def: 1.1, spd: 5, skills: ['strike', 'heavy'], mats: ['hide'], peace: true },
  dryade: { n: 'Dryade corrompue', i: '🌿', hp: 1.1, atk: 1, def: .9, spd: 7, skills: ['drain', 'strike'], res: { fire: -.5, poison: .5 }, mats: ['herb'] },
  crapaud: { n: 'Crapaud géant', i: '🐸', hp: 1.3, atk: 1, def: .9, spd: 5, skills: ['poison_bite', 'strike'], res: { poison: .7 }, mats: ['herb'], peace: true },
  feu_follet: { n: 'Feu follet', i: '🔥', hp: .8, atk: 1.2, def: .7, spd: 11, skills: ['burn_breath', 'strike'], res: { fire: .8, ice: -.5 }, dodge: 25, mats: ['ecto'] },
  noye: { n: 'Noyé putride', i: '🧟', hp: 1.5, atk: 1.2, def: 1, spd: 4, skills: ['heavy', 'poison_bite'], res: { poison: .8 }, mats: ['bone'] },
  harpie: { n: 'Harpie des cimes', i: '🦅', hp: .9, atk: 1.2, def: .8, spd: 12, skills: ['bleed_claw', 'strike'], dodge: 15, mats: ['hide'] },
  golem_roc: { n: 'Golem de roche', i: '🗿', hp: 1.8, atk: 1.2, def: 1.8, spd: 3, skills: ['strike', 'stun_blow', 'heavy'], res: { phys: .3, shock: -.3, poison: .9 }, mats: ['ore', 'crystal'] },
  salamandre: { n: 'Salamandre', i: '🦎', hp: 1.1, atk: 1.2, def: 1, spd: 8, skills: ['burn_breath', 'strike'], res: { fire: .8, ice: -.6 }, mats: ['ember'] },
  squelette: { n: 'Squelette guerrier', i: '💀', hp: 1.1, atk: 1.1, def: 1.2, spd: 6, skills: ['strike', 'heavy'], res: { poison: .9, bleed: .9, holy: -.5, dark: .5 }, mats: ['bone'] },
  spectre: { n: 'Spectre errant', i: '👻', hp: .9, atk: 1.2, def: .8, spd: 10, skills: ['drain', 'frost_touch'], res: { phys: .6, holy: -.6, dark: .6, poison: .9 }, mats: ['ecto'] },
  goule: { n: 'Goule affamée', i: '🧟‍♂️', hp: 1.4, atk: 1.2, def: 1, spd: 7, skills: ['bleed_claw', 'poison_bite', 'strike'], res: { holy: -.4 }, mats: ['bone'] },
  elementaire: { n: 'Élémentaire de cristal', i: '💎', hp: 1.4, atk: 1.2, def: 1.5, spd: 6, skills: ['frost_touch', 'heavy', 'strike'], res: { ice: .6, shock: -.4 }, mats: ['crystal', 'star'] },
  horreur: { n: 'Horreur des profondeurs', i: '🐙', hp: 1.5, atk: 1.3, def: 1, spd: 7, skills: ['stun_blow', 'poison_bite', 'drain'], res: { dark: .3 }, mats: ['ecto', 'star'] },
  sentinelle: { n: 'Sentinelle cristalline', i: '🤖', hp: 1.7, atk: 1.3, def: 1.6, spd: 5, skills: ['strike', 'heavy', 'burn_breath'], res: { poison: .9 }, mats: ['crystal', 'ember'] },
  bandit: { n: 'Bandit', i: '🥷', hp: 1, atk: 1.1, def: 1, spd: 7, skills: ['strike', 'bleed_claw'], mats: ['hide'] },
  duelliste: { n: 'Duelliste errant', i: '🤺', hp: 1.3, atk: 1.3, def: 1.1, spd: 8, skills: ['strike', 'heavy', 'stun_blow'], mats: ['ore'] },
  mimique: { n: 'Mimique', i: '📦', hp: 1.4, atk: 1.3, def: 1.2, spd: 6, skills: ['strike', 'heavy', 'stun_blow'], mats: ['ore'] },
  araignon: { n: 'Araignon', i: '🕷️', hp: .5, atk: .7, def: .5, spd: 10, skills: ['poison_bite', 'strike'], mats: [] },
  esprit_hostile: { n: 'Esprit sylvestre', i: '🍃', hp: 1.2, atk: 1.1, def: 1, spd: 9, skills: ['drain', 'strike'], res: { fire: -.4 }, mats: ['herb'] }
};

/* Boss : mécaniques par cycle d'actions annoncées + phases */
const BOSSES = {
  gobelin_roi: { n: 'Roi Gobelin Grimgut', i: '👑', lvl: 6, zone: 'plaines', hp: 4.5, atk: 1.25, def: 1.2, spd: 6, tag: 'Cycle : le Roi hurle avant de frapper fort.',
    cycle: ['strike', 'heavy', 'strike', 'war_cry'], phases: [{ at: .5, msg: 'Grimgut hurle : « À moi, la horde ! »', summon: 'gobelin', n: 2, enrage: .2 }],
    uniq: { slot: 'weapon', cat: 'axe', name: 'Fendeuse du Roi Gobelin', r: 4, fx: ['bleeder'] } },
  araignee_reine: { n: 'Reine Araignée Shéléa', i: '🕸️', lvl: 10, zone: 'foret', hp: 4.5, atk: 1.2, def: 1, spd: 9, tag: 'Pond des araignons et immobilise de sa toile.',
    cycle: ['poison_bite', 'strike', 'web', 'poison_bite', 'heavy'], phases: [{ at: .6, msg: 'Shéléa pond une nuée d’araignons !', summon: 'araignon', n: 3 }, { at: .3, msg: 'Shéléa entre en rage !', enrage: .3 }],
    uniq: { slot: 'hands', name: 'Griffes de Soie Noire', r: 4, fx: ['venom'] } },
  sorciere: { n: 'Sorcière du Marais Hécate', i: '🧙‍♀️', lvl: 15, zone: 'marais', hp: 4.5, atk: 1.2, def: 1, spd: 8, tag: 'Maudit, draine et se soigne en phase finale.', res: { dark: .3 },
    cycle: ['curse', 'drain', 'burn_breath', 'strike'], phases: [{ at: .5, msg: 'Hécate invoque un brouillard régénérant…', heal: .15, enrage: .15 }],
    uniq: { slot: 'off', cat: 'orb', name: 'Œil de la Sorcière', r: 4, fx: ['arcane'] } },
  golem_magma: { n: 'Golem de Magma', i: '🌋', lvl: 20, zone: 'montagne', hp: 5, atk: 1.3, def: 1.8, spd: 4, tag: 'Un séisme tous les 3 tours : défendez-vous !', res: { fire: .9, ice: -.5, phys: .2 },
    cycle: ['strike', 'strike', 'quake', 'heavy'], phases: [{ at: .5, msg: 'La lave bouillonne dans ses veines !', enrage: .25, add: ['burn_breath'] }],
    uniq: { slot: 'chest', name: 'Cœur de Magma', r: 4, fx: ['bulwark'] } },
  liche: { n: 'Seigneur Liche', i: '☠️', lvl: 26, zone: 'cimetiere', hp: 5, atk: 1.3, def: 1.2, spd: 8, tag: 'Ressuscite une fois et draine votre mana.', res: { dark: .6, holy: -.5, poison: .9 }, resurrect: true,
    cycle: ['soul_drain', 'curse', 'heavy', 'frost_touch'], phases: [{ at: .5, msg: 'La Liche invoque ses squelettes !', summon: 'squelette', n: 2 }],
    uniq: { slot: 'head', name: 'Couronne de la Liche', r: 5, fx: ['soulreaper'] } },
  dragon: { n: 'Dragon de Cristal', i: '🐉', lvl: 32, zone: 'abysses', hp: 5.5, atk: 1.4, def: 1.4, spd: 9, tag: 'Souffle glacial annoncé : défendez-vous avant !', res: { ice: .7, fire: -.3 },
    cycle: ['strike', 'dragon_breath', 'heavy', 'strike'], phases: [{ at: .6, msg: 'Le dragon déploie ses ailes de cristal…', enrage: .2 }, { at: .25, msg: 'Le dragon rugit de fureur !', enrage: .3 }],
    uniq: { slot: 'weapon', name: 'Croc du Dragon de Cristal', r: 5, fx: ['godslayer'] } },
  devoreur: { n: 'Le Dévoreur d’Éveil', i: '👁️', lvl: 38, zone: 'abysses', hp: 6, atk: 1.5, def: 1.5, spd: 10, tag: 'Trois phases. Sa Dévoration le soigne : défendez-vous !', res: { dark: .5 },
    cycle: ['strike', 'curse', 'devour', 'heavy', 'dragon_breath', 'soul_drain'], phases: [{ at: .7, msg: 'Le Dévoreur s’ouvre : mille yeux vous fixent.', enrage: .15, summon: 'horreur', n: 1 }, { at: .4, msg: 'La réalité se fissure autour de lui !', enrage: .2, heal: .1 }, { at: .15, msg: 'Le Dévoreur hurle, à bout de forces !', enrage: .35 }],
    uniq: { slot: 'acc', name: 'Œil du Dévoreur', r: 6, fx: ['devourer', 'eveil_fx'] } }
};

const MATS = { ore: ['Minerai de fer', '⛏️'], hide: ['Peau tannée', '🧶'], herb: ['Herbe médicinale', '🌿'], bone: ['Os ancien', '🦴'], crystal: ['Cristal brut', '💠'], ember: ['Braise ardente', '🔥'], ecto: ['Ectoplasme', '🫧'], star: ['Éclat d’astre', '⭐'] };
const CONS = {
  potion_hp: { n: 'Potion de soin', i: '🧪', d: 'Rend 40 % des PV max.', f: .4, price: 30 },
  potion_hp2: { n: 'Grande potion', i: '⚗️', d: 'Rend 75 % des PV max.', f: .75, price: 90 },
  potion_mp: { n: 'Potion de mana', i: '💧', d: 'Rend 50 % du mana max.', f: .5, price: 40 },
  antidote: { n: 'Antidote', i: '🍵', d: 'Retire toutes les altérations.', price: 35 },
  bomb: { n: 'Bombe incendiaire', i: '💣', d: 'Dégâts de feu à tous les ennemis, peut brûler.', price: 55 }
};
const RECIPES = {
  potion_hp: { herb: 2 }, potion_hp2: { herb: 4, crystal: 1 }, potion_mp: { herb: 2, crystal: 1 }, antidote: { herb: 1, bone: 1 }, bomb: { ember: 2, ore: 1 }
};

const ZONES = [
  { id: 'plaines', n: 'Plaines d’Aube', i: '🌾', min: 1, max: 6, night: false, d: 'Des collines douces, mais des pillards rôdent.', enemies: ['gelee', 'loup', 'gobelin'], mats: ['herb', 'hide', 'ore'], dungeons: ['terrier'] },
  { id: 'foret', n: 'Forêt Murmurante', i: '🌲', min: 3, max: 10, night: false, d: 'Les arbres chuchotent. Les araignées écoutent.', enemies: ['araignee', 'ours', 'dryade', 'loup'], mats: ['herb', 'hide'], dungeons: ['coeur_foret'] },
  { id: 'marais', n: 'Marais Sans Lune', i: '🌑', min: 7, max: 15, night: true, d: 'Zone nocturne : la brume cache des feux follets.', enemies: ['crapaud', 'feu_follet', 'noye'], mats: ['herb', 'bone', 'ecto'], dungeons: ['fosse'] },
  { id: 'montagne', n: 'Montagnes de Cendre', i: '🌋', min: 11, max: 21, night: false, d: 'Roche noire, vents brûlants et golems affamés.', enemies: ['harpie', 'golem_roc', 'salamandre'], mats: ['ore', 'ember', 'crystal'], dungeons: ['forge'] },
  { id: 'cimetiere', n: 'Cimetière Oublié', i: '🪦', min: 15, max: 27, night: true, d: 'Zone nocturne : les morts n’ont pas fini de marcher.', enemies: ['squelette', 'spectre', 'goule'], mats: ['bone', 'ecto', 'star'], dungeons: ['crypte'] },
  { id: 'abysses', n: 'Abysses de Cristal', i: '💎', min: 21, max: 40, night: false, d: 'Un monde de cristaux vivants, au-delà de la raison.', enemies: ['elementaire', 'horreur', 'sentinelle'], mats: ['crystal', 'star', 'ember'], dungeons: ['palais', 'coeur_abysses'] }
];
const DUNGEONS = [
  { id: 'terrier', zone: 'plaines', n: 'Terrier du Roi Gobelin', boss: 'gobelin_roi', stages: [{ t: 'n', c: 2 }, { t: 'n', c: 2 }, { t: 'e' }, { t: 'b' }] },
  { id: 'coeur_foret', zone: 'foret', n: 'Cœur de la Forêt', boss: 'araignee_reine', stages: [{ t: 'n', c: 2 }, { t: 'n', c: 3 }, { t: 'e' }, { t: 'b' }] },
  { id: 'fosse', zone: 'marais', n: 'Fosse de la Sorcière', boss: 'sorciere', stages: [{ t: 'n', c: 2 }, { t: 'n', c: 2 }, { t: 'e' }, { t: 'b' }] },
  { id: 'forge', zone: 'montagne', n: 'Forge Obsidienne', boss: 'golem_magma', stages: [{ t: 'n', c: 2 }, { t: 'e' }, { t: 'n', c: 2 }, { t: 'b' }] },
  { id: 'crypte', zone: 'cimetiere', n: 'Crypte Oubliée', boss: 'liche', stages: [{ t: 'n', c: 3 }, { t: 'e' }, { t: 'e' }, { t: 'b' }] },
  { id: 'palais', zone: 'abysses', n: 'Palais de Cristal', boss: 'dragon', stages: [{ t: 'n', c: 3 }, { t: 'e' }, { t: 'n', c: 2 }, { t: 'b' }] },
  { id: 'coeur_abysses', zone: 'abysses', n: 'Cœur des Abysses', boss: 'devoreur', req: 'bk_dragon', stages: [{ t: 'n', c: 3 }, { t: 'e' }, { t: 'e' }, { t: 'b' }] }
];
const DIFFS = [{ n: 'Normal', off: 0, rew: 1 }, { n: 'Difficile', off: 3, rew: 1.6 }, { n: 'Cauchemar', off: 6, rew: 2.6 }];
const ZONE = id => ZONES.find(z => z.id === id);
const DUNGEON = id => DUNGEONS.find(d => d.id === id);

/* Enemies : fabrique et IA */
const Enemies = {
  make(id, lvl, mod) {
    const boss = BOSSES[id], t = boss || ETPL[id], elite = mod === 'elite';
    const hpM = elite ? 1.9 : 1, atkM = elite ? 1.3 : 1, defM = elite ? 1.2 : 1;
    const dm = DIFFICULTY[(typeof G !== 'undefined' && G && G.p && G.p.diff) || 'normal'] || DIFFICULTY.normal;
    const maxHp = Math.round(40 * t.hp * (1 + .9 * (lvl - 1)) * hpM * dm.hp);
    const e = {
      tpl: id, n: elite ? t.n + ' alpha' : t.n, i: t.i, lvl, maxHp, hp: maxHp,
      atk: 10 * t.atk * atkM * dm.atk * (1 + .6 * (lvl - 1)), def: 6 * t.def * defM * (1 + .35 * (lvl - 1)), spd: t.spd + lvl * .5,
      res: Object.assign({}, t.res || {}), dodge: t.dodge || 0, skills: [...(t.skills || [])],
      tier: boss ? 'boss' : elite ? 'elite' : 'normal', st: {}, buffAtk: 0, buffT: 0, phase: 0, cyc: 0, cdStun: 0,
      peace: !!t.peace && !elite, mats: t.mats || [], minion: mod === 'minion', dead: false, intent: 'strike', boss: !!boss
    };
    if (elite) e.skills.push('war_cry');
    if (boss) { e.cycle = [...t.cycle]; e.phases = t.phases || []; e.resurrect = !!t.resurrect; }
    return e;
  },
  intent(e) {
    if (e.boss) return e.cycle[e.cyc++ % e.cycle.length];
    if (e.hp < e.maxHp * .4 && e.skills.includes('regen') && chance(.6)) return 'regen';
    const pool = e.skills.filter(s => !(s === 'war_cry' && e.buffT > 0));
    return pick(pool.length ? pool : ['strike']);
  }
};

/* ---------- 2b. DONNÉES ÉTAPE 2 : classes étendues, origines, difficultés, paliers, Paragon ---------- */
CLASSES.push(
  { id: 'chevalier', n: 'Chevalier', i: '🏰', d: 'Armure lourde et contre-attaques disciplinées.', base: { str: 7, int: 2, agi: 3, end: 10 }, grow: { end: 1, str: 1 }, eff: { defPct: .15, hpPct: .08, spdFlat: -2, dodgeFlat: -3 }, pros: ['+15 % défense', '+8 % PV', 'Contre-attaques'], cons: ['−2 vitesse', '−3 % esquive'], sp: 'c_sp', weapons: ['sword', 'spear', 'mace'] },
  { id: 'berserker', n: 'Berserker', i: '🪓', d: 'Fureur brute : frappe très fort, se protège très mal.', base: { str: 10, int: 1, agi: 5, end: 6 }, grow: { str: 2 }, eff: { atkPct: .12, defPct: -.12, critDmg: .15 }, pros: ['+12 % attaque', '+15 % dégâts critiques'], cons: ['−12 % défense', 'Se blesse en frappant'], sp: 'b_sp', weapons: ['axe', 'greatsword', 'hammer'] },
  { id: 'voleur', n: 'Voleur', i: '🗝️', d: 'Agile et cupide : dérobe de l’or et trouve plus de butin.', base: { str: 3, int: 3, agi: 10, end: 4 }, grow: { agi: 1, str: 1 }, eff: { goldPct: .15, lootLuck: .15, dodgeFlat: 4, hpPct: -.08 }, pros: ['+15 % or', '+15 % chance de butin', '+4 % esquive'], cons: ['−8 % PV'], sp: 'v_sp', weapons: ['dagger', 'sword', 'crossbow'] },
  { id: 'chasseur', n: 'Chasseur', i: '🐾', d: 'Pisteur patient : marque sa proie et la traque, surtout les boss.', base: { str: 4, int: 3, agi: 9, end: 5 }, grow: { agi: 1, end: 1 }, eff: { critFlat: 3, precFlat: 15, dmgBossPct: .08 }, pros: ['+15 % précision', '+8 % dégâts contre les boss'], cons: ['Peu de soins'], sp: 'h_sp', weapons: ['bow', 'crossbow', 'spear'] },
  { id: 'mage_elem', n: 'Mage élémentaire', i: '🌋', d: 'Feu, glace et foudre : exploite les faiblesses ennemies.', base: { str: 2, int: 10, agi: 3, end: 4 }, grow: { int: 2 }, eff: { mpPct: .2, resFire: .15, resIce: .15, resShock: .15, hpPct: -.1 }, pros: ['+20 % mana', '+15 % résistance feu/glace/foudre'], cons: ['−10 % PV'], sp: 'e_sp', weapons: ['staff', 'wand', 'tome'] },
  { id: 'mage_chaos', n: 'Mage du chaos', i: '🌀', d: 'Puissance instable : dégâts colossaux, au prix de sa propre vie.', base: { str: 1, int: 11, agi: 3, end: 3 }, grow: { int: 2 }, eff: { skillPct: .18, defPct: -.15, hpPct: -.15, critFlat: 5 }, pros: ['+18 % dégâts de compétence', '+5 % critique'], cons: ['−15 % défense', '−15 % PV', 'Sorts qui blessent le lanceur'], sp: 'x_sp', weapons: ['tome', 'wand', 'staff'] },
  { id: 'invocateur', n: 'Invocateur', i: '🐉', d: 'Il combat par ses familiers et ses créatures invoquées.', base: { str: 2, int: 9, agi: 3, end: 6 }, grow: { int: 1, end: 1 }, eff: { summonPct: .3, mpPct: .15, hpPct: -.05 }, pros: ['+30 % puissance des invocations', '+15 % mana'], cons: ['Fragile seul'], sp: 'i_sp', weapons: ['staff', 'tome', 'wand'] },
  { id: 'druide', n: 'Druide', i: '🌿', d: 'Régénération, poisons naturels et griffes de la forêt.', base: { str: 3, int: 8, agi: 4, end: 7 }, grow: { int: 1, end: 1 }, eff: { healPct: .15, regenTurn: .02, resPoison: .3, resIce: .1 }, pros: ['Régénère chaque tour', '+15 % soins', 'Résiste au poison'], cons: ['Dégâts modestes'], sp: 'd_sp', weapons: ['staff', 'spear', 'mace'] },
  { id: 'moine', n: 'Moine', i: '👊', d: 'Poings nus, esprit affûté : rafales rapides et esquive.', base: { str: 7, int: 3, agi: 8, end: 5 }, grow: { agi: 1, str: 1 }, eff: { dodgeFlat: 5, critFlat: 3, spdFlat: 2, defPct: -.05 }, pros: ['+5 % esquive', '+2 vitesse'], cons: ['−5 % défense'], sp: 'o_sp', weapons: ['fist'] },
  { id: 'samourai', n: 'Samouraï', i: '🗾', d: 'Un seul coup décisif, ou une riposte parfaite.', base: { str: 8, int: 2, agi: 7, end: 5 }, grow: { str: 1, agi: 1 }, eff: { critFlat: 5, critDmg: .2, defPct: -.05 }, pros: ['+20 % dégâts critiques', '+5 % critique'], cons: ['−5 % défense'], sp: 's_sp', weapons: ['katana'] },
  { id: 'lancier', n: 'Lancier', i: '🔱', d: 'Allonge et perforation : ignore une part de l’armure.', base: { str: 8, int: 2, agi: 6, end: 6 }, grow: { str: 1, agi: 1 }, eff: { spdFlat: 2, penFlat: 15, dodgeFlat: 2 }, pros: ['+15 % pénétration d’armure', '+2 vitesse'], cons: ['Peu de magie'], sp: 'l_sp', weapons: ['spear'] },
  { id: 'ingenieur', n: 'Ingénieur arcanique', i: '⚙️', d: 'Tourelles, grenades et dispositifs à base de runes.', base: { str: 3, int: 9, agi: 5, end: 5 }, grow: { int: 1, agi: 1 }, eff: { mpPct: .1, skillPct: .1, lootLuck: .1 }, pros: ['+10 % dégâts de compétence', '+10 % butin'], cons: ['Équipement coûteux'], sp: 'q_sp', weapons: ['gun', 'crossbow', 'wand'] },
  { id: 'barde', n: 'Barde', i: '🎻', d: 'Ses chants renforcent et soignent ; il apprend vite.', base: { str: 3, int: 7, agi: 6, end: 6 }, grow: { int: 1, agi: 1 }, eff: { healPct: .1, xpPct: .05, mpPct: .1, critFlat: 2 }, pros: ['+5 % XP', '+10 % soins', 'Chants de soutien'], cons: ['Dégâts moyens'], sp: 'ba_sp', weapons: ['wand', 'dagger', 'crossbow'] },
  { id: 'chevalier_noir', n: 'Chevalier noir', i: '🖤', d: 'Classe avancée : se nourrit de la douleur et vole la vie.', base: { str: 9, int: 5, agi: 3, end: 8 }, grow: { str: 1, end: 1 }, eff: { lifesteal: .05, atkPct: .1, hpPct: .05, healPct: -.1 }, pros: ['+5 % vol de vie', '+10 % attaque'], cons: ['−10 % soins reçus'], sp: 'cn_sp', weapons: ['greatsword', 'sword', 'scythe'], adv: { lvl: 25, g: [{ c: 'killsBoss', n: 3, l: 'boss vaincus' }, { c: 'deaths', n: 1, l: 'défaite subie' }] } },
  { id: 'chronomancien', n: 'Chronomancien', i: '⏳', d: 'Classe avancée : manipule le tempo du combat.', base: { str: 1, int: 11, agi: 6, end: 3 }, grow: { int: 1, agi: 1 }, eff: { spdFlat: 6, mpPct: .15, extraTurn: .05, hpPct: -.1 }, pros: ['+6 vitesse', '5 % de tour supplémentaire'], cons: ['−10 % PV'], sp: 't_sp', weapons: ['wand', 'staff', 'tome'], adv: { lvl: 40, g: [{ c: 'fastWins', n: 15, l: 'victoires en 3 tours ou moins' }, { c: 'bossesDistinct', n: 4, l: 'boss différents vaincus' }] } }
);
ITEM_BASES.weapon.push(
  { n: 'Katana', cat: 'katana', i: '🗡️', main: { atk: 1.25 }, bias: ['crit', 'agi'] },
  { n: 'Épée à deux mains', cat: 'greatsword', i: '⚔️', main: { atk: 1.45 }, bias: ['str', 'hp'] },
  { n: 'Gantelets de combat', cat: 'fist', i: '👊', main: { atk: 1.1 }, bias: ['agi', 'spd'] },
  { n: 'Arquebuse arcanique', cat: 'gun', i: '🔫', main: { atk: 1.3 }, bias: ['int', 'crit'] },
  { n: 'Marteau de guerre', cat: 'hammer', i: '🔨', main: { atk: 1.4 }, bias: ['str', 'end'] });
Object.assign(CAT_NAME, { katana: 'Katana', greatsword: 'Épée à deux mains', fist: 'Poings', gun: 'Arme à feu', hammer: 'Marteau' });
Object.assign(STAT_LABEL, { mres: 'Résistance magique', prec: 'Précision', pen: 'Pénétration' });
STAT_POOL.push('mres', 'prec', 'pen'); Object.assign(AFF, { mres: .5, prec: .08, pen: .05 });
TIERS.push([60, 'du Zénith'], [90, 'des Abysses'], [130, 'd’Éternité'], [180, 'de l’Origine'], [230, 'des Cieux']);
Object.assign(EFFL, {
  precFlat: ['de précision', 'n%'], penFlat: ['de pénétration d’armure', 'n%'], sresFlat: ['de résistance aux altérations', 'n%'], mresPct: ['de résistance magique', '%'],
  resFire: ['de résistance au feu', '%'], resIce: ['de résistance à la glace', '%'], resShock: ['de résistance à la foudre', '%'], resPoison: ['de résistance au poison', '%'],
  resDark: ['de résistance aux ténèbres', '%'], resHoly: ['de résistance au sacré', '%']
});

const DIFFICULTY = {
  facile: { n: 'Facile', d: 'Ennemis −20 %, récompenses −15 %.', hp: .8, atk: .8, rew: .85, loss: .10 },
  normal: { n: 'Normal', d: 'L’expérience prévue.', hp: 1, atk: 1, rew: 1, loss: .15 },
  difficile: { n: 'Difficile', d: 'Ennemis +25 % PV / +20 % attaque, récompenses +25 %.', hp: 1.25, atk: 1.2, rew: 1.25, loss: .20 },
  cauchemar: { n: 'Cauchemar', d: 'Ennemis +60 % PV / +50 % attaque, récompenses +60 %, lourde perte d’or à la mort.', hp: 1.6, atk: 1.5, rew: 1.6, loss: .30 }
};
const ORIGINS = [
  { id: 'aldra', n: 'Royaume d’Aldra', i: '🏰', d: 'Terre de la Couronne. +10 réputation Couronne.', rep: { couronne: 10 }, eff: {}, line: '« Un enfant d’Aldra ! Le royaume est fier de vous. »' },
  { id: 'nord', n: 'Clans du Nord', i: '❄️', d: 'Rudes et fiers. +4 % PV, +15 % résistance à la glace.', rep: {}, eff: { hpPct: .04, resIce: .15 }, line: '« Un fils (ou une fille) des clans… le froid vous a bien forgé. »' },
  { id: 'zahar', n: 'Cité des Sables de Zahar', i: '🏜️', d: 'Marchands rusés. +8 % or, −3 % prix.', rep: {}, eff: { goldPct: .08, shopDisc: .03 }, line: '« Un Zaharien ! Vous savez marchander, au moins ? »' },
  { id: 'mirelle', n: 'Îles de Brume de Mirelle', i: '🌫️', d: 'Navigateurs-mages. +10 réputation Cercle, +5 % mana.', rep: { cercle: 10 }, eff: { mpPct: .05 }, line: '« Les Îles de Brume… on dit que leurs mages entendent la mer. »' },
  { id: 'vorgath', n: 'Marches Noires de Vorgath', i: '🌑', d: 'Terre de bannis. +10 réputation Ombres, +2 % critique.', rep: { ombres: 10 }, eff: { critFlat: 2 }, line: '« Vorgath. Vous avez des yeux de survivant. »' },
  { id: 'ilvane', n: 'Forêt d’Ilvane', i: '🌳', d: 'Peuple des arbres. +10 réputation Sylve, +2 % PV après combat.', rep: { sylve: 10 }, eff: { regenPost: .02 }, line: '« Les arbres d’Ilvane vous murmurent encore, n’est-ce pas ? »' }
];
const BACKGROUNDS = [
  { id: 'orphelin', n: 'Orphelin des rues', d: '+5 Ombres, +40 or, +2 % esquive.', rep: { ombres: 5 }, gold: 40, eff: { dodgeFlat: 2 } },
  { id: 'soldat', n: 'Fils de soldat', d: '+5 Couronne, +3 % défense.', rep: { couronne: 5 }, eff: { defPct: .03 } },
  { id: 'apprenti', n: 'Apprenti du Cercle', d: '+5 Cercle, +1 potion de mana, +4 % mana.', rep: { cercle: 5 }, cons: { potion_mp: 1 }, eff: { mpPct: .04 } },
  { id: 'chasseur_s', n: 'Chasseur de la Sylve', d: '+5 Sylve, +2 % critique.', rep: { sylve: 5 }, eff: { critFlat: 2 } },
  { id: 'mercenaire', n: 'Mercenaire en fuite', d: '−5 Couronne, +5 Ombres, +80 or.', rep: { couronne: -5, ombres: 5 }, gold: 80, eff: {} },
  { id: 'pelerin', n: 'Pèlerin repenti', d: '+10 % soins reçus, +1 potion de soin.', cons: { potion_hp: 1 }, eff: { healPct: .1 } }
];
const SEXES = [['m', 'Masculin'], ['f', 'Féminin'], ['x', 'Non précisé']];

/* Paliers de niveau : bonus permanents + récompenses (niv. 10, 25 … 250) */
const MILESTONES = {
  10: { n: 'Aventurier confirmé', minR: 2, sp: 1, gold: 300, title: null }, 25: { n: 'Vétéran', minR: 2, sp: 1, gold: 800 }, 50: { n: 'Champion', minR: 3, sp: 2, gold: 2000 },
  75: { n: 'Maître d’armes', minR: 3, sp: 2, gold: 4000 }, 100: { n: 'Héros du royaume', minR: 4, sp: 2, gold: 8000 }, 125: { n: 'Paragon', minR: 4, sp: 2, gold: 12000 },
  150: { n: 'Légende', minR: 4, sp: 3, gold: 18000 }, 175: { n: 'Demi-dieu', minR: 5, sp: 3, gold: 26000 }, 200: { n: 'Mythe vivant', minR: 5, sp: 3, gold: 36000 },
  225: { n: 'Transcendant', minR: 5, sp: 3, gold: 50000 }, 250: { n: 'Apogée', minR: 6, sp: 5, gold: 100000 }
};

/* Paragon : progression après le niveau 250, sans réinitialisation. Chaque catégorie est plafonnée. */
const PAR_CAP = 50;
const PAR_CATS = {
  atk: ['Puissance', 'atkPct', .003, '+0,3 % attaque'], def: ['Résilience', 'defPct', .003, '+0,3 % défense'], hp: ['Vitalité', 'hpPct', .004, '+0,4 % PV'],
  crit: ['Précision mortelle', 'critFlat', .1, '+0,1 % critique'], find: ['Flair de reliques', 'lootLuck', .004, '+0,4 % butin rare']
};
const Paragon = {
  need(l) { return Math.round(250000 * (1 + l * .08)); },
  eff() {
    const p = G.p.par; if (!p || !p.lvl) return null; const e = {};
    for (const k in PAR_CATS) { const n = (p.alloc && p.alloc[k]) || 0; if (n) e[PAR_CATS[k][1]] = n * PAR_CATS[k][2]; }
    return e;
  },
  addXp(n) {
    const p = G.p.par; p.xp += n;
    while (p.xp >= this.need(p.lvl)) { p.xp -= this.need(p.lvl); p.lvl++; p.pts++; Hooks.toast(`Niveau Paragon ${p.lvl} !`, 'trait'); bump('paragonLevels'); }
  },
  spend(k) {
    const p = G.p.par; if (!PAR_CATS[k] || p.pts <= 0 || (p.alloc[k] || 0) >= PAR_CAP) return false;
    p.alloc[k] = (p.alloc[k] || 0) + 1; p.pts--; return true;
  },
  reset() { const p = G.p.par; let n = 0; for (const k in p.alloc) n += p.alloc[k]; p.pts += n; p.alloc = {}; }
};

/* ---------- 3. ÉTAT & SAUVEGARDE ---------- */
// Hooks : points de contact avec l'interface (remplacés dans la partie 10)
const Hooks = {
  toast() { }, render() { }, levelUp() { }, traitUnlocked() { }, titleUnlocked() { }, achUnlocked() { },
  combatStart() { }, combatRender() { }, combatEnd() { }, encounter() { }, narrative() { }, dungeonStage() { }, dungeonDone() { }
};
let G = null;

function newState() {
  return {
    v: 2, created: Date.now(), saved: 0, playTime: 0,
    settings: { anim: true },
    p: { name: '', portrait: 0, cls: 'guerrier', style: 'offensif', lvl: 1, xp: 0, gold: 60, hp: 1, mp: 1, base: { str: 0, int: 0, agi: 0, end: 0 }, pts: 0, sp: 0, sex: 'x', origin: 'aldra', bg: 'orphelin', diff: 'normal', alloc: { str: 0, int: 0, agi: 0, end: 0 }, par: { lvl: 0, xp: 0, pts: 0, alloc: {} }, classChanges: 0 },
    inv: [], eq: {}, cons: { potion_hp: 3, potion_mp: 1 }, mats: {},
    tr: {}, sk: {}, aug: {}, q: {}, comp: {}, active: null,
    zones: {}, bosses: {}, dung: {}, ach: {}, titles: { recrue: true }, title: 'recrue',
    rep: { couronne: 0, cercle: 0, ombres: 0, sylve: 0 },
    c: {}, flags: {}, shop: { items: [], at: -99, alch: [] }, daily: { date: '', q: {} }, seenEv: {}
  };
}
function deepMerge(base, d) {
  const isO = x => x && typeof x === 'object' && !Array.isArray(x);
  for (const k in d) base[k] = (isO(base[k]) && isO(d[k])) ? deepMerge(base[k], d[k]) : d[k];
  return base;
}
const bump = (k, n = 1) => { G.c[k] = (G.c[k] || 0) + n; };
function val(k) {
  switch (k) {
    case 'level': return G.p.lvl;
    case 'wcatsDistinct': return Object.keys(G.c.wcats || {}).length;
    case 'zonesVisited': return Object.values(G.zones).filter(z => z.ex > 0).length;
    case 'zonesFull': return Object.values(G.zones).filter(z => z.ex >= 100).length;
    case 'bossesDistinct': return Object.values(G.bosses).filter(v => v === true).length;
    case 'traitsCount': return Object.values(G.tr).filter(t => t.u).length;
    case 'maxBond': return Math.max(0, ...Object.values(G.comp).map(c => c.bond || 0));
    case 'equipRare': return Object.values(G.eq).filter(i => i && i.r >= 2).length;
    case 'compCount': return Object.values(G.comp).filter(c => c.rec).length;
  }
  if (k.startsWith('rep_')) return G.rep[k.slice(4)] || 0;
  if (k.startsWith('trait_')) return (G.tr[k.slice(6)] || {}).u ? 1 : 0;
  return G.c[k] || 0;
}

const Save = {
  KEY: 'eveil_traits_save', VER: 2,
  exists() { try { return !!localStorage.getItem(this.KEY); } catch (e) { return false; } },
  peek() { try { const d = JSON.parse(localStorage.getItem(this.KEY)); return d && d.p ? d : null; } catch (e) { return null; } },
  read() {
    let raw = null;
    try { raw = localStorage.getItem(this.KEY); if (!raw) return null; return this.migrate(JSON.parse(raw)); }
    catch (e) {
      console.error('Sauvegarde invalide', e);
      try { if (raw) localStorage.setItem(this.KEY + '_corrompue', raw); } catch (_) { }
      Hooks.toast('Sauvegarde illisible : une copie de secours a été conservée.', 'bad'); return null;
    }
  },
  // Fusionne avec un état neuf : les champs manquants (anciennes versions) sont comblés
  migrate(d) {
    if (!d || typeof d !== 'object' || !d.p || !d.p.base) throw new Error('format');
    const old = d.v || 1, m = deepMerge(newState(), d);
    if (old < 2) { // v1 -> v2 : on reconstitue les points répartis à la main
      const cl = CLASS(m.p.cls); m.p.alloc = {};
      for (const k of ['str', 'int', 'agi', 'end']) m.p.alloc[k] = Math.max(0, m.p.base[k] - cl.base[k] - ((cl.grow[k] || 0) * (m.p.lvl - 1)));
    }
    m.v = this.VER; return m;
  },
  save() {
    if (!G) return false;
    try { G.saved = Date.now(); localStorage.setItem(this.KEY, JSON.stringify(G)); return true; }
    catch (e) { Hooks.toast('Échec de sauvegarde (stockage plein ou bloqué).', 'bad'); return false; }
  },
  wipe() { try { localStorage.removeItem(this.KEY); } catch (e) { } },
  exportText() { return JSON.stringify(G); },
  importText(t) { const d = JSON.parse(t); G = this.migrate(d); this.save(); }
};

/* ---------- 4. STATS & OBJETS ---------- */
const Stats = {
  // Liste de toutes les sources d'effets actives (classe, style, traits, synergies, titre, objets, compétences, compagnon)
  list() {
    const L = [], cl = CLASS(G.p.cls), st = STYLE(G.p.style);
    L.push({ src: 'Classe · ' + cl.n, eff: cl.eff });
    L.push({ src: 'Style · ' + st.n, eff: st.eff });
    const og = ORIGINS.find(o => o.id === G.p.origin), bg = BACKGROUNDS.find(b => b.id === G.p.bg);
    if (og) L.push({ src: 'Origine · ' + og.n, eff: og.eff || {} }); if (bg) L.push({ src: 'Histoire · ' + bg.n, eff: bg.eff || {} });
    const pe = Paragon.eff(); if (pe) L.push({ src: 'Paragon ' + G.p.par.lvl, eff: pe });
    for (const t of TRAITS) if (G.tr[t.id] && G.tr[t.id].u) L.push({ src: 'Trait · ' + t.n, eff: t.eff });
    for (const s of SYNERGIES) if (s.ids.every(id => Traits.has(id))) L.push({ src: 'Synergie · ' + s.n, eff: s.eff });
    const ti = TITLES.find(t => t.id === G.title); if (ti && ti.eff) L.push({ src: 'Titre · ' + ti.n, eff: ti.eff });
    for (const slot of EQ_SLOTS) { const it = G.eq[slot]; if (it) for (const f of it.fx) L.push({ src: it.name + ' · ' + FX[f].n, eff: FX[f].eff }); }
    for (const id in G.sk) {
      const d = SK[id], r = G.sk[id];
      if (d && d.type === 'passive' && r > 0) { const e = {}; for (const k in d.eff) e[k] = d.eff[k] * r; L.push({ src: 'Compétence · ' + d.n + ' ' + r, eff: e }); }
    }
    const c = G.active && G.comp[G.active];
    if (c) for (const b of COMPS[G.active].bonds) if (c.bond >= b.b) L.push({ src: 'Lien · ' + COMPS[G.active].n, eff: b.eff });
    return L;
  },
  sum() {
    const E = {};
    for (const { eff } of this.list()) for (const k in eff) { const v = eff[k]; if (typeof v === 'number') E[k] = (E[k] || 0) + v; else E[k] = E[k] || v; }
    return E;
  },
  calc(withGear, withEff) {
    const E = withEff ? this.sum() : {}, p = G.p, gear = {};
    if (withGear) for (const s of EQ_SLOTS) { const it = G.eq[s]; if (it) for (const k in it.st) gear[k] = (gear[k] || 0) + it.st[k]; }
    const g = k => gear[k] || 0, e = k => E[k] || 0;
    const str = p.base.str + g('str'), int = p.base.int + g('int'), agi = p.base.agi + g('agi'), end = p.base.end + g('end'), lvl = p.lvl, all = e('allPct');
    return {
      str, int, agi, end, lvl,
      maxHp: Math.max(10, Math.round((40 + end * 6 + lvl * 8 + g('hp')) * (1 + e('hpPct') + all))),
      maxMp: Math.max(5, Math.round((20 + int * 4 + lvl * 3 + g('mp')) * (1 + e('mpPct')))),
      atk: Math.max(1, (lvl * 1.2 + str * 1.5 + agi * .4 + g('atk')) * (1 + e('atkPct') + all)),
      mag: Math.max(1, (int * 2 + lvl * 1.2 + g('atk')) * (1 + e('atkPct') + all)),
      def: Math.max(0, (end * .9 + str * .2 + g('def')) * (1 + e('defPct') + all)),
      spd: Math.max(1, 5 + agi * .5 + g('spd') + e('spdFlat')),
      crit: clamp(5 + agi * .25 + g('crit') + e('critFlat'), 0, 80),
      dodge: clamp(3 + agi * .2 + g('dodge') + e('dodgeFlat'), 0, 50),
      mres: Math.max(0, (int * .9 + end * .3 + g('mres')) * (1 + e('mresPct') + all)),
      prec: clamp(agi * .1 + g('prec') + e('precFlat'), 0, 60),
      pen: clamp(g('pen') + e('penFlat'), 0, 50),
      critDmg: 160 + e('critDmg') * 100,
      lifesteal: e('lifesteal') * 100, regen: e('regenTurn') * 100,
      sres: clamp(end * .4 + e('sresFlat'), 0, 60), find: e('lootLuck') * 100, healPow: e('healPct') * 100
    };
  },
  get() { return this.calc(true, true); },
  breakdown() { return { base: this.calc(false, false), gear: this.calc(true, false), final: this.calc(true, true) }; },
  clamp() { const S = this.get(); G.p.hp = clamp(Math.round(G.p.hp), 0, S.maxHp); G.p.mp = clamp(Math.round(G.p.mp), 0, S.maxMp); }
};
const effList = Stats.list.bind(Stats);

function tierName(ilvl) { let n = TIERS[0][1]; for (const [l, t] of TIERS) if (ilvl >= l) n = t; return n; }
function recalcItem(it) {
  it.st = {};
  for (const k in it.b0) it.st[k] = Math.round(it.b0[k] * (1 + .08 * it.up));
  for (const k in it.xtra) it.st[k] = (it.st[k] || 0) + it.xtra[k];
}
function genItem(o = {}) {
  const ilvl = Math.max(1, Math.round(o.ilvl || 1));
  const r = o.r !== undefined ? o.r : rollRarity(o.luck || 0, o.minR || 0), R = RARITIES[r];
  const slot = o.slot || pick(Object.keys(ITEM_BASES)), list = ITEM_BASES[slot];
  const b = (o.cat && list.find(x => x.cat === o.cat)) || pick(list);
  const B = (4 + ilvl * 1.6) * R.m, st = {};
  for (const k in b.main) st[k] = Math.max(1, Math.round(B * b.main[k] * rnd(.92, 1.08)));
  let n = R.aff + (slot === 'acc' ? 2 : 0), guard = 40; const cand = [...b.bias];
  while (n > 0 && guard-- > 0) {
    const k = cand.length ? cand.shift() : pick(STAT_POOL);
    if (st[k] !== undefined) continue;
    st[k] = Math.max(1, Math.round(B * AFF[k] * rnd(.8, 1.2))); n--;
  }
  let fx = [];
  if (o.fx) fx = [...o.fx];
  else {
    if (r === 3 && chance(.4)) fx.push(pick(FX_MINOR));
    if (r === 4) fx.push(pick(FX_LEG));
    if (r === 5) { fx.push(pick(FX_MYTH)); if (chance(.5)) fx.push(pick(FX_LEG)); }
    if (r === 6) { fx.push(pick(FX_SEC)); fx.push(pick(FX_MYTH)); }
  }
  let name;
  if (r >= 4) name = `${b.n} « ${pick(r === 4 ? LEG_NAMES : r === 5 ? MYTH_NAMES : SEC_NAMES)} »`;
  else if (r >= 2) name = `${b.n} ${tierName(ilvl)} ${pick(EPITHETS)}`;
  else name = `${b.n} ${tierName(ilvl)}`;
  if (o.name) name = o.name;
  const it = {
    id: uid(), slot, base: b.n, cat: b.cat || null, ico: b.i, name, r, ilvl, b0: Object.assign({}, st), st: Object.assign({}, st),
    up: 0, xtra: {}, fx, val: Math.round((6 + ilvl * 3) * R.p), desc: pick(FLAVOR[slot] || FLAVOR.def)
  };
  return it;
}
const itemValue = it => Math.round(it.val * (1 + it.up * .35));
const sellPrice = it => Math.max(1, Math.round(itemValue(it) * .5));
const buyPrice = it => Math.max(5, Math.round(itemValue(it) * 2.4 * (1 - clamp(Stats.sum().shopDisc || 0, 0, .5))));
function bossUnique(id, lvl) {
  const u = BOSSES[id].uniq;
  return genItem({ ilvl: lvl + 3, r: u.r, slot: u.slot, cat: u.cat, name: u.name, fx: u.fx });
}

const Mats = {
  add(id, n) { G.mats[id] = (G.mats[id] || 0) + n; bump('matsGathered', n); bump('m_' + id, n); },
  has(need) { return Object.keys(need).every(k => (G.mats[k] || 0) >= need[k]); },
  take(need) { for (const k in need) G.mats[k] -= need[k]; }
};

const Player = {
  addXp(n) {
    n = Math.round(n); if (n <= 0) return 0;
    if (G.p.lvl >= MAXLVL) { Paragon.addXp(n); return 0; } // niveau max : l'XP alimente le Paragon
    G.p.xp += n; let ups = 0;
    while (G.p.lvl < MAXLVL && G.p.xp >= xpNeeded(G.p.lvl)) { G.p.xp -= xpNeeded(G.p.lvl); G.p.lvl++; ups++; this.levelUp(); }
    if (G.p.lvl >= MAXLVL) G.p.xp = 0;
    return ups;
  },
  levelUp() {
    const cl = CLASS(G.p.cls), l = G.p.lvl;
    for (const k in cl.grow) G.p.base[k] += cl.grow[k];
    G.p.pts += 3; G.p.sp += 1; G.p.gold += l * 10;
    const ms = MILESTONES[l];
    if (ms) { // palier : bonus permanents + récompenses
      for (const k of ['str', 'int', 'agi', 'end']) { G.p.base[k] += 2; G.p.alloc[k] = (G.p.alloc[k] || 0) + 0; }
      G.p.sp += ms.sp; Player.gold(ms.gold, 'neutral'); bump('milestones');
      const it = genItem({ ilvl: l, r: ms.minR }); Inv.add(it, 'quest');
      Hooks.toast(`Palier ${l} — ${ms.n} : +2 à toutes les caractéristiques, +${ms.sp} point(s) de compétence, ${fmt(ms.gold)} or, ${it.name}`, 'trait');
    }
    const S = Stats.get(); G.p.hp = S.maxHp; G.p.mp = S.maxMp;
    Hooks.levelUp(l);
  },
  heal(n) { const S = Stats.get(), b = G.p.hp; G.p.hp = clamp(G.p.hp + Math.round(n), 0, S.maxHp); return G.p.hp - b; },
  restoreMp(n) { const S = Stats.get(), b = G.p.mp; G.p.mp = clamp(G.p.mp + Math.round(n), 0, S.maxMp); return G.p.mp - b; },
  spend(stat) {
    if (G.p.pts <= 0 || !(stat in G.p.base)) return false;
    G.p.base[stat]++; G.p.alloc[stat] = (G.p.alloc[stat] || 0) + 1; G.p.pts--; bump('spent'); return true;
  },
  gold(n, src) { G.p.gold += n; if (n > 0 && src !== 'neutral') bump('goldEarned', n); }
};

const Inv = {
  MAX: 60,
  add(it, src) {
    if (G.inv.length >= this.MAX) {
      const worst = [...G.inv].sort((a, b) => a.r - b.r || a.val - b.val)[0];
      if (worst.r <= it.r) { this.remove(worst.id); Player.gold(sellPrice(worst), 'neutral'); Hooks.toast(`Inventaire plein : ${worst.name} vendu automatiquement.`); }
      else { Player.gold(sellPrice(it), 'neutral'); Hooks.toast('Inventaire plein : butin vendu automatiquement.'); return false; }
    }
    G.inv.push(it);
    if (src !== 'shop') { bump('itemsFound'); if (it.r >= 2) bump('rareDrops'); if (it.r >= 3) bump('epicFound'); if (it.r === 6) bump('secretFound'); }
    return true;
  },
  remove(id) { const i = G.inv.findIndex(x => x.id === id); return i >= 0 ? G.inv.splice(i, 1)[0] : null; },
  find(id) { return G.inv.find(x => x.id === id) || Object.values(G.eq).find(x => x && x.id === id); },
  equip(id) {
    if (G.flags.inCombat) return;
    const it = G.inv.find(x => x.id === id); if (!it) return;
    let slot = it.slot; if (slot === 'acc') slot = !G.eq.acc1 ? 'acc1' : !G.eq.acc2 ? 'acc2' : 'acc1';
    const old = G.eq[slot]; this.remove(id); G.eq[slot] = it; if (old) G.inv.push(old); bump('equips');
    Game.sync();
  },
  unequip(slot) {
    if (G.flags.inCombat) return;
    const it = G.eq[slot]; if (!it) return;
    if (G.inv.length >= this.MAX) { Hooks.toast('Inventaire plein.', 'bad'); return; }
    delete G.eq[slot]; G.inv.push(it); Game.sync();
  },
  sell(id) {
    const it = this.remove(id); if (!it) return 0;
    const p = sellPrice(it); Player.gold(p); bump('sold'); Game.sync(); return p;
  },
  sellBelow(maxR) {
    let tot = 0, n = 0;
    for (const it of [...G.inv]) if (it.r <= maxR) { this.remove(it.id); tot += sellPrice(it); n++; bump('sold'); }
    Player.gold(tot); Game.sync(); return { tot, n };
  }
};

/* ---------- 5. TRAITS / TITRES / SUCCÈS / QUÊTES ---------- */
/* Un trait = objectifs (g) vérifiés par val(compteur) + effet passif réel (eff).
   hidden : nom et conditions masqués jusqu'à la première progression liée. */
const TCAT = { combat: 'Combat', survie: 'Survie', exploration: 'Exploration', equipement: 'Équipement', social: 'Social', secret: 'Secrets', maudit: 'Maudits & légendaires' };
const T = (id, n, cat, r, d, g, eff, x = {}) => Object.assign({ id, n, cat, r, d, g, eff }, x);
const TRAITS = [
  T('sans_pitie', 'Sans pitié', 'combat', 1, 'Chaque victoire sans reculer forge un cœur plus dur.', [{ c: 'streakBest', n: 30, l: 'victimes d’affilée sans fuir' }], { atkPct: .05, critFlat: 3 }),
  T('esquiveur', 'Esquiveur', 'combat', 1, 'Les coups vous frôlent sans jamais vous toucher.', [{ c: 'dodges', n: 50, l: 'esquives réussies' }], { dodgeFlat: 5 }),
  T('maitre_armes', 'Maître des armes', 'combat', 2, 'Toutes les armes ont un secret, vous les connaissez.', [{ c: 'wcatsDistinct', n: 5, l: 'catégories d’armes utilisées pour vaincre' }], { atkPct: .06, critFlat: 2 }),
  T('tueur_geants', 'Tueur de géants', 'combat', 2, 'Plus l’adversaire est grand, plus sa chute est belle.', [{ c: 'giantKills', n: 1, l: 'boss de niveau +4 ou plus vaincu' }], { dmgBossPct: .15 }),
  T('oeil_lynx', 'Œil de lynx', 'combat', 1, 'Vous voyez la faille avant même qu’elle n’apparaisse.', [{ c: 'crits', n: 100, l: 'coups critiques' }], { critFlat: 5 }),
  T('executeur', 'Exécuteur', 'combat', 2, 'Vous savez quand achever. Le Finisseur gagne en portée.', [{ c: 'finishers', n: 10, l: 'Finisseurs réussis' }], { finTh: .10, critDmg: .2 }),
  T('maitre_maux', 'Maître des maux', 'combat', 2, 'Poison, feu, glace : vos altérations s’imposent.', [{ c: 'statusApplied', n: 60, l: 'altérations infligées' }], { statusChance: .12, dotPct: .2 }),
  T('eclair', 'Éclair', 'combat', 2, 'Le combat est fini avant d’avoir commencé.', [{ c: 'fastWins', n: 10, l: 'victoires en 3 tours ou moins' }], { spdFlat: 4, firstStrike: true }),
  T('invocateur', 'Maître des os', 'combat', 2, 'Les morts répondent à votre appel, plus nombreux, plus forts.', [{ c: 'summonsUsed', n: 15, l: 'invocations lancées' }], { summonPct: .3, onKillMp: 3 }),

  T('survivant', 'Survivant', 'survie', 1, 'Frôler la mort a laissé une force en vous.', [{ c: 'lowHpWins', n: 1, l: 'victoire avec moins de 10 % de PV' }], { hpPct: .08, regenPost: .05 }),
  T('endurci', 'Endurci', 'survie', 2, 'Les coups vous ont durci la peau et l’âme.', [{ c: 'dmgTaken', n: 4000, l: 'dégâts subis' }, { c: 'battlesWon', n: 25, l: 'combats survécus' }], { defPct: .08, dmgTakenPct: -.03 }),
  T('dernier_rempart', 'Dernier rempart', 'survie', 3, 'Quand tout semble perdu, votre garde tient.', [{ c: 'lastStands', n: 3, l: 'coups fatals évités' }], { defendBonus: .15, regenPost: .03 }),
  T('increvable', 'Increvable', 'survie', 1, 'Votre estomac supporte toutes les potions.', [{ c: 'potions', n: 20, l: 'potions utilisées' }], { potionPct: .3 }),
  T('intouchable', 'Intouchable', 'survie', 2, 'Pas une égratignure.', [{ c: 'flawlessWins', n: 10, l: 'combats sans aucun dégât' }], { dodgeFlat: 3, defPct: .05 }),
  T('revenant', 'Revenant', 'survie', 2, 'La mort vous connaît, et elle vous laisse repartir.', [{ c: 'deaths', n: 5, l: 'défaites subies' }], { deathMit: .5, hpPct: .05 }),

  T('chasseur_tresors', 'Chasseur de trésors', 'exploration', 1, 'Votre flair repère l’or sous la poussière.', [{ c: 'hiddenChests', n: 5, l: 'coffres cachés découverts' }], { lootLuck: .12 }),
  T('globe_trotteur', 'Globe-trotteur', 'exploration', 1, 'Chaque route vous apprend quelque chose.', [{ c: 'zonesVisited', n: 4, l: 'zones visitées' }, { c: 'explorations', n: 60, l: 'explorations' }], { xpPct: .05, spdFlat: 2 }),
  T('chance_insolente', 'Chance insolente', 'exploration', 2, 'Le destin vous sourit, avec insolence.', [{ c: 'rareDrops', n: 5, l: 'objets rares (ou mieux) obtenus' }], { lootLuck: .15, goldPct: .05 }),
  T('predateur', 'Prédateur nocturne', 'exploration', 2, 'La nuit est votre terrain de chasse.', [{ c: 'nightKills', n: 25, l: 'ennemis vaincus en zone nocturne' }], { critFlat: 4, nightAtk: .12 }),
  T('cartographe', 'Cartographe', 'exploration', 2, 'Plus un recoin ne vous est inconnu.', [{ c: 'zonesFull', n: 3, l: 'zones explorées à 100 %' }], { xpPct: .06 }),
  T('cueilleur', 'Cueilleur', 'exploration', 1, 'Vous connaissez chaque herbe et chaque filon.', [{ c: 'matsGathered', n: 60, l: 'matériaux récoltés' }], { upgBonus: .05, regenPost: .02 }),
  T('eclaireur', 'Éclaireur', 'exploration', 1, 'Lyra vous a appris à lire les traces.', [{ c: 'q_S7', n: 1, l: 'quête « Vengeance de Lyra » accomplie' }], { spdFlat: 2, dodgeFlat: 2, xpPct: .03 }),

  T('forgeron', 'Forgeron', 'equipement', 2, 'Le marteau est devenu une extension de votre bras.', [{ c: 'crafted', n: 5, l: 'équipements fabriqués' }, { c: 'upgrades', n: 10, l: 'améliorations réussies' }], { upgBonus: .10 }),
  T('parure', 'Parure complète', 'equipement', 3, 'De la tête aux pieds, tout brille.', [{ c: 'equipRare', n: 9, l: 'emplacements équipés en Rare ou mieux' }], { allPct: .05 }),
  T('marchand_avise', 'Marchand avisé', 'equipement', 1, 'Vous savez ce que vaut chaque chose.', [{ c: 'sold', n: 30, l: 'objets vendus' }], { shopDisc: .10, goldPct: .05 }),
  T('chasseur_reliques', 'Chasseur de reliques', 'equipement', 2, 'Les reliques viennent à vous.', [{ c: 'epicFound', n: 3, l: 'objets Épiques (ou mieux) trouvés' }], { lootLuck: .15 }),
  T('magnat', 'Magnat', 'equipement', 2, 'L’or appelle l’or.', [{ c: 'goldEarned', n: 5000, l: 'or gagné' }], { goldPct: .15 }),

  T('pacifiste', 'Pacifiste', 'social', 2, 'La parole désarme plus sûrement que l’épée.', [{ c: 'pacified', n: 5, l: 'rencontres résolues sans combat' }], { peaceBonus: .25, defPct: .03 }),
  T('bras_couronne', 'Bras armé de la Couronne', 'social', 2, 'Le royaume vous tient pour un champion.', [{ c: 'rep_couronne', n: 150, l: 'réputation auprès de la Couronne' }], { defPct: .06, shopDisc: .05 }),
  T('frere_armes', 'Frère d’armes', 'social', 2, 'Un lien solide vous unit à votre compagnon.', [{ c: 'maxBond', n: 50, l: 'lien avec un compagnon' }], { companionPct: .25 }),
  T('bon_coeur', 'Bon cœur', 'social', 1, 'La bonté vous vaut des soins plus efficaces.', [{ c: 'kind', n: 5, l: 'choix altruistes' }], { healPct: .15, xpPct: .03 }),
  T('racines', 'Fidèle à ses origines', 'social', 1, 'Votre passé vous rattrape — et vous sert.', [{ c: 'originEv', n: 2, l: 'événements liés à votre origine ou votre histoire' }], { xpPct: .03, healPct: .05 }),
  T('heros', 'Héros du royaume', 'social', 2, 'Votre nom circule dans les tavernes.', [{ c: 'questsDone', n: 12, l: 'quêtes accomplies' }], { xpPct: .05, goldPct: .05 }),

  T('funambule', 'Funambule des deux mondes', 'secret', 4, 'Jour ou nuit, le monde plie sous vos pas.', [{ c: 'dayKills', n: 30, l: 'victimes en zone diurne' }, { c: 'nightKills', n: 30, l: 'victimes en zone nocturne' }, { c: 'hiddenChests', n: 3, l: 'coffres cachés' }], { critFlat: 4, atkPct: .06, dodgeFlat: 4 }, { hidden: true, hint: 'Un équilibre entre lumière et ténèbres…' }),
  T('ombre_pure', 'Ombre silencieuse', 'secret', 4, 'Un fantôme sans éclat, que nul ne voit venir.', [{ c: 'flawlessWins', n: 15, l: 'combats sans dégât' }, { c: 'pacified', n: 3, l: 'rencontres pacifiées' }, { c: 'dodges', n: 80, l: 'esquives' }], { dodgeFlat: 8, firstStrike: true }, { hidden: true, hint: 'Se faire oublier est un art.' }),
  T('eveil', 'Éveillé', 'secret', 5, 'Une voix ancienne vous a murmuré votre vrai nom.', [{ c: 'oracle', n: 1, l: 'prophétie de l’Oracle entendue' }, { c: 'level', n: 15, l: 'niveau atteint' }, { c: 'traitsCount', n: 10, l: 'traits éveillés' }], { allPct: .08, xpPct: .10 }, { hidden: true, hint: 'Quelqu’un, quelque part, attend que vous soyez prêt.' }),
  T('venin_pur', 'Maître des poisons', 'secret', 3, 'Vos ennemis tombent sans comprendre pourquoi.', [{ c: 'dotKills', n: 20, l: 'ennemis achevés par une altération' }], { dotPct: .5, hitPoison: .15 }, { hidden: true, hint: 'Laisser le temps faire son œuvre…' }),

  T('pacte_sang', 'Pacte de sang', 'maudit', 4, 'Votre sang appartient à quelqu’un d’autre, désormais.', [{ c: 'bloodPact', n: 1, l: 'pacte scellé sur un autel sombre' }], { lifesteal: .08, healPct: -.2 }, { hidden: true, hint: 'Certains autels réclament un prix.' }),
  T('maudit', 'Maudit', 'maudit', 3, 'Survivre au mal vous a transformé.', [{ c: 'cursedWins', n: 1, l: 'victoire sous 3 altérations (ou plus)' }], { atkPct: .12, hpPct: -.06 }),
  T('legende', 'Légende vivante', 'maudit', 5, 'Les bardes chantent déjà votre nom.', [{ c: 'bossesDistinct', n: 7, l: 'boss différents vaincus' }, { c: 'level', n: 25, l: 'niveau atteint' }], { allPct: .10 }),
  T('fleau_dieux', 'Fléau des dieux', 'maudit', 5, 'Même le Dévoreur a fini par plier.', [{ c: 'bk_devoreur_n', n: 1, l: 'Dévoreur vaincu en Cauchemar' }], { atkPct: .15, critFlat: 5, dmgBossPct: .10 }, { hidden: true, hint: 'Un défi que presque personne n’ose relever.' })
];
const TRAIT = id => TRAITS.find(t => t.id === id);
const SYNERGIES = [
  { ids: ['esquiveur', 'survivant'], n: 'Roseau indomptable', d: '+6 % PV, +3 % esquive', eff: { hpPct: .06, dodgeFlat: 3 } },
  { ids: ['tueur_geants', 'executeur'], n: 'Bourreau de titans', d: '+20 % dégâts contre les boss', eff: { dmgBossPct: .2 } },
  { ids: ['maudit', 'pacte_sang'], n: 'Sang maudit', d: '+10 % attaque, +4 % vol de vie', eff: { atkPct: .10, lifesteal: .04 } },
  { ids: ['pacifiste', 'bon_coeur'], n: 'Âme sainte', d: '+20 % soins reçus, +10 % XP', eff: { healPct: .2, xpPct: .10 } },
  { ids: ['forgeron', 'cueilleur'], n: 'Maître artisan', d: '+10 % réussite d’amélioration', eff: { upgBonus: .10 } },
  { ids: ['chasseur_tresors', 'chance_insolente'], n: 'Fortune du pillard', d: '+20 % chance de butin rare', eff: { lootLuck: .2 } },
  { ids: ['predateur', 'funambule'], n: 'Chasseur crépusculaire', d: '+8 % attaque la nuit, +3 % critique', eff: { nightAtk: .08, critFlat: 3 } },
  { ids: ['dernier_rempart', 'endurci'], n: 'Muraille vivante', d: '−5 % dégâts subis, +10 % défense', eff: { dmgTakenPct: -.05, defPct: .10 } }
];

const Traits = {
  has(id) { return !!(G.tr[id] && G.tr[id].u); },
  prog(t) { return t.g.map(g => ({ cur: Math.min(val(g.c), g.n), n: g.n, l: g.l })); },
  ratio(t) { const p = this.prog(t); return p.reduce((s, x) => s + x.cur / x.n, 0) / p.length; },
  check() {
    for (const t of TRAITS) {
      const s = G.tr[t.id] || (G.tr[t.id] = {});
      if (s.u) continue;
      const pr = this.prog(t);
      if (t.hidden && !s.seen && pr.some(x => x.cur > 0)) { s.seen = true; Hooks.toast('Un trait caché s’éveille dans l’ombre… (journal des traits)', 'trait'); }
      if (pr.every(x => x.cur >= x.n)) this.unlock(t.id);
    }
  },
  unlock(id) {
    const t = TRAIT(id); if (!t) return;
    const s = G.tr[id] || (G.tr[id] = {}); if (s.u) return;
    s.u = true; s.seen = true; s.at = Date.now();
    Hooks.traitUnlocked(t); Stats.clamp();
  }
};

/* Titres : bonus passifs ; certains sont secrets */
const TITLES = [
  { id: 'recrue', n: 'Recrue', d: 'Titre de départ.', g: [], eff: {} },
  { id: 'fleau_gobelins', n: 'Fléau des Gobelins', d: 'Vaincre 25 gobelins.', g: [{ c: 'k_gobelin', n: 25, l: 'gobelins vaincus' }], eff: { atkPct: .03 } },
  { id: 'chevalier', n: 'Chevalier de la Couronne', d: 'Réputation 100 auprès de la Couronne.', g: [{ c: 'rep_couronne', n: 100, l: 'réputation Couronne' }], eff: { defPct: .05 } },
  { id: 'archimage', n: 'Archimage initié', d: 'Réputation 100 auprès du Cercle Arcanique.', g: [{ c: 'rep_cercle', n: 100, l: 'réputation Cercle' }], eff: { mpPct: .10 } },
  { id: 'lame_ombre', n: 'Lame de l’Ombre', d: 'Réputation 100 auprès de la Guilde des Ombres.', g: [{ c: 'rep_ombres', n: 100, l: 'réputation Ombres' }], eff: { critFlat: 3 } },
  { id: 'ami_sylve', n: 'Ami de la Sylve', d: 'Réputation 100 auprès des Gardiens de la Sylve.', g: [{ c: 'rep_sylve', n: 100, l: 'réputation Sylve' }], eff: { regenPost: .03 } },
  { id: 'tueur_dragon', n: 'Tueur de dragon', d: 'Vaincre le Dragon de Cristal.', g: [{ c: 'bk_dragon', n: 1, l: 'dragon vaincu' }], eff: { dmgBossPct: .10 } },
  { id: 'sans_peur', n: 'Sans peur', d: 'Terminer un donjon en Cauchemar.', g: [{ c: 'dungNight', n: 1, l: 'donjon Cauchemar terminé' }], eff: { hpPct: .05 } },
  { id: 'ressuscite', n: 'Le Ressuscité', d: 'Secret.', secret: true, g: [{ c: 'deaths', n: 3, l: 'défaites' }, { c: 'battlesWon', n: 50, l: 'victoires' }], eff: { deathMit: .25 } },
  { id: 'chanceux', n: 'Chanceux absolu', d: 'Secret.', secret: true, g: [{ c: 'secretFound', n: 1, l: 'objet Secret trouvé' }], eff: { lootLuck: .2 } },
  { id: 'eveille_t', n: 'Éveillé', d: 'Secret.', secret: true, g: [{ c: 'trait_eveil', n: 1, l: 'trait Éveillé' }], eff: { xpPct: .05, allPct: .03 } },
  { id: 'veteran_t', n: 'Vétéran', d: 'Atteindre le niveau 25.', g: [{ c: 'level', n: 25, l: 'niveau' }], eff: { hpPct: .02 } },
  { id: 'champion_t', n: 'Champion', d: 'Atteindre le niveau 50.', g: [{ c: 'level', n: 50, l: 'niveau' }], eff: { atkPct: .02, defPct: .02 } },
  { id: 'heros_t', n: 'Héros du royaume', d: 'Atteindre le niveau 100.', g: [{ c: 'level', n: 100, l: 'niveau' }], eff: { hpPct: .03, xpPct: .03 } },
  { id: 'legende_t', n: 'Légende', d: 'Atteindre le niveau 150.', g: [{ c: 'level', n: 150, l: 'niveau' }], eff: { atkPct: .03, critFlat: 2 } },
  { id: 'mythe_t', n: 'Mythe vivant', d: 'Atteindre le niveau 200.', g: [{ c: 'level', n: 200, l: 'niveau' }], eff: { allPct: .02, lootLuck: .05 } },
  { id: 'apogee_t', n: 'Apogée', d: 'Atteindre le niveau 250.', g: [{ c: 'level', n: 250, l: 'niveau' }], eff: { allPct: .03, dmgBossPct: .05 } },
  { id: 'parangon', n: 'Parangon pacifique', d: 'Secret.', secret: true, g: [{ c: 'pacified', n: 15, l: 'rencontres pacifiées' }], eff: { peaceBonus: .3, healPct: .1 } }
];
const Titles = {
  check() {
    for (const t of TITLES) {
      if (G.titles[t.id]) continue;
      if (t.g.every(g => val(g.c) >= g.n)) { G.titles[t.id] = true; Hooks.titleUnlocked(t); }
    }
  },
  set(id) { if (G.titles[id]) { G.title = id; Game.sync(); } }
};

/* Succès */
const ACHS = [
  { id: 'a_k1', n: 'Premier sang', g: [{ c: 'kills', n: 1 }], gold: 20 }, { id: 'a_k50', n: 'Chasseur', g: [{ c: 'kills', n: 50 }], gold: 100 },
  { id: 'a_k250', n: 'Massacreur', g: [{ c: 'kills', n: 250 }], gold: 400 }, { id: 'a_k1000', n: 'Fléau', g: [{ c: 'kills', n: 1000 }], gold: 1500 },
  { id: 'a_b1', n: 'Tueur de boss', g: [{ c: 'killsBoss', n: 1 }], gold: 150 }, { id: 'a_b7', n: 'Chasseur de légendes', g: [{ c: 'bossesDistinct', n: 7 }], gold: 2000 },
  { id: 'a_l10', n: 'Aventurier confirmé', g: [{ c: 'level', n: 10 }], gold: 200 }, { id: 'a_l25', n: 'Vétéran', g: [{ c: 'level', n: 25 }], gold: 800 }, { id: 'a_l50', n: 'Au sommet', g: [{ c: 'level', n: 50 }], gold: 5000 },
  { id: 'a_c10', n: 'Pilleur', g: [{ c: 'chests', n: 10 }], gold: 150 }, { id: 'a_t5', n: 'En éveil', g: [{ c: 'traitsCount', n: 5 }], gold: 250 },
  { id: 'a_t15', n: 'Pleinement éveillé', g: [{ c: 'traitsCount', n: 15 }], gold: 1000 }, { id: 'a_t30', n: 'Maître des traits', g: [{ c: 'traitsCount', n: 30 }], gold: 4000 },
  { id: 'a_d1', n: 'Mort et revenu', g: [{ c: 'deaths', n: 1 }], gold: 10 }, { id: 'a_cr', n: 'Artisan', g: [{ c: 'crafted', n: 3 }], gold: 120 },
  { id: 'a_up', n: 'Perfectionniste', g: [{ c: 'upgrades', n: 15 }], gold: 300 }, { id: 'a_q10', n: 'Serviable', g: [{ c: 'questsDone', n: 10 }], gold: 300 },
  { id: 'a_pa', n: 'Voie de la paix', g: [{ c: 'pacified', n: 10 }], gold: 300 }, { id: 'a_dn', n: 'Cauchemar vaincu', g: [{ c: 'dungNight', n: 1 }], gold: 1500 },
  { id: 'a_g10k', n: 'Fortuné', g: [{ c: 'goldEarned', n: 10000 }], gold: 1000 }, { id: 'a_rare', n: 'Œil pour l’éclat', g: [{ c: 'epicFound', n: 1 }], gold: 200 }
];
const Achv = {
  check() {
    for (const a of ACHS) if (!G.ach[a.id] && a.g.every(g => val(g.c) >= g.n)) { G.ach[a.id] = true; Player.gold(a.gold); Hooks.achUnlocked(a); }
  }
};

/* Factions */
const FACTIONS = { couronne: ['Garde de la Couronne', '👑'], cercle: ['Cercle Arcanique', '🔮'], ombres: ['Guilde des Ombres', '🗝️'], sylve: ['Gardiens de la Sylve', '🌳'] };
const repTier = v => v < -30 ? 'Hostile' : v < 30 ? 'Neutre' : v < 100 ? 'Amical' : v < 200 ? 'Honoré' : 'Révéré';
function addRep(f, n) { G.rep[f] = clamp((G.rep[f] || 0) + n, -100, 300); }

/* Quêtes : objectifs mesurés par des compteurs ; abs = depuis le début de la partie */
const Q = (id, type, n, d, c, cn, rew, x = {}) => Object.assign({ id, type, n, d, obj: { c, n: cn }, rew }, x);
const QUESTS = [
  Q('M1', 'main', 'Premiers pas', 'Remportez 3 combats dans les Plaines d’Aube.', 'battlesWon', 3, { xp: 60, gold: 50, cons: { potion_hp: 2 } }, { abs: true }),
  Q('M2', 'main', 'Lisière de la forêt', 'Vainquez 8 ennemis dans la Forêt Murmurante.', 'kz_foret', 8, { xp: 200, gold: 120, items: [{ minR: 1 }], rep: { sylve: 5 } }, { abs: true, req: { q: 'M1', lvl: 3 } }),
  Q('M3', 'main', 'Le Roi Gobelin', 'Terrassez (ou raisonnez) le Roi Gobelin dans son terrier.', 'bk_gobelin_roi', 1, { xp: 400, gold: 200, items: [{ minR: 2 }], rep: { couronne: 20 } }, { abs: true, req: { q: 'M2' } }),
  Q('M4', 'main', 'Le Cœur de la forêt', 'Éliminez la Reine Araignée Shéléa.', 'bk_araignee_reine', 1, { xp: 800, gold: 350, items: [{ minR: 2 }], rep: { sylve: 15 } }, { abs: true, req: { q: 'M3' } }),
  Q('M5', 'main', 'Les Marais maudits', 'Vainquez la Sorcière du Marais.', 'bk_sorciere', 1, { xp: 1500, gold: 600, items: [{ minR: 3 }], rep: { cercle: 20 } }, { abs: true, req: { q: 'M4' } }),
  Q('M6', 'main', 'La Forge obsidienne', 'Éteignez le Golem de Magma.', 'bk_golem_magma', 1, { xp: 3000, gold: 1000, items: [{ minR: 3 }], rep: { couronne: 20 } }, { abs: true, req: { q: 'M5' } }),
  Q('M7', 'main', 'La Crypte oubliée', 'Détruisez le Seigneur Liche.', 'bk_liche', 1, { xp: 5500, gold: 1600, items: [{ minR: 3 }], rep: { cercle: 25 } }, { abs: true, req: { q: 'M6' } }),
  Q('M8', 'main', 'Le Palais de Cristal', 'Abattez le Dragon de Cristal.', 'bk_dragon', 1, { xp: 9000, gold: 2500, items: [{ minR: 4 }], rep: { couronne: 30 } }, { abs: true, req: { q: 'M7' } }),
  Q('M9', 'main', 'Le Dévoreur d’Éveil', 'Affrontez la source de tous les maux.', 'bk_devoreur', 1, { xp: 16000, gold: 5000, items: [{ minR: 5 }] }, { abs: true, req: { q: 'M8' } }),

  Q('S1', 'side', 'Herboriste', 'Récoltez 8 herbes médicinales.', 'm_herb', 8, { xp: 70, gold: 40, cons: { potion_hp: 2 } }),
  Q('S2', 'side', 'Chasseur de trésors', 'Découvrez 3 coffres cachés.', 'hiddenChests', 3, { xp: 120, gold: 100, items: [{ minR: 1 }] }),
  Q('S3', 'side', 'Danse de l’esquive', 'Esquivez 15 attaques.', 'dodges', 15, { xp: 100, gold: 60 }),
  Q('S4', 'side', 'Parler aux bêtes', 'Apaisez 2 créatures sans combattre.', 'pacified', 2, { xp: 150, gold: 80, rep: { sylve: 15 } }),
  Q('S5', 'side', 'Forgeron novice', 'Fabriquez un équipement à l’atelier.', 'crafted', 1, { xp: 120, gold: 50, mats: { ore: 3 } }),
  Q('S6', 'side', 'Orfèvre', 'Améliorez 3 fois un équipement.', 'upgrades', 3, { xp: 200, gold: 150 }),
  Q('S7', 'side', 'Vengeance de Lyra', 'Vainquez 6 araignées pour Lyra (compagnon recruté).', 'k_araignee', 6, { xp: 400, gold: 200, bond: 20, trait: 'eclaireur' }, { req: { comp: 'lyra' } }),
  Q('S8', 'side', 'Chasse nocturne', 'Vainquez 10 ennemis en zone nocturne.', 'nightKills', 10, { xp: 500, gold: 250, items: [{ minR: 2 }], rep: { ombres: 10 } }, { req: { lvl: 7 } }),
  Q('S9', 'side', 'Pillards', 'Vainquez 10 gobelins pillards.', 'k_gobelin', 10, { xp: 130, gold: 90, rep: { couronne: 8 } }),
  Q('S10', 'side', 'Coups d’éclat', 'Infligez 25 coups critiques.', 'crits', 25, { xp: 160, gold: 100 }),
  Q('S11', 'side', 'Le colis suspect', 'Remportez 5 combats en transportant le colis du garde. Choisissez : le livrer… ou le garder.', 'battlesWon', 5, { xp: 220, gold: 100 }, {
    choices: [{ t: 'Livrer à la Garde (+20 réputation Couronne)', rew: { rep: { couronne: 20 }, gold: 60 } }, { t: 'Le garder pour les Ombres (+20 réputation Ombres, +200 or)', rew: { rep: { ombres: 20, couronne: -10 }, gold: 200 } }], req: { lvl: 4 }
  }),

  Q('D1', 'daily', 'Nettoyage quotidien', 'Vainquez 10 ennemis.', 'kills', 10, { xp: 120, gold: 80 }),
  Q('D2', 'daily', 'Fouille quotidienne', 'Ouvrez 1 coffre.', 'chests', 1, { xp: 80, gold: 60, mats: { ore: 2 } }),
  Q('D3', 'daily', 'Collecte d’or', 'Gagnez 150 pièces d’or.', 'goldEarned', 150, { xp: 90, gold: 50 }),
  Q('D4', 'daily', 'Série de victoires', 'Remportez 4 combats.', 'battlesWon', 4, { xp: 110, gold: 70, cons: { potion_hp: 1 } })
];
const QUEST = id => QUESTS.find(q => q.id === id);
const Daily = { ensure() { if (G.daily.date !== today()) G.daily = { date: today(), q: {} }; } };
const Quests = {
  store(q) { return q.type === 'daily' ? G.daily.q : G.q; },
  reqOK(q) {
    const r = q.req; if (!r) return true;
    if (r.lvl && G.p.lvl < r.lvl) return false;
    if (r.q && !(G.q[r.q] && G.q[r.q].s === 'done')) return false;
    if (r.comp && !(G.comp[r.comp] && G.comp[r.comp].rec)) return false;
    return true;
  },
  cur(q) { const s = this.store(q)[q.id]; if (!s) return 0; return clamp(val(q.obj.c) - s.b, 0, q.obj.n); },
  status(q) {
    const s = this.store(q)[q.id];
    if (!s) return this.reqOK(q) ? 'avail' : 'locked';
    if (s.s === 'done') return 'done';
    return this.cur(q) >= q.obj.n ? 'ready' : 'active';
  },
  accept(id) { const q = QUEST(id); if (!q || this.status(q) !== 'avail') return; this.store(q)[id] = { s: 'active', b: q.abs ? 0 : val(q.obj.c) }; bump('qAccepted'); Game.sync(); },
  claim(id, choice) {
    const q = QUEST(id); if (!q || this.status(q) !== 'ready') return null;
    if (q.choices && choice === undefined) return null;
    const lines = Game.reward(q.rew, 'quête');
    if (q.choices) lines.push(...Game.reward(q.choices[choice].rew, 'choix'));
    this.store(q)[id].s = 'done'; bump('questsDone'); bump('q_' + id);
    Game.sync(); return lines;
  }
};

/* ---------- Boucle de jeu ---------- */
/* Tutoriel interactif : chaque étape est validée automatiquement par les compteurs du jeu */
const TUTORIAL = [
  ['Explorer une zone', 'Onglet Explorer › « Explorer la zone ».', 'explorations', 1], ['Remporter un combat', 'Combattez lors d’une rencontre.', 'battlesWon', 1],
  ['Vous défendre', 'En combat, « Défendre » réduit les dégâts (surtout face aux attaques ⚠).', 'defends', 1], ['Utiliser une compétence', 'En combat › Compétences.', 'skillsUsed', 1],
  ['Équiper un objet', 'Onglet Inventaire › Équiper.', 'equips', 1], ['Répartir un point', 'Onglet Héros › bouton +.', 'spent', 1],
  ['Consulter les traits', 'Ouvrez l’onglet Traits : vos actes les éveillent.', 'seenTraits', 1], ['Accepter une quête', 'Onglet Quêtes › Accepter.', 'qAccepted', 1]
];
const Tutorial = {
  done() { return TUTORIAL.filter(t => val(t[2]) >= t[3]).length; },
  check() {
    if (G.flags.tutDone || this.done() < TUTORIAL.length) return;
    G.flags.tutDone = true; const l = Game.reward({ gold: 100, cons: { potion_hp: 3, potion_mp: 2 }, xp: 50 });
    Hooks.toast('🎓 Tutoriel terminé : ' + l.join(' · '), 'trait');
  }
};
const Game = {
  create(o) {
    G = newState();
    const cl = CLASS(o.cls), og = ORIGINS.find(x => x.id === o.origin) || ORIGINS[0], bg = BACKGROUNDS.find(x => x.id === o.bg) || BACKGROUNDS[0];
    G.p.name = o.name.trim().slice(0, 20); G.p.portrait = o.portrait; G.p.cls = o.cls; G.p.style = o.style;
    G.p.sex = o.sex || 'x'; G.p.origin = og.id; G.p.bg = bg.id; G.p.diff = DIFFICULTY[o.diff] ? o.diff : 'normal';
    G.p.base = Object.assign({ str: 0, int: 0, agi: 0, end: 0 }, cl.base); G.p.sp = 2; G.sk[cl.sp] = 1;
    for (const f in og.rep || {}) addRep(f, og.rep[f]);
    for (const f in bg.rep || {}) addRep(f, bg.rep[f]);
    if (bg.gold) G.p.gold += bg.gold;
    for (const k in bg.cons || {}) G.cons[k] = (G.cons[k] || 0) + bg.cons[k];
    const wc = cl.weapons[o.weapon] || cl.weapons[0];
    const w = genItem({ ilvl: 1, r: 0, slot: 'weapon', cat: wc }); w.name = `${CAT_NAME[wc]} d’apprenti`; G.eq.weapon = w;
    const arm = genItem({ ilvl: 1, r: 0, slot: 'chest' }); arm.name = 'Tunique de voyage'; G.eq.chest = arm;
    const S = Stats.get(); G.p.hp = S.maxHp; G.p.mp = S.maxMp;
    Daily.ensure(); Shop.refresh(); Save.save();
  },
  // Changement de classe : conserve niveau, points répartis, palier et équipement ; rembourse les compétences de l'ancienne classe
  classChangeCost() { return Math.round(G.p.lvl * 150 * (1 + G.p.classChanges * .5)); },
  classUnlocked(c) { return !c.adv || (G.p.lvl >= c.adv.lvl && c.adv.g.every(g => val(g.c) >= g.n)); },
  changeClass(id) {
    const c = CLASSES.find(x => x.id === id); if (!c || c.id === G.p.cls || G.flags.inCombat) return false;
    if (G.p.lvl < 10 || !this.classUnlocked(c) || G.p.gold < this.classChangeCost()) return false;
    G.p.gold -= this.classChangeCost(); G.p.classChanges++;
    const old = CLASS(G.p.cls); let refund = 0;
    for (const sid of Object.keys(G.sk)) { const d = SK[sid]; if (d && d.cls === old.id) { refund += d.special ? G.sk[sid] - 1 : G.sk[sid]; delete G.sk[sid]; delete G.aug[sid]; } }
    G.p.sp += refund; G.p.cls = c.id; G.sk[c.sp] = 1;
    const msN = Object.keys(MILESTONES).filter(l => +l <= G.p.lvl).length;
    for (const k of ['str', 'int', 'agi', 'end']) G.p.base[k] = c.base[k] + (c.grow[k] || 0) * (G.p.lvl - 1) + (G.p.alloc[k] || 0) + msN * 2;
    bump('classChanges'); Stats.clamp(); Game.sync(); return true;
  },
  load() {
    const d = Save.read(); if (!d) return false;
    G = d;
    if (G.flags.inCombat) { // rechargement en plein combat : fuite forcée (anti save-scumming)
      const loss = Math.floor(G.p.gold * .1); G.p.gold -= loss; G.flags.inCombat = false; G.flags.dungeon = null;
      Hooks.toast(`Combat interrompu : vous avez fui (−${loss} or).`, 'bad');
    }
    Stats.clamp(); Daily.ensure(); return true;
  },
  // Appliquer une récompense ; renvoie des lignes de texte lisibles
  reward(r, src) {
    const out = [], sc = 1 + G.p.lvl * .12;
    if (r.xp) { const x = Math.round(r.xp * sc * (1 + (Stats.sum().xpPct || 0))); Player.addXp(x); out.push(`+${fmt(x)} XP`); }
    if (r.gold) { const g = Math.round(r.gold * sc); Player.gold(g); out.push(`+${fmt(g)} or`); }
    if (r.items) for (const i of r.items) { const it = genItem({ ilvl: G.p.lvl + 1, minR: i.minR || 0, luck: Stats.sum().lootLuck || 0 }); Inv.add(it, 'quest'); out.push(`Objet : ${it.name} (${RARITIES[it.r].n})`); }
    if (r.cons) for (const k in r.cons) { G.cons[k] = (G.cons[k] || 0) + r.cons[k]; out.push(`+${r.cons[k]} ${CONS[k].n}`); }
    if (r.mats) for (const k in r.mats) { Mats.add(k, r.mats[k]); out.push(`+${r.mats[k]} ${MATS[k][0]}`); }
    if (r.rep) for (const f in r.rep) { addRep(f, r.rep[f]); out.push(`${r.rep[f] > 0 ? '+' : ''}${r.rep[f]} réputation ${FACTIONS[f][0]}`); }
    if (r.bond && G.active && G.comp[G.active]) { G.comp[G.active].bond += r.bond; out.push(`+${r.bond} lien avec ${COMPS[G.active].n}`); }
    if (r.trait) { Traits.unlock(r.trait); out.push(`Trait éveillé : ${TRAIT(r.trait).n}`); }
    return out;
  },
  sync() {
    if (!G) return;
    Daily.ensure(); Traits.check(); Titles.check(); Achv.check(); Tutorial.check(); Shop.maybeRefresh(); Stats.clamp();
    Save.save(); Hooks.render();
  }
};

/* ---------- 6. COMPÉTENCES ---------- */
/* active : fx décrit l'effet ; passive : eff multiplié par le rang (max 3).
   Au rang 3, une amélioration au choix : économe (−30 % mana), puissante (+25 %), rapide (−1 recharge). */
const SK = {};
const defSk = (cls, list) => { for (const s of list) { s.cls = cls; SK[s.id] = s; } };
defSk('guerrier', [
  { id: 'g1', n: 'Frappe brutale', type: 'active', tier: 1, mp: 8, cd: 0, ico: '💥', d: 'Coup lourd (170 %), 25 % de chance d’étourdir.', fx: { k: 'dmg', t: 'phys', m: 1.7, st: ['stun', .25, 1] }, req: { lvl: 1 } },
  { id: 'g_sp', n: 'Fureur du guerrier', special: true, type: 'active', tier: 0, mp: 14, cd: 4, ico: '😡', d: 'Attaque +30 % et défense +20 % (3 tours), soigne 10 % des PV.', fx: { k: 'buff', b: { atk: .3, def: .2 }, t: 3, hs: .1 }, req: { lvl: 1 } },
  { id: 'g2', n: 'Peau d’acier', type: 'passive', tier: 1, ico: '🛡️', d: '+6 % défense et −1 % dégâts subis par rang.', eff: { defPct: .06, dmgTakenPct: -.01 }, req: { lvl: 1 } },
  { id: 'g3', n: 'Tourbillon', type: 'active', tier: 2, mp: 16, cd: 2, ico: '🌀', d: 'Frappe tous les ennemis (120 %).', fx: { k: 'dmg', t: 'phys', m: 1.2, aoe: true }, req: { lvl: 5, p: 'g1' } },
  { id: 'g4', n: 'Maître de guerre', type: 'passive', tier: 2, ico: '🏅', d: '+5 % attaque, +4 % PV par rang.', eff: { atkPct: .05, hpPct: .04 }, req: { lvl: 6, p: 'g2' } },
  { id: 'g5', n: 'Exécution', type: 'active', tier: 3, mp: 24, cd: 3, ico: '⚰️', d: 'Coup dévastateur (260 %), +50 % si la cible a moins de 40 % de PV.', fx: { k: 'dmg', t: 'phys', m: 2.6, exec: .5 }, req: { lvl: 12, p: 'g3', c: ['kills', 30, 'ennemis vaincus'] } }
]);
defSk('assassin', [
  { id: 'a1', n: 'Entaille venimeuse', type: 'active', tier: 1, mp: 8, cd: 0, ico: '🧪', d: 'Frappe (110 %) et empoisonne (80 %).', fx: { k: 'dmg', t: 'phys', m: 1.1, el: 'poison', st: ['poison', .8, 4] }, req: { lvl: 1 } },
  { id: 'a_sp', n: 'Ombre fatale', special: true, type: 'active', tier: 0, mp: 12, cd: 3, ico: '🌑', d: 'Frappe garantie critique (200 %).', fx: { k: 'dmg', t: 'phys', m: 2.0, cb: 100 }, req: { lvl: 1 } },
  { id: 'a2', n: 'Pas de l’ombre', type: 'passive', tier: 1, ico: '👣', d: '+3 % esquive par rang.', eff: { dodgeFlat: 3 }, req: { lvl: 1 } },
  { id: 'a3', n: 'Lames jumelles', type: 'active', tier: 2, mp: 16, cd: 2, ico: '⚔️', d: '3 coups rapides (3 × 70 %).', fx: { k: 'dmg', t: 'phys', m: .7, hits: 3 }, req: { lvl: 5, p: 'a1' } },
  { id: 'a4', n: 'Instinct meurtrier', type: 'passive', tier: 2, ico: '🎯', d: '+3 % critique par rang.', eff: { critFlat: 3 }, req: { lvl: 6, p: 'a2' } },
  { id: 'a5', n: 'Danse macabre', type: 'active', tier: 3, mp: 26, cd: 3, ico: '🩸', d: '4 coups (4 × 80 %) qui font saigner.', fx: { k: 'dmg', t: 'phys', m: .8, hits: 4, st: ['bleed', .5, 3] }, req: { lvl: 12, p: 'a3', c: ['crits', 40, 'coups critiques'] } }
]);
defSk('mage', [
  { id: 'm1', n: 'Boule de feu', type: 'active', tier: 1, mp: 10, cd: 0, ico: '🔥', d: 'Sort de feu (190 %), 40 % de brûlure.', fx: { k: 'dmg', t: 'mag', m: 1.9, el: 'fire', st: ['burn', .4, 3] }, req: { lvl: 1 } },
  { id: 'm_sp', n: 'Nova arcanique', special: true, type: 'active', tier: 0, mp: 20, cd: 3, ico: '🌟', d: 'Explosion arcanique sur tous les ennemis (140 %).', fx: { k: 'dmg', t: 'mag', m: 1.4, aoe: true, el: 'arcane' }, req: { lvl: 1 } },
  { id: 'm2', n: 'Armure de mana', type: 'passive', tier: 1, ico: '🔰', d: '+8 % mana et +3 % défense par rang.', eff: { mpPct: .08, defPct: .03 }, req: { lvl: 1 } },
  { id: 'm3', n: 'Éclair', type: 'active', tier: 2, mp: 12, cd: 1, ico: '⚡', d: 'Foudre (150 %), 30 % d’étourdir.', fx: { k: 'dmg', t: 'mag', m: 1.5, el: 'shock', st: ['stun', .3, 1] }, req: { lvl: 5, p: 'm1' } },
  { id: 'm4', n: 'Savoir interdit', type: 'passive', tier: 2, ico: '📕', d: '+6 % dégâts de compétence, +3 % attaque par rang.', eff: { skillPct: .06, atkPct: .03 }, req: { lvl: 6, p: 'm2' } },
  { id: 'm5', n: 'Météore', type: 'active', tier: 3, mp: 32, cd: 4, ico: '☄️', d: 'Pluie de feu sur tous les ennemis (240 %), brûlure.', fx: { k: 'dmg', t: 'mag', m: 2.4, aoe: true, el: 'fire', st: ['burn', .5, 3] }, req: { lvl: 12, p: 'm3', c: ['skillsUsed', 30, 'compétences utilisées'] } }
]);
defSk('paladin', [
  { id: 'p1', n: 'Frappe sacrée', type: 'active', tier: 1, mp: 8, cd: 0, ico: '✨', d: 'Coup sacré (140 %), soigne 8 % des PV.', fx: { k: 'dmg', t: 'phys', m: 1.4, el: 'holy', hs: .08 }, req: { lvl: 1 } },
  { id: 'p_sp', n: 'Lumière salvatrice', special: true, type: 'active', tier: 0, mp: 16, cd: 4, ico: '💛', d: 'Soigne 40 % des PV et purifie les altérations.', fx: { k: 'heal', f: .4, cleanse: true }, req: { lvl: 1 } },
  { id: 'p2', n: 'Bouclier de foi', type: 'passive', tier: 1, ico: '🛡️', d: '+6 % défense par rang.', eff: { defPct: .06 }, req: { lvl: 1 } },
  { id: 'p3', n: 'Châtiment', type: 'active', tier: 2, mp: 14, cd: 1, ico: '⚖️', d: 'Châtiment sacré (190 %), 20 % d’étourdir.', fx: { k: 'dmg', t: 'phys', m: 1.9, el: 'holy', st: ['stun', .2, 1] }, req: { lvl: 5, p: 'p1' } },
  { id: 'p4', n: 'Aura protectrice', type: 'passive', tier: 2, ico: '🕊️', d: '−3 % dégâts subis, +5 % soins reçus par rang.', eff: { dmgTakenPct: -.03, healPct: .05 }, req: { lvl: 6, p: 'p2' } },
  { id: 'p5', n: 'Jugement', type: 'active', tier: 3, mp: 26, cd: 3, ico: '⚔️', d: 'Jugement (260 %), étourdit à 40 %, soigne 10 %.', fx: { k: 'dmg', t: 'phys', m: 2.6, el: 'holy', st: ['stun', .4, 1], hs: .1 }, req: { lvl: 12, p: 'p3', c: ['defends', 15, 'défenses'] } }
]);
defSk('archer', [
  { id: 'r1', n: 'Tir précis', type: 'active', tier: 1, mp: 8, cd: 0, ico: '🎯', d: 'Tir (160 %), +20 % de chance critique.', fx: { k: 'dmg', t: 'phys', m: 1.6, cb: 20 }, req: { lvl: 1 } },
  { id: 'r_sp', n: 'Pluie de flèches', special: true, type: 'active', tier: 0, mp: 16, cd: 3, ico: '🌧️', d: 'Une volée sur tous les ennemis (110 %).', fx: { k: 'dmg', t: 'phys', m: 1.1, aoe: true }, req: { lvl: 1 } },
  { id: 'r2', n: 'Œil d’aigle', type: 'passive', tier: 1, ico: '🦅', d: '+3 % critique par rang.', eff: { critFlat: 3 }, req: { lvl: 1 } },
  { id: 'r3', n: 'Flèche empoisonnée', type: 'active', tier: 2, mp: 10, cd: 1, ico: '🐍', d: 'Tir (100 %) qui empoisonne à 80 %.', fx: { k: 'dmg', t: 'phys', m: 1.0, el: 'poison', st: ['poison', .8, 4] }, req: { lvl: 5, p: 'r1' } },
  { id: 'r4', n: 'Pas léger', type: 'passive', tier: 2, ico: '🍃', d: '+2 vitesse et +2 % esquive par rang.', eff: { spdFlat: 2, dodgeFlat: 2 }, req: { lvl: 6, p: 'r2' } },
  { id: 'r5', n: 'Tir mortel', type: 'active', tier: 3, mp: 24, cd: 3, ico: '☠️', d: 'Tir (300 %), +25 % de critique.', fx: { k: 'dmg', t: 'phys', m: 3.0, cb: 25 }, req: { lvl: 12, p: 'r3', c: ['crits', 50, 'coups critiques'] } }
]);
defSk('necro', [
  { id: 'n1', n: 'Drain d’âme', type: 'active', tier: 1, mp: 10, cd: 0, ico: '🌀', d: 'Ténèbres (140 %), soigne 50 % des dégâts infligés.', fx: { k: 'dmg', t: 'mag', m: 1.4, el: 'dark', hd: .5 }, req: { lvl: 1 } },
  { id: 'n_sp', n: 'Invocation de squelette', special: true, type: 'active', tier: 0, mp: 18, cd: 5, ico: '💀', d: 'Un squelette combat 4 tours à vos côtés.', fx: { k: 'summon', n: 'Squelette', pow: .6, t: 4, cnt: 1 }, req: { lvl: 1 } },
  { id: 'n2', n: 'Malédiction', type: 'active', tier: 1, mp: 12, cd: 2, ico: '🕯️', d: 'Dégâts sombres (60 %), poison et saignement.', fx: { k: 'dmg', t: 'mag', m: .6, el: 'dark', st: ['poison', .9, 4], st2: ['bleed', .9, 4] }, req: { lvl: 1 } },
  { id: 'n3', n: 'Pacte macabre', type: 'passive', tier: 2, ico: '🩻', d: '+4 mana par victime, +2 % vol de vie par rang.', eff: { onKillMp: 4, lifesteal: .02 }, req: { lvl: 6, p: 'n1' } },
  { id: 'n4', n: 'Explosion de cadavres', type: 'active', tier: 2, mp: 18, cd: 2, ico: '💥', d: 'Tous les ennemis : 60 % + 50 % par ennemi vaincu ce combat.', fx: { k: 'dmg', t: 'mag', m: .6, per: .5, corpse: true, aoe: true, el: 'dark' }, req: { lvl: 5, p: 'n1' } },
  { id: 'n5', n: 'Armée des morts', type: 'active', tier: 3, mp: 30, cd: 6, ico: '⚰️', d: 'Invoque 3 squelettes pendant 5 tours.', fx: { k: 'summon', n: 'Squelette', pow: .5, t: 5, cnt: 3 }, req: { lvl: 12, p: 'n_sp', c: ['summonsUsed', 10, 'invocations'] } }
]);
defSk('all', [
  { id: 'u1', n: 'Second souffle', type: 'passive', tier: 1, ico: '🌬️', d: 'Régénère 3 % des PV max par tour et par rang.', eff: { regenTurn: .03 }, req: { lvl: 3 } },
  { id: 'u2', n: 'Concentration', type: 'active', tier: 1, mp: 0, cd: 4, ico: '🧘', d: 'Rend 25 % du mana ; la prochaine attaque est critique.', fx: { k: 'focus', mpf: .25 }, req: { lvl: 3 } },
  { id: 'u3', n: 'Réflexes', type: 'passive', tier: 2, ico: '⚡', d: '+2 % esquive et +1 vitesse par rang.', eff: { dodgeFlat: 2, spdFlat: 1 }, req: { lvl: 6, p: 'u1' } },
  { id: 'u4', n: 'Marque de proie', type: 'active', tier: 2, mp: 6, cd: 3, ico: '🎯', d: 'La cible subit +25 % de dégâts pendant 3 tours.', fx: { k: 'mark', v: .25, t: 3 }, req: { lvl: 6, p: 'u2' } },
  { id: 'u5', n: 'Maîtrise des armes', type: 'passive', tier: 3, ico: '⚔️', d: '+3 % attaque par rang.', eff: { atkPct: .03 }, req: { lvl: 10, p: 'u3', c: ['wcatsDistinct', 3, 'catégories d’armes'] } }
]);
const AUGS = { eco: ['Économe', '−30 % de coût en mana'], power: ['Puissante', '+25 % de puissance'], cdr: ['Rapide', '−1 tour de recharge'] };

const Skills = {
  tree() { return Object.values(SK).filter(s => s.cls === G.p.cls || s.cls === 'all'); },
  rank(id) { return G.sk[id] || 0; },
  reqLines(d) {
    const r = d.req || {}, out = [];
    if (r.lvl) out.push({ t: `Niveau ${r.lvl}`, ok: G.p.lvl >= r.lvl });
    if (r.p) out.push({ t: SK[r.p].n, ok: this.rank(r.p) > 0 });
    if (r.c) out.push({ t: `${r.c[2]} : ${Math.min(val(r.c[0]), r.c[1])}/${r.c[1]}`, ok: val(r.c[0]) >= r.c[1] });
    return out;
  },
  canLearn(id) {
    const d = SK[id]; if (!d || d.special && this.rank(id) === 0) return false;
    return G.p.sp > 0 && this.rank(id) < 3 && this.reqLines(d).every(x => x.ok);
  },
  learn(id) { if (!this.canLearn(id)) return false; G.sk[id] = this.rank(id) + 1; G.p.sp--; Game.sync(); return true; },
  setAug(id, a) { if (this.rank(id) >= 3 && AUGS[a] && !G.aug[id]) { G.aug[id] = a; Game.sync(); } },
  respecCost() { return G.p.lvl * 40; },
  respec() {
    if (G.flags.inCombat || G.p.gold < this.respecCost()) return false;
    let refund = 0, keep = {};
    for (const id in G.sk) { const d = SK[id]; if (!d) continue; if (d.special) { refund += G.sk[id] - 1; keep[id] = 1; } else refund += G.sk[id]; }
    G.p.gold -= this.respecCost(); G.p.sp += refund; G.sk = keep; G.aug = {}; Stats.clamp(); Game.sync(); return true;
  },
  actives() { return Object.keys(G.sk).filter(id => SK[id] && SK[id].type === 'active' && G.sk[id] > 0); },
  cost(id) { return Math.round(SK[id].mp * (G.aug[id] === 'eco' ? .7 : 1)); },
  cdOf(id) { return Math.max(0, SK[id].cd - (G.aug[id] === 'cdr' ? 1 : 0)); }
};

/* ---------- 7. COMBAT ---------- */
const Combat = {
  C: null,
  get alive() { return this.C.enemies.filter(e => !e.dead); },
  log(m, c = '') { const C = this.C; C.log.push({ m, c }); if (C.log.length > 150) C.log.shift(); },
  fx(side, i, txt, cls) { this.C.fx.push({ side, i, txt, cls }); },
  buff(k) { return this.C.buffs.filter(b => b.k === k).reduce((s, b) => s + b.v, 0); },
  tgt() { const C = this.C; if (!C.enemies[C.target] || C.enemies[C.target].dead) C.target = Math.max(0, C.enemies.findIndex(e => !e.dead)); return C.enemies[C.target]; },
  tgtAny() { const a = this.alive; return a.length ? pick(a) : null; },
  ready() { const C = this.C; return !!(C && !C.over && C.order[C.idx] && C.order[C.idx].t === 'p'); },
  wtype() { const w = G.eq.weapon; return w && MAGIC_CATS.includes(w.cat) ? 'mag' : 'phys'; },

  start(ctx) {
    const S = Stats.get(); G.flags.inCombat = true;
    const C = this.C = {
      ctx, enemies: ctx.enemies, target: 0, round: 0, log: [], fx: [], over: false, res: null, defending: false, buffs: [], st: {}, cd: {},
      summons: [], corpses: 0, dmgTaken: 0, minHpPct: G.p.hp / S.maxHp, maxSt: 0, usedFin: false, revived: false, shield: 0, shieldT: 0,
      order: [], idx: 0, comp: { cd: 0 }, extra: false, summary: null
    };
    this.log(`⚔ ${C.enemies.map(e => `${e.n} (niv. ${e.lvl})`).join(', ')} !`, 'sys');
    Save.save();
    Hooks.combatStart();
    this.startRound(); this.run();
  },
  startRound() {
    const C = this.C; if (C.over) return; C.round++;
    const S = Stats.get(), E = Stats.sum();
    for (const e of C.enemies) if (!e.dead) e.intent = Enemies.intent(e);
    const actors = [{ t: 'p', s: S.spd + rnd(0, 2) + (E.firstStrike ? 100 : 0) }, ...C.enemies.filter(e => !e.dead).map(e => ({ t: 'e', e, s: e.spd + rnd(0, 2) }))];
    actors.sort((a, b) => b.s - a.s); C.order = actors; C.idx = 0;
  },
  // Exécute les acteurs jusqu'au prochain tour du joueur
  run() {
    const C = this.C; let guard = 0;
    while (!C.over && guard++ < 300) {
      if (C.idx >= C.order.length) { this.startRound(); continue; }
      const a = C.order[C.idx];
      if (a.t === 'e') { C.idx++; if (!a.e.dead) this.enemyAct(a.e); if (this.checkEnd()) break; continue; }
      const skip = this.playerTurnStart(); if (C.over) break;
      if (skip) { C.idx++; this.allyPhase(); if (this.checkEnd()) break; continue; }
      break; // attend une action du joueur
    }
    Hooks.combatRender();
  },
  checkEnd() {
    const C = this.C; if (C.over) return true;
    if (G.p.hp <= 0) { this.lose(); return true; }
    if (!this.alive.length) { this.win(); return true; }
    return false;
  },
  playerTurnStart() {
    const C = this.C, S = Stats.get(), E = Stats.sum(); let skip = false;
    C.defending = false;
    for (const k in C.cd) if (C.cd[k] > 0) C.cd[k]--;
    C.buffs = C.buffs.filter(b => --b.t > 0);
    if (C.counter && --C.counter.t <= 0) C.counter = null;
    const rg = this.buff('regen'); if (rg) { const h = Player.heal(S.maxHp * rg * (1 + (E.healPct || 0))); if (h) { this.log(`🌸 Régénération : +${h} PV.`, 'good'); this.fx('p', 0, '+' + h, 'heal'); } }
    if (C.shieldT > 0 && --C.shieldT === 0) C.shield = 0;
    if (E.mpRegen) Player.restoreMp(E.mpRegen);
    if (E.regenTurn) { const h = Player.heal(S.maxHp * E.regenTurn); if (h) this.fx('p', 0, '+' + h, 'heal'); }
    for (const id of Object.keys(C.st)) {
      const s = C.st[id], sd = STATUS[id];
      if (sd.skip) { skip = true; this.log(`${sd.i} Vous êtes sous l’effet de ${sd.n} : tour perdu !`, 'status'); }
      else { const d = Math.max(1, Math.round(s.pow * sd.k)); this.log(`${sd.i} ${sd.n} : −${d} PV`, 'status'); this.damagePlayer(d, d); if (C.over) return false; }
      if (--s.t <= 0) delete C.st[id];
    }
    return skip;
  },

  /* --- Dégâts reçus par le joueur --- */
  damagePlayer(dmg, raw) {
    const C = this.C, S = Stats.get(), E = Stats.sum();
    dmg = Math.max(0, Math.round(dmg));
    if (C.shield > 0 && dmg > 0) { const a = Math.min(C.shield, dmg); C.shield -= a; dmg -= a; this.log(`🛡 Le rempart absorbe ${a} dégâts.`, 'good'); }
    if (dmg <= 0) return 0;
    if (C.defending && raw >= G.p.hp && dmg < G.p.hp) { bump('lastStands'); this.log('🛡 Votre garde vous sauve d’un coup fatal !', 'good'); }
    G.p.hp -= dmg; C.dmgTaken += dmg; bump('dmgTaken', dmg);
    C.minHpPct = Math.min(C.minHpPct, Math.max(0, G.p.hp) / S.maxHp);
    this.fx('p', 0, '-' + dmg, 'dmg');
    if (G.p.hp <= 0) {
      if (E.revive && !C.revived) { C.revived = true; G.p.hp = 1; bump('lastStands'); C.minHpPct = 1 / S.maxHp; this.log('✨ Une force ancienne vous retient au bord de la mort !', 'good'); }
      else { G.p.hp = 0; this.lose(); }
    }
    return dmg;
  },
  inflict(st, e) { // altération infligée au joueur
    const [id, ch, t] = st, S = Stats.get(), sd = STATUS[id], C = this.C;
    if (!chance(ch * (1 - S.sres / 100))) return;
    const cur = C.st[id]; C.st[id] = { t: Math.max(t, cur ? cur.t : 0), pow: Math.max(1, e.atk * .22) };
    this.log(`${sd.i} Vous subissez ${sd.n} !`, 'status');
    C.maxSt = Math.max(C.maxSt, Object.keys(C.st).length);
  },

  /* --- Tour d'un ennemi --- */
  tickEnemy(e) {
    const E = Stats.sum(); let skip = false;
    if (e.cdStun > 0) e.cdStun--;
    if (e.mark && --e.mark.t <= 0) delete e.mark;
    for (const id of Object.keys(e.st)) {
      const s = e.st[id], sd = STATUS[id];
      if (sd.skip) { skip = true; if (e.boss) e.cdStun = 3; }
      else {
        const d = Math.max(1, Math.round(s.pow * sd.k)); this.log(`${sd.i} ${e.n} subit ${sd.n} : −${d}`, 'status');
        e.hp -= d; bump('dmgDealt', d); this.fx('e', this.C.enemies.indexOf(e), '-' + d, 'dot');
        if (e.hp <= 0) { this.killEnemy(e, { dot: true }); return true; }
      }
      if (--s.t <= 0) delete e.st[id];
    }
    return skip;
  },
  enemyAct(e) {
    const C = this.C; if (C.over || e.dead) return;
    if (this.tickEnemy(e)) { if (!e.dead) this.log(`${e.n} est incapable d’agir.`, 'status'); return; }
    if (e.buffT > 0 && --e.buffT === 0) e.buffAtk = 0;
    const sk = ESK[e.intent] || ESK.strike, S = Stats.get(), E = Stats.sum();
    if (sk.buff) { e.buffAtk = sk.buff; e.buffT = 3; this.log(`📣 ${e.n} : ${sk.n} — son attaque augmente !`, 'warn'); return; }
    if (sk.healSelf) { const h = Math.round(e.maxHp * sk.healSelf); e.hp = Math.min(e.maxHp, e.hp + h); this.log(`💚 ${e.n} se régénère (+${h}).`); this.fx('e', C.enemies.indexOf(e), '+' + h, 'heal'); return; }
    const magic = !!(sk.el && sk.el !== 'phys');
    const defV = (magic ? S.mres : S.def) * (1 + this.buff('def'));
    let raw = e.atk * (1 + e.buffAtk) * sk.m * rnd(.9, 1.1) * mitig(defV, S.lvl);
    if (magic) raw *= 1 - clamp(E['res' + sk.el.charAt(0).toUpperCase() + sk.el.slice(1)] || 0, -.5, .75);
    const dodge = clamp((S.dodge + this.buff('dodge') * 100) / 100, 0, .6);
    if (chance(dodge)) { bump('dodges'); this.log(`💨 Vous esquivez ${sk.n} de ${e.n} !`, 'good'); this.fx('p', 0, 'Esquive', 'miss'); return; }
    if (chance(.05)) raw *= 1.5;
    raw *= clamp(1 + (E.dmgTakenPct || 0), .25, 1.5);
    let fin = raw; if (C.defending) fin *= clamp(.5 - (E.defendBonus || 0), .2, .5);
    const dealt = this.damagePlayer(fin, raw);
    this.log(`${e.i} ${e.n} — ${sk.n} : −${dealt} PV${C.defending ? ' (garde)' : ''}`, 'hit');
    if (C.over) return;
    if (sk.drain && dealt > 0) { const h = Math.round(dealt * sk.drain); e.hp = Math.min(e.maxHp, e.hp + h); this.log(`🩸 ${e.n} draine ${h} PV.`); }
    if (sk.mpDrain) { const l = Player.restoreMp(-Math.round(S.maxMp * sk.mpDrain)); if (l) this.log(`🔻 ${e.n} aspire votre mana.`); }
    if (dealt > 0 || sk.m < 1) { if (sk.st) this.inflict(sk.st, e); if (sk.st2) this.inflict(sk.st2, e); }
    if (E.thorns && dealt > 0 && !e.dead) { const t = Math.max(1, Math.round(dealt * E.thorns)); this.log(`🌵 Épines : ${t} dégâts renvoyés.`); this.hurtEnemy(e, t, { by: 'thorns' }); }
    if (C.counter && dealt > 0 && !e.dead && !C.over) { bump('counters'); this.log('↩ Contre-attaque !', 'good'); this.strike(e, C.counter.m, {}); }
  },
  estimate(e) {
    const sk = ESK[e.intent] || ESK.strike; if (sk.m === undefined) return 0;
    const S = Stats.get(); return Math.round(e.atk * (1 + e.buffAtk) * sk.m * mitig(S.def * (1 + this.buff('def')), S.lvl));
  },

  /* --- Dégâts infligés par le joueur --- */
  hurtEnemy(e, dmg, o = {}) {
    dmg = Math.max(1, Math.round(dmg)); e.hp -= dmg; bump('dmgDealt', dmg);
    this.fx('e', this.C.enemies.indexOf(e), (o.crit ? '✦' : '-') + dmg, o.crit ? 'crit' : 'dmg');
    if (e.hp <= 0) this.killEnemy(e, o); else this.checkPhase(e);
    return dmg;
  },
  strike(e, m, o = {}) {
    const C = this.C, S = Stats.get(), E = Stats.sum();
    if (!e || e.dead) return 0;
    const type = o.t || this.wtype();
    if (e.dodge && !o.sure && chance(Math.max(0, e.dodge - S.prec) / 100)) { this.log(`💨 ${e.n} esquive !`); this.fx('e', C.enemies.indexOf(e), 'Raté', 'miss'); return 0; }
    let raw = (type === 'mag' ? S.mag : S.atk) * m * rnd(.9, 1.1);
    let bonus = this.buff('atk') + (o.skill ? (E.skillPct || 0) : 0) + (e.boss ? (E.dmgBossPct || 0) : 0) + (e.mark ? e.mark.v : 0);
    if (ZONE(C.ctx.zone) && ZONE(C.ctx.zone).night) bonus += E.nightAtk || 0;
    raw *= (1 + bonus) * mitig(e.def * (1 - S.pen / 100), e.lvl) * (1 - clamp(e.res[o.el || 'phys'] || 0, -1, .9));
    const crit = o.crit || chance((S.crit + (o.critBonus || 0) + this.buff('crit')) / 100);
    if (crit) { raw *= 1.6 + (E.critDmg || 0); bump('crits'); }
    const dmg = this.hurtEnemy(e, raw, { crit, by: 'player' });
    this.log(`${crit ? '💥 Critique ! ' : ''}Vous infligez ${dmg} dégâts à ${e.n}${(e.res[o.el || 'phys'] || 0) < -.2 ? ' (faiblesse !)' : (e.res[o.el || 'phys'] || 0) > .3 ? ' (résiste)' : ''}.`, crit ? 'crit' : 'hit');
    if (E.lifesteal && dmg > 0) { const h = Player.heal(dmg * E.lifesteal * (1 + (E.healPct || 0))); if (h) this.fx('p', 0, '+' + h, 'heal'); }
    if (!e.dead) {
      if (!o.noHit) for (const [id, key, t] of [['bleed', 'hitBleed', 3], ['burn', 'hitBurn', 3], ['freeze', 'hitFreeze', 1], ['poison', 'hitPoison', 4]]) if (E[key]) this.applyEnemy(e, id, t, E[key]);
      if (o.st) this.applyEnemy(e, o.st[0], o.st[2], o.st[1]);
      if (o.st2) this.applyEnemy(e, o.st2[0], o.st2[2], o.st2[1]);
    }
    return dmg;
  },
  applyEnemy(e, id, t, ch = 1) {
    if (e.dead) return false;
    const S = Stats.get(), E = Stats.sum(), sd = STATUS[id], res = e.res[sd.res] || 0;
    if (res >= .9) return false;
    if (e.boss && sd.skip && (e.cdStun > 0 || e.st[id])) return false;
    if (!chance(ch * (1 + (E.statusChance || 0)) * (1 - Math.max(0, res)))) return false;
    const pow = Math.max(1, (S.atk + S.mag) / 2 * .3 * (1 + (E.dotPct || 0)));
    e.st[id] = { t: Math.max(t, (e.st[id] || {}).t || 0), pow };
    bump('statusApplied'); this.log(`${sd.i} ${e.n} subit ${sd.n} !`, 'status'); return true;
  },
  checkPhase(e) {
    const C = this.C;
    while (e.boss && e.phases[e.phase] && e.hp <= e.maxHp * e.phases[e.phase].at && !e.dead) {
      const p = e.phases[e.phase++]; this.log(`⚠ ${p.msg}`, 'warn');
      if (p.enrage) { e.atk *= 1 + p.enrage; this.log(`${e.n} devient plus dangereux !`, 'warn'); }
      if (p.heal) { e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * p.heal)); }
      if (p.add) e.cycle.push(...p.add);
      if (p.summon) for (let i = 0; i < (p.n || 1); i++) if (C.enemies.filter(x => !x.dead).length < 6) C.enemies.push(Enemies.make(p.summon, Math.max(1, e.lvl - 3), 'minion'));
    }
  },
  killEnemy(e, o = {}) {
    const C = this.C;
    if (e.dead) return;
    if (e.boss && e.resurrect && !e.resUsed) { e.resUsed = true; e.hp = Math.round(e.maxHp * .4); e.st = {}; this.log(`☠ ${e.n} refuse de mourir et se relève !`, 'warn'); return; }
    e.dead = true; e.hp = 0; C.corpses++;
    this.log(`✖ ${e.n} est vaincu.`, 'good');
    const E = Stats.sum();
    bump('kills'); bump('streak'); G.c.streakBest = Math.max(G.c.streakBest || 0, G.c.streak);
    bump('k_' + e.tpl); bump('kz_' + C.ctx.zone);
    const night = ZONE(C.ctx.zone) && ZONE(C.ctx.zone).night; bump(night ? 'nightKills' : 'dayKills');
    if (e.tier === 'elite') bump('killsElite');
    if (e.boss) { bump('killsBoss'); bump('bk_' + e.tpl); if (e.lvl >= G.p.lvl + 4) bump('giantKills'); }
    if (o.dot) bump('dotKills');
    if (o.by === 'player' && G.eq.weapon && G.eq.weapon.cat) { G.c.wcats = G.c.wcats || {}; G.c.wcats[G.eq.weapon.cat] = 1; }
    if (E.onKillMp) Player.restoreMp(E.onKillMp);
  },

  /* --- Phase des alliés (invocations + compagnon) --- */
  allyPhase() {
    const C = this.C, S = Stats.get(), E = Stats.sum();
    for (const s of C.summons) {
      if (C.over || s.t <= 0) continue; const e = this.tgtAny(); if (!e) break;
      const d = S.atk * s.pow * (1 + (E.summonPct || 0)) * rnd(.9, 1.1) * mitig(e.def, e.lvl);
      this.log(`💀 ${s.n} attaque ${e.n}.`); this.hurtEnemy(e, d, { by: 'summon' }); s.t--;
    }
    C.summons = C.summons.filter(s => s.t > 0);
    if (G.active && G.comp[G.active] && this.alive.length) Companions.act(G.active, C);
  },
  allyHit(e, raw, label) {
    const d = raw * rnd(.9, 1.1) * mitig(e.def, e.lvl) * (1 - clamp(e.res.phys || 0, -1, .9));
    const n = this.hurtEnemy(e, d, { by: 'ally' }); this.log(`${label} : −${n} sur ${e.n}.`, 'ally');
  },

  /* --- Actions du joueur --- */
  finishAction() {
    const C = this.C; if (this.checkEnd()) { Hooks.combatRender(); return; }
    this.allyPhase(); if (this.checkEnd()) { Hooks.combatRender(); return; }
    if (C.forceExtra) { C.forceExtra = false; C.extra = true; Hooks.combatRender(); return; }
    const E = Stats.sum();
    if (!C.extra && chance(E.extraTurn || 0)) { C.extra = true; this.log('⚡ Tour supplémentaire !', 'good'); Hooks.combatRender(); return; }
    C.extra = false; C.idx++; this.run();
  },
  attack() { if (!this.ready()) return; this.strike(this.tgt(), 1, {}); this.finishAction(); },
  defend() {
    if (!this.ready()) return; const C = this.C, S = Stats.get();
    C.defending = true; bump('defends'); const m = Player.restoreMp(S.maxMp * .08);
    this.log(`🛡 Vous vous mettez en garde (dégâts réduits)${m ? `, +${m} mana` : ''}.`, 'good'); this.finishAction();
  },
  skill(id) {
    if (!this.ready()) return; const C = this.C, d = SK[id];
    if (!d || d.type !== 'active' || !(G.sk[id] > 0)) return;
    if (C.cd[id] > 0) { Hooks.toast('Compétence en recharge.', 'bad'); return; }
    const cost = Skills.cost(id); if (G.p.mp < cost) { Hooks.toast('Mana insuffisant.', 'bad'); return; }
    const rank = G.sk[id], aug = G.aug[id], S = Stats.get(), E = Stats.sum(), f = d.fx;
    G.p.mp -= cost; const cd = Skills.cdOf(id); C.cd[id] = cd > 0 ? cd + 1 : 0;
    const pm = (1 + .2 * (rank - 1)) * (aug === 'power' ? 1.25 : 1);
    bump('skillsUsed'); this.log(`✨ ${d.n}${rank > 1 ? ' ' + rank : ''}`, 'skill');
    switch (f.k) {
      case 'dmg': {
        const targets = f.aoe ? [...this.alive] : [this.tgt()]; let dealt = 0, m = f.m;
        if (f.selfDmg) { G.p.hp = Math.max(1, G.p.hp - Math.round(S.maxHp * f.selfDmg)); this.log(`💢 Le sort vous blesse (−${pc(f.selfDmg)} % PV).`, 'bad'); this.fx('p', 0, 'Sacrifice', 'dmg'); }
        if (f.corpse) m = f.m + f.per * Math.min(C.corpses, 8);
        for (const e of targets) for (let h = 0; h < (f.hits || 1); h++) {
          if (e.dead) break; let mm = m * pm; if (f.exec && e.hp / e.maxHp < .4) mm *= 1 + f.exec;
          dealt += this.strike(e, mm, { t: f.t, el: f.el, skill: true, critBonus: f.cb, st: f.st, st2: f.st2 });
        }
        if (f.steal && dealt > 0) { const g = Math.round(S.lvl * rint(3, 8) * (1 + (E.goldPct || 0))); Player.gold(g); this.log(`💰 Vous dérobez ${g} or !`, 'good'); }
        if (f.hd && dealt > 0) { const h = Player.heal(dealt * f.hd * (1 + (E.healPct || 0))); if (h) { this.log(`💚 Vous récupérez ${h} PV.`, 'good'); this.fx('p', 0, '+' + h, 'heal'); } }
        if (f.hs) { const h = Player.heal(S.maxHp * f.hs * (1 + (E.healPct || 0))); if (h) { this.log(`💚 +${h} PV.`, 'good'); this.fx('p', 0, '+' + h, 'heal'); } }
        break;
      }
      case 'heal': {
        const h = Player.heal(S.maxHp * f.f * pm * (1 + (E.healPct || 0))); this.log(`💚 Vous récupérez ${h} PV.`, 'good'); this.fx('p', 0, '+' + h, 'heal');
        if (f.cleanse) C.st = {}; break;
      }
      case 'buff': {
        for (const k in f.b) C.buffs.push({ k, v: f.b[k] * pm, t: f.t + 1 });
        this.log(`⬆ Attaque et défense renforcées pendant ${f.t} tours.`, 'good');
        if (f.hs) { const h = Player.heal(S.maxHp * f.hs * (1 + (E.healPct || 0))); if (h) this.fx('p', 0, '+' + h, 'heal'); }
        break;
      }
      case 'summon': {
        for (let i = 0; i < f.cnt; i++) C.summons.push({ n: f.n, t: f.t, pow: f.pow * pm });
        bump('summonsUsed'); this.log(`💀 ${f.cnt > 1 ? f.cnt + ' ' + f.n + 's' : 'Un ' + f.n.toLowerCase()} surgit${f.cnt > 1 ? 'ssent' : ''} du sol !`, 'good'); break;
      }
      case 'focus': {
        const m = Player.restoreMp(S.maxMp * f.mpf * pm); C.buffs.push({ k: 'crit', v: 100, t: 2 }); this.log(`🧘 Concentration : +${m} mana, prochaine attaque critique.`, 'good'); break;
      }
      case 'counter': { C.counter = { m: f.m * pm, t: f.t + 1 }; this.log(`↩ Posture de riposte (${f.t} tours).`, 'good'); break; }
      case 'extra': { Player.restoreMp(S.maxMp * (f.mpf || 0)); C.forceExtra = true; this.log('⏱ Le temps se fige : vous rejouez !', 'good'); break; }
      case 'mark': { const e = this.tgt(); e.mark = { v: f.v * pm, t: f.t + 1 }; this.log(`🎯 ${e.n} est marqué (+${pc(f.v * pm)} % de dégâts subis).`, 'good'); break; }
    }
    this.finishAction();
  },
  finisherReady() { const C = this.C; if (!C || C.usedFin) return false; const th = .3 + (Stats.sum().finTh || 0); return this.alive.some(e => e.hp / e.maxHp <= th); },
  finisher() {
    if (!this.ready() || !this.finisherReady()) return; const C = this.C, th = .3 + (Stats.sum().finTh || 0);
    let e = this.tgt(); if (e.hp / e.maxHp > th) e = this.alive.find(x => x.hp / x.maxHp <= th);
    C.usedFin = true; bump('finishers'); this.log('🗡 FINISSEUR !', 'crit');
    this.strike(e, 2.6, { sure: true, crit: true }); this.finishAction();
  },
  useItem(id) {
    if (!this.ready() || (G.cons[id] || 0) <= 0) return; const C = this.C, S = Stats.get(), E = Stats.sum(), c = CONS[id];
    if (id === 'potion_hp' || id === 'potion_hp2') { const h = Player.heal(S.maxHp * c.f * (1 + (E.potionPct || 0) + (E.healPct || 0))); this.log(`🧪 ${c.n} : +${h} PV.`, 'good'); this.fx('p', 0, '+' + h, 'heal'); bump('potions'); }
    else if (id === 'potion_mp') { const m = Player.restoreMp(S.maxMp * c.f * (1 + (E.potionPct || 0))); this.log(`💧 ${c.n} : +${m} mana.`, 'good'); bump('potions'); }
    else if (id === 'antidote') { C.st = {}; this.log('🍵 Vous êtes purifié de toute altération.', 'good'); }
    else if (id === 'bomb') {
      this.log('💣 La bombe explose !', 'skill');
      for (const e of [...this.alive]) { const d = (30 + S.lvl * 7 + S.mag * .3) * rnd(.9, 1.1) * (1 - clamp(e.res.fire || 0, -1, .9)); this.hurtEnemy(e, d, { by: 'player' }); if (!e.dead) this.applyEnemy(e, 'burn', 3, .4); }
    }
    G.cons[id]--; this.finishAction();
  },
  flee() {
    if (!this.ready()) return; const C = this.C;
    if (!C.ctx.canFlee) { Hooks.toast('Fuite impossible dans ce combat !', 'bad'); return; }
    const S = Stats.get(), al = this.alive, avg = al.reduce((s, e) => s + e.spd, 0) / al.length;
    if (chance(clamp(.5 + (S.spd - avg) * .03, .2, .9))) {
      C.over = true; C.res = 'flee'; bump('fled'); G.c.streak = 0; G.flags.inCombat = false;
      this.log('🏃 Vous prenez la fuite.', 'sys'); Game.sync(); Hooks.combatEnd({ res: 'flee' });
    } else { this.log('Fuite ratée !', 'bad'); this.finishAction(); }
  },

  /* --- Fin de combat --- */
  win() {
    const C = this.C; if (C.over) return; C.over = true; C.res = 'win';
    const S = Stats.get(), E = Stats.sum(), z = ZONE(C.ctx.zone), rm = (C.ctx.rewMul || 1) * (DIFFICULTY[G.p.diff || 'normal'] || DIFFICULTY.normal).rew;
    let xp = 0, gold = 0; const items = [], mats = {}, cons = {}; let unique = null;
    for (const e of C.enemies) {
      if (e.minion) continue;
      const tm = e.tier === 'boss' ? 6 : e.tier === 'elite' ? 2.5 : 1; let x = 12 * Math.pow(e.lvl, 1.3) * tm;
      if (G.p.lvl > e.lvl + 9) x *= .25; else if (G.p.lvl > e.lvl + 4) x *= .5;
      xp += x; gold += (6 + e.lvl * 3) * rnd(.7, 1.3) * (e.tier === 'boss' ? 8 : e.tier === 'elite' ? 2.5 : 1);
      if (chance(e.tier === 'boss' ? 1 : e.tier === 'elite' ? .75 : .17)) items.push(genItem({ ilvl: e.lvl + (e.boss ? 2 : 0), luck: E.lootLuck || 0, minR: e.boss ? 2 : e.tier === 'elite' ? 1 : 0 }));
      if (e.boss && G.bosses[e.tpl] !== true) { unique = bossUnique(e.tpl, e.lvl); items.push(unique); G.bosses[e.tpl] = true; }
      const pool = (z && z.mats.length ? z.mats : e.mats);
      if (pool.length && chance(e.tier === 'normal' ? .5 : 1)) { const k = pick(pool); mats[k] = (mats[k] || 0) + (e.tier === 'boss' ? rint(3, 5) : e.tier === 'elite' ? rint(2, 3) : rint(1, 2)); }
      if (chance(.1)) { const k = pick(['potion_hp', 'potion_mp', 'antidote']); cons[k] = (cons[k] || 0) + 1; }
    }
    xp = Math.round(xp * rm * (1 + (E.xpPct || 0))); gold = Math.round(gold * rm * (1 + (E.goldPct || 0)));
    Player.gold(gold); const ups = Player.addXp(xp);
    for (const it of items) Inv.add(it, 'drop');
    for (const k in mats) Mats.add(k, mats[k]);
    for (const k in cons) G.cons[k] = (G.cons[k] || 0) + cons[k];
    bump('battlesWon');
    if (G.p.hp > 0 && C.minHpPct < .10) bump('lowHpWins');
    if (C.dmgTaken === 0) bump('flawlessWins');
    if (C.round <= 3) bump('fastWins');
    if (C.maxSt >= 3) bump('cursedWins');
    if (E.regenPost) Player.heal(S.maxHp * E.regenPost);
    Player.restoreMp(S.maxMp * .1);
    const comp = Companions.afterBattle(xp);
    C.summary = { res: 'win', xp, gold, items, mats, cons, ups, unique, comp };
    G.flags.inCombat = false;
    this.log('🏆 Victoire !', 'good');
    if (C.ctx.onWin) C.ctx.onWin(C.summary);
    Game.sync(); Hooks.combatEnd(C.summary);
  },
  lose() {
    const C = this.C; if (C.over) return; C.over = true; C.res = 'lose';
    const E = Stats.sum(), S = Stats.get(); bump('deaths'); G.c.streak = 0;
    const loss = Math.floor(G.p.gold * (DIFFICULTY[G.p.diff || 'normal'] || DIFFICULTY.normal).loss * (1 - clamp(E.deathMit || 0, 0, 1)));
    G.p.gold -= loss; G.p.hp = Math.max(1, Math.round(S.maxHp * (.35 + (E.deathMit ? .15 : 0)))); G.p.mp = Math.round(S.maxMp * .5);
    G.flags.inCombat = false; G.flags.dungeon = null; this.log('☠ Vous êtes vaincu…', 'bad');
    C.summary = { res: 'lose', gold: -loss };
    Game.sync(); Hooks.combatEnd(C.summary);
  },
  // Appelé par l'interface quand le joueur ferme l'écran de résultat
  finish() { const C = this.C; if (!C) return; const cb = C.ctx.onEnd; this.C = null; if (cb) cb(C.res); }
};

/* ---------- 6b. COMPÉTENCES DES CLASSES ÉTENDUES ----------
   Chaque classe : 1 spéciale + 3 actives + 2 passives. Nouveaux effets : counter (riposte), extra (tour bonus),
   steal (vole de l'or), selfDmg (sacrifice de PV), buff « regen » (soin sur la durée). */
function cls6(cls, pre, o) {
  const A = (suf, a, tier, req, extra) => Object.assign({ id: pre + suf, n: a[0], ico: a[1], type: 'active', tier, mp: a[2], cd: a[3], d: a[4], fx: a[5], req }, extra);
  const P = (suf, a, tier, req) => ({ id: pre + suf, n: a[0], ico: a[1], type: 'passive', tier, d: a[2], eff: a[3], req });
  defSk(cls, [
    A('_sp', o.sp, 0, { lvl: 1 }, { special: true }), A('1', o.a1, 1, { lvl: 1 }), P('2', o.p1, 1, { lvl: 1 }),
    A('3', o.a2, 2, { lvl: 5, p: pre + '1' }), P('4', o.p2, 2, { lvl: 6, p: pre + '2' }),
    A('5', o.a3, 3, { lvl: 12, p: pre + '3', c: o.c })
  ]);
}
cls6('chevalier', 'c', {
  sp: ['Posture de contre', '🛡️', 10, 4, 'Pendant 3 tours, riposte à 120 % à chaque coup reçu.', { k: 'counter', m: 1.2, t: 3 }],
  a1: ['Coup de bouclier', '🛡️', 8, 0, 'Frappe (130 %), 40 % d’étourdir.', { k: 'dmg', t: 'phys', m: 1.3, st: ['stun', .4, 1] }],
  p1: ['Armure de plates', '🧱', '+7 % défense, −1 % dégâts subis par rang.', { defPct: .07, dmgTakenPct: -.01 }],
  a2: ['Serment de fer', '⚜️', 14, 4, 'Défense +40 % pendant 3 tours, soigne 10 % des PV.', { k: 'buff', b: { def: .4 }, t: 3, hs: .1 }],
  p2: ['Bastion', '🏯', '+5 % PV, +5 % d’efficacité de la défense par rang.', { hpPct: .05, defendBonus: .05 }],
  a3: ['Jugement du rempart', '⚖️', 24, 3, 'Coup titanesque (230 %), soigne 12 % des PV.', { k: 'dmg', t: 'phys', m: 2.3, hs: .12 }], c: ['defends', 20, 'défenses']
});
cls6('berserker', 'b', {
  sp: ['Rage sanglante', '🩸', 10, 4, 'Attaque +50 % mais défense −20 % pendant 3 tours.', { k: 'buff', b: { atk: .5, def: -.2 }, t: 3 }],
  a1: ['Hache furieuse', '🪓', 6, 0, 'Frappe (180 %), vous coûte 5 % de vos PV.', { k: 'dmg', t: 'phys', m: 1.8, selfDmg: .05 }],
  p1: ['Soif de sang', '🩸', '+2 % vol de vie, +2 % attaque par rang.', { lifesteal: .02, atkPct: .02 }],
  a2: ['Cyclone de lames', '🌪️', 16, 2, 'Frappe tous les ennemis (130 %), 40 % de saignement.', { k: 'dmg', t: 'phys', m: 1.3, aoe: true, st: ['bleed', .4, 3] }],
  p2: ['Peau de bête', '🐗', '+5 % PV, +10 % dégâts critiques par rang.', { hpPct: .05, critDmg: .1 }],
  a3: ['Fracasse-crâne', '💀', 24, 3, 'Coup brutal (300 %), +40 % sous 40 % PV, 50 % d’étourdir.', { k: 'dmg', t: 'phys', m: 3.0, exec: .4, st: ['stun', .5, 1] }], c: ['kills', 60, 'ennemis vaincus']
});
cls6('voleur', 'v', {
  sp: ['Vol à la tire', '💰', 8, 3, 'Frappe (100 %) et dérobe de l’or.', { k: 'dmg', t: 'phys', m: 1.0, steal: true }],
  a1: ['Coup bas', '🗡️', 8, 0, 'Frappe (150 %), +25 % critique, saignement.', { k: 'dmg', t: 'phys', m: 1.5, cb: 25, st: ['bleed', .5, 3] }],
  p1: ['Doigts agiles', '🤏', '+4 % butin rare et +4 % or par rang.', { lootLuck: .04, goldPct: .04 }],
  a2: ['Poussière aveuglante', '🌫️', 10, 3, 'La cible subit +30 % de dégâts pendant 3 tours.', { k: 'mark', v: .3, t: 3 }],
  p2: ['Esquive acrobatique', '🤸', '+2 % esquive, +1 vitesse par rang.', { dodgeFlat: 2, spdFlat: 1 }],
  a3: ['Mille lames', '✨', 26, 3, '5 coups rapides (5 × 70 %).', { k: 'dmg', t: 'phys', m: .7, hits: 5 }], c: ['dodges', 60, 'esquives']
});
cls6('chasseur', 'h', {
  sp: ['Marque du chasseur', '🎯', 6, 4, 'La cible subit +35 % de dégâts pendant 4 tours.', { k: 'mark', v: .35, t: 4 }],
  a1: ['Piège à loup', '🪤', 10, 2, 'Frappe (120 %), 50 % d’étourdir.', { k: 'dmg', t: 'phys', m: 1.2, st: ['stun', .5, 1] }],
  p1: ['Pisteur', '👣', '+4 % précision, +1 % critique par rang.', { precFlat: 4, critFlat: 1 }],
  a2: ['Flèche perforante', '➶', 14, 1, 'Tir puissant (200 %).', { k: 'dmg', t: 'phys', m: 2.0 }],
  p2: ['Instinct de traque', '🐺', '+4 % dégâts contre les boss, +2 % XP par rang.', { dmgBossPct: .04, xpPct: .02 }],
  a3: ['Salve du prédateur', '🏹', 28, 3, 'Volée sur tous les ennemis (160 %), saignement.', { k: 'dmg', t: 'phys', m: 1.6, aoe: true, st: ['bleed', .5, 3] }], c: ['killsElite', 5, 'élites vaincus']
});
cls6('mage_elem', 'e', {
  sp: ['Tempête élémentaire', '⛈️', 20, 3, 'Foudre sur tous les ennemis (2 × 120 %), 20 % d’étourdir.', { k: 'dmg', t: 'mag', m: 1.2, hits: 2, aoe: true, el: 'shock', st: ['stun', .2, 1] }],
  a1: ['Lance de glace', '❄️', 10, 0, 'Glace (170 %), 30 % de gel.', { k: 'dmg', t: 'mag', m: 1.7, el: 'ice', st: ['freeze', .3, 1] }],
  p1: ['Affinité élémentaire', '🔥', '+4 % dégâts de compétence, +5 % résistance feu et glace par rang.', { skillPct: .04, resFire: .05, resIce: .05 }],
  a2: ['Mur de flammes', '🔥', 14, 2, 'Brûle tous les ennemis (130 %), 60 % de brûlure.', { k: 'dmg', t: 'mag', m: 1.3, aoe: true, el: 'fire', st: ['burn', .6, 3] }],
  p2: ['Cœur du volcan', '🌋', '+6 % mana, +8 % dégâts d’altération par rang.', { mpPct: .06, dotPct: .08 }],
  a3: ['Cataclysme', '☄️', 36, 4, 'Désastre de feu sur tous (280 %).', { k: 'dmg', t: 'mag', m: 2.8, aoe: true, el: 'fire' }], c: ['statusApplied', 60, 'altérations infligées']
});
cls6('mage_chaos', 'x', {
  sp: ['Éclat chaotique', '💥', 14, 2, 'Déflagration (260 %) qui vous coûte 8 % de vos PV.', { k: 'dmg', t: 'mag', m: 2.6, el: 'dark', selfDmg: .08 }],
  a1: ['Entropie', '🧿', 12, 1, 'Dégâts (150 %), poison et brûlure.', { k: 'dmg', t: 'mag', m: 1.5, st: ['poison', .6, 4], st2: ['burn', .6, 3] }],
  p1: ['Folie contrôlée', '🎲', '+6 % dégâts de compétence, +2 % critique par rang.', { skillPct: .06, critFlat: 2 }],
  a2: ['Faille instable', '🕳️', 16, 2, 'Arcane sur tous (120 %), 25 % d’étourdir.', { k: 'dmg', t: 'mag', m: 1.2, aoe: true, el: 'arcane', st: ['stun', .25, 1] }],
  p2: ['Pacte du vide', '🌌', '+10 % dégâts critiques, +5 % mana par rang.', { critDmg: .1, mpPct: .05 }],
  a3: ['Singularité', '⚫', 40, 5, 'Effondrement (320 %) sur tous, coûte 10 % de PV.', { k: 'dmg', t: 'mag', m: 3.2, aoe: true, el: 'dark', selfDmg: .1 }], c: ['skillsUsed', 80, 'compétences utilisées']
});
cls6('invocateur', 'i', {
  sp: ['Appel du familier', '🐲', 16, 4, 'Un familier combat 5 tours (80 % de votre attaque).', { k: 'summon', n: 'Familier', pow: .8, t: 5, cnt: 1 }],
  a1: ['Lien spirituel', '💞', 10, 3, 'Soigne 20 % des PV via vos esprits.', { k: 'heal', f: .2 }],
  p1: ['Maître des esprits', '👻', '+10 % puissance des invocations, +4 % mana par rang.', { summonPct: .1, mpPct: .04 }],
  a2: ['Meute spectrale', '🐺', 24, 5, 'Invoque 2 loups spectraux pendant 4 tours.', { k: 'summon', n: 'Loup spectral', pow: .5, t: 4, cnt: 2 }],
  p2: ['Pacte renforcé', '📿', '+10 % invocations, +2 mana par victime par rang.', { summonPct: .1, onKillMp: 2 }],
  a3: ['Colosse invoqué', '🗿', 34, 6, 'Invoque un colosse (160 %) pendant 4 tours.', { k: 'summon', n: 'Colosse', pow: 1.6, t: 4, cnt: 1 }], c: ['summonsUsed', 25, 'invocations']
});
cls6('druide', 'd', {
  sp: ['Floraison', '🌸', 14, 4, 'Régénère 8 % des PV max par tour pendant 4 tours.', { k: 'buff', b: { regen: .08 }, t: 4 }],
  a1: ['Ronces', '🌹', 8, 0, 'Dégâts (140 %) et poison.', { k: 'dmg', t: 'mag', m: 1.4, el: 'poison', st: ['poison', .6, 4] }],
  p1: ['Sève vitale', '🌱', '+1 % PV par tour, +5 % soins par rang.', { regenTurn: .01, healPct: .05 }],
  a2: ['Griffes de l’ours', '🐻', 12, 1, 'Griffes (180 %), saignement.', { k: 'dmg', t: 'phys', m: 1.8, st: ['bleed', .5, 3] }],
  p2: ['Peau d’écorce', '🪵', '+4 % défense, +8 % résistance au poison par rang.', { defPct: .04, resPoison: .08 }],
  a3: ['Colère de la forêt', '🌲', 28, 3, 'Racines sur tous (210 %), poison.', { k: 'dmg', t: 'mag', m: 2.1, aoe: true, el: 'poison', st: ['poison', .6, 4] }], c: ['potions', 10, 'potions utilisées']
});
cls6('moine', 'o', {
  sp: ['Rafale de poings', '👊', 10, 2, '5 coups (5 × 50 %).', { k: 'dmg', t: 'phys', m: .5, hits: 5 }],
  a1: ['Paume vibrante', '🖐️', 8, 0, 'Frappe (160 %), 30 % d’étourdir.', { k: 'dmg', t: 'phys', m: 1.6, st: ['stun', .3, 1] }],
  p1: ['Corps affûté', '🧘', '+2 % esquive et +2 % critique par rang.', { dodgeFlat: 2, critFlat: 2 }],
  a2: ['Souffle intérieur', '🌬️', 0, 4, 'Rend 30 % du mana ; prochaine attaque critique.', { k: 'focus', mpf: .3 }],
  p2: ['Discipline', '☯️', '+2 vitesse, +5 % efficacité de la défense par rang.', { spdFlat: 2, defendBonus: .05 }],
  a3: ['Dragon ascendant', '🐉', 24, 3, 'Uppercut (300 %), +30 % critique.', { k: 'dmg', t: 'phys', m: 3.0, cb: 30 }], c: ['crits', 60, 'coups critiques']
});
cls6('samourai', 's', {
  sp: ['Iaïdo', '⚡', 12, 3, 'Dégainage (240 %), +40 % de critique.', { k: 'dmg', t: 'phys', m: 2.4, cb: 40 }],
  a1: ['Coupe-vent', '🌬️', 8, 0, 'Frappe (150 %), saignement.', { k: 'dmg', t: 'phys', m: 1.5, st: ['bleed', .5, 3] }],
  p1: ['Voie du sabre', '🗡️', '+10 % dégâts critiques, +2 % attaque par rang.', { critDmg: .1, atkPct: .02 }],
  a2: ['Posture du roseau', '🎋', 10, 3, 'Pendant 2 tours, riposte à 160 % à chaque coup reçu.', { k: 'counter', m: 1.6, t: 2 }],
  p2: ['Honneur', '🏮', '+2 % critique, +1 % esquive par rang.', { critFlat: 2, dodgeFlat: 1 }],
  a3: ['Mille éclats', '🌸', 26, 3, '3 coups (3 × 110 %), +20 % critique.', { k: 'dmg', t: 'phys', m: 1.1, hits: 3, cb: 20 }], c: ['counters', 10, 'ripostes']
});
cls6('lancier', 'l', {
  sp: ['Percée', '➳', 10, 2, '2 coups de lance (2 × 140 %).', { k: 'dmg', t: 'phys', m: 1.4, hits: 2 }],
  a1: ['Estoc', '🔱', 7, 0, 'Estoc précis (170 %).', { k: 'dmg', t: 'phys', m: 1.7 }],
  p1: ['Allonge', '📏', '+5 % pénétration d’armure, +1 vitesse par rang.', { penFlat: 5, spdFlat: 1 }],
  a2: ['Balayage', '🌀', 14, 2, 'Frappe tous les ennemis (120 %).', { k: 'dmg', t: 'phys', m: 1.2, aoe: true }],
  p2: ['Pointe affûtée', '📍', '+2 % critique, +4 % pénétration par rang.', { critFlat: 2, penFlat: 4 }],
  a3: ['Lance du dragon', '🐲', 26, 3, 'Coup perçant (300 %), +50 % sous 40 % PV.', { k: 'dmg', t: 'phys', m: 3.0, exec: .5 }], c: ['kills', 100, 'ennemis vaincus']
});
cls6('ingenieur', 'q', {
  sp: ['Tourelle', '🗼', 18, 5, 'Une tourelle tire pendant 4 tours (100 % de votre attaque).', { k: 'summon', n: 'Tourelle', pow: 1.0, t: 4, cnt: 1 }],
  a1: ['Grenade runique', '💣', 12, 2, 'Explose sur tous (110 %), 50 % de brûlure.', { k: 'dmg', t: 'phys', m: 1.1, aoe: true, el: 'fire', st: ['burn', .5, 3] }],
  p1: ['Ingénierie', '🔧', '+4 % dégâts de compétence, +3 % butin par rang.', { skillPct: .04, lootLuck: .03 }],
  a2: ['Bouclier arcanique', '🔰', 12, 4, 'Défense +35 % pendant 3 tours.', { k: 'buff', b: { def: .35 }, t: 3 }],
  p2: ['Mécanisme précis', '⚙️', '+2 % critique, +3 % précision par rang.', { critFlat: 2, precFlat: 3 }],
  a3: ['Canon arcanique', '🔫', 30, 4, 'Rayon concentré (300 %).', { k: 'dmg', t: 'mag', m: 3.0, el: 'arcane' }], c: ['skillsUsed', 60, 'compétences utilisées']
});
cls6('barde', 'ba', {
  sp: ['Chant de bravoure', '🎶', 14, 4, 'Attaque +25 %, défense +15 %, +20 % critique pendant 4 tours.', { k: 'buff', b: { atk: .25, def: .15, crit: 20 }, t: 4 }],
  a1: ['Note perçante', '🔔', 6, 0, 'Son (130 %), 25 % d’étourdir.', { k: 'dmg', t: 'mag', m: 1.3, st: ['stun', .25, 1] }],
  p1: ['Voix envoûtante', '🎤', '+5 % soins, +2 % XP par rang.', { healPct: .05, xpPct: .02 }],
  a2: ['Berceuse', '🌙', 12, 3, 'Soigne 25 % des PV.', { k: 'heal', f: .25 }],
  p2: ['Répertoire', '📜', '+5 % mana, +3 % dégâts de compétence par rang.', { mpPct: .05, skillPct: .03 }],
  a3: ['Crescendo', '🎼', 28, 3, 'Onde sonore sur tous (200 %), 30 % d’étourdir.', { k: 'dmg', t: 'mag', m: 2.0, aoe: true, st: ['stun', .3, 1] }], c: ['skillsUsed', 50, 'compétences utilisées']
});
cls6('chevalier_noir', 'cn', {
  sp: ['Étreinte sombre', '🖤', 14, 3, 'Frappe sombre (200 %), soigne 50 % des dégâts.', { k: 'dmg', t: 'phys', m: 2.0, el: 'dark', hd: .5 }],
  a1: ['Lame maudite', '🗡️', 10, 0, 'Frappe (160 %), poison des ténèbres.', { k: 'dmg', t: 'phys', m: 1.6, el: 'dark', st: ['poison', .6, 4] }],
  p1: ['Armure d’ombre', '🌑', '−2 % dégâts subis, +1 % vol de vie par rang.', { dmgTakenPct: -.02, lifesteal: .01 }],
  a2: ['Pacte funeste', '📿', 12, 4, 'Attaque +40 %, défense −15 % pendant 3 tours.', { k: 'buff', b: { atk: .4, def: -.15 }, t: 3 }],
  p2: ['Appétit des ténèbres', '😈', '+2 % vol de vie, +3 % attaque par rang.', { lifesteal: .02, atkPct: .03 }],
  a3: ['Fauchée noire', '⚰️', 30, 4, 'Arc sombre sur tous (220 %), soigne 30 %.', { k: 'dmg', t: 'phys', m: 2.2, aoe: true, el: 'dark', hd: .3 }], c: ['killsBoss', 5, 'boss vaincus']
});
cls6('chronomancien', 't', {
  sp: ['Arrêt du temps', '⏱️', 20, 5, 'Vous rejouez immédiatement ; rend 10 % du mana.', { k: 'extra', mpf: .1 }],
  a1: ['Éclat temporel', '⌛', 10, 0, 'Arcane (160 %), 20 % d’étourdir.', { k: 'dmg', t: 'mag', m: 1.6, el: 'arcane', st: ['stun', .2, 1] }],
  p1: ['Sens du temps', '🕰️', '+2 vitesse, +1 % esquive par rang.', { spdFlat: 2, dodgeFlat: 1 }],
  a2: ['Hâte', '💨', 14, 4, 'Attaque +20 %, esquive +15 % pendant 3 tours.', { k: 'buff', b: { atk: .2, dodge: .15 }, t: 3 }],
  p2: ['Écho temporel', '🔁', '+2 % tour supplémentaire, +4 % mana par rang.', { extraTurn: .02, mpPct: .04 }],
  a3: ['Distorsion', '🌀', 32, 4, 'Onde temporelle sur tous (240 %), 30 % de gel.', { k: 'dmg', t: 'mag', m: 2.4, aoe: true, el: 'arcane', st: ['freeze', .3, 1] }], c: ['fastWins', 15, 'victoires rapides']
});

/* ---------- 8. EXPLORATION / ÉVÉNEMENTS / DONJONS ---------- */
const NARR = [
  { id: 'voyageur', n: 'Le voyageur blessé', zones: null, minLvl: 1, w: 3, txt: 'Un voyageur gît au bord du chemin, la jambe prise dans un piège à loups. Il vous supplie du regard.', ch: [
    { t: 'Le soigner (1 potion de soin)', need: { cons: 'potion_hp' }, out: [{ p: 1, txt: 'Il vous remercie avec émotion et vous glisse quelques pièces.', do: { gold: 30, xp: 25, rep: { couronne: 6 }, c: { kind: 1 } } }] },
    { t: 'Le détrousser', out: [{ p: .7, txt: 'Vous lui prenez sa bourse sans bruit.', do: { gold: 55, rep: { couronne: -8, ombres: 5 }, c: { ruthless: 1 } } }, { p: .3, txt: 'Des gardes surgissent et vous prennent pour un bandit !', do: { rep: { couronne: -8 }, c: { ruthless: 1 }, fight: { tpl: 'bandit', n: 2 } } }] },
    { t: 'Passer votre chemin', out: [{ p: 1, txt: 'Vous poursuivez votre route, le cœur lourd.', do: {} }] }] },
  { id: 'gobelin_captif', n: 'Le gobelin captif', zones: ['plaines'], minLvl: 1, w: 3, once: true, txt: 'Un jeune gobelin est ligoté à un arbre par des chasseurs. Il vous regarde avec des yeux immenses.', ch: [
    { t: 'Le libérer', out: [{ p: 1, txt: '« Grok n’oubliera pas ! » Le gobelin file dans les fourrés. Il connaît peut-être un chemin vers le Roi…', do: { rep: { sylve: 10, couronne: -3 }, c: { kind: 1 }, flag: 'gobelinSpared', xp: 30 } }] },
    { t: 'Le vendre au marchand', out: [{ p: 1, txt: 'Un marchand vous paie bien, sans poser de questions.', do: { gold: 90, c: { ruthless: 1 }, rep: { sylve: -8 } } }] },
    { t: 'Le laisser', out: [{ p: 1, txt: 'Ce n’est pas votre affaire.', do: {} }] }] },
  { id: 'esprit', n: 'L’esprit sylvestre', zones: ['foret', 'plaines'], minLvl: 3, w: 2, txt: 'Une lueur verte danse entre les troncs. Un esprit de la forêt vous observe, curieux et méfiant.', ch: [
    { t: 'Offrir 2 herbes', need: { mats: { herb: 2 } }, out: [{ p: 1, txt: 'L’esprit sourit. Une chaleur apaisante vous enveloppe.', do: { rep: { sylve: 10 }, hp: .5, mp: .5, c: { kind: 1 } } }] },
    { t: 'L’écouter', out: [{ p: 1, txt: 'Il vous murmure des secrets de la forêt.', do: { xp: 60 } }] },
    { t: 'Le défier', out: [{ p: 1, txt: 'L’esprit se déchaîne !', do: { rep: { sylve: -10 }, fight: { tpl: 'esprit_hostile', n: 1, elite: true } } }] }] },
  { id: 'autel', n: 'L’autel sombre', zones: ['marais', 'cimetiere', 'montagne'], minLvl: 8, w: 2, txt: 'Un autel de pierre noire, couvert de runes qui palpitent. Un murmure promet puissance… moyennant un prix.', ch: [
    { t: 'Offrir son sang (−25 % PV)', out: [{ p: 1, txt: 'La pierre boit votre sang. Quelque chose, désormais, vous lie à elle.', do: { hp: -.25, c: { bloodPact: 1 }, rep: { cercle: -5 } } }] },
    { t: 'Prier', out: [{ p: 1, txt: 'Une paix étrange. Le Cercle Arcanique approuve votre prudence.', do: { rep: { cercle: 6 }, mp: 1 } }] },
    { t: 'Profaner l’autel', out: [{ p: .6, txt: 'Vous raflez les offrandes.', do: { gold: 140, c: { ruthless: 1 } } }, { p: .4, txt: 'L’autel vous repousse violemment !', do: { hp: -.2, c: { ruthless: 1 } } }] }] },
  { id: 'duel', n: 'Le duel d’honneur', zones: ['plaines', 'montagne', 'foret'], minLvl: 4, w: 2, txt: 'Un duelliste vous barre la route : « On dit que vous êtes fort. Prouvez-le, ou avouez votre couardise. »', ch: [
    { t: 'Accepter le duel', out: [{ p: 1, txt: 'Les lames sont tirées !', do: { fight: { tpl: 'duelliste', n: 1, elite: true, noFlee: true, win: { rep: { couronne: 15 }, gold: 80, xp: 80 } } } }] },
    { t: 'Refuser poliment', out: [{ p: 1, txt: 'Le duelliste crache par terre, déçu.', do: { rep: { couronne: -4 } } }] }] },
  { id: 'oracle', n: 'L’Oracle oublié', zones: null, minLvl: 10, w: 4, once: true, cond: () => val('hiddenChests') >= 3, txt: 'Derrière un rideau de lierre, une alcôve vous attend. Une silhouette translucide lève la tête : « Enfin. Celui qui cherche… »', ch: [
    { t: 'Écouter la prophétie', out: [{ p: 1, txt: '« Vos actes forgent ce que vous êtes. Continuez. » Une lumière vous traverse : quelque chose s’éveille.', do: { c: { oracle: 1 }, xp: 300, hp: 1, mp: 1 } }] },
    { t: 'Ne pas s’attarder', out: [{ p: 1, txt: 'Vous vous détournez. Quand vous revenez, l’alcôve est vide.', do: {} }] }] },
  { id: 'colporteur', n: 'Le colporteur louche', zones: null, minLvl: 3, w: 3, txt: 'Un colporteur vous propose une « boîte mystère » pour 150 pièces. « Garantie à 100 % sans remboursement ! »', ch: [
    { t: 'Acheter la boîte (150 or)', need: { gold: 150 }, out: [{ p: .5, txt: 'Quelques babioles sans valeur…', do: { items: [{ minR: 0 }] } }, { p: .35, txt: 'Un bel objet !', do: { items: [{ minR: 2 }] } }, { p: .15, txt: 'Un trésor !', do: { items: [{ minR: 3 }] } }] },
    { t: 'Marchander', out: [{ p: .5, txt: 'Il cède : un petit cadeau.', do: { cons: { potion_mp: 1 } } }, { p: .5, txt: 'Il se vexe et s’en va.', do: {} }] },
    { t: 'Refuser', out: [{ p: 1, txt: 'Il hausse les épaules.', do: {} }] }] },
  { id: 'pont', n: 'Le pont effondré', zones: ['montagne', 'foret', 'marais'], minLvl: 5, w: 2, txt: 'Un pont de cordes pend au-dessus d’un ravin. De l’autre côté, un coffre luit faiblement.', ch: [
    { t: 'Tenter la traversée', out: [{ p: .55, txt: 'Vous passez de justesse et ouvrez le coffre !', do: { gold: 90, items: [{ minR: 1 }], c: { chests: 1, hiddenChests: 1 } } }, { p: .45, txt: 'Les cordes lâchent ! Vous vous rattrapez de justesse.', do: { hp: -.2 } }] },
    { t: 'Contourner', out: [{ p: 1, txt: 'Un long détour, mais quelques herbes sur le chemin.', do: { mats: { herb: 2 } } }] }] },
  { id: 'ombres', n: 'Contact de la Guilde', zones: null, minLvl: 6, w: 2, txt: 'Une silhouette encapuchonnée vous glisse un pli : « La Guilde des Ombres a du travail. Pour un prix, bien sûr. »', ch: [
    { t: 'Payer 60 or pour le contrat', need: { gold: 60 }, out: [{ p: 1, txt: 'Vous livrez le colis sans poser de questions. La Guilde note votre discrétion.', do: { gold: 160, rep: { ombres: 12 }, xp: 50 } }] },
    { t: 'Dénoncer à la Garde', out: [{ p: 1, txt: 'La Garde vous remercie. Les Ombres, moins.', do: { rep: { couronne: 10, ombres: -12 }, gold: 40, c: { kind: 1 } } }] },
    { t: 'Ignorer', out: [{ p: 1, txt: 'La silhouette s’efface dans la brume.', do: {} }] }] },
  { id: 'o_nord', n: 'Un frère de clan', zones: null, minLvl: 2, w: 6, once: true, cond: () => G.p.origin === 'nord', txt: 'Un guerrier aux tresses givrées vous reconnaît : « Par Skadi ! Un des nôtres, si loin des fjords ! » Il vous tend une corne d’hydromel.', ch: [
    { t: 'Trinquer avec lui', out: [{ p: 1, txt: 'Vous échangez des nouvelles du pays. Il vous offre une potion et un conseil de survie.', do: { xp: 60, cons: { potion_hp: 1 }, hp: .3, c: { originEv: 1, kind: 1 } } }] },
    { t: 'Le défier en lutte', out: [{ p: .6, txt: 'Vous le clouez au sol ! Il rit et paie son pari.', do: { gold: 70, c: { originEv: 1 } } }, { p: .4, txt: 'Il vous écrase avec bonne humeur.', do: { hp: -.1, c: { originEv: 1 } } }] }] },
  { id: 'o_zahar', n: 'La caravane de Zahar', zones: null, minLvl: 2, w: 6, once: true, cond: () => G.p.origin === 'zahar', txt: 'Une caravane aux tentures safran s’arrête. Le chef de convoi reconnaît votre accent : « Un enfant de Zahar ! Pour vous, un prix d’ami. »', ch: [
    { t: 'Marchander une potion rare (60 or)', need: { gold: 60 }, out: [{ p: 1, txt: 'Affaire conclue. Il glisse même une pièce en bonus.', do: { cons: { potion_hp2: 1 }, gold: 20, c: { originEv: 1 } } }] },
    { t: 'Échanger des histoires', out: [{ p: 1, txt: 'Il vous apprend à repérer les bonnes affaires.', do: { xp: 50, rep: { ombres: 3 }, c: { originEv: 1 } } }] }] },
  { id: 'o_ilvane', n: 'L’arbre qui se souvient', zones: ['foret', 'plaines', 'marais'], minLvl: 3, w: 6, once: true, cond: () => G.p.origin === 'ilvane', txt: 'Un vieil arbre murmure votre nom d’enfance. Les gens d’Ilvane sont les seuls à entendre ainsi leurs aînés.', ch: [
    { t: 'Poser la main sur l’écorce', out: [{ p: 1, txt: 'Une chaleur vous traverse : la sève chante en vous.', do: { hp: 1, mp: 1, rep: { sylve: 8 }, c: { originEv: 1 } } }] },
    { t: 'Passer sans écouter', out: [{ p: 1, txt: 'Le murmure s’éteint, un peu triste.', do: { rep: { sylve: -3 } } }] }] },
  { id: 'o_mercenaire', n: 'L’ancien employeur', zones: null, minLvl: 3, w: 6, once: true, cond: () => G.p.bg === 'mercenaire', txt: 'Un homme cicatrisé vous barre la route : « Tu as quitté la compagnie sans payer ta dette. » Il n’a pas l’air d’humeur à plaisanter.', ch: [
    { t: 'Payer 50 or', need: { gold: 50 }, out: [{ p: 1, txt: 'Il empoche la bourse et s’efface. La dette est réglée.', do: { rep: { ombres: 5 }, c: { originEv: 1 } } }] },
    { t: 'L’affronter', out: [{ p: 1, txt: 'Il dégaine !', do: { c: { originEv: 1 }, fight: { tpl: 'duelliste', n: 1, elite: true, win: { gold: 90, xp: 80, rep: { ombres: 6 } } } } }] }] },
  { id: 'o_pelerin', n: 'Le sanctuaire oublié', zones: null, minLvl: 3, w: 6, once: true, cond: () => G.p.bg === 'pelerin', txt: 'Un petit sanctuaire moussu, que vous reconnaissez : celui de votre pèlerinage. Une lueur douce vous appelle.', ch: [
    { t: 'Prier', out: [{ p: 1, txt: 'La paix revient. Vous vous sentez pardonné.', do: { hp: 1, xp: 70, c: { originEv: 1, kind: 1 } } }] },
    { t: 'Continuer', out: [{ p: 1, txt: 'Plus tard, peut-être.', do: {} }] }] },
  { id: 'mage', n: 'Le mage égaré', zones: null, minLvl: 5, w: 2, txt: 'Un apprenti du Cercle Arcanique cherche ses parchemins, perdu et paniqué.', ch: [
    { t: 'L’aider à chercher', out: [{ p: 1, txt: 'Vous retrouvez ses parchemins. Il vous offre une potion de mana.', do: { rep: { cercle: 10 }, cons: { potion_mp: 1 }, c: { kind: 1 }, xp: 40 } }] },
    { t: 'Lui voler un parchemin', out: [{ p: 1, txt: 'Le parchemin se vend bien… mais le Cercle l’apprendra.', do: { gold: 80, rep: { cercle: -10 }, c: { ruthless: 1 } } }] },
    { t: 'L’ignorer', out: [{ p: 1, txt: 'Il s’éloigne en trébuchant.', do: {} }] }] }
];
const Narr = {
  pick(Z) {
    const pool = NARR.filter(e => (!e.zones || e.zones.includes(Z.id)) && G.p.lvl >= e.minLvl && (!e.once || !G.seenEv[e.id]) && (!e.cond || e.cond()));
    return pool.length ? wpick(pool, e => e.w) : null;
  },
  canPay(need) {
    if (!need) return true;
    if (need.cons && (G.cons[need.cons] || 0) < 1) return false;
    if (need.gold && G.p.gold < need.gold) return false;
    if (need.mats && !Mats.has(need.mats)) return false;
    return true;
  },
  choose(evId, i) {
    const ev = NARR.find(e => e.id === evId), ch = ev.ch[i];
    if (!this.canPay(ch.need)) return null;
    if (ch.need) { if (ch.need.cons) G.cons[ch.need.cons]--; if (ch.need.gold) G.p.gold -= ch.need.gold; if (ch.need.mats) Mats.take(ch.need.mats); }
    G.seenEv[evId] = (G.seenEv[evId] || 0) + 1; bump('choices');
    const o = wpick(ch.out, x => x.p), d = o.do, lines = [];
    const rr = Object.assign({}, d); delete rr.hp; delete rr.mp; delete rr.c; delete rr.flag; delete rr.fight;
    lines.push(...Game.reward(rr));
    const S = Stats.get();
    if (d.hp) { if (d.hp > 0) Player.heal(S.maxHp * d.hp); else { G.p.hp = Math.max(1, G.p.hp - Math.round(S.maxHp * -d.hp)); lines.push(`−${pc(-d.hp)} % PV`); } }
    if (d.mp) Player.restoreMp(S.maxMp * d.mp);
    if (d.c) for (const k in d.c) bump(k, d.c[k]);
    if (d.flag) G.flags[d.flag] = true;
    Game.sync();
    return { txt: o.txt, lines, fight: d.fight };
  },
  startFight(f) {
    const Z = ZONE(U_zone()), lvl = clamp(G.p.lvl, Z.min, Z.max), en = [];
    for (let i = 0; i < (f.n || 1); i++) en.push(Enemies.make(f.tpl, lvl, f.elite ? 'elite' : undefined));
    Combat.start({ enemies: en, canFlee: !f.noFlee, zone: Z.id, kind: 'event', onWin: f.win ? () => Game.reward(f.win) : null, onEnd() { } });
  }
};

const Explore = {
  group(Z) {
    const lvl = clamp(G.p.lvl + rint(-1, 1), Z.min, Z.max), n = G.p.lvl < 4 ? 1 : G.p.lvl < 12 ? rint(1, 2) : rint(1, 3), en = [];
    if (chance(.12) && G.p.lvl >= Z.min) { en.push(Enemies.make(pick(Z.enemies), lvl + 1, 'elite')); if (n > 1 && chance(.5)) en.push(Enemies.make(pick(Z.enemies), lvl)); }
    else for (let i = 0; i < n; i++) en.push(Enemies.make(pick(Z.enemies), clamp(lvl + rint(-1, 0), 1, 99)));
    return en;
  },
  fight(en, Z) { Combat.start({ enemies: en, canFlee: true, zone: Z.id, kind: 'explore', onEnd() { } }); },
  // Tentative d'apaisement avant combat
  pacify(en, Z) {
    const S = Stats.get(), E = Stats.sum();
    const p = clamp(.35 + S.int * .01 + (G.rep.sylve || 0) / 400 + (E.peaceBonus || 0), .1, .9);
    if (chance(p)) {
      bump('pacified'); addRep('sylve', 2); const xp = Math.round(12 * Math.pow(en[0].lvl, 1.3) * en.length * .5);
      Player.addXp(xp); Game.sync(); return { ok: true, msg: `Les créatures s’apaisent et s’éloignent. (+${xp} XP)` };
    }
    for (const e of en) e.atk *= 1.1;
    return { ok: false, msg: 'Votre tentative échoue : les créatures s’énervent !' };
  },
  go(zid) {
    if (G.flags.inCombat) return null;
    const Z = ZONE(zid); if (!Z) return null;
    if (G.p.lvl < Z.min - 1) return { msg: 'Cette zone est bien trop dangereuse pour le moment.' };
    const S = Stats.get(), zs = G.zones[zid] || (G.zones[zid] = { ex: 0 }), was = zs.ex;
    zs.ex = Math.min(100, zs.ex + 4); bump('explorations'); Player.heal(S.maxHp * .02);
    let res = { msg: '' };
    const k = wpick([{ k: 'enc', w: 42 }, { k: 'chest', w: 11 }, { k: 'gather', w: 15 }, { k: 'good', w: 9 }, { k: 'bad', w: 8 }, { k: 'narr', w: 11 }], x => x.w).k;
    if (k === 'enc') { const g = this.group(Z); res = { msg: 'Une rencontre !', encounter: g, zone: Z }; }
    else if (k === 'chest') {
      if (chance(.08)) { res = { msg: '📦 Le coffre était une Mimique !' }; Game.sync(); this.fight([Enemies.make('mimique', clamp(G.p.lvl, Z.min, Z.max))], Z); return res; }
      const lines = this.chest(Z); res = { msg: '🎁 Vous découvrez un coffre caché !', lines };
    }
    else if (k === 'gather') {
      const m = pick(Z.mats), n = rint(2, 4); Mats.add(m, n); res = { msg: `${MATS[m][1]} Vous récoltez ${n} × ${MATS[m][0]}.` };
    }
    else if (k === 'good') {
      const r = rint(0, 3);
      if (r === 0) { const g = Math.round(rint(15, 40) * (1 + G.p.lvl * .3)); Player.gold(g); res = { msg: `💰 Vous trouvez une bourse oubliée : +${g} or.` }; }
      else if (r === 1) { Player.heal(S.maxHp); Player.restoreMp(S.maxMp); res = { msg: '⛲ Une source pure vous rend toutes vos forces.' }; }
      else if (r === 2) { const x = Math.round(20 * Math.pow(G.p.lvl, 1.2)); Player.addXp(x); res = { msg: `📜 Une inscription ancienne vous instruit : +${x} XP.` }; }
      else { G.cons.potion_hp = (G.cons.potion_hp || 0) + 1; res = { msg: '🧪 Vous trouvez une potion de soin abandonnée.' }; }
    }
    else if (k === 'bad') {
      const r = rint(0, 2);
      if (r === 0) { const d = Math.max(1, Math.min(G.p.hp - 1, Math.round(S.maxHp * rnd(.08, .18)))); G.p.hp -= d; res = { msg: `🪤 Un piège se referme sur vous : −${d} PV.` }; }
      else if (r === 1) { const g = Math.min(G.p.gold, Math.round(G.p.gold * .08)); G.p.gold -= g; res = { msg: `🦝 Un voleur vous délaisse de ${g} or.` }; }
      else { const m = Math.round(G.p.mp * .4); G.p.mp -= m; res = { msg: `🌫️ Un brouillard étrange vous draine : −${m} mana.` }; }
    }
    else {
      const ev = Narr.pick(Z);
      if (ev) res = { msg: ev.n, narrative: ev, zone: Z }; else { const m = pick(Z.mats); Mats.add(m, 2); res = { msg: `${MATS[m][1]} Vous récoltez 2 × ${MATS[m][0]}.` }; }
    }
    if (was < 100 && zs.ex >= 100) {
      const it = genItem({ ilvl: Z.max, minR: 2, luck: Stats.sum().lootLuck || 0 }); Inv.add(it, 'drop');
      Player.addXp(Math.round(60 * Math.pow(Z.max, 1.2)));
      res.bonus = `🗺️ ${Z.n} entièrement explorée ! Récompense : ${it.name}.`;
    }
    Game.sync(); return res;
  },
  chest(Z) {
    const lines = [], E = Stats.sum(); bump('chests'); bump('hiddenChests');
    const g = Math.round((6 + G.p.lvl * 5) * rnd(1, 2) * (1 + (E.goldPct || 0))); Player.gold(g); lines.push(`+${g} or`);
    const m = pick(Z.mats), n = rint(1, 3); Mats.add(m, n); lines.push(`+${n} ${MATS[m][0]}`);
    if (chance(.7)) { const it = genItem({ ilvl: clamp(G.p.lvl, Z.min, Z.max + 2), luck: (E.lootLuck || 0) + .1 }); Inv.add(it, 'drop'); lines.push(`Objet : ${it.name} (${RARITIES[it.r].n})`); }
    return lines;
  },
  rest() {
    const cost = G.p.lvl * 4; if (G.flags.inCombat || G.p.gold < cost) return false;
    G.p.gold -= cost; const S = Stats.get(); G.p.hp = S.maxHp; G.p.mp = S.maxMp; Game.sync(); return cost;
  }
};
const U_zone = () => (typeof U !== 'undefined' && U.zone) || 'plaines';

const Dungeon = {
  D: null,
  avail(d) { return G.p.lvl >= BOSSES[d.boss].lvl - 4 && (!d.req || val(d.req) >= 1); },
  diffOK(d, i) { return i === 0 || !!(G.dung[d.id] && G.dung[d.id][i - 1]); },
  start(id, diff) {
    const d = DUNGEON(id); if (!d || G.flags.inCombat || !this.avail(d) || !this.diffOK(d, diff)) return;
    this.D = { id, diff, stage: 0 }; G.flags.dungeon = id; this.next();
  },
  next() {
    const D = this.D, d = DUNGEON(D.id), B = BOSSES[d.boss], Z = ZONE(d.zone), off = DIFFS[D.diff].off, st = d.stages[D.stage], bl = B.lvl + off, en = [];
    if (st.t === 'n') for (let i = 0; i < st.c; i++) en.push(Enemies.make(pick(Z.enemies), bl - 2));
    else if (st.t === 'e') en.push(Enemies.make(pick(Z.enemies), bl - 1, 'elite'));
    else en.push(Enemies.make(d.boss, bl));
    Combat.start({ enemies: en, canFlee: false, zone: d.zone, kind: 'dungeon', rewMul: DIFFS[D.diff].rew, onEnd: res => this.after(res) });
  },
  after(res) {
    const D = this.D; if (!D) return;
    if (res !== 'win') { this.D = null; G.flags.dungeon = null; Game.sync(); return; }
    D.stage++; const d = DUNGEON(D.id);
    if (D.stage >= d.stages.length) this.complete(false);
    else { const S = Stats.get(); Player.heal(S.maxHp * .15); Player.restoreMp(S.maxMp * .1); Game.sync(); Hooks.dungeonStage({ stage: D.stage, total: d.stages.length, name: d.n }); }
  },
  canNegotiate() {
    const D = this.D; if (!D) return false; const d = DUNGEON(D.id);
    return d.boss === 'gobelin_roi' && D.stage === d.stages.length - 1 && G.flags.gobelinSpared && (G.rep.sylve || 0) >= 10;
  },
  negotiate() {
    if (!this.canNegotiate()) return;
    bump('pacified'); bump('bk_gobelin_roi'); G.bosses.gobelin_roi = G.bosses.gobelin_roi || 'peace'; G.flags.grokMet = true; addRep('sylve', 10);
    this.complete(true);
  },
  complete(peace) {
    const D = this.D, d = DUNGEON(D.id), B = BOSSES[d.boss], df = DIFFS[D.diff], E = Stats.sum(), lines = [];
    G.dung[d.id] = G.dung[d.id] || {}; const first = !G.dung[d.id][D.diff]; G.dung[d.id][D.diff] = true;
    if (D.diff === 2) { bump('dungNight'); if (d.boss === 'devoreur') bump('bk_devoreur_n'); }
    bump('dungeonsDone');
    const g = Math.round(B.lvl * 40 * df.rew * (peace ? .5 : 1) * (1 + (E.goldPct || 0))); Player.gold(g); lines.push(`+${fmt(g)} or`);
    const n = peace ? 1 : 1 + D.diff + (first ? 1 : 0);
    for (let i = 0; i < n; i++) { const it = genItem({ ilvl: B.lvl + df.off + 2, minR: 2 + D.diff, luck: (E.lootLuck || 0) + .1 * D.diff }); Inv.add(it, 'drop'); lines.push(`Butin : ${it.name} (${RARITIES[it.r].n})`); }
    addRep('couronne', 3 + D.diff * 2); if (peace) lines.push('Le Roi Gobelin se retire sans combattre. Grok souhaite vous suivre.');
    this.D = null; G.flags.dungeon = null; Game.sync();
    Hooks.dungeonDone({ name: d.n, diff: df.n, lines, peace });
  }
};

/* ---------- 9. COMPAGNONS / ARTISANAT / MARCHÉ ---------- */
const COMPS = {
  lyra: { n: 'Lyra', i: '🏹', role: 'Éclaireuse · dégâts', atk: 6, grow: 3.2, skill: { n: 'Tir double', k: 'dmg', m: 1.4, hits: 2, cd: 3 }, basic: true,
    rec: { l: 'Atteindre le niveau 3', g: [{ c: 'level', n: 3 }] }, bonds: [{ b: 25, eff: { critFlat: 2 } }, { b: 50, eff: { critFlat: 3, spdFlat: 2 } }, { b: 100, eff: { atkPct: .05 } }],
    lines: ['« Les araignées de la forêt ont dévoré ma famille. Je veux qu’elles paient. »', '« Tu te bats bien. Pas aussi bien que moi, mais bien. »', '« Je n’ai jamais eu quelqu’un sur qui compter. Merci. »'] },
  aldric: { n: 'Frère Aldric', i: '⛪', role: 'Soigneur · soutien', atk: 3, grow: 2, skill: { n: 'Soin sacré', k: 'heal', m: .2, cd: 3 }, basic: true,
    rec: { l: 'Réputation 30 auprès de la Couronne', g: [{ c: 'rep_couronne', n: 30 }] }, bonds: [{ b: 25, eff: { healPct: .05 } }, { b: 50, eff: { defPct: .04, hpPct: .04 } }, { b: 100, eff: { regenPost: .04 } }],
    lines: ['« La lumière guide ceux qui marchent droit. »', '« Je prie pour toi chaque soir. N’y vois pas de pression. »', '« Mon serment s’achève ici : je te suivrai jusqu’au bout. »'] },
  grok: { n: 'Grok', i: '👹', role: 'Protecteur · bouclier', atk: 4, grow: 2.4, skill: { n: 'Rempart', k: 'shield', m: .25, cd: 4 }, basic: true,
    rec: { l: 'Apaiser 2 rencontres', g: [{ c: 'pacified', n: 2 }] }, bonds: [{ b: 25, eff: { defPct: .04 } }, { b: 50, eff: { dmgTakenPct: -.03 } }, { b: 100, eff: { hpPct: .06 } }],
    lines: ['« Grok petit mais costaud ! Grok protège ami ! »', '« Toi pas comme autres humains. Toi bon. »', '« Grok jamais oublier. Grok toujours là. »'] },
  mortimer: { n: 'Mortimer', i: '☠️', role: 'Mage · altérations', atk: 5, grow: 3, skill: { n: 'Malédiction', k: 'poison', cd: 3 }, basic: true,
    rec: { l: 'Niveau 14 et 5 victoires au Cimetière Oublié', g: [{ c: 'level', n: 14 }, { c: 'kz_cimetiere', n: 5 }] }, bonds: [{ b: 25, eff: { dotPct: .1 } }, { b: 50, eff: { statusChance: .08 } }, { b: 100, eff: { skillPct: .06 } }],
    lines: ['« Être mort ne m’a jamais empêché de travailler. »', '« Ce cimetière a des secrets. Je te les dirai peut-être. »', '« Le dernier vivant qui m’ait parlé gentiment… c’était toi. »'] }
};
const Companions = {
  can(id) { return COMPS[id].rec.g.every(g => val(g.c) >= g.n); },
  recruit(id) {
    if (!this.can(id) || (G.comp[id] && G.comp[id].rec)) return;
    G.comp[id] = { rec: true, lvl: Math.max(1, G.p.lvl - 1), xp: 0, bond: 0, talk: '' };
    if (!G.active) G.active = id; Hooks.toast(`${COMPS[id].n} rejoint votre groupe !`, 'good'); Game.sync();
  },
  setActive(id) { if (G.comp[id] && G.comp[id].rec && !G.flags.inCombat) { G.active = G.active === id ? null : id; Game.sync(); } },
  need(l) { return Math.floor(40 * Math.pow(l, 1.4)); },
  afterBattle(xp) {
    const c = G.active && G.comp[G.active]; if (!c) return null;
    c.bond++; c.xp += Math.round(xp * .6); let up = 0;
    while (c.lvl < MAXLVL && c.xp >= this.need(c.lvl)) { c.xp -= this.need(c.lvl); c.lvl++; up++; }
    return { n: COMPS[G.active].n, up, lvl: c.lvl };
  },
  talk(id) {
    const c = G.comp[id]; if (!c || c.talk === today()) return null;
    c.talk = today(); c.bond += 3; const L = COMPS[id].lines; Game.sync();
    return L[c.bond >= 60 ? 2 : c.bond >= 20 ? 1 : 0];
  },
  gift(id) {
    const c = G.comp[id], cost = G.p.lvl * 20; if (!c || G.p.gold < cost) return false;
    G.p.gold -= cost; c.bond += 5; Game.sync(); return true;
  },
  act(id, C) {
    const d = COMPS[id], c = G.comp[id], S = Stats.get(), E = Stats.sum(), sk = d.skill;
    const atk = (d.atk + c.lvl * d.grow) * (1 + (E.companionPct || 0));
    if (C.comp.cd > 0) C.comp.cd--;
    const hpP = G.p.hp / S.maxHp;
    const ready = C.comp.cd <= 0 && (sk.k !== 'heal' || hpP < .65) && (sk.k !== 'shield' || C.shield <= 0);
    if (ready) {
      C.comp.cd = sk.cd;
      if (sk.k === 'dmg') for (let i = 0; i < (sk.hits || 1); i++) { const e = Combat.tgtAny(); if (!e) break; Combat.allyHit(e, atk * sk.m, `${d.i} ${d.n} (${sk.n})`); }
      else if (sk.k === 'heal') { const h = Player.heal(S.maxHp * sk.m * (1 + (E.healPct || 0))); Combat.log(`✚ ${d.n} — ${sk.n} : +${h} PV.`, 'ally'); Combat.fx('p', 0, '+' + h, 'heal'); }
      else if (sk.k === 'shield') { C.shield = Math.round(S.maxHp * sk.m * (1 + c.lvl * .01)); C.shieldT = 3; Combat.log(`🛡 ${d.n} — ${sk.n} : bouclier de ${C.shield}.`, 'ally'); }
      else if (sk.k === 'poison') { for (const e of Combat.alive) Combat.applyEnemy(e, 'poison', 4, 1); Combat.log(`☠ ${d.n} — ${sk.n} sur tous les ennemis.`, 'ally'); }
    } else if (d.basic) { const e = Combat.tgtAny(); if (e) Combat.allyHit(e, atk * .6, `${d.i} ${d.n} attaque`); }
  }
};

const MATSLOT = s => s === 'acc' ? { crystal: 1, hide: 1 } : { ore: 1, hide: 1 };
const QUAL = [{ n: 'Standard', g: 1, luck: .1, minR: 0, extra: {} }, { n: 'Supérieure', g: 2, luck: .5, minR: 1, extra: { crystal: 2 } }, { n: 'Maître', g: 4, luck: 1, minR: 2, extra: { crystal: 4, star: 1 } }];
const UPG_RATE = [100, 95, 90, 80, 70, 60, 50, 40, 30, 20];
const Craft = {
  forgeCost(slot, q) {
    const L = G.p.lvl, Q2 = QUAL[q], need = {};
    const base = MATSLOT(slot); need.hide = 2 + Math.floor(L / 6); for (const k in base) if (k !== 'hide') need[k] = (need[k] || 0) + 3 + Math.floor(L / 4);
    for (const k in Q2.extra) need[k] = (need[k] || 0) + Q2.extra[k];
    return { gold: Math.round((40 + L * 12) * Q2.g), mats: need };
  },
  forge(slot, q) {
    if (G.flags.inCombat) return null; const c = this.forgeCost(slot, q);
    if (G.p.gold < c.gold || !Mats.has(c.mats)) return null;
    G.p.gold -= c.gold; Mats.take(c.mats); bump('goldSpent', c.gold);
    const E = Stats.sum(), it = genItem({ ilvl: G.p.lvl + q, slot, luck: QUAL[q].luck + (E.upgBonus || 0) * 2, minR: QUAL[q].minR });
    Inv.add(it, 'craft'); bump('crafted'); Game.sync(); return it;
  },
  upgCost(it) {
    const u = it.up, need = { ore: 2 + u }; if (u >= 3) need.crystal = u - 2; if (u >= 7) need.star = 1;
    return { gold: Math.round((30 + it.ilvl * 8) * (1 + u * .6)), mats: need };
  },
  upgRate(it) { return clamp(UPG_RATE[it.up] + Math.round((Stats.sum().upgBonus || 0) * 100), 5, 100); },
  upgrade(id) {
    const it = Inv.find(id); if (!it || it.up >= 10 || G.flags.inCombat) return null;
    const c = this.upgCost(it); if (G.p.gold < c.gold || !Mats.has(c.mats)) return null;
    G.p.gold -= c.gold; Mats.take(c.mats); bump('goldSpent', c.gold);
    let res = { ok: false, msg: '' };
    if (chance(this.upgRate(it) / 100)) {
      it.up++; res.ok = true; res.msg = `Succès ! ${it.name} passe à +${it.up}.`; bump('upgrades');
      if ([3, 6, 9].includes(it.up)) {
        const k = pick(STAT_POOL), v = Math.max(1, Math.round((4 + it.ilvl * 1.6) * AFF[k] * 1.2)); it.xtra[k] = (it.xtra[k] || 0) + v;
        res.msg += ` Bonus spécial : +${v} ${STAT_LABEL[k]}.`;
        if (it.up === 9 && !it.fx.length) { const f = pick(FX_MINOR); it.fx.push(f); res.msg += ` Effet gagné : ${FX[f].n}.`; }
      }
    } else if (it.up >= 5 && chance(.5)) { it.up--; res.msg = `Échec… l’objet s’abîme et retombe à +${it.up}.`; }
    else res.msg = 'Échec : les matériaux sont perdus.';
    recalcItem(it); Stats.clamp(); Game.sync(); return res;
  },
  brew(id) {
    const r = RECIPES[id]; if (!r || !Mats.has(r)) return false;
    Mats.take(r); G.cons[id] = (G.cons[id] || 0) + 1; bump('brewed'); Game.sync(); return true;
  }
};

const Shop = {
  refresh() {
    const L = G.p.lvl, items = [], rare = [];
    for (let i = 0; i < 8; i++) items.push(genItem({ ilvl: L + rint(0, 2), luck: .1 }));
    if (L >= 8) for (let i = 0; i < 3; i++) rare.push(genItem({ ilvl: L + 2, minR: L >= 30 ? 4 : L >= 20 ? 3 : 2 }));
    G.shop = { items, rare, at: (G.c.explorations || 0) + (G.c.battlesWon || 0) };
  },
  maybeRefresh() {
    const a = (G.c.explorations || 0) + (G.c.battlesWon || 0);
    if (!G.shop.items.length || a - G.shop.at >= 10) this.refresh();
  },
  refreshCost() { return G.p.lvl * 25; },
  manualRefresh() { const c = this.refreshCost(); if (G.p.gold < c) return false; G.p.gold -= c; this.refresh(); Game.sync(); return true; },
  buy(id) {
    const list = [...G.shop.items, ...(G.shop.rare || [])], it = list.find(x => x.id === id); if (!it) return false;
    const p = buyPrice(it); if (G.p.gold < p || G.inv.length >= Inv.MAX) return false;
    G.p.gold -= p; bump('goldSpent', p);
    G.shop.items = G.shop.items.filter(x => x.id !== id); G.shop.rare = (G.shop.rare || []).filter(x => x.id !== id);
    Inv.add(it, 'shop'); Game.sync(); return true;
  },
  consPrice(id) { return Math.round(CONS[id].price * (1 + G.p.lvl * .08) * (1 - clamp(Stats.sum().shopDisc || 0, 0, .5))); },
  buyCons(id) { const p = this.consPrice(id); if (G.p.gold < p) return false; G.p.gold -= p; bump('goldSpent', p); G.cons[id] = (G.cons[id] || 0) + 1; Game.sync(); return true; }
};

/* ---------- 10. INTERFACE ---------- */
const U = { screen: 'title', tab: 'town', zone: 'plaines', sel: null, invF: 'all', traitCat: 'all', craftTab: 'forge', shopTab: 'forge', cmenu: null, exLog: [], cr: { name: '', portrait: 0, sex: 'x', origin: 'aldra', bg: 'orphelin', diff: 'normal', cls: 'guerrier', style: 'offensif', weapon: 0 }, enc: null, ev: null, compMsg: {}, forgeSlot: 'weapon', forgeQ: 0, upSel: null, tipCache: {} };
const $id = id => document.getElementById(id);
const TABS = [['town', '🏰', 'Ville'], ['explore', '🧭', 'Explorer'], ['char', '👤', 'Héros'], ['inv', '🎒', 'Inventaire'], ['skills', '✨', 'Compétences'], ['traits', '🌟', 'Traits'], ['quests', '📜', 'Quêtes'], ['comp', '🤝', 'Compagnons'], ['craft', '🔨', 'Artisanat'], ['shop', '💰', 'Marché'], ['stats', '🏆', 'Succès'], ['rep', '👑', 'Renommée'], ['opts', '⚙️', 'Options']];
const TRAIT_ICON = { combat: '⚔️', survie: '❤️', exploration: '🧭', equipement: '🛡️', social: '🤝', secret: '🌑', maudit: '☠️' };

const bar = (cur, max, cls, label) => `<div class="bar ${cls}" role="progressbar" aria-valuenow="${Math.round(cur)}" aria-valuemax="${Math.round(max)}"><i style="width:${clamp(max ? cur / max * 100 : 0, 0, 100)}%"></i><span>${label || `${fmt(cur)} / ${fmt(max)}`}</span></div>`;
const rcls = r => 'r-' + RARITIES[r].id;
const statLines = st => Object.keys(st).filter(k => st[k]).map(k => `<li>+${st[k]} ${STAT_LABEL[k]}</li>`).join('');
const ring = (ratio, col, icon) => { const r = 26, c = 2 * Math.PI * r; return `<svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="ring-bg"/><circle cx="32" cy="32" r="${r}" class="ring-fg" style="stroke:${col};stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${(c * (1 - clamp(ratio, 0, 1))).toFixed(1)}"/><text x="32" y="39" text-anchor="middle" class="ring-t">${icon}</text></svg>`; };

function itemTip(it) {
  const R = RARITIES[it.r];
  return `<b class="${rcls(it.r)}">${esc(it.name)}${it.up ? ' +' + it.up : ''}</b><br>${R.n} · ${it.cat ? CAT_NAME[it.cat] : TYPE_NAME[it.slot]} · niv. ${it.ilvl}<ul>${statLines(it.st)}</ul>${it.fx.map(f => `<div class="fx">★ ${FX[f].n} : ${FX[f].d}</div>`).join('')}<i>${esc(it.desc)}</i>`;
}
function itemCard(it, act, extra = '') {
  return `<button class="item ${rcls(it.r)} ${U.sel === it.id ? 'sel' : ''}" data-act="${act}" data-id="${it.id}" data-tip="${esc(itemTip(it))}"><span class="ico">${it.ico}</span><span class="nm">${esc(it.name)}${it.up ? ' +' + it.up : ''}</span><small>niv. ${it.ilvl} · ${RARITIES[it.r].n}</small>${extra}</button>`;
}
function compareHtml(it) {
  let slot = it.slot; if (slot === 'acc') slot = (!G.eq.acc1 || !G.eq.acc2) ? (!G.eq.acc1 ? 'acc1' : 'acc2') : (G.eq.acc1.r <= G.eq.acc2.r ? 'acc1' : 'acc2');
  const eq = G.eq[slot]; if (eq && eq.id === it.id) return '';
  const keys = [...new Set([...Object.keys(it.st), ...Object.keys(eq ? eq.st : {})])];
  const rows = keys.map(k => { const d = (it.st[k] || 0) - (eq ? eq.st[k] || 0 : 0); return d ? `<li class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ '}${d} ${STAT_LABEL[k]}</li>` : ''; }).join('');
  return `<div class="cmp"><b>Comparaison avec ${eq ? esc(eq.name) : 'emplacement vide'}</b><ul>${rows || '<li>Identique</li>'}</ul></div>`;
}

const UI = {
  show(s) { U.screen = s; for (const id of ['title', 'create', 'game', 'combat']) $id('screen-' + id).classList.toggle('hidden', id !== s); },
  toast(msg, type = '') {
    const d = document.createElement('div'); d.className = 'toast ' + type; d.textContent = msg; $id('toasts').appendChild(d);
    setTimeout(() => d.classList.add('out'), 3600); setTimeout(() => d.remove(), 4200);
  },
  modal(html) { const m = $id('modal'); m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true">${html}</div>`; m.classList.remove('hidden'); },
  closeModal() { $id('modal').classList.add('hidden'); $id('modal').innerHTML = ''; },
  burst(text) { const d = document.createElement('div'); d.className = 'burst'; d.innerHTML = `<div>${text}</div>`; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); },

  /* ----- Écran titre ----- */
  title() {
    UI.show('title'); const sv = Save.peek();
    $id('screen-title').innerHTML = `<div class="title-wrap">
      <div class="title-sigil" aria-hidden="true">✦</div>
      <h1>Éveil des Traits</h1>
      <p class="sub">Votre héros devient ce que vous faites de lui.</p>
      <div class="title-btns">
        ${sv ? `<button class="btn primary big" data-act="continue">Continuer la partie<small>${esc(sv.p.name)} · ${CLASS(sv.p.cls).n} niv. ${sv.p.lvl} · ${Math.floor((sv.playTime || 0) / 60)} min de jeu</small></button>` : ''}
        <button class="btn big" data-act="newgame">Nouvelle partie</button>
        ${sv ? '<button class="btn danger" data-act="wipe">Supprimer la sauvegarde</button>' : ''}
      </div></div>`;
  },

  /* ----- Création de personnage ----- */
  create() {
    UI.show('create'); const c = U.cr, cl = CLASS(c.cls), og = ORIGINS.find(o => o.id === c.origin), bg = BACKGROUNDS.find(b => b.id === c.bg);
    const pick = (act, items, cur, fn) => `<div class="grid">${items.map(x => `<button class="card ${cur === x.id ? 'sel' : ''}" data-act="${act}" data-id="${x.id}"><b>${fn(x)}</b><small>${x.d}</small></button>`).join('')}</div>`;
    $id('screen-create').innerHTML = `<div class="create">
      <h2>Création du héros</h2>
      <div class="panel"><label class="lbl" for="cr-name">Nom</label><input id="cr-name" data-bind="name" maxlength="20" placeholder="Votre nom" value="${esc(c.name)}" autocomplete="off">
        <div class="lbl">Présentation</div><div class="row wrap">${SEXES.map(([k, n]) => `<button class="btn ${c.sex === k ? 'primary' : ''}" data-act="crSex" data-id="${k}">${n}</button>`).join('')}</div>
        <div class="lbl">Portrait</div><div class="row wrap">${PORTRAITS.map((p, i) => `<button class="portrait-btn ${c.portrait === i ? 'sel' : ''}" data-act="crPortrait" data-i="${i}" aria-label="Portrait ${i + 1}">${p}</button>`).join('')}</div></div>
      <div class="panel"><div class="lbl">Pays d’origine</div>${pick('crOrigin', ORIGINS, c.origin, x => x.i + ' ' + x.n)}
        <div class="lbl">Histoire</div>${pick('crBg', BACKGROUNDS, c.bg, x => x.n)}
        <small>Votre origine et votre histoire modifient vos bonus, votre réputation de départ, certains dialogues et événements, et des conditions de traits.</small></div>
      <div class="panel"><div class="lbl">Classe</div><div class="grid cls-grid">${CLASSES.filter(k => !k.adv).map(k => `<button class="card cls ${c.cls === k.id ? 'sel' : ''}" data-act="crClass" data-id="${k.id}"><span class="big-ico">${k.i}</span><b>${k.n}</b><small>${k.d}</small></button>`).join('')}</div>
        <small>Classes avancées (Chevalier noir, Chronomancien) : à débloquer en jeu, via le changement de classe.</small>
        <div class="cls-detail"><div><b>Statistiques initiales</b> : ${['str', 'int', 'agi', 'end'].map(k => `${STAT_LABEL[k]} ${cl.base[k]}`).join(' · ')}</div>
        <div class="good">Avantages : ${cl.pros.join(', ')}</div><div class="bad">Faiblesses : ${cl.cons.join(', ')}</div>
        <div>Compétence spéciale : <b>${SK[cl.sp].ico} ${SK[cl.sp].n}</b> — ${SK[cl.sp].d}</div></div></div>
      <div class="panel"><div class="lbl">Style de combat</div><div class="grid">${STYLES.map(s => `<button class="card ${c.style === s.id ? 'sel' : ''}" data-act="crStyle" data-id="${s.id}"><b>${s.i} ${s.n}</b><small>${s.d}</small></button>`).join('')}</div>
        <div class="lbl">Arme de départ</div><div class="row wrap">${cl.weapons.map((w, i) => `<button class="btn ${c.weapon === i ? 'primary' : ''}" data-act="crWeapon" data-i="${i}">${ITEM_BASES.weapon.find(b => b.cat === w).i} ${CAT_NAME[w]}${MAGIC_CATS.includes(w) ? ' (magique)' : ''}</button>`).join('')}</div>
        <div class="lbl">Difficulté</div>${pick('crDiff', Object.keys(DIFFICULTY).map(k => Object.assign({ id: k }, DIFFICULTY[k])), c.diff, x => x.n)}</div>
      <div class="row"><button class="btn" data-act="toTitle">Retour</button><button class="btn primary big" data-act="start">Commencer l’aventure</button></div></div>`;
  },

  /* ----- Jeu : HUD + navigation + vue ----- */
  game() { UI.show('game'); UI.renderGame(); },
  renderGame() {
    if (U.screen !== 'game' || !G) return;
    const p = G.p, S = Stats.get(), ti = TITLES.find(t => t.id === G.title);
    $id('hud').innerHTML = `<div class="hud-id"><span class="portrait">${PORTRAITS[p.portrait]}</span><div><b>${esc(p.name)}</b><small>${CLASS(p.cls).n} · niv. ${p.lvl} · ${esc(ti ? ti.n : '')}</small></div></div>
      <div class="hud-bars">${bar(p.hp, S.maxHp, 'hp', `❤ ${fmt(p.hp)} / ${fmt(S.maxHp)}`)}${bar(p.mp, S.maxMp, 'mp', `✦ ${fmt(p.mp)} / ${fmt(S.maxMp)}`)}${bar(p.xp, p.lvl >= MAXLVL ? 1 : xpNeeded(p.lvl), 'xp', p.lvl >= MAXLVL ? 'Niveau max' : `XP ${fmt(p.xp)} / ${fmt(xpNeeded(p.lvl))}`)}</div>
      <div class="hud-gold" title="Or">🪙 ${fmt(p.gold)}</div>`;
    const alerts = { char: G.p.pts > 0, skills: G.p.sp > 0, quests: QUESTS.some(q => Quests.status(q) === 'ready'), comp: Object.keys(COMPS).some(id => !(G.comp[id] && G.comp[id].rec) && Companions.can(id)) };
    $id('nav').innerHTML = TABS.map(([id, ic, n]) => `<button class="${U.tab === id ? 'on' : ''}" data-act="tab" data-t="${id}" aria-label="${n}"><span>${ic}</span><em>${n}</em>${alerts[id] ? '<i class="dot"></i>' : ''}</button>`).join('');
    const v = $id('view'), st = v.scrollTop;
    v.innerHTML = (UI.views[U.tab] || UI.views.town)();
    v.scrollTop = st;
  },
  views: {},

  /* ----- Combat ----- */
  renderCombat() {
    const C = Combat.C; if (!C) return; if (U.screen !== 'combat') UI.show('combat');
    const S = Stats.get(), E = Stats.sum(), ready = Combat.ready(), tg = Combat.tgt();
    const en = C.enemies.map((e, i) => {
      const sk = ESK[e.intent] || ESK.strike, est = Combat.estimate(e);
      const res = Object.keys(e.res).filter(k => ELEM[k] && Math.abs(e.res[k]) >= .3).map(k => `<span class="${e.res[k] < 0 ? 'weak' : 'resist'}" title="${e.res[k] < 0 ? 'Faiblesse' : 'Résistance'} : ${ELEM[k][0]}">${ELEM[k][1]}${e.res[k] < 0 ? '▼' : '▲'}</span>`).join('');
      return `<button class="enemy ${e.dead ? 'dead' : ''} ${tg === e ? 'tgt' : ''} ${e.tier}" data-act="target" data-i="${i}" ${e.dead ? 'disabled' : ''} id="en-${i}"><div class="fxbox"></div>
        <span class="e-ico">${e.i}</span><b>${esc(e.n)}</b><small>niv. ${e.lvl}${e.tier === 'boss' ? ' · BOSS' : e.tier === 'elite' ? ' · Élite' : ''}</small>
        ${bar(e.hp, e.maxHp, 'hp', `${fmt(e.hp)}`)}
        <div class="sts">${Object.keys(e.st).map(k => `<span title="${STATUS[k].n} (${e.st[k].t})">${STATUS[k].i}${e.st[k].t}</span>`).join('')}${e.mark ? '<span title="Marqué">🎯</span>' : ''}${e.buffAtk ? '<span title="Enragé">📣</span>' : ''}${res}</div>
        ${e.dead ? '<div class="intent">Vaincu</div>' : `<div class="intent ${sk.warn ? 'warn' : ''}">${sk.warn ? '⚠ ' : ''}${sk.n}${sk.m ? ` (~${est})` : ''}</div>`}</button>`;
    }).join('');
    const buffs = C.buffs.map(b => `<span title="Bonus">⬆${b.k === 'atk' ? '⚔' : b.k === 'def' ? '🛡' : '🎯'}</span>`).join('');
    const sums = C.summons.map(s => `<span title="${s.n} (${s.t} tours)">💀${s.t}</span>`).join('');
    const comp = G.active && G.comp[G.active] ? `<span class="chip">${COMPS[G.active].i} ${COMPS[G.active].n}</span>` : '';
    const menu = U.cmenu === 'skills' ? `<div class="submenu">${Skills.actives().map(id => { const d = SK[id], cost = Skills.cost(id), cd = C.cd[id] || 0, ok = ready && G.p.mp >= cost && cd <= 0; return `<button class="btn skillbtn" data-act="useSkill" data-id="${id}" ${ok ? '' : 'disabled'} data-tip="${esc(d.d)}"><span>${d.ico} ${d.n}${G.sk[id] > 1 ? ' ' + G.sk[id] : ''}</span><small>${cost} mana${cd > 0 ? ` · recharge ${cd}` : ''}</small></button>`; }).join('') || '<em>Aucune compétence.</em>'}</div>`
      : U.cmenu === 'items' ? `<div class="submenu">${Object.keys(CONS).filter(k => (G.cons[k] || 0) > 0).map(k => `<button class="btn skillbtn" data-act="useItem" data-id="${k}" ${ready ? '' : 'disabled'} data-tip="${esc(CONS[k].d)}"><span>${CONS[k].i} ${CONS[k].n}</span><small>×${G.cons[k]}</small></button>`).join('') || '<em>Aucun objet.</em>'}</div>` : '';
    $id('screen-combat').innerHTML = `<div class="combat">
      <div class="c-top"><b>${C.ctx.kind === 'dungeon' ? '🏰 Donjon' : '⚔ Combat'} — tour ${C.round}</b>${C.ctx.canFlee ? '' : '<small>Fuite impossible</small>'}</div>
      <div class="enemies">${en}</div>
      <div class="c-log" id="c-log">${C.log.slice(-60).map(l => `<div class="l-${l.c}">${esc(l.m)}</div>`).join('')}</div>
      <div class="c-player"><div class="fxbox" id="fx-p"></div><span class="portrait">${PORTRAITS[G.p.portrait]}</span>
        <div class="cp-bars">${bar(G.p.hp, S.maxHp, 'hp', `❤ ${fmt(G.p.hp)} / ${fmt(S.maxHp)}${C.shield > 0 ? ` (+${C.shield} 🛡)` : ''}`)}${bar(G.p.mp, S.maxMp, 'mp', `✦ ${fmt(G.p.mp)} / ${fmt(S.maxMp)}`)}</div>
        <div class="sts">${Object.keys(C.st).map(k => `<span title="${STATUS[k].n}">${STATUS[k].i}${C.st[k].t}</span>`).join('')}${C.defending ? '<span title="En garde">🛡</span>' : ''}${buffs}${sums}${comp}</div></div>
      ${menu}
      <div class="c-actions">
        <button class="btn primary" data-act="attack" ${ready ? '' : 'disabled'} data-tip="Attaque de base avec votre arme (${Combat.wtype() === 'mag' ? 'magique' : 'physique'}).">⚔ Attaquer</button>
        <button class="btn ${U.cmenu === 'skills' ? 'on' : ''}" data-act="menuSkills" ${ready ? '' : 'disabled'}>✨ Compétences</button>
        <button class="btn" data-act="defend" ${ready ? '' : 'disabled'} data-tip="Réduit les dégâts reçus de moitié jusqu’à votre prochain tour et rend un peu de mana.">🛡 Défendre</button>
        <button class="btn ${U.cmenu === 'items' ? 'on' : ''}" data-act="menuItems" ${ready ? '' : 'disabled'}>🎒 Objets</button>
        <button class="btn gold" data-act="finisher" ${ready && Combat.finisherReady() ? '' : 'disabled'} data-tip="Finisseur (1×/combat) : frappe garantie critique à 260 % sur un ennemi sous ${pc(.3 + (E.finTh || 0))} % de PV.">🗡 Finisseur</button>
        <button class="btn" data-act="flee" ${ready && C.ctx.canFlee ? '' : 'disabled'}>🏃 Fuir</button></div></div>`;
    for (const f of C.fx) { const host = f.side === 'p' ? $id('fx-p') : document.querySelector(`#en-${f.i} .fxbox`); if (!host) continue; const s = document.createElement('span'); s.className = 'float ' + f.cls; s.textContent = f.txt; host.appendChild(s); setTimeout(() => s.remove(), 1100); if (f.cls === 'dmg' || f.cls === 'crit') { const b = f.side === 'p' ? $id('fx-p').parentElement : $id('en-' + f.i); if (b) { b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); } } }
    C.fx = []; const lg = $id('c-log'); if (lg) lg.scrollTop = lg.scrollHeight;
    if (C.over && C.summary) UI.combatResult(C.summary);
  },
  combatResult(s) {
    if ($id('modal').dataset.res === '1') return; $id('modal').dataset.res = '1';
    if (s.res === 'win') UI.modal(`<h3 class="good">Victoire !</h3><ul class="res"><li>+${fmt(s.xp)} XP${s.ups ? ` — <b>Niveau ${G.p.lvl} !</b> (+3 points, +1 point de compétence)` : ''}</li><li>+${fmt(s.gold)} or</li>
      ${s.items.map(it => `<li class="${rcls(it.r)}">${it.ico} ${esc(it.name)} <small>(${RARITIES[it.r].n})</small>${s.unique === it ? ' — <b>Butin unique de boss !</b>' : ''}</li>`).join('')}
      ${Object.keys(s.mats).map(k => `<li>${MATS[k][1]} ${s.mats[k]} × ${MATS[k][0]}</li>`).join('')}${Object.keys(s.cons).map(k => `<li>${CONS[k].i} ${CONS[k].n}</li>`).join('')}
      ${s.comp ? `<li>${esc(s.comp.n)} gagne de l’expérience${s.comp.up ? ` — niveau ${s.comp.lvl} !` : ''}</li>` : ''}</ul><button class="btn primary" data-act="endCombat">Continuer</button>`);
    else if (s.res === 'lose') UI.modal(`<h3 class="bad">Défaite…</h3><p>Vous perdez ${fmt(-s.gold)} or et vous réveillez à l’auberge, affaibli.</p><button class="btn primary" data-act="endCombat">Retourner en ville</button>`);
    else UI.modal(`<h3>Fuite réussie</h3><p>Vous échappez au combat sans gain.</p><button class="btn primary" data-act="endCombat">Continuer</button>`);
  },
  popLevel() { }
};

Object.assign(Hooks, {
  toast: (m, t) => UI.toast(m, t),
  render: () => UI.renderGame(),
  levelUp: l => { UI.toast(`Niveau ${l} atteint !`, 'good'); UI.burst(`⬆ Niveau ${l}`); },
  traitUnlocked: t => { UI.toast(`🌟 Trait éveillé : ${t.n} — ${effText(t.eff).join(', ')}`, 'trait'); UI.burst(`🌟 ${esc(t.n)}`); },
  titleUnlocked: t => UI.toast(`👑 Nouveau titre : ${t.n}`, 'trait'),
  achUnlocked: a => UI.toast(`🏆 Succès : ${a.n} (+${a.gold} or)`, 'good'),
  combatStart: () => { $id('modal').dataset.res = '0'; UI.closeModal(); U.cmenu = null; UI.show('combat'); },
  combatRender: () => UI.renderCombat(),
  combatEnd: s => { if (Combat.C && !Combat.C.summary) Combat.C.summary = s; UI.renderCombat(); },
  dungeonStage: i => UI.modal(`<h3>${esc(i.name)}</h3><p>Étape ${i.stage} / ${i.total} terminée. Vous reprenez votre souffle (+15 % PV).</p><div class="row"><button class="btn primary" data-act="dungNext">Continuer</button><button class="btn danger" data-act="dungQuit">Abandonner</button></div>`),
  dungeonDone: i => { UI.show('game'); UI.modal(`<h3 class="good">${esc(i.name)} terminé (${i.diff}) !</h3><ul class="res">${i.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul><button class="btn primary" data-act="closeModal">Continuer</button>`); UI.renderGame(); }
});

/* ----- Vues des onglets ----- */
const V = UI.views;
function npcLines() {
  const t = TITLES.find(x => x.id === G.title), nm = esc(G.p.name), r = G.rep, out = [];
  const adr = G.p.sex === 'f' ? 'Dame ' : G.p.sex === 'm' ? 'Messire ' : '';
  const og = ORIGINS.find(o => o.id === G.p.origin); if (og) out.push(['🧭 Compatriote', og.line]);
  out.push(['🛡️ Garde', r.couronne >= 100 ? `« Salutations, ${adr}${esc(t.n)} ${nm} ! La Couronne vous doit beaucoup. »` : r.couronne < -30 ? '« Vous. Je vous ai à l’œil. »' : r.couronne >= 30 ? `« Bonne journée, ${nm}. »` : '« Circulez, voyageur. »']);
  out.push(['🔮 Mage', r.cercle >= 100 ? '« Les arcanes vous reconnaissent, archimage. »' : r.cercle < -30 ? '« Ne touchez à rien. À RIEN. »' : r.cercle >= 30 ? '« Intéressant. Vous avez l’éclat de ceux qui apprennent. »' : '« Pas le temps, mes parchemins m’attendent. »']);
  out.push(['🗝️ Rôdeur de la Guilde', r.ombres >= 100 ? '« Pour vous, la maison offre le silence. »' : r.ombres < -30 ? '« On n’aime pas les balances ici. »' : r.ombres >= 30 ? '« Si vous cherchez du travail discret… »' : '« Je ne vous ai jamais vu. »']);
  out.push(['🌳 Druide', r.sylve >= 100 ? '« La forêt parle de vous avec douceur. »' : r.sylve < -30 ? '« Les arbres se souviennent de votre cruauté. »' : r.sylve >= 30 ? '« Les bêtes ne vous craignent pas. Bon signe. »' : '« Marchez doucement. »']);
  if (G.title === 'tueur_dragon') out.push(['🍺 Tavernier', '« Tournée générale pour le tueur de dragon ! »']);
  if (Traits.has('maudit')) out.push(['🕯️ Vieille femme', '« Cette marque sur vous… la malédiction vous a choisi. »']);
  return out;
}
const goalLines = (g, mask) => g.map(x => { const cur = Math.min(val(x.c), x.n); return mask ? `<div class="goal"><span>???</span></div>` : `<div class="goal"><span>${fmt(cur)}/${fmt(x.n)} ${x.l || ''}</span><div class="mini"><i style="width:${cur / x.n * 100}%"></i></div></div>`; }).join('');

V.town = () => {
  const cost = G.p.lvl * 4, mq = QUESTS.find(q => q.type === 'main' && Quests.status(q) !== 'done' && Quests.status(q) !== 'locked');
  const alerts = [G.p.pts > 0 ? `<button class="chip-btn" data-act="tab" data-t="char">${G.p.pts} point(s) de caractéristique à répartir</button>` : '', G.p.sp > 0 ? `<button class="chip-btn" data-act="tab" data-t="skills">${G.p.sp} point(s) de compétence</button>` : ''].join('');
  return `<h2>Aube-Haute</h2><div class="grid two">
    <div class="panel"><h3>Auberge</h3><p>Une bonne nuit rend tous vos PV et votre mana.</p><button class="btn primary" data-act="rest" ${G.p.gold >= cost ? '' : 'disabled'}>Se reposer — ${cost} or</button><div class="row wrap">${alerts}</div></div>
    <div class="panel"><h3>Objectif principal</h3>${mq ? `<b>${mq.n}</b><p>${mq.d}</p>${Quests.status(mq) === 'avail' ? `<button class="btn" data-act="qAccept" data-id="${mq.id}">Accepter</button>` : `<small>${Quests.cur(mq)}/${mq.obj.n}</small>`}` : '<p>Toutes les quêtes principales sont accomplies. Vous êtes une légende.</p>'}</div>
    ${G.flags.tutDone || G.flags.tutHidden ? '' : `<div class="panel wide"><h3>🎓 Tutoriel <small>${Tutorial.done()} / ${TUTORIAL.length}</small></h3>${TUTORIAL.map(t => { const ok = val(t[2]) >= t[3]; return `<div class="goal"><span class="${ok ? 'good' : ''}">${ok ? '✔' : '○'} <b>${t[0]}</b> — <small>${t[1]}</small></span></div>`; }).join('')}<p><small>Récompense : 100 or, 3 potions de soin, 2 potions de mana.</small></p><button class="btn sm" data-act="hideTut">Masquer</button></div>`}
    <div class="panel wide"><h3>Sur la place</h3>${npcLines().map(([n, l]) => `<div class="npc"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
    <div class="panel wide"><h3>Conseils</h3><p>Le monde observe vos actes : esquivez, épargnez, explorez, forgez… chaque comportement rapproche un trait. Ouvrez l’onglet <b>Traits</b> pour suivre vos progrès.</p></div></div>`;
};

V.explore = () => {
  const Z = ZONE(U.zone), zs = G.zones[Z.id] || { ex: 0 };
  const zl = ZONES.map(z => `<button class="card zone ${U.zone === z.id ? 'sel' : ''}" data-act="zone" data-id="${z.id}" ${G.p.lvl < z.min - 1 ? 'disabled' : ''}><b>${z.i} ${z.n}</b><small>Niv. ${z.min}–${z.max}${z.night ? ' · 🌙 nocturne' : ''}</small>${bar((G.zones[z.id] || { ex: 0 }).ex, 100, 'xp', `${(G.zones[z.id] || { ex: 0 }).ex} % exploré`)}</button>`).join('');
  const dg = Z.dungeons.map(id => {
    const d = DUNGEON(id), B = BOSSES[d.boss], av = Dungeon.avail(d);
    return `<div class="dung"><b>🏰 ${d.n}</b><small>Boss : ${B.i} ${B.n} (niv. ${B.lvl}) — ${B.tag}</small>
      <div class="row wrap">${DIFFS.map((df, i) => { const done = G.dung[id] && G.dung[id][i]; return `<button class="btn ${done ? 'done' : ''}" data-act="dungeon" data-id="${id}" data-d="${i}" ${av && Dungeon.diffOK(d, i) && !G.flags.inCombat ? '' : 'disabled'}>${df.n}${done ? ' ✔' : ''} <small>niv. ${B.lvl + df.off}</small></button>`; }).join('')}</div>
      ${av ? '' : `<small class="bad">Requis : niveau ${B.lvl - 4}${d.req ? ' et Dragon vaincu' : ''}</small>`}</div>`;
  }).join('');
  return `<h2>Exploration</h2><div class="grid zones">${zl}</div>
    <div class="panel"><h3>${Z.i} ${Z.n}</h3><p>${Z.d}</p><button class="btn primary big" data-act="explore">Explorer la zone</button>
      <div class="exlog" aria-live="polite">${U.exLog.slice(-8).map(l => `<div>${l}</div>`).join('') || '<em>Rien à signaler pour l’instant.</em>'}</div></div>
    <div class="panel"><h3>Donjons</h3>${dg}</div>`;
};

V.char = () => {
  const p = G.p, b = Stats.breakdown(), cl = CLASS(p.cls), st = STYLE(p.style), E = Stats.list();
  const row = (lab, k, f = fmt, plus) => { const base = b.base[k], gear = b.gear[k] - b.base[k], bonus = b.final[k] - b.gear[k]; return `<tr><td>${lab}</td><td>${f(base)}</td><td class="${gear ? 'up' : ''}">${gear ? (gear > 0 ? '+' : '') + f(gear) : '–'}</td><td class="${bonus ? (bonus > 0 ? 'up' : 'down') : ''}">${Math.abs(bonus) > .05 ? (bonus > 0 ? '+' : '') + f(bonus) : '–'}</td><td><b>${f(b.final[k])}</b></td><td>${plus ? `<button class="plus" data-act="spend" data-s="${plus}" ${p.pts > 0 ? '' : 'disabled'} aria-label="Augmenter ${lab}">+</button>` : ''}</td></tr>`; };
  const f1 = v => (Math.round(v * 10) / 10).toString();
  return `<h2>${esc(p.name)}</h2><div class="grid two"><div class="panel"><div class="hero"><span class="portrait big">${PORTRAITS[p.portrait]}</span><div><b>${cl.i} ${cl.n}</b><div>Style : ${st.i} ${st.n}</div><div>Niveau ${p.lvl}${p.lvl < MAXLVL ? ` — XP ${fmt(p.xp)} / ${fmt(xpNeeded(p.lvl))}` : ' (max)'}</div></div></div>
    <div class="good">${cl.pros.join(' · ')}</div><div class="bad">${cl.cons.join(' · ')}</div><p><small>Soins : ${SK[cl.sp].ico} ${SK[cl.sp].n} — ${SK[cl.sp].d}</small></p>
    <p>Points à répartir : <b class="${p.pts ? 'good' : ''}">${p.pts}</b> · Points de compétence : <b>${p.sp}</b></p>
    <p><small>Chaque niveau : +3 points, +1 point de compétence et progression automatique de la classe.</small></p></div>
    <div class="panel"><h3>Statistiques</h3><table class="stats"><thead><tr><th></th><th>Base</th><th>Équip.</th><th>Bonus</th><th>Final</th><th></th></tr></thead><tbody>
      ${row('Force', 'str', fmt, 'str')}${row('Intelligence', 'int', fmt, 'int')}${row('Agilité', 'agi', fmt, 'agi')}${row('Endurance', 'end', fmt, 'end')}
      ${row('PV max', 'maxHp')}${row('Mana max', 'maxMp')}${row('Attaque', 'atk')}${row('Puiss. magique', 'mag')}${row('Défense physique', 'def')}${row('Résist. magique', 'mres')}${row('Vitesse', 'spd', f1)}${row('Précision %', 'prec', f1)}${row('Esquive %', 'dodge', f1)}${row('Critique %', 'crit', f1)}${row('Dégâts crit. %', 'critDmg', f1)}${row('Pénétration %', 'pen', f1)}${row('Vol de vie %', 'lifesteal', f1)}${row('Régén./tour %', 'regen', f1)}${row('Résist. altér. %', 'sres', f1)}${row('Découverte %', 'find', f1)}${row('Soins %', 'healPow', f1)}</tbody></table>
      <small>Base = niveau + points · Équip. = objets · Bonus = classe, style, traits, titre, compétences.</small></div></div>
    ${G.p.lvl >= MAXLVL || G.p.par.lvl ? `<div class="panel"><h3>✦ Paragon ${G.p.par.lvl} <small>points : ${G.p.par.pts}</small></h3>${bar(G.p.par.xp, Paragon.need(G.p.par.lvl), 'xp', `XP Paragon ${fmt(G.p.par.xp)} / ${fmt(Paragon.need(G.p.par.lvl))}`)}<p><small>Après le niveau 250, l’XP nourrit le Paragon. Chaque catégorie est plafonnée à ${PAR_CAP} points.</small></p>${Object.keys(PAR_CATS).map(k => `<div class="recipe"><span><b>${PAR_CATS[k][0]}</b> <small>${PAR_CATS[k][3]} — ${(G.p.par.alloc[k] || 0)}/${PAR_CAP}</small></span><button class="plus" data-act="parSpend" data-c="${k}" ${G.p.par.pts > 0 && (G.p.par.alloc[k] || 0) < PAR_CAP ? '' : 'disabled'}>+</button></div>`).join('')}<button class="btn sm" data-act="parReset">Réinitialiser (gratuit)</button></div>` : ''}
    <div class="panel"><h3>Changement de classe</h3><p><small>Niveau 10 minimum. Coût : ${fmt(Game.classChangeCost())} or (augmente à chaque changement). Les compétences de l’ancienne classe sont remboursées ; niveau, points répartis et équipement sont conservés.</small></p>
      <div class="grid">${CLASSES.filter(c => c.id !== p.cls).map(c => { const ok = Game.classUnlocked(c); return `<button class="card" data-act="changeClass" data-id="${c.id}" ${ok && p.lvl >= 10 && p.gold >= Game.classChangeCost() && !G.flags.inCombat ? '' : 'disabled'}><b>${c.i} ${c.n}</b><small>${c.pros.join(' · ')}</small>${c.adv ? `<small class="${ok ? 'good' : 'bad'}">Avancée : niv. ${c.adv.lvl}, ${c.adv.g.map(g => `${g.l} (${Math.min(val(g.c), g.n)}/${g.n})`).join(', ')}</small>` : ''}</button>`; }).join('')}</div></div>
    <div class="panel"><h3>Sources de bonus actives</h3><div class="srcs">${E.map(s => { const t = effText(s.eff); return t.length ? `<div><b>${esc(s.src)}</b><small>${t.join(', ')}</small></div>` : ''; }).join('')}</div></div>`;
};

V.inv = () => {
  const types = [['all', 'Tout'], ['weapon', 'Armes'], ['off', 'Secondaires'], ['head', 'Casques'], ['chest', 'Plastrons'], ['hands', 'Gants'], ['legs', 'Jambières'], ['feet', 'Bottes'], ['acc', 'Accessoires']];
  const list = G.inv.filter(i => U.invF === 'all' || i.slot === U.invF).sort((a, b) => b.r - a.r || b.ilvl - a.ilvl);
  const sel = Inv.find(U.sel), eqd = sel && Object.values(G.eq).some(x => x && x.id === sel.id);
  let detail = '<p><em>Sélectionnez un objet pour voir ses détails et le comparer.</em></p>';
  if (sel) detail = `<h3 class="${rcls(sel.r)}">${sel.ico} ${esc(sel.name)}${sel.up ? ' +' + sel.up : ''}</h3><small>${RARITIES[sel.r].n} · ${sel.cat ? CAT_NAME[sel.cat] : TYPE_NAME[sel.slot]} · niv. ${sel.ilvl}${sel.cat && MAGIC_CATS.includes(sel.cat) ? ' · dégâts magiques' : ''}</small>
    <ul class="statl">${statLines(sel.st)}</ul>${sel.fx.map(f => `<div class="fx">★ <b>${FX[f].n}</b> — ${FX[f].d}</div>`).join('')}<p><i>${esc(sel.desc)}</i></p>${eqd ? '' : compareHtml(sel)}
    <div class="row wrap">${eqd ? `<button class="btn" data-act="unequip" data-id="${sel.id}" ${G.flags.inCombat ? 'disabled' : ''}>Déséquiper</button>` : `<button class="btn primary" data-act="equip" data-id="${sel.id}">Équiper</button><button class="btn danger" data-act="sell" data-id="${sel.id}">Vendre (${fmt(sellPrice(sel))} or)</button>`}</div>`;
  return `<h2>Inventaire <small>${G.inv.length}/${Inv.MAX}</small></h2><div class="grid two inv">
    <div><div class="panel"><h3>Équipement</h3><div class="eqgrid">${EQ_SLOTS.map(s => { const it = G.eq[s]; return it ? `<button class="eqslot ${rcls(it.r)} ${U.sel === it.id ? 'sel' : ''}" data-act="select" data-id="${it.id}" data-tip="${esc(itemTip(it))}"><small>${SLOT_NAME[s]}</small><span>${it.ico} ${esc(it.name)}${it.up ? ' +' + it.up : ''}</span></button>` : `<div class="eqslot empty"><small>${SLOT_NAME[s]}</small><span>— vide —</span></div>`; }).join('')}</div></div>
      <div class="panel">${detail}</div></div>
    <div class="panel"><div class="row wrap filters">${types.map(([k, n]) => `<button class="btn sm ${U.invF === k ? 'primary' : ''}" data-act="invF" data-f="${k}">${n}</button>`).join('')}</div>
      <div class="row wrap"><button class="btn sm" data-act="sellBelow" data-r="0">Vendre les communs</button><button class="btn sm" data-act="sellBelow" data-r="1">Vendre communs + peu communs</button></div>
      <div class="itemgrid">${list.map(i => itemCard(i, 'select')).join('') || '<em>Aucun objet.</em>'}</div></div></div>`;
};

V.skills = () => {
  const tree = Skills.tree(), tiers = [0, 1, 2, 3];
  const card = d => {
    const r = Skills.rank(d.id), rq = Skills.reqLines(d), can = Skills.canLearn(d.id), learned = r > 0;
    return `<div class="skill ${learned ? 'learned' : ''} ${d.special ? 'special' : ''}"><div class="sk-h"><span class="sk-ico">${d.ico}</span><b>${d.n}</b><span class="pips">${[1, 2, 3].map(i => `<i class="${i <= r ? 'on' : ''}"></i>`).join('')}</span></div>
      <small>${d.type === 'active' ? `Active · ${d.mp} mana · recharge ${d.cd}` : 'Passive'}${d.special ? ' · compétence de classe' : ''}</small><p>${d.d}</p>
      ${rq.length && !d.special ? `<div class="reqs">${rq.map(x => `<span class="${x.ok ? 'ok' : 'ko'}">${x.ok ? '✔' : '✖'} ${x.t}</span>`).join('')}</div>` : ''}
      ${d.type === 'active' && r >= 3 ? (G.aug[d.id] ? `<div class="aug">Amélioration : <b>${AUGS[G.aug[d.id]][0]}</b> (${AUGS[G.aug[d.id]][1]})</div>` : `<div class="aug">Choisissez une amélioration :<div class="row wrap">${Object.keys(AUGS).map(a => `<button class="btn sm" data-act="aug" data-id="${d.id}" data-a="${a}" data-tip="${AUGS[a][1]}">${AUGS[a][0]}</button>`).join('')}</div></div>`) : ''}
      ${!d.special || r > 0 ? `<button class="btn sm ${can ? 'primary' : ''}" data-act="learn" data-id="${d.id}" ${can ? '' : 'disabled'}>${r === 0 ? 'Apprendre' : r >= 3 ? 'Rang max' : 'Améliorer'}</button>` : ''}</div>`;
  };
  return `<h2>Compétences</h2><div class="panel row between"><span>Points disponibles : <b class="${G.p.sp ? 'good' : ''}">${G.p.sp}</b></span><button class="btn sm" data-act="respec" ${G.p.gold >= Skills.respecCost() && !G.flags.inCombat ? '' : 'disabled'}>Réinitialiser (${Skills.respecCost()} or)</button></div>
    ${[['Arbre de classe — ' + CLASS(G.p.cls).n, G.p.cls], ['Arbre commun (toutes classes)', 'all']].map(([t, c]) => `<div class="panel"><h3>${t}</h3><div class="tiers">${tiers.map(ti => { const l = tree.filter(s => s.cls === c && s.tier === ti); return l.length ? `<div class="tier"><div class="tier-h">${ti === 0 ? 'Spéciale' : 'Palier ' + ti}</div>${l.map(card).join('')}</div>` : ''; }).join('')}</div></div>`).join('')}`;
};

V.traits = () => {
  const cats = [['all', 'Tous'], ...Object.entries(TCAT)], list = TRAITS.filter(t => U.traitCat === 'all' || t.cat === U.traitCat);
  const un = TRAITS.filter(t => Traits.has(t.id)).length;
  const card = t => {
    const s = G.tr[t.id] || {}, u = s.u, masked = t.hidden && !s.seen && !u, R = RARITIES[t.r], ratio = u ? 1 : masked ? 0 : Traits.ratio(t);
    return `<div class="trait ${u ? 'on' : ''} ${masked ? 'masked' : ''} ${rcls(t.r)}">${ring(ratio, u ? R.c : '#8d86a6', masked ? '?' : TRAIT_ICON[t.cat])}
      <div class="tr-b"><b>${masked ? '???' : esc(t.n)}</b><small>${TCAT[t.cat]} · ${R.n}${t.hidden ? ' · caché' : ''}</small>
      <p>${masked ? 'Un trait dort quelque part. Explorez, combattez, faites des choix…' : esc(t.d)}</p>
      ${masked ? '' : t.hidden && !u ? `<p class="hint">${esc(t.hint)}</p>${goalLines(t.g, true)}` : goalLines(t.g, false)}
      ${masked ? '' : `<div class="eff ${u ? 'good' : ''}">${u ? '✔ Éveillé — ' : 'Effet : '}${effText(t.eff).join(', ')}</div>`}</div></div>`;
  };
  return `<h2>Journal des traits <small>${un} / ${TRAITS.length}</small></h2><div class="row wrap filters">${cats.map(([k, n]) => `<button class="btn sm ${U.traitCat === k ? 'primary' : ''}" data-act="traitCat" data-c="${k}">${n}</button>`).join('')}</div>
    <div class="grid traits">${list.map(card).join('')}</div>
    <div class="panel"><h3>Synergies</h3>${SYNERGIES.map(s => { const on = s.ids.every(Traits.has), names = s.ids.map(id => { const t = TRAIT(id), sn = G.tr[id] || {}; return t.hidden && !sn.seen && !sn.u ? '???' : t.n; }); return `<div class="syn ${on ? 'on' : ''}"><b>${on ? '✔' : '○'} ${s.n}</b><small>${names.join(' + ')} — ${s.d}</small></div>`; }).join('')}</div>`;
};

V.quests = () => {
  const grp = (type, title) => {
    const L = QUESTS.filter(q => q.type === type && Quests.status(q) !== 'locked');
    return `<div class="panel"><h3>${title}</h3>${L.map(q => {
      const st = Quests.status(q), cur = Quests.cur(q), rw = q.rew;
      const rtxt = [rw.xp ? `${rw.xp} XP` : '', rw.gold ? `${rw.gold} or` : '', rw.items ? 'objet' : '', rw.cons ? 'consommables' : '', rw.mats ? 'matériaux' : '', rw.rep ? 'réputation' : '', rw.trait ? 'trait' : '', rw.bond ? 'lien' : ''].filter(Boolean).join(', ');
      return `<div class="quest ${st}"><div><b>${q.n}</b> <small>${st === 'done' ? '✔ terminée' : ''}</small><p>${q.d}</p><small>Récompense : ${rtxt}</small>
        ${st === 'active' || st === 'ready' ? bar(cur, q.obj.n, 'xp', `${cur} / ${q.obj.n}`) : ''}</div>
        <div>${st === 'avail' ? `<button class="btn primary sm" data-act="qAccept" data-id="${q.id}">Accepter</button>` : st === 'ready' ? (q.choices ? q.choices.map((c, i) => `<button class="btn primary sm" data-act="qClaim" data-id="${q.id}" data-c="${i}">${c.t}</button>`).join('') : `<button class="btn gold sm" data-act="qClaim" data-id="${q.id}">Récupérer</button>`) : ''}</div></div>`;
    }).join('') || '<em>Aucune quête disponible.</em>'}</div>`;
  };
  return `<h2>Journal de quêtes</h2>${grp('main', 'Quêtes principales')}${grp('side', 'Quêtes secondaires')}${grp('daily', 'Objectifs quotidiens (renouvelés chaque jour)')}`;
};

V.comp = () => `<h2>Compagnons</h2><p><small>Un seul compagnon actif à la fois. Il combat à vos côtés, progresse avec vous et renforce votre lien au fil des batailles.</small></p><div class="grid two">${Object.keys(COMPS).map(id => {
  const d = COMPS[id], c = G.comp[id], rec = c && c.rec;
  return `<div class="panel comp ${G.active === id ? 'active' : ''}"><div class="hero"><span class="portrait big">${d.i}</span><div><b>${d.n}</b><div>${d.role}</div><small>Compétence : ${d.skill.n}</small></div></div>
    ${rec ? `${bar(c.xp, Companions.need(c.lvl), 'xp', `Niveau ${c.lvl}`)}<div class="bond">Lien : <b>${c.bond}</b> ${d.bonds.map(b => `<span class="${c.bond >= b.b ? 'ok' : 'ko'}" data-tip="${effText(b.eff).join(', ')}">${b.b}</span>`).join(' ')}</div>
      <div class="row wrap"><button class="btn sm ${G.active === id ? 'primary' : ''}" data-act="compActive" data-id="${id}">${G.active === id ? 'Actif' : 'Activer'}</button><button class="btn sm" data-act="compTalk" data-id="${id}" ${c.talk === today() ? 'disabled' : ''}>Discuter</button><button class="btn sm" data-act="compGift" data-id="${id}" ${G.p.gold >= G.p.lvl * 20 ? '' : 'disabled'}>Offrir un cadeau (${G.p.lvl * 20} or)</button></div>
      ${U.compMsg[id] ? `<p class="npc-say">${U.compMsg[id]}</p>` : ''}`
      : `<p>Condition : ${d.rec.l}</p>${d.rec.g.map(g => `<div class="goal"><span>${Math.min(val(g.c), g.n)}/${g.n}</span></div>`).join('')}<button class="btn primary sm" data-act="compRecruit" data-id="${id}" ${Companions.can(id) ? '' : 'disabled'}>Recruter</button>`}</div>`;
}).join('')}</div>`;

V.craft = () => {
  const matsP = `<div class="panel"><h3>Matériaux</h3><div class="mats">${Object.keys(MATS).map(k => `<span>${MATS[k][1]} ${MATS[k][0]} <b>${G.mats[k] || 0}</b></span>`).join('')}</div></div>`;
  const tabs = `<div class="row wrap filters">${[['forge', 'Forger'], ['upg', 'Améliorer'], ['alch', 'Alchimie']].map(([k, n]) => `<button class="btn sm ${U.craftTab === k ? 'primary' : ''}" data-act="craftTab" data-t="${k}">${n}</button>`).join('')}</div>`;
  const mt = m => Object.keys(m).map(k => `<span class="${(G.mats[k] || 0) >= m[k] ? 'ok' : 'ko'}">${MATS[k][1]} ${m[k]}</span>`).join(' ');
  let body = '';
  if (U.craftTab === 'forge') {
    const c = Craft.forgeCost(U.forgeSlot, U.forgeQ);
    body = `<div class="panel"><h3>Forger un équipement</h3><div class="row wrap">${Object.keys(ITEM_BASES).map(s => `<button class="btn sm ${U.forgeSlot === s ? 'primary' : ''}" data-act="forgeSlot" data-s="${s}">${TYPE_NAME[s]}</button>`).join('')}</div>
      <div class="row wrap">${QUAL.map((q, i) => `<button class="btn sm ${U.forgeQ === i ? 'primary' : ''}" data-act="forgeQ" data-q="${i}">${q.n}</button>`).join('')}</div>
      <p>Coût : ${fmt(c.gold)} or · ${mt(c.mats)}</p><p><small>Meilleure qualité = plus de chances d’obtenir une rareté élevée (minimum ${RARITIES[QUAL[U.forgeQ].minR].n}).</small></p>
      <button class="btn primary" data-act="forge" ${G.p.gold >= c.gold && Mats.has(c.mats) ? '' : 'disabled'}>Forger</button></div>`;
  } else if (U.craftTab === 'upg') {
    const all = [...Object.values(G.eq).filter(Boolean), ...G.inv].sort((a, b) => b.r - a.r), it = Inv.find(U.upSel);
    const c = it && it.up < 10 ? Craft.upgCost(it) : null;
    body = `<div class="panel"><h3>Améliorer</h3><div class="itemgrid">${all.map(i => itemCard(i, 'upSel')).join('') || '<em>Aucun objet.</em>'}</div></div>
      <div class="panel">${it ? `<h3 class="${rcls(it.r)}">${esc(it.name)} +${it.up}</h3><ul class="statl">${statLines(it.st)}</ul>${it.up >= 10 ? '<p>Niveau maximal.</p>' : `<p>Réussite : <b>${Craft.upgRate(it)} %</b>${it.up >= 5 ? ' · <span class="bad">risque de perdre un niveau en cas d’échec</span>' : ''}</p><p>Coût : ${fmt(c.gold)} or · ${mt(c.mats)}</p><p><small>Bonus spéciaux aux niveaux +3, +6 et +9.</small></p><button class="btn primary" data-act="upgrade" ${G.p.gold >= c.gold && Mats.has(c.mats) ? '' : 'disabled'}>Améliorer en +${it.up + 1}</button>`}` : '<p><em>Choisissez un objet.</em></p>'}</div>`;
  } else body = `<div class="panel"><h3>Alchimie</h3>${Object.keys(RECIPES).map(k => `<div class="recipe"><span>${CONS[k].i} <b>${CONS[k].n}</b> <small>(${G.cons[k] || 0}) — ${CONS[k].d}</small></span><span>${mt(RECIPES[k])} <button class="btn sm" data-act="brew" data-id="${k}" ${Mats.has(RECIPES[k]) ? '' : 'disabled'}>Préparer</button></span></div>`).join('')}</div>`;
  return `<h2>Artisanat</h2>${matsP}${tabs}${body}`;
};

V.shop = () => {
  const tabs = `<div class="row wrap filters">${[['forge', 'Forgeron Brann'], ['rare', 'Colporteur (rareté)'], ['alch', 'Alchimiste Syl']].map(([k, n]) => `<button class="btn sm ${U.shopTab === k ? 'primary' : ''}" data-act="shopTab" data-t="${k}">${n}</button>`).join('')}</div>`;
  const stock = l => `<div class="itemgrid">${l.map(i => itemCard(i, 'shopBuy', `<b class="price">🪙 ${fmt(buyPrice(i))}</b>`)).join('') || '<em>Rupture de stock.</em>'}</div>`;
  let body;
  if (U.shopTab === 'forge') body = `<div class="panel"><p>Le stock change avec vos aventures. <button class="btn sm" data-act="shopRefresh">Renouveler (${Shop.refreshCost()} or)</button></p>${stock(G.shop.items)}<p><small>Vendez depuis l’inventaire. Prix selon la rareté.</small></p></div>`;
  else if (U.shopTab === 'rare') body = `<div class="panel">${G.p.lvl < 8 ? '<p>Le colporteur ne s’intéresse qu’aux aventuriers confirmés (niveau 8).</p>' : `<p>Objets de qualité supérieure, débloqués par votre progression.</p>${stock(G.shop.rare || [])}`}</div>`;
  else body = `<div class="panel">${Object.keys(CONS).map(k => `<div class="recipe"><span>${CONS[k].i} <b>${CONS[k].n}</b> <small>(vous en avez ${G.cons[k] || 0}) — ${CONS[k].d}</small></span><button class="btn sm" data-act="buyCons" data-id="${k}" ${G.p.gold >= Shop.consPrice(k) ? '' : 'disabled'}>🪙 ${Shop.consPrice(k)}</button></div>`).join('')}</div>`;
  return `<h2>Marché <small>🪙 ${fmt(G.p.gold)}</small></h2>${tabs}${body}`;
};

V.stats = () => {
  const pt = G.playTime, rows = [['Ennemis vaincus', val('kills')], ['Boss vaincus', val('killsBoss')], ['Élites vaincus', val('killsElite')], ['Morts', val('deaths')], ['Dégâts infligés', val('dmgDealt')], ['Dégâts subis', val('dmgTaken')], ['Coups critiques', val('crits')], ['Esquives', val('dodges')], ['Coffres ouverts', val('chests')], ['Combats gagnés', val('battlesWon')], ['Donjons terminés', val('dungeonsDone')], ['Objets fabriqués', val('crafted')], ['Or gagné', val('goldEarned')], ['Traits obtenus', `${val('traitsCount')} / ${TRAITS.length}`], ['Temps de jeu', `${Math.floor(pt / 3600)} h ${Math.floor(pt % 3600 / 60)} min`]];
  return `<h2>Statistiques & succès</h2><div class="grid two"><div class="panel"><h3>Statistiques</h3><table class="stats">${rows.map(([a, b]) => `<tr><td>${a}</td><td><b>${typeof b === 'number' ? fmt(b) : b}</b></td></tr>`).join('')}</table></div>
    <div class="panel"><h3>Succès <small>${Object.keys(G.ach).length}/${ACHS.length}</small></h3>${ACHS.map(a => { const d = G.ach[a.id], g = a.g[0]; return `<div class="ach ${d ? 'on' : ''}"><span>${d ? '🏆' : '○'} <b>${a.n}</b></span><small>${d ? 'Obtenu' : `${fmt(Math.min(val(g.c), g.n))}/${fmt(g.n)}`} · ${a.gold} or</small></div>`; }).join('')}</div></div>`;
};

V.rep = () => `<h2>Renommée & titres</h2><div class="grid two"><div class="panel"><h3>Factions</h3>${Object.keys(FACTIONS).map(f => `<div class="fac"><b>${FACTIONS[f][1]} ${FACTIONS[f][0]}</b> <small>${repTier(G.rep[f])} (${G.rep[f]})</small>${bar(Math.max(0, G.rep[f]), 200, 'xp', repTier(G.rep[f]))}</div>`).join('')}<small>La réputation influe sur les réactions des habitants, les remises (Couronne) et débloque des titres.</small></div>
  <div class="panel"><h3>Titres</h3>${TITLES.map(t => { const u = G.titles[t.id]; if (!u && t.secret) return '<div class="title locked"><b>??? (titre secret)</b></div>'; return `<div class="title ${u ? '' : 'locked'} ${G.title === t.id ? 'cur' : ''}"><div><b>${t.n}</b><small>${t.eff && effText(t.eff).length ? effText(t.eff).join(', ') : 'Aucun bonus'}${u ? '' : ' — ' + t.d}</small></div>${u ? `<button class="btn sm ${G.title === t.id ? 'primary' : ''}" data-act="title" data-id="${t.id}">${G.title === t.id ? 'Porté' : 'Porter'}</button>` : ''}</div>`; }).join('')}</div></div>`;

V.opts = () => `<h2>Options & sauvegarde</h2><div class="panel"><p>Sauvegarde automatique après chaque action importante (stockage local du navigateur).</p>
  <label class="chk"><input type="checkbox" data-act="optAnim" ${G.settings.anim ? 'checked' : ''}> Animations</label>
  <div class="row wrap"><button class="btn" data-act="saveNow">Sauvegarder maintenant</button><button class="btn" data-act="export">Exporter la sauvegarde</button><button class="btn" data-act="import">Importer une sauvegarde</button><button class="btn" data-act="toTitle2">Menu principal</button><button class="btn danger" data-act="wipe">Supprimer la sauvegarde</button></div>
  <small>Dernière sauvegarde : ${G.saved ? new Date(G.saved).toLocaleTimeString('fr-FR') : '—'}</small></div>`;

/* ----- Actions (délégation de clics) ----- */
const Act = {
  continue() { if (Game.load()) { applySettings(); UI.game(); Game.sync(); } },
  newgame() { if (Save.exists() && !confirm('Une sauvegarde existe déjà. Elle sera remplacée à la fin de la création. Continuer ?')) return; U.cr = { name: '', portrait: 0, sex: 'x', origin: 'aldra', bg: 'orphelin', diff: 'normal', cls: 'guerrier', style: 'offensif', weapon: 0 }; UI.create(); },
  wipe() { if (confirm('Supprimer définitivement la sauvegarde ? Cette action est irréversible.')) { Save.wipe(); G = null; UI.title(); UI.toast('Sauvegarde supprimée.'); } },
  toTitle() { UI.title(); }, toTitle2() { Save.save(); UI.title(); },
  crSex(d) { U.cr.sex = d.id; UI.create(); }, crOrigin(d) { U.cr.origin = d.id; UI.create(); }, crBg(d) { U.cr.bg = d.id; UI.create(); }, crDiff(d) { U.cr.diff = d.id; UI.create(); },
  hideTut() { G.flags.tutHidden = true; Game.sync(); },
  parSpend(d) { if (Paragon.spend(d.c)) Game.sync(); }, parReset() { Paragon.reset(); Game.sync(); },
  changeClass(d) { const c = CLASSES.find(x => x.id === d.id); if (confirm(`Devenir ${c.n} pour ${fmt(Game.classChangeCost())} or ? Vos compétences de classe seront remboursées.`) && Game.changeClass(d.id)) UI.toast(`Vous êtes désormais ${c.n}.`, 'good'); },
  crPortrait(d) { U.cr.portrait = +d.i; UI.create(); }, crClass(d) { U.cr.cls = d.id; U.cr.weapon = 0; UI.create(); }, crStyle(d) { U.cr.style = d.id; UI.create(); }, crWeapon(d) { U.cr.weapon = +d.i; UI.create(); },
  start() { const n = U.cr.name.trim(); if (n.length < 2) { UI.toast('Choisissez un nom (2 caractères minimum).', 'bad'); return; } Game.create(U.cr); U.tab = 'town'; U.exLog = []; applySettings(); UI.game(); UI.toast(`Bienvenue, ${n} !`, 'good'); },
  tab(d) { U.tab = d.t; U.sel = null; if (d.t === 'traits') { G.c.seenTraits = 1; Tutorial.check(); } UI.renderGame(); $id('view').scrollTop = 0; },
  closeModal() { UI.closeModal(); },
  rest() { const c = Explore.rest(); if (c) UI.toast(`Vous vous reposez (−${c} or). PV et mana restaurés.`, 'good'); },
  qAccept(d) { Quests.accept(d.id); }, qClaim(d) { const l = Quests.claim(d.id, d.c === undefined ? undefined : +d.c); if (l) UI.toast('Récompenses : ' + l.join(' · '), 'good'); },
  spend(d) { if (Player.spend(d.s)) Game.sync(); },
  select(d) { U.sel = d.id; UI.renderGame(); }, equip(d) { Inv.equip(d.id); U.sel = d.id; UI.renderGame(); }, unequip(d) { const s = EQ_SLOTS.find(k => G.eq[k] && G.eq[k].id === d.id); if (s) Inv.unequip(s); },
  sell(d) { const p = Inv.sell(d.id); U.sel = null; if (p) UI.toast(`Vendu pour ${fmt(p)} or.`); },
  invF(d) { U.invF = d.f; UI.renderGame(); },
  sellBelow(d) { const r = Inv.sellBelow(+d.r); UI.toast(`${r.n} objet(s) vendus (+${fmt(r.tot)} or).`); },
  learn(d) { Skills.learn(d.id); }, aug(d) { Skills.setAug(d.id, d.a); }, respec() { if (confirm('Réinitialiser toutes les compétences ? Les points sont rendus (coût en or).')) Skills.respec(); },
  traitCat(d) { U.traitCat = d.c; UI.renderGame(); },
  compRecruit(d) { Companions.recruit(d.id); }, compActive(d) { Companions.setActive(d.id); },
  compTalk(d) { const l = Companions.talk(d.id); if (l) U.compMsg[d.id] = l; UI.renderGame(); }, compGift(d) { if (Companions.gift(d.id)) U.compMsg[d.id] = '« Oh… merci. Vraiment. »'; UI.renderGame(); },
  craftTab(d) { U.craftTab = d.t; UI.renderGame(); }, forgeSlot(d) { U.forgeSlot = d.s; UI.renderGame(); }, forgeQ(d) { U.forgeQ = +d.q; UI.renderGame(); },
  forge() { const it = Craft.forge(U.forgeSlot, U.forgeQ); if (it) UI.toast(`Forgé : ${it.name} (${RARITIES[it.r].n})`, it.r >= 3 ? 'trait' : 'good'); },
  upSel(d) { U.upSel = d.id; U.sel = d.id; UI.renderGame(); },
  upgrade() { const r = Craft.upgrade(U.upSel); if (r) UI.toast(r.msg, r.ok ? 'good' : 'bad'); },
  brew(d) { if (Craft.brew(d.id)) UI.toast(`${CONS[d.id].n} préparé(e).`, 'good'); },
  shopTab(d) { U.shopTab = d.t; UI.renderGame(); }, shopBuy(d) { if (!Shop.buy(d.id)) UI.toast('Achat impossible (or ou place manquants).', 'bad'); else UI.toast('Objet acheté.', 'good'); },
  shopRefresh() { if (!Shop.manualRefresh()) UI.toast('Pas assez d’or.', 'bad'); }, buyCons(d) { if (Shop.buyCons(d.id)) UI.toast(`${CONS[d.id].n} acheté(e).`, 'good'); },
  title(d) { Titles.set(d.id); },
  optAnim(d, el) { G.settings.anim = el.checked; applySettings(); Save.save(); },
  saveNow() { if (Save.save()) UI.toast('Partie sauvegardée.', 'good'); },
  export() { UI.modal(`<h3>Exporter</h3><p><small>Copiez ce texte et conservez-le pour restaurer votre partie.</small></p><textarea readonly id="io" rows="8">${esc(Save.exportText())}</textarea><button class="btn" data-act="closeModal">Fermer</button>`); },
  import() { UI.modal(`<h3>Importer</h3><p class="bad"><small>Remplace la partie actuelle.</small></p><textarea id="io" rows="8" placeholder="Collez la sauvegarde ici"></textarea><div class="row"><button class="btn primary" data-act="doImport">Importer</button><button class="btn" data-act="closeModal">Annuler</button></div>`); },
  doImport() { try { Save.importText($id('io').value); UI.closeModal(); applySettings(); UI.game(); UI.toast('Sauvegarde importée.', 'good'); } catch (e) { UI.toast('Sauvegarde invalide.', 'bad'); } },

  /* Exploration */
  zone(d) { U.zone = d.id; UI.renderGame(); },
  explore() {
    const r = Explore.go(U.zone); if (!r) return;
    if (r.msg) U.exLog.push(r.msg + (r.lines ? ' — ' + r.lines.join(', ') : '')); if (r.bonus) U.exLog.push(r.bonus);
    if (r.encounter) { U.enc = { en: r.encounter, Z: r.zone }; Act.showEnc(); }
    else if (r.narrative) { U.ev = r.narrative.id; Act.showEv(); }
    else UI.renderGame();
  },
  showEnc() {
    const { en } = U.enc, can = en.every(e => e.peace) && en.length === 1;
    UI.modal(`<h3>Une rencontre !</h3><div class="encs">${en.map(e => `<div class="enc ${e.tier}"><span class="e-ico">${e.i}</span><b>${esc(e.n)}</b><small>niv. ${e.lvl}${e.tier === 'elite' ? ' · Élite' : ''}</small></div>`).join('')}</div>
      <div class="row wrap"><button class="btn primary" data-act="encFight">Combattre</button>${can ? '<button class="btn" data-act="encPacify" data-tip="Chance selon Intelligence, réputation Sylve et traits.">Apaiser</button>' : ''}<button class="btn" data-act="encFlee">S’éclipser</button></div>`);
  },
  encFight() { UI.closeModal(); const e = U.enc; U.enc = null; Explore.fight(e.en, e.Z); },
  encPacify() { const e = U.enc, r = Explore.pacify(e.en, e.Z); U.exLog.push(r.msg); if (r.ok) { U.enc = null; UI.closeModal(); UI.toast(r.msg, 'good'); UI.renderGame(); } else { UI.closeModal(); UI.toast(r.msg, 'bad'); U.enc = null; Explore.fight(e.en, e.Z); } },
  encFlee() { U.enc = null; U.exLog.push('Vous vous éclipsez discrètement.'); UI.closeModal(); UI.renderGame(); },
  showEv() {
    const ev = NARR.find(e => e.id === U.ev);
    UI.modal(`<h3>${ev.n}</h3><p>${ev.txt}</p><div class="col">${ev.ch.map((c, i) => `<button class="btn" data-act="evChoice" data-i="${i}" ${Narr.canPay(c.need) ? '' : 'disabled'}>${c.t}</button>`).join('')}</div>`);
  },
  evChoice(d) {
    const r = Narr.choose(U.ev, +d.i); if (!r) return; U.exLog.push(r.txt);
    UI.modal(`<h3>${NARR.find(e => e.id === U.ev).n}</h3><p>${r.txt}</p>${r.lines.length ? `<ul class="res">${r.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}<button class="btn primary" data-act="${r.fight ? 'evFight' : 'closeModal'}">Continuer</button>`);
    U.pendingFight = r.fight || null;
  },
  evFight() { UI.closeModal(); const f = U.pendingFight; U.pendingFight = null; if (f) Narr.startFight(f); },

  /* Donjons */
  dungeon(d) {
    const dg = DUNGEON(d.id), B = BOSSES[dg.boss];
    if (!confirm(`Entrer dans ${dg.n} (${DIFFS[+d.d].n}) ?\n${dg.stages.length} combats sans fuite possible. Boss : ${B.n} (niv. ${B.lvl + DIFFS[+d.d].off}).`)) return;
    Dungeon.start(d.id, +d.d);
  },
  dungNext() { UI.closeModal(); const d = Dungeon.D, dg = DUNGEON(d.id); if (Dungeon.canNegotiate()) { UI.modal(`<h3>Le Roi Gobelin</h3><p>Grimgut vous fixe. Le petit gobelin que vous avez libéré se glisse entre vous : « Roi, ami est bon… ». Le Roi hésite.</p><div class="row wrap"><button class="btn primary" data-act="negotiate">Négocier (chemin pacifique)</button><button class="btn" data-act="dungGo">Combattre</button></div>`); return; } Dungeon.next(); },
  dungGo() { UI.closeModal(); Dungeon.next(); }, negotiate() { UI.closeModal(); Dungeon.negotiate(); },
  dungQuit() { UI.closeModal(); Dungeon.D = null; G.flags.dungeon = null; Game.sync(); UI.toast('Vous quittez le donjon.', 'bad'); },

  /* Combat */
  target(d) { if (Combat.C && !Combat.C.enemies[+d.i].dead) { Combat.C.target = +d.i; UI.renderCombat(); } },
  attack() { U.cmenu = null; Combat.attack(); }, defend() { U.cmenu = null; Combat.defend(); }, finisher() { U.cmenu = null; Combat.finisher(); }, flee() { U.cmenu = null; Combat.flee(); },
  menuSkills() { U.cmenu = U.cmenu === 'skills' ? null : 'skills'; UI.renderCombat(); }, menuItems() { U.cmenu = U.cmenu === 'items' ? null : 'items'; UI.renderCombat(); },
  useSkill(d) { U.cmenu = null; Combat.skill(d.id); }, useItem(d) { U.cmenu = null; Combat.useItem(d.id); },
  endCombat() { const dung = Dungeon.D; UI.closeModal(); $id('modal').dataset.res = '0'; U.screen = 'game'; UI.show('game'); Combat.finish(); if (U.screen === 'game') UI.renderGame(); }
};
function applySettings() { document.body.classList.toggle('no-anim', !(G && G.settings.anim)); }

/* ----- Initialisation ----- */
function initUI() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT') return;
    if (el.disabled) return; const f = Act[el.dataset.act]; if (f) f(el.dataset, el);
  });
  document.addEventListener('change', e => { const el = e.target.closest('input[data-act]'); if (el && Act[el.dataset.act]) Act[el.dataset.act](el.dataset, el); });
  document.addEventListener('input', e => { if (e.target.dataset.bind === 'name') U.cr.name = e.target.value; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$id('modal').classList.contains('hidden') && !(Combat.C && Combat.C.over)) UI.closeModal(); });
  // Infobulles
  const tip = $id('tooltip');
  document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (!t) { tip.classList.add('hidden'); return; } tip.innerHTML = t.dataset.tip; tip.classList.remove('hidden'); });
  document.addEventListener('mousemove', e => { if (tip.classList.contains('hidden')) return; const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.min(e.clientX + 16, innerWidth - w - 8) + 'px'; tip.style.top = Math.min(e.clientY + 16, innerHeight - h - 8) + 'px'; });
  document.addEventListener('mouseout', e => { if (!e.relatedTarget) tip.classList.add('hidden'); });
  // Temps de jeu fiable (uniquement onglet visible) + sauvegardes de sécurité
  setInterval(() => { if (G && !document.hidden && U.screen !== 'title' && U.screen !== 'create') G.playTime++; }, 1000);
  setInterval(() => { if (G && U.screen !== 'title' && U.screen !== 'create') Save.save(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && U.screen !== 'title') Save.save(); });
  window.addEventListener('beforeunload', () => { if (G && U.screen !== 'title' && U.screen !== 'create') Save.save(); });
  UI.title();
}
document.addEventListener('DOMContentLoaded', initUI);
