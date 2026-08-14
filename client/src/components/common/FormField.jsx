// src/components/common/FormField.jsx
// Thin wrapper that pairs a label + input/select/textarea with a
// react-hook-form `register` and its validation error, used throughout
// every form in the app for consistent styling and less boilerplate.

export default function FormField({ label, error, children, required }) {
  return (
    <div>
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {error && <p className="error-text">{error.message}</p>}
    </div>
  );
}
