import { Player } from "../game/Player";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

export class Hud {
  private hud = el<HTMLDivElement>("hud");
  private hpBar = el<HTMLSpanElement>("hpBar");
  private hpText = el<HTMLLabelElement>("hpText");
  private staminaBar = el<HTMLSpanElement>("staminaBar");
  private staminaText = el<HTMLLabelElement>("staminaText");
  private weaponName = el<HTMLDivElement>("weaponName");
  private ammoText = el<HTMLDivElement>("ammoText");
  private objectiveText = el<HTMLDivElement>("objectiveText");
  private promptText = el<HTMLDivElement>("promptText");
  private narrativeText = el<HTMLDivElement>("narrativeText");
  private deathText = el<HTMLDivElement>("deathText");
  private startScreen = el<HTMLDivElement>("startScreen");
  private narrativeTimer = 0;

  setGameplayVisible(visible: boolean): void {
    this.hud.classList.toggle("gameplay-hidden", !visible);
  }

  setStartVisible(visible: boolean): void {
    this.startScreen.style.display = visible ? "grid" : "none";
  }

  showDeath(visible: boolean): void {
    this.deathText.hidden = !visible;
  }

  setObjective(text: string): void {
    this.objectiveText.textContent = text;
  }

  setPrompt(text: string): void {
    this.promptText.textContent = text;
  }

  showNarrative(text: string, duration = 4.2): void {
    this.narrativeText.textContent = text;
    this.narrativeText.classList.add("visible");
    this.narrativeTimer = duration;
  }

  update(dt: number, player: Player, dread: number): void {
    if (this.narrativeTimer > 0) {
      this.narrativeTimer = Math.max(0, this.narrativeTimer - dt);
      if (this.narrativeTimer === 0) this.narrativeText.classList.remove("visible");
    }
    const hp = Math.max(0, player.hp / player.maxHp);
    const st = Math.max(0, player.stamina / player.maxStamina);
    this.hpBar.style.width = `${hp * 100}%`;
    this.staminaBar.style.width = `${st * 100}%`;
    this.hpText.textContent = `HP ${Math.ceil(player.hp)}`;
    this.staminaText.textContent = `STAMINA ${Math.ceil(player.stamina)}`;
    const w = player.weapon;
    this.weaponName.textContent = w.def.name;
    if (w.def.ammoType === "none") {
      this.ammoText.textContent = "MELEE";
    } else if (w.reloadTimer > 0) {
      this.ammoText.textContent = "RELOADING";
    } else {
      this.ammoText.textContent = `${w.mag} / ${w.reserve}`;
    }
    document.body.style.filter = dread > 0.72 ? `saturate(${0.9 + dread * 0.25})` : "";
  }
}
