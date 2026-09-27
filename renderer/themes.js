// Color themes. Shared by the renderer (applies them) and main (window background color).
// Every theme keeps Claude's look: warm ink, serif headings, a terracotta-family accent.

const THEMES = {
  obsidian: {
    name: 'Obsidian', note: 'Near-black, warm',
    bg: '#0f0e0d', glow: '#2a1b12', bar: '17, 16, 15', glass: '24, 23, 21', card: '22, 21, 20',
    ink: '240, 238, 230', text: '#f0eee6', dim: '#948f84', inactive: 'rgba(176, 168, 152, .13)',
    accent: '#d97757', agent: '#e3b27a', done: '#9cb88a', termBlack: '#262522',
  },
  void: {
    name: 'Void', note: 'Pure black (OLED)',
    bg: '#000000', glow: '#1f130c', bar: '0, 0, 0', glass: '8, 8, 7', card: '12, 12, 11',
    ink: '240, 238, 230', text: '#f0eee6', dim: '#8a857b', inactive: 'rgba(240, 238, 230, .08)',
    accent: '#d97757', agent: '#e3b27a', done: '#9cb88a', termBlack: '#1e1d1b',
  },
  ember: {
    name: 'Ember', note: 'Black with a hotter glow',
    bg: '#0d0907', glow: '#3d1a0c', bar: '18, 13, 11', glass: '25, 18, 15', card: '26, 19, 16',
    ink: '243, 236, 228', text: '#f3ece4', dim: '#9d8f84', inactive: 'rgba(224, 106, 63, .14)',
    accent: '#e06a3f', agent: '#eab176', done: '#a3bd8f', termBlack: '#2a1f1a',
  },
  graphite: {
    name: 'Graphite', note: 'Cool neutral dark',
    bg: '#101113', glow: '#221a17', bar: '20, 21, 23', glass: '27, 28, 31', card: '27, 28, 31',
    ink: '236, 236, 236', text: '#ececec', dim: '#8e9096', inactive: 'rgba(160, 165, 175, .15)',
    accent: '#d97757', agent: '#e3b27a', done: '#9cb88a', termBlack: '#2a2b2f',
  },
  claude: {
    name: 'Claude', note: 'Classic warm charcoal',
    bg: '#1a1918', glow: '#2e2219', bar: '31, 30, 29', glass: '38, 38, 36', card: '38, 38, 36',
    ink: '240, 238, 230', text: '#f0eee6', dim: '#9c978b', inactive: 'rgba(176, 168, 152, .18)',
    accent: '#d97757', agent: '#e3b27a', done: '#9cb88a', termBlack: '#2b2a27',
  },
};

const ACCENTS = [
  ['#d97757', 'Terracotta'], ['#c96442', 'Clay'], ['#e3a35a', 'Amber'],
  ['#e0786f', 'Coral'], ['#9cb88a', 'Sage'], ['#9a8fd1', 'Iris'],
];

if (typeof module !== 'undefined') module.exports = { THEMES, ACCENTS };
