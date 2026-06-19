function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export class Hud {
  private objective = el("objective");
  private subtitleEl = el("subtitle");
  private promptEl = el("prompt");
  private batteryFill = el("battery-fill");
  private batteryBox = el("battery");
  private bottlesEl = el("bottles");
  private staminaBox = el("stamina");
  private staminaFill = el("stamina-fill");
  private noteBox = el("note");
  private noteTitle = el("note-title");
  private noteBody = el("note-body");
  private damageEl = el("damage");
  private chaseEl = el("chase-vignette");
  private blackoutEl = el("blackout");
  private subTimer = 0;
  noteOpen = false;

  // film grain + the atmospheric vignette now live in the post-processing
  // pipeline (src/core/Post.ts); the dynamic event overlays below stay in DOM.

  show(): void {
    el("hud").classList.remove("hidden");
  }

  setObjective(text: string): void {
    this.objective.textContent = text;
  }

  subtitle(text: string, dur = 4.5): void {
    this.subtitleEl.textContent = text;
    this.subtitleEl.classList.add("show");
    this.subTimer = dur;
  }

  prompt(text: string | null, key = "E"): void {
    if (!text) {
      this.promptEl.textContent = "";
    } else {
      this.promptEl.innerHTML = `<span class="key">${key}</span>${text}`;
    }
  }

  battery(frac: number, on: boolean): void {
    this.batteryFill.style.width = `${Math.round(frac * 100)}%`;
    this.batteryFill.classList.toggle("low", frac < 0.2);
    this.batteryBox.classList.toggle("off", !on);
  }

  bottles(n: number): void {
    this.bottlesEl.textContent = String(n);
  }

  stamina(frac: number, exhausted: boolean): void {
    this.staminaBox.classList.toggle("show", frac < 0.995);
    this.staminaFill.style.width = `${Math.round(frac * 100)}%`;
    this.staminaFill.classList.toggle("gone", exhausted);
  }

  openNote(title: string, body: string): void {
    this.noteTitle.textContent = title;
    this.noteBody.textContent = body;
    this.noteBox.classList.remove("hidden");
    this.noteOpen = true;
  }

  closeNote(): void {
    this.noteBox.classList.add("hidden");
    this.noteOpen = false;
  }

  damageFlash(strength = 0.8): void {
    this.damageEl.style.transition = "none";
    this.damageEl.style.opacity = String(strength);
    requestAnimationFrame(() => {
      this.damageEl.style.transition = "opacity 1.4s";
      this.damageEl.style.opacity = "0";
    });
  }

  chase(on: boolean): void {
    this.chaseEl.classList.toggle("on", on);
  }

  blackout(opacity: number, seconds: number): void {
    this.blackoutEl.style.transition = `opacity ${seconds}s`;
    this.blackoutEl.style.opacity = String(opacity);
  }

  update(dt: number): void {
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.subtitleEl.classList.remove("show");
    }
  }

  showScreen(id: "title" | "pause" | "dead" | "win" | null): void {
    for (const s of ["title", "pause", "dead", "win"]) {
      el(s).classList.toggle("hidden", s !== id);
    }
  }
}
