import * as THREE from 'three';
import type { Side } from '../battle/types';
import { ENEMY_POS, PLAYER_POS } from './arena';
import type { Shot } from './stage';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Classic BW-style framing: player's back sprite big in the left foreground, foe on the right (matching the HUD:
 * foe card top-left, player card bottom-right). The camera sits 40% of the way from a pure side view to straight
 * behind the player, so the foe never hides behind a large back sprite.
 */
export function wideShot(): Shot {
  return { pos: v(-5.1, 3.9, 11.4), look: v(0.4, 0.5, -0.4), fov: 40 };
}

export function introShot(): Shot {
  return { pos: v(9, 4.5, 9), look: v(0, 1, 0), fov: 50 };
}

/** Close-up on one side's Pokemon (used for move wind-ups and evolutions). */
export function focusShot(side: Side, height = 1.2): Shot {
  const p = side === 0 ? PLAYER_POS : ENEMY_POS;
  if (side === 0) return { pos: v(p.x - 3.6, p.y + height + 1.0, p.z + 4.6), look: v(p.x + 0.4, p.y + height, p.z - 0.4), fov: 40 };
  return { pos: v(p.x - 2.6, p.y + height + 0.6, p.z + 5.0), look: v(p.x, p.y + height, p.z), fov: 40 };
}

/** Low dramatic angle behind the attacker looking at the target. */
export function overShoulder(attacker: Side): Shot {
  const a = attacker === 0 ? PLAYER_POS : ENEMY_POS;
  const b = attacker === 0 ? ENEMY_POS : PLAYER_POS;
  const back = a.clone().sub(b).normalize();
  const side = new THREE.Vector3(-back.z, 0, back.x).multiplyScalar(attacker === 0 ? 1.6 : -1.6);
  // far and high enough that a big back sprite leaves room for the command menu and the player's HUD card
  const pos = a.clone().addScaledVector(back, 5.4).add(side).setY(2.5);
  return { pos, look: b.clone().setY(1.3), fov: 46 };
}

/** Side view showing both combatants, good for beams/projectiles. */
export function sideShot(): Shot {
  const mid = PLAYER_POS.clone().lerp(ENEMY_POS, 0.5);
  return { pos: v(mid.x - 1.5, 2.6, mid.z + 10.5), look: mid.clone().setY(1.2), fov: 44 };
}

export function evolveShot(side: Side): Shot {
  const p = side === 0 ? PLAYER_POS : ENEMY_POS;
  return { pos: v(p.x - 1.2, p.y + 2.2, p.z + 6.2), look: v(p.x, p.y + 1.5, p.z), fov: 44 };
}
