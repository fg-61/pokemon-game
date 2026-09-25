// Typed access to the FireRed data extracted into ./generated.
import movesJson from './generated/moves.json';
import speciesJson from './generated/species.json';
import typechartJson from './generated/typechart.json';
import type { MoveData, PokeType, SpeciesData, TypeChart } from './types';

export const SPECIES: Record<string, SpeciesData> = speciesJson as unknown as Record<string, SpeciesData>;
export const MOVES: Record<string, MoveData> = movesJson as unknown as Record<string, MoveData>;
export const TYPECHART: TypeChart = typechartJson as unknown as TypeChart;

const byDex = new Map<number, SpeciesData>(Object.values(SPECIES).map((s) => [s.dex, s]));

/** Species by national dex number. */
export function speciesByDex(dex: number): SpeciesData | undefined {
  return byDex.get(dex);
}

/**
 * Combined type effectiveness of an attacking type against a defender's types
 * (0, 0.25, 0.5, 1, 2 or 4). Duplicate defender types count once, as in the game.
 */
export function typeMultiplier(atk: PokeType, defTypes: PokeType[]): number {
  const row = TYPECHART[atk];
  if (!row) return 1;
  let mult = 1;
  for (const def of new Set(defTypes)) mult *= row[def] ?? 1;
  return mult;
}
