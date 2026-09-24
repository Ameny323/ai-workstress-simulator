import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { apiRequest } from "@/api/client";
import type { TaskCompletionResult } from "@/components/task/TaskCompletionScreen";

// Real document_organization workspace -- drag-and-drop classification,
// moved verbatim out of CockpitPage.tsx into its own self-contained
// component (own timer/submit/completion, same {task, onCompleted}
// pattern as DataValidationTask/EmailWritingTask/UrgentRequestTask) as
// part of unifying the cockpit onto one task-loading flow. The
// interaction itself is unchanged: real records/categories from
// instance_data, real classification against instance_data's own
// correct_category, real submission via POST /tasks/{id}/complete.
interface DocItem {
  id: number;
  filename: string;
  ext: string;
  correct: string;
  classified?: string;
  status?: "correct" | "incorrect";
}

export interface DocumentOrganizationTaskData {
  id: string;
  title: string;
  description: string | null;
  instance_data: {
    categories: string[];
    records: { id: number; filename: string; correct_category: string }[];
  };
  deadline_seconds: number | null;
}

interface DocumentOrganizationTaskProps {
  task: DocumentOrganizationTaskData;
  onCompleted: (result: TaskCompletionResult) => void;
}

const DEFAULT_TOTAL_TIME = 240;

// Derived from the real `filename` extension -- not fabricated per-document
// metadata.
const EXTENSION_TYPE_LABEL: Record<string, string> = {
  pdf: "PDF document",
  docx: "Word document",
  xlsx: "Spreadsheet",
  csv: "Spreadsheet",
  psd: "Image file",
  svg: "Vector image",
  zip: "Archive",
};

function FileIcon({ ext }: { ext: string }) {
  const isXlsx = ext === "xlsx" || ext === "csv";
  return (
    <div
      className="flex items-center justify-center rounded text-[10px] font-semibold tracking-wide w-9 h-10 shrink-0"
      style={{
        background: isXlsx ? "rgba(113,152,135,0.12)" : "rgba(88,122,146,0.10)",
        color: isXlsx ? "#719887" : "#587A92",
        border: `1px solid ${isXlsx ? "rgba(113,152,135,0.22)" : "rgba(88,122,146,0.18)"}`,
      }}
    >
      {ext.toUpperCase()}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className="flex items-center justify-center rounded-full text-[10px] font-bold select-none shrink-0"
      style={{ width: 16, height: 16, background: "rgba(88,122,146,0.12)", color: "#587A92" }}
    >
      {category.charAt(0).toUpperCase()}
    </span>
  );
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function DocumentOrganizationTask({ task, onCompleted }: DocumentOrganizationTaskProps) {
  const { categories, records } = task.instance_data;
  const [docs, setDocs] = useState<DocItem[]>(() =>
    records.map((r) => ({
      id: r.id,
      filename: r.filename,
      ext: r.filename.split(".").pop()?.toLowerCase() ?? "",
      correct: r.correct_category,
    }))
  );
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
  const [dragOverDept, setDragOverDept] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totalTime = task.deadline_seconds && task.deadline_seconds > 0 ? task.deadline_seconds : DEFAULT_TOTAL_TIME;
  const [remaining, setRemaining] = useState(totalTime);
  const autoSubmitted = useRef(false);
  const docsRef = useRef(docs);
  docsRef.current = docs;

  const totalDocs = docs.length;
  const classified = docs.filter((d) => d.classified).length;

  const timerUrgent = remaining < Math.round(totalTime * 0.25);
  const timerWarning = !timerUrgent && remaining < Math.round(totalTime * 0.5);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const assignments: Record<number, string> = {};
    docsRef.current.forEach((d) => {
      if (d.classified) assignments[d.id] = d.classified;
    });
    try {
      const result = await apiRequest<{
        content_score: number | null;
        time_taken_seconds: number | null;
        error_count: number;
      }>(`/tasks/${task.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ assignments }),
      });
      onCompleted({
        contentScore: result.content_score,
        timeTakenSeconds: result.time_taken_seconds,
        errorCount: result.error_count,
        timedOut: autoSubmitted.current,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (remaining <= 0) {
      if (!autoSubmitted.current && !submitting) {
        autoSubmitted.current = true;
        void handleSubmit();
      }
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, submitting]);

  // The one authoritative, server-side engagement signal (POST
  // /tasks/{id}/engage) -- fired exactly once, on the first genuine
  // classification (drag/drop or button click), never on mount/render.
  const engagedRef = useRef(false);
  const engage = useCallback(() => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    void apiRequest(`/tasks/${task.id}/engage`, { method: "POST" }).catch(() => {});
  }, [task.id]);

  const removeClassification = useCallback((docId: number) => {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, classified: undefined } : d)));
  }, []);

  const classifyDoc = useCallback((docId: number, category: string) => {
    engage();
    const doc = docsRef.current.find((d) => d.id === docId);
    if (!doc) return;
    const isCorrect = doc.correct === category;
    setDocs((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, classified: category, status: isCorrect ? "correct" : "incorrect" } : d))
    );
  }, []);

  const onDragStart = (e: DragEvent<HTMLDivElement>, id: number) => {
    e.dataTransfer.setData("docId", String(id));
    setDraggingId(id);
  };
  const onDragEnd = () => { setDraggingId(null); setDragOverDept(null); };
  const onDragOver = (e: DragEvent<HTMLDivElement>, category: string) => { e.preventDefault(); setDragOverDept(category); };
  const onDrop = (e: DragEvent<HTMLDivElement>, category: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("docId");
    if (id) classifyDoc(Number(id), category);
    setDragOverDept(null); setDraggingId(null);
  };

  return (
    <>
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px]" style={{ color: "#718493" }}>Shared Drive · Operations / Inbox</span>
          <span style={{ color: "#D9E2E8" }}>·</span>
          <span className="text-[10px]" style={{ color: "#718493" }}>{totalDocs - classified} unread</span>
        </div>
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: timerUrgent ? "#B97878" : timerWarning ? "#B89A61" : "#243746" }}
        >
          {fmtTime(remaining)}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1">
        {/* INBOX */}
        <div className="flex flex-col rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #D9E2E8", flex: "1 1 0", minWidth: 0 }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #D9E2E8" }}>
            <div className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "#718493" }}>Shared Drive · Inbox</div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: "rgba(88,122,146,0.09)", color: "#587A92" }}>
              {docs.filter((d) => !d.classified).length} docs
            </span>
          </div>
          <div className="flex flex-col divide-y overflow-y-auto" style={{ borderColor: "#F3F6F8" }}>
            {docs.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;
              const isDragging = draggingId === doc.id;
              const done = !!doc.classified;
              return (
                <div
                  key={doc.id}
                  draggable={!done}
                  onDragStart={(e) => !done && onDragStart(e, doc.id)}
                  onDragEnd={onDragEnd}
                  onClick={() => setSelectedDoc(isSelected ? null : doc)}
                  className={`doc-card flex items-start gap-3 px-5 py-3.5 cursor-pointer select-none ${isDragging ? "dragging" : ""}`}
                  style={{
                    background: isSelected ? "rgba(88,122,146,0.05)" : done ? "rgba(243,246,248,0.7)" : "#fff",
                    borderLeft: isSelected ? "2px solid #587A92" : "2px solid transparent",
                    opacity: done && !isSelected ? 0.52 : 1,
                    borderBottom: "1px solid #F3F6F8",
                  }}
                >
                  <FileIcon ext={doc.ext} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium truncate block" style={{ color: "#243746" }}>{doc.filename}</span>
                    <div className="text-[10px] mt-0.5" style={{ color: "#718493" }}>{EXTENSION_TYPE_LABEL[doc.ext] ?? "File"}</div>
                    {done && (
                      <div className="mt-1">
                        {doc.status === "correct"
                          ? <span className="text-[10px] font-medium" style={{ color: "#719887" }}>✓ Classified → {doc.classified}</span>
                          : <span className="text-[10px] font-medium" style={{ color: "#B89A61" }}>⚠ Classification may be incorrect</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Preview + Folders */}
        <div className="flex flex-col gap-4" style={{ flex: "1 1 0", minWidth: 0 }}>
          {selectedDoc && (
            <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #D9E2E8" }}>
              <div className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: "1px solid #D9E2E8" }}>
                <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "#718493" }}>Document Preview</span>
                <button onClick={() => setSelectedDoc(null)} style={{ color: "#718493", fontSize: "16px", lineHeight: 1, background: "none", border: "none", cursor: "pointer" }}>×</button>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-start gap-3 mb-4">
                  <FileIcon ext={selectedDoc.ext} />
                  <div>
                    <div className="text-sm font-medium" style={{ color: "#243746" }}>{selectedDoc.filename}</div>
                    <div className="text-[10px]" style={{ color: "#718493" }}>{EXTENSION_TYPE_LABEL[selectedDoc.ext] ?? "File"}</div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "#718493" }}>
                      {selectedDoc.classified ? "Reclassify As" : "Classify As"}
                    </span>
                    {selectedDoc.classified && (
                      <button
                        onClick={() => { removeClassification(selectedDoc.id); setSelectedDoc({ ...selectedDoc, classified: undefined }); }}
                        className="text-[10px] font-medium"
                        style={{ color: "#B97878", background: "none", border: "none", cursor: "pointer" }}
                      >
                        Remove classification
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {categories.map((category) => {
                      const isCurrent = selectedDoc.classified === category;
                      return (
                        <button
                          key={category}
                          onClick={() => { classifyDoc(selectedDoc.id, category); setSelectedDoc(null); }}
                          disabled={isCurrent}
                          className="flex-1 py-2 rounded-lg text-[11px] font-medium transition-all"
                          style={{
                            background: isCurrent ? "#587A92" : "#F3F6F8",
                            color: isCurrent ? "#fff" : "#587A92",
                            border: "1px solid #D9E2E8",
                            minWidth: 80,
                            cursor: isCurrent ? "default" : "pointer",
                          }}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #D9E2E8" }}>
            <div className="px-5 py-2.5" style={{ borderBottom: "1px solid #D9E2E8" }}>
              <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "#718493" }}>Destination Workspace</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {categories.map((category) => {
                const deptDocs = docs.filter((d) => d.classified === category);
                const isOver = dragOverDept === category;
                return (
                  <div
                    key={category}
                    className="rounded-xl p-3.5 transition-all duration-150"
                    style={{ border: `1px dashed ${isOver ? "#587A92" : "#D9E2E8"}`, background: isOver ? "rgba(88,122,146,0.05)" : "#F3F6F8" }}
                    onDragOver={(e) => onDragOver(e, category)}
                    onDragLeave={() => setDragOverDept(null)}
                    onDrop={(e) => onDrop(e, category)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <CategoryBadge category={category} />
                        <span className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "#243746" }}>{category}</span>
                      </div>
                      <span className="text-[10px]" style={{ color: "#718493" }}>{deptDocs.length} doc{deptDocs.length !== 1 ? "s" : ""}</span>
                    </div>
                    {deptDocs.length > 0 ? (
                      <div className="flex flex-col gap-1 mt-1.5">
                        {deptDocs.map((d) => (
                          <div key={d.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "#fff", border: "1px solid #D9E2E8" }}>
                            <span className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ background: "rgba(88,122,146,0.08)", color: "#587A92" }}>{d.ext.toUpperCase()}</span>
                            <span className="text-[10px] truncate" style={{ color: "#243746" }}>{d.filename}</span>
                            <span className="ml-auto text-[10px]" style={{ color: d.status === "correct" ? "#719887" : "#B89A61" }}>{d.status === "correct" ? "✓" : "⚠"}</span>
                            <button
                              onClick={() => removeClassification(d.id)}
                              title="Remove classification"
                              aria-label={`Remove ${d.filename} from ${category}`}
                              className="shrink-0 rounded-full"
                              style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12, lineHeight: 1, background: "transparent", border: "none", cursor: "pointer" }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-center py-1.5" style={{ color: "#D9E2E8" }}>Drop documents here</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl flex items-center justify-between px-5 py-3 shrink-0 mt-4" style={{ background: "#fff", border: "1px solid #D9E2E8" }}>
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={{ color: submitError ? "#B97878" : "#718493" }}>
            {submitError ?? `${classified} / ${totalDocs} documents classified`}
          </span>
          <div className="w-28 h-0.5 rounded-full overflow-hidden" style={{ background: "#F3F6F8" }}>
            <div className="h-full rounded-full" style={{ width: `${totalDocs ? (classified / totalDocs) * 100 : 0}%`, background: "#587A92", transition: "width 0.4s ease" }} />
          </div>
        </div>
        <button
          onClick={() => void handleSubmit()}
          disabled={classified !== totalDocs || totalDocs === 0 || submitting}
          className="text-[11px] px-4 py-1.5 rounded-lg font-semibold tracking-wide"
          style={{
            background: classified === totalDocs && totalDocs > 0 ? "#587A92" : "#D9E2E8",
            color: classified === totalDocs && totalDocs > 0 ? "#fff" : "#718493",
            cursor: classified === totalDocs && totalDocs > 0 && !submitting ? "pointer" : "default",
          }}
        >
          {submitting ? "Submitting…" : "SUBMIT TASK →"}
        </button>
      </div>
    </>
  );
}
