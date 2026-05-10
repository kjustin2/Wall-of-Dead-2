import "./engine/babylonSideEffects";
import "./../style.css";
import { WallOfDeadGame } from "./game/WallOfDeadGame";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
if (!canvas) throw new Error("renderCanvas not found");

const game = new WallOfDeadGame(canvas);

window.addEventListener("beforeunload", () => game.dispose());

(window as unknown as { _wod2?: unknown })._wod2 = {
  game
};
