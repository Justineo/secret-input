import { server } from "vite-plus/test/browser/context";

// Safari 26.4 can deliver Element Click mouse events out of order and omit click.
// Explicit options select WebDriver pointer actions, preserving trusted activation.
export const clickOptions = server.browser === "safari" ? { button: "left" as const } : undefined;
