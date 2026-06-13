export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  enabled = false;

  constructor(private el: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    window.addEventListener("blur", () => this.down.clear());
    window.addEventListener("mousemove", (e) => {
      if (!this.locked || !this.enabled) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.el;
  }

  requestLock(): void {
    if (!this.locked) this.el.requestPointerLock();
  }

  isDown(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  justPressed(code: string): boolean {
    return this.enabled && this.pressed.has(code);
  }

  /** call at end of frame */
  flush(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
