import { isObject } from "../../domain/records";

export function isCanvasSurface(value: unknown): value is CanvasRenderingContext2D {
  return (
    isObject(value) &&
    "save" in value &&
    typeof value.save === "function" &&
    "restore" in value &&
    typeof value.restore === "function" &&
    "beginPath" in value &&
    typeof value.beginPath === "function"
  );
}
