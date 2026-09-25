/**
 * Playable roster. Each line lists its evolution stages; every stage has a curated 4-move set.
 * All moves are legal for that species in FireRed (level-up / TM / HM / tutor / egg, or inherited
 * from a pre-evolution) — enforced by `npm run roster:validate`.
 *
 * Design rule: stage 1 moves ~35-70 power, stage 2 ~60-95, final stage gets its signature nukes.
 * `level` is the per-line balance knob (FireRed itself balances trainers with levels);
 * it's tuned with `npm run sim`.
 */
export interface RosterStage {
  species: string; // key into SPECIES
  moves: [string, string, string, string];
}

export interface RosterLine {
  id: string;
  role: string; // short playstyle tag shown in team select
  blurb: string; // one-line strategy hint
  level: number;
  stages: RosterStage[];
}

export const ROSTER: RosterLine[] = [
  {
    id: 'bulbasaur',
    role: 'Controller',
    blurb: 'Seeds, sleep and drain wear foes down; Frenzy Plant finishes them.',
    level: 46,
    stages: [
      { species: 'BULBASAUR', moves: ['RAZOR_LEAF', 'TACKLE', 'LEECH_SEED', 'POISON_POWDER'] },
      { species: 'IVYSAUR', moves: ['RAZOR_LEAF', 'SLUDGE_BOMB', 'LEECH_SEED', 'SLEEP_POWDER'] },
      { species: 'VENUSAUR', moves: ['FRENZY_PLANT', 'GIGA_DRAIN', 'SLUDGE_BOMB', 'SLEEP_POWDER'] },
    ],
  },
  {
    id: 'charmander',
    role: 'Special Sweeper',
    blurb: 'Weak start, explosive finish. Blaze boosts fire moves at low HP.',
    level: 53,
    stages: [
      { species: 'CHARMANDER', moves: ['EMBER', 'METAL_CLAW', 'SCRATCH', 'SMOKESCREEN'] },
      { species: 'CHARMELEON', moves: ['FLAMETHROWER', 'SLASH', 'DRAGON_RAGE', 'SCARY_FACE'] },
      { species: 'CHARIZARD', moves: ['BLAST_BURN', 'FLAMETHROWER', 'DRAGON_CLAW', 'WING_ATTACK'] },
    ],
  },
  {
    id: 'squirtle',
    role: 'Tank',
    blurb: 'Hard to break. Protect and Withdraw buy time for Hydro Cannon.',
    level: 53,
    stages: [
      { species: 'SQUIRTLE', moves: ['WATER_GUN', 'BITE', 'TACKLE', 'WITHDRAW'] },
      { species: 'WARTORTLE', moves: ['WATER_PULSE', 'BITE', 'SKULL_BASH', 'PROTECT'] },
      { species: 'BLASTOISE', moves: ['HYDRO_CANNON', 'SURF', 'ICE_BEAM', 'PROTECT'] },
    ],
  },
  {
    id: 'pidgey',
    role: 'Speedster',
    blurb: 'Fast gauge, never-miss Aerial Ace and Agility to act even faster.',
    level: 62,
    stages: [
      { species: 'PIDGEY', moves: ['GUST', 'QUICK_ATTACK', 'TACKLE', 'SAND_ATTACK'] },
      { species: 'PIDGEOTTO', moves: ['WING_ATTACK', 'QUICK_ATTACK', 'STEEL_WING', 'FEATHER_DANCE'] },
      { species: 'PIDGEOT', moves: ['AERIAL_ACE', 'DOUBLE_EDGE', 'STEEL_WING', 'AGILITY'] },
    ],
  },
  {
    id: 'pikachu',
    role: 'Striker',
    blurb: 'Only one evolution, but it comes fast. Paralyze, then Thunder.',
    level: 47,
    stages: [
      { species: 'PIKACHU', moves: ['THUNDERBOLT', 'QUICK_ATTACK', 'IRON_TAIL', 'THUNDER_WAVE'] },
      { species: 'RAICHU', moves: ['THUNDERBOLT', 'THUNDER', 'BRICK_BREAK', 'QUICK_ATTACK'] },
    ],
  },
  {
    id: 'abra',
    role: 'Glass Cannon',
    blurb: 'Enormous Sp. Atk, paper-thin. Elemental punches are special in Gen 3!',
    level: 43,
    stages: [
      { species: 'ABRA', moves: ['PSYCHIC', 'THUNDER_PUNCH', 'THUNDER_WAVE', 'REFLECT'] },
      { species: 'KADABRA', moves: ['PSYCHIC', 'ICE_PUNCH', 'RECOVER', 'REFLECT'] },
      { species: 'ALAKAZAM', moves: ['PSYCHIC', 'FIRE_PUNCH', 'CALM_MIND', 'RECOVER'] },
    ],
  },
  {
    id: 'machop',
    role: 'Bruiser',
    blurb: 'Guts turns status into power. Dynamic Punch always confuses.',
    level: 49,
    stages: [
      { species: 'MACHOP', moves: ['KARATE_CHOP', 'ROCK_TOMB', 'LOW_KICK', 'BULK_UP'] },
      { species: 'MACHOKE', moves: ['VITAL_THROW', 'ROCK_SLIDE', 'BRICK_BREAK', 'BULK_UP'] },
      { species: 'MACHAMP', moves: ['CROSS_CHOP', 'DYNAMIC_PUNCH', 'ROCK_SLIDE', 'EARTHQUAKE'] },
    ],
  },
  {
    id: 'geodude',
    role: 'Wall Breaker',
    blurb: 'Rock Head means no recoil. Golem can Explode as a last resort.',
    level: 58,
    stages: [
      { species: 'GEODUDE', moves: ['ROCK_THROW', 'DIG', 'ROCK_SMASH', 'DEFENSE_CURL'] },
      { species: 'GRAVELER', moves: ['ROCK_BLAST', 'DIG', 'BRICK_BREAK', 'DEFENSE_CURL'] },
      { species: 'GOLEM', moves: ['EARTHQUAKE', 'ROCK_SLIDE', 'DOUBLE_EDGE', 'EXPLOSION'] },
    ],
  },
  {
    id: 'seel',
    role: 'Support Tank',
    blurb: 'Thick Fat shrugs off fire & ice. Rest to reset.',
    level: 48,
    stages: [
      { species: 'SEEL', moves: ['AURORA_BEAM', 'WATER_PULSE', 'HEADBUTT', 'REST'] },
      { species: 'DEWGONG', moves: ['ICE_BEAM', 'SURF', 'HEADBUTT', 'REST'] },
    ],
  },
  {
    id: 'gastly',
    role: 'Trickster',
    blurb: 'Levitate + Normal/Fighting immunity. Hypnosis into Dream Eater.',
    level: 51,
    stages: [
      { species: 'GASTLY', moves: ['NIGHT_SHADE', 'LICK', 'HYPNOSIS', 'CONFUSE_RAY'] },
      { species: 'HAUNTER', moves: ['NIGHT_SHADE', 'DREAM_EATER', 'HYPNOSIS', 'CONFUSE_RAY'] },
      { species: 'GENGAR', moves: ['SHADOW_BALL', 'THUNDERBOLT', 'DREAM_EATER', 'HYPNOSIS'] },
    ],
  },
  {
    id: 'scyther',
    role: 'Duelist',
    blurb: 'Strong from turn one. Evolving trades speed for Steel armor.',
    level: 44,
    stages: [
      { species: 'SCYTHER', moves: ['SILVER_WIND', 'WING_ATTACK', 'QUICK_ATTACK', 'SWORDS_DANCE'] },
      { species: 'SCIZOR', moves: ['STEEL_WING', 'SILVER_WIND', 'QUICK_ATTACK', 'SWORDS_DANCE'] },
    ],
  },
  {
    id: 'dratini',
    role: 'Late Bloomer',
    blurb: 'Two evolutions to Dragonite — the strongest finisher in the roster.',
    level: 48,
    stages: [
      { species: 'DRATINI', moves: ['TWISTER', 'DRAGON_RAGE', 'SLAM', 'THUNDER_WAVE'] },
      { species: 'DRAGONAIR', moves: ['DRAGON_BREATH', 'ICE_BEAM', 'THUNDER_WAVE', 'AGILITY'] },
      { species: 'DRAGONITE', moves: ['OUTRAGE', 'HYPER_BEAM', 'WING_ATTACK', 'DRAGON_DANCE'] },
    ],
  },
  {
    id: 'houndour',
    role: 'Hunter',
    blurb: 'Fire + Dark coverage. Burns cripple physical attackers.',
    level: 50,
    stages: [
      { species: 'HOUNDOUR', moves: ['EMBER', 'BITE', 'SMOG', 'HOWL'] },
      { species: 'HOUNDOOM', moves: ['FLAMETHROWER', 'CRUNCH', 'SOLAR_BEAM', 'WILL_O_WISP'] },
    ],
  },
];

const byId = new Map(ROSTER.map((l) => [l.id, l]));

export function getLine(id: string): RosterLine {
  const l = byId.get(id);
  if (!l) throw new Error(`Unknown roster line: ${id}`);
  return l;
}
