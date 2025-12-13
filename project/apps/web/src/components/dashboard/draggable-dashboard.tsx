'use client';

import { useState, useRef, useCallback } from 'react';
import { GripVertical, Lock, Unlock } from 'lucide-react';

interface DraggableItem {
  id: string;
  content: React.ReactNode;
  title: string;
}

interface DraggableDashboardProps {
  items: DraggableItem[];
  onReorder: (newOrder: string[]) => void;
  locked?: boolean;
  onLockToggle?: () => void;
}

export function DraggableDashboard({ items, onReorder, locked = false, onLockToggle }: DraggableDashboardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    if (locked) return;
    setDraggedId(id);
    dragNode.current = e.target as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    
    // Add dragging class after a small delay
    setTimeout(() => {
      if (dragNode.current) {
        dragNode.current.classList.add('opacity-50');
      }
    }, 0);
  }, [locked]);

  const handleDragEnd = useCallback(() => {
    if (dragNode.current) {
      dragNode.current.classList.remove('opacity-50');
    }
    setDraggedId(null);
    setDragOverId(null);
    dragNode.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (locked || !draggedId || draggedId === id) return;
    setDragOverId(id);
  }, [locked, draggedId]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (locked || !draggedId || draggedId === targetId) return;

    const currentOrder = items.map(item => item.id);
    const draggedIndex = currentOrder.indexOf(draggedId);
    const targetIndex = currentOrder.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);

    onReorder(newOrder);
    setDraggedId(null);
    setDragOverId(null);
  }, [locked, draggedId, items, onReorder]);

  return (
    <div className="space-y-4">
      {/* Lock Toggle */}
      {onLockToggle && (
        <div className="flex justify-end">
          <button
            onClick={onLockToggle}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              locked 
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {locked ? (
              <>
                <Lock className="h-4 w-4" />
                Düzenleme Kilitli
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4" />
                Sürükle & Bırak Aktif
              </>
            )}
          </button>
        </div>
      )}

      {/* Draggable Items */}
      <div className="space-y-4">
        {items.map((item) => (
          <div
            key={item.id}
            draggable={!locked}
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, item.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, item.id)}
            className={`relative transition-all duration-200 ${
              !locked ? 'cursor-move' : ''
            } ${
              dragOverId === item.id ? 'ring-2 ring-blue-400 ring-offset-2' : ''
            } ${
              draggedId === item.id ? 'opacity-50' : ''
            }`}
          >
            {/* Drag Handle */}
            {!locked && (
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 -translate-x-full p-1 text-gray-400 hover:text-gray-600 z-10">
                <GripVertical className="h-5 w-5" />
              </div>
            )}
            {item.content}
          </div>
        ))}
      </div>
    </div>
  );
}

// Grid version for multi-column layouts
interface DraggableGridProps {
  items: DraggableItem[];
  onReorder: (newOrder: string[]) => void;
  locked?: boolean;
  columns?: number;
}

export function DraggableGrid({ items, onReorder, locked = false, columns = 3 }: DraggableGridProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (locked) return;
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (locked || !draggedId || draggedId === id) return;
    setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (locked || !draggedId || draggedId === targetId) return;

    const currentOrder = items.map(item => item.id);
    const draggedIndex = currentOrder.indexOf(draggedId);
    const targetIndex = currentOrder.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);

    onReorder(newOrder);
    setDraggedId(null);
    setDragOverId(null);
  };

  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid gap-4 ${gridCols[columns as keyof typeof gridCols] || gridCols[3]}`}>
      {items.map((item) => (
        <div
          key={item.id}
          draggable={!locked}
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, item.id)}
          onDrop={(e) => handleDrop(e, item.id)}
          className={`relative transition-all duration-200 ${
            !locked ? 'cursor-move' : ''
          } ${
            dragOverId === item.id ? 'ring-2 ring-blue-400 ring-offset-2 scale-[1.02]' : ''
          } ${
            draggedId === item.id ? 'opacity-50 scale-95' : ''
          }`}
        >
          {/* Drag Handle Overlay */}
          {!locked && (
            <div className="absolute top-2 right-2 p-1 bg-white/80 rounded text-gray-400 hover:text-gray-600 z-10 opacity-0 hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4" />
            </div>
          )}
          {item.content}
        </div>
      ))}
    </div>
  );
}
