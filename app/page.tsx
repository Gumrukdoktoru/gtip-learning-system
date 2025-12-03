'use client';

import { useState } from 'react';
import { useLocalStorage } from '@/lib/useLocalStorage';
import { TRAINING_CENTERS, Todo, Training } from '@/types';
import TodoList from '@/components/TodoList';
import TrainingTracker from '@/components/TrainingTracker';
import { GraduationCap, ListTodo, BookOpen } from 'lucide-react';

export default function Home() {
  const [todos, setTodos] = useLocalStorage<Todo[]>('gtip-todos', []);
  const [trainings, setTrainings] = useLocalStorage<Training[]>('gtip-trainings', []);
  const [activeCenter, setActiveCenter] = useState(TRAINING_CENTERS[0].id);
  const [activeTab, setActiveTab] = useState<'todos' | 'trainings'>('todos');

  const handleAddTodo = (todo: Omit<Todo, 'id' | 'createdAt'>) => {
    const newTodo: Todo = {
      ...todo,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    setTodos([...todos, newTodo]);
  };

  const handleToggleTodo = (id: string) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const handleDeleteTodo = (id: string) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const handleAddTraining = (training: Omit<Training, 'id'>) => {
    const newTraining: Training = {
      ...training,
      id: Date.now().toString(),
    };
    setTrainings([...trainings, newTraining]);
  };

  const handleUpdateTraining = (id: string, updates: Partial<Training>) => {
    setTrainings(trainings.map(training =>
      training.id === id ? { ...training, ...updates } : training
    ));
  };

  const handleDeleteTraining = (id: string) => {
    setTrainings(trainings.filter(training => training.id !== id));
  };

  const activeCenterData = TRAINING_CENTERS.find(c => c.id === activeCenter)!;
  const centerTodos = todos.filter(t => t.centerId === activeCenter);
  const activeTodoCount = centerTodos.filter(t => !t.completed).length;
  const centerTrainings = trainings.filter(t => t.centerId === activeCenter);
  const ongoingTrainingsCount = centerTrainings.filter(t => t.status === 'ongoing').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <GraduationCap size={40} className="text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white">
              GTIP Eğitim Yönetim Sistemi
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            3 farklı eğitim merkezinizi tek yerden yönetin
          </p>
        </div>

        {/* Training Center Tabs */}
        <div className="flex flex-wrap gap-4 justify-center mb-8">
          {TRAINING_CENTERS.map(center => {
            const centerTodosCount = todos.filter(t => t.centerId === center.id && !t.completed).length;
            const centerOngoingTrainings = trainings.filter(t => t.centerId === center.id && t.status === 'ongoing').length;

            return (
              <button
                key={center.id}
                onClick={() => setActiveCenter(center.id)}
                className={`flex items-center gap-3 px-6 py-4 rounded-xl transition-all ${
                  activeCenter === center.id
                    ? `${center.color} text-white shadow-lg scale-105`
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-white hover:shadow-md'
                }`}
              >
                <span className="text-2xl">{center.icon}</span>
                <div className="text-left">
                  <div className="font-bold">{center.name}</div>
                  <div className="text-xs opacity-90">
                    {centerTodosCount} görev · {centerOngoingTrainings} eğitim
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
          {/* Sub Tabs */}
          <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('todos')}
              className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors relative ${
                activeTab === 'todos'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <ListTodo size={20} />
              Yapılacaklar
              {activeTodoCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {activeTodoCount}
                </span>
              )}
              {activeTab === 'todos' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('trainings')}
              className={`flex items-center gap-2 px-6 py-3 font-semibold transition-colors relative ${
                activeTab === 'trainings'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <BookOpen size={20} />
              Eğitim Takibi
              {ongoingTrainingsCount > 0 && (
                <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">
                  {ongoingTrainingsCount}
                </span>
              )}
              {activeTab === 'trainings' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 dark:bg-green-400" />
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {activeTab === 'todos' ? (
              <TodoList
                todos={todos}
                centerId={activeCenter}
                onAddTodo={handleAddTodo}
                onToggleTodo={handleToggleTodo}
                onDeleteTodo={handleDeleteTodo}
              />
            ) : (
              <TrainingTracker
                trainings={trainings}
                centerId={activeCenter}
                onAddTraining={handleAddTraining}
                onUpdateTraining={handleUpdateTraining}
                onDeleteTraining={handleDeleteTraining}
              />
            )}
          </div>
        </div>

        {/* Footer Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {TRAINING_CENTERS.map(center => {
            const centerTodosAll = todos.filter(t => t.centerId === center.id);
            const centerCompletedTodos = centerTodosAll.filter(t => t.completed).length;
            const centerTrainingsAll = trainings.filter(t => t.centerId === center.id);
            const centerCompletedTrainings = centerTrainingsAll.filter(t => t.status === 'completed').length;

            return (
              <div
                key={center.id}
                className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{center.icon}</span>
                  <h3 className="font-semibold text-sm">{center.name}</h3>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <div>Toplam Görev: {centerTodosAll.length} ({centerCompletedTodos} tamamlandı)</div>
                  <div>Toplam Eğitim: {centerTrainingsAll.length} ({centerCompletedTrainings} tamamlandı)</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
