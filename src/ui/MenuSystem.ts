import { Scene } from "@babylonjs/core/scene";
import {
  AdvancedDynamicTexture,
  Button,
  Control,
  Image,
  Rectangle,
  StackPanel,
  TextBlock
} from "@babylonjs/gui";

export type StartMenuChoice = "begin" | "quit";
export type PauseMenuChoice = "resume" | "mainMenu" | "quit";
export type DeathMenuChoice = "restart" | "mainMenu" | "quit";

type MenuPanel = "start" | "pause" | "death" | "controls";

export class MenuSystem {
  private readonly ui: AdvancedDynamicTexture;
  private readonly root: Rectangle;
  private readonly startPanel: Rectangle;
  private readonly pausePanel: Rectangle;
  private readonly deathPanel: Rectangle;
  private readonly controlsPanel: Rectangle;
  private currentPanel: MenuPanel | null = null;
  private controlsReturn: Exclude<MenuPanel, "controls"> = "start";
  private startResolve: ((choice: StartMenuChoice) => void) | null = null;
  private pauseResolve: ((choice: PauseMenuChoice) => void) | null = null;
  private deathResolve: ((choice: DeathMenuChoice) => void) | null = null;

  constructor(scene: Scene) {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI("wallOfDeadMenus", true, scene);
    this.ui.idealWidth = 1280;
    this.ui.idealHeight = 720;

    this.root = new Rectangle("menuRoot");
    this.root.width = "100%";
    this.root.height = "100%";
    this.root.thickness = 0;
    this.root.background = "rgba(2, 2, 4, 0.88)";
    this.root.isPointerBlocker = true;
    this.root.isVisible = false;
    this.ui.addControl(this.root);

    const keyArt = new Image("menuKeyArt", "./assets/generated/wod2-menu-key-art.png");
    keyArt.stretch = Image.STRETCH_FILL;
    keyArt.alpha = 0.34;
    keyArt.isHitTestVisible = false;
    this.root.addControl(keyArt);

    this.startPanel = this.createPanel("startPanel", "720px", "560px");
    this.pausePanel = this.createPanel("pausePanel", "560px", "430px");
    this.deathPanel = this.createPanel("deathPanel", "620px", "470px");
    this.controlsPanel = this.createPanel("controlsPanel", "740px", "550px");

    this.buildStartPanel();
    this.buildPausePanel();
    this.buildDeathPanel();
    this.buildControlsPanel();
    this.hide();
  }

  get isOpen(): boolean {
    return this.root.isVisible;
  }

  showStartMenu(): Promise<StartMenuChoice> {
    this.showPanel("start");
    return new Promise((resolve) => {
      this.startResolve = resolve;
    });
  }

  showPauseMenu(): Promise<PauseMenuChoice> {
    this.showPanel("pause");
    return new Promise((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  showDeathMenu(): Promise<DeathMenuChoice> {
    this.showPanel("death");
    return new Promise((resolve) => {
      this.deathResolve = resolve;
    });
  }

  handleEscape(): boolean {
    if (this.currentPanel === "controls") {
      this.showPanel(this.controlsReturn);
      return true;
    }
    if (this.currentPanel === "pause") {
      this.resolvePause("resume");
      return true;
    }
    return false;
  }

  hide(): void {
    this.root.isVisible = false;
    this.currentPanel = null;
    this.startPanel.isVisible = false;
    this.pausePanel.isVisible = false;
    this.deathPanel.isVisible = false;
    this.controlsPanel.isVisible = false;
  }

  dispose(): void {
    this.ui.dispose();
  }

  private buildStartPanel(): void {
    const stack = this.createStack(this.startPanel);
    stack.addControl(this.title("WALL OF DEAD", 48, "#eee5d2", 66));
    stack.addControl(this.title("2", 84, "#eee5d2", 92));
    stack.addControl(this.button("START NEW GAME", 260, () => this.resolveStart("begin")));
    stack.addControl(this.button("CONTROLS", 260, () => {
      this.controlsReturn = "start";
      this.showPanel("controls");
    }));
    stack.addControl(this.button("QUIT", 260, () => this.resolveStart("quit"), true));
  }

  private buildPausePanel(): void {
    const stack = this.createStack(this.pausePanel);
    stack.addControl(this.label("THE BUILDING IS STILL LISTENING", 14, "#caa66d", 32));
    stack.addControl(this.title("PAUSED", 54, "#eee5d2", 78));
    stack.addControl(this.copy("The door behind you is not as closed as it sounds.", 21, "#d3c8ad", 72));
    stack.addControl(this.button("RESUME", 240, () => this.resolvePause("resume")));
    stack.addControl(this.button("CONTROLS", 240, () => {
      this.controlsReturn = "pause";
      this.showPanel("controls");
    }));
    stack.addControl(this.button("MAIN MENU", 240, () => this.resolvePause("mainMenu"), true));
    stack.addControl(this.button("QUIT", 240, () => this.resolvePause("quit"), true));
  }

  private buildDeathPanel(): void {
    const stack = this.createStack(this.deathPanel);
    stack.addControl(this.label("YOU DID NOT REACH THE GATE", 14, "#b8925e", 32));
    stack.addControl(this.title("NOT QUIET ENOUGH", 52, "#efe2cc", 82));
    stack.addControl(this.copy("The last sound you made is still moving through the walls.", 22, "#d4c7aa", 82));
    stack.addControl(this.button("TRY AGAIN", 260, () => this.resolveDeath("restart")));
    stack.addControl(this.button("MAIN MENU", 260, () => this.resolveDeath("mainMenu"), true));
    stack.addControl(this.button("QUIT", 260, () => this.resolveDeath("quit"), true));
  }

  private buildControlsPanel(): void {
    const stack = this.createStack(this.controlsPanel);
    stack.addControl(this.label("CONTROLS", 15, "#caa66d", 28));
    stack.addControl(this.title("KEEP QUIET", 52, "#eee5d2", 76));
    stack.addControl(this.copy("Click the game to lock the mouse. Move the mouse to look. Esc releases it and opens the pause menu.", 20, "#d4c9b0", 78));
    stack.addControl(this.copy("WASD moves. Shift sprints. Left click uses the weapon in your hands. R reloads. Number keys switch only what you have.", 19, "#d4c9b0", 88));
    stack.addControl(this.copy("E searches, opens, and seals. A closed door is time, not safety.", 20, "#d4c9b0", 70));
    stack.addControl(this.button("BACK", 240, () => this.showPanel(this.controlsReturn)));
  }

  private createPanel(name: string, width: string, height: string): Rectangle {
    const panel = new Rectangle(name);
    panel.width = width;
    panel.height = height;
    panel.thickness = 1;
    panel.color = "rgba(217, 190, 132, 0.46)";
    panel.background = "rgba(4, 4, 6, 0.72)";
    panel.cornerRadius = 3;
    panel.shadowColor = "rgba(0, 0, 0, 0.9)";
    panel.shadowBlur = 18;
    panel.shadowOffsetY = 8;
    panel.isPointerBlocker = true;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.root.addControl(panel);
    return panel;
  }

  private createStack(panel: Rectangle): StackPanel {
    const stack = new StackPanel(`${panel.name}_stack`);
    stack.width = "84%";
    stack.height = "92%";
    stack.isVertical = true;
    stack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    panel.addControl(stack);
    return stack;
  }

  private label(text: string, fontSize: number, color: string, height: number): TextBlock {
    const block = new TextBlock(`${text}_label`, text);
    block.height = `${height}px`;
    block.width = "100%";
    block.color = color;
    block.fontSize = fontSize;
    block.fontWeight = "700";
    block.textWrapping = true;
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    return block;
  }

  private title(text: string, fontSize: number, color: string, height: number): TextBlock {
    const block = new TextBlock(`${text}_title`, text);
    block.height = `${height}px`;
    block.width = "100%";
    block.color = color;
    block.fontSize = fontSize;
    block.fontWeight = "800";
    block.textWrapping = true;
    block.lineSpacing = "0px";
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    return block;
  }

  private copy(text: string, fontSize: number, color: string, height: number): TextBlock {
    const block = new TextBlock(`${text.slice(0, 16)}_copy`, text);
    block.height = `${height}px`;
    block.width = "100%";
    block.color = color;
    block.fontSize = fontSize;
    block.textWrapping = true;
    block.lineSpacing = "4px";
    block.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    block.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    return block;
  }

  private button(text: string, width: number, onClick: () => void, muted = false): Button {
    const button = Button.CreateSimpleButton(`${text}_button`, text);
    button.width = `${width}px`;
    button.height = "48px";
    button.paddingTop = "10px";
    button.thickness = 1;
    button.cornerRadius = 2;
    button.color = muted ? "#d1c3a9" : "#f4e4bf";
    button.background = muted ? "rgba(25, 22, 22, 0.92)" : "rgba(70, 22, 23, 0.94)";
    button.fontSize = 17;
    button.fontWeight = "800";
    button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    button.isPointerBlocker = true;
    button.onPointerEnterObservable.add(() => {
      button.background = muted ? "rgba(42, 36, 34, 0.95)" : "rgba(102, 28, 30, 0.98)";
    });
    button.onPointerOutObservable.add(() => {
      button.background = muted ? "rgba(25, 22, 22, 0.92)" : "rgba(70, 22, 23, 0.94)";
    });
    button.onPointerClickObservable.add(onClick);
    return button;
  }

  private showPanel(panel: MenuPanel): void {
    this.root.isVisible = true;
    this.currentPanel = panel;
    this.startPanel.isVisible = panel === "start";
    this.pausePanel.isVisible = panel === "pause";
    this.deathPanel.isVisible = panel === "death";
    this.controlsPanel.isVisible = panel === "controls";
  }

  private resolveStart(choice: StartMenuChoice): void {
    const resolve = this.startResolve;
    this.startResolve = null;
    this.hide();
    resolve?.(choice);
  }

  private resolvePause(choice: PauseMenuChoice): void {
    const resolve = this.pauseResolve;
    this.pauseResolve = null;
    this.hide();
    resolve?.(choice);
  }

  private resolveDeath(choice: DeathMenuChoice): void {
    const resolve = this.deathResolve;
    this.deathResolve = null;
    this.hide();
    resolve?.(choice);
  }
}
