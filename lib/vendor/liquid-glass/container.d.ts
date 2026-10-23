/** Types for the vendored Liquid Glass JS Container (see container.js for provenance). */
export interface GlassControls {
  blurRadius: number;
  edgeIntensity: number;
  rimIntensity: number;
  baseIntensity: number;
  edgeDistance: number;
  rimDistance: number;
  baseDistance: number;
  cornerBoost: number;
  rippleEffect: number;
}

export interface ContainerOptions {
  element?: HTMLElement;
  borderRadius?: number;
  type?: "rounded" | "circle" | "pill";
  tintOpacity?: number;
  warp?: boolean;
  onReady?: () => void;
}

export declare class Container {
  static instances: Container[];
  static controls: GlassControls;
  static snapshot: { canvas: HTMLCanvasElement; cssWidth: number; cssHeight: number } | null;
  static setSnapshot(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): void;
  constructor(options?: ContainerOptions);
  element: HTMLElement;
  webglInitialized: boolean;
  updateSizeFromDOM(): void;
  render?: () => void;
  destroy(): void;
}
