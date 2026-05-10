import { Camera } from "@babylonjs/core/Cameras/camera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { WeaponId } from "../data/content";
import { dampCoeff } from "../util/math";
import { makeMat } from "./ProceduralArt";
import type { WeaponState } from "./Player";

interface WeaponGroup {
  root: TransformNode;
  base: Vector3;
  rot: Vector3;
}

export class WeaponViewModel {
  private root: TransformNode;
  private groups = new Map<WeaponId, WeaponGroup>();
  private active: WeaponId | null = null;
  private bobTimer = 0;
  private recoil = 0;
  private reloadDip = 0;
  private swing = 0;
  private throwKick = 0;

  constructor(private scene: Scene, camera: Camera) {
    this.root = new TransformNode("weaponViewRoot", scene);
    this.root.parent = camera;
    this.createGroups();
  }

  onFire(id: WeaponId): void {
    if (id === "bat") this.swing = 1;
    else if (id === "pipebomb") this.throwKick = 1;
    else this.recoil = Math.min(1, this.recoil + 0.95);
  }

  onReload(): void {
    this.reloadDip = 1;
  }

  update(dt: number, weapon: WeaponState, moving: boolean, sprinting: boolean): void {
    this.setActive(weapon.id);
    this.bobTimer += dt * (moving ? (sprinting ? 10 : 6.6) : 2.4);
    this.recoil += (0 - this.recoil) * dampCoeff(18, dt);
    this.reloadDip += ((weapon.reloadTimer > 0 ? 1 : 0) - this.reloadDip) * dampCoeff(8, dt);
    this.swing += (0 - this.swing) * dampCoeff(16, dt);
    this.throwKick += (0 - this.throwKick) * dampCoeff(11, dt);

    const group = this.groups.get(weapon.id);
    if (!group) return;
    const bobX = Math.sin(this.bobTimer * 0.55) * (moving ? 0.012 : 0.004);
    const bobY = Math.abs(Math.sin(this.bobTimer)) * (moving ? 0.020 : 0.006);
    group.root.position.set(
      group.base.x + bobX - this.recoil * 0.045,
      group.base.y - bobY - this.reloadDip * 0.13 - this.throwKick * 0.18,
      group.base.z - this.recoil * 0.18 + this.throwKick * 0.10
    );
    group.root.rotation.set(
      group.rot.x + this.recoil * 0.20 + this.reloadDip * 0.38 - this.swing * 0.72,
      group.rot.y + Math.sin(this.bobTimer * 0.45) * 0.010 + this.throwKick * 0.22,
      group.rot.z + this.reloadDip * 0.22 + this.swing * 0.34
    );
  }

  dispose(): void {
    this.root.dispose(false, true);
  }

  private setActive(id: WeaponId): void {
    if (this.active === id) return;
    this.active = id;
    for (const [weaponId, group] of this.groups) {
      group.root.setEnabled(weaponId === id);
    }
  }

  private createGroups(): void {
    const metal = makeMat(this.scene, "vm_metal", new Color3(0.13, 0.12, 0.105), new Color3(0.018, 0.015, 0.012));
    const dark = makeMat(this.scene, "vm_dark", new Color3(0.055, 0.052, 0.048), new Color3(0.006, 0.005, 0.005));
    const wood = makeMat(this.scene, "vm_wood", new Color3(0.24, 0.15, 0.08), new Color3(0.018, 0.009, 0.004));
    const tape = makeMat(this.scene, "vm_tape", new Color3(0.42, 0.36, 0.27), new Color3(0.014, 0.010, 0.006));
    const flare = makeMat(this.scene, "vm_flare", new Color3(0.46, 0.12, 0.08), new Color3(0.15, 0.026, 0.014));

    this.groups.set("bat", this.createBat(wood, metal, tape));
    this.groups.set("pistol", this.createPistol(metal, dark));
    this.groups.set("shotgun", this.createLongGun("vm_shotgun", 0.72, metal, wood, new Vector3(0.32, -0.35, 0.86)));
    this.groups.set("rifle", this.createLongGun("vm_rifle", 0.92, metal, wood, new Vector3(0.30, -0.34, 0.90)));
    this.groups.set("flare", this.createPistol(flare, dark, "vm_flareGun"));
    this.groups.set("pipebomb", this.createPipeBomb(metal, tape));

    for (const group of this.groups.values()) group.root.setEnabled(false);
  }

  private createBat(wood: StandardMaterial, metal: StandardMaterial, tape: StandardMaterial): WeaponGroup {
    const root = this.groupRoot("vm_bat", new Vector3(0.42, -0.27, 0.66), new Vector3(-0.18, -0.08, -0.42));
    const handle = this.box("vm_bat_handle", { width: 0.11, height: 0.11, depth: 0.82 }, wood, root);
    handle.rotation.x = Math.PI * 0.08;
    const wrap = this.box("vm_bat_wrap", { width: 0.13, height: 0.13, depth: 0.22 }, tape, root);
    wrap.position.z = -0.28;
    for (let i = 0; i < 5; i++) {
      const nail = this.cyl(`vm_bat_nail_${i}`, 0.018, 0.22, metal, root);
      nail.position.set((i - 2) * 0.025, 0.08, 0.08 + i * 0.06);
      nail.rotation.z = Math.PI * 0.5;
    }
    return { root, base: root.position.clone(), rot: root.rotation.clone() };
  }

  private createPistol(metal: StandardMaterial, grip: StandardMaterial, name = "vm_pistol"): WeaponGroup {
    const root = this.groupRoot(name, new Vector3(0.34, -0.34, 0.72), new Vector3(0.02, -0.04, 0.00));
    const slide = this.box(`${name}_slide`, { width: 0.16, height: 0.12, depth: 0.42 }, metal, root);
    slide.position.set(0, 0.04, 0.12);
    const handle = this.box(`${name}_grip`, { width: 0.14, height: 0.28, depth: 0.14 }, grip, root);
    handle.position.set(0.005, -0.12, -0.04);
    handle.rotation.x = -0.22;
    const barrel = this.cyl(`${name}_barrel`, 0.045, 0.34, metal, root);
    barrel.position.set(0, 0.04, 0.34);
    barrel.rotation.x = Math.PI * 0.5;
    return { root, base: root.position.clone(), rot: root.rotation.clone() };
  }

  private createLongGun(name: string, length: number, metal: StandardMaterial, wood: StandardMaterial, base: Vector3): WeaponGroup {
    const root = this.groupRoot(name, base, new Vector3(0.03, -0.03, 0.00));
    const stock = this.box(`${name}_stock`, { width: 0.16, height: 0.16, depth: 0.34 }, wood, root);
    stock.position.set(0.03, -0.08, -0.18);
    const body = this.box(`${name}_body`, { width: 0.14, height: 0.13, depth: 0.34 }, metal, root);
    body.position.set(0, 0.02, 0.12);
    const barrel = this.cyl(`${name}_barrel`, 0.035, length, metal, root);
    barrel.position.set(0, 0.04, 0.44);
    barrel.rotation.x = Math.PI * 0.5;
    const pump = this.box(`${name}_fore`, { width: 0.17, height: 0.10, depth: 0.24 }, wood, root);
    pump.position.set(0, -0.05, 0.32);
    return { root, base: root.position.clone(), rot: root.rotation.clone() };
  }

  private createPipeBomb(metal: StandardMaterial, tape: StandardMaterial): WeaponGroup {
    const root = this.groupRoot("vm_pipebomb", new Vector3(0.37, -0.34, 0.62), new Vector3(0.26, -0.14, -0.08));
    const pipe = this.cyl("vm_pipebomb_body", 0.09, 0.48, metal, root);
    pipe.rotation.x = Math.PI * 0.5;
    const bandA = this.box("vm_pipebomb_band_a", { width: 0.21, height: 0.055, depth: 0.055 }, tape, root);
    bandA.position.z = -0.15;
    const bandB = this.box("vm_pipebomb_band_b", { width: 0.21, height: 0.055, depth: 0.055 }, tape, root);
    bandB.position.z = 0.15;
    return { root, base: root.position.clone(), rot: root.rotation.clone() };
  }

  private groupRoot(name: string, position: Vector3, rotation: Vector3): TransformNode {
    const node = new TransformNode(name, this.scene);
    node.parent = this.root;
    node.position.copyFrom(position);
    node.rotation.copyFrom(rotation);
    return node;
  }

  private box(name: string, size: { width: number; height: number; depth: number }, mat: StandardMaterial, parent: TransformNode): Mesh {
    const mesh = MeshBuilder.CreateBox(name, size, this.scene);
    mesh.material = mat;
    mesh.parent = parent;
    mesh.isPickable = false;
    return mesh;
  }

  private cyl(name: string, diameter: number, height: number, mat: StandardMaterial, parent: TransformNode): Mesh {
    const mesh = MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: 8 }, this.scene);
    mesh.material = mat;
    mesh.parent = parent;
    mesh.isPickable = false;
    return mesh;
  }
}
