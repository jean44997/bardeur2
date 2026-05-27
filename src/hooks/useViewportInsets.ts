import { useEffect } from "react";

const KEYBOARD_THRESHOLD = 90;

function isTextInput(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export function useViewportInsets() {
  useEffect(() => {
    const root = document.documentElement;
    let focusedKeyboardTarget = false;
    let raf = 0;

    const sync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        const width = vv?.width || window.innerWidth;
        const height = vv?.height || window.innerHeight;
        const top = Math.max(0, vv?.offsetTop || 0);
        const bottomOverlap = vv
          ? Math.max(0, window.innerHeight - height - top)
          : 0;
        const keyboardOpen = focusedKeyboardTarget || bottomOverlap > KEYBOARD_THRESHOLD;

        root.style.setProperty("--app-height", `${Math.round(height)}px`);
        root.style.setProperty("--app-vv-top", `${Math.round(top)}px`);
        root.style.setProperty("--app-vv-bottom", `${Math.round(bottomOverlap)}px`);
        root.style.setProperty("--app-vw", `${Math.round(width)}px`);
        document.body.classList.toggle("keyboard-open", keyboardOpen);
      });
    };

    const onFocusIn = (event: FocusEvent) => {
      focusedKeyboardTarget = isTextInput(event.target);
      sync();
    };
    const onFocusOut = () => {
      focusedKeyboardTarget = false;
      window.setTimeout(sync, 80);
    };

    sync();
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.body.classList.remove("keyboard-open");
    };
  }, []);
}
