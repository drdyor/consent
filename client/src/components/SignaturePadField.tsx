import SignaturePad from "signature_pad";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type SignaturePadFieldHandle = {
  /** True when no stroke has been drawn (a blank canvas must never be sealable). */
  isEmpty: () => boolean;
  /** PNG data URL of the drawn signature, or undefined when the pad is empty. */
  toPngDataUrl: () => string | undefined;
  /** signature_pad toData() stroke groups as JSON, or undefined when the pad is empty. */
  toStrokeJson: () => string | undefined;
  clear: () => void;
};

type Props = {
  className?: string;
  clearLabel: string;
  /** Called after every stroke end and after clear, with the current empty state. */
  onEmptyChange?: (isEmpty: boolean) => void;
};

/**
 * Drawn-signature capture backed by signature_pad (MIT). Replaces the previous
 * hand-rolled 2d-context pointer code so that emptiness is decided by
 * SignaturePad.isEmpty() — a blank canvas is NEVER treated as a signature
 * (canvas.toDataURL() is truthy even for a blank canvas, which used to allow
 * sealing an empty signature).
 */
export const SignaturePadField = forwardRef<SignaturePadFieldHandle, Props>(function SignaturePadField({ className, clearLabel, onEmptyChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const emptyChangeRef = useRef(onEmptyChange);
  emptyChangeRef.current = onEmptyChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { penColor: "#24453e", minWidth: 1, maxWidth: 2.4 });
    padRef.current = pad;
    const notify = () => emptyChangeRef.current?.(pad.isEmpty());
    pad.addEventListener("endStroke", notify);
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.fromData(data);
      notify();
    };
    resize();
    window.addEventListener("resize", resize);
    notify();
    return () => {
      window.removeEventListener("resize", resize);
      pad.removeEventListener("endStroke", notify);
      pad.off();
      padRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    toPngDataUrl: () => {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) return undefined;
      return pad.toDataURL("image/png");
    },
    toStrokeJson: () => {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) return undefined;
      return JSON.stringify(pad.toData());
    },
    clear: () => {
      padRef.current?.clear();
      emptyChangeRef.current?.(true);
    },
  }), []);

  return <>
    <canvas ref={canvasRef} data-testid="signature-pad-canvas" className={className || "mt-4 h-36 w-full touch-none rounded-xl border border-dashed border-[#b8b1a5] bg-white"} />
    <button type="button" onClick={() => { padRef.current?.clear(); emptyChangeRef.current?.(true); }} className="mt-2 text-xs font-semibold text-[#2f6656]">{clearLabel}</button>
  </>;
});
