"use client";

import { useEffect } from "react";
import { captureClientException } from "@/src/lib/observability";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Render a recoverable fallback and report otherwise unhandled application errors. */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    captureClientException(error);
  }, [error]);

  return (
    <html lang="vi">
      <body className="flex min-h-screen items-center justify-center bg-white p-6 text-slate-900">
        <main className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold">Đã có lỗi xảy ra</h1>
          <p className="mt-3 text-sm text-slate-600">
            Hệ thống đã ghi nhận lỗi. Bạn có thể thử tải lại thao tác vừa rồi.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 min-h-11 rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white"
          >
            Thử lại
          </button>
        </main>
      </body>
    </html>
  );
}
