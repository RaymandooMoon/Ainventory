import WeatherCanvasOverlay, {
  type WeatherCanvasOverlayMode,
  type WeatherCanvasOverlayProps,
} from './WeatherCanvasOverlay.tsx';

export type WeatherForegroundCanvasProps = WeatherCanvasOverlayProps;
export type { WeatherCanvasOverlayMode, WeatherCanvasOverlayProps };

/**
 * Backwards-compatible re-export of `WeatherCanvasOverlay`.
 */
export const WeatherForegroundCanvas = WeatherCanvasOverlay;
export { WeatherCanvasOverlay };
export default WeatherCanvasOverlay;
