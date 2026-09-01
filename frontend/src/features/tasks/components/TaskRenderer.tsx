import ValidationTask, { type ValidationTaskData } from "../../dashboard/components/ValidationTask";
import DocumentOrganizationTask, {
  type DocumentOrganizationTaskData,
} from "./DocumentOrganizationTask";
import MatchingTask, { type MatchingTaskData } from "./MatchingTask";

// Fetched shape before we know which task family it is -- instance_data's
// concrete shape varies by type, so it's narrowed via a cast in the switch
// below, same way each *TaskData interface documents its own instance_data
// shape for its own family.
export interface RawTaskData {
  id: string;
  type: string;
  title: string;
  description: string | null;
  instance_data: unknown;
  deadline_seconds: number | null;
  priority: string;
  difficulty: string | null;
  status: string;
}

interface TaskRendererProps {
  task: RawTaskData;
  onSubmitted: () => void;
}

export default function TaskRenderer({ task, onSubmitted }: TaskRendererProps) {
  switch (task.type) {
    case "data_validation":
      return (
        <ValidationTask key={task.id} task={task as unknown as ValidationTaskData} onSubmitted={onSubmitted} />
      );
    case "document_organization":
      return (
        <DocumentOrganizationTask
          key={task.id}
          task={task as unknown as DocumentOrganizationTaskData}
          onSubmitted={onSubmitted}
        />
      );
    case "image_matching":
      return (
        <MatchingTask key={task.id} task={task as unknown as MatchingTaskData} onSubmitted={onSubmitted} />
      );
    default:
      return (
        <div
          className="glass-card"
          style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ color: "#4B5A6A", fontSize: 13.5 }}>
            "{task.title}" is a <strong>{task.type}</strong> task — that type doesn't have a UI
            built yet.
          </div>
          <button
            onClick={onSubmitted}
            style={{
              alignSelf: "flex-start",
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, #5B84C6, #8D74FF)",
              color: "white",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Get a different task
          </button>
        </div>
      );
  }
}
