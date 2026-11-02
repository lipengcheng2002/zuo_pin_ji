"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils/format";

type ToastTone = "default" | "success" | "error";
type Toast = { id: number; message: string; detail?: string; tone: ToastTone };

type ToastContextValue = {
  push: (message: string, options?: { tone?: ToastTone; detail?: string }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback(
    (message: string, options?: { tone?: ToastTone; detail?: string }) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [
        ...current.slice(-2),
        { id, message, detail: options?.detail, tone: options?.tone ?? "default" },
      ]);
      setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 3800);
    },
    [],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-28 left-4 z-[120] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:left-6"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 border px-4 py-3.5 text-[12px] shadow-[0_18px_50px_-24px_rgba(23,22,15,0.5)] animate-fade-up",
              toast.tone === "error"
                ? "border-danger/30 bg-[#fbf1ee] text-danger"
                : toast.tone === "success"
                  ? "border-moss/25 bg-[#eef1eb] text-moss"
                  : "border-line bg-paper text-ink",
            )}
          >
            <Icon
              name={toast.tone === "error" ? "alert" : toast.tone === "success" ? "check" : "info"}
              size={15}
              className="mt-0.5"
            />
            <div>
              <p className="font-medium tracking-wide">{toast.message}</p>
              {toast.detail ? <p className="mt-0.5 text-[11px] text-muted">{toast.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
