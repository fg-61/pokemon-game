import * as THREE from 'three';
import type { Side } from '../battle/types';
import { MOVES } from '../data/gamedata';
import type { PokeType } from '../data/types';
import type { PokemonSprite } from '../render/pokemonSprite';
import { defaultChargeRecipe, defaultRecipe } from './recipes';
import { getMoveFx, type MoveFxContext, type Vfx } from './vfx';

export interface PlayMoveArgs {
  vfx: Vfx;
  moveKey: string;
  side: Side;
  attacker: PokemonSprite;
  target: PokemonSprite;
  hits: number;
  missed: boolean;
  onImpact: (i: number) => void;
  /** self-targeted: user and target are the same sprite */
  self?: boolean;
  phase?: 'charge' | 'strike';
}

/** Build the recipe context and run the move's VFX. Guarantees every impact fires exactly once. */
export async function playMoveFx(a: PlayMoveArgs): Promise<void> {
  const move = MOVES[a.moveKey];
  const type = (move.type === 'MYSTERY' ? 'GHOST' : move.type) as PokeType;
  const fired = new Set<number>();
  const phase = a.phase ?? 'strike';
  const hits = phase === 'charge' ? 0 : Math.max(1, a.hits);
  const impact = (i = 0) => {
    if (i >= hits || fired.has(i) || a.missed) return;
    fired.add(i);
    a.onImpact(i);
  };
  const user = a.attacker.at(0.5);
  const foe = a.self ? user.clone() : a.target.at(0.5);
  const dir = foe.clone().sub(user).setY(0);
  if (dir.lengthSq() < 1e-4) dir.set(1, 0, -1);
  dir.normalize();
  const missOffset = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(1.6).add(new THREE.Vector3(0, 0.6, 0));
  const ctx: MoveFxContext = {
    vfx: a.vfx,
    stage: a.vfx.stage,
    move,
    type,
    pal: a.vfx.palette(type),
    side: a.side,
    attacker: a.attacker,
    target: a.self ? a.attacker : a.target,
    user,
    foe,
    userFeet: a.attacker.at(0),
    foeFeet: a.self ? a.attacker.at(0) : a.target.at(0),
    dir,
    hits,
    missed: a.missed,
    phase,
    self: !!a.self,
    power: Math.min(1, Math.max(0, (move.power <= 1 ? 60 : move.power) / 150)),
    impact,
    aim: (frac = 0.5) => {
      const p = (a.self ? a.attacker : a.target).at(frac);
      return a.missed ? p.add(missOffset) : p;
    },
  };
  const recipe = getMoveFx(a.moveKey) ?? (phase === 'charge' ? defaultChargeRecipe : defaultRecipe);
  try {
    await recipe(ctx);
  } catch (e) {
    console.error(`VFX recipe for ${a.moveKey} failed`, e);
  }
  for (let i = 0; i < hits; i++) impact(i);
}
