import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { WeaponDef, WeaponId, WEAPONS, STARTING_INVENTORY, AmmoType } from "../data/content";
import { makeMat } from "./ProceduralArt";
import { dampCoeff } from "../util/math";

export interface WeaponState {
  id: WeaponId;
  def: WeaponDef;
  mag: number;
  reserve: number;
  cooldown: number;
  reloadTimer: number;
}

export class Player {
  root: TransformNode;
  body: Mesh;
  head: Mesh;
  weaponMesh: Mesh;
  hp = 100;
  maxHp = 100;
  stamina = 100;
  maxStamina = 100;
  medkits = 1;
  radius = 0.42;
  inventory: WeaponState[];
  selected = 0;
  invuln = 0;
  noise = 0;
  dead = false;
  private yawTarget = 0;
  private swingTimer = 0;

  constructor(private scene: Scene, shadow: ShadowGenerator) {
    this.root = new TransformNode("playerRoot", scene);
    this.root.position.y = 0;

    const bodyMat = makeMat(scene, "playerBody", new Color3(0.55, 0.55, 0.48), new Color3(0.025, 0.035, 0.025));
    const headMat = makeMat(scene, "playerHead", new Color3(0.42, 0.38, 0.34), new Color3(0.02, 0.015, 0.012));
    const weaponMat = makeMat(scene, "playerWeapon", new Color3(0.18, 0.16, 0.13), new Color3(0.04, 0.028, 0.015));

    this.body = MeshBuilder.CreateCapsule("playerBody", { radius: 0.32, height: 1.35 }, scene);
    this.body.parent = this.root;
    this.body.position.y = 0.72;
    this.body.material = bodyMat;
    this.head = MeshBuilder.CreateSphere("playerHead", { diameter: 0.36, segments: 10 }, scene);
    this.head.parent = this.root;
    this.head.position.set(0, 1.52, 0.04);
    this.head.material = headMat;
    this.weaponMesh = MeshBuilder.CreateBox("playerWeapon", { width: 0.12, height: 0.12, depth: 0.9 }, scene);
    this.weaponMesh.parent = this.root;
    this.weaponMesh.position.set(0.34, 1.05, 0.42);
    this.weaponMesh.rotation.x = 0.15;
    this.weaponMesh.material = weaponMat;
    this.body.isVisible = false;
    this.head.isVisible = false;
    this.weaponMesh.isVisible = false;
    shadow.addShadowCaster(this.body);
    shadow.addShadowCaster(this.head);
    shadow.addShadowCaster(this.weaponMesh);

    this.inventory = STARTING_INVENTORY.map((id) => this.createWeaponState(id));
  }

  get position(): Vector3 {
    return this.root.position;
  }

  get weapon(): WeaponState {
    return this.inventory[this.selected];
  }

  select(slot: number): void {
    if (slot >= 0 && slot < this.inventory.length) this.selected = slot;
  }

  cycle(dir: number): void {
    if (this.inventory.length === 0 || dir === 0) return;
    this.selected = (this.selected + dir + this.inventory.length) % this.inventory.length;
  }

  resetInventory(): void {
    this.inventory = STARTING_INVENTORY.map((id) => this.createWeaponState(id));
    this.selected = 0;
  }

  addWeapon(id: WeaponId): boolean {
    if (this.inventory.some((weapon) => weapon.id === id)) return false;
    this.inventory.push(this.createWeaponState(id));
    return true;
  }

  addSupplies(ammo: Partial<Record<AmmoType, number>> | undefined, medkits = 0): void {
    if (ammo) {
      for (const weapon of this.inventory) {
        if (weapon.def.ammoType === "none") continue;
        weapon.reserve += ammo[weapon.def.ammoType] ?? 0;
      }
    }
    this.medkits += medkits;
  }

  takeDamage(amount: number): boolean {
    if (this.invuln > 0 || this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = 0.36;
    if (this.hp <= 0) this.dead = true;
    return true;
  }

  useMedkit(): boolean {
    if (this.medkits <= 0 || this.hp >= this.maxHp || this.dead) return false;
    this.medkits--;
    this.hp = Math.min(this.maxHp, this.hp + 42);
    return true;
  }

  startReload(): boolean {
    const w = this.weapon;
    if (w.def.ammoType === "none" || w.reloadTimer > 0 || w.mag >= w.def.magSize || w.reserve <= 0) return false;
    w.reloadTimer = w.def.reloadTime;
    return true;
  }

  canFire(held: boolean): boolean {
    const w = this.weapon;
    if (w.reloadTimer > 0 || w.cooldown > 0) return false;
    if (!w.def.automatic && held && !w.def.melee) return false;
    if (w.def.ammoType !== "none" && w.mag <= 0) return false;
    return true;
  }

  spendShot(): void {
    const w = this.weapon;
    if (w.def.ammoType !== "none") w.mag = Math.max(0, w.mag - 1);
    w.cooldown = 1 / w.def.fireRate;
    this.noise = Math.min(1, this.noise + w.def.noise);
    this.swingTimer = w.def.melee ? 0.18 : 0.08;
  }

  update(dt: number, moving: boolean, sprinting: boolean, yaw: number): void {
    this.invuln = Math.max(0, this.invuln - dt);
    this.noise = Math.max(0, this.noise - dt * 0.12);
    for (const w of this.inventory) {
      w.cooldown = Math.max(0, w.cooldown - dt);
      if (w.reloadTimer > 0) {
        w.reloadTimer = Math.max(0, w.reloadTimer - dt);
        if (w.reloadTimer === 0) {
          const need = w.def.magSize - w.mag;
          const take = Math.min(need, w.reserve);
          w.mag += take;
          w.reserve -= take;
        }
      }
    }
    if (sprinting && moving && this.stamina > 0) this.stamina = Math.max(0, this.stamina - dt * 24);
    else this.stamina = Math.min(this.maxStamina, this.stamina + dt * 18);
    this.yawTarget = yaw;
    const diff = ((this.yawTarget - this.root.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.root.rotation.y += diff * dampCoeff(18, dt);
    this.swingTimer = Math.max(0, this.swingTimer - dt);
    this.weaponMesh.rotation.x = 0.15 + Math.sin(this.swingTimer * 35) * 0.22;
    const flash = this.invuln > 0 ? 0.45 + 0.55 * Math.sin(performance.now() * 0.035) : 1;
    this.body.visibility = flash;
    this.head.visibility = flash;
  }

  dispose(): void {
    this.root.dispose(false, true);
  }

  private createWeaponState(id: WeaponId): WeaponState {
    const def = WEAPONS[id];
    return { id, def, mag: def.magSize, reserve: def.startReserve, cooldown: 0, reloadTimer: 0 };
  }
}
