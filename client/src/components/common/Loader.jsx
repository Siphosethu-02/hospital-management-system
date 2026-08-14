// src/components/common/Loader.jsx
export default function Loader({ label = 'Loading...', fullScreen = false }) {
  const wrapperClass = fullScreen
    ? 'flex h-screen w-full items-center justify-center'
    : 'flex items-center justify-center py-12';

  return (
    <div className={wrapperClass}>
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}
