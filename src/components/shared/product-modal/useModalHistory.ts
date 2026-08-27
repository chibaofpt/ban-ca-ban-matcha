"use client";

import { useCallback, useEffect, useRef } from "react";

const modalStack: string[] = [];
let nextModalId = 0;

/** Adds one history entry and closes only the topmost modal on browser Back. */
export function useModalHistory(onClose: () => void) {
  const idRef = useRef(`product-modal-${++nextModalId}`);
  const onCloseRef = useRef(onClose);
  const closedRef = useRef(false);
  onCloseRef.current = onClose;

  const removeFromStack = useCallback(() => {
    const index = modalStack.lastIndexOf(idRef.current);
    if (index >= 0) modalStack.splice(index, 1);
  }, []);

  const finishClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    removeFromStack();
    onCloseRef.current();
  }, [removeFromStack]);

  useEffect(() => {
    const id = idRef.current;
    modalStack.push(id);
    if (window.history.state?.productModal !== id) {
      window.history.pushState({ ...window.history.state, productModal: id }, "");
    }
    const onPopState = (event: PopStateEvent) => {
      if (modalStack.at(-1) !== id || event.state?.productModal === id) return;
      finishClose();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      removeFromStack();
    };
  }, [finishClose, removeFromStack]);

  return useCallback(() => {
    if (closedRef.current) return;
    const ownsEntry = modalStack.at(-1) === idRef.current && window.history.state?.productModal === idRef.current;
    if (ownsEntry) window.history.back();
    finishClose();
  }, [finishClose]);
}
