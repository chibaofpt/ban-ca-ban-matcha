"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/src/lib/api/client";
import { Card, CardContent } from "@/src/components/ui/card";
import { Bug, Clock, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/src/utils/cn";

interface SystemLog {
  id: string;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  stack: string | null;
  context: any | null;
  created_at: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    try {
      setLoading(true);
      const res = await apiClient.get("/api/admin/logs?limit=50");
      setLogs(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-serif text-primary">System Logs</h1>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-50">
          <Loader2 className="animate-spin w-8 h-8 mb-4" />
          <p>Đang tải logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
          <Bug className="mx-auto h-10 w-10 mb-2 opacity-50" />
          <p>Không có log nào trong hệ thống.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {logs.map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <Card key={log.id} className={cn("overflow-hidden border-l-4", {
                "border-l-red-500": log.level === "error",
                "border-l-amber-500": log.level === "warn",
                "border-l-blue-500": log.level === "info",
              })}>
                <div 
                  className="flex items-start justify-between p-4 cursor-pointer hover:bg-muted/30 transition"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-bold uppercase px-2 py-0.5 rounded-full", {
                        "bg-red-100 text-red-700": log.level === "error",
                        "bg-amber-100 text-amber-700": log.level === "warn",
                        "bg-blue-100 text-blue-700": log.level === "info",
                      })}>
                        {log.level}
                      </span>
                      <span className="font-mono text-sm font-medium text-muted-foreground">{log.source}</span>
                    </div>
                    <p className="font-semibold text-sm truncate pr-4">{log.message}</p>
                    <div className="flex items-center text-xs text-muted-foreground gap-1">
                      <Clock size={12} />
                      {new Intl.DateTimeFormat("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      }).format(new Date(log.created_at))}
                    </div>
                  </div>
                  <div className="shrink-0 p-2 text-muted-foreground">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="p-4 bg-muted/30 border-t text-sm space-y-4">
                    {log.context && (
                      <div>
                        <h4 className="font-semibold mb-2 text-xs uppercase text-muted-foreground">Context</h4>
                        <pre className="bg-background p-3 rounded-md overflow-x-auto text-[11px] font-mono border">
                          {JSON.stringify(log.context, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.stack && (
                      <div>
                        <h4 className="font-semibold mb-2 text-xs uppercase text-muted-foreground">Stack Trace</h4>
                        <pre className="bg-background p-3 rounded-md overflow-x-auto text-[11px] font-mono border text-red-500/80">
                          {log.stack}
                        </pre>
                      </div>
                    )}
                    {!log.context && !log.stack && (
                      <p className="text-muted-foreground italic text-xs">Không có thông tin chi tiết.</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
