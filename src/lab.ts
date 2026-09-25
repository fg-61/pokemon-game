/**
 * VFX Lab (lab.html): plays any move's recipe between two sprites so effects can be iterated on
 * and screenshotted. URL params: ?move=FLAMETHROWER&side=0&miss=0&theme=meadow&auto=1&a=6&b=9
 * window.__lab.play(moveKey, side, missed, phase?, power?) returns a promise resolved when the recipe finished
 * (power = the engine's rolled base power, e.g. 10..150 for Magnitude).
 * window.__lab.weather(kind | null) shows ambient weather ('sun' | 'rain' | 'sand' | 'hail'); also ?weather=rain.
 */
import { Arena, ENEMY_POS, PLAYER_POS, THEMES } from './render/arena';
import { PokemonSprite } from './render/pokemonSprite';
import { wideShot } from './render/shots';
import { Stage } from './render/stage';
import { MOVES } from './data/gamedata';
import { ROSTER } from './data/roster';
import { SPECIES } from './data/gamedata';
import { playMoveFx } from './vfx/playMove';
import { getMoveFx, Vfx } from './vfx/vfx';
import { playEvolutionFx } from './vfx/evolution';
import type { Side, WeatherKind } from './battle/types';
import { WeatherFx } from './vfx/weather';

const qs = new URLSearchParams(location.search);
const stage = new Stage(document.getElementById('app')!);
let arena = new Arena(stage, THEMES.find((t) => t.id === qs.get('theme')) ?? THEMES[0]);
const vfx = new Vfx(stage);
stage.director.cut(wideShot());

const a = new PokemonSprite(stage, 'back');
const b = new PokemonSprite(stage, 'front');
a.group.position.copy(PLAYER_POS).setY(Arena.FLOOR);
b.group.position.copy(ENEMY_POS).setY(Arena.FLOOR);
stage.scene.add(a.group, b.group);
const aDex = Number(qs.get('a') ?? 6);
const bDex = Number(qs.get('b') ?? 9);
const ready = Promise.all([a.load(aDex), b.load(bDex)]).then(() => {
  a.group.visible = b.group.visible = true;
});

const moves = [...new Set(ROSTER.flatMap((l) => l.stages.flatMap((s) => s.moves)))].sort();
const sel = document.getElementById('move') as HTMLSelectElement;
for (const m of moves) {
  const o = document.createElement('option');
  o.value = m;
  o.textContent = `${getMoveFx(m) ? '★' : '·'} ${MOVES[m].name} (${MOVES[m].type})`;
  sel.appendChild(o);
}
if (qs.get('move')) sel.value = qs.get('move')!;
const themeSel = document.getElementById('theme') as HTMLSelectElement;
for (const t of THEMES) {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = t.name;
  themeSel.appendChild(o);
}
themeSel.value = arena.theme.id;
let weatherFx = new WeatherFx(stage, vfx, arena);
themeSel.onchange = () => {
  const kind = weatherFx.kind;
  weatherFx.dispose();
  arena.dispose();
  arena = new Arena(stage, THEMES.find((t) => t.id === themeSel.value)!);
  weatherFx = new WeatherFx(stage, vfx, arena);
  weatherFx.set(kind);
};
const weatherSel = document.getElementById('weather') as HTMLSelectElement;
function weather(kind: WeatherKind | null) {
  weatherFx.set(kind);
  weatherSel.value = kind ?? '';
}
weatherSel.onchange = () => weather((weatherSel.value || null) as WeatherKind | null);
/** weather moves hand over to the ambient weather when their animation ends (like the battle controller) */
const WEATHER_MOVES: Record<string, WeatherKind> = { SUNNY_DAY: 'sun', RAIN_DANCE: 'rain', SANDSTORM: 'sand', HAIL: 'hail' };
const log = document.getElementById('log')!;

let busy = false;
async function play(moveKey: string, side: Side, missed: boolean, phase: 'charge' | 'strike' = 'strike', power?: number) {
  await ready;
  if (busy) return;
  busy = true;
  const attacker = side === 0 ? a : b;
  const target = side === 0 ? b : a;
  const mv = MOVES[moveKey];
  const hits = phase === 'charge' ? 0 : mv.effect === 'MULTI_HIT' ? 3 : mv.effect === 'DOUBLE_HIT' || mv.effect === 'TWINEEDLE' ? 2 : 1;
  const self = mv.category === 'status' && (mv.target === 'USER' || mv.target === 'DEPENDS');
  const t0 = performance.now();
  log.textContent = `${mv.name}: ${mv.effect} ${mv.category} target=${mv.target}`;
  await playMoveFx({
    vfx,
    moveKey,
    side,
    attacker,
    target,
    hits,
    missed,
    self,
    phase,
    power,
    onImpact: (i) => {
      log.textContent += `\nimpact ${i} @ ${Math.round(performance.now() - t0)}ms`;
      if (mv.category !== 'status') {
        target.blink(2);
        target.knockback(attacker.group.position);
      }
    },
  });
  log.textContent += `\ndone in ${Math.round(performance.now() - t0)}ms`;
  if (WEATHER_MOVES[moveKey]) weather(WEATHER_MOVES[moveKey]);
  stage.director.move(wideShot(), 0.5);
  busy = false;
}

document.getElementById('play')!.onclick = () => play(sel.value, Number((document.getElementById('side') as HTMLSelectElement).value) as Side, (document.getElementById('miss') as HTMLInputElement).checked);
document.getElementById('evo')!.onclick = async () => {
  await ready;
  const line = ROSTER.find((l) => l.stages.some((s) => SPECIES[s.species].dex === aDex));
  const idx = line ? line.stages.findIndex((s) => SPECIES[s.species].dex === aDex) : -1;
  const next = line && idx >= 0 && idx < line.stages.length - 1 ? SPECIES[line.stages[idx + 1].species].dex : aDex;
  await playEvolutionFx(vfx, a, 0, next);
  stage.director.move(wideShot(), 0.6);
};
addEventListener('keydown', (e) => {
  if (e.code === 'Space') document.getElementById('play')!.click();
});
setInterval(() => (document.getElementById('fps')!.textContent = `${stage.fps.toFixed(0)} fps, particles ${vfx.add.active + vfx.norm.active}`), 500);

(window as unknown as { __lab: unknown }).__lab = { play, weather, stage, vfx, ready, a, b };
if (qs.get('weather')) weather(qs.get('weather') as WeatherKind);
if (qs.get('auto')) ready.then(() => play(sel.value, Number(qs.get('side') ?? 0) as Side, qs.get('miss') === '1'));
