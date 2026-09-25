/**
 * Game clock with time scaling (slow-mo on crits / KOs) plus promise-based waits and tweens.
 * Everything visual that is "timed" goes through this so slow-motion affects it consistently.
 */
export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outElastic: (t: number) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
};

interface Waiter {
  at: number;
  resolve: () => void;
}
interface Tween {
  start: number;
  dur: number;
  fn: (t: number) => void;
  ease: Ease;
  resolve: () => void;
}

export class GameClock {
  /** scaled game time in seconds */
  time = 0;
  /** real (unscaled) time in seconds */
  realTime = 0;
  timeScale = 1;
  /** timeScale restored after slow-motion ends (animation speed setting) */
  baseScale = 1;
  private waiters: Waiter[] = [];
  private tweens: Tween[] = [];
  private slowmo: { until: number; scale: number } | null = null;

  advance(realDt: number): number {
    this.realTime += realDt;
    if (this.slowmo && this.realTime >= this.slowmo.until) {
      this.slowmo = null;
      this.timeScale = this.baseScale;
    }
    const dt = realDt * this.timeScale;
    this.time += dt;
    if (this.waiters.length) {
      const due = this.waiters.filter((w) => w.at <= this.time);
      if (due.length) {
        this.waiters = this.waiters.filter((w) => w.at > this.time);
        due.forEach((w) => w.resolve());
      }
    }
    if (this.tweens.length) {
      const done: Tween[] = [];
      for (const tw of this.tweens) {
        const t = Math.min(1, (this.time - tw.start) / tw.dur);
        tw.fn(tw.ease(t));
        if (t >= 1) done.push(tw);
      }
      if (done.length) {
        this.tweens = this.tweens.filter((t) => !done.includes(t));
        done.forEach((t) => t.resolve());
      }
    }
    return dt;
  }

  /** Wait in game-time milliseconds. */
  wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ at: this.time + ms / 1000, resolve }));
  }

  /** Tween over game-time milliseconds, calling fn(easedT) each frame (and once with 1 at the end). */
  tween(ms: number, fn: (t: number) => void, e: Ease = ease.inOutQuad): Promise<void> {
    if (ms <= 0) {
      fn(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.tweens.push({ start: this.time, dur: ms / 1000, fn, ease: e, resolve });
      fn(0);
    });
  }

  /** Slow motion for `realMs` real milliseconds. */
  slowMo(scale: number, realMs: number) {
    this.timeScale = scale * this.baseScale;
    this.slowmo = { until: this.realTime + realMs / 1000, scale };
  }
}

export function setBaseSpeed(clock: GameClock, s: number) {
  clock.baseScale = s;
  clock.timeScale = s;
}
