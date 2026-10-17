'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { Toast as ToastComponent, ToastType } from '@/components/Toast';

// Internal toast item stored in state
interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  href?: string;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (message: string, type: ToastType, href?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastType, href?: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type, href }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(toast => (
          <ToastComponent
            key={toast.id}
            toast={toast}
            onDismiss={removeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

/**
 * Alias for useToast — exported as useToastProvider for backwards compatibility
 * with pages that import it under this name (e.g. app/create/page.tsx).
 */
export const useToastProvider = useToast;
