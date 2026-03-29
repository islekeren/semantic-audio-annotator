type ShortcutModalProps = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS = [
  ['Space', 'Play or pause audio'],
  ['Ctrl/Cmd + S', 'Save current annotation'],
  ['Right Arrow or N', 'Go to next sample'],
  ['Left Arrow or P', 'Go to previous sample'],
  ['A', 'Approve candidate and mark annotated'],
  ['R', 'Mark current item as needs review'],
  ['U', 'Mark current item unusable'],
  ['C', 'Focus the final caption field']
];

export function ShortcutModal({ open, onClose }: ShortcutModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Efficiency</p>
            <h3>Keyboard shortcuts</h3>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="shortcut-list">
          {SHORTCUTS.map(([keys, description]) => (
            <div key={keys} className="shortcut-row">
              <kbd>{keys}</kbd>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
