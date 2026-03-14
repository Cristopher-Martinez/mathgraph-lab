import GeometryCanvas from "../components/GeometryCanvas";

export default function GeometryLab() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold dark:text-gray-100">
          Laboratorio de Geometría
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Coloca puntos, dibuja segmentos y calcula distancias, puntos medios y
          más.
        </p>
      </div>
      <GeometryCanvas />
    </div>
  );
}
