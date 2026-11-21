import React from 'react';
import { Plus, X } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';

export const DocumentTabs: React.FC = () => {
  const { documents, activeDocumentId, setActiveDocument, closeDocument, openModal } =
    useEditorStore();

  if (documents.length === 0) return null;

  return (
    <div
      className="h-8 shrink-0 flex items-center px-2 gap-1 border-b overflow-x-auto select-none"
      style={{
        backgroundColor: 'var(--lp-bg)',
        borderColor: 'var(--lp-border)',
      }}
    >
      {documents.map((doc) => {
        const isActive = doc.id === activeDocumentId;
        return (
          <div
            key={doc.id}
            onClick={() => setActiveDocument(doc.id)}
            className={`group h-6 px-2.5 rounded-md flex items-center gap-2 text-[11px] cursor-pointer transition-colors max-w-[200px] shrink-0 ${
              isActive
                ? 'bg-[var(--lp-panel)] text-[var(--lp-text)] border'
                : 'text-[var(--lp-text-secondary)] hover:bg-[var(--lp-hover)] hover:text-[var(--lp-text)]'
            }`}
            style={{
              borderColor: isActive ? 'var(--lp-border-strong)' : 'transparent',
            }}
          >
            <span className="truncate font-medium">{doc.name}</span>
            <span className="text-[10px] opacity-60 font-mono-tabular shrink-0">
              {doc.dirty ? '•' : `${doc.width}×${doc.height}`}
            </span>
            <button
              type="button"
              aria-label={`Close ${doc.name}`}
              onClick={(e) => {
                e.stopPropagation();
                closeDocument(doc.id);
              }}
              className="p-0.5 rounded hover:bg-[var(--lp-hover)] opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => openModal('newProject')}
        title="New Project (⌘N)"
        className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] hover:bg-[var(--lp-hover)] transition-colors cursor-pointer shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
