'use client';

import { useState } from 'react';
import { Todo } from '@/types';
import { Plus, Trash2, Check, Clock } from 'lucide-react';

interface TodoListProps {
  todos: Todo[];
  centerId: string;
  onAddTodo: (todo: Omit<Todo, 'id' | 'createdAt'>) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

export default function TodoList({ todos, centerId, onAddTodo, onToggleTodo, onDeleteTodo }: TodoListProps) {
  const [newTodo, setNewTodo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTodo.trim()) {
      onAddTodo({
        centerId,
        title: newTodo,
        completed: false,
        priority,
      });
      setNewTodo('');
      setShowForm(false);
      setPriority('medium');
    }
  };

  const centerTodos = todos.filter(t => t.centerId === centerId);
  const activeTodos = centerTodos.filter(t => !t.completed);
  const completedTodos = centerTodos.filter(t => t.completed);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">Yapılacaklar</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus size={20} />
          Yeni Görev
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-3">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="Görev başlığı..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700"
            autoFocus
          />
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Öncelik:</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
            >
              <option value="low">Düşük</option>
              <option value="medium">Orta</option>
              <option value="high">Yüksek</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              Ekle
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500"
            >
              İptal
            </button>
          </div>
        </form>
      )}

      <div className="space-y-6">
        {activeTodos.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
              <Clock size={16} />
              Aktif Görevler ({activeTodos.length})
            </h4>
            <div className="space-y-2">
              {activeTodos.map(todo => (
                <div
                  key={todo.id}
                  className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow"
                >
                  <button
                    onClick={() => onToggleTodo(todo.id)}
                    className="mt-1 flex-shrink-0 w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded hover:border-green-500 transition-colors"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{todo.title}</p>
                    {todo.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{todo.description}</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold ${getPriorityColor(todo.priority)}`}>
                    {todo.priority === 'high' ? '🔴' : todo.priority === 'medium' ? '🟡' : '🟢'}
                  </span>
                  <button
                    onClick={() => onDeleteTodo(todo.id)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {completedTodos.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
              <Check size={16} />
              Tamamlananlar ({completedTodos.length})
            </h4>
            <div className="space-y-2">
              {completedTodos.map(todo => (
                <div
                  key={todo.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg opacity-60"
                >
                  <button
                    onClick={() => onToggleTodo(todo.id)}
                    className="mt-1 flex-shrink-0 w-5 h-5 bg-green-500 border-2 border-green-500 rounded flex items-center justify-center"
                  >
                    <Check size={14} className="text-white" />
                  </button>
                  <div className="flex-1">
                    <p className="font-medium line-through">{todo.title}</p>
                  </div>
                  <button
                    onClick={() => onDeleteTodo(todo.id)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {centerTodos.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>Henüz görev eklenmemiş</p>
            <p className="text-sm mt-2">Yukarıdaki &quot;Yeni Görev&quot; butonuna tıklayarak başlayın</p>
          </div>
        )}
      </div>
    </div>
  );
}
