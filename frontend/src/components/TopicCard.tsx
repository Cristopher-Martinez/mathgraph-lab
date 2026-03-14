import { Link } from "react-router-dom";

interface TopicCardProps {
  id: number;
  name: string;
  exerciseCount: number;
}

export default function TopicCard({ id, name, exerciseCount }: TopicCardProps) {
  return (
    <Link
      to={`/topics/${id}`}
      className="block bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow">
      <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400">
        {name}
      </h3>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-full">
          {exerciseCount} {exerciseCount === 1 ? "ejercicio" : "ejercicios"}
        </span>
      </div>
    </Link>
  );
}
