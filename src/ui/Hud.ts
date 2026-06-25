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
  private letterboxEl = el("letterbox");
  private captionEl = el("caption");
  private skipHintEl = el("skiphint");
  private flashEl = el("flash");
  private toastEl = el("toast");
  private subTimer = 0;
  private capTimer = 0;
  private toastTimer = 0;
  noteOpen = false;

  // film grain + the atmospheric vignette now live in the post-processing
  // pipeline (src/core/Post.ts); the dynamic event overlays below stay in DOM.

  show(): void {
    el("hud").classList.remove("hidden");
  }

  hide(): void {
    el("hud").classList.add("hidden");
  }

  /** brief unobtrusive notice, e.g. "checkpoint" */
  toast(text: string, dur = 2.2): void {
    // never overlay a cutscene — the letterbox frame owns the screen
    if (this.letterboxEl.classList.contains("on")) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add("show");
    this.toastTimer = dur;
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

  // ---------- cinematic ----------
  letterbox(on: boolean): void {
    this.letterboxEl.classList.toggle("on", on);
    this.skipHint(on);
    if (!on) this.hideCaption();
    if (on) { this.toastEl.classList.remove("show"); this.toastTimer = 0; }
  }

  /** cinematic dialogue line; `who` is the speaker label (e.g. "VESNA") */
  caption(text: string, who = "", dur = 4.5): void {
    this.captionEl.innerHTML = (who ? `<span class="who">${who}</span>` : "") + text;
    this.captionEl.classList.add("show");
    this.capTimer = dur;
  }

  hideCaption(): void {
    this.captionEl.classList.remove("show");
    this.capTimer = 0;
  }

  skipHint(on: boolean): void {
    this.skipHintEl.classList.toggle("show", on);
  }

  /** white flash (broadcast surge); strength 0..1 */
  flash(strength = 1): void {
    this.flashEl.style.transition = "none";
    this.flashEl.style.opacity = String(strength);
    requestAnimationFrame(() => {
      this.flashEl.style.transition = "opacity 0.7s";
      this.flashEl.style.opacity = "0";
    });
  }

  update(dt: number): void {
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.subtitleEl.classList.remove("show");
    }
    if (this.capTimer > 0) {
      this.capTimer -= dt;
      if (this.capTimer <= 0) this.captionEl.classList.remove("show");
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove("show");
    }
  }

  showScreen(id: "title" | "pause" | "options" | "dead" | "win" | null): void {
    for (const s of ["title", "pause", "options", "dead", "win"]) {
      el(s).classList.toggle("hidden", s !== id);
    }
  }
}
