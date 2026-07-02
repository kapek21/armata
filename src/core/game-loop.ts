export class GameLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(
    private readonly fixedMs: number,
    private readonly update: (dtMs: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      const frameMs = Math.min(100, now - this.last);
      this.last = now;
      this.acc += frameMs;
      while (this.acc >= this.fixedMs) {
        this.update(this.fixedMs);
        this.acc -= this.fixedMs;
      }
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
