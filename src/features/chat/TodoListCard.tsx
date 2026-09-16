import type { ChatTodoModel, ChatTodoStatus } from "./types";

const MARKERS: Record<ChatTodoStatus, string> = {
  completed: "✓",
  in_progress: "●",
  blocked: "!",
  pending: "○",
};

export function TodoListCard({ todo }: { todo: ChatTodoModel }) {
  const completed = todo.todos.filter(
    (item) => item.status === "completed",
  ).length;

  return (
    <section className="chat-todo-card" aria-label="Todo progress">
      <header className="chat-todo-header">
        <span>Updated Todos</span>
        <span className="chat-todo-progress">
          {completed}/{todo.todos.length}
        </span>
      </header>
      {todo.explanation && (
        <p className="chat-todo-explanation">{todo.explanation}</p>
      )}
      <ul className="chat-todo-list">
        {todo.todos.map((item) => (
          <li
            key={item.id}
            className={`chat-todo-item chat-todo-${item.status}`}
          >
            <span className="chat-todo-marker" aria-hidden="true">
              {MARKERS[item.status]}
            </span>
            <span className="chat-todo-text">{item.step}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
