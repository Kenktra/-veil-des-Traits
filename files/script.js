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

/* Plafonds globaux des bonus cumulés (traits, objets, titres, compétences…) : évite l'empilement absurde au niveau 250 */
const EFF_CAP = {
  atkPct: [-.6, .9], defPct: [-.6, .9], hpPct: [-.6, .9], mpPct: [-.6, .9], allPct: [0, .35], skillPct: [0, 1.0],
  critFlat: [-20, 35], dodgeFlat: [-20, 28], spdFlat: [-10, 40], precFlat: [0, 45], penFlat: [0, 40], sresFlat: [0, 40],
  xpPct: [-.5, 1.0], goldPct: [-.5, 1.2], lootLuck: [0, 1.2], lifesteal: [0, .25], dmgTakenPct: [-.55, .8], healPct: [-.8, 1.2], regenPost: [0, .5], regenTurn: [0, .12],
  dmgBossPct: [0, 1.0], nightAtk: [0, .5], statusChance: [0, 1], dotPct: [0, 1.5], finTh: [0, .3], shopDisc: [0, .4], upgBonus: [0, .5], peaceBonus: [0, .8],
  companionPct: [0, 1.0], summonPct: [0, 1.2], deathMit: [0, .8], defendBonus: [0, .3], potionPct: [0, 1.0], thorns: [0, .6], extraTurn: [0, .3], critDmg: [-.5, 1.4],
  onKillMp: [0, 40], mpRegen: [0, 25], hitBleed: [0, .6], hitBurn: [0, .6], hitFreeze: [0, .4], hitPoison: [0, .6],
  resFire: [-.5, .75], resIce: [-.5, .75], resShock: [-.5, .75], resPoison: [-.5, .75], resDark: [-.5, .75], resHoly: [-.5, .75]
};

/* ---------- 2c. ARSENAL : catalogue d'objets nommés (étape 4) ----------
   Chaque entrée a une clé stable (key), une rareté fixe, un niveau minimal, un effet éventuel et une description.
   Les statistiques sont calculées d'après le niveau d'objet au moment du drop : un objet de rareté élevée mais
   de bas niveau reste donc dépassé par un objet de haut niveau.
   gate : 'boss' = ne tombe que sur un boss ; 'none' = jamais en butin aléatoire (événements/quêtes futurs). */
Object.assign(FX, {
  spirit: { n: 'Essence liée', d: '+2 mana par tour, +6 % dégâts de compétence', eff: { mpRegen: 2, skillPct: .06 } },
  pact: { n: 'Pacte d’âme', d: '+25 % invocations, +3 mana par tour', eff: { summonPct: .25, mpRegen: 3 } },
  chrono: { n: 'Fil du temps', d: '8 % de tour supplémentaire', eff: { extraTurn: .08 } },
  curse_atk: { n: 'Soif maudite', d: 'Maudite : +18 % attaque, −10 % PV max', eff: { atkPct: .18, hpPct: -.10 } },
  curse_vamp: { n: 'Appétit maudit', d: 'Maudite : 10 % de vol de vie, −30 % de soins reçus', eff: { lifesteal: .10, healPct: -.30 } },
  curse_crit: { n: 'Marque du bourreau', d: 'Maudite : +50 % dégâts critiques, −10 % défense', eff: { critDmg: .5, defPct: -.10 } }
});
const CAT_ENTRIES = [];
const CE = (key, n, slot, cat, lv, r, fx, d, o = {}) => CAT_ENTRIES.push(Object.assign({ key, n, slot, cat, lv, r, fx: fx || [], d, force: [] }, o));
const WP = (key, n, cat, lv, r, fx, d, o) => CE('w_' + key, n, 'weapon', cat, lv, r, fx, d, o);

/* Armes : 64 */
WP('epee_recrue', 'Épée de recrue', 'sword', 1, 0, [], 'Forgée en série pour les nouvelles recrues d’Aldra.');
WP('lame_garde', 'Lame de la Garde', 'sword', 6, 1, [], 'L’insigne de la Garde est gravé sur sa garde.', { force: ['str'] });
WP('epee_nord', 'Épée longue de Kaldheim', 'sword', 12, 2, ['m_guard'], 'Un acier froid, forgé pour les hivers du Nord.', { force: ['crit'] });
WP('aube_brisee', 'Aube-Brisée', 'sword', 22, 3, ['m_vamp'], 'Brisée à l’aube d’une bataille oubliée, puis reforgée.');
WP('serment_argent', 'Serment d’Argent', 'sword', 35, 4, ['bulwark'], 'Elle protège ceux qui ont prêté serment.', { force: ['end'] });
WP('lame_vide', 'Lame du Vide', 'sword', 70, 5, ['execution'], 'Elle ne reflète rien. Elle ne manque rien.');
WP('espadon_rouille', 'Espadon rouillé', 'greatsword', 3, 0, [], 'Lourd, mal équilibré, mais il tranche encore.');
WP('pourfendeuse', 'Pourfendeuse', 'greatsword', 14, 2, [], 'Taillée pour fendre les boucliers.', { force: ['str'] });
WP('tranche_montagne', 'Tranche-Montagne', 'greatsword', 30, 3, ['m_guard'], 'On dit qu’elle a ouvert un col dans la roche.');
WP('lame_titans', 'Lame des Titans', 'greatsword', 60, 4, ['titan'], 'Trop grande pour un humain. Pas pour vous.');
WP('surin', 'Surin de ruelle', 'dagger', 1, 0, [], 'Petit, discret, efficace.');
WP('croc_vipere', 'Croc de vipère', 'dagger', 10, 2, ['m_vamp'], 'Une lame courbe au tranchant luisant.', { force: ['agi'] });
WP('murmure_ombre', 'Murmure de l’Ombre', 'dagger', 24, 3, ['m_gold'], 'La Guilde des Ombres en offre à ses meilleurs.', { force: ['crit'] });
WP('dent_nuit', 'Dent de la Nuit', 'dagger', 40, 4, ['venom'], 'Elle empoisonne ce qu’elle effleure.');
WP('eclat_sans_nom', 'Éclat Sans Nom', 'dagger', 80, 6, ['timeworn'], 'Personne ne sait qui l’a forgée. Elle, si.', { gate: 'boss' });
WP('katana_apprenti', 'Katana d’apprenti', 'katana', 5, 1, [], 'Fil net, poignée simple.', { force: ['crit'] });
WP('katana_brume', 'Katana de la brume', 'katana', 18, 2, ['m_xp'], 'Un reflet de brume danse sur la lame.');
WP('soleil_levant', 'Lame du Soleil Levant', 'katana', 38, 4, ['swift'], 'Elle sort du fourreau avant la pensée.');
WP('kuro', 'Kuro-no-Tsuki', 'katana', 85, 5, ['tempest'], 'La lune noire n’éclaire que les duels.');
WP('pique_milicien', 'Pique de milicien', 'spear', 2, 0, [], 'Longue, droite, sans fioritures.');
WP('lance_cavalier', 'Lance du Cavalier', 'spear', 15, 2, [], 'Faite pour charger, pas pour reculer.', { force: ['spd'] });
WP('perce_etoile', 'Perce-Étoile', 'spear', 33, 3, ['m_guard'], 'Sa pointe garde un éclat d’astre.');
WP('pointe_aurore', 'Pointe-d’Aurore', 'spear', 65, 4, ['burner'], 'Elle brûle d’une lumière dorée.');
WP('hachette', 'Hachette de bûcheron', 'axe', 1, 0, [], 'Elle tranche mieux le bois que les os. Mais.');
WP('hache_clans', 'Hache des clans', 'axe', 11, 2, [], 'Les clans du Nord la transmettent de père en fille.', { force: ['str'] });
WP('hache_berserker', 'Hache du Berserker', 'axe', 28, 3, ['m_vamp'], 'Plus on est blessé, plus elle semble légère.');
WP('mange_cranes', 'Mange-Crânes', 'axe', 55, 4, ['bleeder'], 'Ses encoches comptent les vaincus.');
WP('maillet', 'Maillet de forgeron', 'hammer', 2, 0, [], 'Fait pour la forge, tolère la guerre.');
WP('marteau_gardien', 'Marteau du Gardien', 'hammer', 16, 2, [], 'Il résonne comme une cloche.', { force: ['end'] });
WP('ecrase_montagnes', 'Écrase-Montagnes', 'hammer', 36, 4, ['froster'], 'Chaque coup fait trembler le sol.');
WP('tonnerre_kaldheim', 'Tonnerre de Kaldheim', 'hammer', 75, 5, ['godslayer'], 'Le tonnerre lui-même s’incline.');
WP('arc_chasseur', 'Arc de chasseur', 'bow', 1, 0, [], 'Simple et fiable, comme son maître.');
WP('arc_ilvane', 'Arc long d’Ilvane', 'bow', 9, 2, [], 'Taillé dans un bois vivant.', { force: ['agi'] });
WP('souffle_sylve', 'Souffle de la Sylve', 'bow', 27, 3, ['m_xp'], 'La corde chante comme le vent.');
WP('arc_aube_pale', 'Arc de l’Aube Pâle', 'bow', 50, 4, ['lucky'], 'Ses flèches trouvent toujours un chemin.');
WP('arbalete_garde', 'Arbalète de garde', 'crossbow', 4, 1, [], 'Standard de la Garde de la Couronne.');
WP('arbalete_repetition', 'Arbalète à répétition', 'crossbow', 20, 3, ['m_gold'], 'Mécanisme d’ingénieur, cadence soutenue.', { force: ['spd'] });
WP('brise_rempart', 'Brise-Rempart', 'crossbow', 45, 4, ['bleeder'], 'Ses carreaux percent la pierre.');
WP('baton_novice', 'Bâton de novice', 'staff', 1, 0, [], 'Premier bâton de bien des mages.');
WP('baton_brume', 'Bâton de la Brume', 'staff', 10, 2, ['m_xp'], 'Un brouillard léger l’enveloppe.', { force: ['int'] });
WP('baton_cercle', 'Bâton du Cercle', 'staff', 25, 3, ['m_gold'], 'Emblème du Cercle Arcanique.', { force: ['mp'] });
WP('sceptre_tempete', 'Sceptre de la Tempête', 'staff', 42, 4, ['arcane'], 'Des éclairs courent le long du bois.');
WP('axis_mundi', 'Axis Mundi', 'staff', 90, 5, ['tempest'], 'L’axe du monde, en miniature.');
WP('grimoire_elime', 'Grimoire élimé', 'tome', 2, 0, [], 'Les pages se détachent, les sorts non.');
WP('codex_cercle', 'Codex du Cercle', 'tome', 13, 2, [], 'Annoté par trois générations d’apprentis.', { force: ['int'] });
WP('livre_ombres', 'Livre des Ombres', 'tome', 30, 3, ['m_vamp'], 'Il murmure quand on ne le lit pas.');
WP('chronique_morts', 'Chronique des Morts', 'tome', 48, 4, ['vampire'], 'Chaque page est un nom.');
WP('faucille', 'Faucille de moissonneur', 'scythe', 6, 1, [], 'Pas faite pour la guerre. Pas encore.');
WP('faux_fossoyeur', 'Faux du Fossoyeur', 'scythe', 24, 3, ['m_vamp'], 'Elle sent la terre fraîche.', { force: ['int'] });
WP('moissonneuse', 'Moissonneuse d’Âmes', 'scythe', 62, 5, ['soulreaper'], 'Elle ne coupe pas le corps.');
WP('poings_bois', 'Poings de bois', 'fist', 1, 0, [], 'Des gantelets d’entraînement de dojo.');
WP('gantelets_moine', 'Gantelets de moine', 'fist', 8, 2, [], 'Lestés, polis par la méditation.', { force: ['agi'] });
WP('poings_dragon', 'Poings du Dragon Ascendant', 'fist', 44, 4, ['swift'], 'Le dragon s’éveille à chaque coup.');
WP('arquebuse', 'Arquebuse de contrebandier', 'gun', 7, 1, [], 'Bruyante, imprécise, mais terrifiante.');
WP('fusil_runique', 'Fusil runique', 'gun', 26, 3, ['m_gold'], 'Des runes gravées dans le canon.', { force: ['int'] });
WP('canon_zahar', 'Canon de Zahar', 'gun', 52, 4, ['burner'], 'Artisanat des maîtres-fondeurs de Zahar.');
WP('lame_spectrale', 'Lame spectrale', 'sword', 20, 3, ['spirit'], 'Invoquée : elle n’existe que tant que vous la tenez.', { kind: 'invoquée' });
WP('baton_esprit', 'Bâton de l’Esprit Lié', 'staff', 45, 4, ['pact'], 'Invoquée : un esprit y est lié par un pacte.', { kind: 'invoquée' });
WP('soif_sang', 'Épée Soif-de-Sang', 'sword', 30, 4, ['curse_atk'], 'Maudite : elle exige du sang.', { kind: 'maudite' });
WP('faux_penitent', 'Faux du Pénitent', 'scythe', 40, 4, ['curse_vamp'], 'Maudite : elle se nourrit des vivants.', { kind: 'maudite' });
WP('hache_bourreau', 'Hache du Bourreau', 'axe', 52, 4, ['curse_crit'], 'Maudite : la sentence est toujours la même.', { kind: 'maudite' });
WP('fragment_devoreur', 'Fragment du Dévoreur', 'greatsword', 100, 6, ['devourer'], 'Un éclat de la faim primordiale.', { kind: 'secrète', gate: 'boss' });
WP('horloge_brisee', 'Horloge Brisée', 'wand', 120, 6, ['timeworn', 'chrono'], 'Le temps s’y est arrêté, puis s’est replié.', { kind: 'secrète', gate: 'boss' });
WP('lame_eveil', 'Lame d’Éveil', 'katana', 150, 6, ['eveil_fx'], 'Elle répond à ceux dont les actes ont tout changé.', { kind: 'secrète', gate: 'none' });

/* Ensembles : 4 × 5 pièces, bonus à 2 et 4 pièces portées */
const SETS = [
  { id: 'gardien', n: 'Gardien d’Aldra', r: 3, lv: 20, names: ['Heaume', 'Cuirasse', 'Gantelets', 'Grèves', 'Sabatons'], bi: [0, 0, 0, 0, 0], force: ['end', 'def'],
    b: { 2: { defPct: .05, hpPct: .04 }, 4: { dmgTakenPct: -.05, defendBonus: .10 } }, d: 'La panoplie des gardiens de la Couronne.' },
  { id: 'ombre', n: 'Lames de l’Ombre', r: 3, lv: 28, names: ['Capuche', 'Cuirasse légère', 'Gants', 'Pantalon', 'Sandales'], bi: [1, 2, 1, 1, 1], force: ['agi', 'dodge'],
    b: { 2: { critFlat: 3, dodgeFlat: 3 }, 4: { critDmg: .2, dodgeFlat: 5 } }, d: 'Tissée dans l’ombre pour ne laisser aucune trace.' },
  { id: 'tisse', n: 'Tisse-Arcanes', r: 4, lv: 40, names: ['Couronne', 'Robe', 'Gants', 'Pantalon', 'Sandales'], bi: [2, 1, 1, 1, 1], force: ['int', 'mp'],
    b: { 2: { mpPct: .10, skillPct: .06 }, 4: { skillPct: .12, mpRegen: 3 } }, d: 'Chaque fil est une rune, chaque rune un sort.' },
  { id: 'braise', n: 'Cœur de Braise', r: 4, lv: 55, names: ['Casque', 'Plastron', 'Gantelets', 'Jambières', 'Bottes'], bi: [0, 0, 0, 0, 0], force: ['str', 'atk'],
    b: { 2: { atkPct: .05, resFire: .15 }, 4: { hitBurn: .20, atkPct: .06 } }, d: 'Forgée à même la lave des Montagnes de Cendre.' }
];
const SET_SLOTS = ['head', 'chest', 'hands', 'legs', 'feet'];
for (const s of SETS) s.names.forEach((nm, i) => CE(`a_${s.id}_${SET_SLOTS[i]}`, `${nm} ${s.n === 'Gardien d’Aldra' ? 'du Gardien' : s.n === 'Lames de l’Ombre' ? 'de l’Ombre' : s.n === 'Tisse-Arcanes' ? 'Tisse-Arcanes' : 'de Braise'}`, SET_SLOTS[i], null, s.lv, s.r, [], s.d, { set: s.id, bi: s.bi[i], force: s.force }));

/* Boucliers, anneaux, amulettes, capes, reliques : 20 */
CE('o_targe', 'Targe de bois', 'off', 'shield', 1, 0, [], 'Elle encaisse. Parfois.');
CE('o_bouclier_garde', 'Bouclier du Garde', 'off', 'shield', 12, 2, [], 'Marqué du blason de la Couronne.', { force: ['end'] });
CE('o_rempart_kaldheim', 'Rempart de Kaldheim', 'off', 'shield', 35, 4, ['bulwark'], 'Les clans l’ont porté contre les géants.');
CE('o_egide_aurore', 'Égide de l’Aurore', 'off', 'shield', 70, 5, ['titan'], 'Elle brille avant le premier coup.');
CE('o_orbe_cercle', 'Orbe du Cercle', 'off', 'orb', 20, 3, ['m_xp'], 'Une sphère de savoir comprimé.', { force: ['int'] });
CE('r_cuivre', 'Anneau de cuivre', 'acc', null, 1, 0, [], 'Un simple anneau, mais sincère.', { bi: 0 });
CE('r_pillard', 'Anneau du Pillard', 'acc', null, 14, 2, [], 'Pris à un pillard qui n’en avait plus l’usage.', { bi: 0, force: ['crit', 'str'] });
CE('r_sceau_couronne', 'Sceau de la Couronne', 'acc', null, 30, 3, ['m_guard'], 'Un sceau officiel, rarement porté hors des cérémonies.', { bi: 0 });
CE('r_fortune', 'Anneau de Fortune', 'acc', null, 45, 4, ['lucky'], 'Le hasard vous doit une faveur.', { bi: 0 });
CE('r_neant', 'Anneau du Néant', 'acc', null, 100, 6, ['voidheart'], 'Il bat comme un cœur qui n’est pas le vôtre.', { bi: 0, gate: 'boss', kind: 'secrète' });
CE('m_bois', 'Pendentif de bois', 'acc', null, 3, 0, [], 'Sculpté par un enfant. Précieux, pourtant.', { bi: 1 });
CE('m_cercle', 'Amulette du Cercle', 'acc', null, 22, 3, ['m_xp'], 'Elle vibre près des sources de magie.', { bi: 1, force: ['int'] });
CE('m_sylve', 'Cœur de Sylve', 'acc', null, 38, 4, ['flow'], 'Un cœur de bois qui bat doucement.', { bi: 1 });
CE('m_phenix', 'Larme de Phénix', 'acc', null, 80, 5, ['phoenix'], 'Elle brûle sans jamais s’éteindre.', { bi: 1 });
CE('c_voyage', 'Cape de voyage', 'acc', null, 2, 0, [], 'Chaude, usée, fidèle.', { bi: 2 });
CE('c_rodeur', 'Cape du Rôdeur', 'acc', null, 18, 2, [], 'Elle se fond dans les sous-bois.', { bi: 2, force: ['dodge'] });
CE('c_nuit', 'Manteau de Nuit', 'acc', null, 42, 4, ['swift'], 'Tissé dans le silence.', { bi: 2 });
CE('x_premier_roi', 'Relique du Premier Roi', 'acc', null, 60, 4, ['scholar'], 'Un sceau porté par le premier souverain d’Aldra.', { bi: 1 });
CE('x_dernier_matin', 'Relique du Dernier Matin', 'acc', null, 95, 5, ['godslayer'], 'Le dernier lever de soleil, scellé dans le cristal.', { bi: 1 });
CE('x_idole_eveil', 'Idole de l’Éveil', 'acc', null, 120, 6, ['eveil_fx'], 'Elle ne s’active que pour un héros accompli.', { bi: 1, kind: 'secrète', gate: 'none' });

const Catalog = {
  byKey(k) { return CAT_ENTRIES.find(e => e.key === k); },
  pick(ilvl, r, slot, o) {
    if (r === 0 && !chance(.25)) return null;
    const c = CAT_ENTRIES.filter(e => e.r === r && e.slot === slot && e.lv <= ilvl + 3 && (!o.cat || e.cat === o.cat) && (e.gate === undefined || (e.gate === 'boss' && o.boss)));
    return c.length && chance(r >= 4 ? .6 : .35) ? pick(c) : null;
  },
  make(e, ilvl) {
    const it = genItem({ ilvl: Math.max(ilvl, e.lv), r: e.r, slot: e.slot, cat: e.cat || undefined, name: e.n, fx: e.fx, force: e.force, bi: e.bi, noCat: true });
    it.key = e.key; it.desc = e.d; if (e.set) it.set = e.set; if (e.kind) it.kind = e.kind; return it;
  }
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
    v: 3, created: Date.now(), saved: 0, playTime: 0,
    settings: { anim: true },
    p: { name: '', portrait: 0, cls: 'guerrier', style: 'offensif', lvl: 1, xp: 0, gold: 60, hp: 1, mp: 1, base: { str: 0, int: 0, agi: 0, end: 0 }, pts: 0, sp: 0, sex: 'x', origin: 'aldra', bg: 'orphelin', diff: 'normal', alloc: { str: 0, int: 0, agi: 0, end: 0 }, par: { lvl: 0, xp: 0, pts: 0, alloc: {} }, classChanges: 0 },
    inv: [], stash: [], recipes: {}, mine: null, eq: {}, cons: { potion_hp: 3, potion_mp: 1 }, mats: {},
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
  if (k === 'gold') return G.p.gold;
  if (k === 'factionsHonored') return Object.values(G.rep).filter(v => v >= 100).length;
  if (k.startsWith('zx_')) return (G.zones[k.slice(3)] || {}).ex || 0;
  if (k.startsWith('repneg_')) return Math.max(0, -(G.rep[k.slice(7)] || 0));
  if (k.startsWith('rep_')) return G.rep[k.slice(4)] || 0;
  if (k.startsWith('trait_')) return (G.tr[k.slice(6)] || {}).u ? 1 : 0;
  return G.c[k] || 0;
}

const Save = {
  KEY: 'eveil_traits_save', VER: 3,
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
    const cnt = {}; for (const sl of EQ_SLOTS) { const it = G.eq[sl]; if (it && it.set) cnt[it.set] = (cnt[it.set] || 0) + 1; }
    for (const s of SETS) for (const th in s.b) if ((cnt[s.id] || 0) >= +th) L.push({ src: `Ensemble · ${s.n} (${th} pièces)`, eff: s.b[th] });
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
    for (const k in EFF_CAP) if (typeof E[k] === 'number') E[k] = clamp(E[k], EFF_CAP[k][0], EFF_CAP[k][1]);
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
  if (!o.name && !o.fx && !o.noCat) { const ce = Catalog.pick(ilvl, r, slot, o); if (ce) return Catalog.make(ce, ilvl); }
  const b = (o.bi !== undefined && list[o.bi]) || (o.cat && list.find(x => x.cat === o.cat)) || pick(list);
  const B = (4 + ilvl * 1.6) * R.m, st = {};
  for (const k in b.main) st[k] = Math.max(1, Math.round(B * b.main[k] * rnd(.92, 1.08)));
  let n = R.aff + (slot === 'acc' ? 2 : 0), guard = 40; const cand = [...(o.force || []), ...b.bias];
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
  heal(n) { const S = Stats.get(), b = G.p.hp; G.p.hp = clamp(G.p.hp + Math.round(n), 0, S.maxHp); const g = G.p.hp - b; if (g > 0 && G.c) bump('healed', g); return g; },
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

/* ---------- 4b. INVENTAIRE AVANCÉ (étape 4) ----------
   Protections : un objet verrouillé ou de quête n'est jamais vendu ni démonté ; les favoris sont exclus
   des sélections automatiques ; les objets équipés ne sont pas dans l'inventaire donc ne peuvent pas être vendus. */
const DISMANTLE = {
  0: { ore: 1, hide: 1 }, 1: { ore: 2, hide: 1 }, 2: { ore: 3, hide: 2, crystal: 1 }, 3: { ore: 4, hide: 3, crystal: 2 },
  4: { ore: 5, hide: 4, crystal: 3, star: 1 }, 5: { ore: 6, hide: 5, crystal: 4, star: 2 }, 6: { ore: 8, hide: 6, crystal: 6, star: 4 }
};
const SET_BY = id => SETS.find(s => s.id === id);
Object.assign(Inv, {
  STASH_MAX: 100, STASH_LVL: 15,
  power(it) {
    const w = { atk: 1, def: 1, mres: 1, hp: .2, mp: .1, str: 1.5, int: 1.5, agi: 1.5, end: 1.5, spd: 3, crit: 3, dodge: 3, prec: 2, pen: 3 };
    let p = 0; for (const k in it.st) p += (it.st[k] || 0) * (w[k] || 1);
    return Math.round(p + it.fx.length * it.ilvl * 2);
  },
  protectedItem(it) { return !!(it.lock || it.quest); },
  add(it, src) {
    if (G.inv.some(x => x.id === it.id)) return false; // jamais de doublon d'identifiant
    if (G.inv.length >= this.MAX) {
      const cand = G.inv.filter(x => !x.lock && !x.fav && !x.quest).sort((a, b) => a.r - b.r || a.val - b.val);
      const worst = cand[0];
      if (worst && worst.r <= it.r) { this.remove(worst.id); Player.gold(sellPrice(worst), 'neutral'); Hooks.toast(`Inventaire plein : ${worst.name} vendu automatiquement.`); }
      else { Player.gold(sellPrice(it), 'neutral'); Hooks.toast('Inventaire plein : butin vendu automatiquement.'); return false; }
    }
    if (src !== 'shop') it.isNew = true;
    G.inv.push(it);
    if (src !== 'shop') { bump('itemsFound'); if (it.r >= 2) bump('rareDrops'); if (it.r >= 3) bump('epicFound'); if (it.r === 6) bump('secretFound'); if (it.r >= 4) bump('legFound'); if (it.r >= 5) bump('mythFound'); }
    return true;
  },
  pick(ids, from = G.inv) { const s = new Set(ids), seen = new Set(), out = []; for (const it of from) if (s.has(it.id) && !seen.has(it.id)) { seen.add(it.id); out.push(it); } return out; },
  eligible(maxR, from = G.inv) { return from.filter(i => i.r <= maxR && !i.lock && !i.fav && !i.quest); },
  total(items) { return items.reduce((s, i) => s + (this.protectedItem(i) ? 0 : sellPrice(i)), 0); },
  sell(id) { const it = G.inv.find(x => x.id === id); if (!it || this.protectedItem(it)) return 0; return this.sellMany([id]).tot; },
  sellMany(ids) {
    const items = this.pick(ids), ok = items.filter(i => !this.protectedItem(i)); let tot = 0;
    for (const it of ok) { this.remove(it.id); tot += sellPrice(it); bump('sold'); }
    if (tot) Player.gold(tot); Game.sync();
    return { n: ok.length, tot, skipped: items.length - ok.length };
  },
  sellBelow(maxR) { return this.sellMany(this.eligible(maxR).map(i => i.id)); },
  dismantleMany(ids) {
    const items = this.pick(ids).filter(i => !this.protectedItem(i)), mats = {}, plans = [];
    for (const it of items) {
      this.remove(it.id); bump('dismantled');
      if (it.key) { G.recipes = G.recipes || {}; if (!G.recipes[it.key]) { G.recipes[it.key] = true; plans.push(it.name); bump('plans'); } }
      const t = DISMANTLE[it.r]; for (const k in t) { const n = t[k] + (it.up > 0 && k === 'ore' ? it.up : 0); mats[k] = (mats[k] || 0) + n; G.mats[k] = (G.mats[k] || 0) + n; }
    }
    Game.sync(); if (plans.length) Hooks.toast('📐 Plan appris : ' + plans.join(', '), 'trait'); return { n: items.length, mats, plans };
  },
  toggle(id, key) { const it = this.find(id) || G.stash.find(x => x.id === id); if (it) { it[key] = !it[key]; Game.sync(); } },
  stashOpen() { return G.p.lvl >= this.STASH_LVL; },
  deposit(ids) {
    if (!this.stashOpen()) return 0; let n = 0;
    for (const it of this.pick(ids)) { if (G.stash.length >= this.STASH_MAX) break; this.remove(it.id); G.stash.push(it); n++; }
    Game.sync(); return n;
  },
  withdraw(ids) {
    let n = 0;
    for (const it of this.pick(ids, G.stash)) { if (G.inv.length >= this.MAX) break; G.stash.splice(G.stash.indexOf(it), 1); G.inv.push(it); n++; }
    Game.sync(); return n;
  }
});

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
    this.store(q)[id].s = 'done'; bump('questsDone'); bump('q_' + id); bump('qt_' + q.type);
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
    G = newState(); Dungeon.D = null;
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
    G = d; Dungeon.D = G.flags.dstate || null;
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

/* ---------- 5b. TRAITS ÉTENDUS (étape 5) ----------
   Chaque trait est piloté par des compteurs réels (bump) : voir Combat, Explore, Craft, Shop, Quests, Narr, Dungeon.
   Les effets sont volontairement modestes : un plafond global (EFF_CAP) borne leur cumul.
   Les traits cachés ne révèlent leur existence qu'après une première progression, et jamais leur recette complète. */
Object.assign(TCAT, {
  armes: 'Armes', armures: 'Armures', magie: 'Magie', invocation: 'Invocation', defense: 'Défense', artisanat: 'Artisanat', economie: 'Économie',
  reputation: 'Réputation', boss: 'Boss', donjons: 'Donjons', evenements: 'Événements', quetes: 'Quêtes', compagnons: 'Compagnons'
});
const g_ = (c, n, l) => ({ c, n, l });
const N_ = (id, n, cat, r, d, goals, eff, x) => TRAITS.push(T(id, n, cat, r, d, goals, eff, x || {}));

/* --- Armes : victoires avec une catégorie d'armes --- */
[['sword', 'Lame émérite', 'Mille duels à l’épée ont affiné votre garde.', { atkPct: .03, defPct: .02 }],
 ['greatsword', 'Fléau des armures', 'Une épée à deux mains ne demande pas de finesse, seulement de la conviction.', { penFlat: 4, atkPct: .02 }],
 ['dagger', 'Main de l’ombre', 'Une dague, un souffle, un adversaire qui tombe.', { critFlat: 3, dodgeFlat: 2 }],
 ['katana', 'Voie du katana', 'Un seul geste, parfaitement placé.', { critDmg: .1, critFlat: 2 }],
 ['spear', 'Allonge parfaite', 'Tenir l’ennemi à distance est une forme de sagesse.', { penFlat: 5, spdFlat: 1 }],
 ['axe', 'Bûcheron de guerre', 'Votre hache a tranché plus de chairs que de bois.', { atkPct: .04 }],
 ['hammer', 'Briseur d’os', 'On entend vos coups avant de vous voir.', { atkPct: .03, defPct: .02 }],
 ['bow', 'Œil du chasseur', 'Le vent, la distance, la corde : tout est calculé.', { precFlat: 6, critFlat: 2 }],
 ['crossbow', 'Tireur d’élite', 'La précision mécanique est votre religion.', { penFlat: 3, critDmg: .1 }],
 ['staff', 'Disciple du bâton', 'Le bois canalise ce que la volonté ordonne.', { skillPct: .04, mpPct: .03 }],
 ['wand', 'Virtuose de la baguette', 'Un geste du poignet, un monde qui plie.', { skillPct: .03, mpRegen: 1 }],
 ['tome', 'Rat de bibliothèque', 'Vos sorts sont annotés dans la marge.', { skillPct: .03, xpPct: .03 }],
 ['scythe', 'Moissonneur', 'Ce que vous fauchez ne repousse pas.', { lifesteal: .015, onKillMp: 2 }],
 ['fist', 'Poing d’acier', 'Vos mains sont devenues des armes.', { spdFlat: 1, dodgeFlat: 2, atkPct: .02 }],
 ['gun', 'Gâchette facile', 'La poudre ne ment jamais.', { critFlat: 2, precFlat: 4 }]
].forEach(([c, n, d, e]) => N_('tw_' + c, n, 'armes', 1, d, [g_('wb_' + c, 60, `combats gagnés avec ${CAT_NAME[c].toLowerCase()}`)], e));

/* --- Armures --- */
N_('ta_heavy', 'Cuirassé', 'armures', 1, 'Le poids de l’acier est devenu une seconde nature.', [g_('aw_heavy', 50, 'combats gagnés en plastron lourd')], { defPct: .05, dmgTakenPct: -.02 });
N_('ta_light', 'Silhouette agile', 'armures', 1, 'Le cuir léger ne freine pas vos mouvements.', [g_('aw_light', 50, 'combats gagnés en cuirasse légère')], { dodgeFlat: 3, spdFlat: 1 });
N_('ta_cloth', 'Étoffe de mage', 'armures', 1, 'La soie des robes vibre au rythme de votre mana.', [g_('aw_cloth', 50, 'combats gagnés en robe')], { mpPct: .05, skillPct: .03 });
N_('ta_naked', 'Corps nu', 'armures', 2, 'Qui a besoin de plastron quand on a du courage ?', [g_('nakedWins', 15, 'combats gagnés sans plastron')], { hpPct: .05, dodgeFlat: 2 });
N_('ta_set', 'Panoplie maîtrisée', 'armures', 2, 'Quatre pièces d’un même ensemble résonnent en harmonie.', [g_('setWins', 30, 'combats gagnés avec 4 pièces d’un ensemble')], { allPct: .02, defPct: .02 });
N_('ta_legend', 'Porteur de légende', 'armures', 3, 'Des objets légendaires vous reconnaissent pour maître.', [g_('legendWins', 40, 'combats gagnés avec un objet Légendaire ou mieux')], { lootLuck: .05, atkPct: .02 });

/* --- Combat --- */
N_('tc_crit500', 'Frappe chirurgicale', 'combat', 2, 'Vos coups critiques sont un art.', [g_('crits', 500, 'coups critiques')], { critDmg: .12 });
N_('tc_killcrit', 'Coup fatal', 'combat', 1, 'Vous achevez d’un trait de génie.', [g_('killsCrit', 100, 'ennemis achevés par un critique')], { critFlat: 2, critDmg: .05 });
N_('tc_bourreau', 'Bourreau', 'combat', 2, 'Le Finisseur n’a plus de secret pour vous.', [g_('finishers', 50, 'Finisseurs réussis')], { finTh: .05, critDmg: .1 });
N_('tc_k100', 'Chasseur', 'combat', 0, 'Cent victimes, et ce n’est que le début.', [g_('kills', 100, 'ennemis vaincus')], { atkPct: .02 });
N_('tc_k500', 'Massacreur', 'combat', 1, 'Cinq cents vaincus. On commence à vous craindre.', [g_('kills', 500, 'ennemis vaincus')], { atkPct: .03, xpPct: .02 });
N_('tc_k2000', 'Fléau', 'combat', 3, 'Deux mille morts sur la route.', [g_('kills', 2000, 'ennemis vaincus')], { atkPct: .04, goldPct: .03 });
N_('tc_elite', 'Briseur d’élites', 'combat', 2, 'Les alphas tombent devant vous.', [g_('killsElite', 25, 'élites vaincus')], { dmgBossPct: .05 });
N_('tc_dmg', 'Force de la nature', 'combat', 2, 'Cent mille points de dégâts infligés.', [g_('dmgDealt', 100000, 'dégâts infligés')], { atkPct: .03 });
N_('tc_basic', 'Maître du geste simple', 'combat', 1, 'Pas besoin de sorts quand l’attaque de base suffit.', [g_('killsBasic', 150, 'ennemis vaincus par une attaque normale')], { atkPct: .03 });
N_('tc_streak', 'Implacable', 'combat', 3, 'Cent victimes sans jamais reculer.', [g_('streakBest', 100, 'victimes d’affilée sans fuir')], { atkPct: .03, critFlat: 2 });
N_('tc_fast', 'Foudroyant', 'combat', 2, 'Le combat se termine avant d’avoir pris forme.', [g_('fastWins', 50, 'victoires en 3 tours ou moins')], { spdFlat: 3 });
N_('tc_oneshot', 'Coup unique', 'combat', 2, 'Un seul coup suffit à terrasser un ennemi entier.', [g_('oneShots', 10, 'ennemis tués d’un seul coup à pleine vie')], { critDmg: .1 });

/* --- Magie --- */
[['fire', 'Pyromancien', 'Le feu vous obéit.', { skillPct: .04, hitBurn: .05 }], ['ice', 'Cryomancien', 'Le gel est votre allié.', { skillPct: .04, hitFreeze: .03 }],
 ['shock', 'Invocateur d’orages', 'La foudre frappe où vous le décidez.', { skillPct: .04, spdFlat: 1 }], ['holy', 'Lumière vengeresse', 'Le sacré purifie, et châtie.', { skillPct: .04, healPct: .04 }],
 ['dark', 'Seigneur des ombres', 'Les ténèbres sont votre royaume.', { skillPct: .04, lifesteal: .01 }], ['poison', 'Alchimiste toxique', 'Le poison est un art patient.', { skillPct: .03, dotPct: .1 }],
 ['arcane', 'Arcaniste', 'L’arcane pure, sans fioriture.', { skillPct: .04, mpPct: .03 }]
].forEach(([el, n, d, e]) => N_('tm_' + el, n, 'magie', 2, d, [g_('ek_' + el, 60, `ennemis vaincus par ${ELEM[el][0].toLowerCase()}`)], e));
N_('tm_skills', 'Lanceur', 'magie', 1, 'Plus de compétences que d’attaques normales dans votre vie.', [g_('killsSkill', 150, 'ennemis vaincus par une compétence')], { skillPct: .03 });
N_('tm_pure', 'Pur lanceur', 'magie', 2, 'Gagner sans jamais frapper : seulement des compétences.', [g_('skillOnlyWins', 15, 'combats gagnés uniquement avec des compétences')], { skillPct: .04, mpRegen: 1 });
N_('tm_mana', 'Source tarie', 'magie', 2, 'Vous avez brûlé bien des réserves de mana.', [g_('manaSpent', 5000, 'mana dépensé')], { mpPct: .05 });
N_('tm_aoe', 'Tempête', 'magie', 2, 'Vos sorts de zone balaient les rangs.', [g_('aoeUses', 40, 'compétences de zone lancées')], { skillPct: .03, critFlat: 1 });
N_('tm_virtuose', 'Virtuose', 'magie', 3, 'Cinq cents compétences lancées.', [g_('skillsUsed', 500, 'compétences utilisées')], { skillPct: .05, mpRegen: 2 });

/* --- Invocation --- */
N_('ti_legion', 'Légion', 'invocation', 2, 'Vos serviteurs ont fait leurs preuves.', [g_('summonKills', 40, 'ennemis vaincus par vos invocations')], { summonPct: .1 });
N_('ti_cmd', 'Commandant', 'invocation', 2, 'Vous menez vos créatures au combat.', [g_('summonsUsed', 60, 'invocations lancées')], { summonPct: .1, mpPct: .03 });
N_('ti_triple', 'Triumvirat', 'invocation', 3, 'Trois invocations au même instant.', [g_('tripleSummon', 5, 'fois 3 invocations simultanées')], { summonPct: .15, onKillMp: 2 });
N_('ti_necro', 'Nécromant accompli', 'invocation', 3, 'Cent rituels, cent légions.', [g_('summonsUsed', 150, 'invocations lancées')], { summonPct: .15 });
N_('ti_dmg', 'Armée dévastatrice', 'invocation', 2, 'Vos invocations ont infligé 5 000 dégâts.', [g_('summonDmg', 5000, 'dégâts infligés par les invocations')], { summonPct: .1, atkPct: .02 });
N_('ti_flawless', 'Général prudent', 'invocation', 3, 'Vos troupes combattent, vous restez intact.', [g_('summonFlawless', 5, 'combats gagnés sans dégât avec une invocation active')], { dmgTakenPct: -.03, summonPct: .1 });

/* --- Défense --- */
N_('td_guard', 'Garde ferme', 'defense', 1, 'Vous savez parer au bon moment.', [g_('defends', 100, 'défenses')], { defendBonus: .06 });
N_('td_wall', 'Mur', 'defense', 2, 'Cinq mille dégâts arrêtés par votre garde.', [g_('blocked', 5000, 'dégâts évités en vous défendant')], { defPct: .04, defendBonus: .04 });
N_('td_tank', 'Encaisseur', 'defense', 2, 'Vous avez encaissé des coups qui auraient dû vous coucher.', [g_('bigHits', 10, 'coups à plus de 50 % de vos PV encaissés')], { hpPct: .04, dmgTakenPct: -.02 });
N_('td_dance', 'Danseur', 'defense', 2, 'Six esquives consécutives : une chorégraphie.', [g_('dodgeStreakBest', 6, 'esquives consécutives (record)')], { dodgeFlat: 3 });
N_('td_riposte', 'Riposteur', 'defense', 2, 'Chaque coup reçu mérite une réponse.', [g_('counters', 25, 'contre-attaques')], { critFlat: 2, atkPct: .02 });
N_('td_thorns', 'Hérisson', 'defense', 2, 'Qui vous frappe se blesse.', [g_('thornsDmg', 1500, 'dégâts renvoyés')], { thorns: .1 });
N_('td_bastion', 'Bastion', 'defense', 2, 'Vos défenses tiennent tout un combat.', [g_('defendWins', 30, 'combats gagnés en vous défendant 5 fois ou plus')], { defPct: .04, hpPct: .03 });
N_('td_shield', 'Sous protection', 'defense', 1, 'Les boucliers vous ont sauvé la mise.', [g_('shieldAbs', 3000, 'dégâts absorbés par des boucliers')], { dmgTakenPct: -.03 });
N_('td_dodge300', 'Maître de l’esquive', 'defense', 2, 'Trois cents coups évités.', [g_('dodges', 300, 'esquives réussies')], { dodgeFlat: 4, spdFlat: 1 });

/* --- Survie --- */
N_('ts_lowhp', 'Funambule du trépas', 'survie', 2, 'Dix victoires aux portes de la mort.', [g_('lowHpWins', 10, 'victoires avec moins de 10 % de PV')], { hpPct: .05, regenPost: .03 });
N_('ts_potion', 'Alchimiste vivant', 'survie', 2, 'Cent potions bues.', [g_('potions', 100, 'potions utilisées')], { potionPct: .2 });
N_('ts_healed', 'Soins infinis', 'survie', 2, 'Vingt mille PV rendus.', [g_('healed', 20000, 'PV récupérés')], { healPct: .08, regenPost: .02 });
N_('ts_nopot', 'Sans filet', 'survie', 3, 'Un boss vaincu sans une seule potion.', [g_('noPotionBoss', 1, 'boss vaincu sans potion')], { hpPct: .03, healPct: .05 });
N_('ts_clean', 'Sans une égratignure', 'survie', 4, 'Un boss tombé sans vous toucher.', [g_('bossFlawless', 1, 'boss vaincu sans subir de dégâts')], { dodgeFlat: 3, dmgTakenPct: -.03 });
N_('ts_marathon', 'Marathonien', 'survie', 2, 'Des combats interminables, mais vous tenez.', [g_('longWins', 5, 'combats de 15 tours ou plus gagnés')], { regenTurn: .01, hpPct: .03 });
N_('ts_angel', 'Ange gardien', 'survie', 3, 'Quinze fois la mort vous a ratée de peu.', [g_('lastStands', 15, 'coups fatals évités')], { hpPct: .04, defendBonus: .05 });
N_('ts_edge', 'Au bord du gouffre', 'survie', 3, 'Un donjon achevé avec moins de 5 % de PV.', [g_('dungLowHp', 1, 'donjon terminé sous 5 % de PV')], { regenPost: .05, deathMit: .15 });
N_('ts_ascete', 'Ascète des donjons', 'survie', 3, 'Un donjon entier sans la moindre potion.', [g_('dungNoPotion', 1, 'donjon terminé sans potion')], { hpPct: .03, regenPost: .03 });
N_('ts_tried', 'Éprouvé', 'survie', 2, 'Cent altérations subies.', [g_('statusTaken', 100, 'altérations subies')], { sresFlat: 8, hpPct: .02 });
N_('ts_immune', 'Immunisé', 'survie', 3, 'Dix victoires sous trois altérations ou plus.', [g_('cursedWins', 10, 'victoires sous 3 altérations')], { sresFlat: 10, defPct: .03 });
N_('ts_phoenix', 'Phénix', 'survie', 3, 'Vingt défaites ont forgé votre résilience.', [g_('deaths', 20, 'défaites subies')], { deathMit: .2, hpPct: .04 });

/* --- Exploration --- */
N_('te_arp', 'Arpenteur', 'exploration', 1, 'Trois cents explorations.', [g_('explorations', 300, 'explorations')], { xpPct: .03, spdFlat: 1 });
N_('te_night', 'Veilleur nocturne', 'exploration', 2, 'Cent explorations en zone nocturne.', [g_('nightExp', 100, 'explorations de nuit')], { nightAtk: .06, critFlat: 2 });
N_('te_day', 'Marcheur du jour', 'exploration', 1, 'Cent explorations à la lumière.', [g_('dayExp', 100, 'explorations en zone diurne')], { regenPost: .02, xpPct: .02 });
N_('te_chests', 'Pilleur de coffres', 'exploration', 2, 'Cinquante coffres ouverts.', [g_('chests', 50, 'coffres ouverts')], { goldPct: .05, lootLuck: .04 });
N_('te_eagle', 'Œil de rapace', 'exploration', 2, 'Vingt-cinq coffres cachés trouvés.', [g_('hiddenChests', 25, 'coffres cachés découverts')], { lootLuck: .06 });
N_('te_mimic', 'Méfiant', 'exploration', 2, 'Cinq mimiques tuées : vous ne vous faites plus avoir.', [g_('k_mimique', 5, 'mimiques vaincues')], { dmgTakenPct: -.02, goldPct: .03 });
N_('te_traps', 'Habitué des pièges', 'exploration', 1, 'Dix pièges déclenchés. Vous avez appris.', [g_('trapsHit', 10, 'pièges déclenchés')], { hpPct: .03, sresFlat: 4 });
[['plaines', 'Arpenteur des Plaines', { hpPct: .02 }], ['foret', 'Gardien de la Forêt', { regenPost: .02 }], ['marais', 'Enfant du Marais', { sresFlat: 6 }],
 ['montagne', 'Alpiniste des Cendres', { defPct: .03 }], ['cimetiere', 'Veilleur des Morts', { resDark: .1 }], ['abysses', 'Explorateur des Abysses', { critFlat: 2, lootLuck: .03 }]
].forEach(([z, n, e]) => N_('tz_' + z, n, 'exploration', 2, `Chaque recoin de ${ZONE(z).n} vous est connu.`, [g_('zx_' + z, 100, `% d’exploration de ${ZONE(z).n}`)], e));
[['herb', 'Herboriste', 80, { potionPct: .1 }], ['ore', 'Mineur', 80, { defPct: .02, upgBonus: .03 }], ['hide', 'Dépeceur', 60, { dodgeFlat: 1, goldPct: .02 }], ['bone', 'Fossoyeur', 40, { dotPct: .08 }],
 ['crystal', 'Cristallier', 40, { mpPct: .03, upgBonus: .03 }], ['ember', 'Braconnier de braise', 40, { hitBurn: .03 }], ['ecto', 'Chasseur de spectres', 40, { resDark: .08 }], ['star', 'Chercheur d’étoiles', 15, { lootLuck: .04 }]
].forEach(([m, n, k, e]) => N_('tr_' + m, n, 'exploration', 1, `Vous avez récolté ${MATS[m][0].toLowerCase()} en quantité.`, [g_('m_' + m, k, `${MATS[m][0].toLowerCase()} récolté(e)`)], e));

/* --- Artisanat --- */
N_('tk_craft', 'Maître-forgeron', 'artisanat', 2, 'Vingt-cinq équipements sortis de votre atelier.', [g_('crafted', 25, 'équipements fabriqués')], { upgBonus: .05 });
N_('tk_upg', 'Orfèvre', 'artisanat', 2, 'Cinquante améliorations réussies.', [g_('upgrades', 50, 'améliorations réussies')], { upgBonus: .06, atkPct: .01 });
N_('tk_max', 'Perfection', 'artisanat', 4, 'Un objet poussé à +10.', [g_('upMax', 1, 'objet amélioré à +10')], { allPct: .02, upgBonus: .05 });
N_('tk_dism', 'Recycleur', 'artisanat', 1, 'Rien ne se perd.', [g_('dismantled', 50, 'objets démontés')], { upgBonus: .03, goldPct: .02 });
N_('tk_brew', 'Apothicaire', 'artisanat', 1, 'Trente préparations alchimiques.', [g_('brewed', 30, 'consommables fabriqués')], { potionPct: .15 });
N_('tk_epic', 'Chef-d’œuvre', 'artisanat', 3, 'Une pièce épique (ou mieux) sortie de l’établi.', [g_('craftEpic', 1, 'équipement Épique+ fabriqué')], { upgBonus: .05, lootLuck: .03 });
N_('tk_master', 'Artisan maître', 'artisanat', 3, 'Cinq pièces de qualité Maître.', [g_('craftMaster', 5, 'fabrications de qualité Maître')], { upgBonus: .08, allPct: .01 });

/* --- Économie --- */
N_('tx_rich', 'Banquier', 'economie', 2, 'Cinquante mille pièces gagnées.', [g_('goldEarned', 50000, 'or gagné')], { goldPct: .08 });
N_('tx_spend', 'Dépensier', 'economie', 1, 'Cinq mille pièces dépensées chez les marchands.', [g_('goldSpent', 5000, 'or dépensé')], { shopDisc: .04 });
N_('tx_buy', 'Client fidèle', 'economie', 1, 'Trente achats : les marchands vous connaissent.', [g_('bought', 30, 'achats effectués')], { shopDisc: .05 });
N_('tx_sell', 'Brocanteur', 'economie', 1, 'Cent cinquante objets vendus.', [g_('sold', 150, 'objets vendus')], { goldPct: .04 });
N_('tx_hold', 'Thésauriseur', 'economie', 2, 'Dix mille pièces en poche.', [g_('gold', 10000, 'or possédé')], { goldPct: .03, lootLuck: .02 });
N_('tx_rare', 'Œil pour l’éclat', 'economie', 2, 'Vingt-cinq objets rares ou mieux.', [g_('rareDrops', 25, 'objets Rares+ obtenus')], { lootLuck: .06 });
N_('tx_leg', 'Collectionneur légendaire', 'economie', 3, 'Trois objets légendaires (ou mieux) trouvés.', [g_('legFound', 3, 'objets Légendaires+ trouvés')], { lootLuck: .08, goldPct: .03 });
N_('tx_myth', 'Touché par le mythe', 'economie', 4, 'Un objet mythique entre vos mains.', [g_('mythFound', 1, 'objet Mythique+ trouvé')], { lootLuck: .1, allPct: .01 });

/* --- Réputation (une carrière par faction + conflits) --- */
Object.keys(FACTIONS).forEach(f => {
  const nm = FACTIONS[f][0];
  const eff1 = { couronne: { defPct: .02, shopDisc: .02 }, cercle: { mpPct: .04 }, ombres: { critFlat: 2, goldPct: .03 }, sylve: { regenPost: .02, resPoison: .08 } }[f];
  const eff2 = { couronne: { hpPct: .04, dmgTakenPct: -.02 }, cercle: { skillPct: .05 }, ombres: { critDmg: .1, dodgeFlat: 2 }, sylve: { healPct: .06, regenPost: .02 } }[f];
  N_('tp_' + f + '1', `Honoré par ${nm}`, 'reputation', 2, 'Votre nom est respecté.', [g_('rep_' + f, 100, `réputation ${nm}`)], eff1);
  N_('tp_' + f + '2', `Allié de ${nm}`, 'reputation', 3, 'Vous faites désormais partie de la maison.', [g_('rep_' + f, 200, `réputation ${nm}`)], eff2);
  N_('tp_' + f + 'n', `Mal-aimé de ${nm}`, 'reputation', 1, 'Vous vous êtes fait un ennemi.', [g_('repneg_' + f, 50, `méfiance envers ${nm}`)], { dodgeFlat: 2, sresFlat: 4 });
});
N_('tp_multi', 'Diplomate polyglotte', 'reputation', 3, 'Deux factions vous honorent.', [g_('factionsHonored', 2, 'factions qui vous honorent')], { shopDisc: .05, xpPct: .03 });
N_('tp_all', 'Ami de tous', 'reputation', 4, 'Quatre factions vous honorent.', [g_('factionsHonored', 4, 'factions qui vous honorent')], { allPct: .02, shopDisc: .08 });

/* --- Boss --- */
const BOSS_TRAIT = { gobelin_roi: 'Terreur de Grimgut', araignee_reine: 'Fléau de Shéléa', sorciere: 'Briseur de maléfices', golem_magma: 'Éteigneur de lave', liche: 'Fossoyeur de la Liche', dragon: 'Tueur de dragon', devoreur: 'Vainqueur du Dévoreur' };
const BOSS_EFF = { gobelin_roi: { atkPct: .02 }, araignee_reine: { resPoison: .1, dodgeFlat: 1 }, sorciere: { sresFlat: 6, resDark: .08 }, golem_magma: { defPct: .03, resFire: .1 }, liche: { resDark: .1, lifesteal: .01 }, dragon: { dmgBossPct: .05, resIce: .1 }, devoreur: { allPct: .02, dmgBossPct: .04 } };
Object.keys(BOSSES).forEach(id => N_('tb_' + id, BOSS_TRAIT[id], 'boss', 3, `Vous avez abattu ${BOSSES[id].n}.`, [g_('bk_' + id, 1, `${BOSSES[id].n} vaincu`)], BOSS_EFF[id]));
N_('tb_fast', 'Exécuteur de boss', 'boss', 3, 'Un boss tombé en 4 tours ou moins.', [g_('bossFast', 1, 'boss vaincu en 4 tours ou moins')], { dmgBossPct: .08, spdFlat: 2 });
N_('tb_fin', 'Coup de grâce royal', 'boss', 3, 'Trois boss achevés d’un Finisseur.', [g_('bossFinisher', 3, 'boss achevés par un Finisseur')], { finTh: .05, critDmg: .1 });
N_('tb_hunter', 'Chasseur de boss', 'boss', 3, 'Vingt boss vaincus.', [g_('killsBoss', 20, 'boss vaincus')], { dmgBossPct: .08, lootLuck: .04 });

/* --- Donjons --- */
N_('tdj_10', 'Explorateur de donjons', 'donjons', 1, 'Dix donjons terminés.', [g_('dungeonsDone', 10, 'donjons terminés')], { xpPct: .03 });
N_('tdj_30', 'Vétéran des donjons', 'donjons', 2, 'Trente donjons terminés.', [g_('dungeonsDone', 30, 'donjons terminés')], { xpPct: .03, lootLuck: .03 });
N_('tdj_100', 'Maître des donjons', 'donjons', 3, 'Cent donjons terminés.', [g_('dungeonsDone', 100, 'donjons terminés')], { xpPct: .04, lootLuck: .05 });
N_('tdj_hard', 'Téméraire', 'donjons', 2, 'Cinq donjons terminés en difficile ou plus.', [g_('dungHard', 5, 'donjons Difficile+ terminés')], { atkPct: .02, defPct: .02 });
N_('tdj_flaw', 'Donjon parfait', 'donjons', 4, 'Un donjon entier sans subir un seul dégât.', [g_('dungFlawless', 1, 'donjon sans aucun dégât')], { dodgeFlat: 3, allPct: .01 });
N_('tdj_night', 'Cauchemar maîtrisé', 'donjons', 4, 'Cinq donjons terminés en Cauchemar.', [g_('dungNight', 5, 'donjons Cauchemar terminés')], { hpPct: .04, dmgBossPct: .05 });

/* --- Événements --- */
N_('tv_10', 'Curieux', 'evenements', 1, 'Dix événements vécus.', [g_('events', 10, 'événements vécus')], { xpPct: .02 });
N_('tv_50', 'Voyageur du destin', 'evenements', 2, 'Cinquante rencontres, autant d’histoires.', [g_('events', 50, 'événements vécus')], { xpPct: .03, lootLuck: .03 });
N_('tv_ruth', 'Impitoyable', 'evenements', 1, 'Cinq choix cruels.', [g_('ruthless', 5, 'choix cruels')], { critDmg: .06, goldPct: .03 });
N_('tv_ruth2', 'Sans scrupules', 'evenements', 3, 'Quinze choix cruels : plus de retour en arrière.', [g_('ruthless', 15, 'choix cruels')], { atkPct: .03, critFlat: 2, healPct: -.05 });
N_('tv_kind', 'Âme noble', 'evenements', 2, 'Quinze actes de bonté.', [g_('kind', 15, 'choix altruistes')], { healPct: .06, regenPost: .02 });
N_('tv_luck', 'Sourire du sort', 'evenements', 3, 'Cinq issues improbables en votre faveur.', [g_('rareOutcomes', 5, 'issues improbables obtenues')], { lootLuck: .06, critFlat: 1 });
N_('tv_fight', 'Provocateur', 'evenements', 1, 'Cinq événements qui ont fini en combat.', [g_('evFights', 5, 'événements tournés en combat')], { spdFlat: 1, atkPct: .01 });
N_('tv_choice', 'Décideur', 'evenements', 2, 'Trente décisions prises.', [g_('choices', 30, 'décisions prises')], { xpPct: .02, shopDisc: .02 });

/* --- Quêtes --- */
[[3, 'Fil de l’histoire', 1, { xpPct: .02 }], [6, 'Champion de la campagne', 2, { xpPct: .03, atkPct: .02 }], [9, 'Sauveur du royaume', 4, { allPct: .03, xpPct: .03 }]].forEach(([k, n, r, e]) => N_('tq_main' + k, n, 'quetes', r, `${k} quêtes principales accomplies.`, [g_('qt_main', k, 'quêtes principales terminées')], e));
N_('tq_side5', 'Serviable', 'quetes', 1, 'Cinq quêtes secondaires.', [g_('qt_side', 5, 'quêtes secondaires terminées')], { goldPct: .03 });
N_('tq_side11', 'Bon à tout faire', 'quetes', 2, 'Onze quêtes secondaires.', [g_('qt_side', 11, 'quêtes secondaires terminées')], { goldPct: .04, xpPct: .02 });
N_('tq_day10', 'Régulier', 'quetes', 1, 'Dix objectifs quotidiens.', [g_('qt_daily', 10, 'objectifs quotidiens terminés')], { xpPct: .02 });
N_('tq_day30', 'Fidèle au poste', 'quetes', 2, 'Trente objectifs quotidiens.', [g_('qt_daily', 30, 'objectifs quotidiens terminés')], { xpPct: .03, goldPct: .03 });

/* --- Compagnons --- */
N_('tk2_b50', 'Équipe soudée', 'compagnons', 1, 'Cinquante combats côte à côte.', [g_('compBattles', 50, 'combats avec un compagnon actif')], { companionPct: .1 });
N_('tk2_b200', 'Compagnons d’armes', 'compagnons', 2, 'Deux cents combats côte à côte.', [g_('compBattles', 200, 'combats avec un compagnon actif')], { companionPct: .15, defPct: .02 });
N_('tk2_two', 'Meneur', 'compagnons', 1, 'Deux compagnons recrutés.', [g_('compCount', 2, 'compagnons recrutés')], { xpPct: .02 });
N_('tk2_four', 'Capitaine', 'compagnons', 3, 'Tous les compagnons actuels vous suivent.', [g_('compCount', 4, 'compagnons recrutés')], { companionPct: .15, allPct: .01 });
N_('tk2_bond', 'Lien indéfectible', 'compagnons', 3, 'Un lien de 100 avec un compagnon.', [g_('maxBond', 100, 'lien avec un compagnon')], { companionPct: .2, hpPct: .03 });
N_('tk2_talk', 'Confident', 'compagnons', 1, 'Quinze conversations.', [g_('compTalks', 15, 'discussions avec des compagnons')], { healPct: .03 });
N_('tk2_gift', 'Généreux', 'compagnons', 1, 'Huit cadeaux offerts.', [g_('compGifts', 8, 'cadeaux offerts')], { goldPct: -.0, xpPct: .02 });
N_('tk2_kill', 'Duo', 'compagnons', 2, 'Soixante ennemis vaincus par vos compagnons.', [g_('compKills', 60, 'ennemis vaincus par un compagnon')], { companionPct: .1, atkPct: .01 });
N_('tk2_heal', 'Soigné par un ami', 'compagnons', 2, 'Vingt-cinq soins prodigués par un compagnon.', [g_('compHeals', 25, 'soins de compagnon reçus')], { healPct: .05, regenPost: .02 });

/* --- Malédictions --- */
N_('tn_blade', 'Pacte de la lame', 'maudit', 3, 'Vingt-cinq victoires avec une arme maudite.', [g_('cursedWpnWins', 25, 'combats gagnés avec une arme maudite')], { atkPct: .04, lifesteal: .01, healPct: -.05 });
N_('tn_self', 'Sacrifice volontaire', 'maudit', 3, 'Vingt sorts payés de votre propre sang.', [g_('selfHarm', 20, 'sorts qui vous ont blessé')], { skillPct: .05, hpPct: -.03 });
N_('tn_pois', 'Veines empoisonnées', 'maudit', 2, 'Vingt victoires alors que le poison vous rongeait.', [g_('poisonedWins', 20, 'combats gagnés sous poison')], { resPoison: .2, sresFlat: 6 });

/* --- Traits cachés : plusieurs conditions, recette jamais dévoilée --- */
const H_ = (id, n, r, d, hint, goals, eff) => N_(id, n, 'secret', r, d, goals, eff, { hidden: true, hint });
H_('th_solo', 'Loup solitaire', 4, 'Vous n’avez besoin de personne.', 'Combattre seul, de préférence quand la nuit tombe.', [g_('soloWins', 60, 'combats gagnés seul'), g_('nightKills', 40, 'victimes nocturnes')], { atkPct: .04, critFlat: 3, dodgeFlat: 3 });
H_('th_shadowhunt', 'Chasseur d’ombres', 4, 'Rien n’échappe à votre vigilance.', 'Traquer les puissants dans l’obscurité, sans se faire toucher.', [g_('killsElite', 15, 'élites vaincus'), g_('nightKills', 60, 'victimes nocturnes'), g_('dodges', 150, 'esquives')], { critFlat: 3, dodgeFlat: 4, nightAtk: .08 });
H_('th_aesthete', 'Esthète du tranchant', 4, 'La beauté d’un coup parfait.', 'Un katana, des critiques, et l’art d’achever.', [g_('wb_katana', 40, 'victoires au katana'), g_('crits', 300, 'critiques'), g_('finishers', 15, 'Finisseurs')], { critDmg: .2, critFlat: 3 });
H_('th_madalch', 'Alchimiste fou', 3, 'Entre génie et folie.', 'Préparer, boire, empoisonner.', [g_('brewed', 40, 'préparations'), g_('potions', 60, 'potions bues'), g_('statusApplied', 100, 'altérations infligées')], { potionPct: .25, dotPct: .15 });
H_('th_silent', 'Gardien silencieux', 4, 'Il protège sans bruit.', 'Se défendre, épargner, ne jamais être touché.', [g_('defendWins', 20, 'combats défensifs'), g_('pacified', 8, 'apaisements'), g_('flawlessWins', 20, 'combats sans dégât')], { dmgTakenPct: -.05, defendBonus: .08, peaceBonus: .15 });
H_('th_voice', 'Voix du Cercle', 4, 'Les arcanes vous écoutent.', 'Lancer des sorts en servant le Cercle.', [g_('skillsUsed', 300, 'compétences'), g_('rep_cercle', 150, 'réputation Cercle'), g_('manaSpent', 3000, 'mana dépensé')], { skillPct: .08, mpPct: .06, mpRegen: 2 });
H_('th_ghost', 'Fantôme des donjons', 5, 'Vous traversez les donjons comme un souffle.', 'Des donjons parfaits, sans potion, aux difficultés croissantes.', [g_('dungFlawless', 2, 'donjons parfaits'), g_('dungNoPotion', 2, 'donjons sans potion'), g_('dungHard', 3, 'donjons Difficile+')], { dodgeFlat: 4, allPct: .02, firstStrike: true });
H_('th_forest', 'Âme de la forêt', 4, 'La forêt vous a adopté.', 'Épargner, cueillir, honorer la Sylve.', [g_('pacified', 15, 'apaisements'), g_('rep_sylve', 150, 'réputation Sylve'), g_('m_herb', 100, 'herbes récoltées')], { healPct: .08, regenPost: .04, resPoison: .15 });
H_('th_smuggler', 'Contrebandier', 4, 'Un pied dans l’ombre, un pied au marché.', 'Servir les Ombres, vendre beaucoup, ne pas avoir de scrupules.', [g_('rep_ombres', 150, 'réputation Ombres'), g_('sold', 80, 'objets vendus'), g_('ruthless', 8, 'choix cruels')], { goldPct: .08, lootLuck: .05, critFlat: 2 });
H_('th_chaos', 'Fils du chaos', 5, 'Le chaos vous reconnaît pour sien.', 'Se blesser en lançant des sorts, survivre aux malédictions, tenter sa chance.', [g_('selfHarm', 15, 'sorts douloureux'), g_('cursedWins', 5, 'victoires maudites'), g_('rareOutcomes', 3, 'issues improbables')], { skillPct: .08, critDmg: .15, extraTurn: .03 });

/* --- Légendaires --- */
N_('tl_arch', 'Archi-légende', 'maudit', 5, 'Sept boss, un siècle de gloire.', [g_('bossesDistinct', 7, 'boss différents vaincus'), g_('level', 100, 'niveau'), g_('traitsCount', 80, 'traits éveillés')], { allPct: .03, dmgBossPct: .08 });
N_('tl_100', 'Éveil total', 'maudit', 5, 'Cent traits éveillés.', [g_('traitsCount', 100, 'traits éveillés')], { allPct: .03, xpPct: .05 });
N_('tl_150', 'Maître absolu', 'maudit', 6, 'Cent cinquante traits : nul n’en a jamais autant.', [g_('traitsCount', 150, 'traits éveillés')], { allPct: .04, lootLuck: .08 });
N_('tl_250', 'Apogée vivante', 'maudit', 6, 'Le niveau maximal est atteint.', [g_('level', 250, 'niveau')], { allPct: .03, dmgBossPct: .06 });
N_('tl_k5000', 'Fléau des mondes', 'maudit', 5, 'Cinq mille ennemis vaincus.', [g_('kills', 5000, 'ennemis vaincus')], { atkPct: .04, critDmg: .1 });
N_('tl_par', 'Âme transcendante', 'maudit', 6, 'Vingt niveaux de Paragon.', [g_('paragonLevels', 20, 'niveaux de Paragon')], { allPct: .03, xpPct: .05 });

/* --- Synergies supplémentaires --- */
SYNERGIES.push(
  { ids: ['tm_fire', 'tm_ice'], n: 'Équilibre des extrêmes', d: '+6 % dégâts de compétence, +3 % chance d’altération', eff: { skillPct: .06, statusChance: .03 } },
  { ids: ['tw_dagger', 'esquiveur'], n: 'Lame insaisissable', d: '+3 % esquive, +3 % critique', eff: { dodgeFlat: 3, critFlat: 3 } },
  { ids: ['ta_heavy', 'td_wall'], n: 'Forteresse ambulante', d: '−4 % dégâts subis, +6 % défense', eff: { dmgTakenPct: -.04, defPct: .06 } },
  { ids: ['ti_legion', 'ti_triple'], n: 'Armée des morts', d: '+25 % puissance des invocations', eff: { summonPct: .25 } },
  { ids: ['tk_craft', 'tk_upg'], n: 'Légende de la forge', d: '+12 % réussite d’amélioration', eff: { upgBonus: .12 } },
  { ids: ['tx_rich', 'tx_hold'], n: 'Fortune assise', d: '+8 % or, +4 % butin', eff: { goldPct: .08, lootLuck: .04 } },
  { ids: ['tk2_b200', 'tk2_bond'], n: 'Inséparables', d: '+25 % puissance des compagnons', eff: { companionPct: .25 } },
  { ids: ['tp_couronne2', 'tp_ombres2'], n: 'Double jeu', d: '+5 % or, +4 % critique', eff: { goldPct: .05, critFlat: 4 } },
  { ids: ['tn_blade', 'maudit'], n: 'Lame et malédiction', d: '+6 % attaque, +2 % vol de vie', eff: { atkPct: .06, lifesteal: .02 } },
  { ids: ['ts_clean', 'tb_fast'], n: 'Chasseur chirurgical', d: '+10 % dégâts contre les boss', eff: { dmgBossPct: .10 } },
  { ids: ['tc_basic', 'tc_killcrit'], n: 'Simplicité mortelle', d: '+4 % attaque, +3 % critique', eff: { atkPct: .04, critFlat: 3 } },
  { ids: ['te_night', 'te_day'], n: 'Cycle complet', d: '+3 % XP, +2 % PV après combat', eff: { xpPct: .03, regenPost: .02 } }
);

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
      order: [], idx: 0, comp: { cd: 0 }, extra: false, summary: null, basicUsed: false, skillUsed: false, potionsUsed: 0, defCount: 0, dodgeStreak: 0, hadSummon: false, summonDmg: 0
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
    if (C.shield > 0 && dmg > 0) { const a = Math.min(C.shield, dmg); C.shield -= a; dmg -= a; bump('shieldAbs', a); this.log(`🛡 Le rempart absorbe ${a} dégâts.`, 'good'); }
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
    const cur = C.st[id]; C.st[id] = { t: Math.max(t, cur ? cur.t : 0), pow: Math.max(1, e.atk * .22) }; bump('statusTaken');
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
    if (chance(dodge)) { bump('dodges'); C.dodgeStreak++; G.c.dodgeStreakBest = Math.max(G.c.dodgeStreakBest || 0, C.dodgeStreak); this.log(`💨 Vous esquivez ${sk.n} de ${e.n} !`, 'good'); this.fx('p', 0, 'Esquive', 'miss'); return; }
    if (chance(.05)) raw *= 1.5;
    raw *= clamp(1 + (E.dmgTakenPct || 0), .25, 1.5);
    let fin = raw; if (C.defending) fin *= clamp(.5 - (E.defendBonus || 0), .2, .5);
    if (C.defending) bump('blocked', Math.max(0, Math.round(raw - fin)));
    C.dodgeStreak = 0;
    const dealt = this.damagePlayer(fin, raw);
    if (dealt >= S.maxHp * .5 && G.p.hp > 0) bump('bigHits');
    this.log(`${e.i} ${e.n} — ${sk.n} : −${dealt} PV${C.defending ? ' (garde)' : ''}`, 'hit');
    if (C.over) return;
    if (sk.drain && dealt > 0) { const h = Math.round(dealt * sk.drain); e.hp = Math.min(e.maxHp, e.hp + h); this.log(`🩸 ${e.n} draine ${h} PV.`); }
    if (sk.mpDrain) { const l = Player.restoreMp(-Math.round(S.maxMp * sk.mpDrain)); if (l) this.log(`🔻 ${e.n} aspire votre mana.`); }
    if (dealt > 0 || sk.m < 1) { if (sk.st) this.inflict(sk.st, e); if (sk.st2) this.inflict(sk.st2, e); }
    if (E.thorns && dealt > 0 && !e.dead) { const t = Math.max(1, Math.round(dealt * E.thorns)); bump('thornsDmg', t); this.log(`🌵 Épines : ${t} dégâts renvoyés.`); this.hurtEnemy(e, t, { by: 'thorns' }); }
    if (C.counter && dealt > 0 && !e.dead && !C.over) { bump('counters'); this.log('↩ Contre-attaque !', 'good'); this.strike(e, C.counter.m, {}); }
  },
  estimate(e) {
    const sk = ESK[e.intent] || ESK.strike; if (sk.m === undefined) return 0;
    const S = Stats.get(); return Math.round(e.atk * (1 + e.buffAtk) * sk.m * mitig(S.def * (1 + this.buff('def')), S.lvl));
  },

  /* --- Dégâts infligés par le joueur --- */
  hurtEnemy(e, dmg, o = {}) {
    dmg = Math.max(1, Math.round(dmg)); if (e.hp === e.maxHp && dmg >= e.maxHp && o.by === 'player') bump('oneShots'); e.hp -= dmg; bump('dmgDealt', dmg);
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
    const dmg = this.hurtEnemy(e, raw, { crit, by: 'player', el: o.el || 'phys', skill: !!o.skill, fin: !!o.fin });
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
    if (o.by === 'summon') bump('summonKills'); if (o.by === 'ally') bump('compKills');
    if (o.by === 'player') { if (o.el) bump('ek_' + o.el); if (o.skill) bump('killsSkill'); else bump('killsBasic'); if (o.crit) bump('killsCrit'); if (o.fin && e.boss) bump('bossFinisher'); }
    if (o.by === 'player' && G.eq.weapon && G.eq.weapon.cat) { G.c.wcats = G.c.wcats || {}; G.c.wcats[G.eq.weapon.cat] = 1; }
    if (E.onKillMp) Player.restoreMp(E.onKillMp);
  },

  /* --- Phase des alliés (invocations + compagnon) --- */
  allyPhase() {
    const C = this.C, S = Stats.get(), E = Stats.sum();
    for (const s of C.summons) {
      if (C.over || s.t <= 0) continue; const e = this.tgtAny(); if (!e) break;
      const d = S.atk * s.pow * (1 + (E.summonPct || 0)) * rnd(.9, 1.1) * mitig(e.def, e.lvl);
      this.log(`💀 ${s.n} attaque ${e.n}.`); bump('summonDmg', Math.round(d)); this.hurtEnemy(e, d, { by: 'summon' }); s.t--;
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
  attack() { if (!this.ready()) return; this.C.basicUsed = true; this.strike(this.tgt(), 1, {}); this.finishAction(); },
  defend() {
    if (!this.ready()) return; const C = this.C, S = Stats.get();
    C.defending = true; C.defCount++; bump('defends'); const m = Player.restoreMp(S.maxMp * .08);
    this.log(`🛡 Vous vous mettez en garde (dégâts réduits)${m ? `, +${m} mana` : ''}.`, 'good'); this.finishAction();
  },
  skill(id) {
    if (!this.ready()) return; const C = this.C, d = SK[id];
    if (!d || d.type !== 'active' || !(G.sk[id] > 0)) return;
    if (C.cd[id] > 0) { Hooks.toast('Compétence en recharge.', 'bad'); return; }
    const cost = Skills.cost(id); if (G.p.mp < cost) { Hooks.toast('Mana insuffisant.', 'bad'); return; }
    const rank = G.sk[id], aug = G.aug[id], S = Stats.get(), E = Stats.sum(), f = d.fx;
    G.p.mp -= cost; bump('manaSpent', cost); C.skillUsed = true; if (f.aoe) bump('aoeUses'); if (f.selfDmg) bump('selfHarm');
    const cd = Skills.cdOf(id); C.cd[id] = cd > 0 ? cd + 1 : 0;
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
        bump('summonsUsed'); C.hadSummon = true; if (C.summons.length >= 3) bump('tripleSummon'); this.log(`💀 ${f.cnt > 1 ? f.cnt + ' ' + f.n + 's' : 'Un ' + f.n.toLowerCase()} surgit${f.cnt > 1 ? 'ssent' : ''} du sol !`, 'good'); break;
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
    this.strike(e, 2.6, { sure: true, crit: true, fin: true }); this.finishAction();
  },
  useItem(id) {
    if (!this.ready() || (G.cons[id] || 0) <= 0) return; const C = this.C, S = Stats.get(), E = Stats.sum(), c = CONS[id];
    if (id === 'potion_hp' || id === 'potion_hp2') { const h = Player.heal(S.maxHp * c.f * (1 + (E.potionPct || 0) + (E.healPct || 0))); this.log(`🧪 ${c.n} : +${h} PV.`, 'good'); this.fx('p', 0, '+' + h, 'heal'); bump('potions'); C.potionsUsed++; if (Dungeon.D) Dungeon.D.potions++; }
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
      if (chance(e.tier === 'boss' ? 1 : e.tier === 'elite' ? .75 : .17)) items.push(genItem({ ilvl: e.lvl + (e.boss ? 2 : 0), luck: E.lootLuck || 0, minR: e.boss ? 2 : e.tier === 'elite' ? 1 : 0, boss: e.boss }));
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
    const wc = G.eq.weapon && G.eq.weapon.cat; if (wc) bump('wb_' + wc);
    const ch = G.eq.chest; if (!ch) bump('nakedWins'); else bump({ 'Plastron': 'aw_heavy', 'Cuirasse légère': 'aw_light', 'Robe': 'aw_cloth' }[ch.base] || 'aw_other');
    const setN = {}; for (const sl of EQ_SLOTS) { const it = G.eq[sl]; if (it && it.set) setN[it.set] = (setN[it.set] || 0) + 1; }
    if (Object.values(setN).some(n => n >= 4)) bump('setWins');
    if (Object.values(G.eq).some(i => i && i.r >= 4)) bump('legendWins');
    if (G.eq.weapon && G.eq.weapon.kind === 'maudite') bump('cursedWpnWins');
    if (!G.active && !C.hadSummon) bump('soloWins'); if (G.active) bump('compBattles');
    if (C.skillUsed && !C.basicUsed) bump('skillOnlyWins'); if (C.defCount >= 5) bump('defendWins'); if (C.round >= 15) bump('longWins');
    if (C.st.poison) bump('poisonedWins'); if (C.summons.length && C.dmgTaken === 0) bump('summonFlawless');
    if (C.enemies.some(e => e.boss)) { if (C.dmgTaken === 0) bump('bossFlawless'); if (!C.potionsUsed) bump('noPotionBoss'); if (C.round <= 4) bump('bossFast'); }
    if (Dungeon.D) { Dungeon.D.dmg += C.dmgTaken; Dungeon.D.minHp = Math.min(Dungeon.D.minHp, C.minHpPct); }
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
    G.seenEv[evId] = (G.seenEv[evId] || 0) + 1; bump('choices'); bump('events');
    const o = wpick(ch.out, x => x.p), d = o.do, lines = []; if (ch.out.length > 1 && o.p <= .35) bump('rareOutcomes'); if (d.fight) bump('evFights');
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
    zs.ex = Math.min(100, zs.ex + 4); bump('explorations'); bump(Z.night ? 'nightExp' : 'dayExp'); Player.heal(S.maxHp * .02);
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
      if (r === 0) { bump('trapsHit'); const d = Math.max(1, Math.min(G.p.hp - 1, Math.round(S.maxHp * rnd(.08, .18)))); G.p.hp -= d; res = { msg: `🪤 Un piège se referme sur vous : −${d} PV.` }; }
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
    this.D = { id, diff, stage: 0, dmg: 0, minHp: 1, potions: 0 }; G.flags.dungeon = id; this.next();
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
    bump('dungeonsDone'); if (D.diff >= 1) bump('dungHard'); if (D.dmg === 0) bump('dungFlawless'); if (D.minHp < .05) bump('dungLowHp'); if (!D.potions) bump('dungNoPotion');
    const g = Math.round(B.lvl * 40 * df.rew * (peace ? .5 : 1) * (1 + (E.goldPct || 0))); Player.gold(g); lines.push(`+${fmt(g)} or`);
    const n = peace ? 1 : 1 + D.diff + (first ? 1 : 0);
    for (let i = 0; i < n; i++) { const it = genItem({ ilvl: B.lvl + df.off + 2, minR: 2 + D.diff, luck: (E.lootLuck || 0) + .1 * D.diff, boss: true }); Inv.add(it, 'drop'); lines.push(`Butin : ${it.name} (${RARITIES[it.r].n})`); }
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
    c.talk = today(); c.bond += 3; bump('compTalks'); const L = COMPS[id].lines; Game.sync();
    return L[c.bond >= 60 ? 2 : c.bond >= 20 ? 1 : 0];
  },
  gift(id) {
    const c = G.comp[id], cost = G.p.lvl * 20; if (!c || G.p.gold < cost) return false;
    G.p.gold -= cost; c.bond += 5; bump('compGifts'); Game.sync(); return true;
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
      else if (sk.k === 'heal') { const h = Player.heal(S.maxHp * sk.m * (1 + (E.healPct || 0))); bump('compHeals'); Combat.log(`✚ ${d.n} — ${sk.n} : +${h} PV.`, 'ally'); Combat.fx('p', 0, '+' + h, 'heal'); }
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
    const E = Stats.sum(), it = genItem({ ilvl: G.p.lvl + q, slot, luck: QUAL[q].luck + (E.upgBonus || 0) * 2, minR: QUAL[q].minR, noCat: true });
    Inv.add(it, 'craft'); bump('crafted'); if (it.r >= 3) bump('craftEpic'); if (q === 2) bump('craftMaster'); Game.sync(); return it;
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
      it.up++; res.ok = true; res.msg = `Succès ! ${it.name} passe à +${it.up}.`; bump('upgrades'); if (it.up === 10) bump('upMax');
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
    G.p.gold -= p; bump('goldSpent', p); bump('bought');
    G.shop.items = G.shop.items.filter(x => x.id !== id); G.shop.rare = (G.shop.rare || []).filter(x => x.id !== id);
    Inv.add(it, 'shop'); Game.sync(); return true;
  },
  consPrice(id) { return Math.round(CONS[id].price * (1 + G.p.lvl * .08) * (1 - clamp(Stats.sum().shopDisc || 0, 0, .5))); },
  buyCons(id) { const p = this.consPrice(id); if (G.p.gold < p) return false; G.p.gold -= p; bump('goldSpent', p); G.cons[id] = (G.cons[id] || 0) + 1; Game.sync(); return true; }
};

/* ---------- 10. INTERFACE ---------- */
const U = { screen: 'title', tab: 'town', zone: 'plaines', sel: null, invF: 'all', traitCat: 'all', craftTab: 'forge', shopTab: 'forge', cmenu: null, exLog: [], cr: { name: '', portrait: 0, sex: 'x', origin: 'aldra', bg: 'orphelin', diff: 'normal', cls: 'guerrier', style: 'offensif', weapon: 0 }, enc: null, ev: null, compMsg: {}, forgeSlot: 'weapon', forgeQ: 0, upSel: null, tipCache: {}, invQ: '', invR: 'all', invS: 'rarity', invDir: 1, selMode: false, selSet: new Set(), invTab: 'bag', autoR: 1, traitQ: '', traitF: 'all' };
const $id = id => document.getElementById(id);
const TABS = [['town', '🏰', 'Ville'], ['explore', '🧭', 'Explorer'], ['char', '👤', 'Héros'], ['inv', '🎒', 'Inventaire'], ['skills', '✨', 'Compétences'], ['traits', '🌟', 'Traits'], ['quests', '📜', 'Quêtes'], ['comp', '🤝', 'Compagnons'], ['craft', '🔨', 'Artisanat'], ['shop', '💰', 'Marché'], ['stats', '🏆', 'Succès'], ['rep', '👑', 'Renommée'], ['opts', '⚙️', 'Options']];
const TRAIT_ICON = { combat: '⚔️', survie: '❤️', exploration: '🧭', equipement: '🛡️', social: '🤝', secret: '🌑', maudit: '☠️', armes: '🗡️', armures: '🧱', magie: '🔮', invocation: '💀', defense: '🛡️', artisanat: '🔨', economie: '🪙', reputation: '👑', boss: '🐉', donjons: '🏰', evenements: '🎲', quetes: '📜', compagnons: '🤝' };

const bar = (cur, max, cls, label) => `<div class="bar ${cls}" role="progressbar" aria-valuenow="${Math.round(cur)}" aria-valuemax="${Math.round(max)}"><i style="width:${clamp(max ? cur / max * 100 : 0, 0, 100)}%"></i><span>${label || `${fmt(cur)} / ${fmt(max)}`}</span></div>`;
const rcls = r => 'r-' + RARITIES[r].id;
const statLines = st => Object.keys(st).filter(k => st[k]).map(k => `<li>+${st[k]} ${STAT_LABEL[k]}</li>`).join('');
const ring = (ratio, col, icon) => { const r = 26, c = 2 * Math.PI * r; return `<svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="ring-bg"/><circle cx="32" cy="32" r="${r}" class="ring-fg" style="stroke:${col};stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${(c * (1 - clamp(ratio, 0, 1))).toFixed(1)}"/><text x="32" y="39" text-anchor="middle" class="ring-t">${icon}</text></svg>`; };

function itemTip(it) {
  const R = RARITIES[it.r];
  return `<b class="${rcls(it.r)}">${esc(it.name)}${it.up ? ' +' + it.up : ''}</b><br>${R.n} · ${it.cat ? CAT_NAME[it.cat] : TYPE_NAME[it.slot]} · niv. ${it.ilvl}<ul>${statLines(it.st)}</ul>${it.fx.map(f => `<div class="fx">★ ${FX[f].n} : ${FX[f].d}</div>`).join('')}${it.set ? `<div class="fx">◆ Ensemble ${SET_BY(it.set).n} : ${Object.keys(SET_BY(it.set).b).map(k => `${k} pièces — ${effText(SET_BY(it.set).b[k]).join(', ')}`).join(' | ')}</div>` : ''}${it.kind ? `<div class="fx">✦ Arme ${it.kind}</div>` : ''}<i>${esc(it.desc)}</i>`;
}
function itemCard(it, act, extra = '') {
  const pk = U.selSet && U.selSet.has(it.id);
  return `<button class="item ${rcls(it.r)} ${U.sel === it.id ? 'sel' : ''} ${pk ? 'picked' : ''}" data-act="${act}" data-id="${it.id}" data-tip="${esc(itemTip(it))}"><span class="badges">${it.lock ? '🔒' : ''}${it.fav ? '⭐' : ''}${it.isNew ? '<i class="new">NEW</i>' : ''}${pk ? '<i class="chk">✔</i>' : ''}</span><span class="ico">${it.ico}</span><span class="nm">${esc(it.name)}${it.up ? ' +' + it.up : ''}</span><small>niv. ${it.ilvl} · ${RARITIES[it.r].n}${it.set ? ' · ◆' : ''}</small>${extra}</button>`;
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
    const alerts = { char: G.p.pts > 0, skills: G.p.sp > 0, inv: G.inv.some(i => i.isNew), quests: QUESTS.some(q => Quests.status(q) === 'ready'), comp: Object.keys(COMPS).some(id => !(G.comp[id] && G.comp[id].rec) && Companions.can(id)) };
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

function invFiltered() {
  const src = U.invTab === 'stash' ? G.stash : G.inv, q = U.invQ.trim().toLowerCase();
  const key = { rarity: i => i.r * 1e6 + i.ilvl, level: i => i.ilvl, value: i => itemValue(i), power: i => Inv.power(i) }[U.invS];
  return src.filter(i => (U.invF === 'all' || i.slot === U.invF) && (U.invR === 'all' || i.r === +U.invR) && (!q || i.name.toLowerCase().includes(q) || (i.cat && CAT_NAME[i.cat].toLowerCase().includes(q)) || (i.kind || '').includes(q)))
    .sort((a, b) => U.invDir * (key(b) - key(a)));
}
function invGridHtml() {
  const l = invFiltered(); return l.map(i => itemCard(i, 'invClick')).join('') || '<em>Aucun objet ne correspond.</em>';
}
function invBarHtml() {
  const src = U.invTab === 'stash' ? G.stash : G.inv, sel = Inv.pick([...U.selSet], src), tot = Inv.total(sel), prot = sel.filter(i => Inv.protectedItem(i)).length;
  return `<b>${sel.length}</b> sélectionné(s) · valeur de vente <b class="gold-t">🪙 ${fmt(tot)}</b>${prot ? ` <small class="bad">(${prot} verrouillé(s) ignoré(s))</small>` : ''}
    <div class="row wrap"><button class="btn sm danger" data-act="sellSel" ${sel.length && U.invTab === 'bag' ? '' : 'disabled'}>Vendre la sélection</button><button class="btn sm" data-act="dismSel" ${sel.length && U.invTab === 'bag' ? '' : 'disabled'}>Démonter</button>
    <button class="btn sm" data-act="${U.invTab === 'bag' ? 'stashSel' : 'unstashSel'}" ${sel.length && Inv.stashOpen() ? '' : 'disabled'}>${U.invTab === 'bag' ? 'Mettre au coffre' : 'Retirer du coffre'}</button>
    <button class="btn sm" data-act="lockSel" ${sel.length ? '' : 'disabled'}>Verrouiller / déverrouiller</button><button class="btn sm" data-act="selNone" ${sel.length ? '' : 'disabled'}>Désélectionner tout</button></div>`;
}
UI.refreshInv = () => { const g = $id('invgrid'), b = $id('invbar'); if (!g || !b) { UI.renderGame(); return; } g.innerHTML = invGridHtml(); b.innerHTML = invBarHtml(); };

V.inv = () => {
  const types = [['all', 'Tout'], ['weapon', 'Armes'], ['off', 'Secondaires'], ['head', 'Casques'], ['chest', 'Plastrons'], ['hands', 'Gants'], ['legs', 'Jambières'], ['feet', 'Bottes'], ['acc', 'Accessoires']];
  const sel = Inv.find(U.sel) || G.stash.find(x => x.id === U.sel), eqd = sel && Object.values(G.eq).some(x => x && x.id === sel.id), inStash = sel && G.stash.includes(sel);
  let detail = '<p><em>Cliquez sur un objet pour voir ses détails et le comparer. Activez le « mode sélection » pour cocher plusieurs objets.</em></p>';
  if (sel) detail = `<h3 class="${rcls(sel.r)}">${sel.ico} ${esc(sel.name)}${sel.up ? ' +' + sel.up : ''} ${sel.lock ? '🔒' : ''}${sel.fav ? '⭐' : ''}</h3><small>${RARITIES[sel.r].n} · ${sel.cat ? CAT_NAME[sel.cat] : TYPE_NAME[sel.slot]} · niv. ${sel.ilvl}${sel.kind ? ' · ' + sel.kind : ''}${sel.cat && MAGIC_CATS.includes(sel.cat) ? ' · dégâts magiques' : ''} · puissance ${Inv.power(sel)}</small>
    <ul class="statl">${statLines(sel.st)}</ul>${sel.fx.map(f => `<div class="fx">★ <b>${FX[f].n}</b> — ${FX[f].d}</div>`).join('')}
    ${sel.set ? `<div class="fx">◆ <b>${SET_BY(sel.set).n}</b> : ${Object.keys(SET_BY(sel.set).b).map(k => `${k} pièces — ${effText(SET_BY(sel.set).b[k]).join(', ')}`).join(' | ')}</div>` : ''}
    <p><i>${esc(sel.desc)}</i></p>${eqd || inStash ? '' : compareHtml(sel)}
    <div class="row wrap">${eqd ? `<button class="btn" data-act="unequip" data-id="${sel.id}" ${G.flags.inCombat ? 'disabled' : ''}>Déséquiper</button>` : `${inStash ? `<button class="btn" data-act="unstashOne" data-id="${sel.id}">Retirer du coffre</button>` : `<button class="btn primary" data-act="equip" data-id="${sel.id}" ${G.flags.inCombat ? 'disabled' : ''}>Équiper</button>`}
      <button class="btn" data-act="lockOne" data-id="${sel.id}">${sel.lock ? 'Déverrouiller' : 'Verrouiller'}</button><button class="btn" data-act="favOne" data-id="${sel.id}">${sel.fav ? 'Retirer des favoris' : 'Favori ⭐'}</button>
      ${inStash ? '' : `<button class="btn danger" data-act="sell" data-id="${sel.id}" ${sel.lock ? 'disabled' : ''}>Vendre (${fmt(sellPrice(sel))} or)</button><button class="btn" data-act="dismOne" data-id="${sel.id}" ${sel.lock ? 'disabled' : ''}>Démonter</button>${Inv.stashOpen() ? `<button class="btn" data-act="stashOne" data-id="${sel.id}">Au coffre</button>` : ''}`}`}</div>`;
  const setLines = SETS.map(s => { const n = Object.values(G.eq).filter(i => i && i.set === s.id).length; return n ? `<div class="syn ${n >= 2 ? 'on' : ''}"><b>◆ ${s.n} ${n}/5</b><small>${Object.keys(s.b).map(k => `${k} pièces : ${effText(s.b[k]).join(', ')}`).join(' | ')}</small></div>` : ''; }).join('');
  const rar = [['all', 'Toutes raretés'], ...RARITIES.map((r, i) => [String(i), r.n])];
  return `<h2>Inventaire <small>${G.inv.length}/${Inv.MAX} · coffre ${G.stash.length}/${Inv.STASH_MAX}</small></h2>
  <div class="row wrap filters"><button class="btn sm ${U.invTab === 'bag' ? 'primary' : ''}" data-act="invTab" data-t="bag">Sac</button><button class="btn sm ${U.invTab === 'stash' ? 'primary' : ''}" data-act="invTab" data-t="stash">Coffre ${Inv.stashOpen() ? '' : `(niv. ${Inv.STASH_LVL})`}</button></div>
  <div class="grid two inv"><div><div class="panel"><h3>Équipement</h3><div class="eqgrid">${EQ_SLOTS.map(s => { const it = G.eq[s]; return it ? `<button class="eqslot ${rcls(it.r)} ${U.sel === it.id ? 'sel' : ''}" data-act="select" data-id="${it.id}" data-tip="${esc(itemTip(it))}"><small>${SLOT_NAME[s]}</small><span>${it.ico} ${esc(it.name)}${it.up ? ' +' + it.up : ''}</span></button>` : `<div class="eqslot empty"><small>${SLOT_NAME[s]}</small><span>— vide —</span></div>`; }).join('')}</div>${setLines}</div>
      <div class="panel" id="invdetail">${detail}</div></div>
    <div class="panel">
      ${U.invTab === 'stash' && !Inv.stashOpen() ? `<p>Le coffre se débloque au niveau ${Inv.STASH_LVL}.</p>` : `
      <div class="row wrap"><input id="invq" data-bind="invq" type="search" placeholder="Rechercher (nom, type, invoquée, maudite…)" value="${esc(U.invQ)}" aria-label="Rechercher">
        <select data-act="invS" aria-label="Trier par">${[['rarity', 'Rareté'], ['level', 'Niveau'], ['value', 'Valeur'], ['power', 'Puissance']].map(([k, n]) => `<option value="${k}" ${U.invS === k ? 'selected' : ''}>Tri : ${n}</option>`).join('')}</select>
        <button class="btn sm" data-act="invDir">${U.invDir > 0 ? '↓ décroissant' : '↑ croissant'}</button></div>
      <div class="row wrap filters">${types.map(([k, n]) => `<button class="btn sm ${U.invF === k ? 'primary' : ''}" data-act="invF" data-f="${k}">${n}</button>`).join('')}</div>
      <div class="row wrap"><select data-act="invR" aria-label="Filtrer par rareté">${rar.map(([k, n]) => `<option value="${k}" ${String(U.invR) === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" data-act="selMode" ${U.selMode ? 'checked' : ''}> Mode sélection</label>
        <button class="btn sm" data-act="selAll">Tout sélectionner</button><button class="btn sm" data-act="selNone">Désélectionner tout</button></div>
      <div class="row wrap"><small>Sélectionner par rareté :</small>${RARITIES.map((r, i) => `<button class="btn sm rbtn ${rcls(i)}" data-act="selRar" data-r="${i}">${r.n}</button>`).join('')}</div>
      <div class="selbar" id="invbar">${invBarHtml()}</div>
      ${U.invTab === 'bag' ? `<div class="row wrap"><span>Vente rapide des objets éligibles (non verrouillés, non favoris) jusqu’à</span><select data-act="autoR">${RARITIES.slice(0, 4).map((r, i) => `<option value="${i}" ${U.autoR === i ? 'selected' : ''}>${r.n}</option>`).join('')}</select><button class="btn sm danger" data-act="sellEligible">Vendre tous les objets éligibles</button></div>` : ''}
      <div class="itemgrid" id="invgrid">${invGridHtml()}</div>`}</div></div>`;
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

function traitState(t) {
  const s = G.tr[t.id] || {}, u = s.u, masked = t.hidden && !s.seen && !u, ratio = u ? 1 : masked ? 0 : Traits.ratio(t);
  return { s, u, masked, ratio, state: u ? 'on' : masked ? 'hidden' : ratio > 0 ? 'prog' : 'locked' };
}
function traitCardHtml(t) {
  const { s, u, masked, ratio, state } = traitState(t), R = RARITIES[t.r];
  const label = { on: '✔ Éveillé', hidden: 'Caché', prog: 'En cours', locked: 'Verrouillé' }[state];
  return `<div class="trait ${u ? 'on' : ''} ${masked ? 'masked' : ''} ${rcls(t.r)}">${ring(ratio, u ? R.c : '#8d86a6', masked ? '?' : TRAIT_ICON[t.cat])}
      <div class="tr-b"><b>${masked ? '???' : esc(t.n)}</b><small>${TCAT[t.cat]} · ${R.n} · ${label}${!masked && ratio > 0 && !u ? ` · ${Math.round(ratio * 100)} %` : ''}</small>
      <p>${masked ? 'Un trait dort quelque part. Explorez, combattez, faites des choix…' : esc(t.d)}</p>
      ${masked ? '' : t.hidden && !u ? `<p class="hint">${esc(t.hint)}</p>${goalLines(t.g, true)}` : goalLines(t.g, false)}
      ${masked ? '' : `<div class="eff ${u ? 'good' : ''}">${u ? '✔ Actif — ' : 'Effet : '}${effText(t.eff).join(', ')}</div>`}</div></div>`;
}
function traitListHtml() {
  const q = U.traitQ.trim().toLowerCase();
  let l = TRAITS.filter(t => {
    const st = traitState(t);
    if (U.traitCat !== 'all' && t.cat !== U.traitCat) return false;
    if (U.traitF !== 'all' && st.state !== U.traitF && !(U.traitF === 'locked' && st.state === 'hidden')) return false;
    if (q && (st.masked || !(t.n.toLowerCase().includes(q) || t.d.toLowerCase().includes(q)))) return false;
    return true;
  });
  l.sort((a, b) => traitState(b).ratio - traitState(a).ratio);
  return l.map(traitCardHtml).join('') || '<em>Aucun trait ne correspond.</em>';
}
UI.refreshTraits = () => { const g = $id('traitgrid'); if (g) g.innerHTML = traitListHtml(); else UI.renderGame(); };
V.traits = () => {
  const cats = [['all', 'Tous'], ...Object.entries(TCAT)], un = TRAITS.filter(t => Traits.has(t.id)).length;
  const per = {}; for (const t of TRAITS) { per[t.cat] = per[t.cat] || [0, 0]; per[t.cat][1]++; if (Traits.has(t.id)) per[t.cat][0]++; }
  return `<h2>Journal des traits <small>${un} / ${TRAITS.length}</small></h2>
    <div class="row wrap"><input id="trq" data-bind="trq" type="search" placeholder="Rechercher un trait…" value="${esc(U.traitQ)}" aria-label="Rechercher un trait">
      <select data-act="traitF" aria-label="État">${[['all', 'Tous les états'], ['on', 'Éveillés'], ['prog', 'En cours'], ['locked', 'Verrouillés / cachés']].map(([k, n]) => `<option value="${k}" ${U.traitF === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="row wrap filters">${cats.map(([k, n]) => `<button class="btn sm ${U.traitCat === k ? 'primary' : ''}" data-act="traitCat" data-c="${k}">${n}${k !== 'all' && per[k] ? ` ${per[k][0]}/${per[k][1]}` : ''}</button>`).join('')}</div>
    <div class="grid traits" id="traitgrid">${traitListHtml()}</div>
    <div class="panel"><h3>Synergies <small>${SYNERGIES.filter(s => s.ids.every(Traits.has)).length} / ${SYNERGIES.length} actives</small></h3>${SYNERGIES.map(s => { const on = s.ids.every(Traits.has), names = s.ids.map(id => { const t = TRAIT(id), sn = G.tr[id] || {}; return t.hidden && !sn.seen && !sn.u ? '???' : t.n; }); return `<div class="syn ${on ? 'on' : ''}"><b>${on ? '✔' : '○'} ${s.n}</b><small>${names.join(' + ')} — ${s.d}</small></div>`; }).join('')}</div>`;
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
  select(d) { U.sel = d.id; const it = Inv.find(d.id); if (it) it.isNew = false; UI.renderGame(); },
  invClick(d) { if (U.selMode) Act.toggleSel(d); else { U.sel = d.id; const it = Inv.find(d.id) || G.stash.find(x => x.id === d.id); if (it) it.isNew = false; UI.renderGame(); } },
  toggleSel(d) { if (U.selSet.has(d.id)) U.selSet.delete(d.id); else U.selSet.add(d.id); UI.refreshInv(); },
  selMode(d, el) { U.selMode = el.checked; if (!U.selMode) U.selSet.clear(); UI.renderGame(); },
  selAll() { U.selMode = true; const l = invFiltered().filter(i => !i.lock && !i.fav); U.selSet = new Set(l.map(i => i.id)); UI.renderGame(); UI.toast(`${l.length} objet(s) sélectionné(s) (verrouillés et favoris exclus).`); },
  selNone() { U.selSet.clear(); UI.renderGame(); },
  selRar(d) { U.selMode = true; invFiltered().filter(i => i.r === +d.r && !i.lock && !i.fav).forEach(i => U.selSet.add(i.id)); UI.renderGame(); },
  sellSel() { const items = Inv.pick([...U.selSet]), ok = items.filter(i => !Inv.protectedItem(i)), tot = Inv.total(ok); if (!ok.length) return UI.toast('Rien à vendre dans la sélection.', 'bad'); if (!confirm(`Vendre ${ok.length} objet(s) pour ${fmt(tot)} or ?${items.length - ok.length ? `\n${items.length - ok.length} objet(s) verrouillé(s) ignoré(s).` : ''}`)) return; const r = Inv.sellMany(ok.map(i => i.id)); U.selSet.clear(); U.sel = null; UI.renderGame(); UI.toast(`${r.n} objet(s) vendu(s) pour ${fmt(r.tot)} or.`, 'good'); },
  sellEligible() { const l = Inv.eligible(U.autoR), tot = Inv.total(l); if (!l.length) return UI.toast('Aucun objet éligible.', 'bad'); if (!confirm(`Vendre ${l.length} objet(s) éligible(s) (jusqu’à « ${RARITIES[U.autoR].n} », hors verrouillés et favoris) pour ${fmt(tot)} or ?`)) return; const r = Inv.sellMany(l.map(i => i.id)); U.selSet.clear(); U.sel = null; UI.renderGame(); UI.toast(`${r.n} objet(s) vendu(s) pour ${fmt(r.tot)} or.`, 'good'); },
  dismSel() { const ok = Inv.pick([...U.selSet]).filter(i => !Inv.protectedItem(i)); if (!ok.length) return; if (!confirm(`Démonter ${ok.length} objet(s) en matériaux ? Cette action est définitive.`)) return; const r = Inv.dismantleMany(ok.map(i => i.id)); U.selSet.clear(); U.sel = null; UI.renderGame(); UI.toast(`${r.n} démonté(s) : ${Object.keys(r.mats).map(k => `${r.mats[k]} ${MATS[k][0]}`).join(', ')}.`, 'good'); },
  dismOne(d) { const it = Inv.find(d.id); if (!it || it.lock || !confirm(`Démonter ${it.name} ?`)) return; const r = Inv.dismantleMany([d.id]); U.sel = null; UI.renderGame(); UI.toast(`Démonté : ${Object.keys(r.mats).map(k => `${r.mats[k]} ${MATS[k][0]}`).join(', ')}.`, 'good'); },
  stashSel() { const n = Inv.deposit([...U.selSet]); U.selSet.clear(); UI.renderGame(); UI.toast(`${n} objet(s) mis au coffre.`); },
  unstashSel() { const n = Inv.withdraw([...U.selSet]); U.selSet.clear(); UI.renderGame(); UI.toast(`${n} objet(s) retiré(s) du coffre.`); },
  stashOne(d) { Inv.deposit([d.id]); U.sel = null; UI.renderGame(); }, unstashOne(d) { Inv.withdraw([d.id]); U.sel = null; UI.renderGame(); },
  lockSel() { for (const it of Inv.pick([...U.selSet], U.invTab === 'stash' ? G.stash : G.inv)) it.lock = !it.lock; Game.sync(); },
  lockOne(d) { Inv.toggle(d.id, 'lock'); }, favOne(d) { Inv.toggle(d.id, 'fav'); },
  invTab(d) { U.invTab = d.t; U.selSet.clear(); U.sel = null; UI.renderGame(); }, invS(d, el) { U.invS = el.value; UI.renderGame(); }, invR(d, el) { U.invR = el.value; UI.renderGame(); },
  invDir() { U.invDir = -U.invDir; UI.renderGame(); }, autoR(d, el) { U.autoR = +el.value; },
  equip(d) { Inv.equip(d.id); U.sel = d.id; UI.renderGame(); }, unequip(d) { const s = EQ_SLOTS.find(k => G.eq[k] && G.eq[k].id === d.id); if (s) Inv.unequip(s); },
  sell(d) { const it = Inv.find(d.id); if (!it || it.lock) return; if ((it.fav || it.r >= 4) && !confirm(`Vendre ${it.name} (${RARITIES[it.r].n}) pour ${fmt(sellPrice(it))} or ?`)) return; const p = Inv.sell(d.id); U.sel = null; U.selSet.delete(d.id); UI.renderGame(); if (p) UI.toast(`Vendu pour ${fmt(p)} or.`); },
  invF(d) { U.invF = d.f; UI.renderGame(); },
  learn(d) { Skills.learn(d.id); }, aug(d) { Skills.setAug(d.id, d.a); }, respec() { if (confirm('Réinitialiser toutes les compétences ? Les points sont rendus (coût en or).')) Skills.respec(); },
  traitCat(d) { U.traitCat = d.c; UI.renderGame(); }, traitF(d, el) { U.traitF = el.value; UI.renderGame(); },
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
  document.addEventListener('change', e => { const el = e.target.closest('input[data-act], select[data-act]'); if (el && Act[el.dataset.act]) Act[el.dataset.act](el.dataset, el); });
  document.addEventListener('input', e => { if (e.target.dataset.bind === 'name') U.cr.name = e.target.value; if (e.target.dataset.bind === 'trq') { U.traitQ = e.target.value; UI.refreshTraits(); }
    if (e.target.dataset.bind === 'invq') { U.invQ = e.target.value; UI.refreshInv(); } });
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

/* =====================================================================
   MODES DE JEU
   1 RPG tour par tour (Explorer) · 2 Donjons explorables (ce fichier) · 3 Aventure temps réel (p10)
   4 Minage (p9) · 5 Forge en mini-jeu (ce fichier)
   Tous partagent le même personnage, la même sauvegarde et les mêmes compteurs de traits.
   ===================================================================== */

/* ---------- MODE 2 : DONJONS EXPLORABLES ----------
   Le donjon est une carte de salles à embranchements (5 couches). Le joueur choisit son chemin :
   combat, élite, coffre, piège, événement, feu de camp (checkpoint) puis boss. La carte est sauvegardée. */
const DN_ICON = { n: '⚔️', e: '💀', c: '🎁', r: '🔥', v: '❓', t: '🪤', b: '👑' };
const DN_NAME = { n: 'Combat', e: 'Élite', c: 'Coffre', r: 'Feu de camp', v: 'Événement', t: 'Piège', b: 'Boss' };
Object.assign(Dungeon, {
  set(D) { this.D = D; G.flags.dstate = D; G.flags.dungeon = D ? D.id : null; },
  build(d, diff) {
    const layers = [], L = 5; let id = 0;
    const pickK = w => wpick(Object.keys(w), k => w[k]);
    for (let l = 0; l < L; l++) {
      const n = l === L - 1 ? 1 : l === 0 ? 2 : rint(2, 3), row = [];
      for (let i = 0; i < n; i++) row.push({ id: id++, l, i, k: 'n', done: false, next: [] });
      layers.push(row);
    }
    for (let l = 0; l < L - 1; l++) {
      const A = layers[l], B = layers[l + 1], hasIn = new Set();
      for (const a of A) {
        const base = Math.round(a.i * (B.length - 1) / Math.max(A.length - 1, 1)), t = new Set([base]);
        if (chance(.5) && B.length > 1) t.add(clamp(base + (chance(.5) ? 1 : -1), 0, B.length - 1));
        for (const j of t) { a.next.push(B[j].id); hasIn.add(B[j].id); }
      }
      for (const b of B) if (!hasIn.has(b.id)) pick(A).next.push(b.id);
    }
    layers[0][0].k = 'n'; layers[0][1].k = chance(.35) ? 'c' : 'n';
    for (const x of layers[1]) x.k = pickK({ n: 4, v: 2, c: 2, t: 2 });
    for (const x of layers[2]) x.k = pickK({ n: 3, e: 2, r: 2, v: 2, c: 1 });
    for (const x of layers[3]) x.k = pickK({ e: 3, n: 2, r: 1, v: 2, t: 1 });
    layers[4][0].k = 'b';
    const mid = [...layers[2], ...layers[3]];
    if (!mid.some(x => x.k === 'r')) pick(layers[2]).k = 'r';
    if (!mid.some(x => x.k === 'e')) pick(layers[3]).k = 'e';
    return layers.flat();
  },
  start(id, diff) {
    const d = DUNGEON(id); if (!d || G.flags.inCombat || this.D || !this.avail(d) || !this.diffOK(d, diff)) return;
    this.set({ id, diff, nodes: this.build(d, diff), at: -1, cp: -1, dmg: 0, minHp: 1, potions: 0, log: [`Vous entrez dans ${d.n}.`], pend: null });
    bump('dungeonEntries'); Game.sync(); Hooks.dungeonMap();
  },
  node(id) { return this.D.nodes.find(n => n.id === id); },
  reachable() {
    const D = this.D, cur = D.at >= 0 ? this.node(D.at) : null;
    return D.nodes.filter(n => !n.done && (cur ? cur.next.includes(n.id) : n.l === 0));
  },
  visible(n) { const D = this.D, cur = D.at >= 0 ? this.node(D.at) : null; return n.done || n.l <= (cur ? cur.l + 1 : 0) || n.k === 'b' && cur && cur.l >= 2; },
  say(m) { this.D.log.push(m); if (this.D.log.length > 8) this.D.log.shift(); },
  lvl() { const D = this.D, d = DUNGEON(D.id); return BOSSES[d.boss].lvl + DIFFS[D.diff].off; },
  foes(kind) {
    const D = this.D, d = DUNGEON(D.id), Z = ZONE(d.zone), bl = this.lvl(), en = [];
    if (kind === 'n') { const c = rint(1, 3); for (let i = 0; i < c; i++) en.push(Enemies.make(pick(Z.enemies), bl - 2)); }
    else if (kind === 'e') en.push(Enemies.make(pick(Z.enemies), bl - 1, 'elite'));
    else en.push(Enemies.make(d.boss, bl));
    return en;
  },
  enter(id) {
    const D = this.D; if (!D || G.flags.inCombat) return;
    const n = this.node(id); if (!n || !this.reachable().includes(n)) return;
    D.pend = id; bump('dungeonNodes'); const d = DUNGEON(D.id), Z = ZONE(d.zone), S = Stats.get();
    if (n.k === 'n' || n.k === 'e' || n.k === 'b') {
      if (n.k === 'b' && this.canNegotiate(n)) { Hooks.dungeonNegotiate(); return; }
      this.fight(n);
    } else if (n.k === 'c') {
      let lines = Explore.chest(Z); bump('roomChests');
      if (chance(.25)) { const dm = Math.max(1, Math.min(G.p.hp - 1, Math.round(S.maxHp * .12))); G.p.hp -= dm; bump('trapsHit'); lines.push(`Coffre piégé : −${dm} PV`); }
      this.say(`🎁 Coffre : ${lines.join(', ')}`); this.done(n);
    } else if (n.k === 'r') {
      Player.heal(S.maxHp * .4); Player.restoreMp(S.maxMp * .3); D.cp = n.id; bump('campfires'); this.say('🔥 Vous vous reposez au feu de camp (checkpoint).'); this.done(n);
    } else if (n.k === 't') {
      const ok = chance(clamp(.35 + S.agi * .01 + S.prec / 200, .2, .9));
      if (ok) { Player.addXp(Math.round(10 * Math.pow(this.lvl(), 1.3))); bump('trapsDisarmed'); this.say('🪤 Vous désamorcez le piège avec adresse.'); }
      else { const dm = Math.max(1, Math.min(G.p.hp - 1, Math.round(S.maxHp * .12))); G.p.hp -= dm; bump('trapsHit'); this.say(`🪤 Le piège se déclenche : −${dm} PV.`); }
      this.done(n);
    } else if (n.k === 'v') {
      const ev = Narr.pick(Z);
      if (!ev) { Mats.add(pick(Z.mats), 2); this.say('Rien d’intéressant… vous récoltez quelques matériaux.'); this.done(n); }
      else { U.ev = ev.id; U.dungEv = true; Hooks.dungeonEvent(); return; }
    }
    Game.sync(); Hooks.dungeonMap();
  },
  fight(n) {
    const D = this.D, d = DUNGEON(D.id);
    Combat.start({ enemies: this.foes(n.k), canFlee: false, zone: d.zone, kind: 'dungeon', rewMul: DIFFS[D.diff].rew, onEnd: res => this.afterNode(res) });
  },
  done(n) { const D = this.D; n.done = true; D.at = n.id; D.pend = null; },
  afterNode(res) {
    const D = this.D; if (!D) return; const n = this.node(D.pend);
    if (res === 'win' && n) {
      this.done(n); const S = Stats.get(); Player.heal(S.maxHp * .08); this.say(`✔ ${DN_NAME[n.k]} terminé.`);
      if (n.k === 'b') { this.complete(false); return; }
    } else if (res !== 'win') {
      if (D.cp >= 0) { const S = Stats.get(); D.at = D.cp; D.pend = null; G.p.hp = Math.max(G.p.hp, Math.round(S.maxHp * .4)); this.say('☠ Vous vous réveillez au dernier feu de camp.'); }
      else { this.set(null); Game.sync(); return; }
    }
    Game.sync(); Hooks.dungeonMap();
  },
  afterEvent(fight) {
    const D = this.D; if (!D) return; const n = this.node(D.pend); U.dungEv = false;
    if (fight) { Narr.startFight(fight, res => this.afterNode(res)); return; }
    if (n) { this.done(n); this.say('❓ L’événement se conclut.'); }
    Game.sync(); Hooks.dungeonMap();
  },
  canNegotiate(n) { const D = this.D; return !!(D && DUNGEON(D.id).boss === 'gobelin_roi' && n && n.k === 'b' && G.flags.gobelinSpared && (G.rep.sylve || 0) >= 10); },
  negotiate() {
    const D = this.D, n = this.node(D.pend); if (!this.canNegotiate(n)) return;
    bump('pacified'); bump('bk_gobelin_roi'); G.bosses.gobelin_roi = G.bosses.gobelin_roi || 'peace'; G.flags.grokMet = true; addRep('sylve', 10);
    this.done(n); this.complete(true);
  },
  leave() { if (!this.D) return; this.say('Vous quittez le donjon.'); this.set(null); Game.sync(); },
  complete(peace) {
    const D = this.D, d = DUNGEON(D.id), B = BOSSES[d.boss], df = DIFFS[D.diff], E = Stats.sum(), lines = [];
    G.dung[d.id] = G.dung[d.id] || {}; const first = !G.dung[d.id][D.diff]; G.dung[d.id][D.diff] = true;
    if (D.diff === 2) { bump('dungNight'); if (d.boss === 'devoreur') bump('bk_devoreur_n'); }
    bump('dungeonsDone'); if (D.diff >= 1) bump('dungHard'); if (D.dmg === 0) bump('dungFlawless'); if (D.minHp < .05) bump('dungLowHp'); if (!D.potions) bump('dungNoPotion');
    const g = Math.round(B.lvl * 40 * df.rew * (peace ? .5 : 1) * (1 + (E.goldPct || 0))); Player.gold(g); lines.push(`+${fmt(g)} or`);
    const n = peace ? 1 : 1 + D.diff + (first ? 1 : 0);
    for (let i = 0; i < n; i++) { const it = genItem({ ilvl: B.lvl + df.off + 2, minR: 2 + D.diff, luck: (E.lootLuck || 0) + .1 * D.diff, boss: true }); Inv.add(it, 'drop'); lines.push(`Butin : ${it.name} (${RARITIES[it.r].n})`); }
    addRep('couronne', 3 + D.diff * 2); if (peace) lines.push('Le Roi Gobelin se retire sans combattre. Grok souhaite vous suivre.');
    const name = d.n, dn = df.n; this.set(null); Game.sync();
    Hooks.dungeonDone({ name, diff: dn, lines, peace });
  }
});
Object.assign(Hooks, { dungeonMap() { }, dungeonEvent() { }, dungeonNegotiate() { } });
Narr.startFight = function (f, onEnd) {
  const Z = ZONE(Dungeon.D ? DUNGEON(Dungeon.D.id).zone : U_zone()), lvl = Dungeon.D ? Dungeon.lvl() : clamp(G.p.lvl, Z.min, Z.max), en = [];
  for (let i = 0; i < (f.n || 1); i++) en.push(Enemies.make(f.tpl, lvl, f.elite ? 'elite' : undefined));
  Combat.start({ enemies: en, canFlee: !f.noFlee && !Dungeon.D, zone: Z.id, kind: Dungeon.D ? 'dungeon' : 'event', onWin: f.win ? () => Game.reward(f.win) : null, onEnd: onEnd || (() => { }) });
};

/* ---------- MODE 5 : FORGE EN MINI-JEU ----------
   Trois frappes à timing. Le score (0-100) module la qualité : rareté, statistiques, bonus spécial.
   Les plans s'obtiennent en démontant un objet du catalogue ; ils permettent de refabriquer cet objet nommé. */
Object.assign(Craft, {
  namedCost(key) {
    const e = Catalog.byKey(key), m = {}, t = DISMANTLE[e.r];
    for (const k in t) m[k] = t[k] * 2; if (e.r >= 4) m.star = (m.star || 0) + 2;
    return { gold: Math.round((6 + e.lv * 3) * RARITIES[e.r].p * 1.4), mats: m };
  },
  specCost(spec) { return spec.key ? this.namedCost(spec.key) : this.forgeCost(spec.slot, spec.q); },
  finishForge(spec, score) {
    if (G.flags.inCombat) return null; const c = this.specCost(spec);
    if (G.p.gold < c.gold || !Mats.has(c.mats)) return null;
    G.p.gold -= c.gold; Mats.take(c.mats); bump('goldSpent', c.gold);
    const E = Stats.sum(); let it;
    if (spec.key) { const e = Catalog.byKey(spec.key); it = Catalog.make(e, Math.max(e.lv, G.p.lvl)); }
    else it = genItem({ ilvl: G.p.lvl + spec.q, slot: spec.slot, luck: QUAL[spec.q].luck + (E.upgBonus || 0) * 2 + score / 100 * .5, minR: QUAL[spec.q].minR + (score >= 95 ? 1 : 0), noCat: true });
    const mult = .85 + score / 100 * .35; for (const k in it.b0) it.b0[k] = Math.max(1, Math.round(it.b0[k] * mult));
    recalcItem(it);
    if (score >= 95) { const k = pick(STAT_POOL), v = Math.max(1, Math.round((4 + it.ilvl * 1.6) * AFF[k] * 1.2)); it.xtra[k] = (it.xtra[k] || 0) + v; recalcItem(it); bump('forgePerfect'); }
    Inv.add(it, 'craft'); bump('crafted'); bump('forges'); if (it.r >= 3) bump('craftEpic'); if (spec.q === 2) bump('craftMaster');
    Game.sync(); return it;
  }
});
const Forge = {
  st: null, raf: 0,
  start(spec) {
    const c = Craft.specCost(spec);
    if (G.p.gold < c.gold || !Mats.has(c.mats)) { UI.toast('Ressources insuffisantes.', 'bad'); return; }
    this.st = { spec, round: 0, scores: [], pos: 0, dir: 1, speed: .9, tgt: .5, hw: .11, done: false, last: 0 };
    this.nextRound(); UI.modal(this.html()); this.loop(performance.now());
  },
  nextRound() { const s = this.st; s.tgt = rnd(.28, .72); s.hw = [.11, .08, .055][s.round] || .05; s.speed = .9 + s.round * .5; s.pos = 0; s.dir = 1; },
  html() {
    const s = this.st, c = Craft.specCost(s.spec), e = s.spec.key && Catalog.byKey(s.spec.key);
    return `<h3>🔨 Forge ${e ? '— ' + esc(e.n) : ''}</h3><p><small>Frappez quand le curseur est dans la zone dorée. 3 frappes, de plus en plus rapides. Espace ou bouton.</small></p>
      <div class="forgebar" id="fg-bar"><div class="fz" id="fg-zone" style="left:${(s.tgt - s.hw) * 100}%;width:${s.hw * 200}%"></div><div class="fm" id="fg-mark"></div></div>
      <div class="row between"><span>Frappe ${Math.min(s.round + 1, 3)} / 3</span><span id="fg-sc">${s.scores.map(x => Math.round(x)).join(' · ')}</span></div>
      <p><small>Coût : ${fmt(c.gold)} or · ${Object.keys(c.mats).map(k => `${MATS[k][1]}${c.mats[k]}`).join(' ')} (payé à la fin)</small></p>
      <div class="row"><button class="btn primary big" data-act="forgeHit">🔨 Frapper !</button><button class="btn" data-act="forgeCancel">Annuler</button></div>`;
  },
  loop(now) {
    const s = this.st; if (!s || s.done) return;
    if (!document.getElementById('fg-mark')) { this.st = null; return; }
    const dt = Math.min(.05, (now - (s.last || now)) / 1000); s.last = now;
    s.pos += s.dir * s.speed * dt; if (s.pos >= 1) { s.pos = 1; s.dir = -1; } if (s.pos <= 0) { s.pos = 0; s.dir = 1; }
    document.getElementById('fg-mark').style.left = s.pos * 100 + '%';
    this.raf = requestAnimationFrame(t => this.loop(t));
  },
  scoreOf(pos, tgt, hw) { const d = Math.abs(pos - tgt); if (d <= hw * .3) return 100; if (d <= hw) return 100 - (d - hw * .3) / (hw * .7) * 30; return Math.max(0, 70 - (d - hw) * 260); },
  hit() {
    const s = this.st; if (!s || s.done) return;
    s.scores.push(this.scoreOf(s.pos, s.tgt, s.hw)); s.round++;
    if (s.round >= 3) { s.done = true; cancelAnimationFrame(this.raf); this.finish(); return; }
    this.nextRound(); UI.modal(this.html()); this.loop(performance.now());
  },
  finish(auto) {
    const s = this.st, score = auto ? 50 : s.scores.reduce((a, b) => a + b, 0) / s.scores.length, it = Craft.finishForge(s.spec, score); this.st = null;
    if (!it) { UI.modal('<h3>Échec</h3><p>Ressources insuffisantes.</p><button class="btn" data-act="closeModal">Fermer</button>'); return; }
    const verdict = score >= 95 ? '✨ Frappe parfaite ! Bonus spécial ajouté.' : score >= 75 ? 'Excellent travail.' : score >= 50 ? 'Du bon ouvrage.' : score >= 25 ? 'Quelques défauts…' : 'Un travail bâclé.';
    UI.modal(`<h3>Forgé !</h3><p>Score : <b>${Math.round(score)}</b> / 100 — ${verdict}</p><div class="itemgrid">${itemCard(it, 'select')}</div><div class="row"><button class="btn primary" data-act="closeModal">Super</button></div>`);
  },
  cancel() { if (this.st) { this.st.done = true; cancelAnimationFrame(this.raf); this.st = null; } UI.closeModal(); }
};

/* ---------- MODE 4 : MINAGE ----------
   Grille 9 × 60. On creuse au pic : chaque coup coûte 1 énergie. Les blocs deviennent plus durs avec la profondeur
   et exigent une pioche de rang suffisant. Les minerais restent dans le sac jusqu'à la remontée à la surface.
   Dangers : lave, éboulements, embuscades (qui lancent un vrai combat au tour par tour). La mine est sauvegardée. */
const MINE_W = 9, MINE_H = 60;
const MINE_BANDS = [
  { to: 8, hard: 4, tier: 1, ores: [['ore', .14], ['bone', .03], ['herb', .03]], gold: .04, name: 'Galeries superficielles' },
  { to: 20, hard: 8, tier: 2, ores: [['ore', .10], ['crystal', .07], ['bone', .03]], gold: .05, name: 'Roche profonde' },
  { to: 35, hard: 14, tier: 3, ores: [['crystal', .09], ['ember', .08], ['ecto', .04]], gold: .06, name: 'Cavernes de braise' },
  { to: 60, hard: 22, tier: 4, ores: [['ember', .08], ['star', .07], ['crystal', .07], ['ecto', .05]], gold: .07, name: 'Cœur d’obsidienne' }
];
const mineBand = y => MINE_BANDS.find(b => y <= b.to) || MINE_BANDS[3];
const MINE_ICON = { stone: '🪨', gold: '🪙', lava: '🌋', chest: '🎁', empty: '' };
const Mine = {
  newState() { return { tier: 1, lamp: 1, bag: {}, bagGold: 0, run: null }; },
  st() { if (!G.mine) G.mine = this.newState(); return G.mine; },
  cap() { return 40 + this.st().tier * 10; },
  bagCount() { return Object.values(this.st().bag).reduce((a, b) => a + b, 0); },
  maxEnergy() { const S = Stats.get(); return 40 + Math.floor(S.end / 2) + this.st().tier * 4; },
  power() { const S = Stats.get(); return 2 + this.st().tier * 3 + Math.floor(S.str / 12); },
  gen() {
    const cells = [];
    for (let y = 0; y <= MINE_H; y++) for (let x = 0; x < MINE_W; x++) {
      if (y === 0) { cells.push({ t: 'empty', hp: 0, max: 0, seen: 1 }); continue; }
      const b = mineBand(y); let t = 'stone', o = null, r = Math.random();
      if (y > 9 && r < .025) t = 'lava';
      else if ((r -= .025) < .015) t = 'chest';
      else if ((r -= .015) < b.gold) t = 'gold';
      else { for (const [m, p] of b.ores) { if ((r -= p) < 0) { t = 'ore'; o = m; break; } } }
      const hp = t === 'lava' ? 9999 : Math.round(b.hard * (t === 'ore' ? 1.3 : t === 'chest' ? 1.6 : 1) * rnd(.85, 1.15));
      cells.push({ t, o, hp, max: hp, seen: 0 });
    }
    return cells;
  },
  cell(x, y) { return (x < 0 || y < 0 || x >= MINE_W || y > MINE_H) ? null : this.st().run.cells[y * MINE_W + x]; },
  reveal() { const r = this.st().run, R = 1 + this.st().lamp; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R + 1) continue; const c = this.cell(r.x + dx, r.y + dy); if (c) c.seen = 1; } },
  begin() {
    const m = this.st(); if (G.flags.inCombat) return false;
    if (!m.run) { m.run = { cells: this.gen(), x: 4, y: 0, energy: this.maxEnergy(), swings: 0 }; this.reveal(); bump('mineRuns'); }
    return true;
  },
  fresh() { const m = this.st(); if (!m.run || m.run.y !== 0) return false; m.run = null; this.begin(); Game.sync(); return true; },
  hurt(frac) { const S = Stats.get(), d = Math.max(1, Math.min(G.p.hp - 1, Math.round(S.maxHp * frac))); G.p.hp -= d; bump('dmgTaken', d); return d; },
  // Action sur une case adjacente : déplacement ou coup de pioche. Renvoie un message.
  act(x, y) {
    const m = this.st(), r = m.run; if (!r || G.flags.inCombat) return null;
    const dx = Math.abs(x - r.x), dy = Math.abs(y - r.y); if (dx + dy !== 1) return 'Cible trop éloignée : choisissez une case voisine.';
    const c = this.cell(x, y); if (!c) return null;
    if (c.t === 'empty') { r.x = x; r.y = y; this.reveal(); if (y > (G.c.mineDepth || 0)) G.c.mineDepth = y; Game.sync(); return y === 0 ? 'Vous êtes à la surface.' : null; }
    if (c.t === 'lava') return '🌋 De la lave ! Impossible de la creuser.';
    const b = mineBand(y); if (b.tier > m.tier) return `Trop dur ! Il faut une pioche de rang ${b.tier} (la vôtre : ${m.tier}).`;
    if (r.energy < 1) return 'Épuisé ! Remontez à la surface ou buvez une potion de mana.';
    const S = Stats.get(); r.energy -= 1; r.swings++; bump('mineSwings');
    let p = this.power() * rnd(.9, 1.1); const crit = chance(S.crit / 100); if (crit) p *= 2; c.hp -= p;
    if (c.hp > 0) { Game.sync(); return crit ? '💥 Coup critique !' : null; }
    // bloc détruit
    c.hp = 0; const t = c.t, ore = c.o; c.t = 'empty'; c.o = null; bump('mined'); let msg = '';
    const E = Stats.sum();
    if (t === 'ore') { const n = rint(1, 2) + (chance(.1 + m.tier * .03) ? 1 : 0); msg = this.toBag(ore, n); }
    else if (t === 'gold') { const g = Math.round(rint(8, 20) * (1 + y * .25) * (1 + (E.goldPct || 0))); m.bagGold += g; msg = `🪙 +${g} or (dans le sac)`; }
    else if (t === 'chest') { const it = genItem({ ilvl: Math.round(G.p.lvl * .6 + y * 1.2) + 1, luck: (E.lootLuck || 0) + .08, minR: y > 20 ? 1 : 0 }); Inv.add(it, 'drop'); bump('chests'); bump('mineChests'); msg = `🎁 Coffre : ${it.name} (${RARITIES[it.r].n})`; }
    else if (chance(.12)) msg = this.toBag(pick(b.ores)[0], 1);
    if (b.tier >= 2 && chance(.02 * b.tier)) { const d = this.hurt(.08); r.energy = Math.max(0, r.energy - 3); msg += ` Éboulement ! −${d} PV, −3 énergie.`; bump('cavein'); }
    for (const [ax, ay] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const a = this.cell(ax, ay); if (a && a.t === 'lava' && chance(.3)) { const d = this.hurt(.1); msg += ` 🌋 La lave déborde ! −${d} PV.`; bump('lavaHits'); break; } }
    if (y >= 5 && chance(.02)) { U.returnTo = 'mine'; Game.sync(); const Z = ZONE('montagne'); Explore.fight([Enemies.make(pick(['harpie', 'golem_roc', 'salamandre']), clamp(G.p.lvl, Z.min, Z.max))], Z); return '⚠ Une créature surgit de la roche !'; }
    r.x = r.x; this.reveal(); Game.sync(); return msg || null;
  },
  toBag(id, n) {
    const m = this.st(), room = this.cap() - this.bagCount(); const k = Math.min(n, Math.max(0, room));
    if (k <= 0) return '🎒 Sac plein ! Les minerais sont perdus.';
    m.bag[id] = (m.bag[id] || 0) + k; return `${MATS[id][1]} +${k} ${MATS[id][0]}`;
  },
  // Remontée à la surface : le sac est converti en matériaux et en or
  surface() {
    const m = this.st(), r = m.run; if (!r || r.y !== 0) return null;
    const lines = []; for (const k in m.bag) { Mats.add(k, m.bag[k]); lines.push(`${MATS[k][1]} ${m.bag[k]} ${MATS[k][0]}`); }
    if (m.bagGold) { Player.gold(m.bagGold); lines.push(`🪙 ${fmt(m.bagGold)} or`); }
    m.bag = {}; m.bagGold = 0; r.energy = this.maxEnergy(); Player.heal(Stats.get().maxHp * .2); bump('mineDeliveries'); Game.sync(); return lines;
  },
  // Corde d'évacuation : retour immédiat, mais 30 % du sac est perdu
  evacuate() {
    const m = this.st(), r = m.run; if (!r || G.flags.inCombat) return false;
    for (const k in m.bag) m.bag[k] = Math.floor(m.bag[k] * .7); m.bagGold = Math.floor(m.bagGold * .7);
    r.x = 4; r.y = 0; this.reveal(); bump('evacuations'); Game.sync(); return true;
  },
  drinkEnergy() { const r = this.st().run; if (!r || (G.cons.potion_mp || 0) < 1) return false; G.cons.potion_mp--; r.energy = Math.min(this.maxEnergy(), r.energy + Math.round(this.maxEnergy() * .5)); Game.sync(); return true; },
  pickCost() { const t = this.st().tier; return { gold: 150 * t * t, mats: Object.assign({ ore: 8 * t }, t >= 2 ? { crystal: t - 1 } : {}, t >= 3 ? { ember: t - 2 } : {}, t >= 5 ? { star: t - 4 } : {}) }; },
  lampCost() { const l = this.st().lamp; return { gold: 100 * l * l, mats: { crystal: l * 2 } }; },
  upgrade(kind) {
    const m = this.st(); if (G.flags.inCombat) return false;
    if (kind === 'pick' && m.tier >= 6) return false; if (kind === 'lamp' && m.lamp >= 4) return false;
    const c = kind === 'pick' ? this.pickCost() : this.lampCost();
    if (G.p.gold < c.gold || !Mats.has(c.mats)) return false;
    G.p.gold -= c.gold; Mats.take(c.mats); bump('goldSpent', c.gold); if (kind === 'pick') m.tier++; else m.lamp++;
    bump('mineUpgrades'); if (m.run) this.reveal(); Game.sync(); return true;
  }
};

/* ----- Interface du minage ----- */
UI.mine = function () {
  if (!Mine.begin()) return; U.returnTo = null; UI.show('mine'); UI.renderMine();
};
UI.renderMine = function (msg) {
  if (U.screen !== 'mine') return;
  const m = Mine.st(), r = m.run; if (!r) { UI.show('game'); return; }
  const b = mineBand(r.y), S = Stats.get(), rows = [];
  const y0 = Math.max(0, r.y - 4), y1 = Math.min(MINE_H, y0 + 11);
  for (let y = y0; y <= y1; y++) {
    const cells = [];
    for (let x = 0; x < MINE_W; x++) {
      const c = Mine.cell(x, y), me = r.x === x && r.y === y, adj = Math.abs(x - r.x) + Math.abs(y - r.y) === 1;
      let ic = '', cls = 'mc';
      if (me) { ic = '⛏️'; cls += ' me'; }
      else if (!c.seen) { cls += ' fog'; }
      else if (c.t === 'empty') { cls += ' open'; }
      else if (c.t === 'ore') { ic = MATS[c.o][1]; cls += ' ore'; }
      else { ic = MINE_ICON[c.t]; cls += ' ' + c.t; }
      const dmg = c.max && c.t !== 'lava' && c.t !== 'empty' && c.seen ? c.hp / c.max : 1;
      cells.push(`<button class="${cls} ${adj ? 'adj' : ''}" data-act="mineCell" data-x="${x}" data-y="${y}" style="--d:${(dmg * 100).toFixed(0)}%" aria-label="case ${x},${y}">${ic}</button>`);
    }
    rows.push(`<div class="mrow"><span class="mdepth">${y === 0 ? '☀️' : y}</span>${cells.join('')}</div>`);
  }
  $id('screen-mine').innerHTML = `<div class="minewrap">
    <div class="c-top"><b>⛏️ La Mine — profondeur ${r.y} · ${b.name}</b><button class="btn sm" data-act="mineExit">Quitter la mine</button></div>
    <div class="mbars">${bar(r.energy, Mine.maxEnergy(), 'xp', `⚡ Énergie ${Math.round(r.energy)} / ${Mine.maxEnergy()}`)}${bar(G.p.hp, S.maxHp, 'hp', `❤ ${fmt(G.p.hp)} / ${fmt(S.maxHp)}`)}${bar(Mine.bagCount(), Mine.cap(), 'mp', `🎒 Sac ${Mine.bagCount()} / ${Mine.cap()}`)}</div>
    <div class="mflex"><div class="mgrid" id="mgrid">${rows.join('')}</div>
    <div class="mside"><div class="panel"><h3>Sac</h3>${Object.keys(m.bag).map(k => `<div>${MATS[k][1]} ${MATS[k][0]} × <b>${m.bag[k]}</b></div>`).join('') || '<em>Vide</em>'}${m.bagGold ? `<div>🪙 ${fmt(m.bagGold)} or</div>` : ''}
      <div class="row wrap"><button class="btn sm primary" data-act="mineSurface" ${r.y === 0 ? '' : 'disabled'}>Déposer à la surface</button><button class="btn sm danger" data-act="mineEvac" ${r.y > 0 ? '' : 'disabled'} data-tip="Retour immédiat, mais 30 % du sac est perdu.">Corde d’évacuation</button></div>
      <div class="row wrap"><button class="btn sm" data-act="mineDrink" ${(G.cons.potion_mp || 0) > 0 && r.energy < Mine.maxEnergy() ? '' : 'disabled'}>💧 Potion (+50 % énergie) ×${G.cons.potion_mp || 0}</button><button class="btn sm" data-act="mineFresh" ${r.y === 0 ? '' : 'disabled'} data-tip="Génère une nouvelle mine (à la surface uniquement).">Nouvelle mine</button></div></div>
      <div class="panel"><h3>Atelier</h3><div>Pioche rang <b>${m.tier}</b>/6 — puissance ${Mine.power()}</div>${m.tier < 6 ? `<div class="row wrap"><small>${fmt(Mine.pickCost().gold)} 🪙 ${Object.keys(Mine.pickCost().mats).map(k => `${MATS[k][1]}${Mine.pickCost().mats[k]}`).join(' ')}</small><button class="btn sm" data-act="mineUp" data-k="pick" ${G.p.gold >= Mine.pickCost().gold && Mats.has(Mine.pickCost().mats) ? '' : 'disabled'}>Améliorer</button></div>` : ''}
        <div>Lanterne rang <b>${m.lamp}</b>/4</div>${m.lamp < 4 ? `<div class="row wrap"><small>${fmt(Mine.lampCost().gold)} 🪙 ${Object.keys(Mine.lampCost().mats).map(k => `${MATS[k][1]}${Mine.lampCost().mats[k]}`).join(' ')}</small><button class="btn sm" data-act="mineUp" data-k="lamp" ${G.p.gold >= Mine.lampCost().gold && Mats.has(Mine.lampCost().mats) ? '' : 'disabled'}>Améliorer</button></div>` : ''}</div></div></div>
    <div class="exlog" id="mmsg">${msg ? esc(msg) : '<em>Cliquez une case voisine (ou utilisez les flèches / ZQSD) pour vous déplacer ou piocher. Les cases rouges sont de la lave.</em>'}</div></div>`;
};
Object.assign(Act, {
  mineCell(d) { const r = Mine.act(+d.x, +d.y); if (U.screen === 'mine') UI.renderMine(r); },
  mineSurface() { const l = Mine.surface(); UI.renderMine(l ? (l.length ? 'Déposé : ' + l.join(', ') : 'Sac vide. Énergie restaurée.') : null); },
  mineEvac() { if (confirm('Utiliser la corde d’évacuation ? 30 % du sac sera perdu.') && Mine.evacuate()) UI.renderMine('Vous remontez en hâte.'); },
  mineDrink() { Mine.drinkEnergy(); UI.renderMine('Énergie restaurée.'); },
  mineFresh() { if (confirm('Générer une nouvelle mine ? Vos blocs déjà minés seront remis en place.')) { Mine.fresh(); UI.renderMine('Une nouvelle mine vous attend.'); } },
  mineUp(d) { if (Mine.upgrade(d.k)) UI.renderMine('Amélioration réussie !'); },
  mineExit() { Game.sync(); UI.show('game'); UI.renderGame(); },
  launchMine() { UI.mine(); }
});
document.addEventListener('keydown', e => {
  if (U.screen !== 'mine' || !G || !G.mine || !G.mine.run) return;
  const r = G.mine.run, k = e.key.toLowerCase(), dir = { arrowup: [0, -1], z: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], q: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
  if (!dir) return; e.preventDefault(); UI.renderMine(Mine.act(r.x + dir[0], r.y + dir[1]));
});

/* ---------- MODE 3 : AVENTURE EN TEMPS RÉEL (inspirée des RPG d'action « à la Cat Quest ») ----------
   Vue de dessus sur canvas. Déplacement libre, attaque, roulade d'esquive, sorts (vos compétences actives),
   ennemis qui télégraphient leurs attaques par une zone rouge. Même personnage, mêmes formules de dégâts,
   mêmes butins, mêmes compteurs de traits que le mode tour par tour. */
const AR_RANGED = ['bow', 'crossbow', 'gun', 'staff', 'wand', 'tome'];
const Arcade = {
  A: null, on: false, raf: 0, cv: null, ctx: null, last: 0, W: 2400, H: 1800,
  init(zid) {
    const Z = ZONE(zid), A = this.A = {
      Z, lvl: clamp(G.p.lvl, Z.min, Z.max), night: !!Z.night, time: 0, kills: 0, corpses: 0, statT: 0, tick: 0, spawnT: 2, bossOn: false, bossDead: false, msg: '', msgT: 0,
      P: { x: this.W / 2, y: this.H / 2, r: 14, face: 0, atkCd: 0, rollCd: 0, roll: 0, rdx: 0, rdy: 0, inv: 0, st: {}, buffs: [], spCd: [0, 0, 0], potCd: 0, focus: false, counter: null, shield: 0, dotT: 1, hurtT: 0 },
      enemies: [], shots: [], eshots: [], teles: [], allies: [], loot: [], chests: [], obst: [], fx: [], keys: {}, btn: {}, joy: { x: 0, y: 0 }, aim: null,
      comp: G.active && G.comp[G.active] ? { x: this.W / 2 - 30, y: this.H / 2, cd: 1 } : null
    };
    for (let i = 0; i < 70; i++) { const x = rnd(60, this.W - 60), y = rnd(60, this.H - 60); if (Math.hypot(x - A.P.x, y - A.P.y) > 160) A.obst.push({ x, y, r: rnd(18, 34), k: Z.id }); }
    for (let i = 0; i < 6; i++) A.chests.push({ x: rnd(120, this.W - 120), y: rnd(120, this.H - 120), open: false });
    A.S = Stats.get(); A.E = Stats.sum(); A.spells = Skills.actives().slice(0, 3);
    for (let i = 0; i < 12; i++) this.spawn(true);
    return A;
  },
  start(zid) {
    const Z = ZONE(zid); if (!Z || G.flags.inCombat || G.p.lvl < Z.min - 1) { UI.toast('Zone inaccessible pour le moment.', 'bad'); return; }
    this.init(zid); this.on = true; U.returnTo = null; UI.show('arcade'); this.bind(); this.resize(); this.last = performance.now();
    bump('arcadeRuns'); this.raf = requestAnimationFrame(t => this.frame(t));
  },
  stop() {
    this.on = false; cancelAnimationFrame(this.raf); this.unbind(); Game.sync(); UI.show('game'); UI.renderGame();
  },
  /* --- apparition --- */
  spawn(far) {
    const A = this.A, Z = A.Z; let x, y, g = 0;
    do { x = rnd(80, this.W - 80); y = rnd(80, this.H - 80); } while (Math.hypot(x - A.P.x, y - A.P.y) < (far ? 380 : 520) && g++ < 20);
    const tpl = pick(Z.enemies), elite = chance(.1) && A.lvl >= Z.min;
    const e = Enemies.make(tpl, elite ? A.lvl + 1 : clamp(A.lvl + rint(-1, 0), 1, 999), elite ? 'elite' : undefined);
    this.rt(e, x, y); A.enemies.push(e); return e;
  },
  rt(e, x, y) { Object.assign(e, { x, y, r: e.boss ? 34 : e.tier === 'elite' ? 20 : 14, sp: clamp(48 + e.spd * 2.2, 48, 150), cd: rnd(.6, 1.6), flash: 0, tickT: 1, aggro: false, wob: rnd(0, 6) }); },
  txt(x, y, t, col = '#fff') { this.A.fx.push({ x, y, t, col, life: .9 }); },
  say(m) { this.A.msg = m; this.A.msgT = 3.5; },
  buffV(k) { return this.A.P.buffs.filter(b => b.k === k && b.t > 0).reduce((s, b) => s + b.v, 0); },
  nearest(x, y, maxD = 1e9) { let b = null, bd = maxD; for (const e of this.A.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; b = e; } } return b; },

  /* --- dégâts infligés aux ennemis (mêmes formules que le combat) --- */
  hitEnemy(e, m, o = {}) {
    const A = this.A, S = A.S, E = A.E; if (e.dead) return 0;
    if (e.dodge && !o.sure && chance(Math.max(0, e.dodge - S.prec) / 100)) { this.txt(e.x, e.y - 24, 'Raté', '#aaa'); return 0; }
    const type = o.t || Combat.wtype(); let raw = (type === 'mag' ? S.mag : S.atk) * m * rnd(.9, 1.1);
    const bonus = this.buffV('atk') + (o.skill ? (E.skillPct || 0) : 0) + (e.boss ? (E.dmgBossPct || 0) : 0) + (e.mark ? e.mark.v : 0) + (A.night ? (E.nightAtk || 0) : 0);
    raw *= (1 + bonus) * mitig(e.def * (1 - S.pen / 100), e.lvl) * (1 - clamp(e.res[o.el || 'phys'] || 0, -1, .9));
    const crit = o.crit || (!o.skill && A.P.focus) || chance((S.crit + (o.cb || 0) + this.buffV('crit')) / 100);
    if (crit) { raw *= 1.6 + (E.critDmg || 0); bump('crits'); if (!o.skill) A.P.focus = false; }
    const dmg = Math.max(1, Math.round(raw)); e.hp -= dmg; e.flash = .12; bump('dmgDealt', dmg);
    this.txt(e.x + rnd(-8, 8), e.y - 26, (crit ? '✦' : '') + dmg, crit ? '#f1d58a' : '#fff');
    if (E.lifesteal) { const h = Player.heal(dmg * E.lifesteal * (1 + (E.healPct || 0))); if (h) this.txt(A.P.x, A.P.y - 30, '+' + h, '#6cc07a'); }
    if (!o.noHit && o.by !== 'ally') for (const [id, key, t] of [['bleed', 'hitBleed', 3], ['burn', 'hitBurn', 3], ['freeze', 'hitFreeze', 1], ['poison', 'hitPoison', 4]]) if (E[key]) this.applyE(e, id, t, E[key]);
    if (o.st) this.applyE(e, o.st[0], o.st[2], o.st[1]); if (o.st2) this.applyE(e, o.st2[0], o.st2[2], o.st2[1]);
    if (e.hp <= 0) this.kill(e, { by: o.by || 'player', el: o.el || 'phys', skill: !!o.skill, crit }); else this.phase(e);
    return dmg;
  },
  applyE(e, id, t, ch = 1) {
    const A = this.A, S = A.S, E = A.E, sd = STATUS[id], res = e.res[sd.res] || 0;
    if (e.dead || res >= .9) return false; if (e.boss && sd.skip && (e.cdStun > 0 || e.st[id])) return false;
    if (!chance(ch * (1 + (E.statusChance || 0)) * (1 - Math.max(0, res)))) return false;
    e.st[id] = { t: t * (sd.skip ? 1 : 1.2), pow: Math.max(1, (S.atk + S.mag) / 2 * .3 * (1 + (E.dotPct || 0))) };
    if (e.boss && sd.skip) e.cdStun = 5; bump('statusApplied'); this.txt(e.x, e.y - 40, sd.i, '#c79ae8'); return true;
  },
  phase(e) {
    while (e.boss && e.phases[e.phase] && e.hp <= e.maxHp * e.phases[e.phase].at && !e.dead) {
      const p = e.phases[e.phase++]; this.say(p.msg); if (p.enrage) e.atk *= 1 + p.enrage; if (p.heal) e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * p.heal)); if (p.add) e.cycle.push(...p.add);
      if (p.summon) for (let i = 0; i < (p.n || 1); i++) { const m = Enemies.make(p.summon, Math.max(1, e.lvl - 3), 'minion'); this.rt(m, e.x + rnd(-80, 80), e.y + rnd(-80, 80)); m.aggro = true; this.A.enemies.push(m); }
    }
  },
  kill(e, o = {}) {
    const A = this.A, E = A.E; if (e.dead) return;
    if (e.boss && e.resurrect && !e.resUsed) { e.resUsed = true; e.hp = Math.round(e.maxHp * .4); e.st = {}; this.say(`${e.n} se relève !`); return; }
    e.dead = true; A.kills++; A.corpses++;
    bump('kills'); bump('arcadeKills'); bump('k_' + e.tpl); bump('kz_' + A.Z.id); bump(A.Z.night ? 'nightKills' : 'dayKills');
    if (e.tier === 'elite') bump('killsElite'); if (e.boss) { bump('killsBoss'); bump('bk_' + e.tpl); if (e.lvl >= G.p.lvl + 4) bump('giantKills'); }
    if (o.dot) bump('dotKills'); if (o.by === 'summon') bump('summonKills'); if (o.by === 'ally') bump('compKills');
    if (o.by === 'player') { if (o.el) bump('ek_' + o.el); if (o.skill) bump('killsSkill'); else bump('killsBasic'); if (o.crit) bump('killsCrit'); if (G.eq.weapon && G.eq.weapon.cat) { G.c.wcats = G.c.wcats || {}; G.c.wcats[G.eq.weapon.cat] = 1; } }
    if (E.onKillMp) Player.restoreMp(E.onKillMp);
    if (e.minion) return;
    const rm = .85 * (DIFFICULTY[G.p.diff || 'normal'] || DIFFICULTY.normal).rew, tm = e.tier === 'boss' ? 6 : e.tier === 'elite' ? 2.5 : 1;
    let x = 12 * Math.pow(e.lvl, 1.3) * tm; if (G.p.lvl > e.lvl + 9) x *= .25; else if (G.p.lvl > e.lvl + 4) x *= .5;
    x = Math.round(x * rm * (1 + (E.xpPct || 0))); const g = Math.round((6 + e.lvl * 3) * rnd(.7, 1.3) * (e.tier === 'boss' ? 8 : e.tier === 'elite' ? 2.5 : 1) * rm * (1 + (E.goldPct || 0)));
    Player.addXp(x); Player.gold(g); this.txt(e.x, e.y - 50, `+${x} XP`, '#d9b862');
    if (chance(e.tier === 'boss' ? 1 : e.tier === 'elite' ? .75 : .15)) A.loot.push({ x: e.x, y: e.y, k: 'item', it: genItem({ ilvl: e.lvl + (e.boss ? 2 : 0), luck: E.lootLuck || 0, minR: e.boss ? 2 : e.tier === 'elite' ? 1 : 0, boss: e.boss }) });
    if (e.boss && G.bosses[e.tpl] !== true) { G.bosses[e.tpl] = true; A.loot.push({ x: e.x, y: e.y, k: 'item', it: bossUnique(e.tpl, e.lvl) }); }
    const pool = A.Z.mats; if (pool.length && chance(e.tier === 'normal' ? .5 : 1)) A.loot.push({ x: e.x + rnd(-20, 20), y: e.y + rnd(-20, 20), k: 'mat', id: pick(pool), n: e.tier === 'boss' ? rint(3, 5) : e.tier === 'elite' ? rint(2, 3) : rint(1, 2) });
    if (chance(.1)) A.loot.push({ x: e.x, y: e.y, k: 'cons', id: pick(['potion_hp', 'potion_mp', 'antidote']) });
    if (e.boss) { A.bossDead = true; this.say(`${e.n} est vaincu !`); }
    if (A.kills % 5 === 0) Game.sync();
  },

  /* --- dégâts subis par le joueur --- */
  hurtP(e, sk) {
    const A = this.A, P = A.P, S = A.S, E = A.E;
    if (chance(S.dodge / 100)) { bump('dodges'); this.txt(P.x, P.y - 30, 'Esquive', '#9ad'); return; }
    const magic = !!(sk.el && sk.el !== 'phys'), defV = (magic ? S.mres : S.def) * (1 + this.buffV('def'));
    let raw = e.atk * (1 + e.buffAtk) * sk.m * rnd(.9, 1.1) * mitig(defV, S.lvl);
    if (magic) raw *= 1 - clamp(E['res' + sk.el.charAt(0).toUpperCase() + sk.el.slice(1)] || 0, -.5, .75);
    raw *= clamp(1 + (E.dmgTakenPct || 0), .25, 1.5); let d = Math.max(1, Math.round(raw));
    if (P.shield > 0) { const a = Math.min(P.shield, d); P.shield -= a; d -= a; bump('shieldAbs', a); }
    if (d > 0) {
      G.p.hp -= d; bump('dmgTaken', d); P.hurtT = .25; this.txt(P.x, P.y - 30, '-' + d, '#ff8a8a'); if (d >= S.maxHp * .5) bump('bigHits');
      if (sk.drain) e.hp = Math.min(e.maxHp, e.hp + Math.round(d * sk.drain));
      for (const s of [sk.st, sk.st2]) if (s && chance(s[1] * (1 - S.sres / 100))) { const sd = STATUS[s[0]]; P.st[s[0]] = { t: s[2] * (sd.skip ? 1 : 1.2), pow: Math.max(1, e.atk * .22) }; bump('statusTaken'); this.txt(P.x, P.y - 44, sd.i, '#c79ae8'); }
    }
    if (P.counter && !e.dead) { bump('counters'); this.hitEnemy(e, P.counter.m, { by: 'player' }); }
    if (E.thorns && d > 0 && !e.dead) { const t = Math.max(1, Math.round(d * E.thorns)); bump('thornsDmg', t); e.hp -= t; if (e.hp <= 0) this.kill(e, { by: 'player' }); }
    if (G.p.hp <= 0) { if (E.revive && !P.revived) { P.revived = true; G.p.hp = 1; bump('lastStands'); this.say('Une force ancienne vous retient !'); } else this.die(); }
  },
  die() {
    const A = this.A, P = A.P, S = A.S; bump('deaths'); const loss = Math.floor(G.p.gold * (DIFFICULTY[G.p.diff || 'normal'] || DIFFICULTY.normal).loss * (1 - clamp(A.E.deathMit || 0, 0, 1)) * .6);
    G.p.gold -= loss; G.p.hp = Math.round(S.maxHp * .5); P.x = this.W / 2; P.y = this.H / 2; P.st = {}; P.buffs = []; P.shield = 0; P.revived = false;
    for (const e of A.enemies) { e.aggro = false; if (Math.hypot(e.x - P.x, e.y - P.y) < 350) { e.x += 500; } } A.teles = []; A.eshots = [];
    this.say(`Vous êtes vaincu… (−${loss} or). Vous reprenez connaissance au point de départ.`); Game.sync();
  },

  /* --- actions du joueur --- */
  attack() {
    const A = this.A, P = A.P, S = A.S; if (P.atkCd > 0 || P.roll > 0 || P.st.stun || P.st.freeze) return;
    const t = this.nearest(P.x, P.y, 420); if (A.aim) P.face = A.aim; else if (t) P.face = Math.atan2(t.y - P.y, t.x - P.x);
    P.atkCd = clamp(.85 - S.spd * .012, .32, .85); P.swing = .18; const w = G.eq.weapon, ranged = w && AR_RANGED.includes(w.cat) || (!w && false);
    if (ranged) A.shots.push({ x: P.x, y: P.y, vx: Math.cos(P.face) * 560, vy: Math.sin(P.face) * 560, r: 7, life: .7, m: 1, el: 'phys', basic: true });
    else for (const e of A.enemies) { if (e.dead) continue; const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); if (d > 86 + e.r) continue; let da = Math.abs(Math.atan2(dy, dx) - P.face); da = Math.min(da, Math.PI * 2 - da); if (da < 1.15 || d < e.r + 22) this.hitEnemy(e, 1, {}); }
  },
  roll() {
    const A = this.A, P = A.P; if (P.rollCd > 0 || P.st.stun || P.st.freeze) return;
    let dx = (A.keys.d || A.keys.arrowright ? 1 : 0) - (A.keys.q || A.keys.a || A.keys.arrowleft ? 1 : 0) + A.joy.x, dy = (A.keys.s || A.keys.arrowdown ? 1 : 0) - (A.keys.z || A.keys.w || A.keys.arrowup ? 1 : 0) + A.joy.y;
    if (!dx && !dy) { dx = Math.cos(P.face); dy = Math.sin(P.face); } const l = Math.hypot(dx, dy) || 1; P.rdx = dx / l; P.rdy = dy / l; P.roll = .22; P.inv = .32; P.rollCd = 1.0; bump('rolls');
  },
  cast(i) {
    const A = this.A, P = A.P, S = A.S, E = A.E, id = A.spells[i]; if (!id || P.spCd[i] > 0 || P.st.stun || P.st.freeze) return;
    const d = SK[id], f = d.fx, cost = Skills.cost(id); if (G.p.mp < cost) { this.say('Mana insuffisant.'); return; }
    const rank = G.sk[id], aug = G.aug[id], pm = (1 + .2 * (rank - 1)) * (aug === 'power' ? 1.25 : 1);
    G.p.mp -= cost; bump('manaSpent', cost); bump('skillsUsed'); if (f.aoe) bump('aoeUses'); P.spCd[i] = Math.max(.8, Skills.cdOf(id) * 2.2 + 1.2);
    const tgt = this.nearest(P.x, P.y, 600); if (tgt) P.face = Math.atan2(tgt.y - P.y, tgt.x - P.x);
    switch (f.k) {
      case 'dmg': {
        if (f.selfDmg) { G.p.hp = Math.max(1, G.p.hp - Math.round(S.maxHp * f.selfDmg)); bump('selfHarm'); }
        let m = f.m; if (f.corpse) m = f.m + f.per * Math.min(A.corpses, 8); A.corpses = 0;
        const base = { t: f.t, el: f.el, skill: true, cb: f.cb, st: f.st, st2: f.st2, m: m * pm, hits: f.hits || 1, exec: f.exec, hd: f.hd, hs: f.hs, steal: f.steal };
        if (f.aoe) { let dealt = 0; for (const e of [...A.enemies]) if (!e.dead && Math.hypot(e.x - P.x, e.y - P.y) < 210 + e.r) dealt += this.spellHit(e, base); A.fx.push({ x: P.x, y: P.y, ring: 210, life: .35, col: '#4fb3a5' }); this.spellExtra(base, dealt); }
        else A.shots.push(Object.assign({ x: P.x, y: P.y, vx: Math.cos(P.face) * 520, vy: Math.sin(P.face) * 520, r: 10, life: 1, spell: base, el: f.el || 'phys' }, {}));
        break;
      }
      case 'heal': { const h = Player.heal(S.maxHp * f.f * pm * (1 + (E.healPct || 0))); this.txt(P.x, P.y - 30, '+' + h, '#6cc07a'); if (f.cleanse) P.st = {}; break; }
      case 'buff': { for (const k in f.b) P.buffs.push({ k, v: f.b[k] * pm, t: f.t * 2.5 }); if (f.hs) { const h = Player.heal(S.maxHp * f.hs * (1 + (E.healPct || 0))); if (h) this.txt(P.x, P.y - 30, '+' + h, '#6cc07a'); } this.txt(P.x, P.y - 44, '⬆', '#f1d58a'); break; }
      case 'summon': { for (let k = 0; k < f.cnt; k++) A.allies.push({ x: P.x + rnd(-30, 30), y: P.y + rnd(-30, 30), pow: f.pow * pm, life: f.t * 2.5, cd: .5, n: f.n }); bump('summonsUsed'); if (A.allies.length >= 3) bump('tripleSummon'); break; }
      case 'counter': P.counter = { m: f.m * pm, t: f.t * 2.5 }; break;
      case 'extra': Player.restoreMp(S.maxMp * (f.mpf || 0)); P.spCd = [0, 0, 0]; P.atkCd = 0; this.txt(P.x, P.y - 40, '⏱', '#f1d58a'); break;
      case 'focus': Player.restoreMp(S.maxMp * f.mpf * pm); P.focus = true; this.txt(P.x, P.y - 40, '🎯', '#f1d58a'); break;
      case 'mark': if (tgt) tgt.mark = { v: f.v * pm, t: f.t * 2.5 }; break;
    }
  },
  spellHit(e, b) { let dealt = 0; for (let h = 0; h < b.hits; h++) { if (e.dead) break; let mm = b.m; if (b.exec && e.hp / e.maxHp < .4) mm *= 1 + b.exec; dealt += this.hitEnemy(e, mm, b); } return dealt; },
  spellExtra(b, dealt) {
    const A = this.A, S = A.S, E = A.E;
    if (b.hd && dealt > 0) Player.heal(dealt * b.hd * (1 + (E.healPct || 0))); if (b.hs) Player.heal(S.maxHp * b.hs * (1 + (E.healPct || 0)));
    if (b.steal && dealt > 0) { const g = Math.round(S.lvl * rint(3, 8) * (1 + (E.goldPct || 0))); Player.gold(g); this.txt(A.P.x, A.P.y - 44, '+' + g + '🪙', '#f1d58a'); }
  },
  potion() { const A = this.A, P = A.P; if (P.potCd > 0 || (G.cons.potion_hp || 0) < 1) return; G.cons.potion_hp--; P.potCd = 1.2; const h = Player.heal(A.S.maxHp * CONS.potion_hp.f * (1 + (A.E.potionPct || 0) + (A.E.healPct || 0))); bump('potions'); this.txt(P.x, P.y - 30, '+' + h, '#6cc07a'); },

  /* --- mise à jour --- */
  collide(o, r, list) { for (const ob of list) { const dx = o.x - ob.x, dy = o.y - ob.y, d = Math.hypot(dx, dy), m = ob.r + r; if (d < m && d > 0) { o.x = ob.x + dx / d * m; o.y = ob.y + dy / d * m; } } },
  update(dt) {
    const A = this.A, P = A.P; A.time += dt; A.tick += dt; A.statT -= dt;
    if (A.statT <= 0) { A.S = Stats.get(); A.E = Stats.sum(); A.statT = .3; A.spells = Skills.actives().slice(0, 3); }
    const S = A.S, E = A.E; if (A.msgT > 0) A.msgT -= dt;
    if (A.tick >= 1) { A.tick -= 1; bump('arcadeSeconds'); }
    // entrées
    let mx = (A.keys.d || A.keys.arrowright ? 1 : 0) - (A.keys.q || A.keys.a || A.keys.arrowleft ? 1 : 0) + A.joy.x, my = (A.keys.s || A.keys.arrowdown ? 1 : 0) - (A.keys.z || A.keys.w || A.keys.arrowup ? 1 : 0) + A.joy.y;
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const stun = P.st.stun || P.st.freeze;
    if (P.roll > 0) { P.roll -= dt; P.x += P.rdx * 520 * dt; P.y += P.rdy * 520 * dt; }
    else if (!stun && ml > .05) { const sp = clamp(140 + S.spd * 3.2, 140, 300); P.x += mx * sp * dt; P.y += my * sp * dt; P.face = Math.atan2(my, mx); }
    this.collide(P, P.r, A.obst); P.x = clamp(P.x, 20, this.W - 20); P.y = clamp(P.y, 20, this.H - 20);
    for (const k of ['atkCd', 'rollCd', 'inv', 'potCd', 'hurtT', 'swing']) if (P[k] > 0) P[k] -= dt; for (let i = 0; i < 3; i++) if (P.spCd[i] > 0) P.spCd[i] -= dt;
    P.buffs = P.buffs.filter(b => (b.t -= dt) > 0); if (P.counter && (P.counter.t -= dt) <= 0) P.counter = null;
    if (A.btn.attack || A.keys.j || A.keys.k) this.attack();
    // régénération & statuts
    const calm = !this.nearest(P.x, P.y, 320);
    Player.restoreMp((S.maxMp * .012 + (E.mpRegen || 0) * .4) * dt); const rg = this.buffV('regen') + (E.regenTurn || 0) * .5 + (calm ? .004 : 0);
    if (rg) { A._rg = (A._rg || 0) + S.maxHp * rg * dt; if (A._rg >= 1) { Player.heal(Math.floor(A._rg)); A._rg -= Math.floor(A._rg); } }
    P.dotT -= dt;
    for (const id of Object.keys(P.st)) { const s = P.st[id]; s.t -= dt; if (s.t <= 0) { delete P.st[id]; continue; } if (!STATUS[id].skip && P.dotT <= 0) { const dd = Math.max(1, Math.round(s.pow * STATUS[id].k)); G.p.hp -= dd; bump('dmgTaken', dd); this.txt(P.x, P.y - 30, '-' + dd, '#c79ae8'); if (G.p.hp <= 0) this.die(); } }
    if (P.dotT <= 0) P.dotT = 1;
    // coffres
    for (const c of A.chests) if (!c.open && Math.hypot(c.x - P.x, c.y - P.y) < 34) { c.open = true; const lines = Explore.chest(A.Z); this.say('🎁 Coffre : ' + lines.join(', ')); Game.sync(); }
    // ennemis
    for (const e of A.enemies) { if (!e.dead) this.updEnemy(e, dt); }
    A.enemies = A.enemies.filter(e => !e.dead);
    A.spawnT -= dt; const cap = 12 + Math.min(8, Math.floor(G.p.lvl / 10)); if (A.spawnT <= 0 && A.enemies.filter(e => !e.minion).length < cap) { this.spawn(false); A.spawnT = 3.5; }
    if (!A.bossOn && A.kills >= 25 && !A.bossDead) { const bid = DUNGEON(A.Z.dungeons[0]).boss, b = Enemies.make(bid, clamp(A.lvl + 2, 1, 999)); let bx = P.x < this.W / 2 ? this.W - 200 : 200, by = P.y < this.H / 2 ? this.H - 200 : 200; this.rt(b, bx, by); b.aggro = false; A.enemies.push(b); A.bossOn = true; this.say(`⚠ ${b.n} est apparu aux confins de la zone !`); }
    // télégraphes
    for (const t of A.teles) {
      t.t += dt; if (t.t < t.dur) continue; t.done = true; const e = t.e; if (e.dead) continue;
      if (t.kind === 'melee') { if (Math.hypot(P.x - t.x, P.y - t.y) < t.r + P.r) { if (P.inv > 0) { bump('dodges'); bump('rollDodges'); this.txt(P.x, P.y - 30, 'Roulade !', '#9ad'); } else this.hurtP(e, t.sk); } }
      else A.eshots.push({ x: e.x, y: e.y, vx: Math.cos(t.a) * 290, vy: Math.sin(t.a) * 290, r: 10, life: 2.2, e, sk: t.sk, el: t.sk.el });
    }
    A.teles = A.teles.filter(t => !t.done);
    for (const s of A.eshots) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (!s.dead && Math.hypot(P.x - s.x, P.y - s.y) < s.r + P.r) { s.dead = true; if (P.inv > 0) { bump('dodges'); bump('rollDodges'); this.txt(P.x, P.y - 30, 'Roulade !', '#9ad'); } else this.hurtP(s.e, s.sk); } }
    A.eshots = A.eshots.filter(s => s.life > 0 && !s.dead);
    // projectiles du joueur
    for (const s of A.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      for (const e of A.enemies) { if (e.dead || s.dead) continue; if (Math.hypot(e.x - s.x, e.y - s.y) < e.r + s.r) { s.dead = true; if (s.spell) { const dealt = this.spellHit(e, s.spell); this.spellExtra(s.spell, dealt); } else this.hitEnemy(e, s.m, { el: s.el }); } }
    }
    A.shots = A.shots.filter(s => s.life > 0 && !s.dead);
    // invocations et compagnon
    for (const al of A.allies) {
      al.life -= dt; al.cd -= dt; const t = this.nearest(al.x, al.y, 500);
      if (t) { const d = Math.hypot(t.x - al.x, t.y - al.y); if (d > 36) { al.x += (t.x - al.x) / d * 150 * dt; al.y += (t.y - al.y) / d * 150 * dt; } else if (al.cd <= 0) { al.cd = .9; bump('summonDmg', 0); this.hitEnemy(t, al.pow * (1 + (E.summonPct || 0)), { by: 'summon', noHit: true, sure: true }); } }
      else { const d = Math.hypot(P.x - al.x, P.y - al.y); if (d > 60) { al.x += (P.x - al.x) / d * 120 * dt; al.y += (P.y - al.y) / d * 120 * dt; } }
    }
    A.allies = A.allies.filter(a => a.life > 0);
    if (A.comp) this.updComp(dt);
    // butin au sol
    for (const l of A.loot) {
      const d = Math.hypot(P.x - l.x, P.y - l.y); if (d < 110) { l.x += (P.x - l.x) / d * 260 * dt; l.y += (P.y - l.y) / d * 260 * dt; }
      if (d < 20) { l.got = true; if (l.k === 'item') { Inv.add(l.it, 'drop'); this.txt(P.x, P.y - 50, l.it.name, RARITIES[l.it.r].c); } else if (l.k === 'mat') { Mats.add(l.id, l.n); this.txt(P.x, P.y - 50, `${MATS[l.id][1]}+${l.n}`, '#fff'); } else { G.cons[l.id] = (G.cons[l.id] || 0) + 1; this.txt(P.x, P.y - 50, CONS[l.id].i, '#fff'); } }
    }
    A.loot = A.loot.filter(l => !l.got);
    for (const f of A.fx) { f.life -= dt; if (f.t) f.y -= 28 * dt; } A.fx = A.fx.filter(f => f.life > 0);
  },
  updEnemy(e, dt) {
    const A = this.A, P = A.P, S = A.S; e.flash = Math.max(0, e.flash - dt); e.cd -= dt; if (e.cdStun > 0) e.cdStun -= dt; if (e.mark && (e.mark.t -= dt) <= 0) delete e.mark;
    if (e.buffT > 0 && (e.buffT -= dt) <= 0) e.buffAtk = 0;
    e.tickT -= dt; const tick = e.tickT <= 0; if (tick) e.tickT = 1;
    for (const id of Object.keys(e.st)) { const s = e.st[id]; s.t -= dt; if (s.t <= 0) { delete e.st[id]; continue; } if (tick && !STATUS[id].skip) { const dd = Math.max(1, Math.round(s.pow * STATUS[id].k)); e.hp -= dd; bump('dmgDealt', dd); this.txt(e.x, e.y - 24, '-' + dd, '#c79ae8'); if (e.hp <= 0) { this.kill(e, { dot: true }); return; } } }
    if (e.st.stun || e.st.freeze) return;
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy), reach = e.r + 46;
    if (d < 380 || e.boss && d < 700) e.aggro = true; if (d > 900 && !e.boss) e.aggro = false;
    if (!e.aggro) { e.wob += dt; e.x += Math.cos(e.wob) * 12 * dt; e.y += Math.sin(e.wob * 1.3) * 12 * dt; return; }
    const busy = A.teles.some(t => t.e === e);
    if (d > reach * .8 && !busy) { e.x += dx / d * e.sp * dt; e.y += dy / d * e.sp * dt; }
    this.collide(e, e.r, A.obst);
    if (d <= reach + 24 + (e.boss ? 40 : 0) && e.cd <= 0 && !busy && P.inv <= 0.01) {
      const id = Enemies.intent(e), sk = ESK[id] || ESK.strike;
      if (sk.buff) { e.buffAtk = sk.buff; e.buffT = 6; this.txt(e.x, e.y - 40, '📣', '#ffb347'); e.cd = 2; }
      else if (sk.healSelf) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * sk.healSelf); this.txt(e.x, e.y - 40, '+', '#6cc07a'); e.cd = 2; }
      else { const magic = sk.el && sk.el !== 'phys', a = Math.atan2(dy, dx); A.teles.push({ e, sk, kind: magic ? 'bolt' : 'melee', t: 0, dur: sk.warn ? 1.1 : .7, a, x: e.x + Math.cos(a) * (e.r + 24), y: e.y + Math.sin(a) * (e.r + 24), r: (sk.warn ? 70 : 52) + (e.boss ? 24 : 0) }); e.cd = (e.boss ? 1.5 : 2) + rnd(0, .8); }
    }
  },
  updComp(dt) {
    const A = this.A, P = A.P, S = A.S, E = A.E, c = A.comp, d = COMPS[G.active], cc = G.comp[G.active], sk = d.skill;
    const dx = P.x - c.x, dy = P.y - c.y, dist = Math.hypot(dx, dy); if (dist > 70) { c.x += dx / dist * 170 * dt; c.y += dy / dist * 170 * dt; }
    c.cd -= dt; if (c.cd > 0) return; const atk = (d.atk + cc.lvl * d.grow) * (1 + (E.companionPct || 0));
    if (sk.k === 'heal') { if (G.p.hp / S.maxHp < .65) { const h = Player.heal(S.maxHp * sk.m * (1 + (E.healPct || 0))); bump('compHeals'); this.txt(P.x, P.y - 30, '+' + h, '#6cc07a'); c.cd = sk.cd * 2.2; return; } }
    else if (sk.k === 'shield') { if (P.shield <= 0) { P.shield = Math.round(S.maxHp * sk.m * (1 + cc.lvl * .01)); c.cd = sk.cd * 2.2; this.txt(P.x, P.y - 40, '🛡', '#8fb7e8'); return; } }
    const t = this.nearest(c.x, c.y, 330); if (!t) { c.cd = .4; return; }
    if (sk.k === 'poison' && chance(.3)) { for (const e of A.enemies) if (Math.hypot(e.x - c.x, e.y - c.y) < 260) this.applyE(e, 'poison', 4, 1); c.cd = sk.cd * 2; return; }
    const hits = sk.k === 'dmg' && chance(.35) ? sk.hits || 1 : 1; for (let i = 0; i < hits; i++) { const raw = atk * (hits > 1 ? sk.m : .6) * rnd(.9, 1.1) * mitig(t.def, t.lvl) * (1 - clamp(t.res.phys || 0, -1, .9)); this.txt(t.x, t.y - 20, '' + Math.round(raw), '#8fb7e8'); t.hp -= raw; bump('dmgDealt', Math.round(raw)); if (t.hp <= 0) { this.kill(t, { by: 'ally' }); break; } else this.phase(t); }
    c.cd = 1.3;
  },

  /* --- boucle, rendu, entrées --- */
  frame(now) {
    if (!this.on) return; const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    try { this.update(dt); this.render(); } catch (e) { console.error(e); }
    this.raf = requestAnimationFrame(t => this.frame(t));
  },
  resize() { const cv = this.cv = $id('ar-cv'); if (!cv) return; const r = cv.parentElement.getBoundingClientRect(); cv.width = Math.max(320, Math.floor(r.width)); cv.height = Math.max(240, Math.floor(r.height)); this.ctx = cv.getContext && cv.getContext('2d'); },
  render() {
    const c = this.ctx, A = this.A; if (!c) return; const cv = this.cv, W = cv.width, H = cv.height, P = A.P, S = A.S;
    const cx = clamp(P.x - W / 2, 0, Math.max(0, this.W - W)), cy = clamp(P.y - H / 2, 0, Math.max(0, this.H - H));
    const gcol = { plaines: '#3f6b3a', foret: '#2c5a34', marais: '#2e3d3a', montagne: '#5b4c45', cimetiere: '#3a3646', abysses: '#2c3f66' }[A.Z.id] || '#3a5a3a';
    c.fillStyle = gcol; c.fillRect(0, 0, W, H); c.save(); c.translate(-cx, -cy);
    c.fillStyle = 'rgba(255,255,255,.04)'; for (let x = 0; x < this.W; x += 120) c.fillRect(x, 0, 2, this.H); for (let y = 0; y < this.H; y += 120) c.fillRect(0, y, this.W, 2);
    c.textAlign = 'center'; c.textBaseline = 'middle'; const ob = { plaines: '🪨', foret: '🌲', marais: '🌿', montagne: '⛰️', cimetiere: '🪦', abysses: '💎' }[A.Z.id];
    c.font = '34px serif'; for (const o of A.obst) c.fillText(ob, o.x, o.y);
    for (const ch of A.chests) { c.font = '26px serif'; c.fillText(ch.open ? '📭' : '🎁', ch.x, ch.y); }
    for (const t of A.teles) { const k = t.t / t.dur; c.fillStyle = `rgba(220,50,50,${.18 + .3 * k})`; c.beginPath(); c.arc(t.x, t.y, t.r, 0, 7); c.fill(); c.fillStyle = 'rgba(220,50,50,.5)'; c.beginPath(); c.arc(t.x, t.y, t.r * k, 0, 7); c.fill(); if (t.kind === 'bolt') { c.strokeStyle = 'rgba(255,120,60,.6)'; c.beginPath(); c.moveTo(t.e.x, t.e.y); c.lineTo(t.e.x + Math.cos(t.a) * 300, t.e.y + Math.sin(t.a) * 300); c.stroke(); } }
    for (const l of A.loot) { c.font = '20px serif'; c.fillText(l.k === 'item' ? l.it.ico : l.k === 'mat' ? MATS[l.id][1] : CONS[l.id].i, l.x, l.y); if (l.k === 'item') { c.strokeStyle = RARITIES[l.it.r].c; c.lineWidth = 2; c.beginPath(); c.arc(l.x, l.y, 14, 0, 7); c.stroke(); } }
    for (const e of A.enemies) {
      c.font = (e.r * 2.1) + 'px serif'; c.globalAlpha = e.flash > 0 ? .5 : 1; c.fillText(e.i, e.x, e.y); c.globalAlpha = 1;
      c.fillStyle = '#000'; c.fillRect(e.x - e.r, e.y - e.r - 12, e.r * 2, 5); c.fillStyle = e.tier === 'boss' ? '#e06070' : e.tier === 'elite' ? '#a463f2' : '#c8505a'; c.fillRect(e.x - e.r, e.y - e.r - 12, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 5);
      c.font = '10px sans-serif'; c.fillStyle = '#fff'; c.fillText('niv.' + e.lvl, e.x, e.y - e.r - 18); const stt = Object.keys(e.st).map(k => STATUS[k].i).join(''); if (stt) c.fillText(stt, e.x, e.y + e.r + 10);
    }
    for (const al of A.allies) { c.font = '20px serif'; c.fillText('💀', al.x, al.y); }
    if (A.comp) { c.font = '24px serif'; c.fillText(COMPS[G.active].i, A.comp.x, A.comp.y); }
    if (P.shield > 0) { c.strokeStyle = 'rgba(140,180,255,.7)'; c.lineWidth = 3; c.beginPath(); c.arc(P.x, P.y, 22, 0, 7); c.stroke(); }
    if (P.swing > 0) { c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 5; c.beginPath(); c.arc(P.x, P.y, 70, P.face - 1.1, P.face + 1.1); c.stroke(); }
    c.globalAlpha = P.inv > 0 ? .45 : 1; c.font = '30px serif'; c.fillText(PORTRAITS[G.p.portrait], P.x, P.y); c.globalAlpha = 1;
    for (const s of A.shots) { c.fillStyle = s.spell ? '#4fb3a5' : '#f1d58a'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 7); c.fill(); }
    for (const s of A.eshots) { c.fillStyle = '#ff7a3c'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 7); c.fill(); }
    for (const f of A.fx) { if (f.ring) { c.strokeStyle = f.col; c.lineWidth = 4; c.globalAlpha = f.life * 2; c.beginPath(); c.arc(f.x, f.y, f.ring * (1 - f.life), 0, 7); c.stroke(); c.globalAlpha = 1; } else { c.font = 'bold 15px sans-serif'; c.fillStyle = f.col; c.globalAlpha = clamp(f.life * 1.6, 0, 1); c.fillText(f.t, f.x, f.y); c.globalAlpha = 1; } }
    c.restore();
    if (A.night) { const g = c.createRadialGradient(P.x - cx, P.y - cy, 80, P.x - cx, P.y - cy, 330); g.addColorStop(0, 'rgba(5,5,20,0)'); g.addColorStop(1, 'rgba(5,5,20,.72)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    // HUD
    const bar = (x, y, w, v, col, txt) => { c.fillStyle = '#000a'; c.fillRect(x, y, w, 14); c.fillStyle = col; c.fillRect(x, y, w * clamp(v, 0, 1), 14); c.fillStyle = '#fff'; c.font = '11px sans-serif'; c.textAlign = 'left'; c.fillText(txt, x + 4, y + 8); c.textAlign = 'center'; };
    bar(10, 10, 190, G.p.hp / S.maxHp, '#c8505a', `❤ ${fmt(G.p.hp)}/${fmt(S.maxHp)}`); bar(10, 28, 190, G.p.mp / S.maxMp, '#3f9a8e', `✦ ${fmt(G.p.mp)}/${fmt(S.maxMp)}`);
    bar(10, 46, 190, G.p.lvl >= MAXLVL ? 1 : G.p.xp / xpNeeded(G.p.lvl), '#c9a24e', `Niv. ${G.p.lvl}`);
    c.font = '13px sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'right'; c.fillText(`${A.Z.i} ${A.Z.n} · ${A.kills} vaincus · 🪙 ${fmt(G.p.gold)}`, W - 10, 18); c.textAlign = 'center';
    A.spells.forEach((id, i) => { const x = W / 2 - 110 + i * 74, y = H - 70; c.fillStyle = '#000a'; c.fillRect(x, y, 66, 56); c.font = '22px serif'; c.fillStyle = '#fff'; c.fillText(SK[id].ico, x + 33, y + 22); c.font = '10px sans-serif'; c.fillText(`[${i + 1}] ${Skills.cost(id)}✦`, x + 33, y + 44); if (P.spCd[i] > 0) { c.fillStyle = '#000b'; c.fillRect(x, y, 66, 56 * clamp(P.spCd[i] / 4, 0, 1)); } });
    if (A.msgT > 0) { c.font = 'bold 16px sans-serif'; c.fillStyle = '#f1d58a'; c.fillText(A.msg, W / 2, 40); }
  },
  bind() {
    this._kd = e => { if (!this.on) return; const k = e.key.toLowerCase(); if (k === 'escape') { this.stop(); return; } this.A.keys[k === ' ' ? 'space' : k] = true; if (k === ' ' || k === 'shift') { e.preventDefault(); this.roll(); } else if (k === '1' || k === '2' || k === '3') this.cast(+k - 1); else if (k === 'e') this.potion(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault(); };
    this._ku = e => { if (this.on) this.A.keys[e.key.toLowerCase() === ' ' ? 'space' : e.key.toLowerCase()] = false; };
    this._rs = () => this.resize();
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku); window.addEventListener('resize', this._rs);
  },
  unbind() { window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku); window.removeEventListener('resize', this._rs); }
};

/* Commandes tactiles / souris */
UI.arcadeScreen = function () {
  $id('screen-arcade').innerHTML = `<canvas id="ar-cv"></canvas><div class="ar-ui" id="ar-ui">
    <div class="ar-joy" id="ar-joy"><i id="ar-knob"></i></div>
    <div class="ar-btns"><button data-ar="attack" class="arb big">⚔</button><button data-ar="roll" class="arb">💨</button><button data-ar="s0" class="arb">1</button><button data-ar="s1" class="arb">2</button><button data-ar="s2" class="arb">3</button><button data-ar="pot" class="arb">🧪</button></div>
    <button class="btn sm ar-exit" data-act="arcadeExit">Quitter (Échap)</button><div class="ar-hint">ZQSD / flèches : bouger · J ou clic : attaquer · Espace : roulade · 1-2-3 : sorts · E : potion</div></div>`;
  const joy = $id('ar-joy'), knob = $id('ar-knob'); let jid = null;
  const setJ = e => { const r = joy.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2), l = Math.hypot(x, y) || 1, k = Math.min(1, l); const A = Arcade.A; if (A) { A.joy.x = x / l * k; A.joy.y = y / l * k; } knob.style.transform = `translate(${x / l * k * 34}px,${y / l * k * 34}px)`; };
  joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); setJ(e); }); joy.addEventListener('pointermove', e => { if (e.pointerId === jid) setJ(e); });
  const endJ = e => { if (e.pointerId === jid) { jid = null; if (Arcade.A) { Arcade.A.joy.x = 0; Arcade.A.joy.y = 0; } knob.style.transform = ''; } }; joy.addEventListener('pointerup', endJ); joy.addEventListener('pointercancel', endJ);
  for (const b of $id('ar-ui').querySelectorAll('[data-ar]')) {
    const k = b.dataset.ar;
    b.addEventListener('pointerdown', e => { e.preventDefault(); const A = Arcade.A; if (!A) return; if (k === 'attack') A.btn.attack = true; else if (k === 'roll') Arcade.roll(); else if (k === 'pot') Arcade.potion(); else Arcade.cast(+k[1]); });
    const up = () => { if (k === 'attack' && Arcade.A) Arcade.A.btn.attack = false; }; b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  }
  const cv = $id('ar-cv');
  cv.addEventListener('pointerdown', e => { const A = Arcade.A; if (!A) return; const r = cv.getBoundingClientRect(); A.aim = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); A.btn.attack = true; });
  cv.addEventListener('pointerup', () => { if (Arcade.A) { Arcade.A.btn.attack = false; Arcade.A.aim = null; } });
};
Object.assign(Act, {
  launchArcade(d) { const zid = d.z || U.zone; UI.arcadeScreen(); Arcade.start(zid); },
  arcadeExit() { Arcade.stop(); }
});

/* =====================================================================
   BRANCHEMENT DES MODES DE JEU DANS L'INTERFACE
   ===================================================================== */
UI.show = function (s) { U.screen = s; for (const id of ['title', 'create', 'game', 'combat', 'dungeon', 'mine', 'arcade']) { const el = $id('screen-' + id); if (el) el.classList.toggle('hidden', id !== s); } };
TABS.splice(1, 0, ['modes', '🎮', 'Modes']);

/* ----- Hub des 5 modes ----- */
V.modes = () => {
  const Z = ZONE(U.zone), m = G.mine || { tier: 1 };
  const card = (ico, n, d, st, act, extra = '') => `<div class="panel mode"><div class="mico">${ico}</div><h3>${n}</h3><p>${d}</p><small>${st}</small><div class="row wrap"><button class="btn primary" data-act="${act}" ${extra}>Jouer</button></div></div>`;
  return `<h2>Modes de jeu</h2><p><small>Cinq façons de jouer, un seul héros : niveau, équipement, traits et sauvegarde sont partagés.</small></p>
  <div class="grid modes">
    ${card('⚔️', 'RPG au tour par tour', 'Combats stratégiques : ennemis qui annoncent leurs attaques, compétences, défense, objets, Finisseur.', `Zone : ${Z.i} ${Z.n} — onglet Explorer`, 'goExplore')}
    ${card('🏰', 'Donjons explorables', 'Une carte de salles à embranchements : combat, élite, coffre, piège, événement, feu de camp (checkpoint), boss.', Dungeon.D ? '<b class="good">Un donjon est en cours</b>' : 'Choisissez un donjon dans la zone', 'goDungeon')}
    ${card('🐾', 'Aventure en temps réel', 'Vue de dessus façon RPG d’action : déplacez-vous, roulez, lancez vos sorts et esquivez les zones rouges.', `Zone : ${Z.i} ${Z.n} (niv. ${Z.min}–${Z.max})`, 'launchArcade', `data-z="${U.zone}"`)}
    ${card('⛏️', 'Minage', 'Creusez, gérez votre énergie, évitez la lave, remontez vos minerais et améliorez votre pioche.', `Pioche rang ${m.tier} — record de profondeur : ${val('mineDepth')}`, 'launchMine')}
    ${card('🔨', 'Forge', 'Mini-jeu de timing : la qualité de vos frappes détermine la rareté et les statistiques. Plans appris en démontant des objets.', `${Object.keys(G.recipes || {}).length} plan(s) connu(s)`, 'goCraft')}
  </div>`;
};
Object.assign(Act, {
  goExplore() { U.tab = 'explore'; UI.renderGame(); }, goCraft() { U.tab = 'craft'; U.craftTab = 'forge'; UI.renderGame(); },
  goDungeon() { if (Dungeon.D) Hooks.dungeonMap(); else { U.tab = 'explore'; UI.renderGame(); UI.toast('Choisissez un donjon et une difficulté.'); } },
  dungResume() { Hooks.dungeonMap(); }
});

/* ----- Explorer : reprise de donjon + aventure temps réel ----- */
const _vExplore = V.explore;
V.explore = () => {
  let h = _vExplore();
  h = h.replace('<button class="btn primary big" data-act="explore">Explorer la zone</button>', `<div class="row wrap"><button class="btn primary big" data-act="explore">Explorer (tour par tour)</button><button class="btn big" data-act="launchArcade" data-z="${U.zone}">🐾 Aventure en temps réel</button></div>`);
  if (Dungeon.D) h = h.replace('<h2>Exploration</h2>', `<h2>Exploration</h2><div class="panel"><b>🏰 Donjon en cours : ${esc(DUNGEON(Dungeon.D.id).n)}</b> <button class="btn primary" data-act="dungResume">Reprendre</button></div>`);
  return h;
};
Act.dungeon = function (d) {
  const dg = DUNGEON(d.id), B = BOSSES[dg.boss];
  if (Dungeon.D) return UI.toast('Un donjon est déjà en cours.', 'bad');
  if (!confirm(`Entrer dans ${dg.n} (${DIFFS[+d.d].n}) ?\nCarte de salles à choisir pas à pas, sans fuite possible. Boss : ${B.n} (niv. ${B.lvl + DIFFS[+d.d].off}).`)) return;
  Dungeon.start(d.id, +d.d);
};

/* ----- Donjon : écran carte ----- */
Object.assign(Hooks, {
  dungeonMap() { if (Dungeon.D) { UI.show('dungeon'); UI.renderDungeon(); } else { UI.show('game'); UI.renderGame(); } },
  dungeonEvent() { Act.showEv(); },
  dungeonNegotiate() { UI.modal(`<h3>Le Roi Gobelin</h3><p>Grimgut vous fixe. Le petit gobelin que vous avez libéré se glisse entre vous : « Roi, ami est bon… ». Le Roi hésite.</p><div class="row wrap"><button class="btn primary" data-act="negotiate">Négocier (chemin pacifique)</button><button class="btn" data-act="dungGo">Combattre</button></div>`); }
});
UI.renderDungeon = function () {
  const D = Dungeon.D; if (!D) { UI.show('game'); UI.renderGame(); return; }
  const d = DUNGEON(D.id), S = Stats.get(), reach = new Set(Dungeon.reachable().map(n => n.id)), cnt = {}; D.nodes.forEach(n => cnt[n.l] = (cnt[n.l] || 0) + 1);
  const pos = n => [(n.l + .5) / 5 * 100, (n.i + .5) / cnt[n.l] * 100];
  const lines = D.nodes.flatMap(a => a.next.map(bid => { const b = Dungeon.node(bid), [x1, y1] = pos(a), [x2, y2] = pos(b), vis = Dungeon.visible(a) && Dungeon.visible(b); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${a.done && (b.done || reach.has(b.id)) ? 'ln on' : vis ? 'ln' : 'ln dim'}"/>`; })).join('');
  const nodes = D.nodes.map(n => { const [x, y] = pos(n), vis = Dungeon.visible(n), r = reach.has(n.id); return `<button class="dn ${n.done ? 'done' : ''} ${r ? 'reach' : ''} ${D.at === n.id ? 'cur' : ''} k-${vis ? n.k : 'x'}" style="left:${x}%;top:${y}%" data-act="dnode" data-id="${n.id}" ${r ? '' : 'disabled'} aria-label="${vis ? DN_NAME[n.k] : 'Salle inconnue'}" data-tip="${vis ? DN_NAME[n.k] : 'Salle inconnue'}">${vis ? DN_ICON[n.k] : '❔'}</button>`; }).join('');
  const comp = Object.keys(CONS).filter(k => ['potion_hp', 'potion_hp2', 'potion_mp'].includes(k) && (G.cons[k] || 0) > 0);
  $id('screen-dungeon').innerHTML = `<div class="dwrap">
    <div class="c-top"><b>🏰 ${esc(d.n)} — ${DIFFS[D.diff].n} (niv. ${Dungeon.lvl()})</b><button class="btn sm danger" data-act="dungQuit">Abandonner</button></div>
    <div class="mbars">${bar(G.p.hp, S.maxHp, 'hp', `❤ ${fmt(G.p.hp)} / ${fmt(S.maxHp)}`)}${bar(G.p.mp, S.maxMp, 'mp', `✦ ${fmt(G.p.mp)} / ${fmt(S.maxMp)}`)}</div>
    <div class="dmap"><svg viewBox="0 0 100 100" preserveAspectRatio="none" class="dsvg">${lines}</svg>${nodes}<span class="dent">🚪</span></div>
    <div class="row wrap legend">${Object.keys(DN_ICON).map(k => `<span>${DN_ICON[k]} ${DN_NAME[k]}</span>`).join('')}<span>❔ inconnue</span></div>
    <div class="row wrap">${comp.map(k => `<button class="btn sm" data-act="dPotion" data-id="${k}">${CONS[k].i} ${CONS[k].n} ×${G.cons[k]}</button>`).join('')}${D.cp >= 0 ? '<small class="good">🔥 Checkpoint actif : en cas de défaite, vous reprenez au dernier feu de camp.</small>' : '<small>Pas de checkpoint : une défaite met fin au donjon. Cherchez un feu de camp 🔥.</small>'}</div>
    <div class="exlog">${D.log.map(l => `<div>${esc(l)}</div>`).join('')}</div></div>`;
};
Object.assign(Act, {
  dnode(d) { Dungeon.enter(+d.id); },
  dPotion(d) { const D = Dungeon.D; if (!D || (G.cons[d.id] || 0) < 1) return; const S = Stats.get(), E = Stats.sum(), c = CONS[d.id]; G.cons[d.id]--;
    if (d.id === 'potion_mp') Player.restoreMp(S.maxMp * c.f * (1 + (E.potionPct || 0))); else Player.heal(S.maxHp * c.f * (1 + (E.potionPct || 0) + (E.healPct || 0)));
    bump('potions'); D.potions++; Game.sync(); UI.renderDungeon(); },
  dungQuit() { if (!Dungeon.D || confirm('Abandonner le donjon ? La progression de la carte sera perdue.')) { UI.closeModal(); Dungeon.leave(); UI.show('game'); UI.renderGame(); } },
  dungGo() { UI.closeModal(); const D = Dungeon.D; if (D) Dungeon.fight(Dungeon.node(D.pend)); },
  negotiate() { UI.closeModal(); Dungeon.negotiate(); },
  dEvDone() { UI.closeModal(); const f = U.pendingFight; U.pendingFight = null; Dungeon.afterEvent(f || null); }
});
Act.evChoice = function (d) {
  const r = Narr.choose(U.ev, +d.i); if (!r) return; U.exLog.push(r.txt);
  const nxt = U.dungEv ? 'dEvDone' : (r.fight ? 'evFight' : 'closeModal');
  UI.modal(`<h3>${NARR.find(e => e.id === U.ev).n}</h3><p>${r.txt}</p>${r.lines.length ? `<ul class="res">${r.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}<button class="btn primary" data-act="${nxt}">Continuer</button>`);
  U.pendingFight = r.fight || null;
};
Act.endCombat = function () {
  UI.closeModal(); $id('modal').dataset.res = '0'; U.screen = 'game'; UI.show('game'); Combat.finish();
  if (U.returnTo === 'mine' && G.mine && G.mine.run && !Dungeon.D) { U.returnTo = null; UI.show('mine'); UI.renderMine('Le combat est terminé.'); return; }
  U.returnTo = null; if (U.screen === 'game') UI.renderGame();
};

/* ----- Forge : mini-jeu + plans ----- */
Object.assign(Act, {
  forge() { Forge.start({ slot: U.forgeSlot, q: U.forgeQ }); },
  forgeAuto() { const it = Craft.finishForge({ slot: U.forgeSlot, q: U.forgeQ }, 50); if (it) UI.toast(`Forgé (auto) : ${it.name} (${RARITIES[it.r].n})`, it.r >= 3 ? 'trait' : 'good'); else UI.toast('Ressources insuffisantes.', 'bad'); },
  forgePlan(d) { Forge.start({ key: d.k }); },
  forgeHit() { Forge.hit(); }, forgeCancel() { Forge.cancel(); }
});
document.addEventListener('keydown', e => { if (e.key === ' ' && Forge.st && !Forge.st.done) { e.preventDefault(); Forge.hit(); } });
V.craft = () => {
  const matsP = `<div class="panel"><h3>Matériaux</h3><div class="mats">${Object.keys(MATS).map(k => `<span>${MATS[k][1]} ${MATS[k][0]} <b>${G.mats[k] || 0}</b></span>`).join('')}</div></div>`;
  const nPlans = Object.keys(G.recipes || {}).length;
  const tabs = `<div class="row wrap filters">${[['forge', 'Forger'], ['plans', `Plans (${nPlans})`], ['upg', 'Améliorer'], ['alch', 'Alchimie']].map(([k, n]) => `<button class="btn sm ${U.craftTab === k ? 'primary' : ''}" data-act="craftTab" data-t="${k}">${n}</button>`).join('')}</div>`;
  const mt = m => Object.keys(m).map(k => `<span class="${(G.mats[k] || 0) >= m[k] ? 'ok' : 'ko'}">${MATS[k][1]} ${m[k]}</span>`).join(' ');
  let body = '';
  if (U.craftTab === 'forge') {
    const c = Craft.forgeCost(U.forgeSlot, U.forgeQ), can = G.p.gold >= c.gold && Mats.has(c.mats);
    body = `<div class="panel"><h3>Forger un équipement</h3><div class="row wrap">${Object.keys(ITEM_BASES).map(s => `<button class="btn sm ${U.forgeSlot === s ? 'primary' : ''}" data-act="forgeSlot" data-s="${s}">${TYPE_NAME[s]}</button>`).join('')}</div>
      <div class="row wrap">${QUAL.map((q, i) => `<button class="btn sm ${U.forgeQ === i ? 'primary' : ''}" data-act="forgeQ" data-q="${i}">${q.n}</button>`).join('')}</div>
      <p>Coût : ${fmt(c.gold)} or · ${mt(c.mats)}</p><p><small>Mini-jeu : 3 frappes à timing. Un bon score augmente les chances de rareté et les statistiques (jusqu’à +20 %), un score parfait ajoute un bonus. « Auto » = score moyen.</small></p>
      <div class="row wrap"><button class="btn primary" data-act="forge" ${can ? '' : 'disabled'}>🔨 Forger (mini-jeu)</button><button class="btn" data-act="forgeAuto" ${can ? '' : 'disabled'}>Forger (auto)</button></div></div>`;
  } else if (U.craftTab === 'plans') {
    const keys = Object.keys(G.recipes || {}).map(k => Catalog.byKey(k)).filter(Boolean).sort((a, b) => b.r - a.r || a.lv - b.lv);
    body = `<div class="panel"><h3>Plans de fabrication</h3><p><small>Démonter un objet nommé du catalogue vous apprend son plan : vous pouvez ensuite le refabriquer avec le mini-jeu de forge.</small></p>${keys.map(e => { const c = Craft.namedCost(e.key), can = G.p.gold >= c.gold && Mats.has(c.mats); return `<div class="recipe"><span class="${rcls(e.r)}"><b>${esc(e.n)}</b> <small>${RARITIES[e.r].n} · niv. ${e.lv} · ${e.cat ? CAT_NAME[e.cat] : TYPE_NAME[e.slot]}</small></span><span>${fmt(c.gold)} 🪙 ${mt(c.mats)} <button class="btn sm primary" data-act="forgePlan" data-k="${e.key}" ${can ? '' : 'disabled'}>Forger</button></span></div>`; }).join('') || '<em>Aucun plan connu. Démontez des objets nommés (inventaire › Démonter).</em>'}</div>`;
  } else if (U.craftTab === 'upg') {
    const all = [...Object.values(G.eq).filter(Boolean), ...G.inv].sort((a, b) => b.r - a.r), it = Inv.find(U.upSel), c = it && it.up < 10 ? Craft.upgCost(it) : null;
    body = `<div class="panel"><h3>Améliorer</h3><div class="itemgrid">${all.map(i => itemCard(i, 'upSel')).join('') || '<em>Aucun objet.</em>'}</div></div>
      <div class="panel">${it ? `<h3 class="${rcls(it.r)}">${esc(it.name)} +${it.up}</h3><ul class="statl">${statLines(it.st)}</ul>${it.up >= 10 ? '<p>Niveau maximal.</p>' : `<p>Réussite : <b>${Craft.upgRate(it)} %</b>${it.up >= 5 ? ' · <span class="bad">risque de perdre un niveau en cas d’échec</span>' : ''}</p><p>Coût : ${fmt(c.gold)} or · ${mt(c.mats)}</p><p><small>Bonus spéciaux aux niveaux +3, +6 et +9.</small></p><button class="btn primary" data-act="upgrade" ${G.p.gold >= c.gold && Mats.has(c.mats) ? '' : 'disabled'}>Améliorer en +${it.up + 1}</button>`}` : '<p><em>Choisissez un objet.</em></p>'}</div>`;
  } else body = `<div class="panel"><h3>Alchimie</h3>${Object.keys(RECIPES).map(k => `<div class="recipe"><span>${CONS[k].i} <b>${CONS[k].n}</b> <small>(${G.cons[k] || 0}) — ${CONS[k].d}</small></span><span>${mt(RECIPES[k])} <button class="btn sm" data-act="brew" data-id="${k}" ${Mats.has(RECIPES[k]) ? '' : 'disabled'}>Préparer</button></span></div>`).join('')}</div>`;
  return `<h2>Artisanat</h2><p><small>Besoin de matériaux ? Récoltez en <b>explorant</b>, en <b>combattant</b> ou dans la <b>mine</b> (onglet Modes).</small></p>${matsP}${tabs}${body}`;
};

/* ----- Traits et succès des nouveaux modes ----- */
[['tx_arc1', 'Danseur du carnage', 'combat', 2, 'Deux cents ennemis vaincus en temps réel.', [g_('arcadeKills', 200, 'ennemis vaincus en temps réel')], { spdFlat: 2, atkPct: .02 }],
 ['tx_arc2', 'Roulade parfaite', 'defense', 2, 'Soixante attaques évitées par une roulade.', [g_('rollDodges', 60, 'attaques évitées en roulant')], { dodgeFlat: 3 }],
 ['tx_arc3', 'Chasseur en mouvement', 'exploration', 2, 'Une heure passée à courir le monde.', [g_('arcadeSeconds', 3600, 'secondes d’aventure en temps réel')], { spdFlat: 2, xpPct: .02 }],
 ['tx_min1', 'Mineur acharné', 'exploration', 1, 'Cinq cents blocs brisés.', [g_('mined', 500, 'blocs minés')], { upgBonus: .04, defPct: .02 }],
 ['tx_min2', 'Plongeur des profondeurs', 'exploration', 3, 'Rien ne vous arrête sous la terre.', [g_('mineDepth', 30, 'profondeur atteinte')], { sresFlat: 6, hpPct: .03 }],
 ['tx_min3', 'Roi du sac', 'economie', 2, 'Vingt-cinq remontées chargées.', [g_('mineDeliveries', 25, 'dépôts à la surface')], { goldPct: .04 }],
 ['tx_min4', 'Veine chanceuse', 'exploration', 2, 'Dix coffres déterrés.', [g_('mineChests', 10, 'coffres minés')], { lootLuck: .05 }],
 ['tx_for1', 'Frappe parfaite', 'artisanat', 3, 'Trois forges parfaites.', [g_('forgePerfect', 3, 'forges avec un score parfait')], { upgBonus: .06, critDmg: .05 }],
 ['tx_for2', 'Forgeron inspiré', 'artisanat', 2, 'Vingt forges au mini-jeu.', [g_('forges', 20, 'forges réalisées')], { upgBonus: .05 }],
 ['tx_for3', 'Collectionneur de plans', 'artisanat', 3, 'Dix plans appris.', [g_('plans', 10, 'plans appris')], { goldPct: .03, upgBonus: .03 }],
 ['tx_dun1', 'Cartographe de salles', 'donjons', 2, 'Cent salles de donjon explorées.', [g_('dungeonNodes', 100, 'salles de donjon explorées')], { xpPct: .03 }],
 ['tx_dun2', 'Désamorceur', 'donjons', 2, 'Vingt pièges désamorcés.', [g_('trapsDisarmed', 20, 'pièges désamorcés')], { dodgeFlat: 2, sresFlat: 4 }],
 ['tx_dun3', 'Veilleur du feu de camp', 'donjons', 2, 'Quinze feux de camp.', [g_('campfires', 15, 'repos au feu de camp')], { regenPost: .03, hpPct: .02 }]
].forEach(a => N_(...a));
ACHS.push(
  { id: 'a_arc', n: 'Premiers pas en temps réel', g: [{ c: 'arcadeKills', n: 25 }], gold: 150 }, { id: 'a_mine', n: 'Premier filon', g: [{ c: 'mined', n: 50 }], gold: 100 },
  { id: 'a_deep', n: 'Plus bas encore', g: [{ c: 'mineDepth', n: 20 }], gold: 400 }, { id: 'a_forge', n: 'Apprenti forgeron', g: [{ c: 'forges', n: 5 }], gold: 150 },
  { id: 'a_dn5', n: 'Explorateur de salles', g: [{ c: 'dungeonNodes', n: 30 }], gold: 250 }
);
