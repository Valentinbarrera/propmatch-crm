import { useState } from "react";
import { useStore } from "@/data/store";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";

/** Tareas pendientes (lo que antes era la columna de la derecha de la Agenda). */
export function TasksCard() {
  const { tasks, toggleTask, addTask, removeTask, profile } = useStore();
  /** `null` mientras el campo de nueva tarea está cerrado. */
  const [taskDraft, setTaskDraft] = useState<string | null>(null);
  const [taskPriority, setTaskPriority] = useState(false);
  const pending = tasks.filter((t) => !t.is_done);

  function submitTask() {
    const text = (taskDraft ?? "").trim();
    if (!text) {
      setTaskDraft(null);
      setTaskPriority(false);
      return;
    }
    addTask({ text, is_priority: taskPriority, due_date: null, contact_id: null, owner_id: profile.id });
    // El campo queda abierto: las tareas se cargan de a varias.
    setTaskDraft("");
    setTaskPriority(false);
  }

  return (
    <section className="rounded-2xl border bg-white p-4" style={{ borderColor: "#E9E5DE", boxShadow: "var(--shadow-card)" }} aria-label="Tareas pendientes">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase" style={{ color: "#6B7280", fontWeight: 700, letterSpacing: "0.1em" }}>
          Tareas pendientes
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--gradient-brand)", color: "white", fontWeight: 700, fontSize: "10px" }}>
          {pending.length}
        </span>
      </div>
      <ul className="space-y-1 max-h-72 overflow-y-auto">
        {tasks.map((task) => (
          <li key={task.id} className="group flex items-start gap-1 rounded-xl transition-all hover:bg-violet-50">
            <button
              type="button"
              onClick={() => toggleTask(task.id)}
              aria-pressed={task.is_done}
              className="flex-1 min-w-0 min-h-11 flex items-start gap-2.5 text-left p-2.5"
            >
              <span
                className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 transition-all"
                style={task.is_done ? { background: "var(--gradient-brand)" } : { border: "2px solid #DDD8CF", background: "white" }}
                aria-hidden
              >
                {task.is_done && <CheckIcon size={10} color="white" />}
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className="block text-xs leading-relaxed"
                  style={{
                    color: task.is_done ? "#6B7280" : "#374151",
                    fontWeight: task.is_done ? 400 : 500,
                    textDecoration: task.is_done ? "line-through" : "none",
                  }}
                >
                  {task.text}
                </span>
                {task.is_priority && !task.is_done && (
                  <span className="text-xs" style={{ color: "#CB1093", fontWeight: 600, fontSize: "10px" }}>
                    ● Prioritaria
                  </span>
                )}
                {task.due_date && !task.is_done && (
                  <span className="block text-[10px]" style={{ color: "#6B7280" }}>
                    Para el {new Date(`${task.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => removeTask(task.id)}
              aria-label={"Eliminar tarea: " + task.text}
              className="w-8 h-8 mt-1.5 mr-1 rounded-lg flex-shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all hover:bg-white"
              style={{ color: "#6B7280", fontSize: 15, lineHeight: 1 }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {taskDraft === null ? (
        <button
          type="button"
          onClick={() => setTaskDraft("")}
          className="w-full mt-2 min-h-11 rounded-xl text-xs transition-all hover:bg-violet-50 flex items-center justify-center gap-1.5"
          style={{ color: "#7C0BD8", fontWeight: 600 }}
        >
          <PlusIcon size={11} color="currentColor" />
          Agregar tarea
        </button>
      ) : (
        <div className="mt-2 px-1">
          <input
            value={taskDraft}
            onChange={(e) => setTaskDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTask();
              if (e.key === "Escape") {
                setTaskDraft(null);
                setTaskPriority(false);
              }
            }}
            aria-label="Nueva tarea"
            placeholder="Llamar a Martín por la contraoferta..."
            autoFocus
            className="w-full min-h-11 px-3 rounded-xl text-xs border outline-none transition-all bg-white text-[#1A1A1A] placeholder:text-[#6B7280] border-[#E9E5DE] focus:border-[#9B21FF] focus:ring-4 focus:ring-[#E9E5DE]"
          />
          <div className="flex items-center justify-between gap-2 mt-2">
            <button
              type="button"
              onClick={() => setTaskPriority((v) => !v)}
              aria-pressed={taskPriority}
              className="min-h-9 px-2.5 rounded-lg transition-all border"
              style={
                taskPriority
                  ? { background: "#FFF1FA", color: "#CB1093", borderColor: "#FFDFF4", fontWeight: 600, fontSize: "11px" }
                  : { background: "white", color: "#6B7280", borderColor: "#E9E5DE", fontWeight: 600, fontSize: "11px" }
              }
            >
              ● Prioritaria
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTaskDraft(null);
                  setTaskPriority(false);
                }}
                className="min-h-9 px-2.5 rounded-lg transition-all hover:bg-violet-50"
                style={{ color: "#6B7280", fontWeight: 600, fontSize: "11px" }}
              >
                Listo
              </button>
              <button
                type="button"
                onClick={submitTask}
                className="min-h-9 px-3 rounded-lg text-white transition-all hover:opacity-90"
                style={{ background: "var(--gradient-brand)", fontWeight: 600, fontSize: "11px" }}
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
