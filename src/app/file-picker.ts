/**
 * Opens the hidden file input synchronously (inside the gesture) and resolves with the choice.
 * A cancelled pick never resolves; the next pick supersedes it. (`cancel` is not used because
 * some engines fire it spuriously.)
 */
export function filePicker(input: HTMLInputElement): () => Promise<File | null> {
  let pending: ((file: File | null) => void) | null = null;
  input.addEventListener('change', () => {
    pending?.(input.files?.[0] ?? null);
    pending = null;
  });
  return () =>
    new Promise((resolve) => {
      pending?.(null);
      pending = resolve;
      input.value = '';
      input.click();
    });
}
