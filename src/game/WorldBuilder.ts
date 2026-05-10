import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ZoneDef, WallDef, InteractableDef, PropDef } from "../data/content";
import { RectCollider } from "./Collision";
import { makeGeneratedMaterial, makeGrimeMaterial, makeMat, makePosterMaterial } from "./ProceduralArt";

export interface RuntimeInteractable {
  def: InteractableDef;
  mesh: Mesh;
  used: boolean;
  light?: PointLight;
}

export interface WorldRuntime {
  root: TransformNode;
  zone: ZoneDef;
  floor: Mesh;
  aimFloors: Mesh[];
  walls: WallDef[];
  colliders: RectCollider[];
  interactables: RuntimeInteractable[];
  dispose(): void;
}

export class WorldBuilder {
  private mats = new Map<string, StandardMaterial>();

  constructor(private scene: Scene, private shadow: ShadowGenerator) {}

  build(zone: ZoneDef): WorldRuntime {
    const root = new TransformNode(`zone_${zone.id}`, this.scene);
    const floorMat = makeGrimeMaterial(this.scene, `${zone.id}_floor`, zone.floor, zone.accent);
    const wallMat = makeGrimeMaterial(this.scene, `${zone.id}_wall`, zone.wall, zone.accent);
    const floor = MeshBuilder.CreateGround(`${zone.id}_floor`, { width: zone.width, height: zone.depth, subdivisions: 2 }, this.scene);
    floor.parent = root;
    floor.material = floorMat;
    floor.isPickable = true;
    floor.metadata = { aimFloor: true };
    floor.receiveShadows = true;

    const runtimeWalls: WallDef[] = [...zone.walls];
    const outer: WallDef[] = [
      { x: 0, z: zone.depth / 2, w: zone.width, d: 0.8, h: 4.2 },
      { x: 0, z: -zone.depth / 2, w: zone.width, d: 0.8, h: 4.2 },
      { x: -zone.width / 2, z: 0, w: 0.8, d: zone.depth, h: 4.2 },
      { x: zone.width / 2, z: 0, w: 0.8, d: zone.depth, h: 4.2 }
    ];
    const colliders: RectCollider[] = [...outer, ...zone.walls].map((wall) => ({
      x: wall.x,
      z: wall.z,
      w: wall.w,
      d: wall.d,
      label: wall.label
    }));
    for (const w of [...outer, ...zone.walls]) {
      this.createWall(root, w, wallMat);
    }

    for (const p of zone.props) {
      this.createProp(root, p, zone);
      const collider = this.colliderForProp(p);
      if (collider) colliders.push(collider);
    }
    this.createFloorDecals(root, zone);
    const interactables = zone.interactables.map((def) => this.createInteractable(root, def, zone));

    const fogMotes = Math.min(18, Math.floor((zone.width * zone.depth) / 50));
    for (let i = 0; i < fogMotes; i++) {
      const mote = MeshBuilder.CreatePlane(`fogCard_${zone.id}_${i}`, { width: 3 + Math.random() * 3, height: 1.2 + Math.random() * 1.4 }, this.scene);
      mote.parent = root;
      mote.position.set((Math.random() - 0.5) * zone.width, 0.5 + Math.random() * 1.4, (Math.random() - 0.5) * zone.depth);
      mote.rotation.y = Math.random() * Math.PI;
      const mat = makeMat(this.scene, `fogCardMat_${zone.id}_${i}`, zone.fog, zone.fog);
      mat.alpha = 0.12;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mote.material = mat;
      mote.isPickable = false;
    }

    root.getChildMeshes().forEach((m) => {
      m.freezeWorldMatrix();
      if (m instanceof Mesh && m.material) m.material.freeze();
    });

    return {
      root,
      zone,
      floor,
      aimFloors: [floor],
      walls: runtimeWalls,
      colliders,
      interactables,
      dispose() {
        root.dispose(false, true);
        for (const it of interactables) it.light?.dispose();
      }
    };
  }

  private createWall(root: TransformNode, wall: WallDef, mat: StandardMaterial): Mesh {
    const h = wall.h ?? 3.2;
    const mesh = MeshBuilder.CreateBox(`wall_${wall.label ?? "block"}`, { width: wall.w, depth: wall.d, height: h }, this.scene);
    mesh.parent = root;
    mesh.position.set(wall.x, h / 2, wall.z);
    mesh.material = mat;
    mesh.receiveShadows = true;
    this.shadow.addShadowCaster(mesh);
    return mesh;
  }

  private createProp(root: TransformNode, prop: PropDef, zone: ZoneDef): Mesh {
    const matKey = `${zone.id}_${prop.kind}`;
    let mat = this.mats.get(matKey);
    if (!mat) {
      const color = prop.kind === "poster" ? new Color3(0.50, 0.37, 0.23)
        : prop.kind === "sign" ? new Color3(0.64, 0.54, 0.38)
        : prop.kind === "car" ? new Color3(0.08, 0.09, 0.10)
          : prop.kind === "boiler" ? new Color3(0.24, 0.10, 0.05)
            : prop.kind === "shelf" ? new Color3(0.13, 0.15, 0.11)
              : prop.kind === "gate" || prop.kind === "barrier" ? new Color3(0.18, 0.045, 0.040)
                : prop.kind === "cot" || prop.kind === "curtain" || prop.kind === "bodybag" ? new Color3(0.30, 0.30, 0.24)
                  : prop.kind === "floodlight" || prop.kind === "speaker" || prop.kind === "cable" ? new Color3(0.055, 0.055, 0.060)
                    : prop.kind === "candle" ? new Color3(0.62, 0.50, 0.34)
                      : zone.accent;
      mat = prop.kind === "sign"
        ? makeGeneratedMaterial(this.scene, `${matKey}_signage`, "wod2-intake-signage-atlas.png", 1)
        : prop.kind === "cot" || prop.kind === "curtain" || prop.kind === "bodybag"
          ? makeGeneratedMaterial(this.scene, `${matKey}_triage`, "wod2-triage-prop-atlas.png", 1)
          : prop.kind === "poster"
        ? makePosterMaterial(this.scene, `${matKey}_poster`, zone.id === "freedom" ? "FREEDOM" : "EVAC")
        : makeMat(this.scene, `${matKey}_mat`, color, new Color3(color.r * 0.05, color.g * 0.04, color.b * 0.03));
      this.mats.set(matKey, mat);
    }

    let mesh: Mesh;
    const s = prop.scale ?? 1;
    if (prop.kind === "poster" || prop.kind === "sign") {
      mesh = MeshBuilder.CreatePlane(`prop_${prop.kind}`, { width: (prop.kind === "sign" ? 2.35 : 1.4) * s, height: (prop.kind === "sign" ? 1.20 : 2.0) * s }, this.scene);
      mesh.position.set(prop.x, prop.kind === "sign" ? 1.7 * s : 1.65, prop.z);
      mesh.rotation.y = prop.rot ?? 0;
    } else if (prop.kind === "pillar") {
      mesh = MeshBuilder.CreateCylinder(`prop_${prop.kind}`, { diameter: 1.0 * s, height: 3.2, tessellation: 8 }, this.scene);
      mesh.position.set(prop.x, 1.6, prop.z);
    } else if (prop.kind === "debris") {
      mesh = MeshBuilder.CreateBox(`prop_${prop.kind}`, { width: 1.2 * s, depth: 0.8 * s, height: 0.28 * s }, this.scene);
      mesh.position.set(prop.x, 0.14 * s, prop.z);
      mesh.rotation.y = prop.rot ?? Math.random() * Math.PI;
    } else if (prop.kind === "floodlight") {
      mesh = MeshBuilder.CreateBox(`prop_${prop.kind}`, { width: 0.76 * s, depth: 0.34 * s, height: 0.42 * s }, this.scene);
      mesh.position.set(prop.x, 2.25 * s, prop.z);
      mesh.rotation.y = prop.rot ?? 0;
    } else if (prop.kind === "speaker") {
      mesh = MeshBuilder.CreateBox(`prop_${prop.kind}`, { width: 0.62 * s, depth: 0.38 * s, height: 0.46 * s }, this.scene);
      mesh.position.set(prop.x, 2.15 * s, prop.z);
      mesh.rotation.y = prop.rot ?? 0;
    } else if (prop.kind === "barrier") {
      mesh = MeshBuilder.CreateBox(`prop_${prop.kind}`, { width: 2.25 * s, depth: 0.18 * s, height: 0.78 * s }, this.scene);
      mesh.position.set(prop.x, 0.39 * s, prop.z);
      mesh.rotation.y = prop.rot ?? 0;
    } else if (prop.kind === "cot") {
      mesh = MeshBuilder.CreateBox(`prop_${prop.kind}`, { width: 2.05 * s, depth: 0.72 * s, height: 0.34 * s }, this.scene);
      mesh.position.set(prop.x, 0.48 * s, prop.z);
      mesh.rotation.y = prop.rot ?? 0;
    } else if (prop.kind === "curtain") {
      mesh = MeshBuilder.CreatePlane(`prop_${prop.kind}`, { width: 2.15 * s, height: 1.95 * s }, this.scene);
      mesh.position.set(prop.x, 1.25 * s, prop.z);
      mesh.rotation.y = prop.rot ?? 0;
    } else if (prop.kind === "bodybag") {
      mesh = MeshBuilder.CreateCapsule(`prop_${prop.kind}`, { radius: 0.28 * s, height: 1.85 * s, tessellation: 8 }, this.scene);
      mesh.position.set(prop.x, 0.33 * s, prop.z);
      mesh.rotation.z = Math.PI * 0.5;
      mesh.rotation.y = prop.rot ?? 0;
    } else if (prop.kind === "cable") {
      mesh = MeshBuilder.CreateBox(`prop_${prop.kind}`, { width: 2.6 * s, depth: 0.11 * s, height: 0.10 * s }, this.scene);
      mesh.position.set(prop.x, 0.08 * s, prop.z);
      mesh.rotation.y = prop.rot ?? 0;
    } else if (prop.kind === "candle") {
      mesh = MeshBuilder.CreateCylinder(`prop_${prop.kind}`, { diameter: 0.18 * s, height: 0.52 * s, tessellation: 10 }, this.scene);
      mesh.position.set(prop.x, 0.26 * s, prop.z);
    } else if (prop.kind === "gate") {
      mesh = MeshBuilder.CreateBox(`prop_${prop.kind}`, { width: 4.8 * s, depth: 0.18 * s, height: 2.9 * s }, this.scene);
      mesh.position.set(prop.x, 1.45 * s, prop.z);
      mesh.rotation.y = prop.rot ?? 0;
    } else {
      const width = prop.kind === "car" ? 3.3 * s : prop.kind === "shelf" ? 4.2 * s : prop.kind === "pew" ? 2.1 * s : 1.8 * s;
      const depth = prop.kind === "car" ? 1.8 * s : prop.kind === "shelf" ? 0.45 * s : prop.kind === "pew" ? 0.65 * s : 1.2 * s;
      const height = prop.kind === "boiler" ? 2.8 * s : prop.kind === "car" ? 0.9 * s : 1.0 * s;
      mesh = MeshBuilder.CreateBox(`prop_${prop.kind}`, { width, depth, height }, this.scene);
      mesh.position.set(prop.x, height / 2, prop.z);
      mesh.rotation.y = prop.rot ?? 0;
    }
    mesh.parent = root;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.shadow.addShadowCaster(mesh);
    this.createPropDetails(mesh, prop, zone, mat);
    return mesh;
  }

  private createPropDetails(parent: Mesh, prop: PropDef, zone: ZoneDef, baseMat: StandardMaterial): void {
    const darkKey = `${zone.id}_detail_dark`;
    let darkMat = this.mats.get(darkKey);
    if (!darkMat) {
      darkMat = makeMat(this.scene, darkKey, new Color3(0.018, 0.018, 0.020), new Color3(0.004, 0.003, 0.003));
      this.mats.set(darkKey, darkMat);
    }
    const rustKey = `${zone.id}_detail_rust`;
    let rustMat = this.mats.get(rustKey);
    if (!rustMat) {
      rustMat = makeMat(this.scene, rustKey, new Color3(0.23, 0.075, 0.035), new Color3(0.025, 0.004, 0.002));
      this.mats.set(rustKey, rustMat);
    }

    const addBox = (name: string, size: { width: number; height: number; depth: number }, pos: Vector3, mat: StandardMaterial): Mesh => {
      const child = MeshBuilder.CreateBox(name, size, this.scene);
      child.parent = parent;
      child.position.copyFrom(pos);
      child.material = mat;
      child.isPickable = false;
      child.receiveShadows = true;
      this.shadow.addShadowCaster(child);
      return child;
    };
    const addCylinder = (name: string, diameter: number, height: number, pos: Vector3, mat: StandardMaterial, rotZ = Math.PI * 0.5): Mesh => {
      const child = MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: 8 }, this.scene);
      child.parent = parent;
      child.position.copyFrom(pos);
      child.rotation.z = rotZ;
      child.material = mat;
      child.isPickable = false;
      child.receiveShadows = true;
      this.shadow.addShadowCaster(child);
      return child;
    };

    const s = prop.scale ?? 1;
    if (prop.kind === "car") {
      addBox("prop_car_cabin", { width: 1.45 * s, height: 0.36 * s, depth: 1.00 * s }, new Vector3(-0.05 * s, 0.54 * s, -0.02 * s), darkMat);
      addBox("prop_car_window", { width: 1.35 * s, height: 0.12 * s, depth: 0.82 * s }, new Vector3(0, 0.76 * s, -0.02 * s), darkMat);
      for (const x of [-1.12 * s, 1.12 * s]) {
        for (const z of [-0.62 * s, 0.62 * s]) addCylinder("prop_car_wheel", 0.34 * s, 0.22 * s, new Vector3(x, -0.28 * s, z), darkMat);
      }
    } else if (prop.kind === "shelf") {
      for (const y of [-0.28 * s, 0.04 * s, 0.34 * s]) addBox("prop_shelf_plank", { width: 3.9 * s, height: 0.045 * s, depth: 0.50 * s }, new Vector3(0, y, 0), baseMat);
      for (const x of [-1.85 * s, 1.85 * s]) addBox("prop_shelf_post", { width: 0.055 * s, height: 0.88 * s, depth: 0.055 * s }, new Vector3(x, 0.02 * s, 0.20 * s), rustMat);
    } else if (prop.kind === "boiler") {
      addCylinder("prop_boiler_pipe_a", 0.16 * s, 1.55 * s, new Vector3(-0.58 * s, 0.42 * s, 0.54 * s), rustMat, 0);
      addCylinder("prop_boiler_pipe_b", 0.12 * s, 1.25 * s, new Vector3(0.56 * s, 0.42 * s, -0.52 * s), rustMat, 0);
      addBox("prop_boiler_gauge", { width: 0.28 * s, height: 0.28 * s, depth: 0.045 * s }, new Vector3(0, 0.50 * s, -0.62 * s), darkMat);
    } else if (prop.kind === "pew") {
      addBox("prop_pew_back", { width: 2.0 * s, height: 0.30 * s, depth: 0.08 * s }, new Vector3(0, 0.28 * s, -0.28 * s), baseMat);
      addBox("prop_pew_seat", { width: 2.0 * s, height: 0.09 * s, depth: 0.48 * s }, new Vector3(0, 0.05 * s, 0.02 * s), baseMat);
    } else if (prop.kind === "pillar") {
      addCylinder("prop_pillar_top", 1.16 * s, 0.16 * s, new Vector3(0, 1.44, 0), baseMat, 0);
      addCylinder("prop_pillar_base", 1.16 * s, 0.16 * s, new Vector3(0, -1.44, 0), baseMat, 0);
    } else if (prop.kind === "debris") {
      addBox("prop_debris_sliver_a", { width: 0.58 * s, height: 0.08 * s, depth: 0.10 * s }, new Vector3(0.10 * s, 0.24 * s, 0.08 * s), rustMat);
      addBox("prop_debris_sliver_b", { width: 0.42 * s, height: 0.06 * s, depth: 0.08 * s }, new Vector3(-0.16 * s, 0.22 * s, -0.12 * s), darkMat);
    } else if (prop.kind === "gate") {
      for (const x of [-1.8, -0.9, 0, 0.9, 1.8]) addBox("prop_gate_bar", { width: 0.08 * s, height: 2.65 * s, depth: 0.10 * s }, new Vector3(x * s, 0, -0.10 * s), darkMat);
      addBox("prop_gate_chain", { width: 1.2 * s, height: 0.09 * s, depth: 0.14 * s }, new Vector3(0, 0.20 * s, -0.18 * s), rustMat);
    } else if (prop.kind === "barrier") {
      addBox("prop_barrier_stripe_a", { width: 0.34 * s, height: 0.84 * s, depth: 0.04 * s }, new Vector3(-0.45 * s, 0, -0.12 * s), rustMat);
      addBox("prop_barrier_stripe_b", { width: 0.34 * s, height: 0.84 * s, depth: 0.04 * s }, new Vector3(0.45 * s, 0, -0.12 * s), rustMat);
    } else if (prop.kind === "floodlight") {
      addCylinder("prop_floodlight_stand", 0.08 * s, 2.10 * s, new Vector3(0, -1.20 * s, 0.05 * s), darkMat, 0);
      const lensMat = makeMat(this.scene, `${zone.id}_floodlight_lens_${prop.x}_${prop.z}`, new Color3(0.90, 0.76, 0.42), new Color3(0.32, 0.22, 0.08));
      addBox("prop_floodlight_lens", { width: 0.58 * s, height: 0.24 * s, depth: 0.03 * s }, new Vector3(0, 0, -0.20 * s), lensMat);
    } else if (prop.kind === "speaker") {
      addBox("prop_speaker_mouth", { width: 0.46 * s, height: 0.28 * s, depth: 0.04 * s }, new Vector3(0, 0, -0.22 * s), darkMat);
      addCylinder("prop_speaker_mount", 0.08 * s, 0.52 * s, new Vector3(0, -0.34 * s, 0), rustMat, 0);
    } else if (prop.kind === "sign") {
      addBox("prop_sign_frame_top", { width: 2.45 * s, height: 0.045 * s, depth: 0.05 * s }, new Vector3(0, 0.60 * s, -0.02 * s), darkMat);
      addBox("prop_sign_frame_bottom", { width: 2.45 * s, height: 0.045 * s, depth: 0.05 * s }, new Vector3(0, -0.60 * s, -0.02 * s), darkMat);
    } else if (prop.kind === "cot") {
      addBox("prop_cot_pillow", { width: 0.46 * s, height: 0.12 * s, depth: 0.58 * s }, new Vector3(-0.66 * s, 0.22 * s, 0), darkMat);
      for (const x of [-0.86 * s, 0.86 * s]) {
        for (const z of [-0.28 * s, 0.28 * s]) addBox("prop_cot_leg", { width: 0.055 * s, height: 0.58 * s, depth: 0.055 * s }, new Vector3(x, -0.40 * s, z), rustMat);
      }
    } else if (prop.kind === "curtain") {
      addBox("prop_curtain_rail", { width: 2.25 * s, height: 0.055 * s, depth: 0.08 * s }, new Vector3(0, 0.98 * s, -0.02 * s), rustMat);
      for (const x of [-0.72, -0.24, 0.24, 0.72]) addBox("prop_curtain_fold", { width: 0.05 * s, height: 1.78 * s, depth: 0.04 * s }, new Vector3(x * s, -0.04 * s, -0.03 * s), darkMat);
    } else if (prop.kind === "bodybag") {
      addBox("prop_bodybag_zip", { width: 1.50 * s, height: 0.035 * s, depth: 0.08 * s }, new Vector3(0, 0.02 * s, 0.25 * s), darkMat);
      addBox("prop_bodybag_tag", { width: 0.24 * s, height: 0.02 * s, depth: 0.18 * s }, new Vector3(-0.62 * s, 0.08 * s, 0.33 * s), rustMat);
    } else if (prop.kind === "cable") {
      addBox("prop_cable_kink_a", { width: 0.55 * s, height: 0.07 * s, depth: 0.07 * s }, new Vector3(-0.60 * s, 0.05 * s, 0.10 * s), darkMat);
      addBox("prop_cable_kink_b", { width: 0.45 * s, height: 0.07 * s, depth: 0.07 * s }, new Vector3(0.54 * s, 0.04 * s, -0.08 * s), rustMat);
    } else if (prop.kind === "candle") {
      const flameMat = makeMat(this.scene, `${zone.id}_candle_flame_${prop.x}_${prop.z}`, new Color3(1.0, 0.52, 0.16), new Color3(0.7, 0.24, 0.04));
      const flame = MeshBuilder.CreateSphere("prop_candle_flame", { diameter: 0.16 * s, segments: 8 }, this.scene);
      flame.parent = parent;
      flame.position.set(0, 0.34 * s, 0);
      flame.material = flameMat;
      flame.isPickable = false;
    }
  }

  private createFloorDecals(root: TransformNode, zone: ZoneDef): void {
    const mat = makeGeneratedMaterial(this.scene, `${zone.id}_decal_atlas`, "wod2-grime-decal-atlas.png", 0.34);
    const count = Math.min(10, Math.max(4, Math.floor((zone.width * zone.depth) / 95)));
    for (let i = 0; i < count; i++) {
      const scale = 1.2 + Math.random() * 2.6;
      const decal = MeshBuilder.CreatePlane(`decal_${zone.id}_${i}`, { width: scale, height: scale * (0.7 + Math.random() * 0.8) }, this.scene);
      decal.parent = root;
      decal.position.set((Math.random() - 0.5) * zone.width * 0.78, 0.018, (Math.random() - 0.5) * zone.depth * 0.78);
      decal.rotation.x = Math.PI / 2;
      decal.rotation.z = Math.random() * Math.PI;
      decal.material = mat;
      decal.isPickable = false;
    }
  }

  private colliderForProp(prop: PropDef): RectCollider | null {
    if (
      prop.kind === "poster" ||
      prop.kind === "sign" ||
      prop.kind === "debris" ||
      prop.kind === "floodlight" ||
      prop.kind === "speaker" ||
      prop.kind === "curtain" ||
      prop.kind === "bodybag" ||
      prop.kind === "cable" ||
      prop.kind === "candle"
    ) return null;
    const s = prop.scale ?? 1;
    const width =
      prop.kind === "car" ? 3.3 * s
        : prop.kind === "shelf" ? 4.2 * s
          : prop.kind === "pew" ? 2.1 * s
            : prop.kind === "pillar" ? 1.0 * s
              : prop.kind === "barrier" ? 2.25 * s
                : prop.kind === "cot" ? 2.05 * s
                  : prop.kind === "gate" ? 4.8 * s
                    : 1.8 * s;
    const depth =
      prop.kind === "car" ? 1.8 * s
        : prop.kind === "shelf" ? 0.45 * s
          : prop.kind === "pew" ? 0.65 * s
            : prop.kind === "pillar" ? 1.0 * s
              : prop.kind === "barrier" ? 0.18 * s
                : prop.kind === "cot" ? 0.72 * s
                  : prop.kind === "gate" ? 0.35 * s
                    : 1.2 * s;
    return { x: prop.x, z: prop.z, w: width, d: depth, label: `prop_${prop.kind}` };
  }

  private createInteractable(root: TransformNode, def: InteractableDef, zone: ZoneDef): RuntimeInteractable {
    const mat = this.materialForInteractable(def, zone);
    let mesh: Mesh;
    if (def.kind === "hanging") {
      mesh = MeshBuilder.CreateCapsule(`it_${def.id}`, { radius: 0.22, height: 1.5 }, this.scene);
      mesh.position.set(def.x, 1.55, def.z);
      mesh.rotation.z = 0.2;
    } else if (def.kind === "mannequin") {
      mesh = MeshBuilder.CreateCapsule(`it_${def.id}`, { radius: 0.28, height: 1.55 }, this.scene);
      mesh.position.set(def.x, 0.78, def.z);
    } else if (def.kind === "door" || def.kind === "seal") {
      const h = def.h ?? 2.3;
      mesh = MeshBuilder.CreateBox(`it_${def.id}`, { width: def.w ?? 1.8, depth: def.d ?? 0.16, height: h }, this.scene);
      mesh.position.set(def.x, h / 2, def.z);
      if (def.kind === "seal") {
        const crossbar = MeshBuilder.CreateBox(`it_${def.id}_bar`, { width: (def.w ?? 1.8) * 0.88, depth: 0.08, height: 0.12 }, this.scene);
        crossbar.parent = mesh;
        crossbar.position.y = 0.18;
        crossbar.material = mat;
        crossbar.isPickable = false;
        mesh.scaling.x = 0.16;
        mesh.position.x = def.x - (def.w ?? 1.8) * 0.42;
      }
    } else if (def.kind === "gascan") {
      mesh = MeshBuilder.CreateBox(`it_${def.id}`, { width: 0.45, depth: 0.36, height: 0.7 }, this.scene);
      mesh.position.set(def.x, 0.35, def.z);
    } else {
      mesh = MeshBuilder.CreateBox(`it_${def.id}`, { width: 0.62, depth: 0.62, height: 0.42 }, this.scene);
      mesh.position.set(def.x, 0.24, def.z);
    }
    mesh.rotation.y = def.rot ?? 0;
    mesh.parent = root;
    mesh.material = mat;
    mesh.metadata = { interactableId: def.id };
    this.shadow.addShadowCaster(mesh);

    let light: PointLight | undefined;
    if (def.kind === "radio" || def.kind === "fuse" || def.kind === "door" || def.kind === "seal") {
      light = new PointLight(`light_${def.id}`, new Vector3(def.x, 1.1, def.z), this.scene);
      light.diffuse = def.kind === "door" || def.kind === "seal" ? zone.accent : new Color3(0.9, 0.55, 0.2);
      light.range = def.kind === "door" || def.kind === "seal" ? 3.2 : 2.2;
      light.intensity = def.kind === "door" || def.kind === "seal" ? 0.16 : 0.24;
    }
    return { def, mesh, used: false, light };
  }

  private materialForInteractable(def: InteractableDef, zone: ZoneDef): StandardMaterial {
    const key = `it_${def.kind}_${zone.id}`;
    let mat = this.mats.get(key);
    if (mat) return mat;
    if (def.kind === "note") {
      mat = makeGeneratedMaterial(this.scene, key, "wod2-photo-atlas.png", 1);
      this.mats.set(key, mat);
      return mat;
    }
    const color =
      def.kind === "supply" ? new Color3(0.18, 0.22, 0.17)
        : def.kind === "fuse" ? new Color3(0.25, 0.18, 0.10)
          : def.kind === "gascan" ? new Color3(0.46, 0.18, 0.08)
            : def.kind === "hanging" ? new Color3(0.08, 0.065, 0.055)
              : def.kind === "mannequin" ? new Color3(0.18, 0.19, 0.15)
                : def.kind === "radio" ? new Color3(0.09, 0.10, 0.11)
                  : def.kind === "seal" ? new Color3(0.18, 0.055, 0.045)
                  : new Color3(0.11, 0.075, 0.045);
    mat = makeMat(this.scene, key, color, new Color3(color.r * 0.08, color.g * 0.04, color.b * 0.02));
    this.mats.set(key, mat);
    return mat;
  }
}
