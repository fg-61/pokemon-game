/**
 * Balance knobs for the hybrid ATB battle system. Tuned with `yarn sim`
 * (see .claude/skills/balance-sim). Keep every "magic number" of the rules here.
 */
export const CONFIG = {
  /** Seconds for a speed-100 battler to fill its gauge once. */
  turnTime: 2.6,
  /** gauge rate = (spe + speedOffset) / (100 + speedOffset). Compresses speed so slow Pokemon still act. */
  speedOffset: 100,
  /** Gauge value right after switching in / after a replacement comes in. */
  switchInAtb: 0.3,
  replaceAtb: 0.5,
  /** Gauge after an evolution (evolving costs the action, but you get a head start). */
  evolveAtb: 0.4,
  /** Gauge bonus per priority level (Quick Attack +1 => starts at +0.3). */
  priorityAtb: 0.3,
  /** Gauge after a recharge move (Hyper Beam, Blast Burn...). */
  rechargeAtb: -0.7,
  /** Gauge fill speed multiplier while charging a two-turn move. */
  chargeRateMult: 1.7,
  /** Flinch pushes the target's gauge back by this much. */
  flinchAtb: 0.35,

  /** HP is scaled up so fights last long enough for evolutions and comebacks. */
  hpMultiplier: 1.6,
  critMultiplier: 1.5, // Gen 3 uses 2.0; 1.5 keeps swings in check with timing bonuses
  sleepActions: [1, 3] as [number, number], // actions skipped while asleep (Gen 3: 2-5 turns)
  confusionActions: [2, 4] as [number, number],
  protectSeconds: 4,
  screenSeconds: 18,

  /** Action timing: attacker multiplier by charge-ring grade. */
  timingAttack: { perfect: 1.2, good: 1.0, miss: 0.85, none: 1.0 },
  /** Defender multiplier by brace grade. */
  timingBrace: { perfect: 0.65, good: 0.85, miss: 1.0, none: 1.0 },
  /** Accuracy multiplier on a perfect charge. */
  perfectAccuracy: 1.1,

  weather: {
    /** seconds Sunny Day / Rain Dance / Sandstorm / Hail last (Gen 3: 5 turns) */
    moveSeconds: 20,
    /** Drought / Drizzle / Sand Stream weather (Gen 3: until replaced) */
    abilitySeconds: 45,
    /** Fire in sun / Water in rain */
    boost: 1.5,
    /** Water in sun / Fire in rain; Solar Beam in rain, sand or hail */
    weaken: 0.5,
    /** sand / hail damage per action of the Pokemon (fraction of max HP) */
    chip: 1 / 16,
    /** Synthesis / Morning Sun / Moonlight heal: sun, other weather (clear = 1/2) */
    healSun: 2 / 3,
    healOther: 1 / 4,
  },

  /** Held items (Gen 3 values unless noted). */
  items: {
    leftovers: 1 / 16, // heal per action
    choiceBand: 1.5, // physical Attack; locks the first move used
    typeBoost: 1.1, // Charcoal, Mystic Water...
    quickClawChance: 0.2,
    quickClawAtb: 0.3, // "moves first": the gauge restarts here
    focusBandChance: 0.1,
    sitrusAt: 0.5, // HP fraction that triggers it
    sitrusHeal: 0.25, // Gen 4 value (Gen 3: 30 HP), fits the scaled HP
    shellBell: 1 / 8, // of damage dealt
    kingsRockChance: 0.1,
    brightPowder: 0.9, // accuracy against the holder
  },

  evo: {
    max: 100,
    perDealtPct: 0.6, // energy per 1% of target max HP dealt
    perTakenPct: 0.9, // energy per 1% of own max HP lost
    perfect: 6,
    good: 3,
    bracePerfect: 5,
    superEffective: 4,
    passivePerSec: 2.0,
    faintRally: 15, // bonus for the Pokemon that replaces a fainted teammate
    secondStageMult: 1.0, // energy gain multiplier when already evolved once
    evolveHealPct: 0.25, // heal % of new max HP on evolution
  },
};

export type Config = typeof CONFIG;
